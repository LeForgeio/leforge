# LeForge Infrastructure

Production-ready infrastructure configuration for LeForge platform.

## Overview

This directory contains all infrastructure components required to run LeForge:

| Service | Version | Port(s) | Purpose |
|---------|---------|---------|---------|
| PostgreSQL | 15-alpine | 5432 | Primary database for LeForge and Kong |
| Redis | 7-alpine | 6379 | Caching, sessions, rate limiting |
| Qdrant | latest | 6333, 6334 | Vector database for embeddings |
| Kong Gateway | 3.4-alpine | 8000, 8001, 8443, 8444 | API Gateway |

## Quick Start

### 1. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit with your secure passwords
# Use: openssl rand -base64 32 to generate passwords
nano .env
```

### 2. Start Infrastructure

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### 3. Initialize Databases

```bash
# Run database initialization script
../scripts/init-db.sh
```

### 4. Verify Health

```bash
# Run health check
../scripts/health-check.sh
```

## Directory Structure

```
infrastructure/
├── docker-compose.yml      # Production compose file
├── .env.example           # Environment template
├── certs/                 # SSL/TLS certificates
│   ├── README.md
│   └── .gitignore
├── monitoring/
│   └── prometheus.yml     # Prometheus configuration
├── postgres/
│   ├── conf/
│   │   └── postgresql.conf  # PostgreSQL settings
│   └── init/
│       ├── 00-create-databases.sh  # Multi-DB setup
│       └── 01-init.sql            # LeForge schema
└── redis/
    └── redis.conf         # Redis configuration
```

## Services

### PostgreSQL

- **Databases**: `LeForge_db` (application), `kong_db` (gateway)
- **Features**: UUID extension, pgcrypto, custom schema
- **Health Check**: `pg_isready` every 10s
- **Persistence**: Named volume `LeForge-postgres-data`

### Redis

- **Mode**: AOF persistence with LRU eviction
- **Max Memory**: 512MB (configurable)
- **Features**: Password protected, TCP keepalive
- **Health Check**: Redis PING every 10s
- **Persistence**: Named volume `LeForge-redis-data`

### Qdrant

- **Ports**: 6333 (HTTP), 6334 (gRPC)
- **Features**: Telemetry disabled, snapshots enabled
- **Health Check**: HTTP `/health` endpoint
- **Persistence**: Named volumes for data and snapshots

### Kong Gateway

- **Mode**: Database-backed (PostgreSQL)
- **Ports**: 
  - 8000: HTTP Proxy
  - 8001: Admin API
  - 8443: HTTPS Proxy
  - 8444: Admin API (SSL)
- **Features**: Auto-migrations, declarative config support
- **Health Check**: `kong health` command

## Networks

| Network | Subnet | Purpose |
|---------|--------|---------|
| LeForge-backend | 172.28.0.0/16 | Internal service communication |
| LeForge-frontend | 172.29.0.0/16 | Public-facing services |

## Resource Limits

| Service | Memory Limit | CPU Limit |
|---------|-------------|-----------|
| PostgreSQL | 1GB | 1.0 |
| Redis | 512MB | 0.5 |
| Qdrant | 2GB | 2.0 |
| Kong | 1GB | 2.0 |

## Security Recommendations

1. **Passwords**: Use strong, unique passwords (32+ characters)
2. **SSL/TLS**: Enable for production deployments
3. **Network**: Restrict access to admin ports
4. **Secrets**: Use secret management (Vault, AWS Secrets Manager)
5. **Updates**: Keep images updated for security patches

## Troubleshooting

### PostgreSQL Connection Issues

```bash
# Check PostgreSQL logs
docker logs LeForge-postgres

# Test connection
docker exec LeForge-postgres pg_isready -U LeForge
```

### Redis Connection Issues

```bash
# Check Redis logs
docker logs LeForge-redis

# Test connection
docker exec LeForge-redis redis-cli -a $REDIS_PASSWORD ping
```

### Kong Migration Issues

```bash
# Check migration logs
docker logs LeForge-kong-migrations

# Manually run migrations
docker-compose run --rm kong-migrations kong migrations up
```

### Health Check Failed

```bash
# Run comprehensive health check
../scripts/health-check.sh --all

# Check individual services
../scripts/health-check.sh --postgres
../scripts/health-check.sh --redis
../scripts/health-check.sh --qdrant
../scripts/health-check.sh --kong
```

## Backup & Recovery

### PostgreSQL Backup

```bash
# Create backup
docker exec LeForge-postgres pg_dump -U LeForge LeForge_db > backup.sql

# Restore backup
docker exec -i LeForge-postgres psql -U LeForge LeForge_db < backup.sql
```

### Redis Backup

```bash
# Trigger RDB snapshot
docker exec LeForge-redis redis-cli -a $REDIS_PASSWORD BGSAVE

# Copy backup file
docker cp LeForge-redis:/data/dump.rdb ./redis-backup.rdb
```

### Qdrant Backup

```bash
# Create snapshot via API
curl -X POST "http://localhost:6333/snapshots"

# List snapshots
curl "http://localhost:6333/snapshots"
```

## Monitoring

Prometheus metrics are exposed by Kong at `/metrics` endpoint. Configure your monitoring stack to scrape these endpoints.

See `monitoring/prometheus.yml` for configuration.
