import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

export interface AuthConfig {
  // Local auth credentials (for built-in authentication)
  adminUser: string;
  adminPassword: string;
  
  // JWT settings
  jwtSecret: string;
  jwtExpiresIn: string;
  
  // Session settings
  sessionCookieName: string;
  secureCookies: boolean;
  
  // Auth mode: 'local' | 'oidc' | 'both'
  authMode: 'local' | 'oidc' | 'both';
  
  // OIDC settings (for SSO - future)
  oidc?: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string[];
  };
  
  // Bypass auth for specific paths (e.g., health checks)
  publicPaths: string[];
}

export interface Config {
  port: number;
  environment: string;
  logLevel: string;

  // Authentication
  auth: AuthConfig;

  // Docker
  dockerSocketPath: string;
  dockerHost?: string;
  dockerNetwork: string;

  // Database
  postgres: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };

  // Redis
  redis: {
    host: string;
    port: number;
    password: string;
  };

  // Plugin settings
  plugins: {
    portRangeStart: number;
    portRangeEnd: number;
    networkName: string;
    volumePrefix: string;
    containerPrefix: string;
  };

  // Static files
  staticPath: string;
}

// Generate a random JWT secret if not provided (for development)
const generateJwtSecret = (): string => {
  return crypto.randomBytes(64).toString('hex');
};

// Default JWT secret - should be set via env var in production
const jwtSecret = process.env.LEFORGE_JWT_SECRET || generateJwtSecret();

export const config: Config = {
  port: parseInt(process.env.PORT || '4000', 10),
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  // Authentication configuration
  auth: {
    adminUser: process.env.LEFORGE_ADMIN_USER || 'admin',
    adminPassword: process.env.LEFORGE_ADMIN_PASSWORD || 'admin', // Default password for development
    jwtSecret,
    jwtExpiresIn: process.env.LEFORGE_JWT_EXPIRES_IN || '24h',
    sessionCookieName: 'leforge_session',
    secureCookies: process.env.LEFORGE_SECURE_COOKIES === 'true' || (process.env.LEFORGE_SECURE_COOKIES !== 'false' && process.env.NODE_ENV === 'production'),
    authMode: (process.env.LEFORGE_AUTH_MODE as 'local' | 'oidc' | 'both') || 'local',
    oidc: process.env.LEFORGE_OIDC_ISSUER ? {
      issuer: process.env.LEFORGE_OIDC_ISSUER,
      clientId: process.env.LEFORGE_OIDC_CLIENT_ID || '',
      clientSecret: process.env.LEFORGE_OIDC_CLIENT_SECRET || '',
      redirectUri: process.env.LEFORGE_OIDC_REDIRECT_URI || '',
      scopes: (process.env.LEFORGE_OIDC_SCOPES || 'openid profile email').split(' '),
    } : undefined,
    publicPaths: [
      '/health',
      '/api/v1/health',
      '/api/v1/auth/login',
      '/api/v1/auth/logout',
      '/api/v1/auth/config',
      '/api/v1/auth/me',
      '/api/v1/auth/oidc/callback',
      // Integration endpoints use API key auth, not session auth
      '/api/v1/nintex',
      '/api/v1/invoke',
    ],
  },

  dockerSocketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
  dockerHost: process.env.DOCKER_HOST,
  dockerNetwork: process.env.DOCKER_NETWORK || 'leforge-network',

  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'leforge',
    password: process.env.POSTGRES_PASSWORD || 'leforge_password',
    database: process.env.POSTGRES_DB || 'leforge',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
  },

  plugins: {
    portRangeStart: parseInt(process.env.PLUGIN_PORT_RANGE_START || '4001', 10),
    portRangeEnd: parseInt(process.env.PLUGIN_PORT_RANGE_END || '4999', 10),
    networkName: process.env.DOCKER_NETWORK || 'leforge-network',
    volumePrefix: process.env.PLUGIN_VOLUME_PREFIX || 'forgehook-',
    containerPrefix: process.env.PLUGIN_CONTAINER_PREFIX || 'forgehook-',
  },

  staticPath: process.env.STATIC_PATH || './dist/client',
};
