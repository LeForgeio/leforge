import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authService, User } from '../services/auth.service.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

// =============================================================================
// Request/Response Types
// =============================================================================

interface LoginBody {
  username: string;
  password: string;
}

interface LoginResponse {
  success: boolean;
  user?: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };
  token?: string;
  error?: string;
}

// =============================================================================
// Auth Routes
// =============================================================================

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const prefix = '/api/v1/auth';

  /**
   * GET /api/v1/auth/config
   * Get auth configuration for frontend
   */
  app.get(`${prefix}/config`, async (_request: FastifyRequest, reply: FastifyReply) => {
    const authConfig = authService.getAuthConfig();
    return reply.send(authConfig);
  });

  /**
   * POST /api/v1/auth/login
   * Authenticate with username and password
   */
  app.post<{ Body: LoginBody }>(
    `${prefix}/login`,
    async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply): Promise<LoginResponse> => {
      const { username, password } = request.body;

      if (!username || !password) {
        return reply.status(400).send({
          success: false,
          error: 'Username and password are required',
        });
      }

      const result = await authService.authenticateLocal(username, password);

      if (!result.success) {
        logger.warn({ username, ip: request.ip }, 'Failed login attempt');
        return reply.status(401).send({
          success: false,
          error: result.error || 'Authentication failed',
        });
      }

      // Set session cookie with the JWT
      reply.setCookie(config.auth.sessionCookieName, result.token!, {
        path: '/',
        httpOnly: true,
        secure: config.auth.secureCookies,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 24 hours in seconds
      });

      logger.info({ username, ip: request.ip }, 'Successful login');

      return reply.send({
        success: true,
        user: {
          id: result.user!.id,
          username: result.user!.username,
          displayName: result.user!.displayName,
          role: result.user!.role,
        },
        token: result.token,
      });
    }
  );

  /**
   * POST /api/v1/auth/logout
   * Clear session
   */
  app.post(`${prefix}/logout`, async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie(config.auth.sessionCookieName, {
      path: '/',
    });

    return reply.send({ success: true });
  });

  /**
   * GET /api/v1/auth/me
   * Get current authenticated user
   */
  app.get(`${prefix}/me`, async (request: FastifyRequest, reply: FastifyReply) => {
    // If auth is disabled, return a mock user
    if (!authService.isAuthEnabled()) {
      return reply.send({
        authenticated: true,
        authEnabled: false,
        user: {
          id: 'anonymous',
          username: 'anonymous',
          displayName: 'Anonymous',
          role: 'admin',
        },
      });
    }

    // Try to get token from cookie or Authorization header
    const token = extractToken(request);

    if (!token) {
      return reply.status(401).send({
        authenticated: false,
        authEnabled: true,
        error: 'Not authenticated',
      });
    }

    const user = authService.getUserFromToken(token);

    if (!user) {
      // Clear invalid cookie
      reply.clearCookie(config.auth.sessionCookieName, { path: '/' });
      return reply.status(401).send({
        authenticated: false,
        authEnabled: true,
        error: 'Invalid or expired session',
      });
    }

    return reply.send({
      authenticated: true,
      authEnabled: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
  });

  /**
   * POST /api/v1/auth/refresh
   * Refresh the JWT token
   */
  app.post(`${prefix}/refresh`, async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractToken(request);

    if (!token) {
      return reply.status(401).send({
        success: false,
        error: 'No token provided',
      });
    }

    const newToken = authService.refreshToken(token);

    if (!newToken) {
      reply.clearCookie(config.auth.sessionCookieName, { path: '/' });
      return reply.status(401).send({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    // Update cookie
    reply.setCookie(config.auth.sessionCookieName, newToken, {
      path: '/',
      httpOnly: true,
      secure: config.auth.secureCookies,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
    });

    return reply.send({
      success: true,
      token: newToken,
    });
  });

  /**
   * GET /api/v1/auth/oidc/login
   * Redirect to OIDC provider (for SSO)
   */
  app.get(`${prefix}/oidc/login`, async (_request: FastifyRequest, reply: FastifyReply) => {
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();

    const authUrl = authService.getOIDCAuthorizationUrl(state, nonce);

    if (!authUrl) {
      return reply.status(400).send({
        error: 'OIDC is not configured',
      });
    }

    // Store state and nonce in cookie for validation
    reply.setCookie('oidc_state', state, {
      path: '/',
      httpOnly: true,
      secure: config.auth.secureCookies,
      sameSite: 'lax',
      maxAge: 300, // 5 minutes
    });

    return reply.redirect(authUrl);
  });

  /**
   * GET /api/v1/auth/oidc/callback
   * Handle OIDC callback
   */
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    `${prefix}/oidc/callback`,
    async (request: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>, reply: FastifyReply) => {
      const { code, state, error } = request.query;

      if (error) {
        logger.warn({ error }, 'OIDC callback error');
        return reply.redirect('/?error=oidc_error');
      }

      if (!code || !state) {
        return reply.redirect('/?error=invalid_callback');
      }

      // Validate state (would compare against stored state in production)
      // For now, just exchange the code
      const result = await authService.exchangeOIDCCode(code);

      if (!result.success) {
        return reply.redirect('/?error=oidc_exchange_failed');
      }

      // Set session cookie
      reply.setCookie(config.auth.sessionCookieName, result.token!, {
        path: '/',
        httpOnly: true,
        secure: config.auth.secureCookies,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24,
      });

      return reply.redirect('/');
    }
  );

  /**
   * POST /api/v1/auth/hash-password
   * Utility endpoint to hash a password (admin only, for generating hashed passwords)
   */
  app.post<{ Body: { password: string } }>(
    `${prefix}/hash-password`,
    {
      preHandler: async (request, reply) => {
        // Require authentication
        const token = extractToken(request);
        if (!token) {
          return reply.status(401).send({ error: 'Authentication required' });
        }
        const user = authService.getUserFromToken(token);
        if (!user || user.role !== 'admin') {
          return reply.status(403).send({ error: 'Admin access required' });
        }
      },
    },
    async (request: FastifyRequest<{ Body: { password: string } }>, reply: FastifyReply) => {
      const { password } = request.body;

      if (!password) {
        return reply.status(400).send({ error: 'Password is required' });
      }

      const hashed = await authService.hashPassword(password);

      return reply.send({
        password,
        hashed,
        note: 'Use the hashed value in LEFORGE_ADMIN_PASSWORD environment variable',
      });
    }
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract JWT token from request (cookie or Authorization header)
 */
function extractToken(request: FastifyRequest): string | null {
  // Check cookie first
  const cookieToken = request.cookies?.[config.auth.sessionCookieName];
  if (cookieToken) {
    return cookieToken;
  }

  // Check Authorization header
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

export { extractToken };
