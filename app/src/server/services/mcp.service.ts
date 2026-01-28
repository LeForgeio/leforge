/**
 * MCP (Model Context Protocol) Service
 * 
 * Implements the MCP server protocol to expose all ForgeHooks as MCP resources.
 * This enables AI agents (Claude, GPT, etc.) to discover and use LeForge plugins.
 * 
 * MCP Specification: https://modelcontextprotocol.io/
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { dockerService } from './docker.service.js';
import { registryService } from './registry.service.js';
import { databaseService } from './database.service.js';
import { embeddedPluginService } from './embedded-plugin.service.js';
import { ForgeHookEndpoint } from '../types/index.js';
import axios from 'axios';

// MCP Protocol Types
export interface MCPServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
  capabilities: MCPCapabilities;
}

export interface MCPCapabilities {
  tools: boolean;
  resources: boolean;
  prompts: boolean;
  logging: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface PluginInfo {
  id: string;
  name: string;
  description: string;
  status: string;
  runtime: string;
  manifest?: {
    id?: string;
    name?: string;
    description?: string;
    category?: string;
    version?: string;
    endpoints?: ForgeHookEndpoint[];
    gateway?: {
      baseUrl: string;
    };
  };
  hostPort?: number;
}

class MCPService extends EventEmitter {
  private serverInfo: MCPServerInfo = {
    name: 'leforge',
    version: '1.0.0',
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: true,
      resources: true,
      prompts: true,
      logging: true,
    },
  };

  /**
   * Handle incoming MCP JSON-RPC request
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { id, method, params } = request;

    try {
      let result: unknown;

      switch (method) {
        case 'initialize':
          result = await this.handleInitialize(params);
          break;
        case 'tools/list':
          result = await this.handleToolsList();
          break;
        case 'tools/call':
          result = await this.handleToolsCall(params as { name: string; arguments: Record<string, unknown> });
          break;
        case 'resources/list':
          result = await this.handleResourcesList();
          break;
        case 'resources/read':
          result = await this.handleResourcesRead(params as { uri: string });
          break;
        case 'prompts/list':
          result = await this.handlePromptsList();
          break;
        case 'prompts/get':
          result = await this.handlePromptsGet(params as { name: string; arguments?: Record<string, string> });
          break;
        case 'ping':
          result = {};
          break;
        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          };
      }

      return {
        jsonrpc: '2.0',
        id,
        result,
      };
    } catch (error) {
      const err = error as Error;
      logger.error({ error: err, method }, 'MCP request error');
      
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: err.message || 'Internal error',
        },
      };
    }
  }

  /**
   * Handle initialize request
   */
  private async handleInitialize(_params?: Record<string, unknown>): Promise<MCPServerInfo> {
    logger.info('MCP client initialized');
    return this.serverInfo;
  }

  /**
   * Get all plugins (Docker + embedded + gateway) as unified list
   */
  private async getAllPlugins(): Promise<PluginInfo[]> {
    const plugins: PluginInfo[] = [];

    // Get Docker plugins from in-memory service
    const dockerPlugins = dockerService.listPlugins();
    for (const p of dockerPlugins) {
      plugins.push({
        id: p.forgehookId,
        name: p.manifest?.name || p.forgehookId,
        description: p.manifest?.description || '',
        status: p.status,
        runtime: 'container',
        manifest: p.manifest,
        hostPort: p.hostPort,
      });
    }

    // Get all plugins from database (includes embedded and gateway)
    try {
      const dbPlugins = await databaseService.listPlugins();
      for (const p of dbPlugins) {
        // Skip if already added from Docker service
        if (plugins.find(existing => existing.id === p.forgehookId)) continue;
        
        plugins.push({
          id: p.forgehookId,
          name: p.manifest?.name || p.forgehookId,
          description: p.manifest?.description || '',
          status: p.status,
          runtime: p.runtime,
          manifest: p.manifest,
          hostPort: p.hostPort,
        });
      }
    } catch (error) {
      // Database may not be initialized yet
      logger.debug({ error }, 'Could not fetch plugins from database');
    }

    return plugins;
  }

  /**
   * List all available tools (ForgeHook endpoints)
   */
  private async handleToolsList(): Promise<{ tools: MCPTool[] }> {
    const tools: MCPTool[] = [];
    const plugins = await this.getAllPlugins();
    
    for (const plugin of plugins.filter(p => p.status === 'running')) {
      const endpoints = plugin.manifest?.endpoints || [];

      for (const endpoint of endpoints) {
        const toolName = `${plugin.manifest?.id || plugin.id}__${endpoint.method.toLowerCase()}_${endpoint.path.replace(/\//g, '_').replace(/^_/, '')}`;
        
        tools.push({
          name: toolName,
          description: `${plugin.name}: ${endpoint.description || endpoint.path}`,
          inputSchema: this.buildInputSchema(endpoint),
        });
      }
    }

    logger.info({ toolCount: tools.length }, 'MCP tools listed');
    return { tools };
  }

  /**
   * Build JSON Schema for tool input from endpoint definition
   */
  private buildInputSchema(endpoint: ForgeHookEndpoint): MCPTool['inputSchema'] {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    // Extract schema from requestBody if available
    if (endpoint.requestBody && typeof endpoint.requestBody === 'object') {
      const body = endpoint.requestBody as Record<string, unknown>;
      
      // If it has properties defined, use them
      if (body.properties && typeof body.properties === 'object') {
        Object.assign(properties, body.properties);
      }
      
      // If it has required array, use it
      if (Array.isArray(body.required)) {
        required.push(...(body.required as string[]));
      }
    }

    // For endpoints without requestBody, allow arbitrary input
    if (Object.keys(properties).length === 0 && endpoint.method !== 'GET') {
      properties['input'] = {
        type: 'object',
        description: 'Input data for the endpoint',
      };
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  /**
   * Execute a tool (call a ForgeHook endpoint)
   */
  private async handleToolsCall(params: { name: string; arguments: Record<string, unknown> }): Promise<MCPToolResult> {
    const { name, arguments: args } = params;
    
    // Parse tool name: pluginId__method_path
    const match = name.match(/^(.+?)__(\w+)_(.+)$/);
    if (!match) {
      return {
        content: [{ type: 'text', text: `Invalid tool name format: ${name}` }],
        isError: true,
      };
    }

    const [, pluginId, method, pathPart] = match;
    const path = '/' + pathPart.replace(/_/g, '/');

    logger.info({ pluginId, method, path, args }, 'MCP tool call');

    try {
      // Get all plugins and find the matching one
      const plugins = await this.getAllPlugins();
      const plugin = plugins.find(p => 
        (p.manifest?.id === pluginId || p.id === pluginId) && p.status === 'running'
      );

      if (!plugin) {
        return {
          content: [{ type: 'text', text: `Plugin not found or not running: ${pluginId}` }],
          isError: true,
        };
      }

      // Handle based on runtime type
      if (plugin.runtime === 'container' && plugin.hostPort) {
        const result = await this.callDockerPlugin(plugin.hostPort, method.toUpperCase(), path, args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      if (plugin.runtime === 'embedded') {
        // Get function name from path
        const functionName = path.slice(1).replace(/\//g, '_');
        const result = await embeddedPluginService.invoke(pluginId, functionName, args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      if (plugin.runtime === 'gateway') {
        // Gateway plugins proxy to external services
        const baseUrl = plugin.manifest?.gateway?.baseUrl;
        if (baseUrl) {
          const result = await this.callGatewayPlugin(baseUrl, method.toUpperCase(), path, args);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
      }

      return {
        content: [{ type: 'text', text: `Unsupported runtime type: ${plugin.runtime}` }],
        isError: true,
      };
    } catch (error) {
      const err = error as Error;
      logger.error({ error: err, pluginId, path }, 'MCP tool call failed');
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }

  /**
   * Call a Docker-based plugin
   */
  private async callDockerPlugin(hostPort: number, method: string, path: string, args: Record<string, unknown>): Promise<unknown> {
    const url = `http://localhost:${hostPort}${path}`;

    const response = await axios({
      method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
      url,
      data: method !== 'GET' ? args : undefined,
      params: method === 'GET' ? args : undefined,
      timeout: 30000,
    });

    return response.data;
  }

  /**
   * Call a gateway plugin (proxy to external service)
   */
  private async callGatewayPlugin(baseUrl: string, method: string, path: string, args: Record<string, unknown>): Promise<unknown> {
    const url = `${baseUrl}${path}`;

    const response = await axios({
      method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
      url,
      data: method !== 'GET' ? args : undefined,
      params: method === 'GET' ? args : undefined,
      timeout: 30000,
    });

    return response.data;
  }

  /**
   * List all available resources (plugin metadata, schemas)
   */
  private async handleResourcesList(): Promise<{ resources: MCPResource[] }> {
    const resources: MCPResource[] = [];

    // Add server info resource
    resources.push({
      uri: 'leforge://server/info',
      name: 'LeForge Server Info',
      description: 'Information about this LeForge instance',
      mimeType: 'application/json',
    });

    // Add plugin resources
    const plugins = await this.getAllPlugins();
    for (const plugin of plugins) {
      resources.push({
        uri: `leforge://plugins/${plugin.id}`,
        name: plugin.name,
        description: plugin.description || 'ForgeHook plugin',
        mimeType: 'application/json',
      });
    }

    // Add registry items as resources
    const registryItems = registryService.listPlugins();
    for (const item of registryItems) {
      if (!resources.find(r => r.uri === `leforge://registry/${item.id}`)) {
        resources.push({
          uri: `leforge://registry/${item.id}`,
          name: item.manifest.name,
          description: item.manifest.description,
          mimeType: 'application/json',
        });
      }
    }

    return { resources };
  }

  /**
   * Read a specific resource
   */
  private async handleResourcesRead(params: { uri: string }): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
    const { uri } = params;

    if (uri === 'leforge://server/info') {
      const plugins = await this.getAllPlugins();
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            ...this.serverInfo,
            plugins: {
              total: plugins.length,
              running: plugins.filter(p => p.status === 'running').length,
              byRuntime: {
                container: plugins.filter(p => p.runtime === 'container').length,
                embedded: plugins.filter(p => p.runtime === 'embedded').length,
                gateway: plugins.filter(p => p.runtime === 'gateway').length,
              },
            },
            registry: registryService.listPlugins().length,
          }, null, 2),
        }],
      };
    }

    // Plugin resource
    const pluginMatch = uri.match(/^leforge:\/\/plugins\/(.+)$/);
    if (pluginMatch) {
      const pluginId = pluginMatch[1];
      const plugins = await this.getAllPlugins();
      const plugin = plugins.find(p => p.id === pluginId);
      
      if (plugin) {
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(plugin, null, 2),
          }],
        };
      }
    }

    // Registry resource
    const registryMatch = uri.match(/^leforge:\/\/registry\/(.+)$/);
    if (registryMatch) {
      const itemId = registryMatch[1];
      const item = registryService.getPlugin(itemId);
      if (item) {
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(item, null, 2),
          }],
        };
      }
    }

    throw new Error(`Resource not found: ${uri}`);
  }

  /**
   * List available prompts (pre-built templates for common tasks)
   */
  private async handlePromptsList(): Promise<{ prompts: MCPPrompt[] }> {
    const prompts: MCPPrompt[] = [
      {
        name: 'list-plugins',
        description: 'Get a summary of all available LeForge plugins and their capabilities',
      },
      {
        name: 'plugin-help',
        description: 'Get detailed help for a specific plugin',
        arguments: [
          {
            name: 'plugin_id',
            description: 'The ID of the plugin to get help for',
            required: true,
          },
        ],
      },
      {
        name: 'workflow-builder',
        description: 'Help design a workflow using available ForgeHooks',
        arguments: [
          {
            name: 'goal',
            description: 'What you want the workflow to accomplish',
            required: true,
          },
        ],
      },
    ];

    return { prompts };
  }

  /**
   * Get a specific prompt with arguments filled in
   */
  private async handlePromptsGet(params: { name: string; arguments?: Record<string, string> }): Promise<{ description: string; messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }> }> {
    const { name, arguments: args } = params;

    switch (name) {
      case 'list-plugins': {
        const plugins = await this.getAllPlugins();
        
        // Group by runtime
        const byRuntime: Record<string, PluginInfo[]> = {
          container: [],
          embedded: [],
          gateway: [],
        };
        
        for (const p of plugins) {
          if (byRuntime[p.runtime]) {
            byRuntime[p.runtime].push(p);
          }
        }

        let pluginList = '## Available LeForge Plugins\n\n';
        
        if (byRuntime.container.length > 0) {
          pluginList += '### Container Plugins\n';
          for (const p of byRuntime.container) {
            pluginList += `- **${p.name}** (${p.status}): ${p.description || 'No description'}\n`;
          }
          pluginList += '\n';
        }

        if (byRuntime.embedded.length > 0) {
          pluginList += '### Embedded Plugins (Zero-Latency)\n';
          for (const p of byRuntime.embedded) {
            pluginList += `- **${p.name}** (${p.status}): ${p.description || 'No description'}\n`;
          }
          pluginList += '\n';
        }

        if (byRuntime.gateway.length > 0) {
          pluginList += '### Gateway Plugins (Local AI)\n';
          for (const p of byRuntime.gateway) {
            pluginList += `- **${p.name}** (${p.status}): ${p.description || 'No description'}\n`;
          }
          pluginList += '\n';
        }

        return {
          description: 'List of all LeForge plugins',
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `Here are the available LeForge plugins:\n\n${pluginList}\nUse these plugins by calling their tools. Each plugin exposes endpoints as MCP tools.`,
            },
          }],
        };
      }

      case 'plugin-help': {
        const pluginId = args?.plugin_id;
        if (!pluginId) {
          throw new Error('plugin_id argument is required');
        }

        const plugins = await this.getAllPlugins();
        const plugin = plugins.find(p => p.id === pluginId || p.manifest?.id === pluginId);
        
        if (!plugin) {
          throw new Error(`Plugin not found: ${pluginId}`);
        }

        const manifest = plugin.manifest;
        let helpText = `# ${plugin.name}\n\n`;
        helpText += `${plugin.description || 'No description'}\n\n`;
        helpText += `**Runtime:** ${plugin.runtime}\n`;
        helpText += `**Version:** ${manifest?.version || 'unknown'}\n`;
        helpText += `**Category:** ${manifest?.category || 'unknown'}\n\n`;
        
        const endpoints = manifest?.endpoints || [];
        if (endpoints.length > 0) {
          helpText += '## Endpoints\n\n';
          for (const ep of endpoints) {
            helpText += `### ${ep.method} ${ep.path}\n`;
            helpText += `${ep.description || 'No description'}\n\n`;
            
            // Show requestBody schema if available
            if (ep.requestBody && typeof ep.requestBody === 'object') {
              const body = ep.requestBody as Record<string, unknown>;
              if (body.properties) {
                helpText += '**Request Body:**\n```json\n';
                helpText += JSON.stringify(body, null, 2);
                helpText += '\n```\n\n';
              }
            }
          }
        }

        return {
          description: `Help for ${plugin.name}`,
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: helpText,
            },
          }],
        };
      }

      case 'workflow-builder': {
        const goal = args?.goal;
        if (!goal) {
          throw new Error('goal argument is required');
        }

        const plugins = await this.getAllPlugins();
        const pluginSummary = plugins
          .filter(p => p.status === 'running')
          .map(p => `- ${p.name} (${p.manifest?.category || 'unknown'}): ${p.description}`)
          .join('\n');

        return {
          description: 'Workflow builder assistant',
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `I want to build a workflow to: ${goal}\n\nAvailable ForgeHooks:\n${pluginSummary}\n\nPlease suggest which plugins to use and in what order to accomplish this goal.`,
            },
          }],
        };
      }

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  }

  /**
   * Get server info for external access
   */
  getServerInfo(): MCPServerInfo {
    return this.serverInfo;
  }
}

export const mcpService = new MCPService();
