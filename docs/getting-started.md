# Getting Started with LeForge

This guide will help you get LeForge up and running quickly.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher (optional)
- **Git**: For cloning the repository (optional)
- **2GB+ RAM**: Minimum for single container deployment

### Verify Installation

```bash
# Check Docker version
docker --version
# Expected: Docker version 20.10.x or higher

# Check Docker Compose version (optional)
docker compose version
# Expected: Docker Compose version v2.x.x

# Ensure Docker is running
docker info
```

## Quick Start

### Option 1: One-Line Deploy (Recommended)

```bash
docker run -d -p 4000:4000 --name leforge leforge/leforge:latest
```

That's it! LeForge is now running with PostgreSQL, Redis, and the Node.js app all in one container.

### Option 2: Docker Compose

```bash
# Clone the repository
git clone https://github.com/LeForgeio/leforge.git
cd leforge

# Start LeForge
docker compose -f docker-compose.unified.yml up -d

# Watch the logs
docker compose logs -f
```

### Option 3: With Vector Search (Qdrant)

```bash
docker compose -f docker-compose.unified.yml -f docker-compose.qdrant.yml up -d
```

### Verify Installation

Wait for services to be healthy (usually 30-60 seconds):

```bash
# Check health
curl http://localhost:4000/api/v1/health

# Expected response:
{
  "status": "healthy",
  "version": "1.2.0",
  "timestamp": "2026-01-30T12:00:00.000Z"
}
```

### Access the Services

| Service | URL | Description |
|---------|-----|-------------|
| Web UI / API | http://localhost:4000 | Dashboard and all APIs |
| MCP Endpoint | http://localhost:4000/mcp | AI Agent protocol |
| Health Check | http://localhost:4000/api/v1/health | Service status |

## Your First API Call

### Test the Health Endpoint

```bash
curl http://localhost:4000/api/v1/health
```

### Evaluate a Formula (Embedded Plugin)

```bash
curl -X POST http://localhost:4000/api/v1/invoke/formula-engine/evaluate \
  -H "Content-Type: application/json" \
  -d '{"formula": "SUM(1,2,3,4,5)"}'
```

Expected response:
```json
{
  "success": true,
  "result": 15
}
```

### Hash Some Data (Container Plugin)

First, install the crypto-service plugin from the Marketplace UI, then:

```bash
curl -X POST http://localhost:4000/api/v1/invoke/crypto-service/hash \
  -H "Content-Type: application/json" \
  -d '{
    "algorithm": "sha256",
    "data": "Hello, LeForge!"
  }'
```

### Use MCP Protocol (AI Agents)

```bash
# List available tools for AI agents
curl http://localhost:4000/api/v1/mcp/tools

# Call a tool
curl -X POST http://localhost:4000/api/v1/mcp/tools/formula-engine__post_evaluate/call \
  -H "Content-Type: application/json" \
  -d '{"formula": "AVERAGE(10,20,30)"}'
```

## Development Mode

For active development with hot reload:

```bash
cd app

# Install dependencies
npm install

# Run both frontend and backend in dev mode
npm run dev
```

Development mode includes:
- Hot reload for frontend and backend
- Frontend on port 3000 (proxied to backend)
- Backend on port 4000

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Server port |
| `NODE_ENV` | `development` | Environment |
| `LOG_LEVEL` | `info` | Logging level |
| `POSTGRES_HOST` | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_USER` | `leforge` | PostgreSQL user |
| `POSTGRES_PASSWORD` | `leforge_password` | PostgreSQL password |
| `POSTGRES_DB` | `leforge` | PostgreSQL database |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `DOCKER_SOCKET_PATH` | `/var/run/docker.sock` | Docker socket path |

## Common Commands

```bash
# Start LeForge
docker compose -f docker-compose.unified.yml up -d

# Stop LeForge
docker compose -f docker-compose.unified.yml down

# View logs
docker compose -f docker-compose.unified.yml logs -f

# Restart
docker compose -f docker-compose.unified.yml restart

# Remove all data (volumes)
docker compose -f docker-compose.unified.yml down -v
```

## Troubleshooting

### Container Not Starting

```bash
# Check container logs
docker logs leforge

# Common issues:
# - Port 4000 in use: Change port mapping (-p 4001:4000)
# - Memory issues: Increase Docker memory allocation
```

### Database Connection Issues

The database runs inside the container. If you see connection errors, the container may still be initializing. Wait 30-60 seconds and try again.

### Reset Everything

```bash
# Stop and remove container with data
docker rm -f leforge
docker volume rm leforge_data  # If using named volume

# Start fresh
docker run -d -p 4000:4000 --name leforge leforge/leforge:latest
```

## Next Steps

1. **Explore the API**: Check out the [API Reference](api-reference.md)
2. **Understand the Architecture**: Read the [Architecture Guide](architecture.md)
3. **Install Plugins**: Browse the Marketplace at http://localhost:4000/marketplace
4. **Connect AI Agents**: Use the MCP endpoint at http://localhost:4000/mcp
5. **Deploy to Production**: See the [Deployment Guide](deployment.md)
6. **Contribute**: Read our [Contributing Guide](contributing.md)

## Getting Help

- **Documentation**: Check the `/docs` folder
- **Issues**: Open a GitHub issue
- **Discussions**: Join our community discussions
