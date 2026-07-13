const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkAllGroups() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';

  const groupsSnapshot = await db.collection('users').doc(userId)
    .collection('faceGroups')
    .get();

  console.log(`\n📦 Found ${groupsSnapshot.size} total groups\n`);

  groupsSnapshot.forEach(doc => {
    const data = doc.data();
    const name = data.personName || data.groupName || 'Unnamed';

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📦 ${name}`);
    console.log(`   Group ID: ${doc.id}`);
    console.log(`   Interview ID: ${data.interviewId || 'NONE (global)'}`);
    console.log(`   Face Count: ${data.faceCount}`);
    console.log(`   FaceIds Length: ${(data.faceIds || []).length}`);
    console.log(`   Created: ${data.createdAt?.toDate()}`);
    console.log(`   Updated: ${data.updatedAt?.toDate()}`);

    if (data.faceIds && data.faceIds.length > 0) {
      console.log(`   Face IDs:`);
      data.faceIds.forEach((id, i) => {
        console.log(`      [${i}] ${id}`);
      });
    }
  });
}

checkAllGroups()
  .then(() => process.exit(0))
  .catch(console.error);
