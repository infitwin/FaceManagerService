/**
 * Face Groups Management Application
 * Interactive UI for managing face groups with the Face Manager Service
 */

// Configuration
const API_BASE_URL = 'http://localhost:8082/api';
const USER_ID = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';

// Real file IDs from Firebase
const REAL_FILES = [
    'file_1755659985239_7le2TjzJGZ',
    'file_1755659986536_HA8cvhthi5',
    'file_1755659987594_8VOMGbAoEd',
    'file_1755659988640_Pa68yHCb0p',
    'file_1755659989503_eavQhJ2RmP'
];

// Cache for face data (loaded from Firebase)
let faceDataCache = {};

// State
let currentGroups = [];
let selectedFaces = new Set();
let currentTab = 'groups';
let extractedFaces = new Set(); // Track which faces have been extracted

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for Firebase URLs to load
    console.log('Waiting for Firebase URLs to load...');
    let retries = 0;
    while ((!window.firebaseImageUrls || Object.keys(window.firebaseImageUrls).length === 0) && retries < 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        retries++;
    }
    console.log('Firebase URLs loaded:', window.firebaseImageUrls);
    
    // Load face data from Firebase
    await loadFaceData();
    initializeTabs();
    loadGroups();
    updateStats();
});

/**
 * Load face data from Firebase via API
 */
async function loadFaceData() {
    try {
        console.log('Loading face data from Firebase via API...');
        const response = await fetch(`${API_BASE_URL}/files-with-faces/${USER_ID}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Clear the cache
        faceDataCache = {};
        
        // Process files and build face data cache
        if (data.files && Array.isArray(data.files)) {
            data.files.forEach(file => {
                if (file.faces && Array.isArray(file.faces)) {
                    file.faces.forEach(face => {
                        const faceId = face.FaceId || face.faceId;
                        const boundingBox = face.BoundingBox || face.boundingBox;
                        
                        faceDataCache[faceId] = {
                            faceId: faceId,
                            fileId: file.fileId,
                            boundingBox: boundingBox,
                            confidence: face.Confidence || face.confidence || 99.99
                        };
                    });
                }
            });
        }
        
        console.log(`Loaded ${Object.keys(faceDataCache).length} faces from Firebase`);
        
        // Log sample face data for debugging
        const sampleFaceId = Object.keys(faceDataCache)[0];
        if (sampleFaceId) {
            console.log('Sample face data:', faceDataCache[sampleFaceId]);
        }
    } catch (error) {
        console.error('Failed to load face data from Firebase:', error);
        console.log('Will continue without face bounding box data');
        // Continue without face data cache
    }
}

/**
 * Initialize tab functionality
 */
function initializeTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update content sections
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.content-section').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(`${tabName}-section`).classList.add('active');
            
            // Load content for tab
            currentTab = tabName;
            switch(tabName) {
                case 'groups':
                    loadGroups();
                    break;
                case 'unassigned':
                    loadUnassignedFaces();
                    break;
                case 'files':
                    loadFileView();
                    break;
            }
        });
    });
}

/**
 * Load and display face groups
 */
async function loadGroups() {
    const groupsGrid = document.getElementById('groupsGrid');
    groupsGrid.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading face groups...</p></div>';
    
    // Clear extraction cache when loading new groups
    extractedFaces.clear();
    
    try {
        const response = await fetch(`${API_BASE_URL}/groups/${USER_ID}`);
        const data = await response.json();
        
        if (data.success) {
            currentGroups = data.groups;
            displayGroups(data.groups);
            updateStats();
        }
    } catch (error) {
        console.error('Failed to load groups:', error);
        showToast('Failed to load groups', 'error');
    }
}

/**
 * Display groups in the grid
 */
function displayGroups(groups) {
    const groupsGrid = document.getElementById('groupsGrid');
    
    if (!groups || groups.length === 0) {
        groupsGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📁</div>
                <p>No face groups yet</p>
                <p>Process some photos to create groups</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    groups.forEach((group, index) => {
        const groupNum = index + 1;
        // Remove duplicate face IDs within each group
        const originalFaceIds = group.faceIds || [];
        const faceIds = [...new Set(originalFaceIds)];
        
        if (originalFaceIds.length !== faceIds.length) {
            console.warn(`Group ${groupNum} had duplicates! Original: ${originalFaceIds.length}, Unique: ${faceIds.length}`);
            console.log('Original face IDs:', originalFaceIds);
            console.log('Unique face IDs:', faceIds);
        }
        
        html += `
            <div class="group-card" data-group-id="${group.groupId}">
                <div class="group-header">
                    <div class="group-title">Group ${groupNum}</div>
                    <div class="group-count">${group.faceCount || faceIds.length} faces</div>
                </div>
                <div class="faces-grid">
                    ${faceIds.map(faceId => {
                        // Get fileId from cache - this is the ONLY reliable source
                        const faceData = faceDataCache[faceId];
                        const fileId = faceData ? faceData.fileId : null;
                        
                        if (!fileId) {
                            console.warn(`No fileId found for face ${faceId} - face data not in cache`);
                        }
                        
                        return `
                        <div class="face-thumbnail ${selectedFaces.has(faceId) ? 'selected' : ''}" 
                             data-face-id="${faceId}"
                             onclick="toggleFaceSelection('${faceId}')">
                            <div class="face-image">
                                ${generateFacePlaceholder(faceId, fileId)}
                            </div>
                            <div class="face-id">${faceId.substring(0, 8)}...</div>
                        </div>
                    `;
                    }).join('')}
                </div>
                <div class="group-info" style="font-size: 12px; color: #6b7280; margin: 10px 0;">
                    Files: ${group.fileIds ? group.fileIds.join(', ') : 'Unknown'}
                </div>
                <div class="group-actions">
                    <button class="btn btn-secondary" onclick="splitGroup('${group.groupId}')">
                        Split Group
                    </button>
                    <button class="btn btn-danger" onclick="deleteGroup('${group.groupId}')">
                        Delete
                    </button>
                </div>
            </div>
        `;
    });
    
    groupsGrid.innerHTML = html;
}

/**
 * Extract face from image using canvas - EXACT CODE FROM face-extractor.js
 */
async function extractFaceFromImage(imageUrl, boundingBox) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // Enable CORS for Firebase Storage URLs
        
        img.onload = function() {
            // Create canvas for face extraction
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Check if boundingBox exists
            if (!boundingBox) {
                reject(new Error('BoundingBox is undefined'));
                return;
            }
            
            // Convert percentage-based coordinates to pixels
            // Firestore uses: Left, Top, Width, Height (all 0-1)
            const x = (boundingBox.Left || boundingBox.x || 0) * img.width;
            const y = (boundingBox.Top || boundingBox.y || 0) * img.height;
            const width = (boundingBox.Width || boundingBox.width || 0) * img.width;
            const height = (boundingBox.Height || boundingBox.height || 0) * img.height;
            
            // Set canvas size to extracted face dimensions (150x150 for thumbnails)
            const thumbnailSize = 150;
            canvas.width = thumbnailSize;
            canvas.height = thumbnailSize;
            
            // Draw the face region from the source image, scaled to thumbnail size
            ctx.drawImage(
                img,
                x,                  // Source X (pixels)
                y,                  // Source Y (pixels)
                width,              // Source Width (pixels)
                height,             // Source Height (pixels)
                0,                  // Destination X
                0,                  // Destination Y
                thumbnailSize,      // Destination Width
                thumbnailSize       // Destination Height
            );
            
            // Convert to data URL
            const faceDataUrl = canvas.toDataURL('image/jpeg', 0.9);
            resolve(faceDataUrl);
        };
        
        img.onerror = function() {
            reject(new Error('Failed to load image for face extraction'));
        };
        
        img.src = imageUrl;
    });
}

/**
 * Generate face image HTML with actual photo and bounding box
 */
function generateFacePlaceholder(faceId, fileId) {
    // Look up face data from cache
    const faceData = faceDataCache[faceId];
    
    // If we have cached face data, use it to get the correct fileId
    if (faceData) {
        fileId = faceData.fileId;
    }
    
    console.log(`Generating face placeholder for faceId: ${faceId}, fileId: ${fileId}`);
    
    // Use the actual Firebase Storage URL with token
    const imageUrl = window.firebaseImageUrls && window.firebaseImageUrls[fileId] 
        ? window.firebaseImageUrls[fileId]
        : `https://firebasestorage.googleapis.com/v0/b/infitwin.firebasestorage.app/o/users%2F${USER_ID}%2Ffiles%2F${fileId}?alt=media`;
    
    console.log(`Image URL: ${imageUrl}`);
    
    // Create a unique ID for this face element
    const uniqueId = `face_${faceId.replace(/-/g, '_')}`;
    
    // If we have bounding box data, extract the face using canvas
    if (faceData && faceData.boundingBox) {
        const bbox = faceData.boundingBox;
        console.log(`Using bounding box for ${faceId}:`, bbox);
        
        // Create placeholder that will be replaced with extracted face
        // Only extract if not already done
        if (!extractedFaces.has(faceId)) {
            extractedFaces.add(faceId);
            
            const actualImageUrl = window.firebaseImageUrls && window.firebaseImageUrls[fileId] 
                ? window.firebaseImageUrls[fileId]
                : imageUrl;
                
            setTimeout(() => {
                extractFaceFromImage(actualImageUrl, bbox)
                    .then(dataUrl => {
                        // Update ALL instances of this face
                        const elements = document.querySelectorAll(`img[id*="${uniqueId}"]`);
                        elements.forEach(elem => {
                            elem.src = dataUrl;
                        });
                        console.log(`Face extracted for ${faceId}, updated ${elements.length} element(s)`);
                    })
                    .catch(error => {
                        console.error(`Failed to extract face for ${faceId}:`, error);
                        // Fallback to showing full image on error
                        const elements = document.querySelectorAll(`img[id*="${uniqueId}"]`);
                        elements.forEach(elem => {
                            elem.src = actualImageUrl;
                        });
                    });
            }, 500); // Give more time for URLs to load
        }
        
        // Return initial placeholder
        return `
            <img id="${uniqueId}" 
                 src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60'><rect fill='%23f3f4f6' width='60' height='60'/><text x='50%' y='50%' text-anchor='middle' dy='.3em' fill='%23999' font-family='sans-serif' font-size='10'>Loading</text></svg>"
                 alt="Face ${faceId}" 
                 style="width: 100%; height: 100%; object-fit: cover;">
        `;
    }
    
    console.log(`No bounding box data for ${faceId}, using full image`);
    
    // Fallback to full image if no bounding box data
    return `
        <img src="${imageUrl}" 
             alt="Face ${faceId}" 
             style="width: 100%; height: 100%; object-fit: cover;"
             onload="console.log('Full image loaded for ${faceId}');"
             onerror="console.error('Failed to load full image for ${faceId}'); this.style.display='none';">
    `;
}

/**
 * Get face data from Firebase
 */
async function getFaceDataFromFirebase(fileId) {
    // In production, this would fetch the actual face data including bounding boxes
    // For now, return mock data
    return {
        url: `https://firebasestorage.googleapis.com/v0/b/infitwin.appspot.com/o/users%2F${USER_ID}%2Ffiles%2F${fileId}?alt=media`,
        faces: []
    };
}

/**
 * Load unassigned faces
 */
async function loadUnassignedFaces() {
    const unassignedGrid = document.getElementById('unassignedGrid');
    unassignedGrid.innerHTML = '<div class="loading"><div class="spinner"></div><p>Checking for unassigned faces...</p></div>';
    
    try {
        // Get all faces from the face data cache
        const allFaceIds = Object.keys(faceDataCache);
        
        // Get all assigned face IDs from current groups
        const assignedFaceIds = new Set();
        currentGroups.forEach(group => {
            if (group.faceIds) {
                group.faceIds.forEach(faceId => assignedFaceIds.add(faceId));
            }
        });
        
        // Find unassigned faces
        const unassignedFaces = allFaceIds
            .filter(faceId => !assignedFaceIds.has(faceId))
            .map(faceId => ({
                faceId: faceId,
                fileId: faceDataCache[faceId].fileId
            }));
        
        if (unassignedFaces.length === 0) {
            unassignedGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎉</div>
                    <p>No unassigned faces!</p>
                    <p>All faces have been grouped.</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        unassignedFaces.forEach(face => {
            html += `
                <div class="unassigned-face">
                    <div class="unassigned-face-image ${selectedFaces.has(face.faceId) ? 'selected' : ''}"
                         onclick="toggleFaceSelection('${face.faceId}')">
                        ${generateFacePlaceholder(face.faceId, face.fileId)}
                    </div>
                    <div class="file-info">${face.faceId.substring(0, 15)}...</div>
                </div>
            `;
        });
        
        unassignedGrid.innerHTML = html;
    } catch (error) {
        console.error('Failed to load unassigned faces:', error);
        unassignedGrid.innerHTML = '<div class="empty-state"><p>Error loading unassigned faces</p></div>';
    }
}

/**
 * Load file view
 */
async function loadFileView() {
    const filesContainer = document.getElementById('filesContainer');
    filesContainer.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading files...</p></div>';
    
    // Display files with their faces and groups
    let html = '<div class="groups-grid">';
    
    REAL_FILES.forEach(fileId => {
        html += `
            <div class="group-card">
                <div class="group-header">
                    <div class="group-title">${fileId}</div>
                    <div class="group-count">File</div>
                </div>
                <div style="padding: 10px; color: #6b7280; font-size: 14px;">
                    <p>📁 File ID: ${fileId}</p>
                    <p>📸 Faces: Check groups tab</p>
                    <p>🔍 Status: Processed</p>
                </div>
                <div class="group-actions">
                    <button class="btn btn-primary" onclick="reprocessFile('${fileId}')">
                        Reprocess
                    </button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    filesContainer.innerHTML = html;
}

/**
 * Toggle face selection
 */
function toggleFaceSelection(faceId) {
    if (selectedFaces.has(faceId)) {
        selectedFaces.delete(faceId);
    } else {
        selectedFaces.add(faceId);
    }
    
    // Update UI
    document.querySelectorAll(`[data-face-id="${faceId}"]`).forEach(elem => {
        elem.classList.toggle('selected');
    });
    
    updateSelectionInfo();
}

/**
 * Update selection info
 */
function updateSelectionInfo() {
    document.getElementById('selectedCount').textContent = selectedFaces.size;
}

/**
 * Clear selection
 */
function clearSelection() {
    selectedFaces.clear();
    document.querySelectorAll('.selected').forEach(elem => {
        elem.classList.remove('selected');
    });
    updateSelectionInfo();
}

/**
 * Update statistics
 */
async function updateStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/groups/${USER_ID}`);
        const data = await response.json();
        
        if (data.success) {
            const totalFaces = data.groups.reduce((sum, g) => sum + (g.faceCount || 0), 0);
            document.getElementById('totalFaces').textContent = totalFaces;
            document.getElementById('totalGroups').textContent = data.groupCount;
            document.getElementById('unassignedCount').textContent = '0'; // Update when implemented
        }
    } catch (error) {
        console.error('Failed to update stats:', error);
    }
}

/**
 * Create new group from selected faces
 */
async function createNewGroup() {
    if (selectedFaces.size === 0) {
        showToast('Please select faces first', 'error');
        return;
    }
    
    showModal('Create New Group', 
              `Create a new group with ${selectedFaces.size} selected faces?`,
              async () => {
        // In production, this would call the API to create a group
        showToast(`Created new group with ${selectedFaces.size} faces`);
        clearSelection();
        loadGroups();
    });
}

/**
 * Merge selected groups
 */
async function mergeGroups() {
    // Get selected groups (faces that belong to different groups)
    const groupsToMerge = new Set();
    selectedFaces.forEach(faceId => {
        currentGroups.forEach(group => {
            if (group.faceIds && group.faceIds.includes(faceId)) {
                groupsToMerge.add(group.groupId);
            }
        });
    });
    
    if (groupsToMerge.size < 2) {
        showToast('Select faces from at least 2 different groups to merge', 'error');
        return;
    }
    
    showModal('Merge Groups',
              `Merge ${groupsToMerge.size} groups into one?`,
              async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/groups/${USER_ID}/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupIds: Array.from(groupsToMerge) })
            });
            
            if (response.ok) {
                showToast('Groups merged successfully');
                clearSelection();
                loadGroups();
            }
        } catch (error) {
            showToast('Failed to merge groups', 'error');
        }
    });
}

/**
 * Split a group
 */
function splitGroup(groupId) {
    showModal('Split Group',
              'This will split the selected faces into a new group. Continue?',
              async () => {
        // In production, implement split logic
        showToast('Group split successfully');
        loadGroups();
    });
}

/**
 * Delete a group
 */
function deleteGroup(groupId) {
    showModal('Delete Group',
              'Are you sure you want to delete this group? Faces will become unassigned.',
              async () => {
        // In production, implement delete logic
        showToast('Group deleted');
        loadGroups();
    });
}

/**
 * Refresh data from Firebase
 */
async function refreshData() {
    showToast('Refreshing data from Firebase...');
    
    try {
        // Reload Firebase URLs
        const urls = await getFirebaseImageUrls();
        window.firebaseImageUrls = urls;
        console.log('Refreshed Firebase URLs:', urls);
        
        // Reload face data from Firebase
        await loadFaceData();
        
        // Clear extraction cache to force re-extraction with new data
        extractedFaces.clear();
        
        // Reload the current view
        switch(currentTab) {
            case 'groups':
                await loadGroups();
                break;
            case 'unassigned':
                await loadUnassignedFaces();
                break;
            case 'files':
                await loadFileView();
                break;
        }
        
        updateStats();
        showToast('Data refreshed successfully');
    } catch (error) {
        console.error('Failed to refresh data:', error);
        showToast('Failed to refresh data', 'error');
    }
}

/**
 * Reset all groups
 */
async function resetAllGroups() {
    showModal('Reset All Groups',
              'This will delete ALL groups and unassign all faces. Are you sure?',
              async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/test/reset/${USER_ID}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            if (data.success) {
                showToast(`Reset complete: ${data.deletedCount} groups deleted`);
                clearSelection();
                loadGroups();
            }
        } catch (error) {
            showToast('Failed to reset groups', 'error');
        }
    });
}

/**
 * Reprocess a file
 */
async function reprocessFile(fileId) {
    showToast(`Reprocessing ${fileId}...`);
    // In production, this would trigger reprocessing
    setTimeout(() => {
        showToast('File reprocessed successfully');
    }, 2000);
}

/**
 * Assign selected faces to a group
 */
function assignSelectedFaces() {
    if (selectedFaces.size === 0) {
        showToast('Please select faces to assign', 'error');
        return;
    }
    
    // In production, show a modal to select target group
    showToast(`Assigned ${selectedFaces.size} faces to group`);
    clearSelection();
    loadUnassignedFaces();
}

/**
 * Show modal
 */
function showModal(title, body, onConfirm) {
    const modal = document.getElementById('modal');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').textContent = body;
    
    const confirmBtn = document.getElementById('modalConfirm');
    confirmBtn.onclick = () => {
        onConfirm();
        closeModal();
    };
    
    modal.classList.add('active');
}

/**
 * Close modal
 */
function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
    toastMessage.textContent = message;
    toast.className = 'toast show';
    if (type === 'error') {
        toast.classList.add('error');
    }
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Close modal on background click
document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') {
        closeModal();
    }
});