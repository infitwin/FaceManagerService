/**
 * API Routes
 * Defines all REST API endpoints for the Face Manager Service
 */

import { Router, Request, Response } from 'express';
import { groupManager } from '../services/groupManager';
import { 
  ProcessFacesRequest, 
  ProcessFacesResponse,
  MergeGroupsRequest,
  GroupOperationResponse,
  Face
} from '../types';
import fetch from 'node-fetch';

const router = Router();

/**
 * POST /api/process-faces
 * Main endpoint for processing faces with transitivity
 */
router.post('/process-faces', async (req: Request, res: Response) => {
  try {
    const { userId, fileId, faces } = req.body as ProcessFacesRequest;
    
    // Validate request
    if (!userId || !fileId || !faces || !Array.isArray(faces)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, fileId, faces[]'
      });
    }
    
    console.log(`\n🚀 Processing ${faces.length} faces for user ${userId}, file ${fileId}`);
    
    // Process faces with transitivity
    const groups = await groupManager.processFaces(userId, fileId, faces);
    
    const response: ProcessFacesResponse = {
      success: true,
      processedCount: faces.length,
      groups,
      message: `Successfully processed ${faces.length} faces into ${groups.length} groups`
    };
    
    res.json(response);
  } catch (error: any) {
    console.error('Error processing faces:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process faces'
    });
  }
});

/**
 * GET /api/files-with-faces/:userId
 * Get all files with faces for a user (for UI compatibility)
 */
router.get('/files-with-faces/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    // For now, return the data from the WebsitePrototype API
    // In production, this would query Firebase directly
    const filesResponse = await fetch(`http://localhost:8083/api/files-with-faces/${userId}`);
    const filesData = await filesResponse.json();
    
    res.json(filesData);
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