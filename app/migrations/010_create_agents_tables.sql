-- Migration: 010_create_agents_tables.sql
-- Description: Create tables for Agent Runtime feature
-- Created: 2026-01-30

-- =============================================================================
-- Agents Table: Stores agent definitions
-- =============================================================================
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,  -- URL-safe identifier
    description TEXT,
    
    -- LLM Configuration
    model VARCHAR(100) NOT NULL DEFAULT 'llama3.2',
    provider VARCHAR(50) NOT NULL DEFAULT 'ollama',  -- ollama, lmstudio, anthropic, openai
    
    -- Agent Behavior
    system_prompt TEXT NOT NULL,
    tools TEXT[] NOT NULL DEFAULT '{}',  -- Array of ForgeHook IDs this agent can use
    
    -- Execution Settings
    config JSONB NOT NULL DEFAULT '{
        "max_steps": 10,
        "max_tokens": 4096,
        "temperature": 0.7,
        "timeout_ms": 120000,
        "retry_on_error": true,
        "max_retries": 2
    }',
    
    -- Access Control
    is_public BOOLEAN DEFAULT false,
    api_key_required BOOLEAN DEFAULT true,
    allowed_api_keys UUID[] DEFAULT '{}',  -- Specific API key IDs that can use this agent
    
    -- Metadata
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Soft delete
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- =============================================================================
-- Agent Runs Table: Execution history
-- =============================================================================
CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    -- Input
    input_text TEXT NOT NULL,
    input_data JSONB,  -- Optional structured data passed with request
    
    -- Output
    output JSONB,       -- Final result
    output_text TEXT,   -- Text summary if applicable
    
    -- Execution trace
    steps JSONB NOT NULL DEFAULT '[]',
    /*
        steps format:
        [
            {
                "step": 1,
                "tool": "data-transform",
                "action": "csv_to_json",
                "input": {...},
                "output": {...},
                "error": null,
                "duration_ms": 45,
                "timestamp": "2026-01-30T10:30:00Z"
            }
        ]
    */
    
    -- Metrics
    total_steps INTEGER DEFAULT 0,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    duration_ms INTEGER,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed, timeout
    error_message TEXT,
    
    -- Metadata
    triggered_by UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_agents_slug ON agents(slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agents_is_public ON agents(is_public) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agents_provider ON agents(provider) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_id ON agent_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON agent_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_triggered_by ON agent_runs(triggered_by);

-- =============================================================================
-- Update Trigger
-- =============================================================================
CREATE OR REPLACE FUNCTION update_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_agents_updated_at ON agents;
CREATE TRIGGER trigger_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_agents_updated_at();

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON TABLE agents IS 'AI agent definitions that orchestrate ForgeHooks';
COMMENT ON TABLE agent_runs IS 'Execution history and traces for agent runs';
COMMENT ON COLUMN agents.tools IS 'Array of ForgeHook plugin IDs this agent can invoke';
COMMENT ON COLUMN agents.config IS 'Execution settings: max_steps, temperature, timeout, etc.';
COMMENT ON COLUMN agent_runs.steps IS 'Array of tool invocations with inputs, outputs, and timing';
