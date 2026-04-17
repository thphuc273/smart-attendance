'use client';

import { useEffect, useRef, useState } from 'react';
import { getApi } from '../lib/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: any;
  read_at: string | null;
  created_at: string;
}

interface ListResponse {
  data: {
    items: Notification[];
    meta: { total: number; unread: number; page: number; limit: number; total_pages: number };
  };
}

const POLL_MS = 60_000;

export function NotificationBell({ popupClassName = 'right-0 top-full mt-2' }: { popupClassName?: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await getApi().get('notifications', { searchParams: { limit: 20 } }).json<ListResponse>();
      setItems(res.data?.items || []);
      setUnread(res.data?.meta?.unread || 0);
    } catch {
      // silent — bell is best-effort
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const markOne = async (id: string) => {
    try {
      await getApi().patch(`notifications/${id}/read`);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
      setUnread((u) => Math.max(0, u - 1));
    } catch {}
  };

  const markAll = async () => {
    try {
      await getApi().post('notifications/read-all');
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
      setUnread(0);
    } catch {}
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100"
        aria-label="Thông báo"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className={`absolute z-50 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg ${popupClassName}`}>
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-sm font-semibold text-slate-900">Thông báo</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs font-medium text-brand-600 hover:underline">
                Đánh dấu đã đọc
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-slate-400">Chưa có thông báo</div>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => markOne(n.id)}
                className={`block w-full border-b border-slate-50 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-slate-50 ${
                  n.read_at ? 'opacity-60' : 'bg-brand-50/30'
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.read_at && <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{n.title}</div>
                    <div className="mt-0.5 text-xs text-slate-600 line-clamp-2">{n.body}</div>
                    <div className="mt-1 text-[10px] text-slate-400">{formatTime(n.created_at)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'vừa xong';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} phút trước`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} giờ trước`;
  return d.toLocaleDateString('vi-VN');
}
