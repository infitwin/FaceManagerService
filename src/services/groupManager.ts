/**
 * Group Manager Service
 * Core logic for face grouping with transitivity
 */

import { getDb, getAdmin } from '../config/firebase';
import { Face, FaceGroup, FileFaceUpdate } from '../types';
import { FieldValue } from 'firebase-admin/firestore';
import { RekognitionClient, SearchFacesCommand, DeleteFacesCommand } from '@aws-sdk/client-rekognition';
import https from 'https';
import http from 'http';

export class GroupManager {
  private rekognition: RekognitionClient | null = null;

  constructor() {
    // AWS client will be initialized on first use
  }

  private getAWSClient(): RekognitionClient {
    if (!this.rekognition) {
      // Initialize AWS Rekognition client on first use (after env vars are loaded)
      console.log('🔧 Initializing AWS Rekognition client (SDK v3)...');
      console.log('  AWS_REGION:', process.env.AWS_REGION || 'us-east-1');
      console.log('  AWS-ACCESS-KEY-ID:', process.env['AWS-ACCESS-KEY-ID'] ? 'Set' : 'NOT SET');
      console.log('  AWS-SECRET-ACCESS-KEY:', process.env['AWS-SECRET-ACCESS-KEY'] ? 'Set' : 'NOT SET');
      
      this.rekognition = new RekognitionClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env['AWS-ACCESS-KEY-ID'] || '',  // Using hyphenated name from Secret Manager
          secretAccessKey: process.env['AWS-SECRET-ACCESS-KEY'] || ''  // Using hyphenated name from Secret Manager
        }
      });
    }
    return this.rekognition;
  }

  get db() {
    return getDb();
  }

  /**
   * Verify that an image URL is actually accessible (#237)
   * This catches cases where:
   * - Image was deleted from storage
   * - URL is expired/invalid
   * - CORS or permission issues
   * Returns true if image is accessible, false otherwise
   */
  private async isImageAccessible(imageUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const url = new URL(imageUrl);
        const client = url.protocol === 'https:' ? https : http;

        const req = client.request(url, { method: 'HEAD', timeout: 5000 }, (res) => {
          // 2xx status codes mean image is accessible
          const isAccessible = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300;
          console.log(`    🔗 Image check: ${imageUrl.substring(0, 60)}... -> ${res.statusCode} (${isAccessible ? 'accessible' : 'NOT accessible'})`);
          resolve(isAccessible);
        });

        req.on('error', (err) => {
          console.log(`    ❌ Image check failed: ${imageUrl.substring(0, 60)}... -> ${err.message}`);
          resolve(false);
        });

        req.on('timeout', () => {
          console.log(`    ⏱️ Image check timeout: ${imageUrl.substring(0, 60)}...`);
          req.destroy();
          resolve(false);
        });

        req.end();
      } catch (err) {
        console.log(`    ❌ Image URL parse error: ${imageUrl} -> ${err}`);
        resolve(false);
      }
    });
  }

  /**
   * Search for matching faces in AWS Face Collection
   * This is what the ArtifactProcessor should NOT be doing
   */
  private async searchForMatches(userId: string, faceId: string): Promise<string[]> {
    try {
      console.log(`🔍 Searching for matches for face ${faceId} in collection face_coll_${userId}`);
      
      const rekognition = this.getAWSClient();
      const command = new SearchFacesCommand({
        CollectionId: `face_coll_${userId}`,
        FaceId: faceId,
        FaceMatchThreshold: 85.0,  // Using 85% threshold for better grouping
        MaxFaces: 20  // Get more matches for better transitivity
      });
      
      const response = await rekognition.send(command);
      
      // Extract matched face IDs
      const matchedFaceIds = response.FaceMatches
        ?.map(match => match.Face?.FaceId)
        .filter((id): id is string => id !== undefined && id !== faceId) || [];
      
      console.log(`✅ Face ${faceId} matches ${matchedFaceIds.length} other faces:`, matchedFaceIds);
      return matchedFaceIds;
    } catch (error) {
      console.error(`❌ Error searching for face matches: ${error}`);
      return [];
    }
  }

  /**
   * Process new faces with transitivity-aware grouping
   * This is the core algorithm that ensures A→B→C all get the same GroupId
   */
  async processFaces(userId: string, fileId: string, faces: Face[], interviewId?: string): Promise<FaceGroup[]> {
    console.log('\n🎯 processFaces() CALLED');
    console.log(`📊 Processing ${faces.length} faces for user ${userId}, file ${fileId}`);
    console.log(`🔄 Face matching v2.4 - with HTTP image accessibility validation (#237)`);
    console.log(`📌 Interview scope: ${interviewId || 'NONE (global matching)'}`);
    if (interviewId) {
      console.log(`  ✅ Groups will be isolated to this interview only`);
    }

    // CRITICAL: Verify source file exists before processing faces (#237)
    // AWS may have faceIds for files that were deleted/renamed - don't create groups for them
    const fileDoc = await this.db.collection('users').doc(userId)
                                 .collection('files').doc(fileId).get();

    if (!fileDoc.exists) {
      console.log(`  ⏭️ Skipping all faces - source file ${fileId} does not exist`);
      return [];
    }

    const fileData = fileDoc.data();
    const imageUrl = fileData?.url || fileData?.imageUrl || fileData?.downloadURL;

    if (!imageUrl) {
      console.log(`  ⏭️ Skipping all faces - source file ${fileId} has no image URL`);
      return [];
    }

    console.log(`  📋 Source file ${fileId} has image URL, verifying accessibility...`);

    // CRITICAL: Verify image is actually accessible (#237)
    // This catches deleted images, expired URLs, or permission issues
    // The UI only displays faces whose images successfully load, so we must match that
    const isAccessible = await this.isImageAccessible(imageUrl);
    if (!isAccessible) {
      console.log(`  ⏭️ Skipping all faces - image at ${imageUrl.substring(0, 60)}... is NOT accessible`);
      return [];
    }

    console.log(`  ✅ Source file verified: ${fileId} image is accessible`);

    // Log exact structure of received faces
    console.log('📦 Received faces array:');
    faces.forEach((face, index) => {
      console.log(`  Face ${index}:`, {
        faceId: face.faceId || 'MISSING',
        matchedFaceIds: face.matchedFaceIds || 'MISSING',
        matchedCount: face.matchedFaceIds?.length || 0,
        confidence: face.confidence || 'MISSING',
        boundingBox: face.boundingBox ? 'present' : 'MISSING',
        groupId: face.groupId || 'MISSING',
        allKeys: Object.keys(face)
      });
    });
    
    const updatedGroups: FaceGroup[] = [];
    const fileUpdates: FileFaceUpdate[] = [];
    
    // IMPORTANT: If multiple faces from same file and no matches provided,
    // assume they are DIFFERENT people (common case: group photo)
    // Each face from the same file should get its own group unless explicitly matched
    const processedFaceToGroup: Map<string, string> = new Map();

    for (const face of faces) {
      console.log(`\n🔍 Processing face ${face.faceId}`);

      // Validate face has required image data - skip faces without valid bounding box (#237)
      // Without a valid bounding box, we can't render the face thumbnail, so creating
      // a group for it would result in an empty group (displays "1 face" but no image)
      const boundingBox = face.boundingBox || (face as any).BoundingBox;
      if (!boundingBox ||
          boundingBox.Left === undefined ||
          boundingBox.Top === undefined ||
          boundingBox.Width === undefined ||
          boundingBox.Height === undefined) {
        console.log(`  ⏭️ Skipping face ${face.faceId} - missing or invalid bounding box (no image data)`);
        console.log(`    BoundingBox received:`, JSON.stringify(boundingBox));
        continue;
      }

      console.log(`  📊 Input data:`, {
        faceId: face.faceId,
        matchedFaceIds: face.matchedFaceIds,
        matchedCount: face.matchedFaceIds?.length || 0,
        confidence: face.confidence,
        hasGroupId: !!face.groupId,
        groupId: face.groupId,
        boundingBox: { L: boundingBox.Left?.toFixed(3), T: boundingBox.Top?.toFixed(3), W: boundingBox.Width?.toFixed(3), H: boundingBox.Height?.toFixed(3) }
      });
      
      // Log AWS GroupId if present
      if (face.groupId) {
        console.log(`  🏷️ AWS GroupId: ${face.groupId}`);
      }
      
      // Log matched faces details
      if (face.matchedFaceIds && face.matchedFaceIds.length > 0) {
        console.log(`  🔗 Matched to ${face.matchedFaceIds.length} faces:`);
        face.matchedFaceIds.forEach((matchId, idx) => {
          console.log(`     ${idx + 1}. ${matchId}`);
        });
      }
      
      // If no matches provided, search AWS Face Collection for matches
      let matchedFaceIds = face.matchedFaceIds;
      if (!matchedFaceIds || matchedFaceIds.length === 0) {
        console.log(`  ⚡ No matches provided - calling AWS SearchFaces API...`);
        matchedFaceIds = await this.searchForMatches(userId, face.faceId);
        console.log(`  ✅ AWS found ${matchedFaceIds.length} matching faces`);
      } else {
        console.log(`  📦 Using ${matchedFaceIds.length} pre-provided matches: ${matchedFaceIds.join(', ')}`);
      }
      
      if (matchedFaceIds.length > 0) {
        // Face has matches - find existing groups (scoped to interview if provided)
        console.log(`  🔍 Searching for groups containing these matched faces...`);
        const existingGroups = await this.findGroupsContainingFaces(userId, matchedFaceIds, interviewId);
        console.log(`  📦 Found ${existingGroups.length} existing groups containing matched faces`);
        if (existingGroups.length > 0) {
          console.log(`  📋 Existing groups:`, existingGroups.map(g => ({
            groupId: g.groupId,
            faceCount: g.faceIds?.length || 0,
            containsFaces: g.faceIds?.slice(0, 3) // Show first 3 faces
          })));
        }
        
        if (existingGroups.length === 0) {
          // No existing groups - create new group with ONLY this face
          // The matched faces will be grouped naturally when they are processed
          console.log(`  Creating new group for face (matches will be grouped when processed)`);
          const groupId = await this.createGroup(userId, [face.faceId], fileId, face.boundingBox, interviewId);
          
          // Create face document for this face
          await this.createFaceDocument(userId, face.faceId, groupId, fileId, face.boundingBox, face.confidence);
          
          // Don't add matched faces to the group - they'll be added when they're actually processed
          // This prevents creating groups with phantom faces that haven't been processed yet
          
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
        const groupId = await this.createGroup(userId, [face.faceId], fileId, face.boundingBox, interviewId);
        
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
    
    // Log summary of groups created
    console.log(`\n📊 GROUPING SUMMARY:`);
    console.log(`  Total faces processed: ${faces.length}`);
    console.log(`  Groups affected: ${updatedGroups.length}`);
    
    // Show unique groups and their sizes
    const uniqueGroups = new Map();
    updatedGroups.forEach(group => {
      if (!uniqueGroups.has(group.groupId)) {
        uniqueGroups.set(group.groupId, {
          faceCount: group.faceIds?.length || 0,
          faceIds: group.faceIds || []
        });
      }
    });
    
    console.log(`  Unique groups: ${uniqueGroups.size}`);
    uniqueGroups.forEach((data, groupId) => {
      console.log(`    - Group ${groupId.substring(0, 8)}... has ${data.faceCount} faces`);
    });
    
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
    try {
      console.log(`    📝 Attempting to create face document for ${faceId}...`);
      
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
      console.log(`    ✅ Created face document: /users/${userId}/faces/${faceId} -> group ${groupId}`);
    } catch (error: any) {
      console.error(`    ❌ FAILED to create face document for ${faceId}:`, error);
      console.error(`      Error message:`, error.message);
      console.error(`      Error code:`, error.code);
      // Don't throw - continue processing other faces
    }
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
   * FIXED: Now looks up face documents to find their groups instead of searching groups directly
   * v2.2: Now filters by interviewId for interview-scoped isolation
   */
  private async findGroupsContainingFaces(userId: string, faceIds: string[], interviewId?: string): Promise<FaceGroup[]> {
    console.log(`    🔍 Looking up groups for ${faceIds.length} face IDs`);
    console.log(`    📌 Interview filter: ${interviewId || 'NONE (all groups)'}`);

    if (faceIds.length === 0) {
      console.log(`    ⚠️  No face IDs provided`);
      return [];
    }

    const groups: FaceGroup[] = [];
    const foundGroupIds = new Set<string>();

    // Query groups directly using array-contains-any
    // Firestore array-contains-any has a limit of 10 items, so batch if needed
    const batchSize = 10;
    for (let i = 0; i < faceIds.length; i += batchSize) {
      const batch = faceIds.slice(i, i + batchSize);
      console.log(`    📦 Querying groups batch ${Math.floor(i/batchSize) + 1}: ${batch.length} face IDs`);

      try {
        const groupsQuery = await this.db.collection('users').doc(userId)
          .collection('faceGroups')
          .where('faceIds', 'array-contains-any', batch)
          .get();

        console.log(`    ✓ Found ${groupsQuery.size} groups in batch ${Math.floor(i/batchSize) + 1}`);

        groupsQuery.forEach((doc) => {
          const group = doc.data() as FaceGroup;

          // INTERVIEW SCOPING: If interviewId is provided, only match groups from same interview
          if (interviewId && group.interviewId && group.interviewId !== interviewId) {
            console.log(`      ⏭️ Skipping group ${group.groupId} (interview: ${group.interviewId}) - different interview`);
            return; // Skip groups from different interviews
          }

          // Only add if we haven't seen this group yet
          if (!foundGroupIds.has(group.groupId)) {
            foundGroupIds.add(group.groupId);
            groups.push(group);
            console.log(`      ✓ Group ${group.groupId} contains ${group.faceIds?.length || 0} faces (name: ${group.groupName || '(unnamed)'}, interview: ${group.interviewId || 'global'})`);
          }
        });
      } catch (error) {
        console.error(`      ❌ Error querying groups for batch:`, error);
      }
    }

    console.log(`    📊 Found ${groups.length} unique groups containing matched faces (interview-scoped: ${!!interviewId})`);

    return groups;
  }

  /**
   * Create a new face group
   * v2.2: Now stores interviewId for interview-scoped isolation
   */
  private async createGroup(userId: string, faceIds: string[], fileId: string, leaderBoundingBox?: any, interviewId?: string): Promise<string> {
    // Don't create empty groups (#237)
    if (!faceIds || faceIds.length === 0) {
      console.log(`    ⏭️ Skipping group creation - no faces provided`);
      return '';
    }

    const groupId = this.generateGroupId();
    const groupRef = this.db.collection('users').doc(userId)
                           .collection('faceGroups').doc(groupId);

    const groupData: Partial<FaceGroup> = {
      groupId,
      interviewId,  // Store interview scope for isolation
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
    console.log(`    Created group ${groupId} with ${faceIds.length} faces, leader: ${faceIds[0]}, interview: ${interviewId || 'global'}`);
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
    
    // Update all face documents from secondary group to point to primary group
    console.log(`    Updating ${secondaryData.faceIds?.length || 0} face documents to point to primary group`);
    const facesCollection = this.db.collection('users').doc(userId).collection('faces');
    const updatePromises = (secondaryData.faceIds || []).map(faceId => 
      facesCollection.doc(faceId).update({ 
        groupId: primaryGroupId,
        updatedAt: FieldValue.serverTimestamp()
      }).catch(err => console.warn(`      Failed to update face ${faceId}:`, err))
    );
    await Promise.all(updatePromises);
    
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
      const data = doc.data();
      // Include ALL groups, even empty ones (they're valid for drag-drop)
      // Don't auto-delete empty groups - user may want to add faces to them
      groups.push({ groupId: doc.id, ...data } as FaceGroup);
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

      // Delete the face document from faces collection
      const faceRef = this.db.collection('users').doc(userId)
                            .collection('faces').doc(faceId);
      await faceRef.delete();
      console.log(`    🗑️ Deleted face document: /users/${userId}/faces/${faceId}`);

      // Don't auto-delete empty groups - let user manually delete if desired
      // Empty groups are valid and can have faces added back via drag-drop
      console.log(`ℹ️ Group ${groupId} now has ${updatedFaceIds.length} faces (empty groups are preserved)`);

      // Prepare update object
      const updateData: any = {
        faceIds: updatedFaceIds,
        faceCount: updatedFaceIds.length,
        updatedAt: FieldValue.serverTimestamp()
      };
      
      // Update leader if removed face was the leader
      if (groupData.leaderFaceId === faceId && updatedFaceIds.length > 0) {
        const newLeaderFaceId = updatedFaceIds[0];
        updateData.leaderFaceId = newLeaderFaceId;

        // Fetch the new leader's face data to update leaderFaceData
        const newLeaderFaceRef = this.db.collection('users').doc(userId)
                                        .collection('faces').doc(newLeaderFaceId);
        const newLeaderFaceDoc = await newLeaderFaceRef.get();

        if (newLeaderFaceDoc.exists) {
          const newLeaderData = newLeaderFaceDoc.data();
          updateData.leaderFaceData = {
            fileId: newLeaderData?.fileId || groupData.leaderFaceData?.fileId || '',
            boundingBox: newLeaderData?.boundingBox || {}
          };
          console.log(`    👑 Updated leader face to: ${newLeaderFaceId} (fileId: ${newLeaderData?.fileId})`);
        } else {
          console.log(`    ⚠️ Updated leader face to: ${newLeaderFaceId} (face doc not found, keeping old leaderFaceData)`);
        }
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
   * Add a face to an existing group (public API method)
   */
  async addFaceToExistingGroup(userId: string, groupId: string, faceId: string, fileId?: string): Promise<boolean> {
    try {
      const groupRef = this.db.collection('users').doc(userId)
                             .collection('faceGroups').doc(groupId);

      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) {
        console.log(`Group ${groupId} not found`);
        return false;
      }

      const groupData = groupDoc.data() as FaceGroup;
      const currentFaceIds = groupData.faceIds || [];

      // Check if face is already in the group
      if (currentFaceIds.includes(faceId)) {
        console.log(`Face ${faceId} already in group ${groupId}`);
        return true;
      }

      // Add the face to the group's faceIds array
      const updatedFaceIds = [...currentFaceIds, faceId];

      // Create a face document in the faces collection
      const faceRef = this.db.collection('users').doc(userId)
                            .collection('faces').doc(faceId);

      await faceRef.set({
        faceId,
        groupId,
        fileId: fileId || 'manual',
        addedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      console.log(`    ✅ Created/updated face document: /users/${userId}/faces/${faceId}`);

      // Update the group with the new face
      await groupRef.update({
        faceIds: updatedFaceIds,
        faceCount: updatedFaceIds.length,
        updatedAt: FieldValue.serverTimestamp()
      });

      console.log(`✅ Added face ${faceId} to group ${groupId}`);
      return true;
    } catch (error) {
      console.error('Error adding face to group:', error);
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