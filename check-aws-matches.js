/**
 * Check if faces from same photo match in AWS
 */

const admin = require('firebase-admin');
const { RekognitionClient, SearchFacesCommand } = require('@aws-sdk/client-rekognition');
require('dotenv').config();

const serviceAccount = require('/home/tim/credentials/firebase-credentials.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'infitwin'
});

const db = admin.firestore();
const USER_ID = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function checkMatches() {
  console.log('🔍 Checking AWS face matching behavior\n');
  console.log('=' .repeat(80));
  
  try {
    // Get a file with multiple faces
    const filesSnapshot = await db.collection('users').doc(USER_ID)
      .collection('files').limit(5).get();
    
    for (const fileDoc of filesSnapshot.docs) {
      const data = fileDoc.data();
      
      if (data.extractedFaces && data.extractedFaces.length >= 2) {
        console.log(`\n📁 File: ${fileDoc.id}`);
        console.log(`   Faces: ${data.extractedFaces.length}`);
        
        const face1 = data.extractedFaces[0].FaceId || data.extractedFaces[0].faceId;
        const face2 = data.extractedFaces[1].FaceId || data.extractedFaces[1].faceId;
        
        console.log(`\n   Testing Face 1: ${face1.substring(0, 8)}...`);
        console.log(`   Testing Face 2: ${face2.substring(0, 8)}...`);
        
        // Search for matches for face1
        try {
          const command = new SearchFacesCommand({
            CollectionId: `face_coll_${USER_ID}`,
            FaceId: face1,
            FaceMatchThreshold: 85.0,
            MaxFaces: 20
          });
          
          const response = await rekognition.send(command);
          const matches = response.FaceMatches || [];
          
          console.log(`\n   AWS found ${matches.length} matches for Face 1`);
          
          if (matches.length > 0) {
            // Check if face2 is among the matches
            const matchesFace2 = matches.some(m => m.Face?.FaceId === face2);
            
            if (matchesFace2) {
              const match = matches.find(m => m.Face?.FaceId === face2);
              console.log(`   ✅ Face 1 MATCHES Face 2 (${match?.Similarity?.toFixed(1)}% similarity)`);
              console.log(`      -> These should be in the SAME group`);
            } else {
              console.log(`   ❌ Face 1 does NOT match Face 2`);
              console.log(`      -> These are DIFFERENT people`);
              
              // Show what face1 does match
              console.log(`\n   Face 1 matches these faces instead:`);
              matches.slice(0, 3).forEach(m => {
                console.log(`      - ${m.Face?.FaceId?.substring(0, 8)}... (${m.Similarity?.toFixed(1)}%)`);
              });
            }
          } else {
            console.log(`   No matches found for Face 1`);
          }
        } catch (error) {
          if (error.name === 'ResourceNotFoundException') {
            console.log(`   ❌ Face not found in AWS collection`);
          } else {
            throw error;
          }
        }
        
        // Only check first file with multiple faces
        break;
      }
    }
    
    // Check overall group status
    console.log('\n' + '='.repeat(80));
    console.log('📊 GROUP STATUS:\n');
    
    const groups = await db.collection('users').doc(USER_ID)
      .collection('faceGroups').get();
    
    console.log(`Total groups: ${groups.size}`);
    
    // Sample a few groups
    let shown = 0;
    groups.forEach(doc => {
      if (shown < 5) {
        const data = doc.data();
        console.log(`\nGroup ${doc.id}:`);
        console.log(`  Faces: ${data.faceIds.length}`);
        console.log(`  Face IDs: ${data.faceIds.join(', ')}`);
        shown++;
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await admin.app().delete();
  }
}

checkMatches();