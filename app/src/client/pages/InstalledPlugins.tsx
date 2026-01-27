import { useState } from 'react';
import { 
  Package, 
  Play, 
  Square, 
  RotateCcw, 
  Trash2, 
  Settings, 
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Terminal,
  MoreVertical,
  Search,
  Download,
  Upload,
  RefreshCw,
  History,
  ArrowDownToLine,
  Container,
  Code2,
  Cpu,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { 
  useInstalledPlugins, 
  usePluginLogs,
  useStartPlugin,
  useStopPlugin,
  useRestartPlugin,
  useUninstallPlugin,
  useUpdatePlugin,
  useUploadPluginUpdate,
  useRollbackPlugin,
  usePluginUpdateHistory,
} from '@/hooks/usePlugins';
import { InstalledPlugin, PluginStatus, CATEGORY_INFO } from '@/types/forgehook';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';

const statusConfig: Record<PluginStatus, { icon: React.ElementType; color: string; label: string }> = {
  running: { icon: CheckCircle2, color: 'text-green-500', label: 'Running' },
  stopped: { icon: Square, color: 'text-gray-500', label: 'Stopped' },
  starting: { icon: Clock, color: 'text-blue-500', label: 'Starting' },
  stopping: { icon: Clock, color: 'text-orange-500', label: 'Stopping' },
  error: { icon: AlertCircle, color: 'text-red-500', label: 'Error' },
  installing: { icon: Download, color: 'text-blue-500', label: 'Installing' },
  installed: { icon: CheckCircle2, color: 'text-green-500', label: 'Installed' },
  uninstalling: { icon: Trash2, color: 'text-red-500', label: 'Uninstalling' },
};

function PluginStatusBadge({ status }: { status: PluginStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  
  return (
    <Badge 
      variant="outline" 
      className={cn(
        'gap-1',
        status === 'running' && 'border-green-500/50 bg-green-500/10',
        status === 'stopped' && 'border-gray-500/50 bg-gray-500/10',
        status === 'error' && 'border-red-500/50 bg-red-500/10',
        (status === 'starting' || status === 'installing') && 'border-blue-500/50 bg-blue-500/10',
      )}
    >
      <Icon className={cn('w-3 h-3', config.color)} />
      <span className={config.color}>{config.label}</span>
    </Badge>
  );
}

function PluginRow({ plugin }: { plugin: InstalledPlugin }) {
  const [showLogs, setShowLogs] = useState(false);
  const [showUninstall, setShowUninstall] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [updateTab, setUpdateTab] = useState<'online' | 'upload'>('online');
  const [bundleUrl, setBundleUrl] = useState('');
  const [uploadCode, setUploadCode] = useState('');
  
  const { toast } = useToast();
  const { data: logs } = usePluginLogs(plugin.id, showLogs);
  const { data: updateHistory } = usePluginUpdateHistory(plugin.id, showHistory);
  const startMutation = useStartPlugin();
  const stopMutation = useStopPlugin();
  const restartMutation = useRestartPlugin();
  const uninstallMutation = useUninstallPlugin();
  const updateMutation = useUpdatePlugin();
  const uploadMutation = useUploadPluginUpdate();
  const rollbackMutation = useRollbackPlugin();
  
  const isActioning = startMutation.isPending || stopMutation.isPending || 
    restartMutation.isPending || uninstallMutation.isPending ||
    updateMutation.isPending || uploadMutation.isPending || rollbackMutation.isPending;
  
  const categoryInfo = plugin.manifest?.category ? CATEGORY_INFO[plugin.manifest.category] : null;
  const pluginName = plugin.manifest?.name || plugin.name || plugin.forgehookId;
  
  // Check if this is an embedded or core plugin (no container management needed)
  const isEmbedded = plugin.runtime === 'embedded' || plugin.runtime === 'core';
  const isCore = plugin.runtime === 'core';
  
  const handleStart = async () => {
    try {
      await startMutation.mutateAsync(plugin.id);
      toast({ title: 'Plugin started', description: `${pluginName} is now running.` });
    } catch (error) {
      toast({ 
        title: 'Failed to start', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    }
  };
  
  const handleStop = async () => {
    try {
      await stopMutation.mutateAsync(plugin.id);
      toast({ title: 'Plugin stopped', description: `${pluginName} has been stopped.` });
    } catch (error) {
      toast({ 
        title: 'Failed to stop', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    }
  };
  
  const handleRestart = async () => {
    try {
      await restartMutation.mutateAsync(plugin.id);
      toast({ title: 'Plugin restarted', description: `${pluginName} has been restarted.` });
    } catch (error) {
      toast({ 
        title: 'Failed to restart', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    }
  };
  
  const handleUninstall = async () => {
    try {
      await uninstallMutation.mutateAsync(plugin.id);
      toast({ title: 'Plugin uninstalled', description: `${pluginName} has been removed.` });
      setShowUninstall(false);
    } catch (error) {
      toast({ 
        title: 'Failed to uninstall', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    }
  };
  
  const handleOnlineUpdate = async () => {
    if (!bundleUrl && isEmbedded) {
      toast({ title: 'URL required', description: 'Please enter a bundle URL', variant: 'destructive' });
      return;
    }
    try {
      await updateMutation.mutateAsync({ 
        pluginId: plugin.id, 
        options: isEmbedded ? { bundleUrl } : { imageTag: bundleUrl } // bundleUrl field used for both
      });
      toast({ title: 'Plugin updated', description: `${pluginName} has been updated.` });
      setShowUpdate(false);
      setBundleUrl('');
    } catch (error) {
      toast({ 
        title: 'Update failed', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    }
  };
  
  const handleUploadUpdate = async () => {
    if (!uploadCode) {
      toast({ title: 'Code required', description: 'Please paste the plugin code', variant: 'destructive' });
      return;
    }
    try {
      await uploadMutation.mutateAsync({ 
        pluginId: plugin.id, 
        options: { moduleCode: uploadCode }
      });
      toast({ title: 'Plugin updated', description: `${pluginName} has been updated via upload.` });
      setShowUpdate(false);
      setUploadCode('');
    } catch (error) {
      toast({ 
        title: 'Upload failed', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    }
  };
  
  const handleRollback = async () => {
    try {
      await rollbackMutation.mutateAsync(plugin.id);
      toast({ title: 'Plugin rolled back', description: `${pluginName} has been rolled back to previous version.` });
      setShowHistory(false);
    } catch (error) {
      toast({ 
        title: 'Rollback failed', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    }
  };
  
  return (
    <>
      <Card className="bg-white/5 border-white/10 hover:bg-white/[0.07] transition-all">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            {/* Plugin Info */}
            <div className="flex items-center gap-4 flex-1">
              <div className={cn(
                "p-2 rounded-lg",
                categoryInfo ? `bg-${categoryInfo.color.replace('text-', '')}/10` : 'bg-primary/10'
              )}>
                <Package className={cn("w-6 h-6", categoryInfo?.color || 'text-primary')} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{pluginName}</h3>
                  <span className="text-xs text-muted-foreground">v{plugin.manifest?.version || plugin.version || '1.0.0'}</span>
                  {plugin.runtime && (
                    <Badge 
                      variant="outline" 
                      className={cn(
                        'gap-1 text-xs px-1.5 py-0',
                        plugin.runtime === 'container' 
                          ? 'border-blue-500/50 bg-blue-500/10 text-blue-600' 
                          : plugin.runtime === 'core'
                          ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-600'
                          : 'border-purple-500/50 bg-purple-500/10 text-purple-600'
                      )}
                      title={plugin.runtime === 'container' 
                        ? 'Container: Runs in isolated Docker container' 
                        : plugin.runtime === 'core'
                        ? 'Core: Built into FlowForge - always available'
                        : 'Embedded: Runs in-process for lower latency'}
                    >
                      {plugin.runtime === 'container' ? (
                        <Container className="w-3 h-3" />
                      ) : plugin.runtime === 'core' ? (
                        <Cpu className="w-3 h-3" />
                      ) : (
                        <Code2 className="w-3 h-3" />
                      )}
                      {plugin.runtime === 'container' ? 'Container' : plugin.runtime === 'core' ? 'Core' : 'Embedded'}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {plugin.manifest?.description || plugin.description || 'No description'}
                </p>
              </div>
            </div>
            
            {/* Status & Actions */}
            <div className="flex items-center gap-4">
              <div className="text-right text-sm">
                {plugin.assignedPort && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <span>Port: {plugin.assignedPort}</span>
                    {plugin.status === 'running' && (
                      <a 
                        href={`http://${plugin.health?.host || 'localhost'}:${plugin.assignedPort}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                        title="Open in browser"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
                {plugin.installedAt && (
                  <div className="text-xs text-muted-foreground">
                    Installed {formatDistanceToNow(new Date(plugin.installedAt), { addSuffix: true })}
                  </div>
                )}
              </div>
              
              <PluginStatusBadge status={plugin.status} />
              
              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                {plugin.status === 'running' ? (
                  <>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={handleStop}
                      disabled={isActioning}
                      title="Stop"
                    >
                      <Square className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={handleRestart}
                      disabled={isActioning}
                      title="Restart"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </>
                ) : plugin.status === 'stopped' || plugin.status === 'error' ? (
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={handleStart}
                    disabled={isActioning}
                    title="Start"
                  >
                    <Play className="w-4 h-4" />
                  </Button>
                ) : null}
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!isCore && (
                      <>
                        <DropdownMenuItem onClick={() => setShowUpdate(true)}>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Update Plugin
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowHistory(true)}>
                          <History className="w-4 h-4 mr-2" />
                          Update History
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    {!isCore && (
                      <DropdownMenuItem onClick={() => setShowLogs(true)}>
                        <Terminal className="w-4 h-4 mr-2" />
                        View Logs
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem>
                      <Settings className="w-4 h-4 mr-2" />
                      Configure
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Activity className="w-4 h-4 mr-2" />
                      Metrics
                    </DropdownMenuItem>
                    {!isCore && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-red-600"
                          onClick={() => setShowUninstall(true)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Uninstall
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
          
          {/* Health Info */}
          {plugin.health && plugin.status === 'running' && (
            <div className="mt-3 pt-3 border-t flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Activity className={cn(
                  "w-3 h-3",
                  plugin.health.healthy ? 'text-green-500' : 'text-red-500'
                )} />
                {plugin.health.healthy ? 'Healthy' : 'Unhealthy'}
              </span>
              {plugin.health.lastCheck && (
                <span>
                  Last check: {formatDistanceToNow(new Date(plugin.health.lastCheck), { addSuffix: true })}
                </span>
              )}
              {plugin.health.message && (
                <span className="text-amber-500">{plugin.health.message}</span>
              )}
            </div>
          )}
          
          {/* Error Message */}
          {plugin.error && (
            <div className="mt-3 pt-3 border-t">
              <div className="flex items-start gap-2 text-sm text-red-500">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{plugin.error}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Logs Dialog */}
      <Dialog open={showLogs} onOpenChange={setShowLogs}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Logs: {pluginName}</DialogTitle>
            <DialogDescription>
              Container: {plugin.containerId?.substring(0, 12) || 'N/A'}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-125 font-mono text-xs bg-black text-green-400 p-4 rounded-lg">
            {logs && logs.length > 0 ? (
              logs.map((line: string, i: number) => (
                <div key={i} className="whitespace-pre-wrap">
                  {line}
                </div>
              ))
            ) : (
              <div>No logs available</div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
      
      {/* Uninstall Confirmation */}
      <Dialog open={showUninstall} onOpenChange={setShowUninstall}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uninstall {pluginName}?</DialogTitle>
            <DialogDescription>
              This will stop and remove the plugin container. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowUninstall(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleUninstall}
              disabled={uninstallMutation.isPending}
            >
              {uninstallMutation.isPending ? 'Uninstalling...' : 'Uninstall'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Update Dialog */}
      <Dialog open={showUpdate} onOpenChange={setShowUpdate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update {pluginName}</DialogTitle>
            <DialogDescription>
              {isEmbedded 
                ? 'Update the embedded plugin code from URL or paste code directly.'
                : 'Update the container plugin by specifying a new image tag.'}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={updateTab} onValueChange={(v) => setUpdateTab(v as 'online' | 'upload')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="online">
                <Download className="w-4 h-4 mr-2" />
                Online
              </TabsTrigger>
              <TabsTrigger value="upload" disabled={!isEmbedded}>
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="online" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="bundleUrl">
                  {isEmbedded ? 'Bundle URL' : 'Image Tag'}
                </Label>
                <Input
                  id="bundleUrl"
                  placeholder={isEmbedded 
                    ? 'https://example.com/plugin-v2.js' 
                    : 'flowforge/my-plugin:v2.0.0'}
                  value={bundleUrl}
                  onChange={(e) => setBundleUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {isEmbedded 
                    ? 'Enter the URL to fetch the updated plugin bundle from.'
                    : 'Enter the new Docker image tag to pull.'}
                </p>
              </div>
              
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowUpdate(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleOnlineUpdate}
                  disabled={updateMutation.isPending || !bundleUrl}
                >
                  {updateMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="w-4 h-4 mr-2" />
                      Update
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="upload" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="uploadCode">Plugin Code</Label>
                <Textarea
                  id="uploadCode"
                  placeholder="// Paste your plugin JavaScript code here..."
                  value={uploadCode}
                  onChange={(e) => setUploadCode(e.target.value)}
                  className="font-mono text-sm h-48"
                />
                <p className="text-xs text-muted-foreground">
                  Paste the complete plugin module code. Useful for offline updates.
                </p>
              </div>
              
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowUpdate(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleUploadUpdate}
                  disabled={uploadMutation.isPending || !uploadCode}
                >
                  {uploadMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload & Update
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      
      {/* Update History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update History: {pluginName}</DialogTitle>
            <DialogDescription>
              View version history and rollback to previous versions.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Current Version Info */}
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Current Version</div>
                  <div className="text-lg font-bold">
                    {updateHistory?.currentVersion || plugin.manifest?.version || '1.0.0'}
                  </div>
                </div>
                {updateHistory?.canRollback && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRollback}
                    disabled={rollbackMutation.isPending}
                  >
                    {rollbackMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Rolling back...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Rollback to {updateHistory.previousVersion}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
            
            {/* History List */}
            <ScrollArea className="h-64">
              {updateHistory?.history && updateHistory.history.length > 0 ? (
                <div className="space-y-2">
                  {updateHistory.history.map((entry) => (
                    <div key={entry.id} className="p-3 border rounded-lg text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {entry.from_version} → {entry.to_version}
                        </span>
                        <Badge variant="outline">{entry.action}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No update history available
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function InstalledPlugins() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PluginStatus | 'all'>('all');
  
  const { data, isLoading } = useInstalledPlugins();
  
  // Filter plugins
  const filteredPlugins = data?.plugins.filter(plugin => {
    const pluginName = plugin.manifest?.name || plugin.name || plugin.forgehookId || '';
    const pluginDesc = plugin.manifest?.description || plugin.description || '';
    const matchesSearch = search === '' ||
      pluginName.toLowerCase().includes(search.toLowerCase()) ||
      pluginDesc.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || plugin.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }) || [];
  
  const runningCount = data?.plugins.filter(p => p.status === 'running').length || 0;
  const stoppedCount = data?.plugins.filter(p => p.status === 'stopped').length || 0;
  const errorCount = data?.plugins.filter(p => p.status === 'error').length || 0;
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Package className="w-8 h-8" />
            Installed Plugins
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your ForgeHook plugins
          </p>
        </div>
        <Button asChild>
          <Link to="/marketplace">
            <Download className="w-4 h-4 mr-2" />
            Browse Marketplace
          </Link>
        </Button>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-white">{data?.total || 0}</div>
            <p className="text-sm text-gray-400">Total Plugins</p>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-emerald-400">{runningCount}</div>
            <p className="text-sm text-gray-400">Running</p>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-gray-400">{stoppedCount}</div>
            <p className="text-sm text-gray-400">Stopped</p>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-400">{errorCount}</div>
            <p className="text-sm text-gray-400">Errors</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Search and Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search installed plugins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as PluginStatus | 'all')}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="running">Running</TabsTrigger>
            <TabsTrigger value="stopped">Stopped</TabsTrigger>
            <TabsTrigger value="error">Error</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      
      {/* Plugin List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse bg-white/5 border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-muted rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-muted rounded" />
                    <div className="h-3 w-64 bg-muted rounded" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredPlugins.length === 0 ? (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="py-12 text-center">
            <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold">No plugins found</h3>
            <p className="text-muted-foreground mb-4">
              {data?.total === 0 
                ? "You haven't installed any plugins yet." 
                : "No plugins match your search criteria."}
            </p>
            {data?.total === 0 && (
              <Button asChild>
                <Link to="/marketplace">
                  Browse Marketplace
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredPlugins.map((plugin) => (
            <PluginRow key={plugin.id} plugin={plugin} />
          ))}
        </div>
      )}
    </div>
  );
}
