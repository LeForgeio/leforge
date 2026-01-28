/**
 * MCP (Model Context Protocol) Routes
 * 
 * Exposes the MCP server via HTTP and Server-Sent Events (SSE) transport.
 * 
 * Endpoints:
 *   GET  /mcp              - Server info
 *   POST /mcp              - JSON-RPC endpoint
 *   GET  /mcp/sse          - SSE transport for streaming
 *   WS   /mcp/ws           - WebSocket transport
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { mcpService, MCPRequest, MCPResponse } from '../services/mcp.service.js';
import { logger } from '../utils/logger.js';

export async function mcpRoutes(fastify: FastifyInstance) {
  /**
   * GET /mcp - Server discovery endpoint
   * Returns MCP server capabilities for client initialization
   */
  fastify.get('/mcp', async (_request: FastifyRequest, reply: FastifyReply) => {
    const serverInfo = mcpService.getServerInfo();
    return reply.send({
      name: serverInfo.name,
      version: serverInfo.version,
      protocolVersion: serverInfo.protocolVersion,
      capabilities: serverInfo.capabilities,
      transports: ['http', 'sse', 'websocket'],
      endpoints: {
        http: '/mcp',
        sse: '/mcp/sse',
        websocket: '/mcp/ws',
      },
    });
  });

  /**
   * POST /mcp - JSON-RPC endpoint
   * Main entry point for MCP requests
   */
  fastify.post('/mcp', async (request: FastifyRequest<{ Body: MCPRequest | MCPRequest[] }>, reply: FastifyReply) => {
    const body = request.body;

    // Handle batch requests
    if (Array.isArray(body)) {
      const responses: MCPResponse[] = [];
      for (const req of body) {
        const response = await mcpService.handleRequest(req);
        responses.push(response);
      }
      return reply.send(responses);
    }

    // Handle single request
    const response = await mcpService.handleRequest(body);
    return reply.send(response);
  });

  /**
   * GET /mcp/sse - Server-Sent Events transport
   * For long-running connections with streaming responses
   */
  fastify.get('/mcp/sse', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial connection event
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', server: mcpService.getServerInfo() })}\n\n`);

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      reply.raw.write(`: heartbeat\n\n`);
    }, 30000);

    // Handle client disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      logger.info('MCP SSE client disconnected');
    });

    logger.info('MCP SSE client connected');
  });

  /**
   * POST /mcp/sse - Send message via SSE connection
   * Client posts requests, receives responses via SSE
   */
  fastify.post('/mcp/sse', async (request: FastifyRequest<{ Body: MCPRequest }>, reply: FastifyReply) => {
    const response = await mcpService.handleRequest(request.body);
    
    // Note: In a full implementation, this would push to the SSE connection
    // For now, just return the response
    return reply.send(response);
  });

  /**
   * WebSocket transport for MCP
   */
  fastify.register(async function (wsApp) {
    wsApp.get('/mcp/ws', { websocket: true }, (socket) => {
      logger.info('MCP WebSocket client connected');

      // Send server info on connect
      const serverInfo = mcpService.getServerInfo();
      if ('socket' in socket) {
        const ws = socket as { socket: { send: (data: string) => void; on: (event: string, handler: (data: unknown) => void) => void } };
        
        ws.socket.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'server/info',
          params: serverInfo,
        }));

        // Handle incoming messages
        ws.socket.on('message', async (data: unknown) => {
          try {
            const message = JSON.parse(data as string) as MCPRequest;
            const response = await mcpService.handleRequest(message);
            ws.socket.send(JSON.stringify(response));
          } catch (error) {
            const err = error as Error;
            logger.error({ error: err }, 'MCP WebSocket message error');
            ws.socket.send(JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: {
                code: -32700,
                message: 'Parse error',
              },
            }));
          }
        });
      }

      socket.on('close', () => {
        logger.info('MCP WebSocket client disconnected');
      });
    });
  });

  /**
   * GET /api/v1/mcp/tools - List available tools (REST API)
   */
  fastify.get('/api/v1/mcp/tools', async (_request: FastifyRequest, reply: FastifyReply) => {
    const response = await mcpService.handleRequest({
      jsonrpc: '2.0',
      id: 'list-tools',
      method: 'tools/list',
    });
    
    if ('result' in response && response.result) {
      return reply.send(response.result);
    }
    return reply.status(500).send(response.error);
  });

  /**
   * POST /api/v1/mcp/tools/:toolName - Call a specific tool (REST API)
   */
  fastify.post('/api/v1/mcp/tools/:toolName', async (
    request: FastifyRequest<{ Params: { toolName: string }; Body: Record<string, unknown> }>,
    reply: FastifyReply
  ) => {
    const { toolName } = request.params;
    const args = request.body;

    const response = await mcpService.handleRequest({
      jsonrpc: '2.0',
      id: `call-${toolName}`,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    });

    if ('result' in response && response.result) {
      return reply.send(response.result);
    }
    return reply.status(500).send(response.error);
  });

  /**
   * GET /api/v1/mcp/resources - List available resources (REST API)
   */
  fastify.get('/api/v1/mcp/resources', async (_request: FastifyRequest, reply: FastifyReply) => {
    const response = await mcpService.handleRequest({
      jsonrpc: '2.0',
      id: 'list-resources',
      method: 'resources/list',
    });

    if ('result' in response && response.result) {
      return reply.send(response.result);
    }
    return reply.status(500).send(response.error);
  });

  /**
   * GET /api/v1/mcp/resources/:uri - Read a specific resource (REST API)
   */
  fastify.get('/api/v1/mcp/resources/*', async (
    request: FastifyRequest<{ Params: { '*': string } }>,
    reply: FastifyReply
  ) => {
    const uri = `leforge://${request.params['*']}`;

    const response = await mcpService.handleRequest({
      jsonrpc: '2.0',
      id: 'read-resource',
      method: 'resources/read',
      params: { uri },
    });

    if ('result' in response && response.result) {
      return reply.send(response.result);
    }
    return reply.status(404).send(response.error);
  });

  /**
   * GET /api/v1/mcp/prompts - List available prompts (REST API)
   */
  fastify.get('/api/v1/mcp/prompts', async (_request: FastifyRequest, reply: FastifyReply) => {
    const response = await mcpService.handleRequest({
      jsonrpc: '2.0',
      id: 'list-prompts',
      method: 'prompts/list',
    });

    if ('result' in response && response.result) {
      return reply.send(response.result);
    }
    return reply.status(500).send(response.error);
  });

  /**
   * POST /api/v1/mcp/prompts/:promptName - Get a specific prompt (REST API)
   */
  fastify.post('/api/v1/mcp/prompts/:promptName', async (
    request: FastifyRequest<{ Params: { promptName: string }; Body: Record<string, string> }>,
    reply: FastifyReply
  ) => {
    const { promptName } = request.params;
    const args = request.body;

    const response = await mcpService.handleRequest({
      jsonrpc: '2.0',
      id: `get-prompt-${promptName}`,
      method: 'prompts/get',
      params: {
        name: promptName,
        arguments: args,
      },
    });

    if ('result' in response && response.result) {
      return reply.send(response.result);
    }
    return reply.status(404).send(response.error);
  });
}
