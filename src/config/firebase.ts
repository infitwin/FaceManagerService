/**
 * Firebase Configuration
 * Initializes Firebase Admin SDK with service account credentials
 */

import * as admin from 'firebase-admin';
import * as path from 'path';

let db: admin.firestore.Firestore | null = null;

export function initializeFirebase(): void {
  try {
    let credential;
    
    // Check if running in Cloud Run with Secret Manager
    if (process.env.FIREBASE_CREDENTIALS) {
      console.log('🔑 Initializing Firebase with credentials from Secret Manager');
      const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
      credential = admin.credential.cert(serviceAccount);
    } else {
      // Fall back to local file for development
      const credentialsPath = process.env.FIREBASE_CREDENTIALS_PATH || 
                            path.join(__dirname, '../../firebase-credentials.json');
      console.log('🔑 Initializing Firebase with credentials from file:', credentialsPath);
      credential = admin.credential.cert(credentialsPath);
    }
    
    // Initialize Firebase Admin
    admin.initializeApp({
      credential: credential,
      projectId: process.env.FIREBASE_PROJECT_ID || 'infitwin'
    });
    
    // Initialize Firestore
    db = admin.firestore();
    
    // Set Firestore settings
    db.settings({
      ignoreUndefinedProperties: true
    });
    
    console.log('✅ Firebase initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase:', error);
    throw error;
  }
}

export function getDb(): admin.firestore.Firestore {
  if (!db) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return db;
}

export function getAdmin(): typeof admin {
  return admin;
}