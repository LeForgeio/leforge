# FlowForge Unified Architecture

## 🎯 Minimal Architecture: 2 Containers

FlowForge runs with just **2 containers** - PostgreSQL and the FlowForge App. All gateway features (auth, rate limiting, routing) are built directly into the app.

---

## 🏗️ Architecture Overview

### Minimal Setup (Recommended)

```
┌─────────────────────────────────────────────────────────────────┐
│                    FlowForge App (:3000)                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Embedded Gateway Layer                          ││
│  │  • API Key Authentication (X-API-Key header)                 ││
│  │  • Rate Limiting (100 req/min, in-memory)                    ││
│  │  • CORS                                                      ││
│  │  • Request logging & metrics                                 ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Frontend (React + Vite)                         ││
│  │  • Marketplace UI                                            ││
│  │  • Plugin Management Dashboard                               ││
│  │  • Real-time Status Monitoring                               ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Backend (Fastify API)                           ││
│  │  • Plugin Manager (Docker lifecycle)                         ││
│  │  • Dynamic route registration                                ││
│  │  • Registry service                                          ││
│  └─────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────┬─┘
                                                                │
┌───────────────────────────────────────────────────────────────┴─┐
│                    PostgreSQL (:5432)                            │
│  • Plugin state & configurations                                 │
│  • User data & API keys                                          │
│  • Event logs                                                    │
└─────────────────────────────────────────────────────────────────┘
```

### With Optional Add-ons

```
┌─────────────────────────────────────────────────────────────────┐
│                    FlowForge App (:3000)                         │
└───────────────────────────────────────────────────────────────┬─┘
                                                                │
        ┌───────────────────────┬───────────────────────────────┤
        ▼                       ▼                               ▼
┌───────────────┐     ┌───────────────┐             ┌───────────────┐
│  PostgreSQL   │     │    Redis      │  Optional   │    Qdrant     │
│   (Required)  │     │  (Caching)    │   Add-ons   │   (Vectors)   │
│    :5432      │     │    :6379      │             │    :6333      │
└───────────────┘     └───────────────┘             └───────────────┘
```

---

## 🚀 Deployment Options

### Option 1: Minimal (2 containers)
```bash
docker compose -f docker-compose.minimal.yml up -d
```

### Option 2: With Redis (distributed caching)
```bash
docker compose -f docker-compose.minimal.yml -f docker-compose.redis.yml up -d
```

### Option 3: With Qdrant (vector search / RAG)
```bash
docker compose -f docker-compose.minimal.yml -f docker-compose.qdrant.yml up -d
```

### Option 4: Full stack (all optional services)
```bash
docker compose -f docker-compose.minimal.yml \
  -f docker-compose.redis.yml \
  -f docker-compose.qdrant.yml up -d
```

---

## 🔐 Embedded Gateway Features

The FlowForge app includes all gateway features that were previously handled by Kong:

| Feature | Implementation | Notes |
|---------|----------------|-------|
| **API Key Auth** | `@fastify/auth` | X-API-Key header |
| **JWT Auth** | `@fastify/jwt` | Optional, disabled by default |
| **Rate Limiting** | `@fastify/rate-limit` | In-memory (100 req/min default) |
| **CORS** | `@fastify/cors` | Configurable origins |
| **Request Logging** | `pino` | Structured JSON logs |
| **Metrics** | `fastify-metrics` | Prometheus-compatible |
| **Health Checks** | Native routes | /health, /health/ready |

### Authentication

**API Key (Default)**
```bash
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/v1/plugins
```

**JWT (Optional)**
```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/v1/plugins
```

---

## 📁 Project Structure

```
flowforge/
├── docker-compose.yml              ← Simplified (no separate plugin-manager)
├── .env
│
├── web-ui/                         ← Now the MAIN application
│   ├── frontend/                   ← React app
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   └── hooks/
│   │   ├── public/
│   │   ├── index.html
│   │   └── vite.config.ts
│   │
│   ├── backend/                    ← Fastify API (from plugin-manager)
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── api.ts
│   │   │   │   ├── plugins.ts
│   │   │   │   └── registry.ts
│   │   │   ├── services/
│   │   │   │   ├── database.service.ts
│   │   │   │   ├── docker.service.ts
│   │   │   │   ├── registry.service.ts
│   │   │   │   └── kong.service.ts
│   │   │   └── app.ts
│   │   ├── migrations/
│   │   └── registry/
│   │       └── forgehooks-registry.json
│   │
│   ├── Dockerfile                  ← Multi-stage: build frontend, run backend
│   ├── package.json                ← Combined dependencies
│   └── tsconfig.json
│
└── services/                       ← REMOVE plugin-manager directory
    └── [Individual ForgeHook plugins deployed dynamically]
```

---

## 🔄 Migration Plan

### Step 1: Move Plugin Manager Backend into Web UI

```bash
# Create backend directory in web-ui
mkdir -p web-ui/backend

# Move plugin-manager backend code
mv services/plugin-manager/src web-ui/backend/
mv services/plugin-manager/migrations web-ui/backend/
mv services/plugin-manager/registry web-ui/backend/

# Rename frontend directory
mv web-ui/src web-ui/frontend/src
mv web-ui/public web-ui/frontend/public
# ... etc
```

### Step 2: Update Package.json

Merge dependencies from both services:

```json
{
  "name": "@flowforge/app",
  "version": "1.0.0",
  "scripts": {
    "dev:frontend": "vite",
    "dev:backend": "ts-node-dev backend/src/index.ts",
    "dev": "concurrently \"npm run dev:frontend\" \"npm run dev:backend\"",
    "build:frontend": "vite build",
    "build:backend": "tsc -p backend/tsconfig.json",
    "build": "npm run build:frontend && npm run build:backend",
    "start": "node backend/dist/index.js",
    "migrate": "ts-node backend/scripts/run-migration.ts"
  },
  "dependencies": {
    "react": "^18.2.0",
    "fastify": "^4.25.0",
    "@fastify/static": "^6.12.0",
    "dockerode": "^4.0.2",
    "pg": "^8.11.0",
    "ioredis": "^5.3.2"
    // ... all dependencies from both
  }
}
```

### Step 3: Update Backend to Serve Frontend

**backend/src/app.ts**:
```typescript
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'path';

export async function buildApp() {
  const app = Fastify({ logger: true });

  // API routes FIRST (so they take precedence)
  await app.register(healthRoutes);
  await app.register(pluginRoutes, { prefix: '/api/v1' });
  await app.register(registryRoutes, { prefix: '/api/v1' });

  // Serve static frontend (React build)
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '../../frontend/dist'),
    prefix: '/',
  });

  // SPA fallback - serve index.html for all non-API routes
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      reply.code(404).send({ error: 'Not found' });
    } else {
      reply.sendFile('index.html');
    }
  });

  return app;
}
```

### Step 4: Update Dockerfile

**web-ui/Dockerfile**:
```dockerfile
# Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Build backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Production image
FROM node:20-alpine
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache curl docker-cli

# Copy backend dist
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY backend/migrations ./backend/migrations
COPY backend/registry ./backend/registry

# Copy frontend dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose single port
EXPOSE 3000

# Start backend (which serves frontend)
CMD ["node", "backend/dist/index.js"]
```

### Step 5: Simplify Docker Compose

**docker-compose.yml**:
```yaml
version: '3.8'

services:
  postgres:
    # ... same as before

  redis:
    # ... same as before

  qdrant:
    # ... same as before

  kong:
    # ... same as before

  flowforge:  # ← SINGLE SERVICE NOW!
    build:
      context: ./web-ui
      dockerfile: Dockerfile
    container_name: flowforge
    environment:
      NODE_ENV: production
      PORT: 3000
      # Database
      DATABASE_URL: postgres://flowforge:password@postgres:5432/flowforge
      # Docker
      DOCKER_SOCKET: /var/run/docker.sock
      DOCKER_NETWORK: flowforge-network
      # Kong
      KONG_ADMIN_URL: http://kong:8001
      # Redis
      REDIS_HOST: redis
      REDIS_PASSWORD: password
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - flowforge_data:/app/data
    ports:
      - "3000:3000"
    networks:
      - flowforge-network
    depends_on:
      - postgres
      - redis
      - kong
    restart: unless-stopped
```

---

## ✨ Benefits of Unified Architecture

| Benefit | Description |
|---------|-------------|
| **Simpler Deployment** | One service instead of two |
| **Single Port** | Everything on port 3000 |
| **No CORS Issues** | Frontend and backend same origin |
| **Easier Development** | One repo, one build process |
| **Lower Resource Usage** | One container instead of two |
| **Cleaner Architecture** | Clear separation: frontend/ and backend/ |
| **Better Performance** | No network hop between UI and API |

---

## 🚀 Startup Flow

```
1. Start FlowForge container
2. Backend starts (Fastify on port 3000)
   ├─ Connect to PostgreSQL
   ├─ Run migrations
   ├─ Connect to Docker
   ├─ Load plugin registry
   ├─ Initialize Docker service (sync with DB)
   └─ Register API routes (/api/v1/*)
3. Backend serves React build for all non-API routes
4. User visits http://localhost:3000
5. React app loads and calls /api/v1/* endpoints
6. Everything works seamlessly!
```

---

## 📊 New URL Structure

| URL | Handled By | Purpose |
|-----|------------|---------|
| `http://localhost:3000/` | Frontend (React) | Dashboard homepage |
| `http://localhost:3000/marketplace` | Frontend (React) | Plugin marketplace |
| `http://localhost:3000/plugins` | Frontend (React) | Installed plugins |
| `http://localhost:3000/api/v1/health` | Backend (Fastify) | Health check |
| `http://localhost:3000/api/v1/plugins` | Backend (Fastify) | Plugin management API |
| `http://localhost:3000/api/v1/registry/*` | Backend (Fastify) | Registry API |

**Note**: No more separate port 4000! Everything on port 3000.

---

## 🔧 Development Workflow

```bash
# Terminal 1: Start infrastructure
docker compose up postgres redis qdrant kong

# Terminal 2: Start backend with hot reload
cd web-ui
npm run dev:backend

# Terminal 3: Start frontend with Vite HMR
cd web-ui
npm run dev:frontend

# Or run both together:
npm run dev
```

Frontend proxies API requests to backend during development:

**frontend/vite.config.ts**:
```typescript
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
})
```

---

## 🎯 Next Steps

1. **Create unified directory structure**
2. **Merge package.json files**
3. **Update backend to serve frontend**
4. **Create new unified Dockerfile**
5. **Update docker-compose.yml**
6. **Test everything**
7. **Update documentation**

Would you like me to proceed with this refactoring?
