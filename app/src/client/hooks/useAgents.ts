/**
 * Agent API Hooks
 * 
 * React Query hooks for agent CRUD and execution
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Agent,
  AgentRun,
  AgentTemplate,
  CreateAgentRequest,
  UpdateAgentRequest,
  RunAgentRequest,
  LLMProviderStatus,
} from '../types/agent';

const API_BASE = '/api/v1';

// =============================================================================
// API Functions
// =============================================================================

async function fetchAgents(): Promise<{ agents: Agent[]; total: number }> {
  const response = await fetch(`${API_BASE}/agents`);
  if (!response.ok) {
    throw new Error('Failed to fetch agents');
  }
  return response.json();
}

async function fetchAgent(idOrSlug: string): Promise<{ agent: Agent }> {
  const response = await fetch(`${API_BASE}/agents/${idOrSlug}`);
  if (!response.ok) {
    throw new Error('Failed to fetch agent');
  }
  return response.json();
}

async function createAgent(request: CreateAgentRequest): Promise<{ agent: Agent }> {
  const response = await fetch(`${API_BASE}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to create agent');
  }
  return response.json();
}

async function updateAgent(id: string, request: UpdateAgentRequest): Promise<{ agent: Agent }> {
  const response = await fetch(`${API_BASE}/agents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to update agent');
  }
  return response.json();
}

async function deleteAgent(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/agents/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to delete agent');
  }
}

async function runAgent(idOrSlug: string, request: RunAgentRequest): Promise<AgentRun> {
  const response = await fetch(`${API_BASE}/agents/${idOrSlug}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const data = await response.json();
  // Run endpoint returns the full run result even on error
  return data;
}

async function fetchAgentRuns(agentId: string, limit?: number): Promise<{ runs: AgentRun[]; total: number }> {
  const url = limit 
    ? `${API_BASE}/agents/${agentId}/runs?limit=${limit}`
    : `${API_BASE}/agents/${agentId}/runs`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch agent runs');
  }
  return response.json();
}

async function fetchRun(runId: string): Promise<{ run: AgentRun }> {
  const response = await fetch(`${API_BASE}/runs/${runId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch run');
  }
  return response.json();
}

async function fetchRecentRuns(limit?: number): Promise<{ runs: AgentRun[]; total: number }> {
  const url = limit
    ? `${API_BASE}/runs?limit=${limit}`
    : `${API_BASE}/runs`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch recent runs');
  }
  return response.json();
}

async function fetchTemplates(): Promise<{ templates: AgentTemplate[] }> {
  const response = await fetch(`${API_BASE}/agents/templates`);
  if (!response.ok) {
    throw new Error('Failed to fetch templates');
  }
  return response.json();
}

async function createSampleAgents(): Promise<{ message: string; agents: Agent[] }> {
  const response = await fetch(`${API_BASE}/agents/samples`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to create sample agents');
  }
  return response.json();
}

async function fetchLLMProviders(): Promise<{ providers: LLMProviderStatus[] }> {
  const response = await fetch(`${API_BASE}/llm/providers`);
  if (!response.ok) {
    throw new Error('Failed to fetch LLM providers');
  }
  return response.json();
}

async function fetchProviderModels(provider: string): Promise<{ provider: string; available: boolean; models: string[]; error?: string }> {
  const response = await fetch(`${API_BASE}/llm/models/${provider}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `Failed to fetch models for ${provider}`);
  }
  return response.json();
}

// =============================================================================
// React Query Hooks
// =============================================================================

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: fetchAgents,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useAgent(idOrSlug: string | undefined) {
  return useQuery({
    queryKey: ['agents', idOrSlug],
    queryFn: () => fetchAgent(idOrSlug!),
    enabled: !!idOrSlug,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, request }: { id: string; request: UpdateAgentRequest }) => 
      updateAgent(id, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export function useRunAgent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ idOrSlug, request }: { idOrSlug: string; request: RunAgentRequest }) =>
      runAgent(idOrSlug, request),
    onSuccess: (_data, variables) => {
      // Invalidate runs for this agent
      queryClient.invalidateQueries({ queryKey: ['agent-runs', variables.idOrSlug] });
      queryClient.invalidateQueries({ queryKey: ['recent-runs'] });
    },
  });
}

export function useAgentRuns(agentId: string | undefined, limit?: number) {
  return useQuery({
    queryKey: ['agent-runs', agentId, limit],
    queryFn: () => fetchAgentRuns(agentId!, limit),
    enabled: !!agentId,
  });
}

export function useRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['runs', runId],
    queryFn: () => fetchRun(runId!),
    enabled: !!runId,
  });
}

export function useRecentRuns(limit?: number) {
  return useQuery({
    queryKey: ['recent-runs', limit],
    queryFn: () => fetchRecentRuns(limit),
  });
}

export function useAgentTemplates() {
  return useQuery({
    queryKey: ['agent-templates'],
    queryFn: fetchTemplates,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

export function useCreateSampleAgents() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createSampleAgents,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export function useLLMProviders() {
  return useQuery({
    queryKey: ['llm-providers'],
    queryFn: fetchLLMProviders,
    staleTime: 60000, // Cache for 1 minute
  });
}

export function useProviderModels(provider: string | undefined) {
  return useQuery({
    queryKey: ['llm-models', provider],
    queryFn: () => fetchProviderModels(provider!),
    enabled: !!provider,
    staleTime: 60000,
    retry: false, // Don't retry - provider status is cached
  });
}
