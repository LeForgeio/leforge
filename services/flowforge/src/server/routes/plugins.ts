import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dockerService } from '../services/docker.service.js';
import { embeddedPluginService } from '../services/embedded-plugin.service.js';
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

export async function pluginRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // List Plugins
  // ============================================================================
  fastify.get('/api/v1/plugins', async (request: FastifyRequest, reply: FastifyReply) => {
    const plugins = dockerService.listPlugins();

    // Return full manifest for dynamic UI rendering (Services, Playground, Documentation)
    const response = plugins.map((plugin) => ({
      id: plugin.id,
      forgehookId: plugin.forgehookId,
      name: plugin.manifest.name,
      version: plugin.manifest.version,
      description: plugin.manifest.description,
      status: plugin.status,
      runtime: plugin.runtime || 'container',
      hostPort: plugin.hostPort ?? 0,
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
      const plugin = dockerService.getPlugin(pluginId);

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
        hostPort: plugin.hostPort,
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
      const { manifest, manifestUrl, config, environment, autoStart } = request.body;

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
        if (existing) {
          return reply.status(409).send({
            error: {
              code: 'PLUGIN_EXISTS',
              message: `Plugin ${manifest.id} is already installed`,
              existingPluginId: existing.id,
            },
          });
        }

        logger.info({ forgehookId: manifest.id }, 'Installing plugin');

        const plugin = await dockerService.installPlugin({
          manifest,
          config,
          environment,
          autoStart,
        });

        return reply.status(201).send({
          id: plugin.id,
          forgehookId: plugin.forgehookId,
          name: plugin.manifest.name,
          version: plugin.manifest.version,
          status: plugin.status,
          hostPort: plugin.hostPort,
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
  fastify.post<{ Params: PluginParams }>(
    '/api/v1/plugins/:pluginId/start',
    async (request, reply) => {
      const { pluginId } = request.params;
      const plugin = dockerService.getPlugin(pluginId);

      if (!plugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      try {
        await dockerService.startPlugin(pluginId);

        return reply.send({
          id: plugin.id,
          status: 'running',
          message: 'Plugin started successfully',
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
      const plugin = dockerService.getPlugin(pluginId);

      if (!plugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      try {
        await dockerService.stopPlugin(pluginId);

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
      const plugin = dockerService.getPlugin(pluginId);

      if (!plugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      try {
        await dockerService.restartPlugin(pluginId);

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
      const plugin = dockerService.getPlugin(pluginId);

      if (!plugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      try {
        await dockerService.uninstallPlugin(pluginId);

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

      const plugin = dockerService.getPlugin(pluginId);

      if (!plugin) {
        return reply.status(404).send({
          error: {
            code: 'PLUGIN_NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
          },
        });
      }

      try {
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
}
