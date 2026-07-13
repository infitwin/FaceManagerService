const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkCarlInterviewIds() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';

  const groupsSnapshot = await db.collection('users').doc(userId)
    .collection('faceGroups')
    .get();

  console.log('\n📋 All Carl Groups:\n');

  const carlGroups = [];

  groupsSnapshot.forEach(doc => {
    const data = doc.data();
    const name = data.personName || data.groupName || 'Unnamed';

    if (name.toLowerCase().includes('carl')) {
      carlGroups.push({
        groupId: doc.id,
        name: name,
        faceCount: data.faceCount,
        faceIds: data.faceIds || [],
        interviewId: data.interviewId || 'NONE (global)',
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate()
      });
    }
  });

  // Sort by creation date
  carlGroups.sort((a, b) => a.createdAt - b.createdAt);

  carlGroups.forEach((group, index) => {
    console.log(`${index + 1}. ${group.name}`);
    console.log(`   Group ID: ${group.groupId}`);
    console.log(`   Interview: ${group.interviewId}`);
    console.log(`   Faces: ${group.faceCount}`);
    console.log(`   Created: ${group.createdAt}`);
    console.log(`   Face IDs: ${group.faceIds.slice(0, 2).join(', ')}${group.faceIds.length > 2 ? '...' : ''}`);
    console.log();
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n🔍 ANALYSIS:\n');

  // Check if any faces appear in multiple groups
  const allFaceIds = carlGroups.flatMap(g => g.faceIds);
  const uniqueFaceIds = new Set(allFaceIds);

  if (uniqueFaceIds.size < allFaceIds.length) {
    console.log('⚠️  PROBLEM: Same faces appear in multiple Carl groups!\n');
    console.log(`   Total face entries: ${allFaceIds.length}`);
    console.log(`   Unique faces: ${uniqueFaceIds.size}`);
    console.log(`   Duplicates: ${allFaceIds.length - uniqueFaceIds.size}\n`);

    // Find which faces are duplicated
    const faceCount = new Map();
    allFaceIds.forEach(faceId => {
      faceCount.set(faceId, (faceCount.get(faceId) || 0) + 1);
    });

    console.log('   Duplicated face IDs:');
    faceCount.forEach((count, faceId) => {
      if (count > 1) {
        console.log(`      ${faceId} appears in ${count} groups`);
      }
    });
  } else {
    console.log('✅ No faces appear in multiple Carl groups\n');
    console.log('   Issue: Multiple separate Carl groups exist');
    console.log('   These should be MERGED into one group');
  }

  console.log('\n💡 RECOMMENDATION:\n');
  if (carlGroups.length > 1) {
    console.log(`   Merge all ${carlGroups.length} Carl groups into oldest group:`);
    console.log(`   Keep: ${carlGroups[0].groupId} (${carlGroups[0].name})`);
    console.log(`   Delete: ${carlGroups.slice(1).map(g => g.groupId.substring(0, 12) + '...').join(', ')}`);
  }
}

checkCarlInterviewIds()
  .then(() => process.exit(0))
  .catch(console.error);
