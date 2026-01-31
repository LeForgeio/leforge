import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { 
  apiKeyService, 
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
} from '../services/api-key.service.js';

// =============================================================================
// Request/Response Types
// =============================================================================

interface KeyParams {
  keyId: string;
}

interface CreateKeyBody {
  name: string;
  description?: string;
  expiresAt?: string;
  expiresInDays?: number;
  scopes?: string[];
  allowedIps?: string[];
  rateLimitPerMinute?: number;
  rateLimitPerDay?: number;
  metadata?: Record<string, unknown>;
}

interface UpdateKeyBody {
  name?: string;
  description?: string;
  expiresAt?: string | null;
  scopes?: string[];
  allowedIps?: string[];
  rateLimitPerMinute?: number;
  rateLimitPerDay?: number;
  metadata?: Record<string, unknown>;
}

interface ListKeysQuery {
  includeRevoked?: boolean;
  includeExpired?: boolean;
}

interface UsageHistoryQuery {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  statusCode?: number;
}

interface UsageStatsQuery {
  days?: number;
}

/**
 * API Keys Management Routes
 * 
 * Provides endpoints for creating, listing, and managing API keys
 * used for external integration authentication.
 * 
 * Features:
 * - CRUD operations for API keys
 * - Scopes management (permissions)
 * - Expiration dates
 * - IP allowlist
 * - Rate limiting
 * - Key rotation
 * - Usage analytics
 */
export async function apiKeysRoutes(fastify: FastifyInstance) {
  
  // ============================================================================
  // List API Keys
  // ============================================================================
  /**
   * GET /api/v1/api-keys
   * List all API keys (keys are not returned, only metadata)
   * 
   * Query params:
   * - includeRevoked: include revoked keys (default: false)
   * - includeExpired: include expired keys (default: false)
   */
  fastify.get<{ Querystring: ListKeysQuery }>(
    '/api/v1/api-keys',
    async (request: FastifyRequest<{ Querystring: ListKeysQuery }>, reply: FastifyReply) => {
      const { includeRevoked, includeExpired } = request.query;
      
      const keys = await apiKeyService.listApiKeys({
        includeRevoked: includeRevoked === true || includeRevoked === 'true' as unknown as boolean,
        includeExpired: includeExpired === true || includeExpired === 'true' as unknown as boolean,
        createdBy: request.user?.id,
      });
      
      // Add status to each key
      const keysWithStatus = keys.map(key => ({
        ...key,
        status: apiKeyService.getKeyStatus(key),
      }));
      
      return reply.send({
        apiKeys: keysWithStatus,
        total: keysWithStatus.length,
      });
    }
  );

  // ============================================================================
  // Create API Key
  // ============================================================================
  /**
   * POST /api/v1/api-keys
   * Create a new API key - the plain text key is only returned once!
   * 
   * Body:
   * - name (required): Display name for the key
   * - description: Optional description
   * - expiresAt: ISO date string for expiration
   * - expiresInDays: Days until expiration (alternative to expiresAt)
   * - scopes: Array of permission scopes (default: ["*"])
   * - allowedIps: Array of allowed IP addresses/CIDR ranges
   * - rateLimitPerMinute: Max requests per minute (default: 60)
   * - rateLimitPerDay: Max requests per day (default: 10000)
   * - metadata: Custom metadata object
   */
  fastify.post<{ Body: CreateKeyBody }>(
    '/api/v1/api-keys',
    async (request: FastifyRequest<{ Body: CreateKeyBody }>, reply: FastifyReply) => {
      const body = request.body;
      
      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'API key name is required',
          },
        });
      }

      // Validate scopes if provided
      if (body.scopes && !Array.isArray(body.scopes)) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'scopes must be an array',
          },
        });
      }

      // Validate rate limits
      if (body.rateLimitPerMinute !== undefined && (body.rateLimitPerMinute < 1 || body.rateLimitPerMinute > 10000)) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'rateLimitPerMinute must be between 1 and 10000',
          },
        });
      }

      if (body.rateLimitPerDay !== undefined && (body.rateLimitPerDay < 1 || body.rateLimitPerDay > 1000000)) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'rateLimitPerDay must be between 1 and 1000000',
          },
        });
      }

      const createRequest: CreateApiKeyRequest = {
        name: body.name.trim(),
        description: body.description?.trim(),
        expiresAt: body.expiresAt,
        expiresInDays: body.expiresInDays,
        scopes: body.scopes,
        allowedIps: body.allowedIps,
        rateLimitPerMinute: body.rateLimitPerMinute,
        rateLimitPerDay: body.rateLimitPerDay,
        metadata: body.metadata,
      };

      const result = await apiKeyService.createApiKey(createRequest, request.user?.id);
      
      return reply.status(201).send({
        apiKey: {
          ...result.apiKey,
          status: apiKeyService.getKeyStatus(result.apiKey),
        },
        key: result.plainTextKey, // Only returned once!
        warning: 'Store this API key securely. It will not be shown again.',
      });
    }
  );

  // ============================================================================
  // Get Single API Key
  // ============================================================================
  /**
   * GET /api/v1/api-keys/:keyId
   * Get a single API key by ID (key value not returned)
   */
  fastify.get<{ Params: KeyParams }>(
    '/api/v1/api-keys/:keyId',
    async (request: FastifyRequest<{ Params: KeyParams }>, reply: FastifyReply) => {
      const { keyId } = request.params;
      
      const apiKey = await apiKeyService.getApiKey(keyId);
      
      if (!apiKey) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found',
          },
        });
      }
      
      return reply.send({
        apiKey: {
          ...apiKey,
          status: apiKeyService.getKeyStatus(apiKey),
        },
      });
    }
  );

  // ============================================================================
  // Update API Key
  // ============================================================================
  /**
   * PATCH /api/v1/api-keys/:keyId
   * Update API key settings
   */
  fastify.patch<{ Params: KeyParams; Body: UpdateKeyBody }>(
    '/api/v1/api-keys/:keyId',
    async (request: FastifyRequest<{ Params: KeyParams; Body: UpdateKeyBody }>, reply: FastifyReply) => {
      const { keyId } = request.params;
      const body = request.body;
      
      if (body.name !== undefined) {
        if (typeof body.name !== 'string' || body.name.trim().length === 0) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'API key name cannot be empty',
            },
          });
        }
      }

      const updates: UpdateApiKeyRequest = {};
      
      if (body.name !== undefined) updates.name = body.name.trim();
      if (body.description !== undefined) updates.description = body.description?.trim();
      if (body.expiresAt !== undefined) updates.expiresAt = body.expiresAt;
      if (body.scopes !== undefined) updates.scopes = body.scopes;
      if (body.allowedIps !== undefined) updates.allowedIps = body.allowedIps;
      if (body.rateLimitPerMinute !== undefined) updates.rateLimitPerMinute = body.rateLimitPerMinute;
      if (body.rateLimitPerDay !== undefined) updates.rateLimitPerDay = body.rateLimitPerDay;
      if (body.metadata !== undefined) updates.metadata = body.metadata;

      const apiKey = await apiKeyService.updateApiKey(keyId, updates);
      
      if (!apiKey) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found',
          },
        });
      }
      
      return reply.send({
        apiKey: {
          ...apiKey,
          status: apiKeyService.getKeyStatus(apiKey),
        },
      });
    }
  );

  // ============================================================================
  // Rotate API Key
  // ============================================================================
  /**
   * POST /api/v1/api-keys/:keyId/rotate
   * Generate a new key value while keeping all settings
   * The new plain text key is only returned once!
   */
  fastify.post<{ Params: KeyParams }>(
    '/api/v1/api-keys/:keyId/rotate',
    async (request: FastifyRequest<{ Params: KeyParams }>, reply: FastifyReply) => {
      const { keyId } = request.params;
      
      const result = await apiKeyService.rotateApiKey(keyId);
      
      if (!result) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found',
          },
        });
      }
      
      return reply.send({
        apiKey: {
          ...result.apiKey,
          status: apiKeyService.getKeyStatus(result.apiKey),
        },
        key: result.plainTextKey,
        warning: 'Store this new API key securely. It will not be shown again. The old key is now invalid.',
      });
    }
  );

  // ============================================================================
  // Revoke API Key
  // ============================================================================
  /**
   * POST /api/v1/api-keys/:keyId/revoke
   * Revoke an API key (soft delete - keeps record but disables)
   */
  fastify.post<{ Params: KeyParams }>(
    '/api/v1/api-keys/:keyId/revoke',
    async (request: FastifyRequest<{ Params: KeyParams }>, reply: FastifyReply) => {
      const { keyId } = request.params;
      
      const revoked = await apiKeyService.revokeApiKey(keyId);
      
      if (!revoked) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found or already revoked',
          },
        });
      }
      
      return reply.send({
        success: true,
        message: 'API key revoked successfully',
      });
    }
  );

  // ============================================================================
  // Reactivate API Key
  // ============================================================================
  /**
   * POST /api/v1/api-keys/:keyId/reactivate
   * Reactivate a previously revoked API key
   */
  fastify.post<{ Params: KeyParams }>(
    '/api/v1/api-keys/:keyId/reactivate',
    async (request: FastifyRequest<{ Params: KeyParams }>, reply: FastifyReply) => {
      const { keyId } = request.params;
      
      const apiKey = await apiKeyService.reactivateApiKey(keyId);
      
      if (!apiKey) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found',
          },
        });
      }
      
      return reply.send({
        apiKey: {
          ...apiKey,
          status: apiKeyService.getKeyStatus(apiKey),
        },
        message: 'API key reactivated successfully',
      });
    }
  );

  // ============================================================================
  // Delete API Key
  // ============================================================================
  /**
   * DELETE /api/v1/api-keys/:keyId
   * Permanently delete an API key
   */
  fastify.delete<{ Params: KeyParams }>(
    '/api/v1/api-keys/:keyId',
    async (request: FastifyRequest<{ Params: KeyParams }>, reply: FastifyReply) => {
      const { keyId } = request.params;
      
      const deleted = await apiKeyService.deleteApiKey(keyId);
      
      if (!deleted) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found',
          },
        });
      }
      
      return reply.status(204).send();
    }
  );

  // ============================================================================
  // Get Rate Limit Info
  // ============================================================================
  /**
   * GET /api/v1/api-keys/:keyId/rate-limit
   * Get current rate limit status for a key
   */
  fastify.get<{ Params: KeyParams }>(
    '/api/v1/api-keys/:keyId/rate-limit',
    async (request: FastifyRequest<{ Params: KeyParams }>, reply: FastifyReply) => {
      const { keyId } = request.params;
      
      const rateLimit = await apiKeyService.getRateLimitInfo(keyId);
      
      if (!rateLimit) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found',
          },
        });
      }
      
      return reply.send({
        rateLimit,
      });
    }
  );

  // ============================================================================
  // Get Available Scopes
  // ============================================================================
  /**
   * GET /api/v1/api-keys/scopes
   * Get list of all available permission scopes
   */
  fastify.get('/api/v1/api-keys/scopes', async (_request: FastifyRequest, reply: FastifyReply) => {
    const scopes = await apiKeyService.getAvailableScopes();
    
    // Group by category
    const grouped = scopes.reduce((acc, scope) => {
      if (!acc[scope.category]) {
        acc[scope.category] = [];
      }
      acc[scope.category].push(scope);
      return acc;
    }, {} as Record<string, typeof scopes>);
    
    return reply.send({
      scopes,
      grouped,
    });
  });

  // ============================================================================
  // Get Analytics
  // ============================================================================
  /**
   * GET /api/v1/api-keys/analytics
   * Get usage analytics for all keys
   */
  fastify.get('/api/v1/api-keys/analytics', async (_request: FastifyRequest, reply: FastifyReply) => {
    const analytics = await apiKeyService.getAnalytics();
    
    return reply.send({
      analytics,
    });
  });

  /**
   * GET /api/v1/api-keys/:keyId/analytics
   * Get usage analytics for a specific key
   */
  fastify.get<{ Params: KeyParams }>(
    '/api/v1/api-keys/:keyId/analytics',
    async (request: FastifyRequest<{ Params: KeyParams }>, reply: FastifyReply) => {
      const { keyId } = request.params;
      
      const analytics = await apiKeyService.getAnalytics(keyId);
      
      if (analytics.length === 0) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found',
          },
        });
      }
      
      return reply.send({
        analytics: analytics[0],
      });
    }
  );

  // ============================================================================
  // Get Usage History
  // ============================================================================
  /**
   * GET /api/v1/api-keys/:keyId/usage
   * Get usage history for a specific key
   * 
   * Query params:
   * - limit: Max entries to return (default: 100)
   * - offset: Pagination offset (default: 0)
   * - startDate: Filter by start date (ISO string)
   * - endDate: Filter by end date (ISO string)
   * - statusCode: Filter by HTTP status code
   */
  fastify.get<{ Params: KeyParams; Querystring: UsageHistoryQuery }>(
    '/api/v1/api-keys/:keyId/usage',
    async (request: FastifyRequest<{ Params: KeyParams; Querystring: UsageHistoryQuery }>, reply: FastifyReply) => {
      const { keyId } = request.params;
      const { limit, offset, startDate, endDate, statusCode } = request.query;
      
      // Check key exists
      const apiKey = await apiKeyService.getApiKey(keyId);
      if (!apiKey) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found',
          },
        });
      }
      
      const result = await apiKeyService.getUsageHistory(keyId, {
        limit: limit ? parseInt(String(limit)) : undefined,
        offset: offset ? parseInt(String(offset)) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        statusCode: statusCode ? parseInt(String(statusCode)) : undefined,
      });
      
      return reply.send({
        entries: result.entries,
        total: result.total,
        limit: limit || 100,
        offset: offset || 0,
      });
    }
  );

  // ============================================================================
  // Get Usage Stats
  // ============================================================================
  /**
   * GET /api/v1/api-keys/stats
   * Get aggregated usage statistics for all keys
   * 
   * Query params:
   * - days: Number of days to include (default: 30)
   */
  fastify.get<{ Querystring: UsageStatsQuery }>(
    '/api/v1/api-keys/stats',
    async (request: FastifyRequest<{ Querystring: UsageStatsQuery }>, reply: FastifyReply) => {
      const { days } = request.query;
      
      const stats = await apiKeyService.getUsageStats(undefined, {
        days: days ? parseInt(String(days)) : undefined,
      });
      
      return reply.send({
        stats,
      });
    }
  );

  /**
   * GET /api/v1/api-keys/:keyId/stats
   * Get aggregated usage statistics for a specific key
   */
  fastify.get<{ Params: KeyParams; Querystring: UsageStatsQuery }>(
    '/api/v1/api-keys/:keyId/stats',
    async (request: FastifyRequest<{ Params: KeyParams; Querystring: UsageStatsQuery }>, reply: FastifyReply) => {
      const { keyId } = request.params;
      const { days } = request.query;
      
      // Check key exists
      const apiKey = await apiKeyService.getApiKey(keyId);
      if (!apiKey) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found',
          },
        });
      }
      
      const stats = await apiKeyService.getUsageStats(keyId, {
        days: days ? parseInt(String(days)) : undefined,
      });
      
      return reply.send({
        stats,
      });
    }
  );
}
