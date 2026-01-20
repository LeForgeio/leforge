import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger.js';
import { databaseService } from '../services/database.service.js';
import { embeddedPluginService } from '../services/embedded-plugin.service.js';

/**
 * Plugin Invocation Router
 * Routes plugin API calls to either:
 * - Docker containers (via HTTP proxy)
 * - Embedded plugins (via in-process execution)
 */
export async function pluginInvokeRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Invoke a plugin function
   * POST /api/v1/plugins/:pluginId/invoke/:functionName
   * 
   * For container plugins: proxies to the container's HTTP endpoint
   * For embedded plugins: executes the function in-process
   */
  fastify.post<{
    Params: { pluginId: string; functionName: string };
    Body: unknown;
  }>('/plugins/:pluginId/invoke/:functionName', async (request, reply) => {
    const { pluginId, functionName } = request.params;
    const input = request.body;

    try {
      // Get plugin from database
      const plugin = await databaseService.getPluginByForgehookId(pluginId);
      
      if (!plugin) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `Plugin ${pluginId} not found` },
        });
      }

      if (plugin.status !== 'running') {
        return reply.status(400).send({
          error: { code: 'PLUGIN_NOT_RUNNING', message: `Plugin ${pluginId} is not running (status: ${plugin.status})` },
        });
      }

      // Route based on runtime type
      if (plugin.runtime === 'embedded') {
        return await handleEmbeddedInvocation(pluginId, functionName, input, reply);
      } else {
        return await handleContainerInvocation(plugin, functionName, input, reply);
      }

    } catch (error) {
      logger.error({ error, pluginId, functionName }, 'Plugin invocation failed');
      return reply.status(500).send({
        error: { code: 'INVOCATION_ERROR', message: 'Failed to invoke plugin function' },
      });
    }
  });

  /**
   * List available functions for a plugin
   * GET /api/v1/plugins/:pluginId/functions
   */
  fastify.get<{
    Params: { pluginId: string };
  }>('/plugins/:pluginId/functions', async (request, reply) => {
    const { pluginId } = request.params;

    try {
      const plugin = await databaseService.getPluginByForgehookId(pluginId);
      
      if (!plugin) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `Plugin ${pluginId} not found` },
        });
      }

      if (plugin.runtime === 'embedded') {
        // Get functions from embedded service
        const functions = embeddedPluginService.getFunctions(pluginId);
        return reply.send({
          pluginId,
          runtime: 'embedded',
          functions: functions.map(name => ({
            name,
            endpoint: `/api/v1/plugins/${pluginId}/invoke/${name}`,
          })),
        });
      } else {
        // Get endpoints from manifest
        const endpoints = plugin.manifest.endpoints || [];
        return reply.send({
          pluginId,
          runtime: 'container',
          port: plugin.hostPort,
          basePath: plugin.manifest.basePath || '',
          endpoints: endpoints.map(ep => ({
            method: ep.method,
            path: ep.path,
            description: ep.description,
            fullUrl: `http://localhost:${plugin.hostPort}${plugin.manifest.basePath || ''}${ep.path}`,
          })),
        });
      }

    } catch (error) {
      logger.error({ error, pluginId }, 'Failed to list plugin functions');
      return reply.status(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to list plugin functions' },
      });
    }
  });

  /**
   * Proxy all requests to container plugins
   * ALL /api/v1/plugins/:pluginId/proxy/*
   */
  fastify.all<{
    Params: { pluginId: string; '*': string };
    Body: unknown;
  }>('/plugins/:pluginId/proxy/*', async (request, reply) => {
    const { pluginId } = request.params;
    const path = request.params['*'] || '';
    
    try {
      const plugin = await databaseService.getPluginByForgehookId(pluginId);
      
      if (!plugin) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `Plugin ${pluginId} not found` },
        });
      }

      if (plugin.runtime === 'embedded') {
        return reply.status(400).send({
          error: { 
            code: 'INVALID_OPERATION', 
            message: 'Embedded plugins do not support proxy. Use /invoke/:functionName instead.' 
          },
        });
      }

      if (plugin.status !== 'running') {
        return reply.status(400).send({
          error: { code: 'PLUGIN_NOT_RUNNING', message: `Plugin ${pluginId} is not running` },
        });
      }

      // Proxy to container
      const targetUrl = `http://localhost:${plugin.hostPort}${plugin.manifest.basePath || ''}/${path}`;
      
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: {
          'Content-Type': request.headers['content-type'] || 'application/json',
          'X-Request-ID': request.id,
          'X-Forwarded-For': request.ip,
        },
        body: request.method !== 'GET' && request.method !== 'HEAD' 
          ? JSON.stringify(request.body) 
          : undefined,
      });

      const data = await response.json();
      return reply.status(response.status).send(data);

    } catch (error) {
      logger.error({ error, pluginId, path }, 'Proxy request failed');
      return reply.status(502).send({
        error: { code: 'PROXY_ERROR', message: 'Failed to proxy request to plugin' },
      });
    }
  });
}

/**
 * Handle invocation for embedded plugins
 */
async function handleEmbeddedInvocation(
  pluginId: string,
  functionName: string,
  input: unknown,
  reply: FastifyReply
): Promise<FastifyReply> {
  const result = await embeddedPluginService.invoke(pluginId, functionName, input);

  if (!result.success) {
    return reply.status(400).send({
      error: {
        code: 'EXECUTION_ERROR',
        message: result.error,
        executionTime: result.executionTime,
      },
    });
  }

  return reply.send({
    success: true,
    result: result.result,
    executionTime: result.executionTime,
    runtime: 'embedded',
  });
}

/**
 * Handle invocation for container plugins
 */
async function handleContainerInvocation(
  plugin: any,
  functionName: string,
  input: unknown,
  reply: FastifyReply
): Promise<FastifyReply> {
  // Find matching endpoint in manifest
  const endpoint = plugin.manifest.endpoints?.find(
    (ep: any) => ep.path === `/${functionName}` || ep.path === functionName
  );

  if (!endpoint) {
    return reply.status(404).send({
      error: {
        code: 'FUNCTION_NOT_FOUND',
        message: `Function ${functionName} not found in plugin ${plugin.forgehookId}`,
        availableEndpoints: plugin.manifest.endpoints?.map((ep: any) => ep.path),
      },
    });
  }

  // Call the container endpoint
  const targetUrl = `http://localhost:${plugin.hostPort}${plugin.manifest.basePath || ''}${endpoint.path}`;
  
  try {
    const response = await fetch(targetUrl, {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: endpoint.method !== 'GET' ? JSON.stringify(input) : undefined,
    });

    const startTime = Date.now();
    const data = await response.json() as Record<string, unknown>;
    const executionTime = Date.now() - startTime;

    if (!response.ok) {
      return reply.status(response.status).send({
        error: {
          code: 'CONTAINER_ERROR',
          message: (data.error as string) || (data.message as string) || 'Container returned an error',
          executionTime,
        },
      });
    }

    return reply.send({
      success: true,
      result: data,
      executionTime,
      runtime: 'container',
    });

  } catch (error) {
    logger.error({ error, pluginId: plugin.forgehookId, functionName, targetUrl }, 'Container invocation failed');
    return reply.status(502).send({
      error: {
        code: 'CONTAINER_UNAVAILABLE',
        message: 'Failed to reach plugin container',
      },
    });
  }
}

export default pluginInvokeRoutes;
