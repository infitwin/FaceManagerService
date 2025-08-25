/**
 * Test the fixed grouping logic
 * This script:
 * 1. Cleans up existing groups
 * 2. Processes test faces to verify they group correctly
 */

const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS || fs.readFileSync('/home/tim/credentials/firebase-credentials.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

// Test configuration
const userId = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';
const API_BASE_URL = 'http://localhost:8082/api';

// Test faces that should group together
const testFaces = [
  {
    faceId: "test-tom-1",
    boundingBox: { Left: 0.25, Top: 0.35, Width: 0.10, Height: 0.17 },
    confidence: 99.9,
    matchedFaceIds: ["test-tom-2", "test-tom-3", "test-tom-4"]
  },
  {
    faceId: "test-tom-2", 
    boundingBox: { Left: 0.30, Top: 0.40, Width: 0.10, Height: 0.17 },
    confidence: 99.8,
    matchedFaceIds: ["test-tom-1", "test-tom-3", "test-tom-4"]
  },
  {
    faceId: "test-tom-3",
    boundingBox: { Left: 0.35, Top: 0.45, Width: 0.10, Height: 0.17 },
    confidence: 99.7,
    matchedFaceIds: ["test-tom-1", "test-tom-2", "test-tom-4"]
  },
  {
    faceId: "test-tom-4",
    boundingBox: { Left: 0.40, Top: 0.50, Width: 0.10, Height: 0.17 },
    confidence: 99.6,
    matchedFaceIds: ["test-tom-1", "test-tom-2", "test-tom-3"]
  }
];

async function cleanup() {
  console.log('\n🧹 Cleaning up existing test data...');
  
  // Delete all groups
  const groupsRef = db.collection('users').doc(userId).collection('faceGroups');
  const groupsSnapshot = await groupsRef.get();
  
  const deletePromises = [];
  groupsSnapshot.forEach(doc => {
    deletePromises.push(doc.ref.delete());
  });
  
  await Promise.all(deletePromises);
  console.log(`  Deleted ${deletePromises.length} groups`);
  
  // Delete test face documents
  const facesRef = db.collection('users').doc(userId).collection('faces');
  for (const face of testFaces) {
    try {
      await facesRef.doc(face.faceId).delete();
    } catch (e) {
      // Ignore if doesn't exist
    }
  }
  console.log(`  Cleaned up test face documents`);
}

async function processFace(face, fileId) {
  console.log(`\n📤 Processing face ${face.faceId}...`);
  
  const response = await fetch(`${API_BASE_URL}/process-faces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      fileId,
      faces: [face]
    })
  });
  
  const result = await response.json();
  
  if (result.success) {
    console.log(`  ✅ Success! Created/updated ${result.groups.length} groups`);
    result.groups.forEach(group => {
      console.log(`    Group ${group.groupId}: ${group.faceIds?.length || 0} faces`);
    });
  } else {
    console.log(`  ❌ Failed:`, result.message);
  }
  
  return result;
}

async function verifyGrouping() {
  console.log('\n🔍 Verifying final grouping...');
  
  const groupsRef = db.collection('users').doc(userId).collection('faceGroups');
  const snapshot = await groupsRef.get();
  
  console.log(`\n📊 Final Results:`);
  console.log(`  Total groups: ${snapshot.size}`);
  
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`\n  Group ${doc.id}:`);
    console.log(`    Face count: ${data.faceIds?.length || 0}`);
    console.log(`    Face IDs: ${(data.faceIds || []).join(', ')}`);
  });
  
  // Check if all test faces ended up in the same group
  if (snapshot.size === 1) {
    const group = snapshot.docs[0].data();
    const allTestFacesInGroup = testFaces.every(face => 
      group.faceIds?.includes(face.faceId)
    );
    
    if (allTestFacesInGroup) {
      console.log('\n✅ SUCCESS! All test faces are in the same group!');
      return true;
    } else {
      console.log('\n⚠️ WARNING: Single group exists but not all test faces are in it');
      return false;
    }
  } else {
    console.log(`\n❌ FAILURE: Expected 1 group but found ${snapshot.size} groups`);
    return false;
  }
}

async function main() {
  try {
    console.log('🎯 Testing Fixed Grouping Logic');
    console.log('================================');
    
    // Step 1: Cleanup
    await cleanup();
    
    // Step 2: Process faces sequentially to simulate batch processing
    console.log('\n🔄 Processing faces sequentially...');
    
    for (let i = 0; i < testFaces.length; i++) {
      const fileId = `test-file-${i+1}`;
      await processFace(testFaces[i], fileId);
      
      // Small delay to ensure sequential processing
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Step 3: Verify results
    const success = await verifyGrouping();
    
    if (success) {
      console.log('\n🎉 The grouping fix is working correctly!');
    } else {
      console.log('\n⚠️ The grouping logic still needs work');
    }
    
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();