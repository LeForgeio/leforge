import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { UserRole, hasPermission, Permission } from '../store';
import { Loader2, ShieldAlert } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
}

interface RequireRoleProps {
  children: ReactNode;
  roles: UserRole[];
}

interface RequirePermissionProps {
  children: ReactNode;
  permission: Permission;
}

/**
 * Wrapper component that protects routes requiring authentication.
 * Redirects to login if not authenticated.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, authEnabled, isLoading } = useAuth();
  
  // Show loading while checking auth status
  if (isLoading || authEnabled === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }
  
  // If auth is disabled, allow access
  if (authEnabled === false) {
    return <>{children}</>;
  }
  
  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  // Authenticated, render children
  return <>{children}</>;
}

/**
 * Wrapper component for routes that should only be visible when NOT authenticated.
 * Useful for login page - redirects to home if already logged in.
 */
export function PublicOnlyRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, authEnabled, isLoading } = useAuth();
  
  // Show loading while checking auth status
  if (isLoading || authEnabled === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }
  
  // If auth is disabled or already authenticated, redirect to home
  if (authEnabled === false || isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

/**
 * Wrapper that requires specific user roles.
 * Must be used inside ProtectedRoute.
 */
export function RequireRole({ children, roles }: RequireRoleProps) {
  const { user, authEnabled } = useAuth();
  
  // If auth is disabled, allow access (anonymous gets admin role)
  if (authEnabled === false) {
    return <>{children}</>;
  }
  
  // Check if user has required role
  if (!user || !roles.includes(user.role as UserRole)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <ShieldAlert className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">
            You don't have permission to access this page.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Required role: {roles.join(' or ')}
          </p>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}

/**
 * Wrapper that requires specific permission.
 * Must be used inside ProtectedRoute.
 */
export function RequirePermission({ children, permission }: RequirePermissionProps) {
  const { user, authEnabled } = useAuth();
  
  // If auth is disabled, allow access
  if (authEnabled === false) {
    return <>{children}</>;
  }
  
  // Check if user has required permission
  if (!user || !hasPermission(user.role as UserRole, permission)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <ShieldAlert className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">
            You don't have permission to access this page.
          </p>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}
