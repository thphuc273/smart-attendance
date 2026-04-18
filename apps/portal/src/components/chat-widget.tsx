'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

export function ChatWidget({ userLabel }: { userLabel: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadedHistory, setLoadedHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load history once when first opened.
  useEffect(() => {
    if (!open || loadedHistory) return;
    const token = getAccessToken();
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/ai/chat/history?limit=30`, {
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
  }, [open, loadedHistory]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

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

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-2xl text-white shadow-xl transition hover:scale-105"
          aria-label="Mở chatbot"
        >
          🤖
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 flex h-[560px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-brand-500 to-violet-500 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">FinOS Assistant</p>
              <p className="text-xs opacity-90">{userLabel}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white"
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3">
            {messages.length === 0 && loadedHistory && (
              <div className="mt-8 text-center text-sm text-slate-500">
                <p className="font-medium">Chào bạn 👋</p>
                <p className="mt-2 text-xs">
                  Hỏi về chấm công, ca làm, báo cáo — chatbot chỉ truy xuất dữ liệu bạn được phép xem.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'ml-auto bg-brand-500 text-white'
                    : 'mr-auto bg-white text-slate-700 ring-1 ring-slate-200'
                }`}
              >
                {m.content || <span className="text-slate-400">…</span>}
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2 border-t border-slate-200 bg-white p-2">
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
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
            <button
              onClick={send}
              disabled={streaming || !input.trim()}
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {streaming ? '…' : 'Gửi'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
