const fetch = require('node-fetch');

async function processSingleFile() {
    const userId = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';
    const fileId = 'file_1755659985239_7le2TjzJGZ';
    const apiBase = 'http://localhost:8082/api';
    
    console.log('Processing single file to debug the issue...\n');
    
    const response = await fetch(`${apiBase}/process-faces`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            userId: userId,
            fileId: fileId
        })
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers.raw());
    
    const text = await response.text();
    console.log('Response body:', text);
    
    try {
        const json = JSON.parse(text);
        console.log('Parsed response:', json);
    } catch (e) {
        console.log('Could not parse as JSON');
    }
}

processSingleFile();