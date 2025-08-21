const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Navigate to the face groups UI
    await page.goto('http://localhost:8083/face-groups-ui.html');
    
    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check all images
    const imageAnalysis = await page.evaluate(() => {
        const results = {
            totalImages: 0,
            uniqueSources: new Set(),
            duplicateImages: [],
            imagesByGroup: {},
            brokenImages: []
        };
        
        // Find all images in face thumbnails
        const allImages = document.querySelectorAll('.face-thumbnail img');
        results.totalImages = allImages.length;
        
        const sourceMap = {};
        
        allImages.forEach(img => {
            const src = img.src;
            const faceElement = img.closest('[data-face-id]');
            const faceId = faceElement ? faceElement.dataset.faceId : 'unknown';
            const groupCard = img.closest('.group-card');
            const groupTitle = groupCard ? groupCard.querySelector('.group-title')?.textContent : 'Unassigned';
            
            // Track unique sources
            results.uniqueSources.add(src);
            
            // Track which faces use which image source
            if (!sourceMap[src]) {
                sourceMap[src] = [];
            }
            sourceMap[src].push({
                faceId: faceId,
                group: groupTitle
            });
            
            // Track images by group
            if (!results.imagesByGroup[groupTitle]) {
                results.imagesByGroup[groupTitle] = [];
            }
            results.imagesByGroup[groupTitle].push({
                faceId: faceId,
                src: src.substring(0, 100) + '...',
                width: img.naturalWidth,
                height: img.naturalHeight
            });
            
            // Check for broken images
            if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                results.brokenImages.push({
                    faceId: faceId,
                    group: groupTitle,
                    src: src.substring(0, 100) + '...'
                });
            }
        });
        
        // Find duplicate image sources
        Object.entries(sourceMap).forEach(([src, faces]) => {
            if (faces.length > 1) {
                results.duplicateImages.push({
                    source: src.substring(0, 100) + '...',
                    count: faces.length,
                    faces: faces
                });
            }
        });
        
        results.uniqueSourceCount = results.uniqueSources.size;
        
        return results;
    });
    
    console.log('=== IMAGE ANALYSIS ===');
    console.log(`Total images: ${imageAnalysis.totalImages}`);
    console.log(`Unique image sources: ${imageAnalysis.uniqueSourceCount}`);
    
    if (imageAnalysis.duplicateImages.length > 0) {
        console.log('\n⚠️  DUPLICATE IMAGE SOURCES FOUND:');
        imageAnalysis.duplicateImages.forEach(dup => {
            console.log(`\nSame image used ${dup.count} times:`);
            console.log(`  Source: ${dup.source}`);
            console.log('  Used for faces:');
            dup.faces.forEach(face => {
                console.log(`    - Face ${face.faceId.substring(0, 20)}... in ${face.group}`);
            });
        });
    } else {
        console.log('\n✅ No duplicate image sources found');
    }
    
    if (imageAnalysis.brokenImages.length > 0) {
        console.log('\n⚠️  BROKEN IMAGES:');
        imageAnalysis.brokenImages.forEach(broken => {
            console.log(`  - Face ${broken.faceId.substring(0, 20)}... in ${broken.group}`);
        });
    }
    
    console.log('\n--- IMAGES BY GROUP ---');
    Object.entries(imageAnalysis.imagesByGroup).forEach(([group, images]) => {
        console.log(`\n${group}: ${images.length} images`);
        // Check if all images in group are the same
        const uniqueInGroup = new Set(images.map(img => img.src));
        if (uniqueInGroup.size !== images.length) {
            console.log(`  ⚠️  Group has ${images.length} faces but only ${uniqueInGroup.size} unique images!`);
        }
    });
    
    await browser.close();
})();