import { createRequire } from 'module';
import { logger } from './logger.js';

const require = createRequire(import.meta.url);

interface PackageJson {
  name: string;
  version: string;
  description?: string;
}

let cachedVersion: string | null = null;
let cachedPackageInfo: PackageJson | null = null;

/**
 * Get version from package.json
 * Falls back to env var or default if package.json cannot be read
 */
export function getVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  // Try environment variable first (useful for Docker builds)
  if (process.env.APP_VERSION) {
    cachedVersion = process.env.APP_VERSION;
    return cachedVersion;
  }

  // Try to read from package.json
  try {
    const pkg = require('../../../package.json') as PackageJson;
    cachedVersion = pkg.version;
    return cachedVersion;
  } catch (error) {
    logger.warn({ error }, 'Could not read version from package.json, using default');
    cachedVersion = '0.0.0-unknown';
    return cachedVersion;
  }
}

/**
 * Get full package info
 */
export function getPackageInfo(): PackageJson {
  if (cachedPackageInfo) {
    return cachedPackageInfo;
  }

  try {
    cachedPackageInfo = require('../../../package.json') as PackageJson;
    return cachedPackageInfo;
  } catch {
    cachedPackageInfo = {
      name: process.env.APP_NAME || 'LeForge',
      version: getVersion(),
      description: 'LeForge Platform',
    };
    return cachedPackageInfo;
  }
}

/**
 * Get build info for health/status endpoints
 */
export function getBuildInfo(): {
  version: string;
  name: string;
  environment: string;
  nodeVersion: string;
  buildTime?: string;
} {
  const pkg = getPackageInfo();
  
  return {
    version: pkg.version,
    name: pkg.name,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    buildTime: process.env.BUILD_TIME,
  };
}
