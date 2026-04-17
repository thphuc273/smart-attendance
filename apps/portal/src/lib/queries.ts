'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApi } from './api';

/**
 * Typed wrapper around React Query for our envelope-based JSON API.
 * `path` is the URL suffix (after /api/v1) including query string.
 * Cache key = the path itself — identical path → shared cache entry.
 */
export function useApiQuery<T>(key: readonly unknown[], path: string, enabled = true) {
  return useQuery<T>({
    queryKey: key,
    queryFn: async () => getApi().get(path).json<T>(),
    enabled,
  });
}

/**
 * Thin mutation helper. After success, invalidate queries whose key starts
 * with any of the `invalidate` prefixes so lists refresh automatically.
 */
export function useApiMutation<TInput, TOutput>(
  fn: (input: TInput) => Promise<TOutput>,
  invalidate: readonly (readonly unknown[])[] = [],
) {
  const qc = useQueryClient();
  return useMutation<TOutput, Error, TInput>({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of invalidate) qc.invalidateQueries({ queryKey: key });
    },
  });
}

/**
 * Shared query-key factory. Keep hierarchical so invalidate(['branches'])
 * drops ALL branch-scoped caches including subresources.
 */
export const queryKeys = {
  me: () => ['me'] as const,
  branches: (params?: Record<string, unknown>) => params ? ['branches', params] as const : ['branches'] as const,
  branch: (id: string) => ['branches', id] as const,
  employees: (params?: Record<string, unknown>) => params ? ['employees', params] as const : ['employees'] as const,
  employee: (id: string) => ['employees', id] as const,
  employeeDevices: (id: string) => ['employees', id, 'devices'] as const,
  sessions: (params?: Record<string, unknown>) => params ? ['sessions', params] as const : ['sessions'] as const,
  mySessions: (params?: Record<string, unknown>) => params ? ['sessions', 'me', params] as const : ['sessions', 'me'] as const,
  dashboardAdmin: () => ['dashboard', 'admin'] as const,
  dashboardManager: (branchId: string) => ['dashboard', 'manager', branchId] as const,
  anomalies: () => ['dashboard', 'anomalies'] as const,
  reports: (params?: Record<string, unknown>) => params ? ['reports', params] as const : ['reports'] as const,
  export: (jobId: string) => ['reports', 'export', jobId] as const,
  schedules: () => ['work-schedules'] as const,
  scheduleAssignments: (id: string) => ['work-schedules', id, 'assignments'] as const,
  auditLogs: (params?: Record<string, unknown>) => params ? ['audit-logs', params] as const : ['audit-logs'] as const,
};
