/**
 * Core Plugin Service
 * 
 * Manages plugins that are built into the FlowForge core.
 * These plugins don't require installation - they're always available.
 */

import { databaseService } from './database.service.js';
import { logger } from '../utils/logger.js';
import { ForgeHookManifest, PluginInstance } from '../types/index.js';
import { randomUUID } from 'crypto';

// Core plugins manifest definitions
const CORE_PLUGINS: ForgeHookManifest[] = [
  {
    id: 'qrcode-utils',
    name: 'QR Code & Barcode Generator',
    version: '1.0.0',
    description: 'Generate QR codes and barcodes (Code128, EAN-13, UPC-A) with multiple output formats (SVG, Base64 PNG, matrix). Pure TypeScript implementation - zero external dependencies. Built into FlowForge core.',
    author: {
      name: 'FlowForge Team',
      url: 'https://leforge.io',
    },
    license: 'MIT',
    repository: 'https://github.com/LeForgeio/leforge',
    icon: 'qr-code',
    category: 'utility',
    tags: ['qrcode', 'barcode', 'code128', 'ean13', 'upca', 'svg', 'core', 'built-in'],
    runtime: 'core',
    basePath: '/api/v1/utils',
    endpoints: [
      {
        method: 'POST',
        path: '/qr',
        description: 'Generate QR code as SVG',
        requestBody: { data: 'string to encode' },
      },
      {
        method: 'POST',
        path: '/qr/base64',
        description: 'Generate QR code as Base64 PNG',
        requestBody: { data: 'string to encode' },
      },
      {
        method: 'POST',
        path: '/qr/matrix',
        description: 'Generate QR code as raw matrix',
        requestBody: { data: 'string to encode' },
      },
      {
        method: 'POST',
        path: '/barcode/code128',
        description: 'Generate Code128 barcode',
        requestBody: { data: 'string to encode' },
      },
      {
        method: 'POST',
        path: '/barcode/ean13',
        description: 'Generate EAN-13 barcode',
        requestBody: { data: '13 digit number' },
      },
      {
        method: 'POST',
        path: '/barcode/upca',
        description: 'Generate UPC-A barcode',
        requestBody: { data: '12 digit number' },
      },
    ],
    resources: {
      memory: '0Mi',
      cpu: '0',
    },
  },
];

/**
 * Core Plugin Service
 */
class CorePluginService {
  private initialized = false;

  /**
   * Initialize core plugins
   * Registers all built-in core plugins in the database
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('Initializing core plugins');

    for (const manifest of CORE_PLUGINS) {
      await this.registerCorePlugin(manifest);
    }

    this.initialized = true;
    logger.info({ count: CORE_PLUGINS.length }, 'Core plugins initialized');
  }

  /**
   * Register a core plugin in the database
   */
  private async registerCorePlugin(manifest: ForgeHookManifest): Promise<void> {
    try {
      // Check if already exists
      const existing = await databaseService.getPluginByForgehookId(manifest.id);

      if (existing) {
        // Update if version changed
        if (existing.manifest.version !== manifest.version) {
          logger.info(
            { pluginId: manifest.id, oldVersion: existing.manifest.version, newVersion: manifest.version },
            'Updating core plugin'
          );
          await databaseService.updatePlugin(existing.id, {
            manifest,
            status: 'running', // Core plugins are always "running"
          });
        }
        return;
      }

      // Create new core plugin entry
      const plugin: PluginInstance = {
        id: randomUUID(),
        forgehookId: manifest.id,
        manifest,
        status: 'running', // Core plugins are always "running"
        runtime: 'core',
        config: {},
        environment: {},
        installedAt: new Date(),
        startedAt: new Date(),
        healthStatus: 'healthy',
        lastHealthCheck: new Date(),
      };

      await databaseService.createPlugin(plugin);
      logger.info({ pluginId: manifest.id, name: manifest.name }, 'Core plugin registered');
    } catch (error) {
      logger.error({ error, pluginId: manifest.id }, 'Failed to register core plugin');
    }
  }

  /**
   * Get list of core plugin IDs
   */
  getCorePluginIds(): string[] {
    return CORE_PLUGINS.map(p => p.id);
  }

  /**
   * Check if a plugin is a core plugin
   */
  isCorePlugin(forgehookId: string): boolean {
    return CORE_PLUGINS.some(p => p.id === forgehookId);
  }
}

export const corePluginService = new CorePluginService();
