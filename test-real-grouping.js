/**
 * Test Real Photo Grouping
 * Process photos through the service to verify grouping works
 */

const fetch = require('node-fetch');

const API_BASE_URL = 'http://localhost:8082/api';
const userId = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';

// Simulate processing faces from multiple photos of the same person
// These would normally come from the upload service after AWS Rekognition
const testScenarios = [
  {
    name: "Photo 1 - First photo of Tom",
    fileId: "file_test_001",
    faces: [
      {
        faceId: "tom-face-001",
        boundingBox: { Left: 0.25, Top: 0.35, Width: 0.10, Height: 0.17 },
        confidence: 99.9
        // No matchedFaceIds - service will call AWS SearchFaces
      }
    ]
  },
  {
    name: "Photo 2 - Second photo of Tom",
    fileId: "file_test_002", 
    faces: [
      {
        faceId: "tom-face-002",
        boundingBox: { Left: 0.30, Top: 0.40, Width: 0.10, Height: 0.17 },
        confidence: 99.8
        // No matchedFaceIds - service will call AWS SearchFaces
      }
    ]
  },
  {
    name: "Photo 3 - Third photo of Tom",
    fileId: "file_test_003",
    faces: [
      {
        faceId: "tom-face-003",
        boundingBox: { Left: 0.35, Top: 0.45, Width: 0.10, Height: 0.17 },
        confidence: 99.7
        // No matchedFaceIds - service will call AWS SearchFaces
      }
    ]
  }
];

async function processScenario(scenario) {
  console.log(`\n📸 ${scenario.name}`);
  console.log(`  File: ${scenario.fileId}`);
  console.log(`  Faces: ${scenario.faces.length}`);
  
  try {
    const response = await fetch(`${API_BASE_URL}/process-faces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        fileId: scenario.fileId,
        faces: scenario.faces
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`  ✅ Processed successfully`);
      console.log(`  Groups affected: ${result.groups?.length || 0}`);
      
      if (result.groups && result.groups.length > 0) {
        result.groups.forEach(group => {
          console.log(`    - Group ${group.groupId?.substring(0, 20) || 'unknown'}... has ${group.faceIds?.length || 0} faces`);
        });
      }
    } else {
      console.log(`  ❌ Failed: ${result.message}`);
    }
    
    return result;
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return null;
  }
}

async function checkFinalGroups() {
  console.log('\n📊 CHECKING FINAL GROUPS...');
  
  try {
    const response = await fetch(`${API_BASE_URL}/groups/${userId}`);
    const data = await response.json();
    
    if (data.success) {
      console.log(`\n  Total groups: ${data.groupCount}`);
      
      if (data.groups && data.groups.length > 0) {
        data.groups.forEach((group, index) => {
          console.log(`\n  Group ${index + 1}:`);
          console.log(`    ID: ${group.groupId}`);
          console.log(`    Face count: ${group.faceIds?.length || 0}`);
          console.log(`    Face IDs: ${(group.faceIds || []).join(', ')}`);
          console.log(`    Status: ${group.status}`);
        });
      }
      
      // Check if test succeeded
      if (data.groupCount === 1 && data.groups[0].faceIds?.length === 3) {
        console.log('\n✅ SUCCESS! All 3 faces are in the same group!');
        return true;
      } else if (data.groupCount === 0) {
        console.log('\n⚠️ No groups found - faces may not have AWS matches');
        console.log('This is expected if AWS collection is empty or faces are different people');
        return false;
      } else {
        console.log('\n⚠️ Multiple groups exist - faces may be different people');
        return false;
      }
    }
  } catch (error) {
    console.error('Failed to get groups:', error.message);
  }
  
  return false;
}

async function main() {
  console.log('🎯 TESTING REAL PHOTO GROUPING');
  console.log('================================');
  console.log('This simulates processing photos with the fixed grouping logic');
  
  // Check service health
  try {
    const healthResponse = await fetch('http://localhost:8082/health');
    const health = await healthResponse.json();
    console.log(`\n✅ Service status: ${health.status}`);
  } catch (error) {
    console.error('\n❌ Face Manager Service is not running!');
    console.error('Please start it with: npm start');
    process.exit(1);
  }
  
  // Process each scenario
  console.log('\n🔄 PROCESSING TEST PHOTOS...');
  
  for (const scenario of testScenarios) {
    await processScenario(scenario);
    // Wait a bit between photos to simulate real processing
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Check final results
  const success = await checkFinalGroups();
  
  if (success) {
    console.log('\n🎉 The grouping fix is working perfectly!');
    console.log('Photos of the same person are correctly grouped together.');
  } else {
    console.log('\n📝 Note: If faces didn\'t group, it could mean:');
    console.log('  1. AWS Rekognition doesn\'t see them as the same person');
    console.log('  2. The faces aren\'t in the AWS collection yet');
    console.log('  3. The similarity is below 85% threshold');
  }
  
  console.log('\n💡 Check the web UI at: http://localhost:8083/face-groups.html');
}

main().catch(console.error);