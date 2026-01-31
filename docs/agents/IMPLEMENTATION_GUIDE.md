# Agent Runtime Implementation Guide

## Overview

This document provides the implementation details for the LeForge Agent Runtime.
The runtime executes agents by orchestrating LLM calls and ForgeHook tool invocations.

## File Structure

Add these files to the existing app structure:

```
app/src/server/
├── routes/
│   └── agents.ts              # NEW: Agent CRUD + run endpoints
├── services/
│   ├── agent.service.ts       # NEW: Agent management (CRUD)
│   └── agent-runtime.service.ts  # NEW: Agent execution loop
├── types/
│   └── agent.types.ts         # NEW: TypeScript interfaces
└── utils/
    └── tool-converter.ts      # NEW: ForgeHook → LLM tool schema
```

## Core Components

### 1. Type Definitions

**File:** `app/src/server/types/agent.types.ts`

```typescript
// Agent configuration stored in database
export interface AgentConfig {
  max_steps: number;
  temperature: number;
  timeout_ms: number;
  retry_on_error: boolean;
}

// Agent definition
export interface Agent {
  id: string;
  name: string;
  description: string | null;
  tools: string[];           // ForgeHook IDs
  model: string;
  system_prompt: string | null;
  config: AgentConfig;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Create agent request
export interface CreateAgentRequest {
  name: string;
  description?: string;
  tools: string[];
  model?: string;
  system_prompt?: string;
  config?: Partial<AgentConfig>;
}

// Update agent request
export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  tools?: string[];
  model?: string;
  system_prompt?: string;
  config?: Partial<AgentConfig>;
  is_active?: boolean;
}

// Run agent request
export interface RunAgentRequest {
  input: string;
  data?: Record<string, unknown>;
  config_override?: Partial<AgentConfig>;
  stream?: boolean;
}

// Step in agent execution
export interface AgentStep {
  step_number: number;
  tool: string;
  action: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  duration_ms: number;
  timestamp: string;
  error?: string;
}

// Agent run record
export interface AgentRun {
  id: string;
  agent_id: string;
  input: string;
  input_data: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  steps: AgentStep[];
  tokens_used: number;
  duration_ms: number | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

// LLM message format
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: LLMToolCall[];
}

// LLM tool call
export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON string
  };
}

// Tool schema for LLM
export interface LLMToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}
```


### 2. Tool Converter Utility

**File:** `app/src/server/utils/tool-converter.ts`

This converts ForgeHook manifests into LLM-compatible tool schemas.

```typescript
import { LLMToolSchema } from '../types/agent.types';

interface ForgeHookEndpoint {
  method: string;
  path: string;
  description?: string;
  parameters?: {
    name: string;
    type: string;
    required?: boolean;
    description?: string;
  }[];
}

interface ForgeHookManifest {
  id: string;
  name: string;
  description?: string;
  endpoints: ForgeHookEndpoint[];
}

/**
 * Convert a ForgeHook manifest to LLM tool schemas
 * Each endpoint becomes a separate tool
 */
export function forgeHookToToolSchemas(manifest: ForgeHookManifest): LLMToolSchema[] {
  return manifest.endpoints.map(endpoint => {
    // Create tool name: pluginId__method_path
    // e.g., "data-transform__post_csv-to-json"
    const toolName = `${manifest.id}__${endpoint.method.toLowerCase()}_${endpoint.path.replace(/\//g, '_').replace(/^_/, '')}`;
    
    // Build parameters schema
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    
    if (endpoint.parameters) {
      for (const param of endpoint.parameters) {
        properties[param.name] = {
          type: mapType(param.type),
          description: param.description || param.name
        };
        if (param.required) {
          required.push(param.name);
        }
      }
    }
    
    return {
      type: 'function',
      function: {
        name: toolName,
        description: `${manifest.name}: ${endpoint.description || endpoint.path}`,
        parameters: {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined
        }
      }
    };
  });
}

/**
 * Parse tool name back to ForgeHook endpoint
 */
export function parseToolName(toolName: string): { pluginId: string; method: string; path: string } {
  const [pluginId, rest] = toolName.split('__');
  const [method, ...pathParts] = rest.split('_');
  return {
    pluginId,
    method: method.toUpperCase(),
    path: '/' + pathParts.join('/')
  };
}

function mapType(type: string): string {
  const typeMap: Record<string, string> = {
    'string': 'string',
    'number': 'number',
    'integer': 'integer',
    'boolean': 'boolean',
    'array': 'array',
    'object': 'object'
  };
  return typeMap[type.toLowerCase()] || 'string';
}
```


### 3. Agent Service (CRUD Operations)

**File:** `app/src/server/services/agent.service.ts`

```typescript
import { Pool } from 'pg';
import { 
  Agent, 
  AgentRun, 
  CreateAgentRequest, 
  UpdateAgentRequest,
  AgentConfig 
} from '../types/agent.types';

const DEFAULT_CONFIG: AgentConfig = {
  max_steps: 10,
  temperature: 0.7,
  timeout_ms: 30000,
  retry_on_error: true
};

export class AgentService {
  constructor(private db: Pool) {}

  async listAgents(activeOnly = true, limit = 50, offset = 0): Promise<{ agents: Agent[]; total: number }> {
    const whereClause = activeOnly ? 'WHERE is_active = true' : '';
    
    const countResult = await this.db.query(
      `SELECT COUNT(*) FROM agents ${whereClause}`
    );
    const total = parseInt(countResult.rows[0].count);
    
    const result = await this.db.query(
      `SELECT * FROM agents ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    return { agents: result.rows, total };
  }

  async getAgent(id: string): Promise<Agent | null> {
    const result = await this.db.query(
      'SELECT * FROM agents WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async getAgentByName(name: string): Promise<Agent | null> {
    const result = await this.db.query(
      'SELECT * FROM agents WHERE name = $1',
      [name]
    );
    return result.rows[0] || null;
  }

  async createAgent(data: CreateAgentRequest): Promise<Agent> {
    const config = { ...DEFAULT_CONFIG, ...data.config };
    
    const result = await this.db.query(
      `INSERT INTO agents (name, description, tools, model, system_prompt, config)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.name,
        data.description || null,
        data.tools,
        data.model || 'gpt-4o',
        data.system_prompt || null,
        JSON.stringify(config)
      ]
    );
    
    return result.rows[0];
  }

  async updateAgent(id: string, data: UpdateAgentRequest): Promise<Agent | null> {
    const agent = await this.getAgent(id);
    if (!agent) return null;
    
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;
    
    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.tools !== undefined) {
      updates.push(`tools = $${paramIndex++}`);
      values.push(data.tools);
    }
    if (data.model !== undefined) {
      updates.push(`model = $${paramIndex++}`);
      values.push(data.model);
    }
    if (data.system_prompt !== undefined) {
      updates.push(`system_prompt = $${paramIndex++}`);
      values.push(data.system_prompt);
    }
    if (data.config !== undefined) {
      const mergedConfig = { ...agent.config, ...data.config };
      updates.push(`config = $${paramIndex++}`);
      values.push(JSON.stringify(mergedConfig));
    }
    if (data.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.is_active);
    }
    
    if (updates.length === 0) return agent;
    
    values.push(id);
    const result = await this.db.query(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    
    return result.rows[0];
  }

  async deleteAgent(id: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM agents WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Run management
  async createRun(agentId: string, input: string, inputData?: Record<string, unknown>): Promise<AgentRun> {
    const result = await this.db.query(
      `INSERT INTO agent_runs (agent_id, input, input_data, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [agentId, input, inputData ? JSON.stringify(inputData) : null]
    );
    return result.rows[0];
  }

  async updateRun(runId: string, updates: Partial<AgentRun>): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;
    
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.output !== undefined) {
      setClauses.push(`output = $${paramIndex++}`);
      values.push(JSON.stringify(updates.output));
    }
    if (updates.error !== undefined) {
      setClauses.push(`error = $${paramIndex++}`);
      values.push(updates.error);
    }
    if (updates.steps !== undefined) {
      setClauses.push(`steps = $${paramIndex++}`);
      values.push(JSON.stringify(updates.steps));
    }
    if (updates.tokens_used !== undefined) {
      setClauses.push(`tokens_used = $${paramIndex++}`);
      values.push(updates.tokens_used);
    }
    if (updates.duration_ms !== undefined) {
      setClauses.push(`duration_ms = $${paramIndex++}`);
      values.push(updates.duration_ms);
    }
    if (updates.started_at !== undefined) {
      setClauses.push(`started_at = $${paramIndex++}`);
      values.push(updates.started_at);
    }
    if (updates.completed_at !== undefined) {
      setClauses.push(`completed_at = $${paramIndex++}`);
      values.push(updates.completed_at);
    }
    
    values.push(runId);
    await this.db.query(
      `UPDATE agent_runs SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  async getRuns(agentId: string, status?: string, limit = 20, offset = 0): Promise<{ runs: AgentRun[]; total: number }> {
    let whereClause = 'WHERE agent_id = $1';
    const values: unknown[] = [agentId];
    
    if (status) {
      whereClause += ' AND status = $2';
      values.push(status);
    }
    
    const countResult = await this.db.query(
      `SELECT COUNT(*) FROM agent_runs ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);
    
    values.push(limit, offset);
    const result = await this.db.query(
      `SELECT * FROM agent_runs ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    
    return { runs: result.rows, total };
  }

  async getRun(runId: string): Promise<AgentRun | null> {
    const result = await this.db.query(
      'SELECT * FROM agent_runs WHERE id = $1',
      [runId]
    );
    return result.rows[0] || null;
  }
}
```


### 4. Agent Runtime Service (Execution Loop)

**File:** `app/src/server/services/agent-runtime.service.ts`

This is the core agent execution engine.

```typescript
import { 
  Agent, 
  AgentRun, 
  AgentStep,
  AgentConfig,
  LLMMessage, 
  LLMToolCall,
  LLMToolSchema,
  RunAgentRequest 
} from '../types/agent.types';
import { AgentService } from './agent.service';
import { forgeHookToToolSchemas, parseToolName } from '../utils/tool-converter';

// Import your existing services
// import { llmService } from './llm.service';
// import { pluginManager } from './plugin-manager.service';
// import { registryService } from './registry.service';

export class AgentRuntimeService {
  constructor(
    private agentService: AgentService,
    // private llmService: LLMService,
    // private pluginManager: PluginManager
  ) {}

  /**
   * Execute an agent with the given input
   */
  async runAgent(
    agent: Agent,
    request: RunAgentRequest
  ): Promise<AgentRun> {
    // Merge config with overrides
    const config: AgentConfig = {
      ...agent.config,
      ...request.config_override
    };

    // Create run record
    const run = await this.agentService.createRun(
      agent.id,
      request.input,
      request.data
    );

    // Start execution
    await this.agentService.updateRun(run.id, {
      status: 'running',
      started_at: new Date()
    });

    const startTime = Date.now();
    const steps: AgentStep[] = [];
    let totalTokens = 0;

    try {
      // Build tool schemas from ForgeHooks
      const tools = await this.buildToolSchemas(agent.tools);

      // Initialize conversation
      const messages: LLMMessage[] = [
        {
          role: 'system',
          content: this.buildSystemPrompt(agent, request.data)
        },
        {
          role: 'user',
          content: request.input
        }
      ];

      // Execution loop
      let stepNumber = 0;
      while (stepNumber < config.max_steps) {
        // Check timeout
        if (Date.now() - startTime > config.timeout_ms) {
          throw new Error(`Agent execution timed out after ${config.timeout_ms}ms`);
        }

        // Call LLM
        const response = await this.callLLM(
          agent.model,
          messages,
          tools,
          config.temperature
        );

        totalTokens += response.tokens_used || 0;

        // Check if LLM wants to use tools
        if (response.tool_calls && response.tool_calls.length > 0) {
          // Add assistant message with tool calls
          messages.push({
            role: 'assistant',
            content: response.content || '',
            tool_calls: response.tool_calls
          });

          // Execute each tool call
          for (const toolCall of response.tool_calls) {
            stepNumber++;
            const step = await this.executeToolCall(
              toolCall,
              stepNumber,
              config.retry_on_error
            );
            steps.push(step);

            // Add tool result to conversation
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: step.error 
                ? JSON.stringify({ error: step.error })
                : JSON.stringify(step.output)
            });
          }
        } else {
          // LLM is done - no more tool calls
          const result = this.parseResult(response.content);
          
          await this.agentService.updateRun(run.id, {
            status: 'completed',
            output: result,
            steps,
            tokens_used: totalTokens,
            duration_ms: Date.now() - startTime,
            completed_at: new Date()
          });

          return await this.agentService.getRun(run.id) as AgentRun;
        }
      }

      // Max steps reached
      throw new Error(`Agent exceeded maximum steps (${config.max_steps})`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await this.agentService.updateRun(run.id, {
        status: 'failed',
        error: errorMessage,
        steps,
        tokens_used: totalTokens,
        duration_ms: Date.now() - startTime,
        completed_at: new Date()
      });

      return await this.agentService.getRun(run.id) as AgentRun;
    }
  }

  /**
   * Build system prompt for the agent
   */
  private buildSystemPrompt(agent: Agent, data?: Record<string, unknown>): string {
    let prompt = agent.system_prompt || 'You are a helpful assistant that uses tools to complete tasks.';
    
    prompt += `\n\nYou have access to the following tools from the LeForge platform. Use them to complete the user's request.`;
    
    if (data) {
      prompt += `\n\nThe user has provided the following data:\n${JSON.stringify(data, null, 2)}`;
    }
    
    prompt += `\n\nWhen you have completed the task, respond with a JSON object containing your final result. Do not use any tools in your final response.`;
    
    return prompt;
  }

  /**
   * Build LLM tool schemas from ForgeHook IDs
   */
  private async buildToolSchemas(toolIds: string[]): Promise<LLMToolSchema[]> {
    const schemas: LLMToolSchema[] = [];
    
    for (const toolId of toolIds) {
      // Get ForgeHook manifest from registry
      // const manifest = await this.registryService.getPlugin(toolId);
      // if (manifest) {
      //   schemas.push(...forgeHookToToolSchemas(manifest));
      // }
      
      // TODO: Implement with your registry service
      // This is a placeholder showing the pattern
    }
    
    return schemas;
  }

  /**
   * Call the LLM with messages and tools
   */
  private async callLLM(
    model: string,
    messages: LLMMessage[],
    tools: LLMToolSchema[],
    temperature: number
  ): Promise<{
    content: string | null;
    tool_calls?: LLMToolCall[];
    tokens_used?: number;
  }> {
    // TODO: Implement with your LLM service
    // This should route to the appropriate provider based on model name
    // e.g., "claude-sonnet-4-20250514" -> Anthropic, "gpt-4o" -> OpenAI, "ollama/llama3" -> Ollama
    
    // Example implementation:
    // return await this.llmService.chat({
    //   model,
    //   messages,
    //   tools,
    //   temperature
    // });
    
    throw new Error('LLM service not implemented');
  }

  /**
   * Execute a single tool call
   */
  private async executeToolCall(
    toolCall: LLMToolCall,
    stepNumber: number,
    retryOnError: boolean
  ): Promise<AgentStep> {
    const startTime = Date.now();
    const { pluginId, method, path } = parseToolName(toolCall.function.name);
    
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(toolCall.function.arguments);
    } catch {
      input = {};
    }

    const step: AgentStep = {
      step_number: stepNumber,
      tool: pluginId,
      action: `${method} ${path}`,
      input,
      output: null,
      duration_ms: 0,
      timestamp: new Date().toISOString()
    };

    try {
      // Invoke the ForgeHook
      // const result = await this.pluginManager.invoke(pluginId, method, path, input);
      // step.output = result;
      
      // TODO: Implement with your plugin manager
      throw new Error('Plugin manager not implemented');
      
    } catch (error) {
      step.error = error instanceof Error ? error.message : 'Tool execution failed';
      
      if (retryOnError) {
        // Could implement retry logic here
      }
    }

    step.duration_ms = Date.now() - startTime;
    return step;
  }

  /**
   * Parse the final result from LLM response
   */
  private parseResult(content: string | null): Record<string, unknown> {
    if (!content) return {};
    
    // Try to extract JSON from the response
    try {
      // Look for JSON in code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      
      // Try parsing the whole content as JSON
      return JSON.parse(content);
    } catch {
      // Return as text result
      return { result: content };
    }
  }
}
```


### 5. Routes

**File:** `app/src/server/routes/agents.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AgentService } from '../services/agent.service';
import { AgentRuntimeService } from '../services/agent-runtime.service';
import { 
  CreateAgentRequest, 
  UpdateAgentRequest, 
  RunAgentRequest 
} from '../types/agent.types';

export async function agentRoutes(fastify: FastifyInstance) {
  // Get services from app context
  const agentService = fastify.agentService as AgentService;
  const runtimeService = fastify.agentRuntimeService as AgentRuntimeService;

  // List agents
  fastify.get('/agents', async (request: FastifyRequest, reply: FastifyReply) => {
    const { active_only = 'true', limit = '50', offset = '0' } = request.query as Record<string, string>;
    
    const result = await agentService.listAgents(
      active_only === 'true',
      parseInt(limit),
      parseInt(offset)
    );
    
    return result;
  });

  // Get agent by ID or name
  fastify.get('/agents/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    
    // Try by ID first, then by name
    let agent = await agentService.getAgent(id);
    if (!agent) {
      agent = await agentService.getAgentByName(id);
    }
    
    if (!agent) {
      return reply.code(404).send({ error: 'AGENT_NOT_FOUND', message: 'Agent not found' });
    }
    
    return agent;
  });

  // Create agent
  fastify.post('/agents', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = request.body as CreateAgentRequest;
    
    // Validate required fields
    if (!data.name || !data.tools || data.tools.length === 0) {
      return reply.code(400).send({ 
        error: 'INVALID_INPUT', 
        message: 'name and tools are required' 
      });
    }
    
    // Check if name already exists
    const existing = await agentService.getAgentByName(data.name);
    if (existing) {
      return reply.code(409).send({ 
        error: 'AGENT_EXISTS', 
        message: 'An agent with this name already exists' 
      });
    }
    
    // TODO: Validate that all tools exist in registry
    
    const agent = await agentService.createAgent(data);
    
    return reply.code(201).send({
      id: agent.id,
      name: agent.name,
      message: 'Agent created successfully'
    });
  });

  // Update agent
  fastify.put('/agents/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = request.body as UpdateAgentRequest;
    
    const agent = await agentService.updateAgent(id, data);
    
    if (!agent) {
      return reply.code(404).send({ error: 'AGENT_NOT_FOUND', message: 'Agent not found' });
    }
    
    return { id: agent.id, message: 'Agent updated successfully' };
  });

  // Delete agent
  fastify.delete('/agents/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    
    const deleted = await agentService.deleteAgent(id);
    
    if (!deleted) {
      return reply.code(404).send({ error: 'AGENT_NOT_FOUND', message: 'Agent not found' });
    }
    
    return { id, message: 'Agent deleted successfully' };
  });

  // Run agent
  fastify.post('/agents/:id/run', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = request.body as RunAgentRequest;
    
    // Validate input
    if (!data.input) {
      return reply.code(400).send({ 
        error: 'INVALID_INPUT', 
        message: 'input is required' 
      });
    }
    
    // Get agent
    let agent = await agentService.getAgent(id);
    if (!agent) {
      agent = await agentService.getAgentByName(id);
    }
    
    if (!agent) {
      return reply.code(404).send({ error: 'AGENT_NOT_FOUND', message: 'Agent not found' });
    }
    
    if (!agent.is_active) {
      return reply.code(400).send({ error: 'AGENT_INACTIVE', message: 'Agent is not active' });
    }
    
    // TODO: Implement streaming if data.stream is true
    
    // Execute agent
    const run = await runtimeService.runAgent(agent, data);
    
    return run;
  });

  // Get run history
  fastify.get('/agents/:id/runs', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { status, limit = '20', offset = '0' } = request.query as Record<string, string>;
    
    // Verify agent exists
    let agent = await agentService.getAgent(id);
    if (!agent) {
      agent = await agentService.getAgentByName(id);
    }
    
    if (!agent) {
      return reply.code(404).send({ error: 'AGENT_NOT_FOUND', message: 'Agent not found' });
    }
    
    const result = await agentService.getRuns(
      agent.id,
      status,
      parseInt(limit),
      parseInt(offset)
    );
    
    return result;
  });

  // Get specific run
  fastify.get('/agents/:id/runs/:runId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { runId } = request.params as { id: string; runId: string };
    
    const run = await agentService.getRun(runId);
    
    if (!run) {
      return reply.code(404).send({ error: 'RUN_NOT_FOUND', message: 'Run not found' });
    }
    
    return run;
  });
}
```


---

## Integration Points

### 1. Register Routes in app.ts

Add to your existing `app/src/server/app.ts`:

```typescript
import { agentRoutes } from './routes/agents';

// In your buildApp function:
await app.register(agentRoutes, { prefix: '/api/v1' });
```

### 2. Initialize Services

Add to your service initialization:

```typescript
import { AgentService } from './services/agent.service';
import { AgentRuntimeService } from './services/agent-runtime.service';

// After database connection is established:
const agentService = new AgentService(db);
const agentRuntimeService = new AgentRuntimeService(
  agentService,
  // llmService,
  // pluginManager
);

// Decorate Fastify instance
app.decorate('agentService', agentService);
app.decorate('agentRuntimeService', agentRuntimeService);
```

### 3. Connect to LLM Service

The runtime needs to call your existing LLM ForgeHook. You'll need to implement the `callLLM` method to:

1. Route to the correct provider based on model name
2. Handle the tool-calling format for each provider
3. Return normalized responses

Example model routing:
```typescript
function getProvider(model: string): string {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gpt')) return 'openai';
  if (model.startsWith('ollama/')) return 'ollama';
  if (model.startsWith('lmstudio/')) return 'lmstudio';
  return 'openai'; // default
}
```

### 4. Connect to Plugin Manager

The runtime needs to invoke ForgeHooks. Connect it to your existing plugin invocation logic:

```typescript
// In executeToolCall:
const result = await this.invokePlugin(pluginId, {
  method,
  path,
  body: input
});
```

---

## Testing

### Manual Test Flow

1. **Create an agent:**
```bash
curl -X POST http://localhost:4000/api/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-agent",
    "description": "Test agent for development",
    "tools": ["string-utils", "json-utils"],
    "model": "gpt-4o"
  }'
```

2. **List agents:**
```bash
curl http://localhost:4000/api/v1/agents
```

3. **Run the agent:**
```bash
curl -X POST http://localhost:4000/api/v1/agents/test-agent/run \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Convert this text to uppercase: hello world"
  }'
```

4. **Check run history:**
```bash
curl http://localhost:4000/api/v1/agents/test-agent/runs
```

---

## Future Enhancements

### Phase 2: Streaming Support
- SSE endpoint for real-time step updates
- Progressive result delivery

### Phase 3: Agent UI
- React component for agent builder
- Visual tool selection
- Prompt editor with testing

### Phase 4: Advanced Features
- Agent templates (pre-built agents for common tasks)
- Conditional tool execution
- Sub-agent delegation
- Memory/context persistence across runs
