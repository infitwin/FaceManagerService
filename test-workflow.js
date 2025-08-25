/**
 * Test the face processing workflow to see where it's breaking
 */

const admin = require('firebase-admin');
const { RekognitionClient, SearchFacesCommand } = require('@aws-sdk/client-rekognition');
require('dotenv').config();

// Initialize Firebase Admin
const serviceAccount = require('/home/tim/credentials/firebase-credentials.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'infitwin'
});

const db = admin.firestore();
const USER_ID = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';

// Initialize AWS Rekognition
const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function testWorkflow() {
  console.log('🔍 Testing Face Processing Workflow\n');
  console.log('=' .repeat(80));
  
  try {
    // 1. Check current state
    console.log('📊 CURRENT STATE:\n');
    
    const groupsSnapshot = await db
      .collection('users')
      .doc(USER_ID)
      .collection('faceGroups')
      .get();
    
    console.log(`Face Groups: ${groupsSnapshot.size}`);
    
    const facesSnapshot = await db
      .collection('users')
      .doc(USER_ID)
      .collection('faces')
      .get();
    
    console.log(`Face Documents: ${facesSnapshot.size}`);
    
    const filesSnapshot = await db
      .collection('users')
      .doc(USER_ID)
      .collection('files')
      .orderBy('uploadedAt', 'desc')
      .limit(5)
      .get();
    
    console.log(`Recent Files: ${filesSnapshot.size}`);
    
    // 2. If we have files with faces, test the workflow
    let testFile = null;
    filesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.extractedFaces && data.extractedFaces.length > 0 && !testFile) {
        testFile = { id: doc.id, data: data };
      }
    });
    
    if (!testFile) {
      console.log('\n❌ No files with extracted faces found');
      console.log('Please upload some test photos first');
      return;
    }
    
    console.log(`\n📁 Testing with file: ${testFile.id}`);
    console.log(`   Faces in file: ${testFile.data.extractedFaces.length}`);
    
    const testFace = testFile.data.extractedFaces[0];
    const faceId = testFace.FaceId || testFace.faceId;
    
    console.log(`\n👤 Testing face: ${faceId}`);
    
    // 3. Check AWS matches
    console.log('\n' + '='.repeat(80));
    console.log('STEP 1: AWS SearchFaces');
    console.log('-'.repeat(40));
    
    try {
      const searchCommand = new SearchFacesCommand({
        CollectionId: `face_coll_${USER_ID}`,
        FaceId: faceId,
        FaceMatchThreshold: 85.0,
        MaxFaces: 20
      });
      
      const searchResponse = await rekognition.send(searchCommand);
      const matchedFaceIds = searchResponse.FaceMatches
        ?.map(match => match.Face?.FaceId)
        .filter(id => id !== undefined && id !== faceId) || [];
      
      console.log(`✅ AWS found ${matchedFaceIds.length} matches`);
      if (matchedFaceIds.length > 0) {
        console.log(`   First 3: ${matchedFaceIds.slice(0, 3).map(id => id.substring(0, 8)).join(', ')}...`);
      }
      
      // 4. Check Firebase groups
      console.log('\nSTEP 2: Find Groups with Matched Faces');
      console.log('-'.repeat(40));
      
      const groupsRef = db.collection('users').doc(USER_ID).collection('faceGroups');
      const query = groupsRef.where('faceIds', 'array-contains-any', matchedFaceIds);
      const snapshot = await query.get();
      
      console.log(`📊 Groups containing matched faces: ${snapshot.size}`);
      
      if (snapshot.size > 0) {
        snapshot.forEach(doc => {
          const data = doc.data();
          console.log(`   Group ${doc.id}: ${data.faceIds.length} faces`);
        });
      }
      
      // 5. Check if face is already grouped
      console.log('\nSTEP 3: Check Current Face Status');
      console.log('-'.repeat(40));
      
      const currentFaceQuery = groupsRef.where('faceIds', 'array-contains', faceId);
      const currentSnapshot = await currentFaceQuery.get();
      
      if (currentSnapshot.empty) {
        console.log(`❌ Face ${faceId} is NOT in any group`);
        console.log('   -> Should be processed and added to a group');
      } else {
        console.log(`✅ Face ${faceId} is in ${currentSnapshot.size} group(s)`);
      }
      
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        console.log('❌ Face not found in AWS collection');
        console.log('   This face needs to be indexed in AWS first');
      } else {
        throw error;
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('💡 ANALYSIS:\n');
    
    if (groupsSnapshot.size === 0) {
      console.log('No groups exist yet - faces need to be processed');
    }
    
    if (facesSnapshot.size === 0) {
      console.log('No face documents - faces haven\'t been processed');
    } else if (facesSnapshot.size < 10) {
      console.log(`Only ${facesSnapshot.size} faces processed - more processing needed`);
    }
    
  } catch (error) {
    console.error('Error testing workflow:', error);
  } finally {
    await admin.app().delete();
  }
}

// Run the test
testWorkflow();