import { useState, useMemo } from 'react';
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Calendar,
  Shield,
  Globe,
  Zap,
  BarChart3,
  Loader2,
  AlertTriangle,
  Clock,
  Filter,
  Search,
  MoreVertical,
  Edit,
  Power,
  PowerOff,
  X,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { useToast } from '../hooks/use-toast';
import {
  useApiKeys,
  useCreateApiKey,
  useUpdateApiKey,
  useDeleteApiKey,
  useRotateApiKey,
  useApiKeyUsage,
  useAvailableScopes,
  ApiKey,
  ApiKeyWithPlainKey,
  CreateApiKeyInput,
  UpdateApiKeyInput,
} from '../hooks/useApiKeys';
import { cn } from '../lib/utils';

// =============================================================================
// Helper Components
// =============================================================================

function ScopeSelector({
  selectedScopes,
  onScopesChange,
}: {
  selectedScopes: string[];
  onScopesChange: (scopes: string[]) => void;
}) {
  const { data: scopesData, isLoading } = useAvailableScopes();
  const scopes = useMemo(() => scopesData?.scopes || [], [scopesData?.scopes]);

  // Group scopes by category
  const groupedScopes = useMemo(() => {
    const groups: Record<string, typeof scopes> = {};
    scopes.forEach((scope) => {
      if (!groups[scope.category]) {
        groups[scope.category] = [];
      }
      groups[scope.category].push(scope);
    });
    return groups;
  }, [scopes]);

  const toggleScope = (scope: string) => {
    if (selectedScopes.includes(scope)) {
      onScopesChange(selectedScopes.filter((s) => s !== scope));
    } else {
      onScopesChange([...selectedScopes, scope]);
    }
  };

  const selectAll = () => {
    onScopesChange(scopes.map((s) => s.scope));
  };

  const clearAll = () => {
    onScopesChange([]);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading scopes...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Scopes</Label>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
            Select All
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
            Clear
          </Button>
        </div>
      </div>

      <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
        {Object.entries(groupedScopes).map(([category, categoryScopes]) => (
          <div key={category}>
            <h4 className="text-sm font-medium text-muted-foreground mb-2 capitalize">
              {category.replace(/_/g, ' ')}
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {categoryScopes.map((scope) => (
                <label
                  key={scope.scope}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors',
                    selectedScopes.includes(scope.scope)
                      ? 'bg-primary/10 border-primary'
                      : 'hover:bg-muted'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope.scope)}
                    onChange={() => toggleScope(scope.scope)}
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center',
                      selectedScopes.includes(scope.scope)
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-input'
                    )}
                  >
                    {selectedScopes.includes(scope.scope) && <Check className="h-3 w-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono truncate">{scope.scope}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {scope.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedScopes.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-2 border-t">
          {selectedScopes.map((scope) => (
            <Badge key={scope} variant="secondary" className="text-xs">
              {scope}
              <button
                type="button"
                onClick={() => toggleScope(scope)}
                className="ml-1 hover:text-destructive"
                title={`Remove ${scope}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function IpAllowlistEditor({
  ips,
  onIpsChange,
}: {
  ips: string[];
  onIpsChange: (ips: string[]) => void;
}) {
  const [newIp, setNewIp] = useState('');
  const [error, setError] = useState('');

  const addIp = () => {
    const ip = newIp.trim();
    if (!ip) return;

    // Basic validation for IP or CIDR
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}(\/\d{1,3})?$/;

    if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
      setError('Invalid IP address or CIDR notation');
      return;
    }

    if (ips.includes(ip)) {
      setError('IP already in list');
      return;
    }

    setError('');
    onIpsChange([...ips, ip]);
    setNewIp('');
  };

  const removeIp = (ip: string) => {
    onIpsChange(ips.filter((i) => i !== ip));
  };

  return (
    <div className="space-y-3">
      <Label>IP Allowlist (optional)</Label>
      <p className="text-xs text-muted-foreground">
        Restrict API key usage to specific IP addresses. Leave empty to allow all IPs.
        Supports CIDR notation (e.g., 192.168.1.0/24).
      </p>

      <div className="flex gap-2">
        <Input
          value={newIp}
          onChange={(e) => setNewIp(e.target.value)}
          placeholder="192.168.1.1 or 10.0.0.0/8"
          className="flex-1"
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addIp())}
        />
        <Button type="button" onClick={addIp} variant="outline">
          Add
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {ips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ips.map((ip) => (
            <Badge key={ip} variant="outline" className="font-mono">
              {ip}
              <button
                type="button"
                onClick={() => removeIp(ip)}
                className="ml-1 hover:text-destructive"
                title={`Remove ${ip}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function KeyRevealDialog({
  open,
  onOpenChange,
  keyData,
  isRotation = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyData: ApiKeyWithPlainKey | null;
  isRotation?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const copyKey = () => {
    if (keyData?.key) {
      navigator.clipboard.writeText(keyData.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const maskedKey = keyData?.key
    ? `${keyData.key.slice(0, 12)}${'•'.repeat(48)}${keyData.key.slice(-8)}`
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            {isRotation ? 'Key Rotated Successfully' : 'API Key Created'}
          </DialogTitle>
          <DialogDescription>
            Make sure to copy your API key now. You won't be able to see it again!
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Important</AlertTitle>
          <AlertDescription>
            This is the only time your full API key will be displayed. Store it securely.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div>
            <Label className="text-sm">Key Name</Label>
            <p className="font-medium">{keyData?.name}</p>
          </div>

          <div>
            <Label className="text-sm">API Key</Label>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm break-all">
                {showKey ? keyData?.key : maskedKey}
              </div>
              <div className="flex flex-col gap-1">
                <Button variant="ghost" size="icon" onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={copyKey}>
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>I've saved my key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsageStatsPanel({ keyId }: { keyId: string }) {
  const { data, isLoading, error } = useApiKeyUsage(keyId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Failed to load usage statistics</AlertDescription>
      </Alert>
    );
  }

  const usage = data?.usage;

  if (!usage) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No usage data available
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold">{usage.totalRequests.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground">Total Requests</div>
        </div>
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold">{usage.requestsToday.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground">Today</div>
        </div>
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold">{usage.requestsThisMinute}</div>
          <div className="text-sm text-muted-foreground">This Minute</div>
        </div>
      </div>

      {/* Last Used */}
      {usage.lastUsedAt && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          Last used: {new Date(usage.lastUsedAt).toLocaleString()}
        </div>
      )}

      {/* Top Endpoints */}
      {usage.topEndpoints && usage.topEndpoints.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Top Endpoints</h4>
          <div className="space-y-2">
            {usage.topEndpoints.slice(0, 5).map((ep, index) => (
              <div
                key={index}
                className="flex items-center justify-between text-sm"
              >
                <span className="font-mono text-xs truncate flex-1">
                  {ep.endpoint}
                </span>
                <Badge variant="secondary">{ep.count.toLocaleString()}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Requests by Day - Simple bar visualization */}
      {usage.requestsByDay && usage.requestsByDay.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Last 7 Days</h4>
          <div className="space-y-1">
            {usage.requestsByDay.slice(0, 7).map((day, index) => {
              const maxCount = Math.max(...usage.requestsByDay.map((d) => d.count));
              const widthPercent = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
              return (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <span className="w-20 text-muted-foreground">
                    {new Date(day.date).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                    <div
                      className={cn(
                        'h-full bg-primary/60 rounded-sm transition-all',
                        widthPercent === 0 && 'w-0',
                        widthPercent > 0 && widthPercent <= 10 && 'w-[10%]',
                        widthPercent > 10 && widthPercent <= 20 && 'w-[20%]',
                        widthPercent > 20 && widthPercent <= 30 && 'w-[30%]',
                        widthPercent > 30 && widthPercent <= 40 && 'w-[40%]',
                        widthPercent > 40 && widthPercent <= 50 && 'w-[50%]',
                        widthPercent > 50 && widthPercent <= 60 && 'w-[60%]',
                        widthPercent > 60 && widthPercent <= 70 && 'w-[70%]',
                        widthPercent > 70 && widthPercent <= 80 && 'w-[80%]',
                        widthPercent > 80 && widthPercent <= 90 && 'w-[90%]',
                        widthPercent > 90 && 'w-full'
                      )}
                    />
                  </div>
                  <span className="w-12 text-right">{day.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function AdminApiKeys() {
  const { toast } = useToast();
  const { data: keysData, isLoading, error } = useApiKeys();
  const createKey = useCreateApiKey();
  const updateKey = useUpdateApiKey();
  const deleteKey = useDeleteApiKey();
  const rotateKey = useRotateApiKey();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'expired'>('all');

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [deletingKey, setDeletingKey] = useState<ApiKey | null>(null);
  const [rotatingKey, setRotatingKey] = useState<ApiKey | null>(null);
  const [viewingUsage, setViewingUsage] = useState<ApiKey | null>(null);
  const [newKeyData, setNewKeyData] = useState<ApiKeyWithPlainKey | null>(null);
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);
  const [isRotationKey, setIsRotationKey] = useState(false);

  // Create form
  const [createForm, setCreateForm] = useState<CreateApiKeyInput>({
    name: '',
    scopes: [],
    allowedIps: [],
  });

  // Edit form
  const [editForm, setEditForm] = useState<UpdateApiKeyInput>({});

  // Filter keys
  const allKeys = keysData?.keys;
  const filteredKeys = useMemo(() => {
    if (!allKeys) return [];

    return allKeys.filter((key) => {
      // Search filter
      if (
        searchQuery &&
        !key.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !key.prefix.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }

      // Status filter
      const now = new Date();
      const isExpired = key.expiresAt && new Date(key.expiresAt) < now;

      switch (statusFilter) {
        case 'active':
          return key.isActive && !isExpired;
        case 'inactive':
          return !key.isActive;
        case 'expired':
          return isExpired;
        default:
          return true;
      }
    });
  }, [allKeys, searchQuery, statusFilter]);

  // Handlers
  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      toast({ title: 'Error', description: 'Name is required', variant: 'destructive' });
      return;
    }

    try {
      const result = await createKey.mutateAsync({
        ...createForm,
        expiresAt: createForm.expiresAt || undefined,
        rateLimitPerMinute: createForm.rateLimitPerMinute || undefined,
        rateLimitPerDay: createForm.rateLimitPerDay || undefined,
      });

      setNewKeyData(result.key);
      setIsRotationKey(false);
      setShowNewKeyDialog(true);
      setCreateDialogOpen(false);
      setCreateForm({ name: '', scopes: [], allowedIps: [] });
      toast({ title: 'Success', description: 'API key created successfully' });
    } catch (err) {
      toast({
        title: 'Error',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  const handleEdit = async () => {
    if (!editingKey) return;

    try {
      await updateKey.mutateAsync({ keyId: editingKey.id, input: editForm });
      setEditingKey(null);
      setEditForm({});
      toast({ title: 'Success', description: 'API key updated successfully' });
    } catch (err) {
      toast({
        title: 'Error',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingKey) return;

    try {
      await deleteKey.mutateAsync(deletingKey.id);
      setDeletingKey(null);
      toast({ title: 'Success', description: 'API key deleted successfully' });
    } catch (err) {
      toast({
        title: 'Error',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  const handleRotate = async () => {
    if (!rotatingKey) return;

    try {
      const result = await rotateKey.mutateAsync(rotatingKey.id);
      setRotatingKey(null);
      setNewKeyData(result.key);
      setIsRotationKey(true);
      setShowNewKeyDialog(true);
      toast({ title: 'Success', description: 'API key rotated successfully' });
    } catch (err) {
      toast({
        title: 'Error',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (key: ApiKey) => {
    try {
      await updateKey.mutateAsync({
        keyId: key.id,
        input: { isActive: !key.isActive },
      });
      toast({
        title: 'Success',
        description: `API key ${key.isActive ? 'deactivated' : 'activated'}`,
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  const openEditDialog = (key: ApiKey) => {
    setEditingKey(key);
    setEditForm({
      name: key.name,
      scopes: key.scopes,
      expiresAt: key.expiresAt,
      allowedIps: key.allowedIps,
      rateLimitPerMinute: key.rateLimitPerMinute,
      rateLimitPerDay: key.rateLimitPerDay,
      isActive: key.isActive,
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load API keys: {(error as Error).message}
        </AlertDescription>
      </Alert>
    );
  }

  const keys = filteredKeys;
  const now = new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="w-6 h-6" />
            API Key Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Create and manage API keys with fine-grained access control
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create API Key
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or prefix..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-40">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Keys</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{keysData?.keys.length || 0}</div>
            <div className="text-sm text-muted-foreground">Total Keys</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {keysData?.keys.filter((k) => k.isActive && (!k.expiresAt || new Date(k.expiresAt) > now)).length || 0}
            </div>
            <div className="text-sm text-muted-foreground">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">
              {keysData?.keys.filter((k) => k.expiresAt && new Date(k.expiresAt) < now).length || 0}
            </div>
            <div className="text-sm text-muted-foreground">Expired</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-muted-foreground">
              {keysData?.keys.filter((k) => !k.isActive).length || 0}
            </div>
            <div className="text-sm text-muted-foreground">Inactive</div>
          </CardContent>
        </Card>
      </div>

      {/* Keys List */}
      <div className="space-y-4">
        {keys.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Key className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No API keys found</h3>
              <p className="text-muted-foreground mt-1">
                {searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Create your first API key to get started'}
              </p>
              {!searchQuery && statusFilter === 'all' && (
                <Button onClick={() => setCreateDialogOpen(true)} className="mt-4">
                  <Plus className="w-4 h-4 mr-2" />
                  Create API Key
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          keys.map((key) => {
            const isExpired = key.expiresAt && new Date(key.expiresAt) < now;
            const expiresIn = key.expiresAt
              ? Math.ceil((new Date(key.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
              : null;

            return (
              <Card
                key={key.id}
                className={cn(
                  'transition-colors',
                  !key.isActive && 'opacity-60',
                  isExpired && 'border-yellow-500/50'
                )}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">{key.name}</h3>
                        <Badge
                          variant={
                            isExpired ? 'warning' : key.isActive ? 'success' : 'secondary'
                          }
                        >
                          {isExpired ? 'Expired' : key.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        {key.integrationName && (
                          <Badge variant="outline">{key.integrationName}</Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="font-mono">{key.prefix}...</span>
                        <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                        {key.lastUsedAt && (
                          <span>Last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                        )}
                      </div>

                      {/* Feature badges */}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {key.scopes.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            <Shield className="h-3 w-3 mr-1" />
                            {key.scopes.length} scope{key.scopes.length !== 1 && 's'}
                          </Badge>
                        )}
                        {key.allowedIps.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            <Globe className="h-3 w-3 mr-1" />
                            {key.allowedIps.length} IP{key.allowedIps.length !== 1 && 's'}
                          </Badge>
                        )}
                        {(key.rateLimitPerMinute || key.rateLimitPerDay) && (
                          <Badge variant="outline" className="text-xs">
                            <Zap className="h-3 w-3 mr-1" />
                            Rate limited
                          </Badge>
                        )}
                        {key.expiresAt && !isExpired && expiresIn !== null && (
                          <Badge
                            variant={expiresIn <= 7 ? 'warning' : 'outline'}
                            className="text-xs"
                          >
                            <Calendar className="h-3 w-3 mr-1" />
                            {expiresIn <= 0 ? 'Expires today' : `${expiresIn} day${expiresIn !== 1 ? 's' : ''} left`}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(key)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setViewingUsage(key)}>
                          <BarChart3 className="h-4 w-4 mr-2" />
                          View Usage
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setRotatingKey(key)}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Rotate Key
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleToggleActive(key)}>
                          {key.isActive ? (
                            <>
                              <PowerOff className="h-4 w-4 mr-2" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <Power className="h-4 w-4 mr-2" />
                              Activate
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeletingKey(key)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key with specific permissions and restrictions
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="My API Key"
              />
              <p className="text-xs text-muted-foreground">
                A descriptive name for this API key
              </p>
            </div>

            <ScopeSelector
              selectedScopes={createForm.scopes || []}
              onScopesChange={(scopes) => setCreateForm({ ...createForm, scopes })}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expiresAt">Expiration Date (optional)</Label>
                <Input
                  id="expiresAt"
                  type="date"
                  value={createForm.expiresAt ? createForm.expiresAt.split('T')[0] : ''}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      expiresAt: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                    })
                  }
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div />
            </div>

            <IpAllowlistEditor
              ips={createForm.allowedIps || []}
              onIpsChange={(ips) => setCreateForm({ ...createForm, allowedIps: ips })}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rateLimitMinute">Rate Limit (per minute)</Label>
                <Input
                  id="rateLimitMinute"
                  type="number"
                  min="0"
                  value={createForm.rateLimitPerMinute || ''}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      rateLimitPerMinute: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  placeholder="Unlimited"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rateLimitDay">Rate Limit (per day)</Label>
                <Input
                  id="rateLimitDay"
                  type="number"
                  min="0"
                  value={createForm.rateLimitPerDay || ''}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      rateLimitPerDay: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  placeholder="Unlimited"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createKey.isPending}>
              {createKey.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingKey} onOpenChange={() => setEditingKey(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit API Key</DialogTitle>
            <DialogDescription>
              Update settings for "{editingKey?.name}"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editForm.name || ''}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">
                  Deactivate to temporarily disable this key
                </p>
              </div>
              <Switch
                checked={editForm.isActive ?? true}
                onCheckedChange={(checked) => setEditForm({ ...editForm, isActive: checked })}
              />
            </div>

            <ScopeSelector
              selectedScopes={editForm.scopes || []}
              onScopesChange={(scopes) => setEditForm({ ...editForm, scopes })}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-expiresAt">Expiration Date</Label>
                <Input
                  id="edit-expiresAt"
                  type="date"
                  value={editForm.expiresAt ? editForm.expiresAt.split('T')[0] : ''}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                />
                {editForm.expiresAt && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditForm({ ...editForm, expiresAt: null })}
                  >
                    Remove expiration
                  </Button>
                )}
              </div>
              <div />
            </div>

            <IpAllowlistEditor
              ips={editForm.allowedIps || []}
              onIpsChange={(ips) => setEditForm({ ...editForm, allowedIps: ips })}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-rateLimitMinute">Rate Limit (per minute)</Label>
                <Input
                  id="edit-rateLimitMinute"
                  type="number"
                  min="0"
                  value={editForm.rateLimitPerMinute ?? ''}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      rateLimitPerMinute: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  placeholder="Unlimited"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-rateLimitDay">Rate Limit (per day)</Label>
                <Input
                  id="edit-rateLimitDay"
                  type="number"
                  min="0"
                  value={editForm.rateLimitPerDay ?? ''}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      rateLimitPerDay: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  placeholder="Unlimited"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingKey(null)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={updateKey.isPending}>
              {updateKey.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingKey} onOpenChange={() => setDeletingKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingKey?.name}"? This action cannot be undone.
              Any applications using this key will stop working.
            </DialogDescription>
          </DialogHeader>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This will permanently delete the API key and revoke all access.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingKey(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteKey.isPending}
            >
              {deleteKey.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rotate Confirmation Dialog */}
      <Dialog open={!!rotatingKey} onOpenChange={() => setRotatingKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate API Key</DialogTitle>
            <DialogDescription>
              Generate a new key for "{rotatingKey?.name}"? The old key will be immediately
              invalidated and a new one will be generated.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <RefreshCw className="h-4 w-4" />
            <AlertTitle>Key Rotation</AlertTitle>
            <AlertDescription>
              All settings (scopes, IP restrictions, rate limits) will be preserved.
              Only the key value itself will change.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRotatingKey(null)}>
              Cancel
            </Button>
            <Button onClick={handleRotate} disabled={rotateKey.isPending}>
              {rotateKey.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Rotate Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Usage Stats Dialog */}
      <Dialog open={!!viewingUsage} onOpenChange={() => setViewingUsage(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Usage Statistics
            </DialogTitle>
            <DialogDescription>
              Request statistics for "{viewingUsage?.name}"
            </DialogDescription>
          </DialogHeader>

          {viewingUsage && <UsageStatsPanel keyId={viewingUsage.id} />}

          <DialogFooter>
            <Button onClick={() => setViewingUsage(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Key Reveal Dialog */}
      <KeyRevealDialog
        open={showNewKeyDialog}
        onOpenChange={setShowNewKeyDialog}
        keyData={newKeyData}
        isRotation={isRotationKey}
      />
    </div>
  );
}
