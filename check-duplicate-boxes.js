const fs = require('fs');

// Load the face data
const data = JSON.parse(fs.readFileSync('public/face_data_sample.json', 'utf8'));

// Group faces by fileId and check for duplicate bounding boxes
const fileGroups = {};
Object.entries(data.faces).forEach(([faceId, faceData]) => {
    const fileId = faceData.fileId;
    if (!fileGroups[fileId]) {
        fileGroups[fileId] = [];
    }
    fileGroups[fileId].push({
        faceId: faceId,
        boundingBox: faceData.boundingBox
    });
});

console.log('=== CHECKING FOR DUPLICATE BOUNDING BOXES ===\n');

Object.entries(fileGroups).forEach(([fileId, faces]) => {
    console.log(`File: ${fileId}`);
    console.log(`  Total faces: ${faces.length}`);
    
    // Check for duplicate or very similar bounding boxes
    const duplicates = [];
    for (let i = 0; i < faces.length; i++) {
        for (let j = i + 1; j < faces.length; j++) {
            const box1 = faces[i].boundingBox;
            const box2 = faces[j].boundingBox;
            
            // Check if boxes are identical or very similar (within 0.001 tolerance)
            const tolerance = 0.001;
            const isIdentical = 
                Math.abs(box1.Left - box2.Left) < tolerance &&
                Math.abs(box1.Top - box2.Top) < tolerance &&
                Math.abs(box1.Width - box2.Width) < tolerance &&
                Math.abs(box1.Height - box2.Height) < tolerance;
            
            if (isIdentical) {
                duplicates.push({
                    face1: faces[i].faceId,
                    face2: faces[j].faceId,
                    box1: box1,
                    box2: box2
                });
            }
        }
    }
    
    if (duplicates.length > 0) {
        console.log('  ⚠️  DUPLICATE BOUNDING BOXES FOUND!');
        duplicates.forEach(dup => {
            console.log(`    ${dup.face1.substring(0, 10)}... and ${dup.face2.substring(0, 10)}...`);
            console.log(`      Box 1: L=${dup.box1.Left.toFixed(4)}, T=${dup.box1.Top.toFixed(4)}, W=${dup.box1.Width.toFixed(4)}, H=${dup.box1.Height.toFixed(4)}`);
            console.log(`      Box 2: L=${dup.box2.Left.toFixed(4)}, T=${dup.box2.Top.toFixed(4)}, W=${dup.box2.Width.toFixed(4)}, H=${dup.box2.Height.toFixed(4)}`);
        });
    } else {
        console.log('  ✓ No duplicate bounding boxes');
    }
    
    // Show all faces in this file
    console.log('  Face details:');
    faces.forEach(face => {
        console.log(`    ${face.faceId.substring(0, 20)}...`);
        console.log(`      L=${face.boundingBox.Left.toFixed(4)}, T=${face.boundingBox.Top.toFixed(4)}, W=${face.boundingBox.Width.toFixed(4)}, H=${face.boundingBox.Height.toFixed(4)}`);
    });
    
    console.log('');
});

// Check which faces are in which groups
console.log('=== CHECKING GROUP ASSIGNMENTS ===\n');

fetch('http://localhost:8082/api/groups/zsvLTeIPJUYGnZHzWX7hVtLJlJX2')
    .then(res => res.json())
    .then(groupData => {
        groupData.groups.forEach((group, index) => {
            console.log(`Group ${index + 1}: ${group.faceIds.length} faces`);
            
            // Check which file each face comes from
            const fileMap = {};
            group.faceIds.forEach(faceId => {
                const faceData = data.faces[faceId];
                if (faceData) {
                    const fileId = faceData.fileId;
                    if (!fileMap[fileId]) {
                        fileMap[fileId] = [];
                    }
                    fileMap[fileId].push(faceId.substring(0, 10));
                }
            });
            
            Object.entries(fileMap).forEach(([fileId, faceIds]) => {
                console.log(`  From ${fileId}: ${faceIds.join(', ')}`);
            });
            
            console.log('');
        });
    });