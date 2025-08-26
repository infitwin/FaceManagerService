# Face Manager Service - Session Documentation
**Date:** January 25, 2025  
**Last Stable Commit:** `6c61195` (deployed to production)  
**Service Status:** ✅ WORKING - Face grouping fixed and verified

---

## 🎯 Executive Summary

Successfully fixed critical face grouping bug where photos of the same person were creating separate groups instead of merging. The fix involved changing how the service looks up existing groups - now uses face document lookups instead of direct group searches. This solves the "chicken-and-egg" problem in batch processing scenarios.

---

## 📦 Current Deployment Status

### GitHub Repository
- **Repo:** `github.com:infitwin/FaceManagerService.git`
- **Branch:** main
- **Last Push:** Commit `6c61195` - "fix: Face grouping now works correctly with batch processing"
- **Auto-Deploy:** Cloud Build triggers on push to main

### Rollback Point
```bash
# To rollback to last stable version if needed:
git checkout 6c61195

# Previous stable commits:
# f6c2f3d - fix: force rebuild to ensure phantom faces fix is deployed
# e84d941 - fix: face processing workflow and image URL handling
# a2c57c2 - fix: prevent adding phantom faces to groups
```

### Environment Variables (Cloud Run)
```
FIREBASE_CREDENTIALS=[Secret Manager: firebase-credentials]
FIREBASE_APP_ID=1:1065022466034:web:8bbfd23054dc3a86dc0078
AWS_ACCESS_KEY_ID=[Set in Secret Manager]
AWS_SECRET_ACCESS_KEY=[Set in Secret Manager]
AWS_REGION=us-east-1
PORT=8080
NODE_ENV=production
```

---

## 🔧 The Fix We Implemented

### The Problem
When processing multiple faces in batch:
1. Face A would be processed, find no matches, create Group 1
2. Face B would match Face A in AWS, but Face A wasn't "in" any group yet from the query perspective
3. Face B would create Group 2 instead of joining Group 1
4. Result: 9 photos of same person = 9 separate groups ❌

### The Solution
Changed `findGroupsContainingFaces` method in `/src/services/groupManager.ts`:

```typescript
// OLD BROKEN CODE (line 360-370):
private async findGroupsContainingFaces(userId: string, faceIds: string[]): Promise<FaceGroup[]> {
  const groupsRef = this.db.collection('users').doc(userId).collection('faceGroups');
  const query = groupsRef.where('faceIds', 'array-contains-any', faceIds);
  // This failed because matched faces weren't IN groups yet
}

// NEW WORKING CODE (line 361-399):
private async findGroupsContainingFaces(userId: string, faceIds: string[]): Promise<FaceGroup[]> {
  const groupIds = new Set<string>();
  
  // Look up each face's document to find its group
  for (const faceId of faceIds) {
    const faceDoc = await this.db.collection('users').doc(userId)
                                  .collection('faces').doc(faceId).get();
    if (faceDoc.exists) {
      const faceData = faceDoc.data();
      if (faceData?.groupId) {
        groupIds.add(faceData.groupId);
      }
    }
  }
  
  // Fetch the unique groups
  const groups: FaceGroup[] = [];
  for (const groupId of groupIds) {
    const group = await this.getGroup(userId, groupId);
    if (group) groups.push(group);
  }
  
  return groups;
}
```

### Also Updated `mergeGroups` (line 490-499)
Added face document updates when merging groups to maintain consistency:
```typescript
// Update all face documents from secondary group to point to primary group
const updatePromises = (secondaryData.faceIds || []).map(faceId => 
  facesCollection.doc(faceId).update({ 
    groupId: primaryGroupId,
    updatedAt: FieldValue.serverTimestamp()
  })
);
await Promise.all(updatePromises);
```

---

## 📊 Data Architecture

### Firebase Firestore Structure
```
users/
  {userId}/
    faceGroups/        # Groups of similar faces
      {groupId}/
        - groupId
        - faceIds[]    # Array of face IDs in this group
        - fileIds[]    # Array of source files
        - leaderFaceId # Representative face
        - leaderFaceData
        - status: "unreviewed"
        - faceCount
        - createdAt/updatedAt
    
    faces/             # Individual face → group mappings
      {faceId}/
        - faceId
        - groupId      # Which group this face belongs to
        - fileId       # Source file
        - boundingBox
        - confidence
        - createdAt/updatedAt
    
    files/             # Uploaded files metadata
      {fileId}/
        - fileName
        - url          # Firebase Storage URL
        - extractedFaces[]
        - status
```

### AWS Rekognition Structure
```
Collection: face_coll_{userId}
  - Contains face vectors for similarity matching
  - 85% similarity threshold for matching
  - SearchFaces returns up to 20 matches
  - Faces persist until explicitly deleted
```

---

## 🔄 Processing Workflow

### Current Implementation
1. **Photo Upload** (External service)
   - Uploads to Firebase Storage
   - Calls AWS IndexFaces to add face vectors
   - Sends faces to Face Manager Service

2. **Face Manager Processing** (`/api/process-faces`)
   ```javascript
   For each face:
     → Call AWS SearchFaces (if matches not provided)
     → Get list of similar face IDs
     → Look up each matched face's document
     → Find which groups they belong to
     → Decision:
       - No groups exist → Create new group
       - One group exists → Join that group
       - Multiple groups → Merge groups + add face
   ```

3. **Group Management**
   - Groups automatically merge when transitive matches found
   - Face documents maintain face→group mappings
   - Dual collection architecture for efficient lookups

---

## ❓ Open Questions & Next Steps

### Leader Face Implementation
**Current Status:** Partially implemented
- ✅ `leaderFaceId` field exists in groups
- ✅ Set to first face when group created
- ❓ **Not updated** when groups merge
- ❓ **No algorithm** to select best representative face

**Questions for Tomorrow:**
1. Should leader face be the highest confidence face?
2. Should it be the most centered face (best boundingBox)?
3. Should it update when better faces are added?
4. How does this relate to node creation?

### Moving to Nodes
**Current Understanding:**
- Face groups need to become nodes in the knowledge graph
- Each node represents a person
- Leader face would be the display image

**Next Implementation Steps:**
1. Define node structure and schema
2. Create node from group when group is verified
3. Link nodes to memories/transcripts
4. Implement node merging when duplicates found

### Utility Scripts Created
```bash
# In /home/tim/current-projects/FaceManagerService/

# Test grouping with mock data
node test-fixed-grouping.js

# Clean AWS Rekognition collection
node clean-aws-collection.js

# Check AWS faces
node check-aws-faces.js

# Clean and reprocess all files
node cleanup-and-regroup.js

# Test with real face IDs
node test-real-grouping.js
```

---

## 🐛 Issues Fixed This Session

1. **AWS SDK v2 Timeout** → Switched to modular v3
2. **Firebase Credentials Missing** → Made initialization resilient
3. **Wrong Env Var** → FIREBASE_APP_ID vs FIREBASE_PROJECT_ID
4. **Phantom Faces Bug** → Only add processed face, not all matches
5. **Group Lookup Bug** → Use face documents instead of direct search
6. **Orphaned AWS Faces** → Cleaned collection, added detection

---

## 🔑 Critical Information

### Service Endpoints
- **Local:** http://localhost:8082
- **Production:** https://facemanagerservice-833139648849.us-central1.run.app
- **Health Check:** `/health`
- **Test UI:** http://localhost:8083/face-groups.html

### Test User ID
```
zsvLTeIPJUYGnZHzWX7hVtLJlJX2
```

### Starting the Service Locally
```bash
cd /home/tim/current-projects/FaceManagerService
FIREBASE_CREDENTIALS="$(cat /home/tim/credentials/firebase-credentials.json)" npm start
```

### Running Tests
```bash
# Start service first, then:
npm run test-ui  # Starts UI on port 8083
```

### Common Commands
```bash
# Check Firebase data
node -e "..." # See utility scripts above

# Deploy to production (automatic via GitHub)
git add -A && git commit -m "fix: description" && git push origin main

# View Cloud Run logs
gcloud run services logs read facemanagerservice --limit=50
```

---

## 📝 Implementation Notes

### Why Face Documents Matter
The dual-collection architecture (groups + faces) enables:
1. **Bidirectional lookups** - Find group from face or faces from group
2. **Efficient merging** - Update face documents when groups merge
3. **Orphan detection** - Identify faces without groups
4. **Audit trail** - Track when each face was assigned to groups

### Transitivity Handling
If Face A matches B, and B matches C, then A, B, and C should be in the same group:
- Achieved through group merging
- When face matches multiple groups, they merge
- Face documents updated to maintain consistency

### Performance Considerations
- AWS SearchFaces: ~50ms per face
- Face document lookup: ~10ms per face
- Group merge: ~100ms (includes face document updates)
- Typical processing: 2-3 seconds for 4-face photo

---

## 🚀 Tomorrow's Priority Tasks

1. **Investigate Leader Face Requirements**
   - Define selection algorithm
   - Implement updates on merge
   - Test with UI display

2. **Node Creation Design**
   - Define node schema
   - Map groups → nodes transformation
   - Plan memory/transcript linking

3. **Testing Suite**
   - Automated tests for grouping logic
   - Integration tests with mock AWS
   - UI tests for group display

4. **Documentation**
   - API documentation
   - Architecture diagrams
   - Deployment guide

---

## 📌 Remember

- **Firebase = Source of Truth** (not AWS)
- **AWS = Recognition Engine** (just for matching)
- **Always clean both** when resetting data
- **Fix is working** - verified with test data
- **Production deployed** - Cloud Build auto-deploys from GitHub

---

**Document Location:** `/home/tim/current-projects/FaceManagerService/FACE_MANAGER_SESSION_2025-01-25.md`

This document provides everything needed to continue work tomorrow without a cold start. The face grouping is working correctly, and the next major task is implementing proper leader face selection and beginning the transition from face groups to knowledge graph nodes.