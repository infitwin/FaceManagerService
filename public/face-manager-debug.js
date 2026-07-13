// DIAGNOSTIC VERSION - Extensive logging to debug button issue

// Log everything that happens
console.log('🔵 DEBUG: face-manager-debug.js starting to load at', new Date().toISOString());

// Global error handlers
window.addEventListener('error', (e) => {
    console.error('❌ GLOBAL ERROR CAUGHT:', {
        message: e.message,
        filename: e.filename,
        line: e.lineno,
        column: e.colno,
        stack: e.error?.stack
    });
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('❌ UNHANDLED PROMISE REJECTION:', e.reason);
});

// Log that we're about to define the function
console.log('🔵 DEBUG: About to define window.proceedToNextStep');

// CRITICAL: Define function immediately at top level
try {
    window.proceedToNextStep = function() {
        console.log('✅ SUCCESS: proceedToNextStep was called!');
        
        // Simple test dialog
        const choice = confirm(
            'Button is working!\n\n' +
            'OK = Face Summarization\n' +
            'Cancel = Leader Selection'
        );
        
        if (choice) {
            alert('You selected Face Summarization');
        } else {
            alert('You selected Leader Selection');
        }
        
        return true;
    };
    
    console.log('✅ SUCCESS: window.proceedToNextStep defined successfully');
    console.log('🔵 DEBUG: typeof window.proceedToNextStep =', typeof window.proceedToNextStep);
    
    // Also try to make it global
    if (!window.proceedToNextStep) {
        console.error('❌ ERROR: window.proceedToNextStep is falsy after definition!');
    }
    
} catch (error) {
    console.error('❌ ERROR: Failed to define window.proceedToNextStep:', error);
}

// Test that the function exists
console.log('🔵 DEBUG: Testing function existence...');
if (typeof window.proceedToNextStep === 'function') {
    console.log('✅ SUCCESS: Function exists and is callable');
} else {
    console.error('❌ ERROR: Function does not exist or is not callable');
}

// Try to call it directly to test
console.log('🔵 DEBUG: Testing direct call...');
try {
    // Don't actually call it, just check if we could
    if (window.proceedToNextStep && typeof window.proceedToNextStep === 'function') {
        console.log('✅ SUCCESS: Function is ready to be called');
    } else {
        console.error('❌ ERROR: Function is not ready');
    }
} catch (error) {
    console.error('❌ ERROR: Exception when checking function:', error);
}

// Log the actual function
console.log('🔵 DEBUG: The actual function:', window.proceedToNextStep);

// Check if it's on the global scope
console.log('🔵 DEBUG: Is function on global?', 'proceedToNextStep' in window);

// Now continue with the rest of the Face Manager code
console.log('🔵 DEBUG: Starting Face Manager initialization...');

// Use relative URL in production, localhost in development
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:8082/api' 
    : '/api';
const USER_ID = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';

console.log('🔵 DEBUG: API_BASE_URL =', API_BASE_URL);

// State variables
let unassignedFaces = [];
let faceGroups = [];
let selectedFaces = new Set();
let selectedGroupFaces = new Set();
let faceDataCache = {};
let draggedFaces = [];
let draggedFromGroup = null;

console.log('🔵 DEBUG: State variables initialized');

// The rest of the Face Manager functions can fail, but the button should still work
console.log('🔵 DEBUG: About to define other functions that might fail...');

// Stub functions to prevent errors
window.showToast = function(message, type) {
    console.log(`🔵 TOAST [${type}]: ${message}`);
    alert(message);
};

window.runFaceSummarization = async function() {
    console.log('🔵 DEBUG: runFaceSummarization called');
    alert('Face Summarization would run here');
};

window.goToLeaderSelection = function() {
    console.log('🔵 DEBUG: goToLeaderSelection called');
    alert('Leader Selection would open here');
};

console.log('🔵 DEBUG: Stub functions defined');

// Try to load data but don't let failures break the button
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔵 DEBUG: DOMContentLoaded fired');
    
    // Double-check function still exists
    if (typeof window.proceedToNextStep === 'function') {
        console.log('✅ SUCCESS: Button function still exists after DOMContentLoaded');
    } else {
        console.error('❌ ERROR: Button function lost after DOMContentLoaded!');
    }
    
    // Try to initialize but catch all errors
    try {
        console.log('🔵 DEBUG: Attempting to load face data...');
        // Minimal initialization - don't let it break
        const response = await fetch(`${API_BASE_URL}/groups/${USER_ID}`);
        if (response.ok) {
            const data = await response.json();
            if (data.groups) {
                faceGroups = data.groups;
                console.log('✅ SUCCESS: Loaded', faceGroups.length, 'groups');
            }
        }
    } catch (error) {
        console.warn('⚠️ WARNING: Failed to load data but button should still work:', error);
    }
    
    // Final check
    console.log('🔵 DEBUG: Final check - button function exists?', typeof window.proceedToNextStep === 'function');
});

console.log('🔵 DEBUG: face-manager-debug.js fully loaded');
console.log('✅ FINAL STATUS: window.proceedToNextStep is', typeof window.proceedToNextStep);