# CLAUDE.md - Project Context for AI Assistants

## Project Overview

**FlowForge** is a self-hosted AI and compute platform for workflow automation tools. It provides a unified microservices backend that extends the capabilities of workflow automation platforms (n8n, Make, Zapier, Power Automate, etc.) with AI, cryptography, advanced math, and data processing services.

## Repository Structure

```
lcncAK/
├── flowforge/                    # Main application
│   ├── app/                      # Unified backend + frontend app
│   │   ├── src/
│   │   │   ├── client/          # React frontend (Vite + TailwindCSS)
│   │   │   └── server/          # Fastify backend (TypeScript)
│   │   │       ├── routes/      # API endpoints
│   │   │       ├── services/    # Business logic
│   │   │       ├── types/       # TypeScript types
│   │   │       └── utils/       # Utilities
│   │   ├── migrations/          # Database migrations
│   │   └── registry/            # Embedded plugin bundles
│   ├── gateway/                  # Kong API Gateway config
│   ├── services/                 # Microservices (crypto, math, llm)
│   ├── infrastructure/           # Docker, Postgres, Redis configs
│   ├── sdk/                      # Client SDKs (JS, Python, .NET)
│   ├── integrations/             # Platform-specific integrations
│   └── docs/                     # Documentation
├── forgehooks-registry/          # Plugin registry repository
│   ├── forgehooks-registry.json  # Main registry index
│   ├── plugins/                  # Plugin manifests and bundles
│   └── integrations/             # Platform connectors (Nintex, etc.)
└── *.ps1                         # Test scripts
```

## Key Concepts

### ForgeHooks
Plugins that extend FlowForge capabilities. Two runtime types:
- **Container plugins**: Run in Docker containers (full isolation)
- **Embedded plugins**: Run in-process via VM sandbox (lightweight, fast)

### Plugin Manifest (forgehook.json)
Every plugin has a manifest defining:
- `id`: Unique identifier (e.g., "formula-engine")
- `name`, `version`, `description`
- `runtime`: "container" | "embedded"
- `endpoints`: API operations the plugin exposes
- `image`: Docker image config (for container plugins)

### Marketplace
Aggregates plugins from multiple registry sources (GitHub, URLs, local).
Users can browse, install, and manage plugins through the Web UI.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Fastify + TypeScript |
| Frontend | React 18 + Vite + TailwindCSS |
| Database | PostgreSQL + better-sqlite3 (local) |
| Gateway | Kong API Gateway |
| Container Runtime | Docker |
| Process Isolation | Node.js vm module |

## Deployment

### Local Development
```bash
cd flowforge/app
npm install
npm run dev
```

### Production (Remote Server)
Server: `dan@10.0.0.115:/home/dan/flowforge`

Deploy workflow:
1. Push changes to git
2. SSH and pull: `ssh dan@10.0.0.115 "cd /home/dan/flowforge && git pull"`
3. Rebuild: `docker compose up -d --build app`

### Docker Compose Services
- `app`: Main application (port 3000)
- `kong`: API Gateway (port 8000/8001)
- `kong-db`: PostgreSQL for Kong
- `redis`: Cache layer

## API Structure

Base URL: `http://localhost:3000/api/v1/`

### Core Endpoints
| Route | Description |
|-------|-------------|
| `GET /health` | Health check |
| `GET /plugins` | List installed plugins |
| `POST /plugins/install` | Install plugin from manifest |
| `GET /plugins/:id/logs` | Get plugin logs |
| `POST /marketplace/install` | Install from marketplace |
| `GET /marketplace` | Browse marketplace |
| `POST /invoke/:pluginId/:operation` | Invoke plugin operation |

### Plugin Invocation
```bash
curl -X POST http://localhost:3000/api/v1/invoke/formula-engine/evaluate \
  -H "Content-Type: application/json" \
  -d '{"formula": "SUM(1,2,3)"}'
```

## Common Tasks

### Adding a New Route
1. Create file in `flowforge/app/src/server/routes/`
2. Export route function: `export async function myRoutes(fastify: FastifyInstance) { ... }`
3. Register in `app.ts`: `await app.register(myRoutes);`

### Adding a New Service
1. Create file in `flowforge/app/src/server/services/`
2. Export singleton: `export const myService = new MyService();`
3. Import in routes as needed

### Creating an Embedded Plugin
1. Create plugin directory in `forgehooks-registry/plugins/{plugin-id}/`
2. Add `forgehook.json` manifest with `runtime: "embedded"`
3. Create `index.js` with exported operation functions
4. Add entry to `forgehooks-registry.json`

### Testing Kong Gateway
```bash
# From Windows
curl http://localhost:8000/api/v1/health

# Test via Kong admin
curl http://localhost:8001/services
```

## Current State & Known Issues

### Active Development
- Embedded plugin system (runtime: "embedded")
- Marketplace with multiple registry sources
- Nintex integration connectors

### Recent Fixes
- Fixed marketplace install route at `/api/v1/marketplace/install`
- Fixed plugins logs endpoint to handle embedded plugins
- Added proper service imports in API routes

### Environment Variables
```bash
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
KONG_ADMIN_URL=http://kong:8001
```

## File Naming Conventions

- Routes: `{resource}.ts` (e.g., `plugins.ts`, `marketplace.ts`)
- Services: `{name}.service.ts` (e.g., `docker.service.ts`)
- Types: `index.ts` in `types/` folder
- Components: PascalCase (e.g., `PluginCard.tsx`)

## Testing

```bash
# Run from project root
./simple-test.ps1          # Basic connectivity test
./test-kong.ps1            # Kong gateway tests
./kong-tests.ps1           # Comprehensive Kong tests
```

## Important Notes

1. **Docker Context**: The app runs inside Docker but manages other containers via Docker socket mount.

2. **Embedded vs Container**: Prefer embedded plugins for lightweight, CPU-bound operations. Use container plugins for isolated environments or specific dependencies.

3. **Hot Reload**: Frontend uses Vite HMR. Backend requires restart for changes.

4. **Port Mapping**: 
   - 3000: App (internal and external)
   - 8000: Kong proxy
   - 8001: Kong admin
   - 5432: PostgreSQL

5. **Registry Sources**: Can add GitHub repos, direct URLs, or local files as plugin sources.
