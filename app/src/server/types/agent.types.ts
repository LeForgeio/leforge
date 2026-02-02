/**
 * Agent Runtime Types
 * 
 * Types for the AI Agent Runtime that orchestrates ForgeHooks autonomously.
 */

// =============================================================================
// LLM Provider Types
// =============================================================================

export type LLMProvider = 'ollama' | 'lmstudio' | 'anthropic' | 'openai' | 'azure' | 'bedrock';

export interface LLMProviderConfig {
  provider: LLMProvider;
  baseUrl?: string;      // For self-hosted (ollama, lmstudio)
  apiKey?: string;       // For cloud providers
  defaultModel?: string;
}

// =============================================================================
// Agent Configuration
// =============================================================================

export interface AgentConfig {
  max_steps: number;          // Maximum tool calls per run (default: 10)
  max_tokens: number;         // Max tokens for LLM response (default: 4096)
  temperature: number;        // LLM temperature 0-1 (default: 0.7)
  timeout_ms: number;         // Total execution timeout (default: 120000)
  retry_on_error: boolean;    // Retry failed tool calls (default: true)
  max_retries: number;        // Max retries per tool (default: 2)
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  max_steps: 10,
  max_tokens: 4096,
  temperature: 0.7,
  timeout_ms: 120000,
  retry_on_error: true,
  max_retries: 2,
};

// =============================================================================
// Agent Definition
// =============================================================================

export interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  
  // LLM Configuration
  model: string;              // e.g., "llama3.2", "mistral", "claude-sonnet"
  provider: LLMProvider;
  
  // Behavior
  system_prompt: string;
  tools: string[];            // ForgeHook IDs this agent can use
  config: AgentConfig;
  
  // Access Control
  is_public: boolean;
  api_key_required: boolean;
  allowed_api_keys: string[]; // UUID[] of allowed API keys
  
  // Metadata
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

// =============================================================================
// Agent Execution
// =============================================================================

export interface AgentStep {
  step: number;
  tool: string;               // ForgeHook ID
  action: string;             // Endpoint path
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  duration_ms: number;
  timestamp: string;          // ISO 8601
}

export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout';

export interface AgentRun {
  id: string;
  agent_id: string;
  
  // Input
  input_text: string;
  input_data: Record<string, unknown> | null;
  
  // Output
  output: Record<string, unknown> | null;
  output_text: string | null;
  
  // Trace
  steps: AgentStep[];
  total_steps: number;
  
  // Metrics
  tokens_input: number;
  tokens_output: number;
  duration_ms: number | null;
  
  // Status
  status: AgentRunStatus;
  error_message: string | null;
  
  // Metadata
  triggered_by: string | null; // API key ID
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
  completed_at: Date | null;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

export interface CreateAgentRequest {
  name: string;
  description?: string;
  model?: string;
  provider?: LLMProvider;
  system_prompt: string;
  tools: string[];
  config?: Partial<AgentConfig>;
  is_public?: boolean;
  owner_id?: string;  // User ID to own this agent (defaults to current user)
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  model?: string;
  provider?: LLMProvider;
  system_prompt?: string;
  tools?: string[];
  config?: Partial<AgentConfig>;
  is_public?: boolean;
}

export interface RunAgentRequest {
  input: string;                        // Natural language instruction
  data?: Record<string, unknown>;       // Optional structured input data
  config_override?: Partial<AgentConfig>; // Override agent config for this run
}

export interface RunAgentResponse {
  run_id: string;
  status: AgentRunStatus;
  output: Record<string, unknown> | null;
  output_text: string | null;
  steps: AgentStep[];
  metrics: {
    total_steps: number;
    tokens_input: number;
    tokens_output: number;
    duration_ms: number;
  };
  error?: string;
}

export interface AgentListResponse {
  agents: Agent[];
  total: number;
}

export interface AgentRunListResponse {
  runs: AgentRun[];
  total: number;
}

// =============================================================================
// Tool Schema (for LLM function calling)
// =============================================================================

export interface ToolSchema {
  name: string;               // e.g., "data-transform__csv_to_json"
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
  properties?: Record<string, ToolParameter>;
  default?: unknown;
}

// =============================================================================
// LLM Chat Types
// =============================================================================

export type ChatMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ChatRequest {
  provider: LLMProvider;
  model: string;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  max_tokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  content: string | null;
  tool_calls: ToolCall[] | null;
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'error';
  usage: {
    input_tokens: number;
    output_tokens: number;
  } | null;
  error?: string;
}

// =============================================================================
// Sample Agent Templates
// =============================================================================

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: 'data' | 'utility' | 'integration' | 'ai';
  system_prompt: string;
  suggested_tools: string[];
  example_inputs: string[];
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'data-cleanup',
    name: 'Data Cleanup Agent',
    description: 'Cleans and transforms CSV data, normalizes dates, and calculates summaries',
    category: 'data',
    system_prompt: `You are a data processing assistant. Your job is to clean, transform, and analyze data using the available tools.

Rules:
1. Always validate input data before processing
2. Use ISO 8601 format for dates (YYYY-MM-DD)
3. Handle missing values gracefully
4. Provide clear summaries of transformations made
5. Return structured JSON results

When given data to clean:
1. First analyze the data structure
2. Identify issues (date formats, missing values, inconsistencies)
3. Apply appropriate transformations
4. Verify the results
5. Return the cleaned data with a summary`,
    suggested_tools: ['data-transform', 'date-utils', 'json-utils', 'formula-engine'],
    example_inputs: [
      'Clean this CSV and normalize all dates to ISO format',
      'Parse this JSON, extract all email addresses, and count by domain',
      'Calculate the sum and average of the "amount" column grouped by "category"',
    ],
  },
  {
    id: 'text-processor',
    name: 'Text Processing Agent',
    description: 'Processes text: formatting, encoding, hashing, and manipulation',
    category: 'utility',
    system_prompt: `You are a text processing assistant. Your job is to transform, encode, and manipulate text using the available tools.

Rules:
1. Preserve original data when possible
2. Be explicit about encodings used
3. Validate inputs and outputs
4. Handle edge cases (empty strings, special characters)
5. Return results in the requested format

Available operations:
- String manipulation (case, trim, split, join)
- Encoding (Base64, URL, HTML)
- Hashing (MD5, SHA256)
- Regular expression operations`,
    suggested_tools: ['string-utils', 'encoding-utils', 'crypto-service'],
    example_inputs: [
      'Convert this text to Base64 and then URL encode it',
      'Extract all URLs from this text and hash each one with SHA256',
      'Split this CSV text into lines and trim whitespace from each field',
    ],
  },
  {
    id: 'document-processor',
    name: 'Document Processing Agent',
    description: 'Processes PDFs and documents: extract text, merge, convert',
    category: 'data',
    system_prompt: `You are a document processing assistant. Your job is to extract, transform, and manipulate PDF and document content.

Rules:
1. Preserve document structure when extracting
2. Handle multi-page documents appropriately
3. Report extraction confidence when applicable
4. Handle errors gracefully (corrupted files, password protection)
5. Return structured results

Available operations:
- PDF text extraction
- PDF merge/split
- Document conversion
- Content analysis`,
    suggested_tools: ['pdf-service', 'ocr-service', 'json-utils'],
    example_inputs: [
      'Extract all text from this PDF and return as JSON',
      'Merge these 3 PDFs into a single document',
      'Extract tables from this PDF and convert to CSV format',
    ],
  },
  {
    id: 'math-calculator',
    name: 'Math & Formula Agent',
    description: 'Evaluates formulas, performs calculations, and statistical analysis',
    category: 'utility',
    system_prompt: `You are a mathematical calculation assistant. Your job is to evaluate formulas, perform calculations, and provide mathematical analysis.

Rules:
1. Show your work when helpful
2. Handle precision correctly (avoid floating point errors)
3. Validate mathematical expressions before evaluation
4. Provide units when applicable
5. Return results in appropriate format (number, array, object)

Available operations:
- Basic arithmetic
- Formula evaluation
- Statistical calculations (mean, median, std dev)
- Unit conversions
- Array/matrix operations`,
    suggested_tools: ['formula-engine', 'math-service', 'json-utils'],
    example_inputs: [
      'Calculate compound interest: principal=$10000, rate=5%, years=10',
      'Find the mean, median, and standard deviation of these numbers: [1, 5, 3, 8, 2, 9, 4]',
      'Evaluate this formula for x=5: 2x^2 + 3x - 7',
    ],
  },
];
