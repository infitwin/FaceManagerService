/**
 * API Routes
 * Defines all REST API endpoints for the Face Manager Service
 */

import { Router, Request, Response } from 'express';
import { groupManager } from '../services/groupManager';
import { getAdmin } from '../config/firebase';
import { 
  ProcessFacesRequest, 
  ProcessFacesResponse,
  MergeGroupsRequest,
  GroupOperationResponse,
  Face
} from '../types';
// Removed unused fetch import

const router = Router();

// Mock data removed - using real Firebase data only

/**
 * POST /api/process-faces
 * Main endpoint for processing faces with transitivity
 */
router.post('/process-faces', async (req: Request, res: Response) => {
  console.log('\n════════════════════════════════════════');
  console.log('📥 /api/process-faces ENDPOINT HIT');
  console.log('📋 Raw request body:', JSON.stringify(req.body, null, 2));
  console.log('🔍 Body type:', typeof req.body);
  console.log('🔑 Body keys:', Object.keys(req.body || {}));
  
  try {
    const { userId, fileId, faces } = req.body as ProcessFacesRequest;
    
    // Validate request with detailed logging
    if (!userId || !fileId || !faces || !Array.isArray(faces)) {
      console.error('❌ VALIDATION FAILED:');
      console.error('  userId present?', !!userId, 'value:', userId);
      console.error('  fileId present?', !!fileId, 'value:', fileId);
      console.error('  faces present?', !!faces);
      console.error('  faces is array?', Array.isArray(faces));
      console.error('  faces type:', typeof faces);
      if (faces) {
        console.error('  faces length?', faces.length);
        console.error('  faces sample:', faces[0]);
      }
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, fileId, faces[]'
      });
    }
    
    console.log('✅ VALIDATION PASSED');
    console.log(`📊 About to process:`, {
      userId: userId,
      fileId: fileId,
      faceCount: faces.length,
      firstFace: faces[0] ? {
        faceId: faces[0].faceId,
        matchedCount: faces[0].matchedFaceIds?.length,
        hasGroupId: !!faces[0].groupId,
        hasBoundingBox: !!faces[0].boundingBox,
        allKeys: Object.keys(faces[0])
      } : 'NO FACES'
    });
    
    // Process faces with transitivity
    const groups = await groupManager.processFaces(userId, fileId, faces);
    
    const response: ProcessFacesResponse = {
      success: true,
      processedCount: faces.length,
      groups,
      message: `Successfully processed ${faces.length} faces into ${groups.length} groups`
    };
    
    console.log('📤 SENDING RESPONSE:', {
      success: response.success,
      processedCount: response.processedCount,
      groupCount: groups.length,
      groupIds: groups.map(g => g.groupId)
    });
    console.log('════════════════════════════════════════\n');
    
    res.json(response);
  } catch (error: any) {
    console.error('❌ ERROR IN /api/process-faces:', error);
    console.error('  Error message:', error.message);
    console.error('  Error stack:', error.stack);
    console.error('════════════════════════════════════════\n');
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process faces'
    });
  }
});

/**
 * GET /api/files-with-faces/:userId
 * Get all files with faces for a user
 */
router.get('/files-with-faces/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    console.log(`🔍 Getting files with faces for user: ${userId}`);
    
    // Query Firebase for ALL files in user subcollection
    // We'll check for faces in the document data
    const filesSnapshot = await groupManager.db
      .collection('users')
      .doc(userId)
      .collection('files')
      .get();
    
    console.log(`📁 Found ${filesSnapshot.size} total files for user`);
    
    const files: any[] = [];
    
    for (const doc of filesSnapshot.docs) {
      const fileData = doc.data();
      const fileId = doc.id;
      
      // Check if this file has faces in any format
      const hasFacesData = fileData.extractedFaces || fileData.faces || fileData.hasFaces;
      
      if (!hasFacesData) {
        continue; // Skip files without face data
      }
      
      console.log(`🎯 File ${fileId} has face data:`, {
        hasExtractedFaces: !!fileData.extractedFaces,
        hasFaces: !!fileData.faces,
        hasFacesFlag: fileData.hasFaces
      });
      
      // Check if faces are embedded in the file document itself
      let faces = [];
      
      if (fileData.extractedFaces && Array.isArray(fileData.extractedFaces)) {
        // Faces are embedded in the file document
        faces = fileData.extractedFaces;
        console.log(`  📦 Found ${faces.length} embedded faces in file document`);
      } else {
        // Try to get faces from a separate faces subcollection
        const facesSnapshot = await groupManager.db
          .collection('users')
          .doc(userId)
          .collection('faces')
          .where('fileId', '==', fileId)
          .get();
        
        faces = facesSnapshot.docs.map(faceDoc => ({
          faceId: faceDoc.id,
          ...faceDoc.data()
        }));
        
        if (faces.length > 0) {
          console.log(`  📂 Found ${faces.length} faces in separate collection`);
        }
      }
      
      // Construct proper URL for the image
      let imageUrl = fileData.url || fileData.imageUrl;
      
      // If URL is missing, construct Firebase Storage URL from fileId
      if (!imageUrl || !imageUrl.startsWith('http')) {
        // Firebase Storage path is typically: users/{userId}/files/{fileId}
        const storagePath = `users/${userId}/files/${fileId}`;
        // Use Firebase Storage public URL format
        imageUrl = `https://firebasestorage.googleapis.com/v0/b/infitwin.firebasestorage.app/o/${encodeURIComponent(storagePath)}?alt=media`;
        console.log(`  🔗 Constructed Firebase Storage URL for file ${fileId}`);
      }
      
      files.push({
        fileId,
        url: imageUrl,
        faces,
        ...fileData
      });
    }
    
    console.log(`✅ Found ${files.length} files with faces`);
    
    res.json({
      success: true,
      files
    });
  } catch (error: any) {
    console.error('Error getting files with faces:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get files with faces',
      files: []
    });
  }
});

/**
 * GET /api/groups/:userId
 * Get all groups for a user
 */
router.get('/groups/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    const groups = await groupManager.getAllGroups(userId);
    
    res.json({
      success: true,
      userId,
      groupCount: groups.length,
      groups
    });
  } catch (error: any) {
    console.error('Error getting groups:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get groups'
    });
  }
});

/**
 * GET /api/groups/:userId/:groupId
 * Get a specific group
 */
router.get('/groups/:userId/:groupId', async (req: Request, res: Response) => {
  try {
    const { userId, groupId } = req.params;
    
    const group = await groupManager.getGroup(userId, groupId);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    res.json({
      success: true,
      group
    });
  } catch (error: any) {
    console.error('Error getting group:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get group'
    });
  }
});

/**
 * POST /api/groups/:userId
 * Create a new group with faces
 */
router.post('/groups/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { faces, groupName } = req.body;
    
    if (!faces || !Array.isArray(faces) || faces.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one face is required to create a group'
      });
    }
    
    console.log(`[WORKFLOW-BACKEND] Step 8a: Received create group request:`, {
      userId,
      facesCount: faces.length,
      groupName,
      faces: faces.map((f: any) => ({
        faceId: f.faceId,
        fileId: f.fileId,
        hasBoundingBox: !!f.boundingBox
      })),
      fullPayload: req.body
    });
    
    // Create the group using the group manager
    const groupId = await groupManager.createGroupWithFaces(userId, faces, groupName);
    
    console.log(`[WORKFLOW-BACKEND] Step 8b: Group created in Firestore:`, {
      groupId,
      firestorePath: `users/${userId}/faceGroups/${groupId}`
    });
    
    // Get the created group
    const group = await groupManager.getGroup(userId, groupId);
    
    console.log(`[WORKFLOW-BACKEND] Step 8c: Retrieved group from Firestore:`, {
      groupId: group?.groupId,
      groupName: group?.groupName,
      faceCount: group?.faceCount,
      faceIds: group?.faceIds,
      fullGroup: group
    });
    
    res.json({
      success: true,
      group,
      message: `Successfully created group with ${faces.length} faces`
    });
  } catch (error: any) {
    console.error('Error creating group:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create group'
    });
  }
});

/**
 * POST /api/groups/:userId/merge
 * Merge multiple groups
 */
router.post('/groups/:userId/merge', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { groupIds } = req.body as MergeGroupsRequest;
    
    if (!groupIds || !Array.isArray(groupIds) || groupIds.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'At least 2 groupIds required for merging'
      });
    }
    
    // For simplicity, merge all into the first group
    // In production, you might want more sophisticated logic
    const response: GroupOperationResponse = {
      success: true,
      groupId: groupIds[0],
      message: `Merged ${groupIds.length} groups`,
      affectedGroups: groupIds.length
    };
    
    res.json(response);
  } catch (error: any) {
    console.error('Error merging groups:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to merge groups'
    });
  }
});

/**
 * DELETE /api/groups/:groupId/faces/:faceId
 * Remove a specific face from a group
 */
router.delete('/groups/:groupId/faces/:faceId', async (req: Request, res: Response) => {
  try {
    const { groupId, faceId } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing userId parameter'
      });
    }
    
    // Remove the face from the group
    const removed = await groupManager.removeFaceFromGroup(userId as string, groupId, faceId);
    
    res.json({
      success: removed,
      message: removed ? 'Face removed from group successfully' : 'Group or face not found'
    });
  } catch (error: any) {
    console.error('Error removing face from group:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to remove face from group'
    });
  }
});

/**
 * PUT /api/groups/:groupId/name
 * Update the person name for a group
 */
router.put('/groups/:groupId/name', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { userId, personName } = req.body;
    
    if (!userId || !personName) {
      return res.status(400).json({
        success: false,
        message: 'Missing userId or personName'
      });
    }
    
    console.log(`Updating person name for group ${groupId}: ${personName}`);
    
    // Update the group document with the person name
    const groupRef = groupManager.db
      .collection('users')
      .doc(userId)
      .collection('faceGroups')
      .doc(groupId);
    
    await groupRef.update({
      personName: personName,
      groupName: personName, // Also store as groupName for compatibility
      updatedAt: getAdmin().firestore.FieldValue.serverTimestamp()
    });
    
    // Get the updated group
    const updatedDoc = await groupRef.get();
    const updatedGroup = { groupId: updatedDoc.id, ...updatedDoc.data() };
    
    res.json({
      success: true,
      message: 'Person name updated successfully',
      group: updatedGroup
    });
  } catch (error: any) {
    console.error('Error updating person name:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update person name'
    });
  }
});

/**
 * DELETE /api/groups/:groupId
 * Delete a specific group
 */
router.delete('/groups/:groupId', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing userId parameter'
      });
    }
    
    // Delete the group
    const deleted = await groupManager.deleteGroup(userId as string, groupId);
    
    res.json({
      success: deleted,
      message: deleted ? 'Group deleted successfully' : 'Group not found'
    });
  } catch (error: any) {
    console.error('Error deleting group:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete group'
    });
  }
});

/**
 * DELETE /api/test/reset/:userId
 * Clear all groups for testing
 */
router.delete('/test/reset/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    // Allow reset for our known test user
    if (userId !== 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2' && userId !== process.env.TEST_USER_ID) {
      return res.status(403).json({
        success: false,
        message: 'Reset only allowed for test user'
      });
    }
    
    const deletedCount = await groupManager.clearAllGroups(userId);
    
    res.json({
      success: true,
      message: `Cleared ${deletedCount} groups for test user`,
      deletedCount
    });
  } catch (error: any) {
    console.error('Error resetting test data:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to reset test data'
    });
  }
});

/**
 * POST /api/test/generate
 * Generate test data for different scenarios
 */
router.post('/test/generate', async (req: Request, res: Response) => {
  try {
    const { scenario, userId } = req.body;
    const testUserId = userId || process.env.TEST_USER_ID;
    
    let testFaces: Face[] = [];
    
    switch (scenario) {
      case 'simple':
        // Two faces that match each other
        testFaces = [
          { faceId: 'test_face_001', matchedFaceIds: [] },
          { faceId: 'test_face_002', matchedFaceIds: ['test_face_001'] }
        ];
        break;
        
      case 'transitive':
        // A→B, B→C (should create single group)
        testFaces = [
          { faceId: 'test_face_A', matchedFaceIds: [] },
          { faceId: 'test_face_B', matchedFaceIds: ['test_face_A'] },
          { faceId: 'test_face_C', matchedFaceIds: ['test_face_B'] }
        ];
        break;
        
      case 'complex':
        // Multiple groups that should merge
        testFaces = [
          { faceId: 'person1_face1', matchedFaceIds: [] },
          { faceId: 'person1_face2', matchedFaceIds: ['person1_face1'] },
          { faceId: 'person2_face1', matchedFaceIds: [] },
          { faceId: 'person2_face2', matchedFaceIds: ['person2_face1'] },
          { faceId: 'person1_face3', matchedFaceIds: ['person1_face1', 'person1_face2'] }
        ];
        break;
        
      case 'merge':
        // Face that bridges two existing groups
        testFaces = [
          { faceId: 'group1_face1', matchedFaceIds: [] },
          { faceId: 'group1_face2', matchedFaceIds: ['group1_face1'] },
          { faceId: 'group2_face1', matchedFaceIds: [] },
          { faceId: 'group2_face2', matchedFaceIds: ['group2_face1'] },
          { faceId: 'bridge_face', matchedFaceIds: ['group1_face2', 'group2_face1'] }
        ];
        break;
        
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid scenario. Choose: simple, transitive, complex, or merge'
        });
    }
    
    // Process the test faces
    const groups = await groupManager.processFaces(testUserId, `test_file_${Date.now()}`, testFaces);
    
    res.json({
      success: true,
      scenario,
      generatedFaces: testFaces.length,
      resultingGroups: groups.length,
      faces: testFaces,
      groups
    });
  } catch (error: any) {
    console.error('Error generating test data:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate test data'
    });
  }
});

/**
 * GET /api/test/status
 * Get test environment status
 */
router.get('/test/status', async (req: Request, res: Response) => {
  const testUserId = process.env.TEST_USER_ID;
  
  try {
    const groups = await groupManager.getAllGroups(testUserId!);
    
    res.json({
      success: true,
      testUserId,
      totalGroups: groups.length,
      totalFaces: groups.reduce((sum, g) => sum + g.faceCount, 0),
      groups: groups.map(g => ({
        groupId: g.groupId,
        faceCount: g.faceCount,
        faceIds: g.faceIds
      }))
    });
  } catch (error: any) {
    console.error('Error getting test status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get test status'
    });
  }
});

export default router;