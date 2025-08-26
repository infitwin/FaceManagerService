/**
 * Cleanup and Regroup Script
 * This script:
 * 1. Deletes all existing groups
 * 2. Deletes all face documents
 * 3. Re-processes all files to create proper groups
 */

const admin = require('firebase-admin');
const fs = require('fs');
const fetch = require('node-fetch');

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS || fs.readFileSync('/home/tim/credentials/firebase-credentials.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

// Configuration
const userId = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';
const API_BASE_URL = 'http://localhost:8082/api';

async function cleanupEverything() {
  console.log('\n🧹 COMPLETE CLEANUP STARTING...');
  
  // 1. Delete all groups
  console.log('\n📦 Deleting all face groups...');
  const groupsRef = db.collection('users').doc(userId).collection('faceGroups');
  const groupsSnapshot = await groupsRef.get();
  
  let deleteCount = 0;
  const batch1 = db.batch();
  groupsSnapshot.forEach(doc => {
    batch1.delete(doc.ref);
    deleteCount++;
  });
  
  if (deleteCount > 0) {
    await batch1.commit();
    console.log(`  ✅ Deleted ${deleteCount} groups`);
  } else {
    console.log('  No groups to delete');
  }
  
  // 2. Delete all face documents
  console.log('\n👤 Deleting all face documents...');
  const facesRef = db.collection('users').doc(userId).collection('faces');
  const facesSnapshot = await facesRef.get();
  
  deleteCount = 0;
  const batch2 = db.batch();
  facesSnapshot.forEach(doc => {
    batch2.delete(doc.ref);
    deleteCount++;
  });
  
  if (deleteCount > 0) {
    await batch2.commit();
    console.log(`  ✅ Deleted ${deleteCount} face documents`);
  } else {
    console.log('  No face documents to delete');
  }
  
  console.log('\n✅ Cleanup complete!');
}

async function getAllFilesWithFaces() {
  console.log('\n📁 Getting all files with faces...');
  
  const filesRef = db.collection('users').doc(userId).collection('files');
  const snapshot = await filesRef.get();
  
  const filesWithFaces = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.extractedFaces && data.extractedFaces.length > 0) {
      filesWithFaces.push({
        fileId: doc.id,
        faces: data.extractedFaces,
        fileName: data.fileName
      });
    }
  });
  
  console.log(`  Found ${filesWithFaces.length} files with ${filesWithFaces.reduce((sum, f) => sum + f.faces.length, 0)} total faces`);
  return filesWithFaces;
}

async function reprocessFile(fileId, faces) {
  console.log(`\n📤 Reprocessing file ${fileId} with ${faces.length} faces...`);
  
  // Remove any matchedFaceIds so AWS SearchFaces will be called
  const cleanFaces = faces.map(face => ({
    faceId: face.FaceId || face.faceId,
    boundingBox: face.BoundingBox || face.boundingBox,
    confidence: face.Confidence || face.confidence || 99.99
    // Don't include matchedFaceIds - let the service call AWS
  }));
  
  try {
    const response = await fetch(`${API_BASE_URL}/process-faces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        fileId,
        faces: cleanFaces
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`  ✅ Success! Created/updated ${result.groups.length} groups`);
      result.groups.forEach(group => {
        console.log(`    Group ${group.groupId.substring(0, 20)}...: ${group.faceIds?.length || 0} faces`);
      });
    } else {
      console.log(`  ❌ Failed:`, result.message);
    }
    
    return result;
  } catch (error) {
    console.error(`  ❌ Error processing file:`, error.message);
    return null;
  }
}

async function verifyResults() {
  console.log('\n🔍 VERIFYING FINAL RESULTS...');
  
  // Get all groups
  const groupsRef = db.collection('users').doc(userId).collection('faceGroups');
  const snapshot = await groupsRef.get();
  
  console.log(`\n📊 Final Statistics:`);
  console.log(`  Total groups: ${snapshot.size}`);
  
  let totalFaces = 0;
  const groupSizes = {};
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const faceCount = data.faceIds?.length || 0;
    totalFaces += faceCount;
    
    // Track distribution of group sizes
    const sizeKey = `${faceCount} face${faceCount !== 1 ? 's' : ''}`;
    groupSizes[sizeKey] = (groupSizes[sizeKey] || 0) + 1;
  });
  
  console.log(`  Total faces in groups: ${totalFaces}`);
  console.log(`\n  Group size distribution:`);
  Object.entries(groupSizes).sort((a, b) => {
    const aNum = parseInt(a[0]);
    const bNum = parseInt(b[0]);
    return bNum - aNum;
  }).forEach(([size, count]) => {
    console.log(`    ${size}: ${count} group${count !== 1 ? 's' : ''}`);
  });
  
  // Show sample groups
  console.log(`\n  Sample groups (first 3):`);
  let shown = 0;
  snapshot.forEach(doc => {
    if (shown < 3) {
      const data = doc.data();
      console.log(`    Group ${doc.id.substring(0, 20)}...:`);
      console.log(`      Faces: ${data.faceIds?.length || 0}`);
      console.log(`      Files: ${data.fileIds?.length || 0}`);
      console.log(`      Status: ${data.status}`);
      shown++;
    }
  });
  
  // Check for problems
  const singleFaceGroups = snapshot.docs.filter(doc => {
    const data = doc.data();
    return data.faceIds?.length === 1;
  });
  
  if (singleFaceGroups.length > 0) {
    console.log(`\n⚠️ WARNING: Found ${singleFaceGroups.length} single-face groups`);
    console.log('  These might be unique faces or there might be an issue with matching');
  } else {
    console.log('\n✅ No single-face groups found - all faces are properly grouped!');
  }
}

async function main() {
  try {
    console.log('🎯 FACE MANAGER CLEANUP AND REGROUP');
    console.log('=====================================');
    console.log('This will delete all groups and reprocess all faces');
    console.log('to ensure proper grouping with the fixed logic\n');
    
    // Step 1: Complete cleanup
    await cleanupEverything();
    
    // Step 2: Get all files with faces
    const files = await getAllFilesWithFaces();
    
    if (files.length === 0) {
      console.log('\n⚠️ No files with faces found!');
      process.exit(0);
    }
    
    // Step 3: Reprocess each file
    console.log('\n🔄 REPROCESSING ALL FILES...');
    
    for (const file of files) {
      await reprocessFile(file.fileId, file.faces);
      // Small delay between files
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Step 4: Verify results
    await verifyResults();
    
    console.log('\n🎉 REPROCESSING COMPLETE!');
    console.log('Check the web UI at http://localhost:8083/face-groups.html');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  }
}

// Check if service is running
fetch(`${API_BASE_URL.replace('/api', '/health')}`)
  .then(response => {
    if (response.ok) {
      console.log('✅ Face Manager Service is running');
      main();
    } else {
      throw new Error('Service returned non-OK status');
    }
  })
  .catch(error => {
    console.error('❌ Face Manager Service is not running!');
    console.error('Please start it with: npm start');
    process.exit(1);
  });