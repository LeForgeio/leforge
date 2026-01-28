import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { databaseService } from './database.service.js';

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
}

export interface CreateApiKeyRequest {
  name: string;
  description?: string;
}

export interface CreateApiKeyResponse {
  apiKey: ApiKey;
  plainTextKey: string; // Only returned once at creation
}

/**
 * API Key Service
 * Handles generation, validation, and management of API keys for external integrations
 */
class ApiKeyService {
  private readonly KEY_PREFIX = 'fhk_'; // LeForge Hook key prefix
  private readonly KEY_LENGTH = 32; // 32 bytes = 64 hex chars

  /**
   * Generate a new API key
   */
  async createApiKey(request: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    // Generate random key
    const randomBytes = crypto.randomBytes(this.KEY_LENGTH);
    const keyBody = randomBytes.toString('hex');
    const plainTextKey = `${this.KEY_PREFIX}${keyBody}`;
    
    // Hash the key for storage
    const keyHash = this.hashKey(plainTextKey);
    const keyPrefix = plainTextKey.substring(0, 12); // "fhk_" + 8 chars

    const id = crypto.randomUUID();

    const query = `
      INSERT INTO api_keys (id, name, description, key_hash, key_prefix, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING id, name, description, key_prefix, is_active, last_used_at, created_at, updated_at, revoked_at
    `;

    const result = await databaseService.query(query, [
      id,
      request.name,
      request.description || null,
      keyHash,
      keyPrefix,
    ]);

    const row = result.rows[0];
    const apiKey: ApiKey = {
      id: row.id,
      name: row.name,
      description: row.description,
      keyPrefix: row.key_prefix,
      isActive: row.is_active,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revokedAt: row.revoked_at,
    };

    logger.info({ keyId: id, name: request.name }, 'API key created');

    return {
      apiKey,
      plainTextKey, // Only returned once!
    };
  }

  /**
   * Validate an API key and return the key record if valid
   */
  async validateKey(plainTextKey: string): Promise<ApiKey | null> {
    if (!plainTextKey || !plainTextKey.startsWith(this.KEY_PREFIX)) {
      return null;
    }

    const keyHash = this.hashKey(plainTextKey);

    const query = `
      SELECT id, name, description, key_prefix, is_active, last_used_at, created_at, updated_at, revoked_at
      FROM api_keys
      WHERE key_hash = $1 AND is_active = true AND revoked_at IS NULL
    `;

    const result = await databaseService.query(query, [keyHash]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Update last_used_at
    await this.updateLastUsed(row.id);

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      keyPrefix: row.key_prefix,
      isActive: row.is_active,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revokedAt: row.revoked_at,
    };
  }

  /**
   * List all API keys (without the actual key values)
   */
  async listApiKeys(): Promise<ApiKey[]> {
    const query = `
      SELECT id, name, description, key_prefix, is_active, last_used_at, created_at, updated_at, revoked_at
      FROM api_keys
      ORDER BY created_at DESC
    `;

    const result = await databaseService.query(query, []);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      keyPrefix: row.key_prefix,
      isActive: row.is_active,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revokedAt: row.revoked_at,
    }));
  }

  /**
   * Get a single API key by ID
   */
  async getApiKey(id: string): Promise<ApiKey | null> {
    const query = `
      SELECT id, name, description, key_prefix, is_active, last_used_at, created_at, updated_at, revoked_at
      FROM api_keys
      WHERE id = $1
    `;

    const result = await databaseService.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      keyPrefix: row.key_prefix,
      isActive: row.is_active,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revokedAt: row.revoked_at,
    };
  }

  /**
   * Update API key name/description
   */
  async updateApiKey(id: string, updates: { name?: string; description?: string }): Promise<ApiKey | null> {
    const setClauses: string[] = [];
    const values: (string | null)[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }

    if (setClauses.length === 0) {
      return this.getApiKey(id);
    }

    values.push(id);

    const query = `
      UPDATE api_keys
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, description, key_prefix, is_active, last_used_at, created_at, updated_at, revoked_at
    `;

    const result = await databaseService.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    logger.info({ keyId: id }, 'API key updated');

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      keyPrefix: row.key_prefix,
      isActive: row.is_active,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revokedAt: row.revoked_at,
    };
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

  /**
   * Log API key usage
   */
  async logUsage(
    keyId: string,
    integrationId: string | null,
    endpoint: string,
    method: string,
    statusCode: number,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const query = `
      INSERT INTO api_key_usage (api_key_id, integration_id, endpoint, method, status_code, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    try {
      await databaseService.query(query, [
        keyId,
        integrationId,
        endpoint,
        method,
        statusCode,
        ipAddress || null,
        userAgent || null,
      ]);
    } catch (error) {
      // Don't fail the request if logging fails
      logger.error({ error, keyId }, 'Failed to log API key usage');
    }
  }

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
}

export const apiKeyService = new ApiKeyService();
