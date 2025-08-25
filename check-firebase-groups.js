/**
 * Script to query and analyze face groups in Firebase
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require('/home/tim/credentials/firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'infitwin'
});

const db = admin.firestore();
const USER_ID = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';

async function analyzeFaceGroups() {
  console.log('🔍 Analyzing Face Groups in Firebase\n');
  console.log('=' .repeat(80));
  
  try {
    // 1. Get all face groups
    const groupsSnapshot = await db
      .collection('users')
      .doc(USER_ID)
      .collection('faceGroups')
      .orderBy('updatedAt', 'desc')
      .get();
    
    console.log(`\n📊 Total Groups Found: ${groupsSnapshot.size}\n`);
    
    const groups = [];
    const allFaceIds = new Set();
    const fileIdToGroups = {};
    const faceIdToGroup = {};
    
    // Process each group
    groupsSnapshot.forEach(doc => {
      const data = doc.data();
      const groupInfo = {
        groupId: doc.id,
        faceCount: data.faceIds ? data.faceIds.length : 0,
        faceIds: data.faceIds || [],
        fileIds: data.fileIds || [],
        createdAt: data.createdAt ? data.createdAt.toDate() : null,
        updatedAt: data.updatedAt ? data.updatedAt.toDate() : null,
        mergedFrom: data.mergedFrom || [],
        status: data.status || 'unknown'
      };
      
      groups.push(groupInfo);
      
      // Track face IDs
      groupInfo.faceIds.forEach(faceId => {
        allFaceIds.add(faceId);
        if (faceIdToGroup[faceId]) {
          console.log(`⚠️  DUPLICATE: Face ${faceId} is in multiple groups!`);
          console.log(`   - Group 1: ${faceIdToGroup[faceId]}`);
          console.log(`   - Group 2: ${groupInfo.groupId}`);
        }
        faceIdToGroup[faceId] = groupInfo.groupId;
      });
      
      // Track file IDs
      groupInfo.fileIds.forEach(fileId => {
        if (!fileIdToGroups[fileId]) {
          fileIdToGroups[fileId] = [];
        }
        fileIdToGroups[fileId].push(groupInfo.groupId);
      });
    });
    
    // Sort groups by face count
    groups.sort((a, b) => b.faceCount - a.faceCount);
    
    // Display detailed group information
    console.log('📋 GROUP DETAILS:');
    console.log('-'.repeat(80));
    
    groups.forEach((group, index) => {
      console.log(`\nGroup ${index + 1}: ${group.groupId}`);
      console.log(`  📊 Faces: ${group.faceCount}`);
      console.log(`  📁 Files: ${group.fileIds.length} ${group.fileIds.length > 0 ? `[${group.fileIds.join(', ')}]` : '[NO FILE IDS]'}`);
      console.log(`  🕐 Created: ${group.createdAt ? group.createdAt.toISOString() : 'Unknown'}`);
      console.log(`  🔄 Updated: ${group.updatedAt ? group.updatedAt.toISOString() : 'Unknown'}`);
      console.log(`  📌 Status: ${group.status}`);
      
      if (group.mergedFrom.length > 0) {
        console.log(`  🔀 Merged from: ${group.mergedFrom.join(', ')}`);
      }
      
      if (group.faceCount === 0) {
        console.log(`  ⚠️  EMPTY GROUP - should be deleted`);
      }
      
      if (group.fileIds.length === 0 && group.faceCount > 0) {
        console.log(`  ⚠️  MISSING FILE IDS - needs repair`);
      }
      
      // Show first few face IDs
      if (group.faceIds.length > 0) {
        const preview = group.faceIds.slice(0, 3).join(', ');
        const more = group.faceIds.length > 3 ? ` ... +${group.faceIds.length - 3} more` : '';
        console.log(`  👤 Face IDs: ${preview}${more}`);
      }
    });
    
    // 2. Analyze problems
    console.log('\n' + '='.repeat(80));
    console.log('🔍 ANALYSIS:\n');
    
    const emptyGroups = groups.filter(g => g.faceCount === 0);
    const groupsWithoutFileIds = groups.filter(g => g.fileIds.length === 0 && g.faceCount > 0);
    const singleFaceGroups = groups.filter(g => g.faceCount === 1);
    
    console.log(`✅ Total unique faces: ${allFaceIds.size}`);
    console.log(`📊 Average faces per group: ${(allFaceIds.size / groups.length).toFixed(1)}`);
    console.log(`\n⚠️  Issues Found:`);
    console.log(`  - Empty groups: ${emptyGroups.length}`);
    console.log(`  - Groups missing file IDs: ${groupsWithoutFileIds.length}`);
    console.log(`  - Single-face groups: ${singleFaceGroups.length}`);
    
    // 3. Check for faces in the faces collection
    console.log('\n' + '='.repeat(80));
    console.log('🔍 CHECKING FACES COLLECTION:\n');
    
    const facesSnapshot = await db
      .collection('users')
      .doc(USER_ID)
      .collection('faces')
      .limit(10)
      .get();
    
    console.log(`Found ${facesSnapshot.size} faces in faces collection (limited to 10)`);
    
    const faceToFile = {};
    facesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.fileId) {
        faceToFile[doc.id] = data.fileId;
        console.log(`  Face ${doc.id.substring(0, 8)}... -> File: ${data.fileId}`);
      }
    });
    
    // 4. Check for recent files
    console.log('\n' + '='.repeat(80));
    console.log('🔍 RECENT FILES WITH FACES:\n');
    
    const filesSnapshot = await db
      .collection('users')
      .doc(USER_ID)
      .collection('files')
      .orderBy('uploadedAt', 'desc')
      .limit(5)
      .get();
    
    filesSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`\nFile: ${doc.id}`);
      
      // Handle different timestamp formats
      let uploadTime = 'Unknown';
      if (data.uploadedAt) {
        try {
          uploadTime = data.uploadedAt.toDate ? data.uploadedAt.toDate().toISOString() : data.uploadedAt;
        } catch (e) {
          uploadTime = data.uploadedAt;
        }
      }
      console.log(`  Uploaded: ${uploadTime}`);
      
      if (data.extractedFaces) {
        console.log(`  Faces: ${data.extractedFaces.length} embedded faces`);
      }
      
      if (data.faceGroupMapping) {
        const mappingCount = Object.keys(data.faceGroupMapping).length;
        console.log(`  Group Mapping: ${mappingCount} face->group mappings`);
      }
      
      // Check which groups contain faces from this file
      const groupsForFile = fileIdToGroups[doc.id] || [];
      if (groupsForFile.length > 0) {
        console.log(`  In Groups: ${groupsForFile.length} groups contain faces from this file`);
      } else {
        console.log(`  ⚠️  NOT IN ANY GROUPS`);
      }
    });
    
    // 5. Recommendations
    console.log('\n' + '='.repeat(80));
    console.log('💡 RECOMMENDATIONS:\n');
    
    if (emptyGroups.length > 0) {
      console.log(`1. Delete ${emptyGroups.length} empty groups:`);
      emptyGroups.forEach(g => console.log(`   - ${g.groupId}`));
    }
    
    if (groupsWithoutFileIds.length > 0) {
      console.log(`\n2. Repair ${groupsWithoutFileIds.length} groups missing file IDs:`);
      groupsWithoutFileIds.forEach(g => console.log(`   - ${g.groupId} (${g.faceCount} faces)`));
    }
    
    if (singleFaceGroups.length > 3) {
      console.log(`\n3. Consider merging ${singleFaceGroups.length} single-face groups`);
      console.log(`   These might be the same person that wasn't matched properly`);
    }
    
  } catch (error) {
    console.error('Error analyzing face groups:', error);
  } finally {
    // Clean up
    await admin.app().delete();
  }
}

// Run the analysis
analyzeFaceGroups();