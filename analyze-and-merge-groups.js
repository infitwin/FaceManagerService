/**
 * Script to analyze why groups aren't merging and force merge if needed
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('/home/tim/credentials/firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'infitwin'
});

const db = admin.firestore();
const USER_ID = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';

async function analyzeGroups() {
  console.log('🔍 Analyzing groups for potential merges\n');
  console.log('=' .repeat(80));
  
  try {
    // 1. Get all groups
    const groupsSnapshot = await db
      .collection('users')
      .doc(USER_ID)
      .collection('faceGroups')
      .orderBy('createdAt', 'desc')
      .get();
    
    console.log(`📊 Found ${groupsSnapshot.size} groups\n`);
    
    const groups = [];
    groupsSnapshot.forEach(doc => {
      const data = doc.data();
      groups.push({
        groupId: doc.id,
        faceIds: data.faceIds || [],
        fileIds: data.fileIds || [],
        createdAt: data.createdAt,
        faceCount: data.faceIds ? data.faceIds.length : 0
      });
    });
    
    // 2. Get all faces with their AWS match data
    console.log('Loading face match data...\n');
    const facesSnapshot = await db
      .collection('users')
      .doc(USER_ID)
      .collection('faces')
      .get();
    
    const faceToGroup = {};
    const faceToMatches = {};
    
    facesSnapshot.forEach(doc => {
      const data = doc.data();
      const faceId = doc.id;
      
      // Track which group this face is in
      if (data.groupId) {
        faceToGroup[faceId] = data.groupId;
      }
      
      // Track AWS matches for this face
      if (data.matchedFaces && Array.isArray(data.matchedFaces)) {
        faceToMatches[faceId] = data.matchedFaces;
      }
    });
    
    // 3. Check which groups should be merged based on AWS matches
    console.log('Analyzing which groups should be merged...\n');
    const mergeCandidates = [];
    
    for (const group of groups) {
      const groupFaces = group.faceIds;
      const connectedGroups = new Set();
      
      // For each face in this group, check its AWS matches
      for (const faceId of groupFaces) {
        const matches = faceToMatches[faceId] || [];
        
        // Check which groups contain the matched faces
        for (const matchedFaceId of matches) {
          const matchedGroup = faceToGroup[matchedFaceId];
          if (matchedGroup && matchedGroup !== group.groupId) {
            connectedGroups.add(matchedGroup);
          }
        }
      }
      
      if (connectedGroups.size > 0) {
        console.log(`Group ${group.groupId} (${group.faceCount} faces):`);
        console.log(`  Should be merged with: ${Array.from(connectedGroups).join(', ')}`);
        
        mergeCandidates.push({
          primaryGroup: group.groupId,
          connectedGroups: Array.from(connectedGroups)
        });
      }
    }
    
    // 4. Show images status
    console.log('\n' + '='.repeat(80));
    console.log('📸 IMAGE DISPLAY ANALYSIS:\n');
    
    // Check a few sample faces for their image URLs
    const sampleGroups = groups.slice(0, 3);
    for (const group of sampleGroups) {
      console.log(`\nGroup ${group.groupId}:`);
      console.log(`  File IDs: ${group.fileIds.length > 0 ? group.fileIds.join(', ') : 'NONE'}`);
      
      if (group.faceIds.length > 0) {
        const sampleFaceId = group.faceIds[0];
        const faceDoc = await db.collection('users').doc(USER_ID)
                               .collection('faces').doc(sampleFaceId).get();
        
        if (faceDoc.exists) {
          const faceData = faceDoc.data();
          console.log(`  Sample face ${sampleFaceId}:`);
          console.log(`    - Has fileId: ${faceData.fileId ? 'YES' : 'NO'}`);
          console.log(`    - Has boundingBox: ${faceData.boundingBox ? 'YES' : 'NO'}`);
          if (faceData.fileId) {
            console.log(`    - File ID: ${faceData.fileId}`);
          }
        }
      }
    }
    
    // 5. Check if files have URLs
    console.log('\n' + '='.repeat(80));
    console.log('📁 FILE URL CHECK:\n');
    
    const fileIds = new Set();
    groups.forEach(g => g.fileIds.forEach(fid => fileIds.add(fid)));
    
    for (const fileId of Array.from(fileIds).slice(0, 3)) {
      const fileDoc = await db.collection('users').doc(USER_ID)
                             .collection('files').doc(fileId).get();
      
      if (fileDoc.exists) {
        const fileData = fileDoc.data();
        console.log(`File ${fileId}:`);
        console.log(`  Has URL: ${fileData.url ? 'YES' : 'NO'}`);
        console.log(`  Has imageUrl: ${fileData.imageUrl ? 'YES' : 'NO'}`);
        console.log(`  Has downloadURL: ${fileData.downloadURL ? 'YES' : 'NO'}`);
        
        const url = fileData.url || fileData.imageUrl || fileData.downloadURL;
        if (url) {
          console.log(`  URL: ${url.substring(0, 80)}...`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('💡 RECOMMENDATIONS:\n');
    
    if (mergeCandidates.length > 0) {
      console.log(`1. ${mergeCandidates.length} groups should be merged based on AWS matches`);
    }
    
    console.log('2. To fix image display issues:');
    console.log('   - Ensure face documents have fileId field');
    console.log('   - Ensure face documents have boundingBox field');
    console.log('   - Ensure file documents have url field');
    
  } catch (error) {
    console.error('Error analyzing groups:', error);
  } finally {
    await admin.app().delete();
  }
}

// Run the analysis
analyzeGroups();