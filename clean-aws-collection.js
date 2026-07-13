/**
 * Clean AWS Rekognition Collection
 * Deletes all faces from the collection to start fresh
 */

const { RekognitionClient, DeleteFacesCommand, ListFacesCommand } = require('@aws-sdk/client-rekognition');

const rekognition = new RekognitionClient({ region: process.env.AWS_REGION || 'us-east-1' });
const userId = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';
const collectionId = `face_coll_${userId}`;

async function deleteAllFaces() {
  console.log(`🧹 CLEANING AWS REKOGNITION COLLECTION: ${collectionId}\n`);
  
  try {
    // First, list all faces
    console.log('📋 Listing all faces in collection...');
    const listCommand = new ListFacesCommand({
      CollectionId: collectionId,
      MaxResults: 100
    });
    
    const listResponse = await rekognition.send(listCommand);
    const faces = listResponse.Faces || [];
    
    if (faces.length === 0) {
      console.log('✅ Collection is already empty!');
      return;
    }
    
    console.log(`Found ${faces.length} faces to delete\n`);
    
    // Extract face IDs
    const faceIds = faces.map(face => face.FaceId);
    
    // Delete in batches (AWS allows max 4096 faces per delete)
    const batchSize = 100;
    let deleted = 0;
    
    for (let i = 0; i < faceIds.length; i += batchSize) {
      const batch = faceIds.slice(i, i + batchSize);
      
      console.log(`🗑️  Deleting batch ${Math.floor(i/batchSize) + 1} (${batch.length} faces)...`);
      
      const deleteCommand = new DeleteFacesCommand({
        CollectionId: collectionId,
        FaceIds: batch
      });
      
      const deleteResponse = await rekognition.send(deleteCommand);
      deleted += (deleteResponse.DeletedFaces?.length || 0);
      
      console.log(`   ✓ Deleted ${deleteResponse.DeletedFaces?.length || 0} faces`);
    }
    
    console.log(`\n✅ CLEANUP COMPLETE!`);
    console.log(`   Total faces deleted: ${deleted}`);
    
    // Verify collection is empty
    console.log('\n🔍 Verifying collection is empty...');
    const verifyResponse = await rekognition.send(listCommand);
    const remainingFaces = verifyResponse.Faces?.length || 0;
    
    if (remainingFaces === 0) {
      console.log('✅ Collection is now empty and ready for fresh data!');
    } else {
      console.log(`⚠️  Warning: ${remainingFaces} faces still remain`);
    }
    
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.log('ℹ️  Collection does not exist - nothing to clean');
    } else {
      console.error('❌ Error cleaning collection:', error.message);
    }
  }
}

// Run the cleanup
deleteAllFaces().then(() => {
  console.log('\n🎯 Next steps:');
  console.log('1. Upload photos through the normal workflow');
  console.log('2. Faces will be indexed to AWS and processed');
  console.log('3. Groups should now merge correctly!');
  process.exit(0);
}).catch(error => {
  console.error('Failed:', error);
  process.exit(1);
});