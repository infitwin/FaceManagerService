const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkFaceInMultipleGroups() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';

  // Get all groups
  const groupsSnapshot = await db.collection('users').doc(userId)
    .collection('faceGroups')
    .get();

  console.log(`\n🔍 Checking ${groupsSnapshot.size} groups for duplicate face assignments...\n`);

  // Build map of faceId -> [groupIds]
  const faceToGroups = new Map();

  groupsSnapshot.forEach(doc => {
    const data = doc.data();
    const groupName = data.personName || data.groupName || 'Unnamed';
    const faceIds = data.faceIds || [];

    faceIds.forEach(faceId => {
      if (!faceToGroups.has(faceId)) {
        faceToGroups.set(faceId, []);
      }
      faceToGroups.get(faceId).push({
        groupId: doc.id,
        groupName: groupName
      });
    });
  });

  // Find faces in multiple groups
  let duplicateFaces = 0;
  console.log('⚠️  FACES IN MULTIPLE GROUPS:\n');

  faceToGroups.forEach((groups, faceId) => {
    if (groups.length > 1) {
      duplicateFaces++;
      console.log(`Face: ${faceId}`);
      console.log(`   Appears in ${groups.length} groups:`);
      groups.forEach(g => {
        console.log(`      - ${g.groupName} (${g.groupId})`);
      });
      console.log();
    }
  });

  if (duplicateFaces === 0) {
    console.log('✅ No faces found in multiple groups - all faces are unique to one group\n');
  } else {
    console.log(`📊 SUMMARY:`);
    console.log(`   Faces in multiple groups: ${duplicateFaces}`);
    console.log(`   Total unique faces: ${faceToGroups.size}\n`);
  }
}

checkFaceInMultipleGroups()
  .then(() => process.exit(0))
  .catch(console.error);
