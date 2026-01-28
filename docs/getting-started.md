# Getting Started with LeForge

This guide will help you get LeForge up and running quickly.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher
- **Git**: For cloning the repository
- **4GB+ RAM**: Recommended for running all services

### Verify Installation

```bash
# Check Docker version
docker --version
# Expected: Docker version 20.10.x or higher

# Check Docker Compose version
docker compose version
# Expected: Docker Compose version v2.x.x

# Ensure Docker is running
docker info
```

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/LeForgeio/leforge.git
cd LeForge
```

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file with your preferred settings (optional for development)
# nano .env
```

### 3. Start All Services

```bash
# Start in detached mode
docker-compose up -d

# Watch the logs
docker-compose logs -f
```

### 4. Verify Services

Wait for all services to be healthy (usually 1-2 minutes):

```bash
# Check service status
docker-compose ps

# Expected output:
# NAME                        STATUS
# LeForge-kong              healthy
# LeForge-postgres          healthy
# LeForge-redis             healthy
# LeForge-qdrant            healthy
# LeForge-crypto-service    healthy
# LeForge-math-service      healthy
# ... (other services)
```

### 5. Access the Services

| Service | URL | Description |
|---------|-----|-------------|
| Web UI | http://localhost:3000 | Management dashboard |
| API Gateway | http://localhost:8000 | Main API endpoint |
| Kong Admin | http://localhost:8001 | Gateway administration |

## Your First API Call

### Test the Health Endpoint

```bash
curl http://localhost:8000/api/v1/crypto/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "crypto-service",
  "version": "1.0.0",
  "timestamp": "2026-01-17T12:00:00.000Z"
}
```

### Hash Some Data

```bash
curl -X POST http://localhost:8000/api/v1/crypto/hash \
  -H "Content-Type: application/json" \
  -d '{
    "algorithm": "sha256",
    "data": "Hello, LeForge!"
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "hash": "8f7d9a3b2c1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a",
    "algorithm": "sha256",
    "encoding": "hex"
  },
  "requestId": "req-abc123"
}
```

### Perform a Calculation

```bash
curl -X POST http://localhost:8000/api/v1/math/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "expression": "2 + 2 * 3",
    "precision": 2
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "result": 8,
    "expression": "2 + 2 * 3"
  },
  "requestId": "req-def456"
}
```

## Development Mode

For active development with hot reload:

```bash
# Start with development overrides
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Or use the helper script
./scripts/start-dev.sh
```

Development mode includes:
- Hot reload for all services
- Debug ports exposed
- Adminer for database management (http://localhost:8080)
- Redis Commander (http://localhost:8081)

## Configuration

### Environment Variables

Key variables in `.env`:

```bash
# Service Ports
CRYPTO_SERVICE_PORT=3001
MATH_SERVICE_PORT=3002
# ... etc

# Database
POSTGRES_PASSWORD=your_secure_password
REDIS_PASSWORD=your_secure_password

# Security
JWT_SECRET=your_jwt_secret_key

# Logging
LOG_LEVEL=debug  # debug, info, warn, error
```

### Service-Specific Configuration

Each service can be configured via environment variables:

```bash
# Crypto Service
CRYPTO_DEFAULT_ALGORITHM=sha256

# Math Service
MATH_MAX_PRECISION=15

# Image Service
IMAGE_MAX_SIZE_MB=50
IMAGE_ALLOWED_FORMATS=jpeg,png,webp
```

## Common Commands

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs for a specific service
docker-compose logs -f crypto-service

# Restart a specific service
docker-compose restart crypto-service

# Rebuild and start
docker-compose up -d --build

# Remove all data (volumes)
docker-compose down -v
```

## Troubleshooting

### Services Not Starting

```bash
# Check service logs
docker-compose logs <service-name>

# Common issues:
# - Port conflicts: Change ports in .env
# - Memory issues: Increase Docker memory allocation
# - Database not ready: Wait and restart the service
```

### Kong Gateway Errors

```bash
# Check Kong logs
docker-compose logs kong

# Verify Kong is running
curl http://localhost:8001/status
```

### Database Connection Issues

```bash
# Check PostgreSQL
docker-compose exec postgres psql -U LeForge -c "SELECT 1"

# Check Redis
docker-compose exec redis redis-cli -a <password> ping
```

### Reset Everything

```bash
# Stop and remove all containers, networks, and volumes
docker-compose down -v --remove-orphans

# Start fresh
docker-compose up -d
```

## Next Steps

1. **Explore the API**: Check out the [API Reference](api-reference.md)
2. **Understand the Architecture**: Read the [Architecture Guide](architecture.md)
3. **Deploy to Production**: See the [Deployment Guide](deployment.md)
4. **Contribute**: Read our [Contributing Guide](contributing.md)

## Getting Help

- **Documentation**: Check the `/docs` folder
- **Issues**: Open a GitHub issue
- **Discussions**: Join our community discussions
