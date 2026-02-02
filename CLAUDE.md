# CLAUDE.md - Project Context for AI Assistants

## Project Overview

**LeForge** is a self-hosted AI and compute platform for low-code apps and automations. It provides a unified platform that extends the capabilities of low-code platforms (n8n, Power Automate, ServiceNow, Nintex, Salesforce, Mendix, etc.) with AI, cryptography, advanced math, and data processing services.

**Key Innovation**: LeForge implements the **Model Context Protocol (MCP)**, allowing AI agents like Claude, GPT, and Cursor to auto-discover and use all ForgeHook plugins as tools.

## Architecture

LeForge uses a **single container architecture**:

```
┌───────────────────────────────────────────────────────┐
│              LeForge Container (:4000)                │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Node.js App (Fastify + React)                  │  │
│  │  - API Gateway (auth, rate limiting, CORS)      │  │
│  │  - Plugin Manager                               │  │
│  │  - MCP Server (AI agent protocol)               │  │
│  │  - Web UI                                       │  │
│  ├─────────────────────────────────────────────────┤  │
│  │  PostgreSQL + pgvector (data + vector search)   │  │
│  ├─────────────────────────────────────────────────┤  │
│  │  Redis (caching, sessions)                      │  │
│  ├─────────────────────────────────────────────────┤  │
│  │  Mosquitto (MQTT broker for events/plugins)     │  │
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

Managed via `supervisord`:
- Priority 5: PostgreSQL initialization
- Priority 10: PostgreSQL server
- Priority 10: Redis server
- Priority 10: Mosquitto MQTT broker
- Priority 15: PostgreSQL setup (user/db/extensions)
- Priority 50: Node.js application

## Repository Structure

```
flowforge/
├── app/                      # Unified backend + frontend
│   ├── src/
│   │   ├── client/          # React 19 frontend (Vite + TailwindCSS)
│   │   └── server/          # Fastify 5 backend (TypeScript)
│   │       ├── routes/      # API endpoints (incl. mcp.ts)
│   │       ├── services/    # Business logic (incl. mcp.service.ts)
│   │       ├── types/       # TypeScript types
│   │       └── utils/       # Utilities
│   ├── migrations/          # Database migrations
│   ├── registry/            # Embedded plugin bundles
│   ├── Dockerfile           # Single container with PG + Redis + Node
│   └── supervisord.conf     # Process manager config
├── docker-compose.unified.yml  # Main compose file
├── docker-compose.qdrant.yml   # Optional: Vector DB add-on
├── docs/                     # Documentation
└── scripts/                  # Utility scripts
```

## Key Concepts

### ForgeHooks (23 Total)
Plugins that extend LeForge capabilities:
- **Container plugins (9)**: Run in Docker containers (LLM, Crypto, PDF, etc.)
- **Embedded plugins (11)**: Run in-process, zero latency (String, Date, JSON utils, etc.)
- **Gateway plugins (3)**: Proxy to local AI tools (Ollama, LM Studio, Foundry)

### MCP (Model Context Protocol)
AI agents connect via `/mcp` endpoint and can:
- List all ForgeHooks as **tools**
- Read plugin metadata as **resources**
- Use built-in **prompts** for workflow building

### Plugin Manifest (forgehook.json)
```json
{
  "id": "formula-engine",
  "name": "Formula Engine",
  "version": "1.0.0",
  "runtime": "embedded",
  "endpoints": [
    { "method": "POST", "path": "/evaluate", "description": "Evaluate formula" }
  ]
}
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Fastify 5 + TypeScript |
| Frontend | React 19 + Vite + TailwindCSS |
| Database | PostgreSQL 18 + pgvector 0.8.1 (embedded) |
| Vector Search | pgvector (HNSW + IVFFlat indexes) |
| Cache | Redis 8.4 (embedded in container) |
| MQTT Broker | Mosquitto 2.0.22 (embedded) |
| Process Mgmt | supervisord |
| AI Protocol | Model Context Protocol (MCP) |
| Container | Docker |

## API Structure

Base URL: `http://localhost:4000/api/v1/`

### Core Endpoints
| Route | Description |
|-------|-------------|
| `GET /health` | Health check |
| `GET /plugins` | List installed plugins |
| `POST /plugins/install` | Install plugin |
| `GET /marketplace` | Browse marketplace |

### MCP Endpoints
| Route | Description |
|-------|-------------|
| `GET /mcp` | SSE endpoint for MCP clients |
| `GET /api/v1/mcp/tools` | List available tools |
| `POST /api/v1/mcp/tools/:name/call` | Execute a tool |
| `GET /api/v1/mcp/resources` | List resources |
| `GET /api/v1/mcp/prompts` | List prompts |

### Plugin Invocation
```bash
curl -X POST http://localhost:4000/api/v1/invoke/formula-engine/evaluate \
  -H "Content-Type: application/json" \
  -d '{"formula": "SUM(1,2,3)"}'
```

## Deployment

### Single Container Philosophy

**CRITICAL**: LeForge core is ONE container. Everything else is a plugin container.

```
┌─────────────────────────────────────────┐
│         LeForge (single container)      │
│  ├── Node.js (Fastify + React)          │
│  ├── PostgreSQL + pgvector (embedded)   │
│  └── Redis (embedded)                   │
└─────────────────────────────────────────┘
        │
        ▼ (spawns plugin containers as needed)
┌───────────────┐ ┌───────────────┐
│ math-service  │ │ ollama-local  │  ...
└───────────────┘ └───────────────┘
```

**NO separate PostgreSQL or Redis containers** - they run inside the LeForge container via supervisord.

### Docker Naming Conventions

| Resource | Name | Notes |
|----------|------|-------|
| Service | `leforge` | In docker-compose.yml |
| Container | `leforge` | Single core container |
| Image | `leforge:latest` | Built image tag |
| Network | `leforge-network` | Bridge network |
| Volume (App Data) | `leforge-data` | Application data, logs |
| Volume (Database) | `leforge-embedded-postgres` | PostgreSQL data (CRITICAL) |

Never use: `leforge-postgres` (separate container), `leforge-redis` (separate container).

### Port Mapping

#### Current Port Allocations

| Port | Service | Protocol | Purpose |
|------|---------|----------|---------|
| 4000 | Node.js API | HTTP | Main application, Web UI, REST API, MCP endpoint |
| 5432 | PostgreSQL | TCP | Database (exposed for debugging/external tools) |
| 6379 | Redis | TCP | Cache/sessions (exposed for plugin containers) |
| 1883 | Mosquitto | MQTT | MQTT broker TCP (plugins/external clients) |
| 9001 | Mosquitto | WebSocket | MQTT broker WebSocket (browser clients) |

#### Plugin Port Range

| Range | Purpose |
|-------|---------|
| 4001-4999 | Dynamic ForgeHook plugin containers |

Current plugin allocations:
- 4001: math-service
- 4002: crypto-service
- 4004: data-transform-service
- 4005: image-service
- 4006: pdf-service
- 4007: ocr-service
- 4008: ollama-local
- 4010: streaming-file-service

#### Future Port Reservations

| Port | Planned Service | Status |
|------|-----------------|--------|
| 8443 | HTTPS/TLS API | Planned |
| 8883 | MQTT TLS | Planned |
| 9443 | WebSocket TLS | Planned |
| 3000 | Dev server (Vite) | Development only |

#### Network Security Notes
- **Production**: Consider NOT exposing 5432, 6379 externally
- **Development**: All ports exposed for debugging convenience
- **Cloudflare Tunnel**: Routes `app.leforge.io` → `leforge-app:4000` internally

### Quick Start
```bash
# Create required volumes first
docker volume create leforge-data
docker volume create leforge-embedded-postgres

# Run LeForge
docker compose up -d

# Check status
docker ps --filter "name=leforge"

# View logs
docker logs leforge
```

### Rebuild After Code Changes
```bash
docker compose up -d --build leforge
```

## Common Tasks

### Adding a New Route
1. Create file in `app/src/server/routes/`
2. Export route function: `export async function myRoutes(fastify: FastifyInstance)`
3. Register in `app.ts`: `await app.register(myRoutes);`

### Adding a New Service
1. Create file in `app/src/server/services/`
2. Export singleton: `export const myService = new MyService();`

### Creating an Embedded Plugin
1. Create plugin directory in `forgehooks-registry/plugins/{plugin-id}/`
2. Add `forgehook.json` manifest with `runtime: "embedded"`
3. Create `index.js` with exported functions
4. Add entry to `forgehooks-registry.json`

## Important Notes

1. **Single Container**: PostgreSQL, Redis, and Node.js all run in one container via supervisord.

2. **Port 4000**: The app listens on port 4000 (not 3000).

3. **MCP Support**: All ForgeHooks are automatically exposed as MCP tools for AI agents.

4. **Embedded Plugins**: Preferred for lightweight operations (zero network latency).

5. **Embedded Vector Search**: pgvector is built into PostgreSQL - no external Qdrant needed for most use cases.

## Critical: Data Persistence

### Embedded PostgreSQL Volume (REQUIRED)
LeForge uses an **embedded PostgreSQL** inside the container (via supervisord), NOT the external postgres container. You MUST mount a volume to `/var/lib/postgresql/data` or **all data will be lost on restart**:

```yaml
volumes:
  - leforge_postgres:/var/lib/postgresql/data  # CRITICAL for data persistence
```

### Required Volumes

| Volume | Mount Point | Purpose |
|--------|-------------|---------|
| `leforge-data` | `/app/data` | Application data, logs |
| `leforge-embedded-postgres` | `/var/lib/postgresql/data` | **User data, API keys, plugins** |

### Mark Volumes as External
To prevent accidental deletion with `docker compose down -v`, mark volumes as external:

```yaml
volumes:
  leforge_data:
    name: leforge-data
    external: true
  leforge_postgres:
    name: leforge-embedded-postgres
    external: true
```

### Embedded DB Credentials
- User: `leforge`
- Password: `${POSTGRES_PASSWORD}` (env var, default: `leforge_dev_password`)
- Database: `leforge`
- Host: `localhost` (within container)

## Security Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | `leforge_dev_password` | PostgreSQL password |
| `REDIS_PASSWORD` | (empty) | Redis password (empty = no auth) |
| `MQTT_USERNAME` | (empty) | MQTT username (empty = anonymous) |
| `MQTT_PASSWORD` | (empty) | MQTT password |
| `LEFORGE_JWT_SECRET` | (auto-generated) | JWT signing secret |
| `LEFORGE_ADMIN_PASSWORD` | `admin` | Admin user password |
| `LEFORGE_SECURE_COOKIES` | `false` | Set `true` for HTTPS |

### Authentication
- **Password Hashing**: bcrypt with cost factor 12
- **JWT**: 64-byte crypto-random secret (auto-generated if not set)
- **RBAC**: Role-based permissions (admin, user, guest)

### Production Deployment Checklist
```bash
# Generate secure values
openssl rand -base64 32  # For passwords
openssl rand -hex 64     # For JWT secret

# Required environment variables for production
POSTGRES_PASSWORD=<generated>
REDIS_PASSWORD=<generated>
MQTT_USERNAME=leforge
MQTT_PASSWORD=<generated>
LEFORGE_JWT_SECRET=<generated>
LEFORGE_ADMIN_PASSWORD=<generated>
LEFORGE_SECURE_COOKIES=true
```

### MQTT Broker (Mosquitto)
- **TCP Port**: 1883 (internal/plugin communication)
- **WebSocket Port**: 9001 (browser clients)
- **Authentication**: Anonymous by default; set `MQTT_USERNAME` + `MQTT_PASSWORD` to enable password auth
- **Runtime Config**: `docker-entrypoint.sh` generates password file if credentials provided

### Security Documentation
See `docs/security.md` for comprehensive security guide including:
- Password policies and hashing
- JWT configuration
- Database security
- Network security
- SSL/TLS setup
- API key management

## Networking Notes

### Cloudflare Tunnel Setup
The LeForge container needs a network alias for cloudflared to resolve:

```yaml
networks:
  leforge-network:
    aliases:
      - leforge-app  # Required for cloudflared tunnel
```

### Plugin Container Communication
When proxying to plugin containers, use Docker network DNS (not localhost):

```typescript
// CORRECT: Use container name over Docker network
const url = `http://${plugin.containerName}:${plugin.manifest.port}${path}`;

// WRONG: localhost doesn't work from inside container
const url = `http://localhost:${plugin.hostPort}${path}`;
```

### ForgeHook Plugin Healthchecks
ForgeHook containers are Python-based and don't have curl. Use Python urllib:

```yaml
healthcheck:
  test: ["CMD-SHELL", "python3 -c \"import urllib.request; urllib.request.urlopen('http://localhost:PORT/health')\""]
```

## Vector Search with pgvector

LeForge includes **pgvector 0.8.1** compiled into the embedded PostgreSQL database, providing native vector similarity search without external dependencies.

### Why pgvector over Qdrant?
- **Zero additional containers** - runs inside existing PostgreSQL
- **ACID transactions** - vectors and metadata in same transaction
- **Simpler architecture** - no network hops for vector operations
- **Cost effective** - no separate vector DB to manage

### Supported Index Types
| Index | Best For | Notes |
|-------|----------|-------|
| HNSW | Most use cases | Fast queries, higher memory |
| IVFFlat | Large datasets | Lower memory, requires training |

### Usage Examples

```sql
-- Enable extension (auto-enabled on LeForge startup)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create table with embeddings
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  content TEXT,
  embedding vector(1536)  -- OpenAI ada-002 dimensions
);

-- Create HNSW index for cosine similarity
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);

-- Insert with embedding
INSERT INTO documents (content, embedding) 
VALUES ('Hello world', '[0.1, 0.2, ...]'::vector);

-- Find 10 most similar documents
SELECT id, content, embedding <=> query_embedding AS distance
FROM documents
ORDER BY embedding <=> '[0.1, 0.2, ...]'::vector
LIMIT 10;
```

### Distance Operators
| Operator | Function | Use Case |
|----------|----------|----------|
| `<->` | L2 distance | Euclidean similarity |
| `<=>` | Cosine distance | Text embeddings (OpenAI, etc.) |
| `<#>` | Inner product | Normalized vectors |

### Embedding Dimensions by Model
| Model | Dimensions |
|-------|------------|
| OpenAI text-embedding-ada-002 | 1536 |
| OpenAI text-embedding-3-small | 1536 |
| OpenAI text-embedding-3-large | 3072 |
| Ollama nomic-embed-text | 768 |
| Ollama mxbai-embed-large | 1024 |
