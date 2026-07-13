const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function cleanupJohnByHash() {
  const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';
  const groupId = 'group_1769116609563_32u26nc8a';

  console.log('\n🧹 Cleaning up John Tobey - removing duplicate photos by hash...\n');

  const groupRef = db.collection('users').doc(userId)
    .collection('faceGroups').doc(groupId);
  const groupDoc = await groupRef.get();
  const groupData = groupDoc.data();

  // Get all files with their hashes
  const fileData = [];
  for (const fileId of groupData.fileIds) {
    const fileDoc = await db.collection('users').doc(userId)
      .collection('files').doc(fileId).get();

    if (fileDoc.exists) {
      const data = fileDoc.data();
      fileData.push({
        fileId,
        fileName: data.fileName,
        hash: data.analysis?.metadata?.hash || null,
        uploadedAt: data.uploadedAt?.toDate()
      });
    }
  }

  console.log(`Total files: ${fileData.length}\n`);

  // Group by hash and keep oldest upload of each
  const hashMap = new Map();
  for (const file of fileData) {
    if (!file.hash) continue;

    if (!hashMap.has(file.hash)) {
      hashMap.set(file.hash, []);
    }
    hashMap.get(file.hash).push(file);
  }

  const filesToKeep = [];
  const filesToDelete = [];

  hashMap.forEach((files, hash) => {
    // Sort by upload time - keep oldest
    files.sort((a, b) => a.uploadedAt - b.uploadedAt);

    console.log(`Hash ${hash.substring(0, 16)}... (${files[0].fileName}):`);
    files.forEach((file, i) => {
      if (i === 0) {
        console.log(`   [KEEP] ${file.fileId} uploaded ${file.uploadedAt}`);
        filesToKeep.push(file.fileId);
      } else {
        console.log(`   [DELETE] ${file.fileId} uploaded ${file.uploadedAt} ⚠️ DUPLICATE`);
        filesToDelete.push(file);
      }
    });
    console.log();
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Files to keep: ${filesToKeep.length}`);
  console.log(`Files to delete: ${filesToDelete.length}\n`);

  if (filesToDelete.length === 0) {
    console.log('✅ No duplicate files to clean up');
    return;
  }

  // Get faces from files to delete
  const facesToDelete = [];
  for (const file of filesToDelete) {
    const facesSnapshot = await db.collection('users').doc(userId)
      .collection('faces')
      .where('fileId', '==', file.fileId)
      .get();

    facesSnapshot.forEach(doc => {
      facesToDelete.push(doc.id);
    });
  }

  console.log(`Found ${facesToDelete.length} faces to delete\n`);

  // Update group - remove duplicate file IDs and face IDs
  const updatedFileIds = groupData.fileIds.filter(id => !filesToDelete.map(f => f.fileId).includes(id));
  const updatedFaceIds = groupData.faceIds.filter(id => !facesToDelete.includes(id));

  console.log('Updating group...');
  await groupRef.update({
    fileIds: updatedFileIds,
    faceIds: updatedFaceIds,
    faceCount: updatedFaceIds.length,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log(`✅ Updated group: ${updatedFaceIds.length} faces, ${updatedFileIds.length} files\n`);

  // Delete face documents
  console.log('Deleting face documents...');
  for (const faceId of facesToDelete) {
    await db.collection('users').doc(userId)
      .collection('faces').doc(faceId).delete();
    console.log(`   Deleted face ${faceId.substring(0, 20)}...`);
  }
  console.log(`✅ Deleted ${facesToDelete.length} faces\n`);

  // Note: Not deleting file documents in case they're referenced elsewhere
  console.log('Note: File documents not deleted (may be referenced elsewhere)');
  console.log('      Delete manually from File Manager if needed\n');

  console.log('✅ CLEANUP COMPLETE!\n');
  console.log(`John Tobey group now has:`);
  console.log(`   ${updatedFaceIds.length} faces`);
  console.log(`   ${updatedFileIds.length} unique photos`);
  console.log();
}

cleanupJohnByHash()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
