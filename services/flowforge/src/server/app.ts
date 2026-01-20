import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import path from 'path';
import fs from 'fs';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { healthRoutes } from './routes/health.js';
import { pluginRoutes } from './routes/plugins.js';
import { registryRoutes } from './routes/registry.js';
import { marketplaceRoutes } from './routes/marketplace.js';
import { packageRoutes } from './routes/packages.js';
import { changelogRoutes } from './routes/changelog.js';
import { pluginInvokeRoutes } from './routes/plugin-invoke.js';
import { dockerService } from './services/docker.service.js';
import { marketplaceService } from './services/marketplace.service.js';
import { embeddedPluginService } from './services/embedded-plugin.service.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // Register plugins
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(websocket);

  // Enable multipart for file uploads (.fhk packages)
  await app.register(multipart, {
    limits: {
      fileSize: 2 * 1024 * 1024 * 1024, // 2GB max for Docker images
    },
  });

  // Serve static frontend files in production
  const staticPath = path.resolve(config.staticPath);
  if (fs.existsSync(staticPath)) {
    logger.info({ staticPath }, 'Serving static files from');

    await app.register(fastifyStatic, {
      root: staticPath,
      prefix: '/',
      wildcard: false,
    });

    // Serve index.html for SPA routing (non-API routes)
    app.setNotFoundHandler((request, reply) => {
      // API routes return 404
      if (request.url.startsWith('/api/') || request.url.startsWith('/ws/')) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Endpoint not found',
          },
        });
      }

      // SPA routes serve index.html
      return reply.sendFile('index.html');
    });
  } else {
    logger.warn({ staticPath }, 'Static files directory not found - frontend not available');
  }

  // Request logging
  app.addHook('onRequest', async (request) => {
    // Skip logging for static files
    if (!request.url.startsWith('/api/') && !request.url.startsWith('/ws/') && !request.url.startsWith('/health')) {
      return;
    }
    logger.info({
      requestId: request.id,
      method: request.method,
      url: request.url,
    }, 'Request started');
  });

  app.addHook('onResponse', async (request, reply) => {
    if (!request.url.startsWith('/api/') && !request.url.startsWith('/ws/') && !request.url.startsWith('/health')) {
      return;
    }
    logger.info({
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration: reply.elapsedTime,
    }, 'Request completed');
  });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & { statusCode?: number };
    logger.error({
      requestId: request.id,
      error: err.message,
      stack: err.stack,
    }, 'Request error');

    reply.status(err.statusCode || 500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: config.environment === 'production'
          ? 'Internal server error'
          : err.message,
        requestId: request.id,
      },
    });
  });

  // Register API routes
  await app.register(healthRoutes);
  await app.register(pluginRoutes);
  await app.register(registryRoutes);
  await app.register(marketplaceRoutes);
  await app.register(packageRoutes);
  await app.register(changelogRoutes);
  await app.register(pluginInvokeRoutes, { prefix: '/api/v1' });

  // Initialize marketplace service
  await marketplaceService.initialize();

  // Initialize embedded plugin service (load any installed embedded plugins)
  logger.info('Initializing embedded plugin service');

  // WebSocket for real-time events
  app.register(async function (fastify) {
    fastify.get('/ws/events', { websocket: true }, (socket) => {
      logger.info('WebSocket client connected');

      const handler = (event: unknown) => {
        // SocketStream wraps ws WebSocket - access via socket.socket
        if ('socket' in socket) {
          (socket as { socket: { send: (data: string) => void } }).socket.send(JSON.stringify(event));
        }
      };

      dockerService.on('plugin-event', handler);

      socket.on('close', () => {
        dockerService.off('plugin-event', handler);
        logger.info('WebSocket client disconnected');
      });
    });
  });

  return app;
}
