import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, UserRole } from '../store';
import { useSettingsStore } from '../store';

// =============================================================================
// Types
// =============================================================================

export interface AuthConfig {
  enabled: boolean;
  mode: 'local' | 'oidc' | 'both';
  oidcEnabled: boolean;
  oidcConfig?: {
    issuer: string;
    authorizationEndpoint: string;
    clientId: string;
    scopes: string[];
  };
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  role: UserRole;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: AuthUser;
  token?: string;
  error?: string;
}

export interface MeResponse {
  authenticated: boolean;
  authEnabled?: boolean;
  user?: AuthUser;
  error?: string;
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchAuthConfig(baseUrl: string): Promise<AuthConfig> {
  const response = await fetch(`${baseUrl}/api/v1/auth/config`);
  if (!response.ok) {
    throw new Error('Failed to fetch auth config');
  }
  return response.json();
}

async function login(baseUrl: string, credentials: LoginCredentials): Promise<LoginResponse> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Include cookies
    body: JSON.stringify(credentials),
  });
  
  const data = await response.json();
  return data;
}

async function logout(baseUrl: string): Promise<void> {
  await fetch(`${baseUrl}/api/v1/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

async function fetchCurrentUser(baseUrl: string, token?: string | null): Promise<MeResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
    credentials: 'include',
    headers,
  });
  
  // Parse response body even for 401 - it contains authEnabled flag
  const data = await response.json().catch(() => ({ authenticated: false, authEnabled: true }));
  
  if (!response.ok) {
    if (response.status === 401) {
      return { authenticated: false, authEnabled: data.authEnabled ?? true };
    }
    throw new Error('Failed to fetch current user');
  }
  
  return data;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to get auth configuration
 */
export function useAuthConfig() {
  const { baseUrl } = useSettingsStore();
  
  return useQuery({
    queryKey: ['auth', 'config'],
    queryFn: () => fetchAuthConfig(baseUrl),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

/**
 * Hook to check current authentication status
 */
export function useCurrentUser() {
  const { baseUrl } = useSettingsStore();
  const { token, setAuth, clearAuth, setAuthEnabled } = useAuthStore();
  
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const result = await fetchCurrentUser(baseUrl, token);
      
      // Update store based on result
      if (result.authEnabled !== undefined) {
        setAuthEnabled(result.authEnabled);
      }
      
      if (result.authenticated && result.user) {
        // If we got user data but don't have a token stored, 
        // we're relying on cookies
        if (!token) {
          setAuth(result.user, ''); // Empty token, using cookie
        }
      } else if (!result.authenticated) {
        clearAuth();
      }
      
      return result;
    },
    staleTime: 30 * 1000, // 30 seconds
    retry: false,
  });
}

/**
 * Hook for login mutation
 */
export function useLogin() {
  const { baseUrl } = useSettingsStore();
  const { setAuth } = useAuthStore();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (credentials: LoginCredentials) => login(baseUrl, credentials),
    onSuccess: (data) => {
      if (data.success && data.user && data.token) {
        setAuth(data.user, data.token);
        // Invalidate queries to refresh data with auth
        queryClient.invalidateQueries();
      }
    },
  });
}

/**
 * Hook for logout mutation
 */
export function useLogout() {
  const { baseUrl } = useSettingsStore();
  const { clearAuth } = useAuthStore();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => logout(baseUrl),
    onSuccess: () => {
      clearAuth();
      // Clear all cached data
      queryClient.clear();
    },
  });
}

/**
 * Combined hook for auth state and actions
 */
export function useAuth() {
  const { user, isAuthenticated, authEnabled } = useAuthStore();
  const { data: currentUser, isLoading, refetch } = useCurrentUser();
  const loginMutation = useLogin();
  const logoutMutation = useLogout();
  
  return {
    // State
    user: currentUser?.user || user,
    isAuthenticated: currentUser?.authenticated ?? isAuthenticated,
    authEnabled: currentUser?.authEnabled ?? authEnabled,
    isLoading,
    
    // Actions
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    refresh: refetch,
    
    // Mutation states
    isLoggingIn: loginMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
    loginError: loginMutation.error?.message || (loginMutation.data && !loginMutation.data.success ? loginMutation.data.error : null),
  };
}
