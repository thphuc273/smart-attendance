'use client';

import { useEffect, useRef, useState } from 'react';

interface LiveEvent {
  type: 'check_in' | 'check_out';
  employee_id: string;
  employee_name: string;
  branch_id: string;
  branch_name: string;
  session_id: string;
  at: string;
  status: string;
  method: string;
}

const MAX_ITEMS = 20;

export function LiveFeed({ token }: { token: string | null }) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!token) return;
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';
    // EventSource does not support custom headers in standard impl — use query token.
    const url = `${base}/dashboard/live?access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(url, { withCredentials: false });
    esRef.current = es;
    es.addEventListener('attendance', (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data) as LiveEvent;
        setEvents((prev) => [ev, ...prev].slice(0, MAX_ITEMS));
      } catch {
        /* ignore */
      }
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [token]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Live check-in</h2>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}
          />
          {connected ? 'LIVE' : 'offline'}
        </span>
      </div>
      {events.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          Chưa có check-in nào. Sự kiện sẽ hiện ở đây ngay khi có nhân viên chấm công.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {events.map((ev, i) => (
            <li key={`${ev.session_id}-${i}`} className="flex items-center gap-3 py-2.5 text-sm">
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  ev.type === 'check_in'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-indigo-50 text-indigo-700'
                }`}
              >
                {ev.type === 'check_in' ? 'IN' : 'OUT'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium text-slate-900">{ev.employee_name}</p>
                <p className="truncate text-xs text-slate-500">
                  {ev.branch_name} • {ev.method}
                </p>
              </div>
              <time className="shrink-0 font-mono text-xs text-slate-400">
                {new Date(ev.at).toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
