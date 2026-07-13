const admin = require('firebase-admin');
const serviceAccount = require('/home/tim/current-projects/FaceManagerService/firebase-credentials.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkJohnCurrentFiles() {
  const groupDoc = await db.collection('users').doc('ynF4iFeFkkd5VTROdlwye2dyfs13')
    .collection('faceGroups').doc('group_1769116609563_32u26nc8a').get();

  const fileIds = groupDoc.data().fileIds || [];
  console.log('\n📦 John Tobey group currently has', fileIds.length, 'files\n');

  const files = [];
  for (const fileId of fileIds) {
    const fileDoc = await db.collection('users').doc('ynF4iFeFkkd5VTROdlwye2dyfs13')
      .collection('files').doc(fileId).get();

    if (fileDoc.exists) {
      const data = fileDoc.data();
      files.push({
        fileId,
        fileName: data.fileName,
        hash: data.analysis?.metadata?.hash || 'NO HASH',
        uploadedAt: data.uploadedAt?.toDate()
      });
    } else {
      files.push({
        fileId,
        fileName: 'FILE DELETED',
        hash: 'NO HASH',
        uploadedAt: null
      });
    }
  }

  console.log('Files in John\'s group:\n');
  files.forEach((f, i) => {
    console.log(`${i+1}. ${f.fileName}`);
    console.log(`   FileId: ${f.fileId}`);
    console.log(`   Hash: ${f.hash}`);
    console.log(`   Uploaded: ${f.uploadedAt}`);
    console.log();
  });

  // Check for duplicate hashes
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  const hashCounts = new Map();
  files.forEach(f => {
    if (f.hash !== 'NO HASH') {
      hashCounts.set(f.hash, (hashCounts.get(f.hash) || 0) + 1);
    }
  });

  let hasDuplicates = false;
  hashCounts.forEach((count, hash) => {
    if (count > 1) {
      console.log(`⚠️  DUPLICATE IMAGE: Hash ${hash.substring(0, 16)}... appears ${count} times`);
      files.filter(f => f.hash === hash).forEach(f => {
        console.log(`     - ${f.fileName} (${f.fileId})`);
      });
      console.log();
      hasDuplicates = true;
    }
  });

  if (!hasDuplicates) {
    console.log('✅ No duplicate images - all files are unique photos');
  }
  console.log();
}

checkJohnCurrentFiles()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
