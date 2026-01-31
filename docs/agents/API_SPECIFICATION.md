# Agent API Specification

## Base URL

```
/api/v1/agents
```

## Endpoints

### List Agents

```http
GET /api/v1/agents
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `active_only` | boolean | true | Only return active agents |
| `limit` | number | 50 | Max results |
| `offset` | number | 0 | Pagination offset |

**Response:**
```json
{
  "agents": [
    {
      "id": "uuid",
      "name": "data-cleanup-agent",
      "description": "Cleans and transforms data",
      "tools": ["data-transform", "date-utils", "formula-engine"],
      "model": "claude-sonnet-4-20250514",
      "is_active": true,
      "created_at": "2025-01-30T10:00:00Z",
      "run_count": 142
    }
  ],
  "total": 5,
  "limit": 50,
  "offset": 0
}
```

---

### Get Agent

```http
GET /api/v1/agents/:id
```

**Response:**
```json
{
  "id": "uuid",
  "name": "data-cleanup-agent",
  "description": "Cleans and transforms data",
  "tools": ["data-transform", "date-utils", "formula-engine"],
  "model": "claude-sonnet-4-20250514",
  "system_prompt": "You are a data cleaning specialist...",
  "config": {
    "max_steps": 10,
    "temperature": 0.7,
    "timeout_ms": 30000,
    "retry_on_error": true
  },
  "is_active": true,
  "created_at": "2025-01-30T10:00:00Z",
  "updated_at": "2025-01-30T10:00:00Z"
}
```

---

### Create Agent

```http
POST /api/v1/agents
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "data-cleanup-agent",
  "description": "Cleans CSV data, normalizes dates, calculates summaries",
  "tools": ["data-transform", "date-utils", "formula-engine", "json-utils"],
  "model": "claude-sonnet-4-20250514",
  "system_prompt": "You are a data cleaning specialist. Parse and transform data precisely.",
  "config": {
    "max_steps": 15,
    "temperature": 0.5
  }
}
```

**Required Fields:**
- `name` - Unique identifier (alphanumeric, hyphens allowed)
- `tools` - At least one ForgeHook ID

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "name": "data-cleanup-agent",
  "message": "Agent created successfully"
}
```

---

### Update Agent

```http
PUT /api/v1/agents/:id
Content-Type: application/json
```

**Request Body:** (partial updates allowed)
```json
{
  "description": "Updated description",
  "tools": ["data-transform", "date-utils"],
  "config": {
    "max_steps": 20
  }
}
```

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "message": "Agent updated successfully"
}
```

---

### Delete Agent

```http
DELETE /api/v1/agents/:id
```

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "message": "Agent deleted successfully"
}
```

---

### Run Agent

```http
POST /api/v1/agents/:id/run
Content-Type: application/json
```

**Request Body:**
```json
{
  "input": "Clean this CSV and calculate totals by region",
  "data": {
    "csv": "name,date,amount,region\nJohn,1/15/24,1500,West\n..."
  },
  "config_override": {
    "max_steps": 5
  }
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `input` | string | Yes | Natural language instruction |
| `data` | object | No | Structured data for the agent |
| `config_override` | object | No | Override agent config for this run |
| `stream` | boolean | No | Enable SSE streaming (default: false) |

**Response:** `200 OK`
```json
{
  "run_id": "uuid",
  "agent_id": "uuid",
  "status": "completed",
  "result": {
    "cleaned_data": [...],
    "summary": {"West": 3300, "East": 2300}
  },
  "steps": [
    {
      "step_number": 1,
      "tool": "data-transform",
      "action": "csv_to_json",
      "input": {"csv": "..."},
      "output": {"data": [...]},
      "duration_ms": 12
    }
  ],
  "tokens_used": 847,
  "duration_ms": 1243
}
```

**Error Response:** `200 OK` (with error in body)
```json
{
  "run_id": "uuid",
  "agent_id": "uuid",
  "status": "failed",
  "error": "Tool 'data-transform' failed: Invalid CSV format",
  "steps": [...],
  "tokens_used": 234,
  "duration_ms": 512
}
```

---

### Run Agent (Streaming)

```http
POST /api/v1/agents/:id/run
Content-Type: application/json

{
  "input": "Process this data",
  "stream": true
}
```

**Response:** `200 OK` (SSE stream)
```
event: step
data: {"step_number": 1, "tool": "data-transform", "status": "running"}

event: step
data: {"step_number": 1, "tool": "data-transform", "status": "completed", "duration_ms": 12}

event: step
data: {"step_number": 2, "tool": "formula-engine", "status": "running"}

event: complete
data: {"run_id": "uuid", "status": "completed", "result": {...}}
```

---

### Get Run History

```http
GET /api/v1/agents/:id/runs
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | - | Filter by status |
| `limit` | number | 20 | Max results |
| `offset` | number | 0 | Pagination offset |

**Response:**
```json
{
  "runs": [
    {
      "id": "uuid",
      "status": "completed",
      "input": "Clean this CSV...",
      "tokens_used": 847,
      "duration_ms": 1243,
      "created_at": "2025-01-30T10:00:00Z"
    }
  ],
  "total": 142,
  "limit": 20,
  "offset": 0
}
```

---

### Get Run Details

```http
GET /api/v1/agents/:id/runs/:run_id
```

**Response:** Full run object including steps and output.

---

## Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | `INVALID_INPUT` | Missing or invalid request body |
| 404 | `AGENT_NOT_FOUND` | Agent ID doesn't exist |
| 404 | `RUN_NOT_FOUND` | Run ID doesn't exist |
| 409 | `AGENT_EXISTS` | Agent name already taken |
| 422 | `INVALID_TOOL` | Tool ID not found in registry |
| 422 | `INVALID_MODEL` | Model not supported |
| 500 | `RUNTIME_ERROR` | Agent execution failed |
| 504 | `TIMEOUT` | Agent exceeded timeout |
