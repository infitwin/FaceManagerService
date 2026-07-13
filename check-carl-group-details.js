const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkCarlGroupDetails() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';

  // Get all groups and find Carl
  const groupsSnapshot = await db.collection('users').doc(userId)
    .collection('faceGroups')
    .get();

  console.log('\n🔍 Looking for Carl\'s groups...\n');

  groupsSnapshot.forEach(doc => {
    const data = doc.data();
    const name = data.personName || data.groupName || 'Unnamed';

    if (name.toLowerCase().includes('carl')) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📦 ${name}`);
      console.log(`   Group ID: ${doc.id}`);
      console.log(`   Face Count: ${data.faceCount}`);
      console.log(`   FaceIds Array Length: ${(data.faceIds || []).length}`);

      // Check for duplicate faceIds
      const faceIds = data.faceIds || [];
      const uniqueFaceIds = [...new Set(faceIds)];

      if (uniqueFaceIds.length < faceIds.length) {
        console.log(`   ⚠️  DUPLICATE FACE IDS DETECTED!`);
        console.log(`      Total: ${faceIds.length}`);
        console.log(`      Unique: ${uniqueFaceIds.length}`);
        console.log(`      Duplicates: ${faceIds.length - uniqueFaceIds.length}`);
      } else {
        console.log(`   ✅ No duplicate faceIds`);
      }

      console.log(`\n   Face IDs:`);
      faceIds.forEach((id, i) => {
        console.log(`      [${i}] ${id}`);
      });

      // Check fileIds if they exist
      if (data.fileIds && data.fileIds.length > 0) {
        console.log(`\n   File IDs (${data.fileIds.length}):`);
        const uniqueFileIds = [...new Set(data.fileIds)];

        if (uniqueFileIds.length < data.fileIds.length) {
          console.log(`   ⚠️  DUPLICATE FILE IDS!`);
          console.log(`      Total: ${data.fileIds.length}`);
          console.log(`      Unique: ${uniqueFileIds.length}`);
        }

        data.fileIds.forEach((id, i) => {
          console.log(`      [${i}] ${id}`);
        });
      }

      // Check photoAssociations if they exist
      if (data.photoAssociations && data.photoAssociations.length > 0) {
        console.log(`\n   Photo Associations (${data.photoAssociations.length}):`);
        data.photoAssociations.forEach((assoc, i) => {
          console.log(`      [${i}] fileId: ${assoc.fileId}, faceId: ${assoc.faceId}`);
        });

        // Check for duplicate associations
        const assocKeys = data.photoAssociations.map(a => `${a.fileId}_${a.faceId}`);
        const uniqueAssocs = [...new Set(assocKeys)];

        if (uniqueAssocs.length < assocKeys.length) {
          console.log(`   ⚠️  DUPLICATE PHOTO ASSOCIATIONS!`);
          console.log(`      Total: ${assocKeys.length}`);
          console.log(`      Unique: ${uniqueAssocs.length}`);
        }
      }

      console.log();
    }
  });
}

checkCarlGroupDetails()
  .then(() => process.exit(0))
  .catch(console.error);
