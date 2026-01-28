import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dockerService } from '../services/docker.service.js';
import { databaseService } from '../services/database.service.js';
import { getVersion, getBuildInfo } from '../utils/version.js';
import { getConfigSources, getSafeConfig } from '../config/validation.js';
import { config } from '../config/index.js';

export async function healthRoutes(fastify: FastifyInstance) {
  /**
   * Basic health check - used by load balancers and monitoring
   */
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const dockerOk = await dockerService.ping();
    const dbOk = await databaseService.isHealthy();

    const status = dockerOk && dbOk ? 'healthy' : 'degraded';
    const statusCode = status === 'healthy' ? 200 : 503;
    const buildInfo = getBuildInfo();
    const memUsage = process.memoryUsage();

    return reply.status(statusCode).send({
      status,
      service: 'LeForge',
      version: getVersion(),
      environment: buildInfo.environment,
      nodeVersion: buildInfo.nodeVersion,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
        unit: 'MB',
      },
      dependencies: {
        docker: dockerOk ? 'healthy' : 'unhealthy',
        database: dbOk ? 'healthy' : 'unhealthy',
      },
      plugins: {
        total: dockerService.listPlugins().length,
        running: dockerService.listPlugins().filter(p => p.status === 'running').length,
      },
    });
  });

  /**
   * Readiness probe - for container orchestration
   */
  fastify.get('/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const dockerOk = await dockerService.ping();
    const dbOk = await databaseService.isHealthy();

    if (!dockerOk || !dbOk) {
      return reply.status(503).send({
        ready: false,
        reason: !dockerOk ? 'Docker not available' : 'Database not available',
      });
    }

    return reply.send({
      ready: true,
    });
  });

  /**
   * Liveness probe - simple check that the process is running
   */
  fastify.get('/live', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ alive: true });
  });

  /**
   * Detailed status - includes configuration info (for debugging)
   * Only available in development mode
   */
  fastify.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    // Only allow detailed status in non-production
    if (config.environment === 'production') {
      return reply.status(403).send({ 
        error: 'Status endpoint disabled in production',
      });
    }

    const dockerOk = await dockerService.ping();
    const dbOk = await databaseService.isHealthy();
    const buildInfo = getBuildInfo();
    const configSources = getConfigSources();
    const safeConfig = getSafeConfig(config);
    const memUsage = process.memoryUsage();

    const envFromEnv = Object.values(configSources).filter(s => s === 'env').length;
    const envFromDefault = Object.values(configSources).filter(s => s === 'default').length;

    return reply.send({
      service: 'LeForge',
      version: getVersion(),
      build: buildInfo,
      uptime: {
        seconds: process.uptime(),
        formatted: formatUptime(process.uptime()),
      },
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
        unit: 'MB',
      },
      dependencies: {
        docker: { 
          status: dockerOk ? 'healthy' : 'unhealthy',
          socketPath: config.dockerSocketPath,
          network: config.dockerNetwork,
        },
        database: { 
          status: dbOk ? 'healthy' : 'unhealthy',
          host: config.postgres.host,
          database: config.postgres.database,
        },
      },
      plugins: {
        total: dockerService.listPlugins().length,
        running: dockerService.listPlugins().filter(p => p.status === 'running').length,
        stopped: dockerService.listPlugins().filter(p => p.status !== 'running').length,
        list: dockerService.listPlugins().map(p => ({
          id: p.forgehookId,
          name: p.manifest.name,
          status: p.status,
          port: p.hostPort,
        })),
      },
      config: {
        summary: {
          fromEnvironment: envFromEnv,
          usingDefaults: envFromDefault,
        },
        sources: configSources,
        resolved: safeConfig,
      },
    });
  });
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}
