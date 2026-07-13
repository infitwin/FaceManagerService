const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkInterviewScope() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';

  // Get the two specific groups
  const carlGroup = await db.collection('users').doc(userId)
    .collection('faceGroups').doc('group_1768946644837_9nuiqg3d5').get();

  const unnamedGroup = await db.collection('users').doc(userId)
    .collection('faceGroups').doc('group_1769120690841_gawoea76e').get();

  console.log('\n📦 Carl Tobey Group:');
  console.log('   Interview ID:', carlGroup.data().interviewId || 'NONE (global)');

  console.log('\n📦 Unnamed Group:');
  console.log('   Interview ID:', unnamedGroup.data().interviewId || 'NONE (global)');

  console.log('\n🔍 Analysis:');
  const carlInterview = carlGroup.data().interviewId;
  const unnamedInterview = unnamedGroup.data().interviewId;

  if (!carlInterview && !unnamedInterview) {
    console.log('   Both groups are GLOBAL (no interview scoping)');
    console.log('   ❌ Bug: System should have found Carl group and added faces there');
  } else if (carlInterview !== unnamedInterview) {
    console.log('   Groups are in DIFFERENT interviews:');
    console.log(`      Carl: ${carlInterview}`);
    console.log(`      Unnamed: ${unnamedInterview}`);
    console.log('   ✅ This explains why a new group was created (interview isolation)');
  } else {
    console.log(`   Both groups are in SAME interview: ${carlInterview}`);
    console.log('   ❌ Bug: System should have found Carl group in same interview');
  }
}

checkInterviewScope()
  .then(() => process.exit(0))
  .catch(console.error);
