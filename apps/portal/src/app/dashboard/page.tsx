'use client';

import { useEffect, useState } from 'react';
import { TopNav } from '../../components/nav';
import { useRequireAuth } from '../../lib/auth';
import { getApi, isAdmin } from '../../lib/api';

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

export default function DashboardPage() {
  const user = useRequireAuth('manager');
  const [overview, setOverview] = useState<AdminOverview['data'] | null>(null);
  const [anomalies, setAnomalies] = useState<AnomaliesResp['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const api = getApi();
    const load = async () => {
      try {
        const tasks: Promise<unknown>[] = [
          api.get('dashboard/anomalies').json<AnomaliesResp>().then((r) => setAnomalies(r.data)),
        ];
        if (isAdmin(user)) {
          tasks.push(
            api.get('dashboard/admin/overview').json<AdminOverview>().then((r) => setOverview(r.data)),
          );
        }
        await Promise.all(tasks);
      } catch (e) {
        setError((e as Error).message);
      }
    };
    load();
  }, [user]);

  if (!user) return null;

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          {isAdmin(user) ? 'Tổng quan toàn hệ thống' : 'Tổng quan chi nhánh bạn quản lý'}
        </p>

        {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        {isAdmin(user) && overview && (
          <section className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Nhân viên active" value={overview.total_employees} />
            <StatCard label="Chi nhánh active" value={overview.total_branches} />
            <StatCard label="Check-in hôm nay" value={overview.today.checked_in} />
            <StatCard
              label="On-time rate"
              value={`${Math.round(overview.today.on_time_rate * 100)}%`}
              accent={overview.today.on_time_rate > 0.9 ? 'green' : 'amber'}
            />
          </section>
        )}

        {isAdmin(user) && overview && (
          <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <Card title="Status hôm nay">
              <StatusRow label="On-time" count={overview.today.on_time} tone="green" />
              <StatusRow label="Late" count={overview.today.late} tone="amber" />
              <StatusRow label="Absent" count={overview.today.absent} tone="red" />
            </Card>
            <Card title="Top branches on-time">
              {overview.top_branches_on_time.length === 0 ? (
                <p className="text-xs text-slate-500">Chưa có dữ liệu hôm nay</p>
              ) : (
                overview.top_branches_on_time.map((b) => (
                  <div key={b.branch_id} className="flex justify-between text-sm">
                    <span>{b.name}</span>
                    <span className="font-mono">{(b.rate * 100).toFixed(0)}%</span>
                  </div>
                ))
              )}
            </Card>
            <Card title="Top branches late">
              {overview.top_branches_late.length === 0 ? (
                <p className="text-xs text-slate-500">Không có branch trễ</p>
              ) : (
                overview.top_branches_late.map((b) => (
                  <div key={b.branch_id} className="flex justify-between text-sm">
                    <span>{b.name}</span>
                    <span className="font-mono text-amber-600">{b.late_count}</span>
                  </div>
                ))
              )}
            </Card>
          </section>
        )}

        {isAdmin(user) && overview && overview.checkin_heatmap.length > 0 && (
          <section className="mt-8">
            <Card title="Heatmap check-in (giờ VN)">
              <Heatmap data={overview.checkin_heatmap} />
            </Card>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Anomalies</h2>
          {!anomalies ? (
            <p className="mt-2 text-sm text-slate-500">Đang tải…</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card title={`Branches late spike (${anomalies.branches_late_spike.length})`}>
                {anomalies.branches_late_spike.length === 0 ? (
                  <p className="text-xs text-slate-500">Không có bất thường 👍</p>
                ) : (
                  anomalies.branches_late_spike.map((b) => (
                    <div key={b.branch_id} className="border-t border-slate-100 py-2 text-sm first:border-t-0">
                      <div className="flex justify-between">
                        <span className="font-medium">{b.name}</span>
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                          {b.spike_ratio !== null ? `${b.spike_ratio.toFixed(1)}×` : 'new'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        today {(b.late_rate_today * 100).toFixed(0)}% · 7d avg{' '}
                        {(b.late_rate_avg_7d * 100).toFixed(0)}%
                      </div>
                    </div>
                  ))
                )}
              </Card>
              <Card title={`Employees low-trust ${anomalies.employees_low_trust.length}`}>
                {anomalies.employees_low_trust.length === 0 ? (
                  <p className="text-xs text-slate-500">Không có cảnh báo 👍</p>
                ) : (
                  anomalies.employees_low_trust.map((e) => (
                    <div key={e.employee_id} className="flex justify-between text-sm">
                      <span className="font-mono">{e.code}</span>
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">
                        {e.low_trust_count_7d} sessions
                      </span>
                    </div>
                  ))
                )}
              </Card>
              <Card title="New untrusted devices today">
                <div className="text-3xl font-bold">{anomalies.untrusted_devices_new_today}</div>
                <p className="mt-1 text-xs text-slate-500">
                  Thiết bị lần đầu thấy hôm nay (is_trusted=false)
                </p>
              </Card>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: 'green' | 'amber' }) {
  const accentClass =
    accent === 'green'
      ? 'text-green-700'
      : accent === 'amber'
        ? 'text-amber-700'
        : 'text-slate-900';
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accentClass}`}>{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 space-y-1">{children}</div>
    </div>
  );
}

function StatusRow({ label, count, tone }: { label: string; count: number; tone: 'green' | 'amber' | 'red' }) {
  const bg = tone === 'green' ? 'bg-green-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${bg}`} />
        {label}
      </span>
      <span className="font-mono">{count}</span>
    </div>
  );
}

function Heatmap({ data }: { data: { hour: number; count: number }[] }) {
  const byHour = new Map(data.map((d) => [d.hour, d.count]));
  const max = Math.max(...data.map((d) => d.count), 1);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className="flex items-end gap-1">
      {hours.map((h) => {
        const count = byHour.get(h) ?? 0;
        const ratio = count / max;
        return (
          <div key={h} className="flex flex-1 flex-col items-center">
            <div
              className="w-full rounded-t bg-slate-900"
              style={{ height: `${Math.max(ratio * 80, count > 0 ? 4 : 0)}px`, opacity: count > 0 ? 0.3 + 0.7 * ratio : 0.1 }}
              title={`${h}h: ${count}`}
            />
            <span className="mt-1 text-[10px] text-slate-500">{h}</span>
          </div>
        );
      })}
    </div>
  );
}
