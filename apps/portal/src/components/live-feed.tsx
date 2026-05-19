'use client';

import { useEffect, useState } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';

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

  useEffect(() => {
    if (!token) return;
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';
    const ctrl = new AbortController();
    // fetch-event-source carries the JWT in the Authorization header. The
    // native EventSource cannot set headers, which previously forced the
    // token into the URL where it leaks to access logs, browser history
    // and the Referer header.
    let fatal = false;

    fetchEventSource(`${base}/dashboard/live`, {
      headers: { authorization: `Bearer ${token}` },
      signal: ctrl.signal,
      openWhenHidden: true,
      onopen: async (res) => {
        if (res.ok) {
          setConnected(true);
          return;
        }
        // 401/403 etc. — the token is bad; abort instead of hammering retries.
        fatal = true;
        throw new Error(`SSE refused (${res.status})`);
      },
      onmessage: (ev) => {
        if (ev.event !== 'attendance') return; // skip heartbeats
        try {
          const parsed = JSON.parse(ev.data) as LiveEvent;
          setEvents((prev) => [parsed, ...prev].slice(0, MAX_ITEMS));
        } catch {
          /* ignore malformed frame */
        }
      },
      onerror: (err) => {
        setConnected(false);
        if (fatal) throw err; // stop retrying on a fatal auth error
        // otherwise return void → library reconnects with backoff
      },
      onclose: () => setConnected(false),
    }).catch(() => {
      /* aborted or fatal — state already reflects it */
    });

    return () => {
      ctrl.abort();
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
