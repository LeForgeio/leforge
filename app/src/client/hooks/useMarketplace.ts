import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ForgeHookManifest } from '../types/forgehook';

const API_BASE = '/api/v1';

// =============================================================================
// Types
// =============================================================================

export interface RegistrySource {
  id: string;
  name: string;
  description?: string;
  url: string;
  sourceType: 'github' | 'http' | 'local';
  githubOwner?: string;
  githubRepo?: string;
  githubBranch?: string;
  enabled: boolean;
  isOfficial: boolean;
  priority: number;
  pluginCount: number;
  lastFetched?: string;
  fetchError?: string;
  createdAt: string;
}

export interface MarketplacePlugin {
  id: string;
  manifest: ForgeHookManifest;
  source: {
    id: string;
    name: string;
    isOfficial: boolean;
  };
  downloads?: number;
  rating?: number;
  verified?: boolean;
  repository?: string;
}

export interface MarketplaceSourceInfo {
  id: string;
  name: string;
  pluginCount: number;
  lastFetched?: string;
  error?: string;
}

export interface MarketplaceResponse {
  plugins: MarketplacePlugin[];
  total: number;
  sources: MarketplaceSourceInfo[];
  lastUpdated?: string;
}

export interface SourcesResponse {
  sources: RegistrySource[];
  total: number;
}

export interface PackageInspectResult {
  manifest: ForgeHookManifest;
  readme?: string;
  checksums?: string;
  imageSize: number;
  installed: boolean;
  installedPluginId?: string;
  installedVersion?: string;
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchMarketplace(params?: {
  category?: string;
  search?: string;
  source?: string;
}): Promise<MarketplaceResponse> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.append('category', params.category);
  if (params?.search) searchParams.append('search', params.search);
  if (params?.source) searchParams.append('source', params.source);
  
  const url = `${API_BASE}/marketplace${searchParams.toString() ? '?' + searchParams : ''}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch marketplace');
  }
  return response.json();
}

async function fetchSources(): Promise<SourcesResponse> {
  const response = await fetch(`${API_BASE}/marketplace/sources`);
  if (!response.ok) {
    throw new Error('Failed to fetch sources');
  }
  return response.json();
}

async function addSource(data: {
  name: string;
  description?: string;
  url: string;
  sourceType: 'github' | 'http';
  githubOwner?: string;
  githubRepo?: string;
  githubBranch?: string;
  priority?: number;
}): Promise<RegistrySource> {
  const response = await fetch(`${API_BASE}/marketplace/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to add source');
  }
  return response.json();
}

async function updateSource(sourceId: string, data: Partial<{
  name: string;
  description: string;
  url: string;
  enabled: boolean;
  priority: number;
}>): Promise<RegistrySource> {
  const response = await fetch(`${API_BASE}/marketplace/sources/${sourceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to update source');
  }
  return response.json();
}

async function deleteSource(sourceId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/marketplace/sources/${sourceId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to delete source');
  }
}

async function toggleSource(sourceId: string): Promise<RegistrySource> {
  const response = await fetch(`${API_BASE}/marketplace/sources/${sourceId}/toggle`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to toggle source');
  }
  return response.json();
}

async function refreshSource(sourceId: string): Promise<RegistrySource> {
  const response = await fetch(`${API_BASE}/marketplace/sources/${sourceId}/refresh`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to refresh source');
  }
  return response.json();
}

async function refreshAllSources(): Promise<{ refreshed: number }> {
  const response = await fetch(`${API_BASE}/marketplace/refresh`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to refresh sources');
  }
  return response.json();
}

async function installFromMarketplace(data: {
  pluginId: string;
  sourceId: string;
  config?: Record<string, unknown>;
  environment?: Record<string, string>;
  autoStart?: boolean;
  installId?: string; // For progress tracking via SSE
}): Promise<unknown> {
  const response = await fetch(`${API_BASE}/marketplace/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to install plugin');
  }
  return response.json();
}

async function installFromGitHub(data: {
  repository: string;
  ref?: string;
  manifestPath?: string;
  config?: Record<string, unknown>;
  environment?: Record<string, string>;
  autoStart?: boolean;
}): Promise<unknown> {
  const response = await fetch(`${API_BASE}/marketplace/install/github`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to install from GitHub');
  }
  return response.json();
}

async function exportPlugin(pluginId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/plugins/${pluginId}/export`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to export plugin');
  }
  return response.blob();
}

async function inspectPackage(file: File): Promise<PackageInspectResult> {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(`${API_BASE}/packages/inspect`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to inspect package');
  }
  return response.json();
}

async function importPackage(file: File, options?: {
  config?: Record<string, unknown>;
  environment?: Record<string, string>;
  autoStart?: boolean;
}): Promise<unknown> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.config) formData.append('config', JSON.stringify(options.config));
  if (options?.environment) formData.append('environment', JSON.stringify(options.environment));
  if (options?.autoStart !== undefined) formData.append('autoStart', String(options.autoStart));
  
  const response = await fetch(`${API_BASE}/packages/import`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to import package');
  }
  return response.json();
}

// =============================================================================
// React Query Hooks
// =============================================================================

export function useMarketplace(params?: {
  category?: string;
  search?: string;
  source?: string;
}) {
  return useQuery({
    queryKey: ['marketplace', params],
    queryFn: () => fetchMarketplace(params),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useRegistrySources() {
  return useQuery({
    queryKey: ['marketplace', 'sources'],
    queryFn: fetchSources,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useAddSource() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: addSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });
}

export function useUpdateSource() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ sourceId, ...data }: Parameters<typeof updateSource>[1] & { sourceId: string }) => 
      updateSource(sourceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });
}

export function useDeleteSource() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });
}

export function useToggleSource() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: toggleSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });
}

export function useRefreshSource() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: refreshSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });
}

export function useRefreshAllSources() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: refreshAllSources,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });
}

export function useInstallFromMarketplace() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: installFromMarketplace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });
}

export function useInstallFromGitHub() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: installFromGitHub,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}

export function useExportPlugin() {
  return useMutation({
    mutationFn: async (pluginId: string) => {
      const blob = await exportPlugin(pluginId);
      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pluginId}.fhk`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    },
  });
}

export function useInspectPackage() {
  return useMutation({
    mutationFn: inspectPackage,
  });
}

export function useImportPackage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ file, options }: { file: File; options?: Parameters<typeof importPackage>[1] }) =>
      importPackage(file, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}
