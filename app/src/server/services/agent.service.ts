/**
 * Agent Service
 * 
 * Core runtime for AI agents that orchestrate ForgeHooks autonomously.
 * 
 * Flow:
 * 1. Receive natural language instruction
 * 2. Build tool schemas from configured ForgeHooks
 * 3. Call LLM with instruction + tools
 * 4. Execute tool calls against ForgeHooks
 * 5. Feed results back to LLM
 * 6. Repeat until LLM returns final answer or max steps reached
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { databaseService } from './database.service.js';
import { llmService } from './llm.service.js';
import { dockerService } from './docker.service.js';
import { embeddedPluginService } from './embedded-plugin.service.js';
import {
  Agent,
  AgentRun,
  AgentStep,
  AgentConfig,
  AgentRunStatus,
  CreateAgentRequest,
  UpdateAgentRequest,
  RunAgentRequest,
  RunAgentResponse,
  ToolSchema,
  ToolParameter,
  ChatMessage,
  DEFAULT_AGENT_CONFIG,
  AGENT_TEMPLATES,
} from '../types/agent.types.js';
import { ForgeHookEndpoint, PluginInstance } from '../types/index.js';

// =============================================================================
// Agent Service Class
// =============================================================================

class AgentService {
  constructor() {
    logger.info('Agent service initialized');
  }

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  /**
   * Create a new agent
   */
  async createAgent(data: CreateAgentRequest, createdBy?: string): Promise<Agent> {
    const slug = this.generateSlug(data.name);
    const config: AgentConfig = { ...DEFAULT_AGENT_CONFIG, ...data.config };

    // Debug: log the createdBy value
    logger.info({ createdBy, createdByType: typeof createdBy, createdByIsNull: createdBy === null, createdByIsUndefined: createdBy === undefined, createdByIsEmpty: createdBy === '' }, 'Creating agent with createdBy');

    const result = await databaseService.query(
      `INSERT INTO agents (name, slug, description, model, provider, system_prompt, tools, config, is_public, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.name,
        slug,
        data.description || null,
        data.model || 'llama3.2',
        data.provider || 'ollama',
        data.system_prompt,
        data.tools,
        JSON.stringify(config),
        data.is_public ?? false,
        createdBy || null,
      ]
    );

    logger.info({ agentId: result.rows[0].id, name: data.name }, 'Agent created');
    return this.rowToAgent(result.rows[0]);
  }

  /**
   * Get agent by ID
   */
  async getAgentById(id: string): Promise<Agent | null> {
    const result = await databaseService.query(
      'SELECT * FROM agents WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return result.rows[0] ? this.rowToAgent(result.rows[0]) : null;
  }

  /**
   * Get agent by slug
   */
  async getAgentBySlug(slug: string): Promise<Agent | null> {
    const result = await databaseService.query(
      'SELECT * FROM agents WHERE slug = $1 AND deleted_at IS NULL',
      [slug]
    );
    return result.rows[0] ? this.rowToAgent(result.rows[0]) : null;
  }

  /**
   * Get agent by ID or slug
   */
  async getAgent(idOrSlug: string): Promise<Agent | null> {
    // Try UUID first
    if (this.isUUID(idOrSlug)) {
      return this.getAgentById(idOrSlug);
    }
    return this.getAgentBySlug(idOrSlug);
  }

  /**
   * List all agents
   */
  async listAgents(options?: { includePrivate?: boolean; limit?: number; offset?: number }): Promise<Agent[]> {
    const { includePrivate = false, limit = 100, offset = 0 } = options || {};

    const query = includePrivate
      ? 'SELECT * FROM agents WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2'
      : 'SELECT * FROM agents WHERE deleted_at IS NULL AND is_public = true ORDER BY created_at DESC LIMIT $1 OFFSET $2';

    const result = await databaseService.query(query, [limit, offset]);
    return result.rows.map(row => this.rowToAgent(row));
  }

  /**
   * Update an agent
   */
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
    const result = await databaseService.query(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    logger.info({ agentId: id }, 'Agent updated');
    return this.rowToAgent(result.rows[0]);
  }

  /**
   * Delete an agent (soft delete)
   */
  async deleteAgent(id: string): Promise<boolean> {
    const result = await databaseService.query(
      'UPDATE agents SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    
    if ((result.rowCount ?? 0) > 0) {
      logger.info({ agentId: id }, 'Agent deleted');
      return true;
    }
    return false;
  }

  // ===========================================================================
  // Agent Execution - THE CORE RUNTIME
  // ===========================================================================

  /**
   * Run an agent with natural language input
   */
  async runAgent(
    agentIdOrSlug: string,
    request: RunAgentRequest,
    context?: { apiKeyId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<RunAgentResponse> {
    // 1. Load agent
    const agent = await this.getAgent(agentIdOrSlug);
    if (!agent) {
      throw new Error(`Agent not found: ${agentIdOrSlug}`);
    }

    // 2. Merge config with any overrides
    const runConfig: AgentConfig = {
      ...agent.config,
      ...request.config_override,
    };

    // 3. Create run record
    const runId = uuidv4();
    await databaseService.query(
      `INSERT INTO agent_runs (id, agent_id, input_text, input_data, status, triggered_by, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, 'running', $5, $6, $7)`,
      [
        runId,
        agent.id,
        request.input,
        request.data ? JSON.stringify(request.data) : null,
        context?.apiKeyId || null,
        context?.ipAddress || null,
        context?.userAgent || null,
      ]
    );

    const startTime = Date.now();
    const steps: AgentStep[] = [];
    let tokensInput = 0;
    let tokensOutput = 0;

    logger.info({
      runId,
      agentId: agent.id,
      agentName: agent.name,
      provider: agent.provider,
      model: agent.model,
      toolCount: agent.tools.length,
    }, 'Agent run started');

    try {
      // 4. Build tool schemas for this agent's allowed tools
      const tools = await this.buildToolSchemas(agent.tools);
      
      logger.debug({ runId, toolCount: tools.length, tools: tools.map(t => t.name) }, 'Tools built for agent');

      // 5. Build initial messages
      const messages: ChatMessage[] = [
        { role: 'system', content: agent.system_prompt },
        {
          role: 'user',
          content: request.data
            ? `${request.input}\n\nData:\n${JSON.stringify(request.data, null, 2)}`
            : request.input,
        },
      ];

      // 6. Execution loop
      let finalOutput: Record<string, unknown> | null = null;
      let finalText: string | null = null;
      let stepCount = 0;

      while (stepCount < runConfig.max_steps) {
        // Check timeout
        if (Date.now() - startTime > runConfig.timeout_ms) {
          throw new Error(`Agent execution timeout after ${runConfig.timeout_ms}ms`);
        }

        // Call LLM
        const llmResponse = await llmService.chat({
          provider: agent.provider,
          model: agent.model,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          max_tokens: runConfig.max_tokens,
          temperature: runConfig.temperature,
        });

        if (llmResponse.error) {
          throw new Error(`LLM error: ${llmResponse.error}`);
        }

        tokensInput += llmResponse.usage?.input_tokens || 0;
        tokensOutput += llmResponse.usage?.output_tokens || 0;

        // Check if LLM wants to use tools
        if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
          // Add assistant message with tool calls
          messages.push({
            role: 'assistant',
            content: llmResponse.content || '',
            tool_calls: llmResponse.tool_calls,
          });

          // Process each tool call
          for (const toolCall of llmResponse.tool_calls) {
            stepCount++;
            const stepStart = Date.now();

            // Parse tool name: pluginId__method_path or pluginId__functionName
            const [pluginId, actionPath] = this.parseToolName(toolCall.function.name);

            const step: AgentStep = {
              step: stepCount,
              tool: pluginId,
              action: actionPath,
              input: JSON.parse(toolCall.function.arguments || '{}'),
              output: null,
              error: null,
              duration_ms: 0,
              timestamp: new Date().toISOString(),
            };

            logger.debug({
              runId,
              step: stepCount,
              tool: pluginId,
              action: actionPath,
            }, 'Executing tool call');

            try {
              // Execute the ForgeHook
              const result = await this.invokeForgeHook(
                pluginId,
                actionPath,
                step.input,
                runConfig.retry_on_error ? runConfig.max_retries : 0
              );
              step.output = result;
            } catch (err) {
              step.error = err instanceof Error ? err.message : String(err);
              logger.warn({ runId, step: stepCount, error: step.error }, 'Tool call failed');
            }

            step.duration_ms = Date.now() - stepStart;
            steps.push(step);

            // Add tool result to messages
            messages.push({
              role: 'tool',
              content: step.error
                ? JSON.stringify({ error: step.error })
                : JSON.stringify(step.output),
              tool_call_id: toolCall.id,
            });
          }
        } else {
          // LLM is done - extract final response
          finalText = llmResponse.content;

          // Try to parse as JSON if it looks like JSON
          if (finalText) {
            const trimmed = finalText.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              try {
                finalOutput = JSON.parse(trimmed);
              } catch {
                finalOutput = { result: finalText };
              }
            } else {
              finalOutput = { result: finalText };
            }
          }

          break;
        }
      }

      // 7. Update run record with success
      const duration = Date.now() - startTime;
      await this.updateRunRecord(runId, {
        status: 'completed',
        output: finalOutput,
        output_text: finalText,
        steps,
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        duration_ms: duration,
      });

      logger.info({
        runId,
        agentId: agent.id,
        status: 'completed',
        steps: steps.length,
        duration,
        tokensInput,
        tokensOutput,
      }, 'Agent run completed');

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
          duration_ms: duration,
        },
      };

    } catch (error) {
      // Update run record with failure
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.updateRunRecord(runId, {
        status: 'failed',
        error_message: errorMessage,
        steps,
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        duration_ms: duration,
      });

      logger.error({
        runId,
        agentId: agent.id,
        error: errorMessage,
        steps: steps.length,
        duration,
      }, 'Agent run failed');

      return {
        run_id: runId,
        status: 'failed',
        output: null,
        output_text: null,
        steps,
        metrics: {
          total_steps: steps.length,
          tokens_input: tokensInput,
          tokens_output: tokensOutput,
          duration_ms: duration,
        },
        error: errorMessage,
      };
    }
  }

  // ===========================================================================
  // Run History
  // ===========================================================================

  /**
   * Get a single run by ID
   */
  async getRunById(runId: string): Promise<AgentRun | null> {
    const result = await databaseService.query(
      'SELECT * FROM agent_runs WHERE id = $1',
      [runId]
    );
    return result.rows[0] ? this.rowToRun(result.rows[0]) : null;
  }

  /**
   * Get runs for an agent
   */
  async getRunsByAgentId(agentId: string, limit = 50, offset = 0): Promise<AgentRun[]> {
    const result = await databaseService.query(
      'SELECT * FROM agent_runs WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [agentId, limit, offset]
    );
    return result.rows.map(row => this.rowToRun(row));
  }

  /**
   * Get recent runs across all agents
   */
  async getRecentRuns(limit = 50): Promise<AgentRun[]> {
    const result = await databaseService.query(
      'SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows.map(row => this.rowToRun(row));
  }

  // ===========================================================================
  // Sample Agents
  // ===========================================================================

  /**
   * Create sample agents from templates
   */
  async createSampleAgents(): Promise<Agent[]> {
    const created: Agent[] = [];

    for (const template of AGENT_TEMPLATES) {
      // Check if already exists
      const existing = await this.getAgentBySlug(template.id);
      if (existing) {
        logger.debug({ slug: template.id }, 'Sample agent already exists');
        continue;
      }

      try {
        const agent = await this.createAgent({
          name: template.name,
          description: template.description,
          system_prompt: template.system_prompt,
          tools: template.suggested_tools,
          is_public: true,
        });
        created.push(agent);
        logger.info({ slug: template.id, agentId: agent.id }, 'Sample agent created');
      } catch (error) {
        logger.warn({ template: template.id, error }, 'Failed to create sample agent');
      }
    }

    return created;
  }

  // ===========================================================================
  // Tool Schema Building
  // ===========================================================================

  /**
   * Build OpenAI-compatible tool schemas from ForgeHook plugins
   */
  private async buildToolSchemas(toolIds: string[]): Promise<ToolSchema[]> {
    const schemas: ToolSchema[] = [];

    // Get installed plugins
    const installedPlugins = await databaseService.listPlugins();
    const dockerPlugins = dockerService.listPlugins();

    // Combine and deduplicate
    const allPlugins = new Map<string, PluginInstance>();
    for (const p of installedPlugins) {
      allPlugins.set(p.forgehookId, p);
    }
    for (const p of dockerPlugins) {
      if (!allPlugins.has(p.forgehookId)) {
        allPlugins.set(p.forgehookId, p);
      }
    }

    for (const toolId of toolIds) {
      const plugin = allPlugins.get(toolId);
      if (!plugin) {
        logger.warn({ toolId }, 'Tool not found in installed plugins');
        continue;
      }

      if (plugin.status !== 'running') {
        logger.warn({ toolId, status: plugin.status }, 'Tool not running');
        continue;
      }

      // Each endpoint becomes a tool
      const endpoints = plugin.manifest?.endpoints || [];
      for (const endpoint of endpoints) {
        const toolName = this.buildToolName(toolId, endpoint);
        
        schemas.push({
          name: toolName,
          description: `${plugin.manifest?.name || toolId}: ${endpoint.description || endpoint.path}`,
          parameters: this.endpointToParameters(endpoint),
        });
      }
    }

    return schemas;
  }

  /**
   * Build a tool name from plugin ID and endpoint
   */
  private buildToolName(pluginId: string, endpoint: ForgeHookEndpoint): string {
    const method = endpoint.method.toLowerCase();
    const path = endpoint.path.replace(/\//g, '_').replace(/^_/, '').replace(/_$/g, '');
    return `${pluginId}__${method}_${path}`;
  }

  /**
   * Parse a tool name back to plugin ID and action
   */
  private parseToolName(toolName: string): [string, string] {
    const match = toolName.match(/^(.+?)__(.+)$/);
    if (!match) {
      return [toolName, 'invoke'];
    }
    return [match[1], match[2]];
  }

  /**
   * Convert endpoint schema to tool parameters
   */
  private endpointToParameters(endpoint: ForgeHookEndpoint): ToolSchema['parameters'] {
    const properties: Record<string, ToolParameter> = {};
    const required: string[] = [];

    // Extract schema from requestBody if available
    if (endpoint.requestBody && typeof endpoint.requestBody === 'object') {
      const body = endpoint.requestBody as Record<string, unknown>;

      if (body.properties && typeof body.properties === 'object') {
        for (const [key, value] of Object.entries(body.properties as Record<string, unknown>)) {
          properties[key] = value as ToolParameter;
        }
      }

      if (Array.isArray(body.required)) {
        required.push(...(body.required as string[]));
      }
    }

    // For endpoints without requestBody, create generic input
    if (Object.keys(properties).length === 0 && endpoint.method !== 'GET') {
      properties['input'] = {
        type: 'object',
        description: 'Input data for the operation',
      };
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  // ===========================================================================
  // ForgeHook Invocation
  // ===========================================================================

  /**
   * Invoke a ForgeHook (embedded or container)
   */
  private async invokeForgeHook(
    pluginId: string,
    action: string,
    input: Record<string, unknown>,
    retries = 0
  ): Promise<Record<string, unknown>> {
    // Get plugin from database or docker service
    const installedPlugins = await databaseService.listPlugins();
    let plugin = installedPlugins.find(p => p.forgehookId === pluginId);

    if (!plugin) {
      plugin = dockerService.getPluginByForgehookId(pluginId);
    }

    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (plugin.runtime === 'embedded') {
          // Parse action to get function name (e.g., "post_calculate" -> "calculate")
          const functionName = action.replace(/^(get|post|put|delete|patch)_/i, '');
          const result = await embeddedPluginService.invoke(pluginId, functionName, input);
          
          if (!result.success) {
            throw new Error(result.error || 'Embedded plugin invocation failed');
          }
          
          return result.result as Record<string, unknown>;
        } else {
          // Container plugin - make HTTP request
          if (!plugin.hostPort) {
            throw new Error(`Plugin ${pluginId} has no host port assigned`);
          }

          // Parse action to get method and path (e.g., "post_transform" -> POST /transform)
          const [method, ...pathParts] = action.split('_');
          const path = '/' + pathParts.join('/');

          const url = `http://localhost:${plugin.hostPort}${path}`;
          const httpMethod = method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE';

          const response = await fetch(url, {
            method: httpMethod,
            headers: { 'Content-Type': 'application/json' },
            body: httpMethod !== 'GET' ? JSON.stringify(input) : undefined,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Plugin ${pluginId} returned ${response.status}: ${errorText}`);
          }

          return await response.json() as Record<string, unknown>;
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn({
          pluginId,
          action,
          attempt: attempt + 1,
          error: lastError.message,
        }, 'ForgeHook invocation failed');

        if (attempt < retries) {
          // Exponential backoff
          await this.sleep(1000 * Math.pow(2, attempt));
        }
      }
    }

    throw lastError || new Error(`Failed to invoke ${pluginId}`);
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private async updateRunRecord(
    runId: string,
    data: {
      status: AgentRunStatus;
      output?: Record<string, unknown> | null;
      output_text?: string | null;
      error_message?: string;
      steps: AgentStep[];
      tokens_input: number;
      tokens_output: number;
      duration_ms: number;
    }
  ): Promise<void> {
    await databaseService.query(
      `UPDATE agent_runs SET
        status = $1,
        output = $2,
        output_text = $3,
        error_message = $4,
        steps = $5,
        total_steps = $6,
        tokens_input = $7,
        tokens_output = $8,
        duration_ms = $9,
        completed_at = CURRENT_TIMESTAMP
       WHERE id = $10`,
      [
        data.status,
        data.output ? JSON.stringify(data.output) : null,
        data.output_text || null,
        data.error_message || null,
        JSON.stringify(data.steps),
        data.steps.length,
        data.tokens_input,
        data.tokens_output,
        data.duration_ms,
        runId,
      ]
    );
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private isUUID(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private rowToAgent(row: Record<string, unknown>): Agent {
    return {
      id: row.id as string,
      name: row.name as string,
      slug: row.slug as string,
      description: row.description as string | null,
      model: row.model as string,
      provider: row.provider as Agent['provider'],
      system_prompt: row.system_prompt as string,
      tools: row.tools as string[] || [],
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config as AgentConfig,
      is_public: row.is_public as boolean,
      api_key_required: row.api_key_required as boolean,
      allowed_api_keys: row.allowed_api_keys as string[] || [],
      created_by: row.created_by as string | null,
      created_at: row.created_at as Date,
      updated_at: row.updated_at as Date,
      deleted_at: row.deleted_at as Date | null,
    };
  }

  private rowToRun(row: Record<string, unknown>): AgentRun {
    return {
      id: row.id as string,
      agent_id: row.agent_id as string,
      input_text: row.input_text as string,
      input_data: row.input_data as Record<string, unknown> | null,
      output: row.output as Record<string, unknown> | null,
      output_text: row.output_text as string | null,
      steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps as AgentStep[],
      total_steps: row.total_steps as number,
      tokens_input: row.tokens_input as number,
      tokens_output: row.tokens_output as number,
      duration_ms: row.duration_ms as number | null,
      status: row.status as AgentRunStatus,
      error_message: row.error_message as string | null,
      triggered_by: row.triggered_by as string | null,
      ip_address: row.ip_address as string | null,
      user_agent: row.user_agent as string | null,
      created_at: row.created_at as Date,
      completed_at: row.completed_at as Date | null,
    };
  }
}

// Singleton export
export const agentService = new AgentService();
