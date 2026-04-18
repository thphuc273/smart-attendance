'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApi } from '../lib/api';
import { useApiQuery, queryKeys } from '../lib/queries';

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
  data: Notification[];
  meta: { total: number; unread: number; page: number; limit: number; total_pages: number };
}

const POLL_MS = 60_000;

export function NotificationBell({ popupClassName = 'right-0 top-full mt-2' }: { popupClassName?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const listQ = useApiQuery<ListResponse>(
    queryKeys.notifications({ limit: 20 }),
    'notifications?limit=20',
    true,
  );

  useEffect(() => {
    const id = setInterval(() => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications({ limit: 20 }) });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [qc]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const items = listQ.data?.data ?? [];
  const unread = listQ.data?.meta?.unread ?? 0;

  const markOneM = useMutation({
    mutationFn: (id: string) => getApi().patch(`notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllM = useMutation({
    mutationFn: () => getApi().post('notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

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
              <button
                onClick={() => markAllM.mutate()}
                disabled={markAllM.isPending}
                className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
              >
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
                onClick={() => markOneM.mutate(n.id)}
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
