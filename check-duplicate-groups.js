const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkDuplicateGroups() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';

  // Get the two specific groups
  const carlGroup = await db.collection('users').doc(userId)
    .collection('faceGroups').doc('group_1768946644837_9nuiqg3d5').get();

  const unnamedGroup = await db.collection('users').doc(userId)
    .collection('faceGroups').doc('group_1769120690841_gawoea76e').get();

  console.log('\n📦 Carl Tobey Group:');
  console.log('   Created:', carlGroup.data().createdAt?.toDate());
  console.log('   Updated:', carlGroup.data().updatedAt?.toDate());
  console.log('   Face Count:', carlGroup.data().faceCount);
  console.log('   Face IDs:', carlGroup.data().faceIds);

  console.log('\n📦 Unnamed Group:');
  console.log('   Created:', unnamedGroup.data().createdAt?.toDate());
  console.log('   Updated:', unnamedGroup.data().updatedAt?.toDate());
  console.log('   Face Count:', unnamedGroup.data().faceCount);
  console.log('   Face IDs:', unnamedGroup.data().faceIds);

  console.log('\n🔍 Analysis:');
  const carlTime = carlGroup.data().createdAt?.toMillis();
  const unnamedTime = unnamedGroup.data().createdAt?.toMillis();

  if (carlTime < unnamedTime) {
    console.log('   Carl Tobey group was created FIRST');
    console.log('   Unnamed group was created LATER (should have been added to Carl instead)');
  } else {
    console.log('   Unnamed group was created FIRST');
    console.log('   Carl Tobey group was created LATER (should have been added to Unnamed instead)');
  }
}

checkDuplicateGroups()
  .then(() => process.exit(0))
  .catch(console.error);
