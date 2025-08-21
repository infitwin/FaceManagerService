const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Navigate to the face groups UI
    await page.goto('http://localhost:8083/face-groups-ui.html');
    
    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Analyze the page
    const analysis = await page.evaluate(() => {
        const results = {
            groups: [],
            unassignedTab: null,
            duplicates: [],
            allFaceIds: []
        };
        
        // Check all tabs
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            console.log('Tab:', tab.textContent, 'Active:', tab.classList.contains('active'));
        });
        
        // Get all faces displayed
        const allFaces = document.querySelectorAll('[data-face-id]');
        const faceOccurrences = {};
        
        allFaces.forEach(face => {
            const faceId = face.dataset.faceId;
            results.allFaceIds.push(faceId);
            
            if (!faceOccurrences[faceId]) {
                faceOccurrences[faceId] = [];
            }
            
            // Find which section this face is in
            const groupCard = face.closest('.group-card');
            const unassignedSection = face.closest('#unassigned-section');
            
            let location = 'unknown';
            if (groupCard) {
                const groupTitle = groupCard.querySelector('.group-title')?.textContent || 'Unknown Group';
                location = groupTitle;
            } else if (unassignedSection) {
                location = 'Unassigned';
            }
            
            faceOccurrences[faceId].push(location);
        });
        
        // Find duplicates
        Object.entries(faceOccurrences).forEach(([faceId, locations]) => {
            if (locations.length > 1) {
                results.duplicates.push({
                    faceId: faceId,
                    count: locations.length,
                    locations: locations
                });
            }
        });
        
        // Get group info
        const groupCards = document.querySelectorAll('.group-card');
        groupCards.forEach(card => {
            const title = card.querySelector('.group-title')?.textContent;
            const faceCount = card.querySelectorAll('[data-face-id]').length;
            const faceIds = Array.from(card.querySelectorAll('[data-face-id]')).map(f => f.dataset.faceId);
            
            results.groups.push({
                title: title,
                faceCount: faceCount,
                uniqueFaceCount: new Set(faceIds).size,
                hasDuplicates: faceIds.length !== new Set(faceIds).size,
                faceIds: faceIds
            });
        });
        
        // Check unassigned section
        const unassignedSection = document.getElementById('unassigned-section');
        if (unassignedSection) {
            const unassignedFaces = unassignedSection.querySelectorAll('[data-face-id]');
            const unassignedIds = Array.from(unassignedFaces).map(f => f.dataset.faceId);
            results.unassignedTab = {
                count: unassignedFaces.length,
                uniqueCount: new Set(unassignedIds).size,
                hasDuplicates: unassignedIds.length !== new Set(unassignedIds).size,
                faceIds: unassignedIds
            };
        }
        
        return results;
    });
    
    console.log('=== PAGE ANALYSIS ===');
    console.log('\n--- GROUPS ---');
    analysis.groups.forEach(group => {
        console.log(`${group.title}: ${group.faceCount} faces (${group.uniqueFaceCount} unique)`);
        if (group.hasDuplicates) {
            console.log('  ⚠️  HAS DUPLICATES WITHIN GROUP!');
            // Find duplicates
            const counts = {};
            group.faceIds.forEach(id => {
                counts[id] = (counts[id] || 0) + 1;
            });
            Object.entries(counts).forEach(([id, count]) => {
                if (count > 1) {
                    console.log(`    - ${id}: appears ${count} times`);
                }
            });
        }
    });
    
    console.log('\n--- UNASSIGNED TAB ---');
    if (analysis.unassignedTab) {
        console.log(`Total: ${analysis.unassignedTab.count} faces (${analysis.unassignedTab.uniqueCount} unique)`);
        if (analysis.unassignedTab.hasDuplicates) {
            console.log('  ⚠️  HAS DUPLICATES IN UNASSIGNED!');
        }
    } else {
        console.log('No unassigned section found');
    }
    
    console.log('\n--- CROSS-SECTION DUPLICATES ---');
    if (analysis.duplicates.length > 0) {
        console.log(`Found ${analysis.duplicates.length} faces appearing multiple times:`);
        analysis.duplicates.forEach(dup => {
            console.log(`  Face ${dup.faceId.substring(0, 20)}... appears ${dup.count} times in: ${dup.locations.join(', ')}`);
        });
    } else {
        console.log('No cross-section duplicates found');
    }
    
    console.log('\n--- SUMMARY ---');
    console.log(`Total face elements on page: ${analysis.allFaceIds.length}`);
    console.log(`Unique face IDs: ${new Set(analysis.allFaceIds).size}`);
    
    // Click on unassigned tab to see that content
    await page.click('[data-tab="unassigned"]');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Re-analyze after clicking unassigned tab
    const unassignedAnalysis = await page.evaluate(() => {
        const unassignedGrid = document.getElementById('unassignedGrid');
        const faces = unassignedGrid ? unassignedGrid.querySelectorAll('[data-face-id]') : [];
        const ids = Array.from(faces).map(f => f.dataset.faceId);
        
        // Check for image extraction issues
        const images = unassignedGrid ? unassignedGrid.querySelectorAll('img') : [];
        const imageSources = Array.from(images).map(img => ({
            src: img.src.substring(0, 100),
            alt: img.alt,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight
        }));
        
        return {
            faceCount: faces.length,
            uniqueCount: new Set(ids).size,
            faceIds: ids,
            images: imageSources
        };
    });
    
    console.log('\n--- UNASSIGNED TAB (AFTER CLICK) ---');
    console.log(`Faces displayed: ${unassignedAnalysis.faceCount}`);
    console.log(`Unique faces: ${unassignedAnalysis.uniqueCount}`);
    if (unassignedAnalysis.faceCount !== unassignedAnalysis.uniqueCount) {
        console.log('⚠️  DUPLICATES DETECTED!');
        const counts = {};
        unassignedAnalysis.faceIds.forEach(id => {
            counts[id] = (counts[id] || 0) + 1;
        });
        Object.entries(counts).forEach(([id, count]) => {
            if (count > 1) {
                console.log(`  - ${id}: appears ${count} times`);
            }
        });
    }
    
    await browser.close();
})();