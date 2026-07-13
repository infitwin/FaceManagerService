const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkCarlFacesByFile() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';
  const carlGroupId = 'group_1768946644837_9nuiqg3d5'; // The 5-face group

  console.log('\n🔍 Checking Carl\'s 5 faces by source file...\n');

  // Get the group
  const groupDoc = await db.collection('users').doc(userId)
    .collection('faceGroups').doc(carlGroupId).get();

  const groupData = groupDoc.data();
  const faceIds = groupData.faceIds || [];

  console.log(`📦 Group: ${groupData.personName || groupData.groupName}`);
  console.log(`   ${faceIds.length} faces\n`);

  // Get face documents for each faceId
  for (let i = 0; i < faceIds.length; i++) {
    const faceId = faceIds[i];

    const faceDoc = await db.collection('users').doc(userId)
      .collection('faces').doc(faceId).get();

    if (faceDoc.exists) {
      const faceData = faceDoc.data();
      console.log(`Face ${i + 1}: ${faceId.substring(0, 16)}...`);
      console.log(`   From file: ${faceData.fileId}`);
      console.log(`   Confidence: ${faceData.confidence}`);

      // Get the file info
      const fileDoc = await db.collection('users').doc(userId)
        .collection('files').doc(faceData.fileId).get();

      if (fileDoc.exists) {
        const fileData = fileDoc.data();
        console.log(`   Filename: ${fileData.fileName}`);
        console.log(`   Uploaded: ${fileData.uploadedAt?.toDate()}`);
      }
      console.log();
    } else {
      console.log(`Face ${i + 1}: ${faceId} - NO FACE DOCUMENT FOUND`);
      console.log();
    }
  }

  // Summary: Check for duplicate photos
  const faceDocs = await Promise.all(
    faceIds.map(faceId =>
      db.collection('users').doc(userId).collection('faces').doc(faceId).get()
    )
  );

  const fileIds = faceDocs
    .filter(doc => doc.exists)
    .map(doc => doc.data().fileId);

  const uniqueFileIds = [...new Set(fileIds)];

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📊 SUMMARY:\n');
  console.log(`   Total faces: ${faceIds.length}`);
  console.log(`   Unique source photos: ${uniqueFileIds.length}`);

  if (uniqueFileIds.length < faceIds.length) {
    console.log(`\n   ⚠️  PROBLEM: ${faceIds.length - uniqueFileIds.length} faces are from duplicate photos!\n`);

    // Count faces per file
    const fileCount = new Map();
    fileIds.forEach(fileId => {
      fileCount.set(fileId, (fileCount.get(fileId) || 0) + 1);
    });

    console.log('   Faces per photo:');
    for (const [fileId, count] of fileCount.entries()) {
      if (count > 1) {
        console.log(`      ${fileId}: ${count} faces ⚠️`);
      } else {
        console.log(`      ${fileId}: ${count} face`);
      }
    }
  } else {
    console.log('\n   ✅ All faces are from different photos');
  }
}

checkCarlFacesByFile()
  .then(() => process.exit(0))
  .catch(console.error);
