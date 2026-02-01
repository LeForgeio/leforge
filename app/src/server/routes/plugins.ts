import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { dockerService } from '../services/docker.service.js';
import { embeddedPluginService } from '../services/embedded-plugin.service.js';
import { gatewayService } from '../services/gateway.service.js';
import { databaseService } from '../services/database.service.js';
import { logger } from '../utils/logger.js';
import { ForgeHookManifest, PluginResponse } from '../types/index.js';

// Request/Response types
interface InstallBody {
  manifest?: ForgeHookManifest;
  manifestUrl?: string;
  config?: Record<string, unknown>;
  environment?: Record<string, string>;
  autoStart?: boolean;
  installId?: string; // Optional client-provided installId for progress tracking
}

interface PluginParams {
  pluginId: string;
}

interface ConfigureBody {
  environment?: Record<string, string>;
  config?: Record<string, unknown>;
}

interface LogsQuery {
  tail?: number;
}

interface UpdateBody {
  // Online update
  bundleUrl?: string;      // For embedded plugins
  imageTag?: string;       // For container plugins
  manifest?: ForgeHookManifest;
}

interface UpdateUploadBody {
  // Offline update - file content
  moduleCode?: string;     // For embedded plugins (base64 or raw JS)
  manifest?: ForgeHookManifest;
}

interface InstallProgressParams {
  installId: string;
}

export async function pluginRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // Install Progress SSE Stream
  // ============================================================================
  fastify.get<{ Params: InstallProgressParams }>(
    '/api/v1/plugins/install/:installId/progress',
    async (request, reply) => {
      const { installId } = request.params;

      // Set up SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Send initial connection event
      reply.raw.write(`data: ${JSON.stringify({ type: 'connected', installId, timestamp: new Date() })}\n\n`);

      // Subscribe to progress events
      const unsubscribe = dockerService.onInstallProgress(installId, (progress) => {
        try {
          reply.raw.write(`data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`);
          
          // Close stream on complete or error
          if (progress.phase === 'complete' || progress.phase === 'error') {
            setTimeout(() => {
              reply.raw.end();
            }, 100);
          }
        } catch {
          // Client disconnected
          unsubscribe();
        }
      });

      // Handle client disconnect
      request.raw.on('close', () => {
        unsubscribe();
      });

      // Keep connection alive with heartbeat
      const heartbeat = setInterval(() => {
        try {
          reply.raw.write(`: heartbeat\n\n`);
        } catch {
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 30000);

      // Clean up on close
      request.raw.on('close', () => {
        clearInterval(heartbeat);
      });
    }
  );

  // ============================================================================
  // List Plugins
  // ============================================================================
  fastify.get('/api/v1/plugins', async (request: FastifyRequest, reply: FastifyReply) => {
    // Get all plugins from database (includes both container and embedded)
    const allPlugins = await databaseService.listPlugins();

    // Return full manifest for dynamic UI rendering (Services, Playground, Documentation)
    const response = allPlugins.map((plugin) => ({
      id: plugin.id,
      forgehookId: plugin.forgehookId,
      name: plugin.manifest.name,
      version: plugin.manifest.version,
      description: plugin.manifest.description,
      status: plugin.status,
      runtime: plugin.runtime || 'container',
      hostPort: plugin.hostPort ?? 0,
      gatewayUrl: plugin.gatewayUrl,
      healthStatus: plugin.healthStatus,
      error: plugin.error,
      manifest: plugin.manifest, // Full manifest for Services/Playground pages
      installedAt: plugin.installedAt,
      startedAt: plugin.startedAt,
    }));

    return reply.send({
      plugins: response,
      total: response.length,
    });
  });

  // ============================================================================
  // Get Plugin Details
  // ============================================================================
  fastify.get<{ Params: PluginParams }>(
    '/api/v1/plugins/:pluginId',
    async (request, reply) => {
      const { pluginId } = request.params;
      
      // Try Docker service first, then database for embedded plugins
      let plugin = dockerService.getPlugin(pluginId);
      if (!plugin) {
        plugin = await databaseService.getPlugin(pluginId) || undefined;
      }

      if (!plugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      return reply.send({
        id: plugin.id,
        forgehookId: plugin.forgehookId,
        name: plugin.manifest.name,
        version: plugin.manifest.version,
        description: plugin.manifest.description,
        status: plugin.status,
        runtime: plugin.runtime || 'container',
        hostPort: plugin.hostPort,
        gatewayUrl: plugin.gatewayUrl,
        gatewayHealthPath: plugin.gatewayHealthPath,
        healthStatus: plugin.healthStatus,
        error: plugin.error,
        manifest: plugin.manifest,
        config: plugin.config,
        environment: plugin.environment,
        installedAt: plugin.installedAt,
        startedAt: plugin.startedAt,
        stoppedAt: plugin.stoppedAt,
        lastHealthCheck: plugin.lastHealthCheck,
      });
    }
  );

  // ============================================================================
  // Install Plugin
  // ============================================================================
  fastify.post<{ Body: InstallBody }>(
    '/api/v1/plugins/install',
    async (request, reply) => {
      const { manifest, manifestUrl, config, environment, autoStart, installId: clientInstallId } = request.body;

      // Generate installId for progress tracking if not provided
      const installId = clientInstallId || uuidv4();

      if (!manifest && !manifestUrl) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Either manifest or manifestUrl is required',
          },
        });
      }

      if (!manifest) {
        return reply.status(400).send({
          error: {
            code: 'NOT_IMPLEMENTED',
            message: 'manifestUrl support not yet implemented',
          },
        });
      }

      try {
        const existing = dockerService.getPluginByForgehookId(manifest.id);
        const existingDb = await databaseService.getPluginByForgehookId(manifest.id);
        if (existing || existingDb) {
          return reply.status(409).send({
            error: {
              code: 'PLUGIN_EXISTS',
              message: `Plugin ${manifest.id} is already installed`,
              existingPluginId: existing?.id || existingDb?.id,
            },
          });
        }

        logger.info({ forgehookId: manifest.id, runtime: manifest.runtime, installId }, 'Installing plugin');

        let plugin;

        // Route installation based on runtime type
        if (manifest.runtime === 'gateway') {
          plugin = await gatewayService.installPlugin({
            manifest,
            config,
            environment,
          });
        } else if (manifest.runtime === 'embedded') {
          // Embedded plugins require moduleCode - use upload endpoint instead
          return reply.status(400).send({
            error: {
              code: 'INVALID_RUNTIME',
              message: 'Embedded plugins must be installed via /upload endpoint with moduleCode',
            },
          });
        } else {
          // Default to container (Docker) installation
          plugin = await dockerService.installPlugin({
            manifest,
            config,
            environment,
            autoStart,
            installId, // Pass installId for progress tracking
          });
        }

        return reply.status(201).send({
          id: plugin.id,
          forgehookId: plugin.forgehookId,
          name: plugin.manifest.name,
          version: plugin.manifest.version,
          status: plugin.status,
          runtime: plugin.runtime,
          hostPort: plugin.hostPort,
          gatewayUrl: plugin.gatewayUrl,
          installId, // Return installId for client to connect to progress stream
          message: 'Plugin installed successfully',
        });

      } catch (error) {
        logger.error({ error }, 'Plugin installation failed');
        return reply.status(500).send({
          error: {
            code: 'INSTALL_FAILED',
            message: error instanceof Error ? error.message : 'Installation failed',
          },
        });
      }
    }
  );

  // ============================================================================
  // Start Plugin
  // ============================================================================
  fastify.post<{ Params: PluginParams; Body: { pullLatest?: boolean } }>(
    '/api/v1/plugins/:pluginId/start',
    async (request, reply) => {
      const { pluginId } = request.params;
      const { pullLatest } = request.body || {};
      
      // Try Docker service first, then database for embedded plugins
      let plugin = dockerService.getPlugin(pluginId);
      if (!plugin) {
        plugin = await databaseService.getPlugin(pluginId) || undefined;
      }

      if (!plugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      try {
        if (plugin.runtime === 'embedded') {
          await embeddedPluginService.startPlugin(pluginId);
        } else if (plugin.runtime === 'gateway') {
          await gatewayService.startPlugin(pluginId);
        } else {
          await dockerService.startPlugin(pluginId, { pullLatest });
        }

        return reply.send({
          id: plugin.id,
          status: 'running',
          message: pullLatest ? 'Plugin started with latest image' : 'Plugin started successfully',
        });

      } catch (error) {
        logger.error({ pluginId, error }, 'Plugin start failed');
        return reply.status(500).send({
          error: {
            code: 'START_FAILED',
            message: error instanceof Error ? error.message : 'Start failed',
          },
        });
      }
    }
  );

  // ============================================================================
  // Stop Plugin
  // ============================================================================
  fastify.post<{ Params: PluginParams }>(
    '/api/v1/plugins/:pluginId/stop',
    async (request, reply) => {
      const { pluginId } = request.params;
      
      // Try Docker service first, then database for embedded plugins
      let plugin = dockerService.getPlugin(pluginId);
      if (!plugin) {
        plugin = await databaseService.getPlugin(pluginId) || undefined;
      }

      if (!plugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      try {
        if (plugin.runtime === 'embedded') {
          await embeddedPluginService.stopPlugin(pluginId);
        } else if (plugin.runtime === 'gateway') {
          await gatewayService.stopPlugin(pluginId);
        } else {
          await dockerService.stopPlugin(pluginId);
        }

        return reply.send({
          id: plugin.id,
          status: 'stopped',
          message: 'Plugin stopped successfully',
        });

      } catch (error) {
        logger.error({ pluginId, error }, 'Plugin stop failed');
        return reply.status(500).send({
          error: {
            code: 'STOP_FAILED',
            message: error instanceof Error ? error.message : 'Stop failed',
          },
        });
      }
    }
  );

  // ============================================================================
  // Restart Plugin
  // ============================================================================
  fastify.post<{ Params: PluginParams }>(
    '/api/v1/plugins/:pluginId/restart',
    async (request, reply) => {
      const { pluginId } = request.params;
      
      // Try Docker service first, then database for embedded plugins
      let plugin = dockerService.getPlugin(pluginId);
      if (!plugin) {
        plugin = await databaseService.getPlugin(pluginId) || undefined;
      }

      if (!plugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      try {
        if (plugin.runtime === 'embedded') {
          await embeddedPluginService.stopPlugin(pluginId);
          await embeddedPluginService.startPlugin(pluginId);
        } else if (plugin.runtime === 'gateway') {
          await gatewayService.stopPlugin(pluginId);
          await gatewayService.startPlugin(pluginId);
        } else {
          await dockerService.restartPlugin(pluginId);
        }

        return reply.send({
          id: plugin.id,
          status: 'running',
          message: 'Plugin restarted successfully',
        });

      } catch (error) {
        logger.error({ pluginId, error }, 'Plugin restart failed');
        return reply.status(500).send({
          error: {
            code: 'RESTART_FAILED',
            message: error instanceof Error ? error.message : 'Restart failed',
          },
        });
      }
    }
  );

  // ============================================================================
  // Uninstall Plugin
  // ============================================================================
  fastify.delete<{ Params: PluginParams }>(
    '/api/v1/plugins/:pluginId',
    async (request, reply) => {
      const { pluginId } = request.params;
      
      // Try Docker service first, then database for embedded plugins
      let plugin = dockerService.getPlugin(pluginId);
      if (!plugin) {
        plugin = await databaseService.getPlugin(pluginId) || undefined;
      }

      if (!plugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      try {
        if (plugin.runtime === 'embedded') {
          // Unload from memory
          await embeddedPluginService.unloadPlugin(plugin.forgehookId);
          // Delete from database
          await databaseService.deletePlugin(pluginId);
        } else if (plugin.runtime === 'gateway') {
          await gatewayService.uninstallPlugin(pluginId);
        } else {
          await dockerService.uninstallPlugin(pluginId);
        }

        return reply.send({
          message: 'Plugin uninstalled successfully',
        });

      } catch (error) {
        logger.error({ pluginId, error }, 'Plugin uninstall failed');
        return reply.status(500).send({
          error: {
            code: 'UNINSTALL_FAILED',
            message: error instanceof Error ? error.message : 'Uninstall failed',
          },
        });
      }
    }
  );

  // ============================================================================
  // Get Plugin Logs
  // ============================================================================
  fastify.get<{ Params: PluginParams; Querystring: LogsQuery }>(
    '/api/v1/plugins/:pluginId/logs',
    async (request, reply) => {
      const { pluginId } = request.params;
      const { tail = 100 } = request.query;

      // Try Docker service first (for container plugins)
      let plugin = dockerService.getPlugin(pluginId);
      
      // If not found in Docker service, check database (could be embedded plugin)
      if (!plugin) {
        const dbPlugin = await databaseService.getPlugin(pluginId);
        if (dbPlugin) {
          plugin = dbPlugin;
        }
      }

      if (!plugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      try {
        // Handle embedded plugins - they don't have Docker logs
        if (plugin.runtime === 'embedded') {
          const health = await embeddedPluginService.checkHealth(plugin.forgehookId);
          return reply.send({
            pluginId,
            runtime: 'embedded',
            logs: [
              `[${new Date().toISOString()}] Embedded plugin: ${plugin.manifest.name}`,
              `[${new Date().toISOString()}] Status: ${plugin.status}`,
              `[${new Date().toISOString()}] Module loaded: ${health.details.loaded}`,
              `[${new Date().toISOString()}] Exports: ${health.details.exports.join(', ')}`,
              `[${new Date().toISOString()}] Invocation count: ${health.details.invocationCount}`,
              health.details.lastInvoked ? `[${new Date().toISOString()}] Last invoked: ${health.details.lastInvoked}` : null,
              `[${new Date().toISOString()}] Note: Embedded plugins run in-process without Docker containers`,
            ].filter(Boolean),
          });
        }

        // Handle gateway plugins
        if (plugin.runtime === 'gateway') {
          const logs = await gatewayService.getPluginLogs(pluginId);
          return reply.send({
            pluginId,
            runtime: 'gateway',
            logs,
          });
        }

        // Container plugin - get Docker logs
        const logs = await dockerService.getPluginLogs(pluginId, tail);

        return reply.send({
          pluginId,
          logs: logs.split('\n'),
        });

      } catch (error) {
        logger.error({ pluginId, error }, 'Failed to get plugin logs');
        return reply.status(500).send({
          error: {
            code: 'LOGS_FAILED',
            message: error instanceof Error ? error.message : 'Failed to get logs',
          },
        });
      }
    }
  );

  // ============================================================================
  // Configure Plugin
  // ============================================================================
  fastify.put<{ Params: PluginParams; Body: ConfigureBody }>(
    '/api/v1/plugins/:pluginId/config',
    async (request, reply) => {
      const { pluginId } = request.params;
      const { environment, config } = request.body;

      const plugin = dockerService.getPlugin(pluginId);

      if (!plugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      if (environment) {
        plugin.environment = { ...plugin.environment, ...environment };
      }
      if (config) {
        plugin.config = { ...plugin.config, ...config };
      }

      return reply.send({
        id: plugin.id,
        config: plugin.config,
        environment: plugin.environment,
        message: 'Configuration updated. Restart plugin to apply changes.',
      });
    }
  );

  // ============================================================================
  // Update Plugin (Online)
  // ============================================================================
  fastify.post<{ Params: PluginParams; Body: UpdateBody }>(
    '/api/v1/plugins/:pluginId/update',
    async (request, reply) => {
      const { pluginId } = request.params;
      const { bundleUrl, imageTag, manifest } = request.body;

      // Check if plugin exists
      const dbPlugin = await databaseService.getPlugin(pluginId);
      if (!dbPlugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      try {
        let updatedPlugin;

        if (dbPlugin.runtime === 'embedded') {
          // Embedded plugin update
          if (!bundleUrl && !manifest) {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'bundleUrl or manifest with bundleUrl is required for embedded plugins',
              },
            });
          }

          const updateBundleUrl = bundleUrl || dbPlugin.bundleUrl;
          if (!updateBundleUrl) {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'No bundle URL available for update',
              },
            });
          }

          updatedPlugin = await embeddedPluginService.updatePlugin(pluginId, {
            bundleUrl: updateBundleUrl,
            newManifest: manifest,
          });

        } else {
          // Container plugin update
          if (!imageTag && !manifest?.image?.tag) {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'imageTag is required for container plugins',
              },
            });
          }

          updatedPlugin = await dockerService.updatePlugin(pluginId, {
            newImageTag: imageTag,
            newManifest: manifest,
          });
        }

        return reply.send({
          id: updatedPlugin.id,
          forgehookId: updatedPlugin.forgehookId,
          name: updatedPlugin.manifest.name,
          version: updatedPlugin.manifest.version,
          previousVersion: dbPlugin.installedVersion,
          status: updatedPlugin.status,
          message: 'Plugin updated successfully',
        });

      } catch (error) {
        logger.error({ pluginId, error }, 'Plugin update failed');
        return reply.status(500).send({
          error: {
            code: 'UPDATE_FAILED',
            message: error instanceof Error ? error.message : 'Update failed',
          },
        });
      }
    }
  );

  // ============================================================================
  // Update Plugin (Offline/Upload)
  // ============================================================================
  fastify.post<{ Params: PluginParams; Body: UpdateUploadBody }>(
    '/api/v1/plugins/:pluginId/update/upload',
    async (request, reply) => {
      const { pluginId } = request.params;
      const { moduleCode, manifest } = request.body;

      // Check if plugin exists
      const dbPlugin = await databaseService.getPlugin(pluginId);
      if (!dbPlugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      try {
        let updatedPlugin;

        if (dbPlugin.runtime === 'embedded') {
          // Embedded plugin - accept JS code directly
          if (!moduleCode) {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'moduleCode is required for embedded plugin upload',
              },
            });
          }

          // Decode if base64
          let code = moduleCode;
          if (moduleCode.match(/^[A-Za-z0-9+/]+=*$/)) {
            try {
              code = Buffer.from(moduleCode, 'base64').toString('utf-8');
            } catch {
              // Not base64, use as-is
            }
          }

          updatedPlugin = await embeddedPluginService.updatePlugin(pluginId, {
            moduleCode: code,
            newManifest: manifest,
          });

        } else {
          // Container plugin - would need tar file upload
          // For now, require multipart form data for container image uploads
          return reply.status(400).send({
            error: {
              code: 'NOT_IMPLEMENTED',
              message: 'Container image upload requires multipart form data. Use POST /api/v1/plugins/:pluginId/update/image instead.',
            },
          });
        }

        return reply.send({
          id: updatedPlugin.id,
          forgehookId: updatedPlugin.forgehookId,
          name: updatedPlugin.manifest.name,
          version: updatedPlugin.manifest.version,
          previousVersion: dbPlugin.installedVersion,
          status: updatedPlugin.status,
          message: 'Plugin updated successfully via upload',
        });

      } catch (error) {
        logger.error({ pluginId, error }, 'Plugin upload update failed');
        return reply.status(500).send({
          error: {
            code: 'UPDATE_FAILED',
            message: error instanceof Error ? error.message : 'Update failed',
          },
        });
      }
    }
  );

  // ============================================================================
  // Rollback Plugin
  // ============================================================================
  fastify.post<{ Params: PluginParams }>(
    '/api/v1/plugins/:pluginId/rollback',
    async (request, reply) => {
      const { pluginId } = request.params;

      // Check if plugin exists
      const dbPlugin = await databaseService.getPlugin(pluginId);
      if (!dbPlugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      try {
        let rolledBackPlugin;

        if (dbPlugin.runtime === 'embedded') {
          rolledBackPlugin = await embeddedPluginService.rollbackPlugin(pluginId);
        } else {
          rolledBackPlugin = await dockerService.rollbackPlugin(pluginId);
        }

        return reply.send({
          id: rolledBackPlugin.id,
          forgehookId: rolledBackPlugin.forgehookId,
          name: rolledBackPlugin.manifest.name,
          version: rolledBackPlugin.manifest.version,
          status: rolledBackPlugin.status,
          message: 'Plugin rolled back successfully',
        });

      } catch (error) {
        logger.error({ pluginId, error }, 'Plugin rollback failed');
        return reply.status(500).send({
          error: {
            code: 'ROLLBACK_FAILED',
            message: error instanceof Error ? error.message : 'Rollback failed',
          },
        });
      }
    }
  );

  // ============================================================================
  // Get Plugin Update History
  // ============================================================================
  fastify.get<{ Params: PluginParams }>(
    '/api/v1/plugins/:pluginId/updates',
    async (request, reply) => {
      const { pluginId } = request.params;

      // Check if plugin exists
      const dbPlugin = await databaseService.getPlugin(pluginId);
      if (!dbPlugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      try {
        const history = await databaseService.getPluginUpdateHistory(pluginId);

        return reply.send({
          pluginId,
          currentVersion: dbPlugin.installedVersion || dbPlugin.manifest.version,
          previousVersion: dbPlugin.previousVersion,
          canRollback: !!dbPlugin.previousVersion,
          history,
        });

      } catch (error) {
        logger.error({ pluginId, error }, 'Failed to get update history');
        return reply.status(500).send({
          error: {
            code: 'HISTORY_FAILED',
            message: error instanceof Error ? error.message : 'Failed to get history',
          },
        });
      }
    }
  );

  // ============================================================================
  // Check for Plugin Updates (Container Plugins)
  // ============================================================================
  fastify.get<{ Params: PluginParams }>(
    '/api/v1/plugins/:pluginId/check-update',
    async (request, reply) => {
      const { pluginId } = request.params;

      const dbPlugin = await databaseService.getPlugin(pluginId);
      if (!dbPlugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      // Only container plugins can check for updates this way
      if (dbPlugin.runtime !== 'container' || !dbPlugin.manifest.image) {
        return reply.send({
          pluginId,
          hasUpdate: false,
          message: 'Update check not available for this plugin type',
        });
      }

      try {
        const { repository, tag } = dbPlugin.manifest.image;
        const result = await dockerService.checkImageUpdate(repository, tag || 'latest');

        return reply.send({
          pluginId,
          hasUpdate: result.hasUpdate,
          localDigest: result.localDigest,
          remoteDigest: result.remoteDigest,
          error: result.error,
        });

      } catch (error) {
        logger.error({ pluginId, error }, 'Failed to check for updates');
        return reply.status(500).send({
          error: {
            code: 'UPDATE_CHECK_FAILED',
            message: error instanceof Error ? error.message : 'Failed to check for updates',
          },
        });
      }
    }
  );

  // ============================================================================
  // Check All Plugins for Updates
  // ============================================================================
  fastify.get(
    '/api/v1/plugins/check-updates',
    async (request, reply) => {
      try {
        const results = await dockerService.checkAllPluginUpdates();
        const updates: Record<string, { hasUpdate: boolean; error?: string }> = {};
        
        for (const [pluginId, result] of results.entries()) {
          updates[pluginId] = result;
        }

        return reply.send({
          updates,
          checkedAt: new Date().toISOString(),
        });

      } catch (error) {
        logger.error({ error }, 'Failed to check for plugin updates');
        return reply.status(500).send({
          error: {
            code: 'UPDATE_CHECK_FAILED',
            message: error instanceof Error ? error.message : 'Failed to check for updates',
          },
        });
      }
    }
  );
}
