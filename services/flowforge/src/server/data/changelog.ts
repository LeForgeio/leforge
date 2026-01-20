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
      { type: 'feature', description: 'Initial release of FlowForge platform' },
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
