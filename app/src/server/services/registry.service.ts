import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { RegistryPlugin, ForgeHookCategory } from '../types/index.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Registry Service
 * Manages the ForgeHook plugin registry (available plugins for installation)
 */
export class RegistryService {
  private plugins: RegistryPlugin[] = [];
  private registryPath: string;
  private initialized: boolean = false;

  constructor() {
    this.registryPath = path.join(__dirname, '../../registry/forgehooks-registry.json');
    logger.info({ registryPath: this.registryPath }, 'Registry service initialized');
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  async loadRegistry(): Promise<void> {
    try {
      logger.info('Loading plugin registry');

      const fileContent = await fs.readFile(this.registryPath, 'utf-8');
      const registryData = JSON.parse(fileContent);

      this.plugins = registryData.plugins || [];
      this.initialized = true;

      logger.info(
        {
          version: registryData.version,
          pluginCount: this.plugins.length,
          registry: registryData.registry?.name,
        },
        'Plugin registry loaded'
      );
    } catch (error) {
      logger.error({ error, registryPath: this.registryPath }, 'Failed to load registry');
      this.plugins = [];
      this.initialized = true;
    }
  }

  async reloadRegistry(): Promise<void> {
    logger.info('Reloading plugin registry');
    this.initialized = false;
    await this.loadRegistry();
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  listPlugins(filters?: {
    category?: ForgeHookCategory;
    verified?: boolean;
    featured?: boolean;
    search?: string;
  }): RegistryPlugin[] {
    let filtered = [...this.plugins];

    if (filters?.category) {
      filtered = filtered.filter(p => p.manifest.category === filters.category);
    }

    if (filters?.verified !== undefined) {
      filtered = filtered.filter(p => p.verified === filters.verified);
    }

    if (filters?.featured !== undefined) {
      filtered = filtered.filter(p => p.featured === filters.featured);
    }

    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(p => {
        const name = p.manifest.name.toLowerCase();
        const description = p.manifest.description.toLowerCase();
        const tags = p.manifest.tags?.join(' ').toLowerCase() || '';

        return name.includes(searchLower) ||
               description.includes(searchLower) ||
               tags.includes(searchLower);
      });
    }

    return filtered.sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return (b.downloads || 0) - (a.downloads || 0);
    });
  }

  getPlugin(pluginId: string): RegistryPlugin | null {
    return this.plugins.find(p => p.id === pluginId) || null;
  }

  searchPlugins(query: string): RegistryPlugin[] {
    return this.listPlugins({ search: query });
  }

  getPluginsByCategory(category: ForgeHookCategory): RegistryPlugin[] {
    return this.listPlugins({ category });
  }

  getFeaturedPlugins(): RegistryPlugin[] {
    return this.listPlugins({ featured: true });
  }

  getVerifiedPlugins(): RegistryPlugin[] {
    return this.listPlugins({ verified: true });
  }

  getPopularPlugins(limit: number = 10): RegistryPlugin[] {
    return [...this.plugins]
      .sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
      .slice(0, limit);
  }

  getCategories(): Array<{ category: ForgeHookCategory; count: number }> {
    const categoryMap = new Map<ForgeHookCategory, number>();

    for (const plugin of this.plugins) {
      if (plugin.manifest.category) {
        const count = categoryMap.get(plugin.manifest.category) || 0;
        categoryMap.set(plugin.manifest.category, count + 1);
      }
    }

    return Array.from(categoryMap.entries()).map(([category, count]) => ({
      category,
      count,
    }));
  }

  getStats(): {
    totalPlugins: number;
    verifiedPlugins: number;
    featuredPlugins: number;
    categories: number;
    averageRating: number;
    totalDownloads: number;
  } {
    const totalPlugins = this.plugins.length;
    const verifiedPlugins = this.plugins.filter(p => p.verified).length;
    const featuredPlugins = this.plugins.filter(p => p.featured).length;
    const categories = new Set(this.plugins.map(p => p.manifest.category).filter(Boolean)).size;

    const ratings = this.plugins.map(p => p.rating || 0).filter(r => r > 0);
    const averageRating = ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
      : 0;

    const totalDownloads = this.plugins.reduce((sum, p) => sum + (p.downloads || 0), 0);

    return {
      totalPlugins,
      verifiedPlugins,
      featuredPlugins,
      categories,
      averageRating: Math.round(averageRating * 10) / 10,
      totalDownloads,
    };
  }

  async addPlugin(plugin: RegistryPlugin): Promise<void> {
    const existing = this.plugins.find(p => p.id === plugin.id);
    if (existing) {
      throw new Error(`Plugin ${plugin.id} already exists in registry`);
    }

    this.plugins.push(plugin);
    logger.info({ pluginId: plugin.id }, 'Plugin added to registry');
  }

  async updatePlugin(pluginId: string, updates: Partial<RegistryPlugin>): Promise<void> {
    const index = this.plugins.findIndex(p => p.id === pluginId);
    if (index === -1) {
      throw new Error(`Plugin ${pluginId} not found in registry`);
    }

    this.plugins[index] = { ...this.plugins[index], ...updates };
    logger.info({ pluginId }, 'Plugin updated in registry');
  }

  async removePlugin(pluginId: string): Promise<void> {
    const index = this.plugins.findIndex(p => p.id === pluginId);
    if (index === -1) {
      throw new Error(`Plugin ${pluginId} not found in registry`);
    }

    this.plugins.splice(index, 1);
    logger.info({ pluginId }, 'Plugin removed from registry');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getRegistryInfo(): {
    pluginCount: number;
    initialized: boolean;
    registryPath: string;
  } {
    return {
      pluginCount: this.plugins.length,
      initialized: this.initialized,
      registryPath: this.registryPath,
    };
  }
}

// Singleton instance
export const registryService = new RegistryService();
