import { useQuery } from '@tanstack/react-query';

// Types matching the server changelog structure
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

export interface ChangelogResponse {
  changelog: Release[];
  changeTypeColors: Record<ChangeType, string>;
  latestVersion: string | null;
}

const API_BASE = '/api/v1';

async function fetchChangelog(): Promise<ChangelogResponse> {
  const response = await fetch(`${API_BASE}/changelog`);
  if (!response.ok) {
    throw new Error('Failed to fetch changelog');
  }
  return response.json();
}

/**
 * Hook to fetch changelog from the API
 * Single source of truth - server data/changelog.ts
 */
export function useChangelog() {
  return useQuery({
    queryKey: ['changelog'],
    queryFn: fetchChangelog,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour - changelog doesn't change often
  });
}

// Color mapping for change types (used in UI)
export const changeTypeColors: Record<ChangeType, string> = {
  feature: 'bg-green-500/10 text-green-600 dark:text-green-400',
  improvement: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  fix: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  breaking: 'bg-red-500/10 text-red-600 dark:text-red-400',
  security: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  deprecated: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
};
