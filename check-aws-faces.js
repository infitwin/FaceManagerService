/**
 * Check what faces are in AWS Rekognition
 */

const { RekognitionClient, ListFacesCommand } = require('@aws-sdk/client-rekognition');

const rekognition = new RekognitionClient({ region: process.env.AWS_REGION || 'us-east-1' });
const userId = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';

async function listAWSFaces() {
  console.log(`\n🔍 Checking AWS Rekognition Collection: face_coll_${userId}\n`);
  
  try {
    const command = new ListFacesCommand({
      CollectionId: `face_coll_${userId}`,
      MaxResults: 100
    });
    
    const response = await rekognition.send(command);
    
    console.log(`Total faces in AWS: ${response.Faces?.length || 0}\n`);
    
    if (response.Faces && response.Faces.length > 0) {
      console.log('Face IDs in AWS:');
      response.Faces.forEach((face, index) => {
        console.log(`  ${index + 1}. ${face.FaceId}`);
      });
    }
    
    return response.Faces || [];
  } catch (error) {
    console.error('Error listing faces:', error.message);
    return [];
  }
}

listAWSFaces().then(faces => {
  console.log(`\n📊 Summary: ${faces.length} faces in AWS Rekognition`);
  process.exit(0);
});