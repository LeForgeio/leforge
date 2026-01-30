import { databaseService } from './database.service.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// Types
// =============================================================================

export interface SystemSetting {
  key: string;
  value: unknown;
  description?: string;
  updatedAt: Date;
  updatedBy?: string;
}

interface DbSetting {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: Date;
  updated_by: string | null;
}

// =============================================================================
// Settings Service
// =============================================================================

class SettingsService {
  private cache: Map<string, unknown> = new Map();
  private cacheLoaded = false;

  /**
   * Load all settings into cache
   */
  async loadCache(): Promise<void> {
    if (this.cacheLoaded) return;
    
    try {
      const result = await databaseService.query('SELECT * FROM system_settings');
      for (const row of result.rows as DbSetting[]) {
        this.cache.set(row.key, row.value);
      }
      this.cacheLoaded = true;
      logger.debug({ count: result.rows.length }, 'Settings cache loaded');
    } catch {
      // Table might not exist yet
      logger.debug('Settings table not ready, using defaults');
    }
  }

  /**
   * Get a setting value
   */
  async get<T>(key: string, defaultValue?: T): Promise<T> {
    await this.loadCache();
    
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }
    
    return defaultValue as T;
  }

  /**
   * Get a setting value synchronously (from cache only)
   */
  getSync<T>(key: string, defaultValue?: T): T {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }
    return defaultValue as T;
  }

  /**
   * Set a setting value
   */
  async set(key: string, value: unknown, userId?: string): Promise<void> {
    await databaseService.query(
      `INSERT INTO system_settings (key, value, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3
       RETURNING *`,
      [key, JSON.stringify(value), userId]
    );
    
    this.cache.set(key, value);
    logger.info({ key }, 'Setting updated');
  }

  /**
   * Get all settings
   */
  async getAll(): Promise<SystemSetting[]> {
    const result = await databaseService.query('SELECT * FROM system_settings ORDER BY key');
    return (result.rows as DbSetting[]).map((row: DbSetting) => ({
      key: row.key,
      value: row.value,
      description: row.description || undefined,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by || undefined,
    }));
  }

  /**
   * Get settings by prefix
   */
  async getByPrefix(prefix: string): Promise<Record<string, unknown>> {
    const result = await databaseService.query(
      'SELECT * FROM system_settings WHERE key LIKE $1',
      [`${prefix}%`]
    );
    
    const settings: Record<string, unknown> = {};
    for (const row of result.rows as DbSetting[]) {
      const shortKey = row.key.replace(`${prefix}.`, '');
      settings[shortKey] = row.value;
    }
    return settings;
  }

  /**
   * Set multiple settings at once
   */
  async setMultiple(settings: Record<string, unknown>, userId?: string): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.set(key, value, userId);
    }
  }

  /**
   * Delete a setting
   */
  async delete(key: string): Promise<boolean> {
    const result = await databaseService.query(
      'DELETE FROM system_settings WHERE key = $1',
      [key]
    );
    this.cache.delete(key);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Clear cache (useful for testing or when settings change externally)
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheLoaded = false;
  }

  // =============================================================================
  // Auth Settings Helpers
  // =============================================================================

  async getAuthSettings() {
    return {
      mode: await this.get<string>('auth.mode', 'local'),
      sessionDuration: await this.get<string>('auth.session_duration', '24h'),
      allowRegistration: await this.get<boolean>('auth.allow_registration', false),
      requireEmailVerification: await this.get<boolean>('auth.require_email_verification', false),
    };
  }

  async getOidcSettings() {
    return {
      enabled: await this.get<boolean>('oidc.enabled', false),
      issuer: await this.get<string>('oidc.issuer', ''),
      clientId: await this.get<string>('oidc.client_id', ''),
      scopes: await this.get<string[]>('oidc.scopes', ['openid', 'profile', 'email']),
      autoCreateUsers: await this.get<boolean>('oidc.auto_create_users', true),
      defaultRole: await this.get<string>('oidc.default_role', 'user'),
    };
  }

  async updateAuthSettings(settings: Partial<{
    mode: string;
    sessionDuration: string;
    allowRegistration: boolean;
    requireEmailVerification: boolean;
  }>, userId?: string): Promise<void> {
    if (settings.mode !== undefined) {
      await this.set('auth.mode', settings.mode, userId);
    }
    if (settings.sessionDuration !== undefined) {
      await this.set('auth.session_duration', settings.sessionDuration, userId);
    }
    if (settings.allowRegistration !== undefined) {
      await this.set('auth.allow_registration', settings.allowRegistration, userId);
    }
    if (settings.requireEmailVerification !== undefined) {
      await this.set('auth.require_email_verification', settings.requireEmailVerification, userId);
    }
  }

  async updateOidcSettings(settings: Partial<{
    enabled: boolean;
    issuer: string;
    clientId: string;
    clientSecret: string;
    scopes: string[];
    autoCreateUsers: boolean;
    defaultRole: string;
  }>, userId?: string): Promise<void> {
    if (settings.enabled !== undefined) {
      await this.set('oidc.enabled', settings.enabled, userId);
    }
    if (settings.issuer !== undefined) {
      await this.set('oidc.issuer', settings.issuer, userId);
    }
    if (settings.clientId !== undefined) {
      await this.set('oidc.client_id', settings.clientId, userId);
    }
    if (settings.clientSecret !== undefined) {
      await this.set('oidc.client_secret', settings.clientSecret, userId);
    }
    if (settings.scopes !== undefined) {
      await this.set('oidc.scopes', settings.scopes, userId);
    }
    if (settings.autoCreateUsers !== undefined) {
      await this.set('oidc.auto_create_users', settings.autoCreateUsers, userId);
    }
    if (settings.defaultRole !== undefined) {
      await this.set('oidc.default_role', settings.defaultRole, userId);
    }
  }
}

// Export singleton
export const settingsService = new SettingsService();
