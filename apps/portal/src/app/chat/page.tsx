'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TopNav } from '../../components/nav';
import { useRequireAuth } from '../../lib/auth';
import { isAdmin, isManager } from '../../lib/api';

type Role = 'user' | 'assistant' | 'system';

interface Msg {
  id: string;
  role: Role;
  content: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

export default function ChatPage() {
  const user = useRequireAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadedHistory, setLoadedHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || loadedHistory) return;
    const token = getAccessToken();
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/ai/chat/history?limit=50`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = (await res.json()) as { data: Array<{ id: string; role: Role; content: string }> };
          setMessages(json.data);
        }
      } finally {
        setLoadedHistory(true);
      }
    })();
  }, [user, loadedHistory]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    const token = getAccessToken();
    if (!token) return;
    setInput('');
    const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', content: text };
    const pendingId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, userMsg, { id: pendingId, role: 'assistant', content: '' }]);
    setStreaming(true);

    try {
      const res = await fetch(`${API_BASE_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const json = JSON.parse(payload) as { delta?: string; done?: boolean; error?: string };
            if (json.delta) {
              setMessages((prev) =>
                prev.map((m) => (m.id === pendingId ? { ...m, content: m.content + json.delta } : m)),
              );
            }
            if (json.error) {
              setMessages((prev) =>
                prev.map((m) => (m.id === pendingId ? { ...m, content: `⚠️ ${json.error}` } : m)),
              );
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId ? { ...m, content: `⚠️ ${(err as Error).message}` } : m,
        ),
      );
    } finally {
      setStreaming(false);
    }
  }, [input, streaming]);

  if (!user) return null;

  const roleLabel = isAdmin(user) ? 'Admin' : isManager(user) ? 'Manager' : 'Nhân viên';
  const scopeHint = isAdmin(user)
    ? 'Bạn có thể hỏi tổng quan toàn hệ thống (tổng NV, chi nhánh, xu hướng, bất thường…).'
    : isManager(user)
      ? 'Bạn có thể hỏi về các chi nhánh bạn quản lý (check-in hôm nay, top muộn, trust thấp…).'
      : 'Bạn có thể hỏi về lịch làm, phiên chấm công, phép của riêng bạn.';

  return (
    <TopNav>
      <main className="mx-auto flex h-[calc(100vh-0px)] max-w-4xl flex-col p-4 md:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">🤖 Trợ lý AI</h1>
            <p className="mt-1 text-sm text-slate-500">
              {roleLabel} • {user.full_name} — {scopeHint}
            </p>
          </div>
          <button
            onClick={async () => {
              if (streaming) return;
              const token = getAccessToken();
              if (!token) return;
              if (!confirm('Xoá đoạn chat hiện tại và bắt đầu đoạn mới?')) return;
              try {
                await fetch(`${API_BASE_URL}/ai/chat/history`, {
                  method: 'DELETE',
                  headers: { authorization: `Bearer ${token}` },
                });
              } catch {
                /* ignore — clear locally anyway */
              }
              setMessages([]);
              setLoadedHistory(true);
            }}
            disabled={streaming}
            className="shrink-0 rounded-lg bg-gradient-to-r from-brand-500 to-violet-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
          >
            ✨ Đoạn chat mới
          </button>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200"
        >
          {messages.length === 0 && loadedHistory && (
            <div className="mt-16 text-center text-sm text-slate-500">
              <p className="text-lg font-medium">Chào bạn 👋</p>
              <p className="mt-2 text-xs">
                Hỏi về chấm công, ca làm, báo cáo. Trợ lý chỉ truy xuất dữ liệu bạn được phép xem.
              </p>
              <div className="mx-auto mt-4 flex max-w-md flex-col gap-2">
                {getSuggestions(roleLabel).map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:border-brand-300 hover:bg-brand-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => {
            const isPending = m.role === 'assistant' && !m.content && streaming;
            if (isPending) return <ThinkingBubble key={m.id} />;
            return (
              <div
                key={m.id}
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'ml-auto bg-brand-500 text-white'
                    : 'mr-auto bg-white text-slate-700 ring-1 ring-slate-200'
                }`}
              >
                {m.content}
                {m.role === 'assistant' && streaming && m.content && (
                  <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-brand-500 align-middle" />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={streaming ? 'Đang trả lời…' : 'Nhập câu hỏi…'}
            disabled={streaming}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            className="rounded-xl bg-gradient-to-r from-brand-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {streaming ? '…' : 'Gửi'}
          </button>
        </div>
      </main>
    </TopNav>
  );
}

function ThinkingBubble() {
  return (
    <div className="mr-auto flex max-w-[85%] items-center gap-2.5 rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-slate-200">
      <span className="relative flex h-6 w-6 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand-400/40" />
        <span className="relative text-base">🤖</span>
      </span>
      <span className="text-xs text-slate-500">Đang suy nghĩ</span>
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500" />
      </span>
    </div>
  );
}

function getSuggestions(role: string): string[] {
  if (role === 'Admin') {
    return [
      'Hôm nay có bao nhiêu nhân viên đi muộn?',
      'Chi nhánh nào có tỉ lệ đúng giờ cao nhất tuần này?',
      'Có bất thường nào cần chú ý không?',
    ];
  }
  if (role === 'Manager') {
    return [
      'Ai đang chưa check-in hôm nay?',
      'Top 3 nhân viên đi muộn tuần này?',
      'Có ai có trust score thấp không?',
    ];
  }
  return [
    'Tuần này tôi đi muộn mấy lần?',
    'Ca làm sắp tới của tôi là khi nào?',
    'Tôi còn bao nhiêu ngày phép?',
  ];
}
