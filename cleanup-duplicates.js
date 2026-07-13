const admin = require('firebase-admin');
const serviceAccount = require('./firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanupDuplicates(userId) {
  console.log(`\n🧹 Cleaning up duplicate faceIds for user: ${userId}\n`);
  
  const groupsRef = db.collection('users').doc(userId).collection('faceGroups');
  const snapshot = await groupsRef.get();
  
  let totalGroups = 0;
  let groupsWithDuplicates = 0;
  let totalDuplicatesRemoved = 0;
  
  const batch = db.batch();
  let batchCount = 0;
  
  for (const doc of snapshot.docs) {
    totalGroups++;
    const data = doc.data();
    const groupName = data.personName || data.groupName || 'Unnamed';
    
    if (data.faceIds && Array.isArray(data.faceIds)) {
      const originalLength = data.faceIds.length;
      const uniqueFaceIds = [...new Set(data.faceIds)];
      const uniqueFileIds = [...new Set(data.fileIds || [])];
      
      if (uniqueFaceIds.length < originalLength) {
        const duplicatesFound = originalLength - uniqueFaceIds.length;
        groupsWithDuplicates++;
        totalDuplicatesRemoved += duplicatesFound;
        
        console.log(`📦 Group: ${groupName} (${doc.id})`);
        console.log(`   Before: ${originalLength} faceIds (${duplicatesFound} duplicates)`);
        console.log(`   After:  ${uniqueFaceIds.length} faceIds (deduplicated)`);
        
        batch.update(doc.ref, {
          faceIds: uniqueFaceIds,
          fileIds: uniqueFileIds,
          faceCount: uniqueFaceIds.length,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        batchCount++;
        
        // Firestore batch limit is 500 operations
        if (batchCount >= 500) {
          await batch.commit();
          console.log(`   ✅ Committed batch of ${batchCount} updates`);
          batchCount = 0;
        }
      }
    }
  }
  
  // Commit remaining updates
  if (batchCount > 0) {
    await batch.commit();
    console.log(`\n✅ Committed final batch of ${batchCount} updates`);
  }
  
  console.log(`\n📊 CLEANUP SUMMARY:`);
  console.log(`   Total groups scanned: ${totalGroups}`);
  console.log(`   Groups with duplicates: ${groupsWithDuplicates}`);
  console.log(`   Total duplicates removed: ${totalDuplicatesRemoved}`);
  
  if (groupsWithDuplicates === 0) {
    console.log(`\n✨ No duplicates found - all groups are clean!`);
  } else {
    console.log(`\n✨ Cleanup complete!`);
  }
}

// User: weezer@yev.com
const userId = 'ynF4iFeFkkd5VTROdlwye2dyfs13';

cleanupDuplicates(userId)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
