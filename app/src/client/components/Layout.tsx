import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Sun, Moon, Home, Box, Play, Key, Github, Book, Menu, X, Package, Store, Sparkles, Shield, Cable, LogOut, User, Users, Settings, ChevronDown } from 'lucide-react';
import { useThemeStore, hasPermission } from '../store';
import { useAuth } from '../hooks/useAuth';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

const navItems = [
  { path: '/', label: 'Dashboard', icon: Home, permission: 'canViewDashboard' as const },
  { path: '/services', label: 'Services', icon: Box, permission: 'canViewDashboard' as const },
  { path: '/marketplace', label: 'Marketplace', icon: Store, permission: 'canManagePlugins' as const },
  { path: '/plugins', label: 'Installed Plugins', icon: Package, permission: 'canManagePlugins' as const },
  { path: '/integrations', label: 'Integrations', icon: Cable, permission: 'canManageIntegrations' as const },
  { path: '/playground', label: 'API Playground', icon: Play, permission: 'canUsePlayground' as const },
  { path: '/api-keys', label: 'API Keys', icon: Key, permission: 'canManageApiKeys' as const },
  { path: '/ssl', label: 'SSL / TLS', icon: Shield, permission: 'canManageSSL' as const },
  { path: '/docs', label: 'Documentation', icon: Book, permission: 'canViewDocs' as const },
];

const adminItems = [
  { path: '/admin/users', label: 'User Management', icon: Users },
  { path: '/admin/settings', label: 'System Settings', icon: Settings },
];

// LeForge Logo Component
function LeForgeLogo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 group">
      <div className="relative">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-primary/25 group-hover:shadow-primary/40 transition-shadow">
          <Sparkles className="w-4.5 h-4.5 text-white" />
        </div>
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary via-purple-500 to-pink-500 blur-lg opacity-40 group-hover:opacity-60 transition-opacity -z-10" />
      </div>
      {!collapsed && (
        <span className="text-lg font-semibold tracking-tight">
          Flow<span className="text-gradient">Forge</span>
        </span>
      )}
    </Link>
  );
}

export default function Layout() {
  const location = useLocation();
  const { isDark, toggle } = useThemeStore();
  const { user, isAuthenticated, authEnabled, logout, isLoggingOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(location.pathname.startsWith('/admin'));

  const isAdmin = user?.role === 'admin';

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Filter nav items based on user permissions
  const visibleNavItems = navItems.filter(item => 
    !user || hasPermission(user.role, item.permission)
  );

  const navContent = (
    <>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className={cn('w-4.5 h-4.5', isActive && 'text-primary')} />
              <span className="text-sm">{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}

        {/* Admin Section */}
        {isAdmin && (
          <div className="pt-4 mt-4 border-t border-border/50">
            <button
              onClick={() => setAdminExpanded(!adminExpanded)}
              className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-200"
            >
              <Shield className="w-4.5 h-4.5 text-red-500" />
              <span className="text-sm font-medium">Administration</span>
              <ChevronDown className={cn('w-4 h-4 ml-auto transition-transform', adminExpanded && 'rotate-180')} />
            </button>
            {adminExpanded && (
              <div className="ml-4 mt-1 space-y-1">
                {adminItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
                        isActive
                          ? 'bg-red-500/10 text-red-500 font-medium'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      )}
                    >
                      <Icon className={cn('w-4 h-4', isActive && 'text-red-500')} />
                      <span className="text-sm">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-border/50 space-y-3">
        <div className="flex items-center justify-between px-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Theme</span>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggle}
            className="h-8 w-8 rounded-lg"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
        
        {/* User info and logout */}
        {authEnabled && isAuthenticated && user && (
          <div className="px-3 py-2 rounded-lg bg-accent/50 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user.role}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full h-8 text-xs justify-start gap-2"
            >
              <LogOut className="w-3.5 h-3.5" />
              {isLoggingOut ? 'Signing out...' : 'Sign out'}
            </Button>
          </div>
        )}
        
        {/* Auth disabled indicator */}
        {authEnabled === false && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-amber-500/10">
            <div className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-offset-1 ring-offset-background ring-amber-500/30" />
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Auth Disabled
            </span>
          </div>
        )}

        <a
          href="https://github.com/LeForgeio/leforge"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
        >
          <Github className="w-4 h-4" />
          <span>GitHub</span>
        </a>
        
        <div className="px-3 pt-2">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
            LeForge v1.0.0
          </p>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden bg-card/80 backdrop-blur-xl border-b border-border/50 p-4 flex items-center justify-between sticky top-0 z-50">
        <LeForgeLogo />
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="h-9 w-9 rounded-lg"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside className={cn(
        'fixed top-0 left-0 h-full w-72 bg-card/95 backdrop-blur-xl border-r border-border/50 z-50 flex flex-col transform transition-transform duration-300 md:hidden',
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="p-4 border-b border-border/50">
          <LeForgeLogo />
        </div>
        {navContent}
      </aside>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-card/50 border-r border-border/50 flex-col sticky top-0 h-screen">
        <div className="p-4 border-b border-border/50">
          <LeForgeLogo />
        </div>
        {navContent}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto gradient-mesh">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
