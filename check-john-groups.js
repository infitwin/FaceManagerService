const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

// Check if already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkJohnGroups() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';

  console.log('\n🔍 Finding all John Tobey groups...\n');

  const groupsSnapshot = await db.collection('users').doc(userId)
    .collection('faceGroups')
    .get();

  const johnGroups = [];

  for (const doc of groupsSnapshot.docs) {
    const data = doc.data();
    const name = data.personName || data.groupName || '';

    if (name.toLowerCase().includes('john')) {
      // Get valid faces (faces that actually have documents)
      const validFaces = [];
      const orphanedFaces = [];
      const mismatchedFaces = [];

      for (const faceId of (data.faceIds || [])) {
        const faceDoc = await db.collection('users').doc(userId)
          .collection('faces').doc(faceId).get();

        if (faceDoc.exists) {
          const faceData = faceDoc.data();
          if (faceData.groupId === doc.id) {
            validFaces.push({
              faceId,
              fileId: faceData.fileId,
              groupId: faceData.groupId
            });
          } else {
            mismatchedFaces.push({
              faceId,
              fileId: faceData.fileId,
              actualGroupId: faceData.groupId
            });
          }
        } else {
          orphanedFaces.push(faceId);
        }
      }

      johnGroups.push({
        groupId: doc.id,
        personName: data.personName,
        groupName: data.groupName,
        faceCount: data.faceCount,
        faceIds: data.faceIds || [],
        fileIds: data.fileIds || [],
        validFaces,
        orphanedFaces,
        mismatchedFaces,
        interviewId: data.interviewId || 'NONE',
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate()
      });
    }
  }

  console.log(`Found ${johnGroups.length} John Tobey groups\n`);

  // Display current state
  for (const group of johnGroups) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📦 ${group.personName || group.groupName}`);
    console.log(`   Group ID: ${group.groupId}`);
    console.log(`   Interview: ${group.interviewId}`);
    console.log(`   Created: ${group.createdAt}`);
    console.log(`   Total faces in array: ${group.faceIds.length}`);
    console.log(`   Valid faces: ${group.validFaces.length}`);
    console.log(`   Orphaned faces: ${group.orphanedFaces.length}`);
    console.log(`   Mismatched faces: ${group.mismatchedFaces.length}`);

    if (group.orphanedFaces.length > 0) {
      console.log(`\n   ❌ Orphans (no face document):`);
      group.orphanedFaces.forEach(id => {
        console.log(`      ${id.substring(0, 20)}...`);
      });
    }

    if (group.mismatchedFaces.length > 0) {
      console.log(`\n   ⚠️  Mismatched (face doc points to different group):`);
      group.mismatchedFaces.forEach(face => {
        console.log(`      ${face.faceId.substring(0, 20)}... → ${face.actualGroupId}`);
      });
    }

    if (group.validFaces.length > 0) {
      console.log(`\n   ✅ Valid faces (${group.validFaces.length}):`);
      const fileCount = new Map();
      group.validFaces.forEach(face => {
        fileCount.set(face.fileId, (fileCount.get(face.fileId) || 0) + 1);
      });

      fileCount.forEach((count, fileId) => {
        if (count > 1) {
          console.log(`      ${fileId}: ${count} faces ⚠️ DUPLICATE`);
        } else {
          console.log(`      ${fileId}: ${count} face`);
        }
      });
    }

    console.log();
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 SUMMARY:\n');

  // Collect all unique valid faceIds across all John groups
  const allValidFaceIds = new Set();
  const allFileIds = new Set();

  for (const group of johnGroups) {
    for (const face of group.validFaces) {
      allValidFaceIds.add(face.faceId);
      allFileIds.add(face.fileId);
    }
  }

  console.log(`Total John Tobey groups: ${johnGroups.length}`);
  console.log(`Total unique valid faces: ${allValidFaceIds.size}`);
  console.log(`Total unique photos: ${allFileIds.size}`);
  console.log(`Total orphaned faces: ${johnGroups.reduce((sum, g) => sum + g.orphanedFaces.length, 0)}`);
  console.log(`Total mismatched faces: ${johnGroups.reduce((sum, g) => sum + g.mismatchedFaces.length, 0)}`);

  if (johnGroups.length > 1) {
    console.log(`\n⚠️  PROBLEM: Multiple John Tobey groups exist - should be consolidated!`);
  }

  console.log();
}

checkJohnGroups()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
