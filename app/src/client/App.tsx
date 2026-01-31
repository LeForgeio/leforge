import { useEffect, Component, ReactNode } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import { ProtectedRoute, PublicOnlyRoute, RequireRole } from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Services from './pages/Services';
import Playground from './pages/Playground';
import ApiKeys from './pages/ApiKeys';
import Documentation from './pages/Documentation';
import Marketplace from './pages/Marketplace';
import InstalledPlugins from './pages/InstalledPlugins';
import Integrations from './pages/Integrations';
import Agents from './pages/Agents';
import SSLSettings from './pages/SSLSettings';
import AdminUsers from './pages/AdminUsers';
import AdminSettings from './pages/AdminSettings';
import AdminApiKeys from './pages/AdminApiKeys';
import Login from './pages/Login';
import { useThemeStore } from './store';
import { Toaster } from './components/ui/toaster';
import { Button } from './components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center p-8 max-w-md">
            <AlertTriangle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
            <p className="text-muted-foreground mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <div className="space-x-2">
              <Button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reload Page
              </Button>
              <Button
                variant="outline"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Not Found Page
function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <h1 className="text-4xl font-bold mb-2">404</h1>
      <p className="text-muted-foreground mb-4">Page not found</p>
      <Button asChild>
        <a href="/">Go Home</a>
      </Button>
    </div>
  );
}

export default function App() {
  const { isDark } = useThemeStore();

  useEffect(() => {
    // Apply theme on mount
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  return (
    <ErrorBoundary>
      <Routes>
        {/* Public route - Login */}
        <Route path="/login" element={
          <PublicOnlyRoute>
            <Login />
          </PublicOnlyRoute>
        } />
        
        {/* Protected routes - require authentication */}
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="services" element={<Services />} />
          <Route path="marketplace" element={<Marketplace />} />
          <Route path="plugins" element={<InstalledPlugins />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="agents" element={<Agents />} />
          <Route path="playground" element={<Playground />} />
          <Route path="api-keys" element={<ApiKeys />} />
          <Route path="ssl" element={<SSLSettings />} />
          <Route path="docs" element={<Documentation />} />
          {/* Admin Routes - require admin role */}
          <Route path="admin/users" element={
            <RequireRole roles={['admin']}>
              <AdminUsers />
            </RequireRole>
          } />
          <Route path="admin/settings" element={
            <RequireRole roles={['admin']}>
              <AdminSettings />
            </RequireRole>
          } />
          <Route path="admin/api-keys" element={
            <RequireRole roles={['admin']}>
              <AdminApiKeys />
            </RequireRole>
          } />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <Toaster />
    </ErrorBoundary>
  );
}
