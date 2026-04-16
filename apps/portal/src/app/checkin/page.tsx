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
  const [today, setToday] = useState<Session | null>(null);
  const [history, setHistory] = useState<Session[]>([]);
  const [submitting, setSubmitting] = useState<'in' | 'out' | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [lastResult, setLastResult] = useState<CheckInResp['data'] | null>(null);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    try {
      const api = getApi();
      const resp = await api.get('attendance/me?limit=14').json<HistoryResp>();
      setHistory(resp.data);
      const todayISO = new Date().toISOString().slice(0, 10);
      setToday(resp.data.find((s) => s.workDate.slice(0, 10) === todayISO) ?? null);
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message });
    }
  }, [user]);

  useEffect(() => {
    if (user) loadHistory();
  }, [user, loadHistory]);

  const doCheck = async (kind: 'in' | 'out') => {
    if (!user) return;
    setSubmitting(kind);
    setMessage(null);
    setLastResult(null);
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
        text: `✅ Check-${kind} thành công tại ${resp.data.branch.name}. Trust ${resp.data.trust_score}/100 (${resp.data.trust_level})`,
      });
      await loadHistory();
    } catch (e) {
      let text = (e as Error).message;
      try {
        // ky error body: response.json() returns the error envelope
        const err = e as { response?: Response };
        if (err.response) {
          const body = (await err.response.clone().json()) as {
            error?: { code?: string; message?: string; details?: { trust_score?: number; risk_flags?: string[]; distance_meters?: number } };
          };
          if (body.error) {
            text = `❌ ${body.error.code}: ${body.error.message}`;
            if (body.error.details?.distance_meters !== undefined) {
              text += ` (cách geofence ${body.error.details.distance_meters}m)`;
            }
            if (body.error.details?.risk_flags?.length) {
              text += ` · flags: ${body.error.details.risk_flags.join(', ')}`;
            }
          }
        }
      } catch {
        // fallback to raw message
      }
      setMessage({ kind: 'err', text });
    } finally {
      setSubmitting(null);
    }
  };

  if (!user) return null;

  const checkedIn = !!today?.checkInAt;
  const checkedOut = !!today?.checkOutAt;

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold">Chấm công</h1>
        <p className="mt-1 text-sm text-slate-600">
          Chào {user.full_name ?? user.email}. Trình duyệt sẽ xin quyền vị trí khi bạn bấm check-in/out.
        </p>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Hôm nay</p>
              <p className="text-lg font-semibold">
                {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            </div>
            {today && (
              <span
                className={
                  today.status === 'on_time'
                    ? 'rounded bg-green-100 px-2 py-0.5 text-xs text-green-700'
                    : today.status === 'late'
                      ? 'rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700'
                      : 'rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700'
                }
              >
                {today.status}
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Check-in</p>
              <p className="font-mono text-base">
                {today?.checkInAt
                  ? new Date(today.checkInAt).toLocaleTimeString('vi-VN')
                  : '—'}
              </p>
            </div>
            <div className="rounded border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Check-out</p>
              <p className="font-mono text-base">
                {today?.checkOutAt
                  ? new Date(today.checkOutAt).toLocaleTimeString('vi-VN')
                  : '—'}
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => doCheck('in')}
              disabled={submitting !== null || (checkedIn && !today?.checkOutAt)}
              className="flex-1 rounded bg-slate-900 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {submitting === 'in' ? 'Đang check-in…' : checkedIn ? 'Đã check-in' : 'Check-in'}
            </button>
            <button
              onClick={() => doCheck('out')}
              disabled={submitting !== null || !checkedIn || checkedOut}
              className="flex-1 rounded border-2 border-slate-900 py-3 text-sm font-semibold text-slate-900 disabled:opacity-40"
            >
              {submitting === 'out' ? 'Đang check-out…' : checkedOut ? 'Đã check-out' : 'Check-out'}
            </button>
          </div>

          {message && (
            <p
              className={
                message.kind === 'ok'
                  ? 'mt-3 rounded bg-green-50 p-2 text-sm text-green-700'
                  : 'mt-3 rounded bg-red-50 p-2 text-sm text-red-700'
              }
            >
              {message.text}
            </p>
          )}

          {lastResult && (
            <dl className="mt-3 space-y-1 rounded bg-slate-50 p-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-500">Validation</dt>
                <dd className="font-mono">{lastResult.validation_method}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Trust score</dt>
                <dd className="font-mono">{lastResult.trust_score} ({lastResult.trust_level})</dd>
              </div>
              {lastResult.risk_flags.length > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Risk flags</dt>
                  <dd className="font-mono text-amber-600">{lastResult.risk_flags.join(', ')}</dd>
                </div>
              )}
              {lastResult.worked_minutes !== undefined && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Worked</dt>
                  <dd className="font-mono">{lastResult.worked_minutes} min</dd>
                </div>
              )}
              {lastResult.overtime_minutes !== undefined && lastResult.overtime_minutes > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Overtime</dt>
                  <dd className="font-mono text-green-700">{lastResult.overtime_minutes} min</dd>
                </div>
              )}
            </dl>
          )}
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-semibold">Lịch sử 14 ngày gần nhất</h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {history.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Chưa có session.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">In</th>
                    <th className="px-3 py-2">Out</th>
                    <th className="px-3 py-2 text-right">Late / OT</th>
                    <th className="px-3 py-2 text-right">Trust</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">{s.workDate.slice(0, 10)}</td>
                      <td className="px-3 py-2">{s.status}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {s.checkInAt ? new Date(s.checkInAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {s.checkOutAt ? new Date(s.checkOutAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        {s.lateMinutes ? <span className="text-amber-600">L{s.lateMinutes}</span> : null}
                        {s.lateMinutes && s.overtimeMinutes ? ' / ' : null}
                        {s.overtimeMinutes ? <span className="text-green-700">OT{s.overtimeMinutes}</span> : null}
                        {!s.lateMinutes && !s.overtimeMinutes ? '—' : null}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{s.trustScore ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
