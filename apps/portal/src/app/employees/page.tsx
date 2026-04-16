'use client';

import { useCallback, useEffect, useState } from 'react';
import { TopNav } from '../../components/nav';
import { useRequireAuth } from '../../lib/auth';
import { getApi, isAdmin } from '../../lib/api';

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface Employee {
  id: string;
  employee_code: string;
  user: { full_name: string; email: string };
  primary_branch: { id: string; name: string; code: string } | null;
  department: { id: string; name: string } | null;
  employment_status: 'active' | 'on_leave' | 'terminated';
}

interface ListResp {
  data: Employee[];
  meta: { total: number; page: number; limit: number; total_pages: number };
}

export default function EmployeesPage() {
  const user = useRequireAuth('manager');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [meta, setMeta] = useState<ListResp['meta']>({ total: 0, page: 1, limit: 20, total_pages: 1 });
  const [filters, setFilters] = useState({ search: '', branch_id: '', status: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailOf, setDetailOf] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);

  const admin = isAdmin(user);

  useEffect(() => {
    if (!user) return;
    getApi()
      .get('branches?limit=100')
      .json<{ data: Branch[] }>()
      .then((r) => setBranches(r.data))
      .catch(() => void 0);
  }, [user]);

  const load = useCallback(
    async (page: number) => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const api = getApi();
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (filters.search) params.set('search', filters.search);
        if (filters.branch_id) params.set('branch_id', filters.branch_id);
        if (filters.status) params.set('status', filters.status);
        const resp = await api.get(`employees?${params}`).json<ListResp>();
        setEmployees(resp.data);
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Employees</h1>
            <p className="mt-1 text-sm text-slate-600">
              Quản lý nhân viên, device trust, branch assignments.
              {!admin && <span className="ml-1 text-amber-600">(manager: read-only trong scope)</span>}
            </p>
          </div>
          {admin && (
            <button
              onClick={() => setCreating(true)}
              className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
            >
              + New employee
            </button>
          )}
        </div>

        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            load(1);
          }}
        >
          <label className="text-sm">
            <span className="text-slate-600">Search (name/code/email)</span>
            <input
              className="mt-1 block rounded border border-slate-300 px-2 py-1"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="EMP001"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Branch</span>
            <select
              className="mt-1 block rounded border border-slate-300 px-2 py-1"
              value={filters.branch_id}
              onChange={(e) => setFilters((f) => ({ ...f, branch_id: e.target.value }))}
            >
              <option value="">(tất cả)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Status</span>
            <select
              className="mt-1 block rounded border border-slate-300 px-2 py-1"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">(tất cả)</option>
              <option value="active">active</option>
              <option value="on_leave">on_leave</option>
              <option value="terminated">terminated</option>
            </select>
          </label>
          <button type="submit" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
            Apply
          </button>
        </form>

        {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Branch</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Đang tải…</td></tr>
              )}
              {!loading && employees.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Không có nhân viên phù hợp</td></tr>
              )}
              {employees.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{e.employee_code}</td>
                  <td className="px-3 py-2 font-medium">{e.user.full_name}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{e.user.email}</td>
                  <td className="px-3 py-2">{e.primary_branch?.name ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{e.department?.name ?? '—'}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={e.employment_status} />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setDetailOf(e)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination meta={meta} onChange={load} />
      </main>

      {detailOf && (
        <DetailDrawer
          employee={detailOf}
          branches={branches}
          canEdit={admin}
          onClose={() => setDetailOf(null)}
          onMutate={() => load(meta.page)}
        />
      )}

      {creating && (
        <CreateModal
          branches={branches}
          onClose={() => setCreating(false)}
          onSuccess={() => {
            setCreating(false);
            load(1);
          }}
        />
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'active'
      ? 'bg-green-100 text-green-700'
      : status === 'on_leave'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-red-100 text-red-700';
  return <span className={`rounded px-2 py-0.5 text-xs ${tone}`}>{status}</span>;
}

function Pagination({ meta, onChange }: { meta: ListResp['meta']; onChange: (p: number) => void }) {
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
      <span>{meta.total} employees · page {meta.page}/{meta.total_pages}</span>
      <div className="flex gap-2">
        <button
          disabled={meta.page <= 1}
          onClick={() => onChange(meta.page - 1)}
          className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
        >← Prev</button>
        <button
          disabled={meta.page >= meta.total_pages}
          onClick={() => onChange(meta.page + 1)}
          className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
        >Next →</button>
      </div>
    </div>
  );
}

interface Device {
  id: string;
  deviceFingerprint: string;
  platform: string;
  deviceName: string | null;
  isTrusted: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

function DetailDrawer({
  employee,
  branches,
  canEdit,
  onClose,
  onMutate,
}: {
  employee: Employee;
  branches: Branch[];
  canEdit: boolean;
  onClose: () => void;
  onMutate: () => void;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingAssignment, setAddingAssignment] = useState(false);

  const loadDevices = useCallback(async () => {
    try {
      const r = await getApi().get(`employees/${employee.id}/devices`).json<{ data: Device[] }>();
      setDevices(r.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [employee.id]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const toggleTrust = async (d: Device) => {
    try {
      await getApi().patch(`employees/${employee.id}/devices/${d.id}`, {
        json: { is_trusted: !d.isTrusted },
      });
      loadDevices();
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
            <p className="text-xs font-mono text-slate-500">{employee.employee_code}</p>
            <h2 className="text-xl font-bold">{employee.user.full_name}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{employee.user.email}</p>
          </div>
          <button onClick={onClose} className="text-sm text-slate-500">✕</button>
        </div>

        {error && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <section className="mt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Info</h3>
            {canEdit && (
              <button
                onClick={() => setEditing((v) => !v)}
                className="text-xs text-slate-600 hover:underline"
              >
                {editing ? 'Cancel' : 'Edit'}
              </button>
            )}
          </div>
          {editing ? (
            <EditForm
              employee={employee}
              branches={branches}
              onSuccess={() => {
                setEditing(false);
                onMutate();
              }}
            />
          ) : (
            <dl className="mt-2 space-y-1 text-sm">
              <Row label="Primary branch" value={employee.primary_branch?.name ?? '—'} />
              <Row label="Department" value={employee.department?.name ?? '—'} />
              <Row label="Status" value={employee.employment_status} />
            </dl>
          )}
        </section>

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Devices ({devices.length})</h3>
          </div>
          {devices.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">Chưa có device nào (nhân viên chưa check-in lần nào).</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 rounded border border-slate-200 bg-white">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{d.deviceName ?? d.platform}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${d.isTrusted ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                        {d.isTrusted ? 'trusted' : 'untrusted'}
                      </span>
                    </div>
                    <div className="truncate font-mono text-[10px] text-slate-500">{d.deviceFingerprint}</div>
                    {d.lastSeenAt && (
                      <div className="text-[10px] text-slate-400">
                        last seen {new Date(d.lastSeenAt).toLocaleString('vi-VN')}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => toggleTrust(d)}
                    className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                  >
                    {d.isTrusted ? 'Revoke' : 'Trust'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Branch assignments</h3>
            {canEdit && (
              <button
                onClick={() => setAddingAssignment((v) => !v)}
                className="text-xs text-slate-600 hover:underline"
              >
                {addingAssignment ? 'Cancel' : '+ Add'}
              </button>
            )}
          </div>
          {addingAssignment && (
            <AssignmentForm
              employeeId={employee.id}
              branches={branches}
              onSuccess={() => {
                setAddingAssignment(false);
                onMutate();
              }}
            />
          )}
          <p className="mt-2 text-xs text-slate-500">
            Primary branch: <span className="font-medium">{employee.primary_branch?.name ?? '—'}</span>
            <br />
            <span className="text-slate-400">
              Secondary/temporary assignments cho phép check-in ở chi nhánh phụ trong khoảng effective.
            </span>
          </p>
        </section>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1 last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono text-xs">{value}</dd>
    </div>
  );
}

function EditForm({
  employee,
  branches,
  onSuccess,
}: {
  employee: Employee;
  branches: Branch[];
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    full_name: employee.user.full_name,
    primary_branch_id: employee.primary_branch?.id ?? '',
    employment_status: employee.employment_status,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await getApi().patch(`employees/${employee.id}`, {
        json: {
          full_name: form.full_name,
          primary_branch_id: form.primary_branch_id || undefined,
          employment_status: form.employment_status,
        },
      });
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 text-sm">
      <label className="block">
        <span className="text-slate-600">Full name</span>
        <input
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
          value={form.full_name}
          onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
        />
      </label>
      <label className="block">
        <span className="text-slate-600">Primary branch</span>
        <select
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
          value={form.primary_branch_id}
          onChange={(e) => setForm((f) => ({ ...f, primary_branch_id: e.target.value }))}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-slate-600">Status</span>
        <select
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
          value={form.employment_status}
          onChange={(e) => setForm((f) => ({ ...f, employment_status: e.target.value as Employee['employment_status'] }))}
        >
          <option value="active">active</option>
          <option value="on_leave">on_leave</option>
          <option value="terminated">terminated</option>
        </select>
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}

function AssignmentForm({
  employeeId,
  branches,
  onSuccess,
}: {
  employeeId: string;
  branches: Branch[];
  onSuccess: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    branch_id: branches[0]?.id ?? '',
    assignment_type: 'secondary' as const,
    effective_from: today,
    effective_to: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await getApi().post(`employees/${employeeId}/assignments`, {
        json: {
          branch_id: form.branch_id,
          assignment_type: form.assignment_type,
          effective_from: form.effective_from,
          effective_to: form.effective_to || undefined,
        },
      });
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded border border-slate-200 p-3 text-sm">
      <label className="block">
        <span className="text-slate-600">Branch</span>
        <select
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
          value={form.branch_id}
          onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-slate-600">Type</span>
        <select
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
          value={form.assignment_type}
          onChange={(e) => setForm((f) => ({ ...f, assignment_type: e.target.value as 'secondary' }))}
        >
          <option value="secondary">secondary</option>
          <option value="temporary">temporary</option>
        </select>
      </label>
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="text-slate-600">From</span>
          <input
            type="date"
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
            value={form.effective_from}
            onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))}
          />
        </label>
        <label className="flex-1">
          <span className="text-slate-600">To (optional)</span>
          <input
            type="date"
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
            value={form.effective_to}
            onChange={(e) => setForm((f) => ({ ...f, effective_to: e.target.value }))}
          />
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={submitting}
        className="rounded bg-slate-900 px-3 py-1 text-xs text-white disabled:opacity-50"
      >
        {submitting ? 'Adding…' : 'Add'}
      </button>
    </div>
  );
}

function CreateModal({
  branches,
  onClose,
  onSuccess,
}: {
  branches: Branch[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    email: '',
    password: 'Employee@123',
    full_name: '',
    phone: '',
    employee_code: '',
    primary_branch_id: branches[0]?.id ?? '',
    role: 'employee' as const,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await getApi().post('employees', {
        json: {
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          phone: form.phone || undefined,
          employee_code: form.employee_code,
          primary_branch_id: form.primary_branch_id,
          role: form.role,
        },
      });
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
        className="w-full max-w-md space-y-3 rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Tạo nhân viên mới</h2>

        <div className="flex gap-2">
          <label className="block flex-1 text-sm">
            <span className="text-slate-600">Employee code</span>
            <input
              required
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 font-mono"
              placeholder="EMP031"
              value={form.employee_code}
              onChange={(e) => setForm((f) => ({ ...f, employee_code: e.target.value }))}
            />
          </label>
          <label className="block flex-1 text-sm">
            <span className="text-slate-600">Role</span>
            <select
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'employee' }))}
            >
              <option value="employee">employee</option>
              <option value="manager">manager</option>
              <option value="admin">admin</option>
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-slate-600">Full name</span>
          <input
            required
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          />
        </label>

        <label className="block text-sm">
          <span className="text-slate-600">Email</span>
          <input
            type="email"
            required
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </label>

        <label className="block text-sm">
          <span className="text-slate-600">Password (≥6)</span>
          <input
            type="text"
            required
            minLength={6}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 font-mono"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </label>

        <label className="block text-sm">
          <span className="text-slate-600">Phone</span>
          <input
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </label>

        <label className="block text-sm">
          <span className="text-slate-600">Primary branch</span>
          <select
            required
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
            value={form.primary_branch_id}
            onChange={(e) => setForm((f) => ({ ...f, primary_branch_id: e.target.value }))}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
