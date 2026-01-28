# Deploy LeForge Unified Architecture to Remote Server
# PowerShell version

$REMOTE_HOST = "dan@10.0.0.166"
$REMOTE_DIR = "~/LeForge"

Write-Host "🚀 Deploying LeForge Unified Architecture to $REMOTE_HOST" -ForegroundColor Green
Write-Host ""

# Step 1: Copy unified files
Write-Host "📦 Step 1: Copying unified files to remote server..." -ForegroundColor Cyan

# Copy unified docker-compose
Write-Host "  - Copying docker-compose.unified.yml..."
scp docker-compose.unified.yml ${REMOTE_HOST}:${REMOTE_DIR}/

# Copy web-ui structure (using rsync if available, otherwise tar)
Write-Host "  - Copying web-ui/backend..."
scp -r web-ui/backend ${REMOTE_HOST}:${REMOTE_DIR}/web-ui/

Write-Host "  - Copying web-ui/frontend..."
scp -r web-ui/frontend ${REMOTE_HOST}:${REMOTE_DIR}/web-ui/

# Copy unified Dockerfile and package.json
Write-Host "  - Copying Dockerfile.unified and package.json..."
scp web-ui/Dockerfile.unified ${REMOTE_HOST}:${REMOTE_DIR}/web-ui/
scp web-ui/package.unified.json ${REMOTE_HOST}:${REMOTE_DIR}/web-ui/package.json

# Copy .env if exists
if (Test-Path .env) {
    Write-Host "  - Copying .env file..."
    scp .env ${REMOTE_HOST}:${REMOTE_DIR}/
}

Write-Host "✅ Files copied successfully" -ForegroundColor Green
Write-Host ""

# Step 2: Stop old services
Write-Host "🛑 Step 2: Stopping old services..." -ForegroundColor Cyan
ssh $REMOTE_HOST "cd $REMOTE_DIR && docker compose -f docker-compose.core.yml down 2>/dev/null || echo 'No old services running'"
Write-Host ""

# Step 3: Build and start
Write-Host "🏗️  Step 3: Building and starting unified LeForge..." -ForegroundColor Cyan
ssh $REMOTE_HOST "cd $REMOTE_DIR && docker compose -f docker-compose.unified.yml up -d --build"
Write-Host ""

# Step 4: Check status
Write-Host "⏳ Step 4: Waiting for services..." -ForegroundColor Cyan
Start-Sleep -Seconds 10
ssh $REMOTE_HOST "cd $REMOTE_DIR && docker compose -f docker-compose.unified.yml ps"
Write-Host ""

# Step 5: Test health
Write-Host "🧪 Step 5: Testing health endpoint..." -ForegroundColor Cyan
Start-Sleep -Seconds 5
try {
    $response = Invoke-WebRequest -Uri "http://10.0.0.166:3000/api/v1/health" -UseBasicParsing
    Write-Host "✅ Health check passed!" -ForegroundColor Green
    Write-Host $response.Content
} catch {
    Write-Host "❌ Health check failed: $_" -ForegroundColor Red
}
Write-Host ""

# Step 6: Show logs
Write-Host "📋 Step 6: Recent logs..." -ForegroundColor Cyan
ssh $REMOTE_HOST "docker logs LeForge --tail 50"
Write-Host ""

Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Access LeForge at: http://10.0.0.166:3000" -ForegroundColor Yellow
Write-Host "📊 View logs: docker context use LeForge-remote && docker logs LeForge -f"
Write-Host "🔍 Check status: docker context use LeForge-remote && docker compose -f docker-compose.unified.yml ps"
