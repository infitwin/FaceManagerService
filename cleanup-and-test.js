/**
 * Clean up orphaned data and create test scenario
 */

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

async function cleanupAndTest() {
  console.log('🧹 Cleaning up orphaned data and creating test scenario\n');
  console.log('=' .repeat(80));
  
  try {
    // 1. Clean up orphaned face documents
    console.log('STEP 1: Cleaning orphaned face documents');
    console.log('-'.repeat(40));
    
    const facesRef = db.collection('users').doc(USER_ID).collection('faces');
    const facesSnapshot = await facesRef.get();
    
    console.log(`Found ${facesSnapshot.size} face documents`);
    
    // Clear the groupId from all faces since groups don't exist
    const batch = db.batch();
    let updated = 0;
    
    facesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.groupId) {
        batch.update(doc.ref, {
          groupId: admin.firestore.FieldValue.delete()
        });
        updated++;
      }
    });
    
    if (updated > 0) {
      await batch.commit();
      console.log(`✅ Cleared groupId from ${updated} face documents`);
    }
    
    // 2. Create test file entries to simulate uploaded photos
    console.log('\nSTEP 2: Creating test file entries');
    console.log('-'.repeat(40));
    
    // Group face documents by fileId
    const fileToFaces = {};
    facesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.fileId) {
        if (!fileToFaces[data.fileId]) {
          fileToFaces[data.fileId] = [];
        }
        fileToFaces[data.fileId].push({
          FaceId: doc.id,
          BoundingBox: data.boundingBox,
          Confidence: data.confidence || 99.99
        });
      }
    });
    
    console.log(`Found faces from ${Object.keys(fileToFaces).length} different files`);
    
    // Create file documents for testing
    const fileIds = Object.keys(fileToFaces).slice(0, 4); // Use first 4 files
    
    for (const fileId of fileIds) {
      const fileRef = db.collection('users').doc(USER_ID).collection('files').doc(fileId);
      
      await fileRef.set({
        fileId: fileId,
        extractedFaces: fileToFaces[fileId],
        uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
        downloadURL: `https://firebasestorage.googleapis.com/v0/b/infitwin.firebasestorage.app/o/users%2F${USER_ID}%2Ffiles%2F${fileId}?alt=media&token=test`,
        status: 'processed',
        faceCount: fileToFaces[fileId].length
      });
      
      console.log(`✅ Created file document: ${fileId} with ${fileToFaces[fileId].length} faces`);
    }
    
    // 3. Simulate processing faces through the API
    console.log('\nSTEP 3: Processing faces through Face Manager API');
    console.log('-'.repeat(40));
    
    const fetch = (await import('node-fetch')).default;
    
    for (const fileId of fileIds) {
      const faces = fileToFaces[fileId].map(f => ({
        faceId: f.FaceId,
        boundingBox: f.BoundingBox,
        confidence: f.Confidence,
        matchedFaceIds: [] // Let the service find matches via AWS
      }));
      
      console.log(`\nProcessing ${faces.length} faces from file ${fileId}...`);
      
      try {
        const response = await fetch('http://localhost:8082/api/process-faces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: USER_ID,
            fileId: fileId,
            faces: faces
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          console.log(`✅ Processed successfully - ${result.groups.length} groups`);
          result.groups.forEach(g => {
            console.log(`   Group ${g.groupId}: ${g.faceCount} faces`);
          });
        } else {
          console.log(`❌ Failed: ${result.message}`);
        }
      } catch (error) {
        console.error(`❌ API call failed: ${error.message}`);
        console.log('Make sure Face Manager Service is running on port 8082');
      }
    }
    
    // 4. Check final state
    console.log('\n' + '='.repeat(80));
    console.log('📊 FINAL STATE:\n');
    
    const finalGroups = await db.collection('users').doc(USER_ID)
                                .collection('faceGroups').get();
    
    console.log(`Total Groups: ${finalGroups.size}`);
    
    finalGroups.forEach(doc => {
      const data = doc.data();
      console.log(`\nGroup ${doc.id}:`);
      console.log(`  Faces: ${data.faceIds.length}`);
      console.log(`  Files: ${data.fileIds ? data.fileIds.join(', ') : 'none'}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await admin.app().delete();
  }
}

// Run the cleanup and test
cleanupAndTest();