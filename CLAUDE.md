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
│  │  PostgreSQL (plugin state, API keys)            │  │
│  ├─────────────────────────────────────────────────┤  │
│  │  Redis (caching, sessions)                      │  │
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

Managed via `supervisord`:
- Priority 10: PostgreSQL initialization
- Priority 10: PostgreSQL server
- Priority 15: Redis server  
- Priority 20: Node.js application

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
| Database | PostgreSQL 15 (embedded in container) |
| Cache | Redis 7 (embedded in container) |
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

### Docker Naming Conventions

**IMPORTANT**: All Docker resources use lowercase `leforge` prefix consistently:

| Resource | Name | Notes |
|----------|------|-------|
| Service | `leforge` | In docker-compose.unified.yml |
| Container | `leforge` | Single main container |
| Image | `leforge:latest` | Built image tag |
| Network | `leforge-network` | Bridge network |
| Volume (PostgreSQL) | `leforge-postgres-data` | Database persistence |
| Volume (Redis) | `leforge-redis-data` | Cache persistence |
| Volume (Plugins) | `leforge-plugin-data` | Plugin data |

Never use: `LeForge-app`, `leforge-app`, `LeForge-postgres`, etc.

### Quick Start
```bash
docker run -d -p 4000:4000 --name leforge leforge:latest
```

### Docker Compose
```bash
docker compose -f docker-compose.unified.yml up -d

# Check status
docker ps --filter "name=leforge"

# View logs
docker logs leforge
```

### With Qdrant (Vector Search)
```bash
docker compose -f docker-compose.unified.yml -f docker-compose.qdrant.yml up -d
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

5. **Optional Qdrant**: Only needed for vector search / RAG applications.
