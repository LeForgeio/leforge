import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dockerService } from '../services/docker.service.js';
import { logger } from '../utils/logger.js';
import { ForgeHookEndpoint } from '../types/index.js';

// Request types
interface PluginParams {
  pluginId: string;
}

interface ActionParams extends PluginParams {
  actionId: string;
}

interface ExecuteBody {
  plugin: string;
  action: string;
  parameters?: Record<string, unknown>;
}

// Export/Parameter types for forgehook.json
interface ForgeHookExport {
  name: string;
  id?: string;
  description?: string;
  path?: string;
  parameters?: ForgeHookParameter[];
}

interface ForgeHookParameter {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
}

/**
 * Nintex Integration Routes
 * 
 * These endpoints support Nintex Workflow Cloud's x-ntx-dynamic-values 
 * and x-ntx-dynamic-schema specifications for dynamic dropdown and form generation.
 */
export async function nintexRoutes(fastify: FastifyInstance) {
  
  // ============================================================================
  // List Plugins for Dynamic Dropdown
  // ============================================================================
  /**
   * Returns plugins formatted for x-ntx-dynamic-values
   * Format: { plugins: [{ value: "id", name: "Display Name" }] }
   */
  fastify.get('/api/v1/nintex/plugins', async (_request: FastifyRequest, reply: FastifyReply) => {
    const plugins = dockerService.listPlugins();
    
    // Filter to only running plugins and format for Nintex
    const nintexPlugins = plugins
      .filter(p => p.status === 'running')
      .map(p => ({
        value: p.forgehookId,
        name: p.manifest.name,
      }));
    
    return reply.send({
      plugins: nintexPlugins,
    });
  });

  // ============================================================================
  // List Plugin Actions for Dynamic Dropdown
  // ============================================================================
  /**
   * Returns available actions/exports for a plugin
   * Format: { actions: [{ value: "actionId", name: "Action Name" }] }
   */
  fastify.get<{ Params: PluginParams }>(
    '/api/v1/nintex/plugins/:pluginId/actions',
    async (request: FastifyRequest<{ Params: PluginParams }>, reply: FastifyReply) => {
      const { pluginId } = request.params;
      const plugin = dockerService.getPluginByForgehookId(pluginId);
      
      if (!plugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }
      
      // Build actions from manifest exports and endpoints
      const actions: Array<{ value: string; name: string; description?: string }> = [];
      
      // Check for exports in manifest (cast to any for flexible manifest access)
      const manifest = plugin.manifest as unknown as Record<string, unknown>;
      if (manifest.exports && Array.isArray(manifest.exports)) {
        for (const exp of manifest.exports as ForgeHookExport[]) {
          actions.push({
            value: exp.name || exp.id || '',
            name: exp.name || exp.id || '',
            description: exp.description,
          });
        }
      }
      
      // Add endpoints as actions (if no exports defined)
      if (actions.length === 0 && plugin.manifest.endpoints) {
        for (const endpoint of plugin.manifest.endpoints) {
          const actionId = endpoint.path.replace(/^\//, '').replace(/\//g, '_');
          actions.push({
            value: actionId,
            name: endpoint.description || actionId,
            description: endpoint.description,
          });
        }
      }
      
      return reply.send({
        actions,
      });
    }
  );

  // ============================================================================
  // Get Action Schema for Dynamic Form
  // ============================================================================
  /**
   * Returns JSON Schema for action parameters
   * Used by x-ntx-dynamic-schema for dynamic form generation
   */
  fastify.get<{ Params: ActionParams }>(
    '/api/v1/nintex/plugins/:pluginId/actions/:actionId/schema',
    async (request: FastifyRequest<{ Params: ActionParams }>, reply: FastifyReply) => {
      const { pluginId, actionId } = request.params;
      const plugin = dockerService.getPluginByForgehookId(pluginId);
      
      if (!plugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }
      
      // Find the export or endpoint
      let schema: Record<string, unknown> = {
        type: 'object',
        properties: {},
        required: [],
      };
      
      // Check exports for schema
      const manifest = plugin.manifest as unknown as Record<string, unknown>;
      if (manifest.exports && Array.isArray(manifest.exports)) {
        const exp = (manifest.exports as ForgeHookExport[]).find(
          (e: ForgeHookExport) => e.name === actionId || e.id === actionId
        );
        
        if (exp && exp.parameters) {
          const properties: Record<string, unknown> = {};
          const required: string[] = [];
          
          for (const param of exp.parameters) {
            properties[param.name] = {
              type: mapType(param.type),
              title: param.name,
              description: param.description,
              default: param.default,
            };
            
            if (param.required) {
              required.push(param.name);
            }
          }
          
          schema = {
            type: 'object',
            properties,
            required,
          };
        }
      }
      
      // Check endpoints for requestBody
      if (plugin.manifest.endpoints) {
        const endpoint = plugin.manifest.endpoints.find(
          (e: ForgeHookEndpoint) => e.path.replace(/^\//, '').replace(/\//g, '_') === actionId
        );
        
        if (endpoint && endpoint.requestBody) {
          // Convert requestBody example to schema
          const properties: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(endpoint.requestBody)) {
            properties[key] = {
              type: typeof value === 'object' ? (Array.isArray(value) ? 'array' : 'object') : typeof value,
              title: key,
              default: value,
            };
          }
          
          schema = {
            type: 'object',
            properties,
            required: Object.keys(endpoint.requestBody),
          };
        }
      }
      
      return reply.send({
        schema,
      });
    }
  );

  // ============================================================================
  // Execute Plugin Action
  // ============================================================================
  /**
   * Universal execution endpoint for any plugin action
   */
  fastify.post<{ Body: ExecuteBody }>(
    '/api/v1/nintex/execute',
    async (request: FastifyRequest<{ Body: ExecuteBody }>, reply: FastifyReply) => {
      const startTime = Date.now();
      const { plugin: pluginId, action: actionId, parameters = {} } = request.body;
      
      if (!pluginId || !actionId) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'plugin and action are required',
          },
        });
      }
      
      const plugin = dockerService.getPluginByForgehookId(pluginId);
      
      if (!plugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }
      
      if (plugin.status !== 'running') {
        return reply.status(503).send({
          error: {
            code: 'PLUGIN_NOT_RUNNING',
            message: `Plugin ${pluginId} is not running`,
          },
        });
      }
      
      try {
        // Determine the endpoint to call
        let endpoint = `/${actionId}`;
        let method = 'POST';
        
        // Check exports for path mapping
        const manifest = plugin.manifest as unknown as Record<string, unknown>;
        if (manifest.exports && Array.isArray(manifest.exports)) {
          const exp = (manifest.exports as ForgeHookExport[]).find(
            (e: ForgeHookExport) => e.name === actionId || e.id === actionId
          );
          if (exp && exp.path) {
            endpoint = exp.path;
          }
        }
        
        // Check endpoints for path
        if (plugin.manifest.endpoints) {
          const ep = plugin.manifest.endpoints.find(
            (e: ForgeHookEndpoint) => e.path.replace(/^\//, '').replace(/\//g, '_') === actionId
          );
          if (ep) {
            endpoint = ep.path;
            method = ep.method || 'POST';
          }
        }
        
        // Build full URL - use container name and internal port for Docker networking
        // Container name follows pattern: forgehook-{pluginId}
        const containerName = `forgehook-${pluginId}`;
        const internalPort = plugin.manifest.port || 3000;
        
        // Note: For container plugins, routes are typically at /api/v1/{route} directly
        // The basePath in manifest may be incorrect/unused, so we use /api/v1 as the base
        // and append the endpoint path directly
        const basePath = '/api/v1';
        const pluginUrl = `http://${containerName}:${internalPort}${basePath}${endpoint}`;
        
        logger.info({ pluginId, actionId, pluginUrl, method }, 'Executing plugin action via Nintex gateway');
        
        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
        };
        
        if (method !== 'GET') {
          fetchOptions.body = JSON.stringify(parameters);
        }
        
        const response = await fetch(pluginUrl, fetchOptions);
        
        const result = await response.json();
        const executionTime = Date.now() - startTime;
        
        if (!response.ok) {
          return reply.status(response.status).send({
            success: false,
            error: (result as Record<string, unknown>).error || (result as Record<string, unknown>).message || 'Execution failed',
            plugin: pluginId,
            action: actionId,
            executionTime,
          });
        }
        
        return reply.send({
          success: true,
          result,
          plugin: pluginId,
          action: actionId,
          executionTime,
        });
        
      } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error({ pluginId, actionId, error }, 'Plugin execution failed via Nintex gateway');
        
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Execution failed',
          plugin: pluginId,
          action: actionId,
          executionTime,
        });
      }
    }
  );
}

/**
 * Map forgehook types to JSON Schema types
 */
function mapType(forgehookType: string): string {
  const typeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    integer: 'integer',
    boolean: 'boolean',
    object: 'object',
    array: 'array',
    any: 'object',
  };
  
  return typeMap[forgehookType?.toLowerCase()] || 'string';
}
