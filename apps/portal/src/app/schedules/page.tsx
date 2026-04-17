'use client';

import { useCallback, useEffect, useState } from 'react';
import { TopNav } from '../../components/nav';
import { useRequireAuth } from '../../lib/auth';
import { getApi, isAdmin } from '../../lib/api';
import { useApiQuery, queryKeys } from '../../lib/queries';
import { useQueryClient } from '@tanstack/react-query';

interface Schedule {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  overtime_after_minutes: number;
  workdays: number[];
  assignment_count: number;
}

interface Employee {
  id: string;
  employee_code: string;
  user: { full_name: string };
}

const WEEKDAY_NAMES = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function SchedulesPage() {
  const user = useRequireAuth('manager');
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [assignTo, setAssignTo] = useState<Schedule | null>(null);

  const admin = isAdmin(user);

  const listQ = useApiQuery<{ data: Schedule[] }>(queryKeys.schedules(), 'work-schedules', !!user);
  const schedules = listQ.data?.data ?? [];
  const loading = listQ.isLoading || listQ.isFetching;
  const error = listQ.error?.message ?? null;

  const load = () => qc.invalidateQueries({ queryKey: ['work-schedules'] });

  if (!user) return null;

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-5xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Work schedules</h1>
            <p className="mt-1 text-sm text-slate-600">
              Cấu hình ca làm (giờ bắt đầu/kết thúc, grace, overtime) và assign cho nhân viên.
            </p>
          </div>
          {admin && (
            <button
              onClick={() => setCreating(true)}
              className="btn-primary"
            >
              + New schedule
            </button>
          )}
        </div>

        {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {loading && <p className="text-slate-500">Đang tải…</p>}
          {!loading && schedules.length === 0 && (
            <p className="text-slate-500">Chưa có schedule nào.</p>
          )}
          {schedules.map((s) => (
            <div key={s.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{s.name}</h3>
                  <p className="font-mono text-xs text-slate-500">
                    {s.start_time} – {s.end_time} · grace {s.grace_minutes}m · OT after{' '}
                    {s.overtime_after_minutes}m
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">
                  {s.assignment_count} gán
                </span>
              </div>
              <div className="mt-3 flex gap-1">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                  const active = s.workdays.includes(d);
                  return (
                    <span
                      key={d}
                      className={
                        active
                          ? 'rounded-md bg-gradient-to-br from-brand-500 to-violet-500 px-2 py-0.5 text-[10px] font-semibold text-white'
                          : 'rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400'
                      }
                    >
                      {WEEKDAY_NAMES[d]}
                    </span>
                  );
                })}
              </div>
              {admin && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setAssignTo(s)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-brand-50 hover:text-brand-700"
                  >
                    Manage assignments
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onSuccess={() => {
            setCreating(false);
            load();
          }}
        />
      )}

      {assignTo && (
        <AssignmentsDrawer
          schedule={assignTo}
          onClose={() => setAssignTo(null)}
          onMutate={load}
        />
      )}
    </>
  );
}

function CreateModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: '',
    start_time: '08:00',
    end_time: '17:00',
    grace_minutes: 10,
    overtime_after_minutes: 60,
    workdays: [1, 2, 3, 4, 5] as number[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (d: number) => {
    setForm((f) => ({
      ...f,
      workdays: f.workdays.includes(d)
        ? f.workdays.filter((x) => x !== d)
        : [...f.workdays, d].sort((a, b) => a - b),
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await getApi().post('work-schedules', { json: form });
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Tạo ca làm mới</h2>

        <label className="block text-sm">
          <span className="text-slate-600">Name</span>
          <input
            required
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            placeholder="Night shift"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>

        <div className="flex gap-2">
          <label className="block flex-1 text-sm">
            <span className="text-slate-600">Start (HH:MM)</span>
            <input
              type="time"
              required
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={form.start_time}
              onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
            />
          </label>
          <label className="block flex-1 text-sm">
            <span className="text-slate-600">End (HH:MM)</span>
            <input
              type="time"
              required
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={form.end_time}
              onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
            />
          </label>
        </div>

        <div className="flex gap-2">
          <label className="block flex-1 text-sm">
            <span className="text-slate-600">Grace (min)</span>
            <input
              type="number"
              min={0}
              max={120}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={form.grace_minutes}
              onChange={(e) => setForm((f) => ({ ...f, grace_minutes: Number(e.target.value) }))}
            />
          </label>
          <label className="block flex-1 text-sm">
            <span className="text-slate-600">OT after (min)</span>
            <input
              type="number"
              min={0}
              max={300}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={form.overtime_after_minutes}
              onChange={(e) => setForm((f) => ({ ...f, overtime_after_minutes: Number(e.target.value) }))}
            />
          </label>
        </div>

        <div>
          <span className="text-sm text-slate-600">Workdays</span>
          <div className="mt-1 flex gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={
                  form.workdays.includes(d)
                    ? 'flex-1 rounded-md bg-gradient-to-br from-brand-500 to-violet-500 py-1 text-xs font-semibold text-white'
                    : 'flex-1 rounded border border-slate-300 py-1 text-xs'
                }
              >
                {WEEKDAY_NAMES[d]}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || form.workdays.length === 0}
            className="btn-primary"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

interface Assignment {
  id: string;
  effective_from: string;
  effective_to: string | null;
  employee: { id: string; employee_code: string; full_name: string };
}

function AssignmentsDrawer({
  schedule,
  onClose,
  onMutate,
}: {
  schedule: Schedule;
  onClose: () => void;
  onMutate: () => void;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    employee_id: '',
    effective_from: today,
    effective_to: '',
  });

  const load = useCallback(async () => {
    try {
      const [aResp, eResp] = await Promise.all([
        getApi()
          .get(`work-schedules/${schedule.id}/assignments`)
          .json<{ data: Assignment[] }>(),
        getApi().get('employees?limit=100').json<{ data: Employee[] }>(),
      ]);
      setAssignments(aResp.data);
      setEmployees(eResp.data);
      if (!form.employee_id && eResp.data.length > 0) {
        setForm((f) => ({ ...f, employee_id: eResp.data[0].id }));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [schedule.id, form.employee_id]);

  useEffect(() => {
    load();
  }, [load]);

  const submitAssign = async () => {
    setError(null);
    try {
      await getApi().post(`work-schedules/${schedule.id}/assign`, {
        json: {
          employee_id: form.employee_id,
          effective_from: form.effective_from,
          effective_to: form.effective_to || undefined,
        },
      });
      setAdding(false);
      load();
      onMutate();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Huỷ gán này?')) return;
    try {
      await getApi().delete(`work-schedules/${schedule.id}/assignments/${id}`);
      load();
      onMutate();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{schedule.name}</h2>
            <p className="mt-0.5 font-mono text-xs text-slate-500">
              {schedule.start_time} – {schedule.end_time}
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-slate-500">✕</button>
        </div>

        {error && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Assignments ({assignments.length})</h3>
          <button
            onClick={() => setAdding((v) => !v)}
            className="text-xs text-slate-600 hover:underline"
          >
            {adding ? 'Cancel' : '+ Assign employee'}
          </button>
        </div>

        {adding && (
          <div className="mt-2 space-y-2 rounded border border-slate-200 p-3 text-sm">
            <label className="block">
              <span className="text-slate-600">Employee</span>
              <select
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                value={form.employee_id}
                onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.user.full_name} ({e.employee_code})
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <label className="flex-1">
                <span className="text-slate-600">From</span>
                <input
                  type="date"
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  value={form.effective_from}
                  onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))}
                />
              </label>
              <label className="flex-1">
                <span className="text-slate-600">To (optional)</span>
                <input
                  type="date"
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  value={form.effective_to}
                  onChange={(e) => setForm((f) => ({ ...f, effective_to: e.target.value }))}
                />
              </label>
            </div>
            <button
              onClick={submitAssign}
              className="btn-primary py-1 text-xs"
            >
              Assign
            </button>
          </div>
        )}

        {assignments.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">Chưa ai được gán ca này.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded border border-slate-200">
            {assignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{a.employee.full_name}</div>
                  <div className="font-mono text-xs text-slate-500">
                    {a.employee.employee_code} · {a.effective_from.slice(0, 10)}
                    {a.effective_to ? ` → ${a.effective_to.slice(0, 10)}` : ' → ∞'}
                  </div>
                </div>
                <button
                  onClick={() => remove(a.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
