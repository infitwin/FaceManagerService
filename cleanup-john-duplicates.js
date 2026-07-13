const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

// Check if already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function cleanupJohnDuplicates() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';
  const groupId = 'group_1769116609563_32u26nc8a';

  console.log('\n🔍 Finding duplicate faces in John Tobey group...\n');

  const groupRef = db.collection('users').doc(userId).collection('faceGroups').doc(groupId);
  const groupDoc = await groupRef.get();
  const groupData = groupDoc.data();

  // Get all faces
  const faces = [];
  for (const faceId of groupData.faceIds) {
    const faceDoc = await db.collection('users').doc(userId)
      .collection('faces').doc(faceId).get();

    if (faceDoc.exists) {
      const faceData = faceDoc.data();
      faces.push({
        faceId,
        fileId: faceData.fileId,
        boundingBox: faceData.boundingBox,
        createdAt: faceData.createdAt?.toDate() || faceData.addedAt?.toDate()
      });
    }
  }

  console.log(`Total faces: ${faces.length}\n`);

  // Find duplicates by bounding box
  const duplicateSets = [];
  const processed = new Set();

  for (let i = 0; i < faces.length; i++) {
    if (processed.has(faces[i].faceId)) continue;

    const duplicates = [faces[i]];
    const bbox1 = faces[i].boundingBox;

    for (let j = i + 1; j < faces.length; j++) {
      if (processed.has(faces[j].faceId)) continue;

      const bbox2 = faces[j].boundingBox;

      // Check if bounding boxes are identical (same face, different upload)
      if (bbox1 && bbox2 &&
          Math.abs(bbox1.Height - bbox2.Height) < 0.0001 &&
          Math.abs(bbox1.Left - bbox2.Left) < 0.0001 &&
          Math.abs(bbox1.Top - bbox2.Top) < 0.0001 &&
          Math.abs(bbox1.Width - bbox2.Width) < 0.0001) {
        duplicates.push(faces[j]);
        processed.add(faces[j].faceId);
      }
    }

    if (duplicates.length > 1) {
      // Sort by creation date - keep oldest
      duplicates.sort((a, b) => a.createdAt - b.createdAt);
      duplicateSets.push(duplicates);
    }

    processed.add(faces[i].faceId);
  }

  console.log(`Found ${duplicateSets.length} duplicate sets:\n`);

  const facesToKeep = [];
  const facesToRemove = [];
  const filesToRemove = new Set();

  for (let setIndex = 0; setIndex < duplicateSets.length; setIndex++) {
    const set = duplicateSets[setIndex];
    console.log(`Duplicate Set ${setIndex + 1}:`);

    for (let i = 0; i < set.length; i++) {
      const face = set[i];
      const action = i === 0 ? 'KEEP' : 'REMOVE';
      console.log(`   [${action}] ${face.faceId.substring(0, 20)}... from ${face.fileId} (${face.createdAt})`);

      if (i === 0) {
        facesToKeep.push(face.faceId);
      } else {
        facesToRemove.push(face.faceId);
        filesToRemove.add(face.fileId);
      }
    }
    console.log();
  }

  // Add non-duplicate faces to keep list
  for (const face of faces) {
    if (!facesToRemove.includes(face.faceId) && !facesToKeep.includes(face.faceId)) {
      facesToKeep.push(face.faceId);
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Summary:`);
  console.log(`   Faces to keep: ${facesToKeep.length}`);
  console.log(`   Faces to remove: ${facesToRemove.length}`);
  console.log(`   Files to remove: ${filesToRemove.size}\n`);

  // Update group
  console.log('Updating John Tobey group...');

  const fileIds = facesToKeep.map(faceId => {
    const face = faces.find(f => f.faceId === faceId);
    return face ? face.fileId : null;
  }).filter(Boolean);

  await groupRef.update({
    faceIds: facesToKeep,
    fileIds: Array.from(new Set(fileIds)),
    faceCount: facesToKeep.length,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log(`✅ Updated group\n`);

  // Delete duplicate face documents
  if (facesToRemove.length > 0) {
    console.log('Deleting duplicate face documents...');
    for (const faceId of facesToRemove) {
      await db.collection('users').doc(userId)
        .collection('faces').doc(faceId).delete();
      console.log(`   Deleted face ${faceId.substring(0, 20)}...`);
    }
    console.log(`✅ Deleted ${facesToRemove.length} duplicate faces\n`);
  }

  console.log('✅ CLEANUP COMPLETE!\n');
  console.log('Final John Tobey group:');
  console.log(`   ${facesToKeep.length} unique faces`);
  console.log(`   ${new Set(fileIds).size} unique photos`);
  console.log();
}

cleanupJohnDuplicates()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
