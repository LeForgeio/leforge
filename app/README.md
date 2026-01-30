# LeForge - Unified Application

LeForge is a self-hosted AI and compute platform for workflow automation tools. This is the unified application that combines both the backend API and frontend UI in a single deployable package.

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                      LeForge App                            │
│                      (Port 4000)                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐      ┌─────────────────────────────┐  │
│  │   Fastify API   │      │      Static Frontend        │  │
│  │   /api/v1/*     │      │      React SPA              │  │
│  │   /health       │      │      (Vite built)           │  │
│  │   /mcp          │      │      /, /marketplace, etc   │  │
│  └────────┬────────┘      └─────────────────────────────┘  │
│           │                                                 │
│  ┌────────┴────────┐                                        │
│  │  Plugin Manager │  ← Manages ForgeHook containers        │
│  │  Docker Service │                                        │
│  └─────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
           │
     ┌─────┴─────┐
     │ Docker    │ → Spawns plugin containers dynamically
     │ Socket    │
     └───────────┘
```

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Run both frontend and backend in dev mode
npm run dev

# Or run separately:
npm run dev:server   # Backend on port 4000
npm run dev:client   # Frontend on port 3000 (proxied to backend)
```

### Production

```bash
# Build the entire application
npm run build

# Start production server
npm start
```

### Docker

```bash
# Build the Docker image
docker build -t leforge .

# Run with Docker Compose (includes all infrastructure)
docker compose -f docker-compose.unified.yml up -d
```

## API Endpoints

### Health

- `GET /health` - Health check with dependency status
- `GET /ready` - Readiness check

### Plugins

- `GET /api/v1/plugins` - List installed plugins
- `GET /api/v1/plugins/:id` - Get plugin details
- `POST /api/v1/plugins/install` - Install a plugin
- `POST /api/v1/plugins/:id/start` - Start a plugin
- `POST /api/v1/plugins/:id/stop` - Stop a plugin
- `POST /api/v1/plugins/:id/restart` - Restart a plugin
- `DELETE /api/v1/plugins/:id` - Uninstall a plugin
- `GET /api/v1/plugins/:id/logs` - Get plugin logs

### MCP (Model Context Protocol)

- `GET /mcp` - SSE endpoint for AI agent connections
- `GET /api/v1/mcp/tools` - List available tools
- `POST /api/v1/mcp/tools/:name/call` - Execute a tool
- `GET /api/v1/mcp/resources` - List resources
- `GET /api/v1/mcp/prompts` - List prompts

### Registry

- `GET /api/v1/registry/plugins` - List available plugins
- `GET /api/v1/registry/plugins/:id` - Get plugin details
- `GET /api/v1/registry/search?q=query` - Search plugins
- `GET /api/v1/registry/categories` - List categories
- `GET /api/v1/registry/featured` - Featured plugins
- `GET /api/v1/registry/stats` - Registry statistics

### WebSocket

- `WS /ws/events` - Real-time plugin events

## Frontend Routes

- `/` - Dashboard
- `/services` - Service management
- `/marketplace` - ForgeHook plugin marketplace
- `/plugins` - Installed plugins management
- `/playground` - API playground
- `/api-keys` - API key management
- `/docs` - Documentation

## Environment Variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
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
| `REDIS_PASSWORD` | `redis_password` | Redis password |
| `DOCKER_SOCKET_PATH` | `/var/run/docker.sock` | Docker socket path |
| `DOCKER_NETWORK` | `leforge-network` | Docker network for plugins |
| `PLUGIN_PORT_RANGE_START` | `4001` | Plugin port range start |
| `PLUGIN_PORT_RANGE_END` | `4999` | Plugin port range end |

## Project Structure

```text
app/
├── src/
│   ├── client/           # React frontend
│   │   ├── components/   # UI components
│   │   ├── hooks/        # React hooks
│   │   ├── pages/        # Page components
│   │   ├── store/        # Zustand stores
│   │   ├── types/        # TypeScript types
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── server/           # Fastify backend
│       ├── config/       # Configuration
│       ├── routes/       # API routes
│       ├── services/     # Business logic
│       ├── types/        # TypeScript types
│       ├── utils/        # Utilities
│       ├── app.ts        # Fastify setup
│       └── index.ts      # Entry point
├── migrations/           # Database migrations
├── registry/             # Plugin registry
├── public/               # Static assets
├── Dockerfile            # Production Docker image
├── package.json
├── vite.config.ts        # Frontend build config
├── tsconfig.server.json  # Server TypeScript config
├── tsconfig.client.json  # Client TypeScript config
└── tailwind.config.js    # Tailwind CSS config
```

## License

MIT
