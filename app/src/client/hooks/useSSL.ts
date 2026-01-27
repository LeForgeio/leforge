import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Types
export interface SSLSettings {
  httpsEnabled: boolean;
  httpsPort: number;
  forceHttps: boolean;
  hstsEnabled: boolean;
  hstsMaxAge: number;
  minTlsVersion: string;
}

export interface SSLCertificate {
  id: string;
  name: string;
  isActive: boolean;
  isSelfSigned: boolean;
  commonName?: string;
  issuer?: string;
  validFrom?: string;
  validUntil?: string;
  fingerprint?: string;
  createdAt: string;
  isExpired: boolean;
  expiresInDays: number;
}

export interface SSLStatus {
  settings: SSLSettings;
  activeCertificate: SSLCertificate | null;
  httpsAvailable: boolean;
}

// Fetch functions
async function fetchSSLStatus(): Promise<SSLStatus> {
  const res = await fetch(`${API_BASE}/api/v1/ssl/status`);
  if (!res.ok) throw new Error('Failed to fetch SSL status');
  return res.json();
}

async function fetchCertificates(): Promise<{ certificates: SSLCertificate[] }> {
  const res = await fetch(`${API_BASE}/api/v1/ssl/certificates`);
  if (!res.ok) throw new Error('Failed to fetch certificates');
  return res.json();
}

// Mutations
async function updateSettings(settings: Partial<SSLSettings>): Promise<{ message: string; settings: SSLSettings; restartRequired: boolean }> {
  const res = await fetch(`${API_BASE}/api/v1/ssl/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to update settings');
  return res.json();
}

async function generateSelfSigned(options: {
  name?: string;
  commonName?: string;
  organization?: string;
  validDays?: number;
  setActive?: boolean;
}): Promise<{ message: string; certificate: SSLCertificate; note: string }> {
  const res = await fetch(`${API_BASE}/api/v1/ssl/certificates/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message || 'Failed to generate certificate');
  }
  return res.json();
}

async function uploadCertificate(data: {
  name: string;
  certificate: string;
  privateKey: string;
  caBundle?: string;
  setActive?: boolean;
}): Promise<{ message: string; certificate: SSLCertificate }> {
  const res = await fetch(`${API_BASE}/api/v1/ssl/certificates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message || 'Failed to upload certificate');
  }
  return res.json();
}

async function activateCertificate(id: string): Promise<{ message: string; restartRequired: boolean }> {
  const res = await fetch(`${API_BASE}/api/v1/ssl/certificates/${id}/activate`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to activate certificate');
  return res.json();
}

async function deleteCertificate(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/ssl/certificates/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete certificate');
}

// Hooks
export function useSSLStatus() {
  return useQuery({
    queryKey: ['ssl-status'],
    queryFn: fetchSSLStatus,
    staleTime: 30000,
  });
}

export function useSSLCertificates() {
  return useQuery({
    queryKey: ['ssl-certificates'],
    queryFn: fetchCertificates,
    staleTime: 30000,
  });
}

export function useUpdateSSLSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssl-status'] });
    },
  });
}

export function useGenerateSelfSigned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: generateSelfSigned,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssl-status'] });
      queryClient.invalidateQueries({ queryKey: ['ssl-certificates'] });
    },
  });
}

export function useUploadCertificate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadCertificate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssl-status'] });
      queryClient.invalidateQueries({ queryKey: ['ssl-certificates'] });
    },
  });
}

export function useActivateCertificate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: activateCertificate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssl-status'] });
      queryClient.invalidateQueries({ queryKey: ['ssl-certificates'] });
    },
  });
}

export function useDeleteCertificate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCertificate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssl-status'] });
      queryClient.invalidateQueries({ queryKey: ['ssl-certificates'] });
    },
  });
}
