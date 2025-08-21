/**
 * Face Manager Service Test Application
 * Client-side JavaScript for testing the Face Manager API
 */

// Configuration
const API_BASE_URL = 'http://localhost:8082/api';
const DEFAULT_TEST_USER = 'zsvLTeIPJUYGnZHzWX7hVtLJlJX2';

// DOM Elements
let statusIndicator, statusText, testUserId, responseViewer, groupsVisualization;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    statusIndicator = document.getElementById('statusIndicator');
    statusText = document.getElementById('statusText');
    testUserId = document.getElementById('testUserId');
    responseViewer = document.getElementById('responseViewer');
    groupsVisualization = document.getElementById('groupsVisualization');
    
    // Set test user ID
    testUserId.textContent = DEFAULT_TEST_USER;
    
    // Check connection and get initial status
    checkHealth();
    getStatus();
});

/**
 * Make API request
 */
async function apiRequest(method, endpoint, body = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        const data = await response.json();
        
        // Update response viewer
        responseViewer.textContent = JSON.stringify(data, null, 2);
        
        return data;
    } catch (error) {
        console.error('API request failed:', error);
        responseViewer.textContent = `Error: ${error.message}`;
        updateStatus(false);
        throw error;
    }
}

/**
 * Check health status
 */
async function checkHealth() {
    try {
        const response = await fetch('http://localhost:8082/health');
        const data = await response.json();
        
        updateStatus(true);
        responseViewer.textContent = JSON.stringify(data, null, 2);
    } catch (error) {
        updateStatus(false);
        responseViewer.textContent = `Health check failed: ${error.message}`;
    }
}

/**
 * Update connection status
 */
function updateStatus(connected) {
    if (connected) {
        statusIndicator.classList.add('connected');
        statusText.textContent = 'Connected';
    } else {
        statusIndicator.classList.remove('connected');
        statusText.textContent = 'Disconnected';
    }
}

/**
 * Run a test scenario
 */
async function runTest(scenario) {
    const userId = document.getElementById('customUserId').value || DEFAULT_TEST_USER;
    
    showLoading(true);
    
    try {
        const data = await apiRequest('POST', '/test/generate', {
            scenario,
            userId
        });
        
        if (data.success) {
            await visualizeGroups(data.groups);
            showMessage(`✅ ${scenario} test completed: ${data.generatedFaces} faces → ${data.resultingGroups} groups`);
        }
    } catch (error) {
        showMessage(`❌ Test failed: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Get current status
 */
async function getStatus() {
    showLoading(true);
    
    try {
        const data = await apiRequest('GET', '/test/status');
        
        if (data.success) {
            visualizeGroups(data.groups);
            showMessage(`📊 Status: ${data.totalGroups} groups, ${data.totalFaces} total faces`);
        }
    } catch (error) {
        showMessage(`❌ Failed to get status: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Get all groups for user
 */
async function getAllGroups() {
    const userId = document.getElementById('customUserId').value || DEFAULT_TEST_USER;
    
    showLoading(true);
    
    try {
        const data = await apiRequest('GET', `/groups/${userId}`);
        
        if (data.success) {
            visualizeGroups(data.groups);
            showMessage(`📁 Found ${data.groupCount} groups for user ${userId}`);
        }
    } catch (error) {
        showMessage(`❌ Failed to get groups: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Reset test data
 */
async function resetTestData() {
    if (!confirm('Are you sure you want to reset all test data?')) {
        return;
    }
    
    const userId = document.getElementById('customUserId').value || DEFAULT_TEST_USER;
    
    showLoading(true);
    
    try {
        const data = await apiRequest('DELETE', `/test/reset/${userId}`);
        
        if (data.success) {
            groupsVisualization.innerHTML = '<p>No groups yet. Run a test scenario to create groups.</p>';
            showMessage(`🗑️ Reset complete: ${data.deletedCount} groups deleted`);
        }
    } catch (error) {
        showMessage(`❌ Reset failed: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Visualize groups
 */
function visualizeGroups(groups) {
    if (!groups || groups.length === 0) {
        groupsVisualization.innerHTML = '<p>No groups found. Run a test scenario to create groups.</p>';
        return;
    }
    
    let html = '';
    
    groups.forEach((group, index) => {
        const faceIds = group.faceIds || [];
        const faceCount = group.faceCount || faceIds.length;
        
        html += `
            <div class="group-item">
                <div class="group-header">
                    <span>Group ${index + 1}: ${group.groupId.substring(0, 20)}...</span>
                    <span>${faceCount} faces</span>
                </div>
                <div class="face-list">
                    ${faceIds.map(faceId => `
                        <span class="face-chip">${faceId}</span>
                    `).join('')}
                </div>
            </div>
        `;
    });
    
    groupsVisualization.innerHTML = html;
}

/**
 * Show loading state
 */
function showLoading(show) {
    const loadingElements = document.querySelectorAll('.loading');
    loadingElements.forEach(el => {
        if (show) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
}

/**
 * Show message
 */
function showMessage(message, type = 'success') {
    console.log(message);
    // You could add a toast notification here
}

// Test the transitivity with a custom scenario
async function testTransitivity() {
    const userId = document.getElementById('customUserId').value || DEFAULT_TEST_USER;
    
    // Create a specific transitivity test
    const faces = [
        { faceId: 'face_A', matchedFaceIds: [] },
        { faceId: 'face_B', matchedFaceIds: ['face_A'] },
        { faceId: 'face_C', matchedFaceIds: ['face_B'] },
        { faceId: 'face_D', matchedFaceIds: ['face_C'] }
    ];
    
    showLoading(true);
    
    try {
        const data = await apiRequest('POST', '/process-faces', {
            userId,
            fileId: `test_file_${Date.now()}`,
            faces
        });
        
        if (data.success) {
            visualizeGroups(data.groups);
            
            // Check if transitivity worked
            if (data.groups.length === 1 && data.groups[0].faceCount === 4) {
                showMessage('✅ Transitivity test PASSED! All 4 faces in single group.');
            } else {
                showMessage(`⚠️ Transitivity test FAILED! Got ${data.groups.length} groups instead of 1.`, 'error');
            }
        }
    } catch (error) {
        showMessage(`❌ Transitivity test failed: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}