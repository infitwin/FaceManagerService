const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Enable console logging from the page
    page.on('console', msg => {
        if (msg.type() === 'log' || msg.type() === 'warn' || msg.type() === 'error') {
            console.log(`[PAGE ${msg.type().toUpperCase()}]`, msg.text());
        }
    });
    
    // Navigate to the face groups UI
    await page.goto('http://localhost:8083/face-groups-ui.html');
    
    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Force reload to ensure latest JS is used
    await page.reload();
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get detailed information about each image
    const imageDetails = await page.evaluate(() => {
        const results = [];
        
        // Get all group cards
        const groupCards = document.querySelectorAll('.group-card');
        
        groupCards.forEach(card => {
            const groupTitle = card.querySelector('.group-title')?.textContent || 'Unknown';
            const faces = card.querySelectorAll('[data-face-id]');
            
            faces.forEach(face => {
                const faceId = face.dataset.faceId;
                const img = face.querySelector('img');
                
                if (img) {
                    results.push({
                        group: groupTitle,
                        faceId: faceId.substring(0, 20),
                        imgSrc: img.src,
                        imgAlt: img.alt,
                        dataUrl: img.src.startsWith('data:'),
                        naturalSize: `${img.naturalWidth}x${img.naturalHeight}`
                    });
                }
            });
        });
        
        return results;
    });
    
    // Group by group to see patterns
    const byGroup = {};
    imageDetails.forEach(detail => {
        if (!byGroup[detail.group]) {
            byGroup[detail.group] = [];
        }
        byGroup[detail.group].push(detail);
    });
    
    console.log('=== IMAGE SOURCE DETAILS ===\n');
    
    Object.entries(byGroup).forEach(([group, faces]) => {
        console.log(`${group}:`);
        
        // Get unique sources in this group
        const sources = new Set(faces.map(f => f.imgSrc));
        console.log(`  ${faces.length} faces, ${sources.size} unique images`);
        
        // Show each face and its source
        faces.forEach(face => {
            const srcPreview = face.dataUrl ? 
                'data:image (extracted face)' : 
                face.imgSrc.substring(0, 80) + '...';
            console.log(`    Face ${face.faceId}...`);
            console.log(`      Source: ${srcPreview}`);
            console.log(`      Size: ${face.naturalSize}`);
        });
        
        // Check if all faces in group use same source
        if (sources.size === 1 && faces.length > 1) {
            console.log(`  ⚠️  ALL FACES IN GROUP USE SAME IMAGE!`);
            const sharedSource = faces[0].imgSrc;
            if (!faces[0].dataUrl) {
                // It's a URL, not extracted data
                console.log(`  Shared URL: ${sharedSource.substring(0, 100)}...`);
            }
        }
        console.log('');
    });
    
    await browser.close();
})();