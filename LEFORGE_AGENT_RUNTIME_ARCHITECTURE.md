# LeForge Agent Runtime Architecture

## Overview

Add an **Agent Runtime** to LeForge that allows users to create, configure, and invoke AI agents via a single endpoint. Agents autonomously select and chain ForgeHooks to complete tasks, eliminating the need for callers to orchestrate multiple API calls.

## The Vision

```
┌─────────────────────────────────────────────────────────────────────┐
│                         External Caller                             │
│       (n8n, Power Automate, Nintex, Salesforce, Make, etc.)        │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │  Single POST request:
                                  │  "Clean this CSV, fix dates, sum totals"
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      LeForge Container                              │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     Agent Runtime                              │  │
│  │                                                                │  │
│  │   1. Receives natural language instruction                    │  │
│  │   2. Plans which ForgeHooks to use                            │  │
│  │   3. Executes tools in sequence/parallel                      │  │
│  │   4. Returns final result                                     │  │
│  │                                                                │  │
│  │         ┌─────────┐   ┌─────────┐   ┌─────────┐               │  │
│  │         │  Data   │   │  Date   │   │ Formula │               │  │
│  │         │Transform│   │  Utils  │   │ Engine  │               │  │
│  │         └────┬────┘   └────┬────┘   └────┬────┘               │  │
│  │              └──────────────┴──────────────┘                   │  │
│  │                           │                                    │  │
│  │                     Final Result                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Architecture Components

### 1. Database Schema

Add two new tables to track agents and their execution history.

```sql
-- File: app/migrations/007_create_agents_tables.sql

-- Agents table: stores agent definitions
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,  -- URL-safe identifier
    description TEXT,
    
    -- LLM Configuration
    model VARCHAR(100) NOT NULL DEFAULT 'claude-sonnet',  -- claude-sonnet, gpt-4o, ollama/llama3, etc.
    provider VARCHAR(50) NOT NULL DEFAULT 'anthropic',     -- anthropic, openai, ollama, lmstudio, bedrock
    
    -- Agent Behavior
    system_prompt TEXT NOT NULL,
    tools TEXT[] NOT NULL DEFAULT '{}',  -- Array of ForgeHook IDs this agent can use
    
    -- Execution Settings
    config JSONB NOT NULL DEFAULT '{
        "max_steps": 10,
        "max_tokens": 4096,
        "temperature": 0.7,
        "timeout_ms": 60000,
        "retry_on_error": true,
        "max_retries": 2
    }',
    
    -- Access Control
    is_public BOOLEAN DEFAULT false,     -- Can be called without auth
    api_key_required BOOLEAN DEFAULT true,
    allowed_api_keys TEXT[] DEFAULT '{}', -- Specific keys that can use this agent
    
    -- Metadata
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Soft delete
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Agent runs table: execution history
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
    steps JSONB NOT NULL DEFAULT '[]',  -- Array of tool calls made
    /*
        steps format:
        [
            {
                "step": 1,
                "tool": "data-transform",
                "action": "csv_to_json",
                "input": {...},
                "output": {...},
                "duration_ms": 45,
                "timestamp": "2024-01-15T10:30:00Z"
            },
            ...
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
    triggered_by VARCHAR(255),  -- API key ID or 'anonymous'
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX idx_agents_slug ON agents(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_agents_is_public ON agents(is_public) WHERE deleted_at IS NULL;
CREATE INDEX idx_agent_runs_agent_id ON agent_runs(agent_id);
CREATE INDEX idx_agent_runs_status ON agent_runs(status);
CREATE INDEX idx_agent_runs_created_at ON agent_runs(created_at DESC);

-- Update trigger for agents.updated_at
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

---

### 2. TypeScript Types

```typescript
// File: app/src/server/types/agent.types.ts

export interface AgentConfig {
  max_steps: number;          // Maximum tool calls per run (default: 10)
  max_tokens: number;         // Max tokens for LLM response (default: 4096)
  temperature: number;        // LLM temperature 0-1 (default: 0.7)
  timeout_ms: number;         // Total execution timeout (default: 60000)
  retry_on_error: boolean;    // Retry failed tool calls (default: true)
  max_retries: number;        // Max retries per tool (default: 2)
}

export interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  
  // LLM
  model: string;
  provider: 'anthropic' | 'openai' | 'ollama' | 'lmstudio' | 'bedrock' | 'azure';
  
  // Behavior
  system_prompt: string;
  tools: string[];            // ForgeHook IDs
  config: AgentConfig;
  
  // Access
  is_public: boolean;
  api_key_required: boolean;
  allowed_api_keys: string[];
  
  // Metadata
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AgentStep {
  step: number;
  tool: string;               // ForgeHook ID
  action: string;             // Endpoint path
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  duration_ms: number;
  timestamp: string;
}

export interface AgentRun {
  id: string;
  agent_id: string;
  
  // Input
  input_text: string;
  input_data: Record<string, unknown> | null;
  
  // Output
  output: Record<string, unknown> | null;
  output_text: string | null;
  
  // Trace
  steps: AgentStep[];
  total_steps: number;
  
  // Metrics
  tokens_input: number;
  tokens_output: number;
  duration_ms: number | null;
  
  // Status
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  error_message: string | null;
  
  // Metadata
  triggered_by: string | null;
  created_at: Date;
  completed_at: Date | null;
}

// API Request/Response types
export interface CreateAgentRequest {
  name: string;
  description?: string;
  model?: string;
  provider?: string;
  system_prompt: string;
  tools: string[];
  config?: Partial<AgentConfig>;
  is_public?: boolean;
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  model?: string;
  provider?: string;
  system_prompt?: string;
  tools?: string[];
  config?: Partial<AgentConfig>;
  is_public?: boolean;
}

export interface RunAgentRequest {
  input: string;              // Natural language instruction
  data?: Record<string, unknown>;  // Optional structured data
  stream?: boolean;           // Stream responses (future)
}

export interface RunAgentResponse {
  run_id: string;
  status: string;
  output: Record<string, unknown> | null;
  output_text: string | null;
  steps: AgentStep[];
  metrics: {
    total_steps: number;
    tokens_input: number;
    tokens_output: number;
    duration_ms: number;
  };
}

// Tool schema for LLM function calling
export interface ToolSchema {
  name: string;               // e.g., "data-transform__csv_to_json"
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}
```

---

### 3. Agent Service

The core runtime that executes agents.

```typescript
// File: app/src/server/services/agent.service.ts

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { 
  Agent, 
  AgentRun, 
  AgentStep, 
  AgentConfig,
  CreateAgentRequest,
  UpdateAgentRequest,
  RunAgentRequest,
  RunAgentResponse,
  ToolSchema
} from '../types/agent.types';
import { llmService } from './llm.service';
import { registryService } from './registry.service';
import { embeddedPluginService } from './embedded-plugin.service';
import { dockerService } from './docker.service';
import { logger } from '../utils/logger';

const DEFAULT_CONFIG: AgentConfig = {
  max_steps: 10,
  max_tokens: 4096,
  temperature: 0.7,
  timeout_ms: 60000,
  retry_on_error: true,
  max_retries: 2
};

class AgentService {
  private db: Pool;

  constructor() {
    // DB pool injected or imported from database.service
  }

  setDb(pool: Pool) {
    this.db = pool;
  }

  // ─────────────────────────────────────────────────────────────
  // CRUD Operations
  // ─────────────────────────────────────────────────────────────

  async createAgent(data: CreateAgentRequest, createdBy?: string): Promise<Agent> {
    const slug = this.generateSlug(data.name);
    const config = { ...DEFAULT_CONFIG, ...data.config };

    const result = await this.db.query(
      `INSERT INTO agents (name, slug, description, model, provider, system_prompt, tools, config, is_public, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.name,
        slug,
        data.description || null,
        data.model || 'claude-sonnet',
        data.provider || 'anthropic',
        data.system_prompt,
        data.tools,
        JSON.stringify(config),
        data.is_public || false,
        createdBy || null
      ]
    );

    return this.rowToAgent(result.rows[0]);
  }

  async getAgentById(id: string): Promise<Agent | null> {
    const result = await this.db.query(
      'SELECT * FROM agents WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return result.rows[0] ? this.rowToAgent(result.rows[0]) : null;
  }

  async getAgentBySlug(slug: string): Promise<Agent | null> {
    const result = await this.db.query(
      'SELECT * FROM agents WHERE slug = $1 AND deleted_at IS NULL',
      [slug]
    );
    return result.rows[0] ? this.rowToAgent(result.rows[0]) : null;
  }

  async listAgents(includePrivate = false): Promise<Agent[]> {
    const query = includePrivate
      ? 'SELECT * FROM agents WHERE deleted_at IS NULL ORDER BY created_at DESC'
      : 'SELECT * FROM agents WHERE deleted_at IS NULL AND is_public = true ORDER BY created_at DESC';
    
    const result = await this.db.query(query);
    return result.rows.map(row => this.rowToAgent(row));
  }

  async updateAgent(id: string, data: UpdateAgentRequest): Promise<Agent | null> {
    const agent = await this.getAgentById(id);
    if (!agent) return null;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramCount}, slug = $${paramCount + 1}`);
      values.push(data.name, this.generateSlug(data.name));
      paramCount += 2;
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(data.description);
    }
    if (data.model !== undefined) {
      updates.push(`model = $${paramCount++}`);
      values.push(data.model);
    }
    if (data.provider !== undefined) {
      updates.push(`provider = $${paramCount++}`);
      values.push(data.provider);
    }
    if (data.system_prompt !== undefined) {
      updates.push(`system_prompt = $${paramCount++}`);
      values.push(data.system_prompt);
    }
    if (data.tools !== undefined) {
      updates.push(`tools = $${paramCount++}`);
      values.push(data.tools);
    }
    if (data.config !== undefined) {
      updates.push(`config = $${paramCount++}`);
      values.push(JSON.stringify({ ...agent.config, ...data.config }));
    }
    if (data.is_public !== undefined) {
      updates.push(`is_public = $${paramCount++}`);
      values.push(data.is_public);
    }

    if (updates.length === 0) return agent;

    values.push(id);
    const result = await this.db.query(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    return this.rowToAgent(result.rows[0]);
  }

  async deleteAgent(id: string): Promise<boolean> {
    const result = await this.db.query(
      'UPDATE agents SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ─────────────────────────────────────────────────────────────
  // Agent Execution - THE CORE RUNTIME
  // ─────────────────────────────────────────────────────────────

  async runAgent(
    agentIdOrSlug: string,
    request: RunAgentRequest,
    context?: { apiKeyId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<RunAgentResponse> {
    // 1. Load agent
    const agent = await this.getAgentById(agentIdOrSlug) 
      || await this.getAgentBySlug(agentIdOrSlug);
    
    if (!agent) {
      throw new Error(`Agent not found: ${agentIdOrSlug}`);
    }

    // 2. Create run record
    const runId = uuidv4();
    await this.db.query(
      `INSERT INTO agent_runs (id, agent_id, input_text, input_data, status, triggered_by, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, 'running', $5, $6, $7)`,
      [
        runId,
        agent.id,
        request.input,
        request.data ? JSON.stringify(request.data) : null,
        context?.apiKeyId || 'anonymous',
        context?.ipAddress || null,
        context?.userAgent || null
      ]
    );

    const startTime = Date.now();
    const steps: AgentStep[] = [];
    let tokensInput = 0;
    let tokensOutput = 0;

    try {
      // 3. Build tool schemas for this agent's allowed tools
      const tools = await this.buildToolSchemas(agent.tools);

      // 4. Build initial messages
      const messages: Array<{ role: string; content: string; tool_call_id?: string }> = [
        { role: 'system', content: agent.system_prompt },
        { 
          role: 'user', 
          content: request.data 
            ? `${request.input}\n\nData:\n${JSON.stringify(request.data, null, 2)}`
            : request.input
        }
      ];

      // 5. Execution loop
      let stepCount = 0;
      let finalOutput: Record<string, unknown> | null = null;
      let finalText: string | null = null;

      while (stepCount < agent.config.max_steps) {
        // Call LLM
        const llmResponse = await llmService.chat({
          provider: agent.provider,
          model: agent.model,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          max_tokens: agent.config.max_tokens,
          temperature: agent.config.temperature
        });

        tokensInput += llmResponse.usage?.input_tokens || 0;
        tokensOutput += llmResponse.usage?.output_tokens || 0;

        // Check if LLM wants to use tools
        if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
          // Process each tool call
          for (const toolCall of llmResponse.tool_calls) {
            stepCount++;
            const stepStart = Date.now();

            const step: AgentStep = {
              step: stepCount,
              tool: toolCall.function.name.split('__')[0],  // Extract plugin ID
              action: toolCall.function.name.split('__')[1] || 'invoke',
              input: JSON.parse(toolCall.function.arguments || '{}'),
              output: null,
              error: null,
              duration_ms: 0,
              timestamp: new Date().toISOString()
            };

            try {
              // Execute the ForgeHook
              const result = await this.invokeForgeHook(
                step.tool,
                step.action,
                step.input,
                agent.config.retry_on_error ? agent.config.max_retries : 0
              );
              step.output = result;
            } catch (err) {
              step.error = err instanceof Error ? err.message : String(err);
            }

            step.duration_ms = Date.now() - stepStart;
            steps.push(step);

            // Add tool result to messages
            messages.push({
              role: 'assistant',
              content: '',
              // Note: Structure depends on LLM provider
            });
            messages.push({
              role: 'tool',
              content: step.error 
                ? JSON.stringify({ error: step.error })
                : JSON.stringify(step.output),
              tool_call_id: toolCall.id
            });
          }
        } else {
          // LLM is done - extract final response
          finalText = llmResponse.content;
          
          // Try to parse as JSON if it looks like JSON
          if (finalText && finalText.trim().startsWith('{')) {
            try {
              finalOutput = JSON.parse(finalText);
            } catch {
              finalOutput = { result: finalText };
            }
          } else {
            finalOutput = { result: finalText };
          }
          break;
        }

        // Timeout check
        if (Date.now() - startTime > agent.config.timeout_ms) {
          throw new Error('Agent execution timeout');
        }
      }

      // 6. Update run record with success
      const duration = Date.now() - startTime;
      await this.db.query(
        `UPDATE agent_runs SET 
          status = 'completed',
          output = $1,
          output_text = $2,
          steps = $3,
          total_steps = $4,
          tokens_input = $5,
          tokens_output = $6,
          duration_ms = $7,
          completed_at = CURRENT_TIMESTAMP
         WHERE id = $8`,
        [
          JSON.stringify(finalOutput),
          finalText,
          JSON.stringify(steps),
          steps.length,
          tokensInput,
          tokensOutput,
          duration,
          runId
        ]
      );

      return {
        run_id: runId,
        status: 'completed',
        output: finalOutput,
        output_text: finalText,
        steps,
        metrics: {
          total_steps: steps.length,
          tokens_input: tokensInput,
          tokens_output: tokensOutput,
          duration_ms: duration
        }
      };

    } catch (error) {
      // Update run record with failure
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.db.query(
        `UPDATE agent_runs SET 
          status = 'failed',
          error_message = $1,
          steps = $2,
          total_steps = $3,
          tokens_input = $4,
          tokens_output = $5,
          duration_ms = $6,
          completed_at = CURRENT_TIMESTAMP
         WHERE id = $7`,
        [
          errorMessage,
          JSON.stringify(steps),
          steps.length,
          tokensInput,
          tokensOutput,
          duration,
          runId
        ]
      );

      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Run History
  // ─────────────────────────────────────────────────────────────

  async getRunById(runId: string): Promise<AgentRun | null> {
    const result = await this.db.query(
      'SELECT * FROM agent_runs WHERE id = $1',
      [runId]
    );
    return result.rows[0] ? this.rowToRun(result.rows[0]) : null;
  }

  async getRunsByAgentId(agentId: string, limit = 50): Promise<AgentRun[]> {
    const result = await this.db.query(
      'SELECT * FROM agent_runs WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2',
      [agentId, limit]
    );
    return result.rows.map(row => this.rowToRun(row));
  }

  // ─────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Build OpenAI-compatible tool schemas from ForgeHook manifests
   */
  private async buildToolSchemas(toolIds: string[]): Promise<ToolSchema[]> {
    const schemas: ToolSchema[] = [];
    const registry = await registryService.getRegistry();

    for (const toolId of toolIds) {
      const plugin = registry.plugins.find(p => p.id === toolId);
      if (!plugin) continue;

      // Each endpoint becomes a tool
      for (const endpoint of plugin.endpoints || []) {
        const toolName = `${toolId}__${endpoint.path.replace(/\//g, '_').replace(/^_/, '')}`;
        
        schemas.push({
          name: toolName,
          description: `${plugin.name}: ${endpoint.description || endpoint.path}`,
          parameters: {
            type: 'object',
            properties: this.endpointToProperties(endpoint),
            required: this.endpointRequiredFields(endpoint)
          }
        });
      }
    }

    return schemas;
  }

  /**
   * Invoke a ForgeHook (embedded or container)
   */
  private async invokeForgeHook(
    pluginId: string,
    action: string,
    input: Record<string, unknown>,
    retries = 0
  ): Promise<Record<string, unknown>> {
    const registry = await registryService.getRegistry();
    const plugin = registry.plugins.find(p => p.id === pluginId);

    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (plugin.runtime === 'embedded') {
          // Call embedded plugin directly
          return await embeddedPluginService.invoke(pluginId, action, input);
        } else {
          // Call container plugin via Docker service
          return await dockerService.invokePlugin(pluginId, action, input);
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn(`ForgeHook invoke failed (attempt ${attempt + 1}): ${lastError.message}`);
        
        if (attempt < retries) {
          await this.sleep(1000 * (attempt + 1)); // Exponential backoff
        }
      }
    }

    throw lastError;
  }

  private endpointToProperties(endpoint: any): Record<string, any> {
    // Convert endpoint schema to OpenAI function properties
    // This would parse the forgehook.json schema
    if (endpoint.schema?.properties) {
      return endpoint.schema.properties;
    }
    
    // Fallback: generic input
    return {
      input: {
        type: 'string',
        description: 'Input data for the operation'
      }
    };
  }

  private endpointRequiredFields(endpoint: any): string[] {
    return endpoint.schema?.required || [];
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private rowToAgent(row: any): Agent {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      model: row.model,
      provider: row.provider,
      system_prompt: row.system_prompt,
      tools: row.tools || [],
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      is_public: row.is_public,
      api_key_required: row.api_key_required,
      allowed_api_keys: row.allowed_api_keys || [],
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  private rowToRun(row: any): AgentRun {
    return {
      id: row.id,
      agent_id: row.agent_id,
      input_text: row.input_text,
      input_data: row.input_data,
      output: row.output,
      output_text: row.output_text,
      steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps,
      total_steps: row.total_steps,
      tokens_input: row.tokens_input,
      tokens_output: row.tokens_output,
      duration_ms: row.duration_ms,
      status: row.status,
      error_message: row.error_message,
      triggered_by: row.triggered_by,
      created_at: row.created_at,
      completed_at: row.completed_at
    };
  }
}

export const agentService = new AgentService();
```

---

### 4. LLM Service (Multi-Provider)

```typescript
// File: app/src/server/services/llm.service.ts

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { ToolSchema } from '../types/agent.types';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

interface ChatRequest {
  provider: string;
  model: string;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  max_tokens?: number;
  temperature?: number;
}

interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatResponse {
  content: string | null;
  tool_calls: ToolCall[] | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  } | null;
}

class LLMService {
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;

  constructor() {
    // Initialize providers based on available API keys
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    switch (request.provider) {
      case 'anthropic':
        return this.chatAnthropic(request);
      case 'openai':
        return this.chatOpenAI(request);
      case 'ollama':
        return this.chatOllama(request);
      case 'lmstudio':
        return this.chatLMStudio(request);
      default:
        throw new Error(`Unsupported LLM provider: ${request.provider}`);
    }
  }

  private async chatAnthropic(request: ChatRequest): Promise<ChatResponse> {
    if (!this.anthropic) {
      throw new Error('Anthropic API key not configured');
    }

    // Convert messages format
    const systemMessage = request.messages.find(m => m.role === 'system')?.content || '';
    const messages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));

    // Convert tools to Anthropic format
    const tools = request.tools?.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters
    }));

    const response = await this.anthropic.messages.create({
      model: this.mapAnthropicModel(request.model),
      system: systemMessage,
      messages,
      tools,
      max_tokens: request.max_tokens || 4096,
      temperature: request.temperature || 0.7
    });

    // Extract tool calls if present
    const toolCalls: ToolCall[] = [];
    let textContent = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input)
          }
        });
      }
    }

    return {
      content: textContent || null,
      tool_calls: toolCalls.length > 0 ? toolCalls : null,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens
      }
    };
  }

  private async chatOpenAI(request: ChatRequest): Promise<ChatResponse> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    // Convert tools to OpenAI format
    const tools = request.tools?.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    const response = await this.openai.chat.completions.create({
      model: this.mapOpenAIModel(request.model),
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
        tool_call_id: m.tool_call_id
      })),
      tools,
      max_tokens: request.max_tokens || 4096,
      temperature: request.temperature || 0.7
    });

    const choice = response.choices[0];
    const toolCalls = choice.message.tool_calls?.map(tc => ({
      id: tc.id,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments
      }
    }));

    return {
      content: choice.message.content,
      tool_calls: toolCalls || null,
      usage: response.usage ? {
        input_tokens: response.usage.prompt_tokens,
        output_tokens: response.usage.completion_tokens
      } : null
    };
  }

  private async chatOllama(request: ChatRequest): Promise<ChatResponse> {
    // Ollama running locally or via gateway
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model.replace('ollama/', ''),
        messages: request.messages,
        tools: request.tools,
        stream: false,
        options: {
          temperature: request.temperature || 0.7
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      content: data.message?.content || null,
      tool_calls: data.message?.tool_calls || null,
      usage: {
        input_tokens: data.prompt_eval_count || 0,
        output_tokens: data.eval_count || 0
      }
    };
  }

  private async chatLMStudio(request: ChatRequest): Promise<ChatResponse> {
    // LM Studio uses OpenAI-compatible API
    const lmStudioUrl = process.env.LMSTUDIO_URL || 'http://localhost:1234/v1';
    
    const response = await fetch(`${lmStudioUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        tools: request.tools?.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters
          }
        })),
        max_tokens: request.max_tokens || 4096,
        temperature: request.temperature || 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`LM Studio error: ${response.statusText}`);
    }

    const data = await response.json();
    const choice = data.choices[0];

    return {
      content: choice.message.content,
      tool_calls: choice.message.tool_calls || null,
      usage: data.usage ? {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens
      } : null
    };
  }

  private mapAnthropicModel(model: string): string {
    const mapping: Record<string, string> = {
      'claude-sonnet': 'claude-sonnet-4-20250514',
      'claude-opus': 'claude-opus-4-20250514',
      'claude-haiku': 'claude-haiku-4-20250514'
    };
    return mapping[model] || model;
  }

  private mapOpenAIModel(model: string): string {
    const mapping: Record<string, string> = {
      'gpt-4o': 'gpt-4o',
      'gpt-4': 'gpt-4-turbo',
      'gpt-3.5': 'gpt-3.5-turbo'
    };
    return mapping[model] || model;
  }
}

export const llmService = new LLMService();
```

---

### 5. API Routes

```typescript
// File: app/src/server/routes/agents.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { agentService } from '../services/agent.service';
import { 
  CreateAgentRequest, 
  UpdateAgentRequest, 
  RunAgentRequest 
} from '../types/agent.types';
import { logger } from '../utils/logger';

export async function agentRoutes(fastify: FastifyInstance) {
  
  // ─────────────────────────────────────────────────────────────
  // CRUD Endpoints
  // ─────────────────────────────────────────────────────────────

  // List all agents
  fastify.get('/agents', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // If authenticated, show all agents; otherwise only public
      const includePrivate = !!(request as any).apiKey;
      const agents = await agentService.listAgents(includePrivate);
      
      return reply.send({
        success: true,
        data: agents,
        count: agents.length
      });
    } catch (error) {
      logger.error('Error listing agents:', error);
      return reply.status(500).send({ 
        success: false, 
        error: 'Failed to list agents' 
      });
    }
  });

  // Get single agent
  fastify.get('/agents/:idOrSlug', async (
    request: FastifyRequest<{ Params: { idOrSlug: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { idOrSlug } = request.params;
      const agent = await agentService.getAgentById(idOrSlug) 
        || await agentService.getAgentBySlug(idOrSlug);
      
      if (!agent) {
        return reply.status(404).send({ 
          success: false, 
          error: 'Agent not found' 
        });
      }

      return reply.send({ success: true, data: agent });
    } catch (error) {
      logger.error('Error getting agent:', error);
      return reply.status(500).send({ 
        success: false, 
        error: 'Failed to get agent' 
      });
    }
  });

  // Create agent
  fastify.post('/agents', async (
    request: FastifyRequest<{ Body: CreateAgentRequest }>,
    reply: FastifyReply
  ) => {
    try {
      const apiKeyId = (request as any).apiKey?.id;
      const agent = await agentService.createAgent(request.body, apiKeyId);
      
      return reply.status(201).send({ success: true, data: agent });
    } catch (error) {
      logger.error('Error creating agent:', error);
      
      if ((error as any).code === '23505') { // Unique violation
        return reply.status(409).send({ 
          success: false, 
          error: 'Agent with this name already exists' 
        });
      }
      
      return reply.status(500).send({ 
        success: false, 
        error: 'Failed to create agent' 
      });
    }
  });

  // Update agent
  fastify.put('/agents/:id', async (
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateAgentRequest }>,
    reply: FastifyReply
  ) => {
    try {
      const agent = await agentService.updateAgent(request.params.id, request.body);
      
      if (!agent) {
        return reply.status(404).send({ 
          success: false, 
          error: 'Agent not found' 
        });
      }

      return reply.send({ success: true, data: agent });
    } catch (error) {
      logger.error('Error updating agent:', error);
      return reply.status(500).send({ 
        success: false, 
        error: 'Failed to update agent' 
      });
    }
  });

  // Delete agent
  fastify.delete('/agents/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const deleted = await agentService.deleteAgent(request.params.id);
      
      if (!deleted) {
        return reply.status(404).send({ 
          success: false, 
          error: 'Agent not found' 
        });
      }

      return reply.send({ success: true, message: 'Agent deleted' });
    } catch (error) {
      logger.error('Error deleting agent:', error);
      return reply.status(500).send({ 
        success: false, 
        error: 'Failed to delete agent' 
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Execution Endpoints
  // ─────────────────────────────────────────────────────────────

  // Run agent - THE MAIN ENDPOINT
  fastify.post('/agents/:idOrSlug/run', async (
    request: FastifyRequest<{ 
      Params: { idOrSlug: string }; 
      Body: RunAgentRequest 
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { idOrSlug } = request.params;
      const context = {
        apiKeyId: (request as any).apiKey?.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      };

      const result = await agentService.runAgent(idOrSlug, request.body, context);
      
      return reply.send({ success: true, data: result });
    } catch (error) {
      logger.error('Error running agent:', error);
      
      const message = error instanceof Error ? error.message : 'Agent execution failed';
      const status = message.includes('not found') ? 404 : 500;
      
      return reply.status(status).send({ 
        success: false, 
        error: message 
      });
    }
  });

  // Get run history for an agent
  fastify.get('/agents/:id/runs', async (
    request: FastifyRequest<{ 
      Params: { id: string }; 
      Querystring: { limit?: number } 
    }>,
    reply: FastifyReply
  ) => {
    try {
      const limit = request.query.limit || 50;
      const runs = await agentService.getRunsByAgentId(request.params.id, limit);
      
      return reply.send({ 
        success: true, 
        data: runs,
        count: runs.length
      });
    } catch (error) {
      logger.error('Error getting agent runs:', error);
      return reply.status(500).send({ 
        success: false, 
        error: 'Failed to get agent runs' 
      });
    }
  });

  // Get single run details
  fastify.get('/runs/:runId', async (
    request: FastifyRequest<{ Params: { runId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const run = await agentService.getRunById(request.params.runId);
      
      if (!run) {
        return reply.status(404).send({ 
          success: false, 
          error: 'Run not found' 
        });
      }

      return reply.send({ success: true, data: run });
    } catch (error) {
      logger.error('Error getting run:', error);
      return reply.status(500).send({ 
        success: false, 
        error: 'Failed to get run' 
      });
    }
  });
}
```

---

### 6. Register Routes in App

```typescript
// File: app/src/server/app.ts (add to existing)

import { agentRoutes } from './routes/agents';

// ... existing code ...

// Register agent routes
await app.register(agentRoutes, { prefix: '/api/v1' });
```

---

### 7. React UI Components

#### Agent List Page

```tsx
// File: app/src/client/pages/Agents.tsx

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Settings, Trash2, Clock, Zap } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { api } from '../lib/api';
import { Agent } from '../../server/types/agent.types';
import { AgentCreateDialog } from '../components/AgentCreateDialog';
import { AgentRunDialog } from '../components/AgentRunDialog';

export function AgentsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [runAgent, setRunAgent] = useState<Agent | null>(null);
  const queryClient = useQueryClient();

  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get('/agents').then(r => r.data.data)
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/agents/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] })
  });

  if (isLoading) {
    return <div className="p-8">Loading agents...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-muted-foreground">
            AI agents that orchestrate ForgeHooks autonomously
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Agent
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {agents?.map((agent: Agent) => (
          <Card key={agent.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg">{agent.name}</CardTitle>
                <Badge variant={agent.is_public ? 'default' : 'secondary'}>
                  {agent.is_public ? 'Public' : 'Private'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {agent.description || 'No description'}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Model info */}
                <div className="flex items-center gap-2 text-sm">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  <span>{agent.provider}/{agent.model}</span>
                </div>

                {/* Tools count */}
                <div className="flex items-center gap-2 text-sm">
                  <Settings className="w-4 h-4 text-blue-500" />
                  <span>{agent.tools.length} tools enabled</span>
                </div>

                {/* Tools list */}
                <div className="flex flex-wrap gap-1">
                  {agent.tools.slice(0, 5).map(tool => (
                    <Badge key={tool} variant="outline" className="text-xs">
                      {tool}
                    </Badge>
                  ))}
                  {agent.tools.length > 5 && (
                    <Badge variant="outline" className="text-xs">
                      +{agent.tools.length - 5} more
                    </Badge>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button 
                    size="sm" 
                    onClick={() => setRunAgent(agent)}
                    className="flex-1"
                  >
                    <Play className="w-4 h-4 mr-1" />
                    Run
                  </Button>
                  <Button size="sm" variant="outline">
                    <Clock className="w-4 h-4" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => deleteMutation.mutate(agent.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create Dialog */}
      <AgentCreateDialog 
        open={createOpen} 
        onOpenChange={setCreateOpen} 
      />

      {/* Run Dialog */}
      {runAgent && (
        <AgentRunDialog 
          agent={runAgent}
          open={!!runAgent}
          onOpenChange={(open) => !open && setRunAgent(null)}
        />
      )}
    </div>
  );
}
```

#### Agent Create Dialog

```tsx
// File: app/src/client/components/AgentCreateDialog.tsx

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select';
import { api } from '../lib/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentCreateDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  
  const [form, setForm] = useState({
    name: '',
    description: '',
    provider: 'anthropic',
    model: 'claude-sonnet',
    system_prompt: 'You are a helpful assistant that processes data using the available tools. Be precise and efficient.',
    tools: [] as string[],
    is_public: false
  });

  // Fetch available plugins/tools
  const { data: plugins } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => api.get('/plugins').then(r => r.data.data)
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/agents', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      onOpenChange(false);
      setForm({
        name: '',
        description: '',
        provider: 'anthropic',
        model: 'claude-sonnet',
        system_prompt: 'You are a helpful assistant that processes data using the available tools. Be precise and efficient.',
        tools: [],
        is_public: false
      });
    }
  });

  const toggleTool = (toolId: string) => {
    setForm(prev => ({
      ...prev,
      tools: prev.tools.includes(toolId)
        ? prev.tools.filter(t => t !== toolId)
        : [...prev.tools, toolId]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Agent</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="data-cleanup-agent"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Cleans and transforms data files"
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>

          {/* Provider & Model */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select 
                value={form.provider}
                onValueChange={(v) => setForm(prev => ({ ...prev, provider: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="ollama">Ollama (Local)</SelectItem>
                  <SelectItem value="lmstudio">LM Studio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Select 
                value={form.model}
                onValueChange={(v) => setForm(prev => ({ ...prev, model: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {form.provider === 'anthropic' && (
                    <>
                      <SelectItem value="claude-sonnet">Claude Sonnet</SelectItem>
                      <SelectItem value="claude-opus">Claude Opus</SelectItem>
                      <SelectItem value="claude-haiku">Claude Haiku</SelectItem>
                    </>
                  )}
                  {form.provider === 'openai' && (
                    <>
                      <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                      <SelectItem value="gpt-4">GPT-4 Turbo</SelectItem>
                      <SelectItem value="gpt-3.5">GPT-3.5 Turbo</SelectItem>
                    </>
                  )}
                  {form.provider === 'ollama' && (
                    <>
                      <SelectItem value="llama3">Llama 3</SelectItem>
                      <SelectItem value="mistral">Mistral</SelectItem>
                      <SelectItem value="codellama">Code Llama</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <Label htmlFor="system_prompt">System Prompt</Label>
            <Textarea
              id="system_prompt"
              rows={4}
              placeholder="Instructions for the agent..."
              value={form.system_prompt}
              onChange={(e) => setForm(prev => ({ ...prev, system_prompt: e.target.value }))}
            />
          </div>

          {/* Tools Selection */}
          <div className="space-y-2">
            <Label>Available Tools (ForgeHooks)</Label>
            <div className="border rounded-md p-4 max-h-48 overflow-y-auto space-y-2">
              {plugins?.map((plugin: any) => (
                <div key={plugin.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={plugin.id}
                    checked={form.tools.includes(plugin.id)}
                    onCheckedChange={() => toggleTool(plugin.id)}
                  />
                  <label htmlFor={plugin.id} className="text-sm cursor-pointer flex-1">
                    <span className="font-medium">{plugin.name}</span>
                    <span className="text-muted-foreground ml-2">
                      ({plugin.endpoints?.length || 0} endpoints)
                    </span>
                  </label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Selected: {form.tools.length} tools
            </p>
          </div>

          {/* Public toggle */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_public"
              checked={form.is_public}
              onCheckedChange={(checked) => 
                setForm(prev => ({ ...prev, is_public: !!checked }))
              }
            />
            <label htmlFor="is_public" className="text-sm">
              Make this agent publicly accessible (no API key required)
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => createMutation.mutate(form)}
            disabled={!form.name || !form.system_prompt || form.tools.length === 0}
          >
            Create Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

#### Agent Run Dialog

```tsx
// File: app/src/client/components/AgentRunDialog.tsx

import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Loader2, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { Agent, RunAgentResponse, AgentStep } from '../../server/types/agent.types';

interface Props {
  agent: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentRunDialog({ agent, open, onOpenChange }: Props) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<RunAgentResponse | null>(null);

  const runMutation = useMutation({
    mutationFn: async (data: { input: string }) => {
      const response = await api.post(`/agents/${agent.slug}/run`, data);
      return response.data.data as RunAgentResponse;
    },
    onSuccess: (data) => {
      setResult(data);
    }
  });

  const handleRun = () => {
    setResult(null);
    runMutation.mutate({ input });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Run Agent: {agent.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Input */}
          <div className="space-y-2">
            <Label>Input</Label>
            <Textarea
              rows={4}
              placeholder="Describe what you want the agent to do..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>

          <Button 
            onClick={handleRun} 
            disabled={!input || runMutation.isPending}
            className="w-full"
          >
            {runMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              'Run Agent'
            )}
          </Button>

          {/* Results */}
          {result && (
            <div className="space-y-4 border-t pt-4">
              {/* Status */}
              <div className="flex items-center gap-2">
                {result.status === 'completed' ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                <span className="font-medium">
                  {result.status === 'completed' ? 'Completed' : 'Failed'}
                </span>
                <Badge variant="outline">
                  {result.metrics.duration_ms}ms
                </Badge>
                <Badge variant="outline">
                  {result.metrics.total_steps} steps
                </Badge>
                <Badge variant="outline">
                  {result.metrics.tokens_input + result.metrics.tokens_output} tokens
                </Badge>
              </div>

              {/* Steps */}
              {result.steps.length > 0 && (
                <div className="space-y-2">
                  <Label>Execution Steps</Label>
                  <div className="space-y-2">
                    {result.steps.map((step: AgentStep, idx: number) => (
                      <div 
                        key={idx}
                        className="flex items-start gap-2 p-2 bg-muted rounded text-sm"
                      >
                        <Badge variant="secondary" className="shrink-0">
                          {step.step}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{step.tool}</span>
                            <ArrowRight className="w-3 h-3" />
                            <span className="text-muted-foreground">{step.action}</span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {step.duration_ms}ms
                            </span>
                          </div>
                          {step.error && (
                            <p className="text-red-500 text-xs mt-1">{step.error}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Output */}
              <div className="space-y-2">
                <Label>Output</Label>
                <pre className="p-4 bg-muted rounded text-sm overflow-x-auto">
                  {result.output_text || JSON.stringify(result.output, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Error */}
          {runMutation.isError && (
            <div className="p-4 bg-red-50 text-red-700 rounded">
              {(runMutation.error as any)?.message || 'Agent execution failed'}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

### 8. Add to Router

```tsx
// File: app/src/client/App.tsx (add to existing routes)

import { AgentsPage } from './pages/Agents';

// In your routes:
<Route path="/agents" element={<AgentsPage />} />
```

---

## API Usage Examples

### Create an Agent

```bash
curl -X POST http://localhost:4000/api/v1/agents \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "name": "data-cleanup-agent",
    "description": "Cleans CSV data, normalizes dates, calculates summaries",
    "provider": "anthropic",
    "model": "claude-sonnet",
    "system_prompt": "You are a data processing assistant. Use the available tools to clean, transform, and analyze data. Be precise with date formats (use ISO 8601) and number formatting.",
    "tools": ["data-transform", "date-utils", "formula-engine", "json-utils"],
    "is_public": false
  }'
```

### Run an Agent

```bash
curl -X POST http://localhost:4000/api/v1/agents/data-cleanup-agent/run \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "input": "Clean this CSV: fix the date formats to ISO, calculate the total amount per region, and return as JSON",
    "data": {
      "csv": "name,date,amount,region\nJohn,1/15/24,1500,West\nJane,2024-02-20,2000,East\nBob,March 5 2024,1200,West"
    }
  }'
```

### Response

```json
{
  "success": true,
  "data": {
    "run_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "output": {
      "cleaned_data": [
        {"name": "John", "date": "2024-01-15", "amount": 1500, "region": "West"},
        {"name": "Jane", "date": "2024-02-20", "amount": 2000, "region": "East"},
        {"name": "Bob", "date": "2024-03-05", "amount": 1200, "region": "West"}
      ],
      "totals_by_region": {
        "West": 2700,
        "East": 2000
      }
    },
    "steps": [
      {
        "step": 1,
        "tool": "data-transform",
        "action": "csv_to_json",
        "duration_ms": 12
      },
      {
        "step": 2,
        "tool": "date-utils",
        "action": "parse_dates",
        "duration_ms": 8
      },
      {
        "step": 3,
        "tool": "formula-engine",
        "action": "evaluate",
        "duration_ms": 15
      }
    ],
    "metrics": {
      "total_steps": 3,
      "tokens_input": 847,
      "tokens_output": 312,
      "duration_ms": 1253
    }
  }
}
```

---

## File Structure Summary

```
app/src/server/
├── routes/
│   └── agents.ts              # NEW: Agent CRUD + run endpoints
├── services/
│   ├── agent.service.ts       # NEW: Agent management + runtime
│   └── llm.service.ts         # NEW: Multi-provider LLM abstraction
├── types/
│   └── agent.types.ts         # NEW: TypeScript types
└── app.ts                     # MODIFY: Register agent routes

app/src/client/
├── pages/
│   └── Agents.tsx             # NEW: Agent list page
├── components/
│   ├── AgentCreateDialog.tsx  # NEW: Create agent form
│   └── AgentRunDialog.tsx     # NEW: Run agent UI
└── App.tsx                    # MODIFY: Add /agents route

app/migrations/
└── 007_create_agents_tables.sql  # NEW: Database schema
```

---

## Dependencies to Add

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0",
    "openai": "^4.73.0"
  }
}
```

---

## Environment Variables

```env
# LLM Providers
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx

# Local AI (optional)
OLLAMA_URL=http://localhost:11434
LMSTUDIO_URL=http://localhost:1234/v1
```

---

## Next Steps for Claude Code

1. Run the migration to create tables
2. Create the type definitions
3. Implement `llm.service.ts`
4. Implement `agent.service.ts`
5. Create the API routes
6. Build the React components
7. Test with a simple agent

This architecture keeps everything in your Node.js/TypeScript stack, uses your existing ForgeHooks as tools, and provides a clean API for external callers.
