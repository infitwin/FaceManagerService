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
    
    // REQUIRE credentials - no fallbacks
    if (!process.env.FIREBASE_CREDENTIALS) {
      throw new Error('FIREBASE_CREDENTIALS environment variable is required but not set');
    }
    
    console.log('🔑 Initializing Firebase with credentials from Secret Manager');
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    credential = admin.credential.cert(serviceAccount);
    
    // REQUIRE project ID - no fallbacks
    if (!process.env.FIREBASE_PROJECT_ID) {
      throw new Error('FIREBASE_PROJECT_ID environment variable is required but not set');
    }
    
    // Initialize Firebase Admin
    admin.initializeApp({
      credential: credential,
      projectId: process.env.FIREBASE_PROJECT_ID
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