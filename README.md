# FlowForge

**Self-hosted AI and compute platform for workflow automation tools**

FlowForge provides a unified microservices backend that extends the capabilities of workflow automation platforms like n8n, Make, and Zapier with AI, cryptography, advanced math, and data processing services they typically lack.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue.svg)](https://www.docker.com/)

## ✨ Key Features

- **🔐 Cryptography Service** - Encryption, decryption, hashing, and key generation
- **📊 Math Service** - Advanced calculations, statistics, and data analysis with NumPy/SciPy
- **📄 PDF Service** - Generate, merge, split, and manipulate PDF documents
- **🔍 OCR Service** - Extract text from images using PaddleOCR/Tesseract
- **🖼️ Image Service** - Resize, convert, and process images with Sharp
- **🤖 LLM Service** - Interface with local LLMs via vLLM
- **🔢 Vector Service** - Vector embeddings and similarity search with Qdrant
- **🔄 Data Transform** - JSON/XML transformations and data mapping

## 🏗️ Architecture

FlowForge uses a **minimal 2-container architecture** with an embedded gateway:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Workflow Tools                              │
│            (n8n, Outsystems, Zapier, K2, Nintex, Custom Apps etc)   │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FlowForge App (:3000)                           │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Embedded Gateway: Auth, Rate Limiting, CORS, Request Logging  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Plugin Manager: Install/manage ForgeHook plugins dynamically  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Web UI: Plugin marketplace and management dashboard           │ │
│  └────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│  PostgreSQL   │      │    Redis      │      │    Qdrant     │
│   (Required)  │      │  (Optional)   │      │  (Optional)   │
│    :5432      │      │    :6379      │      │    :6333      │
└───────────────┘      └───────────────┘      └───────────────┘
```

### Installed Plugins (Dynamic)

```
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ crypto-service│   │ math-service  │   │  pdf-service  │
│    :4001      │   │    :4002      │   │    :4003      │
└───────────────┘   └───────────────┘   └───────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 4GB+ RAM available

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/flowforge.git
cd flowforge

# Copy environment configuration
cp .env.example .env

# Start minimal setup (2 containers: PostgreSQL + FlowForge)
docker compose -f docker-compose.minimal.yml up -d

# Or with optional Redis (for distributed caching)
docker compose -f docker-compose.minimal.yml -f docker-compose.redis.yml up -d

# Check service health
docker compose ps
```

### Accessing Services

| Service | URL | Description |
|---------|-----|-------------|
| Web UI / API | http://localhost:3000 | Dashboard and API endpoint |
| API Docs | http://localhost:3000/docs | OpenAPI documentation |
| Health Check | http://localhost:3000/health | Service status |

### Authentication

```bash
# API Key (recommended for low-code platforms)
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/v1/plugins
```
curl -X POST http://localhost:8000/api/v1/crypto/hash \
  -H "Content-Type: application/json" \
  -d '{"algorithm": "sha256", "data": "Hello, FlowForge!"}'

# Response
{
  "hash": "a1b2c3d4...",
  "algorithm": "sha256"
}
```

## 📚 Documentation

- [Getting Started](docs/getting-started.md) - Installation and configuration
- [Architecture](docs/architecture.md) - System design and patterns
- [API Reference](docs/api-reference.md) - Complete API documentation
- [Deployment](docs/deployment.md) - Production deployment guide
- [Contributing](docs/contributing.md) - How to contribute

## 🔧 Development

```bash
# Start in development mode with hot reload
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Run tests
./scripts/test.sh

# Generate documentation
./scripts/generate-docs.sh
```

## 🗂️ Project Structure

```
flowforge/
├── app/              # Unified full-stack application
│   ├── src/
│   │   ├── client/   # React frontend
│   │   └── server/   # Fastify backend
│   └── migrations/   # Database migrations
├── gateway/          # Kong API Gateway configuration
├── services/         # Bundled microservices
│   ├── crypto-service/
│   ├── llm-service/
│   └── math-service/
├── sdk/              # Client SDKs
├── infrastructure/   # Docker configs
├── docs/             # Documentation
└── scripts/          # Utility scripts
```

> **Note**: Additional services (PDF, OCR, Image, Vector, Data Transform) are available as plugins from the [ForgeHooks Registry](https://github.com/danstoll/forgehooks-registry) and deployed dynamically.

## 🛠️ Technology Stack

| Layer | Technology |
|-------|------------|
| Gateway | Kong API Gateway |
| Backend (Node.js) | Express, TypeScript |
| Backend (Python) | FastAPI, Pydantic |
| Frontend | React 18, Vite, TailwindCSS |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| Vector DB | Qdrant |
| Containers | Docker, Docker Compose |

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](docs/contributing.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Kong](https://konghq.com/) for the API Gateway
- [n8n](https://n8n.io/), [Make](https://www.make.com/), [Zapier](https://zapier.com/) for workflow automation inspiration
- All our contributors and supporters

---

**Made with ❤️ for the automation community**
