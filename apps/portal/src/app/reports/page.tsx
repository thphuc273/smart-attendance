'use client';

import { useCallback, useEffect, useState } from 'react';
import { TopNav } from '../../components/nav';
import { useRequireAuth } from '../../lib/auth';
import { getApi } from '../../lib/api';

interface Branch {
  id: string;
  name: string;
}

interface DailySummary {
  work_date: string;
  branch_id: string;
  total_employees: number;
  on_time: number;
  late: number;
  absent: number;
  avg_worked_minutes: number;
  total_overtime_minutes: number;
}

interface ExportStatus {
  data: {
    job_id: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    download_url: string | null;
    row_count: number | null;
    error_message: string | null;
    expires_at: string | null;
  };
}

export default function ReportsPage() {
  const user = useRequireAuth('manager');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [summary, setSummary] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [filters, setFilters] = useState({
    branch_id: '',
    date_from: weekAgo,
    date_to: today,
  });

  // Load branches once
  useEffect(() => {
    if (!user) return;
    const api = getApi();
    api
      .get('branches?limit=100')
      .json<{ data: Branch[] }>()
      .then((r) => setBranches(r.data))
      .catch(() => void 0);
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const api = getApi();
      const params = new URLSearchParams();
      if (filters.branch_id) params.set('branch_id', filters.branch_id);
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);
      const resp = await api
        .get(`reports/daily-summary?${params}`)
        .json<{ data: DailySummary[] }>();
      setSummary(resp.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters, user]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (!user) return null;

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id.slice(0, 8);

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="mt-1 text-sm text-slate-600">Daily summary theo branch + CSV export.</p>

        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <label className="text-sm">
            <span className="text-slate-600">Branch</span>
            <select
              className="mt-1 block rounded border border-slate-300 px-2 py-1"
              value={filters.branch_id}
              onChange={(e) => setFilters((f) => ({ ...f, branch_id: e.target.value }))}
            >
              <option value="">(tất cả)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600">From</span>
            <input
              type="date"
              className="mt-1 block rounded border border-slate-300 px-2 py-1"
              value={filters.date_from}
              onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">To</span>
            <input
              type="date"
              className="mt-1 block rounded border border-slate-300 px-2 py-1"
              value={filters.date_to}
              onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
            />
          </label>
          <button type="submit" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
            Apply
          </button>
        </form>

        {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <section className="mt-6">
          <h2 className="text-lg font-semibold">Daily summary</h2>
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2 text-right">Employees</th>
                  <th className="px-3 py-2 text-right">On-time</th>
                  <th className="px-3 py-2 text-right">Late</th>
                  <th className="px-3 py-2 text-right">Absent</th>
                  <th className="px-3 py-2 text-right">Avg worked (min)</th>
                  <th className="px-3 py-2 text-right">Total OT (min)</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                      Đang tải…
                    </td>
                  </tr>
                )}
                {!loading && summary.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                      Chưa có dữ liệu cho khoảng này
                    </td>
                  </tr>
                )}
                {summary.map((r) => (
                  <tr key={`${r.work_date}-${r.branch_id}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{r.work_date}</td>
                    <td className="px-3 py-2">{branchName(r.branch_id)}</td>
                    <td className="px-3 py-2 text-right">{r.total_employees}</td>
                    <td className="px-3 py-2 text-right text-green-700">{r.on_time}</td>
                    <td className="px-3 py-2 text-right text-amber-700">{r.late}</td>
                    <td className="px-3 py-2 text-right text-red-700">{r.absent}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.avg_worked_minutes}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.total_overtime_minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">CSV export</h2>
          <p className="mt-1 text-xs text-slate-500">
            Enqueue BullMQ job → poll status → download. Limit 3 export/phút/user.
          </p>
          <ExportPanel filters={filters} />
        </section>
      </main>
    </>
  );
}

function ExportPanel({ filters }: { filters: { branch_id: string; date_from: string; date_to: string } }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<ExportStatus['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canExport = filters.branch_id && filters.date_from && filters.date_to;

  const submit = async () => {
    if (!canExport) {
      setError('Cần chọn branch + date range');
      return;
    }
    setError(null);
    setSubmitting(true);
    setStatus(null);
    try {
      const api = getApi();
      const resp = await api
        .post('reports/export', {
          json: {
            type: 'attendance_csv',
            branch_id: filters.branch_id,
            date_from: filters.date_from,
            date_to: filters.date_to,
          },
        })
        .json<{ data: { job_id: string; status: string } }>();
      setJobId(resp.data.job_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // Poll status
  useEffect(() => {
    if (!jobId) return;
    const api = getApi();
    let stopped = false;
    const tick = async () => {
      try {
        const r = await api.get(`reports/export/${jobId}`).json<ExportStatus>();
        if (stopped) return;
        setStatus(r.data);
        if (r.data.status !== 'completed' && r.data.status !== 'failed') {
          setTimeout(tick, 1200);
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    };
    tick();
    return () => {
      stopped = true;
    };
  }, [jobId]);

  const download = async () => {
    if (!jobId) return;
    const api = getApi();
    try {
      const resp = await api.get(`reports/export/${jobId}/download`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${jobId.slice(0, 8)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
      <button
        onClick={submit}
        disabled={!canExport || submitting}
        className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
      >
        {submitting ? 'Enqueuing…' : 'Enqueue export'}
      </button>
      {!canExport && (
        <span className="ml-3 text-xs text-slate-500">
          (cần chọn một branch cụ thể + date range)
        </span>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {status && (
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="font-mono text-xs">{status.job_id.slice(0, 8)}…</span>
          <span
            className={
              status.status === 'completed'
                ? 'rounded bg-green-100 px-2 py-0.5 text-xs text-green-700'
                : status.status === 'failed'
                  ? 'rounded bg-red-100 px-2 py-0.5 text-xs text-red-700'
                  : 'rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700'
            }
          >
            {status.status}
          </span>
          {status.row_count !== null && (
            <span className="text-xs text-slate-500">{status.row_count} rows</span>
          )}
          {status.status === 'completed' && (
            <button
              onClick={download}
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
            >
              ⬇ Download CSV
            </button>
          )}
          {status.error_message && (
            <span className="text-xs text-red-600">{status.error_message}</span>
          )}
        </div>
      )}
    </div>
  );
}
