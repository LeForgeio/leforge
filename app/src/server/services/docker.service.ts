import Docker from 'dockerode';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import {
  ForgeHookManifest,
  PluginInstance,
  PluginStatus,
  PluginEvent,
  InstallPluginRequest,
} from '../types/index.js';
import { databaseService } from './database.service.js';

export class DockerService extends EventEmitter {
  private docker: Docker;
  private plugins: Map<string, PluginInstance> = new Map();
  private usedPorts: Set<number> = new Set();

  constructor() {
    super();

    // Connect to Docker
    if (config.dockerHost) {
      const [host, port] = config.dockerHost.replace('tcp://', '').split(':');
      this.docker = new Docker({ host, port: parseInt(port, 10) });
    } else {
      this.docker = new Docker({ socketPath: config.dockerSocketPath });
    }

    logger.info('Docker service initialized');
  }

  // ==========================================================================
  // Initialization & Sync
  // ==========================================================================

  async initialize(): Promise<void> {
    logger.info('Initializing Docker service');

    try {
      const plugins = await databaseService.listPlugins();
      logger.info({ count: plugins.length }, 'Loaded plugins from database');

      for (const plugin of plugins) {
        this.plugins.set(plugin.id, plugin);
        if (plugin.hostPort) {
          this.usedPorts.add(plugin.hostPort);
        }
      }

      await this.syncWithDocker();
      logger.info({ count: this.plugins.size }, 'Docker service initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Docker service');
      throw error;
    }
  }

  private async syncWithDocker(): Promise<void> {
    logger.info('Syncing with Docker containers');

    try {
      const containers = await this.docker.listContainers({ all: true });
      const forgehookContainers = containers.filter(c =>
        c.Names[0]?.startsWith(`/${config.plugins.containerPrefix}`)
      );

      const seenPluginIds = new Set<string>();

      for (const containerInfo of forgehookContainers) {
        const containerName = containerInfo.Names[0].substring(1);
        const forgehookId = containerName.replace(config.plugins.containerPrefix, '');
        const plugin = this.getPluginByForgehookId(forgehookId);

        if (plugin) {
          seenPluginIds.add(plugin.id);
          const isRunning = containerInfo.State === 'running';
          const newStatus: PluginStatus = isRunning ? 'running' : 'stopped';

          if (plugin.status !== newStatus || plugin.containerId !== containerInfo.Id) {
            logger.info(
              { pluginId: plugin.id, oldStatus: plugin.status, newStatus },
              'Syncing plugin status with Docker'
            );

            plugin.status = newStatus;
            plugin.containerId = containerInfo.Id;

            await databaseService.updatePlugin(plugin.id, {
              status: newStatus,
              containerId: containerInfo.Id,
            });

            if (isRunning) {
              this.monitorHealth(plugin.id);
            }
          }
        } else {
          logger.warn(
            { containerName, containerId: containerInfo.Id },
            'Found orphaned ForgeHook container (not in database)'
          );
          await this.adoptOrphanedContainer(containerInfo);
        }
      }

      for (const [pluginId, plugin] of this.plugins.entries()) {
        if (!seenPluginIds.has(pluginId) && plugin.containerId) {
          logger.warn(
            { pluginId, forgehookId: plugin.forgehookId },
            'Plugin container missing - marking as stopped'
          );

          plugin.status = 'stopped';
          plugin.containerId = undefined;

          await databaseService.updatePlugin(pluginId, {
            status: 'stopped',
            containerId: null,
          });
        }
      }

      logger.info('Docker sync completed');
    } catch (error) {
      logger.error({ error }, 'Docker sync failed');
    }
  }

  private async adoptOrphanedContainer(containerInfo: Docker.ContainerInfo): Promise<void> {
    const containerName = containerInfo.Names[0].substring(1);
    const forgehookId = containerName.replace(config.plugins.containerPrefix, '');

    try {
      const container = this.docker.getContainer(containerInfo.Id);
      const info = await container.inspect();

      const portBindings = info.HostConfig.PortBindings || {};
      const portKey = Object.keys(portBindings)[0];
      const hostPort = portBindings[portKey]?.[0]?.HostPort;

      if (!hostPort) {
        logger.warn({ containerName }, 'Cannot adopt container - no port binding found');
        return;
      }

      const plugin: PluginInstance = {
        id: uuidv4(),
        forgehookId,
        manifest: {
          id: forgehookId,
          name: forgehookId,
          version: 'unknown',
          description: 'Adopted from existing container',
          image: { repository: info.Config.Image },
          port: parseInt(portKey.split('/')[0], 10),
          endpoints: [],
        },
        status: info.State.Running ? 'running' : 'stopped',
        runtime: 'container',
        containerId: containerInfo.Id,
        containerName,
        hostPort: parseInt(hostPort, 10),
        config: {},
        environment: {},
        installedAt: new Date(info.Created),
        healthStatus: info.State.Health?.Status === 'healthy' ? 'healthy' : 'unknown',
      };

      await databaseService.createPlugin(plugin);
      this.plugins.set(plugin.id, plugin);
      if (plugin.hostPort) {
        this.usedPorts.add(plugin.hostPort);
      }

      logger.info({ pluginId: plugin.id, forgehookId }, 'Adopted orphaned container');

      if (plugin.status === 'running') {
        this.monitorHealth(plugin.id);
      }
    } catch (error) {
      logger.error({ error, containerName }, 'Failed to adopt orphaned container');
    }
  }

  // ==========================================================================
  // Connection & Health
  // ==========================================================================

  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch (error) {
      logger.error({ error }, 'Docker ping failed');
      return false;
    }
  }

  async getInfo() {
    return this.docker.info();
  }

  // ==========================================================================
  // Port Management
  // ==========================================================================

  private async findAvailablePort(): Promise<number> {
    const { portRangeStart, portRangeEnd } = config.plugins;
    const dbPorts = await databaseService.getUsedPorts();
    const dbPortSet = new Set(dbPorts);

    const containers = await this.docker.listContainers({ all: true });
    const containerPorts = new Set<number>();

    for (const container of containers) {
      for (const port of container.Ports || []) {
        if (port.PublicPort) {
          containerPorts.add(port.PublicPort);
        }
      }
    }

    for (let port = portRangeStart; port <= portRangeEnd; port++) {
      if (!this.usedPorts.has(port) && !dbPortSet.has(port) && !containerPorts.has(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }

    throw new Error('No available ports in configured range');
  }

  private releasePort(port: number): void {
    this.usedPorts.delete(port);
  }

  // ==========================================================================
  // Image Management
  // ==========================================================================

  async pullImage(repository: string, tag: string = 'latest'): Promise<void> {
    const imageRef = `${repository}:${tag}`;
    logger.info({ image: imageRef }, 'Pulling image');

    return new Promise((resolve, reject) => {
      this.docker.pull(imageRef, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) {
          logger.error({ error: err, image: imageRef }, 'Failed to pull image');
          return reject(err);
        }

        this.docker.modem.followProgress(
          stream,
          (error: Error | null) => {
            if (error) {
              logger.error({ error, image: imageRef }, 'Image pull failed');
              reject(error);
            } else {
              logger.info({ image: imageRef }, 'Image pulled successfully');
              resolve();
            }
          },
          (event: { status: string; progress?: string }) => {
            logger.debug({ image: imageRef, status: event.status }, 'Pull progress');
          }
        );
      });
    });
  }

  async imageExists(repository: string, tag: string = 'latest'): Promise<boolean> {
    try {
      const imageRef = `${repository}:${tag}`;
      await this.docker.getImage(imageRef).inspect();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get local image digest for comparison
   */
  async getLocalImageDigest(repository: string, tag: string = 'latest'): Promise<string | null> {
    try {
      const imageRef = `${repository}:${tag}`;
      const image = this.docker.getImage(imageRef);
      const info = await image.inspect();
      // RepoDigests contains the digest in format: repo@sha256:...
      const repoDigest = info.RepoDigests?.find(d => d.startsWith(repository));
      if (repoDigest) {
        const digestMatch = repoDigest.match(/@(sha256:[a-f0-9]+)/);
        return digestMatch ? digestMatch[1] : null;
      }
      // Fallback to image ID
      return info.Id;
    } catch {
      return null;
    }
  }

  /**
   * Check if a remote image has an update available by comparing digests
   * Uses Docker Hub API to fetch remote digest
   */
  async checkImageUpdate(repository: string, tag: string = 'latest'): Promise<{
    hasUpdate: boolean;
    localDigest: string | null;
    remoteDigest: string | null;
    error?: string;
  }> {
    const localDigest = await this.getLocalImageDigest(repository, tag);
    
    try {
      // For Docker Hub images, query the registry API
      // Format: namespace/repo or library/repo for official images
      let namespace = 'library';
      let repo = repository;
      
      if (repository.includes('/')) {
        [namespace, repo] = repository.split('/');
      }

      // Get auth token for Docker Hub
      const tokenResponse = await fetch(
        `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${namespace}/${repo}:pull`
      );
      
      if (!tokenResponse.ok) {
        return { hasUpdate: false, localDigest, remoteDigest: null, error: 'Failed to get auth token' };
      }
      
      const { token } = await tokenResponse.json() as { token: string };

      // Fetch manifest to get digest
      const manifestResponse = await fetch(
        `https://registry-1.docker.io/v2/${namespace}/${repo}/manifests/${tag}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json',
          },
        }
      );

      if (!manifestResponse.ok) {
        return { hasUpdate: false, localDigest, remoteDigest: null, error: 'Failed to fetch manifest' };
      }

      // Docker-Content-Digest header contains the digest
      const remoteDigest = manifestResponse.headers.get('docker-content-digest');
      
      if (!remoteDigest || !localDigest) {
        return { hasUpdate: false, localDigest, remoteDigest };
      }

      const hasUpdate = localDigest !== remoteDigest;
      
      logger.debug({ repository, tag, localDigest, remoteDigest, hasUpdate }, 'Image update check');
      
      return { hasUpdate, localDigest, remoteDigest };
      
    } catch (error) {
      logger.warn({ error, repository, tag }, 'Failed to check for image update');
      return { 
        hasUpdate: false, 
        localDigest, 
        remoteDigest: null, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Check all container plugins for available updates
   */
  async checkAllPluginUpdates(): Promise<Map<string, { hasUpdate: boolean; error?: string }>> {
    const results = new Map<string, { hasUpdate: boolean; error?: string }>();
    
    for (const [pluginId, plugin] of this.plugins.entries()) {
      if (plugin.runtime === 'container' && plugin.manifest.image) {
        const { repository, tag } = plugin.manifest.image;
        const result = await this.checkImageUpdate(repository, tag || 'latest');
        results.set(pluginId, { hasUpdate: result.hasUpdate, error: result.error });
      }
    }
    
    return results;
  }

  // ==========================================================================
  // Network Management
  // ==========================================================================

  async ensureNetwork(networkName: string): Promise<void> {
    try {
      await this.docker.getNetwork(networkName).inspect();
      logger.debug({ network: networkName }, 'Network exists');
    } catch {
      logger.info({ network: networkName }, 'Creating network');
      await this.docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
      });
    }
  }

  // ==========================================================================
  // Volume Management
  // ==========================================================================

  async createVolume(name: string): Promise<Docker.Volume> {
    const volumeName = `${config.plugins.volumePrefix}${name}`;

    try {
      const volume = this.docker.getVolume(volumeName);
      await volume.inspect();
      logger.debug({ volume: volumeName }, 'Volume exists');
      return volume;
    } catch {
      logger.info({ volume: volumeName }, 'Creating volume');
      await this.docker.createVolume({ Name: volumeName });
      return this.docker.getVolume(volumeName);
    }
  }

  // ==========================================================================
  // Plugin Lifecycle
  // ==========================================================================

  async installPlugin(request: InstallPluginRequest): Promise<PluginInstance> {
    const manifest = request.manifest;
    if (!manifest) {
      throw new Error('Manifest is required');
    }

    const pluginId = uuidv4();
    const containerName = `${config.plugins.containerPrefix}${manifest.id}`;

    logger.info({ pluginId, forgehookId: manifest.id }, 'Installing plugin');

    const plugin: PluginInstance = {
      id: pluginId,
      forgehookId: manifest.id,
      manifest,
      status: 'installing',
      runtime: 'container',
      containerName,
      hostPort: manifest.hostPort || await this.findAvailablePort(),
      config: request.config || {},
      environment: request.environment || {},
      installedAt: new Date(),
    };

    this.plugins.set(pluginId, plugin);
    await databaseService.createPlugin(plugin);
    this.emitEvent('plugin:installing', pluginId);

    try {
      await this.ensureNetwork(config.plugins.networkName);

      if (!manifest.image) {
        throw new Error('Container plugins require image configuration');
      }

      const imageRef = `${manifest.image.repository}:${manifest.image.tag || 'latest'}`;
      if (!await this.imageExists(manifest.image.repository, manifest.image.tag)) {
        await this.pullImage(manifest.image.repository, manifest.image.tag);
      }

      const volumeBinds: string[] = [];
      if (manifest.volumes) {
        for (const vol of manifest.volumes) {
          await this.createVolume(vol.name);
          const volumeName = `${config.plugins.volumePrefix}${vol.name}`;
          volumeBinds.push(`${volumeName}:${vol.containerPath}${vol.readOnly ? ':ro' : ''}`);
        }
      }

      const env: string[] = [
        `PORT=${manifest.port}`,
        `NODE_ENV=production`,
        `ENVIRONMENT=production`,
      ];

      // Redis is embedded in the LeForge app container
      if (manifest.dependencies?.services?.includes('redis')) {
        env.push(`REDIS_HOST=LeForge-app`);
        env.push(`REDIS_PORT=${config.redis.port}`);
        env.push(`REDIS_PASSWORD=${config.redis.password}`);
      }

      // PostgreSQL is embedded in the LeForge app container
      if (manifest.dependencies?.services?.includes('postgres')) {
        env.push(`POSTGRES_HOST=LeForge-app`);
        env.push(`POSTGRES_PORT=${config.postgres.port}`);
        env.push(`POSTGRES_USER=${config.postgres.user}`);
        env.push(`POSTGRES_PASSWORD=${config.postgres.password}`);
        env.push(`POSTGRES_DB=${config.postgres.database}`);
      }

      // Qdrant is optional (add-on container)
      if (manifest.dependencies?.services?.includes('qdrant')) {
        env.push(`QDRANT_HOST=${process.env.QDRANT_HOST || 'LeForge-qdrant'}`);
        env.push(`QDRANT_PORT=${process.env.QDRANT_PORT || '6333'}`);
        env.push(`QDRANT_URL=${process.env.QDRANT_URL || 'http://LeForge-qdrant:6333'}`);
      }

      for (const [key, value] of Object.entries(plugin.environment)) {
        env.push(`${key}=${value}`);
      }

      if (manifest.environment) {
        for (const envVar of manifest.environment) {
          if (envVar.default && !plugin.environment[envVar.name]) {
            env.push(`${envVar.name}=${envVar.default}`);
          }
        }
      }

      const container = await this.docker.createContainer({
        name: containerName,
        Image: imageRef,
        Env: env,
        ExposedPorts: {
          [`${manifest.port}/tcp`]: {},
        },
        HostConfig: {
          PortBindings: {
            [`${manifest.port}/tcp`]: [{ HostPort: String(plugin.hostPort) }],
          },
          NetworkMode: config.plugins.networkName,
          Binds: volumeBinds,
          RestartPolicy: { Name: 'unless-stopped' },
          Memory: this.parseMemory(manifest.resources?.memory || '512m'),
          NanoCpus: this.parseCpu(manifest.resources?.cpu || '1'),
        },
        Healthcheck: manifest.healthCheck ? {
          Test: ['CMD', 'curl', '-f', `http://localhost:${manifest.port}${manifest.healthCheck.path || '/health'}`],
          Interval: (manifest.healthCheck.interval || 30) * 1000000000,
          Timeout: (manifest.healthCheck.timeout || 10) * 1000000000,
          Retries: manifest.healthCheck.retries || 3,
        } : undefined,
      });

      plugin.containerId = container.id;
      plugin.status = 'installed';

      await databaseService.updatePlugin(pluginId, {
        status: 'installed',
        containerId: container.id,
      });

      this.emitEvent('plugin:installed', pluginId);
      logger.info({ pluginId, containerId: container.id }, 'Plugin installed');

      if (request.autoStart !== false) {
        await this.startPlugin(pluginId);
      }

      return plugin;

    } catch (error) {
      plugin.status = 'error';
      plugin.error = error instanceof Error ? error.message : 'Unknown error';

      await databaseService.updatePlugin(pluginId, {
        status: 'error',
        error: plugin.error,
      });

      this.emitEvent('plugin:error', pluginId, { error: plugin.error });
      logger.error({ pluginId, error }, 'Plugin installation failed');
      throw error;
    }
  }

  async startPlugin(pluginId: string, options?: { pullLatest?: boolean }): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (!plugin.containerId) {
      throw new Error(`Plugin ${pluginId} has no container`);
    }

    logger.info({ pluginId, pullLatest: options?.pullLatest }, 'Starting plugin');
    plugin.status = 'starting';
    this.emitEvent('plugin:starting', pluginId);

    await databaseService.updatePlugin(pluginId, { status: 'starting' });

    try {
      // If pullLatest is requested and this is a container plugin with an image
      if (options?.pullLatest && plugin.manifest.image) {
        const { repository, tag } = plugin.manifest.image;
        const imageRef = `${repository}:${tag || 'latest'}`;
        
        logger.info({ pluginId, imageRef }, 'Pulling latest image before start');
        
        // Pull the latest image
        await this.pullImage(repository, tag || 'latest');
        
        // Check if the image actually changed
        const updateCheck = await this.checkImageUpdate(repository, tag || 'latest');
        
        if (updateCheck.hasUpdate || !updateCheck.localDigest) {
          logger.info({ pluginId }, 'New image available, recreating container');
          
          // Remove old container
          const oldContainer = this.docker.getContainer(plugin.containerId);
          try {
            await oldContainer.remove({ force: true });
          } catch {
            // Ignore if already removed
          }
          
          // Recreate container with same config but new image
          const containerName = plugin.containerName || `${config.plugins.containerPrefix}${plugin.forgehookId}`;
          const manifest = plugin.manifest;
          
          const env: string[] = [
            `PORT=${manifest.port}`,
            `NODE_ENV=production`,
            `ENVIRONMENT=production`,
          ];

          if (manifest.dependencies?.services?.includes('redis')) {
            env.push(`REDIS_HOST=LeForge-app`);
            env.push(`REDIS_PORT=${config.redis.port}`);
            env.push(`REDIS_PASSWORD=${config.redis.password}`);
          }

          if (manifest.dependencies?.services?.includes('postgres')) {
            env.push(`POSTGRES_HOST=LeForge-app`);
            env.push(`POSTGRES_PORT=${config.postgres.port}`);
            env.push(`POSTGRES_USER=${config.postgres.user}`);
            env.push(`POSTGRES_PASSWORD=${config.postgres.password}`);
            env.push(`POSTGRES_DB=${config.postgres.database}`);
          }

          if (manifest.dependencies?.services?.includes('qdrant')) {
            env.push(`QDRANT_HOST=${process.env.QDRANT_HOST || 'LeForge-qdrant'}`);
            env.push(`QDRANT_PORT=${process.env.QDRANT_PORT || '6333'}`);
            env.push(`QDRANT_URL=${process.env.QDRANT_URL || 'http://LeForge-qdrant:6333'}`);
          }

          for (const [key, value] of Object.entries(plugin.environment)) {
            env.push(`${key}=${value}`);
          }

          if (manifest.environment) {
            for (const envVar of manifest.environment) {
              if (envVar.default && !plugin.environment[envVar.name]) {
                env.push(`${envVar.name}=${envVar.default}`);
              }
            }
          }

          const volumeBinds: string[] = [];
          if (manifest.volumes) {
            for (const vol of manifest.volumes) {
              const volumeName = `${config.plugins.volumePrefix}${vol.name}`;
              volumeBinds.push(`${volumeName}:${vol.containerPath}${vol.readOnly ? ':ro' : ''}`);
            }
          }

          const newContainer = await this.docker.createContainer({
            name: containerName,
            Image: imageRef,
            Env: env,
            ExposedPorts: {
              [`${manifest.port}/tcp`]: {},
            },
            HostConfig: {
              PortBindings: {
                [`${manifest.port}/tcp`]: [{ HostPort: String(plugin.hostPort) }],
              },
              NetworkMode: config.plugins.networkName,
              Binds: volumeBinds,
              RestartPolicy: { Name: 'unless-stopped' },
              Memory: this.parseMemory(manifest.resources?.memory || '512m'),
              NanoCpus: this.parseCpu(manifest.resources?.cpu || '1'),
            },
            Healthcheck: manifest.healthCheck ? {
              Test: ['CMD', 'curl', '-f', `http://localhost:${manifest.port}${manifest.healthCheck.path || '/health'}`],
              Interval: (manifest.healthCheck.interval || 30) * 1000000000,
              Timeout: (manifest.healthCheck.timeout || 10) * 1000000000,
              Retries: manifest.healthCheck.retries || 3,
            } : undefined,
          });

          plugin.containerId = newContainer.id;
          
          await databaseService.updatePlugin(pluginId, {
            containerId: newContainer.id,
          });
          
          await newContainer.start();
        } else {
          // No update, just start existing container
          const container = this.docker.getContainer(plugin.containerId);
          await container.start();
        }
      } else {
        // Normal start without pulling
        const container = this.docker.getContainer(plugin.containerId);
        await container.start();
      }

      plugin.status = 'running';
      plugin.startedAt = new Date();

      await databaseService.updatePlugin(pluginId, {
        status: 'running',
        startedAt: plugin.startedAt,
      });

      this.emitEvent('plugin:started', pluginId);
      logger.info({ pluginId }, 'Plugin started');

      this.monitorHealth(pluginId);

    } catch (error) {
      plugin.status = 'error';
      plugin.error = error instanceof Error ? error.message : 'Unknown error';

      await databaseService.updatePlugin(pluginId, {
        status: 'error',
        error: plugin.error,
      });

      this.emitEvent('plugin:error', pluginId, { error: plugin.error });
      throw error;
    }
  }

  async stopPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (!plugin.containerId) {
      throw new Error(`Plugin ${pluginId} has no container`);
    }

    logger.info({ pluginId }, 'Stopping plugin');
    plugin.status = 'stopping';
    this.emitEvent('plugin:stopping', pluginId);

    await databaseService.updatePlugin(pluginId, { status: 'stopping' });

    try {
      const container = this.docker.getContainer(plugin.containerId);
      await container.stop({ t: 30 });

      plugin.status = 'stopped';
      plugin.stoppedAt = new Date();

      await databaseService.updatePlugin(pluginId, {
        status: 'stopped',
        stoppedAt: plugin.stoppedAt,
      });

      this.emitEvent('plugin:stopped', pluginId);
      logger.info({ pluginId }, 'Plugin stopped');

    } catch (error) {
      plugin.status = 'error';
      plugin.error = error instanceof Error ? error.message : 'Unknown error';

      await databaseService.updatePlugin(pluginId, {
        status: 'error',
        error: plugin.error,
      });

      this.emitEvent('plugin:error', pluginId, { error: plugin.error });
      throw error;
    }
  }

  async restartPlugin(pluginId: string): Promise<void> {
    await this.stopPlugin(pluginId);
    await this.startPlugin(pluginId);
  }

  async uninstallPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    logger.info({ pluginId }, 'Uninstalling plugin');
    plugin.status = 'uninstalling';
    this.emitEvent('plugin:uninstalling', pluginId);

    await databaseService.updatePlugin(pluginId, { status: 'uninstalling' });

    try {
      if (plugin.containerId) {
        const container = this.docker.getContainer(plugin.containerId);

        try {
          const info = await container.inspect();
          if (info.State.Running) {
            await container.stop({ t: 10 });
          }
        } catch {
          // Container might not exist
        }

        try {
          await container.remove({ force: true });
        } catch {
          // Ignore if already removed
        }
      }

      if (plugin.hostPort) {
        this.releasePort(plugin.hostPort);
      }
      this.plugins.delete(pluginId);
      await databaseService.deletePlugin(pluginId);

      this.emitEvent('plugin:uninstalled', pluginId);
      logger.info({ pluginId }, 'Plugin uninstalled');

    } catch (error) {
      plugin.status = 'error';
      plugin.error = error instanceof Error ? error.message : 'Unknown error';

      await databaseService.updatePlugin(pluginId, {
        status: 'error',
        error: plugin.error,
      });

      this.emitEvent('plugin:error', pluginId, { error: plugin.error });
      throw error;
    }
  }

  /**
   * Update a container plugin to a new version
   * Supports both online (pull new image) and offline (load from tar file)
   */
  async updatePlugin(
    pluginId: string,
    options: {
      newImageTag?: string;         // Online: Pull this tag
      imageTarPath?: string;        // Offline: Load from tar file
      newManifest?: ForgeHookManifest;
    }
  ): Promise<PluginInstance> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const currentVersion = plugin.manifest.version;
    const currentImageTag = plugin.manifest.image?.tag || 'latest';
    const newManifest = options.newManifest || plugin.manifest;
    const updateType: 'online' | 'upload' = options.imageTarPath ? 'upload' : 'online';

    logger.info({ pluginId, currentVersion, updateType }, 'Updating container plugin');

    const wasRunning = plugin.status === 'running';
    this.emitEvent('plugin:updating', pluginId);

    try {
      // Step 1: Get the new image
      let newImageRef: string;
      
      if (options.imageTarPath) {
        // Offline update - load from tar file
        logger.info({ pluginId, tarPath: options.imageTarPath }, 'Loading image from tar file');
        const fs = await import('fs');
        const tarStream = fs.createReadStream(options.imageTarPath);
        await this.docker.loadImage(tarStream);
        newImageRef = `${newManifest.image?.repository}:${newManifest.image?.tag || 'latest'}`;
      } else if (options.newImageTag || newManifest.image?.tag) {
        // Online update - pull new tag
        const newTag = options.newImageTag || newManifest.image?.tag || 'latest';
        const repo = newManifest.image?.repository || plugin.manifest.image?.repository;
        if (!repo) {
          throw new Error('No image repository specified');
        }
        newImageRef = `${repo}:${newTag}`;
        
        logger.info({ pluginId, newImageRef }, 'Pulling new image');
        await this.pullImage(repo, newTag);
      } else {
        throw new Error('Either newImageTag or imageTarPath must be provided');
      }

      // Step 2: Stop current container if running
      if (wasRunning && plugin.containerId) {
        logger.info({ pluginId }, 'Stopping current container for update');
        const container = this.docker.getContainer(plugin.containerId);
        try {
          await container.stop({ t: 10 });
        } catch {
          // May already be stopped
        }
      }

      // Step 3: Remove old container
      if (plugin.containerId) {
        const container = this.docker.getContainer(plugin.containerId);
        try {
          await container.remove({ force: true });
        } catch {
          // May already be removed
        }
      }

      // Step 4: Create new container with same config
      const containerName = plugin.containerName || `${config.plugins.containerPrefix}${plugin.forgehookId}`;
      
      const env: string[] = [
        `PORT=${newManifest.port}`,
        `NODE_ENV=production`,
        `ENVIRONMENT=production`,
      ];

      // Redis is embedded in the LeForge app container
      if (newManifest.dependencies?.services?.includes('redis')) {
        env.push(`REDIS_HOST=LeForge-app`);
        env.push(`REDIS_PORT=${config.redis.port}`);
        env.push(`REDIS_PASSWORD=${config.redis.password}`);
      }

      // PostgreSQL is embedded in the LeForge app container
      if (newManifest.dependencies?.services?.includes('postgres')) {
        env.push(`POSTGRES_HOST=LeForge-app`);
        env.push(`POSTGRES_PORT=${config.postgres.port}`);
        env.push(`POSTGRES_USER=${config.postgres.user}`);
        env.push(`POSTGRES_PASSWORD=${config.postgres.password}`);
        env.push(`POSTGRES_DB=${config.postgres.database}`);
      }

      // Qdrant is optional (add-on container)
      if (newManifest.dependencies?.services?.includes('qdrant')) {
        env.push(`QDRANT_HOST=${process.env.QDRANT_HOST || 'LeForge-qdrant'}`);
        env.push(`QDRANT_PORT=${process.env.QDRANT_PORT || '6333'}`);
        env.push(`QDRANT_URL=${process.env.QDRANT_URL || 'http://LeForge-qdrant:6333'}`);
      }

      for (const [key, value] of Object.entries(plugin.environment)) {
        env.push(`${key}=${value}`);
      }

      if (newManifest.environment) {
        for (const envVar of newManifest.environment) {
          if (envVar.default && !plugin.environment[envVar.name]) {
            env.push(`${envVar.name}=${envVar.default}`);
          }
        }
      }

      const volumeBinds: string[] = [];
      if (newManifest.volumes) {
        for (const vol of newManifest.volumes) {
          const volumeName = `${config.plugins.volumePrefix}${vol.name}`;
          volumeBinds.push(`${volumeName}:${vol.containerPath}${vol.readOnly ? ':ro' : ''}`);
        }
      }

      const newContainer = await this.docker.createContainer({
        name: containerName,
        Image: newImageRef,
        Env: env,
        ExposedPorts: {
          [`${newManifest.port}/tcp`]: {},
        },
        HostConfig: {
          PortBindings: {
            [`${newManifest.port}/tcp`]: [{ HostPort: String(plugin.hostPort) }],
          },
          NetworkMode: config.plugins.networkName,
          Binds: volumeBinds,
          RestartPolicy: { Name: 'unless-stopped' },
          Memory: this.parseMemory(newManifest.resources?.memory || '512m'),
          NanoCpus: this.parseCpu(newManifest.resources?.cpu || '1'),
        },
        Healthcheck: newManifest.healthCheck ? {
          Test: ['CMD', 'curl', '-f', `http://localhost:${newManifest.port}${newManifest.healthCheck.path || '/health'}`],
          Interval: (newManifest.healthCheck.interval || 30) * 1000000000,
          Timeout: (newManifest.healthCheck.timeout || 10) * 1000000000,
          Retries: newManifest.healthCheck.retries || 3,
        } : undefined,
      });

      // Step 5: Start new container if was running
      if (wasRunning) {
        await newContainer.start();
      }

      const newContainerInfo = await newContainer.inspect();
      const newVersion = newManifest.version;

      // Step 6: Update in-memory state
      plugin.containerId = newContainerInfo.Id;
      plugin.manifest = newManifest;
      plugin.status = wasRunning ? 'running' : 'stopped';
      plugin.error = undefined;

      // Step 7: Update database
      await databaseService.updatePlugin(pluginId, {
        status: plugin.status,
        containerId: newContainerInfo.Id,
        manifest: newManifest,
        installedVersion: newVersion,
        previousVersion: currentVersion,
        previousImageTag: currentImageTag,
        lastUpdatedAt: new Date(),
        startedAt: wasRunning ? new Date() : null,
        error: null,
      });

      // Step 8: Log update history
      await databaseService.logUpdateHistory(
        pluginId,
        currentVersion,
        newVersion,
        updateType,
        true
      );

      this.emitEvent('plugin:updated', pluginId);

      logger.info(
        { pluginId, previousVersion: currentVersion, newVersion, updateType },
        'Container plugin updated successfully'
      );

      return plugin;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Update failed';
      
      logger.error({ error, pluginId }, 'Failed to update container plugin');

      // Log failed update
      await databaseService.logUpdateHistory(
        pluginId,
        currentVersion,
        options.newManifest?.version || 'unknown',
        updateType,
        false,
        errorMessage
      );

      plugin.status = 'error';
      plugin.error = errorMessage;

      await databaseService.updatePlugin(pluginId, {
        status: 'error',
        error: errorMessage,
      });

      this.emitEvent('plugin:error', pluginId, { error: errorMessage });
      throw error;
    }
  }

  /**
   * Rollback a container plugin to previous version
   */
  async rollbackPlugin(pluginId: string): Promise<PluginInstance> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    // Get previous image tag from database
    const result = await databaseService.query(
      'SELECT previous_image_tag, previous_version FROM plugins WHERE id = $1',
      [pluginId]
    );

    const previousImageTag = result.rows[0]?.previous_image_tag;
    const previousVersion = result.rows[0]?.previous_version;

    if (!previousImageTag || !previousVersion) {
      throw new Error('No previous version available for rollback');
    }

    const currentVersion = plugin.manifest.version;
    const repo = plugin.manifest.image?.repository;
    if (!repo) {
      throw new Error('No image repository found in manifest');
    }

    logger.info({ pluginId, currentVersion, previousVersion, previousImageTag }, 'Rolling back container plugin');

    // Create updated manifest with previous tag
    const rollbackManifest = {
      ...plugin.manifest,
      version: previousVersion,
      image: {
        ...plugin.manifest.image!,
        tag: previousImageTag,
      },
    };

    // Use the update method with the previous image tag
    return this.updatePlugin(pluginId, {
      newImageTag: previousImageTag,
      newManifest: rollbackManifest,
    });
  }

  // ==========================================================================
  // Plugin Queries
  // ==========================================================================

  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId);
  }

  getPluginByForgehookId(forgehookId: string): PluginInstance | undefined {
    for (const plugin of this.plugins.values()) {
      if (plugin.forgehookId === forgehookId) {
        return plugin;
      }
    }
    return undefined;
  }

  listPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }

  async getPluginLogs(pluginId: string, tail: number = 100): Promise<string> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin?.containerId) {
      throw new Error(`Plugin ${pluginId} not found or has no container`);
    }

    const container = this.docker.getContainer(plugin.containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    });

    return logs.toString('utf-8');
  }

  // ==========================================================================
  // Health Monitoring
  // ==========================================================================

  private async monitorHealth(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin?.containerId) return;

    const checkHealth = async () => {
      const currentPlugin = this.plugins.get(pluginId);
      if (!currentPlugin || currentPlugin.status !== 'running') return;

      try {
        const container = this.docker.getContainer(currentPlugin.containerId!);
        const info = await container.inspect();

        const healthStatus = info.State.Health?.Status || 'unknown';
        currentPlugin.healthStatus = healthStatus === 'healthy' ? 'healthy' :
                                     healthStatus === 'unhealthy' ? 'unhealthy' : 'unknown';
        currentPlugin.lastHealthCheck = new Date();

        await databaseService.updatePlugin(pluginId, {
          healthStatus: currentPlugin.healthStatus,
          lastHealthCheck: currentPlugin.lastHealthCheck,
        });

        this.emitEvent('plugin:health', pluginId, {
          status: currentPlugin.healthStatus
        });

        setTimeout(checkHealth, 30000);

      } catch (error) {
        logger.error({ pluginId, error }, 'Health check failed');
        setTimeout(checkHealth, 30000);
      }
    };

    setTimeout(checkHealth, 10000);
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private parseMemory(memory: string): number {
    const match = memory.match(/^(\d+)([mg])$/i);
    if (!match) return 512 * 1024 * 1024;

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    return unit === 'g' ? value * 1024 * 1024 * 1024 : value * 1024 * 1024;
  }

  private parseCpu(cpu: string): number {
    const cores = parseFloat(cpu);
    return Math.floor(cores * 1000000000);
  }

  private emitEvent(type: PluginEvent['type'], pluginId: string, data?: Record<string, unknown>): void {
    const event: PluginEvent = {
      type,
      pluginId,
      timestamp: new Date(),
      data,
    };
    this.emit('plugin-event', event);

    databaseService.logEvent(event).catch(err => {
      logger.warn({ err }, 'Failed to log event to database');
    });
  }
}

// Singleton instance
export const dockerService = new DockerService();
