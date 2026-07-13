const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function findAllCarlGroups() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';

  console.log('\n🔍 Finding all Carl groups...\n');

  const groupsSnapshot = await db.collection('users').doc(userId)
    .collection('faceGroups')
    .get();

  const carlGroups = [];

  groupsSnapshot.forEach(doc => {
    const data = doc.data();
    const name = data.personName || data.groupName || '';

    if (name.toLowerCase().includes('carl')) {
      carlGroups.push({
        groupId: doc.id,
        personName: data.personName,
        groupName: data.groupName,
        faceCount: data.faceCount,
        faceIds: data.faceIds || [],
        fileIds: data.fileIds || [],
        interviewId: data.interviewId || 'NONE',
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate()
      });
    }
  });

  console.log(`Found ${carlGroups.length} Carl groups:\n`);

  for (const group of carlGroups) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📦 Group: ${group.personName || group.groupName}`);
    console.log(`   Group ID: ${group.groupId}`);
    console.log(`   Interview: ${group.interviewId}`);
    console.log(`   Face Count: ${group.faceCount}`);
    console.log(`   FaceIds Array: ${group.faceIds.length} entries`);
    console.log(`   FileIds Array: ${group.fileIds.length} entries`);
    console.log(`   Created: ${group.createdAt}`);
    console.log(`   Updated: ${group.updatedAt}`);

    // Check each faceId to see if it exists and which group it points to
    console.log(`\n   Face Document Check:`);
    for (let i = 0; i < group.faceIds.length; i++) {
      const faceId = group.faceIds[i];
      const faceDoc = await db.collection('users').doc(userId)
        .collection('faces').doc(faceId).get();

      if (faceDoc.exists) {
        const faceData = faceDoc.data();
        console.log(`      [${i}] ${faceId.substring(0, 20)}... → EXISTS`);
        console.log(`          Points to group: ${faceData.groupId}`);
        console.log(`          From file: ${faceData.fileId}`);
        if (faceData.groupId !== group.groupId) {
          console.log(`          ⚠️  MISMATCH! Face doc points to DIFFERENT group!`);
        }
      } else {
        console.log(`      [${i}] ${faceId.substring(0, 20)}... → ❌ NO DOCUMENT (orphan)`);
      }
    }

    console.log();
  }
}

findAllCarlGroups()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
