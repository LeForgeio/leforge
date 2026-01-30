import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// =============================================================================
// Auth Store
// =============================================================================

export type UserRole = 'admin' | 'developer' | 'user';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  role: UserRole;
}

// Role permissions (mirrored from server)
export const ROLE_PERMISSIONS = {
  admin: {
    canManageUsers: true,
    canManageSettings: true,
    canManagePlugins: true,
    canManageApiKeys: true,
    canManageIntegrations: true,
    canManageSSL: true,
    canUsePlayground: true,
    canViewDashboard: true,
    canViewDocs: true,
  },
  developer: {
    canManageUsers: false,
    canManageSettings: false,
    canManagePlugins: true,
    canManageApiKeys: true,
    canManageIntegrations: true,
    canManageSSL: false,
    canUsePlayground: true,
    canViewDashboard: true,
    canViewDocs: true,
  },
  user: {
    canManageUsers: false,
    canManageSettings: false,
    canManagePlugins: false,
    canManageApiKeys: true,
    canManageIntegrations: false,
    canManageSSL: false,
    canUsePlayground: true,
    canViewDashboard: true,
    canViewDocs: true,
  },
} as const;

export type Permission = keyof typeof ROLE_PERMISSIONS.admin;

export function hasPermission(role: UserRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.[permission] ?? false;
}

interface AuthState {
  // Session auth (user login)
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  authEnabled: boolean | null; // null = unknown (not yet checked)
  
  // Actions
  setAuth: (user: AuthUser, token: string) => void;
  clearAuth: () => void;
  setAuthEnabled: (enabled: boolean) => void;
  
  // Legacy API key support (for playground/integrations)
  apiKey: string | null;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      authEnabled: null,
      apiKey: null,
      
      setAuth: (user: AuthUser, token: string) => set({ 
        user, 
        token, 
        isAuthenticated: true 
      }),
      
      clearAuth: () => set({ 
        user: null, 
        token: null, 
        isAuthenticated: false 
      }),
      
      setAuthEnabled: (enabled: boolean) => set({ authEnabled: enabled }),
      
      setApiKey: (key: string) => set({ apiKey: key }),
      clearApiKey: () => set({ apiKey: null }),
    }),
    {
      name: 'LeForge-auth',
      // Only persist certain fields
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        apiKey: state.apiKey,
      }),
    }
  )
);

// =============================================================================
// Theme Store
// =============================================================================

interface ThemeState {
  isDark: boolean;
  toggle: () => void;
  setDark: (dark: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDark: true,
      toggle: () => set((state) => {
        const newDark = !state.isDark;
        document.documentElement.classList.toggle('dark', newDark);
        return { isDark: newDark };
      }),
      setDark: (dark: boolean) => {
        document.documentElement.classList.toggle('dark', dark);
        set({ isDark: dark });
      },
    }),
    {
      name: 'LeForge-theme',
      onRehydrateStorage: () => (state) => {
        // Apply theme on initial load
        if (state) {
          document.documentElement.classList.toggle('dark', state.isDark);
        }
      },
    }
  )
);

// =============================================================================
// Playground Store (Request History and Saved Requests)
// =============================================================================

export interface PlaygroundRequest {
  id: string;
  name: string;
  description?: string;
  service: string;
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface RequestHistoryItem {
  id: string;
  timestamp: number;
  service: string;
  endpoint: string;
  method: string;
  status: number;
  duration: number;
  requestBody?: string;
  responseBody?: string;
}

interface PlaygroundState {
  savedRequests: PlaygroundRequest[];
  requestHistory: RequestHistoryItem[];
  activeRequest: PlaygroundRequest | null;
  addSavedRequest: (request: Omit<PlaygroundRequest, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateSavedRequest: (id: string, updates: Partial<PlaygroundRequest>) => void;
  deleteSavedRequest: (id: string) => void;
  setActiveRequest: (request: PlaygroundRequest | null) => void;
  addToHistory: (item: Omit<RequestHistoryItem, 'id' | 'timestamp'>) => void;
  clearHistory: () => void;
}

export const usePlaygroundStore = create<PlaygroundState>()(
  persist(
    (set) => ({
      savedRequests: [],
      requestHistory: [],
      activeRequest: null,
      addSavedRequest: (request) => set((state) => ({
        savedRequests: [
          {
            ...request,
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          ...state.savedRequests,
        ],
      })),
      updateSavedRequest: (id, updates) => set((state) => ({
        savedRequests: state.savedRequests.map((req) =>
          req.id === id
            ? { ...req, ...updates, updatedAt: Date.now() }
            : req
        ),
      })),
      deleteSavedRequest: (id) => set((state) => ({
        savedRequests: state.savedRequests.filter((req) => req.id !== id),
      })),
      setActiveRequest: (request) => set({ activeRequest: request }),
      addToHistory: (item) => set((state) => ({
        requestHistory: [
          { ...item, id: crypto.randomUUID(), timestamp: Date.now() },
          ...state.requestHistory.slice(0, 99), // Keep last 100
        ],
      })),
      clearHistory: () => set({ requestHistory: [] }),
    }),
    {
      name: 'LeForge-playground',
    }
  )
);

// =============================================================================
// UI Store
// =============================================================================

interface UIState {
  sidebarOpen: boolean;
  mobileMenuOpen: boolean;
  activeModal: string | null;
  setSidebarOpen: (open: boolean) => void;
  setMobileMenuOpen: (open: boolean) => void;
  setActiveModal: (modal: string | null) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: true,
  mobileMenuOpen: false,
  activeModal: null,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
  setActiveModal: (modal) => set({ activeModal: modal }),
}));

// =============================================================================
// API Call History Store (Legacy - kept for compatibility)
// =============================================================================

export interface ApiCall {
  id: string;
  timestamp: number;
  method: string;
  path: string;
  service: string;
  status: number;
  duration: number;
  requestBody?: string;
  responseBody?: string;
  error?: string;
}

interface ApiCallHistoryState {
  calls: ApiCall[];
  addCall: (call: Omit<ApiCall, 'id' | 'timestamp'>) => void;
  clearHistory: () => void;
  getRecentCalls: (limit?: number) => ApiCall[];
}

export const useApiCallHistoryStore = create<ApiCallHistoryState>()(
  persist(
    (set, get) => ({
      calls: [],
      addCall: (call) => set((state) => ({
        calls: [
          { ...call, id: crypto.randomUUID(), timestamp: Date.now() },
          ...state.calls.slice(0, 99), // Keep last 100 calls
        ],
      })),
      clearHistory: () => set({ calls: [] }),
      getRecentCalls: (limit = 10) => get().calls.slice(0, limit),
    }),
    {
      name: 'LeForge-api-history',
    }
  )
);

// =============================================================================
// Saved Requests Store (Legacy - kept for compatibility)
// =============================================================================

export interface SavedRequest {
  id: string;
  name: string;
  description?: string;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  createdAt: number;
  updatedAt: number;
}

interface SavedRequestsState {
  requests: SavedRequest[];
  addRequest: (request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateRequest: (id: string, updates: Partial<SavedRequest>) => void;
  deleteRequest: (id: string) => void;
  getRequestById: (id: string) => SavedRequest | undefined;
}

export const useSavedRequestsStore = create<SavedRequestsState>()(
  persist(
    (set, get) => ({
      requests: [],
      addRequest: (request) => set((state) => ({
        requests: [
          {
            ...request,
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          ...state.requests,
        ],
      })),
      updateRequest: (id, updates) => set((state) => ({
        requests: state.requests.map((req) =>
          req.id === id
            ? { ...req, ...updates, updatedAt: Date.now() }
            : req
        ),
      })),
      deleteRequest: (id) => set((state) => ({
        requests: state.requests.filter((req) => req.id !== id),
      })),
      getRequestById: (id) => get().requests.find((req) => req.id === id),
    }),
    {
      name: 'LeForge-saved-requests',
    }
  )
);

// =============================================================================
// Service Health Store
// =============================================================================

export interface ServiceHealth {
  id: string;
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown' | 'loading';
  version?: string;
  uptime?: number;
  lastChecked: number;
  responseTime?: number;
}

interface ServiceHealthState {
  services: Record<string, ServiceHealth>;
  updateService: (id: string, health: Partial<ServiceHealth>) => void;
  setServiceStatus: (id: string, status: ServiceHealth['status']) => void;
  getService: (id: string) => ServiceHealth | undefined;
}

export const useServiceHealthStore = create<ServiceHealthState>()((set, get) => ({
  services: {},
  updateService: (id, health) => set((state) => ({
    services: {
      ...state.services,
      [id]: {
        ...state.services[id],
        ...health,
        id,
        lastChecked: Date.now(),
      },
    },
  })),
  setServiceStatus: (id, status) => set((state) => ({
    services: {
      ...state.services,
      [id]: {
        ...state.services[id],
        id,
        status,
        lastChecked: Date.now(),
      },
    },
  })),
  getService: (id) => get().services[id],
}));

// =============================================================================
// Settings Store
// =============================================================================

interface SettingsState {
  baseUrl: string;
  timeout: number;
  setBaseUrl: (url: string) => void;
  setTimeout: (ms: number) => void;
}

// Use environment variable or derive from current location
// VITE_API_BASE_URL can be set to override (e.g., http://10.0.0.166:8000)
const getDefaultBaseUrl = (): string => {
  // Check for build-time env var first
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  // Fall back to same-origin (works when served from same host)
  if (typeof window !== 'undefined') {
    // Use same port as current location (unified app serves both frontend and API)
    return `${window.location.protocol}//${window.location.host}`;
  }
  return 'http://localhost:3000';
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      baseUrl: getDefaultBaseUrl(),
      timeout: 30000,
      setBaseUrl: (url) => set({ baseUrl: url }),
      setTimeout: (ms) => set({ timeout: ms }),
    }),
    {
      name: 'LeForge-settings',
    }
  )
);
