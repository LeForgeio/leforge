import { FastifyRequest, FastifyReply } from 'fastify';
import { apiKeyService, ApiKey, ApiKeyValidationResult } from '../services/api-key.service.js';
import { integrationsService } from '../services/integrations.service.js';
import { authService, User, UserRole, ROLE_PERMISSIONS, SYSTEM_USER_ID } from '../services/auth.service.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Re-export for backwards compatibility
export const ANONYMOUS_USER_ID = SYSTEM_USER_ID;

// Extend FastifyRequest to include validated API key and user
declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: ApiKey;
    integrationId?: string;
    user?: User;
    requestStartTime?: number;
  }
}

// =============================================================================
// Role-based Access Control Helpers
// =============================================================================

/**
 * Check if user has a specific permission
 */
export function hasPermission(user: User | undefined, permission: keyof typeof ROLE_PERMISSIONS.admin): boolean {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role]?.[permission] ?? false;
}

/**
 * Create a middleware that requires a specific role
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // First ensure we have a session
    await requireSession(request, reply);
    if (reply.sent) return;

    if (!request.user || !allowedRoles.includes(request.user.role)) {
      const roleList = allowedRoles.join(' or ');
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: `This action requires ${roleList} role`,
        },
      });
    }
  };
}

/**
 * Create a middleware that requires a specific permission
 */
export function requirePermission(permission: keyof typeof ROLE_PERMISSIONS.admin) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // First ensure we have a session
    await requireSession(request, reply);
    if (reply.sent) return;

    if (!hasPermission(request.user, permission)) {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: `You don't have permission to perform this action`,
        },
      });
    }
  };
}

// =============================================================================
// Session/JWT Authentication
// =============================================================================

/**
 * Extract JWT token from request (cookie or Authorization header)
 */
function extractSessionToken(request: FastifyRequest): string | null {
  // Check cookie first
  const cookieToken = request.cookies?.[config.auth.sessionCookieName];
  if (cookieToken) {
    return cookieToken;
  }

  // Check Authorization header (Bearer token, but not API keys)
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ') && !authHeader.includes('fhk_')) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Session authentication hook for UI access
 * Use this to protect routes that require user login
 */
export async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // If auth is disabled, allow all requests
  if (!authService.isAuthEnabled()) {
    request.user = {
      id: ANONYMOUS_USER_ID,
      username: 'anonymous',
      displayName: 'Anonymous',
      role: 'admin',
      authProvider: 'local',
    };
    return;
  }

  // Check if this is a public path
  if (authService.isPublicPath(request.url)) {
    return;
  }

  const token = extractSessionToken(request);

  if (!token) {
    logger.debug({ url: request.url }, 'Request without session token');
    return reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  const user = authService.getUserFromToken(token);

  if (!user) {
    logger.debug({ url: request.url }, 'Invalid or expired session');
    // Clear invalid cookie
    reply.clearCookie(config.auth.sessionCookieName, { path: '/' });
    return reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Session expired or invalid',
      },
    });
  }

  // Attach user to request
  request.user = user;
}

/**
 * Optional session check - doesn't fail, just attaches user if authenticated
 */
export async function optionalSession(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // If auth is disabled, set anonymous user
  if (!authService.isAuthEnabled()) {
    request.user = {
      id: ANONYMOUS_USER_ID,
      username: 'anonymous',
      displayName: 'Anonymous',
      role: 'admin',
      authProvider: 'local',
    };
    return;
  }

  const token = extractSessionToken(request);
  if (token) {
    const user = authService.getUserFromToken(token);
    if (user) {
      request.user = user;
    }
  }
}

/**
 * Require admin role
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // First ensure we have a session
  await requireSession(request, reply);
  
  // Check if already sent response
  if (reply.sent) return;

  // Check admin role
  if (request.user?.role !== 'admin') {
    return reply.status(403).send({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required',
      },
    });
  }
}

/**
 * Extract API key from request
 * Supports multiple formats:
 * - Authorization: Bearer fhk_xxxxx
 * - Authorization: ApiKey fhk_xxxxx
 * - X-API-Key: fhk_xxxxx
 */
function extractApiKey(request: FastifyRequest): string | null {
  // Check Authorization header
  const authHeader = request.headers.authorization;
  if (authHeader) {
    // Bearer token format
    if (authHeader.startsWith('Bearer ') && authHeader.includes('fhk_')) {
      return authHeader.substring(7);
    }
    // ApiKey format
    if (authHeader.startsWith('ApiKey ')) {
      return authHeader.substring(7);
    }
  }

  // Check X-API-Key header
  const apiKeyHeader = request.headers['x-api-key'];
  if (apiKeyHeader && typeof apiKeyHeader === 'string') {
    return apiKeyHeader;
  }

  return null;
}

/**
 * Get client IP address from request
 */
function getClientIp(request: FastifyRequest): string | undefined {
  // Check X-Forwarded-For header first (for proxied requests)
  const forwardedFor = request.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = typeof forwardedFor === 'string' ? forwardedFor : forwardedFor[0];
    return ips?.split(',')[0]?.trim();
  }
  
  // Check X-Real-IP header
  const realIp = request.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string') {
    return realIp;
  }

  // Fall back to direct IP
  return request.ip;
}

/**
 * Handle API key validation result and send appropriate error response
 */
function handleValidationError(
  result: ApiKeyValidationResult,
  reply: FastifyReply
): void {
  switch (result.error) {
    case 'invalid':
      reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid API key',
        },
      });
      break;
    
    case 'expired':
      reply.status(401).send({
        error: {
          code: 'API_KEY_EXPIRED',
          message: 'API key has expired',
          expiresAt: result.apiKey?.expiresAt,
        },
      });
      break;
    
    case 'revoked':
      reply.status(401).send({
        error: {
          code: 'API_KEY_REVOKED',
          message: 'API key has been revoked',
        },
      });
      break;
    
    case 'ip_blocked':
      reply.status(403).send({
        error: {
          code: 'IP_NOT_ALLOWED',
          message: 'Your IP address is not in the allowed list for this API key',
        },
      });
      break;
    
    case 'rate_limited':
      reply.header('Retry-After', String(result.retryAfter || 60));
      reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Rate limit exceeded',
          retryAfter: result.retryAfter,
        },
      });
      break;
    
    default:
      reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'API key validation failed',
        },
      });
  }
}

/**
 * Add rate limit headers to response
 */
async function addRateLimitHeaders(apiKey: ApiKey, reply: FastifyReply): Promise<void> {
  try {
    const rateLimit = await apiKeyService.getRateLimitInfo(apiKey.id);
    if (rateLimit) {
      reply.header('X-RateLimit-Limit-Minute', String(rateLimit.minuteLimit));
      reply.header('X-RateLimit-Remaining-Minute', String(rateLimit.minuteRemaining));
      reply.header('X-RateLimit-Reset-Minute', rateLimit.resetMinute.toISOString());
      reply.header('X-RateLimit-Limit-Day', String(rateLimit.dayLimit));
      reply.header('X-RateLimit-Remaining-Day', String(rateLimit.dayRemaining));
      reply.header('X-RateLimit-Reset-Day', rateLimit.resetDay.toISOString());
    }
  } catch {
    // Ignore errors - headers are informational
  }
}

/**
 * API Key Authentication Hook
 * 
 * Use this as a preHandler hook to require API key authentication.
 * The validated API key will be available at request.apiKey
 * 
 * Features:
 * - Validates key existence and hash
 * - Checks expiration
 * - Validates IP allowlist
 * - Enforces rate limits
 * - Adds rate limit headers to response
 */
export async function requireApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Track request start time for response time logging
  request.requestStartTime = Date.now();

  const plainTextKey = extractApiKey(request);

  if (!plainTextKey) {
    logger.warn({ url: request.url }, 'API request without API key');
    return reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'API key required. Provide via Authorization header (Bearer or ApiKey) or X-API-Key header.',
      },
    });
  }

  const clientIp = getClientIp(request);
  const result = await apiKeyService.validateKey(plainTextKey, clientIp);

  if (!result.valid) {
    logger.warn({ 
      url: request.url, 
      keyPrefix: plainTextKey.substring(0, 12),
      error: result.error,
      clientIp,
    }, 'API key validation failed');
    
    return handleValidationError(result, reply);
  }

  // Attach the validated key to the request
  request.apiKey = result.apiKey;

  // Add rate limit headers
  if (result.apiKey) {
    await addRateLimitHeaders(result.apiKey, reply);
  }
}

/**
 * Create a middleware that requires a specific API key scope
 * 
 * @param requiredScope - The scope required for this endpoint
 */
export function requireScope(requiredScope: string) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // First ensure we have a valid API key
    await requireApiKey(request, reply);
    if (reply.sent) return;

    if (!request.apiKey) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'API key required',
        },
      });
    }

    // Check scope
    if (!apiKeyService.hasScope(request.apiKey, requiredScope)) {
      logger.warn({
        keyId: request.apiKey.id,
        requiredScope,
        keyScopes: request.apiKey.scopes,
        url: request.url,
      }, 'API key missing required scope');
      
      return reply.status(403).send({
        error: {
          code: 'INSUFFICIENT_SCOPE',
          message: `API key does not have the required scope: ${requiredScope}`,
          requiredScope,
          keyScopes: request.apiKey.scopes,
        },
      });
    }
  };
}

/**
 * Create a middleware that requires any of the specified scopes
 */
export function requireAnyScope(...requiredScopes: string[]) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // First ensure we have a valid API key
    await requireApiKey(request, reply);
    if (reply.sent) return;

    if (!request.apiKey) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'API key required',
        },
      });
    }

    // Check if key has any of the required scopes
    const hasAnyScope = requiredScopes.some(scope => 
      apiKeyService.hasScope(request.apiKey!, scope)
    );

    if (!hasAnyScope) {
      logger.warn({
        keyId: request.apiKey.id,
        requiredScopes,
        keyScopes: request.apiKey.scopes,
        url: request.url,
      }, 'API key missing all required scopes');
      
      return reply.status(403).send({
        error: {
          code: 'INSUFFICIENT_SCOPE',
          message: `API key requires one of these scopes: ${requiredScopes.join(', ')}`,
          requiredScopes,
          keyScopes: request.apiKey.scopes,
        },
      });
    }
  };
}

/**
 * Integration Enabled Check Hook
 * 
 * Use this as a preHandler hook (after requireApiKey) to verify
 * the integration is enabled before processing the request.
 * 
 * @param integrationId - The integration ID to check (e.g., 'nintex', 'make')
 */
export function requireIntegrationEnabled(integrationId: string) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const isEnabled = await integrationsService.isIntegrationEnabled(integrationId);

    if (!isEnabled) {
      logger.warn({ integrationId, url: request.url }, 'Request to disabled integration');
      return reply.status(403).send({
        error: {
          code: 'INTEGRATION_DISABLED',
          message: `The ${integrationId} integration is not enabled. Enable it in LeForge settings.`,
        },
      });
    }

    // Attach integration ID to request for logging
    request.integrationId = integrationId;
  };
}

/**
 * Combined authentication and integration check
 * 
 * Validates API key AND checks if integration is enabled.
 * Use this for external integration endpoints.
 * 
 * @param integrationId - The integration ID to check
 */
export function requireApiKeyAndIntegration(integrationId: string) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Track request start time
    request.requestStartTime = Date.now();

    // First validate API key
    const plainTextKey = extractApiKey(request);

    if (!plainTextKey) {
      logger.warn({ url: request.url, integrationId }, 'Integration request without API key');
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'API key required. Provide via Authorization header (Bearer or ApiKey) or X-API-Key header.',
        },
      });
    }

    const clientIp = getClientIp(request);
    const result = await apiKeyService.validateKey(plainTextKey, clientIp);

    if (!result.valid) {
      logger.warn({ 
        url: request.url, 
        integrationId, 
        keyPrefix: plainTextKey.substring(0, 12),
        error: result.error,
        clientIp,
      }, 'API key validation failed for integration');
      
      return handleValidationError(result, reply);
    }

    const apiKey = result.apiKey!;

    // Check if key has integration scope
    const integrationScope = `integrations:${integrationId}`;
    if (!apiKeyService.hasScope(apiKey, 'plugins:execute') && 
        !apiKeyService.hasScope(apiKey, integrationScope)) {
      return reply.status(403).send({
        error: {
          code: 'INSUFFICIENT_SCOPE',
          message: `API key does not have permission for ${integrationId} integration`,
          requiredScope: integrationScope,
        },
      });
    }

    // Then check if integration is enabled
    const isEnabled = await integrationsService.isIntegrationEnabled(integrationId);

    if (!isEnabled) {
      logger.warn({ integrationId, url: request.url, keyId: apiKey.id }, 'Request to disabled integration');
      return reply.status(403).send({
        error: {
          code: 'INTEGRATION_DISABLED',
          message: `The ${integrationId} integration is not enabled. Enable it in LeForge settings.`,
        },
      });
    }

    // Attach to request
    request.apiKey = apiKey;
    request.integrationId = integrationId;

    // Add rate limit headers
    await addRateLimitHeaders(apiKey, reply);

    // Log the authenticated request
    logger.debug({
      integrationId,
      keyId: apiKey.id,
      keyName: apiKey.name,
      url: request.url,
    }, 'Integration request authenticated');
  };
}

/**
 * Optional API key check (doesn't fail, just attaches key if present)
 * Useful for endpoints that can work with or without authentication
 */
export async function optionalApiKey(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const plainTextKey = extractApiKey(request);

  if (plainTextKey) {
    const clientIp = getClientIp(request);
    const result = await apiKeyService.validateKey(plainTextKey, clientIp);
    if (result.valid && result.apiKey) {
      request.apiKey = result.apiKey;
    }
  }
}

/**
 * Log API usage after response (use as onResponse hook)
 * Enhanced with response time, body sizes, and error tracking
 */
export function logApiUsage(integrationId: string) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (request.apiKey) {
      const ipAddress = getClientIp(request);
      const userAgent = request.headers['user-agent'] as string;
      
      // Calculate response time
      const responseTimeMs = request.requestStartTime 
        ? Date.now() - request.requestStartTime 
        : undefined;

      // Get body sizes (approximate)
      const requestBodySize = request.body 
        ? JSON.stringify(request.body).length 
        : undefined;

      // Get error message for 4xx/5xx responses
      let errorMessage: string | undefined;
      if (reply.statusCode >= 400) {
        // Try to extract error message from response payload
        try {
          const payload = reply.getHeader('content-type')?.toString().includes('json')
            ? (reply as unknown as { payload?: string }).payload
            : undefined;
          if (payload) {
            const parsed = JSON.parse(payload);
            errorMessage = parsed.error?.message || parsed.message;
          }
        } catch {
          // Ignore parsing errors
        }
      }

      await apiKeyService.logUsage(
        request.apiKey.id,
        integrationId,
        request.url,
        request.method,
        reply.statusCode,
        {
          ipAddress,
          userAgent,
          responseTimeMs,
          requestBodySize,
          errorMessage,
        }
      );
    }
  };
}
