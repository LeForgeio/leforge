import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { apiKeyService, ApiKey } from '../services/api-key.service.js';
import { integrationsService } from '../services/integrations.service.js';
import { logger } from '../utils/logger.js';

// Extend FastifyRequest to include validated API key
declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: ApiKey;
    integrationId?: string;
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
    if (authHeader.startsWith('Bearer ')) {
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
 * API Key Authentication Hook
 * 
 * Use this as a preHandler hook to require API key authentication.
 * The validated API key will be available at request.apiKey
 */
export async function requireApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
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

  const apiKey = await apiKeyService.validateKey(plainTextKey);

  if (!apiKey) {
    logger.warn({ url: request.url, keyPrefix: plainTextKey.substring(0, 12) }, 'Invalid API key');
    return reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or revoked API key',
      },
    });
  }

  // Attach the validated key to the request
  request.apiKey = apiKey;
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

    const apiKey = await apiKeyService.validateKey(plainTextKey);

    if (!apiKey) {
      logger.warn({ url: request.url, integrationId, keyPrefix: plainTextKey.substring(0, 12) }, 'Invalid API key for integration');
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or revoked API key',
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
    const apiKey = await apiKeyService.validateKey(plainTextKey);
    if (apiKey) {
      request.apiKey = apiKey;
    }
  }
}

/**
 * Log API usage after response (use as onResponse hook)
 */
export function logApiUsage(integrationId: string) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (request.apiKey) {
      const ipAddress = request.ip || (request.headers['x-forwarded-for'] as string)?.split(',')[0];
      const userAgent = request.headers['user-agent'] as string;

      await apiKeyService.logUsage(
        request.apiKey.id,
        integrationId,
        request.url,
        request.method,
        reply.statusCode,
        ipAddress,
        userAgent
      );
    }
  };
}
