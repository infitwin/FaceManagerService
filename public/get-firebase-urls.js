/**
 * Get the actual Firebase Storage URLs with tokens
 */

async function getFirebaseImageUrls() {
    // Use relative URL in production, localhost in development
    const baseUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:8082' 
        : '';
    const response = await fetch(`${baseUrl}/api/files-with-faces/zsvLTeIPJUYGnZHzWX7hVtLJlJX2`);
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