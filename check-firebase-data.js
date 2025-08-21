const fetch = require('node-fetch');

async function checkFirebaseData() {
    console.log('=== CHECKING ACTUAL FIREBASE DATA ===\n');
    
    // Get the real data from the API
    const response = await fetch('http://localhost:8082/api/files-with-faces/zsvLTeIPJUYGnZHzWX7hVtLJlJX2');
    const data = await response.json();
    
    console.log(`Total files in Firebase: ${data.files.length}`);
    console.log('File IDs:');
    data.files.forEach(file => {
        console.log(`  - ${file.fileId}`);
    });
    
    console.log('\n=== FACES PER FILE ===\n');
    
    // Check for duplicate faces across files
    const allFaces = [];
    const boundingBoxMap = {};
    
    data.files.forEach(file => {
        console.log(`File: ${file.fileId}`);
        console.log(`  Faces: ${file.faces.length}`);
        
        file.faces.forEach(face => {
            const faceId = face.FaceId || face.faceId;
            const bbox = face.BoundingBox || face.boundingBox;
            
            // Create a key from bounding box values
            const boxKey = `${(bbox.Left || 0).toFixed(4)}_${(bbox.Top || 0).toFixed(4)}_${(bbox.Width || 0).toFixed(4)}_${(bbox.Height || 0).toFixed(4)}`;
            
            if (!boundingBoxMap[boxKey]) {
                boundingBoxMap[boxKey] = [];
            }
            
            boundingBoxMap[boxKey].push({
                faceId: faceId,
                fileId: file.fileId,
                box: bbox
            });
            
            allFaces.push({
                faceId: faceId,
                fileId: file.fileId,
                box: bbox
            });
            
            console.log(`    Face ${faceId.substring(0, 10)}... Box: L=${(bbox.Left || 0).toFixed(4)}, T=${(bbox.Top || 0).toFixed(4)}`);
        });
    });
    
    console.log('\n=== CHECKING FOR DUPLICATE BOUNDING BOXES ===\n');
    
    let duplicatesFound = false;
    Object.entries(boundingBoxMap).forEach(([boxKey, faces]) => {
        if (faces.length > 1) {
            duplicatesFound = true;
            console.log(`⚠️  DUPLICATE BOX at ${boxKey}:`);
            faces.forEach(face => {
                console.log(`    Face ${face.faceId.substring(0, 20)}... from file ${face.fileId}`);
            });
        }
    });
    
    if (!duplicatesFound) {
        console.log('✓ No duplicate bounding boxes found');
    }
    
    console.log(`\nTotal unique faces: ${allFaces.length}`);
    console.log(`Total unique bounding boxes: ${Object.keys(boundingBoxMap).length}`);
    
    // Check what face_data_sample.json has
    console.log('\n=== COMPARING WITH face_data_sample.json ===\n');
    
    const fs = require('fs');
    const sampleData = JSON.parse(fs.readFileSync('public/face_data_sample.json', 'utf8'));
    
    console.log(`Faces in sample file: ${Object.keys(sampleData.faces).length}`);
    
    // Check if sample has faces not in Firebase
    Object.keys(sampleData.faces).forEach(faceId => {
        const inFirebase = allFaces.find(f => f.faceId === faceId);
        if (!inFirebase) {
            console.log(`  ⚠️  Face ${faceId.substring(0, 20)}... is in sample but NOT in Firebase!`);
        }
    });
    
    // Check if Firebase has faces not in sample
    allFaces.forEach(face => {
        if (!sampleData.faces[face.faceId]) {
            console.log(`  ⚠️  Face ${face.faceId.substring(0, 20)}... is in Firebase but NOT in sample!`);
        }
    });
}

checkFirebaseData();