/**
 * Script to clean up groups with phantom faces
 * Phantom faces are face IDs that were added to groups but never actually processed
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('/home/tim/credentials/firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'infitwin'
});

const db = admin.firestore();
const USER_ID = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';

async function cleanupPhantomFaces() {
  console.log('🧹 Cleaning up phantom faces from groups\n');
  console.log('=' .repeat(80));
  
  try {
    // 1. Get all face documents to know which faces actually exist
    const facesSnapshot = await db
      .collection('users')
      .doc(USER_ID)
      .collection('faces')
      .get();
    
    const actualFaceIds = new Set();
    const faceToFile = {};
    
    facesSnapshot.forEach(doc => {
      actualFaceIds.add(doc.id);
      const data = doc.data();
      if (data.fileId) {
        faceToFile[doc.id] = data.fileId;
      }
    });
    
    console.log(`✅ Found ${actualFaceIds.size} actual faces in the faces collection\n`);
    
    // 2. Get all groups
    const groupsSnapshot = await db
      .collection('users')
      .doc(USER_ID)
      .collection('faceGroups')
      .get();
    
    console.log(`📊 Found ${groupsSnapshot.size} groups to check\n`);
    
    const groupsToUpdate = [];
    const groupsToDelete = [];
    let totalPhantomFaces = 0;
    
    // 3. Check each group for phantom faces
    for (const doc of groupsSnapshot.docs) {
      const data = doc.data();
      const groupId = doc.id;
      const originalFaceIds = data.faceIds || [];
      
      // Filter out phantom faces (faces not in the faces collection)
      const realFaceIds = originalFaceIds.filter(faceId => actualFaceIds.has(faceId));
      const phantomFaceIds = originalFaceIds.filter(faceId => !actualFaceIds.has(faceId));
      
      if (phantomFaceIds.length > 0) {
        console.log(`\nGroup ${groupId}:`);
        console.log(`  Original faces: ${originalFaceIds.length}`);
        console.log(`  Real faces: ${realFaceIds.length}`);
        console.log(`  Phantom faces: ${phantomFaceIds.length}`);
        console.log(`  Phantom IDs: ${phantomFaceIds.slice(0, 3).join(', ')}${phantomFaceIds.length > 3 ? '...' : ''}`);
        
        totalPhantomFaces += phantomFaceIds.length;
        
        if (realFaceIds.length === 0) {
          // Group has no real faces - delete it
          groupsToDelete.push(groupId);
          console.log(`  ⚠️  Will DELETE group (no real faces)`);
        } else {
          // Group has some real faces - update it
          groupsToUpdate.push({
            groupId,
            realFaceIds,
            fileIds: [...new Set(realFaceIds.map(fid => faceToFile[fid]).filter(Boolean))]
          });
          console.log(`  ✅ Will UPDATE group with ${realFaceIds.length} real faces`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY:\n');
    console.log(`Total phantom faces found: ${totalPhantomFaces}`);
    console.log(`Groups to update: ${groupsToUpdate.length}`);
    console.log(`Groups to delete: ${groupsToDelete.length}`);
    
    // 4. Ask for confirmation
    console.log('\n' + '='.repeat(80));
    console.log('⚠️  This will modify your Firebase data!');
    console.log('Groups will be updated/deleted as shown above.');
    console.log('\nTo proceed, run with --execute flag');
    
    if (process.argv.includes('--execute')) {
      console.log('\n🚀 Executing cleanup...\n');
      
      // Update groups
      for (const update of groupsToUpdate) {
        await db.collection('users').doc(USER_ID)
                .collection('faceGroups').doc(update.groupId)
                .update({
                  faceIds: update.realFaceIds,
                  fileIds: update.fileIds,
                  faceCount: update.realFaceIds.length,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
        console.log(`✅ Updated group ${update.groupId}`);
      }
      
      // Delete empty groups
      for (const groupId of groupsToDelete) {
        await db.collection('users').doc(USER_ID)
                .collection('faceGroups').doc(groupId)
                .delete();
        console.log(`🗑️  Deleted group ${groupId}`);
      }
      
      console.log('\n✅ Cleanup complete!');
    }
    
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await admin.app().delete();
  }
}

// Run the cleanup
cleanupPhantomFaces();