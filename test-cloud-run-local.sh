#!/bin/bash
# Test script that simulates Cloud Run environment locally

echo "================================================"
echo "Testing Face Manager Service in Cloud Run mode"
echo "================================================"
echo ""

# Build the container
echo "📦 Building Docker container..."
docker build -t facemanager-cloudrun-test . || exit 1
echo "✅ Container built successfully"
echo ""

# Run the container with Cloud Run-like settings
echo "🚀 Starting container with Cloud Run settings..."
echo "   - PORT=8080 (Cloud Run requirement)"
echo "   - Memory limit: 512MB"
echo "   - Timeout simulation: 4 minutes"
echo ""

# Start container with resource limits similar to Cloud Run
CONTAINER_ID=$(docker run -d \
  --memory="512m" \
  --cpus="1" \
  -p 8080:8080 \
  -e PORT=8080 \
  -e NODE_ENV=production \
  -e FIREBASE_CREDENTIALS='{"type":"service_account","project_id":"infitwin","private_key":"fake-key-for-testing","client_email":"test@infitwin.iam.gserviceaccount.com"}' \
  -e FIREBASE_PROJECT_ID=infitwin \
  -e "AWS-ACCESS-KEY-ID=test-access-key" \
  -e "AWS-SECRET-ACCESS-KEY=test-secret-key" \
  -e AWS_REGION=us-east-1 \
  facemanager-cloudrun-test)

if [ -z "$CONTAINER_ID" ]; then
    echo "❌ Failed to start container"
    exit 1
fi

echo "Container ID: $CONTAINER_ID"
echo ""

# Function to check container status
check_container() {
    if ! docker ps | grep -q $CONTAINER_ID; then
        echo "❌ Container stopped unexpectedly!"
        echo "Container logs:"
        docker logs $CONTAINER_ID
        docker rm $CONTAINER_ID > /dev/null 2>&1
        exit 1
    fi
}

# Wait for container to start (simulate Cloud Run startup)
echo "⏳ Waiting for container to start (simulating Cloud Run startup)..."
STARTUP_TIMEOUT=240  # 4 minutes like Cloud Run
ELAPSED=0
READY=false

while [ $ELAPSED -lt $STARTUP_TIMEOUT ]; do
    # Check if container is still running
    check_container
    
    # Try to hit the health endpoint
    if curl -s -f http://localhost:8080/health > /dev/null 2>&1; then
        READY=true
        break
    fi
    
    sleep 2
    ELAPSED=$((ELAPSED + 2))
    
    # Show progress
    if [ $((ELAPSED % 10)) -eq 0 ]; then
        echo "   Still waiting... ($ELAPSED seconds elapsed)"
    fi
done

echo ""

if [ "$READY" = false ]; then
    echo "❌ Container failed to respond within $STARTUP_TIMEOUT seconds (Cloud Run timeout)"
    echo ""
    echo "Container logs:"
    docker logs --tail 50 $CONTAINER_ID
    docker stop $CONTAINER_ID > /dev/null 2>&1
    docker rm $CONTAINER_ID > /dev/null 2>&1
    exit 1
fi

echo "✅ Container started successfully in $ELAPSED seconds"
echo ""

# Test the health endpoint
echo "🏥 Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:8080/health)
echo "Response: $HEALTH_RESPONSE" | python -m json.tool 2>/dev/null || echo "Response: $HEALTH_RESPONSE"
echo ""

# Check memory usage
echo "💾 Checking resource usage..."
docker stats --no-stream $CONTAINER_ID
echo ""

# Test the API endpoint (this might fail without real Firebase)
echo "🔌 Testing API endpoint..."
API_RESPONSE=$(curl -s -X POST http://localhost:8080/api/process-faces \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "fileId": "test-file",
    "faces": [{
      "faceId": "face-123",
      "matchedFaceIds": [],
      "confidence": 99.5
    }]
  }' 2>/dev/null || echo "API call failed (expected without real Firebase)")
  
if [ ! -z "$API_RESPONSE" ]; then
    echo "API Response: $API_RESPONSE" | python -m json.tool 2>/dev/null || echo "API Response: $API_RESPONSE"
fi
echo ""

# Show container logs
echo "📋 Container logs (last 20 lines):"
docker logs --tail 20 $CONTAINER_ID
echo ""

# Cleanup
echo "🧹 Cleaning up..."
docker stop $CONTAINER_ID > /dev/null 2>&1
docker rm $CONTAINER_ID > /dev/null 2>&1
echo "✅ Container stopped and removed"
echo ""

echo "================================================"
echo "✅ Cloud Run simulation test completed!"
echo ""
echo "Summary:"
echo "- Container started in $ELAPSED seconds"
echo "- Health endpoint is responding"
echo "- Container runs within 512MB memory limit"
echo ""
echo "This container should work in Cloud Run!"
echo "================================================"