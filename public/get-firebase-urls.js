/**
 * Get the actual Firebase Storage URLs with tokens
 */

async function getFirebaseImageUrls() {
    const response = await fetch(`http://localhost:8082/api/files-with-faces/zsvLTeIPJUYGnZHzWX7hVtLJlJX2`);
    const data = await response.json();
    
    const urlMap = {};
    data.files.forEach(file => {
        urlMap[file.fileId] = file.url;
    });
    
    return urlMap;
}

// Store URLs globally
window.firebaseImageUrls = {};

// Load URLs on page load
getFirebaseImageUrls().then(urls => {
    window.firebaseImageUrls = urls;
    console.log('Loaded Firebase URLs:', urls);
});