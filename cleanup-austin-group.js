const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

// Check if already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function cleanupAustinGroup() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';
  const groupId = 'group_1767319732320_3ztyf2t31';

  console.log('\n🧹 Cleaning up Austin Tobey group (orphaned - files deleted)...\n');

  const groupRef = db.collection('users').doc(userId)
    .collection('faceGroups').doc(groupId);

  const groupDoc = await groupRef.get();
  const groupData = groupDoc.data();

  console.log(`Austin Tobey group: ${groupId}`);
  console.log(`   ${groupData.faceIds.length} faces`);
  console.log(`   All source files have been deleted from File Manager`);

  // Delete all face documents
  console.log(`\nDeleting ${groupData.faceIds.length} face documents...`);
  for (const faceId of groupData.faceIds) {
    try {
      await db.collection('users').doc(userId)
        .collection('faces').doc(faceId).delete();
      console.log(`   Deleted face ${faceId.substring(0, 20)}...`);
    } catch (error) {
      console.log(`   Already deleted: ${faceId.substring(0, 20)}...`);
    }
  }

  // Delete the group
  console.log(`\nDeleting group ${groupId}...`);
  await groupRef.delete();

  console.log('\n✅ CLEANUP COMPLETE!');
  console.log('   Austin Tobey group deleted (orphaned due to deleted files)');
  console.log();
}

cleanupAustinGroup()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
