const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Compare Images</title>
        </head>
        <body>
            <canvas id="canvas1"></canvas>
            <canvas id="canvas2"></canvas>
            <div id="result"></div>
        </body>
        </html>
    `);
    
    const result = await page.evaluate(async () => {
        // These two files have nearly identical bounding boxes
        const file1 = 'file_1755659986536_HA8cvhthi5';
        const file2 = 'file_1755659989503_eavQhJ2RmP';
        
        // Get URLs from API
        const response = await fetch('http://localhost:8082/api/files-with-faces/zsvLTeIPJUYGnZHzWX7hVtLJlJX2');
        const data = await response.json();
        
        const url1 = data.files.find(f => f.fileId === file1)?.url;
        const url2 = data.files.find(f => f.fileId === file2)?.url;
        
        if (!url1 || !url2) {
            return { error: 'URLs not found' };
        }
        
        // Load both images
        const loadImage = (url) => new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
        
        try {
            const [img1, img2] = await Promise.all([loadImage(url1), loadImage(url2)]);
            
            // Compare image dimensions
            const sameDimensions = img1.width === img2.width && img1.height === img2.height;
            
            // Sample pixels to compare
            const canvas1 = document.getElementById('canvas1');
            const canvas2 = document.getElementById('canvas2');
            const ctx1 = canvas1.getContext('2d');
            const ctx2 = canvas2.getContext('2d');
            
            // Set canvas size to a small sample
            const sampleSize = 100;
            canvas1.width = canvas2.width = sampleSize;
            canvas1.height = canvas2.height = sampleSize;
            
            // Draw scaled images
            ctx1.drawImage(img1, 0, 0, sampleSize, sampleSize);
            ctx2.drawImage(img2, 0, 0, sampleSize, sampleSize);
            
            // Get pixel data
            const data1 = ctx1.getImageData(0, 0, sampleSize, sampleSize);
            const data2 = ctx2.getImageData(0, 0, sampleSize, sampleSize);
            
            // Compare pixels
            let differences = 0;
            for (let i = 0; i < data1.data.length; i += 4) {
                const r1 = data1.data[i];
                const g1 = data1.data[i + 1];
                const b1 = data1.data[i + 2];
                const r2 = data2.data[i];
                const g2 = data2.data[i + 1];
                const b2 = data2.data[i + 2];
                
                if (Math.abs(r1 - r2) > 10 || Math.abs(g1 - g2) > 10 || Math.abs(b1 - b2) > 10) {
                    differences++;
                }
            }
            
            const totalPixels = sampleSize * sampleSize;
            const similarity = ((totalPixels - differences) / totalPixels * 100).toFixed(2);
            
            return {
                file1: file1,
                file2: file2,
                img1Size: `${img1.width}x${img1.height}`,
                img2Size: `${img2.width}x${img2.height}`,
                sameDimensions: sameDimensions,
                pixelSimilarity: similarity + '%',
                likelySameImage: similarity > 95
            };
        } catch (error) {
            return { error: error.message };
        }
    });
    
    console.log('=== IMAGE COMPARISON ===\n');
    console.log(`File 1: ${result.file1}`);
    console.log(`File 2: ${result.file2}`);
    console.log(`Image 1 size: ${result.img1Size}`);
    console.log(`Image 2 size: ${result.img2Size}`);
    console.log(`Same dimensions: ${result.sameDimensions}`);
    console.log(`Pixel similarity: ${result.pixelSimilarity}`);
    console.log(`\nConclusion: ${result.likelySameImage ? '⚠️  THESE ARE LIKELY THE SAME IMAGE!' : 'These appear to be different images'}`);
    
    if (result.likelySameImage) {
        console.log('\nThis explains why the faces look identical - they are extracted from the same photo that was uploaded twice with different file IDs.');
    }
    
    await browser.close();
})();