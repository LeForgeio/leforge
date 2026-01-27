import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Sun, Moon, Home, Box, Play, Key, Github, Book, Menu, X, Package, Store, Sparkles, Shield } from 'lucide-react';
import { useThemeStore, useAuthStore } from '../store';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

const navItems = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/services', label: 'Services', icon: Box },
  { path: '/marketplace', label: 'Marketplace', icon: Store },
  { path: '/plugins', label: 'Installed Plugins', icon: Package },
  { path: '/playground', label: 'API Playground', icon: Play },
  { path: '/api-keys', label: 'API Keys', icon: Key },
  { path: '/ssl', label: 'SSL / TLS', icon: Shield },
  { path: '/docs', label: 'Documentation', icon: Book },
];

// FlowForge Logo Component
function FlowForgeLogo({ collapsed = false }: { collapsed?: boolean }) {
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
  const { isAuthenticated } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navContent = (
    <>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
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
              <Icon className={cn('w-[18px] h-[18px]', isActive && 'text-primary')} />
              <span className="text-sm">{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
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
        
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-accent/50">
          <div className={cn(
            'w-2 h-2 rounded-full ring-2 ring-offset-1 ring-offset-background',
            isAuthenticated 
              ? 'bg-emerald-500 ring-emerald-500/30' 
              : 'bg-amber-500 ring-amber-500/30'
          )} />
          <span className="text-xs text-muted-foreground">
            {isAuthenticated ? 'API Key Active' : 'No API Key'}
          </span>
        </div>

        <a
          href="https://github.com/danstoll/flowforge"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
        >
          <Github className="w-4 h-4" />
          <span>GitHub</span>
        </a>
        
        <div className="px-3 pt-2">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
            FlowForge v1.0.0
          </p>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden bg-card/80 backdrop-blur-xl border-b border-border/50 p-4 flex items-center justify-between sticky top-0 z-50">
        <FlowForgeLogo />
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
          <FlowForgeLogo />
        </div>
        {navContent}
      </aside>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-card/50 border-r border-border/50 flex-col sticky top-0 h-screen">
        <div className="p-4 border-b border-border/50">
          <FlowForgeLogo />
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
