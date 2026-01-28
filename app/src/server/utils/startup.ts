import { Config } from '../config/index.js';
import { getSafeConfig, getConfigSources, ValidationResult } from '../config/validation.js';
import { getVersion, getBuildInfo } from './version.js';
import { logger } from './logger.js';

const BANNER = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ███████╗██╗      ██████╗ ██╗    ██╗███████╗ ██████╗ ██████╗ ║
║   ██╔════╝██║     ██╔═══██╗██║    ██║██╔════╝██╔═══██╗██╔══██╗║
║   █████╗  ██║     ██║   ██║██║ █╗ ██║█████╗  ██║   ██║██████╔╝║
║   ██╔══╝  ██║     ██║   ██║██║███╗██║██╔══╝  ██║   ██║██╔══██╗║
║   ██║     ███████╗╚██████╔╝╚███╔███╔╝██║     ╚██████╔╝██║  ██║║
║   ╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝ ╚═╝      ╚═════╝ ╚═╝  ╚═╝║
║                                                               ║
║            ForgeHook Plugin Platform                          ║
╚═══════════════════════════════════════════════════════════════╝
`;

/**
 * Print startup banner to console
 */
export function printBanner(): void {
  console.log(BANNER);
}

/**
 * Log startup information
 */
export function logStartupInfo(_config: Config): void {
  const buildInfo = getBuildInfo();
  
  logger.info('═══════════════════════════════════════════════════');
  logger.info({
    version: getVersion(),
    environment: buildInfo.environment,
    nodeVersion: buildInfo.nodeVersion,
    buildTime: buildInfo.buildTime || 'development',
  }, 'LeForge Starting');
  logger.info('═══════════════════════════════════════════════════');
}

/**
 * Log resolved configuration (with redacted secrets)
 */
export function logConfig(config: Config): void {
  const safeConfig = getSafeConfig(config);
  const sources = getConfigSources();
  
  // Count env vs default
  const envCount = Object.values(sources).filter(s => s === 'env').length;
  const defaultCount = Object.values(sources).filter(s => s === 'default').length;
  
  logger.info({
    configuredFromEnv: envCount,
    usingDefaults: defaultCount,
  }, 'Configuration loaded');
  
  logger.debug({ config: safeConfig }, 'Resolved configuration');
}

/**
 * Log validation results
 */
export function logValidation(result: ValidationResult): void {
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      logger.error({ error }, 'Configuration error');
    }
  }
  
  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      logger.warn({ warning }, 'Configuration warning');
    }
  }
  
  if (result.valid && result.warnings.length === 0) {
    logger.info('Configuration validated successfully');
  } else if (result.valid) {
    logger.info({ warningCount: result.warnings.length }, 'Configuration valid with warnings');
  }
}

/**
 * Log service ready status
 */
export function logReady(config: Config, stats: { totalPlugins: number; runningPlugins: number }): void {
  logger.info('═══════════════════════════════════════════════════');
  logger.info({
    url: `http://localhost:${config.port}`,
    health: `http://localhost:${config.port}/health`,
    plugins: stats.totalPlugins,
    running: stats.runningPlugins,
  }, 'LeForge ready');
  logger.info('═══════════════════════════════════════════════════');
}
