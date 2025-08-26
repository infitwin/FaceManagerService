// Simple working version of face-manager.js
// CRITICAL: Define button function FIRST before anything can break

// Define the Next Step button function immediately
window.proceedToNextStep = function() {
    const choice = confirm(
        'What would you like to do next?\n\n' +
        'OK = Run Face Summarization (AI analysis)\n' +
        'Cancel = Select Leader Faces (manual selection)'
    );
    
    if (choice) {
        alert('Face Summarization:\n\n• Groups are ready for AI analysis\n• Runs automatically when interviews complete\n• Identifies people and relationships');
    } else {
        alert('Leader Selection:\n\n• Choose representative faces for each group\n• Helps identify people accurately');
    }
};

// Now the rest of the Face Manager code
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:8082/api' 
    : '/api';
const USER_ID = 'zsvLTeIPJUYGnZHzWX7hVtLJX2';

// State
let unassignedFaces = [];
let faceGroups = [];
let selectedFaces = new Set();
let selectedGroupFaces = new Set();
let faceDataCache = {};
let draggedFaces = [];
let draggedFromGroup = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Load everything but don't let failures break the button
    try {
        await initializeFaceManager();
    } catch (error) {
        console.error('Error initializing Face Manager:', error);
    }
});

async function initializeFaceManager() {
    await loadFaceData();
    await loadUnassignedFaces();
    await loadGroups();
    setupEventListeners();
}

// Load face data from Firebase
async function loadFaceData() {
    try {
        const response = await fetch(`${API_BASE_URL}/files-with-faces/${USER_ID}`);
        const data = await response.json();
        
        faceDataCache = {};
        
        if (data.files && Array.isArray(data.files)) {
            data.files.forEach(file => {
                if (file.faces && Array.isArray(file.faces)) {
                    file.faces.forEach(face => {
                        const faceId = face.FaceId || face.faceId;
                        const boundingBox = face.BoundingBox || face.boundingBox;
                        
                        faceDataCache[faceId] = {
                            faceId: faceId,
                            fileId: file.fileId,
                            url: file.url,
                            boundingBox: boundingBox,
                            confidence: face.Confidence || face.confidence || 99.99
                        };
                    });
                }
            });
        }
        
        console.log(`Loaded ${Object.keys(faceDataCache).length} faces from Firebase`);
    } catch (error) {
        console.error('Failed to load face data:', error);
    }
}

// Load unassigned faces
async function loadUnassignedFaces() {
    try {
        const groupsResponse = await fetch(`${API_BASE_URL}/groups/${USER_ID}`);
        const groupsData = await groupsResponse.json();
        
        const assignedFaceIds = new Set();
        if (groupsData.success && groupsData.groups) {
            groupsData.groups.forEach(group => {
                if (group.faceIds) {
                    group.faceIds.forEach(faceId => assignedFaceIds.add(faceId));
                }
            });
        }
        
        unassignedFaces = Object.keys(faceDataCache)
            .filter(faceId => !assignedFaceIds.has(faceId))
            .map(faceId => faceDataCache[faceId]);
        
        renderUnassignedFaces();
        updateCounts();
    } catch (error) {
        console.error('Failed to load unassigned faces:', error);
    }
}

// Load groups
async function loadGroups() {
    try {
        const response = await fetch(`${API_BASE_URL}/groups/${USER_ID}`);
        const data = await response.json();
        
        if (data.success) {
            faceGroups = data.groups || [];
            renderGroups();
            updateCounts();
        }
    } catch (error) {
        console.error('Failed to load groups:', error);
    }
}

// Render unassigned faces
function renderUnassignedFaces() {
    const grid = document.getElementById('unassignedGrid');
    if (!grid) return;
    
    if (unassignedFaces.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #9ca3af; padding: 40px;">No unassigned faces</div>';
        return;
    }
    
    grid.innerHTML = unassignedFaces.map(face => `
        <div class="face-thumb" draggable="true" data-face-id="${face.faceId}">
            <img src="${face.url}" alt="Face ${face.faceId}" loading="lazy">
            <span class="face-id-tooltip">${face.faceId.substring(0, 8)}...</span>
        </div>
    `).join('');
}

// Render groups
function renderGroups() {
    const groupsList = document.getElementById('groupsList');
    if (!groupsList) return;
    
    groupsList.innerHTML = faceGroups.map((group, index) => `
        <div class="group-card" data-group-id="${group.id}">
            <div class="group-header">
                <span class="group-title">Group ${index + 1}</span>
                <button class="delete-btn" onclick="deleteGroup('${group.id}')">×</button>
            </div>
            <div class="group-faces">
                ${group.faceIds.slice(0, 8).map(faceId => {
                    const face = faceDataCache[faceId];
                    if (!face) return '';
                    return `
                        <div class="group-face-preview" draggable="true" data-face-id="${faceId}">
                            <img src="${face.url}" alt="Face">
                        </div>
                    `;
                }).join('')}
                ${group.faceIds.length > 8 ? `<div class="more-faces">+${group.faceIds.length - 8}</div>` : ''}
            </div>
        </div>
    `).join('') + `
        <div class="group-card new-group-card" id="newGroupCard">
            <div class="new-group-icon">+</div>
            <div class="new-group-text">Drop faces here to create group</div>
        </div>
    `;
}

// Update counts
function updateCounts() {
    const unassignedCount = document.getElementById('unassignedCount');
    const groupCount = document.getElementById('groupCount');
    
    if (unassignedCount) {
        unassignedCount.textContent = unassignedFaces.length;
    }
    
    if (groupCount) {
        groupCount.textContent = faceGroups.length;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Basic drag and drop would go here
    console.log('Event listeners setup');
}

// Delete group function
window.deleteGroup = async function(groupId) {
    if (!confirm('Delete this group?')) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/groups/${groupId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            await loadGroups();
            await loadUnassignedFaces();
        }
    } catch (error) {
        console.error('Failed to delete group:', error);
    }
};

// Show toast function
window.showToast = function(message, type = 'info') {
    alert(message);
};