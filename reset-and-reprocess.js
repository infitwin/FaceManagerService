const fetch = require('node-fetch');

async function resetAndReprocess() {
    const userId = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';
    const apiBase = 'http://localhost:8082/api';
    
    console.log('=== RESETTING AND REPROCESSING FACE GROUPS ===\n');
    
    try {
        // Step 1: Reset all data (groups and matches)
        console.log('Step 1: Resetting all face groups and matches...');
        const resetResponse = await fetch(`${apiBase}/test/reset/${userId}`, {
            method: 'DELETE'
        });
        const resetResult = await resetResponse.json();
        console.log(`Reset complete: ${resetResult.success ? '✓' : '✗'}`);
        if (resetResult.message) {
            console.log(`  ${resetResult.message}`);
        }
        
        // Step 2: Get all files with faces
        console.log('\nStep 2: Getting all files with faces...');
        const filesResponse = await fetch(`${apiBase}/files-with-faces/${userId}`);
        const filesData = await filesResponse.json();
        
        console.log(`Found ${filesData.files.length} files with faces:`);
        let totalFaces = 0;
        filesData.files.forEach(file => {
            console.log(`  - ${file.fileId}: ${file.faces.length} faces`);
            totalFaces += file.faces.length;
        });
        console.log(`Total faces to process: ${totalFaces}`);
        
        // Step 3: Reprocess all files
        console.log('\nStep 3: Reprocessing all files...');
        for (const file of filesData.files) {
            console.log(`\nProcessing ${file.fileId}...`);
            
            const processResponse = await fetch(`${apiBase}/process-faces`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: userId,
                    fileId: file.fileId
                })
            });
            
            const processResult = await processResponse.json();
            if (processResult.success) {
                console.log(`  ✓ Processed successfully`);
                if (processResult.groups && processResult.groups.length > 0) {
                    console.log(`  Created/updated ${processResult.groups.length} groups`);
                }
            } else {
                console.log(`  ✗ Failed: ${processResult.error}`);
            }
        }
        
        // Step 4: Get final groups
        console.log('\n\nStep 4: Getting final groups...');
        const finalGroupsResponse = await fetch(`${apiBase}/groups/${userId}`);
        const finalGroupsData = await finalGroupsResponse.json();
        
        if (finalGroupsData.success) {
            console.log(`\n=== FINAL RESULTS ===`);
            console.log(`Total groups created: ${finalGroupsData.groups.length}`);
            console.log(`Total faces grouped: ${finalGroupsData.groups.reduce((sum, g) => sum + g.faceCount, 0)}`);
            
            finalGroupsData.groups.forEach((group, index) => {
                console.log(`\nGroup ${index + 1}:`);
                console.log(`  Face count: ${group.faceCount}`);
                console.log(`  Face IDs: ${group.faceIds.map(id => id.substring(0, 10) + '...').join(', ')}`);
                
                // Get unique file IDs
                const uniqueFileIds = [...new Set(group.fileIds)];
                console.log(`  From ${uniqueFileIds.length} file(s): ${uniqueFileIds.join(', ')}`);
            });
            
            // Check for any unassigned faces
            const groupedFaceCount = finalGroupsData.groups.reduce((sum, g) => sum + g.faceCount, 0);
            if (groupedFaceCount < totalFaces) {
                console.log(`\n⚠️  Warning: ${totalFaces - groupedFaceCount} faces were not grouped`);
            } else {
                console.log(`\n✓ All ${totalFaces} faces have been grouped`);
            }
        }
        
        console.log('\n✓ Reset and reprocessing complete!');
        console.log('\nRefresh the UI at http://localhost:8083/face-groups-ui.html to see the updated groups');
        
    } catch (error) {
        console.error('Error during reset and reprocess:', error);
    }
}

resetAndReprocess();