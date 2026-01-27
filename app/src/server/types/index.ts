// ForgeHook Manifest Types

export type PluginRuntime = 'container' | 'embedded' | 'gateway' | 'core';

export interface ForgeHookManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: {
    name?: string;
    email?: string;
    url?: string;
  };
  license?: string;
  repository?: string;
  documentation?: string;
  icon?: string;
  category?: ForgeHookCategory;
  tags?: string[];

  // Runtime type - defaults to 'container' for backward compatibility
  runtime?: PluginRuntime;

  // Container-based plugin fields (required when runtime === 'container')
  image?: {
    repository: string;
    tag?: string;
    digest?: string;
  };

  port?: number;
  hostPort?: number;
  basePath?: string;

  // Embedded plugin fields (required when runtime === 'embedded')
  embedded?: {
    entrypoint: string;      // Main JS file (e.g., "index.js")
    exports: string[];       // Exported function names
    timeout?: number;        // Execution timeout in ms (default: 5000)
    memoryLimit?: number;    // Memory limit in MB (default: 128)
  };

  // Gateway plugin fields (required when runtime === 'gateway')
  gateway?: {
    baseUrl: string;         // Base URL of external service (supports env vars like ${VAR:-default})
    healthCheck?: string;    // Health check path (default: /health)
    timeout?: number;        // Request timeout in ms (default: 30000)
    retries?: number;        // Number of retries on failure (default: 0)
    headers?: Record<string, string>; // Default headers to add to proxied requests
    stripPrefix?: boolean;   // Strip the plugin prefix from proxied paths (default: true)
    discovery?: 'foundry-local' | 'ollama' | 'lm-studio' | 'manual'; // Auto-discovery type
  };

  healthCheck?: {
    path?: string;
    interval?: number;
    timeout?: number;
    retries?: number;
  };

  endpoints: ForgeHookEndpoint[];

  config?: {
    schema?: Record<string, unknown>;
    defaults?: Record<string, unknown>;
  };

  environment?: ForgeHookEnvVar[];
  volumes?: ForgeHookVolume[];

  resources?: {
    memory?: string;
    cpu?: string;
    gpu?: boolean;
  };

  dependencies?: {
    forgehooks?: Array<{
      id: string;
      version?: string;
      optional?: boolean;
    }>;
    services?: Array<'redis' | 'postgres' | 'qdrant'>;
  };

  capabilities?: string[];

  hooks?: {
    onInstall?: string;
    onStart?: string;
    onStop?: string;
    onUninstall?: string;
  };
}

export type ForgeHookCategory =
  | 'security'
  | 'ai'
  | 'data'
  | 'media'
  | 'integration'
  | 'utility'
  | 'analytics'
  | 'communication';

export interface ForgeHookEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  requestBody?: Record<string, unknown>;
  authentication?: boolean;
  rateLimit?: {
    requests: number;
    period: 'second' | 'minute' | 'hour' | 'day';
  };
}

export interface ForgeHookEnvVar {
  name: string;
  description: string;
  required?: boolean;
  secret?: boolean;
  default?: string;
  validation?: string;
}

export interface ForgeHookVolume {
  name: string;
  containerPath: string;
  description?: string;
  readOnly?: boolean;
}

// Plugin Instance (installed plugin)
export type PluginStatus =
  | 'installing'
  | 'installed'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error'
  | 'uninstalling';

export interface PluginInstance {
  id: string;
  forgehookId: string;
  manifest: ForgeHookManifest;
  status: PluginStatus;
  runtime: PluginRuntime;
  // Container-specific fields
  containerId?: string;
  containerName?: string;
  hostPort?: number;
  // Common fields
  config: Record<string, unknown>;
  environment: Record<string, string>;
  installedAt: Date;
  startedAt?: Date;
  stoppedAt?: Date;
  lastHealthCheck?: Date;
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
  error?: string;
  logs?: string[];
  // Embedded-specific fields
  moduleLoaded?: boolean;
  moduleExports?: string[];
  moduleCode?: string;
  // Gateway-specific fields
  gatewayUrl?: string;       // Resolved base URL for gateway plugins
  gatewayHealthPath?: string; // Health check path for gateway
  // Version tracking fields
  installedVersion?: string;
  previousVersion?: string;
  bundleUrl?: string;
  lastUpdatedAt?: Date;
}

// Plugin Events
export type PluginEventType =
  | 'plugin:installing'
  | 'plugin:installed'
  | 'plugin:starting'
  | 'plugin:started'
  | 'plugin:stopping'
  | 'plugin:stopped'
  | 'plugin:error'
  | 'plugin:health'
  | 'plugin:logs'
  | 'plugin:uninstalling'
  | 'plugin:uninstalled'
  | 'plugin:updating'
  | 'plugin:updated';

export interface PluginEvent {
  type: PluginEventType;
  pluginId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

// API Types
export interface InstallPluginRequest {
  manifestUrl?: string;
  manifest?: ForgeHookManifest;
  config?: Record<string, unknown>;
  environment?: Record<string, string>;
  autoStart?: boolean;
}

export interface PluginResponse {
  id: string;
  forgehookId: string;
  name: string;
  version: string;
  status: PluginStatus;
  hostPort: number;
  healthStatus?: string;
  error?: string;
  endpoints?: ForgeHookEndpoint[];
}

export interface PluginListResponse {
  plugins: PluginResponse[];
  total: number;
}

// Registry Types (for plugin marketplace)
export interface RegistryPlugin {
  id: string;
  manifest: ForgeHookManifest;
  downloads: number;
  rating: number;
  verified: boolean;
  featured?: boolean;
  publishedAt: Date;
  updatedAt: Date;
}

// Registry Source (marketplace source like Portainer app templates)
export interface RegistrySource {
  id: string;
  name: string;
  description?: string;
  url: string;
  sourceType: 'github' | 'url' | 'local';
  githubOwner?: string;
  githubRepo?: string;
  githubBranch?: string;
  githubPath?: string;
  enabled: boolean;
  isOfficial: boolean;
  cachedIndex?: RegistryIndex;
  lastFetched?: Date;
  fetchError?: string;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

// Registry Index (what's fetched from sources)
export interface RegistryIndex {
  version: string;
  lastUpdated?: string;
  registry?: {
    name: string;
    description?: string;
    url?: string;
    maintainer?: string;
  };
  plugins: RegistryPluginEntry[];
}

export interface RegistryPluginEntry {
  id: string;
  verified?: boolean;
  featured?: boolean;
  downloads?: number;
  rating?: number;
  publishedAt?: string;
  updatedAt?: string;
  manifest: ForgeHookManifest;
  bundleUrl?: string; // For embedded plugins - URL to the bundled JS code
}

// GitHub Install Request
export interface GitHubInstallRequest {
  repository: string; // e.g., "flowforge/math-service" or "https://github.com/LeForgeio/registry/tree/main/plugins/math-service"
  ref?: string; // branch, tag, or commit (default: main)
  manifestPath?: string; // path to forgehook.json (default: forgehook.json)
  config?: Record<string, unknown>;
  environment?: Record<string, string>;
  autoStart?: boolean;
}

// Package (.fhk) Types
export interface ForgeHookPackage {
  manifest: ForgeHookManifest;
  imageData?: Buffer; // Docker image tar (for container plugins)
  moduleCode?: string; // Bundled JS code (for embedded plugins)
  imageName?: string;
  checksum: string;
  createdAt: Date;
  createdBy?: string;
}

// Embedded Plugin Types
export interface EmbeddedPluginModule {
  pluginId: string;
  exports: Map<string, EmbeddedFunction>;
  loadedAt: Date;
  lastInvoked?: Date;
  invocationCount: number;
}

export interface EmbeddedFunction {
  name: string;
  description?: string;
  parameters?: Record<string, EmbeddedFunctionParam>;
  returns?: string;
  handler: (input: unknown, context: EmbeddedExecutionContext) => Promise<unknown>;
}

export interface EmbeddedFunctionParam {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
  default?: unknown;
}

export interface EmbeddedExecutionContext {
  pluginId: string;
  functionName: string;
  requestId: string;
  timeout: number;
  config: Record<string, unknown>;
}

export interface EmbeddedInvocationResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime: number;
}

// ==========================================================================
// API Key Types
// ==========================================================================

export interface ApiKey {
  id: string;
  name: string;
  description?: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  revokedAt?: Date;
}

export interface CreateApiKeyRequest {
  name: string;
  description?: string;
}

export interface CreateApiKeyResponse {
  apiKey: ApiKey;
  plainTextKey: string; // Only returned once at creation
}

export interface ApiKeyUsage {
  id: string;
  apiKeyId: string;
  integrationId?: string;
  endpoint: string;
  method: string;
  statusCode: number;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// ==========================================================================
// Integration Types
// ==========================================================================

export interface Integration {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  documentationUrl?: string;
  isEnabled: boolean;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateIntegrationRequest {
  isEnabled?: boolean;
  config?: Record<string, unknown>;
}

export interface CreateIntegrationRequest {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  documentationUrl?: string;
  isEnabled?: boolean;
  config?: Record<string, unknown>;
}

// Built-in integration IDs
export type BuiltInIntegrationId = 
  | 'nintex'
  | 'make'
  | 'zapier'
  | 'n8n'
  | 'power-automate';
