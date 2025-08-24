/**
 * Group Manager Service
 * Core logic for face grouping with transitivity
 */

import { getDb, getAdmin } from '../config/firebase';
import { Face, FaceGroup, FileFaceUpdate } from '../types';
import { FieldValue } from 'firebase-admin/firestore';

export class GroupManager {
  get db() {
    return getDb();
  }

  /**
   * Process new faces with transitivity-aware grouping
   * This is the core algorithm that ensures A→B→C all get the same GroupId
   */
  async processFaces(userId: string, fileId: string, faces: Face[]): Promise<FaceGroup[]> {
    console.log(`\n📊 Processing ${faces.length} faces for user ${userId}, file ${fileId}`);
    console.log(`🔄 Face matching v2.1 - with batch grouping for same-file faces`);
    
    const updatedGroups: FaceGroup[] = [];
    const fileUpdates: FileFaceUpdate[] = [];
    
    // IMPORTANT: If multiple faces from same file and no matches provided,
    // assume they are DIFFERENT people (common case: group photo)
    // Each face from the same file should get its own group unless explicitly matched
    const processedFaceToGroup: Map<string, string> = new Map();

    for (const face of faces) {
      console.log(`\n🔍 Processing face ${face.faceId}`);
      console.log(`  📊 Input data:`, {
        faceId: face.faceId,
        matchedFaceIds: face.matchedFaceIds,
        confidence: face.confidence,
        hasGroupId: !!face.groupId,
        groupId: face.groupId
      });
      
      // If no matches provided, try to find similar faces in existing groups
      let matchedFaceIds = face.matchedFaceIds;
      if (matchedFaceIds.length === 0) {
        console.log(`  No matches provided, searching for similar faces in existing groups...`);
        matchedFaceIds = await this.findSimilarFaces(userId, face.faceId);
        console.log(`  Found ${matchedFaceIds.length} potential matches`);
      } else {
        console.log(`  Has ${matchedFaceIds.length} matched faces: ${matchedFaceIds.join(', ')}`);
      }
      
      if (matchedFaceIds.length > 0) {
        // Face has matches - find existing groups
        const existingGroups = await this.findGroupsContainingFaces(userId, matchedFaceIds);
        console.log(`  Found ${existingGroups.length} existing groups containing matched faces`);
        
        if (existingGroups.length === 0) {
          // No existing groups - create new group with face and all matches
          console.log(`  Creating new group for face and its ${matchedFaceIds.length} matches`);
          const groupId = await this.createGroup(userId, [face.faceId, ...matchedFaceIds], fileId, face.boundingBox);
          
          // Create face document for this face
          await this.createFaceDocument(userId, face.faceId, groupId, fileId, face.boundingBox, face.confidence);
          
          // Also create face documents for matched faces if they don't exist
          for (const matchedFaceId of matchedFaceIds) {
            await this.createFaceDocument(userId, matchedFaceId, groupId, fileId);
          }
          
          const newGroup = await this.getGroup(userId, groupId);
          if (newGroup) updatedGroups.push(newGroup);
          fileUpdates.push({ fileId, faceId: face.faceId, groupId });
          
        } else if (existingGroups.length === 1) {
          // Single group found - add face to it
          const group = existingGroups[0];
          console.log(`  Adding face to existing group ${group.groupId}`);
          await this.addFaceToGroup(userId, group.groupId, face.faceId, fileId);
          
          // Create face document for this face
          await this.createFaceDocument(userId, face.faceId, group.groupId, fileId, face.boundingBox, face.confidence);
          
          const updatedGroup = await this.getGroup(userId, group.groupId);
          if (updatedGroup) updatedGroups.push(updatedGroup);
          fileUpdates.push({ fileId, faceId: face.faceId, groupId: group.groupId });
          
        } else {
          // Multiple groups found - MERGE them (key to transitivity!)
          console.log(`  ⚡ Merging ${existingGroups.length} groups - faces belong to same person!`);
          const primaryGroupId = existingGroups[0].groupId;
          
          // Merge all secondary groups into primary
          for (let i = 1; i < existingGroups.length; i++) {
            await this.mergeGroups(userId, primaryGroupId, existingGroups[i].groupId);
          }
          
          // Add new face to merged group
          await this.addFaceToGroup(userId, primaryGroupId, face.faceId, fileId);
          
          // Create face document for this face
          await this.createFaceDocument(userId, face.faceId, primaryGroupId, fileId, face.boundingBox, face.confidence);
          
          const mergedGroup = await this.getGroup(userId, primaryGroupId);
          if (mergedGroup) updatedGroups.push(mergedGroup);
          fileUpdates.push({ fileId, faceId: face.faceId, groupId: primaryGroupId });
        }
      } else {
        // No matches - create single-face group
        console.log(`  No matches - creating new single-face group`);
        const groupId = await this.createGroup(userId, [face.faceId], fileId, face.boundingBox);
        
        // Create face document for this face
        await this.createFaceDocument(userId, face.faceId, groupId, fileId, face.boundingBox, face.confidence);
        
        const newGroup = await this.getGroup(userId, groupId);
        if (newGroup) updatedGroups.push(newGroup);
        fileUpdates.push({ fileId, faceId: face.faceId, groupId });
      }
    }

    // Update file document with group assignments
    if (fileUpdates.length > 0) {
      await this.updateFileWithGroupIds(userId, fileId, fileUpdates);
    }

    console.log(`\n✅ Processed ${faces.length} faces into ${updatedGroups.length} groups`);
    return updatedGroups;
  }

  /**
   * Create face document in the faces collection
   * Per Data Standard 1.4.6 - dual-collection architecture
   */
  private async createFaceDocument(
    userId: string, 
    faceId: string, 
    groupId: string, 
    fileId: string,
    boundingBox?: any,
    confidence?: number
  ): Promise<void> {
    const faceRef = this.db.collection('users').doc(userId)
                          .collection('faces').doc(faceId);
    
    const faceData = {
      faceId,
      groupId,
      fileId,
      userId,
      boundingBox: boundingBox || {},
      confidence: confidence || 99.99,
      emotions: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    
    await faceRef.set(faceData);
    console.log(`    📝 Created face document: /users/${userId}/faces/${faceId} -> group ${groupId}`);
  }

  /**
   * Find similar faces in existing groups
   * This helps match new faces to existing groups even without explicit matchedFaceIds
   */
  private async findSimilarFaces(userId: string, faceId: string): Promise<string[]> {
    console.log(`    Searching for similar faces to ${faceId} in existing groups...`);
    
    // First check if this face is already in a group
    const existingGroupsQuery = this.db.collection('users').doc(userId)
                                      .collection('faceGroups')
                                      .where('faceIds', 'array-contains', faceId);
    const existingSnapshot = await existingGroupsQuery.get();
    
    if (!existingSnapshot.empty) {
      console.log(`      Face ${faceId} is already in a group, skipping similarity search`);
      return [];
    }
    
    // Get the face document to check for embedded match data
    const faceDoc = await this.db.collection('users').doc(userId)
                                 .collection('faces').doc(faceId).get();
    
    if (!faceDoc.exists) {
      console.log(`      Face document ${faceId} not found in faces collection`);
      return [];
    }
    
    const faceData = faceDoc.data();
    const similarFaceIds: string[] = [];
    
    // Check if face has AWS Rekognition match data
    if (faceData?.matches && Array.isArray(faceData.matches)) {
      console.log(`      Face has ${faceData.matches.length} AWS Rekognition matches`);
      
      // Use high-confidence matches (>85% similarity)
      for (const match of faceData.matches) {
        if (match.similarity >= 85 && match.faceId && match.faceId !== faceId) {
          similarFaceIds.push(match.faceId);
          console.log(`      Found match: ${match.faceId} (${match.similarity}% similarity)`);
        }
      }
    }
    
    // Fallback: Check if there's a matchedFaces field
    if (faceData?.matchedFaces && Array.isArray(faceData.matchedFaces)) {
      console.log(`      Face has ${faceData.matchedFaces.length} matched faces`);
      for (const matchedFaceId of faceData.matchedFaces) {
        if (matchedFaceId !== faceId && !similarFaceIds.includes(matchedFaceId)) {
          similarFaceIds.push(matchedFaceId);
        }
      }
    }
    
    // Additional check: Look for faces with the same externalId (if faces were imported from same source)
    if (faceData?.externalId) {
      const externalIdQuery = this.db.collection('users').doc(userId)
                                     .collection('faces')
                                     .where('externalId', '==', faceData.externalId)
                                     .limit(10);
      const externalIdSnapshot = await externalIdQuery.get();
      
      externalIdSnapshot.forEach((doc: any) => {
        if (doc.id !== faceId && !similarFaceIds.includes(doc.id)) {
          similarFaceIds.push(doc.id);
          console.log(`      Found face with same externalId: ${doc.id}`);
        }
      });
    }
    
    console.log(`    Found ${similarFaceIds.length} similar faces total`);
    return similarFaceIds;
  }

  /**
   * Find all groups that contain any of the specified face IDs
   */
  private async findGroupsContainingFaces(userId: string, faceIds: string[]): Promise<FaceGroup[]> {
    const groupsRef = this.db.collection('users').doc(userId).collection('faceGroups');
    const query = groupsRef.where('faceIds', 'array-contains-any', faceIds);
    const snapshot = await query.get();
    
    const groups: FaceGroup[] = [];
    snapshot.forEach((doc: any) => {
      groups.push({ groupId: doc.id, ...doc.data() } as FaceGroup);
    });
    
    return groups;
  }

  /**
   * Create a new face group
   */
  private async createGroup(userId: string, faceIds: string[], fileId: string, leaderBoundingBox?: any): Promise<string> {
    const groupId = this.generateGroupId();
    const groupRef = this.db.collection('users').doc(userId)
                           .collection('faceGroups').doc(groupId);
    
    const groupData: Partial<FaceGroup> = {
      groupId,
      faceIds,
      leaderFaceId: faceIds[0],  // First face is the leader
      leaderFaceData: {
        fileId: fileId,
        boundingBox: leaderBoundingBox || {}
      },
      fileIds: [fileId],
      faceCount: faceIds.length,
      status: 'unreviewed',
      createdAt: FieldValue.serverTimestamp() as any,
      updatedAt: FieldValue.serverTimestamp() as any
    };
    
    await groupRef.set(groupData);
    console.log(`    Created group ${groupId} with ${faceIds.length} faces, leader: ${faceIds[0]}`);
    return groupId;
  }

  /**
   * Add a face to an existing group
   */
  private async addFaceToGroup(userId: string, groupId: string, faceId: string, fileId: string): Promise<void> {
    const groupRef = this.db.collection('users').doc(userId)
                           .collection('faceGroups').doc(groupId);
    
    // First get the current group to check if face already exists
    const groupDoc = await groupRef.get();
    if (groupDoc.exists) {
      const groupData = groupDoc.data() as FaceGroup;
      const currentFaceIds = groupData.faceIds || [];
      
      // Only update if face is not already in the group
      if (!currentFaceIds.includes(faceId)) {
        await groupRef.update({
          faceIds: FieldValue.arrayUnion(faceId),
          fileIds: FieldValue.arrayUnion(fileId),
          faceCount: currentFaceIds.length + 1, // Set exact count
          updatedAt: FieldValue.serverTimestamp()
        });
      } else {
        // Face already in group, just add the fileId if new
        await groupRef.update({
          fileIds: FieldValue.arrayUnion(fileId),
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }
  }

  /**
   * Merge two groups (for transitivity)
   */
  private async mergeGroups(userId: string, primaryGroupId: string, secondaryGroupId: string): Promise<void> {
    console.log(`    Merging group ${secondaryGroupId} into ${primaryGroupId}`);
    
    // Get both groups' data
    const primaryRef = this.db.collection('users').doc(userId)
                             .collection('faceGroups').doc(primaryGroupId);
    const secondaryRef = this.db.collection('users').doc(userId)
                               .collection('faceGroups').doc(secondaryGroupId);
    
    const [primaryDoc, secondaryDoc] = await Promise.all([
      primaryRef.get(),
      secondaryRef.get()
    ]);
    
    if (!secondaryDoc.exists) {
      console.warn(`    Secondary group ${secondaryGroupId} not found`);
      return;
    }
    
    const primaryData = primaryDoc.data() as FaceGroup;
    const secondaryData = secondaryDoc.data() as FaceGroup;
    
    // Merge face IDs and calculate unique count
    const mergedFaceIds = [...new Set([...(primaryData.faceIds || []), ...(secondaryData.faceIds || [])])];
    const mergedFileIds = [...new Set([...(primaryData.fileIds || []), ...(secondaryData.fileIds || [])])];
    
    // Update primary group with merged data
    await primaryRef.update({
      faceIds: mergedFaceIds,
      fileIds: mergedFileIds,
      faceCount: mergedFaceIds.length, // Exact count of unique faces
      mergedFrom: FieldValue.arrayUnion(secondaryGroupId),
      updatedAt: FieldValue.serverTimestamp()
    });
    
    // Delete secondary group
    await secondaryRef.delete();
    console.log(`    ✅ Merged ${secondaryData.faceIds.length} faces into group, now has ${mergedFaceIds.length} unique faces`);
  }

  /**
   * Get a specific group
   */
  async getGroup(userId: string, groupId: string): Promise<FaceGroup | null> {
    const groupRef = this.db.collection('users').doc(userId)
                           .collection('faceGroups').doc(groupId);
    const doc = await groupRef.get();
    
    if (!doc.exists) return null;
    return { groupId: doc.id, ...doc.data() } as FaceGroup;
  }

  /**
   * Get all groups for a user
   */
  async getAllGroups(userId: string): Promise<FaceGroup[]> {
    const groupsRef = this.db.collection('users').doc(userId).collection('faceGroups');
    const snapshot = await groupsRef.orderBy('updatedAt', 'desc').get();
    
    const groups: FaceGroup[] = [];
    const emptyGroupsToDelete: string[] = [];
    
    snapshot.forEach((doc: any) => {
      const data = doc.data();
      // Filter out empty groups and clean them up
      if (!data.faceIds || data.faceIds.length === 0) {
        console.log(`🗑️ Found empty group ${doc.id}, will clean up`);
        emptyGroupsToDelete.push(doc.id);
      } else {
        groups.push({ groupId: doc.id, ...data } as FaceGroup);
      }
    });
    
    // Clean up empty groups asynchronously
    if (emptyGroupsToDelete.length > 0) {
      console.log(`🧹 Cleaning up ${emptyGroupsToDelete.length} empty groups`);
      const batch = this.db.batch();
      emptyGroupsToDelete.forEach(groupId => {
        const docRef = this.db.collection('users').doc(userId)
                             .collection('faceGroups').doc(groupId);
        batch.delete(docRef);
      });
      batch.commit().catch(err => console.error('Error cleaning empty groups:', err));
    }
    
    return groups;
  }

  /**
   * Update file document with group IDs
   */
  private async updateFileWithGroupIds(userId: string, fileId: string, updates: FileFaceUpdate[]): Promise<void> {
    const fileRef = this.db.collection('users').doc(userId)
                          .collection('files').doc(fileId);
    
    // Create map of faceId to groupId
    const groupMapping: Record<string, string> = {};
    updates.forEach(update => {
      groupMapping[update.faceId] = update.groupId;
    });
    
    try {
      // Try to update, or create if it doesn't exist
      await fileRef.set({
        faceGroupMapping: groupMapping,
        faceGroupsProcessedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      
      console.log(`    Updated file ${fileId} with ${updates.length} group assignments`);
    } catch (error) {
      console.warn(`    Could not update file ${fileId}:`, error);
      // Continue anyway - the grouping is still successful
    }
  }

  /**
   * Clear all groups for a user (for testing)
   */
  /**
   * Remove a specific face from a group
   */
  async removeFaceFromGroup(userId: string, groupId: string, faceId: string): Promise<boolean> {
    try {
      const groupRef = this.db.collection('users').doc(userId)
                             .collection('faceGroups').doc(groupId);
      
      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) {
        console.log(`Group ${groupId} not found`);
        return false;
      }
      
      const groupData = groupDoc.data() as FaceGroup;
      const updatedFaceIds = (groupData.faceIds || []).filter(id => id !== faceId);
      
      // Delete the face document from faces collection
      const faceRef = this.db.collection('users').doc(userId)
                            .collection('faces').doc(faceId);
      await faceRef.delete();
      console.log(`    🗑️ Deleted face document: /users/${userId}/faces/${faceId}`);
      
      // If no faces left, delete the group
      if (updatedFaceIds.length === 0) {
        await groupRef.delete();
        console.log(`🗑️ Deleted empty group ${groupId}`);
        return true;
      }
      
      // Prepare update object
      const updateData: any = {
        faceIds: updatedFaceIds,
        faceCount: updatedFaceIds.length,
        updatedAt: FieldValue.serverTimestamp()
      };
      
      // Update leader if removed face was the leader
      if (groupData.leaderFaceId === faceId && updatedFaceIds.length > 0) {
        updateData.leaderFaceId = updatedFaceIds[0];
        // Note: We'd need to fetch the new leader's data for full update
        // For now, just updating the ID
        console.log(`    👑 Updated leader face to: ${updatedFaceIds[0]}`);
      }
      
      // Update the group with the remaining faces
      await groupRef.update(updateData);
      
      console.log(`✅ Removed face ${faceId} from group ${groupId}`);
      return true;
    } catch (error) {
      console.error('Error removing face from group:', error);
      throw error;
    }
  }

  /**
   * Create a new group with specific faces (public method for API)
   */
  async createGroupWithFaces(userId: string, faces: any[], groupName?: string): Promise<string> {
    // Extract face IDs and file IDs
    const faceIds = faces.map(f => f.faceId);
    const fileIds = [...new Set(faces.map(f => f.fileId).filter(Boolean))];
    
    console.log(`[WORKFLOW-BACKEND] Firestore Write - Creating group:`, {
      userId,
      faceIds,
      fileIds,
      faceCount: faceIds.length,
      groupName
    });
    
    const groupId = this.generateGroupId();
    const groupRef = this.db.collection('users').doc(userId)
                           .collection('faceGroups').doc(groupId);
    
    const groupData: Partial<FaceGroup> = {
      groupId,
      groupName: groupName || `Group ${groupId.substring(0, 8)}`,
      faceIds,
      leaderFaceId: faceIds[0],  // First face is the leader
      leaderFaceData: {
        fileId: fileIds[0] || 'manual',
        boundingBox: faces[0]?.boundingBox || {}
      },
      fileIds: fileIds.length > 0 ? fileIds : ['manual'],
      faceCount: faceIds.length,
      status: 'unreviewed',
      createdAt: FieldValue.serverTimestamp() as any,
      updatedAt: FieldValue.serverTimestamp() as any
    };
    
    console.log(`[WORKFLOW-BACKEND] Firestore Document to write:`, {
      path: `users/${userId}/faceGroups/${groupId}`,
      document: groupData
    });
    
    await groupRef.set(groupData);
    console.log(`[WORKFLOW-BACKEND] ✅ Successfully wrote to Firestore: ${groupId}`);
    return groupId;
  }

  /**
   * Delete a specific group
   */
  async deleteGroup(userId: string, groupId: string): Promise<boolean> {
    try {
      const groupRef = this.db.collection('users').doc(userId)
                             .collection('faceGroups').doc(groupId);
      
      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) {
        console.log(`Group ${groupId} not found`);
        return false;
      }
      
      await groupRef.delete();
      console.log(`🗑️ Deleted group ${groupId} for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error deleting group:', error);
      throw error;
    }
  }

  async clearAllGroups(userId: string): Promise<number> {
    const groupsRef = this.db.collection('users').doc(userId).collection('faceGroups');
    const snapshot = await groupsRef.get();
    
    let deleted = 0;
    const batch = this.db.batch();
    snapshot.forEach((doc: any) => {
      batch.delete(doc.ref);
      deleted++;
    });
    
    await batch.commit();
    console.log(`🗑️ Deleted ${deleted} groups for user ${userId}`);
    return deleted;
  }

  /**
   * Generate a unique group ID
   */
  private generateGroupId(): string {
    return `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const groupManager = new GroupManager();