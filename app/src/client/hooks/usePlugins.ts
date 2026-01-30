import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  InstalledPlugin, 
  PluginListResponse, 
  ForgeHookManifest,
  RegistryPlugin,
} from '../types/forgehook';

// API calls use relative URLs since frontend and backend are on the same origin
const API_BASE = '/api/v1';

// =============================================================================
// API Functions
// =============================================================================

async function fetchInstalledPlugins(): Promise<PluginListResponse> {
  const response = await fetch(`${API_BASE}/plugins`);
  if (!response.ok) {
    throw new Error('Failed to fetch plugins');
  }
  return response.json();
}

async function fetchPluginDetails(pluginId: string): Promise<InstalledPlugin> {
  const response = await fetch(`${API_BASE}/plugins/${pluginId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch plugin details');
  }
  return response.json();
}

async function installPlugin(request: {
  manifest: ForgeHookManifest;
  config?: Record<string, unknown>;
  environment?: Record<string, string>;
  autoStart?: boolean;
}): Promise<InstalledPlugin> {
  const response = await fetch(`${API_BASE}/plugins/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to install plugin');
  }
  return response.json();
}

async function startPlugin(pluginId: string, options?: { pullLatest?: boolean }): Promise<void> {
  const response = await fetch(`${API_BASE}/plugins/${pluginId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to start plugin');
  }
}

async function stopPlugin(pluginId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/plugins/${pluginId}/stop`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to stop plugin');
  }
}

async function restartPlugin(pluginId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/plugins/${pluginId}/restart`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to restart plugin');
  }
}

async function uninstallPlugin(pluginId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/plugins/${pluginId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to uninstall plugin');
  }
}

async function updatePlugin(pluginId: string, options: {
  bundleUrl?: string;
  imageTag?: string;
  manifest?: ForgeHookManifest;
}): Promise<InstalledPlugin> {
  const response = await fetch(`${API_BASE}/plugins/${pluginId}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to update plugin');
  }
  return response.json();
}

async function uploadPluginUpdate(pluginId: string, options: {
  moduleCode: string;
  manifest?: ForgeHookManifest;
}): Promise<InstalledPlugin> {
  const response = await fetch(`${API_BASE}/plugins/${pluginId}/update/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to upload plugin update');
  }
  return response.json();
}

async function rollbackPlugin(pluginId: string): Promise<InstalledPlugin> {
  const response = await fetch(`${API_BASE}/plugins/${pluginId}/rollback`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to rollback plugin');
  }
  return response.json();
}

interface PluginUpdateHistory {
  pluginId: string;
  currentVersion: string;
  previousVersion: string | null;
  canRollback: boolean;
  history: Array<{
    id: string;
    from_version: string;
    to_version: string;
    action: string;
    performed_by: string | null;
    created_at: string;
  }>;
}

async function fetchPluginUpdateHistory(pluginId: string): Promise<PluginUpdateHistory> {
  const response = await fetch(`${API_BASE}/plugins/${pluginId}/updates`);
  if (!response.ok) {
    throw new Error('Failed to fetch update history');
  }
  return response.json();
}

async function fetchPluginLogs(pluginId: string, tail: number = 100): Promise<string[]> {
  const response = await fetch(`${API_BASE}/plugins/${pluginId}/logs?tail=${tail}`);
  if (!response.ok) {
    throw new Error('Failed to fetch logs');
  }
  const data = await response.json();
  return data.logs;
}

// Check for updates on a single plugin
interface PluginUpdateCheck {
  pluginId: string;
  hasUpdate: boolean;
  localDigest: string | null;
  remoteDigest: string | null;
  error?: string;
}

async function checkPluginUpdate(pluginId: string): Promise<PluginUpdateCheck> {
  const response = await fetch(`${API_BASE}/plugins/${pluginId}/check-update`);
  if (!response.ok) {
    throw new Error('Failed to check for update');
  }
  return response.json();
}

// Check for updates on all plugins
interface AllPluginUpdates {
  updates: Record<string, { hasUpdate: boolean; error?: string }>;
  checkedAt: string;
}

async function checkAllPluginUpdates(): Promise<AllPluginUpdates> {
  const response = await fetch(`${API_BASE}/plugins/check-updates`);
  if (!response.ok) {
    throw new Error('Failed to check for updates');
  }
  return response.json();
}

// =============================================================================
// React Query Hooks
// =============================================================================

export function useInstalledPlugins() {
  return useQuery({
    queryKey: ['plugins', 'installed'],
    queryFn: fetchInstalledPlugins,
    refetchInterval: 10000, // Refresh every 10 seconds
    retry: false,
  });
}

export function usePluginDetails(pluginId: string | undefined) {
  return useQuery({
    queryKey: ['plugins', 'details', pluginId],
    queryFn: () => fetchPluginDetails(pluginId!),
    enabled: !!pluginId,
    refetchInterval: 5000,
  });
}

export function usePluginLogs(pluginId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: ['plugins', 'logs', pluginId],
    queryFn: () => fetchPluginLogs(pluginId!, 100),
    enabled: !!pluginId && enabled,
    refetchInterval: 5000,
  });
}

export function useInstallPlugin() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: installPlugin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}

export function useStartPlugin() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ pluginId, options }: { pluginId: string; options?: { pullLatest?: boolean } }) => 
      startPlugin(pluginId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      queryClient.invalidateQueries({ queryKey: ['plugin-updates'] });
    },
  });
}

export function useStopPlugin() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: stopPlugin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}

export function useRestartPlugin() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: restartPlugin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}

export function useUninstallPlugin() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: uninstallPlugin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}

export function useUpdatePlugin() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ pluginId, options }: { 
      pluginId: string; 
      options: { bundleUrl?: string; imageTag?: string; manifest?: ForgeHookManifest } 
    }) => updatePlugin(pluginId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}

export function useUploadPluginUpdate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ pluginId, options }: { 
      pluginId: string; 
      options: { moduleCode: string; manifest?: ForgeHookManifest } 
    }) => uploadPluginUpdate(pluginId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}

export function useRollbackPlugin() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: rollbackPlugin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}

export function usePluginUpdateHistory(pluginId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: ['plugins', 'updates', pluginId],
    queryFn: () => fetchPluginUpdateHistory(pluginId!),
    enabled: !!pluginId && enabled,
  });
}

// Hook to check if a single plugin has an update available
export function usePluginUpdateCheck(pluginId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: ['plugin-updates', 'single', pluginId],
    queryFn: () => checkPluginUpdate(pluginId!),
    enabled: !!pluginId && enabled,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchInterval: 5 * 60 * 1000, // Recheck every 5 minutes
  });
}

// Hook to check all plugins for updates
export function useAllPluginUpdates(enabled: boolean = true) {
  return useQuery({
    queryKey: ['plugin-updates', 'all'],
    queryFn: checkAllPluginUpdates,
    enabled,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchInterval: 5 * 60 * 1000, // Recheck every 5 minutes
  });
}

// =============================================================================
// Registry (Fetched from registry API)
// =============================================================================

export function useAvailablePlugins() {
  return useQuery({
    queryKey: ['plugins', 'registry'],
    queryFn: async (): Promise<RegistryPlugin[]> => {
      const response = await fetch(`${API_BASE}/registry/plugins`);
      if (!response.ok) {
        console.warn('Failed to fetch registry');
        return [];
      }
      const data = await response.json();
      return data.plugins;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

// =============================================================================
// WebSocket Hook for Real-time Events
// =============================================================================

export function usePluginEvents(onEvent: (event: unknown) => void) {
  const queryClient = useQueryClient();
  
  // Use same-origin WebSocket
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/events`);
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onEvent(data);
    
    // Invalidate queries on relevant events
    if (data.type?.startsWith('plugin:')) {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    }
  };
  
  return () => {
    ws.close();
  };
}
