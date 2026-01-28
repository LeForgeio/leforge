#!/bin/bash
# LeForge Development Start Script

set -e

echo "🔥 Starting LeForge in development mode..."

# Start infrastructure services first
docker-compose up -d postgres redis qdrant

# Wait for databases
echo "Waiting for databases..."
sleep 5

# Start all services with development overrides
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

echo "Development environment started!"
echo "API Gateway: http://localhost:8000"
echo "Web UI: http://localhost:3000"
