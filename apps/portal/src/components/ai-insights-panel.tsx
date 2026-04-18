'use client';

import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, useApiQuery } from '../lib/queries';

interface InsightPayload {
  summary?: string;
  highlights?: string[];
  recommendations?: string[];
  anomalies?: string[];
  // Legacy spec shape kept for forward-compat with alternative prompts.
  positives?: string[];
  concerns?: string[];
}

interface InsightsResp {
  data: {
    cached: boolean;
    stub?: boolean;
    generated_at: string;
    week_start: string;
    week_end: string;
    scope: 'admin' | 'branch';
    scope_id: string | null;
    payload: InsightPayload;
  };
}

export function AiInsightsPanel({ branchId }: { branchId: string | null }) {
  const qc = useQueryClient();
  const path =
    branchId ? `ai/insights/weekly?branch_id=${branchId}` : 'ai/insights/weekly';
  const key = queryKeys.aiInsights(branchId);
  const { data, isLoading, isFetching, error, refetch } = useApiQuery<InsightsResp>(key, path);

  const payload = data?.data.payload;
  // Prefer explicit "positives/concerns" if Gemini followed spec; else map
  // summary/highlights → positives, anomalies → concerns.
  const positives = payload?.positives ?? payload?.highlights ?? [];
  const concerns = payload?.concerns ?? payload?.anomalies ?? [];
  const recommendations = payload?.recommendations ?? [];
  const summary = payload?.summary;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">🧠 AI Insights tuần</h2>
          {data && (
            <p className="mt-1 text-xs text-slate-500">
              {data.data.week_start} → {data.data.week_end}
              {data.data.cached && ' · từ cache'}
              {data.data.stub && ' · stub mode (chưa có GEMINI_API_KEY)'}
            </p>
          )}
        </div>
        <button
          onClick={() => {
            qc.invalidateQueries({ queryKey: key });
            void refetch();
          }}
          disabled={isFetching}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40"
          aria-label="Làm mới"
        >
          {isFetching ? '…' : '🔄 Làm mới'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
          Không tải được AI Insights: {error.message}
        </div>
      )}

      {isLoading && !data && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card">
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
              <div className="mt-4 space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-4/6 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          {summary && (
            <div className="mb-4 rounded-xl bg-gradient-to-r from-brand-50 to-violet-50 p-4 text-sm text-slate-700 ring-1 ring-brand-100">
              <span className="mr-2 font-semibold text-brand-700">Tóm tắt:</span>
              {summary}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <InsightCard title="✅ Điểm tích cực" tone="emerald" items={positives} />
            <InsightCard title="⚠️ Cần chú ý" tone="amber" items={concerns} />
            <InsightCard title="💡 Đề xuất" tone="brand" items={recommendations} />
          </div>
        </>
      )}
    </section>
  );
}

function InsightCard({
  title,
  tone,
  items,
}: {
  title: string;
  tone: 'emerald' | 'amber' | 'brand';
  items: string[];
}) {
  const accent =
    tone === 'emerald'
      ? 'from-emerald-500 to-teal-500'
      : tone === 'amber'
        ? 'from-amber-500 to-orange-500'
        : 'from-brand-500 to-violet-500';
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-card">
      <div className={`h-1 bg-gradient-to-r ${accent}`} />
      <div className="p-4">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {items.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">Không có mục nào.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {items.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                <span className="leading-relaxed">{t}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
