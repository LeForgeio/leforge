#!/usr/bin/env pwsh
# ===========================================
# LeForge Update Script
# ===========================================
# Updates the LeForge container while preserving:
#   - PostgreSQL data (users, settings, plugin configs)
#   - Redis data (cache, sessions)
#   - Plugin data (embedded plugins, uploaded files)
#   - Plugin containers (managed separately)
#
# Usage:
#   ./update.ps1              # Build and update
#   ./update.ps1 -Pull        # Pull from registry and update
#   ./update.ps1 -NoBuild     # Update without rebuilding
# ===========================================

param(
    [switch]$Pull,      # Pull image from registry instead of building
    [switch]$NoBuild,   # Skip build, just restart with existing image
    [switch]$Force      # Force recreation even if no changes
)

$ErrorActionPreference = "Stop"
$ComposeFile = "docker-compose.unified.yml"
$ServiceName = "leforge"
$ContainerName = "leforge-app"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " LeForge Update" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check if compose file exists
if (-not (Test-Path $ComposeFile)) {
    Write-Host "Error: $ComposeFile not found" -ForegroundColor Red
    exit 1
}

# Show current status
Write-Host "Current container status:" -ForegroundColor Yellow
docker ps --filter "name=$ContainerName" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
Write-Host ""

# Show volumes (these will be preserved)
Write-Host "Persistent volumes (will be preserved):" -ForegroundColor Green
docker volume ls --filter "name=leforge" --format "  - {{.Name}}"
Write-Host ""

if ($Pull) {
    # Pull from registry
    Write-Host "Pulling latest image..." -ForegroundColor Yellow
    docker compose -f $ComposeFile pull
} elseif (-not $NoBuild) {
    # Build new image
    Write-Host "Building new image..." -ForegroundColor Yellow
    docker compose -f $ComposeFile build
}

# Gracefully stop the container (allows cleanup)
Write-Host "Stopping container gracefully..." -ForegroundColor Yellow
docker compose -f $ComposeFile stop $ServiceName

# Remove container only (NOT volumes)
Write-Host "Removing old container..." -ForegroundColor Yellow
docker compose -f $ComposeFile rm -f $ServiceName

# Start with new image
Write-Host "Starting updated container..." -ForegroundColor Yellow
docker compose -f $ComposeFile up -d $ServiceName

# Wait for health check
Write-Host "Waiting for health check..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
do {
    Start-Sleep -Seconds 2
    $attempt++
    $status = docker inspect --format "{{.State.Health.Status}}" $ContainerName 2>$null
    Write-Host "  Attempt $attempt/$maxAttempts - Status: $status"
} while ($status -ne "healthy" -and $attempt -lt $maxAttempts)

if ($status -eq "healthy") {
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host " Update complete! Container is healthy." -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Red
    Write-Host " Warning: Container may not be healthy yet" -ForegroundColor Red
    Write-Host " Check logs with: docker logs $ContainerName" -ForegroundColor Red
    Write-Host "=============================================" -ForegroundColor Red
}

# Show final status
Write-Host ""
Write-Host "Final status:" -ForegroundColor Yellow
docker ps --filter "name=$ContainerName" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
