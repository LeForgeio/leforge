/**
 * Changelog data - Single source of truth
 * Used by both the UI (Documentation page) and API endpoint
 */

export type ChangeType = 'feature' | 'improvement' | 'fix' | 'breaking' | 'security' | 'deprecated';

export interface Change {
  type: ChangeType;
  description: string;
}

export interface Release {
  version: string;
  date: string;
  changes: Change[];
}

export const changelog: Release[] = [
  {
    version: '1.4.0',
    date: '2026-02-02',
    changes: [
      { type: 'feature', description: 'Embedded MQTT broker (Mosquitto 2.0.22) with WebSocket support' },
      { type: 'feature', description: 'Service account support for machine-to-machine authentication' },
      { type: 'security', description: 'PostgreSQL, Redis, and MQTT passwords via environment variables' },
      { type: 'security', description: 'Server-side session validation for all SPA routes' },
      { type: 'security', description: 'Comprehensive security documentation (docs/security.md)' },
      { type: 'improvement', description: 'Docker entrypoint script for runtime credential configuration' },
      { type: 'improvement', description: 'Updated CLAUDE.md with port mappings and security config' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-02-01',
    changes: [
      { type: 'feature', description: 'Agent Runtime: Create and deploy AI agents with tool-calling capabilities' },
      { type: 'feature', description: 'Agent chat interface with streaming responses and tool execution visualization' },
      { type: 'feature', description: 'Install progress terminal: Real-time streaming of Docker image pull and container creation' },
      { type: 'feature', description: 'Ollama integration as ForgeHook plugin with GPU support and model volume persistence' },
      { type: 'feature', description: 'Install Ollama prompt on Agents page when local LLM unavailable' },
      { type: 'improvement', description: 'LLM endpoints return availability status instead of 503 errors' },
      { type: 'improvement', description: 'Marketplace install dialog expands to show terminal during installation' },
      { type: 'fix', description: 'Fixed cloudflared tunnel 502 errors with container network alias' },
      { type: 'fix', description: 'Fixed dropdown menu transparency with --popover CSS variables' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-01-20',
    changes: [
      { type: 'feature', description: 'Plugin update system with version tracking and rollback support' },
      { type: 'feature', description: 'Update dialog with online update and file upload options' },
      { type: 'feature', description: 'Plugin update history with rollback functionality' },
      { type: 'improvement', description: 'Dashboard uses installed plugins instead of hardcoded list' },
      { type: 'improvement', description: 'Changelog now fetches from API (single source of truth)' },
      { type: 'improvement', description: 'Archived obsolete web-ui and plugin-manager code' },
      { type: 'fix', description: 'Dashboard only polls health for running plugins' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-01-19',
    changes: [
      { type: 'feature', description: 'Upgraded to React 19 with improved performance' },
      { type: 'feature', description: 'Migrated to react-router-dom v7 with new data APIs' },
      { type: 'feature', description: 'Upgraded to Vite 7 for faster builds' },
      { type: 'feature', description: 'Migrated to Tailwind CSS v4 with CSS-first configuration' },
      { type: 'feature', description: 'Upgraded to ESLint v9 flat config' },
      { type: 'improvement', description: 'Updated all dependencies to latest versions' },
      { type: 'improvement', description: 'Better TypeScript types throughout codebase' },
      { type: 'fix', description: 'Fixed marketplace sources rendering error' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-01-15',
    changes: [
      { type: 'feature', description: 'Initial release of LeForge platform' },
      { type: 'feature', description: 'Crypto Service: Hashing, encryption, JWT operations' },
      { type: 'feature', description: 'Math Service: Calculations, statistics, conversions' },
      { type: 'feature', description: 'PDF Service: Generation, merge, split, text extraction' },
      { type: 'feature', description: 'OCR Service: Text extraction from images' },
      { type: 'feature', description: 'Image Service: Resize, convert, optimize' },
      { type: 'feature', description: 'LLM Service: AI chat and text generation' },
      { type: 'feature', description: 'Vector Service: Similarity search with Qdrant' },
      { type: 'feature', description: 'Data Transform: JSON, CSV, XML conversions' },
    ],
  },
  {
    version: '0.9.0',
    date: '2026-01-01',
    changes: [
      { type: 'feature', description: 'Beta release with core services' },
      { type: 'improvement', description: 'Performance optimizations for crypto operations' },
      { type: 'fix', description: 'Fixed memory leak in PDF service' },
    ],
  },
];

export const changeTypeColors: Record<ChangeType, string> = {
  feature: 'bg-green-500/10 text-green-600 dark:text-green-400',
  improvement: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  fix: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  breaking: 'bg-red-500/10 text-red-600 dark:text-red-400',
  security: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  deprecated: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
};
