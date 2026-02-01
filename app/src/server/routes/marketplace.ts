import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { marketplaceService } from '../services/marketplace.service.js';
import { dockerService } from '../services/docker.service.js';
import { embeddedPluginService } from '../services/embedded-plugin.service.js';
import { logger } from '../utils/logger.js';
import { GitHubInstallRequest } from '../types/index.js';

// Request/Response types
interface MarketplaceQuery {
  category?: string;
  search?: string;
  featured?: boolean;
  verified?: boolean;
}

interface SourceParams {
  sourceId: string;
}

interface PluginIdParams {
  pluginId: string;
}

interface AddSourceBody {
  name: string;
  description?: string;
  url: string;
  sourceType?: 'github' | 'url' | 'local';
  priority?: number;
}

interface UpdateSourceBody {
  name?: string;
  description?: string;
  url?: string;
  enabled?: boolean;
  priority?: number;
}

interface GitHubInstallBody {
  repository: string;
  ref?: string;
  manifestPath?: string;
  config?: Record<string, unknown>;
  environment?: Record<string, string>;
  autoStart?: boolean;
}

interface MarketplaceInstallBody {
  pluginId: string;
  config?: Record<string, unknown>;
  environment?: Record<string, string>;
  autoStart?: boolean;
  installId?: string; // For progress tracking via SSE
}

export async function marketplaceRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // Marketplace - Aggregated Plugin Catalog
  // ============================================================================

  /**
   * Get marketplace plugins from all enabled sources
   */
  fastify.get<{ Querystring: MarketplaceQuery }>(
    '/api/v1/marketplace',
    async (request, reply) => {
      try {
        const { category, search, featured, verified } = request.query;

        const result = await marketplaceService.getMarketplace({
          category,
          search,
          featured: featured === true || featured === 'true' as any,
          verified: verified === true || verified === 'true' as any,
        });

        return reply.send({
          plugins: result.plugins,
          sources: result.sources,
          total: result.plugins.length,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get marketplace');
        return reply.status(500).send({
          error: {
            code: 'MARKETPLACE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get marketplace',
          },
        });
      }
    }
  );

  /**
   * Get a single plugin from marketplace
   */
  fastify.get<{ Params: PluginIdParams }>(
    '/api/v1/marketplace/plugins/:pluginId',
    async (request, reply) => {
      const { pluginId } = request.params;

      try {
        const plugin = await marketplaceService.getMarketplacePlugin(pluginId);

        if (!plugin) {
          return reply.status(404).send({
            error: {
              code: 'PLUGIN_NOT_FOUND',
              message: `Plugin ${pluginId} not found in marketplace`,
            },
          });
        }

        // Check if already installed
        const installed = dockerService.getPluginByForgehookId(pluginId);

        return reply.send({
          ...plugin,
          installed: !!installed,
          installedPluginId: installed?.id,
          installedVersion: installed?.manifest.version,
        });
      } catch (error) {
        logger.error({ error, pluginId }, 'Failed to get marketplace plugin');
        return reply.status(500).send({
          error: {
            code: 'MARKETPLACE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get plugin',
          },
        });
      }
    }
  );

  /**
   * Install a plugin from the marketplace
   */
  fastify.post<{ Body: MarketplaceInstallBody }>(
    '/api/v1/marketplace/install',
    async (request, reply) => {
      const { pluginId, config, environment, autoStart, installId } = request.body;

      if (!pluginId) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'pluginId is required',
          },
        });
      }

      try {
        // Get plugin from marketplace
        const marketplacePlugin = await marketplaceService.getMarketplacePlugin(pluginId);

        if (!marketplacePlugin) {
          return reply.status(404).send({
            error: {
              code: 'PLUGIN_NOT_FOUND',
              message: `Plugin ${pluginId} not found in marketplace`,
            },
          });
        }

        // Check if already installed
        const existing = dockerService.getPluginByForgehookId(pluginId);
        if (existing) {
          return reply.status(409).send({
            error: {
              code: 'PLUGIN_EXISTS',
              message: `Plugin ${pluginId} is already installed`,
              existingPluginId: existing.id,
            },
          });
        }

        const manifest = marketplacePlugin.manifest;
        let plugin;

        // Check runtime type - embedded plugins run in-process, container plugins use Docker
        if (manifest.runtime === 'embedded') {
          logger.info({ pluginId, name: manifest.name }, 'Installing embedded plugin');
          
          // For embedded plugins, we need to fetch the bundled JS code
          // The bundle URL is constructed from the registry source
          let moduleCode: string;
          
          if (marketplacePlugin.bundleUrl) {
            // Use explicit bundle URL from registry entry
            const bundleResponse = await fetch(marketplacePlugin.bundleUrl);
            if (!bundleResponse.ok) {
              throw new Error(`Failed to fetch plugin bundle: ${bundleResponse.status}`);
            }
            moduleCode = await bundleResponse.text();
          } else {
            // Construct bundle URL from registry source base URL
            // Registry URL format: .../registry.json, plugin at: .../plugins/{id}/index.js
            const source = await marketplaceService.getSource(marketplacePlugin.sourceId);
            if (!source?.url) {
              throw new Error('Cannot determine plugin bundle URL - source not found');
            }
            
            // Get base URL from registry URL (remove registry.json)
            const baseUrl = source.url.replace(/\/[^/]+$/, '');
            const bundleUrl = `${baseUrl}/plugins/${pluginId}/index.js`;
            
            logger.debug({ bundleUrl }, 'Fetching embedded plugin bundle');
            
            const bundleResponse = await fetch(bundleUrl);
            if (!bundleResponse.ok) {
              throw new Error(`Failed to fetch plugin bundle from ${bundleUrl}: ${bundleResponse.status}`);
            }
            moduleCode = await bundleResponse.text();
          }
          
          // Install using embedded plugin service
          plugin = await embeddedPluginService.installPlugin(manifest, moduleCode, config);
        } else {
          // Container-based plugin - use Docker service
          logger.info({ pluginId, name: manifest.name, installId }, 'Installing container plugin');
          plugin = await dockerService.installPlugin({
            manifest,
            config,
            environment,
            autoStart: autoStart ?? true,
            installId, // Pass for progress tracking
          });
        }

        return reply.status(201).send({
          id: plugin.id,
          forgehookId: plugin.forgehookId,
          name: plugin.manifest.name,
          version: plugin.manifest.version,
          status: plugin.status,
          runtime: manifest.runtime || 'container',
          hostPort: plugin.hostPort,
          source: marketplacePlugin.source,
          installId, // Return for progress tracking
          message: 'Plugin installed from marketplace',
        });
      } catch (error) {
        logger.error({ error, pluginId }, 'Marketplace installation failed');
        return reply.status(500).send({
          error: {
            code: 'INSTALL_FAILED',
            message: error instanceof Error ? error.message : 'Installation failed',
          },
        });
      }
    }
  );

  /**
   * Refresh marketplace (re-fetch all sources)
   */
  fastify.post('/api/v1/marketplace/refresh', async (request, reply) => {
    try {
      await marketplaceService.refreshAllSources();
      const result = await marketplaceService.getMarketplace();

      return reply.send({
        message: 'Marketplace refreshed',
        sources: result.sources,
        totalPlugins: result.plugins.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to refresh marketplace');
      return reply.status(500).send({
        error: {
          code: 'REFRESH_FAILED',
          message: error instanceof Error ? error.message : 'Refresh failed',
        },
      });
    }
  });

  // ============================================================================
  // GitHub Installation
  // ============================================================================

  /**
   * Install a plugin directly from a GitHub repository
   */
  fastify.post<{ Body: GitHubInstallBody }>(
    '/api/v1/marketplace/install/github',
    async (request, reply) => {
      const { repository, ref, manifestPath, config, environment, autoStart } = request.body;

      if (!repository) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'repository is required (e.g., "owner/repo" or GitHub URL)',
          },
        });
      }

      try {
        logger.info({ repository, ref }, 'Installing plugin from GitHub');

        const plugin = await marketplaceService.installFromGitHub({
          repository,
          ref,
          manifestPath,
          config,
          environment,
          autoStart: autoStart ?? true,
        });

        return reply.status(201).send({
          id: plugin.id,
          forgehookId: plugin.forgehookId,
          name: plugin.manifest.name,
          version: plugin.manifest.version,
          status: plugin.status,
          hostPort: plugin.hostPort,
          repository,
          message: 'Plugin installed from GitHub',
        });
      } catch (error) {
        logger.error({ error, repository }, 'GitHub installation failed');
        return reply.status(500).send({
          error: {
            code: 'GITHUB_INSTALL_FAILED',
            message: error instanceof Error ? error.message : 'Installation failed',
          },
        });
      }
    }
  );

  // ============================================================================
  // Registry Sources Management
  // ============================================================================

  /**
   * List all registry sources
   */
  fastify.get('/api/v1/marketplace/sources', async (request, reply) => {
    try {
      const sources = await marketplaceService.listSources();

      return reply.send({
        sources: sources.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          url: s.url,
          sourceType: s.sourceType,
          enabled: s.enabled,
          isOfficial: s.isOfficial,
          priority: s.priority,
          pluginCount: s.cachedIndex?.plugins?.length || 0,
          lastFetched: s.lastFetched,
          fetchError: s.fetchError,
          createdAt: s.createdAt,
        })),
        total: sources.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list registry sources');
      return reply.status(500).send({
        error: {
          code: 'SOURCE_LIST_ERROR',
          message: error instanceof Error ? error.message : 'Failed to list sources',
        },
      });
    }
  });

  /**
   * Get a single registry source
   */
  fastify.get<{ Params: SourceParams }>(
    '/api/v1/marketplace/sources/:sourceId',
    async (request, reply) => {
      const { sourceId } = request.params;

      try {
        const source = await marketplaceService.getSource(sourceId);

        if (!source) {
          return reply.status(404).send({
            error: {
              code: 'SOURCE_NOT_FOUND',
              message: `Source ${sourceId} not found`,
            },
          });
        }

        return reply.send({
          id: source.id,
          name: source.name,
          description: source.description,
          url: source.url,
          sourceType: source.sourceType,
          githubOwner: source.githubOwner,
          githubRepo: source.githubRepo,
          githubBranch: source.githubBranch,
          githubPath: source.githubPath,
          enabled: source.enabled,
          isOfficial: source.isOfficial,
          priority: source.priority,
          pluginCount: source.cachedIndex?.plugins?.length || 0,
          plugins: source.cachedIndex?.plugins?.map((p) => ({
            id: p.id,
            name: p.manifest.name,
            version: p.manifest.version,
            description: p.manifest.description,
          })),
          lastFetched: source.lastFetched,
          fetchError: source.fetchError,
          createdAt: source.createdAt,
          updatedAt: source.updatedAt,
        });
      } catch (error) {
        logger.error({ error, sourceId }, 'Failed to get registry source');
        return reply.status(500).send({
          error: {
            code: 'SOURCE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get source',
          },
        });
      }
    }
  );

  /**
   * Add a new registry source
   */
  fastify.post<{ Body: AddSourceBody }>(
    '/api/v1/marketplace/sources',
    async (request, reply) => {
      const { name, description, url, sourceType, priority } = request.body;

      if (!name || !url) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'name and url are required',
          },
        });
      }

      try {
        const source = await marketplaceService.addSource({
          name,
          description,
          url,
          sourceType,
          priority,
        });

        return reply.status(201).send({
          id: source.id,
          name: source.name,
          url: source.url,
          sourceType: source.sourceType,
          enabled: source.enabled,
          pluginCount: source.cachedIndex?.plugins?.length || 0,
          message: 'Registry source added',
        });
      } catch (error) {
        logger.error({ error, name, url }, 'Failed to add registry source');
        return reply.status(500).send({
          error: {
            code: 'SOURCE_ADD_FAILED',
            message: error instanceof Error ? error.message : 'Failed to add source',
          },
        });
      }
    }
  );

  /**
   * Update a registry source
   */
  fastify.put<{ Params: SourceParams; Body: UpdateSourceBody }>(
    '/api/v1/marketplace/sources/:sourceId',
    async (request, reply) => {
      const { sourceId } = request.params;
      const updates = request.body;

      try {
        const source = await marketplaceService.updateSource(sourceId, updates);

        if (!source) {
          return reply.status(404).send({
            error: {
              code: 'SOURCE_NOT_FOUND',
              message: `Source ${sourceId} not found`,
            },
          });
        }

        return reply.send({
          id: source.id,
          name: source.name,
          url: source.url,
          enabled: source.enabled,
          priority: source.priority,
          message: 'Registry source updated',
        });
      } catch (error) {
        logger.error({ error, sourceId }, 'Failed to update registry source');
        return reply.status(500).send({
          error: {
            code: 'SOURCE_UPDATE_FAILED',
            message: error instanceof Error ? error.message : 'Failed to update source',
          },
        });
      }
    }
  );

  /**
   * Delete a registry source
   */
  fastify.delete<{ Params: SourceParams }>(
    '/api/v1/marketplace/sources/:sourceId',
    async (request, reply) => {
      const { sourceId } = request.params;

      try {
        const deleted = await marketplaceService.removeSource(sourceId);

        if (!deleted) {
          return reply.status(404).send({
            error: {
              code: 'SOURCE_NOT_FOUND',
              message: `Source ${sourceId} not found`,
            },
          });
        }

        return reply.send({
          message: 'Registry source deleted',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete source';

        if (errorMessage.includes('Cannot delete official')) {
          return reply.status(403).send({
            error: {
              code: 'CANNOT_DELETE_OFFICIAL',
              message: errorMessage,
            },
          });
        }

        logger.error({ error, sourceId }, 'Failed to delete registry source');
        return reply.status(500).send({
          error: {
            code: 'SOURCE_DELETE_FAILED',
            message: errorMessage,
          },
        });
      }
    }
  );

  /**
   * Refresh a single registry source
   */
  fastify.post<{ Params: SourceParams }>(
    '/api/v1/marketplace/sources/:sourceId/refresh',
    async (request, reply) => {
      const { sourceId } = request.params;

      try {
        const index = await marketplaceService.refreshSource(sourceId);
        const source = await marketplaceService.getSource(sourceId);

        return reply.send({
          message: 'Source refreshed',
          pluginCount: index?.plugins?.length || 0,
          lastFetched: source?.lastFetched,
        });
      } catch (error) {
        logger.error({ error, sourceId }, 'Failed to refresh registry source');
        return reply.status(500).send({
          error: {
            code: 'SOURCE_REFRESH_FAILED',
            message: error instanceof Error ? error.message : 'Failed to refresh source',
          },
        });
      }
    }
  );

  /**
   * Toggle source enabled/disabled
   */
  fastify.post<{ Params: SourceParams; Body: { enabled: boolean } }>(
    '/api/v1/marketplace/sources/:sourceId/toggle',
    async (request, reply) => {
      const { sourceId } = request.params;
      const { enabled } = request.body;

      if (typeof enabled !== 'boolean') {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'enabled (boolean) is required',
          },
        });
      }

      try {
        const source = await marketplaceService.toggleSource(sourceId, enabled);

        if (!source) {
          return reply.status(404).send({
            error: {
              code: 'SOURCE_NOT_FOUND',
              message: `Source ${sourceId} not found`,
            },
          });
        }

        return reply.send({
          id: source.id,
          name: source.name,
          enabled: source.enabled,
          message: `Source ${enabled ? 'enabled' : 'disabled'}`,
        });
      } catch (error) {
        logger.error({ error, sourceId }, 'Failed to toggle registry source');
        return reply.status(500).send({
          error: {
            code: 'SOURCE_TOGGLE_FAILED',
            message: error instanceof Error ? error.message : 'Failed to toggle source',
          },
        });
      }
    }
  );
}
