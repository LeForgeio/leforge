#!/bin/bash
# Deploy LeForge Unified Architecture to Remote Server

set -e  # Exit on error

REMOTE_HOST="dan@10.0.0.115"
REMOTE_DIR="~/LeForge"
LOCAL_DIR="."

echo "🚀 Deploying LeForge Unified Architecture to $REMOTE_HOST"
echo ""

# Step 1: Copy unified files to remote
echo "📦 Step 1: Copying unified files to remote server..."

# Copy unified docker-compose
scp docker-compose.unified.yml $REMOTE_HOST:$REMOTE_DIR/

# Copy unified web-ui structure
echo "  - Copying web-ui/backend..."
rsync -avz --delete web-ui/backend/ $REMOTE_HOST:$REMOTE_DIR/web-ui/backend/

echo "  - Copying web-ui/frontend..."
rsync -avz --delete web-ui/frontend/ $REMOTE_HOST:$REMOTE_DIR/web-ui/frontend/

# Copy unified Dockerfile and package.json
scp web-ui/Dockerfile.unified $REMOTE_HOST:$REMOTE_DIR/web-ui/
scp web-ui/package.unified.json $REMOTE_HOST:$REMOTE_DIR/web-ui/package.json

# Copy .env if it exists
if [ -f .env ]; then
    echo "  - Copying .env file..."
    scp .env $REMOTE_HOST:$REMOTE_DIR/
fi

echo "✅ Files copied successfully"
echo ""

# Step 2: Stop old services (if running)
echo "🛑 Step 2: Stopping old services..."
ssh $REMOTE_HOST "cd $REMOTE_DIR && docker compose -f docker-compose.core.yml down 2>/dev/null || echo 'No old services running'"
echo ""

# Step 3: Build and start unified services
echo "🏗️  Step 3: Building and starting unified LeForge..."
ssh $REMOTE_HOST "cd $REMOTE_DIR && docker compose -f docker-compose.unified.yml up -d --build"
echo ""

# Step 4: Wait for services to be healthy
echo "⏳ Step 4: Waiting for services to be healthy..."
sleep 10
ssh $REMOTE_HOST "cd $REMOTE_DIR && docker compose -f docker-compose.unified.yml ps"
echo ""

# Step 5: Test health endpoint
echo "🧪 Step 5: Testing health endpoint..."
sleep 5
curl -f http://10.0.0.115:3000/api/v1/health && echo "✅ Health check passed!" || echo "❌ Health check failed"
echo ""

# Step 6: Show logs
echo "📋 Step 6: Showing recent logs..."
ssh $REMOTE_HOST "cd $REMOTE_DIR && docker logs LeForge --tail 50"
echo ""

echo "✅ Deployment complete!"
echo ""
echo "🌐 Access LeForge at: http://10.0.0.115:3000"
echo "📊 View logs: docker context use LeForge-remote && docker logs LeForge -f"
echo "🔍 Check status: docker context use LeForge-remote && docker compose -f docker-compose.unified.yml ps"
