'use client';

import { useEffect, useState } from 'react';
import { TopNav } from '../../components/nav';
import { useRequireAuth } from '../../lib/auth';
import { getApi } from '../../lib/api';
import { useApiQuery, queryKeys } from '../../lib/queries';
import { useQueryClient } from '@tanstack/react-query';

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
}

interface HistoryResp {
  data: Session[];
  meta: { total: number; page: number; limit: number; total_pages: number };
}

interface CheckInResp {
  data: {
    session_id: string;
    status: string;
    trust_score: number;
    trust_level: string;
    validation_method: string;
    risk_flags: string[];
    branch: { id: string; name: string };
    check_in_at?: string;
    check_out_at?: string;
    worked_minutes?: number;
    overtime_minutes?: number;
  };
}

/** Returns 'YYYY-MM-DD' for the given Date in Asia/Ho_Chi_Minh (UTC+7). */
function vnDateString(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
}

function getDeviceFingerprint(): string {
  const key = 'device_fingerprint';
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = `web-${crypto.randomUUID()}`;
    localStorage.setItem(key, fp);
  }
  return fp;
}

async function getGeoPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Trình duyệt không hỗ trợ Geolocation'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 0,
    });
  });
}

export default function CheckinPage() {
  const user = useRequireAuth('employee');
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState<'in' | 'out' | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [lastResult, setLastResult] = useState<CheckInResp['data'] | null>(null);
  const [errorDebug, setErrorDebug] = useState<unknown>(null);

  const historyQ = useApiQuery<HistoryResp>(
    queryKeys.mySessions({ limit: 14 }),
    'attendance/me?limit=14',
    !!user,
  );
  const history = historyQ.data?.data ?? [];
  const todayVN = vnDateString(new Date());
  const today = history.find((s) => vnDateString(new Date(s.workDate)) === todayVN) ?? null;

  const refreshHistory = () => qc.invalidateQueries({ queryKey: ['sessions', 'me'] });

  const doCheck = async (kind: 'in' | 'out') => {
    if (!user) return;
    setSubmitting(kind);
    setMessage(null);
    setLastResult(null);
    setErrorDebug(null);
    try {
      const pos = await getGeoPosition();
      const body = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_meters: Math.round(pos.coords.accuracy),
        device_fingerprint: getDeviceFingerprint(),
        platform: 'web',
        device_name: navigator.userAgent.slice(0, 80),
        app_version: '1.0.0-web',
        is_mock_location: false,
      };
      const api = getApi();
      const resp = await api
        .post(`attendance/check-${kind}`, { json: body })
        .json<CheckInResp>();
      setLastResult(resp.data);
      setMessage({
        kind: 'ok',
        text: `✅ Check-${kind === 'in' ? 'in' : 'out'} thành công tại ${resp.data.branch.name}`,
      });
      await refreshHistory();
    } catch (e) {
      let text = (e as Error).message;
      let debug: unknown = null;
      try {
        const err = e as { response?: Response };
        if (err.response) {
          const body = (await err.response.clone().json()) as {
            error?: {
              code?: string;
              message?: string;
              details?: {
                trust_score?: number;
                risk_flags?: string[];
                distance_meters?: number | null;
                hint?: string;
                user_location?: { latitude: number; longitude: number };
                scanned_branches?: Array<{ code: string; name: string; latitude: number; longitude: number; radius_meters: number }>;
              };
            };
          };
          if (body.error) {
            text = `❌ ${body.error.code}: ${body.error.message}`;
            if (body.error.details?.hint) {
              text += `\n💡 ${body.error.details.hint}`;
            } else if (body.error.details?.distance_meters != null) {
              text += ` (cách geofence ${body.error.details.distance_meters}m)`;
            }
            // Keep debug payload but strip security-internal fields
            // (trust_score / risk_flags are for admin/manager only)
            const d = body.error.details;
            if (d) {
              debug = {
                distance_meters: d.distance_meters,
                user_location: d.user_location,
                scanned_branches: d.scanned_branches,
              };
            }
          }
        }
      } catch {
        // fallback to raw message
      }
      setMessage({ kind: 'err', text });
      setErrorDebug(debug);
    } finally {
      setSubmitting(null);
    }
  };

  if (!user) return null;

  const checkedIn = !!today?.checkInAt;
  const checkedOut = !!today?.checkOutAt;

  return (
    <TopNav><main className="mx-auto max-w-3xl p-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Chấm công</h1>
        <p className="mt-1 text-sm text-slate-500">
          Xin chào {user.full_name ?? user.email} 👋 Trình duyệt sẽ hỏi quyền Vị trí khi bạn bấm.
        </p>

        <section className="mt-6 overflow-hidden rounded-2xl bg-white p-6 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Hôm nay</p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {new Date().toLocaleDateString('vi-VN', {
                  weekday: 'long',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </p>
            </div>
            {today && <StatusPill status={today.status} />}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-50/60 p-4">
              <p className="text-xs font-medium text-emerald-700">Check-in</p>
              <p className="mt-1 font-mono text-lg font-semibold text-slate-900">
                {today?.checkInAt ? new Date(today.checkInAt).toLocaleTimeString('vi-VN') : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-brand-50/60 p-4">
              <p className="text-xs font-medium text-brand-700">
                Check-out
                {!today?.checkOutAt && (
                  <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-normal text-brand-600/70">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
                    live
                  </span>
                )}
              </p>
              <p className="mt-1 font-mono text-lg font-semibold text-slate-900">
                {today?.checkOutAt
                  ? new Date(today.checkOutAt).toLocaleTimeString('vi-VN')
                  : now.toLocaleTimeString('vi-VN')}
              </p>
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              onClick={() => doCheck('in')}
              disabled={submitting !== null || checkedIn}
              className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-md"
            >
              {submitting === 'in' ? 'Đang check-in…' : checkedIn ? '✓ Đã check-in' : '→ Check-in'}
            </button>
            <button
              onClick={() => doCheck('out')}
              disabled={submitting !== null || !checkedIn}
              className="flex-1 rounded-xl border-2 border-brand-600 bg-white py-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting === 'out'
                ? 'Đang check-out…'
                : checkedOut
                  ? '↻ Cập nhật check-out'
                  : '← Check-out'}
            </button>
          </div>

          {message && (
            <div
              className={
                message.kind === 'ok'
                  ? 'mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800 whitespace-pre-line'
                  : 'mt-4 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700 whitespace-pre-line'
              }
            >
              {message.text}
            </div>
          )}

          {errorDebug !== null && typeof errorDebug === 'object' && errorDebug !== null && (
            <details className="mt-2 rounded-xl bg-slate-50 p-3 text-xs">
              <summary className="cursor-pointer font-medium text-slate-600">
                Chi tiết debug (admin/dev)
              </summary>
              <pre className="mt-2 overflow-x-auto font-mono text-[10px] text-slate-700">
                {JSON.stringify(errorDebug, null, 2)}
              </pre>
            </details>
          )}

          {lastResult && (
            <dl className="mt-4 space-y-1.5 rounded-xl bg-gradient-to-br from-brand-50/50 to-violet-50/50 p-4 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-500">Chi nhánh</dt>
                <dd className="font-semibold text-slate-900">{lastResult.branch.name}</dd>
              </div>
              {lastResult.check_in_at && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Thời gian check-in</dt>
                  <dd className="font-mono font-semibold text-slate-900">
                    {new Date(lastResult.check_in_at).toLocaleTimeString('vi-VN')}
                  </dd>
                </div>
              )}
              {lastResult.check_out_at && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Thời gian check-out</dt>
                  <dd className="font-mono font-semibold text-slate-900">
                    {new Date(lastResult.check_out_at).toLocaleTimeString('vi-VN')}
                  </dd>
                </div>
              )}
              {lastResult.worked_minutes !== undefined && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Thời gian làm</dt>
                  <dd className="font-mono font-semibold text-slate-900">
                    {Math.floor(lastResult.worked_minutes / 60)}h {lastResult.worked_minutes % 60}m
                  </dd>
                </div>
              )}
              {lastResult.overtime_minutes !== undefined && lastResult.overtime_minutes > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Overtime</dt>
                  <dd className="font-mono font-semibold text-emerald-600">{lastResult.overtime_minutes} min</dd>
                </div>
              )}
            </dl>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold text-slate-900">📊 14 ngày gần nhất</h2>

          <HistorySummary history={history} />

          <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-card">
            {history.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">Chưa có session.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Ngày</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3">In</th>
                    <th className="px-4 py-3">Out</th>
                    <th className="px-4 py-3 text-right">Late / OT</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-slate-50 last:border-0 transition-colors hover:bg-slate-50/60"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {vnDateString(new Date(s.workDate))}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={s.status} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {s.checkInAt ? new Date(s.checkInAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {s.checkOutAt ? new Date(s.checkOutAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {s.lateMinutes ? <span className="font-semibold text-amber-600">L{s.lateMinutes}</span> : null}
                        {s.lateMinutes && s.overtimeMinutes ? ' · ' : null}
                        {s.overtimeMinutes ? <span className="font-semibold text-emerald-600">OT{s.overtimeMinutes}</span> : null}
                        {!s.lateMinutes && !s.overtimeMinutes ? <span className="text-slate-300">—</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </TopNav>
  );
}

const STATUS_LABEL: Record<string, string> = {
  on_time: 'Đúng giờ',
  late: 'Đi muộn',
  overtime: 'Làm thêm giờ',
  early_leave: 'Về sớm',
  absent: 'Vắng',
  missing_checkout: 'Chưa check-out',
};

function StatusPill({ status }: { status: string }) {
  const TONE: Record<string, string> = {
    on_time: 'bg-emerald-100 text-emerald-700',
    late: 'bg-amber-100 text-amber-700',
    overtime: 'bg-sky-100 text-sky-700',
    early_leave: 'bg-rose-100 text-rose-700',
    absent: 'bg-rose-100 text-rose-700',
    missing_checkout: 'bg-amber-100 text-amber-700',
  };
  const cls = TONE[status] ?? 'bg-slate-100 text-slate-600';
  return <span className={`badge ${cls}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function HistorySummary({ history }: { history: Session[] }) {
  if (history.length === 0) return null;

  const onTime = history.filter((s) => s.status === 'on_time').length;
  const late = history.filter((s) => s.status === 'late' || s.status === 'overtime').length;
  const absent = history.filter((s) => s.status === 'absent').length;
  const missing = history.filter((s) => s.status === 'missing_checkout').length;
  const totalWorked = history.reduce((sum, s) => sum + (s.workedMinutes ?? 0), 0);
  const totalOT = history.reduce((sum, s) => sum + (s.overtimeMinutes ?? 0), 0);
  const totalLate = history.reduce((sum, s) => sum + (s.lateMinutes ?? 0), 0);

  return (
    <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 shadow-card sm:grid-cols-4">
      <SummaryStat label="On-time" value={onTime} tone="emerald" />
      <SummaryStat label="Late / OT" value={late} tone="amber" />
      <SummaryStat label="Absent" value={absent} tone="rose" />
      <SummaryStat label="Missing" value={missing} tone="slate" />
      <SummaryStat label="Giờ làm" value={`${Math.round(totalWorked / 60)}h`} tone="brand" />
      <SummaryStat label="OT total" value={`${totalOT}m`} tone="emerald" />
      <SummaryStat label="Late total" value={`${totalLate}m`} tone="amber" />
      <SummaryStat label="Ngày" value={history.length} tone="brand" />
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: 'emerald' | 'amber' | 'rose' | 'slate' | 'brand';
}) {
  const color =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-600'
        : tone === 'rose'
          ? 'text-rose-600'
          : tone === 'brand'
            ? 'text-brand-700'
            : 'text-slate-600';
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
