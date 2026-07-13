/**
 * Firebase Configuration
 * Initializes Firebase Admin SDK with service account credentials
 */

import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

let db: admin.firestore.Firestore | null = null;

export function initializeFirebase(): void {
  try {
    // Debug: Log all environment variables that might be relevant
    console.log('🔍 Environment variables check:');
    console.log('  FIREBASE_CREDENTIALS:', process.env.FIREBASE_CREDENTIALS ? 'Set (JSON string)' : 'NOT SET');
    console.log('  FIREBASE_CREDENTIALS_PATH:', process.env.FIREBASE_CREDENTIALS_PATH ? 'Set (file path)' : 'NOT SET');
    console.log('  FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? 'Set' : 'NOT SET');
    console.log('  FIREBASE_APP_ID:', process.env.FIREBASE_APP_ID ? 'Set' : 'NOT SET');
    console.log('  PORT:', process.env.PORT);
    console.log('  NODE_ENV:', process.env.NODE_ENV);

    // Also check if Secret Manager might be using different names
    const envKeys = Object.keys(process.env).filter(key =>
      key.includes('FIREBASE') || key.includes('firebase') ||
      key.includes('AWS') || key.includes('aws')
    );
    if (envKeys.length > 0) {
      console.log('  Related env vars found:', envKeys);
    }

    let credential;
    let serviceAccount;

    // Support both cloud (JSON string) and local (file path) modes
    if (process.env.FIREBASE_CREDENTIALS) {
      // Cloud mode: credentials from Secret Manager (JSON string)
      console.log('🔑 Initializing Firebase with credentials from Secret Manager (JSON string)');
      serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
      credential = admin.credential.cert(serviceAccount);
    } else if (process.env.FIREBASE_CREDENTIALS_PATH) {
      // Local mode: credentials from file path
      const credentialsPath = process.env.FIREBASE_CREDENTIALS_PATH;
      console.log(`🔑 Initializing Firebase with credentials from file: ${credentialsPath}`);

      if (!fs.existsSync(credentialsPath)) {
        throw new Error(`Credentials file not found at: ${credentialsPath}`);
      }

      const credentialsContent = fs.readFileSync(credentialsPath, 'utf8');
      serviceAccount = JSON.parse(credentialsContent);
      credential = admin.credential.cert(serviceAccount);
    } else {
      throw new Error('Either FIREBASE_CREDENTIALS (JSON string) or FIREBASE_CREDENTIALS_PATH (file path) environment variable is required');
    }
    
    // Get project ID from environment or fall back to service account
    const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;
    
    if (!projectId) {
      throw new Error('Could not determine Firebase project ID from FIREBASE_PROJECT_ID env var or service account credentials');
    }
    
    console.log(`📌 Using Firebase project ID: ${projectId}`);
    
    // Initialize Firebase Admin
    admin.initializeApp({
      credential: credential,
      projectId: projectId
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
    // Re-throw the error so the caller can handle it
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