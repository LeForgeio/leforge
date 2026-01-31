/**
 * Agents Page
 * 
 * Main UI for creating, managing, and running AI agents
 */

import { useState, useMemo } from 'react';
import {
  Bot,
  Plus,
  Play,
  Settings,
  Trash2,
  Clock,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  Sparkles,
  Cpu,
  Wrench,
  History,
  AlertCircle,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  useAgents,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
  useRunAgent,
  useAgentRuns,
  useRecentRuns,
  useAgentTemplates,
  useCreateSampleAgents,
  useLLMProviders,
  useProviderModels,
} from '@/hooks/useAgents';
import { useInstalledPlugins } from '@/hooks/usePlugins';
import type { Agent, AgentRun, AgentStep, CreateAgentRequest, LLMProvider } from '@/types/agent';

// =============================================================================
// Status Badge Component
// =============================================================================

function StatusBadge({ status }: { status: AgentRun['status'] }) {
  const variants: Record<string, { className: string; icon: React.ReactNode }> = {
    pending: { className: 'bg-yellow-500/10 text-yellow-500', icon: <Clock className="w-3 h-3" /> },
    running: { className: 'bg-blue-500/10 text-blue-500', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    completed: { className: 'bg-green-500/10 text-green-500', icon: <CheckCircle2 className="w-3 h-3" /> },
    failed: { className: 'bg-red-500/10 text-red-500', icon: <XCircle className="w-3 h-3" /> },
    cancelled: { className: 'bg-gray-500/10 text-gray-500', icon: <XCircle className="w-3 h-3" /> },
  };

  const variant = variants[status] || variants.pending;

  return (
    <Badge variant="outline" className={cn('gap-1', variant.className)}>
      {variant.icon}
      {status}
    </Badge>
  );
}

// =============================================================================
// Provider Badge Component
// =============================================================================

function ProviderBadge({ provider, available }: { provider: LLMProvider; available?: boolean }) {
  const colors: Record<string, string> = {
    ollama: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    lmstudio: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    anthropic: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    openai: 'bg-green-500/10 text-green-500 border-green-500/20',
  };

  return (
    <Badge variant="outline" className={cn('gap-1', colors[provider])}>
      <Cpu className="w-3 h-3" />
      {provider}
      {available === false && <XCircle className="w-3 h-3 text-red-500" />}
    </Badge>
  );
}

// =============================================================================
// Agent Card Component
// =============================================================================

interface AgentCardProps {
  agent: Agent;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewRuns: () => void;
}

function AgentCard({ agent, onRun, onEdit, onDelete, onViewRuns }: AgentCardProps) {
  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{agent.name}</CardTitle>
              <CardDescription className="text-xs">{agent.slug}</CardDescription>
            </div>
          </div>
          <ProviderBadge provider={agent.provider} />
        </div>
      </CardHeader>
      <CardContent>
        {agent.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {agent.description}
          </p>
        )}
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary" className="text-xs">
            <Cpu className="w-3 h-3 mr-1" />
            {agent.model}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            <Wrench className="w-3 h-3 mr-1" />
            {agent.tools.length} tools
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onRun} className="flex-1">
            <Play className="w-4 h-4 mr-1" />
            Run
          </Button>
          <Button size="sm" variant="outline" onClick={onViewRuns}>
            <History className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Settings className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={onDelete}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Run Step Component
// =============================================================================

function RunStep({ step, index }: { step: AgentStep; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const icons: Record<string, React.ReactNode> = {
    llm_call: <Sparkles className="w-4 h-4 text-purple-500" />,
    tool_call: <Wrench className="w-4 h-4 text-blue-500" />,
    tool_result: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    final_answer: <Zap className="w-4 h-4 text-yellow-500" />,
    error: <XCircle className="w-4 h-4 text-red-500" />,
  };

  return (
    <div className="border rounded-lg p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 text-left"
      >
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-medium">
          {index + 1}
        </div>
        {icons[step.type] || <ChevronRight className="w-4 h-4" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium capitalize">{step.type.replace('_', ' ')}</span>
            {step.tool_name && (
              <Badge variant="outline" className="text-xs">{step.tool_name}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {step.content.substring(0, 100)}...
          </p>
        </div>
        {step.duration_ms && (
          <span className="text-xs text-muted-foreground">{step.duration_ms}ms</span>
        )}
        <ChevronRight className={cn('w-4 h-4 transition-transform', expanded && 'rotate-90')} />
      </button>
      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-2">
          <div className="bg-muted/50 rounded p-3">
            <pre className="text-xs whitespace-pre-wrap break-words font-mono">
              {step.content}
            </pre>
          </div>
          {step.tool_args && (
            <div>
              <Label className="text-xs">Arguments</Label>
              <pre className="text-xs bg-muted/50 rounded p-2 mt-1 whitespace-pre-wrap">
                {JSON.stringify(step.tool_args, null, 2)}
              </pre>
            </div>
          )}
          {step.tool_result !== undefined && step.tool_result !== null && (
            <div>
              <Label className="text-xs">Result</Label>
              <pre className="text-xs bg-muted/50 rounded p-2 mt-1 whitespace-pre-wrap">
                {typeof step.tool_result === 'string' 
                  ? step.tool_result 
                  : JSON.stringify(step.tool_result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Create/Edit Agent Dialog
// =============================================================================

interface AgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: Agent;
  onSave: (data: CreateAgentRequest) => void;
  isSaving: boolean;
}

function AgentDialog({ open, onOpenChange, agent, onSave, isSaving }: AgentDialogProps) {
  const { data: providersData } = useLLMProviders();
  const { data: pluginsData } = useInstalledPlugins();
  const { data: templatesData } = useAgentTemplates();

  const [name, setName] = useState(agent?.name || '');
  const [description, setDescription] = useState(agent?.description || '');
  const [provider, setProvider] = useState<LLMProvider>(agent?.provider || 'ollama');
  const [model, setModel] = useState(agent?.model || 'llama3.2');
  const [systemPrompt, setSystemPrompt] = useState(agent?.system_prompt || '');
  const [selectedTools, setSelectedTools] = useState<string[]>(agent?.tools || []);
  const [maxSteps, setMaxSteps] = useState(agent?.config?.max_steps || 10);
  const [temperature, setTemperature] = useState(agent?.config?.temperature || 0.7);

  const { data: modelsData } = useProviderModels(provider);

  // Available tools from running plugins
  const availableTools = useMemo(() => {
    if (!pluginsData?.plugins) return [];
    return pluginsData.plugins
      .filter(p => p.status === 'running')
      .map(p => ({
        id: p.forgehookId,
        name: p.name,
      }));
  }, [pluginsData]);

  const handleSubmit = () => {
    onSave({
      name,
      description: description || undefined,
      provider,
      model,
      system_prompt: systemPrompt,
      tools: selectedTools,
      config: {
        max_steps: maxSteps,
        temperature,
      },
    });
  };

  const applyTemplate = (templateId: string) => {
    const template = templatesData?.templates.find(t => t.id === templateId);
    if (template) {
      setName(template.name);
      setDescription(template.description);
      setSystemPrompt(template.system_prompt);
      // Try to match suggested tools with available tools
      const matchedTools = template.suggested_tools.filter(t => 
        availableTools.some(at => at.id.includes(t) || t.includes(at.id))
      );
      if (matchedTools.length > 0) {
        setSelectedTools(matchedTools);
      }
    }
  };

  const toggleTool = (toolId: string) => {
    setSelectedTools(prev => 
      prev.includes(toolId) 
        ? prev.filter(t => t !== toolId)
        : [...prev, toolId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{agent ? 'Edit Agent' : 'Create Agent'}</DialogTitle>
          <DialogDescription>
            Configure an AI agent to orchestrate ForgeHooks autonomously
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Template Selector (only for new agents) */}
          {!agent && templatesData?.templates && templatesData.templates.length > 0 && (
            <div className="space-y-2">
              <Label>Start from Template</Label>
              <Select onValueChange={applyTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templatesData.templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Agent"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this agent do?"
              />
            </div>
          </div>

          {/* LLM Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as LLMProvider)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(providersData?.providers || []).map(p => (
                    <SelectItem key={p.provider} value={p.provider} disabled={!p.available}>
                      <div className="flex items-center gap-2">
                        {p.provider}
                        {!p.available && <span className="text-xs text-red-500">(unavailable)</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(modelsData?.models || ['llama3.2', 'llama3.1', 'mistral', 'codellama']).map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <Label htmlFor="prompt">System Prompt *</Label>
            <Textarea
              id="prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant..."
              className="min-h-[150px] font-mono text-sm"
            />
          </div>

          {/* Tools Selection */}
          <div className="space-y-2">
            <Label>Tools (ForgeHooks) *</Label>
            <p className="text-xs text-muted-foreground">
              Select which plugins this agent can use
            </p>
            {availableTools.length === 0 ? (
              <div className="p-4 border rounded-lg text-center text-muted-foreground">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No running plugins available</p>
                <p className="text-xs">Start some plugins from the Marketplace first</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg max-h-40 overflow-y-auto">
                {availableTools.map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => toggleTool(tool.id)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-left transition-colors',
                      selectedTools.includes(tool.id)
                        ? 'bg-primary/10 text-primary border border-primary/50'
                        : 'hover:bg-muted border border-transparent'
                    )}
                  >
                    <Wrench className="w-4 h-4" />
                    {tool.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Advanced Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Steps</Label>
              <Input
                type="number"
                value={maxSteps}
                onChange={(e) => setMaxSteps(parseInt(e.target.value) || 10)}
                min={1}
                max={50}
              />
            </div>
            <div className="space-y-2">
              <Label>Temperature</Label>
              <Input
                type="number"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value) || 0.7)}
                min={0}
                max={2}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSaving || !name || !systemPrompt || selectedTools.length === 0}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              agent ? 'Update Agent' : 'Create Agent'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Run Agent Dialog
// =============================================================================

interface RunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: Agent;
}

function RunDialog({ open, onOpenChange, agent }: RunDialogProps) {
  const { toast } = useToast();
  const runAgent = useRunAgent();
  const [input, setInput] = useState('');
  const [result, setResult] = useState<AgentRun | null>(null);

  const handleRun = async () => {
    if (!input.trim()) return;
    
    setResult(null);
    try {
      const run = await runAgent.mutateAsync({
        idOrSlug: agent.id,
        request: { input },
      });
      setResult(run);
      if (run.status === 'completed') {
        toast({ title: 'Agent completed', description: 'Task finished successfully' });
      } else if (run.status === 'failed') {
        toast({ 
          variant: 'destructive', 
          title: 'Agent failed', 
          description: run.error || 'Unknown error' 
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Run failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleClose = () => {
    setInput('');
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            Run: {agent.name}
          </DialogTitle>
          <DialogDescription>
            Enter your instruction and the agent will use {agent.tools.length} tools to complete it
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 py-4">
          {/* Input */}
          <div className="space-y-2">
            <Label>Instruction</Label>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell the agent what to do..."
              className="min-h-[80px]"
              disabled={runAgent.isPending}
            />
          </div>

          {/* Run Button */}
          <Button 
            onClick={handleRun} 
            disabled={runAgent.isPending || !input.trim()}
            className="w-full"
          >
            {runAgent.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run Agent
              </>
            )}
          </Button>

          {/* Results */}
          {result && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <StatusBadge status={result.status} />
                  <span className="text-sm text-muted-foreground">
                    {result.steps.length} steps • {result.total_tokens} tokens • {result.total_duration_ms}ms
                  </span>
                </div>
              </div>

              {/* Output */}
              {result.output && (
                <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <Label className="text-xs text-green-600 mb-1 block">Output</Label>
                  <p className="text-sm whitespace-pre-wrap">{result.output}</p>
                </div>
              )}

              {/* Error */}
              {result.error && (
                <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <Label className="text-xs text-red-600 mb-1 block">Error</Label>
                  <p className="text-sm text-red-600">{result.error}</p>
                </div>
              )}

              {/* Steps */}
              <div className="flex-1 overflow-hidden">
                <Label className="text-xs block mb-2">Execution Steps</Label>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2 pr-4">
                    {result.steps.map((step, idx) => (
                      <RunStep key={idx} step={step} index={idx} />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Runs History Dialog
// =============================================================================

interface RunsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: Agent;
}

function RunsDialog({ open, onOpenChange, agent }: RunsDialogProps) {
  const { data, isLoading } = useAgentRuns(open ? agent.id : undefined, 20);
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Run History: {agent.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex gap-4 py-4">
          {/* Runs List */}
          <div className="w-1/3 flex flex-col">
            <Label className="text-xs mb-2">Recent Runs</Label>
            <ScrollArea className="flex-1 border rounded-lg">
              {isLoading ? (
                <div className="p-4 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </div>
              ) : data?.runs.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No runs yet
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {data?.runs.map(run => (
                    <button
                      key={run.id}
                      onClick={() => setSelectedRun(run)}
                      className={cn(
                        'w-full p-3 rounded-lg text-left transition-colors',
                        selectedRun?.id === run.id
                          ? 'bg-primary/10'
                          : 'hover:bg-muted'
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <StatusBadge status={run.status} />
                        <span className="text-xs text-muted-foreground">
                          {new Date(run.started_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs truncate text-muted-foreground">
                        {run.input}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Run Details */}
          <div className="flex-1 flex flex-col">
            {selectedRun ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <StatusBadge status={selectedRun.status} />
                  <span className="text-xs text-muted-foreground">
                    {selectedRun.steps.length} steps • {selectedRun.total_tokens} tokens • {selectedRun.total_duration_ms}ms
                  </span>
                </div>

                <div className="mb-3 p-3 bg-muted/50 rounded-lg">
                  <Label className="text-xs block mb-1">Input</Label>
                  <p className="text-sm">{selectedRun.input}</p>
                </div>

                {selectedRun.output && (
                  <div className="mb-3 p-3 bg-green-500/10 rounded-lg">
                    <Label className="text-xs text-green-600 block mb-1">Output</Label>
                    <p className="text-sm whitespace-pre-wrap">{selectedRun.output}</p>
                  </div>
                )}

                {selectedRun.error && (
                  <div className="mb-3 p-3 bg-red-500/10 rounded-lg">
                    <Label className="text-xs text-red-600 block mb-1">Error</Label>
                    <p className="text-sm text-red-600">{selectedRun.error}</p>
                  </div>
                )}

                <Label className="text-xs block mb-2">Steps</Label>
                <ScrollArea className="flex-1">
                  <div className="space-y-2 pr-4">
                    {selectedRun.steps.map((step, idx) => (
                      <RunStep key={idx} step={step} index={idx} />
                    ))}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                Select a run to view details
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Main Agents Page
// =============================================================================

export default function Agents() {
  const { toast } = useToast();
  const { data: agentsData, isLoading } = useAgents();
  const { data: recentRunsData } = useRecentRuns(5);
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const deleteAgentMutation = useDeleteAgent();
  const createSamples = useCreateSampleAgents();

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [runAgent, setRunAgent] = useState<Agent | null>(null);
  const [runsAgent, setRunsAgent] = useState<Agent | null>(null);
  const [deleteAgent, setDeleteAgent] = useState<Agent | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter agents by search
  const filteredAgents = useMemo(() => {
    if (!agentsData?.agents) return [];
    if (!searchQuery) return agentsData.agents;
    const q = searchQuery.toLowerCase();
    return agentsData.agents.filter(a => 
      a.name.toLowerCase().includes(q) || 
      a.slug.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q)
    );
  }, [agentsData, searchQuery]);

  const handleCreateAgent = async (data: CreateAgentRequest) => {
    try {
      await createAgent.mutateAsync(data);
      setCreateDialogOpen(false);
      toast({ title: 'Agent created', description: `${data.name} is ready to use` });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Create failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleUpdateAgent = async (data: CreateAgentRequest) => {
    if (!editAgent) return;
    try {
      await updateAgent.mutateAsync({ id: editAgent.id, request: data });
      setEditAgent(null);
      toast({ title: 'Agent updated' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteAgent) return;
    try {
      await deleteAgentMutation.mutateAsync(deleteAgent.id);
      setDeleteAgent(null);
      toast({ title: 'Agent deleted' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleCreateSamples = async () => {
    try {
      const result = await createSamples.mutateAsync();
      toast({
        title: 'Sample agents created',
        description: result.message,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to create samples',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bot className="w-8 h-8" />
            AI Agents
          </h1>
          <p className="text-muted-foreground mt-1">
            Create and run AI agents that orchestrate ForgeHooks autonomously
          </p>
        </div>
        <div className="flex items-center gap-2">
          {agentsData?.agents.length === 0 && (
            <Button variant="outline" onClick={handleCreateSamples} disabled={createSamples.isPending}>
              {createSamples.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Create Samples
            </Button>
          )}
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Agent
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search agents..."
          className="pl-9"
        />
      </div>

      <Tabs defaultValue="agents" className="space-y-4">
        <TabsList>
          <TabsTrigger value="agents">
            Agents ({agentsData?.agents.length || 0})
          </TabsTrigger>
          <TabsTrigger value="recent">
            Recent Runs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="space-y-4">
          {filteredAgents.length === 0 ? (
            <Card className="p-8 text-center">
              <Bot className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">
                {searchQuery ? 'No agents found' : 'No Agents Yet'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery 
                  ? 'Try a different search term'
                  : 'Create your first AI agent to start automating tasks'}
              </p>
              {!searchQuery && (
                <div className="flex items-center justify-center gap-2">
                  <Button onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Agent
                  </Button>
                  <Button variant="outline" onClick={handleCreateSamples}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Create Samples
                  </Button>
                </div>
              )}
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredAgents.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onRun={() => setRunAgent(agent)}
                  onEdit={() => setEditAgent(agent)}
                  onDelete={() => setDeleteAgent(agent)}
                  onViewRuns={() => setRunsAgent(agent)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recent" className="space-y-4">
          {!recentRunsData?.runs.length ? (
            <Card className="p-8 text-center">
              <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Recent Runs</h3>
              <p className="text-muted-foreground">
                Run an agent to see execution history here
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {recentRunsData.runs.map(run => (
                <Card key={run.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <StatusBadge status={run.status} />
                      <span className="text-sm font-medium">
                        {agentsData?.agents.find(a => a.id === run.agent_id)?.name || 'Unknown Agent'}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(run.started_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate mb-2">
                    {run.input}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{run.steps.length} steps</span>
                    <span>{run.total_tokens} tokens</span>
                    <span>{run.total_duration_ms}ms</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <AgentDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSave={handleCreateAgent}
        isSaving={createAgent.isPending}
      />

      {editAgent && (
        <AgentDialog
          open={!!editAgent}
          onOpenChange={(open) => !open && setEditAgent(null)}
          agent={editAgent}
          onSave={handleUpdateAgent}
          isSaving={updateAgent.isPending}
        />
      )}

      {runAgent && (
        <RunDialog
          open={!!runAgent}
          onOpenChange={(open) => !open && setRunAgent(null)}
          agent={runAgent}
        />
      )}

      {runsAgent && (
        <RunsDialog
          open={!!runsAgent}
          onOpenChange={(open) => !open && setRunsAgent(null)}
          agent={runsAgent}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteAgent} onOpenChange={(open: boolean) => !open && setDeleteAgent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteAgent?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAgentMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
