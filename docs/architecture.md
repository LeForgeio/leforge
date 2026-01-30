# LeForge Architecture

This document describes the architecture and design patterns used in LeForge.

## Overview

LeForge is a **self-hosted AI and compute platform** for workflow automation tools. It uses a single container architecture with PostgreSQL, Redis, and Node.js bundled together, managed by supervisord.

## System Architecture

### Single Container Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Workflow Tools & AI Agents                  │
│   (n8n, Power Automate, Nintex, Salesforce, Claude, GPT, Cursor)   │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ REST API / MCP Protocol
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     LeForge Container (:4000)                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Node.js App: API Gateway, Plugin Manager, Web UI, MCP Server  │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │  PostgreSQL: Plugin state, API keys, integrations              │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │  Redis: Plugin injection, caching, sessions                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼ Docker Socket (for container plugins)
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ crypto-service│   │  pdf-service  │   │ image-service │
│    (dynamic)  │   │   (dynamic)   │   │   (dynamic)   │
└───────────────┘   └───────────────┘   └───────────────┘
```

### Process Management

LeForge uses **supervisord** to manage internal processes:

| Priority | Process | Description |
|----------|---------|-------------|
| 10 | PostgreSQL Init | Database initialization |
| 10 | PostgreSQL | Database server |
| 15 | Redis | Cache server |
| 20 | Node.js App | Main application |

## Core Components

### 1. Node.js Application (Fastify + React)

The unified application handles all LeForge functionality:

**Backend (Fastify 5)**
- **API Gateway**: Authentication, rate limiting, CORS
- **Plugin Manager**: Install, start, stop, update plugins
- **MCP Server**: Model Context Protocol for AI agents
- **Health Monitoring**: Service status and metrics

**Frontend (React 19)**
- **Dashboard**: Overview and health monitoring
- **Marketplace**: Browse and install ForgeHooks
- **Playground**: Test API endpoints interactively
- **API Key Management**: Create and manage API keys

### 2. ForgeHook Plugin System

LeForge supports three types of plugins:

#### Embedded Plugins (11)
Run in-process with zero network latency:
- `string-utils`, `date-utils`, `json-utils`
- `uuid-utils`, `encoding-utils`, `validation-utils`
- `formula-engine`, `excel-utils`, `qrcode-utils`
- `content-filter`, `lorem-utils`

#### Container Plugins (9)
Run as Docker containers, managed dynamically:
- `llm-service`, `crypto-service`, `math-service`
- `pdf-service`, `ocr-service`, `image-service`
- `vector-service`, `data-transform-service`
- `streaming-file-service`

#### Gateway Plugins (3)
Proxy to local AI tools:
- `ollama-local`, `lm-studio`, `foundry-local`

### 3. MCP Protocol (Model Context Protocol)

LeForge implements MCP for AI agent integration:

```
AI Agent (Claude, GPT, Cursor)
        │
        │ SSE Connection
        ▼
┌───────────────────┐
│  MCP Server       │
│  /mcp endpoint    │
├───────────────────┤
│ Tools → Plugins   │
│ Resources → Data  │
│ Prompts → Actions │
└───────────────────┘
```

**MCP Capabilities:**
- **Tools**: Every ForgeHook endpoint exposed as a tool
- **Resources**: Plugin metadata and documentation
- **Prompts**: Pre-built workflow templates

### 4. Data Layer

#### PostgreSQL (Embedded)
- Plugin state and configuration
- API keys and authentication
- User preferences
- Update history

#### Redis (Embedded)
- Request caching
- Session management
- Rate limiting counters
- Plugin injection state

#### Qdrant (Optional Add-on)
- Vector embeddings storage
- Semantic search
- RAG applications

## API Structure

### Base URL
```
http://localhost:4000/api/v1/
```

### Core Endpoints

| Route | Description |
|-------|-------------|
| `GET /health` | Health check |
| `GET /plugins` | List installed plugins |
| `POST /plugins/install` | Install plugin |
| `GET /marketplace` | Browse marketplace |

### Plugin Invocation

```bash
# Invoke any plugin endpoint
POST /api/v1/invoke/{plugin-id}/{endpoint}

# Example: Formula Engine
POST /api/v1/invoke/formula-engine/evaluate
{"formula": "SUM(1,2,3)"}
```

### MCP Endpoints

| Route | Description |
|-------|-------------|
| `GET /mcp` | SSE endpoint for MCP clients |
| `GET /api/v1/mcp/tools` | List available tools |
| `POST /api/v1/mcp/tools/:name/call` | Execute a tool |
| `GET /api/v1/mcp/resources` | List resources |
| `GET /api/v1/mcp/prompts` | List prompts |

## Security Model

### Authentication

**Supported Methods:**
1. **API Keys**: For server-to-server communication
2. **JWT Tokens**: For user authentication (future)

### Request Flow

```
Client → LeForge → Validate Auth → Rate Limit → Route to Plugin
           │
           └─ Add X-Request-ID header
```

### Data Security
- **Encryption in Transit**: TLS for external connections
- **Input Validation**: JSON schema validation
- **CORS**: Configurable origin policies

## Scalability

### Single Instance (Default)
- Handles typical workloads
- All services in one container
- Simple deployment and management

### Horizontal Scaling (Advanced)
For high-load scenarios:
- Multiple LeForge instances behind load balancer
- External PostgreSQL cluster
- External Redis cluster
- Shared Docker registry

## Plugin Manifest

Every ForgeHook requires a `forgehook.json`:

```json
{
  "id": "formula-engine",
  "name": "Formula Engine",
  "version": "1.0.0",
  "description": "150+ Excel-compatible functions",
  "runtime": "embedded",
  "endpoints": [
    {
      "method": "POST",
      "path": "/evaluate",
      "description": "Evaluate formula"
    }
  ]
}
```

### Runtime Types

| Runtime | Description |
|---------|-------------|
| `embedded` | Runs in-process (JS/TS only) |
| `container` | Docker container |
| `gateway` | Proxy to external service |

## Monitoring

### Health Check

```bash
curl http://localhost:4000/api/v1/health
```

Response:
```json
{
  "status": "healthy",
  "version": "1.2.0",
  "uptime": 3600,
  "plugins": {
    "installed": 5,
    "running": 3
  }
}
```

### Logging

- Structured JSON logging
- Configurable log levels (debug, info, warn, error)
- Request correlation IDs

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20, TypeScript |
| Backend | Fastify 5 |
| Frontend | React 19, Vite, TailwindCSS |
| Database | PostgreSQL 15 (embedded) |
| Cache | Redis 7 (embedded) |
| Process Mgmt | supervisord |
| AI Protocol | Model Context Protocol (MCP) |
| Container | Docker |

## Future Considerations

1. **Kubernetes Operator**: Native K8s deployment
2. **Plugin Marketplace API**: Remote plugin discovery
3. **Multi-tenancy**: Isolated environments
4. **WebSocket Support**: Real-time plugin events
5. **GraphQL Gateway**: Alternative query interface
