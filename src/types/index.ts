/**
 * TypeScript Type Definitions
 * Defines all interfaces and types used throughout the service
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Face data from AWS Rekognition
 */
export interface Face {
  faceId: string;
  matchedFaceIds: string[];
  confidence?: number;
  boundingBox?: any;
  similarity?: number;
  groupId?: string;  // GroupId from AWS Rekognition
  emotions?: any[];
}

/**
 * Request to process faces from Artifact Processor
 */
export interface ProcessFacesRequest {
  userId: string;
  fileId: string;
  faces: Face[];
  interviewId?: string;  // Interview scope for group isolation
  batchId?: string;      // Batch ID for tracking
}

/**
 * Response after processing faces
 */
export interface ProcessFacesResponse {
  success: boolean;
  processedCount: number;
  groups: FaceGroup[];
  message?: string;
}

/**
 * Face Group in Firestore
 */
export interface FaceGroup {
  groupId: string;
  groupName?: string;
  interviewId?: string;  // Interview this group belongs to (for isolation)
  faceIds: string[];
  leaderFaceId: string;
  leaderFaceData: {
    fileId: string;
    boundingBox: any;
  };
  fileIds: string[];
  faceCount: number;
  status: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  mergedFrom?: string[];
}

/**
 * Request to merge groups
 */
export interface MergeGroupsRequest {
  groupIds: string[];
}

/**
 * Response for group operations
 */
export interface GroupOperationResponse {
  success: boolean;
  groupId?: string;
  message?: string;
  affectedGroups?: number;
}

/**
 * File face update for Firestore
 */
export interface FileFaceUpdate {
  fileId: string;
  faceId: string;
  groupId: string;
}

/**
 * Test data generation request
 */
export interface TestDataRequest {
  scenario: 'simple' | 'transitive' | 'complex' | 'merge';
  faceCount?: number;
}