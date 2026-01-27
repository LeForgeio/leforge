import { buildApp } from './app.js';
import { config } from './config/index.js';
import { validateConfig } from './config/validation.js';
import { logger } from './utils/logger.js';
import { printBanner, logStartupInfo, logConfig, logValidation, logReady } from './utils/startup.js';
import { databaseService } from './services/database.service.js';
import { dockerService } from './services/docker.service.js';
import { registryService } from './services/registry.service.js';
import { sslService } from './services/ssl.service.js';
import https from 'https';

async function main() {
  // ==========================================================================
  // 0. Startup Banner & Configuration Validation
  // ==========================================================================
  printBanner();
  logStartupInfo(config);
  logConfig(config);
  
  const validation = validateConfig(config);
  logValidation(validation);
  
  if (!validation.valid) {
    logger.fatal('Configuration validation failed. Exiting.');
    process.exit(1);
  }

  // ==========================================================================
  // 1. Connect to Database
  // ==========================================================================
  try {
    await databaseService.connect();
    logger.info('Database connection established');
  } catch (error) {
    logger.error({ error }, 'Cannot connect to database. Exiting.');
    process.exit(1);
  }

  // ==========================================================================
  // 2. Run Database Migrations
  // ==========================================================================
  try {
    await databaseService.runMigrations();
    logger.info('Database migrations completed');
  } catch (error) {
    logger.error({ error }, 'Database migration failed. Exiting.');
    process.exit(1);
  }

  // ==========================================================================
  // 3. Check Docker Connectivity
  // ==========================================================================
  const dockerOk = await dockerService.ping();
  if (!dockerOk) {
    logger.error('Cannot connect to Docker. Exiting.');
    process.exit(1);
  }
  logger.info('Docker connection established');

  // ==========================================================================
  // 4. Load Plugin Registry
  // ==========================================================================
  try {
    await registryService.loadRegistry();
    logger.info('Plugin registry loaded');
  } catch (error) {
    logger.error({ error }, 'Failed to load registry');
  }

  // ==========================================================================
  // 5. Initialize Docker Service (Load from DB + Sync with Docker)
  // ==========================================================================
  try {
    await dockerService.initialize();
    logger.info('Docker service initialized with database sync');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Docker service');
  }

  // ==========================================================================
  // 6. Build and Start Fastify App
  // ==========================================================================
  const app = await buildApp();

  // ==========================================================================
  // Graceful Shutdown
  // ==========================================================================
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');

    try {
      await app.close();
      logger.info('Server closed');

      await databaseService.disconnect();
      logger.info('Database connection closed');

      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ==========================================================================
  // Start Server (HTTP and optionally HTTPS)
  // ==========================================================================
  try {
    // Start HTTP server
    await app.listen({
      port: config.port,
      host: '0.0.0.0'
    });

    // Check if HTTPS should be enabled
    try {
      const sslSettings = await sslService.getSettings();
      const activeCert = await sslService.getActiveCertificate();
      
      if (sslSettings.httpsEnabled && activeCert) {
        logger.info({
          certHasKey: !!activeCert.privateKey,
          certHasCert: !!activeCert.certificate,
          keyType: typeof activeCert.privateKey,
          certType: typeof activeCert.certificate,
          keyLength: activeCert.privateKey?.length,
          certLength: activeCert.certificate?.length,
          keyStart: activeCert.privateKey?.substring(0, 50),
          certStart: activeCert.certificate?.substring(0, 50),
        }, 'HTTPS certificate details');
        
        const httpsServer = https.createServer(
          {
            key: activeCert.privateKey,
            cert: activeCert.certificate,
            ca: activeCert.caBundle ? [activeCert.caBundle] : undefined,
            minVersion: `TLSv${sslSettings.minTlsVersion}` as 'TLSv1.2' | 'TLSv1.3',
          },
          (req, res) => {
            // Route HTTPS requests through Fastify
            app.server.emit('request', req, res);
          }
        );

        httpsServer.listen(sslSettings.httpsPort, '0.0.0.0', () => {
          logger.info({ port: sslSettings.httpsPort }, 'HTTPS server started');
        });

        // Handle HTTPS redirect if enabled
        if (sslSettings.forceHttps) {
          app.addHook('onRequest', async (request, reply) => {
            // Skip if already HTTPS or local health check
            if (request.headers['x-forwarded-proto'] === 'https' || 
                request.url === '/health' ||
                request.headers.host?.includes('localhost')) {
              return;
            }
            
            const host = request.headers.host?.split(':')[0] || 'localhost';
            const httpsUrl = `https://${host}:${sslSettings.httpsPort}${request.url}`;
            return reply.redirect(httpsUrl);
          });
        }

        // Add HSTS header if enabled
        if (sslSettings.hstsEnabled) {
          app.addHook('onSend', async (_request, reply) => {
            reply.header('Strict-Transport-Security', `max-age=${sslSettings.hstsMaxAge}; includeSubDomains`);
          });
        }

        logger.info({
          httpsPort: sslSettings.httpsPort,
          forceHttps: sslSettings.forceHttps,
          hstsEnabled: sslSettings.hstsEnabled,
          certName: activeCert.name,
        }, 'HTTPS enabled');
      }
    } catch (sslError) {
      const err = sslError as Error & { code?: string };
      logger.warn({ 
        error: sslError,
        errorMessage: err.message,
        errorCode: err.code,
        errorStack: err.stack,
      }, 'Failed to initialize HTTPS - running HTTP only');
    }

    // Log startup summary
    const plugins = dockerService.listPlugins();
    const runningPlugins = plugins.filter(p => p.status === 'running').length;

    logReady(config, { totalPlugins: plugins.length, runningPlugins });

  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error({ error }, 'Unhandled error');
  process.exit(1);
});
