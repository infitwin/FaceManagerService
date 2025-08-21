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
    
    const updatedGroups: FaceGroup[] = [];
    const fileUpdates: FileFaceUpdate[] = [];

    for (const face of faces) {
      console.log(`\n🔍 Processing face ${face.faceId} with ${face.matchedFaceIds.length} matches`);
      
      if (face.matchedFaceIds.length > 0) {
        // Face has matches - find existing groups
        const existingGroups = await this.findGroupsContainingFaces(userId, face.matchedFaceIds);
        console.log(`  Found ${existingGroups.length} existing groups containing matched faces`);
        
        if (existingGroups.length === 0) {
          // No existing groups - create new group with face and all matches
          console.log(`  Creating new group for face and its ${face.matchedFaceIds.length} matches`);
          const groupId = await this.createGroup(userId, [face.faceId, ...face.matchedFaceIds], fileId);
          const newGroup = await this.getGroup(userId, groupId);
          if (newGroup) updatedGroups.push(newGroup);
          fileUpdates.push({ fileId, faceId: face.faceId, groupId });
          
        } else if (existingGroups.length === 1) {
          // Single group found - add face to it
          const group = existingGroups[0];
          console.log(`  Adding face to existing group ${group.groupId}`);
          await this.addFaceToGroup(userId, group.groupId, face.faceId, fileId);
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
          const mergedGroup = await this.getGroup(userId, primaryGroupId);
          if (mergedGroup) updatedGroups.push(mergedGroup);
          fileUpdates.push({ fileId, faceId: face.faceId, groupId: primaryGroupId });
        }
      } else {
        // No matches - create single-face group
        console.log(`  No matches - creating new single-face group`);
        const groupId = await this.createGroup(userId, [face.faceId], fileId);
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
  private async createGroup(userId: string, faceIds: string[], fileId: string): Promise<string> {
    const groupId = this.generateGroupId();
    const groupRef = this.db.collection('users').doc(userId)
                           .collection('faceGroups').doc(groupId);
    
    const groupData: Partial<FaceGroup> = {
      groupId,
      faceIds,
      fileIds: [fileId],
      faceCount: faceIds.length,
      createdAt: FieldValue.serverTimestamp() as any,
      updatedAt: FieldValue.serverTimestamp() as any
    };
    
    await groupRef.set(groupData);
    console.log(`    Created group ${groupId} with ${faceIds.length} faces`);
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
    snapshot.forEach((doc: any) => {
      groups.push({ groupId: doc.id, ...doc.data() } as FaceGroup);
    });
    
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
      
      // If no faces left, delete the group
      if (updatedFaceIds.length === 0) {
        await groupRef.delete();
        console.log(`🗑️ Deleted empty group ${groupId}`);
        return true;
      }
      
      // Update the group with the remaining faces
      await groupRef.update({
        faceIds: updatedFaceIds,
        faceCount: updatedFaceIds.length,
        updatedAt: FieldValue.serverTimestamp()
      });
      
      console.log(`✅ Removed face ${faceId} from group ${groupId}`);
      return true;
    } catch (error) {
      console.error('Error removing face from group:', error);
      throw error;
    }
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