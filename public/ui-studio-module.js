/**
 * Face Manager API Integration for UI Studio
 * 
 * This module follows UI Studio's existing patterns for service integration.
 * It can be included in UI Studio pages to enable face grouping functionality.
 * 
 * Usage:
 * 1. Include this script in your UI Studio page:
 *    <script src="/js/services/face-manager-api.js"></script>
 * 
 * 2. Initialize and use:
 *    const faceManager = new FaceManagerAPI();
 *    await faceManager.processFaces(userId, fileId, faces);
 */

class FaceManagerAPI {
    constructor() {
        // Follow UI Studio's pattern for service URLs
        this.baseUrl = this.getBaseUrl();
        this.headers = {
            'Content-Type': 'application/json'
        };
        
        console.log('[FaceManagerAPI] Initialized with base URL:', this.baseUrl);
    }
    
    /**
     * Get the base URL based on environment
     * Follows UI Studio's development-config.js pattern
     */
    getBaseUrl() {
        const isDevelopment = window.location.hostname === 'localhost' || 
                            window.location.hostname === '127.0.0.1' ||
                            window.location.port === '8357';
        
        if (isDevelopment) {
            return 'http://localhost:8082/api';
        }
        
        // Production URL (will be updated when deployed to Cloud Run)
        return 'https://face-manager-service-833139648849.us-central1.run.app/api';
    }
    
    /**
     * Get Firebase auth token if available
     * Integrates with UI Studio's Firebase authentication
     */
    async getAuthToken() {
        // Check if Firebase auth is available (UI Studio pattern)
        if (typeof firebase !== 'undefined' && firebase.auth) {
            const user = firebase.auth().currentUser;
            if (user) {
                try {
                    return await user.getIdToken();
                } catch (error) {
                    console.warn('[FaceManagerAPI] Failed to get auth token:', error);
                }
            }
        }
        return null;
    }
    
    /**
     * Make an API request
     */
    async request(method, endpoint, data = null) {
        try {
            const options = {
                method,
                headers: { ...this.headers }
            };
            
            // Add auth token if available
            const token = await this.getAuthToken();
            if (token) {
                options.headers['Authorization'] = `Bearer ${token}`;
            }
            
            if (data && (method === 'POST' || method === 'PUT')) {
                options.body = JSON.stringify(data);
            }
            
            const response = await fetch(`${this.baseUrl}${endpoint}`, options);
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || `Request failed: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`[FaceManagerAPI] ${method} ${endpoint} failed:`, error);
            throw error;
        }
    }
    
    /**
     * Process faces with transitivity grouping
     * This is the main method called after face extraction
     * 
     * @param {string} userId - User ID
     * @param {string} fileId - File ID
     * @param {Array} faces - Array of face objects with faceId and matchedFaceIds
     * @returns {Promise} Response with groups
     */
    async processFaces(userId, fileId, faces) {
        console.log(`[FaceManagerAPI] Processing ${faces.length} faces for user ${userId}, file ${fileId}`);
        
        const response = await this.request('POST', '/process-faces', {
            userId,
            fileId,
            faces
        });
        
        if (response.success) {
            console.log(`[FaceManagerAPI] Successfully grouped ${faces.length} faces into ${response.groups.length} groups`);
        }
        
        return response;
    }
    
    /**
     * Get all groups for a user
     */
    async getGroups(userId) {
        return await this.request('GET', `/groups/${userId}`);
    }
    
    /**
     * Get a specific group
     */
    async getGroup(userId, groupId) {
        return await this.request('GET', `/groups/${userId}/${groupId}`);
    }
    
    /**
     * Merge multiple groups
     */
    async mergeGroups(userId, groupIds) {
        return await this.request('POST', `/groups/${userId}/merge`, {
            groupIds
        });
    }
    
    /**
     * Helper method to format faces from AWS Rekognition response
     * Converts AWS response to our expected format
     */
    formatAwsFaces(awsFaces) {
        return awsFaces.map(face => ({
            faceId: face.FaceId,
            matchedFaceIds: face.MatchedFaces ? face.MatchedFaces.map(m => m.FaceId) : [],
            confidence: face.Confidence,
            boundingBox: face.BoundingBox
        }));
    }
    
    /**
     * Integration helper for UI Studio's Face Analysis page
     * Call this after receiving faces from Artifact Processor
     */
    async integrateWithFaceAnalysis(userId, fileId, extractedFaces) {
        console.log('[FaceManagerAPI] Integrating with Face Analysis page');
        
        try {
            // Format faces if they're from AWS
            const formattedFaces = this.formatAwsFaces(extractedFaces);
            
            // Process with transitivity
            const result = await this.processFaces(userId, fileId, formattedFaces);
            
            // Update UI with groups (if elements exist)
            if (typeof updateFaceGroups === 'function') {
                updateFaceGroups(result.groups);
            }
            
            return result;
        } catch (error) {
            console.error('[FaceManagerAPI] Integration failed:', error);
            throw error;
        }
    }
    
    /**
     * Check service health
     */
    async checkHealth() {
        try {
            const response = await fetch(this.baseUrl.replace('/api', '/health'));
            return await response.json();
        } catch (error) {
            console.error('[FaceManagerAPI] Health check failed:', error);
            return { status: 'error', message: error.message };
        }
    }
}

// Export for UI Studio pages
if (typeof window !== 'undefined') {
    window.FaceManagerAPI = FaceManagerAPI;
    
    // Auto-initialize if UI Studio patterns are detected
    if (window.isDevelopment && window.getOrchestratorUrl) {
        console.log('[FaceManagerAPI] UI Studio environment detected, module ready for use');
    }
}

// For module imports (if UI Studio uses modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FaceManagerAPI;
}