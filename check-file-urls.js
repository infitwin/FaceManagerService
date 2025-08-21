/**
 * Check what image URLs we actually have in Firestore
 */

const fetch = require('node-fetch');

const USER_ID = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';
const API_BASE = 'http://localhost:8082/api';

async function checkFileUrls() {
  console.log('Checking what URLs we have in Firestore...\n');
  
  try {
    const response = await fetch(`${API_BASE}/files-with-faces/${USER_ID}`);
    const data = await response.json();
    
    if (data.success) {
      console.log(`Found ${data.files.length} files with faces:\n`);
      
      data.files.forEach(file => {
        console.log(`File ID: ${file.fileId}`);
        console.log(`  File Name: ${file.fileName}`);
        console.log(`  URL: ${file.url || 'Not found'}`);
        console.log(`  Storage Path: ${file.storagePath || 'Not found'}`);
        console.log(`  Faces: ${file.faces.length}`);
        console.log('');
      });
    } else {
      console.error('Failed to fetch files:', data);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

checkFileUrls();