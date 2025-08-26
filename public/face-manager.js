// Face Manager - Vanilla JS with HTML5 Drag & Drop
// Use relative URL in production, localhost in development
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
    await loadFaceData();
    await loadUnassignedFaces();
    await loadGroups();
    setupEventListeners();
    
    // Clean up any duplicates that might exist
    setTimeout(() => {
        const duplicatesRemoved = deduplicateUnassignedFaces();
        if (duplicatesRemoved > 0) {
            console.log(`Cleaned up ${duplicatesRemoved} duplicate faces on page load`);
        }
    }, 1000);
});

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
        showToast('Failed to load face data', 'error');
    }
}

// Load unassigned faces
async function loadUnassignedFaces() {
    try {
        // Get all groups first
        const groupsResponse = await fetch(`${API_BASE_URL}/groups/${USER_ID}`);
        const groupsData = await groupsResponse.json();
        
        // Get all assigned face IDs
        const assignedFaceIds = new Set();
        if (groupsData.success && groupsData.groups) {
            groupsData.groups.forEach(group => {
                if (group.faceIds) {
                    group.faceIds.forEach(faceId => assignedFaceIds.add(faceId));
                }
            });
        }
        
        // Find unassigned faces
        unassignedFaces = Object.keys(faceDataCache)
            .filter(faceId => !assignedFaceIds.has(faceId))
            .map(faceId => faceDataCache[faceId]);
        
        renderUnassignedFaces();
        updateCounts();
    } catch (error) {
        console.error('Failed to load unassigned faces:', error);
        showToast('Failed to load unassigned faces', 'error');
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
        showToast('Failed to load groups', 'error');
    }
}

// Render unassigned faces
function renderUnassignedFaces() {
    const grid = document.getElementById('unassignedGrid');
    
    // Deduplicate unassigned faces before rendering
    const uniqueFaces = [];
    const seenFaceIds = new Set();
    
    for (const face of unassignedFaces) {
        if (!seenFaceIds.has(face.faceId)) {
            uniqueFaces.push(face);
            seenFaceIds.add(face.faceId);
        } else {
            console.warn(`Removing duplicate face: ${face.faceId}`);
        }
    }
    
    // Update the unassigned faces array with deduplicated list
    unassignedFaces = uniqueFaces;
    
    if (unassignedFaces.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: #9ca3af; padding: 40px;">
                No unassigned faces
            </div>
        `;
        return;
    }
    
    grid.innerHTML = unassignedFaces.map(face => `
        <div class="face-thumb ${selectedFaces.has(face.faceId) ? 'selected' : ''}"
             data-face-id="${face.faceId}"
             draggable="true">
            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" 
                 alt="Face ${face.faceId.substring(0, 8)}"
                 data-face-id="${face.faceId}">
            <div class="face-id-tooltip">${face.faceId.substring(0, 8)}...</div>
            ${selectedFaces.has(face.faceId) ? `<div class="multi-select-badge">${selectedFaces.size}</div>` : ''}
        </div>
    `).join('');
    
    // Extract faces asynchronously
    unassignedFaces.forEach(face => {
        extractAndDisplayFace(face);
    });
    
    // Add event listeners
    grid.querySelectorAll('.face-thumb').forEach(elem => {
        elem.addEventListener('dragstart', handleDragStart);
        elem.addEventListener('dragend', handleDragEnd);
        elem.addEventListener('click', handleFaceClick);
    });
}

// Render groups
function renderGroups() {
    const list = document.getElementById('groupsList');
    
    let html = '';
    
    // Keep groups in their original order (oldest to newest)
    // This way new groups appear just above the "+ New Group" card
    faceGroups.forEach((group, index) => {
        const faces = group.faceIds ? group.faceIds.slice(0, 5) : [];
        const moreCount = group.faceCount - 5;
        
        html += `
            <div class="group-card" data-group-id="${group.groupId}">
                <div class="group-header">
                    <div class="group-title">Person ${index + 1} (${group.faceCount || 0})</div>
                    <div class="group-actions">
                        <button class="delete-btn" onclick="deleteGroup('${group.groupId}')">🗑️</button>
                    </div>
                </div>
                <div class="group-faces">
                    ${faces.map(faceId => `
                        <div class="group-face-preview" 
                             data-face-id="${faceId}"
                             data-group-id="${group.groupId}"
                             draggable="true">
                            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" 
                                 alt="Face" data-face-id="${faceId}">
                        </div>
                    `).join('')}
                    ${moreCount > 0 ? `<div class="more-faces">+${moreCount}</div>` : ''}
                </div>
            </div>
        `;
    });
    
    // Always keep new group drop zone at the bottom
    html += `
        <div class="group-card new-group-card" data-group-id="new" id="newGroupCard">
            <div class="new-group-icon">+</div>
            <div class="new-group-text">Drop faces here to create group</div>
        </div>
    `;
    
    list.innerHTML = html;
    
    // Extract faces for group previews
    faceGroups.forEach((group) => {
        if (group.faceIds) {
            group.faceIds.slice(0, 5).forEach(faceId => {
                const faceData = faceDataCache[faceId];
                if (faceData) {
                    extractAndDisplayFace(faceData, 50);
                }
            });
        }
    });
    
    // Add drop event listeners for group cards
    list.querySelectorAll('.group-card').forEach(elem => {
        elem.addEventListener('dragover', handleDragOver);
        elem.addEventListener('drop', handleDrop);
        elem.addEventListener('dragleave', handleDragLeave);
    });
    
    // Add drag and click event listeners for group faces
    list.querySelectorAll('.group-face-preview').forEach(elem => {
        elem.addEventListener('dragstart', handleGroupFaceDragStart);
        elem.addEventListener('dragend', handleGroupFaceDragEnd);
        elem.addEventListener('click', handleGroupFaceClick);
    });
}

// Create a face element DOM node
function createFaceElement(faceId, faceData) {
    const div = document.createElement('div');
    div.className = 'face-thumb';
    div.dataset.faceId = faceId;
    div.draggable = true;
    
    div.innerHTML = `
        <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" 
             alt="Face ${faceId.substring(0, 8)}"
             data-face-id="${faceId}">
        <div class="face-id-tooltip">${faceId.substring(0, 8)}...</div>
    `;
    
    // Add event listeners
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragend', handleDragEnd);
    div.addEventListener('click', handleFaceClick);
    
    // Extract and display the face image asynchronously
    extractAndDisplayFace(faceData);
    
    return div;
}

// Extract and display face from image
async function extractAndDisplayFace(faceData, size = 100) {
    if (!faceData || !faceData.boundingBox) return;
    
    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            const bbox = faceData.boundingBox;
            const x = (bbox.Left || 0) * img.width;
            const y = (bbox.Top || 0) * img.height;
            const width = (bbox.Width || 0) * img.width;
            const height = (bbox.Height || 0) * img.height;
            
            canvas.width = size;
            canvas.height = size;
            
            ctx.drawImage(img, x, y, width, height, 0, 0, size, size);
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            
            // Update all images with this face ID
            document.querySelectorAll(`img[data-face-id="${faceData.faceId}"]`).forEach(imgElem => {
                imgElem.src = dataUrl;
            });
        };
        
        img.src = faceData.url || `${API_BASE_URL}/image/${USER_ID}/${faceData.fileId}`;
    } catch (error) {
        console.error('Failed to extract face:', error);
    }
}

// Drag & Drop Handlers
function handleDragStart(e) {
    const faceId = e.currentTarget.dataset.faceId;
    
    if (selectedFaces.has(faceId)) {
        // Dragging multiple selected faces
        draggedFaces = Array.from(selectedFaces);
    } else {
        // Dragging single face
        draggedFaces = [faceId];
    }
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(draggedFaces));
    e.dataTransfer.setData('source', 'unassigned');
    
    e.currentTarget.classList.add('dragging');
    
    // Show trash zone when dragging
    document.getElementById('trashZone').classList.add('active');
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(elem => {
        elem.classList.remove('drag-over');
    });
    
    // Hide trash zone
    document.getElementById('trashZone').classList.remove('active');
}

// Group face drag handlers
function handleGroupFaceDragStart(e) {
    const faceId = e.currentTarget.dataset.faceId;
    const groupId = e.currentTarget.dataset.groupId;
    
    draggedFaces = [faceId];
    draggedFromGroup = groupId;
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(draggedFaces));
    e.dataTransfer.setData('source', 'group');
    e.dataTransfer.setData('groupId', groupId);
    
    e.currentTarget.classList.add('dragging');
    
    // Show trash zone when dragging from group
    document.getElementById('trashZone').classList.add('active');
}

function handleGroupFaceDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(elem => {
        elem.classList.remove('drag-over');
    });
    
    // Hide trash zone
    document.getElementById('trashZone').classList.remove('active');
    draggedFromGroup = null;
}

// Group face click handler
function handleGroupFaceClick(e) {
    e.stopPropagation();
    const faceElement = e.currentTarget;
    const faceId = faceElement.dataset.faceId;
    
    if (selectedGroupFaces.has(faceId)) {
        selectedGroupFaces.delete(faceId);
        faceElement.classList.remove('selected');
    } else {
        selectedGroupFaces.add(faceId);
        faceElement.classList.add('selected');
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    if (e.currentTarget === e.target) {
        e.currentTarget.classList.remove('drag-over');
    }
}

async function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const groupCard = e.currentTarget;
    const groupId = groupCard.dataset.groupId;
    const source = e.dataTransfer.getData('source');
    const sourceGroupId = e.dataTransfer.getData('groupId');
    
    try {
        let faceIds;
        try {
            faceIds = JSON.parse(e.dataTransfer.getData('text/plain'));
        } catch {
            // Fallback if JSON parse fails
            faceIds = draggedFaces;
        }
        
        if (!faceIds || faceIds.length === 0) {
            console.error('No faces to drop');
            return;
        }
        
        // Check if dropping from a group to a different location
        if (source === 'group') {
            // Don't allow dropping to the same group
            if (sourceGroupId === groupId) {
                console.log('Cannot drop to the same group');
                return;
            }
            
            // Remove face from source group
            await removeFaceFromGroup(sourceGroupId, faceIds[0]);
        }
        
        console.log(`Dropping ${faceIds.length} faces to ${groupId === 'new' ? 'new group' : `group ${groupId}`}`);
        
        if (groupId === 'new') {
            // Create new group - this requires reload to show the new group
            await createNewGroup(faceIds);
            
            // Clear selection after successful drop
            clearSelection();
            
            // Remove dropped faces from unassigned panel
            if (source === 'unassigned') {
                for (const faceId of faceIds) {
                    const faceElement = document.querySelector(`.face-thumb[data-face-id="${faceId}"]`);
                    if (faceElement) {
                        faceElement.remove();
                    }
                }
                
                // Update the unassigned count
                const remainingFaces = document.querySelectorAll('#unassignedGrid .face-thumb').length;
                document.getElementById('unassignedCount').textContent = remainingFaces;
            }
            
            // Reload groups to show the new group
            await loadGroups();
        } else {
            // Add to existing group - just update the DOM without reloading
            await addFacesToGroup(groupId, faceIds);
            
            // Clear selection after successful drop
            clearSelection();
            
            // Update the group's DOM directly without reloading
            const groupCard = document.querySelector(`.group-card[data-group-id="${groupId}"]`);
            if (groupCard) {
                const group = faceGroups.find(g => g.groupId === groupId);
                if (group) {
                    // Update group data
                    for (const faceId of faceIds) {
                        if (!group.faceIds.includes(faceId)) {
                            group.faceIds.push(faceId);
                        }
                    }
                    group.faceCount = group.faceIds.length;
                    
                    // Update group title with new count
                    const titleElement = groupCard.querySelector('.group-title');
                    if (titleElement) {
                        const groupIndex = faceGroups.indexOf(group);
                        titleElement.textContent = `Person ${groupIndex + 1} (${group.faceCount})`;
                    }
                    
                    // Add face previews to the group
                    const groupFacesContainer = groupCard.querySelector('.group-faces');
                    if (groupFacesContainer) {
                        // Find the "more faces" element if it exists
                        const moreFacesElement = groupFacesContainer.querySelector('.more-faces');
                        
                        for (const faceId of faceIds) {
                            // Only add if not already displayed (max 5 faces shown)
                            const existingFaceCount = groupFacesContainer.querySelectorAll('.group-face-preview').length;
                            if (existingFaceCount < 5) {
                                const facePreview = document.createElement('div');
                                facePreview.className = 'group-face-preview';
                                facePreview.dataset.faceId = faceId;
                                facePreview.dataset.groupId = groupId;
                                facePreview.draggable = true;
                                
                                facePreview.innerHTML = `
                                    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" 
                                         alt="Face" data-face-id="${faceId}">
                                `;
                                
                                // Add event listeners
                                facePreview.addEventListener('dragstart', handleGroupFaceDragStart);
                                facePreview.addEventListener('dragend', handleGroupFaceDragEnd);
                                facePreview.addEventListener('click', handleGroupFaceClick);
                                
                                // Insert before "more faces" element if it exists
                                if (moreFacesElement) {
                                    groupFacesContainer.insertBefore(facePreview, moreFacesElement);
                                } else {
                                    groupFacesContainer.appendChild(facePreview);
                                }
                                
                                // Extract and display the face image
                                if (faceDataCache[faceId]) {
                                    extractAndDisplayFace(faceDataCache[faceId], 50);
                                }
                            }
                        }
                        
                        // Update or add "more faces" counter if needed
                        const totalFaces = group.faceCount;
                        const displayedFaces = groupFacesContainer.querySelectorAll('.group-face-preview').length;
                        const moreFaces = totalFaces - displayedFaces;
                        
                        if (moreFaces > 0) {
                            if (moreFacesElement) {
                                moreFacesElement.textContent = `+${moreFaces}`;
                            } else {
                                const moreDiv = document.createElement('div');
                                moreDiv.className = 'more-faces';
                                moreDiv.textContent = `+${moreFaces}`;
                                groupFacesContainer.appendChild(moreDiv);
                            }
                        } else if (moreFacesElement) {
                            moreFacesElement.remove();
                        }
                    }
                }
            }
            
            // If dragging from unassigned, remove the faces from the panel
            if (source === 'unassigned') {
                for (const faceId of faceIds) {
                    const faceElement = document.querySelector(`.face-thumb[data-face-id="${faceId}"]`);
                    if (faceElement) {
                        faceElement.remove();
                    }
                }
                
                // Update the unassigned count
                const remainingFaces = document.querySelectorAll('#unassignedGrid .face-thumb').length;
                document.getElementById('unassignedCount').textContent = remainingFaces;
            }
        }
        
        // If we just created a new group, scroll to keep it visible
        if (groupId === 'new') {
            setTimeout(() => {
                const newGroupCard = document.getElementById('newGroupCard');
                if (newGroupCard) {
                    newGroupCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }
            }, 100);
        }
        
        showToast('Faces moved successfully', 'success');
        
    } catch (error) {
        console.error('Drop failed:', error);
        showToast(`Failed: ${error.message}`, 'error');
        
        // Reload to ensure UI is in sync
        await loadUnassignedFaces();
        await loadGroups();
    }
}

// Face selection
function handleFaceClick(e) {
    e.stopPropagation();
    const faceId = e.currentTarget.dataset.faceId;
    
    if (e.ctrlKey || e.metaKey) {
        // Multi-select with Ctrl/Cmd
        if (selectedFaces.has(faceId)) {
            selectedFaces.delete(faceId);
        } else {
            selectedFaces.add(faceId);
        }
    } else {
        // Single select
        selectedFaces.clear();
        selectedFaces.add(faceId);
    }
    
    updateSelection();
}

function updateSelection() {
    // Update face thumbnails
    document.querySelectorAll('.face-thumb').forEach(elem => {
        const faceId = elem.dataset.faceId;
        if (selectedFaces.has(faceId)) {
            elem.classList.add('selected');
        } else {
            elem.classList.remove('selected');
        }
    });
    
    // Update selection info
    const selectionInfo = document.getElementById('selectionInfo');
    const selectionText = document.getElementById('selectionText');
    
    if (selectedFaces.size > 0) {
        selectionInfo.classList.add('active');
        selectionText.textContent = `${selectedFaces.size} face${selectedFaces.size > 1 ? 's' : ''} selected`;
    } else {
        selectionInfo.classList.remove('active');
    }
}

function clearSelection() {
    selectedFaces.clear();
    updateSelection();
}

// API Operations
async function createNewGroup(faceIds) {
    try {
        // Create a new group by processing the first face with no matches
        // Then add the rest of the faces to that group
        
        if (faceIds.length === 0) {
            throw new Error('No faces selected');
        }
        
        // Process first face to create a new group
        const firstFaceId = faceIds[0];
        const firstFaceData = faceDataCache[firstFaceId];
        
        if (!firstFaceData) {
            throw new Error('Face data not found');
        }
        
        console.log('Creating new group with face:', firstFaceId);
        
        const response = await fetch(`${API_BASE_URL}/process-faces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: USER_ID,
                fileId: firstFaceData.fileId,
                faces: [{
                    faceId: firstFaceId,
                    boundingBox: firstFaceData.boundingBox,
                    confidence: firstFaceData.confidence || 99.99,
                    matchedFaceIds: [] // No matches = new group (using correct field name)
                }]
            })
        });
        
        if (!response.ok) {
            const errorData = await response.text();
            console.error('API error:', errorData);
            throw new Error(`API returned ${response.status}: ${errorData}`);
        }
        
        const result = await response.json();
        console.log('Group created:', result);
        
        // If we have more faces, add them to the newly created group
        if (faceIds.length > 1 && result.groups && result.groups.length > 0) {
            const newGroupId = result.groups[0].groupId;
            const remainingFaceIds = faceIds.slice(1);
            
            // Add remaining faces to the group
            for (const faceId of remainingFaceIds) {
                const faceData = faceDataCache[faceId];
                if (!faceData) continue;
                
                await fetch(`${API_BASE_URL}/process-faces`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: USER_ID,
                        fileId: faceData.fileId,
                        faces: [{
                            faceId: faceId,
                            boundingBox: faceData.boundingBox,
                            confidence: faceData.confidence || 99.99,
                            matchedFaceIds: [firstFaceId] // Match to first face in group
                        }]
                    })
                });
            }
        }
        
        showToast(`Created group with ${faceIds.length} face${faceIds.length > 1 ? 's' : ''}`, 'success');
        
    } catch (error) {
        console.error('Failed to create group:', error);
        throw error;
    }
}

async function addFacesToGroup(groupId, faceIds) {
    // Get the group's existing faces
    const group = faceGroups.find(g => g.groupId === groupId);
    if (!group) throw new Error('Group not found');
    
    // For each face, merge it into the group
    for (const faceId of faceIds) {
        const faceData = faceDataCache[faceId];
        if (!faceData) continue;
        
        // Process the face with a match to an existing face in the group
        const response = await fetch(`${API_BASE_URL}/process-faces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: USER_ID,
                fileId: faceData.fileId,
                faces: [{
                    faceId: faceId,
                    boundingBox: faceData.boundingBox,
                    confidence: faceData.confidence || 99.99,
                    matchedFaceIds: group.faceIds && group.faceIds.length > 0 ? [group.faceIds[0]] : []
                }]
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to add face to group');
        }
    }
    
    showToast(`Added ${faceIds.length} face${faceIds.length > 1 ? 's' : ''} to group`, 'success');
}

async function deleteGroup(groupId) {
    if (!confirm('Delete this group? All faces will return to unassigned.')) {
        return;
    }
    
    try {
        showToast('Deleting group...');
        
        // Find the group to get its faces before deletion
        const group = faceGroups.find(g => g.groupId === groupId);
        const facesToReturn = group ? [...group.faceIds] : [];
        
        // Call the delete API endpoint
        const response = await fetch(`${API_BASE_URL}/groups/${groupId}?userId=${USER_ID}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to delete: ${error}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            // Remove the group card from DOM
            const groupCard = document.querySelector(`.group-card[data-group-id="${groupId}"]`);
            if (groupCard) {
                groupCard.remove();
            }
            
            // Update groups array
            faceGroups = faceGroups.filter(g => g.groupId !== groupId);
            document.getElementById('groupCount').textContent = faceGroups.length;
            
            // Add the faces back to unassigned panel
            const unassignedGrid = document.getElementById('unassignedGrid');
            for (const faceId of facesToReturn) {
                if (faceDataCache[faceId]) {
                    // Check if face is not already in the unassigned panel
                    if (!document.querySelector(`.face-thumb[data-face-id="${faceId}"]`)) {
                        const faceData = faceDataCache[faceId];
                        const faceDiv = createFaceElement(faceId, faceData);
                        unassignedGrid.appendChild(faceDiv);
                    }
                }
            }
            
            // Update unassigned count
            const unassignedCount = document.querySelectorAll('#unassignedGrid .face-thumb').length;
            document.getElementById('unassignedCount').textContent = unassignedCount;
            
            showToast('Group deleted - faces returned to unassigned', 'success');
        } else {
            throw new Error(result.message || 'Failed to delete group');
        }
    } catch (error) {
        console.error('Failed to delete group:', error);
        showToast('Failed to delete group', 'error');
        // On error, reload to ensure UI is in sync
        await loadGroups();
    }
}

// Update counts
function updateCounts() {
    document.getElementById('unassignedCount').textContent = unassignedFaces.length;
    document.getElementById('groupCount').textContent = faceGroups.length;
}

// Clear group face selection
function clearGroupSelection() {
    selectedGroupFaces.clear();
    document.querySelectorAll('.group-face-preview.selected').forEach(elem => {
        elem.classList.remove('selected');
    });
}

// Delete selected group faces
async function deleteSelectedGroupFaces() {
    if (selectedGroupFaces.size === 0) return;
    
    if (!confirm(`Remove ${selectedGroupFaces.size} face(s) from group?`)) {
        return;
    }
    
    try {
        // Group faces by their group ID
        const facesByGroup = new Map();
        selectedGroupFaces.forEach(faceId => {
            const faceElem = document.querySelector(`.group-face-preview[data-face-id="${faceId}"]`);
            if (faceElem) {
                const groupId = faceElem.dataset.groupId;
                if (!facesByGroup.has(groupId)) {
                    facesByGroup.set(groupId, []);
                }
                facesByGroup.get(groupId).push(faceId);
            }
        });
        
        // Remove faces from each group
        for (const [groupId, faceIds] of facesByGroup) {
            for (const faceId of faceIds) {
                await removeFaceFromGroup(groupId, faceId);
            }
        }
        
        clearGroupSelection();
        showToast(`Removed ${selectedGroupFaces.size} face(s) from groups`, 'success');
    } catch (error) {
        console.error('Failed to delete group faces:', error);
        showToast('Failed to remove faces from groups', 'error');
    }
}

// Remove a single face from a group
async function removeFaceFromGroup(groupId, faceId) {
    try {
        // Call API to remove face from group in Firebase
        const response = await fetch(`${API_BASE_URL}/groups/${groupId}/faces/${faceId}?userId=${USER_ID}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to remove face: ${error}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.message || 'Failed to remove face from group');
        }
        
        // Find the group
        const group = faceGroups.find(g => g.groupId === groupId);
        if (!group) {
            throw new Error('Group not found');
        }
        
        // Remove the face element from the group's DOM immediately
        const faceElement = document.querySelector(`.group-face-preview[data-face-id="${faceId}"][data-group-id="${groupId}"]`);
        if (faceElement) {
            faceElement.remove();
        }
        
        // Update the group locally
        group.faceIds = group.faceIds.filter(id => id !== faceId);
        group.faceCount = group.faceIds.length;
        
        // Update the group's face count display
        const groupCard = document.querySelector(`.group-card[data-group-id="${groupId}"]`);
        if (groupCard) {
            const titleElement = groupCard.querySelector('.group-title');
            if (titleElement) {
                const groupIndex = faceGroups.indexOf(group);
                titleElement.textContent = `Person ${groupIndex + 1} (${group.faceCount})`;
            }
        }
        
        // If group is now empty, remove it from DOM and local state
        if (group.faceIds.length === 0) {
            if (groupCard) {
                groupCard.remove();
            }
            faceGroups = faceGroups.filter(g => g.groupId !== groupId);
            document.getElementById('groupCount').textContent = faceGroups.length;
        }
        
        // Check if face already exists in unassigned panel before adding
        const existingFace = document.querySelector(`#unassignedGrid .face-thumb[data-face-id="${faceId}"]`);
        if (!existingFace && faceDataCache[faceId]) {
            // Add the face back to unassigned panel
            const unassignedGrid = document.getElementById('unassignedGrid');
            const faceDiv = createFaceElement(faceId, faceDataCache[faceId]);
            unassignedGrid.appendChild(faceDiv);
            
            // Update the unassigned faces array only if not already there
            if (!unassignedFaces.find(f => f.faceId === faceId)) {
                unassignedFaces.push(faceDataCache[faceId]);
            }
        } else if (existingFace) {
            console.log(`Face ${faceId} already exists in unassigned panel, skipping duplicate`);
        }
        
        // Update counts
        const unassignedCount = document.querySelectorAll('#unassignedGrid .face-thumb').length;
        document.getElementById('unassignedCount').textContent = unassignedCount;
        
        console.log(`✅ Successfully removed face ${faceId} from group ${groupId}`);
        
    } catch (error) {
        console.error('Failed to remove face from group:', error);
        throw error;
    }
}

// Toast notifications
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type} show`;
    toast.innerHTML = `
        <span>${type === 'success' ? '✓' : '✗'}</span>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Deduplicate unassigned faces in the DOM
function deduplicateUnassignedFaces() {
    const grid = document.getElementById('unassignedGrid');
    const seenFaceIds = new Set();
    const duplicates = [];
    
    // Find and remove duplicate face elements
    grid.querySelectorAll('.face-thumb').forEach(elem => {
        const faceId = elem.dataset.faceId;
        if (seenFaceIds.has(faceId)) {
            duplicates.push(elem);
            console.warn(`Removing duplicate face element: ${faceId}`);
        } else {
            seenFaceIds.add(faceId);
        }
    });
    
    // Remove duplicate elements from DOM
    duplicates.forEach(elem => elem.remove());
    
    // Update count
    const remainingCount = grid.querySelectorAll('.face-thumb').length;
    document.getElementById('unassignedCount').textContent = remainingCount;
    
    if (duplicates.length > 0) {
        showToast(`Removed ${duplicates.length} duplicate face(s)`, 'info');
    }
    
    return duplicates.length;
}

// Setup event listeners
function setupEventListeners() {
    // Click outside to clear selection
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.face-thumb') && !e.target.closest('.group-face-preview')) {
            clearSelection();
            clearGroupSelection();
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', async (e) => {
        if (e.key === 'Escape') {
            clearSelection();
            clearGroupSelection();
        }
        if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            // Select all unassigned
            unassignedFaces.forEach(face => selectedFaces.add(face.faceId));
            updateSelection();
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Check if any group faces are selected
            if (selectedGroupFaces.size > 0) {
                e.preventDefault();
                await deleteSelectedGroupFaces();
            }
        }
    });
    
    // Setup trash zone
    const trashZone = document.getElementById('trashZone');
    if (trashZone) {
        trashZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            trashZone.classList.add('drag-over');
        });
        
        trashZone.addEventListener('dragleave', (e) => {
            if (e.currentTarget === e.target) {
                trashZone.classList.remove('drag-over');
            }
        });
        
        trashZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            trashZone.classList.remove('drag-over');
            trashZone.classList.remove('active');
            
            const source = e.dataTransfer.getData('source');
            const sourceGroupId = e.dataTransfer.getData('groupId');
            
            let faceIds;
            try {
                faceIds = JSON.parse(e.dataTransfer.getData('text/plain'));
            } catch {
                faceIds = draggedFaces;
            }
            
            if (source === 'group' && sourceGroupId && faceIds && faceIds.length > 0) {
                // Remove face from group
                await removeFaceFromGroup(sourceGroupId, faceIds[0]);
                showToast('Face removed from group', 'success');
            }
        });
    }
}

// Refresh function
window.refreshData = async function() {
    showToast('Refreshing...');
    await loadFaceData();
    await loadUnassignedFaces();
    await loadGroups();
    showToast('Data refreshed', 'success');
};

// Proceed to next step - Face Summarization or Leader Selection
window.proceedToNextStep = async function() {
    // Check if we have any groups
    if (faceGroups.length === 0) {
        showToast('No face groups created yet. Please group some faces first.', 'error');
        return;
    }
    
    // Show options dialog
    const choice = confirm(
        'What would you like to do next?\n\n' +
        'OK = Run Face Summarization (AI analysis)\n' +
        'Cancel = Select Leader Faces (manual selection)\n\n' +
        'Note: Face Summarization will analyze all groups and generate a summary.'
    );
    
    if (choice) {
        // Run Face Summarization
        await runFaceSummarization();
    } else {
        // Go to leader face selection
        goToLeaderSelection();
    }
}

// Run Face Summarization through the Interview Orchestrator
async function runFaceSummarization() {
    try {
        showToast('Starting Face Summarization...', 'success');
        
        // Show inline summary with actual group data
        showInlineSummary();
        
    } catch (error) {
        console.error('Error running face summarization:', error);
        showToast('Failed to run face summarization', 'error');
    }
}

// Go to leader face selection UI
function goToLeaderSelection() {
    // Create a simple leader selection view
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 12px;
        max-width: 90%;
        max-height: 90%;
        overflow-y: auto;
    `;
    
    content.innerHTML = `
        <h2 style="margin-bottom: 20px;">Select Leader Faces for Groups</h2>
        <div id="leaderSelectionGroups"></div>
        <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
            <button onclick="this.closest('[style*=fixed]').remove()" style="
                padding: 8px 16px;
                border: 1px solid #e5e7eb;
                background: white;
                border-radius: 6px;
                cursor: pointer;
            ">Cancel</button>
            <button onclick="saveLeaderSelections()" style="
                padding: 8px 16px;
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
            ">Save Leaders</button>
        </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Load groups for leader selection
    loadGroupsForLeaderSelection();
}

// Load groups for leader selection
window.loadGroupsForLeaderSelection = async function() {
    const container = document.getElementById('leaderSelectionGroups');
    if (!container) return;
    
    container.innerHTML = faceGroups.map(group => `
        <div style="margin-bottom: 20px; padding: 15px; background: #f9fafb; border-radius: 8px;">
            <h3 style="margin-bottom: 10px;">Group ${group.groupId.substring(0, 20)}...</h3>
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 10px;">${group.faces.length} faces in group</p>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                ${group.faces.slice(0, 5).map(face => `
                    <label style="cursor: pointer; text-align: center;">
                        <input type="radio" name="leader_${group.groupId}" value="${face.faceId}" 
                            ${face.faceId === group.leaderFaceId ? 'checked' : ''}>
                        <img src="${getFaceThumbnailUrl(face.faceId)}" 
                            style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; margin-top: 5px; border: 2px solid ${face.faceId === group.leaderFaceId ? '#3b82f6' : 'transparent'};">
                    </label>
                `).join('')}
                ${group.faces.length > 5 ? `<span style="align-self: center; color: #6b7280;">+${group.faces.length - 5} more faces</span>` : ''}
            </div>
        </div>
    `).join('');
}

// Save leader selections
window.saveLeaderSelections = async function() {
    // Collect selected leaders
    const updates = [];
    for (const group of faceGroups) {
        const selected = document.querySelector(`input[name="leader_${group.groupId}"]:checked`);
        if (selected && selected.value !== group.leaderFaceId) {
            updates.push({
                groupId: group.groupId,
                leaderFaceId: selected.value
            });
        }
    }
    
    if (updates.length === 0) {
        showToast('No changes to save', 'info');
        return;
    }
    
    // Update leader faces via API
    for (const update of updates) {
        try {
            const response = await fetch(`${API_BASE_URL}/groups/${USER_ID}/${update.groupId}/leader`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leaderFaceId: update.leaderFaceId })
            });
            
            if (!response.ok) {
                console.error(`Failed to update leader for group ${update.groupId}`);
            }
        } catch (error) {
            console.error(`Error updating leader for group ${update.groupId}:`, error);
        }
    }
    
    showToast(`Updated ${updates.length} leader faces`, 'success');
    
    // Close modal
    document.querySelector('[style*=fixed]').remove();
    
    // Reload groups to show updated leaders
    await loadGroups();
}

// Show inline summary
function showInlineSummary() {
    // Calculate statistics
    const totalFaces = faceGroups.reduce((sum, g) => sum + g.faces.length, 0);
    const avgFacesPerGroup = faceGroups.length > 0 ? Math.round(totalFaces / faceGroups.length) : 0;
    const largestGroup = faceGroups.reduce((max, g) => g.faces.length > max ? g.faces.length : max, 0);
    
    const summaryHtml = `
        <div style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 30px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            max-width: 500px;
            z-index: 10000;
        ">
            <h2 style="margin-bottom: 20px; color: #1f2937;">Face Summarization Ready</h2>
            
            <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <h3 style="color: #0369a1; margin-bottom: 10px;">Current Statistics</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <strong>Groups created:</strong> ${faceGroups.length}
                    </div>
                    <div>
                        <strong>Total faces:</strong> ${totalFaces}
                    </div>
                    <div>
                        <strong>Avg per group:</strong> ${avgFacesPerGroup}
                    </div>
                    <div>
                        <strong>Largest group:</strong> ${largestGroup} faces
                    </div>
                </div>
            </div>
            
            <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <h3 style="color: #166534; margin-bottom: 10px;">What Happens Next</h3>
                <ul style="margin: 0; padding-left: 20px; color: #166534;">
                    <li>Face groups are ready for AI analysis</li>
                    <li>When an interview completes, Face Summarization runs automatically</li>
                    <li>AI will identify people and relationships</li>
                    <li>Results will be added to the knowledge graph</li>
                </ul>
            </div>
            
            <div style="text-align: center;">
                <button onclick="this.closest('[style*=fixed]').remove()" style="
                    padding: 10px 30px;
                    background: #3b82f6;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 16px;
                    cursor: pointer;
                ">Got it!</button>
            </div>
        </div>
    `;
    
    // Remove any existing summary
    const existing = document.querySelector('[style*="Face Summarization Ready"]');
    if (existing) existing.remove();
    
    // Add summary to page
    const summaryDiv = document.createElement('div');
    summaryDiv.innerHTML = summaryHtml;
    document.body.appendChild(summaryDiv.firstElementChild);
}