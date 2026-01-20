// ForgeHook Types for Web UI

export type ForgeHookCategory = 
  | 'security' 
  | 'ai' 
  | 'data' 
  | 'media' 
  | 'integration' 
  | 'utility' 
  | 'analytics' 
  | 'communication';

export type PluginStatus = 
  | 'installing' 
  | 'installed' 
  | 'starting' 
  | 'running' 
  | 'stopping' 
  | 'stopped' 
  | 'error' 
  | 'uninstalling';

export interface ForgeHookEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  requestBody?: Record<string, unknown>;
  authentication?: boolean;
}

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
  icon?: string;
  category?: ForgeHookCategory;
  tags?: string[];
  image: {
    repository: string;
    tag?: string;
  };
  port: number;
  basePath?: string;
  endpoints: ForgeHookEndpoint[];
  environment?: Array<{
    name: string;
    description: string;
    required?: boolean;
    secret?: boolean;
    default?: string;
  }>;
  resources?: {
    memory?: string;
    cpu?: string;
  };
  dependencies?: {
    services?: Array<'redis' | 'postgres' | 'qdrant'>;
  };
}

export interface InstalledPlugin {
  id: string;
  forgehookId: string;
  name: string;
  version: string;
  description?: string;
  status: PluginStatus;
  runtime?: 'container' | 'embedded';
  hostPort?: number;
  assignedPort?: number;
  containerId?: string;
  health?: {
    healthy: boolean;
    lastCheck?: string;
    message?: string;
    host?: string;
  };
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
  error?: string;
  manifest: ForgeHookManifest;
  config?: Record<string, unknown>;
  environment?: Record<string, string>;
  installedAt: string;
  startedAt?: string;
  endpoints?: ForgeHookEndpoint[];
  installedVersion?: string;
  previousVersion?: string;
  bundleUrl?: string;
  lastUpdatedAt?: string;
}

export interface PluginListResponse {
  plugins: InstalledPlugin[];
  total: number;
}

// Registry plugins (available for install)
export interface RegistryPlugin {
  id: string;
  manifest: ForgeHookManifest;
  downloads?: number;
  rating?: number;
  verified?: boolean;
}

// Built-in ForgeHooks (bundled with FlowForge)
export const BUILTIN_FORGEHOOKS: RegistryPlugin[] = [
  {
    id: 'crypto-service',
    verified: true,
    downloads: 1000,
    rating: 4.8,
    manifest: {
      id: 'crypto-service',
      name: 'Crypto Service',
      version: '1.0.0',
      description: 'Cryptographic operations including hashing, encryption, and JWT token management. Supports SHA, bcrypt, argon2, AES-256-GCM encryption.',
      icon: 'lock',
      category: 'security',
      tags: ['encryption', 'hashing', 'jwt', 'bcrypt', 'security'],
      image: { repository: 'flowforge/crypto-service', tag: 'latest' },
      port: 4001,
      basePath: '/api/v1/crypto',
      endpoints: [
        { method: 'POST', path: '/hash', description: 'Hash data using SHA, bcrypt, or argon2' },
        { method: 'POST', path: '/encrypt', description: 'Encrypt data using AES-256-GCM' },
        { method: 'POST', path: '/decrypt', description: 'Decrypt AES encrypted data' },
        { method: 'POST', path: '/jwt/generate', description: 'Generate JWT token' },
        { method: 'POST', path: '/jwt/verify', description: 'Verify JWT token' },
      ],
      resources: { memory: '256m', cpu: '0.5' },
      dependencies: { services: ['redis'] },
    },
  },
  {
    id: 'math-service',
    verified: true,
    downloads: 850,
    rating: 4.7,
    manifest: {
      id: 'math-service',
      name: 'Math Service',
      version: '1.0.0',
      description: 'Mathematical calculations, statistics, and unit conversions. Powered by NumPy and SciPy.',
      icon: 'calculator',
      category: 'utility',
      tags: ['math', 'statistics', 'calculations', 'conversion'],
      image: { repository: 'flowforge/math-service', tag: 'latest' },
      port: 4002,
      basePath: '/api/v1/math',
      endpoints: [
        { method: 'POST', path: '/calculate', description: 'Evaluate mathematical expressions' },
        { method: 'POST', path: '/statistics', description: 'Statistical analysis on datasets' },
        { method: 'POST', path: '/convert', description: 'Unit conversions' },
      ],
      resources: { memory: '512m', cpu: '1' },
      dependencies: { services: ['redis'] },
    },
  },
  {
    id: 'pdf-service',
    verified: true,
    downloads: 920,
    rating: 4.6,
    manifest: {
      id: 'pdf-service',
      name: 'PDF Service',
      version: '1.0.0',
      description: 'PDF generation from HTML, merging, splitting, and text extraction.',
      icon: 'file-text',
      category: 'media',
      tags: ['pdf', 'documents', 'generation', 'html-to-pdf'],
      image: { repository: 'flowforge/pdf-service', tag: 'latest' },
      port: 4003,
      basePath: '/api/v1/pdf',
      endpoints: [
        { method: 'POST', path: '/generate', description: 'Generate PDF from HTML' },
        { method: 'POST', path: '/merge', description: 'Merge multiple PDFs' },
        { method: 'POST', path: '/split', description: 'Split PDF into pages' },
        { method: 'POST', path: '/extract-text', description: 'Extract text from PDF' },
      ],
      resources: { memory: '1g', cpu: '1' },
      dependencies: { services: ['redis'] },
    },
  },
  {
    id: 'ocr-service',
    verified: true,
    downloads: 670,
    rating: 4.5,
    manifest: {
      id: 'ocr-service',
      name: 'OCR Service',
      version: '1.0.0',
      description: 'Optical character recognition for extracting text from images. Supports multiple languages.',
      icon: 'scan',
      category: 'ai',
      tags: ['ocr', 'text-extraction', 'image-processing', 'ai'],
      image: { repository: 'flowforge/ocr-service', tag: 'latest' },
      port: 4004,
      basePath: '/api/v1/ocr',
      endpoints: [
        { method: 'POST', path: '/extract', description: 'Extract text from image' },
        { method: 'GET', path: '/languages', description: 'List supported languages' },
      ],
      resources: { memory: '2g', cpu: '2' },
      dependencies: { services: ['redis'] },
    },
  },
  {
    id: 'image-service',
    verified: true,
    downloads: 780,
    rating: 4.7,
    manifest: {
      id: 'image-service',
      name: 'Image Service',
      version: '1.0.0',
      description: 'Image processing including resize, convert, optimize, and format transformations.',
      icon: 'image',
      category: 'media',
      tags: ['image', 'resize', 'optimization', 'conversion'],
      image: { repository: 'flowforge/image-service', tag: 'latest' },
      port: 4005,
      basePath: '/api/v1/image',
      endpoints: [
        { method: 'POST', path: '/resize', description: 'Resize image' },
        { method: 'POST', path: '/convert', description: 'Convert image format' },
        { method: 'POST', path: '/optimize', description: 'Optimize image for web' },
      ],
      resources: { memory: '512m', cpu: '1' },
      dependencies: { services: ['redis'] },
    },
  },
  {
    id: 'llm-service',
    verified: true,
    downloads: 1200,
    rating: 4.9,
    manifest: {
      id: 'llm-service',
      name: 'LLM Service',
      version: '1.0.0',
      description: 'AI text generation and chat completions. Compatible with OpenAI API and local models via vLLM.',
      icon: 'brain',
      category: 'ai',
      tags: ['ai', 'llm', 'chat', 'text-generation', 'openai'],
      image: { repository: 'flowforge/llm-service', tag: 'latest' },
      port: 4006,
      basePath: '/api/v1/llm',
      endpoints: [
        { method: 'POST', path: '/chat', description: 'Chat completion' },
        { method: 'POST', path: '/generate', description: 'Text generation' },
        { method: 'POST', path: '/embeddings', description: 'Generate embeddings' },
        { method: 'GET', path: '/models', description: 'List available models' },
      ],
      environment: [
        { name: 'OPENAI_API_KEY', description: 'OpenAI API key', secret: true },
        { name: 'OPENAI_API_BASE', description: 'Custom OpenAI API base URL' },
      ],
      resources: { memory: '1g', cpu: '1' },
      dependencies: { services: ['redis'] },
    },
  },
  {
    id: 'vector-service',
    verified: true,
    downloads: 560,
    rating: 4.6,
    manifest: {
      id: 'vector-service',
      name: 'Vector Service',
      version: '1.0.0',
      description: 'Vector database operations for semantic search and embeddings storage using Qdrant.',
      icon: 'database',
      category: 'data',
      tags: ['vectors', 'embeddings', 'semantic-search', 'qdrant'],
      image: { repository: 'flowforge/vector-service', tag: 'latest' },
      port: 4007,
      basePath: '/api/v1/vector',
      endpoints: [
        { method: 'POST', path: '/collections/create', description: 'Create collection' },
        { method: 'GET', path: '/collections/list', description: 'List collections' },
        { method: 'POST', path: '/upsert', description: 'Upsert vectors' },
        { method: 'POST', path: '/search', description: 'Search vectors' },
      ],
      resources: { memory: '512m', cpu: '1' },
      dependencies: { services: ['redis', 'qdrant'] },
    },
  },
  {
    id: 'data-transform-service',
    verified: true,
    downloads: 640,
    rating: 4.5,
    manifest: {
      id: 'data-transform-service',
      name: 'Data Transform',
      version: '1.0.0',
      description: 'Data format conversions between JSON, CSV, XML, YAML, and more.',
      icon: 'repeat',
      category: 'data',
      tags: ['data', 'transform', 'json', 'csv', 'xml'],
      image: { repository: 'flowforge/data-transform-service', tag: 'latest' },
      port: 4008,
      basePath: '/api/v1/data',
      endpoints: [
        { method: 'POST', path: '/json-to-csv', description: 'Convert JSON to CSV' },
        { method: 'POST', path: '/csv-to-json', description: 'Convert CSV to JSON' },
        { method: 'POST', path: '/xml-to-json', description: 'Convert XML to JSON' },
      ],
      resources: { memory: '256m', cpu: '0.5' },
      dependencies: { services: ['redis'] },
    },
  },
];

// Category metadata
export const CATEGORY_INFO: Record<ForgeHookCategory, { label: string; icon: string; color: string }> = {
  security: { label: 'Security', icon: 'shield', color: 'text-red-500' },
  ai: { label: 'AI & ML', icon: 'brain', color: 'text-purple-500' },
  data: { label: 'Data', icon: 'database', color: 'text-blue-500' },
  media: { label: 'Media', icon: 'image', color: 'text-green-500' },
  integration: { label: 'Integration', icon: 'plug', color: 'text-orange-500' },
  utility: { label: 'Utility', icon: 'wrench', color: 'text-gray-500' },
  analytics: { label: 'Analytics', icon: 'bar-chart', color: 'text-cyan-500' },
  communication: { label: 'Communication', icon: 'mail', color: 'text-pink-500' },
};
