/**
 * Script to manage faces in AWS Rekognition collection
 * - List all faces in the collection
 * - Delete specific faces or all faces
 * - Sync with Firebase (remove orphaned faces)
 */

const { RekognitionClient, ListFacesCommand, DeleteFacesCommand, DescribeCollectionCommand } = require('@aws-sdk/client-rekognition');
const admin = require('firebase-admin');
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

const COLLECTION_ID = `face_coll_${USER_ID}`;

async function describeCollection() {
  try {
    const command = new DescribeCollectionCommand({
      CollectionId: COLLECTION_ID
    });
    const response = await rekognition.send(command);
    console.log('📊 Collection Info:');
    console.log(`  Name: ${COLLECTION_ID}`);
    console.log(`  Face Count: ${response.FaceCount}`);
    console.log(`  Face Model Version: ${response.FaceModelVersion}`);
    console.log(`  Created: ${response.CreationTimestamp}`);
    return response.FaceCount;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.log('❌ Collection does not exist:', COLLECTION_ID);
      return 0;
    }
    throw error;
  }
}

async function listAllFaces() {
  console.log('\n🔍 Fetching all faces from AWS Rekognition...\n');
  
  const allFaces = [];
  let nextToken = null;
  
  do {
    const command = new ListFacesCommand({
      CollectionId: COLLECTION_ID,
      MaxResults: 100,
      NextToken: nextToken
    });
    
    try {
      const response = await rekognition.send(command);
      allFaces.push(...(response.Faces || []));
      nextToken = response.NextToken;
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        console.log('❌ Collection does not exist');
        return [];
      }
      throw error;
    }
  } while (nextToken);
  
  return allFaces;
}

async function getFirebaseFaces() {
  const facesSnapshot = await db
    .collection('users')
    .doc(USER_ID)
    .collection('faces')
    .get();
  
  const firebaseFaceIds = new Set();
  facesSnapshot.forEach(doc => {
    firebaseFaceIds.add(doc.id);
  });
  
  return firebaseFaceIds;
}

async function analyzeAndClean() {
  console.log('🧹 AWS Rekognition Face Management Tool\n');
  console.log('=' .repeat(80));
  
  try {
    // 1. Get collection info
    const faceCount = await describeCollection();
    if (faceCount === 0) {
      console.log('\n✅ No faces in collection or collection doesn\'t exist');
      return;
    }
    
    // 2. Get all faces from AWS
    const awsFaces = await listAllFaces();
    console.log(`\n✅ Found ${awsFaces.length} faces in AWS Rekognition`);
    
    // 3. Get all faces from Firebase
    const firebaseFaceIds = await getFirebaseFaces();
    console.log(`✅ Found ${firebaseFaceIds.size} faces in Firebase\n`);
    
    // 4. Find orphaned faces (in AWS but not in Firebase)
    const orphanedFaces = [];
    const validFaces = [];
    
    for (const face of awsFaces) {
      if (!firebaseFaceIds.has(face.FaceId)) {
        orphanedFaces.push(face.FaceId);
      } else {
        validFaces.push(face.FaceId);
      }
    }
    
    console.log('=' .repeat(80));
    console.log('📊 ANALYSIS:\n');
    console.log(`Total AWS faces: ${awsFaces.length}`);
    console.log(`Valid faces (exist in Firebase): ${validFaces.length}`);
    console.log(`Orphaned faces (AWS only): ${orphanedFaces.length}`);
    
    if (orphanedFaces.length > 0) {
      console.log('\n🔍 Sample orphaned face IDs:');
      orphanedFaces.slice(0, 5).forEach(id => console.log(`  - ${id}`));
      if (orphanedFaces.length > 5) {
        console.log(`  ... and ${orphanedFaces.length - 5} more`);
      }
    }
    
    // 5. Show options
    console.log('\n' + '=' .repeat(80));
    console.log('⚙️  OPTIONS:\n');
    console.log('1. Delete orphaned faces only (safe)');
    console.log('   Run: node manage-aws-faces.js --delete-orphaned\n');
    console.log('2. Delete ALL faces from AWS (nuclear option - for testing)');
    console.log('   Run: node manage-aws-faces.js --delete-all\n');
    console.log('3. List all face IDs');
    console.log('   Run: node manage-aws-faces.js --list-all\n');
    
    // 6. Execute based on command line args
    if (process.argv.includes('--delete-orphaned') && orphanedFaces.length > 0) {
      console.log('🗑️  Deleting orphaned faces...\n');
      
      // AWS allows max 4096 faces per delete request
      const chunks = [];
      for (let i = 0; i < orphanedFaces.length; i += 4000) {
        chunks.push(orphanedFaces.slice(i, i + 4000));
      }
      
      for (const chunk of chunks) {
        const deleteCommand = new DeleteFacesCommand({
          CollectionId: COLLECTION_ID,
          FaceIds: chunk
        });
        
        const result = await rekognition.send(deleteCommand);
        console.log(`✅ Deleted ${result.DeletedFaces.length} faces`);
        
        if (result.UnsuccessfulFaceDeletions && result.UnsuccessfulFaceDeletions.length > 0) {
          console.log(`⚠️  Failed to delete ${result.UnsuccessfulFaceDeletions.length} faces`);
        }
      }
      
    } else if (process.argv.includes('--delete-all')) {
      console.log('⚠️  WARNING: This will delete ALL faces from AWS Rekognition!');
      console.log('This includes faces that exist in Firebase.');
      console.log('\nTo confirm, run with: --delete-all --confirm\n');
      
      if (process.argv.includes('--confirm')) {
        console.log('🗑️  Deleting ALL faces...\n');
        
        const allFaceIds = awsFaces.map(f => f.FaceId);
        
        // AWS allows max 4096 faces per delete request
        const chunks = [];
        for (let i = 0; i < allFaceIds.length; i += 4000) {
          chunks.push(allFaceIds.slice(i, i + 4000));
        }
        
        for (const chunk of chunks) {
          const deleteCommand = new DeleteFacesCommand({
            CollectionId: COLLECTION_ID,
            FaceIds: chunk
          });
          
          const result = await rekognition.send(deleteCommand);
          console.log(`✅ Deleted ${result.DeletedFaces.length} faces`);
        }
        
        console.log('\n✅ All faces deleted from AWS Rekognition');
        console.log('⚠️  Remember to also clear Firebase faces/groups if needed');
      }
      
    } else if (process.argv.includes('--list-all')) {
      console.log('\n📋 ALL FACE IDs IN AWS:\n');
      awsFaces.forEach((face, index) => {
        console.log(`${index + 1}. ${face.FaceId}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await admin.app().delete();
  }
}

// Run the tool
analyzeAndClean();