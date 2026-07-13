const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanupCarlGroups() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';

  console.log('\n🔍 Step 1: Finding all Carl groups...\n');

  const groupsSnapshot = await db.collection('users').doc(userId)
    .collection('faceGroups')
    .get();

  const carlGroups = [];

  for (const doc of groupsSnapshot.docs) {
    const data = doc.data();
    const name = data.personName || data.groupName || '';

    if (name.toLowerCase().includes('carl')) {
      // Get valid faces (faces that actually have documents)
      const validFaces = [];
      const orphanedFaces = [];

      for (const faceId of (data.faceIds || [])) {
        const faceDoc = await db.collection('users').doc(userId)
          .collection('faces').doc(faceId).get();

        if (faceDoc.exists) {
          const faceData = faceDoc.data();
          validFaces.push({
            faceId,
            fileId: faceData.fileId,
            groupId: faceData.groupId
          });
        } else {
          orphanedFaces.push(faceId);
        }
      }

      carlGroups.push({
        groupId: doc.id,
        personName: data.personName,
        groupName: data.groupName,
        faceCount: data.faceCount,
        faceIds: data.faceIds || [],
        validFaces,
        orphanedFaces,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate()
      });
    }
  }

  console.log(`Found ${carlGroups.length} Carl groups\n`);

  // Display current state
  for (const group of carlGroups) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📦 ${group.personName || group.groupName}`);
    console.log(`   Group ID: ${group.groupId}`);
    console.log(`   Created: ${group.createdAt}`);
    console.log(`   Total faces in array: ${group.faceIds.length}`);
    console.log(`   Valid faces: ${group.validFaces.length}`);
    console.log(`   Orphaned faces: ${group.orphanedFaces.length}`);

    if (group.orphanedFaces.length > 0) {
      console.log(`   Orphans: ${group.orphanedFaces.map(id => id.substring(0, 16)).join(', ')}...`);
    }

    console.log();
  }

  console.log('\n🧹 Step 2: Cleanup Strategy\n');

  // Find the group with the most valid faces as the primary
  const sortedByValidFaces = [...carlGroups].sort((a, b) => b.validFaces.length - a.validFaces.length);
  const primaryGroup = sortedByValidFaces[0];

  console.log(`Primary Group (keeping): ${primaryGroup.groupId}`);
  console.log(`   Name: ${primaryGroup.personName || primaryGroup.groupName}`);
  console.log(`   Valid faces: ${primaryGroup.validFaces.length}`);
  console.log(`   Created: ${primaryGroup.createdAt}`);
  console.log();

  // Collect all unique valid faceIds across all Carl groups
  const allValidFaceIds = new Set();
  const allFileIds = new Set();

  for (const group of carlGroups) {
    for (const face of group.validFaces) {
      // Only include if the face document points to this group (not orphaned)
      if (face.groupId === group.groupId) {
        allValidFaceIds.add(face.faceId);
        allFileIds.add(face.fileId);
      }
    }
  }

  console.log(`\nTotal unique valid faces across all Carl groups: ${allValidFaceIds.size}`);
  console.log(`Total unique files: ${allFileIds.size}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔧 Step 3: Performing Cleanup\n');

  // Update primary group with clean data
  const primaryGroupRef = db.collection('users').doc(userId)
    .collection('faceGroups').doc(primaryGroup.groupId);

  const cleanFaceIds = Array.from(allValidFaceIds);
  const cleanFileIds = Array.from(allFileIds);

  console.log(`Updating primary group ${primaryGroup.groupId}...`);
  await primaryGroupRef.update({
    faceIds: cleanFaceIds,
    fileIds: cleanFileIds,
    faceCount: cleanFaceIds.length,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log(`✅ Updated with ${cleanFaceIds.length} valid faces\n`);

  // Update all face documents to point to primary group
  console.log('Updating face documents to point to primary group...');
  for (const faceId of cleanFaceIds) {
    const faceRef = db.collection('users').doc(userId)
      .collection('faces').doc(faceId);

    await faceRef.update({
      groupId: primaryGroup.groupId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  console.log(`✅ Updated ${cleanFaceIds.length} face documents\n`);

  // Delete secondary groups
  const secondaryGroups = carlGroups.filter(g => g.groupId !== primaryGroup.groupId);

  if (secondaryGroups.length > 0) {
    console.log(`Deleting ${secondaryGroups.length} secondary groups...`);
    for (const group of secondaryGroups) {
      console.log(`   Deleting group ${group.groupId} (${group.personName || group.groupName})`);
      await db.collection('users').doc(userId)
        .collection('faceGroups').doc(group.groupId).delete();
    }
    console.log(`✅ Deleted ${secondaryGroups.length} duplicate groups\n`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ CLEANUP COMPLETE!\n');
  console.log('Final state:');
  console.log(`   1 Carl group: ${primaryGroup.groupId}`);
  console.log(`   ${cleanFaceIds.length} valid faces`);
  console.log(`   ${cleanFileIds.length} unique photos`);
  console.log(`   All orphaned faces removed`);
  console.log(`   All face documents point to correct group`);
  console.log();
}

cleanupCarlGroups()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error during cleanup:', err);
    process.exit(1);
  });
