const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function analyzeDuplicateIssue() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';

  // Get the specific groups from the screenshot
  const carlGroup1 = await db.collection('users').doc(userId)
    .collection('faceGroups').doc('group_1768946644837_9nuiqg3d5').get();

  const unnamedGroup = await db.collection('users').doc(userId)
    .collection('faceGroups').doc('group_1769120690841_gawoea76e').get();

  const johnGroup1 = await db.collection('users').doc(userId)
    .collection('faceGroups').doc('group_1769120689278_lir0q3bec').get();

  const veronicalGroup = await db.collection('users').doc(userId)
    .collection('faceGroups').doc('group_1767723430558_n2hukwf4c').get();

  console.log('\n🔍 DUPLICATE GROUP ANALYSIS\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📦 Carl Tobey Group (5 faces):');
  console.log(`   Group ID: ${carlGroup1.id}`);
  console.log(`   Interview: ${carlGroup1.data().interviewId}`);
  console.log(`   Created: ${carlGroup1.data().createdAt?.toDate()}`);
  console.log(`   Updated: ${carlGroup1.data().updatedAt?.toDate()}`);
  console.log(`   Face IDs:`);
  carlGroup1.data().faceIds.forEach(id => console.log(`      - ${id}`));

  console.log('\n📦 "Unnamed" Group (2 faces):');
  console.log(`   Group ID: ${unnamedGroup.id}`);
  console.log(`   Interview: ${unnamedGroup.data().interviewId}`);
  console.log(`   Created: ${unnamedGroup.data().createdAt?.toDate()}`);
  console.log(`   Updated: ${unnamedGroup.data().updatedAt?.toDate()}`);
  console.log(`   Face IDs:`);
  unnamedGroup.data().faceIds.forEach(id => console.log(`      - ${id}`));

  console.log('\n⚠️  PROBLEM DETECTED:');

  const carlFaces = new Set(carlGroup1.data().faceIds);
  const unnamedFaces = unnamedGroup.data().faceIds;
  const duplicates = unnamedFaces.filter(id => carlFaces.has(id));

  if (duplicates.length > 0) {
    console.log(`   Unnamed group contains ${duplicates.length} faces that are ALREADY in Carl's group:`);
    duplicates.forEach(id => console.log(`      🔴 ${id}`));
    console.log('\n   This is why you see duplicate "New Person" groups in the UI!');
    console.log(`   The system created a new group instead of adding to existing Carl group.`);
  }

  console.log('\n📦 John Group (2 faces):');
  console.log(`   Group ID: ${johnGroup1.id}`);
  console.log(`   Interview: ${johnGroup1.data().interviewId}`);
  console.log(`   Face Count: ${johnGroup1.data().faceCount}`);

  console.log('\n📦 Veronika Tobey Group (9 faces):');
  console.log(`   Group ID: ${veronikalGroup.id}`);
  console.log(`   Interview: ${veronikalGroup.data().interviewId || 'NONE (global)'}`);
  console.log(`   Face Count: ${veronikalGroup.data().faceCount}`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n🔬 ROOT CAUSE:');
  console.log('   Despite the "global face groups" fix, the system is STILL');
  console.log('   creating duplicate groups for Carl\'s faces in a new interview.');
  console.log('   The face matching algorithm is not finding the existing Carl group.');
}

analyzeDuplicateIssue()
  .then(() => process.exit(0))
  .catch(console.error);
