#!/bin/bash
# Pre-deployment script for Face Manager Service
# Run this before deploying to Cloud Run

echo "=========================================="
echo "Face Manager Service - Pre-deployment Check"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track if we have any errors
HAS_ERRORS=0

# 1. Check Node version
echo "1️⃣  Checking Node.js version..."
NODE_VERSION=$(node --version)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1 | sed 's/v//')
if [ $NODE_MAJOR -lt 18 ]; then
    echo -e "   ${RED}❌ Node.js $NODE_VERSION is too old. Need v18+${NC}"
    HAS_ERRORS=1
else
    echo -e "   ${GREEN}✅ Node.js $NODE_VERSION${NC}"
fi
echo ""

# 2. Check npm packages are installed
echo "2️⃣  Checking npm packages..."
if [ ! -d "node_modules" ]; then
    echo -e "   ${RED}❌ node_modules not found. Run: npm install${NC}"
    HAS_ERRORS=1
else
    echo -e "   ${GREEN}✅ node_modules exists${NC}"
fi
echo ""

# 3. Build TypeScript
echo "3️⃣  Building TypeScript..."
npm run build
if [ $? -ne 0 ]; then
    echo -e "   ${RED}❌ TypeScript build failed${NC}"
    HAS_ERRORS=1
else
    echo -e "   ${GREEN}✅ TypeScript build successful${NC}"
fi
echo ""

# 4. Run import tests
echo "4️⃣  Running import tests..."
node test_deploy.js
if [ $? -ne 0 ]; then
    echo -e "   ${RED}❌ Import tests failed${NC}"
    HAS_ERRORS=1
else
    echo -e "   ${GREEN}✅ Import tests passed${NC}"
fi
echo ""

# 5. Test Docker build
echo "5️⃣  Testing Docker build..."
docker build -t facemanager-test . > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "   ${RED}❌ Docker build failed${NC}"
    HAS_ERRORS=1
else
    echo -e "   ${GREEN}✅ Docker build successful${NC}"
    
    # Test Docker run
    echo "   Testing Docker container startup..."
    
    # Start container in background
    CONTAINER_ID=$(docker run -d \
        -e PORT=8080 \
        -e FIREBASE_CREDENTIALS='{"type":"service_account","project_id":"test","private_key":"test","client_email":"test@test.iam.gserviceaccount.com"}' \
        -e FIREBASE_PROJECT_ID=test \
        -p 8080:8080 \
        facemanager-test 2>/dev/null)
    
    if [ -z "$CONTAINER_ID" ]; then
        echo -e "   ${RED}❌ Failed to start container${NC}"
        HAS_ERRORS=1
    else
        # Wait a moment for container to start
        sleep 3
        
        # Check if container is still running
        if docker ps | grep -q $CONTAINER_ID; then
            echo -e "   ${GREEN}✅ Container started successfully${NC}"
            
            # Test health endpoint
            echo "   Testing health endpoint..."
            HEALTH_RESPONSE=$(curl -s http://localhost:8080/health 2>/dev/null)
            if echo "$HEALTH_RESPONSE" | grep -q "Face Manager Service"; then
                echo -e "   ${GREEN}✅ Health endpoint responding${NC}"
                echo "   Response: $(echo $HEALTH_RESPONSE | jq -c . 2>/dev/null || echo $HEALTH_RESPONSE)"
            else
                echo -e "   ${RED}❌ Health endpoint not responding${NC}"
                HAS_ERRORS=1
            fi
            
            # Stop container
            docker stop $CONTAINER_ID > /dev/null 2>&1
            docker rm $CONTAINER_ID > /dev/null 2>&1
        else
            echo -e "   ${RED}❌ Container crashed immediately${NC}"
            echo "   Container logs:"
            docker logs $CONTAINER_ID 2>&1 | head -20
            docker rm $CONTAINER_ID > /dev/null 2>&1
            HAS_ERRORS=1
        fi
    fi
fi
echo ""

# 6. Check Cloud Run configuration
echo "6️⃣  Checking Cloud Run readiness..."
echo "   Environment variables needed in Secret Manager:"
echo "   - FIREBASE_CREDENTIALS (JSON service account)"
echo "   - FIREBASE_APP_ID"
echo "   - AWS-ACCESS-KEY-ID"
echo "   - AWS-SECRET-ACCESS-KEY"
echo "   - AWS_REGION"
echo ""

# 7. Check current Git status
echo "7️⃣  Checking Git status..."
if [ -n "$(git status --porcelain)" ]; then
    echo -e "   ${YELLOW}⚠️  Uncommitted changes found:${NC}"
    git status --short
    echo -e "   ${YELLOW}Consider committing before deploying${NC}"
else
    echo -e "   ${GREEN}✅ Working directory clean${NC}"
fi

CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "   ${YELLOW}⚠️  Not on main branch (current: $CURRENT_BRANCH)${NC}"
fi
echo ""

# Final summary
echo "=========================================="
if [ $HAS_ERRORS -eq 1 ]; then
    echo -e "${RED}❌ PRE-DEPLOYMENT CHECKS FAILED${NC}"
    echo "Fix the issues above before deploying to Cloud Run"
    exit 1
else
    echo -e "${GREEN}✅ ALL CHECKS PASSED!${NC}"
    echo ""
    echo "Ready to deploy to Cloud Run!"
    echo "Next steps:"
    echo "1. Commit and push your changes:"
    echo "   git add -A && git commit -m 'your message' && git push"
    echo ""
    echo "2. The service will auto-deploy from GitHub"
    echo ""
    echo "3. Monitor deployment at:"
    echo "   https://console.cloud.google.com/cloud-build/builds?project=infitwin"
    echo ""
    echo "4. Check service logs at:"
    echo "   https://console.cloud.google.com/run/detail/us-central1/facemanagerservice/logs?project=infitwin"
fi