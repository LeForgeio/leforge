#!/bin/bash
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
#   ./update.sh              # Build and update
#   ./update.sh --pull       # Pull from registry and update
#   ./update.sh --no-build   # Update without rebuilding
# ===========================================

set -e

COMPOSE_FILE="docker-compose.unified.yml"
SERVICE_NAME="leforge"
CONTAINER_NAME="leforge-app"

# Parse arguments
PULL=false
NO_BUILD=false

for arg in "$@"; do
    case $arg in
        --pull)
            PULL=true
            ;;
        --no-build)
            NO_BUILD=true
            ;;
    esac
done

echo "============================================="
echo " LeForge Update"
echo "============================================="
echo ""

# Check if compose file exists
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "Error: $COMPOSE_FILE not found"
    exit 1
fi

# Show current status
echo "Current container status:"
docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
echo ""

# Show volumes (these will be preserved)
echo "Persistent volumes (will be preserved):"
docker volume ls --filter "name=leforge" --format "  - {{.Name}}"
echo ""

if [ "$PULL" = true ]; then
    # Pull from registry
    echo "Pulling latest image..."
    docker compose -f $COMPOSE_FILE pull
elif [ "$NO_BUILD" = false ]; then
    # Build new image
    echo "Building new image..."
    docker compose -f $COMPOSE_FILE build
fi

# Gracefully stop the container (allows cleanup)
echo "Stopping container gracefully..."
docker compose -f $COMPOSE_FILE stop $SERVICE_NAME

# Remove container only (NOT volumes)
echo "Removing old container..."
docker compose -f $COMPOSE_FILE rm -f $SERVICE_NAME

# Start with new image
echo "Starting updated container..."
docker compose -f $COMPOSE_FILE up -d $SERVICE_NAME

# Wait for health check
echo "Waiting for health check..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    sleep 2
    attempt=$((attempt + 1))
    status=$(docker inspect --format "{{.State.Health.Status}}" $CONTAINER_NAME 2>/dev/null || echo "unknown")
    echo "  Attempt $attempt/$max_attempts - Status: $status"
    if [ "$status" = "healthy" ]; then
        break
    fi
done

if [ "$status" = "healthy" ]; then
    echo ""
    echo "============================================="
    echo " Update complete! Container is healthy."
    echo "============================================="
else
    echo ""
    echo "============================================="
    echo " Warning: Container may not be healthy yet"
    echo " Check logs with: docker logs $CONTAINER_NAME"
    echo "============================================="
fi

# Show final status
echo ""
echo "Final status:"
docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
