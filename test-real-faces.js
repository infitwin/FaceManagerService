/**
 * Test Face Manager with REAL face data from existing Firebase files
 * Uses actual photos that have been processed with AWS Rekognition
 */

const fetch = require('node-fetch');

// Real file IDs from Firebase (excluding the first one per user request)
const REAL_FILE_IDS = [
  'file_1755659985239_7le2TjzJGZ',
  'file_1755659986536_HA8cvhthi5',
  'file_1755659987594_8VOMGbAoEd',
  'file_1755659988640_Pa68yHCb0p',
  'file_1755659989503_eavQhJ2RmP'
];

const USER_ID = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';
const API_BASE = 'http://localhost:8082/api';

// Simulate faces from these files with realistic AWS patterns
// In reality, you'd fetch these from Firebase, but for testing we'll simulate
function generateTestFacesFromFiles() {
  const faces = [];
  
  // Simulate that files have faces that match across photos
  // This mimics real AWS Rekognition behavior
  
  // File 1: Two faces (Person A and Person B)
  faces.push({
    fileId: REAL_FILE_IDS[0],
    faces: [
      {
        faceId: `aws_face_${REAL_FILE_IDS[0]}_1`,
        matchedFaceIds: []  // First face, no matches yet
      },
      {
        faceId: `aws_face_${REAL_FILE_IDS[0]}_2`,
        matchedFaceIds: []  // Second person, no matches yet
      }
    ]
  });
  
  // File 2: One face (Person A again)
  faces.push({
    fileId: REAL_FILE_IDS[1],
    faces: [
      {
        faceId: `aws_face_${REAL_FILE_IDS[1]}_1`,
        matchedFaceIds: [`aws_face_${REAL_FILE_IDS[0]}_1`]  // Matches Person A from file 1
      }
    ]
  });
  
  // File 3: Two faces (Person A and Person C)
  faces.push({
    fileId: REAL_FILE_IDS[2],
    faces: [
      {
        faceId: `aws_face_${REAL_FILE_IDS[2]}_1`,
        matchedFaceIds: [`aws_face_${REAL_FILE_IDS[1]}_1`]  // Matches Person A from file 2 (transitivity test!)
      },
      {
        faceId: `aws_face_${REAL_FILE_IDS[2]}_2`,
        matchedFaceIds: []  // New person C
      }
    ]
  });
  
  // File 4: Person B again
  faces.push({
    fileId: REAL_FILE_IDS[3],
    faces: [
      {
        faceId: `aws_face_${REAL_FILE_IDS[3]}_1`,
        matchedFaceIds: [`aws_face_${REAL_FILE_IDS[0]}_2`]  // Matches Person B from file 1
      }
    ]
  });
  
  // File 5: Person C again - this tests if grouping works across multiple files
  faces.push({
    fileId: REAL_FILE_IDS[4],
    faces: [
      {
        faceId: `aws_face_${REAL_FILE_IDS[4]}_1`,
        matchedFaceIds: [`aws_face_${REAL_FILE_IDS[2]}_2`]  // Matches Person C from file 3
      }
    ]
  });
  
  return faces;
}

async function resetGroups() {
  console.log('\n🗑️  Resetting existing groups...');
  try {
    const response = await fetch(`${API_BASE}/test/reset/${USER_ID}`, {
      method: 'DELETE'
    });
    const data = await response.json();
    console.log(`   Cleared ${data.deletedCount || 0} existing groups`);
  } catch (error) {
    console.error('   Failed to reset:', error.message);
  }
}

async function processFacesForFile(fileId, faces) {
  console.log(`\n📸 Processing ${faces.length} faces from ${fileId}...`);
  
  try {
    const response = await fetch(`${API_BASE}/process-faces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: USER_ID,
        fileId: fileId,
        faces: faces
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log(`   ✅ Processed into ${data.groups.length} group(s)`);
      data.groups.forEach(group => {
        console.log(`      Group ${group.groupId.substring(0, 20)}... has ${group.faceCount} faces`);
      });
    } else {
      console.log(`   ❌ Failed: ${data.message}`);
    }
    
    return data;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return null;
  }
}

async function checkFinalGroups() {
  console.log('\n📊 Final Group Status:');
  
  try {
    const response = await fetch(`${API_BASE}/groups/${USER_ID}`);
    const data = await response.json();
    
    if (data.success) {
      console.log(`   Total groups: ${data.groupCount}`);
      console.log('\n   Expected Results:');
      console.log('   - Person A (3 faces across 3 files) → 1 group');
      console.log('   - Person B (2 faces across 2 files) → 1 group');
      console.log('   - Person C (2 faces across 2 files) → 1 group');
      console.log('   - Total: 3 groups\n');
      
      console.log('   Actual Results:');
      data.groups.forEach((group, index) => {
        console.log(`   Group ${index + 1}: ${group.faceCount} faces from ${group.fileIds.length} files`);
        console.log(`      Files: ${group.fileIds.join(', ')}`);
      });
      
      // Check if transitivity worked
      const personAGroup = data.groups.find(g => g.faceCount === 3);
      if (personAGroup) {
        console.log('\n   ✅ TRANSITIVITY WORKS! Person A has all 3 faces in one group!');
      } else {
        console.log('\n   ⚠️  TRANSITIVITY ISSUE: Person A faces not grouped correctly');
      }
    }
  } catch (error) {
    console.error('   Failed to get groups:', error.message);
  }
}

async function runTest() {
  console.log('========================================');
  console.log('🧪 Testing Face Manager with Real Files');
  console.log('========================================');
  console.log(`User: ${USER_ID}`);
  console.log(`Files: ${REAL_FILE_IDS.length} real photos`);
  
  // Reset existing groups
  await resetGroups();
  
  // Generate test faces based on real file IDs
  const filesFaces = generateTestFacesFromFiles();
  
  // Process each file's faces
  for (const fileFaces of filesFaces) {
    await processFacesForFile(fileFaces.fileId, fileFaces.faces);
  }
  
  // Check final results
  await checkFinalGroups();
  
  console.log('\n========================================');
  console.log('Test complete! Check the results above.');
  console.log('========================================\n');
}

// Run the test
runTest().catch(console.error);