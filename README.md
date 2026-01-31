# LeForge

**Self-hosted AI and compute platform for workflow automation tools**

LeForge provides a unified platform that extends the capabilities of workflow automation platforms like n8n, Make, Power Automate, Nintex, and Salesforce with AI, cryptography, advanced math, and data processing services.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

## ✨ Key Features

- **🤖 MCP Protocol** - Native Model Context Protocol support for AI agents (Claude, GPT, Cursor)
- **📦 Single Container** - One Docker container with app, database, and cache built-in
- **🔌 23 ForgeHook Plugins** - AI, cryptography, data transform, PDF, image, vector search, and more
- **⚡ Zero-Latency Embedded Plugins** - 11 utility plugins run in-process with no network overhead
- **🏠 Local AI Gateways** - Connect to Ollama, LM Studio, Microsoft Foundry for private inference
- **🔒 Secure by Default** - API key auth, CORS, rate limiting, input validation

## 🏗️ Architecture

LeForge uses a **single container architecture** for simplicity:

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

### Optional Add-ons

```
┌───────────────┐
│    Qdrant     │  ← For vector search / RAG applications
│    :6333      │
└───────────────┘
```

## 🚀 Quick Start

### Option 1: One-Line Deploy

```bash
docker run -d -p 4000:4000 --name leforge leforge/leforge:latest
```

### Option 2: Docker Compose

```bash
# Clone the repository
git clone https://github.com/LeForgeio/leforge.git
cd leforge

# Start LeForge
docker compose up -d

# Check health
curl http://localhost:4000/api/v1/health
```

### Option 3: With Vector Search (Qdrant)

```bash
docker compose -f docker-compose.unified.yml -f docker-compose.qdrant.yml up -d
```

### Accessing Services

| Service | URL | Description |
|---------|-----|-------------|
| Web UI / API | http://localhost:4000 | Dashboard and API |
| MCP Endpoint | http://localhost:4000/mcp | AI Agent protocol |
| Health Check | http://localhost:4000/api/v1/health | Service status |

## 🔄 Updating LeForge

Updates preserve all your data including users, plugins, and settings:

```bash
# PowerShell (Windows)
./update.ps1

# Bash (Linux/Mac)
./update.sh

# Or manually with Docker Compose
docker compose -f docker-compose.unified.yml build
docker compose -f docker-compose.unified.yml up -d
```

**⚠️ Never use `docker compose down -v`** — this deletes all volumes and data!

### What's Preserved

| Data | Volume | Description |
|------|--------|-------------|
| Users & Settings | `leforge-postgres-data` | Accounts, API keys, plugin configs |
| Sessions & Cache | `leforge-redis-data` | Active sessions, cached data |
| Plugin Data | `leforge-plugin-data` | Uploaded files, plugin storage |

Plugin containers are managed separately and are not affected by core app updates.

## 🤖 MCP Protocol (AI Agents)

LeForge implements the **Model Context Protocol (MCP)** — the open standard for AI agents:

```bash
# List available tools
curl http://localhost:4000/api/v1/mcp/tools

# AI agents can call any ForgeHook as an MCP tool
POST /api/v1/mcp/tools/crypto__post_hash/call
{
  "data": "Hello World",
  "algorithm": "sha256"
}
```

AI assistants like Claude, GPT, and Cursor can auto-discover and use all your installed ForgeHooks.

## 🔌 ForgeHook Plugins (23 Total)

### Docker Microservices (9)
| Plugin | Description |
|--------|-------------|
| LLM Service | Multi-provider AI (OpenAI, Claude, Bedrock, local) |
| Crypto Service | Hashing, AES encryption, RSA, signatures |
| Math Service | Expression evaluation, statistics, matrices |
| PDF Service | Generate, merge, split, extract text |
| OCR Service | PaddleOCR & Tesseract text extraction |
| Image Service | Resize, crop, convert, optimize |
| Vector Service | Qdrant-powered semantic search |
| Data Transform | JSON, XML, CSV, YAML conversion |
| Streaming Files | Chunked uploads for large files |

### Embedded Utilities (11) — Zero Latency
| Plugin | Functions |
|--------|-----------|
| String Utils | 17 text manipulation functions |
| Date Utils | 21 date/time functions |
| JSON Utils | 27 path query and merge functions |
| UUID Utils | 18 ID generation functions |
| Encoding Utils | 21 encoding/decoding functions |
| Validation Utils | 23 validation functions |
| Formula Engine | 150+ Excel-compatible functions |
| Excel Utils | 30+ XLSX/CSV functions |
| QR Code Utils | 10 QR/barcode generation functions |
| Content Filter | 10 moderation functions |
| Lorem Utils | 31 placeholder data functions |

### Local AI Gateways (3)
| Plugin | Description |
|--------|-------------|
| Ollama | Llama, Mistral, CodeLlama local inference |
| LM Studio | GGUF model inference |
| Foundry Local | Microsoft Phi and ONNX models |

## 📚 Documentation

- [Getting Started](docs/getting-started.md) - Installation and configuration
- [Architecture](docs/architecture.md) - System design and patterns
- [API Reference](docs/api-reference.md) - Complete API documentation
- [ForgeHook Specification](../forgehooks-registry/docs/FORGEHOOK_SPECIFICATION.md) - Plugin development

## 🛠️ Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20, TypeScript |
| Framework | Fastify 5, React 19 |
| Database | PostgreSQL 15 (embedded) |
| Cache | Redis 7 (embedded) |
| Container | Docker with supervisord |
| AI Protocol | Model Context Protocol (MCP) |

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](docs/contributing.md).

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

---

**Made with ❤️ for the automation community**
