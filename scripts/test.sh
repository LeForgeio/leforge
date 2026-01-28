#!/bin/bash
# LeForge Test Script

set -e

echo "🧪 Running LeForge tests..."

# Test Node.js services
echo "Testing crypto-service..."
cd services/crypto-service && npm test && cd ../..

# Test Python services
echo "Testing math-service..."
cd services/math-service && pytest && cd ../..

echo "✅ All tests passed!"
