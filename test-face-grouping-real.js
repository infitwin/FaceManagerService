/**
 * Test Face Manager with REAL face IDs from Firebase
 * This simulates the AWS Rekognition matching patterns
 */

const fetch = require('node-fetch');

const USER_ID = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';
const API_BASE = 'http://localhost:8082/api';

// Real face IDs from our Firebase data
const faces = {
  file1: {
    fileId: 'file_1755659985239_7le2TjzJGZ',
    faces: [
      { faceId: '124772bc-4cd4-45c0-bd73-8df39f4869fa', matchedFaceIds: [] },
      { faceId: '141ea1c0-d238-43ee-b634-334cec2941f9', matchedFaceIds: [] }
    ]
  },
  file2: {
    fileId: 'file_1755659986536_HA8cvhthi5',
    faces: [
      { faceId: '7792f10e-6ae7-4e66-80d3-fbdd14799fcf', matchedFaceIds: ['124772bc-4cd4-45c0-bd73-8df39f4869fa'] }, // Matches person from file1
      { faceId: '47184919-41ae-4f45-92c0-21fc80f20d69', matchedFaceIds: [] },
      { faceId: '0a691022-32ce-4bdd-a4d3-6e0fd7e10777', matchedFaceIds: [] },
      { faceId: '13f72f70-7bc3-4e7d-8792-7c374e1cdec9', matchedFaceIds: [] }
    ]
  },
  file3: {
    fileId: 'file_1755659987594_8VOMGbAoEd',
    faces: [
      { faceId: 'a586c272-944c-48da-913f-fe848d2b9db5', matchedFaceIds: ['7792f10e-6ae7-4e66-80d3-fbdd14799fcf'] } // Matches person from file2 (transitivity test!)
    ]
  },
  file4: {
    fileId: 'file_1755659988640_Pa68yHCb0p',
    faces: [
      { faceId: '06798a08-0d51-4464-bbbf-b8dd7ad45da8', matchedFaceIds: [] },
      { faceId: '3af90906-7992-4176-aac5-e02525c9d386', matchedFaceIds: ['141ea1c0-d238-43ee-b634-334cec2941f9'] } // Matches second person from file1
    ]
  },
  file5: {
    fileId: 'file_1755659989503_eavQhJ2RmP',
    faces: [
      { faceId: '2cd68f15-929b-47f2-a0e3-05954a1a462e', matchedFaceIds: ['a586c272-944c-48da-913f-fe848d2b9db5'] }, // Another transitivity test
      { faceId: '6151fb75-5c78-4c8a-ba6b-7f0c982e9f35', matchedFaceIds: ['47184919-41ae-4f45-92c0-21fc80f20d69'] }, // Matches person from file2
      { faceId: 'c7648e0b-7bd9-4d54-bd7e-c52d7ae8d56b', matchedFaceIds: ['0a691022-32ce-4bdd-a4d3-6e0fd7e10777'] }, // Matches person from file2
      { faceId: '4aa7751b-c90c-4a41-aef6-074db274d959', matchedFaceIds: ['13f72f70-7bc3-4e7d-8792-7c374e1cdec9'] } // Matches person from file2
    ]
  }
};

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
  console.log(`\n📸 Processing ${faces.length} faces from ${fileId.substring(0, 20)}...`);
  
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
      console.log('\n   Expected Results with transitivity:');
      console.log('   - Person A (files 1,2,3,5): 4 faces → 1 group');
      console.log('   - Person B (files 1,4): 2 faces → 1 group');
      console.log('   - Person C (file 2): 1 face → 1 group');
      console.log('   - Person D (file 2): 1 face → 1 group');
      console.log('   - Person E (file 2): 1 face → 1 group');
      console.log('   - Person F (file 4): 1 face → 1 group');
      console.log('   - Person G (file 2,5): 2 faces → 1 group');
      console.log('   - Person H (file 2,5): 2 faces → 1 group');
      console.log('   - Person I (file 2,5): 2 faces → 1 group');
      console.log('   - Total: Approx 6-9 groups\n');
      
      console.log('   Actual Results:');
      data.groups.forEach((group, index) => {
        console.log(`   Group ${index + 1}: ${group.faceCount} faces from ${group.fileIds.length} files`);
        console.log(`      Files: ${group.fileIds.join(', ')}`);
        console.log(`      Face IDs: ${group.faceIds.slice(0, 2).map(id => id.substring(0, 20)).join(', ')}${group.faceIds.length > 2 ? '...' : ''}`);
      });
      
      // Check if transitivity worked
      const largeGroups = data.groups.filter(g => g.faceCount >= 3);
      if (largeGroups.length > 0) {
        console.log('\n   ✅ TRANSITIVITY WORKS! Found groups with 3+ faces spanning multiple files!');
      } else {
        console.log('\n   ⚠️  TRANSITIVITY ISSUE: No large groups found');
      }
    }
  } catch (error) {
    console.error('   Failed to get groups:', error.message);
  }
}

async function runTest() {
  console.log('================================================');
  console.log('🧪 Testing Face Manager with Real AWS Face IDs');
  console.log('================================================');
  console.log(`User: ${USER_ID}`);
  console.log(`Files: 5 real photos with 13 total faces`);
  
  // Reset existing groups
  await resetGroups();
  
  // Process each file's faces
  for (const [key, fileData] of Object.entries(faces)) {
    await processFacesForFile(fileData.fileId, fileData.faces);
  }
  
  // Check final results
  await checkFinalGroups();
  
  console.log('\n================================================');
  console.log('Test complete! Check the UI at http://localhost:8083/face-groups-ui.html');
  console.log('================================================\n');
}

// Run the test
runTest().catch(console.error);