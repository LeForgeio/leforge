# API Reference

This document provides a comprehensive reference for the LeForge API.

## Base URL

```
Production: https://your-domain.com/api/v1
Development: http://localhost:8000/api/v1
```

## Authentication

### API Key Authentication

Include your API key in the request header:

```bash
curl -H "X-API-Key: your-api-key" https://api.LeForge.io/api/v1/crypto/hash
```

### JWT Bearer Token

For user-authenticated requests:

```bash
curl -H "Authorization: Bearer your-jwt-token" https://api.LeForge.io/api/v1/crypto/hash
```

## Common Headers

| Header | Description | Required |
|--------|-------------|----------|
| `Content-Type` | `application/json` for JSON payloads | Yes |
| `X-API-Key` | Your API key | Yes* |
| `Authorization` | Bearer token for JWT auth | Yes* |
| `X-Request-ID` | Custom request ID for tracing | No |

*One authentication method required

## Response Format

### Success Response

```json
{
  "success": true,
  "data": {
    // Response data
  },
  "requestId": "req-abc123",
  "timestamp": "2026-01-17T12:00:00.000Z"
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input provided",
    "details": [
      {
        "field": "algorithm",
        "message": "Algorithm must be one of: sha256, sha512, md5"
      }
    ]
  },
  "requestId": "req-abc123",
  "timestamp": "2026-01-17T12:00:00.000Z"
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

---

## Crypto Service

Base path: `/api/v1/crypto`

### Hash Data

Generate a hash from input data.

```http
POST /api/v1/crypto/hash
```

**Request Body:**
```json
{
  "data": "string to hash",
  "algorithm": "sha256",
  "encoding": "hex"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | string | Yes | Data to hash |
| `algorithm` | string | No | Hash algorithm (default: sha256) |
| `encoding` | string | No | Output encoding: hex, base64 (default: hex) |

**Supported Algorithms:** `md5`, `sha1`, `sha256`, `sha384`, `sha512`

**Response:**
```json
{
  "success": true,
  "data": {
    "hash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    "algorithm": "sha256",
    "encoding": "hex"
  }
}
```

### Encrypt Data

Encrypt data using AES encryption.

```http
POST /api/v1/crypto/encrypt
```

**Request Body:**
```json
{
  "data": "sensitive data",
  "key": "your-encryption-key",
  "algorithm": "aes-256-gcm"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "encrypted": "base64-encoded-ciphertext",
    "iv": "base64-encoded-iv",
    "tag": "base64-encoded-auth-tag",
    "algorithm": "aes-256-gcm"
  }
}
```

### Decrypt Data

Decrypt previously encrypted data.

```http
POST /api/v1/crypto/decrypt
```

**Request Body:**
```json
{
  "encrypted": "base64-encoded-ciphertext",
  "key": "your-encryption-key",
  "iv": "base64-encoded-iv",
  "tag": "base64-encoded-auth-tag",
  "algorithm": "aes-256-gcm"
}
```

### Generate Key

Generate a cryptographic key.

```http
POST /api/v1/crypto/generate-key
```

**Request Body:**
```json
{
  "length": 32,
  "encoding": "hex"
}
```

---

## Math Service

Base path: `/api/v1/math`

### Calculate Expression

Evaluate a mathematical expression.

```http
POST /api/v1/math/calculate
```

**Request Body:**
```json
{
  "expression": "2 * (3 + 4) / 2",
  "precision": 4,
  "variables": {
    "x": 10,
    "y": 20
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "result": 7,
    "expression": "2 * (3 + 4) / 2"
  }
}
```

### Statistics

Calculate statistical measures.

```http
POST /api/v1/math/statistics
```

**Request Body:**
```json
{
  "data": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  "operations": ["mean", "median", "stddev", "variance", "min", "max"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "mean": 5.5,
    "median": 5.5,
    "stddev": 2.8723,
    "variance": 8.25,
    "min": 1,
    "max": 10,
    "count": 10
  }
}
```

### Matrix Operations

Perform matrix calculations.

```http
POST /api/v1/math/matrix
```

**Request Body:**
```json
{
  "operation": "multiply",
  "matrixA": [[1, 2], [3, 4]],
  "matrixB": [[5, 6], [7, 8]]
}
```

**Supported Operations:** `multiply`, `add`, `subtract`, `transpose`, `inverse`, `determinant`

---

## PDF Service

Base path: `/api/v1/pdf`

### Generate PDF

Generate a PDF from HTML or template.

```http
POST /api/v1/pdf/generate
```

**Request Body:**
```json
{
  "html": "<h1>Hello World</h1><p>This is a PDF</p>",
  "options": {
    "format": "A4",
    "margin": {
      "top": "20mm",
      "bottom": "20mm",
      "left": "15mm",
      "right": "15mm"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "pdf": "base64-encoded-pdf",
    "pages": 1,
    "size": 12345
  }
}
```

### Merge PDFs

Merge multiple PDF files.

```http
POST /api/v1/pdf/merge
```

**Request Body:**
```json
{
  "files": [
    "base64-encoded-pdf-1",
    "base64-encoded-pdf-2"
  ]
}
```

### Extract Text

Extract text content from a PDF.

```http
POST /api/v1/pdf/extract-text
```

**Request Body:**
```json
{
  "file": "base64-encoded-pdf",
  "pages": [1, 2, 3]
}
```

---

## OCR Service

Base path: `/api/v1/ocr`

### Extract Text from Image

Perform OCR on an image.

```http
POST /api/v1/ocr/extract
```

**Request Body:**
```json
{
  "image": "base64-encoded-image",
  "language": "en",
  "format": "text"
}
```

**Supported Languages:** `en`, `de`, `fr`, `es`, `it`, `pt`, `zh`, `ja`, `ko`

**Response:**
```json
{
  "success": true,
  "data": {
    "text": "Extracted text from the image",
    "confidence": 0.95,
    "language": "en",
    "blocks": [
      {
        "text": "Extracted text",
        "confidence": 0.95,
        "bbox": [10, 20, 100, 50]
      }
    ]
  }
}
```

---

## Image Service

Base path: `/api/v1/image`

### Resize Image

Resize an image to specified dimensions.

```http
POST /api/v1/image/resize
```

**Request Body:**
```json
{
  "image": "base64-encoded-image",
  "width": 800,
  "height": 600,
  "fit": "cover",
  "format": "webp",
  "quality": 80
}
```

**Fit Options:** `cover`, `contain`, `fill`, `inside`, `outside`

### Convert Format

Convert image to different format.

```http
POST /api/v1/image/convert
```

**Request Body:**
```json
{
  "image": "base64-encoded-image",
  "format": "webp",
  "quality": 85
}
```

**Supported Formats:** `jpeg`, `png`, `webp`, `gif`, `tiff`, `avif`

---

## LLM Service

Base path: `/api/v1/llm`

### Chat Completion

Generate a response from the LLM.

```http
POST /api/v1/llm/chat
```

**Request Body:**
```json
{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is the capital of France?"}
  ],
  "model": "default",
  "temperature": 0.7,
  "maxTokens": 500
}
```

### Generate Embeddings

Generate vector embeddings for text.

```http
POST /api/v1/llm/embeddings
```

**Request Body:**
```json
{
  "text": "Text to embed",
  "model": "default"
}
```

---

## Vector Service

Base path: `/api/v1/vector`

### Create Collection

Create a new vector collection.

```http
POST /api/v1/vector/collections
```

**Request Body:**
```json
{
  "name": "my-collection",
  "vectorSize": 1536,
  "distance": "cosine"
}
```

### Upsert Vectors

Add or update vectors in a collection.

```http
POST /api/v1/vector/collections/{collection}/upsert
```

**Request Body:**
```json
{
  "points": [
    {
      "id": "doc-1",
      "vector": [0.1, 0.2, 0.3, ...],
      "payload": {"title": "Document 1"}
    }
  ]
}
```

### Search Vectors

Search for similar vectors.

```http
POST /api/v1/vector/collections/{collection}/search
```

**Request Body:**
```json
{
  "vector": [0.1, 0.2, 0.3, ...],
  "limit": 10,
  "filter": {
    "category": "news"
  }
}
```

---

## Data Transform Service

Base path: `/api/v1/data`

### Transform JSON

Transform JSON data using JMESPath or JSONata.

```http
POST /api/v1/data/transform/json
```

**Request Body:**
```json
{
  "data": {"users": [{"name": "John"}, {"name": "Jane"}]},
  "expression": "users[*].name",
  "engine": "jmespath"
}
```

### Convert Formats

Convert between data formats.

```http
POST /api/v1/data/convert
```

**Request Body:**
```json
{
  "data": "<root><item>value</item></root>",
  "from": "xml",
  "to": "json"
}
```

**Supported Formats:** `json`, `xml`, `yaml`, `csv`

---

## OpenAPI Specifications

Each service provides its OpenAPI specification:

```
GET /api/v1/crypto/openapi.json
GET /api/v1/math/openapi.json
GET /api/v1/pdf/openapi.json
GET /api/v1/ocr/openapi.json
GET /api/v1/image/openapi.json
GET /api/v1/llm/openapi.json
GET /api/v1/vector/openapi.json
GET /api/v1/data/openapi.json
```

## Rate Limits

| Tier | Requests/Minute | Requests/Day |
|------|-----------------|--------------|
| Free | 100 | 1,000 |
| Basic | 500 | 10,000 |
| Pro | 2,000 | 50,000 |
| Enterprise | Unlimited | Unlimited |

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642345678
```
