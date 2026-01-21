import { useState, useRef } from 'react';
import { 
  Package, 
  Download, 
  Search, 
  Star,
  CheckCircle,
  Shield,
  Brain,
  Database,
  Image as ImageIcon,
  Wrench,
  BarChart,
  Mail,
  Plug,
  Lock,
  Calculator,
  FileText,
  Scan,
  Repeat,
  Github,
  Upload,
  Settings,
  RefreshCw,
  AlertCircle,
  Plus,
  Trash2,
  Power,
  Globe,
  FolderGit2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useInstalledPlugins } from '@/hooks/usePlugins';
import {
  useMarketplace,
  useRegistrySources,
  useInstallFromMarketplace,
  useInstallFromGitHub,
  useImportPackage,
  useInspectPackage,
  useAddSource,
  useDeleteSource,
  useToggleSource,
  useRefreshSource,
  useRefreshAllSources,
  MarketplacePlugin,
  RegistrySource,
  PackageInspectResult,
} from '@/hooks/useMarketplace';
import { 
  ForgeHookCategory, 
  CATEGORY_INFO,
} from '@/types/forgehook';

// Icon mapping
const iconMap: Record<string, React.ElementType> = {
  lock: Lock,
  calculator: Calculator,
  'file-text': FileText,
  scan: Scan,
  image: ImageIcon,
  brain: Brain,
  database: Database,
  repeat: Repeat,
  shield: Shield,
  wrench: Wrench,
  'bar-chart': BarChart,
  mail: Mail,
  plug: Plug,
};

function getIcon(iconName?: string) {
  if (!iconName) return Package;
  return iconMap[iconName] || Package;
}

// =============================================================================
// Plugin Card Component
// =============================================================================

function PluginCard({ 
  plugin, 
  isInstalled, 
  onInstall 
}: { 
  plugin: MarketplacePlugin; 
  isInstalled: boolean;
  onInstall: (plugin: MarketplacePlugin) => void;
}) {
  const Icon = getIcon(plugin.manifest.icon);
  const category = plugin.manifest.category;
  const categoryInfo = category ? CATEGORY_INFO[category] : null;
  
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              categoryInfo ? `bg-${categoryInfo.color.replace('text-', '')}/10` : 'bg-primary/10'
            )}>
              <Icon className={cn("w-6 h-6", categoryInfo?.color || 'text-primary')} />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {plugin.manifest.name}
                {plugin.verified && (
                  <span title="Verified">
                    <CheckCircle className="w-4 h-4 text-blue-500" />
                  </span>
                )}
                {plugin.source.isOfficial && (
                  <span title="Official">
                    <Shield className="w-4 h-4 text-green-500" />
                  </span>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground">v{plugin.manifest.version}</p>
            </div>
          </div>
          {isInstalled ? (
            <Badge variant="secondary" className="bg-green-500/10 text-green-600">
              Installed
            </Badge>
          ) : (
            <Button size="sm" onClick={() => onInstall(plugin)}>
              <Download className="w-4 h-4 mr-1" />
              Install
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {plugin.manifest.description}
        </p>
        
        <div className="flex flex-wrap gap-1">
          {plugin.manifest.tags?.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
        
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-4">
            {plugin.downloads && (
              <span className="flex items-center gap-1">
                <Download className="w-3 h-3" />
                {plugin.downloads.toLocaleString()}
              </span>
            )}
            {plugin.rating && (
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                {plugin.rating}
              </span>
            )}
          </div>
          <span className="text-xs opacity-75">{plugin.source.name}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Source Card Component
// =============================================================================

function SourceCard({
  source,
  onToggle,
  onRefresh,
  onDelete,
}: {
  source: RegistrySource;
  onToggle: () => void;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const SourceIcon = source.sourceType === 'github' ? FolderGit2 : Globe;
  
  return (
    <Card className={cn(!source.enabled && 'opacity-60')}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              source.isOfficial ? 'bg-green-500/10' : 'bg-blue-500/10'
            )}>
              <SourceIcon className={cn(
                "w-5 h-5",
                source.isOfficial ? 'text-green-500' : 'text-blue-500'
              )} />
            </div>
            <div>
              <div className="font-medium flex items-center gap-2">
                {source.name}
                {source.isOfficial && (
                  <Badge variant="secondary" className="text-xs">Official</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate max-w-50">
                {source.url}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              title={source.enabled ? 'Disable' : 'Enable'}
            >
              <Power className={cn(
                "w-4 h-4",
                source.enabled ? 'text-green-500' : 'text-muted-foreground'
              )} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            {!source.isOfficial && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                title="Delete"
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>
        
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>{source.pluginCount} plugins</span>
          {source.fetchError ? (
            <span className="text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Error
            </span>
          ) : source.lastFetched ? (
            <span>Updated {new Date(source.lastFetched).toLocaleDateString()}</span>
          ) : (
            <span>Never fetched</span>
          )}
        </div>
        
        {source.fetchError && (
          <p className="mt-2 text-xs text-destructive truncate" title={source.fetchError}>
            {source.fetchError}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Main Marketplace Component
// =============================================================================

export default function Marketplace() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ForgeHookCategory | 'all'>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('browse');
  
  // Dialogs
  const [installDialog, setInstallDialog] = useState<MarketplacePlugin | null>(null);
  const [githubDialog, setGithubDialog] = useState(false);
  const [uploadDialog, setUploadDialog] = useState(false);
  const [addSourceDialog, setAddSourceDialog] = useState(false);
  const [packagePreview, setPackagePreview] = useState<PackageInspectResult | null>(null);
  
  // Form states
  const [githubUrl, setGithubUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [newSource, setNewSource] = useState({
    name: '',
    url: '',
    description: '',
    sourceType: 'http' as 'http' | 'github',
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  // Queries
  const { data: marketplace, isLoading: loadingMarketplace } = useMarketplace({
    category: selectedCategory === 'all' ? undefined : selectedCategory,
    search: search || undefined,
    source: selectedSource === 'all' ? undefined : selectedSource,
  });
  const { data: sourcesData, isLoading: loadingSources } = useRegistrySources();
  const { data: installedData } = useInstalledPlugins();
  
  // Mutations
  const installFromMarketplace = useInstallFromMarketplace();
  const installFromGitHub = useInstallFromGitHub();
  const importPackage = useImportPackage();
  const inspectPackage = useInspectPackage();
  const addSource = useAddSource();
  const deleteSource = useDeleteSource();
  const toggleSource = useToggleSource();
  const refreshSource = useRefreshSource();
  const refreshAllSources = useRefreshAllSources();
  
  const installedIds = new Set(installedData?.plugins.map(p => p.forgehookId) || []);
  
  // Handlers
  const handleInstall = async () => {
    if (!installDialog) return;
    
    try {
      await installFromMarketplace.mutateAsync({
        pluginId: installDialog.id,
        sourceId: installDialog.source.id,
        autoStart: true,
      });
      
      toast({
        title: 'Plugin Installed',
        description: `${installDialog.manifest.name} has been installed and started.`,
      });
      
      setInstallDialog(null);
    } catch (error) {
      toast({
        title: 'Installation Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };
  
  const handleGitHubInstall = async () => {
    if (!githubUrl) return;
    
    try {
      await installFromGitHub.mutateAsync({
        repository: githubUrl,
        autoStart: true,
      });
      
      toast({
        title: 'Plugin Installed',
        description: 'Plugin has been installed from GitHub.',
      });
      
      setGithubDialog(false);
      setGithubUrl('');
    } catch (error) {
      toast({
        title: 'Installation Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };
  
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setSelectedFile(file);
    
    try {
      const result = await inspectPackage.mutateAsync(file);
      setPackagePreview(result);
    } catch (error) {
      toast({
        title: 'Invalid Package',
        description: error instanceof Error ? error.message : 'Could not read package',
        variant: 'destructive',
      });
      setSelectedFile(null);
    }
  };
  
  const handlePackageImport = async () => {
    if (!selectedFile) return;
    
    try {
      await importPackage.mutateAsync({
        file: selectedFile,
        options: { autoStart: true },
      });
      
      toast({
        title: 'Plugin Imported',
        description: `${packagePreview?.manifest.name} has been imported and started.`,
      });
      
      setUploadDialog(false);
      setSelectedFile(null);
      setPackagePreview(null);
    } catch (error) {
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };
  
  const handleAddSource = async () => {
    if (!newSource.name || !newSource.url) return;
    
    try {
      await addSource.mutateAsync({
        name: newSource.name,
        url: newSource.url,
        description: newSource.description,
        sourceType: newSource.sourceType,
      });
      
      toast({
        title: 'Source Added',
        description: `${newSource.name} has been added to your sources.`,
      });
      
      setAddSourceDialog(false);
      setNewSource({ name: '', url: '', description: '', sourceType: 'http' });
    } catch (error) {
      toast({
        title: 'Failed to Add Source',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };
  
  const categories: Array<ForgeHookCategory | 'all'> = [
    'all', 
    'security', 
    'ai', 
    'data', 
    'media', 
    'integration', 
    'utility'
  ];
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Package className="w-8 h-8" />
            ForgeHook Marketplace
          </h1>
          <p className="text-muted-foreground mt-1">
            Discover and install plugins to extend FlowForge
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setGithubDialog(true)}>
            <Github className="w-4 h-4 mr-2" />
            Install from GitHub
          </Button>
          <Button variant="outline" onClick={() => setUploadDialog(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import Package
          </Button>
        </div>
      </div>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="browse">Browse Plugins</TabsTrigger>
          <TabsTrigger value="sources">
            Registry Sources
            {sourcesData && (
              <Badge variant="secondary" className="ml-2">{sourcesData.total}</Badge>
            )}
          </TabsTrigger>
        </TabsList>
        
        {/* Browse Tab */}
        <TabsContent value="browse" className="space-y-6">
          {/* Search and Filters */}
          <div className="flex gap-4 flex-wrap">
            <div className="relative flex-1 min-w-50 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search plugins..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Select value={selectedSource} onValueChange={setSelectedSource}>
              <SelectTrigger className="w-45">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {sourcesData?.sources
                  .filter(s => s.enabled)
                  .map(source => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            
            <div className="flex gap-2">
              {categories.map((category) => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                >
                  {category === 'all' ? 'All' : CATEGORY_INFO[category].label}
                </Button>
              ))}
            </div>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{marketplace?.total || 0}</div>
                <p className="text-sm text-muted-foreground">Available Plugins</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{installedData?.total || 0}</div>
                <p className="text-sm text-muted-foreground">Installed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {installedData?.plugins.filter(p => p.status === 'running').length || 0}
                </div>
                <p className="text-sm text-muted-foreground">Running</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{Array.isArray(marketplace?.sources) ? marketplace.sources.length : 0}</div>
                <p className="text-sm text-muted-foreground">Active Sources</p>
              </CardContent>
            </Card>
          </div>
          
          {/* Plugin Grid */}
          <div>
            <h2 className="text-xl font-semibold mb-4">
              {selectedCategory === 'all' ? 'All Plugins' : `${CATEGORY_INFO[selectedCategory].label} Plugins`}
              <span className="text-muted-foreground font-normal ml-2">
                ({marketplace?.plugins.length || 0})
              </span>
            </h2>
            
            {loadingMarketplace ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-muted rounded-lg" />
                        <div className="space-y-2">
                          <div className="h-4 w-24 bg-muted rounded" />
                          <div className="h-3 w-16 bg-muted rounded" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="h-12 bg-muted rounded" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : !marketplace?.plugins.length ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold">No plugins found</h3>
                  <p className="text-muted-foreground">
                    Try adjusting your search or add more registry sources
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {marketplace.plugins.map((plugin) => (
                  <PluginCard
                    key={`${plugin.source.id}-${plugin.id}`}
                    plugin={plugin}
                    isInstalled={installedIds.has(plugin.id)}
                    onInstall={setInstallDialog}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>
        
        {/* Sources Tab */}
        <TabsContent value="sources" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Registry Sources</h2>
              <p className="text-sm text-muted-foreground">
                Manage where FlowForge looks for plugins
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => refreshAllSources.mutate()}
                disabled={refreshAllSources.isPending}
              >
                <RefreshCw className={cn(
                  "w-4 h-4 mr-2",
                  refreshAllSources.isPending && "animate-spin"
                )} />
                Refresh All
              </Button>
              <Button onClick={() => setAddSourceDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Source
              </Button>
            </div>
          </div>
          
          {loadingSources ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-muted rounded-lg" />
                      <div className="space-y-2 flex-1">
                        <div className="h-4 w-32 bg-muted rounded" />
                        <div className="h-3 w-48 bg-muted rounded" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sourcesData?.sources.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  onToggle={() => toggleSource.mutate(source.id)}
                  onRefresh={() => refreshSource.mutate(source.id)}
                  onDelete={() => {
                    if (confirm(`Delete source "${source.name}"?`)) {
                      deleteSource.mutate(source.id);
                    }
                  }}
                />
              ))}
            </div>
          )}
          
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Settings className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">Add Custom Sources</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add your own registry URLs or GitHub repositories to discover more plugins
              </p>
              <Button variant="outline" onClick={() => setAddSourceDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Source
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Install Confirmation Dialog */}
      <Dialog open={!!installDialog} onOpenChange={() => setInstallDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install {installDialog?.manifest.name}?</DialogTitle>
            <DialogDescription>
              This will download and start the plugin container.
            </DialogDescription>
          </DialogHeader>
          
          {installDialog && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  {(() => {
                    const Icon = getIcon(installDialog.manifest.icon);
                    return <Icon className="w-8 h-8 text-primary" />;
                  })()}
                </div>
                <div>
                  <h4 className="font-semibold">{installDialog.manifest.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    v{installDialog.manifest.version} • {installDialog.source.name}
                  </p>
                </div>
              </div>
              
              <p className="text-sm">{installDialog.manifest.description}</p>
              
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Port:</span>
                  <span>{installDialog.manifest.port}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Memory:</span>
                  <span>{installDialog.manifest.resources?.memory || '512m'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dependencies:</span>
                  <span>{installDialog.manifest.dependencies?.services?.join(', ') || 'None'}</span>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallDialog(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleInstall} 
              disabled={installFromMarketplace.isPending}
            >
              {installFromMarketplace.isPending ? 'Installing...' : 'Install & Start'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* GitHub Install Dialog */}
      <Dialog open={githubDialog} onOpenChange={setGithubDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Github className="w-5 h-5" />
              Install from GitHub
            </DialogTitle>
            <DialogDescription>
              Enter a GitHub repository URL or owner/repo to install a ForgeHook plugin.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="github-url">Repository</Label>
              <Input
                id="github-url"
                placeholder="owner/repo or https://github.com/owner/repo"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The repository must contain a forgehook.json manifest file
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setGithubDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleGitHubInstall}
              disabled={!githubUrl || installFromGitHub.isPending}
            >
              {installFromGitHub.isPending ? 'Installing...' : 'Install'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Upload Package Dialog */}
      <Dialog open={uploadDialog} onOpenChange={(open) => {
        setUploadDialog(open);
        if (!open) {
          setSelectedFile(null);
          setPackagePreview(null);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Import Package
            </DialogTitle>
            <DialogDescription>
              Upload a .fhk package file to install a plugin offline.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".fhk"
              onChange={handleFileSelect}
              className="hidden"
              aria-label="Select ForgeHook package file"
            />
            
            {!packagePreview ? (
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="font-medium">Click to select a .fhk file</p>
                <p className="text-sm text-muted-foreground">or drag and drop</p>
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-primary/10">
                      {(() => {
                        const Icon = getIcon(packagePreview.manifest.icon);
                        return <Icon className="w-8 h-8 text-primary" />;
                      })()}
                    </div>
                    <div>
                      <h4 className="font-semibold">{packagePreview.manifest.name}</h4>
                      <p className="text-sm text-muted-foreground">v{packagePreview.manifest.version}</p>
                    </div>
                    {packagePreview.installed && (
                      <Badge variant="secondary" className="ml-auto">Already Installed</Badge>
                    )}
                  </div>
                  
                  <p className="text-sm">{packagePreview.manifest.description}</p>
                  
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Image Size:</span>
                      <span>{(packagePreview.imageSize / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedFile(null);
                      setPackagePreview(null);
                    }}
                  >
                    Select Different File
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handlePackageImport}
              disabled={!packagePreview || packagePreview.installed || importPackage.isPending}
            >
              {importPackage.isPending ? 'Importing...' : 'Import & Start'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Add Source Dialog */}
      <Dialog open={addSourceDialog} onOpenChange={setAddSourceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Registry Source</DialogTitle>
            <DialogDescription>
              Add a new source to discover more ForgeHook plugins.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="source-name">Name</Label>
              <Input
                id="source-name"
                placeholder="My Custom Registry"
                value={newSource.name}
                onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="source-type">Type</Label>
              <Select
                value={newSource.sourceType}
                onValueChange={(value: 'http' | 'github') => 
                  setNewSource({ ...newSource, sourceType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP URL</SelectItem>
                  <SelectItem value="github">GitHub Repository</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="source-url">
                {newSource.sourceType === 'github' ? 'GitHub URL' : 'Registry URL'}
              </Label>
              <Input
                id="source-url"
                placeholder={
                  newSource.sourceType === 'github'
                    ? 'https://github.com/owner/repo'
                    : 'https://example.com/forgehooks-registry.json'
                }
                value={newSource.url}
                onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="source-description">Description (optional)</Label>
              <Input
                id="source-description"
                placeholder="Description of this registry"
                value={newSource.description}
                onChange={(e) => setNewSource({ ...newSource, description: e.target.value })}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSourceDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddSource}
              disabled={!newSource.name || !newSource.url || addSource.isPending}
            >
              {addSource.isPending ? 'Adding...' : 'Add Source'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
