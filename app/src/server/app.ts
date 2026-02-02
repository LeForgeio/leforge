import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import cookie from '@fastify/cookie';
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
import { nintexRoutes } from './routes/nintex.js';
import { apiKeysRoutes } from './routes/api-keys.js';
import { integrationsRoutes } from './routes/integrations.js';
import { sslRoutes } from './routes/ssl.js';
import { mcpRoutes } from './routes/mcp.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import utilsRoutes from './routes/utils.js';
import { agentRoutes } from './routes/agents.js';
import { dockerService } from './services/docker.service.js';
import { marketplaceService } from './services/marketplace.service.js';
import { embeddedPluginService } from './services/embedded-plugin.service.js';
import { corePluginService } from './services/core-plugin.service.js';
import { authService } from './services/auth.service.js';
import { requireSession } from './middleware/auth.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // Allow empty bodies for POST requests without JSON content
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      const json = body && (body as string).length > 0 ? JSON.parse(body as string) : {};
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Register plugins
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(cookie, {
    secret: config.auth.jwtSecret, // For signed cookies if needed
    hook: 'onRequest',
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
      // Don't automatically serve index.html - we handle it with auth check
      index: false,
    });

    // Helper to check if a route is a protected SPA route
    const isProtectedSpaRoute = (url: string): boolean => {
      // Public SPA routes
      const publicSpaRoutes = ['/login'];
      if (publicSpaRoutes.some(route => url === route || url.startsWith(route + '?') || url.startsWith(route + '/'))) {
        return false;
      }
      // API and WebSocket routes are handled separately
      if (url.startsWith('/api/') || url.startsWith('/ws/')) {
        return false;
      }
      // Static assets are public
      if (url.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map)(\?.*)?$/)) {
        return false;
      }
      // Everything else is protected SPA route
      return true;
    };

    // Helper to check session and redirect if needed
    const checkSessionAndServe = async (request: FastifyRequest, reply: FastifyReply): Promise<boolean> => {
      if (!authService.isAuthEnabled()) {
        return false; // Auth disabled, allow access
      }

      if (!isProtectedSpaRoute(request.url)) {
        return false; // Public route, allow access
      }

      // Check session
      const token = request.cookies?.[config.auth.sessionCookieName] ||
        (request.headers.authorization?.startsWith('Bearer ') && 
         !request.headers.authorization.includes('fhk_') 
          ? request.headers.authorization.substring(7) 
          : null);

      if (!token) {
        reply.redirect('/login');
        return true; // Handled
      }

      const user = authService.getUserFromToken(token);
      if (!user) {
        reply.clearCookie(config.auth.sessionCookieName, { path: '/' });
        reply.redirect('/login');
        return true; // Handled
      }

      return false; // Authenticated, continue to serve
    };

    // Explicit handler for root path with auth check
    app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
      const handled = await checkSessionAndServe(request, reply);
      if (!handled) {
        return reply.sendFile('index.html');
      }
    });

    // Serve index.html for SPA routing (non-API routes)
    // With server-side auth check for protected routes
    app.setNotFoundHandler(async (request, reply) => {
      // API routes return 404
      if (request.url.startsWith('/api/') || request.url.startsWith('/ws/')) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Endpoint not found',
          },
        });
      }

      // Check auth for protected SPA routes
      const handled = await checkSessionAndServe(request, reply);
      if (!handled) {
        return reply.sendFile('index.html');
      }
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

  // Session authentication for protected API routes
  app.addHook('onRequest', async (request, reply) => {
    // Only check API routes (not static files, websockets)
    if (!request.url.startsWith('/api/')) {
      return;
    }

    // Invoke endpoints use API key auth, not session auth
    if (request.url.startsWith('/api/v1/invoke') || request.url.startsWith('/api/v1/nintex')) {
      return;
    }

    // LLM provider status checks should be public (for UI to show availability)
    if (request.url.startsWith('/api/v1/llm/models/') || request.url.startsWith('/api/v1/llm/providers')) {
      return;
    }

    await requireSession(request, reply);
  });

  // Log auth status on startup
  if (authService.isAuthEnabled()) {
    logger.info({ 
      user: config.auth.adminUser, 
      mode: config.auth.authMode 
    }, 'Authentication enabled');
  } else {
    logger.warn('Authentication is DISABLED - set LEFORGE_ADMIN_PASSWORD to enable');
  }

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
  await app.register(authRoutes);  // Auth routes (login, logout, etc.)
  await app.register(adminRoutes); // Admin routes (user management, settings)
  await app.register(pluginRoutes);
  await app.register(registryRoutes);
  await app.register(marketplaceRoutes);
  await app.register(packageRoutes);
  await app.register(changelogRoutes);
  await app.register(pluginInvokeRoutes, { prefix: '/api/v1' });
  await app.register(apiKeysRoutes);
  await app.register(integrationsRoutes);
  await app.register(nintexRoutes);
  await app.register(sslRoutes);
  await app.register(mcpRoutes);
  await app.register(agentRoutes);  // Agent runtime (create, run, list agents)
  await app.register(utilsRoutes, { prefix: '/api/v1/utils' });

  // Initialize marketplace service
  await marketplaceService.initialize();

  // Initialize core plugins (built-in plugins that are always available)
  await corePluginService.initialize();

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
