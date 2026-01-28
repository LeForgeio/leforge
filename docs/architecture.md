# LeForge Architecture

This document describes the architecture and design patterns used in LeForge.

## Overview

LeForge is a microservices-based platform designed to provide AI and computational services to workflow automation tools. It follows a service-oriented architecture (SOA) with an API gateway pattern.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              External Clients                                │
│         (n8n, Make, Zapier, Custom Applications, Mobile Apps)               │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │ HTTPS
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Load Balancer (Optional)                          │
│                        (nginx, HAProxy, Cloud LB)                           │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Kong API Gateway                                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │   Auth      │ │ Rate Limit  │ │  Logging    │ │   CORS      │           │
│  │   Plugin    │ │   Plugin    │ │   Plugin    │ │   Plugin    │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                    Route Configuration                       │           │
│  │   /api/v1/crypto/*  → crypto-service                        │           │
│  │   /api/v1/math/*    → math-service                          │           │
│  │   /api/v1/pdf/*     → pdf-service                           │           │
│  │   /api/v1/ocr/*     → ocr-service                           │           │
│  │   /api/v1/image/*   → image-service                         │           │
│  │   /api/v1/llm/*     → llm-service                           │           │
│  │   /api/v1/vector/*  → vector-service                        │           │
│  │   /api/v1/data/*    → data-transform-service                │           │
│  └─────────────────────────────────────────────────────────────┘           │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  crypto-service │   │  math-service   │   │   pdf-service   │
│    (Node.js)    │   │    (Python)     │   │    (Node.js)    │
│                 │   │                 │   │                 │
│ • Encryption    │   │ • Calculations  │   │ • Generate PDF  │
│ • Decryption    │   │ • Statistics    │   │ • Merge/Split   │
│ • Hashing       │   │ • Matrix Ops    │   │ • Convert       │
│ • Key Gen       │   │ • Data Analysis │   │ • Extract Text  │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Infrastructure Layer                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   PostgreSQL    │  │      Redis      │  │     Qdrant      │             │
│  │   (Metadata)    │  │    (Caching)    │  │   (Vectors)     │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. API Gateway (Kong)

The Kong API Gateway serves as the single entry point for all API requests.

**Responsibilities:**
- **Authentication**: Validates API keys and JWT tokens
- **Rate Limiting**: Prevents abuse and ensures fair usage
- **Load Balancing**: Distributes requests across service instances
- **Request/Response Transformation**: Modifies headers, body as needed
- **Logging & Monitoring**: Centralized request logging
- **SSL Termination**: Handles HTTPS connections
- **API Versioning**: Routes to appropriate service versions

**Configuration:**
```yaml
services:
  - name: crypto-service
    url: http://crypto-service:3001
    routes:
      - name: crypto-routes
        paths:
          - /api/v1/crypto
```

### 2. Microservices

Each microservice follows these principles:

#### Design Principles
- **Single Responsibility**: Each service handles one domain
- **Loose Coupling**: Services communicate only through APIs
- **High Cohesion**: Related functionality grouped together
- **Stateless**: No server-side session state
- **Independently Deployable**: Can be updated without affecting others

#### Standard Endpoints
Every service exposes:
```
GET  /health          - Health check
GET  /metrics         - Prometheus metrics
GET  /openapi.json    - OpenAPI specification
POST /api/v1/...      - Service-specific endpoints
```

#### Error Response Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input provided",
    "details": [
      {
        "field": "algorithm",
        "message": "Algorithm must be one of: sha256, sha512, md5"
      }
    ],
    "requestId": "req-abc123"
  }
}
```

### 3. Service Communication

#### Synchronous Communication
- **REST APIs**: Primary communication method
- **HTTP/2**: Enabled for better performance
- **JSON**: Standard data format

#### Asynchronous Communication (Future)
- **Redis Pub/Sub**: For event broadcasting
- **Message Queues**: For long-running tasks

### 4. Data Layer

#### PostgreSQL
- **Purpose**: Persistent storage for metadata, configurations
- **Usage**: Kong configuration, user data, API keys

#### Redis
- **Purpose**: Caching, session storage, rate limiting
- **Features**:
  - Result caching for expensive operations
  - Session token storage
  - Rate limit counters

#### Qdrant
- **Purpose**: Vector similarity search
- **Usage**: 
  - Semantic search
  - Document embeddings
  - Recommendation systems

## Security Model

### Authentication

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Client    │──────▶  │    Kong     │──────▶  │   Service   │
│             │         │  (Auth)     │         │             │
└─────────────┘         └─────────────┘         └─────────────┘
      │                       │
      │ X-API-Key: xxx       │ Validates key
      │ Authorization:       │ Checks rate limits
      │   Bearer xxx         │ Adds X-User-ID header
      │                       │
```

**Supported Methods:**
1. **API Keys**: For server-to-server communication
2. **JWT Tokens**: For user authentication
3. **Basic Auth**: For simple integrations (optional)

### Rate Limiting

```
Tier 1 (Free):     100 requests/minute,   1,000 requests/day
Tier 2 (Basic):    500 requests/minute,  10,000 requests/day
Tier 3 (Pro):    2,000 requests/minute,  50,000 requests/day
Tier 4 (Enterprise): Unlimited (with fair use)
```

### Data Security
- **Encryption at Rest**: Database encryption
- **Encryption in Transit**: TLS 1.3 for all communications
- **Input Validation**: Strict schema validation on all inputs
- **Output Sanitization**: Prevent data leakage

## Scalability

### Horizontal Scaling

```
                    ┌─────────────────┐
                    │   Kong Gateway  │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ crypto-service  │ │ crypto-service  │ │ crypto-service  │
│   Instance 1    │ │   Instance 2    │ │   Instance 3    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Scaling Strategies
1. **Container Orchestration**: Kubernetes/Docker Swarm
2. **Auto-scaling**: Based on CPU/Memory/Request count
3. **Database Replication**: Read replicas for PostgreSQL
4. **Redis Cluster**: For high-availability caching

## Monitoring & Observability

### Metrics (Prometheus)
- Request rate, latency, error rate
- Resource utilization (CPU, memory)
- Business metrics (operations performed)

### Logging
- Structured JSON logging
- Correlation IDs for request tracing
- Centralized log aggregation

### Health Checks
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600,
  "checks": {
    "database": "healthy",
    "redis": "healthy"
  }
}
```

## Deployment Patterns

### Development
```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Production
```bash
docker-compose up -d
# Or with Kubernetes
kubectl apply -f k8s/
```

### Blue-Green Deployment
1. Deploy new version to "green" environment
2. Run health checks and tests
3. Switch traffic from "blue" to "green"
4. Keep "blue" as rollback option

## Service Catalog

| Service | Language | Primary Function | Dependencies |
|---------|----------|------------------|--------------|
| crypto-service | Node.js | Cryptographic operations | Redis |
| math-service | Python | Mathematical computations | Redis, NumPy |
| pdf-service | Node.js | PDF manipulation | Redis |
| ocr-service | Python | Text extraction from images | Redis, PaddleOCR |
| image-service | Node.js | Image processing | Redis, Sharp |
| llm-service | Python | LLM inference | Redis, vLLM |
| vector-service | Python | Vector search | Redis, Qdrant |
| data-transform-service | Node.js | Data transformation | Redis |

## Future Considerations

1. **Service Mesh**: Istio/Linkerd for advanced traffic management
2. **Event Sourcing**: For audit trails and replay capability
3. **GraphQL Gateway**: Alternative to REST for complex queries
4. **WebSocket Support**: For real-time features
5. **Multi-tenancy**: Isolated environments per tenant
