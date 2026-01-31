# LeForge Agent Runtime Architecture

## Overview

LeForge Agents allow users to create autonomous AI agents that orchestrate ForgeHooks to complete tasks. Instead of calling multiple endpoints, users call a single agent endpoint that intelligently selects and chains the right tools.

## The Vision

```
┌─────────────────────────────────────────────────────────────────┐
│                      External Caller                            │
│         (n8n, Power Automate, Nintex, Salesforce, etc.)        │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Single POST /api/v1/agents/:id/run
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LeForge Container                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Agent Runtime                           │  │
│  │  "Clean this CSV, convert dates to ISO, calculate totals" │  │
│  │                          │                                │  │
│  │         ┌────────────────┼────────────────┐               │  │
│  │         ▼                ▼                ▼               │  │
│  │   ┌──────────┐    ┌──────────┐    ┌──────────┐           │  │
│  │   │  Data    │    │   Date   │    │  Formula │           │  │
│  │   │Transform │    │  Utils   │    │  Engine  │           │  │
│  │   └──────────┘    └──────────┘    └──────────┘           │  │
│  │         │                │                │               │  │
│  │         └────────────────┴────────────────┘               │  │
│  │                          │                                │  │
│  │                    Final Result                           │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Benefits

1. **Single Endpoint**: Callers don't need to know which ForgeHooks to use
2. **Intelligent Orchestration**: Agent decides tool sequence based on the task
3. **Reusable Agents**: Create once, call many times with different inputs
4. **Full Observability**: Every tool call is logged for debugging
5. **Multi-Provider LLM**: Works with OpenAI, Claude, Ollama, LM Studio, etc.

## Example Usage

### Create an Agent

```http
POST /api/v1/agents
Content-Type: application/json

{
  "name": "data-cleanup-agent",
  "description": "Cleans CSV data, normalizes dates, calculates summaries",
  "tools": ["data-transform", "date-utils", "formula-engine", "json-utils"],
  "model": "claude-sonnet-4-20250514",
  "system_prompt": "You are a data cleaning specialist. Parse and transform data precisely. Always validate your outputs."
}
```

### Run the Agent

```http
POST /api/v1/agents/data-cleanup-agent/run
Content-Type: application/json

{
  "input": "Clean this CSV: normalize dates to ISO format, calculate total amount per region",
  "data": "name,date,amount,region\nJohn,1/15/24,1500,West\nJane,2024-01-20,2300,East\nBob,Jan 22 2024,1800,West"
}
```

### Response

```json
{
  "run_id": "run_abc123",
  "status": "completed",
  "result": {
    "cleaned_data": [
      {"name": "John", "date": "2024-01-15", "amount": 1500, "region": "West"},
      {"name": "Jane", "date": "2024-01-20", "amount": 2300, "region": "East"},
      {"name": "Bob", "date": "2024-01-22", "amount": 1800, "region": "West"}
    ],
    "summary": {
      "West": 3300,
      "East": 2300,
      "total": 5600
    }
  },
  "steps": [
    {"tool": "data-transform", "action": "csv_to_json", "duration_ms": 12},
    {"tool": "date-utils", "action": "normalize", "duration_ms": 8},
    {"tool": "formula-engine", "action": "SUMIF", "duration_ms": 15}
  ],
  "tokens_used": 847,
  "duration_ms": 1243
}
```
