'use client';

import { useCallback, useEffect, useState } from 'react';
import { TopNav } from '../../components/nav';
import { useRequireAuth } from '../../lib/auth';
import { getApi, isAdmin } from '../../lib/api';
import { useApiQuery, queryKeys } from '../../lib/queries';
import { useQueryClient } from '@tanstack/react-query';

interface Branch {
  id: string;
  code: string;
  name: string;
  address: string | null;
  latitude: string | number;
  longitude: string | number;
  radiusMeters: number;
  timezone: string;
  status: 'active' | 'inactive' | 'closed';
}

interface ListResp {
  data: Branch[];
  meta: { total: number; page: number; limit: number; total_pages: number };
}

export default function BranchesPage() {
  const user = useRequireAuth('manager');
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detailOf, setDetailOf] = useState<Branch | null>(null);
  const [creating, setCreating] = useState(false);

  const admin = isAdmin(user);

  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (search) params.set('search', search);
  if (statusFilter) params.set('status', statusFilter);

  const listQ = useApiQuery<ListResp>(
    queryKeys.branches({ page, search, statusFilter }),
    `branches?${params}`,
    !!user,
  );
  const branches = listQ.data?.data ?? [];
  const meta = listQ.data?.meta ?? { total: 0, page: 1, limit: 20, total_pages: 1 };
  const loading = listQ.isLoading || listQ.isFetching;
  const error = listQ.error?.message ?? null;

  const load = (p: number) => setPage(p);
  const refresh = () => qc.invalidateQueries({ queryKey: ['branches'] });

  if (!user) return null;

  return (
    <TopNav><main className="mx-auto max-w-6xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Branches</h1>
            <p className="mt-1 text-sm text-slate-600">
              Quản lý chi nhánh, WiFi whitelist và geofence.{' '}
              {!admin && <span className="text-amber-600">(manager: chỉ xem scope của mình)</span>}
            </p>
          </div>
          {admin && (
            <button
              onClick={() => setCreating(true)}
              className="btn-primary"
            >
              + New branch
            </button>
          )}
        </div>

        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
          }}
        >
          <label className="text-sm">
            <span className="text-slate-600">Search (code/name)</span>
            <input
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="HCM-Q1"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Status</span>
            <select
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">(tất cả)</option>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
              <option value="closed">closed</option>
            </select>
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
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Address</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Radius</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    Đang tải…
                  </td>
                </tr>
              )}
              {!loading && branches.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    Không có chi nhánh phù hợp
                  </td>
                </tr>
              )}
              {branches.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{b.code}</td>
                  <td className="px-3 py-2 font-medium">{b.name}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{b.address ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">
                    {Number(b.latitude).toFixed(4)}, {Number(b.longitude).toFixed(4)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{b.radiusMeters}m</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setDetailOf(b)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-brand-50 hover:text-brand-700"
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
          branch={detailOf}
          canEdit={admin}
          onClose={() => setDetailOf(null)}
          onMutate={refresh}
        />
      )}

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onSuccess={() => {
            setCreating(false);
            setPage(1);
          }}
        />
      )}
    </TopNav>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'active'
      ? 'bg-green-100 text-green-700'
      : status === 'inactive'
        ? 'bg-slate-100 text-slate-700'
        : 'bg-red-100 text-red-700';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}

function Pagination({ meta, onChange }: { meta: ListResp['meta']; onChange: (p: number) => void }) {
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
      <span>
        {meta.total} branches · page {meta.page}/{meta.total_pages}
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

interface WifiConfig {
  id: string;
  ssid: string;
  bssid: string | null;
  priority: number;
  isActive: boolean;
  notes?: string | null;
}

interface Geofence {
  id: string;
  name: string;
  centerLat: string | number;
  centerLng: string | number;
  radiusMeters: number;
  isActive: boolean;
}

interface BranchDetail extends Branch {
  wifiConfigs: WifiConfig[];
  geofences: Geofence[];
}

function DetailDrawer({
  branch,
  canEdit,
  onClose,
  onMutate,
}: {
  branch: Branch;
  canEdit: boolean;
  onClose: () => void;
  onMutate: () => void;
}) {
  const [detail, setDetail] = useState<BranchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const loadDetail = useCallback(async () => {
    setError(null);
    try {
      const api = getApi();
      const r = await api.get(`branches/${branch.id}`).json<{ data: BranchDetail }>();
      setDetail(r.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [branch.id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const deleteBranch = async () => {
    if (!confirm(`Xoá branch ${branch.code}? (soft delete)`)) return;
    try {
      await getApi().delete(`branches/${branch.id}`);
      onMutate();
      onClose();
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
            <p className="text-xs font-mono text-slate-500">{branch.code}</p>
            <h2 className="text-xl font-bold">{branch.name}</h2>
          </div>
          <button onClick={onClose} className="text-sm text-slate-500">
            ✕
          </button>
        </div>

        {error && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        {!detail ? (
          <p className="mt-4 text-sm text-slate-500">Đang tải…</p>
        ) : (
          <>
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
                  branch={detail}
                  onSuccess={() => {
                    setEditing(false);
                    loadDetail();
                    onMutate();
                  }}
                />
              ) : (
                <dl className="mt-2 space-y-1 text-sm">
                  <Row label="Address" value={detail.address ?? '—'} />
                  <Row
                    label="Location"
                    value={`${Number(detail.latitude).toFixed(6)}, ${Number(detail.longitude).toFixed(6)}`}
                  />
                  <Row label="Radius" value={`${detail.radiusMeters} m`} />
                  <Row label="Timezone" value={detail.timezone} />
                  <Row label="Status" value={detail.status} />
                </dl>
              )}
            </section>

            <WifiSection
              branchId={branch.id}
              configs={detail.wifiConfigs}
              canEdit={canEdit}
              onChange={loadDetail}
            />

            <GeofenceSection
              branchId={branch.id}
              geofences={detail.geofences}
              canEdit={canEdit}
              onChange={loadDetail}
            />

            <ZeroTapSection branchId={branch.id} canEdit={canEdit} />

            <QrSecretSection branchId={branch.id} canManage={true} />

            {canEdit && (
              <div className="mt-8 border-t border-slate-200 pt-4">
                <button
                  onClick={deleteBranch}
                  className="text-xs text-red-600 hover:underline"
                >
                  Soft-delete this branch
                </button>
              </div>
            )}
          </>
        )}
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

function EditForm({ branch, onSuccess }: { branch: BranchDetail; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: branch.name,
    address: branch.address ?? '',
    radius_meters: branch.radiusMeters,
    status: branch.status,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await getApi().patch(`branches/${branch.id}`, {
        json: {
          name: form.name,
          address: form.address || undefined,
          radius_meters: Number(form.radius_meters),
          status: form.status,
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
        <span className="text-slate-600">Name</span>
        <input
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </label>
      <label className="block">
        <span className="text-slate-600">Address</span>
        <input
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
        />
      </label>
      <label className="block">
        <span className="text-slate-600">Radius (10–5000m)</span>
        <input
          type="number"
          min={10}
          max={5000}
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          value={form.radius_meters}
          onChange={(e) => setForm((f) => ({ ...f, radius_meters: Number(e.target.value) }))}
        />
      </label>
      <label className="block">
        <span className="text-slate-600">Status</span>
        <select
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Branch['status'] }))}
        >
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="closed">closed</option>
        </select>
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="btn-primary"
      >
        {submitting ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}

function WifiSection({
  branchId,
  configs,
  canEdit,
  onChange,
}: {
  branchId: string;
  configs: WifiConfig[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ssid: '', bssid: '', priority: 10, notes: '' });
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await getApi().post(`branches/${branchId}/wifi-configs`, {
        json: {
          ssid: form.ssid,
          bssid: form.bssid || undefined,
          priority: Number(form.priority),
          notes: form.notes || undefined,
        },
      });
      setForm({ ssid: '', bssid: '', priority: 10, notes: '' });
      setAdding(false);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Xoá WiFi config này?')) return;
    try {
      await getApi().delete(`branches/${branchId}/wifi-configs/${id}`);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">WiFi whitelist ({configs.length})</h3>
        {canEdit && (
          <button onClick={() => setAdding((v) => !v)} className="text-xs text-slate-600 hover:underline">
            {adding ? 'Cancel' : '+ Add'}
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-2 space-y-2 rounded border border-slate-200 p-3 text-sm">
          <input
            className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            placeholder="SSID (ví dụ: Office-5G)"
            value={form.ssid}
            onChange={(e) => setForm((f) => ({ ...f, ssid: e.target.value }))}
          />
          <input
            className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 font-mono"
            placeholder="BSSID aa:bb:cc:dd:ee:ff (optional)"
            value={form.bssid}
            onChange={(e) => setForm((f) => ({ ...f, bssid: e.target.value }))}
          />
          <input
            type="number"
            className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            placeholder="Priority"
            value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
          />
          <input
            className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={submit}
            className="btn-primary py-1 text-xs"
          >
            Add
          </button>
        </div>
      )}
      {configs.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Chưa có config nào.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded border border-slate-200 bg-white">
          {configs.map((w) => (
            <li key={w.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{w.ssid}</div>
                <div className="font-mono text-xs text-slate-500">
                  {w.bssid ?? '(SSID-only)'} · priority {w.priority}
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={() => remove(w.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GeofenceSection({
  branchId,
  geofences,
  canEdit,
  onChange,
}: {
  branchId: string;
  geofences: Geofence[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: '',
    center_lat: 0,
    center_lng: 0,
    radius_meters: 100,
  });
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await getApi().post(`branches/${branchId}/geofences`, {
        json: {
          name: form.name,
          center_lat: Number(form.center_lat),
          center_lng: Number(form.center_lng),
          radius_meters: Number(form.radius_meters),
        },
      });
      setForm({ name: '', center_lat: 0, center_lng: 0, radius_meters: 100 });
      setAdding(false);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Xoá geofence này?')) return;
    try {
      await getApi().delete(`branches/${branchId}/geofences/${id}`);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Geofences ({geofences.length})</h3>
        {canEdit && (
          <button onClick={() => setAdding((v) => !v)} className="text-xs text-slate-600 hover:underline">
            {adding ? 'Cancel' : '+ Add'}
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-2 space-y-2 rounded border border-slate-200 p-3 text-sm">
          <input
            className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            placeholder="Name (ví dụ: Main entrance)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="flex gap-2">
            <input
              type="number"
              step="any"
              className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="Latitude"
              value={form.center_lat}
              onChange={(e) => setForm((f) => ({ ...f, center_lat: Number(e.target.value) }))}
            />
            <input
              type="number"
              step="any"
              className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="Longitude"
              value={form.center_lng}
              onChange={(e) => setForm((f) => ({ ...f, center_lng: Number(e.target.value) }))}
            />
          </div>
          <input
            type="number"
            min={10}
            max={5000}
            className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            placeholder="Radius (m)"
            value={form.radius_meters}
            onChange={(e) => setForm((f) => ({ ...f, radius_meters: Number(e.target.value) }))}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={submit}
            className="btn-primary py-1 text-xs"
          >
            Add
          </button>
        </div>
      )}
      {geofences.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Chưa có geofence nào.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded border border-slate-200 bg-white">
          {geofences.map((g) => (
            <li key={g.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{g.name}</div>
                <div className="font-mono text-xs text-slate-500">
                  {Number(g.centerLat).toFixed(4)}, {Number(g.centerLng).toFixed(4)} · {g.radiusMeters}m
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={() => remove(g.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ZeroTapSection({ branchId, canEdit }: { branchId: string; canEdit: boolean }) {
  const [policy, setPolicy] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    enabled: false,
    window_start: '07:30',
    window_end: '09:30',
    cooldown_seconds: 600,
    min_manual_checkins_to_enable: 2,
  });

  const load = useCallback(async () => {
    try {
      const res = await getApi().get(`branches/${branchId}/zero-tap-policy`).json<{ data: any }>();
      setPolicy(res.data);
      setForm({
        enabled: res.data?.enabled ?? false,
        window_start: res.data?.windowStart ?? '07:30',
        window_end: res.data?.windowEnd ?? '09:30',
        cooldown_seconds: res.data?.cooldownSeconds ?? 600,
        min_manual_checkins_to_enable: res.data?.minManualCheckinsToEnable ?? 2,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setError(null);
    try {
      await getApi().put(`branches/${branchId}/zero-tap-policy`, { json: form });
      setEditing(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="mt-6 border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Zero-Tap Policy</h3>
        {canEdit && (
          <button onClick={() => setEditing((v) => !v)} className="text-xs text-slate-600 hover:underline">
            {editing ? 'Cancel' : 'Edit'}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {!editing && policy && (
        <dl className="mt-2 space-y-1 text-sm">
          <Row label="Status" value={policy.enabled ? 'Enabled' : 'Disabled'} />
          {policy.enabled && (
            <>
              <Row label="Active Window" value={`${policy.windowStart} - ${policy.windowEnd}`} />
              <Row label="Cooldown" value={`${policy.cooldownSeconds}s`} />
              <Row label="Min Manual Checkins" value={String(policy.minManualCheckinsToEnable)} />
            </>
          )}
        </dl>
      )}

      {editing && (
        <div className="mt-2 space-y-2 rounded border border-slate-200 p-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            <span className="font-medium">Enable Zero-Tap for this branch</span>
          </label>
          <div className="flex gap-2">
            <input
              className="block w-full rounded-lg border border-slate-200 px-3 py-1.5 focus:border-brand-500 focus:outline-none"
              placeholder="Start HH:MM"
              value={form.window_start}
              onChange={(e) => setForm((f) => ({ ...f, window_start: e.target.value }))}
            />
            <input
              className="block w-full rounded-lg border border-slate-200 px-3 py-1.5 focus:border-brand-500 focus:outline-none"
              placeholder="End HH:MM"
              value={form.window_end}
              onChange={(e) => setForm((f) => ({ ...f, window_end: e.target.value }))}
            />
          </div>
          <input
            type="number"
            className="block w-full rounded-lg border border-slate-200 px-3 py-1.5 focus:border-brand-500 focus:outline-none"
            placeholder="Cooldown (seconds)"
            value={form.cooldown_seconds}
            onChange={(e) => setForm((f) => ({ ...f, cooldown_seconds: Number(e.target.value) }))}
          />
          <input
            type="number"
            className="block w-full rounded-lg border border-slate-200 px-3 py-1.5 focus:border-brand-500 focus:outline-none"
            placeholder="Min manual checkins (e.g. 2)"
            value={form.min_manual_checkins_to_enable}
            onChange={(e) => setForm((f) => ({ ...f, min_manual_checkins_to_enable: Number(e.target.value) }))}
          />
          <button onClick={submit} className="btn-primary py-1 text-xs mt-2 w-full">Save Policy</button>
        </div>
      )}
    </section>
  );
}

function QrSecretSection({ branchId, canManage }: { branchId: string; canManage: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastToken, setLastToken] = useState<string | null>(null);

  const rotateSecret = async () => {
    if (!confirm('Rotate sẽ vô hiệu hóa kiosk token hiện tại. Tiếp tục?')) return;
    setLoading(true); setError(null);
    try {
      const resp = await getApi().put(`branches/${branchId}/qr-secret`).json<{ kiosk_token: string }>();
      setLastToken(resp.kiosk_token);
      localStorage.setItem(`kiosk_token_${branchId}`, resp.kiosk_token);
    } catch(e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const openKiosk = () => {
    const stored = localStorage.getItem(`kiosk_token_${branchId}`);
    if (!stored) {
      alert('Chưa có kiosk token cho chi nhánh này. Bấm "Rotate Secret" trước để tạo.');
      return;
    }
    window.open(`/kiosk/${branchId}`, '_blank', 'noopener');
  };

  return (
    <section className="mt-6 border-t border-slate-200 pt-4 pb-8">
      <h3 className="text-sm font-semibold">QR Kiosk</h3>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      <div className="mt-2 flex flex-col gap-2">
        <button onClick={openKiosk} className="text-left text-sm text-brand-600 hover:underline">
          ↗ Open Kiosk View
        </button>
        {canManage && (
          <button
            onClick={rotateSecret}
            disabled={loading}
            className="self-start rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {loading ? 'Đang xử lý…' : 'Rotate Secret'}
          </button>
        )}
        {lastToken && (
          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs">
            <p className="font-semibold text-amber-800">Kiosk token mới (chỉ hiển thị một lần):</p>
            <code className="mt-1 block break-all font-mono text-[11px]">{lastToken}</code>
            <p className="mt-1 text-amber-700">Đã lưu vào trình duyệt này cho Kiosk View. Copy để dùng ở thiết bị khác.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function CreateModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    code: '',
    name: '',
    address: '',
    latitude: '' as number | '',
    longitude: '' as number | '',
    radius_meters: 150,
    timezone: 'Asia/Ho_Chi_Minh',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Trình duyệt không hỗ trợ Geolocation');
      return;
    }
    setGeoLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        }));
        setGeoLoading(false);
      },
      (err) => {
        setError(`Không lấy được vị trí: ${err.message}`);
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await getApi().post('branches', {
        json: {
          code: form.code,
          name: form.name,
          address: form.address || undefined,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          radius_meters: Number(form.radius_meters),
          timezone: form.timezone,
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
        className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Tạo chi nhánh mới</h2>

        <label className="block text-sm">
          <span className="text-slate-600">Code (unique)</span>
          <input
            required
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            placeholder="HCM-Q1"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          />
        </label>

        <label className="block text-sm">
          <span className="text-slate-600">Name</span>
          <input
            required
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>

        <label className="block text-sm">
          <span className="text-slate-600">Address</span>
          <input
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
        </label>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm text-slate-600">Toạ độ chi nhánh</span>
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={geoLoading}
              className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 disabled:opacity-50"
            >
              {geoLoading ? 'Đang lấy…' : '📍 Dùng vị trí hiện tại'}
            </button>
          </div>
          <div className="flex gap-2">
            <label className="block flex-1 text-sm">
              <span className="text-[11px] text-slate-500">Latitude</span>
              <input
                type="number"
                step="any"
                required
                placeholder="10.776900"
                className="mt-0.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                value={form.latitude}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    latitude: e.target.value === '' ? '' : Number(e.target.value),
                  }))
                }
              />
            </label>
            <label className="block flex-1 text-sm">
              <span className="text-[11px] text-slate-500">Longitude</span>
              <input
                type="number"
                step="any"
                required
                placeholder="106.700900"
                className="mt-0.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                value={form.longitude}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    longitude: e.target.value === '' ? '' : Number(e.target.value),
                  }))
                }
              />
            </label>
          </div>
        </div>

        <label className="block text-sm">
          <span className="text-slate-600">Radius (10–5000m)</span>
          <input
            type="number"
            min={10}
            max={5000}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            value={form.radius_meters}
            onChange={(e) => setForm((f) => ({ ...f, radius_meters: Number(e.target.value) }))}
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
