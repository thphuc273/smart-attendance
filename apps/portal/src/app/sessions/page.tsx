'use client';

import { useCallback, useEffect, useState } from 'react';
import { TopNav } from '../../components/nav';
import { useRequireAuth } from '../../lib/auth';
import { getApi } from '../../lib/api';

interface Session {
  id: string;
  workDate: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number | null;
  overtimeMinutes: number | null;
  lateMinutes: number | null;
  trustScore: number | null;
  employee: { employee_code: string; full_name: string };
  branch: { id: string; name: string };
}

interface ListResp {
  data: Session[];
  meta: { total: number; page: number; limit: number; total_pages: number };
}

const STATUSES = ['on_time', 'late', 'early_leave', 'overtime', 'missing_checkout', 'absent'];

export default function SessionsPage() {
  const user = useRequireAuth('manager');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [meta, setMeta] = useState<ListResp['meta']>({
    total: 0,
    page: 1,
    limit: 20,
    total_pages: 1,
  });
  const [filters, setFilters] = useState({ status: '', date_from: '', date_to: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideOf, setOverrideOf] = useState<Session | null>(null);

  const load = useCallback(
    async (page: number) => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const api = getApi();
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (filters.status) params.set('status', filters.status);
        if (filters.date_from) params.set('date_from', filters.date_from);
        if (filters.date_to) params.set('date_to', filters.date_to);
        const resp = await api.get(`attendance/sessions?${params}`).json<ListResp>();
        setSessions(resp.data);
        setMeta(resp.meta);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [filters, user],
  );

  useEffect(() => {
    if (user) load(1);
  }, [user, load]);

  if (!user) return null;

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Sessions</h1>
        <p className="mt-1 text-sm text-slate-600">
          Lịch sử chấm công — admin/manager có thể override status.
        </p>

        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            load(1);
          }}
        >
          <label className="text-sm">
            <span className="text-slate-600">Status</span>
            <select
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">(tất cả)</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
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
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Branch</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">In / Out</th>
                <th className="px-3 py-2">Late / OT</th>
                <th className="px-3 py-2">Trust</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    Đang tải…
                  </td>
                </tr>
              )}
              {!loading && sessions.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    Không có session phù hợp
                  </td>
                </tr>
              )}
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{s.workDate.slice(0, 10)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{s.employee.full_name}</div>
                    <div className="text-xs text-slate-500">{s.employee.employee_code}</div>
                  </td>
                  <td className="px-3 py-2">{s.branch.name}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {s.checkInAt ? new Date(s.checkInAt).toLocaleTimeString('vi-VN') : '—'}
                    <br />
                    {s.checkOutAt ? new Date(s.checkOutAt).toLocaleTimeString('vi-VN') : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {s.lateMinutes ? (
                      <span className="text-amber-600">late {s.lateMinutes}m</span>
                    ) : null}
                    {s.lateMinutes && s.overtimeMinutes ? <br /> : null}
                    {s.overtimeMinutes ? (
                      <span className="text-green-700">OT {s.overtimeMinutes}m</span>
                    ) : null}
                    {!s.lateMinutes && !s.overtimeMinutes ? '—' : null}
                  </td>
                  <td className="px-3 py-2">
                    <TrustBadge score={s.trustScore} />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setOverrideOf(s)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-brand-50 hover:text-brand-700"
                    >
                      Override
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination meta={meta} onChange={load} />
      </main>

      {overrideOf && (
        <OverrideModal
          session={overrideOf}
          onClose={() => setOverrideOf(null)}
          onSuccess={() => {
            setOverrideOf(null);
            load(meta.page);
          }}
        />
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'on_time'
      ? 'bg-green-100 text-green-700'
      : status === 'late'
        ? 'bg-amber-100 text-amber-700'
        : status === 'overtime'
          ? 'bg-sky-100 text-sky-700'
          : status === 'absent' || status === 'missing_checkout'
            ? 'bg-red-100 text-red-700'
            : 'bg-slate-100 text-slate-700';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}

function TrustBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-slate-400">—</span>;
  const tone = score >= 70 ? 'bg-green-100 text-green-700' : score >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`rounded px-2 py-0.5 font-mono text-xs ${tone}`}>{score}</span>;
}

function Pagination({ meta, onChange }: { meta: ListResp['meta']; onChange: (p: number) => void }) {
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
      <span>
        {meta.total} sessions · page {meta.page}/{meta.total_pages}
      </span>
      <div className="flex gap-2">
        <button
          disabled={meta.page <= 1}
          onClick={() => onChange(meta.page - 1)}
          className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
        >
          ← Prev
        </button>
        <button
          disabled={meta.page >= meta.total_pages}
          onClick={() => onChange(meta.page + 1)}
          className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function OverrideModal({
  session,
  onClose,
  onSuccess,
}: {
  session: Session;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [status, setStatus] = useState(session.status);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (note.trim().length < 3) {
      setError('Note tối thiểu 3 ký tự');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const api = getApi();
      await api.patch(`attendance/sessions/${session.id}`, { json: { status, note } });
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Override session</h2>
        <p className="mt-1 text-xs text-slate-500">
          {session.employee.full_name} · {session.workDate.slice(0, 10)} · {session.branch.name}
        </p>

        <label className="mt-4 block text-sm">
          <span className="text-slate-600">New status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20.5"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block text-sm">
          <span className="text-slate-600">Note (bắt buộc, ≥3 ký tự — ghi audit log)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20.5"
            placeholder="Lý do override..."
          />
        </label>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="btn-primary"
          >
            {submitting ? 'Saving…' : 'Save override'}
          </button>
        </div>
      </div>
    </div>
  );
}
