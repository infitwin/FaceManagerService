const fetch = require('node-fetch');

async function reprocessAll() {
    const userId = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';
    const apiBase = 'http://localhost:8082/api';
    
    console.log('=== REPROCESSING ALL FACE GROUPS ===\n');
    
    try {
        // Step 1: Reset all groups
        console.log('Step 1: Resetting all groups...');
        const resetResponse = await fetch(`${apiBase}/test/reset/${userId}`, {
            method: 'DELETE'
        });
        const resetResult = await resetResponse.json();
        console.log(`Reset: ${resetResult.success ? '✓' : '✗'} - ${resetResult.message}`);
        
        // Step 2: Get all files with faces from Firebase
        console.log('\nStep 2: Getting all files with faces...');
        const filesResponse = await fetch(`${apiBase}/files-with-faces/${userId}`);
        const filesData = await filesResponse.json();
        
        console.log(`Found ${filesData.files.length} files`);
        
        // Step 3: Process each file with its faces
        console.log('\nStep 3: Processing each file...\n');
        
        for (const file of filesData.files) {
            console.log(`Processing ${file.fileId} with ${file.faces.length} faces...`);
            
            // Prepare faces array with matches
            const faces = file.faces.map((face, index) => {
                const faceId = face.FaceId || face.faceId;
                const boundingBox = face.BoundingBox || face.boundingBox;
                
                // For now, create simple test matches 
                // In real scenario, these would come from AWS Rekognition
                const matches = [];
                
                return {
                    faceId: faceId,
                    boundingBox: boundingBox,
                    confidence: face.Confidence || 99.99,
                    matches: matches
                };
            });
            
            // Send faces to process endpoint
            const processResponse = await fetch(`${apiBase}/process-faces`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: userId,
                    fileId: file.fileId,
                    faces: faces
                })
            });
            
            const processResult = await processResponse.json();
            if (processResult.success) {
                console.log(`  ✓ Created/updated ${processResult.groups.length} groups`);
            } else {
                console.log(`  ✗ Failed: ${processResult.message}`);
            }
        }
        
        // Step 4: Get final results
        console.log('\n\nStep 4: Getting final results...');
        const finalGroupsResponse = await fetch(`${apiBase}/groups/${userId}`);
        const finalGroupsData = await finalGroupsResponse.json();
        
        if (finalGroupsData.success) {
            console.log(`\n=== FINAL RESULTS ===`);
            console.log(`Total groups: ${finalGroupsData.groups.length}`);
            
            finalGroupsData.groups.forEach((group, index) => {
                console.log(`\nGroup ${index + 1}:`);
                console.log(`  ${group.faceCount} faces`);
                console.log(`  Face IDs: ${group.faceIds.map(id => id.substring(0, 8) + '...').join(', ')}`);
                console.log(`  From files: ${[...new Set(group.fileIds)].join(', ')}`);
            });
        }
        
        console.log('\n✓ Reprocessing complete!');
        console.log('Refresh http://localhost:8083/face-groups-ui.html to see the groups');
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

reprocessAll();