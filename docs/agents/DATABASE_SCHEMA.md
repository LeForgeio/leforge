# Agent Database Schema

## Overview

Two new tables are required for the agent runtime:
- `agents` - Agent definitions (name, tools, model, prompts)
- `agent_runs` - Execution history and observability

## Migration File

Create: `app/migrations/004_create_agents_tables.sql`

```sql
-- ============================================
-- LeForge Agent Runtime Tables
-- ============================================

-- Agents table: stores agent definitions
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    
    -- Tools this agent can use (ForgeHook IDs)
    tools TEXT[] NOT NULL DEFAULT '{}',
    
    -- LLM configuration
    model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o',
    system_prompt TEXT,
    
    -- Runtime configuration
    config JSONB NOT NULL DEFAULT '{
        "max_steps": 10,
        "temperature": 0.7,
        "timeout_ms": 30000,
        "retry_on_error": true
    }'::jsonb,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Agent runs table: execution history
CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    -- Input
    input TEXT NOT NULL,
    input_data JSONB,
    
    -- Output
    output JSONB,
    error TEXT,
    
    -- Execution trace
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Metrics
    tokens_used INTEGER DEFAULT 0,
    duration_ms INTEGER,
    
    -- Status: 'pending', 'running', 'completed', 'failed', 'cancelled'
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX idx_agents_name ON agents(name);
CREATE INDEX idx_agents_is_active ON agents(is_active);
CREATE INDEX idx_agent_runs_agent_id ON agent_runs(agent_id);
CREATE INDEX idx_agent_runs_status ON agent_runs(status);
CREATE INDEX idx_agent_runs_created_at ON agent_runs(created_at DESC);

-- Updated_at trigger for agents
CREATE OR REPLACE FUNCTION update_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_agents_updated_at();
```

## Schema Details

### agents table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | Unique agent name (used in URL) |
| `description` | TEXT | Human-readable description |
| `tools` | TEXT[] | Array of ForgeHook IDs this agent can use |
| `model` | VARCHAR(100) | LLM model identifier |
| `system_prompt` | TEXT | System prompt for the agent |
| `config` | JSONB | Runtime configuration (see below) |
| `is_active` | BOOLEAN | Whether agent is enabled |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

### agents.config JSONB structure

```typescript
interface AgentConfig {
  max_steps: number;      // Maximum tool calls per run (default: 10)
  temperature: number;    // LLM temperature (default: 0.7)
  timeout_ms: number;     // Total run timeout (default: 30000)
  retry_on_error: boolean; // Retry failed tool calls (default: true)
}
```

### agent_runs table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (run_id) |
| `agent_id` | UUID | Foreign key to agents |
| `input` | TEXT | User's natural language input |
| `input_data` | JSONB | Structured data passed with request |
| `output` | JSONB | Final result from agent |
| `error` | TEXT | Error message if failed |
| `steps` | JSONB | Array of tool calls (see below) |
| `tokens_used` | INTEGER | Total tokens consumed |
| `duration_ms` | INTEGER | Total execution time |
| `status` | VARCHAR(50) | Run status |
| `started_at` | TIMESTAMP | When execution began |
| `completed_at` | TIMESTAMP | When execution finished |
| `created_at` | TIMESTAMP | When run was created |

### agent_runs.steps JSONB structure

```typescript
interface AgentStep {
  step_number: number;
  tool: string;           // ForgeHook ID
  action: string;         // Endpoint/method called
  input: object;          // Arguments passed to tool
  output: object;         // Result from tool
  duration_ms: number;
  timestamp: string;      // ISO timestamp
  error?: string;         // Error if step failed
}
```
