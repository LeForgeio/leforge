import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { PluginInstance, PluginStatus, PluginEvent, RegistrySource } from '../types/index.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Database service for plugin persistence
 * Handles all PostgreSQL operations for plugin state management
 */
export class DatabaseService {
  private pool: Pool;
  private initialized: boolean = false;

  constructor() {
    this.pool = new Pool({
      host: config.postgres.host,
      port: config.postgres.port,
      user: config.postgres.user,
      password: config.postgres.password,
      database: config.postgres.database,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error({ error: err }, 'Unexpected database pool error');
    });

    logger.info(
      {
        host: config.postgres.host,
        port: config.postgres.port,
        database: config.postgres.database,
      },
      'Database service initialized'
    );
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      logger.info('Database connection established');
    } catch (error) {
      logger.error({ error }, 'Failed to connect to database');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
    logger.info('Database connection closed');
  }

  async isHealthy(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Migrations
  // ==========================================================================

  async runMigrations(): Promise<void> {
    if (this.initialized) {
      logger.debug('Migrations already run');
      return;
    }

    const client = await this.pool.connect();

    try {
      logger.info('Running database migrations');

      // Get migration files
      const migrationsDir = path.join(__dirname, '../../migrations');
      const files = await fs.readdir(migrationsDir);
      const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

      // Execute each migration in order
      for (const file of sqlFiles) {
        const migrationPath = path.join(migrationsDir, file);
        const migrationSQL = await fs.readFile(migrationPath, 'utf-8');
        logger.info({ migration: file }, 'Running migration');
        await client.query(migrationSQL);
      }

      this.initialized = true;
      logger.info('Database migrations completed successfully');

    } catch (error) {
      logger.error({ error }, 'Migration failed');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // Plugin CRUD Operations
  // ==========================================================================

  /**
   * Create a new plugin record
   */
  async createPlugin(plugin: PluginInstance): Promise<void> {
    const query = `
      INSERT INTO plugins (
        id, forgehook_id, manifest, status, runtime_type, container_id, container_name,
        host_port, module_code, module_exports, module_loaded, config, environment, installed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (forgehook_id) DO UPDATE SET
        manifest = EXCLUDED.manifest,
        status = EXCLUDED.status,
        runtime_type = EXCLUDED.runtime_type,
        container_id = EXCLUDED.container_id,
        container_name = EXCLUDED.container_name,
        host_port = EXCLUDED.host_port,
        module_code = EXCLUDED.module_code,
        module_exports = EXCLUDED.module_exports,
        module_loaded = EXCLUDED.module_loaded,
        config = EXCLUDED.config,
        environment = EXCLUDED.environment,
        updated_at = NOW()
    `;

    const values = [
      plugin.id,
      plugin.forgehookId,
      JSON.stringify(plugin.manifest),
      plugin.status,
      plugin.runtime || 'container',
      plugin.containerId || null,
      plugin.containerName || null,
      plugin.hostPort || null,
      null, // module_code - stored separately
      plugin.moduleExports || null,
      plugin.moduleLoaded || false,
      JSON.stringify(plugin.config),
      JSON.stringify(plugin.environment),
      plugin.installedAt,
    ];

    try {
      await this.pool.query(query, values);
      logger.debug({ pluginId: plugin.id }, 'Plugin created in database');
    } catch (error) {
      logger.error({ error, pluginId: plugin.id }, 'Failed to create plugin');
      throw error;
    }
  }

  /**
   * Update plugin status and metadata
   */
  async updatePlugin(
    pluginId: string,
    updates: Partial<{
      status: PluginStatus;
      containerId: string | null;
      startedAt: Date | null;
      stoppedAt: Date | null;
      healthStatus: string | null;
      lastHealthCheck: Date | null;
      error: string | null;
      config: Record<string, unknown>;
      environment: Record<string, string>;
      manifest: unknown;
      moduleCode: string | null;
      installedVersion: string | null;
      previousVersion: string | null;
      previousModuleCode: string | null;
      previousImageTag: string | null;
      bundleUrl: string | null;
      lastUpdatedAt: Date | null;
    }>
  ): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // Build dynamic UPDATE query
    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.containerId !== undefined) {
      fields.push(`container_id = $${paramIndex++}`);
      values.push(updates.containerId);
    }
    if (updates.startedAt !== undefined) {
      fields.push(`started_at = $${paramIndex++}`);
      values.push(updates.startedAt);
    }
    if (updates.stoppedAt !== undefined) {
      fields.push(`stopped_at = $${paramIndex++}`);
      values.push(updates.stoppedAt);
    }
    if (updates.healthStatus !== undefined) {
      fields.push(`health_status = $${paramIndex++}`);
      values.push(updates.healthStatus);
    }
    if (updates.lastHealthCheck !== undefined) {
      fields.push(`last_health_check = $${paramIndex++}`);
      values.push(updates.lastHealthCheck);
    }
    if (updates.error !== undefined) {
      fields.push(`error = $${paramIndex++}`);
      values.push(updates.error);
    }
    if (updates.config !== undefined) {
      fields.push(`config = $${paramIndex++}`);
      values.push(JSON.stringify(updates.config));
    }
    if (updates.environment !== undefined) {
      fields.push(`environment = $${paramIndex++}`);
      values.push(JSON.stringify(updates.environment));
    }
    if (updates.manifest !== undefined) {
      fields.push(`manifest = $${paramIndex++}`);
      values.push(JSON.stringify(updates.manifest));
    }
    if (updates.moduleCode !== undefined) {
      fields.push(`module_code = $${paramIndex++}`);
      values.push(updates.moduleCode);
    }
    if (updates.installedVersion !== undefined) {
      fields.push(`installed_version = $${paramIndex++}`);
      values.push(updates.installedVersion);
    }
    if (updates.previousVersion !== undefined) {
      fields.push(`previous_version = $${paramIndex++}`);
      values.push(updates.previousVersion);
    }
    if (updates.previousModuleCode !== undefined) {
      fields.push(`previous_module_code = $${paramIndex++}`);
      values.push(updates.previousModuleCode);
    }
    if (updates.previousImageTag !== undefined) {
      fields.push(`previous_image_tag = $${paramIndex++}`);
      values.push(updates.previousImageTag);
    }
    if (updates.bundleUrl !== undefined) {
      fields.push(`bundle_url = $${paramIndex++}`);
      values.push(updates.bundleUrl);
    }
    if (updates.lastUpdatedAt !== undefined) {
      fields.push(`last_updated_at = $${paramIndex++}`);
      values.push(updates.lastUpdatedAt);
    }

    if (fields.length === 0) {
      logger.debug({ pluginId }, 'No fields to update');
      return;
    }

    // Add WHERE clause
    values.push(pluginId);
    const query = `
      UPDATE plugins
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
    `;

    try {
      const result = await this.pool.query(query, values);
      if (result.rowCount === 0) {
        logger.warn({ pluginId }, 'Plugin not found for update');
      } else {
        logger.debug({ pluginId, updates }, 'Plugin updated in database');
      }
    } catch (error) {
      logger.error({ error, pluginId }, 'Failed to update plugin');
      throw error;
    }
  }

  /**
   * Get plugin by ID
   */
  async getPlugin(pluginId: string): Promise<PluginInstance | null> {
    const query = `
      SELECT * FROM plugins WHERE id = $1
    `;

    try {
      const result = await this.pool.query(query, [pluginId]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.rowToPluginInstance(result.rows[0]);
    } catch (error) {
      logger.error({ error, pluginId }, 'Failed to get plugin');
      throw error;
    }
  }

  /**
   * Get plugin by ForgeHook ID
   */
  async getPluginByForgehookId(forgehookId: string): Promise<PluginInstance | null> {
    const query = `
      SELECT * FROM plugins WHERE forgehook_id = $1
    `;

    try {
      const result = await this.pool.query(query, [forgehookId]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.rowToPluginInstance(result.rows[0]);
    } catch (error) {
      logger.error({ error, forgehookId }, 'Failed to get plugin by forgehook ID');
      throw error;
    }
  }

  /**
   * List all plugins
   */
  async listPlugins(filters?: {
    status?: PluginStatus;
    forgehookIds?: string[];
  }): Promise<PluginInstance[]> {
    let query = 'SELECT * FROM plugins';
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }

    if (filters?.forgehookIds && filters.forgehookIds.length > 0) {
      conditions.push(`forgehook_id = ANY($${paramIndex++})`);
      values.push(filters.forgehookIds);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY installed_at DESC';

    try {
      const result = await this.pool.query(query, values);
      return result.rows.map((row) => this.rowToPluginInstance(row));
    } catch (error) {
      logger.error({ error }, 'Failed to list plugins');
      throw error;
    }
  }

  /**
   * Delete plugin
   */
  async deletePlugin(pluginId: string): Promise<void> {
    const query = 'DELETE FROM plugins WHERE id = $1';

    try {
      const result = await this.pool.query(query, [pluginId]);
      if (result.rowCount === 0) {
        logger.warn({ pluginId }, 'Plugin not found for deletion');
      } else {
        logger.debug({ pluginId }, 'Plugin deleted from database');
      }
    } catch (error) {
      logger.error({ error, pluginId }, 'Failed to delete plugin');
      throw error;
    }
  }

  /**
   * Get all used ports
   */
  async getUsedPorts(): Promise<number[]> {
    const query = 'SELECT host_port FROM plugins ORDER BY host_port';

    try {
      const result = await this.pool.query(query);
      return result.rows.map((row) => row.host_port);
    } catch (error) {
      logger.error({ error }, 'Failed to get used ports');
      return [];
    }
  }

  // ==========================================================================
  // Plugin Events (Audit Log)
  // ==========================================================================

  /**
   * Log plugin event
   */
  async logEvent(event: PluginEvent): Promise<void> {
    const query = `
      INSERT INTO plugin_events (plugin_id, event_type, data, timestamp)
      VALUES ($1, $2, $3, $4)
    `;

    try {
      await this.pool.query(query, [
        event.pluginId,
        event.type,
        JSON.stringify(event.data || {}),
        event.timestamp,
      ]);
      logger.debug({ event }, 'Plugin event logged');
    } catch (error) {
      // Don't throw - event logging is non-critical
      logger.warn({ error, event }, 'Failed to log plugin event');
    }
  }

  /**
   * Get plugin events
   */
  async getPluginEvents(
    pluginId: string,
    limit: number = 100
  ): Promise<PluginEvent[]> {
    const query = `
      SELECT * FROM plugin_events
      WHERE plugin_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;

    try {
      const result = await this.pool.query(query, [pluginId, limit]);
      return result.rows.map((row) => ({
        type: row.event_type,
        pluginId: row.plugin_id,
        timestamp: row.timestamp,
        data: row.data,
      }));
    } catch (error) {
      logger.error({ error, pluginId }, 'Failed to get plugin events');
      return [];
    }
  }

  // ==========================================================================
  // Plugin Update History
  // ==========================================================================

  /**
   * Log plugin update attempt
   */
  async logUpdateHistory(
    pluginId: string,
    fromVersion: string | null,
    toVersion: string,
    updateType: 'online' | 'upload' | 'rollback',
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    const query = `
      INSERT INTO plugin_update_history (
        plugin_id, from_version, to_version, update_type, success, error_message, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `;

    try {
      await this.pool.query(query, [
        pluginId,
        fromVersion,
        toVersion,
        updateType,
        success,
        errorMessage || null,
      ]);
      logger.debug({ pluginId, fromVersion, toVersion, success }, 'Plugin update logged');
    } catch (error) {
      logger.warn({ error, pluginId }, 'Failed to log plugin update history');
    }
  }

  /**
   * Get plugin update history
   */
  async getPluginUpdateHistory(
    pluginId: string,
    limit: number = 20
  ): Promise<Array<{
    fromVersion: string | null;
    toVersion: string;
    updateType: string;
    success: boolean;
    errorMessage: string | null;
    startedAt: Date;
    completedAt: Date | null;
  }>> {
    const query = `
      SELECT * FROM plugin_update_history
      WHERE plugin_id = $1
      ORDER BY started_at DESC
      LIMIT $2
    `;

    try {
      const result = await this.pool.query(query, [pluginId, limit]);
      return result.rows.map((row) => ({
        fromVersion: row.from_version,
        toVersion: row.to_version,
        updateType: row.update_type,
        success: row.success,
        errorMessage: row.error_message,
        startedAt: new Date(row.started_at),
        completedAt: row.completed_at ? new Date(row.completed_at) : null,
      }));
    } catch (error) {
      logger.error({ error, pluginId }, 'Failed to get plugin update history');
      return [];
    }
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Convert database row to PluginInstance
   */
  private rowToPluginInstance(row: any): PluginInstance {
    return {
      id: row.id,
      forgehookId: row.forgehook_id,
      manifest: row.manifest,
      status: row.status,
      runtime: row.runtime_type || 'container',
      containerId: row.container_id,
      containerName: row.container_name,
      hostPort: row.host_port,
      config: row.config || {},
      environment: row.environment || {},
      installedAt: new Date(row.installed_at),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      stoppedAt: row.stopped_at ? new Date(row.stopped_at) : undefined,
      lastHealthCheck: row.last_health_check ? new Date(row.last_health_check) : undefined,
      healthStatus: row.health_status,
      error: row.error,
      moduleLoaded: row.module_loaded,
      moduleExports: row.module_exports,
      moduleCode: row.module_code,
      installedVersion: row.installed_version,
      previousVersion: row.previous_version,
      bundleUrl: row.bundle_url,
      lastUpdatedAt: row.last_updated_at ? new Date(row.last_updated_at) : undefined,
    };
  }

  /**
   * Execute raw query (for advanced use cases)
   */
  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    return this.pool.query(sql, params);
  }

  /**
   * Get a client from the pool (for transactions)
   */
  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  // ==========================================================================
  // Registry Sources
  // ==========================================================================

  /**
   * List all registry sources
   */
  async listRegistrySources(enabledOnly: boolean = false): Promise<RegistrySource[]> {
    let query = 'SELECT * FROM registry_sources';
    if (enabledOnly) {
      query += ' WHERE enabled = true';
    }
    query += ' ORDER BY priority ASC, created_at ASC';

    try {
      const result = await this.pool.query(query);
      return result.rows.map((row) => this.rowToRegistrySource(row));
    } catch (error) {
      logger.error({ error }, 'Failed to list registry sources');
      return [];
    }
  }

  /**
   * Get registry source by ID
   */
  async getRegistrySource(sourceId: string): Promise<RegistrySource | null> {
    const query = 'SELECT * FROM registry_sources WHERE id = $1';

    try {
      const result = await this.pool.query(query, [sourceId]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.rowToRegistrySource(result.rows[0]);
    } catch (error) {
      logger.error({ error, sourceId }, 'Failed to get registry source');
      throw error;
    }
  }

  /**
   * Create registry source
   */
  async createRegistrySource(source: Omit<RegistrySource, 'id' | 'createdAt' | 'updatedAt'>): Promise<RegistrySource> {
    const query = `
      INSERT INTO registry_sources (
        name, description, url, source_type, github_owner, github_repo,
        github_branch, github_path, enabled, is_official, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      source.name,
      source.description || null,
      source.url,
      source.sourceType,
      source.githubOwner || null,
      source.githubRepo || null,
      source.githubBranch || 'main',
      source.githubPath || 'registry.json',
      source.enabled ?? true,
      source.isOfficial ?? false,
      source.priority ?? 100,
    ];

    try {
      const result = await this.pool.query(query, values);
      logger.info({ sourceName: source.name }, 'Registry source created');
      return this.rowToRegistrySource(result.rows[0]);
    } catch (error) {
      logger.error({ error, source }, 'Failed to create registry source');
      throw error;
    }
  }

  /**
   * Update registry source
   */
  async updateRegistrySource(
    sourceId: string,
    updates: Partial<RegistrySource>
  ): Promise<RegistrySource | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.url !== undefined) {
      fields.push(`url = $${paramIndex++}`);
      values.push(updates.url);
    }
    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${paramIndex++}`);
      values.push(updates.enabled);
    }
    if (updates.priority !== undefined) {
      fields.push(`priority = $${paramIndex++}`);
      values.push(updates.priority);
    }
    if (updates.cachedIndex !== undefined) {
      fields.push(`cached_index = $${paramIndex++}`);
      values.push(JSON.stringify(updates.cachedIndex));
    }
    if (updates.lastFetched !== undefined) {
      fields.push(`last_fetched = $${paramIndex++}`);
      values.push(updates.lastFetched);
    }
    if (updates.fetchError !== undefined) {
      fields.push(`fetch_error = $${paramIndex++}`);
      values.push(updates.fetchError);
    }

    if (fields.length === 0) {
      return this.getRegistrySource(sourceId);
    }

    values.push(sourceId);
    const query = `
      UPDATE registry_sources
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await this.pool.query(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      return this.rowToRegistrySource(result.rows[0]);
    } catch (error) {
      logger.error({ error, sourceId }, 'Failed to update registry source');
      throw error;
    }
  }

  /**
   * Delete registry source
   */
  async deleteRegistrySource(sourceId: string): Promise<boolean> {
    // Don't allow deleting official sources
    const source = await this.getRegistrySource(sourceId);
    if (source?.isOfficial) {
      throw new Error('Cannot delete official registry source');
    }

    const query = 'DELETE FROM registry_sources WHERE id = $1';

    try {
      const result = await this.pool.query(query, [sourceId]);
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      logger.error({ error, sourceId }, 'Failed to delete registry source');
      throw error;
    }
  }

  /**
   * Convert database row to RegistrySource
   */
  private rowToRegistrySource(row: any): RegistrySource {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      url: row.url,
      sourceType: row.source_type,
      githubOwner: row.github_owner,
      githubRepo: row.github_repo,
      githubBranch: row.github_branch,
      githubPath: row.github_path,
      enabled: row.enabled,
      isOfficial: row.is_official,
      cachedIndex: row.cached_index,
      lastFetched: row.last_fetched ? new Date(row.last_fetched) : undefined,
      fetchError: row.fetch_error,
      priority: row.priority,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// Singleton instance
export const databaseService = new DatabaseService();
