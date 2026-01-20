import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import * as vm from 'vm';
import { logger } from '../utils/logger.js';
import {
  ForgeHookManifest,
  EmbeddedPluginModule,
  EmbeddedFunction,
  EmbeddedExecutionContext,
  EmbeddedInvocationResult,
  PluginInstance,
} from '../types/index.js';
import { databaseService } from './database.service.js';

/**
 * Embedded Plugin Service
 * Handles loading, sandboxing, and execution of embedded JavaScript plugins
 * These plugins run in-process without Docker containers for lightweight utilities
 */
export class EmbeddedPluginService extends EventEmitter {
  private loadedModules: Map<string, EmbeddedPluginModule> = new Map();
  private readonly DEFAULT_TIMEOUT = 5000; // 5 seconds
  private readonly DEFAULT_MEMORY_LIMIT = 128; // 128 MB
  private readonly MAX_INVOCATIONS_PER_MINUTE = 1000;

  constructor() {
    super();
    logger.info('Embedded plugin service initialized');
  }

  // ==========================================================================
  // Plugin Lifecycle
  // ==========================================================================

  /**
   * Load an embedded plugin from its code
   */
  async loadPlugin(
    pluginId: string,
    manifest: ForgeHookManifest,
    moduleCode: string
  ): Promise<EmbeddedPluginModule> {
    if (!manifest.embedded) {
      throw new Error(`Plugin ${pluginId} is not an embedded plugin`);
    }

    logger.info({ pluginId, name: manifest.name }, 'Loading embedded plugin');

    try {
      // Create a sandboxed context
      const sandbox = this.createSandbox(pluginId);
      const context = vm.createContext(sandbox);

      // Execute the module code in the sandbox
      const script = new vm.Script(moduleCode, {
        filename: `${pluginId}/${manifest.embedded.entrypoint}`,
      });

      script.runInContext(context, {
        timeout: this.DEFAULT_TIMEOUT,
      });

      // Extract exported functions
      const exports = new Map<string, EmbeddedFunction>();
      const moduleExports = sandbox.module?.exports || {};

      for (const exportName of manifest.embedded.exports) {
        if (typeof moduleExports[exportName] === 'function') {
          exports.set(exportName, {
            name: exportName,
            handler: this.wrapFunction(pluginId, exportName, moduleExports[exportName], context),
          });
        } else {
          logger.warn(
            { pluginId, exportName },
            'Expected function export not found or not a function'
          );
        }
      }

      if (exports.size === 0) {
        throw new Error(`No valid function exports found in plugin ${pluginId}`);
      }

      const module: EmbeddedPluginModule = {
        pluginId,
        exports,
        loadedAt: new Date(),
        invocationCount: 0,
      };

      this.loadedModules.set(pluginId, module);

      logger.info(
        { pluginId, exports: Array.from(exports.keys()) },
        'Embedded plugin loaded successfully'
      );

      return module;

    } catch (error) {
      logger.error({ error, pluginId }, 'Failed to load embedded plugin');
      throw error;
    }
  }

  /**
   * Unload an embedded plugin
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const module = this.loadedModules.get(pluginId);
    if (!module) {
      logger.warn({ pluginId }, 'Plugin not loaded, nothing to unload');
      return;
    }

    this.loadedModules.delete(pluginId);
    logger.info({ pluginId }, 'Embedded plugin unloaded');
  }

  /**
   * Check if a plugin is loaded
   */
  isLoaded(pluginId: string): boolean {
    return this.loadedModules.has(pluginId);
  }

  /**
   * Get loaded module info
   */
  getModule(pluginId: string): EmbeddedPluginModule | undefined {
    return this.loadedModules.get(pluginId);
  }

  /**
   * List all loaded plugins
   */
  listLoadedPlugins(): string[] {
    return Array.from(this.loadedModules.keys());
  }

  // ==========================================================================
  // Function Invocation
  // ==========================================================================

  /**
   * Invoke a function from an embedded plugin
   */
  async invoke(
    pluginId: string,
    functionName: string,
    input: unknown,
    config?: Record<string, unknown>
  ): Promise<EmbeddedInvocationResult> {
    const startTime = Date.now();
    const requestId = randomUUID();

    const module = this.loadedModules.get(pluginId);
    if (!module) {
      return {
        success: false,
        error: `Plugin ${pluginId} is not loaded`,
        executionTime: Date.now() - startTime,
      };
    }

    const func = module.exports.get(functionName);
    if (!func) {
      return {
        success: false,
        error: `Function ${functionName} not found in plugin ${pluginId}`,
        executionTime: Date.now() - startTime,
      };
    }

    // Get plugin config from database if not provided
    const pluginConfig = config || await this.getPluginConfig(pluginId);

    const context: EmbeddedExecutionContext = {
      pluginId,
      functionName,
      requestId,
      timeout: this.DEFAULT_TIMEOUT,
      config: pluginConfig,
    };

    try {
      logger.debug({ pluginId, functionName, requestId }, 'Invoking embedded function');

      const result = await Promise.race([
        func.handler(input, context),
        this.createTimeoutPromise(context.timeout),
      ]);

      module.invocationCount++;
      module.lastInvoked = new Date();

      const executionTime = Date.now() - startTime;

      logger.debug(
        { pluginId, functionName, requestId, executionTime },
        'Embedded function completed'
      );

      return {
        success: true,
        result,
        executionTime,
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(
        { error, pluginId, functionName, requestId, executionTime },
        'Embedded function failed'
      );

      return {
        success: false,
        error: errorMessage,
        executionTime,
      };
    }
  }

  /**
   * Get available functions for a plugin
   */
  getFunctions(pluginId: string): string[] {
    const module = this.loadedModules.get(pluginId);
    return module ? Array.from(module.exports.keys()) : [];
  }

  // ==========================================================================
  // Health & Status
  // ==========================================================================

  /**
   * Check health of an embedded plugin
   */
  async checkHealth(pluginId: string): Promise<{
    healthy: boolean;
    details: {
      loaded: boolean;
      exports: string[];
      invocationCount: number;
      lastInvoked?: Date;
      loadedAt?: Date;
    };
  }> {
    const module = this.loadedModules.get(pluginId);

    if (!module) {
      return {
        healthy: false,
        details: {
          loaded: false,
          exports: [],
          invocationCount: 0,
        },
      };
    }

    return {
      healthy: true,
      details: {
        loaded: true,
        exports: Array.from(module.exports.keys()),
        invocationCount: module.invocationCount,
        lastInvoked: module.lastInvoked,
        loadedAt: module.loadedAt,
      },
    };
  }

  // ==========================================================================
  // Installation Helpers
  // ==========================================================================

  /**
   * Install an embedded plugin
   */
  async installPlugin(
    manifest: ForgeHookManifest,
    moduleCode: string,
    config?: Record<string, unknown>
  ): Promise<PluginInstance> {
    if (!manifest.embedded) {
      throw new Error('Manifest does not contain embedded plugin configuration');
    }

    const pluginId = randomUUID();

    // Create plugin instance record
    const plugin: PluginInstance = {
      id: pluginId,
      forgehookId: manifest.id,
      manifest,
      status: 'installing',
      runtime: 'embedded',
      config: config || {},
      environment: {},
      installedAt: new Date(),
      moduleExports: manifest.embedded.exports,
    };

    // Save to database
    await databaseService.createPlugin(plugin);

    try {
      // Load the plugin
      await this.loadPlugin(manifest.id, manifest, moduleCode);

      // Update status
      await databaseService.updatePlugin(pluginId, {
        status: 'running',
        startedAt: new Date(),
        healthStatus: 'healthy',
      });

      plugin.status = 'running';
      plugin.moduleLoaded = true;

      logger.info({ pluginId, forgehookId: manifest.id }, 'Embedded plugin installed');

      return plugin;

    } catch (error) {
      await databaseService.updatePlugin(pluginId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Installation failed',
      });
      throw error;
    }
  }

  /**
   * Start an embedded plugin (load it into memory)
   */
  async startPlugin(pluginId: string): Promise<void> {
    const plugin = await databaseService.getPlugin(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (plugin.runtime !== 'embedded') {
      throw new Error(`Plugin ${pluginId} is not an embedded plugin`);
    }

    // TODO: Fetch module code from storage
    // For now, embedded plugins must be reloaded from package
    logger.info({ pluginId }, 'Starting embedded plugin');

    await databaseService.updatePlugin(pluginId, {
      status: 'running',
      startedAt: new Date(),
    });
  }

  /**
   * Stop an embedded plugin (unload from memory)
   */
  async stopPlugin(pluginId: string): Promise<void> {
    const plugin = await databaseService.getPlugin(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    await this.unloadPlugin(plugin.forgehookId);

    await databaseService.updatePlugin(pluginId, {
      status: 'stopped',
      stoppedAt: new Date(),
    });

    logger.info({ pluginId }, 'Embedded plugin stopped');
  }

  // ==========================================================================
  // Sandbox Creation
  // ==========================================================================

  /**
   * Create a sandboxed environment for plugin execution
   */
  private createSandbox(pluginId: string): vm.Context {
    // Safe built-ins
    const sandbox: Record<string, unknown> = {
      // Module system
      module: { exports: {} },
      exports: {},

      // Console (limited)
      console: {
        log: (...args: unknown[]) => logger.debug({ pluginId, args }, 'Plugin console.log'),
        warn: (...args: unknown[]) => logger.warn({ pluginId, args }, 'Plugin console.warn'),
        error: (...args: unknown[]) => logger.error({ pluginId, args }, 'Plugin console.error'),
        info: (...args: unknown[]) => logger.info({ pluginId, args }, 'Plugin console.info'),
      },

      // Safe globals
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      WeakMap,
      WeakSet,
      Promise,
      Symbol,
      Error,
      TypeError,
      RangeError,
      SyntaxError,

      // Safe utilities
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURI,
      decodeURI,
      encodeURIComponent,
      decodeURIComponent,
      atob: (str: string) => Buffer.from(str, 'base64').toString('utf-8'),
      btoa: (str: string) => Buffer.from(str, 'utf-8').toString('base64'),

      // Timing (sandboxed)
      setTimeout: undefined, // Disabled for security
      setInterval: undefined,
      setImmediate: undefined,

      // Explicitly undefined dangerous globals
      process: undefined,
      require: undefined,
      global: undefined,
      globalThis: undefined,
      eval: undefined,
      Function: undefined,
      Proxy: undefined,
      Reflect: undefined,
    };

    return sandbox;
  }

  /**
   * Wrap a function to ensure it runs in sandbox context
   */
  private wrapFunction(
    pluginId: string,
    functionName: string,
    fn: Function,
    context: vm.Context
  ): (input: unknown, execContext: EmbeddedExecutionContext) => Promise<unknown> {
    return async (input: unknown, execContext: EmbeddedExecutionContext) => {
      try {
        // Call the function within the sandbox context
        const result = fn.call(context, input, execContext.config);

        // Handle async functions
        if (result instanceof Promise) {
          return await result;
        }

        return result;
      } catch (error) {
        throw error;
      }
    };
  }

  /**
   * Create a timeout promise for execution limits
   */
  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Execution timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Get plugin configuration from database
   */
  private async getPluginConfig(pluginId: string): Promise<Record<string, unknown>> {
    const plugins = await databaseService.listPlugins();
    const plugin = plugins.find(p => p.forgehookId === pluginId);
    return plugin?.config || {};
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Shutdown service and unload all plugins
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down embedded plugin service');

    for (const pluginId of this.loadedModules.keys()) {
      await this.unloadPlugin(pluginId);
    }

    this.loadedModules.clear();
    logger.info('Embedded plugin service shutdown complete');
  }
}

// Singleton instance
export const embeddedPluginService = new EmbeddedPluginService();
