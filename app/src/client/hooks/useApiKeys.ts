import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSettingsStore } from '../store';

// =============================================================================
// Types
// =============================================================================

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: string | null;
  allowedIps: string[];
  rateLimitPerMinute: number | null;
  rateLimitPerDay: number | null;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  createdByUsername?: string;
  integrationId?: string | null;
  integrationName?: string | null;
}

export interface ApiKeyWithPlainKey extends ApiKey {
  key: string;  // Full key - only returned on create/rotate
}

export interface CreateApiKeyInput {
  name: string;
  integrationId?: string;
  scopes?: string[];
  expiresAt?: string;
  allowedIps?: string[];
  rateLimitPerMinute?: number;
  rateLimitPerDay?: number;
}

export interface UpdateApiKeyInput {
  name?: string;
  scopes?: string[];
  expiresAt?: string | null;
  allowedIps?: string[];
  rateLimitPerMinute?: number | null;
  rateLimitPerDay?: number | null;
  isActive?: boolean;
}

export interface ApiKeyScope {
  scope: string;
  description: string;
  category: string;
}

export interface ApiKeyUsageStats {
  keyId: string;
  name: string;
  totalRequests: number;
  requestsToday: number;
  requestsThisMinute: number;
  lastUsedAt: string | null;
  topEndpoints: Array<{
    endpoint: string;
    count: number;
  }>;
  requestsByDay: Array<{
    date: string;
    count: number;
  }>;
}

// =============================================================================
// Helper
// =============================================================================

function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem('LeForge-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.state?.token || null;
    }
  } catch {
    // ignore
  }
  return null;
}

function getHeaders(token: string | null, contentType = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (contentType) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchApiKeys(baseUrl: string): Promise<{ keys: ApiKey[] }> {
  const token = getAuthToken();
  const response = await fetch(`${baseUrl}/api/v1/api-keys`, {
    credentials: 'include',
    headers: getHeaders(token),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to fetch API keys' } }));
    throw new Error(error.error?.message || 'Failed to fetch API keys');
  }

  return response.json();
}

async function fetchApiKey(baseUrl: string, keyId: string): Promise<{ key: ApiKey }> {
  const token = getAuthToken();
  const response = await fetch(`${baseUrl}/api/v1/api-keys/${keyId}`, {
    credentials: 'include',
    headers: getHeaders(token),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to fetch API key' } }));
    throw new Error(error.error?.message || 'Failed to fetch API key');
  }

  return response.json();
}

async function createApiKey(baseUrl: string, input: CreateApiKeyInput): Promise<{ key: ApiKeyWithPlainKey }> {
  const token = getAuthToken();
  const response = await fetch(`${baseUrl}/api/v1/api-keys`, {
    method: 'POST',
    credentials: 'include',
    headers: getHeaders(token, true),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to create API key' } }));
    throw new Error(error.error?.message || 'Failed to create API key');
  }

  // Server returns { apiKey: {...}, key: "plain-text-key" }
  // Client needs { key: { ...apiKey, key: "plain-text-key" } }
  const data = await response.json();
  return {
    key: {
      ...data.apiKey,
      key: data.key,
    },
  };
}

async function updateApiKey(baseUrl: string, keyId: string, input: UpdateApiKeyInput): Promise<{ key: ApiKey }> {
  const token = getAuthToken();
  const response = await fetch(`${baseUrl}/api/v1/api-keys/${keyId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: getHeaders(token, true),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to update API key' } }));
    throw new Error(error.error?.message || 'Failed to update API key');
  }

  return response.json();
}

async function deleteApiKey(baseUrl: string, keyId: string): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`${baseUrl}/api/v1/api-keys/${keyId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getHeaders(token),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to delete API key' } }));
    throw new Error(error.error?.message || 'Failed to delete API key');
  }
}

async function rotateApiKey(baseUrl: string, keyId: string): Promise<{ key: ApiKeyWithPlainKey }> {
  const token = getAuthToken();
  const response = await fetch(`${baseUrl}/api/v1/api-keys/${keyId}/rotate`, {
    method: 'POST',
    credentials: 'include',
    headers: getHeaders(token),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to rotate API key' } }));
    throw new Error(error.error?.message || 'Failed to rotate API key');
  }

  // Server returns { apiKey: {...}, key: "plain-text-key" }
  // Client needs { key: { ...apiKey, key: "plain-text-key" } }
  const data = await response.json();
  return {
    key: {
      ...data.apiKey,
      key: data.key,
    },
  };
}

async function fetchApiKeyUsage(baseUrl: string, keyId: string): Promise<{ usage: ApiKeyUsageStats }> {
  const token = getAuthToken();
  const response = await fetch(`${baseUrl}/api/v1/api-keys/${keyId}/usage`, {
    credentials: 'include',
    headers: getHeaders(token),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to fetch usage stats' } }));
    throw new Error(error.error?.message || 'Failed to fetch usage stats');
  }

  return response.json();
}

async function fetchAvailableScopes(baseUrl: string): Promise<{ scopes: ApiKeyScope[] }> {
  const token = getAuthToken();
  const response = await fetch(`${baseUrl}/api/v1/api-keys/scopes`, {
    credentials: 'include',
    headers: getHeaders(token),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to fetch scopes' } }));
    throw new Error(error.error?.message || 'Failed to fetch scopes');
  }

  return response.json();
}

// =============================================================================
// Hooks
// =============================================================================

export function useApiKeys() {
  const { baseUrl } = useSettingsStore();

  return useQuery({
    queryKey: ['api-keys'],
    queryFn: () => fetchApiKeys(baseUrl),
    staleTime: 30 * 1000,
  });
}

export function useApiKey(keyId: string) {
  const { baseUrl } = useSettingsStore();

  return useQuery({
    queryKey: ['api-keys', keyId],
    queryFn: () => fetchApiKey(baseUrl, keyId),
    enabled: !!keyId,
    staleTime: 30 * 1000,
  });
}

export function useCreateApiKey() {
  const { baseUrl } = useSettingsStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateApiKeyInput) => createApiKey(baseUrl, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}

export function useUpdateApiKey() {
  const { baseUrl } = useSettingsStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ keyId, input }: { keyId: string; input: UpdateApiKeyInput }) =>
      updateApiKey(baseUrl, keyId, input),
    onSuccess: (_, { keyId }) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['api-keys', keyId] });
    },
  });
}

export function useDeleteApiKey() {
  const { baseUrl } = useSettingsStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keyId: string) => deleteApiKey(baseUrl, keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}

export function useRotateApiKey() {
  const { baseUrl } = useSettingsStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keyId: string) => rotateApiKey(baseUrl, keyId),
    onSuccess: (_, keyId) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['api-keys', keyId] });
    },
  });
}

export function useApiKeyUsage(keyId: string) {
  const { baseUrl } = useSettingsStore();

  return useQuery({
    queryKey: ['api-keys', keyId, 'usage'],
    queryFn: () => fetchApiKeyUsage(baseUrl, keyId),
    enabled: !!keyId,
    staleTime: 60 * 1000,
  });
}

export function useAvailableScopes() {
  const { baseUrl } = useSettingsStore();

  return useQuery({
    queryKey: ['api-keys', 'scopes'],
    queryFn: () => fetchAvailableScopes(baseUrl),
    staleTime: 5 * 60 * 1000, // Cache scopes for 5 minutes
  });
}
