import { ExternalLink, Shield, Calculator, FileText, Image, Bot, Database, RefreshCw, Plug, Container, Code, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { useInstalledPlugins } from '../hooks/usePlugins';
import type { ForgeHookCategory } from '../types/forgehook';

// Icon mapping for plugin categories
const categoryIcons: Record<ForgeHookCategory | string, typeof Shield> = {
  security: Shield,
  ai: Bot,
  data: Database,
  media: Image,
  integration: Plug,
  utility: RefreshCw,
  analytics: Calculator,
  communication: FileText,
};

// Color mapping for categories
const categoryColors: Record<ForgeHookCategory | string, string> = {
  security: 'text-amber-500',
  ai: 'text-pink-500',
  data: 'text-blue-500',
  media: 'text-purple-500',
  integration: 'text-orange-500',
  utility: 'text-cyan-500',
  analytics: 'text-green-500',
  communication: 'text-red-500',
};

const methodColors: Record<string, string> = {
  GET: 'bg-green-500/10 text-green-600 dark:text-green-400',
  POST: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  PUT: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  DELETE: 'bg-red-500/10 text-red-600 dark:text-red-400',
  PATCH: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
};

export default function Services() {
  const { data, isLoading } = useInstalledPlugins();
  
  // Filter to only running plugins
  const runningPlugins = data?.plugins?.filter(p => p.status === 'running') || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (runningPlugins.length === 0) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Services Catalog</h1>
          <p className="text-muted-foreground mt-1">Explore all available LeForge microservices</p>
        </div>
        <Card className="p-8 text-center">
          <Plug className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Services Available</h3>
          <p className="text-muted-foreground mb-4">
            Install and start plugins from the Marketplace to see available services here.
          </p>
          <Button asChild>
            <a href="#/marketplace">Browse Marketplace</a>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Services Catalog</h1>
        <p className="text-muted-foreground mt-1">
          {runningPlugins.length} active {runningPlugins.length === 1 ? 'service' : 'services'}
        </p>
      </div>

      <div className="grid gap-6">
        {runningPlugins.map((plugin) => {
          const category = plugin.manifest?.category || 'utility';
          const Icon = categoryIcons[category] || Plug;
          const color = categoryColors[category] || 'text-gray-500';
          const endpoints = plugin.manifest?.endpoints || [];
          const isContainer = plugin.runtime === 'container';
          
          return (
            <Card key={plugin.id} className="overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('p-2 rounded-lg bg-muted', color)}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {plugin.name}
                        <Badge variant="outline" className="text-xs font-normal">
                          v{plugin.version}
                        </Badge>
                      </CardTitle>
                      <CardDescription>{plugin.manifest?.description || plugin.description}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "text-xs flex items-center gap-1",
                        isContainer 
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" 
                          : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                      )}
                    >
                      {isContainer ? <Container className="w-3 h-3" /> : <Code className="w-3 h-3" />}
                      {isContainer ? 'Container' : 'Embedded'}
                    </Badge>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`#/playground?service=${plugin.forgehookId}`}>
                        Try it <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {endpoints.length > 0 ? (
                  <div className="grid gap-2">
                    {endpoints.map((ep, idx) => (
                      <div
                        key={`${ep.path}-${idx}`}
                        className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <span className={cn('px-2 py-0.5 rounded text-xs font-medium', methodColors[ep.method] || methodColors.GET)}>
                          {ep.method}
                        </span>
                        <code className="text-sm font-mono">{ep.path}</code>
                        <span className="text-sm text-muted-foreground ml-auto">{ep.description}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No endpoints documented</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
