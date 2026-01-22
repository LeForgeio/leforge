import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { databaseService } from './database.service.js';
import { dockerService } from './docker.service.js';
import {
  RegistrySource,
  RegistryIndex,
  RegistryPluginEntry,
  ForgeHookManifest,
  GitHubInstallRequest,
  PluginInstance,
} from '../types/index.js';

/**
 * Marketplace Service
 * Manages registry sources, fetches plugin catalogs, and handles GitHub installations
 */
export class MarketplaceService extends EventEmitter {
  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super();
    logger.info('Marketplace service initialized');
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  async initialize(): Promise<void> {
    logger.info('Initializing marketplace service');

    // Refresh sources on startup
    await this.refreshAllSources();

    // Set up periodic refresh (every 5 minutes)
    this.refreshInterval = setInterval(() => {
      this.refreshAllSources().catch((err) => {
        logger.error({ error: err }, 'Failed to refresh registry sources');
      });
    }, this.CACHE_TTL_MS);

    logger.info('Marketplace service initialized');
  }

  async shutdown(): Promise<void> {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  // ==========================================================================
  // Registry Source Management
  // ==========================================================================

  /**
   * List all registry sources
   */
  async listSources(enabledOnly: boolean = false): Promise<RegistrySource[]> {
    return databaseService.listRegistrySources(enabledOnly);
  }

  /**
   * Get a single registry source
   */
  async getSource(sourceId: string): Promise<RegistrySource | null> {
    return databaseService.getRegistrySource(sourceId);
  }

  /**
   * Add a new registry source
   */
  async addSource(source: {
    name: string;
    description?: string;
    url: string;
    sourceType?: 'github' | 'url' | 'local';
    githubOwner?: string;
    githubRepo?: string;
    githubBranch?: string;
    githubPath?: string;
    priority?: number;
  }): Promise<RegistrySource> {
    // Parse GitHub URL if provided
    let parsedSource = { ...source };

    if (source.url.includes('github.com') && !source.sourceType) {
      const parsed = this.parseGitHubUrl(source.url);
      if (parsed) {
        parsedSource = {
          ...parsedSource,
          sourceType: 'github',
          githubOwner: parsed.owner,
          githubRepo: parsed.repo,
          githubBranch: parsed.branch || 'main',
          githubPath: parsed.path || 'registry.json',
          url: `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.branch || 'main'}/${parsed.path || 'registry.json'}`,
        };
      }
    }

    const newSource = await databaseService.createRegistrySource({
      name: parsedSource.name,
      description: parsedSource.description,
      url: parsedSource.url,
      sourceType: parsedSource.sourceType || 'url',
      githubOwner: parsedSource.githubOwner,
      githubRepo: parsedSource.githubRepo,
      githubBranch: parsedSource.githubBranch,
      githubPath: parsedSource.githubPath,
      enabled: true,
      isOfficial: false,
      priority: parsedSource.priority ?? 100,
    });

    // Fetch the new source immediately
    await this.refreshSource(newSource.id);

    return databaseService.getRegistrySource(newSource.id) as Promise<RegistrySource>;
  }

  /**
   * Update a registry source
   */
  async updateSource(sourceId: string, updates: Partial<RegistrySource>): Promise<RegistrySource | null> {
    return databaseService.updateRegistrySource(sourceId, updates);
  }

  /**
   * Remove a registry source
   */
  async removeSource(sourceId: string): Promise<boolean> {
    return databaseService.deleteRegistrySource(sourceId);
  }

  /**
   * Toggle source enabled status
   */
  async toggleSource(sourceId: string, enabled: boolean): Promise<RegistrySource | null> {
    return databaseService.updateRegistrySource(sourceId, { enabled });
  }

  // ==========================================================================
  // Registry Fetching & Caching
  // ==========================================================================

  /**
   * Refresh all enabled sources
   */
  async refreshAllSources(): Promise<void> {
    const sources = await databaseService.listRegistrySources(true);
    logger.info({ count: sources.length }, 'Refreshing registry sources');

    for (const source of sources) {
      try {
        await this.refreshSource(source.id);
      } catch (error) {
        logger.error({ error, sourceId: source.id, sourceName: source.name }, 'Failed to refresh source');
      }
    }
  }

  /**
   * Refresh a single source
   */
  async refreshSource(sourceId: string): Promise<RegistryIndex | null> {
    const source = await databaseService.getRegistrySource(sourceId);
    if (!source) {
      throw new Error(`Source ${sourceId} not found`);
    }

    logger.debug({ sourceId, sourceName: source.name, url: source.url }, 'Fetching registry source');

    try {
      const response = await fetch(source.url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'FlowForge-Marketplace/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const index = (await response.json()) as RegistryIndex;

      // Validate basic structure
      if (!index.plugins || !Array.isArray(index.plugins)) {
        throw new Error('Invalid registry index: missing plugins array');
      }

      // Update cache
      await databaseService.updateRegistrySource(sourceId, {
        cachedIndex: index,
        lastFetched: new Date(),
        fetchError: undefined,
      });

      logger.info(
        { sourceId, sourceName: source.name, pluginCount: index.plugins.length },
        'Registry source refreshed'
      );

      return index;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await databaseService.updateRegistrySource(sourceId, {
        fetchError: errorMessage,
        lastFetched: new Date(),
      });

      logger.error({ error, sourceId, sourceName: source.name }, 'Failed to fetch registry source');
      throw error;
    }
  }

  // ==========================================================================
  // Aggregated Marketplace
  // ==========================================================================

  /**
   * Get aggregated marketplace from all enabled sources
   */
  async getMarketplace(options?: {
    category?: string;
    search?: string;
    featured?: boolean;
    verified?: boolean;
  }): Promise<{
    plugins: Array<RegistryPluginEntry & { source: string; sourceId: string }>;
    sources: Array<{ id: string; name: string; pluginCount: number; lastFetched?: Date; error?: string }>;
  }> {
    const sources = await databaseService.listRegistrySources(true);
    const allPlugins: Array<RegistryPluginEntry & { source: string; sourceId: string }> = [];
    const sourceInfo: Array<{ id: string; name: string; pluginCount: number; lastFetched?: Date; error?: string }> = [];
    const seenPluginIds = new Set<string>();

    // Collect plugins from all sources (in priority order)
    for (const source of sources) {
      sourceInfo.push({
        id: source.id,
        name: source.name,
        pluginCount: source.cachedIndex?.plugins?.length || 0,
        lastFetched: source.lastFetched,
        error: source.fetchError,
      });

      if (!source.cachedIndex?.plugins) {
        continue;
      }

      for (const plugin of source.cachedIndex.plugins) {
        // Skip duplicates (first source wins due to priority ordering)
        if (seenPluginIds.has(plugin.id)) {
          continue;
        }
        seenPluginIds.add(plugin.id);

        allPlugins.push({
          ...plugin,
          source: source.name,
          sourceId: source.id,
        });
      }
    }

    // Apply filters
    let filtered = allPlugins;

    if (options?.category) {
      filtered = filtered.filter((p) => p.manifest.category === options.category);
    }

    if (options?.search) {
      const searchLower = options.search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.manifest.name.toLowerCase().includes(searchLower) ||
          p.manifest.description.toLowerCase().includes(searchLower) ||
          p.manifest.tags?.some((t) => t.toLowerCase().includes(searchLower))
      );
    }

    if (options?.featured) {
      filtered = filtered.filter((p) => p.featured);
    }

    if (options?.verified) {
      filtered = filtered.filter((p) => p.verified);
    }

    // Sort: featured first, then by rating, then by downloads
    filtered.sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0);
      return (b.downloads || 0) - (a.downloads || 0);
    });

    return {
      plugins: filtered,
      sources: sourceInfo,
    };
  }

  /**
   * Get a single plugin from the marketplace
   */
  async getMarketplacePlugin(pluginId: string): Promise<(RegistryPluginEntry & { source: string; sourceId: string }) | null> {
    const sources = await databaseService.listRegistrySources(true);

    for (const source of sources) {
      const plugin = source.cachedIndex?.plugins?.find((p) => p.id === pluginId);
      if (plugin) {
        return {
          ...plugin,
          source: source.name,
          sourceId: source.id,
        };
      }
    }

    return null;
  }

  // ==========================================================================
  // GitHub Installation
  // ==========================================================================

  /**
   * Install a plugin from GitHub repository
   */
  async installFromGitHub(request: GitHubInstallRequest): Promise<PluginInstance> {
    const { repository, ref = 'main', manifestPath = 'forgehook.json', config, environment, autoStart } = request;

    // Parse repository
    const parsed = this.parseGitHubRepo(repository);
    if (!parsed) {
      throw new Error(`Invalid repository format: ${repository}. Use "owner/repo" or full GitHub URL`);
    }

    const { owner, repo } = parsed;
    logger.info({ owner, repo, ref }, 'Installing plugin from GitHub');

    // Fetch forgehook.json from GitHub
    const manifestUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${manifestPath}`;
    logger.debug({ manifestUrl }, 'Fetching manifest from GitHub');

    const response = await fetch(manifestUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'FlowForge-Marketplace/1.0',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Manifest not found at ${manifestUrl}. Make sure the repository has a ${manifestPath} file.`);
      }
      throw new Error(`Failed to fetch manifest: HTTP ${response.status}`);
    }

    const manifest = (await response.json()) as ForgeHookManifest;

    // Validate manifest
    if (!manifest.id || !manifest.name || !manifest.image?.repository) {
      throw new Error('Invalid manifest: missing required fields (id, name, image.repository)');
    }

    // Enrich manifest with GitHub info if not present
    if (!manifest.repository) {
      manifest.repository = `https://github.com/${owner}/${repo}`;
    }

    // Install the plugin using docker service
    const plugin = await dockerService.installPlugin({
      manifest,
      config,
      environment,
      autoStart,
    });

    logger.info({ pluginId: plugin.id, forgehookId: manifest.id }, 'Plugin installed from GitHub');

    return plugin;
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Parse a GitHub URL into components
   */
  private parseGitHubUrl(url: string): { owner: string; repo: string; branch?: string; path?: string } | null {
    // Handle raw.githubusercontent.com URLs
    const rawMatch = url.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)/);
    if (rawMatch) {
      return {
        owner: rawMatch[1],
        repo: rawMatch[2],
        branch: rawMatch[3],
        path: rawMatch[4],
      };
    }

    // Handle github.com URLs
    const githubMatch = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (githubMatch) {
      return {
        owner: githubMatch[1],
        repo: githubMatch[2].replace(/\.git$/, ''),
      };
    }

    return null;
  }

  /**
   * Parse a GitHub repository reference
   */
  private parseGitHubRepo(repository: string): { owner: string; repo: string } | null {
    // Handle full URLs
    if (repository.includes('github.com')) {
      return this.parseGitHubUrl(repository);
    }

    // Handle owner/repo format
    const match = repository.match(/^([^/]+)\/([^/@]+)(?:@.*)?$/);
    if (match) {
      return {
        owner: match[1],
        repo: match[2],
      };
    }

    return null;
  }
}

// Singleton instance
export const marketplaceService = new MarketplaceService();
