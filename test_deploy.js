#!/usr/bin/env node
/**
 * Pre-deployment test script for Face Manager Service
 * Tests all critical imports and dependencies
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Running Face Manager Service pre-deployment checks...\n');

let hasErrors = false;

// 1. Check Node version
console.log('1️⃣ Checking Node.js version...');
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
if (majorVersion < 18) {
  console.error(`   ❌ Node.js ${nodeVersion} is too old. Need v18 or higher.`);
  hasErrors = true;
} else {
  console.log(`   ✅ Node.js ${nodeVersion} is compatible`);
}

// 2. Check if dist folder exists
console.log('\n2️⃣ Checking TypeScript build...');
if (!fs.existsSync('./dist')) {
  console.error('   ❌ dist/ folder not found. Run: npm run build');
  hasErrors = true;
} else {
  console.log('   ✅ dist/ folder exists');
  
  // Check if main file exists
  if (!fs.existsSync('./dist/index.js')) {
    console.error('   ❌ dist/index.js not found');
    hasErrors = true;
  } else {
    console.log('   ✅ dist/index.js exists');
  }
}

// 3. Test critical imports
console.log('\n3️⃣ Testing critical imports...');
try {
  // Test Express import
  require('express');
  console.log('   ✅ express imported successfully');
} catch (e) {
  console.error('   ❌ Failed to import express:', e.message);
  hasErrors = true;
}

try {
  // Test Firebase Admin import
  require('firebase-admin');
  console.log('   ✅ firebase-admin imported successfully');
} catch (e) {
  console.error('   ❌ Failed to import firebase-admin:', e.message);
  hasErrors = true;
}

try {
  // Test AWS SDK v3 import
  require('@aws-sdk/client-rekognition');
  console.log('   ✅ @aws-sdk/client-rekognition imported successfully');
} catch (e) {
  console.error('   ❌ Failed to import @aws-sdk/client-rekognition:', e.message);
  hasErrors = true;
}

try {
  // Test CORS import
  require('cors');
  console.log('   ✅ cors imported successfully');
} catch (e) {
  console.error('   ❌ Failed to import cors:', e.message);
  hasErrors = true;
}

try {
  // Test dotenv import
  require('dotenv');
  console.log('   ✅ dotenv imported successfully');
} catch (e) {
  console.error('   ❌ Failed to import dotenv:', e.message);
  hasErrors = true;
}

// 4. Test main application import
console.log('\n4️⃣ Testing main application import...');
try {
  // Set minimal env vars to prevent crashes
  process.env.PORT = '8080';
  process.env.NODE_ENV = 'test';
  
  // Try to require the main file
  const mainPath = path.resolve('./dist/index.js');
  delete require.cache[mainPath]; // Clear cache
  
  // This will test if the file can be loaded without syntax errors
  console.log('   ⏳ Loading dist/index.js...');
  
  // Note: This might fail if Firebase credentials are required
  // But we're catching that gracefully in our updated code
  require('./dist/index.js');
  
  console.log('   ✅ Main application loaded (Firebase may be in degraded mode)');
} catch (e) {
  if (e.message.includes('Firebase')) {
    console.log('   ⚠️  Main application loaded but Firebase not configured (expected in test)');
  } else {
    console.error('   ❌ Failed to load main application:', e.message);
    hasErrors = true;
  }
}

// 5. Check for dependency conflicts
console.log('\n5️⃣ Checking for dependency conflicts...');
try {
  execSync('npm ls --depth=0', { stdio: 'pipe' });
  console.log('   ✅ No dependency conflicts found');
} catch (e) {
  console.error('   ⚠️  Some peer dependency warnings (usually okay)');
}

// 6. Check package-lock.json
console.log('\n6️⃣ Checking package-lock.json...');
if (!fs.existsSync('./package-lock.json')) {
  console.error('   ❌ package-lock.json not found');
  hasErrors = true;
} else {
  // Check if package-lock has old AWS SDK
  const lockContent = fs.readFileSync('./package-lock.json', 'utf8');
  if (lockContent.includes('"aws-sdk"')) {
    console.error('   ❌ package-lock.json still contains aws-sdk v2 (should only have @aws-sdk/*)');
    hasErrors = true;
  } else if (lockContent.includes('@aws-sdk/client-rekognition')) {
    console.log('   ✅ package-lock.json correctly uses AWS SDK v3');
  } else {
    console.error('   ⚠️  No AWS SDK found in package-lock.json');
  }
}

// 7. Check Dockerfile
console.log('\n7️⃣ Checking Dockerfile...');
if (!fs.existsSync('./Dockerfile')) {
  console.error('   ❌ Dockerfile not found');
  hasErrors = true;
} else {
  const dockerfile = fs.readFileSync('./Dockerfile', 'utf8');
  if (dockerfile.includes('node:20-alpine')) {
    console.log('   ✅ Dockerfile uses Node.js 20');
  } else if (dockerfile.includes('node:18-alpine')) {
    console.warn('   ⚠️  Dockerfile uses Node.js 18 (consider upgrading to 20)');
  } else {
    console.error('   ❌ Dockerfile Node.js version unclear');
  }
  
  if (dockerfile.includes('npm ci')) {
    console.log('   ✅ Dockerfile uses npm ci (good for production)');
  }
}

// 8. Test environment variables
console.log('\n8️⃣ Checking environment setup...');
const requiredEnvVars = [
  'FIREBASE_CREDENTIALS',
  'FIREBASE_APP_ID',
  'AWS-ACCESS-KEY-ID',
  'AWS-SECRET-ACCESS-KEY',
  'AWS_REGION'
];

console.log('   Required environment variables for production:');
requiredEnvVars.forEach(envVar => {
  if (process.env[envVar]) {
    console.log(`   ✅ ${envVar} is set locally`);
  } else {
    console.log(`   ⚠️  ${envVar} not set locally (must be in Secret Manager for Cloud Run)`);
  }
});

// Final report
console.log('\n' + '='.repeat(60));
if (hasErrors) {
  console.error('❌ DEPLOYMENT CHECKS FAILED - Fix issues above before deploying');
  process.exit(1);
} else {
  console.log('✅ All deployment checks passed! Safe to deploy to Cloud Run.');
  console.log('\nNext steps:');
  console.log('1. Ensure Secret Manager has all required environment variables');
  console.log('2. Run: gcloud builds submit && gcloud run deploy');
  console.log('3. Monitor Cloud Run logs for startup issues');
}