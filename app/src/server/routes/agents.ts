/**
 * Agent Runtime Routes
 * 
 * API endpoints for creating, managing, and running AI agents
 * that orchestrate ForgeHooks autonomously.
 * 
 * Endpoints:
 * - GET    /api/v1/agents           - List all agents
 * - POST   /api/v1/agents           - Create a new agent
 * - GET    /api/v1/agents/:id       - Get a single agent
 * - PUT    /api/v1/agents/:id       - Update an agent
 * - DELETE /api/v1/agents/:id       - Delete an agent
 * - POST   /api/v1/agents/:id/run   - Run an agent
 * - GET    /api/v1/agents/:id/runs  - Get run history for an agent
 * - GET    /api/v1/runs/:runId      - Get a single run
 * - GET    /api/v1/llm/providers    - List available LLM providers
 * - GET    /api/v1/llm/models/:provider - List models for a provider
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { agentService } from '../services/agent.service.js';
import { llmService } from '../services/llm.service.js';
import { logger } from '../utils/logger.js';
import {
  CreateAgentRequest,
  UpdateAgentRequest,
  RunAgentRequest,
  LLMProvider,
  AGENT_TEMPLATES,
} from '../types/agent.types.js';

// =============================================================================
// Request/Response Types
// =============================================================================

interface AgentParams {
  id: string;
}

interface RunParams {
  runId: string;
}

interface ProviderParams {
  provider: LLMProvider;
}

interface ListAgentsQuery {
  includePrivate?: boolean;
  limit?: number;
  offset?: number;
}

interface ListRunsQuery {
  limit?: number;
  offset?: number;
}

// =============================================================================
// Routes
// =============================================================================

export async function agentRoutes(fastify: FastifyInstance) {

  // ===========================================================================
  // List Agents
  // ===========================================================================
  /**
   * GET /api/v1/agents
   * List all agents
   * 
   * Query params:
   * - includePrivate: Include private agents (requires auth)
   * - limit: Max results (default: 100)
   * - offset: Pagination offset (default: 0)
   */
  fastify.get<{ Querystring: ListAgentsQuery }>(
    '/api/v1/agents',
    async (request: FastifyRequest<{ Querystring: ListAgentsQuery }>, reply: FastifyReply) => {
      const { includePrivate, limit, offset } = request.query;
      
      // If authenticated, can see private agents
      const canSeePrivate = !!(request as any).apiKey || !!(request as any).user;
      
      const agents = await agentService.listAgents({
        includePrivate: includePrivate && canSeePrivate,
        limit: limit ? parseInt(String(limit)) : undefined,
        offset: offset ? parseInt(String(offset)) : undefined,
      });
      
      return reply.send({
        agents,
        total: agents.length,
      });
    }
  );

  // ===========================================================================
  // Create Agent
  // ===========================================================================
  /**
   * POST /api/v1/agents
   * Create a new agent
   * 
   * Body:
   * - name (required): Display name
   * - description: Optional description
   * - model: LLM model (default: llama3.2)
   * - provider: LLM provider (default: ollama)
   * - system_prompt (required): Agent instructions
   * - tools (required): Array of ForgeHook IDs
   * - config: Execution settings override
   * - is_public: Whether publicly accessible (default: false)
   */
  fastify.post<{ Body: CreateAgentRequest }>(
    '/api/v1/agents',
    async (request: FastifyRequest<{ Body: CreateAgentRequest }>, reply: FastifyReply) => {
      const body = request.body;
      
      // Validation
      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Agent name is required',
          },
        });
      }
      
      if (!body.system_prompt || typeof body.system_prompt !== 'string' || body.system_prompt.trim().length === 0) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'System prompt is required',
          },
        });
      }
      
      if (!body.tools || !Array.isArray(body.tools) || body.tools.length === 0) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'At least one tool (ForgeHook) is required',
          },
        });
      }

      try {
        const createdBy = (request as any).apiKey?.id || (request as any).user?.id;
        const agent = await agentService.createAgent(body, createdBy);
        
        return reply.status(201).send({
          agent,
        });
      } catch (error) {
        const err = error as Error;
        
        // Check for duplicate name
        if (err.message.includes('duplicate') || err.message.includes('unique')) {
          return reply.status(409).send({
            error: {
              code: 'CONFLICT',
              message: 'An agent with this name already exists',
            },
          });
        }
        
        logger.error({ error: err }, 'Failed to create agent');
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to create agent',
          },
        });
      }
    }
  );

  // ===========================================================================
  // Get Single Agent
  // ===========================================================================
  /**
   * GET /api/v1/agents/:id
   * Get a single agent by ID or slug
   */
  fastify.get<{ Params: AgentParams }>(
    '/api/v1/agents/:id',
    async (request: FastifyRequest<{ Params: AgentParams }>, reply: FastifyReply) => {
      const { id } = request.params;
      
      const agent = await agentService.getAgent(id);
      
      if (!agent) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Agent not found',
          },
        });
      }
      
      // Check access for private agents
      if (!agent.is_public) {
        const canAccess = !!(request as any).apiKey || !!(request as any).user;
        if (!canAccess) {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: 'Agent not found',
            },
          });
        }
      }
      
      return reply.send({
        agent,
      });
    }
  );

  // ===========================================================================
  // Update Agent
  // ===========================================================================
  /**
   * PUT /api/v1/agents/:id
   * Update an agent
   */
  fastify.put<{ Params: AgentParams; Body: UpdateAgentRequest }>(
    '/api/v1/agents/:id',
    async (request: FastifyRequest<{ Params: AgentParams; Body: UpdateAgentRequest }>, reply: FastifyReply) => {
      const { id } = request.params;
      const body = request.body;
      
      // Validate name if provided
      if (body.name !== undefined) {
        if (typeof body.name !== 'string' || body.name.trim().length === 0) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Agent name cannot be empty',
            },
          });
        }
      }
      
      // Validate tools if provided
      if (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.length === 0)) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'At least one tool is required',
          },
        });
      }

      try {
        const agent = await agentService.updateAgent(id, body);
        
        if (!agent) {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: 'Agent not found',
            },
          });
        }
        
        return reply.send({
          agent,
        });
      } catch (error) {
        const err = error as Error;
        logger.error({ error: err, agentId: id }, 'Failed to update agent');
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to update agent',
          },
        });
      }
    }
  );

  // ===========================================================================
  // Delete Agent
  // ===========================================================================
  /**
   * DELETE /api/v1/agents/:id
   * Delete an agent (soft delete)
   */
  fastify.delete<{ Params: AgentParams }>(
    '/api/v1/agents/:id',
    async (request: FastifyRequest<{ Params: AgentParams }>, reply: FastifyReply) => {
      const { id } = request.params;
      
      const deleted = await agentService.deleteAgent(id);
      
      if (!deleted) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Agent not found',
          },
        });
      }
      
      return reply.status(204).send();
    }
  );

  // ===========================================================================
  // Run Agent
  // ===========================================================================
  /**
   * POST /api/v1/agents/:id/run
   * Execute an agent with natural language input
   * 
   * Body:
   * - input (required): Natural language instruction
   * - data: Optional structured input data
   * - config_override: Override agent config for this run
   */
  fastify.post<{ Params: AgentParams; Body: RunAgentRequest }>(
    '/api/v1/agents/:id/run',
    async (request: FastifyRequest<{ Params: AgentParams; Body: RunAgentRequest }>, reply: FastifyReply) => {
      const { id } = request.params;
      const body = request.body;
      
      // Validation
      if (!body.input || typeof body.input !== 'string' || body.input.trim().length === 0) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Input is required',
          },
        });
      }

      try {
        const context = {
          apiKeyId: (request as any).apiKey?.id,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        };

        const result = await agentService.runAgent(id, body, context);
        
        // If failed, return error status but still include the result
        const statusCode = result.status === 'failed' ? 500 : 200;
        
        return reply.status(statusCode).send({
          ...result,
        });
      } catch (error) {
        const err = error as Error;
        
        if (err.message.includes('not found')) {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: 'Agent not found',
            },
          });
        }
        
        logger.error({ error: err, agentId: id }, 'Agent run failed');
        return reply.status(500).send({
          error: {
            code: 'EXECUTION_ERROR',
            message: err.message,
          },
        });
      }
    }
  );

  // ===========================================================================
  // Get Run History for Agent
  // ===========================================================================
  /**
   * GET /api/v1/agents/:id/runs
   * Get execution history for an agent
   * 
   * Query params:
   * - limit: Max results (default: 50)
   * - offset: Pagination offset (default: 0)
   */
  fastify.get<{ Params: AgentParams; Querystring: ListRunsQuery }>(
    '/api/v1/agents/:id/runs',
    async (request: FastifyRequest<{ Params: AgentParams; Querystring: ListRunsQuery }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { limit, offset } = request.query;
      
      // Check agent exists
      const agent = await agentService.getAgent(id);
      if (!agent) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Agent not found',
          },
        });
      }
      
      const runs = await agentService.getRunsByAgentId(
        agent.id,
        limit ? parseInt(String(limit)) : undefined,
        offset ? parseInt(String(offset)) : undefined
      );
      
      return reply.send({
        runs,
        total: runs.length,
      });
    }
  );

  // ===========================================================================
  // Get Single Run
  // ===========================================================================
  /**
   * GET /api/v1/runs/:runId
   * Get a single run by ID
   */
  fastify.get<{ Params: RunParams }>(
    '/api/v1/runs/:runId',
    async (request: FastifyRequest<{ Params: RunParams }>, reply: FastifyReply) => {
      const { runId } = request.params;
      
      const run = await agentService.getRunById(runId);
      
      if (!run) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Run not found',
          },
        });
      }
      
      return reply.send({
        run,
      });
    }
  );

  // ===========================================================================
  // Get Recent Runs (All Agents)
  // ===========================================================================
  /**
   * GET /api/v1/runs
   * Get recent runs across all agents
   */
  fastify.get<{ Querystring: ListRunsQuery }>(
    '/api/v1/runs',
    async (request: FastifyRequest<{ Querystring: ListRunsQuery }>, reply: FastifyReply) => {
      const { limit } = request.query;
      
      const runs = await agentService.getRecentRuns(
        limit ? parseInt(String(limit)) : undefined
      );
      
      return reply.send({
        runs,
        total: runs.length,
      });
    }
  );

  // ===========================================================================
  // Get Agent Templates
  // ===========================================================================
  /**
   * GET /api/v1/agents/templates
   * Get available agent templates
   */
  fastify.get(
    '/api/v1/agents/templates',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        templates: AGENT_TEMPLATES,
      });
    }
  );

  // ===========================================================================
  // Create Sample Agents
  // ===========================================================================
  /**
   * POST /api/v1/agents/samples
   * Create sample agents from templates
   */
  fastify.post(
    '/api/v1/agents/samples',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const created = await agentService.createSampleAgents();
        
        return reply.status(201).send({
          message: `Created ${created.length} sample agents`,
          agents: created,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to create sample agents');
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to create sample agents',
          },
        });
      }
    }
  );

  // ===========================================================================
  // LLM Provider Endpoints
  // ===========================================================================

  /**
   * GET /api/v1/llm/providers
   * List available LLM providers and their status
   */
  fastify.get(
    '/api/v1/llm/providers',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const providers: LLMProvider[] = ['ollama', 'lmstudio', 'anthropic', 'openai'];
      const results = [];
      
      for (const provider of providers) {
        const check = await llmService.checkProvider(provider);
        results.push({
          provider,
          available: check.available,
          models: check.models,
          error: check.error,
        });
      }
      
      return reply.send({
        providers: results,
      });
    }
  );

  /**
   * GET /api/v1/llm/models/:provider
   * List available models for a provider
   */
  fastify.get<{ Params: ProviderParams }>(
    '/api/v1/llm/models/:provider',
    async (request: FastifyRequest<{ Params: ProviderParams }>, reply: FastifyReply) => {
      const { provider } = request.params;
      
      const check = await llmService.checkProvider(provider);
      
      if (!check.available) {
        return reply.status(503).send({
          error: {
            code: 'PROVIDER_UNAVAILABLE',
            message: check.error || `Provider ${provider} is not available`,
          },
        });
      }
      
      return reply.send({
        provider,
        models: check.models || [],
      });
    }
  );
}
