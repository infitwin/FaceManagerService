const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkCarl() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';

  const groupsSnapshot = await db.collection('users').doc(userId)
    .collection('faceGroups')
    .get();

  console.log(`\n🔍 Searching ${groupsSnapshot.size} groups for Carl...\n`);

  groupsSnapshot.forEach(doc => {
    const data = doc.data();
    const name = data.personName || data.groupName || 'Unnamed';

    if (name.toLowerCase().includes('carl')) {
      console.log(`📦 Found: ${name}`);
      console.log(`   Group ID: ${doc.id}`);
      console.log(`   Face Count: ${data.faceCount}`);
      const faceIds = data.faceIds || [];
      console.log(`   FaceIds Array Length: ${faceIds.length}`);
      console.log(`\n   FaceIds:`);
      faceIds.forEach((id, i) => {
        console.log(`      [${i}] ${id}`);
      });

      const unique = [...new Set(faceIds)];
      if (unique.length < faceIds.length) {
        console.log(`\n   ⚠️  DUPLICATES FOUND!`);
        console.log(`      Unique: ${unique.length}`);
        console.log(`      Total: ${faceIds.length}`);
        console.log(`      Duplicates: ${faceIds.length - unique.length}`);
      } else {
        console.log(`\n   ✅ No duplicates`);
      }
      console.log();
    }
  });
}

checkCarl()
  .then(() => process.exit(0))
  .catch(console.error);
