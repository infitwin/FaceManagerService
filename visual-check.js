const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: false }); // Open visible browser
    const page = await browser.newPage();
    
    // Navigate to the face groups UI
    await page.goto('http://localhost:8083/face-groups-ui.html');
    
    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Take a screenshot
    await page.screenshot({ path: 'face-groups-current.png', fullPage: true });
    console.log('Screenshot saved as face-groups-current.png');
    
    // Analyze what's actually visible
    const analysis = await page.evaluate(() => {
        const results = {
            groups: [],
            imageComparison: []
        };
        
        // For each group, get the actual visual content
        const groups = document.querySelectorAll('.group-card');
        groups.forEach((group, groupIndex) => {
            const groupTitle = group.querySelector('.group-title')?.textContent || `Group ${groupIndex + 1}`;
            const faces = group.querySelectorAll('.face-thumbnail');
            
            const groupData = {
                title: groupTitle,
                faces: []
            };
            
            faces.forEach((face, faceIndex) => {
                const img = face.querySelector('img');
                const faceId = face.dataset.faceId;
                
                if (img) {
                    // Get a sample of the image data to compare
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = 10;
                    canvas.height = 10;
                    
                    // Draw a small sample to compare images
                    try {
                        ctx.drawImage(img, 0, 0, 10, 10);
                        const imageData = ctx.getImageData(0, 0, 10, 10);
                        // Get sum of pixel values as a fingerprint
                        let sum = 0;
                        for (let i = 0; i < imageData.data.length; i++) {
                            sum += imageData.data[i];
                        }
                        
                        groupData.faces.push({
                            faceId: faceId ? faceId.substring(0, 10) : 'unknown',
                            imageFingerprint: sum,
                            src: img.src.substring(0, 50)
                        });
                    } catch (e) {
                        groupData.faces.push({
                            faceId: faceId ? faceId.substring(0, 10) : 'unknown',
                            imageFingerprint: 'error',
                            src: img.src.substring(0, 50)
                        });
                    }
                }
            });
            
            // Check for duplicate images within the group
            const fingerprints = groupData.faces.map(f => f.imageFingerprint);
            const uniqueFingerprints = [...new Set(fingerprints)];
            
            groupData.hasDuplicateImages = fingerprints.length !== uniqueFingerprints.length;
            groupData.uniqueImageCount = uniqueFingerprints.size;
            groupData.totalFaces = groupData.faces.length;
            
            results.groups.push(groupData);
        });
        
        return results;
    });
    
    console.log('\n=== VISUAL ANALYSIS ===\n');
    
    analysis.groups.forEach(group => {
        console.log(`${group.title}:`);
        console.log(`  Total faces: ${group.totalFaces}`);
        console.log(`  Unique images: ${group.uniqueImageCount}`);
        
        if (group.hasDuplicateImages) {
            console.log(`  ⚠️  DUPLICATE IMAGES DETECTED!`);
            
            // Find which images are duplicates
            const fingerprintMap = {};
            group.faces.forEach(face => {
                if (!fingerprintMap[face.imageFingerprint]) {
                    fingerprintMap[face.imageFingerprint] = [];
                }
                fingerprintMap[face.imageFingerprint].push(face.faceId);
            });
            
            Object.entries(fingerprintMap).forEach(([fingerprint, faceIds]) => {
                if (faceIds.length > 1) {
                    console.log(`    Same image used for faces: ${faceIds.join(', ')}`);
                }
            });
        }
        
        console.log('');
    });
    
    // Keep browser open for manual inspection
    console.log('Browser window left open for manual inspection. Press Ctrl+C to close.');
    
    // Wait indefinitely
    await new Promise(() => {});
})();