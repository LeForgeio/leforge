import { useState } from 'react';
import {
  Cable,
  Download,
  ExternalLink,
  Copy,
  Check,
  Zap,
  Cloud,
  Workflow,
  Code2,
  Database,
  Settings2,
  Search,
  ChevronRight,
  FileJson,
  Package,
  BookOpen,
  AlertCircle,
  LayoutGrid,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useIntegrations, Integration, PlatformConnector } from '@/hooks/useIntegrations';
import { useInstalledPlugins } from '@/hooks/usePlugins';

// Platform icons/logos
const PlatformIcon = ({ platform }: { platform: string }) => {
  const icons: Record<string, React.ReactNode> = {
    'power-automate': <Zap className="w-5 h-5 text-blue-500" />,
    'nintex-cloud': <Cloud className="w-5 h-5 text-emerald-500" />,
    'nintex-k2': <Workflow className="w-5 h-5 text-purple-500" />,
    'n8n': <Code2 className="w-5 h-5 text-orange-500" />,
    'salesforce': <Cloud className="w-5 h-5 text-sky-500" />,
    'servicenow': <Database className="w-5 h-5 text-green-500" />,
    'outsystems': <Settings2 className="w-5 h-5 text-red-500" />,
    'mendix': <Package className="w-5 h-5 text-indigo-500" />,
  };
  return icons[platform] || <Cable className="w-5 h-5" />;
};

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    ready: { label: 'Ready', variant: 'default' },
    'in-development': { label: 'In Development', variant: 'secondary' },
    planned: { label: 'Planned', variant: 'outline' },
  };

  const config = statusConfig[status] || statusConfig.planned;

  return (
    <Badge variant={config.variant} className="text-xs">
      {config.label}
    </Badge>
  );
}

// Copy button with feedback
function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast({ description: `${label || 'Value'} copied to clipboard` });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="icon" onClick={handleCopy} className="h-8 w-8">
      {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
    </Button>
  );
}

// Platform card component
function PlatformCard({
  platform,
  onSelect,
}: {
  platform: PlatformConnector;
  onSelect: () => void;
}) {
  return (
    <Card
      className={cn(
        'cursor-pointer hover:border-primary/50 transition-all duration-200 group',
        platform.status === 'planned' && 'opacity-60'
      )}
      onClick={platform.status !== 'planned' ? onSelect : undefined}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent">
              <PlatformIcon platform={platform.id} />
            </div>
            <div>
              <CardTitle className="text-base">{platform.name}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{platform.format}</CardDescription>
            </div>
          </div>
          <StatusBadge status={platform.status} />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {platform.description}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {platform.connectors.length} connector{platform.connectors.length !== 1 ? 's' : ''}
          </span>
          {platform.status !== 'planned' && (
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Connector detail dialog
function ConnectorDetailDialog({
  open,
  onOpenChange,
  platform,
  connector,
  flowforgeUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: PlatformConnector;
  connector: Integration;
  flowforgeUrl: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent">
              <PlatformIcon platform={platform.id} />
            </div>
            <div>
              <DialogTitle>{connector.name}</DialogTitle>
              <DialogDescription>
                {platform.name} connector for {connector.pluginName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="setup" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
            <TabsTrigger value="download">Download</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-4 mt-4">
            <div>
              <h4 className="text-sm font-medium mb-2">1. FlowForge Endpoint URL</h4>
              <div className="flex items-center gap-2 p-3 bg-accent/50 rounded-lg font-mono text-sm">
                <span className="flex-1 truncate">{flowforgeUrl}</span>
                <CopyButton value={flowforgeUrl} label="Endpoint URL" />
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">2. Authentication</h4>
              <div className="p-3 bg-accent/50 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Method:</span>
                  <span>API Key</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Header:</span>
                  <code className="text-xs bg-background px-1.5 py-0.5 rounded">X-API-Key</code>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Generate an API key from the{' '}
                <a href="#/api-keys" className="text-primary hover:underline">
                  API Keys
                </a>{' '}
                page.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">3. Installation Steps</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                {connector.setupSteps?.map((step, i) => (
                  <li key={i}>{step}</li>
                )) || (
                  <>
                    <li>Download the connector package below</li>
                    <li>Import into {platform.name}</li>
                    <li>Configure the connection with your endpoint URL and API key</li>
                    <li>Use the actions in your workflows</li>
                  </>
                )}
              </ol>
            </div>
          </TabsContent>

          <TabsContent value="actions" className="mt-4">
            <div className="space-y-2">
              {connector.actions && connector.actions.length > 0 ? (
                connector.actions.map((action, i) => (
                  <div key={i} className="p-3 bg-accent/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{action.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {action.method}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{action.description}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Action details not yet available
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="download" className="mt-4">
            <div className="space-y-3">
              {connector.downloadUrl ? (
                <Button asChild className="w-full">
                  <a href={connector.downloadUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="w-4 h-4 mr-2" />
                    Download Connector Package
                  </a>
                </Button>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Download not yet available</p>
                  <p className="text-xs mt-1">This connector is still in development</p>
                </div>
              )}

              {connector.documentationUrl && (
                <Button variant="outline" asChild className="w-full">
                  <a href={connector.documentationUrl} target="_blank" rel="noopener noreferrer">
                    <BookOpen className="w-4 h-4 mr-2" />
                    View Documentation
                  </a>
                </Button>
              )}

              {connector.repositoryUrl && (
                <Button variant="outline" asChild className="w-full">
                  <a href={connector.repositoryUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View on GitHub
                  </a>
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Category labels and icons
const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof FileJson; color: string }> = {
  'workflow': { label: 'Workflow Actions', icon: Workflow, color: 'text-blue-500' },
  'form-plugin': { label: 'Forms Plugins', icon: FileJson, color: 'text-purple-500' },
  'data-access': { label: 'Data Objects', icon: Database, color: 'text-emerald-500' },
  'form-control': { label: 'Form Controls', icon: LayoutGrid, color: 'text-amber-500' },
  'service-broker': { label: 'Service Brokers', icon: Cable, color: 'text-cyan-500' },
  'custom-connector': { label: 'Custom Connectors', icon: Settings2, color: 'text-orange-500' },
  'component': { label: 'Components', icon: Package, color: 'text-indigo-500' },
  'node': { label: 'Nodes', icon: Code2, color: 'text-red-500' },
};

// Platform detail dialog
function PlatformDetailDialog({
  open,
  onOpenChange,
  platform,
  flowforgeUrl,
  installedPluginIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: PlatformConnector | null;
  flowforgeUrl: string;
  installedPluginIds: string[];
}) {
  const [selectedConnector, setSelectedConnector] = useState<Integration | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  if (!platform) return null;

  // Get unique categories from connectors
  const availableCategories = Array.from(
    new Set(platform.connectors.map((c) => c.category || 'workflow'))
  );

  const filteredConnectors = platform.connectors.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.pluginName.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      activeCategory === 'all' || (c.category || 'workflow') === activeCategory;
    return matchesSearch && matchesCategory;
  });

  // Group connectors by category for display
  const connectorsByCategory = platform.connectors.reduce(
    (acc, connector) => {
      const category = connector.category || 'workflow';
      if (!acc[category]) acc[category] = [];
      acc[category].push(connector);
      return acc;
    },
    {} as Record<string, Integration[]>
  );

  if (selectedConnector) {
    return (
      <ConnectorDetailDialog
        open={open}
        onOpenChange={(open) => {
          if (!open) setSelectedConnector(null);
          else onOpenChange(open);
        }}
        platform={platform}
        connector={selectedConnector}
        flowforgeUrl={flowforgeUrl}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent">
              <PlatformIcon platform={platform.id} />
            </div>
            <div>
              <DialogTitle>{platform.name}</DialogTitle>
              <DialogDescription>{platform.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4">
          {/* Category Tabs */}
          {availableCategories.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <Button
                variant={activeCategory === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveCategory('all')}
              >
                All ({platform.connectors.length})
              </Button>
              {availableCategories.map((category) => {
                const config = CATEGORY_CONFIG[category];
                const Icon = config.icon;
                const count = connectorsByCategory[category]?.length || 0;
                return (
                  <Button
                    key={category}
                    variant={activeCategory === category ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveCategory(category)}
                    className="gap-1"
                  >
                    <Icon className={`w-3 h-3 ${activeCategory === category ? '' : config.color}`} />
                    {config.label} ({count})
                  </Button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search connectors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            {filteredConnectors.length > 0 ? (
              filteredConnectors.map((connector) => {
                const isInstalled = installedPluginIds.includes(connector.pluginId);
                const category = connector.category || 'workflow-actions';
                const categoryConfig = CATEGORY_CONFIG[category];
                const CategoryIcon = categoryConfig?.icon || FileJson;
                return (
                  <div
                    key={connector.id}
                    className="p-3 bg-accent/50 rounded-lg cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => setSelectedConnector(connector)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CategoryIcon className={`w-4 h-4 ${categoryConfig?.color || 'text-muted-foreground'}`} />
                        <div>
                          <span className="font-medium text-sm">{connector.name}</span>
                          <p className="text-xs text-muted-foreground">
                            {connector.pluginName}
                            {activeCategory === 'all' && categoryConfig && (
                              <span className="ml-2 opacity-75">• {categoryConfig.label}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isInstalled ? (
                          <Badge variant="default" className="text-xs">
                            Plugin Installed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            Plugin Required
                          </Badge>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No connectors found
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Main Integrations component
export default function Integrations() {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformConnector | null>(null);
  const [search, setSearch] = useState('');

  const { data: integrations, isLoading } = useIntegrations();
  const { data: pluginsData } = useInstalledPlugins();

  const installedPluginIds = pluginsData?.plugins?.map((p) => p.forgehookId) || [];

  // Get FlowForge URL from current location
  const flowforgeUrl = typeof window !== 'undefined' 
    ? `${window.location.protocol}//${window.location.host}`
    : 'http://localhost:3000';

  const platforms = integrations?.platforms || [];
  
  const filteredPlatforms = platforms.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.format.toLowerCase().includes(search.toLowerCase())
  );

  const readyPlatforms = filteredPlatforms.filter((p) => p.status === 'ready');
  const devPlatforms = filteredPlatforms.filter((p) => p.status === 'in-development');
  const plannedPlatforms = filteredPlatforms.filter((p) => p.status === 'planned');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground">
          Connect FlowForge to your workflow automation platforms
        </p>
      </div>

      {/* Connection Info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Cable className="w-4 h-4" />
            Your FlowForge Endpoint
          </CardTitle>
          <CardDescription>
            Use this URL when configuring connectors in external platforms
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 p-3 bg-background rounded-lg font-mono text-sm">
            <span className="flex-1 truncate">{flowforgeUrl}</span>
            <CopyButton value={flowforgeUrl} label="FlowForge URL" />
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search platforms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-muted rounded-lg" />
                  <div className="space-y-2">
                    <div className="h-4 w-24 bg-muted rounded" />
                    <div className="h-3 w-16 bg-muted rounded" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-10 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Ready Platforms */}
          {readyPlatforms.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                Ready to Use
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {readyPlatforms.map((platform) => (
                  <PlatformCard
                    key={platform.id}
                    platform={platform}
                    onSelect={() => setSelectedPlatform(platform)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* In Development */}
          {devPlatforms.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Code2 className="w-4 h-4 text-amber-500" />
                In Development
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {devPlatforms.map((platform) => (
                  <PlatformCard
                    key={platform.id}
                    platform={platform}
                    onSelect={() => setSelectedPlatform(platform)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Planned */}
          {plannedPlatforms.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-muted-foreground" />
                Planned
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {plannedPlatforms.map((platform) => (
                  <PlatformCard
                    key={platform.id}
                    platform={platform}
                    onSelect={() => setSelectedPlatform(platform)}
                  />
                ))}
              </div>
            </div>
          )}

          {filteredPlatforms.length === 0 && (
            <div className="text-center py-12">
              <Cable className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="font-medium">No platforms found</h3>
              <p className="text-sm text-muted-foreground">
                Try adjusting your search
              </p>
            </div>
          )}
        </>
      )}

      {/* Platform Detail Dialog */}
      <PlatformDetailDialog
        open={selectedPlatform !== null}
        onOpenChange={(open) => !open && setSelectedPlatform(null)}
        platform={selectedPlatform}
        flowforgeUrl={flowforgeUrl}
        installedPluginIds={installedPluginIds}
      />
    </div>
  );
}
