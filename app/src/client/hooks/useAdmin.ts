import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSettingsStore, UserRole } from '../store';

// =============================================================================
// Types
// =============================================================================

export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  role: UserRole;
  authProvider: 'local' | 'oidc';
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  email?: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  displayName?: string;
  email?: string;
  role?: UserRole;
  isActive?: boolean;
  password?: string;
}

export interface UserStats {
  total: number;
  byRole: Record<UserRole, number>;
}

export interface AuthSettings {
  mode: string;
  sessionDuration: string;
  allowRegistration: boolean;
  requireEmailVerification: boolean;
}

export interface OidcSettings {
  enabled: boolean;
  issuer: string;
  clientId: string;
  scopes: string[];
  autoCreateUsers: boolean;
  defaultRole: string;
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchUsers(baseUrl: string, token?: string | null): Promise<{ users: User[]; stats: Record<UserRole, number> }> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${baseUrl}/api/v1/admin/users`, {
    credentials: 'include',
    headers,
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch users');
  }
  
  return response.json();
}

async function createUser(baseUrl: string, token: string | null, input: CreateUserInput): Promise<User> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${baseUrl}/api/v1/admin/users`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(input),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to create user');
  }
  
  return response.json();
}

async function updateUser(baseUrl: string, token: string | null, userId: string, input: UpdateUserInput): Promise<User> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${baseUrl}/api/v1/admin/users/${userId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers,
    body: JSON.stringify(input),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to update user');
  }
  
  return response.json();
}

async function deleteUser(baseUrl: string, token: string | null, userId: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${baseUrl}/api/v1/admin/users/${userId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to delete user');
  }
}

async function fetchAuthSettings(baseUrl: string, token: string | null): Promise<AuthSettings> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${baseUrl}/api/v1/admin/settings/auth`, {
    credentials: 'include',
    headers,
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch auth settings');
  }
  
  return response.json();
}

async function updateAuthSettings(baseUrl: string, token: string | null, settings: Partial<AuthSettings>): Promise<AuthSettings> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${baseUrl}/api/v1/admin/settings/auth`, {
    method: 'PATCH',
    credentials: 'include',
    headers,
    body: JSON.stringify(settings),
  });
  
  if (!response.ok) {
    throw new Error('Failed to update auth settings');
  }
  
  return response.json();
}

async function fetchOidcSettings(baseUrl: string, token: string | null): Promise<OidcSettings> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${baseUrl}/api/v1/admin/settings/oidc`, {
    credentials: 'include',
    headers,
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch OIDC settings');
  }
  
  return response.json();
}

async function updateOidcSettings(baseUrl: string, token: string | null, settings: Partial<OidcSettings & { clientSecret?: string }>): Promise<OidcSettings> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${baseUrl}/api/v1/admin/settings/oidc`, {
    method: 'PATCH',
    credentials: 'include',
    headers,
    body: JSON.stringify(settings),
  });
  
  if (!response.ok) {
    throw new Error('Failed to update OIDC settings');
  }
  
  return response.json();
}

// =============================================================================
// Hooks
// =============================================================================

export function useUsers() {
  const { baseUrl } = useSettingsStore();
  const token = localStorage.getItem('LeForge-auth') 
    ? JSON.parse(localStorage.getItem('LeForge-auth') || '{}').state?.token 
    : null;
  
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => fetchUsers(baseUrl, token),
    staleTime: 30 * 1000,
  });
}

export function useCreateUser() {
  const { baseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const token = localStorage.getItem('LeForge-auth') 
    ? JSON.parse(localStorage.getItem('LeForge-auth') || '{}').state?.token 
    : null;
  
  return useMutation({
    mutationFn: (input: CreateUserInput) => createUser(baseUrl, token, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useUpdateUser() {
  const { baseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const token = localStorage.getItem('LeForge-auth') 
    ? JSON.parse(localStorage.getItem('LeForge-auth') || '{}').state?.token 
    : null;
  
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: UpdateUserInput }) => 
      updateUser(baseUrl, token, userId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useDeleteUser() {
  const { baseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const token = localStorage.getItem('LeForge-auth') 
    ? JSON.parse(localStorage.getItem('LeForge-auth') || '{}').state?.token 
    : null;
  
  return useMutation({
    mutationFn: (userId: string) => deleteUser(baseUrl, token, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useAuthSettings() {
  const { baseUrl } = useSettingsStore();
  const token = localStorage.getItem('LeForge-auth') 
    ? JSON.parse(localStorage.getItem('LeForge-auth') || '{}').state?.token 
    : null;
  
  return useQuery({
    queryKey: ['admin', 'settings', 'auth'],
    queryFn: () => fetchAuthSettings(baseUrl, token),
    staleTime: 60 * 1000,
  });
}

export function useUpdateAuthSettings() {
  const { baseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const token = localStorage.getItem('LeForge-auth') 
    ? JSON.parse(localStorage.getItem('LeForge-auth') || '{}').state?.token 
    : null;
  
  return useMutation({
    mutationFn: (settings: Partial<AuthSettings>) => updateAuthSettings(baseUrl, token, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'auth'] });
    },
  });
}

export function useOidcSettings() {
  const { baseUrl } = useSettingsStore();
  const token = localStorage.getItem('LeForge-auth') 
    ? JSON.parse(localStorage.getItem('LeForge-auth') || '{}').state?.token 
    : null;
  
  return useQuery({
    queryKey: ['admin', 'settings', 'oidc'],
    queryFn: () => fetchOidcSettings(baseUrl, token),
    staleTime: 60 * 1000,
  });
}

export function useUpdateOidcSettings() {
  const { baseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const token = localStorage.getItem('LeForge-auth') 
    ? JSON.parse(localStorage.getItem('LeForge-auth') || '{}').state?.token 
    : null;
  
  return useMutation({
    mutationFn: (settings: Partial<OidcSettings & { clientSecret?: string }>) => 
      updateOidcSettings(baseUrl, token, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'oidc'] });
    },
  });
}
