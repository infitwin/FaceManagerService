const fetch = require('node-fetch');

async function checkUnassigned() {
    // Get all face data
    const response = await fetch('http://localhost:8082/api/files-with-faces/zsvLTeIPJUYGnZHzWX7hVtLJlJX2');
    const data = await response.json();
    
    // Get all groups
    const groupsResponse = await fetch('http://localhost:8082/api/groups/zsvLTeIPJUYGnZHzWX7hVtLJlJX2');
    const groupsData = await groupsResponse.json();
    
    // Collect all faces from files
    const allFaces = [];
    data.files.forEach(file => {
        file.faces.forEach(face => {
            const faceId = face.FaceId || face.faceId;
            allFaces.push({
                faceId: faceId,
                fileId: file.fileId,
                fileName: file.fileName
            });
        });
    });
    
    // Collect all assigned faces
    const assignedFaces = new Set();
    groupsData.groups.forEach(group => {
        group.faceIds.forEach(faceId => {
            assignedFaces.add(faceId);
        });
    });
    
    // Find unassigned faces
    const unassignedFaces = allFaces.filter(face => !assignedFaces.has(face.faceId));
    
    console.log('=== Face Analysis ===');
    console.log(`Total faces in files: ${allFaces.length}`);
    console.log(`Assigned faces: ${assignedFaces.size}`);
    console.log(`Unassigned faces: ${unassignedFaces.length}`);
    
    // Check for duplicates in all faces
    const faceCount = {};
    allFaces.forEach(face => {
        if (!faceCount[face.faceId]) {
            faceCount[face.faceId] = 0;
        }
        faceCount[face.faceId]++;
    });
    
    console.log('\n=== Duplicate Check in All Faces ===');
    Object.entries(faceCount).forEach(([faceId, count]) => {
        if (count > 1) {
            console.log(`DUPLICATE: Face ${faceId} appears ${count} times`);
        }
    });
    
    console.log('\n=== Unassigned Faces ===');
    unassignedFaces.forEach(face => {
        console.log(`Face: ${face.faceId.substring(0, 20)}... from ${face.fileName}`);
    });
}

checkUnassigned();