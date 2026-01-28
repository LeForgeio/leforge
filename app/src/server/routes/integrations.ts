import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { integrationsService, UpdateIntegrationRequest, CreateIntegrationRequest } from '../services/integrations.service.js';
import { logger } from '../utils/logger.js';

interface IntegrationParams {
  integrationId: string;
}

// Platform connector types for the connectors catalog
interface ConnectorAction {
  name: string;
  method: string;
  path: string;
  description: string;
}

// Connector category types
type ConnectorCategory = 
  | 'workflow'           // Workflow actions/connectors
  | 'form-plugin'        // Form controls and plugins 
  | 'form-control'       // UI form controls
  | 'data-access'        // Data access objects (SmartObjects, Service Brokers)
  | 'service-broker'     // Service broker/REST integration
  | 'custom-connector'   // Custom API connectors
  | 'component'          // Reusable UI components
  | 'node';              // Automation nodes

interface PlatformConnector {
  id: string;
  name: string;
  category: ConnectorCategory;
  pluginId: string;
  pluginName: string;
  downloadUrl?: string;
  documentationUrl?: string;
  repositoryUrl?: string;
  setupSteps?: string[];
  actions?: ConnectorAction[];
  formEvents?: string[];       // For form plugins: events they can hook into
  dataOperations?: string[];   // For data access: CRUD operations supported
  controlType?: string;        // For form controls: text, dropdown, grid, etc.
}

interface Platform {
  id: string;
  name: string;
  format: string;
  description: string;
  status: 'ready' | 'in-development' | 'planned';
  documentationUrl?: string;
  categories: {
    workflow?: boolean;
    formPlugins?: boolean;
    formControls?: boolean;
    dataAccess?: boolean;
  };
  connectors: PlatformConnector[];
}

// Static platform connectors catalog
const PLATFORM_CONNECTORS: Platform[] = [
  // ============================================================================
  // Nintex Forms (Form Plugins)
  // ============================================================================
  {
    id: 'nintex-forms',
    name: 'Nintex Forms',
    format: 'Form Plugins (JavaScript)',
    description: 'Extend Nintex Forms with custom controls, validators, and data integrations using LeForge services.',
    status: 'in-development',
    documentationUrl: 'https://help.nintex.com/en-US/formplugins/Home.htm',
    categories: {
      formPlugins: true,
      formControls: true,
      dataAccess: true,
    },
    connectors: [
      // Form Plugin - AI Text Assistant
      {
        id: 'nf-ai-text-plugin',
        name: 'AI Text Assistant Plugin',
        category: 'form-plugin',
        pluginId: 'llm-service',
        pluginName: 'LLM Service',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-forms/plugins/AiTextAssistant',
        documentationUrl: 'https://help.nintex.com/en-US/formplugins/Reference/PluginClass.htm',
        setupSteps: [
          'Download the plugin JavaScript file',
          'In Nintex Forms designer, go to Form Settings > Custom JavaScript',
          'Upload or paste the plugin code',
          'Configure the LeForge endpoint URL and API key',
          'Use NWC.FormPlugins.register() to activate the plugin',
        ],
        formEvents: ['NWC.FormReady', 'NWC.BeforeSave', 'NWC.AfterSave', 'NWC.ControlChange'],
        actions: [
          { name: 'Auto-complete text', method: 'POST', path: '/generate', description: 'AI-powered text completion for form fields' },
          { name: 'Summarize content', method: 'POST', path: '/summarize', description: 'Summarize long text inputs' },
          { name: 'Translate text', method: 'POST', path: '/translate', description: 'Translate form text to other languages' },
        ],
      },
      // Form Plugin - Smart Validator
      {
        id: 'nf-smart-validator',
        name: 'Smart Validator Plugin',
        category: 'form-plugin',
        pluginId: 'data-transform-service',
        pluginName: 'Data Transform',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-forms/plugins/SmartValidator',
        formEvents: ['NWC.BeforeSave', 'NWC.ControlChange'],
        actions: [
          { name: 'Validate email format', method: 'POST', path: '/validate/email', description: 'Advanced email validation' },
          { name: 'Validate address', method: 'POST', path: '/validate/address', description: 'Address standardization and validation' },
          { name: 'Validate phone', method: 'POST', path: '/validate/phone', description: 'International phone number validation' },
        ],
      },
      // Form Plugin - Formula Engine
      {
        id: 'nf-formula-plugin',
        name: 'Formula Engine Plugin',
        category: 'form-plugin',
        pluginId: 'formula-engine',
        pluginName: 'Formula Engine',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-forms/plugins/FormulaEngine',
        formEvents: ['NWC.ControlChange', 'NWC.FormReady'],
        actions: [
          { name: 'Calculate formula', method: 'POST', path: '/evaluate', description: 'Excel-style formula evaluation' },
          { name: 'Date calculation', method: 'POST', path: '/date-calc', description: 'Business day calculations' },
        ],
      },
      // Form Control - AI Chatbot
      {
        id: 'nf-chatbot-control',
        name: 'AI Chatbot Control',
        category: 'form-control',
        pluginId: 'llm-service',
        pluginName: 'LLM Service',
        controlType: 'custom-control',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-forms/controls/AiChatbot',
        setupSteps: [
          'Add a Panel control to your form',
          'Apply the chatbot CSS and JavaScript',
          'Configure the chat endpoint and context',
          'Users can interact with AI within the form',
        ],
        actions: [
          { name: 'Send message', method: 'POST', path: '/chat', description: 'Send chat message and get AI response' },
          { name: 'Get suggestions', method: 'POST', path: '/suggestions', description: 'Get contextual suggestions' },
        ],
      },
      // Data Access - External Data Plugin
      {
        id: 'nf-data-lookup',
        name: 'LeForge Data Lookup',
        category: 'data-access',
        pluginId: 'gateway',
        pluginName: 'LeForge Gateway',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-forms/plugins/DataLookup',
        dataOperations: ['read', 'search'],
        formEvents: ['NWC.ControlChange'],
        actions: [
          { name: 'Lookup data', method: 'GET', path: '/lookup', description: 'Fetch external data for dropdowns/lookups' },
          { name: 'Search records', method: 'POST', path: '/search', description: 'Search external data sources' },
        ],
      },
    ],
  },

  // ============================================================================
  // Nintex K2 (Service Brokers, SmartObjects, Form Controls)
  // ============================================================================
  {
    id: 'nintex-k2',
    name: 'Nintex K2',
    format: 'Service Brokers + SmartObjects + Form Controls',
    description: 'Full K2 integration with Service Brokers for data access, SmartObjects for data modeling, and custom SmartForm controls.',
    status: 'in-development',
    documentationUrl: 'https://help.nintex.com/en-US/nintexautomation/devref/current/Content/WelcomeLandingPages/NintexK2Landing.htm',
    categories: {
      workflow: true,
      formControls: true,
      dataAccess: true,
    },
    connectors: [
      // Service Broker - LeForge REST
      {
        id: 'k2-LeForge-broker',
        name: 'LeForge REST Service Broker',
        category: 'service-broker',
        pluginId: 'gateway',
        pluginName: 'LeForge Gateway',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-k2/service-brokers/LeForgeRest',
        documentationUrl: 'https://help.nintex.com/en-US/nintexautomation/devref/current/Content/Extend/DeveloperReference/CustomServiceBrokers/CustomServiceBrokers.htm',
        setupSteps: [
          'Deploy the Service Broker DLL to K2 blackpearl server',
          'Register the Service Broker in K2 Management',
          'Create a Service Instance with your LeForge endpoint',
          'Configure authentication with API key',
          'Service Objects will be available for SmartObject creation',
        ],
        dataOperations: ['create', 'read', 'update', 'delete', 'execute'],
        actions: [
          { name: 'Execute Plugin', method: 'POST', path: '/execute', description: 'Execute any LeForge plugin' },
          { name: 'List Services', method: 'GET', path: '/services', description: 'Get available LeForge services' },
        ],
      },
      // SmartObject - LLM Service
      {
        id: 'k2-llm-smartobject',
        name: 'LLM Service SmartObject',
        category: 'data-access',
        pluginId: 'llm-service',
        pluginName: 'LLM Service',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-k2/smartobjects/LlmService',
        documentationUrl: 'https://help.nintex.com/en-US/nintexautomation/devref/current/Content/Extend/DeveloperReference/SmOnlineHelpDevelopersReference/SmartObjectsOverview.htm',
        dataOperations: ['execute'],
        setupSteps: [
          'Import the SmartObject definition into K2 Designer',
          'Configure the LeForge Service Instance',
          'Map input/output properties',
          'Use in workflows or SmartForms',
        ],
        actions: [
          { name: 'ChatCompletion', method: 'POST', path: '/chat', description: 'Generate AI chat response' },
          { name: 'TextGeneration', method: 'POST', path: '/generate', description: 'Generate text from prompt' },
          { name: 'CreateEmbeddings', method: 'POST', path: '/embeddings', description: 'Generate vector embeddings' },
          { name: 'Summarize', method: 'POST', path: '/summarize', description: 'Summarize text content' },
        ],
      },
      // SmartObject - Crypto Service
      {
        id: 'k2-crypto-smartobject',
        name: 'Crypto Service SmartObject',
        category: 'data-access',
        pluginId: 'crypto-service',
        pluginName: 'Crypto Service',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-k2/smartobjects/CryptoService',
        dataOperations: ['execute'],
        actions: [
          { name: 'Encrypt', method: 'POST', path: '/encrypt', description: 'Encrypt sensitive data' },
          { name: 'Decrypt', method: 'POST', path: '/decrypt', description: 'Decrypt encrypted data' },
          { name: 'Hash', method: 'POST', path: '/hash', description: 'Generate cryptographic hash' },
          { name: 'SignJWT', method: 'POST', path: '/jwt/sign', description: 'Sign a JWT token' },
          { name: 'VerifyJWT', method: 'POST', path: '/jwt/verify', description: 'Verify JWT token' },
        ],
      },
      // SmartObject - Formula Engine
      {
        id: 'k2-formula-smartobject',
        name: 'Formula Engine SmartObject',
        category: 'data-access',
        pluginId: 'formula-engine',
        pluginName: 'Formula Engine',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-k2/smartobjects/FormulaEngine',
        dataOperations: ['execute'],
        actions: [
          { name: 'EvaluateFormula', method: 'POST', path: '/evaluate', description: 'Evaluate Excel-style formula' },
          { name: 'VLOOKUP', method: 'POST', path: '/vlookup', description: 'Perform VLOOKUP operation' },
          { name: 'SUMIF', method: 'POST', path: '/sumif', description: 'Sum values matching criteria' },
        ],
      },
      // Form Control - AI Text Input
      {
        id: 'k2-ai-textbox',
        name: 'AI-Enhanced TextBox Control',
        category: 'form-control',
        pluginId: 'llm-service',
        pluginName: 'LLM Service',
        controlType: 'textbox',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-k2/controls/AiTextBox',
        documentationUrl: 'https://help.nintex.com/en-US/nintexautomation/devref/current/Content/Extend/DeveloperReference/SmartForms/CustomFormControlDevelopment.htm',
        setupSteps: [
          'Deploy the control assembly to K2 server',
          'Register in K2 Designer control toolbox',
          'Drag control onto SmartForm canvas',
          'Configure AI settings and endpoint',
        ],
        actions: [
          { name: 'Auto-complete', method: 'POST', path: '/complete', description: 'AI text auto-completion' },
          { name: 'Spell check', method: 'POST', path: '/spellcheck', description: 'AI-powered spell checking' },
        ],
      },
      // Form Control - Smart Lookup
      {
        id: 'k2-smart-lookup',
        name: 'Smart Lookup Control',
        category: 'form-control',
        pluginId: 'gateway',
        pluginName: 'LeForge Gateway',
        controlType: 'dropdown',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-k2/controls/SmartLookup',
        setupSteps: [
          'Deploy the control to K2 server',
          'Add to SmartForm and bind to SmartObject',
          'Configure search settings and display',
        ],
        actions: [
          { name: 'Search', method: 'POST', path: '/search', description: 'Fuzzy search with AI ranking' },
          { name: 'Get suggestions', method: 'GET', path: '/suggest', description: 'Type-ahead suggestions' },
        ],
      },
      // Form Control - Document Viewer
      {
        id: 'k2-doc-viewer',
        name: 'Document Viewer Control',
        category: 'form-control',
        pluginId: 'pdf-service',
        pluginName: 'PDF Service',
        controlType: 'viewer',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-k2/controls/DocumentViewer',
        actions: [
          { name: 'Render PDF', method: 'GET', path: '/render', description: 'Render PDF in browser' },
          { name: 'Extract text', method: 'POST', path: '/extract', description: 'Extract text from document' },
        ],
      },
    ],
  },

  // ============================================================================
  // Nintex Workflow Cloud (Xtensions)
  // ============================================================================
  {
    id: 'nintex-cloud',
    name: 'Nintex Workflow Cloud',
    format: 'OpenAPI Xtension',
    description: 'Extend Nintex Workflow Cloud with LeForge AI and data processing capabilities.',
    status: 'ready',
    documentationUrl: 'https://help.nintex.com/en-US/xtensions/Home.htm',
    categories: {
      workflow: true,
    },
    connectors: [
      {
        id: 'nwc-llm-service',
        name: 'LLM Service Xtension',
        category: 'workflow',
        pluginId: 'llm-service',
        pluginName: 'LLM Service',
        downloadUrl: 'https://raw.githubusercontent.com/LeForgeio/registry/master/integrations/nintex-cloud/LlmService/xtension.json',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-cloud/LlmService',
        setupSteps: [
          'Download the Xtension JSON file',
          'Go to Nintex Workflow Cloud > Xtensions',
          'Click "Add custom connector" and upload the file',
          'Configure the connector with your LeForge URL and API key',
          'The actions will appear in the workflow designer',
        ],
        actions: [
          { name: 'AI Chat', method: 'POST', path: '/chat', description: 'Generate AI chat responses' },
          { name: 'Generate Text', method: 'POST', path: '/generate', description: 'Generate text content' },
          { name: 'Analyze Sentiment', method: 'POST', path: '/analyze', description: 'Analyze text sentiment' },
        ],
      },
      {
        id: 'nwc-formula-engine',
        name: 'Formula Engine Xtension',
        category: 'workflow',
        pluginId: 'formula-engine',
        pluginName: 'Formula Engine',
        downloadUrl: 'https://raw.githubusercontent.com/LeForgeio/registry/master/integrations/nintex-cloud/FormulaEngine/xtension.json',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-cloud/FormulaEngine',
        actions: [
          { name: 'Evaluate Formula', method: 'POST', path: '/evaluate', description: 'Run Excel-style formulas' },
          { name: 'Data Lookup', method: 'POST', path: '/lookup', description: 'Perform data lookups' },
        ],
      },
      {
        id: 'nwc-crypto-service',
        name: 'Crypto Service Xtension',
        category: 'workflow',
        pluginId: 'crypto-service',
        pluginName: 'Crypto Service',
        downloadUrl: 'https://raw.githubusercontent.com/LeForgeio/registry/master/integrations/nintex-cloud/CryptoService/xtension.json',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-cloud/CryptoService',
        actions: [
          { name: 'Encrypt Data', method: 'POST', path: '/encrypt', description: 'Encrypt sensitive data' },
          { name: 'Decrypt Data', method: 'POST', path: '/decrypt', description: 'Decrypt encrypted data' },
          { name: 'Generate Hash', method: 'POST', path: '/hash', description: 'Create secure hashes' },
        ],
      },
      {
        id: 'nwc-streaming-file',
        name: 'File Service Xtension',
        category: 'workflow',
        pluginId: 'streaming-file-service',
        pluginName: 'Streaming File Service',
        downloadUrl: 'https://raw.githubusercontent.com/LeForgeio/registry/master/integrations/nintex-cloud/StreamingFileService/xtension.json',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-cloud/StreamingFileService',
        actions: [
          { name: 'Process File', method: 'POST', path: '/process', description: 'Process and transform files' },
          { name: 'Extract Text', method: 'POST', path: '/extract', description: 'Extract text from documents' },
        ],
      },
      {
        id: 'nwc-gateway',
        name: 'Gateway Xtension',
        category: 'workflow',
        pluginId: 'gateway',
        pluginName: 'LeForge Gateway',
        downloadUrl: 'https://raw.githubusercontent.com/LeForgeio/registry/master/integrations/nintex-cloud/Gateway/xtension.json',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/nintex-cloud/Gateway',
        actions: [
          { name: 'List Services', method: 'GET', path: '/services', description: 'Get available LeForge services' },
          { name: 'Health Check', method: 'GET', path: '/health', description: 'Check LeForge status' },
        ],
      },
    ],
  },

  // ============================================================================
  // Power Platform (Power Automate + Power Apps)
  // ============================================================================
  {
    id: 'power-platform',
    name: 'Microsoft Power Platform',
    format: 'Custom Connectors + PCF Controls',
    description: 'Connect LeForge to Power Automate flows, Power Apps, and Dataverse with custom connectors and PCF components.',
    status: 'in-development',
    documentationUrl: 'https://learn.microsoft.com/en-us/connectors/custom-connectors/',
    categories: {
      workflow: true,
      formControls: true,
      dataAccess: true,
    },
    connectors: [
      // Custom Connector - LLM Service
      {
        id: 'pa-llm-service',
        name: 'LLM Service Connector',
        category: 'custom-connector',
        pluginId: 'llm-service',
        pluginName: 'LLM Service',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/power-platform/connectors/LlmService',
        documentationUrl: 'https://learn.microsoft.com/en-us/connectors/custom-connectors/define-openapi-definition',
        setupSteps: [
          'Download the connector package (apiDefinition.swagger.json)',
          'Go to Power Automate > Data > Custom Connectors',
          'Click "New custom connector" > "Import an OpenAPI file"',
          'Upload the connector file and configure security',
          'Create a connection with your LeForge API key',
        ],
        actions: [
          { name: 'Chat Completion', method: 'POST', path: '/chat', description: 'Generate AI chat responses' },
          { name: 'Text Generation', method: 'POST', path: '/generate', description: 'Generate text from a prompt' },
          { name: 'Create Embeddings', method: 'POST', path: '/embeddings', description: 'Generate vector embeddings' },
        ],
      },
      // Custom Connector - Formula Engine
      {
        id: 'pa-formula-engine',
        name: 'Formula Engine Connector',
        category: 'custom-connector',
        pluginId: 'formula-engine',
        pluginName: 'Formula Engine',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/power-platform/connectors/FormulaEngine',
        actions: [
          { name: 'Evaluate Formula', method: 'POST', path: '/evaluate', description: 'Evaluate an Excel-style formula' },
          { name: 'VLOOKUP', method: 'POST', path: '/vlookup', description: 'Perform a VLOOKUP operation' },
          { name: 'SUMIF', method: 'POST', path: '/sumif', description: 'Sum values matching criteria' },
        ],
      },
      // Custom Connector - Crypto Service
      {
        id: 'pa-crypto-service',
        name: 'Crypto Service Connector',
        category: 'custom-connector',
        pluginId: 'crypto-service',
        pluginName: 'Crypto Service',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/power-platform/connectors/CryptoService',
        actions: [
          { name: 'Encrypt', method: 'POST', path: '/encrypt', description: 'Encrypt data with AES-256' },
          { name: 'Decrypt', method: 'POST', path: '/decrypt', description: 'Decrypt AES-256 encrypted data' },
          { name: 'Hash', method: 'POST', path: '/hash', description: 'Generate cryptographic hash' },
          { name: 'Sign JWT', method: 'POST', path: '/jwt/sign', description: 'Create a signed JWT token' },
        ],
      },
      // PCF Control - AI Text Input
      {
        id: 'pa-ai-textinput',
        name: 'AI Text Input (PCF)',
        category: 'form-control',
        pluginId: 'llm-service',
        pluginName: 'LLM Service',
        controlType: 'textbox',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/power-platform/pcf/AiTextInput',
        documentationUrl: 'https://learn.microsoft.com/en-us/power-apps/developer/component-framework/overview',
        setupSteps: [
          'Download the PCF solution package (.zip)',
          'Import into your Power Apps environment',
          'Add the control to your Canvas or Model-driven app',
          'Configure LeForge connection in control properties',
        ],
        actions: [
          { name: 'Auto-complete', method: 'POST', path: '/complete', description: 'AI-powered text completion' },
          { name: 'Suggestions', method: 'POST', path: '/suggest', description: 'Get smart suggestions' },
        ],
      },
      // PCF Control - Document Scanner
      {
        id: 'pa-doc-scanner',
        name: 'Document Scanner (PCF)',
        category: 'form-control',
        pluginId: 'ocr-service',
        pluginName: 'OCR Service',
        controlType: 'scanner',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/power-platform/pcf/DocumentScanner',
        actions: [
          { name: 'Scan document', method: 'POST', path: '/scan', description: 'Scan and OCR documents' },
          { name: 'Extract fields', method: 'POST', path: '/extract', description: 'Extract form fields from images' },
        ],
      },
      // Virtual Table - LeForge Data
      {
        id: 'pa-virtual-table',
        name: 'LeForge Virtual Table',
        category: 'data-access',
        pluginId: 'gateway',
        pluginName: 'LeForge Gateway',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/power-platform/virtual-tables/LeForgeData',
        documentationUrl: 'https://learn.microsoft.com/en-us/power-apps/maker/data-platform/create-edit-virtual-entities',
        dataOperations: ['read', 'list'],
        setupSteps: [
          'Register the virtual table provider in Dataverse',
          'Create virtual table entity definition',
          'Configure LeForge endpoint and authentication',
          'Use in Power Apps like any Dataverse table',
        ],
        actions: [
          { name: 'Get records', method: 'GET', path: '/data', description: 'Retrieve records from LeForge' },
          { name: 'Query data', method: 'POST', path: '/query', description: 'Query with filters' },
        ],
      },
    ],
  },

  // ============================================================================
  // n8n
  // ============================================================================
  {
    id: 'n8n',
    name: 'n8n',
    format: 'Community Nodes (TypeScript)',
    description: 'Use LeForge nodes in your n8n self-hosted automation workflows.',
    status: 'in-development',
    documentationUrl: 'https://docs.n8n.io/integrations/community-nodes/',
    categories: {
      workflow: true,
    },
    connectors: [
      {
        id: 'n8n-LeForge',
        name: 'LeForge Node',
        category: 'node',
        pluginId: 'LeForge',
        pluginName: 'LeForge',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/n8n/nodes/LeForge',
        setupSteps: [
          'In n8n, go to Settings > Community Nodes',
          'Install n8n-nodes-LeForge package',
          'Create credentials with your LeForge URL and API key',
          'The LeForge node will be available in the workflow editor',
        ],
        actions: [
          { name: 'Execute Plugin', method: 'POST', path: '/execute', description: 'Call any LeForge plugin endpoint' },
          { name: 'List Plugins', method: 'GET', path: '/plugins', description: 'Get installed plugins' },
        ],
      },
      {
        id: 'n8n-llm-node',
        name: 'LeForge AI Node',
        category: 'node',
        pluginId: 'llm-service',
        pluginName: 'LLM Service',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/n8n/nodes/LeForgeAI',
        actions: [
          { name: 'Chat', method: 'POST', path: '/chat', description: 'AI chat completion' },
          { name: 'Generate', method: 'POST', path: '/generate', description: 'Text generation' },
          { name: 'Embeddings', method: 'POST', path: '/embeddings', description: 'Create embeddings' },
        ],
      },
    ],
  },

  // ============================================================================
  // Salesforce
  // ============================================================================
  {
    id: 'salesforce',
    name: 'Salesforce',
    format: 'External Services + Apex + LWC',
    description: 'Call LeForge services from Salesforce Flow Builder, Apex code, and Lightning Web Components.',
    status: 'planned',
    documentationUrl: 'https://developer.salesforce.com/docs/atlas.en-us.externalservices.meta/externalservices/',
    categories: {
      workflow: true,
      formControls: true,
      dataAccess: true,
    },
    connectors: [
      // External Service
      {
        id: 'sf-external-service',
        name: 'LeForge External Service',
        category: 'workflow',
        pluginId: 'gateway',
        pluginName: 'LeForge Gateway',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/salesforce/external-services/LeForge',
        setupSteps: [
          'Upload OpenAPI spec to Salesforce Setup > External Services',
          'Create Named Credential for LeForge endpoint',
          'Generate Apex classes from the spec',
          'Use invocable methods in Flow Builder',
        ],
        actions: [
          { name: 'Execute action', method: 'POST', path: '/execute', description: 'Execute LeForge plugin' },
        ],
      },
      // Apex Classes
      {
        id: 'sf-apex-wrapper',
        name: 'LeForge Apex Wrapper',
        category: 'data-access',
        pluginId: 'gateway',
        pluginName: 'LeForge Gateway',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/salesforce/apex/LeForgeWrapper',
        dataOperations: ['execute'],
        actions: [
          { name: 'callLeForge', method: 'POST', path: '/api', description: 'Generic LeForge API call' },
          { name: 'chatCompletion', method: 'POST', path: '/chat', description: 'AI chat completion' },
        ],
      },
      // Lightning Web Component
      {
        id: 'sf-lwc-ai-input',
        name: 'AI Input LWC',
        category: 'form-control',
        pluginId: 'llm-service',
        pluginName: 'LLM Service',
        controlType: 'textbox',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/salesforce/lwc/aiInput',
        actions: [
          { name: 'Auto-complete', method: 'POST', path: '/complete', description: 'AI text completion' },
        ],
      },
    ],
  },

  // ============================================================================
  // ServiceNow
  // ============================================================================
  {
    id: 'servicenow',
    name: 'ServiceNow',
    format: 'IntegrationHub Spoke + UI Components',
    description: 'Add LeForge capabilities to ServiceNow Flow Designer workflows and Service Portal widgets.',
    status: 'planned',
    documentationUrl: 'https://developer.servicenow.com/dev.do#!/reference/api/latest',
    categories: {
      workflow: true,
      formControls: true,
      dataAccess: true,
    },
    connectors: [
      // IntegrationHub Spoke
      {
        id: 'snow-spoke',
        name: 'LeForge Spoke',
        category: 'workflow',
        pluginId: 'gateway',
        pluginName: 'LeForge Gateway',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/servicenow/spoke/LeForge',
        setupSteps: [
          'Import the Spoke application into ServiceNow',
          'Configure Connection & Credential Alias',
          'Actions will appear in Flow Designer',
        ],
        actions: [
          { name: 'Execute Plugin', method: 'POST', path: '/execute', description: 'Execute LeForge plugin' },
          { name: 'AI Chat', method: 'POST', path: '/chat', description: 'AI chat completion' },
        ],
      },
      // Scripted REST API
      {
        id: 'snow-scripted-rest',
        name: 'LeForge Scripted REST',
        category: 'data-access',
        pluginId: 'gateway',
        pluginName: 'LeForge Gateway',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/servicenow/scripted-rest/LeForge',
        dataOperations: ['execute'],
      },
      // Service Portal Widget
      {
        id: 'snow-widget-ai',
        name: 'AI Assistant Widget',
        category: 'form-control',
        pluginId: 'llm-service',
        pluginName: 'LLM Service',
        controlType: 'widget',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/servicenow/widgets/AiAssistant',
      },
    ],
  },

  // ============================================================================
  // OutSystems
  // ============================================================================
  {
    id: 'outsystems',
    name: 'OutSystems',
    format: 'Forge Component + UI Blocks',
    description: 'Consume LeForge REST APIs in OutSystems applications with ready-to-use UI blocks.',
    status: 'planned',
    documentationUrl: 'https://success.outsystems.com/documentation/11/developing_an_application/integrate_with_external_systems/',
    categories: {
      workflow: true,
      formControls: true,
      dataAccess: true,
    },
    connectors: [
      // REST Integration
      {
        id: 'os-rest-integration',
        name: 'LeForge REST Integration',
        category: 'data-access',
        pluginId: 'gateway',
        pluginName: 'LeForge Gateway',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/outsystems/rest/LeForge',
        dataOperations: ['execute'],
        setupSteps: [
          'Import the Forge component into Service Studio',
          'Configure the REST endpoint and API key',
          'Use server actions in your application logic',
        ],
      },
      // UI Block - AI Input
      {
        id: 'os-ai-input-block',
        name: 'AI Input Block',
        category: 'form-control',
        pluginId: 'llm-service',
        pluginName: 'LLM Service',
        controlType: 'textbox',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/outsystems/blocks/AiInput',
      },
    ],
  },

  // ============================================================================
  // Mendix
  // ============================================================================
  {
    id: 'mendix',
    name: 'Mendix',
    format: 'Marketplace Module + Widgets',
    description: 'Integrate LeForge services into Mendix low-code applications with pluggable widgets.',
    status: 'planned',
    documentationUrl: 'https://docs.mendix.com/appstore/creating-content/connector-guide/',
    categories: {
      workflow: true,
      formControls: true,
      dataAccess: true,
    },
    connectors: [
      // Connector Module
      {
        id: 'mx-connector',
        name: 'LeForge Connector Module',
        category: 'data-access',
        pluginId: 'gateway',
        pluginName: 'LeForge Gateway',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/mendix/modules/LeForgeConnector',
        dataOperations: ['execute'],
        setupSteps: [
          'Download module from Mendix Marketplace',
          'Import into your Mendix project',
          'Configure constants for endpoint and API key',
          'Use microflow actions in your logic',
        ],
      },
      // Pluggable Widget - AI Chat
      {
        id: 'mx-ai-chat-widget',
        name: 'AI Chat Widget',
        category: 'form-control',
        pluginId: 'llm-service',
        pluginName: 'LLM Service',
        controlType: 'chat',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/mendix/widgets/AiChat',
        documentationUrl: 'https://docs.mendix.com/appstore/widgets/',
      },
    ],
  },

  // ============================================================================
  // Zapier
  // ============================================================================
  {
    id: 'zapier',
    name: 'Zapier',
    format: 'Zapier App',
    description: 'Connect LeForge to 5000+ apps with Zapier triggers and actions.',
    status: 'planned',
    documentationUrl: 'https://platform.zapier.com/build/how-zapier-works',
    categories: {
      workflow: true,
    },
    connectors: [
      {
        id: 'zapier-app',
        name: 'LeForge Zapier App',
        category: 'workflow',
        pluginId: 'gateway',
        pluginName: 'LeForge Gateway',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/zapier',
        actions: [
          { name: 'Execute Plugin', method: 'POST', path: '/execute', description: 'Run any LeForge plugin' },
          { name: 'AI Chat', method: 'POST', path: '/chat', description: 'AI chat completion' },
          { name: 'Transform Data', method: 'POST', path: '/transform', description: 'Transform data formats' },
        ],
      },
    ],
  },

  // ============================================================================
  // Make (Integromat)
  // ============================================================================
  {
    id: 'make',
    name: 'Make (Integromat)',
    format: 'Make App',
    description: 'Build complex LeForge integrations with Make\'s visual automation platform.',
    status: 'planned',
    documentationUrl: 'https://www.make.com/en/help/apps/app-development',
    categories: {
      workflow: true,
    },
    connectors: [
      {
        id: 'make-app',
        name: 'LeForge Make App',
        category: 'workflow',
        pluginId: 'gateway',
        pluginName: 'LeForge Gateway',
        repositoryUrl: 'https://github.com/LeForgeio/registry/tree/master/integrations/make',
        actions: [
          { name: 'Execute Plugin', method: 'POST', path: '/execute', description: 'Run any LeForge plugin' },
          { name: 'AI Operations', method: 'POST', path: '/ai', description: 'AI-powered operations' },
        ],
      },
    ],
  },
];

interface UpdateIntegrationBody {
  isEnabled?: boolean;
  config?: Record<string, unknown>;
}

interface CreateIntegrationBody {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  documentationUrl?: string;
  isEnabled?: boolean;
  config?: Record<string, unknown>;
}

/**
 * Integrations Management Routes
 * 
 * Provides endpoints for managing external integration settings.
 * Users can enable/disable integrations and configure them.
 */
export async function integrationsRoutes(fastify: FastifyInstance) {
  
  // ============================================================================
  // List Integrations
  // ============================================================================
  /**
   * GET /api/v1/integrations
   * List all integrations with their enabled status
   */
  fastify.get('/api/v1/integrations', async (_request: FastifyRequest, reply: FastifyReply) => {
    const integrations = await integrationsService.listIntegrations();
    
    return reply.send({
      integrations,
      total: integrations.length,
    });
  });

  // ============================================================================
  // Get Single Integration
  // ============================================================================
  /**
   * GET /api/v1/integrations/:integrationId
   * Get a single integration by ID
   */
  fastify.get<{ Params: IntegrationParams }>(
    '/api/v1/integrations/:integrationId',
    async (request: FastifyRequest<{ Params: IntegrationParams }>, reply: FastifyReply) => {
      const { integrationId } = request.params;
      
      const integration = await integrationsService.getIntegration(integrationId);
      
      if (!integration) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Integration '${integrationId}' not found`,
          },
        });
      }
      
      return reply.send({
        integration,
      });
    }
  );

  // ============================================================================
  // Update Integration
  // ============================================================================
  /**
   * PATCH /api/v1/integrations/:integrationId
   * Update integration settings (enable/disable, config)
   */
  fastify.patch<{ Params: IntegrationParams; Body: UpdateIntegrationBody }>(
    '/api/v1/integrations/:integrationId',
    async (request: FastifyRequest<{ Params: IntegrationParams; Body: UpdateIntegrationBody }>, reply: FastifyReply) => {
      const { integrationId } = request.params;
      const { isEnabled, config } = request.body;
      
      const updates: UpdateIntegrationRequest = {};
      
      if (isEnabled !== undefined) {
        updates.isEnabled = isEnabled;
      }
      
      if (config !== undefined) {
        updates.config = config;
      }

      const integration = await integrationsService.updateIntegration(integrationId, updates);
      
      if (!integration) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Integration '${integrationId}' not found`,
          },
        });
      }
      
      return reply.send({
        integration,
      });
    }
  );

  // ============================================================================
  // Enable Integration
  // ============================================================================
  /**
   * POST /api/v1/integrations/:integrationId/enable
   * Enable an integration
   */
  fastify.post<{ Params: IntegrationParams }>(
    '/api/v1/integrations/:integrationId/enable',
    async (request: FastifyRequest<{ Params: IntegrationParams }>, reply: FastifyReply) => {
      const { integrationId } = request.params;
      
      const integration = await integrationsService.enableIntegration(integrationId);
      
      if (!integration) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Integration '${integrationId}' not found`,
          },
        });
      }
      
      return reply.send({
        integration,
        message: `Integration '${integration.name}' enabled`,
      });
    }
  );

  // ============================================================================
  // Disable Integration
  // ============================================================================
  /**
   * POST /api/v1/integrations/:integrationId/disable
   * Disable an integration
   */
  fastify.post<{ Params: IntegrationParams }>(
    '/api/v1/integrations/:integrationId/disable',
    async (request: FastifyRequest<{ Params: IntegrationParams }>, reply: FastifyReply) => {
      const { integrationId } = request.params;
      
      const integration = await integrationsService.disableIntegration(integrationId);
      
      if (!integration) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Integration '${integrationId}' not found`,
          },
        });
      }
      
      return reply.send({
        integration,
        message: `Integration '${integration.name}' disabled`,
      });
    }
  );

  // ============================================================================
  // Toggle Integration
  // ============================================================================
  /**
   * POST /api/v1/integrations/:integrationId/toggle
   * Toggle an integration's enabled state
   */
  fastify.post<{ Params: IntegrationParams }>(
    '/api/v1/integrations/:integrationId/toggle',
    async (request: FastifyRequest<{ Params: IntegrationParams }>, reply: FastifyReply) => {
      const { integrationId } = request.params;
      
      const integration = await integrationsService.toggleIntegration(integrationId);
      
      if (!integration) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Integration '${integrationId}' not found`,
          },
        });
      }
      
      return reply.send({
        integration,
        message: `Integration '${integration.name}' ${integration.isEnabled ? 'enabled' : 'disabled'}`,
      });
    }
  );

  // ============================================================================
  // Create Custom Integration
  // ============================================================================
  /**
   * POST /api/v1/integrations
   * Create a new custom integration
   */
  fastify.post<{ Body: CreateIntegrationBody }>(
    '/api/v1/integrations',
    async (request: FastifyRequest<{ Body: CreateIntegrationBody }>, reply: FastifyReply) => {
      const { id, name, description, icon, documentationUrl, isEnabled, config } = request.body;
      
      if (!id || typeof id !== 'string' || id.trim().length === 0) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Integration ID is required',
          },
        });
      }

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Integration name is required',
          },
        });
      }

      // Check if integration already exists
      const existing = await integrationsService.getIntegration(id);
      if (existing) {
        return reply.status(409).send({
          error: {
            code: 'CONFLICT',
            message: `Integration '${id}' already exists`,
          },
        });
      }

      const createRequest: CreateIntegrationRequest = {
        id: id.trim().toLowerCase(),
        name: name.trim(),
        description: description?.trim(),
        icon: icon?.trim(),
        documentationUrl: documentationUrl?.trim(),
        isEnabled: isEnabled ?? false,
        config: config || {},
      };

      const integration = await integrationsService.createIntegration(createRequest);
      
      return reply.status(201).send({
        integration,
      });
    }
  );

  // ============================================================================
  // Delete Integration
  // ============================================================================
  /**
   * DELETE /api/v1/integrations/:integrationId
   * Delete a custom integration (built-in integrations cannot be deleted)
   */
  fastify.delete<{ Params: IntegrationParams }>(
    '/api/v1/integrations/:integrationId',
    async (request: FastifyRequest<{ Params: IntegrationParams }>, reply: FastifyReply) => {
      const { integrationId } = request.params;
      
      // Protect built-in integrations
      const builtInIntegrations = ['nintex', 'make', 'zapier', 'n8n', 'power-automate'];
      if (builtInIntegrations.includes(integrationId)) {
        return reply.status(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Built-in integrations cannot be deleted',
          },
        });
      }
      
      const deleted = await integrationsService.deleteIntegration(integrationId);
      
      if (!deleted) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Integration '${integrationId}' not found`,
          },
        });
      }
      
      return reply.status(204).send();
    }
  );

  // ============================================================================
  // Platform Connectors Catalog
  // ============================================================================
  
  /**
   * GET /api/v1/integrations/platforms
   * Get all platform connectors catalog (for the Integrations page)
   */
  fastify.get('/api/v1/integrations/platforms', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const totalConnectors = PLATFORM_CONNECTORS.reduce((sum, p) => sum + p.connectors.length, 0);
      
      return reply.send({
        platforms: PLATFORM_CONNECTORS,
        totalConnectors,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch platform connectors');
      return reply.status(500).send({
        error: {
          code: 'FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to fetch platforms',
        },
      });
    }
  });

  /**
   * GET /api/v1/integrations/platforms/:platformId
   * Get connectors for a specific platform
   */
  fastify.get<{ Params: { platformId: string } }>(
    '/api/v1/integrations/platforms/:platformId',
    async (request: FastifyRequest<{ Params: { platformId: string } }>, reply: FastifyReply) => {
      try {
        const { platformId } = request.params;
        const platform = PLATFORM_CONNECTORS.find((p) => p.id === platformId);

        if (!platform) {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: `Platform ${platformId} not found`,
            },
          });
        }

        return reply.send(platform);
      } catch (error) {
        logger.error({ error }, 'Failed to fetch platform');
        return reply.status(500).send({
          error: {
            code: 'FETCH_FAILED',
            message: error instanceof Error ? error.message : 'Failed to fetch platform',
          },
        });
      }
    }
  );
}
