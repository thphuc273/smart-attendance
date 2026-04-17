'use client';

import { useState } from 'react';
import { TopNav } from '../../components/nav';
import { useRequireAuth } from '../../lib/auth';
import { useApiQuery, queryKeys } from '../../lib/queries';

type AuditAction = 'create' | 'update' | 'delete' | 'override' | 'login' | 'logout';

interface AuditLog {
  id: string;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user: { id: string; email: string; full_name: string } | null;
}

interface ListResp {
  data: AuditLog[];
  meta: { total: number; page: number; limit: number; total_pages: number };
}

const ACTIONS: AuditAction[] = ['create', 'update', 'delete', 'override', 'login', 'logout'];

export default function AuditLogsPage() {
  const user = useRequireAuth('admin');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ action: '', entity_type: '', date_from: '', date_to: '' });
  const [expanded, setExpanded] = useState<string | null>(null);

  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (filters.action) params.set('action', filters.action);
  if (filters.entity_type) params.set('entity_type', filters.entity_type);
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);

  const query = useApiQuery<ListResp>(
    queryKeys.auditLogs({ page, ...filters }),
    `audit-logs?${params}`,
    !!user,
  );
  const logs = query.data?.data ?? [];
  const meta = query.data?.meta ?? { total: 0, page: 1, limit: 20, total_pages: 1 };
  const loading = query.isLoading || query.isFetching;
  const error = query.error?.message ?? null;

  const load = (p: number) => setPage(p);

  if (!user) return null;

  return (
    <TopNav><main className="mx-auto max-w-6xl p-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Audit logs</h1>
        <p className="mt-1 text-sm text-slate-600">
          Compliance trail — mọi thay đổi override session, login/logout, create/delete entity.
        </p>

        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
          }}
        >
          <label className="text-sm">
            <span className="text-slate-600">Action</span>
            <select
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={filters.action}
              onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
            >
              <option value="">(tất cả)</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Entity type</span>
            <input
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="AttendanceSession"
              value={filters.entity_type}
              onChange={(e) => setFilters((f) => ({ ...f, entity_type: e.target.value }))}
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">From</span>
            <input
              type="date"
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={filters.date_from}
              onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">To</span>
            <input
              type="date"
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={filters.date_to}
              onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
            />
          </label>
          <button type="submit" className="btn-primary">
            Apply
          </button>
        </form>

        {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

        <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-card">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Đang tải…</td></tr>}
              {!loading && logs.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Không có log phù hợp</td></tr>}
              {logs.flatMap((log) => [
                <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs">
                      {new Date(log.created_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-2">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="font-medium">{log.entity_type}</div>
                      {log.entity_id && (
                        <div className="font-mono text-[10px] text-slate-500">
                          {log.entity_id.slice(0, 8)}…
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {log.user ? (
                        <>
                          <div>{log.user.full_name}</div>
                          <div className="text-[10px] text-slate-500">{log.user.email}</div>
                        </>
                      ) : (
                        <span className="text-slate-400">system</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                        className="text-xs text-slate-600 hover:underline"
                      >
                        {expanded === log.id ? 'Hide diff' : 'Show diff'}
                      </button>
                    </td>
                  </tr>,
                  expanded === log.id ? (
                    <tr key={`${log.id}-diff`} className="bg-slate-50">
                      <td colSpan={5} className="px-3 py-3">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="mb-1 font-semibold text-slate-600">Before</p>
                            <pre className="overflow-x-auto rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-800">
                              {log.before ? JSON.stringify(log.before, null, 2) : '—'}
                            </pre>
                          </div>
                          <div>
                            <p className="mb-1 font-semibold text-slate-600">After</p>
                            <pre className="overflow-x-auto rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-800">
                              {log.after ? JSON.stringify(log.after, null, 2) : '—'}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ])}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
          <span>{meta.total} logs · page {meta.page}/{meta.total_pages}</span>
          <div className="flex gap-2">
            <button
              disabled={meta.page <= 1}
              onClick={() => load(meta.page - 1)}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            >← Prev</button>
            <button
              disabled={meta.page >= meta.total_pages}
              onClick={() => load(meta.page + 1)}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            >Next →</button>
          </div>
        </div>
      </main>
    </TopNav>
  );
}

function ActionBadge({ action }: { action: AuditAction }) {
  const tone: Record<AuditAction, string> = {
    create: 'bg-green-100 text-green-700',
    update: 'bg-sky-100 text-sky-700',
    delete: 'bg-red-100 text-red-700',
    override: 'bg-amber-100 text-amber-700',
    login: 'bg-slate-100 text-slate-700',
    logout: 'bg-slate-100 text-slate-500',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone[action]}`}>{action}</span>;
}
