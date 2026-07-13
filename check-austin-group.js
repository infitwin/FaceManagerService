const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

// Check if already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkAustinGroup() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';

  console.log('\n🔍 Finding Austin Tobey groups...\n');

  const groupsSnapshot = await db.collection('users').doc(userId)
    .collection('faceGroups')
    .get();

  const austinGroups = [];

  for (const doc of groupsSnapshot.docs) {
    const data = doc.data();
    const name = data.personName || data.groupName || '';

    if (name.toLowerCase().includes('austin')) {
      // Get valid faces
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
              groupId: faceData.groupId,
              createdAt: faceData.createdAt?.toDate() || faceData.addedAt?.toDate()
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

      austinGroups.push({
        groupId: doc.id,
        personName: data.personName,
        groupName: data.groupName,
        faceCount: data.faceCount,
        faceIds: data.faceIds || [],
        fileIds: data.fileIds || [],
        validFaces,
        orphanedFaces,
        mismatchedFaces,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate()
      });
    }
  }

  console.log(`Found ${austinGroups.length} Austin Tobey groups\n`);

  for (const group of austinGroups) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📦 ${group.personName || group.groupName}`);
    console.log(`   Group ID: ${group.groupId}`);
    console.log(`   Created: ${group.createdAt}`);
    console.log(`   faceCount field: ${group.faceCount}`);
    console.log(`   faceIds array length: ${group.faceIds.length}`);
    console.log(`   Valid faces: ${group.validFaces.length}`);
    console.log(`   Orphaned faces: ${group.orphanedFaces.length}`);
    console.log(`   Mismatched faces: ${group.mismatchedFaces.length}`);

    if (group.orphanedFaces.length > 0) {
      console.log(`\n   ❌ Orphans:`);
      group.orphanedFaces.forEach(id => {
        console.log(`      ${id.substring(0, 30)}...`);
      });
    }

    if (group.mismatchedFaces.length > 0) {
      console.log(`\n   ⚠️  Mismatched:`);
      group.mismatchedFaces.forEach(face => {
        console.log(`      ${face.faceId.substring(0, 20)}... → group ${face.actualGroupId}`);
      });
    }

    if (group.validFaces.length > 0) {
      console.log(`\n   ✅ Valid faces by file:`);

      // Group by fileId to find duplicates
      const fileCount = new Map();
      group.validFaces.forEach(face => {
        if (!fileCount.has(face.fileId)) {
          fileCount.set(face.fileId, []);
        }
        fileCount.get(face.fileId).push(face.faceId);
      });

      fileCount.forEach((faceIds, fileId) => {
        if (faceIds.length > 1) {
          console.log(`      ${fileId}: ${faceIds.length} faces ⚠️ DUPLICATE!`);
          faceIds.forEach(faceId => {
            console.log(`         - ${faceId.substring(0, 20)}...`);
          });
        } else {
          console.log(`      ${fileId}: 1 face`);
        }
      });
    }

    console.log();
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 SUMMARY:\n');

  const totalValid = austinGroups.reduce((sum, g) => sum + g.validFaces.length, 0);
  const totalOrphaned = austinGroups.reduce((sum, g) => sum + g.orphanedFaces.length, 0);
  const totalMismatched = austinGroups.reduce((sum, g) => sum + g.mismatchedFaces.length, 0);

  console.log(`   Total groups: ${austinGroups.length}`);
  console.log(`   Total valid faces: ${totalValid}`);
  console.log(`   Total orphaned: ${totalOrphaned}`);
  console.log(`   Total mismatched: ${totalMismatched}`);

  if (austinGroups.length > 1) {
    console.log(`\n   ⚠️  Multiple Austin groups - should consolidate!`);
  }

  console.log();
}

checkAustinGroup()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
