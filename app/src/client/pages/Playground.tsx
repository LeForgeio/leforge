import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Play, ChevronDown, Save, Trash2, FolderOpen, Terminal, Code2, Loader2, Plug, Key } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResponseViewer } from '@/components/ResponseViewer';
import { CodeBlock } from '@/components/CodeBlock';
import { 
  executeApiCall, 
  generateCurlCommand, 
  generateJavaScriptCode, 
  generatePythonCode,
} from '@/lib/api';
import { useInstalledPlugins } from '@/hooks/usePlugins';
import { useApiKeys } from '@/hooks/useApiKeys';
import type { InstalledPlugin } from '@/types/forgehook';
import { useSavedRequestsStore, useSettingsStore, type SavedRequest } from '@/store';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Convert InstalledPlugin to a service-like structure for the playground
interface PlaygroundService {
  id: string;
  name: string;
  path: string;
  endpoints: PlaygroundEndpoint[];
}

interface PlaygroundEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  body?: Record<string, unknown>;
}

function pluginToService(plugin: InstalledPlugin): PlaygroundService {
  // Use the LeForge proxy path: /api/v1/plugins/{pluginId}/proxy
  // This routes through the proxy handler which forwards to the container
  const basePath = `/api/v1/plugins/${plugin.forgehookId}/proxy`;
  const endpoints: PlaygroundEndpoint[] = (plugin.manifest?.endpoints || []).map(ep => ({
    method: ep.method,
    path: ep.path,
    description: ep.description,
    body: ep.requestBody,
  }));
  
  return {
    id: plugin.forgehookId,
    name: plugin.name,
    path: basePath,
    endpoints,
  };
}

const methodColors: Record<string, string> = {
  GET: 'bg-green-500',
  POST: 'bg-blue-500',
  PUT: 'bg-yellow-500',
  DELETE: 'bg-red-500',
  PATCH: 'bg-purple-500',
};

export default function Playground() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { baseUrl, setBaseUrl } = useSettingsStore();
  const { requests: savedRequests, addRequest, deleteRequest } = useSavedRequestsStore();
  
  // Fetch installed plugins
  const { data: pluginsData, isLoading: pluginsLoading } = useInstalledPlugins();
  
  // Fetch API keys
  const { data: apiKeysData } = useApiKeys();
  const apiKeys = apiKeysData?.keys || [];
  
  // Convert running plugins to services
  const services = useMemo(() => {
    if (!pluginsData?.plugins) return [];
    return pluginsData.plugins
      .filter(p => p.status === 'running')
      .map(pluginToService);
  }, [pluginsData]);

  // State
  const [selectedService, setSelectedService] = useState<PlaygroundService | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<PlaygroundEndpoint | null>(null);
  const [method, setMethod] = useState<string>('POST');
  const [path, setPath] = useState<string>('');
  const [requestBody, setRequestBody] = useState<string>('');
  const [headers, setHeaders] = useState<string>('');
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>('');
  const [apiKeyValue, setApiKeyValue] = useState<string>('');
  const [response, setResponse] = useState<{ status: number; statusText: string; data: unknown; duration: number; headers: Record<string, string> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [activeCodeTab, setActiveCodeTab] = useState<'curl' | 'javascript' | 'python'>('curl');

  // Set initial service when services load
  useEffect(() => {
    if (services.length > 0 && !selectedService) {
      const serviceId = searchParams.get('service');
      const service = serviceId 
        ? services.find(s => s.id === serviceId) || services[0]
        : services[0];
      
      setSelectedService(service);
      if (service.endpoints.length > 0) {
        setSelectedEndpoint(service.endpoints[0]);
      }
      setExpandedCategories([service.name]);
    }
  }, [services, selectedService, searchParams]);

  // Update method, path, and body when endpoint changes
  useEffect(() => {
    if (selectedEndpoint && selectedService) {
      setMethod(selectedEndpoint.method);
      setPath(`${selectedService.path}${selectedEndpoint.path}`);
      setRequestBody(selectedEndpoint.body ? JSON.stringify(selectedEndpoint.body, null, 2) : '');
    }
  }, [selectedEndpoint, selectedService]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const selectEndpoint = (service: PlaygroundService, endpoint: PlaygroundEndpoint) => {
    setSelectedService(service);
    setSelectedEndpoint(endpoint);
    setResponse(null);
    setError(null);
  };

  const loadSavedRequest = (saved: SavedRequest) => {
    setMethod(saved.method);
    setPath(saved.path);
    setRequestBody(saved.body || '');
    setHeaders(saved.headers ? JSON.stringify(saved.headers, null, 2) : '');
    setResponse(null);
    setError(null);
    toast({ title: 'Request loaded', description: saved.name });
  };

  const handleSaveRequest = () => {
    if (!requestName.trim()) return;
    
    addRequest({
      name: requestName,
      method,
      path,
      body: requestBody,
      headers: headers ? JSON.parse(headers) : undefined,
    });
    
    setRequestName('');
    setSaveDialogOpen(false);
    toast({ title: 'Request saved', description: requestName });
  };

  const executeRequest = async () => {
    setIsLoading(true);
    setResponse(null);
    setError(null);

    try {
      const body = requestBody ? JSON.parse(requestBody) : undefined;
      let customHeaders = headers ? JSON.parse(headers) : {};
      
      // Add API key header if provided
      if (apiKeyValue) {
        customHeaders = { ...customHeaders, 'X-API-Key': apiKeyValue };
      }
      
      const result = await executeApiCall(method, path, body, Object.keys(customHeaders).length > 0 ? customHeaders : undefined);
      setResponse(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      setError(message);
      toast({ variant: 'destructive', title: 'Request failed', description: message });
    } finally {
      setIsLoading(false);
    }
  };

  const getGeneratedCode = () => {
    const body = requestBody ? JSON.parse(requestBody) : undefined;
    let codeHeaders = headers ? JSON.parse(headers) : {};
    
    // Add API key header if provided
    if (apiKeyValue) {
      codeHeaders = { ...codeHeaders, 'X-API-Key': apiKeyValue };
    }
    
    const headersToUse = Object.keys(codeHeaders).length > 0 ? codeHeaders : undefined;
    
    switch (activeCodeTab) {
      case 'curl':
        return generateCurlCommand(method, path, body, headersToUse);
      case 'javascript':
        return generateJavaScriptCode(method, path, body, headersToUse);
      case 'python':
        return generatePythonCode(method, path, body, headersToUse);
    }
  };

  // Loading state
  if (pluginsLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No services available
  if (services.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">API Playground</h1>
          <p className="text-muted-foreground mt-1">Test LeForge API endpoints interactively</p>
        </div>
        <Card className="p-8 text-center flex-1 flex flex-col items-center justify-center">
          <Plug className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Services Running</h3>
          <p className="text-muted-foreground mb-4">
            Install and start plugins from the Marketplace to use the API Playground.
          </p>
          <Button asChild>
            <a href="#/marketplace">Browse Marketplace</a>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Playground</h1>
          <p className="text-muted-foreground mt-1">Test LeForge API endpoints interactively</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Save className="w-4 h-4 mr-1" />
                Save
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Request</DialogTitle>
                <DialogDescription>Save this request for later use</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="request-name">Request Name</Label>
                <Input
                  id="request-name"
                  value={requestName}
                  onChange={(e) => setRequestName(e.target.value)}
                  placeholder="My API Request"
                  className="mt-2"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveRequest} disabled={!requestName.trim()}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Endpoint Sidebar */}
        <Card className="w-80 flex-shrink-0 overflow-hidden flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              Endpoints
              {savedRequests.length > 0 && (
                <span className="text-xs text-muted-foreground">{savedRequests.length} saved</span>
              )}
            </CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            <CardContent className="p-2">
              {/* Saved Requests */}
              {savedRequests.length > 0 && (
                <div className="mb-4">
                  <button
                    onClick={() => toggleCategory('Saved Requests')}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted text-sm font-medium text-primary"
                  >
                    <span className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4" />
                      Saved Requests
                    </span>
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 transition-transform',
                        expandedCategories.includes('Saved Requests') && 'rotate-180'
                      )}
                    />
                  </button>
                  {expandedCategories.includes('Saved Requests') && (
                    <div className="ml-2 space-y-1">
                      {savedRequests.map((saved) => (
                        <div
                          key={saved.id}
                          className="flex items-center gap-1 p-2 rounded text-xs hover:bg-muted group"
                        >
                          <button
                            onClick={() => loadSavedRequest(saved)}
                            className="flex items-center gap-2 flex-1 truncate"
                          >
                            <span
                              className={cn(
                                'px-1.5 py-0.5 rounded text-white text-[10px] font-medium',
                                methodColors[saved.method]
                              )}
                            >
                              {saved.method}
                            </span>
                            <span className="truncate text-muted-foreground">{saved.name}</span>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                            onClick={() => deleteRequest(saved.id)}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Service Endpoints */}
              {services.map((service) => (
                <div key={service.id} className="mb-2">
                  <button
                    onClick={() => toggleCategory(service.name)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted text-sm font-medium"
                  >
                    {service.name}
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 transition-transform',
                        expandedCategories.includes(service.name) && 'rotate-180'
                      )}
                    />
                  </button>
                  {expandedCategories.includes(service.name) && (
                    <div className="ml-2 space-y-1">
                      {service.endpoints.map((endpoint, idx) => (
                        <button
                          key={idx}
                          onClick={() => selectEndpoint(service, endpoint)}
                          className={cn(
                            'w-full flex items-center gap-2 p-2 rounded text-xs hover:bg-muted',
                            selectedEndpoint === endpoint && selectedService === service && 'bg-muted'
                          )}
                        >
                          <span
                            className={cn(
                              'px-1.5 py-0.5 rounded text-white text-[10px] font-medium',
                              methodColors[endpoint.method]
                            )}
                          >
                            {endpoint.method}
                          </span>
                          <span className="truncate text-muted-foreground">{endpoint.path}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </ScrollArea>
        </Card>

        {/* Main Content */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Request Section */}
          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => (
                      <SelectItem key={m} value={m}>
                        <span className={cn('px-1.5 py-0.5 rounded text-white text-xs font-medium mr-2', methodColors[m])}>
                          {m}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-48 text-xs"
                  placeholder="Base URL"
                />
                <Input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  className="flex-1 font-mono text-sm"
                  placeholder="/api/v1/..."
                />
                <Button onClick={executeRequest} disabled={isLoading}>
                  <Play className="w-4 h-4 mr-1" />
                  {isLoading ? 'Sending...' : 'Send'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Tabs defaultValue="body" className="w-full">
                <TabsList>
                  <TabsTrigger value="body">Body</TabsTrigger>
                  <TabsTrigger value="headers">Headers</TabsTrigger>
                </TabsList>
                <TabsContent value="body" className="mt-2">
                  <textarea
                    value={requestBody}
                    onChange={(e) => setRequestBody(e.target.value)}
                    className="w-full h-40 p-3 bg-muted/50 rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Request body (JSON)"
                    spellCheck={false}
                  />
                </TabsContent>
                <TabsContent value="headers" className="mt-2 space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">
                        <Key className="w-3 h-3 inline mr-1" />
                        API Key:
                      </Label>
                      <Select
                        value={selectedApiKeyId || 'none'}
                        onValueChange={(keyId) => {
                          setSelectedApiKeyId(keyId === 'none' ? '' : keyId);
                          if (keyId === 'none') {
                            setApiKeyValue('');
                          }
                        }}
                      >
                        <SelectTrigger className="w-48 h-8 text-xs">
                          <SelectValue placeholder="Select key..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-muted-foreground">None</span>
                          </SelectItem>
                          {apiKeys.map((key) => (
                            <SelectItem key={key.id} value={key.id}>
                              <div className="flex items-center gap-2">
                                <span>{key.name}</span>
                                <span className="text-muted-foreground text-[10px] font-mono">{key.prefix}...</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {apiKeys.length === 0 && (
                        <Button variant="link" size="sm" className="text-xs px-0" asChild>
                          <a href="#/admin/api-keys">Create API Key</a>
                        </Button>
                      )}
                    </div>
                    {selectedApiKeyId && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="password"
                          value={apiKeyValue}
                          onChange={(e) => setApiKeyValue(e.target.value)}
                          className="flex-1 h-8 text-xs font-mono"
                          placeholder="Paste your full API key (fhk_...)"
                        />
                        {apiKeyValue && (
                          <span className="text-xs text-green-500">Ready to use</span>
                        )}
                      </div>
                    )}
                  </div>
                  <textarea
                    value={headers}
                    onChange={(e) => setHeaders(e.target.value)}
                    className="w-full h-24 p-3 bg-muted/50 rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder='Additional headers (JSON)\n{"Custom-Header": "value"}'
                    spellCheck={false}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    The API key will be sent as X-API-Key header. Additional headers are merged automatically.
                  </p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Response and Code Generation */}
          <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
            {/* Response */}
            <Card className="flex flex-col overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Response</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto p-0">
                <ResponseViewer
                  response={response}
                  error={error}
                  isLoading={isLoading}
                  className="border-0 rounded-none h-full"
                />
              </CardContent>
            </Card>

            {/* Code Generation */}
            <Card className="flex flex-col overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Code2 className="w-4 h-4" />
                  Code Snippet
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto p-0">
                <Tabs value={activeCodeTab} onValueChange={(v) => setActiveCodeTab(v as typeof activeCodeTab)} className="h-full flex flex-col">
                  <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-4">
                    <TabsTrigger value="curl" className="text-xs gap-1">
                      <Terminal className="w-3 h-3" />
                      cURL
                    </TabsTrigger>
                    <TabsTrigger value="javascript" className="text-xs">JavaScript</TabsTrigger>
                    <TabsTrigger value="python" className="text-xs">Python</TabsTrigger>
                  </TabsList>
                  <div className="flex-1 overflow-auto">
                    <CodeBlock
                      code={getGeneratedCode()}
                      language={activeCodeTab === 'curl' ? 'bash' : activeCodeTab}
                      maxHeight="300px"
                      className="border-0 rounded-none"
                    />
                  </div>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
