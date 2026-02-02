import axios, { AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { useAuthStore, useApiCallHistoryStore, useSettingsStore } from '@/store';

// =============================================================================
// API Client Configuration
// =============================================================================

const getBaseUrl = () => useSettingsStore.getState().baseUrl;
const getTimeout = () => useSettingsStore.getState().timeout;

// Generate UUID (fallback for non-secure contexts like HTTP)
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const api = axios.create({
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Dynamic base URL
api.interceptors.request.use((config) => {
  config.baseURL = getBaseUrl();
  config.timeout = getTimeout();
  return config;
});

// Request interceptor to add API key
api.interceptors.request.use((config) => {
  const apiKey = useAuthStore.getState().apiKey;
  if (apiKey) {
    config.headers['X-API-Key'] = apiKey;
  }
  // Add request ID for tracking
  config.headers['X-Request-ID'] = generateUUID();
  return config;
});

// Response interceptor for error handling and logging
api.interceptors.response.use(
  (response) => {
    // Log successful calls
    const { addCall } = useApiCallHistoryStore.getState();
    const config = response.config;
    addCall({
      method: config.method?.toUpperCase() || 'GET',
      path: config.url || '',
      service: extractServiceFromPath(config.url || ''),
      status: response.status,
      duration: Date.now() - (config.metadata?.startTime || Date.now()),
      requestBody: typeof config.data === 'string' ? config.data : JSON.stringify(config.data),
      responseBody: JSON.stringify(response.data),
    });
    return response;
  },
  (error: AxiosError) => {
    // Log failed calls
    const { addCall } = useApiCallHistoryStore.getState();
    const config = error.config;
    if (config) {
      addCall({
        method: config.method?.toUpperCase() || 'GET',
        path: config.url || '',
        service: extractServiceFromPath(config.url || ''),
        status: error.response?.status || 0,
        duration: Date.now() - (config.metadata?.startTime || Date.now()),
        requestBody: typeof config.data === 'string' ? config.data : JSON.stringify(config.data),
        error: error.message,
      });
    }
    
    if (error.response?.status === 401) {
      useAuthStore.getState().clearApiKey();
    }
    return Promise.reject(error);
  }
);

// Add start time to requests for duration calculation
api.interceptors.request.use((config) => {
  config.metadata = { startTime: Date.now() };
  return config;
});

// Extend axios config type
declare module 'axios' {
  interface AxiosRequestConfig {
    metadata?: {
      startTime: number;
    };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function extractServiceFromPath(path: string): string {
  const match = path.match(/\/api\/v1\/([^/]+)/);
  return match ? match[1] : 'unknown';
}

// =============================================================================
// Types
// =============================================================================

export interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'unknown';
  service: string;
  version?: string;
  uptime?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  requestId?: string;
  timestamp?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface ServiceInfo {
  id: string;
  name: string;
  port: number;
  path: string;
  language: 'nodejs' | 'python';
  description: string;
  endpoints: EndpointInfo[];
}

export interface EndpointInfo {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  body?: Record<string, unknown>;
}

// =============================================================================
// Service Definitions - Now dynamic, fetched from installed plugins
// =============================================================================

// Empty array - services are now fetched dynamically via useInstalledPlugins()
// This export is kept for backward compatibility but should not be used
export const services: ServiceInfo[] = [];

// =============================================================================
// API Functions
// =============================================================================

export async function checkServiceHealth(path: string): Promise<ServiceHealth> {
  try {
    const response = await api.get(`${path}/health`, { timeout: 5000 });
    return {
      status: 'healthy',
      service: path,
      version: response.data?.version,
      uptime: response.data?.uptime,
    };
  } catch {
    return { status: 'unhealthy', service: path };
  }
}

// Note: checkAllServicesHealth is deprecated - services are now dynamic
// Use useInstalledPlugins() hook instead
export async function checkAllServicesHealth(): Promise<Record<string, ServiceHealth>> {
  // Return empty - services are now fetched dynamically
  return {};
}

export async function executeApiCall(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<{ status: number; statusText: string; data: unknown; duration: number; headers: Record<string, string> }> {
  const startTime = Date.now();
  
  const config: AxiosRequestConfig = {
    method,
    url: path,
    data: body,
    headers,
  };
  
  const response: AxiosResponse = await api.request(config);
  
  return {
    status: response.status,
    statusText: response.statusText,
    data: response.data,
    duration: Date.now() - startTime,
    headers: response.headers as Record<string, string>,
  };
}

// =============================================================================
// Code Generation
// =============================================================================

export function generateCurlCommand(
  method: string,
  url: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>
): string {
  const baseUrl = getBaseUrl();
  let cmd = `curl -X ${method.toUpperCase()} '${baseUrl}${url}'`;
  
  cmd += ` \\\n  -H 'Content-Type: application/json'`;
  
  const apiKey = useAuthStore.getState().apiKey;
  if (apiKey) {
    cmd += ` \\\n  -H 'X-API-Key: ${apiKey}'`;
  }
  
  if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      cmd += ` \\\n  -H '${key}: ${value}'`;
    });
  }
  
  if (body && method !== 'GET') {
    cmd += ` \\\n  -d '${JSON.stringify(body, null, 2)}'`;
  }
  
  return cmd;
}

export function generateJavaScriptCode(
  method: string,
  url: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>
): string {
  const baseUrl = getBaseUrl();
  const apiKey = useAuthStore.getState().apiKey;
  
  // Build headers object
  const headerLines: string[] = ["'Content-Type': 'application/json'"];
  if (apiKey) {
    headerLines.push(`'X-API-Key': '${apiKey}'`);
  }
  if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      // Skip if already added via apiKey
      if (key !== 'X-API-Key' || !apiKey) {
        headerLines.push(`'${key}': '${value}'`);
      }
    });
  }
  
  return `const response = await fetch('${baseUrl}${url}', {
  method: '${method.toUpperCase()}',
  headers: {
    ${headerLines.join(',\n    ')},
  },${body ? `\n  body: JSON.stringify(${JSON.stringify(body, null, 4).split('\n').join('\n  ')}),` : ''}
});

const data = await response.json();
console.log(data);`;
}

export function generatePythonCode(
  method: string,
  url: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>
): string {
  const baseUrl = getBaseUrl();
  const apiKey = useAuthStore.getState().apiKey;
  
  // Build headers object
  const headerLines: string[] = ["'Content-Type': 'application/json'"];
  if (apiKey) {
    headerLines.push(`'X-API-Key': '${apiKey}'`);
  }
  if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      // Skip if already added via apiKey
      if (key !== 'X-API-Key' || !apiKey) {
        headerLines.push(`'${key}': '${value}'`);
      }
    });
  }
  
  return `import requests

response = requests.${method.toLowerCase()}(
    '${baseUrl}${url}',
    headers={
        ${headerLines.join(',\n        ')},
    },${body ? `\n    json=${JSON.stringify(body, null, 4).split('\n').join('\n    ')},` : ''}
)

print(response.json())`;
}
