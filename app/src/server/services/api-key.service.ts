import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { databaseService } from './database.service.js';

// =============================================================================
// Types
// =============================================================================

export interface ApiKey {
  id: string;
  name: string;
  description?: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  revokedAt?: Date;
  // Enhanced fields
  expiresAt?: Date;
  scopes: string[];
  allowedIps: string[];
  rateLimitPerMinute: number;
  rateLimitPerDay: number;
  createdBy?: string;
  metadata: Record<string, unknown>;
}

export type ApiKeyStatus = 'active' | 'expired' | 'revoked' | 'inactive';

export interface CreateApiKeyRequest {
  name: string;
  description?: string;
  expiresAt?: Date | string;
  expiresInDays?: number;
  scopes?: string[];
  allowedIps?: string[];
  rateLimitPerMinute?: number;
  rateLimitPerDay?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateApiKeyRequest {
  name?: string;
  description?: string;
  expiresAt?: Date | string | null;
  scopes?: string[];
  allowedIps?: string[];
  rateLimitPerMinute?: number;
  rateLimitPerDay?: number;
  metadata?: Record<string, unknown>;
}

export interface CreateApiKeyResponse {
  apiKey: ApiKey;
  plainTextKey: string; // Only returned once at creation
}

export interface ApiKeyValidationResult {
  valid: boolean;
  apiKey?: ApiKey;
  error?: 'invalid' | 'expired' | 'revoked' | 'ip_blocked' | 'rate_limited';
  retryAfter?: number; // seconds until rate limit resets
}

export interface RateLimitInfo {
  minuteCount: number;
  minuteLimit: number;
  dayCount: number;
  dayLimit: number;
  minuteRemaining: number;
  dayRemaining: number;
  resetMinute: Date;
  resetDay: Date;
}

export interface ApiKeyScope {
  id: string;
  name: string;
  description?: string;
  category: string;
}

export interface ApiKeyAnalytics {
  apiKeyId: string;
  apiKeyName: string;
  keyPrefix: string;
  isActive: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  status: ApiKeyStatus;
  totalRequests: number;
  requests24h: number;
  requests7d: number;
  errorCount: number;
  avgResponseTimeMs?: number;
  lastRequestAt?: Date;
}

export interface UsageLogEntry {
  id: string;
  apiKeyId: string;
  integrationId?: string;
  endpoint: string;
  method: string;
  statusCode: number;
  ipAddress?: string;
  userAgent?: string;
  responseTimeMs?: number;
  requestBodySize?: number;
  responseBodySize?: number;
  errorMessage?: string;
  createdAt: Date;
}

/**
 * API Key Service
 * Handles generation, validation, and management of API keys for external integrations
 * 
 * Features:
 * - Secure key generation with SHA-256 hashing
 * - Scoped permissions (plugins:*, admin:*, specific endpoints)
 * - Expiration dates (optional)
 * - IP allowlist restrictions
 * - Per-key rate limiting (minute and day windows)
 * - Usage analytics and audit logging
 * - Key rotation
 */
class ApiKeyService {
  private readonly KEY_PREFIX = 'fhk_'; // LeForge Hook key prefix
  private readonly KEY_LENGTH = 32; // 32 bytes = 64 hex chars

  // =========================================================================
  // Key Generation & Management
  // =========================================================================

  /**
   * Generate a new API key
   */
  async createApiKey(request: CreateApiKeyRequest, createdBy?: string): Promise<CreateApiKeyResponse> {
    // Generate random key
    const randomBytes = crypto.randomBytes(this.KEY_LENGTH);
    const keyBody = randomBytes.toString('hex');
    const plainTextKey = `${this.KEY_PREFIX}${keyBody}`;
    
    // Hash the key for storage
    const keyHash = this.hashKey(plainTextKey);
    const keyPrefix = plainTextKey.substring(0, 12); // "fhk_" + 8 chars

    const id = crypto.randomUUID();

    // Calculate expiration
    let expiresAt: Date | null = null;
    if (request.expiresAt) {
      expiresAt = new Date(request.expiresAt);
    } else if (request.expiresInDays && request.expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + request.expiresInDays);
    }

    // Default scopes to full access if not specified
    const scopes = request.scopes?.length ? request.scopes : ['*'];

    const query = `
      INSERT INTO api_keys (
        id, name, description, key_hash, key_prefix, is_active,
        expires_at, scopes, allowed_ips, rate_limit_per_minute, rate_limit_per_day,
        created_by, metadata
      )
      VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const result = await databaseService.query(query, [
      id,
      request.name,
      request.description || null,
      keyHash,
      keyPrefix,
      expiresAt,
      JSON.stringify(scopes),
      request.allowedIps || [],
      request.rateLimitPerMinute || 60,
      request.rateLimitPerDay || 10000,
      createdBy || null,
      JSON.stringify(request.metadata || {}),
    ]);

    const apiKey = this.rowToApiKey(result.rows[0]);
    logger.info({ keyId: id, name: request.name, scopes }, 'API key created');

    return {
      apiKey,
      plainTextKey, // Only returned once!
    };
  }

  /**
   * Rotate an API key - generates new key value while keeping all settings
   */
  async rotateApiKey(id: string): Promise<CreateApiKeyResponse | null> {
    // Get existing key
    const existing = await this.getApiKey(id);
    if (!existing) {
      return null;
    }

    // Generate new key
    const randomBytes = crypto.randomBytes(this.KEY_LENGTH);
    const keyBody = randomBytes.toString('hex');
    const plainTextKey = `${this.KEY_PREFIX}${keyBody}`;
    const keyHash = this.hashKey(plainTextKey);
    const keyPrefix = plainTextKey.substring(0, 12);

    const query = `
      UPDATE api_keys
      SET key_hash = $1, key_prefix = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;

    const result = await databaseService.query(query, [keyHash, keyPrefix, id]);

    if (result.rows.length === 0) {
      return null;
    }

    const apiKey = this.rowToApiKey(result.rows[0]);
    logger.info({ keyId: id, name: existing.name }, 'API key rotated');

    return {
      apiKey,
      plainTextKey,
    };
  }

  /**
   * Validate an API key with full checks
   */
  async validateKey(plainTextKey: string, clientIp?: string): Promise<ApiKeyValidationResult> {
    if (!plainTextKey || !plainTextKey.startsWith(this.KEY_PREFIX)) {
      return { valid: false, error: 'invalid' };
    }

    const keyHash = this.hashKey(plainTextKey);

    const query = `
      SELECT *
      FROM api_keys
      WHERE key_hash = $1
    `;

    const result = await databaseService.query(query, [keyHash]);

    if (result.rows.length === 0) {
      return { valid: false, error: 'invalid' };
    }

    const row = result.rows[0];
    const apiKey = this.rowToApiKey(row);

    // Check if revoked
    if (apiKey.revokedAt) {
      return { valid: false, apiKey, error: 'revoked' };
    }

    // Check if inactive
    if (!apiKey.isActive) {
      return { valid: false, apiKey, error: 'revoked' };
    }

    // Check expiration
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return { valid: false, apiKey, error: 'expired' };
    }

    // Check IP allowlist
    if (clientIp && apiKey.allowedIps.length > 0) {
      if (!this.isIpAllowed(clientIp, apiKey.allowedIps)) {
        logger.warn({ keyId: apiKey.id, clientIp, allowedIps: apiKey.allowedIps }, 'IP not in allowlist');
        return { valid: false, apiKey, error: 'ip_blocked' };
      }
    }

    // Check rate limits
    const rateLimitCheck = await this.checkRateLimit(apiKey.id, apiKey.rateLimitPerMinute, apiKey.rateLimitPerDay);
    if (!rateLimitCheck.allowed) {
      return { 
        valid: false, 
        apiKey, 
        error: 'rate_limited',
        retryAfter: rateLimitCheck.retryAfter,
      };
    }

    // Update last_used_at (non-blocking)
    this.updateLastUsed(apiKey.id).catch(() => {});

    return { valid: true, apiKey };
  }

  /**
   * Check if a key has a specific scope
   */
  hasScope(apiKey: ApiKey, requiredScope: string): boolean {
    // Wildcard allows everything
    if (apiKey.scopes.includes('*')) {
      return true;
    }

    // Exact match
    if (apiKey.scopes.includes(requiredScope)) {
      return true;
    }

    // Category wildcard (e.g., 'plugins:*' matches 'plugins:execute')
    for (const scope of apiKey.scopes) {
      if (scope.endsWith(':*')) {
        const category = scope.slice(0, -2);
        if (requiredScope.startsWith(category + ':')) {
          return true;
        }
      }
    }

    return false;
  }

  // =========================================================================
  // CRUD Operations
  // =========================================================================

  /**
   * List all API keys (without the actual key values)
   */
  async listApiKeys(options?: { 
    includeRevoked?: boolean;
    includeExpired?: boolean;
    createdBy?: string;
  }): Promise<ApiKey[]> {
    let query = `
      SELECT *
      FROM api_keys
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (!options?.includeRevoked) {
      query += ` AND revoked_at IS NULL`;
    }

    if (!options?.includeExpired) {
      query += ` AND (expires_at IS NULL OR expires_at > NOW())`;
    }

    if (options?.createdBy) {
      params.push(options.createdBy);
      query += ` AND created_by = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await databaseService.query(query, params);
    return result.rows.map(row => this.rowToApiKey(row));
  }

  /**
   * Get a single API key by ID
   */
  async getApiKey(id: string): Promise<ApiKey | null> {
    const query = `SELECT * FROM api_keys WHERE id = $1`;
    const result = await databaseService.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToApiKey(result.rows[0]);
  }

  /**
   * Update API key settings
   */
  async updateApiKey(id: string, updates: UpdateApiKeyRequest): Promise<ApiKey | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(updates.description || null);
    }

    if (updates.expiresAt !== undefined) {
      setClauses.push(`expires_at = $${paramIndex++}`);
      values.push(updates.expiresAt ? new Date(updates.expiresAt) : null);
    }

    if (updates.scopes !== undefined) {
      setClauses.push(`scopes = $${paramIndex++}`);
      values.push(JSON.stringify(updates.scopes));
    }

    if (updates.allowedIps !== undefined) {
      setClauses.push(`allowed_ips = $${paramIndex++}`);
      values.push(updates.allowedIps);
    }

    if (updates.rateLimitPerMinute !== undefined) {
      setClauses.push(`rate_limit_per_minute = $${paramIndex++}`);
      values.push(updates.rateLimitPerMinute);
    }

    if (updates.rateLimitPerDay !== undefined) {
      setClauses.push(`rate_limit_per_day = $${paramIndex++}`);
      values.push(updates.rateLimitPerDay);
    }

    if (updates.metadata !== undefined) {
      setClauses.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(updates.metadata));
    }

    if (setClauses.length === 0) {
      return this.getApiKey(id);
    }

    values.push(id);

    const query = `
      UPDATE api_keys
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await databaseService.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    logger.info({ keyId: id }, 'API key updated');
    return this.rowToApiKey(result.rows[0]);
  }

  /**
   * Revoke an API key (soft delete)
   */
  async revokeApiKey(id: string): Promise<boolean> {
    const query = `
      UPDATE api_keys
      SET is_active = false, revoked_at = NOW()
      WHERE id = $1 AND revoked_at IS NULL
      RETURNING id
    `;

    const result = await databaseService.query(query, [id]);

    if (result.rows.length > 0) {
      logger.info({ keyId: id }, 'API key revoked');
      return true;
    }

    return false;
  }

  /**
   * Reactivate a revoked API key
   */
  async reactivateApiKey(id: string): Promise<ApiKey | null> {
    const query = `
      UPDATE api_keys
      SET is_active = true, revoked_at = NULL
      WHERE id = $1
      RETURNING *
    `;

    const result = await databaseService.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    logger.info({ keyId: id }, 'API key reactivated');
    return this.rowToApiKey(result.rows[0]);
  }

  /**
   * Permanently delete an API key
   */
  async deleteApiKey(id: string): Promise<boolean> {
    const query = `DELETE FROM api_keys WHERE id = $1 RETURNING id`;
    const result = await databaseService.query(query, [id]);

    if (result.rows.length > 0) {
      logger.info({ keyId: id }, 'API key deleted');
      return true;
    }

    return false;
  }

  // =========================================================================
  // Scopes Management
  // =========================================================================

  /**
   * Get all available scopes
   */
  async getAvailableScopes(): Promise<ApiKeyScope[]> {
    const query = `
      SELECT id, name, description, category
      FROM api_key_scopes
      ORDER BY category, id
    `;

    const result = await databaseService.query(query, []);
    return result.rows;
  }

  // =========================================================================
  // Rate Limiting
  // =========================================================================

  /**
   * Check rate limits for a key
   */
  private async checkRateLimit(
    keyId: string, 
    minuteLimit: number, 
    dayLimit: number
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    // Increment both counters atomically and get current counts
    const query = `
      WITH minute_count AS (
        SELECT increment_rate_limit($1, 'minute') AS count
      ),
      day_count AS (
        SELECT increment_rate_limit($1, 'day') AS count
      )
      SELECT 
        (SELECT count FROM minute_count) AS minute_count,
        (SELECT count FROM day_count) AS day_count
    `;

    try {
      const result = await databaseService.query(query, [keyId]);
      const { minute_count, day_count } = result.rows[0];

      if (minute_count > minuteLimit) {
        // Calculate seconds until next minute
        const now = new Date();
        const retryAfter = 60 - now.getSeconds();
        return { allowed: false, retryAfter };
      }

      if (day_count > dayLimit) {
        // Calculate seconds until midnight
        const now = new Date();
        const midnight = new Date(now);
        midnight.setDate(midnight.getDate() + 1);
        midnight.setHours(0, 0, 0, 0);
        const retryAfter = Math.ceil((midnight.getTime() - now.getTime()) / 1000);
        return { allowed: false, retryAfter };
      }

      return { allowed: true };
    } catch (error) {
      // If rate limit check fails, allow the request (fail open)
      logger.error({ error, keyId }, 'Rate limit check failed');
      return { allowed: true };
    }
  }

  /**
   * Get current rate limit status for a key
   */
  async getRateLimitInfo(keyId: string): Promise<RateLimitInfo | null> {
    const apiKey = await this.getApiKey(keyId);
    if (!apiKey) return null;

    const now = new Date();
    const minuteStart = new Date(now);
    minuteStart.setSeconds(0, 0);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const query = `
      SELECT 
        COALESCE((SELECT request_count FROM api_key_rate_limits 
          WHERE api_key_id = $1 AND window_type = 'minute' 
          AND window_start = date_trunc('minute', NOW())), 0) AS minute_count,
        COALESCE((SELECT request_count FROM api_key_rate_limits 
          WHERE api_key_id = $1 AND window_type = 'day' 
          AND window_start = date_trunc('day', NOW())), 0) AS day_count
    `;

    const result = await databaseService.query(query, [keyId]);
    const { minute_count, day_count } = result.rows[0];

    const resetMinute = new Date(minuteStart);
    resetMinute.setMinutes(resetMinute.getMinutes() + 1);

    const resetDay = new Date(dayStart);
    resetDay.setDate(resetDay.getDate() + 1);

    return {
      minuteCount: parseInt(minute_count),
      minuteLimit: apiKey.rateLimitPerMinute,
      dayCount: parseInt(day_count),
      dayLimit: apiKey.rateLimitPerDay,
      minuteRemaining: Math.max(0, apiKey.rateLimitPerMinute - parseInt(minute_count)),
      dayRemaining: Math.max(0, apiKey.rateLimitPerDay - parseInt(day_count)),
      resetMinute,
      resetDay,
    };
  }

  // =========================================================================
  // Usage Logging & Analytics
  // =========================================================================

  /**
   * Log API key usage with enhanced details
   */
  async logUsage(
    keyId: string,
    integrationId: string | null,
    endpoint: string,
    method: string,
    statusCode: number,
    options?: {
      ipAddress?: string;
      userAgent?: string;
      responseTimeMs?: number;
      requestBodySize?: number;
      responseBodySize?: number;
      errorMessage?: string;
    }
  ): Promise<void> {
    const query = `
      INSERT INTO api_key_usage (
        api_key_id, integration_id, endpoint, method, status_code,
        ip_address, user_agent, response_time_ms, request_body_size, 
        response_body_size, error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    try {
      await databaseService.query(query, [
        keyId,
        integrationId,
        endpoint,
        method,
        statusCode,
        options?.ipAddress || null,
        options?.userAgent || null,
        options?.responseTimeMs || null,
        options?.requestBodySize || null,
        options?.responseBodySize || null,
        options?.errorMessage || null,
      ]);
    } catch (error) {
      // Don't fail the request if logging fails
      logger.error({ error, keyId }, 'Failed to log API key usage');
    }
  }

  /**
   * Get analytics for all keys or a specific key
   */
  async getAnalytics(keyId?: string): Promise<ApiKeyAnalytics[]> {
    let query = `SELECT * FROM api_key_analytics`;
    const params: unknown[] = [];

    if (keyId) {
      query += ` WHERE api_key_id = $1`;
      params.push(keyId);
    }

    query += ` ORDER BY total_requests DESC`;

    const result = await databaseService.query(query, params);

    return result.rows.map(row => ({
      apiKeyId: row.api_key_id,
      apiKeyName: row.api_key_name,
      keyPrefix: row.key_prefix,
      isActive: row.is_active,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      status: row.status as ApiKeyStatus,
      totalRequests: parseInt(row.total_requests) || 0,
      requests24h: parseInt(row.requests_24h) || 0,
      requests7d: parseInt(row.requests_7d) || 0,
      errorCount: parseInt(row.error_count) || 0,
      avgResponseTimeMs: row.avg_response_time_ms ? parseFloat(row.avg_response_time_ms) : undefined,
      lastRequestAt: row.last_request_at,
    }));
  }

  /**
   * Get usage history for a specific key
   */
  async getUsageHistory(
    keyId: string, 
    options?: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
      statusCode?: number;
    }
  ): Promise<{ entries: UsageLogEntry[]; total: number }> {
    let whereClause = 'WHERE api_key_id = $1';
    const params: unknown[] = [keyId];
    let paramIndex = 2;

    if (options?.startDate) {
      whereClause += ` AND created_at >= $${paramIndex++}`;
      params.push(options.startDate);
    }

    if (options?.endDate) {
      whereClause += ` AND created_at <= $${paramIndex++}`;
      params.push(options.endDate);
    }

    if (options?.statusCode) {
      whereClause += ` AND status_code = $${paramIndex++}`;
      params.push(options.statusCode);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM api_key_usage ${whereClause}`;
    const countResult = await databaseService.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get entries
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    
    const query = `
      SELECT *
      FROM api_key_usage
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    params.push(limit, offset);
    const result = await databaseService.query(query, params);

    const entries: UsageLogEntry[] = result.rows.map(row => ({
      id: row.id,
      apiKeyId: row.api_key_id,
      integrationId: row.integration_id,
      endpoint: row.endpoint,
      method: row.method,
      statusCode: row.status_code,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      responseTimeMs: row.response_time_ms,
      requestBodySize: row.request_body_size,
      responseBodySize: row.response_body_size,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    }));

    return { entries, total };
  }

  /**
   * Get aggregated usage stats
   */
  async getUsageStats(
    keyId?: string,
    options?: { days?: number }
  ): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    avgResponseTime: number;
    requestsByDay: { date: string; count: number }[];
    requestsByEndpoint: { endpoint: string; count: number }[];
    errorsByType: { statusCode: number; count: number }[];
  }> {
    const days = options?.days || 30;
    let whereClause = `WHERE created_at > NOW() - INTERVAL '${days} days'`;
    const params: unknown[] = [];

    if (keyId) {
      params.push(keyId);
      whereClause += ` AND api_key_id = $${params.length}`;
    }

    const query = `
      WITH usage AS (
        SELECT * FROM api_key_usage ${whereClause}
      )
      SELECT 
        COUNT(*) AS total_requests,
        COUNT(*) FILTER (WHERE status_code < 400) AS successful_requests,
        COUNT(*) FILTER (WHERE status_code >= 400) AS failed_requests,
        ROUND(AVG(response_time_ms)::numeric, 2) AS avg_response_time
      FROM usage
    `;

    const statsResult = await databaseService.query(query, params);
    const stats = statsResult.rows[0];

    // Requests by day
    const byDayQuery = `
      SELECT 
        DATE(created_at) AS date,
        COUNT(*) AS count
      FROM api_key_usage
      ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY date
    `;
    const byDayResult = await databaseService.query(byDayQuery, params);

    // Requests by endpoint  
    const byEndpointQuery = `
      SELECT endpoint, COUNT(*) AS count
      FROM api_key_usage
      ${whereClause}
      GROUP BY endpoint
      ORDER BY count DESC
      LIMIT 20
    `;
    const byEndpointResult = await databaseService.query(byEndpointQuery, params);

    // Errors by status code
    const errorsQuery = `
      SELECT status_code, COUNT(*) AS count
      FROM api_key_usage
      ${whereClause} AND status_code >= 400
      GROUP BY status_code
      ORDER BY count DESC
    `;
    const errorsResult = await databaseService.query(errorsQuery, params);

    return {
      totalRequests: parseInt(stats.total_requests) || 0,
      successfulRequests: parseInt(stats.successful_requests) || 0,
      failedRequests: parseInt(stats.failed_requests) || 0,
      avgResponseTime: stats.avg_response_time ? parseFloat(stats.avg_response_time) : 0,
      requestsByDay: byDayResult.rows.map(r => ({
        date: r.date.toISOString().split('T')[0],
        count: parseInt(r.count),
      })),
      requestsByEndpoint: byEndpointResult.rows.map(r => ({
        endpoint: r.endpoint,
        count: parseInt(r.count),
      })),
      errorsByType: errorsResult.rows.map(r => ({
        statusCode: r.status_code,
        count: parseInt(r.count),
      })),
    };
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  /**
   * Update last_used_at timestamp
   */
  private async updateLastUsed(id: string): Promise<void> {
    const query = `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`;
    try {
      await databaseService.query(query, [id]);
    } catch (error) {
      logger.error({ error, keyId: id }, 'Failed to update last_used_at');
    }
  }

  /**
   * Hash a key using SHA-256
   */
  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Check if an IP is allowed
   */
  private isIpAllowed(clientIp: string, allowedIps: string[]): boolean {
    for (const allowed of allowedIps) {
      if (allowed === clientIp) {
        return true;
      }
      // Simple CIDR check for /24 ranges
      if (allowed.includes('/')) {
        const [range, bits] = allowed.split('/');
        const rangeParts = range.split('.');
        const clientParts = clientIp.split('.');
        const maskBits = parseInt(bits);
        
        if (maskBits === 24) {
          if (rangeParts.slice(0, 3).join('.') === clientParts.slice(0, 3).join('.')) {
            return true;
          }
        } else if (maskBits === 16) {
          if (rangeParts.slice(0, 2).join('.') === clientParts.slice(0, 2).join('.')) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Convert database row to ApiKey object
   */
  private rowToApiKey(row: Record<string, unknown>): ApiKey {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      keyPrefix: row.key_prefix as string,
      isActive: row.is_active as boolean,
      lastUsedAt: row.last_used_at as Date | undefined,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
      revokedAt: row.revoked_at as Date | undefined,
      expiresAt: row.expires_at as Date | undefined,
      scopes: this.parseScopes(row.scopes),
      allowedIps: (row.allowed_ips as string[]) || [],
      rateLimitPerMinute: (row.rate_limit_per_minute as number) || 60,
      rateLimitPerDay: (row.rate_limit_per_day as number) || 10000,
      createdBy: row.created_by as string | undefined,
      metadata: this.parseMetadata(row.metadata),
    };
  }

  /**
   * Parse scopes from database (handles both string and array)
   */
  private parseScopes(scopes: unknown): string[] {
    if (Array.isArray(scopes)) {
      return scopes;
    }
    if (typeof scopes === 'string') {
      try {
        return JSON.parse(scopes);
      } catch {
        return ['*'];
      }
    }
    return ['*'];
  }

  /**
   * Parse metadata from database
   */
  private parseMetadata(metadata: unknown): Record<string, unknown> {
    if (typeof metadata === 'object' && metadata !== null) {
      return metadata as Record<string, unknown>;
    }
    if (typeof metadata === 'string') {
      try {
        return JSON.parse(metadata);
      } catch {
        return {};
      }
    }
    return {};
  }

  /**
   * Get key status
   */
  getKeyStatus(apiKey: ApiKey): ApiKeyStatus {
    if (apiKey.revokedAt) return 'revoked';
    if (!apiKey.isActive) return 'inactive';
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) return 'expired';
    return 'active';
  }

  /**
   * Cleanup expired rate limit records (call periodically)
   */
  async cleanupRateLimits(): Promise<number> {
    const query = `
      DELETE FROM api_key_rate_limits 
      WHERE window_start < NOW() - INTERVAL '2 days'
      RETURNING id
    `;
    const result = await databaseService.query(query, []);
    return result.rowCount || 0;
  }
}

export const apiKeyService = new ApiKeyService();
