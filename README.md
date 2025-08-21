# Face Manager Service

A Node.js/TypeScript service that solves the face grouping transitivity problem for AWS Rekognition face matching. This service ensures that if Face A matches Face B, and Face B matches Face C, all three faces get the same GroupId, even if A doesn't directly match C.

## 🎯 Problem Solved

AWS Rekognition can tell you which faces match, but it doesn't maintain persistent groups across photo batches. This service:
- Maintains persistent face groups across multiple photo uploads
- Ensures transitive grouping (A→B→C all get same GroupId)
- Handles group merging when new faces bridge existing groups
- Provides clean API for integration with existing systems

## 🚀 Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the service:**
   ```bash
   npm run dev
   ```
   Service runs on port 8082

3. **Open test interface:**
   ```bash
   npm run test-ui
   ```
   Test page available at http://localhost:8083

## 📡 API Endpoints

### Process Faces (Main Endpoint)
```
POST /api/process-faces
```
```json
{
  "userId": "user123",
  "fileId": "photo456",
  "faces": [
    {
      "faceId": "aws-face-001",
      "matchedFaceIds": ["aws-face-999", "aws-face-888"]
    }
  ]
}
```

### Get Groups
```
GET /api/groups/:userId
```
Returns all face groups for a user

### Test Endpoints
```
POST /api/test/generate
```
Generate test scenarios: simple, transitive, complex, merge

```
DELETE /api/test/reset/:userId
```
Clear all groups for testing (only works with TEST_USER_ID)

## 🧪 Test Scenarios

The service includes test scenarios to verify transitivity:

1. **Simple**: Two faces that match each other
2. **Transitive**: A→B, B→C (should create single group)
3. **Complex**: Multiple people with multiple faces
4. **Merge**: New face that bridges two existing groups

Test with user: `zsvLTeIPJUYGnZHzWX7hVtLJlJX2`

## 🏗️ Architecture

```
FaceManagerService/
├── src/
│   ├── index.ts              # Express server
│   ├── config/
│   │   └── firebase.ts       # Firebase initialization
│   ├── services/
│   │   └── groupManager.ts   # Core transitivity algorithm
│   ├── routes/
│   │   └── api.ts           # REST endpoints
│   └── types/
│       └── index.ts         # TypeScript interfaces
├── public/
│   ├── test-page.html       # Testing interface
│   ├── test-app.js          # Test page JavaScript
│   └── ui-studio-module.js  # UI Studio integration
```

## 🔑 Core Algorithm

The transitivity solution in `groupManager.ts`:

```typescript
for (const face of faces) {
  if (face.matchedFaceIds.length > 0) {
    // Find ALL groups containing ANY matched face
    const groups = await findGroupsContainingFaces(face.matchedFaceIds);
    
    if (groups.length === 0) {
      // Create new group
    } else if (groups.length === 1) {
      // Add to existing group
    } else {
      // MERGE groups (key to transitivity!)
      await mergeGroups(groups);
    }
  }
}
```

## 📦 Deployment

### Deploy to Google Cloud Run

```bash
./deploy.sh
```

The deployment script:
1. Builds TypeScript
2. Creates Docker image
3. Pushes to Google Container Registry
4. Deploys to Cloud Run

### Environment Variables

```env
FIREBASE_PROJECT_ID=infitwin
FIREBASE_CREDENTIALS_PATH=/path/to/firebase-credentials.json
PORT=8082
TEST_USER_ID=zsvLTeIPJUYGnZHzWX7hVtLJlJX2
CORS_ORIGINS=http://localhost:8357,https://infitwin.web.app
```

## 🔗 Integration

### UI Studio Integration

Include the module in your UI Studio page:
```html
<script src="/js/services/face-manager-api.js"></script>
```

```javascript
const faceManager = new FaceManagerAPI();
const result = await faceManager.processFaces(userId, fileId, faces);
```

### Artifact Processor Integration

After face extraction with AWS Rekognition:
```python
# Extract faces with AWS
faces = aws_rekognition.index_faces(...)

# Format for Face Manager
formatted_faces = [
    {
        "faceId": face["FaceId"],
        "matchedFaceIds": face.get("MatchedFaces", [])
    }
    for face in faces
]

# Call Face Manager API
response = requests.post(
    "http://localhost:8082/api/process-faces",
    json={
        "userId": user_id,
        "fileId": file_id,
        "faces": formatted_faces
    }
)
```

## 📊 Firestore Schema

```javascript
// Face Groups Collection
/users/{userId}/faceGroups/{groupId}
{
  groupId: string,
  faceIds: string[],        // AWS Face IDs in this group
  fileIds: string[],        // Files containing these faces
  faceCount: number,
  createdAt: timestamp,
  updatedAt: timestamp,
  mergedFrom: string[]      // Track merged groups
}

// File Face Mapping
/users/{userId}/files/{fileId}
{
  faceGroupMapping: {
    [faceId]: groupId
  },
  faceGroupsProcessedAt: timestamp
}
```

## 🧪 Testing

1. **Start the service:** `npm run dev`
2. **Open test UI:** http://localhost:8083
3. **Run test scenarios**
4. **Verify transitivity works**

## 📝 License

MIT