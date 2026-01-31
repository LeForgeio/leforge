/**
 * Client-side Agent Types
 */

export type LLMProvider = 'ollama' | 'lmstudio' | 'anthropic' | 'openai';

export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AgentConfig {
  max_steps?: number;
  max_tokens?: number;
  temperature?: number;
  timeout_ms?: number;
  retry_on_failure?: boolean;
  max_retries?: number;
}

export interface Agent {
  id: string;
  name: string;
  slug: string;
  description?: string;
  model: string;
  provider: LLMProvider;
  system_prompt: string;
  tools: string[];
  config: AgentConfig;
  is_public: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentStep {
  step_number: number;
  type: 'llm_call' | 'tool_call' | 'tool_result' | 'final_answer' | 'error';
  content: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_result?: unknown;
  tokens_used?: number;
  duration_ms?: number;
  timestamp: string;
}

export interface AgentRun {
  id: string;
  agent_id: string;
  status: AgentRunStatus;
  input: string;
  output?: string;
  steps: AgentStep[];
  total_tokens: number;
  total_duration_ms: number;
  error?: string;
  metadata?: Record<string, unknown>;
  started_at: string;
  completed_at?: string;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  system_prompt: string;
  suggested_tools: string[];
  example_inputs: string[];
}

export interface CreateAgentRequest {
  name: string;
  description?: string;
  model?: string;
  provider?: LLMProvider;
  system_prompt: string;
  tools: string[];
  config?: AgentConfig;
  is_public?: boolean;
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  model?: string;
  provider?: LLMProvider;
  system_prompt?: string;
  tools?: string[];
  config?: AgentConfig;
  is_public?: boolean;
}

export interface RunAgentRequest {
  input: string;
  data?: Record<string, unknown>;
  config_override?: Partial<AgentConfig>;
}

export interface LLMProviderStatus {
  provider: LLMProvider;
  available: boolean;
  models?: string[];
  error?: string;
}
