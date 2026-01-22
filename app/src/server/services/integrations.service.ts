import { logger } from '../utils/logger.js';
import { databaseService } from './database.service.js';

export interface Integration {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  documentationUrl?: string;
  isEnabled: boolean;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateIntegrationRequest {
  isEnabled?: boolean;
  config?: Record<string, unknown>;
}

export interface CreateIntegrationRequest {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  documentationUrl?: string;
  isEnabled?: boolean;
  config?: Record<string, unknown>;
}

/**
 * Integrations Service
 * Manages external integration settings (enable/disable, configuration)
 */
class IntegrationsService {
  /**
   * List all integrations
   */
  async listIntegrations(): Promise<Integration[]> {
    const query = `
      SELECT id, name, description, icon, documentation_url, is_enabled, config, created_at, updated_at
      FROM integrations
      ORDER BY name ASC
    `;

    const result = await databaseService.query(query, []);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      documentationUrl: row.documentation_url,
      isEnabled: row.is_enabled,
      config: row.config || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Get a single integration by ID
   */
  async getIntegration(id: string): Promise<Integration | null> {
    const query = `
      SELECT id, name, description, icon, documentation_url, is_enabled, config, created_at, updated_at
      FROM integrations
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
      icon: row.icon,
      documentationUrl: row.documentation_url,
      isEnabled: row.is_enabled,
      config: row.config || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Check if an integration is enabled
   */
  async isIntegrationEnabled(id: string): Promise<boolean> {
    const query = `SELECT is_enabled FROM integrations WHERE id = $1`;
    const result = await databaseService.query(query, [id]);

    if (result.rows.length === 0) {
      return false;
    }

    return result.rows[0].is_enabled;
  }

  /**
   * Enable an integration
   */
  async enableIntegration(id: string): Promise<Integration | null> {
    return this.updateIntegration(id, { isEnabled: true });
  }

  /**
   * Disable an integration
   */
  async disableIntegration(id: string): Promise<Integration | null> {
    return this.updateIntegration(id, { isEnabled: false });
  }

  /**
   * Toggle integration enabled state
   */
  async toggleIntegration(id: string): Promise<Integration | null> {
    const current = await this.getIntegration(id);
    if (!current) {
      return null;
    }
    return this.updateIntegration(id, { isEnabled: !current.isEnabled });
  }

  /**
   * Update an integration's settings
   */
  async updateIntegration(id: string, updates: UpdateIntegrationRequest): Promise<Integration | null> {
    const setClauses: string[] = [];
    const values: (string | boolean | Record<string, unknown>)[] = [];
    let paramIndex = 1;

    if (updates.isEnabled !== undefined) {
      setClauses.push(`is_enabled = $${paramIndex++}`);
      values.push(updates.isEnabled);
    }

    if (updates.config !== undefined) {
      setClauses.push(`config = $${paramIndex++}`);
      values.push(JSON.stringify(updates.config));
    }

    if (setClauses.length === 0) {
      return this.getIntegration(id);
    }

    values.push(id);

    const query = `
      UPDATE integrations
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, description, icon, documentation_url, is_enabled, config, created_at, updated_at
    `;

    const result = await databaseService.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    logger.info({ integrationId: id, isEnabled: row.is_enabled }, 'Integration updated');

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      documentationUrl: row.documentation_url,
      isEnabled: row.is_enabled,
      config: row.config || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Create a new integration (for adding custom integrations)
   */
  async createIntegration(request: CreateIntegrationRequest): Promise<Integration> {
    const query = `
      INSERT INTO integrations (id, name, description, icon, documentation_url, is_enabled, config)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, description, icon, documentation_url, is_enabled, config, created_at, updated_at
    `;

    const result = await databaseService.query(query, [
      request.id,
      request.name,
      request.description || null,
      request.icon || null,
      request.documentationUrl || null,
      request.isEnabled ?? false,
      JSON.stringify(request.config || {}),
    ]);

    const row = result.rows[0];
    logger.info({ integrationId: request.id }, 'Integration created');

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      documentationUrl: row.documentation_url,
      isEnabled: row.is_enabled,
      config: row.config || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Delete an integration
   */
  async deleteIntegration(id: string): Promise<boolean> {
    const query = `DELETE FROM integrations WHERE id = $1 RETURNING id`;
    const result = await databaseService.query(query, [id]);

    if (result.rows.length > 0) {
      logger.info({ integrationId: id }, 'Integration deleted');
      return true;
    }

    return false;
  }

  /**
   * Get enabled integrations only
   */
  async getEnabledIntegrations(): Promise<Integration[]> {
    const query = `
      SELECT id, name, description, icon, documentation_url, is_enabled, config, created_at, updated_at
      FROM integrations
      WHERE is_enabled = true
      ORDER BY name ASC
    `;

    const result = await databaseService.query(query, []);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      documentationUrl: row.documentation_url,
      isEnabled: row.is_enabled,
      config: row.config || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
}

export const integrationsService = new IntegrationsService();
