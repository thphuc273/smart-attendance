'use client';

import { useState } from 'react';
import { TopNav } from '../../components/nav';
import { useRequireAuth } from '../../lib/auth';
import { isAdmin } from '../../lib/api';
import { useApiQuery, queryKeys } from '../../lib/queries';

interface AdminOverview {
  data: {
    total_employees: number;
    total_branches: number;
    today: {
      checked_in: number;
      on_time: number;
      late: number;
      absent: number;
      on_time_rate: number;
    };
    top_branches_on_time: { branch_id: string; name: string; rate: number }[];
    top_branches_late: { branch_id: string; name: string; late_count: number }[];
    checkin_heatmap: { hour: number; count: number }[];
  };
}

interface AnomaliesResp {
  data: {
    branches_late_spike: {
      branch_id: string;
      name: string;
      late_rate_today: number;
      late_rate_avg_7d: number;
      spike_ratio: number | null;
    }[];
    employees_low_trust: { employee_id: string; code: string; low_trust_count_7d: number }[];
    untrusted_devices_new_today: number;
  };
}

interface ManagerDashboard {
  data: {
    branch: { id: string; name: string };
    today: {
      total: number;
      checked_in: number;
      not_yet: number;
      absent: number;
      on_time: number;
      late: number;
    };
    low_trust_today: {
      session_id: string;
      employee: { code: string; name: string };
      trust_score: number;
      risk_flags: string[];
    }[];
    week_trend: { date: string; on_time_rate: number }[];
  };
}

interface Branch {
  id: string;
  name: string;
}

export default function DashboardPage() {
  const user = useRequireAuth('manager');
  const admin = isAdmin(user);

  const anomaliesQ = useApiQuery<AnomaliesResp>(queryKeys.anomalies(), 'dashboard/anomalies', !!user);
  const overviewQ = useApiQuery<AdminOverview>(queryKeys.dashboardAdmin(), 'dashboard/admin/overview', !!user && admin);
  const branchesQ = useApiQuery<{ data: Branch[] }>(
    queryKeys.branches({ limit: 100 }),
    'branches?limit=100',
    !!user && !admin, // only fetch for non-admin (manager)
  );

  const managerBranches = branchesQ.data?.data ?? [];
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  // Default selected branch = first in list when loaded
  const currentBranchId = selectedBranchId ?? managerBranches[0]?.id ?? null;

  const managerDashQ = useApiQuery<ManagerDashboard>(
    currentBranchId ? queryKeys.dashboardManager(currentBranchId) : ['dashboard', 'manager', 'none'],
    currentBranchId ? `dashboard/manager/${currentBranchId}` : 'dashboard/manager/none',
    !!user && !admin && !!currentBranchId,
  );

  const anomalies = anomaliesQ.data?.data ?? null;
  const overview = overviewQ.data?.data ?? null;
  const managerDash = managerDashQ.data?.data ?? null;
  const error =
    anomaliesQ.error?.message ?? overviewQ.error?.message ?? managerDashQ.error?.message ?? null;

  if (!user) return null;

  return (
    <TopNav><main className="mx-auto max-w-6xl p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Xin chào, {user.full_name?.split(' ').slice(-1)[0] ?? 'bạn'} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {admin
              ? 'Tổng quan toàn hệ thống — realtime.'
              : 'Tổng quan chi nhánh bạn đang quản lý.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        )}

        {admin && overview && (
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile
              label="Nhân viên"
              value={overview.total_employees}
              icon="👥"
              tone="brand"
            />
            <StatTile
              label="Chi nhánh"
              value={overview.total_branches}
              icon="🏢"
              tone="violet"
            />
            <StatTile
              label="Check-in hôm nay"
              value={overview.today.checked_in}
              icon="✅"
              tone="teal"
            />
            <StatTile
              label="On-time rate"
              value={`${Math.round(overview.today.on_time_rate * 100)}%`}
              icon={overview.today.on_time_rate > 0.9 ? '🚀' : '⚠️'}
              tone={overview.today.on_time_rate > 0.9 ? 'emerald' : 'amber'}
            />
          </section>
        )}

        {admin && overview && (
          <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-900">Trạng thái hôm nay</h3>
              <div className="mt-4 space-y-3">
                <StatusRow label="Đúng giờ" count={overview.today.on_time} tone="emerald" />
                <StatusRow label="Đi muộn" count={overview.today.late} tone="amber" />
                <StatusRow label="Vắng" count={overview.today.absent} tone="rose" />
              </div>
            </div>

            <div className="card">
              <h3 className="text-sm font-semibold text-slate-900">Top đúng giờ 🏆</h3>
              <div className="mt-4 space-y-2">
                {overview.top_branches_on_time.length === 0 ? (
                  <p className="text-xs text-slate-400">Chưa có dữ liệu hôm nay</p>
                ) : (
                  overview.top_branches_on_time.map((b, i) => (
                    <div key={b.branch_id} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-slate-700">
                        <span className="text-xs font-semibold text-slate-400">#{i + 1}</span>
                        {b.name}
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        {(b.rate * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card">
              <h3 className="text-sm font-semibold text-slate-900">Top đi muộn</h3>
              <div className="mt-4 space-y-2">
                {overview.top_branches_late.length === 0 ? (
                  <p className="text-xs text-slate-400">Không có branch đi muộn 🎉</p>
                ) : (
                  overview.top_branches_late.map((b) => (
                    <div key={b.branch_id} className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">{b.name}</span>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        {b.late_count}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        {admin && overview && overview.checkin_heatmap.length > 0 && (
          <section className="mt-6">
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-900">Check-in heatmap (giờ VN)</h3>
              <Heatmap data={overview.checkin_heatmap} />
            </div>
          </section>
        )}

        {!admin && (
          <section className="mt-2">
            {managerBranches.length > 1 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {managerBranches.map((b) => {
                  const active = b.id === currentBranchId;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setSelectedBranchId(b.id)}
                      className={
                        active
                          ? 'rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm'
                          : 'rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-brand-50'
                      }
                    >
                      {b.name}
                    </button>
                  );
                })}
              </div>
            )}

            {managerDash && (
              <>
                <h2 className="mb-3 text-xl font-bold text-slate-900">
                  📍 {managerDash.branch.name}
                </h2>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <StatTile label="Tổng NV" value={managerDash.today.total} icon="👥" tone="brand" />
                  <StatTile label="Đã check-in" value={managerDash.today.checked_in} icon="✅" tone="teal" />
                  <StatTile label="Chưa đến" value={managerDash.today.not_yet} icon="⏳" tone="amber" />
                  <StatTile label="Vắng" value={managerDash.today.absent} icon="❌" tone="rose" />
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="card">
                    <h3 className="text-sm font-semibold text-slate-900">Trạng thái hôm nay</h3>
                    <div className="mt-4 space-y-3">
                      <StatusRow label="Đúng giờ" count={managerDash.today.on_time} tone="emerald" />
                      <StatusRow label="Đi muộn" count={managerDash.today.late} tone="amber" />
                      <StatusRow label="Vắng" count={managerDash.today.absent} tone="rose" />
                    </div>
                  </div>

                  <div className="card">
                    <h3 className="text-sm font-semibold text-slate-900">📈 Tỉ lệ đúng giờ 7 ngày</h3>
                    <WeekTrend data={managerDash.week_trend} />
                  </div>
                </div>

                <div className="mt-6 card">
                  <h3 className="text-sm font-semibold text-slate-900">
                    ⚠️ Trust thấp hôm nay ({managerDash.low_trust_today.length})
                  </h3>
                  {managerDash.low_trust_today.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-400">Không có cảnh báo 👌</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-slate-100">
                      {managerDash.low_trust_today.map((s) => (
                        <li key={s.session_id} className="flex items-center justify-between py-2 text-sm">
                          <div>
                            <div className="font-medium text-slate-900">{s.employee.name}</div>
                            <div className="text-xs text-slate-500">
                              {s.employee.code}
                              {s.risk_flags.length > 0 && ` · ${s.risk_flags.join(', ')}`}
                            </div>
                          </div>
                          <span
                            className={
                              s.trust_score < 40
                                ? 'rounded-full bg-rose-100 px-2 py-0.5 font-mono text-xs font-semibold text-rose-700'
                                : 'rounded-full bg-amber-100 px-2 py-0.5 font-mono text-xs font-semibold text-amber-700'
                            }
                          >
                            {s.trust_score}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        <section className="mt-6">
          <h2 className="mb-3 text-xl font-bold text-slate-900">🚨 Bất thường</h2>
          {!anomalies ? (
            <p className="text-sm text-slate-500">Đang tải…</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <AnomalyCard
                title="Branches đi muộn tăng đột biến"
                count={anomalies.branches_late_spike.length}
                tone="rose"
              >
                {anomalies.branches_late_spike.length === 0 ? (
                  <p className="text-xs text-slate-400">Không có bất thường 👌</p>
                ) : (
                  anomalies.branches_late_spike.map((b) => (
                    <div
                      key={b.branch_id}
                      className="border-t border-slate-100 py-2 first:border-t-0"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-900">{b.name}</span>
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                          {b.spike_ratio !== null ? `${b.spike_ratio.toFixed(1)}×` : 'new'}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Hôm nay {(b.late_rate_today * 100).toFixed(0)}% · TB 7 ngày{' '}
                        {(b.late_rate_avg_7d * 100).toFixed(0)}%
                      </div>
                    </div>
                  ))
                )}
              </AnomalyCard>

              <AnomalyCard
                title="Nhân viên trust thấp"
                count={anomalies.employees_low_trust.length}
                tone="amber"
              >
                {anomalies.employees_low_trust.length === 0 ? (
                  <p className="text-xs text-slate-400">Không có cảnh báo 👌</p>
                ) : (
                  anomalies.employees_low_trust.map((e) => (
                    <div key={e.employee_id} className="flex items-center justify-between py-1">
                      <span className="font-mono text-sm text-slate-700">{e.code}</span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        {e.low_trust_count_7d} sessions
                      </span>
                    </div>
                  ))
                )}
              </AnomalyCard>

              <AnomalyCard title="Thiết bị mới hôm nay" count={anomalies.untrusted_devices_new_today} tone="brand">
                <div className="text-4xl font-bold text-brand-600">
                  {anomalies.untrusted_devices_new_today}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Device lần đầu thấy hôm nay (chưa trusted)
                </p>
              </AnomalyCard>
            </div>
          )}
        </section>
      </main>
    </TopNav>
  );
}

const TONE_CLASSES: Record<string, { bg: string; fg: string; accent: string }> = {
  brand: { bg: 'bg-brand-50', fg: 'text-brand-700', accent: 'from-brand-500 to-violet-500' },
  violet: { bg: 'bg-violet-50', fg: 'text-violet-700', accent: 'from-violet-500 to-pink-500' },
  teal: { bg: 'bg-teal-50', fg: 'text-teal-700', accent: 'from-teal-500 to-emerald-500' },
  emerald: { bg: 'bg-emerald-50', fg: 'text-emerald-700', accent: 'from-emerald-500 to-teal-500' },
  amber: { bg: 'bg-amber-50', fg: 'text-amber-700', accent: 'from-amber-500 to-orange-500' },
  rose: { bg: 'bg-rose-50', fg: 'text-rose-700', accent: 'from-rose-500 to-pink-500' },
};

function StatTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: string;
  tone: keyof typeof TONE_CLASSES;
}) {
  const t = TONE_CLASSES[tone];
  return (
    <div className="card-interactive group relative overflow-hidden">
      <div
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.accent}`}
        aria-hidden
      />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.bg} text-xl`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: 'emerald' | 'amber' | 'rose';
}) {
  const dotColor =
    tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm text-slate-700">
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        {label}
      </span>
      <span className="text-lg font-bold text-slate-900">{count}</span>
    </div>
  );
}

function AnomalyCard({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: 'brand' | 'rose' | 'amber';
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span
          className={
            tone === 'rose'
              ? 'rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700'
              : tone === 'amber'
                ? 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700'
                : 'rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700'
          }
        >
          {count}
        </span>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function WeekTrend({ data }: { data: { date: string; on_time_rate: number }[] }) {
  if (data.length === 0) {
    return <p className="mt-3 text-xs text-slate-400">Chưa có dữ liệu.</p>;
  }
  return (
    <div className="mt-4 flex h-24 items-end gap-1.5">
      {data.map((d) => {
        const pct = d.on_time_rate;
        const label = new Date(d.date).toLocaleDateString('vi-VN', { weekday: 'short' });
        return (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${(pct * 100).toFixed(0)}%`}>
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-brand-500 to-violet-400"
              style={{ height: `${Math.max(pct * 100, 4)}%`, opacity: 0.3 + 0.7 * pct }}
            />
            <span className="text-[10px] font-medium text-slate-400">{label}</span>
            <span className="text-[9px] text-slate-500">{(pct * 100).toFixed(0)}%</span>
          </div>
        );
      })}
    </div>
  );
}

function Heatmap({ data }: { data: { hour: number; count: number }[] }) {
  const byHour = new Map(data.map((d) => [d.hour, d.count]));
  const max = Math.max(...data.map((d) => d.count), 1);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className="mt-4 flex h-32 items-end gap-1.5">
      {hours.map((h) => {
        const count = byHour.get(h) ?? 0;
        const ratio = count / max;
        return (
          <div key={h} className="flex flex-1 flex-col items-center gap-1" title={`${h}h: ${count}`}>
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-brand-500 to-violet-400 transition-opacity"
              style={{
                height: `${Math.max(ratio * 100, count > 0 ? 4 : 0)}%`,
                opacity: count > 0 ? 0.3 + 0.7 * ratio : 0.08,
              }}
            />
            <span className="text-[10px] font-medium text-slate-400">{h}</span>
          </div>
        );
      })}
    </div>
  );
}
