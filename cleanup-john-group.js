const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

// Check if already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function cleanupJohnGroup() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';
  const groupId = 'group_1769116609563_32u26nc8a';

  console.log('\n🧹 Cleaning up John Tobey group...\n');

  const groupRef = db.collection('users').doc(userId)
    .collection('faceGroups').doc(groupId);

  const groupDoc = await groupRef.get();
  const groupData = groupDoc.data();

  console.log(`Current state:`);
  console.log(`   Total faceIds: ${groupData.faceIds.length}`);

  // Check each face to find valid ones
  const validFaceIds = [];
  const orphanedFaceIds = [];
  const validFileIds = new Set();

  for (const faceId of groupData.faceIds) {
    const faceDoc = await db.collection('users').doc(userId)
      .collection('faces').doc(faceId).get();

    if (faceDoc.exists && faceDoc.data().groupId === groupId) {
      validFaceIds.push(faceId);
      validFileIds.add(faceDoc.data().fileId);
    } else {
      orphanedFaceIds.push(faceId);
      console.log(`   ❌ Orphaned: ${faceId.substring(0, 30)}...`);
    }
  }

  console.log(`\n   Valid faces: ${validFaceIds.length}`);
  console.log(`   Orphaned faces: ${orphanedFaceIds.length}`);

  // Update group with clean data
  console.log(`\nUpdating group with clean face list...`);
  await groupRef.update({
    faceIds: validFaceIds,
    fileIds: Array.from(validFileIds),
    faceCount: validFaceIds.length,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`✅ Updated John Tobey group`);
  console.log(`   Final face count: ${validFaceIds.length}`);
  console.log(`   Removed orphaned faces: ${orphanedFaceIds.length}`);
  console.log();
}

cleanupJohnGroup()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
