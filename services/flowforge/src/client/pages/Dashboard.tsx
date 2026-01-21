import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { 
  Activity, CheckCircle, XCircle, Clock, Zap, Server, Database,
  TrendingUp, ArrowRight, ExternalLink, FileText, Calculator,
  Lock, Image as ImageIcon, Brain, Cpu, Package, Square
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { Skeleton } from '../components/ui/skeleton';
import { usePlaygroundStore, RequestHistoryItem } from '../store';
import { useInstalledPlugins } from '../hooks/usePlugins';
import { cn } from '../lib/utils';

// Icon mapping for plugin categories/types
const categoryIcons: Record<string, React.ElementType> = {
  security: Lock,
  ai: Brain,
  data: Database,
  media: ImageIcon,
  utility: Cpu,
  math: Calculator,
  pdf: FileText,
  default: Package,
};

const quickActions = [
  { label: 'Hash Text', service: 'crypto', endpoint: '/hash', icon: Lock },
  { label: 'Calculate', service: 'math', endpoint: '/calculate', icon: Calculator },
  { label: 'Generate PDF', service: 'pdf', endpoint: '/generate', icon: FileText },
  { label: 'AI Chat', service: 'llm', endpoint: '/chat', icon: Brain },
];

// Use VITE_API_URL if set (for local dev pointing to remote Docker), otherwise current hostname
const getServiceHost = () => {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    try {
      return new URL(apiUrl).hostname;
    } catch {
      // Fall through to default
    }
  }
  return window.location.hostname;
};

const SERVICES_HOST = getServiceHost();

async function checkHealth(port: number) {
  try {
    const response = await fetch(`http://${SERVICES_HOST}:${port}/health`, { 
      signal: AbortSignal.timeout(3000) 
    });
    if (!response.ok) throw new Error('Not healthy');
    return await response.json();
  } catch {
    return null;
  }
}

interface PluginHealthCardProps {
  plugin: {
    id: string;
    name?: string;
    forgehookId: string;
    status: string;
    assignedPort?: number;
    manifest?: {
      name?: string;
      category?: string;
      description?: string;
      version?: string;
    };
  };
}

function PluginHealthCard({ plugin }: PluginHealthCardProps) {
  const isRunning = plugin.status === 'running';
  const port = plugin.assignedPort;
  
  // Only poll health if plugin is running and has a port
  const { data, isLoading } = useQuery({
    queryKey: ['health', plugin.id],
    queryFn: () => checkHealth(port!),
    refetchInterval: 30000,
    retry: false,
    enabled: isRunning && !!port, // Only fetch if running
  });

  const category = plugin.manifest?.category || 'default';
  const Icon = categoryIcons[category] || categoryIcons.default;
  const pluginName = plugin.manifest?.name || plugin.name || plugin.forgehookId;
  
  // Determine status based on plugin state
  let status: 'loading' | 'offline' | 'online' | 'stopped';
  if (!isRunning) {
    status = 'stopped';
  } else if (isLoading) {
    status = 'loading';
  } else if (!data) {
    status = 'offline';
  } else {
    status = 'online';
  }
  
  const statusConfig = {
    loading: { color: 'text-yellow-500', bg: 'bg-yellow-500/10', icon: Clock, label: 'Checking...' },
    offline: { color: 'text-red-500', bg: 'bg-red-500/10', icon: XCircle, label: 'Unhealthy' },
    online: { color: 'text-green-500', bg: 'bg-green-500/10', icon: CheckCircle, label: 'Online' },
    stopped: { color: 'text-gray-500', bg: 'bg-gray-500/10', icon: Square, label: 'Stopped' },
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <Card className={cn('transition-all hover:shadow-lg group', config.bg)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base truncate max-w-35">{pluginName}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {port ? `Port ${port}` : 'Embedded'}
            </p>
          </div>
        </div>
        <div className={cn('flex items-center gap-1', config.color)}>
          <StatusIcon className="w-4 h-4" />
          <span className="text-xs font-medium">{config.label}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {plugin.manifest?.description || 'No description'}
        </p>
        <div className="flex items-center justify-between">
          {(data?.version || plugin.manifest?.version) && (
            <Badge variant="outline" className="text-xs">v{data?.version || plugin.manifest?.version}</Badge>
          )}
          <Link 
            to={`/plugins`}
            className="text-xs text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
          >
            Manage <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function StatsCard({ 
  title, 
  value, 
  icon: Icon, 
  trend,
  loading = false 
}: { 
  title: string; 
  value: string | number; 
  icon: React.ElementType;
  trend?: { value: number; positive: boolean };
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-20 mt-1" />
            ) : (
              <p className="text-2xl font-bold">{value}</p>
            )}
            {trend && !loading && (
              <div className={cn(
                'flex items-center gap-1 text-xs mt-1',
                trend.positive ? 'text-green-500' : 'text-red-500'
              )}>
                <TrendingUp className={cn('w-3 h-3', !trend.positive && 'rotate-180')} />
                {trend.value}% from yesterday
              </div>
            )}
          </div>
          <Icon className="w-8 h-8 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

function RecentActivityLog() {
  const { requestHistory } = usePlaygroundStore();
  
  // Get last 10 requests
  const recentRequests = requestHistory.slice(0, 10);

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-500';
    if (status >= 400 && status < 500) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Recent API Calls</CardTitle>
          <Link to="/playground">
            <Button variant="ghost" size="sm" className="text-xs">
              View All <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
        <CardDescription>Your latest API requests from the playground</CardDescription>
      </CardHeader>
      <CardContent>
        {recentRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent API calls</p>
            <Link to="/playground">
              <Button variant="link" size="sm" className="mt-2">
                Try the playground
              </Button>
            </Link>
          </div>
        ) : (
          <ScrollArea className="h-75">
            <div className="space-y-2">
              {recentRequests.map((req) => (
                <div 
                  key={req.id} 
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={cn('text-xs', getStatusColor(req.status))}>
                      {req.status}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">{req.endpoint}</p>
                      <p className="text-xs text-muted-foreground">{req.service}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{req.duration}ms</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(req.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActions() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Quick Actions</CardTitle>
        <CardDescription>Jump straight to common operations</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {quickActions.map((action) => (
            <Link 
              key={action.label}
              to={`/playground?service=${action.service}&endpoint=${action.endpoint}`}
            >
              <Button 
                variant="outline" 
                className="w-full justify-start gap-2 h-auto py-3"
              >
                <action.icon className="w-4 h-4 text-primary" />
                <span className="text-sm">{action.label}</span>
              </Button>
            </Link>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t space-y-2">
          <Link to="/docs">
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
              <ExternalLink className="w-4 h-4" />
              View Documentation
            </Button>
          </Link>
          <Link to="/services">
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
              <Server className="w-4 h-4" />
              Service Catalog
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { requestHistory } = usePlaygroundStore();
  const { data: pluginsData, isLoading: pluginsLoading } = useInstalledPlugins();
  
  // Calculate stats from request history
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const todayRequests = requestHistory.filter(
    (req: RequestHistoryItem) => new Date(req.timestamp) >= todayStart
  );
  
  const avgResponseTime = todayRequests.length > 0
    ? Math.round(todayRequests.reduce((sum: number, req: RequestHistoryItem) => sum + req.duration, 0) / todayRequests.length)
    : 0;

  // Success rate could be used for future analytics
  void (todayRequests.length > 0
    ? Math.round((todayRequests.filter((req: RequestHistoryItem) => req.status >= 200 && req.status < 300).length / todayRequests.length) * 100)
    : 100);

  const plugins = pluginsData?.plugins || [];
  const runningCount = plugins.filter(p => p.status === 'running').length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Monitor your FlowForge services</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard 
          title="Installed Plugins" 
          value={pluginsLoading ? '--' : plugins.length} 
          icon={Package}
          loading={pluginsLoading}
        />
        <StatsCard 
          title="Running" 
          value={pluginsLoading ? '--' : runningCount} 
          icon={Server}
          loading={pluginsLoading}
        />
        <StatsCard 
          title="Requests Today" 
          value={todayRequests.length || '--'} 
          icon={Activity}
          trend={todayRequests.length > 0 ? { value: 12, positive: true } : undefined}
        />
        <StatsCard 
          title="Avg Response" 
          value={avgResponseTime ? `${avgResponseTime}ms` : '--ms'} 
          icon={Zap}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Recent Activity - Takes 2 columns */}
        <div className="lg:col-span-2">
          <RecentActivityLog />
        </div>
        
        {/* Quick Actions */}
        <div>
          <QuickActions />
        </div>
      </div>

      {/* Plugins Grid */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Plugin Health</h2>
        <Link to="/plugins">
          <Button variant="ghost" size="sm">
            View All <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </div>
      {pluginsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : plugins.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold">No plugins installed</h3>
            <p className="text-muted-foreground mb-4">
              Install plugins from the marketplace to get started.
            </p>
            <Link to="/marketplace">
              <Button>Browse Marketplace</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plugins.map((plugin) => (
            <PluginHealthCard key={plugin.id} plugin={plugin} />
          ))}
        </div>
      )}
    </div>
  );
}
