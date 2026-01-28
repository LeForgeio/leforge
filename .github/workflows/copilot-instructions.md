# LeForge - GitHub Copilot Instructions

## Project Overview

LeForge is a self-hosted microservices platform that provides AI and computational services for workflow automation tools like n8n, Make, and Zapier. It solves the gap where these platforms struggle: heavy computation, advanced AI/ML, complex file processing, and on-premise capabilities.

**Core Value Proposition:** On-premise AI & compute engine with unlimited executions, data sovereignty, and no per-call costs.

**Target Users:**
- n8n, Make, Zapier power users needing advanced capabilities
- Regulated industries (finance, healthcare, government) requiring on-premise AI
- Data-sensitive organizations that can't use cloud AI
- Cost-conscious teams avoiding per-execution pricing

## Architecture Principles

### Microservices Pattern
- Each service is independently deployable
- Services communicate via REST APIs over HTTP
- Kong API Gateway handles routing, authentication, and rate limiting
- All services expose OpenAPI 3.0 specifications
- Services are stateless (state stored in PostgreSQL/Redis/Qdrant)
- Docker-first development and deployment

### System Architecture
````
┌─────────────────────────────────────────────────┐
│            React Web UI (Port 3000)             │
│  - Service catalog                              │
│  - API playground                               │
│  - Monitoring dashboard                         │
└─────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│         API Gateway (Kong)                      │
│  - Authentication (JWT)                         │
│  - Rate limiting                                │
│  - Request routing                              │
│  - Metrics collection                           │
│  Ports: 8000 (proxy), 8001 (admin)             │
└─────────────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   Crypto    │ │    Math     │ │     PDF     │
│  Service    │ │   Service   │ │   Service   │
│  (Node.js)  │ │  (Python)   │ │  (Node.js)  │
└─────────────┘ └─────────────┘ └─────────────┘
        ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│    OCR      │ │   Image     │ │     LLM     │
│  Service    │ │   Service   │ │   Service   │
│  (Python)   │ │  (Node.js)  │ │  (Python)   │
└─────────────┘ └─────────────┘ └─────────────┘
        ▼              ▼
┌─────────────┐ ┌─────────────┐
│   Vector    │ │Data Transform│
│  Service    │ │   Service   │
│  (Python)   │ │  (Node.js)  │
└─────────────┘ └─────────────┘
        │
        ▼
┌─────────────────────────────────────────────────┐
│     Shared Infrastructure                       │
│  - PostgreSQL (metadata, Kong config)           │
│  - Redis (caching, sessions, queues)            │
│  - Qdrant (vector database)                     │
│  - vLLM (LLM inference engine)                  │
└─────────────────────────────────────────────────┘
````

## Technology Stack Standards

### API Gateway
- **Kong Gateway** 3.4+
- **PostgreSQL** for Kong configuration storage
- Plugins: JWT auth, rate limiting, CORS, request-id, Prometheus metrics

### Service Implementation Languages

**Node.js Services (TypeScript):**
- crypto-service
- pdf-service
- image-service
- data-transform-service

**Python Services:**
- math-service
- ocr-service
- llm-service
- vector-service

**Service Selection Guide:**
- Use Node.js for: I/O-heavy operations, file processing, API integrations
- Use Python for: Mathematical operations, ML/AI, data science, scientific computing
- Use Go (future): Ultra-high performance requirements, system-level operations

### Infrastructure Components
- **PostgreSQL 15+** - Metadata storage, Kong configuration
- **Redis 7+** - Caching, session storage, task queues
- **Qdrant** - Vector database for embeddings and semantic search
- **vLLM** - High-performance LLM inference engine
- **Prometheus + Grafana** - Monitoring and metrics (future)

### Frontend Stack
- **React 18+** with TypeScript
- **Vite** - Build tooling and dev server
- **shadcn/ui** - UI component library
- **TanStack Query** - Server state management
- **React Router** - Client-side routing
- **Tailwind CSS** - Styling
- **Zustand** - Client state management (lightweight)

## Mandatory Service Standards

### Every Service MUST Include

#### 1. Health Check Endpoint
````typescript
// GET /health
{
  "status": "healthy" | "degraded" | "unhealthy",
  "service": "service-name",
  "version": "1.0.0",
  "uptime": 3600,
  "timestamp": "2024-01-18T10:30:00Z",
  "dependencies": {
    "database": "healthy",
    "redis": "healthy"
  }
}
````

#### 2. Metrics Endpoint
````
GET /metrics
# Prometheus format
# TYPE service_requests_total counter
service_requests_total{method="POST",endpoint="/api/v1/encrypt",status="200"} 1234
````

#### 3. OpenAPI Specification
````
GET /openapi.json
# Returns full OpenAPI 3.0 specification
````

#### 4. Versioned API Paths
All endpoints MUST use versioned paths: `/api/v1/...`

#### 5. Standard Error Response Format
````json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": ["specific error 1", "specific error 2"],
    "requestId": "uuid-v4-here",
    "timestamp": "2024-01-18T10:30:00Z",
    "path": "/api/v1/endpoint"
  }
}
````

**Standard Error Codes:**
- `VALIDATION_ERROR` - Input validation failed (400)
- `AUTHENTICATION_ERROR` - Invalid or missing authentication (401)
- `AUTHORIZATION_ERROR` - Insufficient permissions (403)
- `NOT_FOUND` - Resource not found (404)
- `RATE_LIMIT_EXCEEDED` - Too many requests (429)
- `INTERNAL_ERROR` - Server error (500)
- `SERVICE_UNAVAILABLE` - Service temporarily unavailable (503)

#### 6. Request ID Tracing
- Accept `X-Request-ID` header from Kong
- Generate UUID if not provided
- Include in all logs and error responses
- Pass to downstream service calls

#### 7. Structured Logging
````json
{
  "level": "info" | "warn" | "error",
  "timestamp": "2024-01-18T10:30:00Z",
  "service": "service-name",
  "requestId": "uuid",
  "method": "POST",
  "path": "/api/v1/endpoint",
  "statusCode": 200,
  "duration": 45,
  "message": "Request completed",
  "userId": "optional-user-id"
}
````

#### 8. Graceful Shutdown
- Listen for SIGTERM signal
- Stop accepting new requests
- Finish processing in-flight requests (max 30s timeout)
- Close database/Redis connections
- Exit with code 0

## Node.js (TypeScript) Service Standards

### Directory Structure
````
service-name/
├── Dockerfile                 # Multi-stage build
├── .dockerignore
├── package.json
├── package-lock.json
├── tsconfig.json
├── .eslintrc.json
├── .prettierrc
├── jest.config.js
├── src/
│   ├── index.ts              # Entry point, server startup
│   ├── app.ts                # Fastify app configuration
│   ├── config/               # Configuration management
│   │   └── index.ts
│   ├── routes/               # Route handlers
│   │   ├── index.ts          # Route registration
│   │   ├── health.ts
│   │   └── feature.ts
│   ├── middleware/           # Middleware functions
│   │   ├── validation.ts
│   │   ├── auth.ts
│   │   ├── error-handler.ts
│   │   └── request-logger.ts
│   ├── services/             # Business logic layer
│   │   └── feature.service.ts
│   ├── models/               # Data models and types
│   │   └── feature.model.ts
│   ├── schemas/              # Validation schemas (Joi/Zod)
│   │   └── feature.schema.ts
│   └── utils/                # Utility functions
│       ├── logger.ts
│       └── errors.ts
├── tests/
│   ├── unit/
│   │   └── services/
│   ├── integration/
│   │   └── routes/
│   └── fixtures/
├── openapi.yaml              # OpenAPI 3.0 specification
└── README.md
````

### Required Dependencies
````json
{
  "dependencies": {
    "fastify": "^4.25.0",
    "@fastify/cors": "^8.4.0",
    "@fastify/helmet": "^11.1.0",
    "@fastify/jwt": "^7.2.0",
    "pino": "^8.16.0",
    "pino-pretty": "^10.2.0",
    "joi": "^17.11.0",
    "dotenv": "^16.3.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/jest": "^29.5.0",
    "typescript": "^5.3.0",
    "ts-node": "^10.9.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "supertest": "^6.3.0",
    "eslint": "^8.55.0",
    "prettier": "^3.1.0",
    "@typescript-eslint/eslint-plugin": "^6.14.0",
    "@typescript-eslint/parser": "^6.14.0"
  }
}
````

### TypeScript Configuration (tsconfig.json)
````json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
````

### Dockerfile Template (Multi-stage)
````dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copy only necessary files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/index.js"]
````

### Code Style Requirements
- **TypeScript strict mode** enabled
- **ESLint** with TypeScript plugin
- **Prettier** for code formatting
- **No `any` types** - Use proper typing
- **Async/await** - No callbacks
- **Error handling** - Always use try-catch for async operations
- **Naming conventions:**
  - Files: kebab-case (`user-service.ts`)
  - Classes: PascalCase (`UserService`)
  - Functions/variables: camelCase (`getUserById`)
  - Constants: UPPER_SNAKE_CASE (`MAX_RETRIES`)
  - Interfaces: PascalCase with `I` prefix (`IUserConfig`) or without prefix
  - Types: PascalCase (`UserRole`)

### Example Route Handler
````typescript
// src/routes/feature.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';
import { FeatureService } from '../services/feature.service';
import { logger } from '../utils/logger';

const requestSchema = Joi.object({
  data: Joi.string().required(),
  options: Joi.object({
    param1: Joi.string(),
    param2: Joi.number().min(1).max(100)
  })
});

interface FeatureRequest {
  data: string;
  options?: {
    param1?: string;
    param2?: number;
  };
}

export async function featureRoutes(fastify: FastifyInstance) {
  const featureService = new FeatureService();

  fastify.post<{ Body: FeatureRequest }>(
    '/api/v1/feature/process',
    {
      schema: {
        description: 'Process feature data',
        tags: ['feature'],
        body: {
          type: 'object',
          required: ['data'],
          properties: {
            data: { type: 'string' },
            options: {
              type: 'object',
              properties: {
                param1: { type: 'string' },
                param2: { type: 'number', minimum: 1, maximum: 100 }
              }
            }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              result: { type: 'string' },
              requestId: { type: 'string' }
            }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: FeatureRequest }>, reply: FastifyReply) => {
      const requestId = request.id;
      
      try {
        // Validate request
        const { error, value } = requestSchema.validate(request.body);
        if (error) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid request data',
              details: error.details.map(d => d.message),
              requestId,
              timestamp: new Date().toISOString()
            }
          });
        }

        logger.info({ requestId, data: value.data }, 'Processing feature request');

        // Process request
        const result = await featureService.process(value.data, value.options);

        logger.info({ requestId, result }, 'Feature request completed');

        return reply.status(200).send({
          result,
          requestId
        });

      } catch (error) {
        logger.error({ requestId, error }, 'Feature request failed');
        
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to process request',
            details: [error instanceof Error ? error.message : 'Unknown error'],
            requestId,
            timestamp: new Date().toISOString()
          }
        });
      }
    }
  );
}
````

## Python (FastAPI) Service Standards

### Directory Structure
````
service-name/
├── Dockerfile
├── .dockerignore
├── requirements.txt
├── requirements-dev.txt
├── pyproject.toml           # For black, mypy, etc.
├── pytest.ini
├── .pylintrc
├── src/
│   ├── __init__.py
│   ├── main.py             # FastAPI app entry point
│   ├── config.py           # Configuration management
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── health.py
│   │   └── feature.py
│   ├── middleware/
│   │   ├── __init__.py
│   │   ├── logging.py
│   │   └── error_handler.py
│   ├── services/
│   │   ├── __init__.py
│   │   └── feature_service.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── feature.py      # Pydantic models
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── feature.py      # Request/response schemas
│   └── utils/
│       ├── __init__.py
│       ├── logger.py
│       └── errors.py
├── tests/
│   ├── __init__.py
│   ├── unit/
│   │   └── test_feature_service.py
│   ├── integration/
│   │   └── test_feature_routes.py
│   └── conftest.py
├── openapi.yaml            # Optional: FastAPI auto-generates
└── README.md
````

### Required Dependencies (requirements.txt)
````txt
fastapi==0.109.0
uvicorn[standard]==0.27.0
pydantic==2.5.0
pydantic-settings==2.1.0
python-dotenv==1.0.0
loguru==0.7.2
python-multipart==0.0.6
httpx==0.26.0
prometheus-client==0.19.0
````

### Development Dependencies (requirements-dev.txt)
````txt
pytest==7.4.0
pytest-asyncio==0.21.0
pytest-cov==4.1.0
httpx==0.26.0
black==23.12.0
mypy==1.7.0
pylint==3.0.0
isort==5.13.0
````

### Python Configuration (pyproject.toml)
````toml
[tool.black]
line-length = 100
target-version = ['py311']
include = '\.pyi?$'

[tool.isort]
profile = "black"
line_length = 100

[tool.mypy]
python_version = "3.11"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true
no_implicit_optional = true

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = "test_*.py"
python_functions = "test_*"
asyncio_mode = "auto"
````

### Dockerfile Template (Multi-stage)
````dockerfile
# Build stage
FROM python:3.11-slim AS builder
WORKDIR /app

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Production stage
FROM python:3.11-slim
WORKDIR /app

# Copy Python dependencies from builder
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Copy application code
COPY src/ ./src/

# Create non-root user
RUN useradd -m -u 1001 appuser && \
    chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import httpx; httpx.get('http://localhost:8000/health', timeout=2.0)"

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
````

### Code Style Requirements
- **Python 3.11+** required
- **Type hints** on all functions and methods
- **Black** for code formatting (100 char line length)
- **isort** for import sorting
- **mypy** for type checking
- **pylint** for linting
- **Docstrings** on all public functions (Google style)
- **Naming conventions:**
  - Files: snake_case (`feature_service.py`)
  - Classes: PascalCase (`FeatureService`)
  - Functions/variables: snake_case (`get_user_by_id`)
  - Constants: UPPER_SNAKE_CASE (`MAX_RETRIES`)
  - Private methods: `_method_name`

### Example Route Handler
````python
# src/routes/feature.py
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, validator
from loguru import logger

from src.services.feature_service import FeatureService

router = APIRouter(prefix="/api/v1/feature", tags=["feature"])
feature_service = FeatureService()


class FeatureRequest(BaseModel):
    """Request model for feature processing."""
    
    data: str = Field(..., description="Data to process", min_length=1)
    options: Optional[dict] = Field(None, description="Processing options")
    
    @validator('data')
    def validate_data(cls, v: str) -> str:
        """Validate data field."""
        if not v.strip():
            raise ValueError("Data cannot be empty")
        return v


class FeatureResponse(BaseModel):
    """Response model for feature processing."""
    
    result: str
    request_id: str


class ErrorResponse(BaseModel):
    """Standard error response."""
    
    error: dict


@router.post(
    "/process",
    response_model=FeatureResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        500: {"model": ErrorResponse, "description": "Internal server error"}
    },
    summary="Process feature data",
    description="Process data using the feature service"
)
async def process_feature(
    request: Request,
    body: FeatureRequest
) -> FeatureResponse:
    """
    Process feature data.
    
    Args:
        request: FastAPI request object
        body: Request body with data and options
        
    Returns:
        FeatureResponse with processing result
        
    Raises:
        HTTPException: If processing fails
    """
    request_id = request.state.request_id
    
    try:
        logger.info(
            f"Processing feature request",
            extra={
                "request_id": request_id,
                "data_length": len(body.data)
            }
        )
        
        result = await feature_service.process(
            data=body.data,
            options=body.options
        )
        
        logger.info(
            f"Feature request completed",
            extra={"request_id": request_id}
        )
        
        return FeatureResponse(result=result, request_id=request_id)
        
    except ValueError as e:
        logger.warning(
            f"Validation error: {str(e)}",
            extra={"request_id": request_id}
        )
        raise HTTPException(
            status_code=400,
            detail={
                "code": "VALIDATION_ERROR",
                "message": str(e),
                "request_id": request_id
            }
        )
    except Exception as e:
        logger.error(
            f"Processing failed: {str(e)}",
            extra={"request_id": request_id},
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail={
                "code": "INTERNAL_ERROR",
                "message": "Failed to process request",
                "request_id": request_id
            }
        )
````

## Docker Compose Configuration

### Environment Variables (.env.example)
````bash
# Application
NODE_ENV=development
LOG_LEVEL=info

# PostgreSQL
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=LeForge
POSTGRES_PASSWORD=changeme
POSTGRES_DB=LeForge_db

# Kong PostgreSQL
KONG_PG_HOST=postgres
KONG_PG_PORT=5432
KONG_PG_USER=kong
KONG_PG_PASSWORD=changeme
KONG_PG_DATABASE=kong_db

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=changeme

# Qdrant
QDRANT_HOST=qdrant
QDRANT_PORT=6333

# JWT
JWT_SECRET=generate-a-secure-random-string-here
JWT_EXPIRY=24h

# Service Ports
CRYPTO_SERVICE_PORT=3001
MATH_SERVICE_PORT=8001
PDF_SERVICE_PORT=3002
OCR_SERVICE_PORT=8002
IMAGE_SERVICE_PORT=3003
LLM_SERVICE_PORT=8003
VECTOR_SERVICE_PORT=8004
DATA_TRANSFORM_SERVICE_PORT=3004

# vLLM
VLLM_MODEL=TinyLlama/TinyLlama-1.1B-Chat-v1.0
VLLM_GPU_MEMORY_UTILIZATION=0.9
VLLM_MAX_MODEL_LEN=2048

# Web UI
WEB_UI_PORT=3000
API_GATEWAY_URL=http://localhost:8000
````

### docker-compose.yml Structure
````yaml
version: '3.8'

networks:
  LeForge-backend:
    driver: bridge
  LeForge-frontend:
    driver: bridge

volumes:
  postgres-data:
  redis-data:
  qdrant-data:
  model-cache:

services:
  # Infrastructure services first
  postgres:
    # ...
  
  redis:
    # ...
  
  qdrant:
    # ...
  
  # API Gateway
  kong-migration:
    # Bootstrap migrations
  
  kong:
    # Main gateway
  
  # Application services
  crypto-service:
    # ...
  
  # Frontend
  web-ui:
    # ...
````

## Testing Requirements

### Unit Tests
- **Coverage:** Minimum 80% code coverage
- **Framework:** Jest (Node.js), pytest (Python)
- **Scope:** Test individual functions and classes in isolation
- **Mock:** External dependencies (database, Redis, HTTP calls)

### Integration Tests
- **Scope:** Test API endpoints end-to-end
- **Framework:** Supertest (Node.js), httpx (Python)
- **Database:** Use test database or in-memory database
- **Coverage:** All API endpoints, error cases, edge cases

### Example Test Structure (Node.js)
````typescript
// tests/integration/routes/feature.test.ts
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app';

describe('Feature Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/feature/process', () => {
    it('should process valid request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/feature/process',
        payload: {
          data: 'test data',
          options: { param1: 'value1' }
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('result');
      expect(response.json()).toHaveProperty('requestId');
    });

    it('should return 400 for invalid request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/feature/process',
        payload: {
          // Missing required 'data' field
          options: { param1: 'value1' }
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });
  });
});
````

### Example Test Structure (Python)
````python
# tests/integration/test_feature_routes.py
import pytest
from httpx import AsyncClient
from src.main import app


@pytest.mark.asyncio
async def test_process_feature_success():
    """Test successful feature processing."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/feature/process",
            json={
                "data": "test data",
                "options": {"param1": "value1"}
            }
        )
    
    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert "request_id" in data


@pytest.mark.asyncio
async def test_process_feature_validation_error():
    """Test validation error handling."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/feature/process",
            json={"options": {"param1": "value1"}}  # Missing required 'data'
        )
    
    assert response.status_code == 422  # FastAPI validation error
    data = response.json()
    assert "detail" in data
````

## Documentation Requirements

### Service README.md Template
````markdown
# Service Name

Brief description of what this service does.

## Features

- Feature 1
- Feature 2
- Feature 3

## API Endpoints

### POST /api/v1/endpoint
Description of endpoint.

**Request:**
```json
{
  "field1": "value",
  "field2": 123
}
```

**Response:**
```json
{
  "result": "value",
  "requestId": "uuid"
}
```

**Errors:**
- 400: Validation error
- 500: Internal server error

## Configuration

Environment variables:
- `SERVICE_PORT` - Port to listen on (default: 3000)
- `LOG_LEVEL` - Logging level (default: info)
- `DATABASE_URL` - Database connection string

## Development

### Setup
```bash
npm install
cp .env.example .env
```

### Run locally
```bash
npm run dev
```

### Run tests
```bash
npm test
npm run test:coverage
```

### Build
```bash
npm run build
```

### Docker
```bash
docker build -t LeForge/service-name .
docker run -p 3000:3000 LeForge/service-name
```

## Dependencies

Key dependencies and their purposes:
- fastify: Web framework
- pino: Logging
- joi: Validation
````

### OpenAPI Documentation
- Auto-generate from code when possible
- Include descriptions for all endpoints
- Provide example requests and responses
- Document all error codes
- Include authentication requirements

## Security Requirements

### Input Validation
- Validate ALL user input
- Use schema validation (Joi, Pydantic)
- Sanitize HTML/SQL inputs
- Limit request body size (default: 1MB)
- Validate file uploads (type, size, content)

### Authentication & Authorization
- All endpoints require JWT except: /health, /metrics, /openapi.json
- Validate JWT signature and expiry
- Extract user ID from JWT payload
- Implement role-based access control (RBAC) where needed

### Rate Limiting
- Implement at Kong level (default: 100 req/min per consumer)
- Return 429 with Retry-After header
- Different limits for different endpoints if needed

### Data Protection
- Never log sensitive data (passwords, tokens, PII)
- Encrypt sensitive data at rest
- Use HTTPS in production
- Implement CORS properly
- Set security headers (helmet/fastify-helmet)

### Dependencies
- Regularly update dependencies
- Use npm audit / pip-audit
- Pin major versions
- Review security advisories

## Performance Requirements

### Response Times
- Health checks: < 100ms
- Simple operations: < 500ms
- Complex operations: < 5s
- File processing: < 30s (with proper timeout handling)

### Resource Limits
- Memory: Max 512MB per service (configurable)
- CPU: Max 1 CPU core per service (configurable)
- File uploads: Max 50MB (configurable)
- Request timeout: 30s (configurable)

### Optimization
- Use connection pooling (database, Redis)
- Implement caching where appropriate
- Stream large files (don't load into memory)
- Use async/await for I/O operations
- Batch database queries when possible

## Monitoring & Observability

### Metrics to Expose
````
# Request metrics
http_requests_total{method, endpoint, status}
http_request_duration_seconds{method, endpoint}

# Service metrics
service_up{service_name}
service_errors_total{service_name, error_type}

# Resource metrics
process_cpu_usage
process_memory_usage
process_open_file_descriptors
````

### Logging Requirements
- Log all requests with request ID
- Log errors with stack traces
- Log slow operations (> 1s)
- Include contextual information
- Use structured logging (JSON)
- Don't log sensitive information

### Health Checks
- Check database connectivity
- Check Redis connectivity
- Check external dependencies
- Report "degraded" if dependencies are down
- Include uptime and version info

## Development Workflow

### Branch Strategy
- `main` - Production-ready code
- `develop` - Integration branch
- `feature/*` - Feature branches
- `fix/*` - Bug fix branches
- `release/*` - Release branches

### Commit Messages
Follow conventional commits:
````
feat: add new encryption algorithm
fix: resolve memory leak in PDF generation
docs: update API documentation
test: add integration tests for crypto service
refactor: simplify validation logic
chore: update dependencies
````

### Pull Request Process
1. Create feature branch from `develop`
2. Implement feature with tests
3. Ensure all tests pass
4. Update documentation
5. Create PR with description
6. Request review
7. Address review comments
8. Merge to `develop`

### Code Review Checklist
- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] No security vulnerabilities
- [ ] Performance is acceptable
- [ ] Error handling is proper
- [ ] Logging is appropriate
- [ ] OpenAPI spec is updated

## Common Patterns

### Error Handling Pattern
````typescript
// Node.js
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  logger.error({ requestId, error }, 'Operation failed');
  
  if (error instanceof ValidationError) {
    throw new BadRequestError(error.message);
  }
  
  throw new InternalError('Operation failed');
}
````
````python
# Python
try:
    result = await risky_operation()
    return result
except ValueError as e:
    logger.warning(f"Validation error: {e}", extra={"request_id": request_id})
    raise HTTPException(status_code=400, detail=str(e))
except Exception as e:
    logger.error(f"Operation failed: {e}", extra={"request_id": request_id}, exc_info=True)
    raise HTTPException(status_code=500, detail="Internal server error")
````

### Database Connection Pattern
````typescript
// Node.js - Use connection pool
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Use pool for queries
const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
````
````python
# Python - Use async connection pool
from asyncpg import create_pool

pool = await create_pool(
    host=settings.POSTGRES_HOST,
    port=settings.POSTGRES_PORT,
    database=settings.POSTGRES_DB,
    user=settings.POSTGRES_USER,
    password=settings.POSTGRES_PASSWORD,
    min_size=10,
    max_size=20,
)

# Use pool for queries
async with pool.acquire() as connection:
    result = await connection.fetchrow('SELECT * FROM users WHERE id = $1', user_id)
````

### Caching Pattern
````typescript
// Node.js with Redis
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
});

async function getCachedOrFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = 3600
): Promise<T> {
  const cached = await redis.get(key);
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  const data = await fetchFn();
  await redis.setex(key, ttl, JSON.stringify(data));
  
  return data;
}
````

## Integration Examples

### Calling from n8n
````json
{
  "nodes": [
    {
      "name": "LeForge Crypto",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "http://LeForge:8000/api/v1/crypto/encrypt",
        "authentication": "genericCredentialType",
        "genericAuthType": "jwtAuth",
        "jsonParameters": true,
        "options": {},
        "bodyParameters": {
          "data": "={{ $json.sensitiveData }}",
          "algorithm": "aes-256-gcm"
        }
      }
    }
  ]
}
````

### Calling from Make
````javascript
// HTTP Module
{
  "url": "http://LeForge:8000/api/v1/llm/generate",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer {{jwt_token}}",
    "Content-Type": "application/json"
  },
  "body": {
    "prompt": "{{trigger.text}}",
    "max_tokens": 100
  }
}
````

### Calling from Python
````python
import httpx

async def call_LeForge_service():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://LeForge:8000/api/v1/math/calculate",
            json={"expression": "2 + 2 * 10"},
            headers={"Authorization": f"Bearer {jwt_token}"}
        )
        response.raise_for_status()
        return response.json()
````

## When to Create New Services

Create a new microservice when:
1. **Distinct domain boundary** - Service has clear, separate responsibility
2. **Different technology needs** - Python for ML, Node.js for I/O
3. **Independent scaling** - Service has different load characteristics
4. **Team ownership** - Different teams own different services
5. **Deployment independence** - Service should be deployed separately

Don't create new service when:
1. Just adding a new endpoint to existing functionality
2. Tight coupling with existing service
3. Shared data models and business logic
4. Would increase complexity without clear benefit

## Copilot Usage Guidelines

### When Writing Code
- Always include type annotations
- Add JSDoc/docstrings for public functions
- Follow the established patterns in this document
- Generate tests alongside implementation code
- Update OpenAPI specs when adding endpoints

### When Asking for Help
- Specify the service and language
- Reference this document for standards
- Provide context about the feature
- Ask for tests to be included

### Example Prompts
````
"Create a new POST endpoint in crypto-service for HMAC signing. 
Follow the Node.js patterns in copilot-instructions.md. 
Include request validation, error handling, logging, and integration tests."

"Implement a new Python service for OCR using PaddleOCR. 
Follow the FastAPI patterns in copilot-instructions.md.
Include Dockerfile, health check, and tests."

"Add rate limiting to the math-service using Kong. 
Provide Kong configuration and update docker-compose.yml."
````

## Service-Specific Guidelines

### Crypto Service (Node.js)
- Use Node.js `crypto` module (built-in, no external dependencies)
- Support multiple algorithms (AES-256-GCM, AES-256-CBC, RSA)
- Generate cryptographically secure random IVs
- Return IV/tag with encrypted data for decryption
- Use `scrypt` or `argon2` for password hashing (never MD5/SHA1)

### Math Service (Python)
- Use NumPy for array operations
- Use SciPy for advanced math
- Use pandas for data manipulation
- Cache expensive calculations (Redis)
- Support vectorized operations for performance
- Return precise decimal values (not floats) for financial calculations

### PDF Service (Node.js)
- Use `pdf-lib` for PDF manipulation
- Use `puppeteer` for HTML to PDF
- Stream large PDFs (don't load into memory)
- Set max file size limits (default 50MB)
- Clean up temp files after processing
- Sanitize HTML input to prevent XSS

### OCR Service (Python)
- Use PaddleOCR or Tesseract
- Support multiple languages
- Return bounding boxes with text
- Handle rotated/skewed images
- Pre-process images for better accuracy
- Support table extraction

### Image Service (Node.js)
- Use `sharp` for image processing
- Support common formats (JPEG, PNG, WebP, GIF)
- Implement lazy loading for large images
- Generate responsive image sizes
- Preserve EXIF data option
- Optimize for web delivery

### LLM Service (Python)
- Interface with vLLM server
- Support streaming responses (SSE)
- Implement request queuing for concurrency
- Track token usage per request
- Support multiple models
- Cache embeddings when possible
- Implement timeout handling (30s default)

### Vector Service (Python)
- Use Qdrant client
- Implement connection pooling
- Support batch upserts (100+ vectors at once)
- Index vectors by collection
- Support metadata filtering
- Implement hybrid search (vector + keyword)
- Cache frequently searched vectors

## Troubleshooting Common Issues

### Service Won't Start
1. Check environment variables in `.env`
2. Verify database migrations ran successfully
3. Check service logs: `docker-compose logs <service-name>`
4. Ensure dependencies are up: `docker-compose up -d postgres redis`
5. Check port conflicts

### Database Connection Issues
1. Verify PostgreSQL is running: `docker-compose ps postgres`
2. Check credentials in `.env`
3. Ensure database exists: `docker-compose exec postgres psql -U LeForge -l`
4. Check network connectivity
5. Review connection pool settings

### Kong Gateway Issues
1. Verify Kong migrations completed: `docker-compose logs kong-migration`
2. Check Kong admin API: `curl http://localhost:8001/status`
3. Verify service registration: `curl http://localhost:8001/services`
4. Check routes: `curl http://localhost:8001/routes`
5. Test direct service access (bypass Kong)

### High Memory Usage
1. Check for memory leaks (Node.js heap snapshots)
2. Implement streaming for large files
3. Clear cache periodically
4. Limit request body size
5. Use connection pooling efficiently

### Slow Response Times
1. Add database indexes
2. Implement caching (Redis)
3. Use batch operations
4. Profile slow queries
5. Optimize algorithms
6. Check network latency

## Future Enhancements

### Planned Services
- **Audio Service** - Speech-to-text, audio format conversion
- **Video Service** - Video transcoding, thumbnail generation
- **Workflow Service** - State machine execution
- **Notification Service** - Email, SMS, push notifications
- **Archive Service** - ZIP, TAR compression/extraction

### Planned Features
- **Kubernetes deployment** - Helm charts, auto-scaling
- **Multi-tenancy** - Isolated environments per tenant
- **API versioning** - Support v1, v2 simultaneously
- **GraphQL API** - Alternative to REST
- **Webhooks** - Event notifications
- **Batch processing** - Async job queue with results
- **Admin dashboard** - Monitoring, user management
- **SDK generation** - Auto-generate client libraries

### Infrastructure Improvements
- **Service mesh** - Istio/Linkerd for advanced traffic management
- **Observability** - Distributed tracing with Tempo/Jaeger
- **GitOps** - ArgoCD for deployment automation
- **Secrets management** - HashiCorp Vault integration
- **Backup/restore** - Automated database backups
- **Disaster recovery** - Multi-region deployment

## Additional Resources

### External Documentation
- [Fastify Documentation](https://www.fastify.io/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Kong Gateway Documentation](https://docs.konghq.com/)
- [OpenAPI Specification](https://swagger.io/specification/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)

### Internal Documentation
- `/docs/architecture.md` - Detailed architecture
- `/docs/api-reference/` - API documentation
- `/docs/deployment.md` - Deployment guides
- `/docs/development.md` - Development setup

---

**Last Updated:** 2024-01-18
**Version:** 1.0.0