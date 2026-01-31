/**
 * LLM Service
 * 
 * Multi-provider LLM abstraction layer with Ollama as the primary target.
 * Supports tool/function calling for agent orchestration.
 * 
 * Providers:
 * - ollama (primary) - Self-hosted, local
 * - lmstudio - Self-hosted, OpenAI-compatible API
 * - anthropic - Cloud, requires API key
 * - openai - Cloud, requires API key
 */

import { logger } from '../utils/logger.js';
import {
  LLMProvider,
  ChatRequest,
  ChatResponse,

  ToolCall,
} from '../types/agent.types.js';

// =============================================================================
// Provider Configuration
// =============================================================================

interface ProviderEndpoint {
  url: string;
  apiKey?: string;
}

const getProviderEndpoint = (provider: LLMProvider): ProviderEndpoint => {
  switch (provider) {
    case 'ollama':
      return {
        url: process.env.OLLAMA_URL || 'http://localhost:11434',
      };
    case 'lmstudio':
      return {
        url: process.env.LMSTUDIO_URL || 'http://localhost:1234/v1',
      };
    case 'anthropic':
      return {
        url: 'https://api.anthropic.com',
        apiKey: process.env.ANTHROPIC_API_KEY,
      };
    case 'openai':
      return {
        url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY,
      };
    case 'azure':
      return {
        url: process.env.AZURE_OPENAI_ENDPOINT || '',
        apiKey: process.env.AZURE_OPENAI_API_KEY,
      };
    case 'bedrock':
      return {
        url: process.env.AWS_BEDROCK_ENDPOINT || '',
        apiKey: process.env.AWS_ACCESS_KEY_ID, // Uses AWS credentials
      };
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
};

// =============================================================================
// LLM Service Class
// =============================================================================

class LLMService {
  private defaultProvider: LLMProvider = 'ollama';
  private defaultModel = 'llama3.2';

  constructor() {
    // Check for cloud provider API keys
    if (process.env.ANTHROPIC_API_KEY) {
      logger.info('Anthropic API key configured');
    }
    if (process.env.OPENAI_API_KEY) {
      logger.info('OpenAI API key configured');
    }
    logger.info({ defaultProvider: this.defaultProvider, defaultModel: this.defaultModel }, 'LLM service initialized');
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Send a chat request to the LLM
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const provider = request.provider || this.defaultProvider;
    const startTime = Date.now();

    logger.debug({
      provider,
      model: request.model,
      messageCount: request.messages.length,
      toolCount: request.tools?.length || 0,
    }, 'LLM chat request');

    try {
      let response: ChatResponse;

      switch (provider) {
        case 'ollama':
          response = await this.chatOllama(request);
          break;
        case 'lmstudio':
          response = await this.chatLMStudio(request);
          break;
        case 'anthropic':
          response = await this.chatAnthropic(request);
          break;
        case 'openai':
          response = await this.chatOpenAI(request);
          break;
        default:
          throw new Error(`Unsupported LLM provider: ${provider}`);
      }

      const duration = Date.now() - startTime;
      logger.debug({
        provider,
        model: request.model,
        duration,
        finishReason: response.finish_reason,
        hasToolCalls: !!response.tool_calls,
        usage: response.usage,
      }, 'LLM chat response');

      return response;
    } catch (error) {
      const err = error as Error;
      logger.error({ error: err, provider, model: request.model }, 'LLM chat failed');
      return {
        content: null,
        tool_calls: null,
        finish_reason: 'error',
        usage: null,
        error: err.message,
      };
    }
  }

  /**
   * Check if a provider is available
   */
  async checkProvider(provider: LLMProvider): Promise<{ available: boolean; models?: string[]; error?: string }> {
    try {
      switch (provider) {
        case 'ollama':
          return await this.checkOllama();
        case 'lmstudio':
          return await this.checkLMStudio();
        case 'anthropic':
          return this.checkAnthropic();
        case 'openai':
          return this.checkOpenAI();
        default:
          return { available: false, error: `Unknown provider: ${provider}` };
      }
    } catch (error) {
      return { available: false, error: (error as Error).message };
    }
  }

  /**
   * List available models for a provider
   */
  async listModels(provider: LLMProvider): Promise<string[]> {
    const check = await this.checkProvider(provider);
    return check.models || [];
  }

  // ===========================================================================
  // Ollama Implementation (Primary)
  // ===========================================================================

  private async chatOllama(request: ChatRequest): Promise<ChatResponse> {
    const endpoint = getProviderEndpoint('ollama');
    const url = `${endpoint.url}/api/chat`;

    // Convert messages to Ollama format
    const messages = request.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Build request body
    const body: Record<string, unknown> = {
      model: request.model || this.defaultModel,
      messages,
      stream: false,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.max_tokens ?? 4096,
      },
    };

    // Add tools if provided (Ollama supports function calling in newer versions)
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      message?: {
        content?: string;
        tool_calls?: Array<{
          id?: string;
          function: { name: string; arguments: string | Record<string, unknown> };
        }>;
      };
      prompt_eval_count?: number;
      eval_count?: number;
      done?: boolean;
    };

    // Parse tool calls if present
    const toolCalls: ToolCall[] | null = data.message?.tool_calls?.map((tc, idx) => ({
      id: tc.id || `call_${idx}`,
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: typeof tc.function.arguments === 'string'
          ? tc.function.arguments
          : JSON.stringify(tc.function.arguments),
      },
    })) || null;

    return {
      content: data.message?.content || null,
      tool_calls: toolCalls,
      finish_reason: toolCalls ? 'tool_calls' : 'stop',
      usage: {
        input_tokens: data.prompt_eval_count || 0,
        output_tokens: data.eval_count || 0,
      },
    };
  }

  private async checkOllama(): Promise<{ available: boolean; models?: string[]; error?: string }> {
    try {
      const endpoint = getProviderEndpoint('ollama');
      const response = await fetch(`${endpoint.url}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return { available: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json() as { models?: Array<{ name: string }> };
      const models = data.models?.map(m => m.name) || [];

      return { available: true, models };
    } catch (error) {
      return { available: false, error: (error as Error).message };
    }
  }

  // ===========================================================================
  // LM Studio Implementation (OpenAI-compatible)
  // ===========================================================================

  private async chatLMStudio(request: ChatRequest): Promise<ChatResponse> {
    const endpoint = getProviderEndpoint('lmstudio');
    const url = `${endpoint.url}/chat/completions`;

    // Convert to OpenAI format
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
        tool_call_id: m.tool_call_id,
      })),
      max_tokens: request.max_tokens ?? 4096,
      temperature: request.temperature ?? 0.7,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LM Studio error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      choices: Array<{
        message: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices[0];
    const toolCalls: ToolCall[] | null = choice.message.tool_calls?.map(tc => ({
      id: tc.id,
      type: 'function' as const,
      function: tc.function,
    })) || null;

    return {
      content: choice.message.content || null,
      tool_calls: toolCalls,
      finish_reason: toolCalls ? 'tool_calls' : (choice.finish_reason === 'stop' ? 'stop' : 'length'),
      usage: data.usage ? {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
      } : null,
    };
  }

  private async checkLMStudio(): Promise<{ available: boolean; models?: string[]; error?: string }> {
    try {
      const endpoint = getProviderEndpoint('lmstudio');
      const response = await fetch(`${endpoint.url}/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return { available: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json() as { data?: Array<{ id: string }> };
      const models = data.data?.map(m => m.id) || [];

      return { available: true, models };
    } catch (error) {
      return { available: false, error: (error as Error).message };
    }
  }

  // ===========================================================================
  // Anthropic Implementation
  // ===========================================================================

  private async chatAnthropic(request: ChatRequest): Promise<ChatResponse> {
    const endpoint = getProviderEndpoint('anthropic');
    
    if (!endpoint.apiKey) {
      throw new Error('Anthropic API key not configured (set ANTHROPIC_API_KEY)');
    }

    const url = `${endpoint.url}/v1/messages`;

    // Extract system message
    const systemMessage = request.messages.find(m => m.role === 'system')?.content || '';
    
    // Convert messages (Anthropic uses different format)
    const messages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => {
        if (m.role === 'tool') {
          return {
            role: 'user' as const,
            content: [{
              type: 'tool_result' as const,
              tool_use_id: m.tool_call_id,
              content: m.content,
            }],
          };
        }
        return {
          role: m.role as 'user' | 'assistant',
          content: m.content,
        };
      });

    // Convert tools to Anthropic format
    const tools = request.tools?.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const body: Record<string, unknown> = {
      model: this.mapAnthropicModel(request.model),
      system: systemMessage,
      messages,
      max_tokens: request.max_tokens ?? 4096,
      temperature: request.temperature ?? 0.7,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': endpoint.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      content: Array<
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
      >;
      stop_reason: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    // Parse response
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const block of data.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    return {
      content: textContent || null,
      tool_calls: toolCalls.length > 0 ? toolCalls : null,
      finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      usage: {
        input_tokens: data.usage.input_tokens,
        output_tokens: data.usage.output_tokens,
      },
    };
  }

  private checkAnthropic(): { available: boolean; models?: string[]; error?: string } {
    const endpoint = getProviderEndpoint('anthropic');
    if (!endpoint.apiKey) {
      return { available: false, error: 'ANTHROPIC_API_KEY not set' };
    }
    return {
      available: true,
      models: ['claude-sonnet', 'claude-opus', 'claude-haiku'],
    };
  }

  private mapAnthropicModel(model: string): string {
    const mapping: Record<string, string> = {
      'claude-sonnet': 'claude-sonnet-4-20250514',
      'claude-opus': 'claude-opus-4-20250514',
      'claude-haiku': 'claude-haiku-4-20250514',
    };
    return mapping[model] || model;
  }

  // ===========================================================================
  // OpenAI Implementation
  // ===========================================================================

  private async chatOpenAI(request: ChatRequest): Promise<ChatResponse> {
    const endpoint = getProviderEndpoint('openai');
    
    if (!endpoint.apiKey) {
      throw new Error('OpenAI API key not configured (set OPENAI_API_KEY)');
    }

    const url = `${endpoint.url}/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.mapOpenAIModel(request.model),
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
        tool_call_id: m.tool_call_id,
      })),
      max_tokens: request.max_tokens ?? 4096,
      temperature: request.temperature ?? 0.7,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${endpoint.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      choices: Array<{
        message: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices[0];
    const toolCalls: ToolCall[] | null = choice.message.tool_calls?.map(tc => ({
      id: tc.id,
      type: 'function' as const,
      function: tc.function,
    })) || null;

    return {
      content: choice.message.content || null,
      tool_calls: toolCalls,
      finish_reason: toolCalls ? 'tool_calls' : (choice.finish_reason === 'stop' ? 'stop' : 'length'),
      usage: {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
      },
    };
  }

  private checkOpenAI(): { available: boolean; models?: string[]; error?: string } {
    const endpoint = getProviderEndpoint('openai');
    if (!endpoint.apiKey) {
      return { available: false, error: 'OPENAI_API_KEY not set' };
    }
    return {
      available: true,
      models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    };
  }

  private mapOpenAIModel(model: string): string {
    const mapping: Record<string, string> = {
      'gpt-4o': 'gpt-4o',
      'gpt-4': 'gpt-4-turbo',
      'gpt-3.5': 'gpt-3.5-turbo',
    };
    return mapping[model] || model;
  }
}

// Singleton export
export const llmService = new LLMService();
