#!/bin/bash

# Face Manager Service Deployment Script
# Deploys to Google Cloud Run

set -e

# Configuration
PROJECT_ID="infitwin"
SERVICE_NAME="face-manager-service"
REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 Deploying Face Manager Service to Cloud Run..."

# Build the application
echo "📦 Building TypeScript..."
npm run build

# Copy Firebase credentials
echo "🔑 Copying Firebase credentials..."
cp /home/tim/credentials/firebase-credentials.json ./firebase-credentials.json

# Build Docker image
echo "🐳 Building Docker image..."
docker build -t ${IMAGE_NAME} .

# Push to Google Container Registry
echo "📤 Pushing image to GCR..."
docker push ${IMAGE_NAME}

# Deploy to Cloud Run
echo "☁️ Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --port 8082 \
  --memory 512Mi \
  --max-instances 10 \
  --project ${PROJECT_ID} \
  --set-env-vars="NODE_ENV=production,FIREBASE_PROJECT_ID=${PROJECT_ID}"

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --platform managed \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --format 'value(status.url)')

echo "✅ Deployment complete!"
echo "📍 Service URL: ${SERVICE_URL}"
echo ""
echo "Update UI Studio integration module with production URL:"
echo "  ${SERVICE_URL}/api"

# Clean up local Firebase credentials
rm -f ./firebase-credentials.json

echo "🧹 Cleaned up temporary files"