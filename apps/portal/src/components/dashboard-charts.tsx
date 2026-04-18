'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { queryKeys, useApiQuery } from '../lib/queries';

interface TrendResp {
  data: { days: { date: string; on_time: number; late: number; absent: number; other: number }[] };
}

interface TodayStatus {
  on_time: number;
  late: number;
  absent: number;
}

interface BranchBar {
  branch_id: string;
  name: string;
  late_count: number;
}

const COLORS = {
  onTime: '#10b981',
  late: '#f59e0b',
  absent: '#ef4444',
  other: '#94a3b8',
};

function MiniCard({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

export function TrendChart({ branchId }: { branchId: string | null }) {
  const path = branchId
    ? `dashboard/manager/${branchId}/trend?days=7`
    : 'dashboard/admin/trend?days=7';
  const key = branchId
    ? queryKeys.dashboardManagerTrend(branchId, 7)
    : queryKeys.dashboardAdminTrend(7);
  const { data, isLoading, error } = useApiQuery<TrendResp>(key, path);

  const days = (data?.data.days ?? []).map((d) => ({
    ...d,
    label: d.date.slice(5),
  }));

  return (
    <MiniCard title="📈 Chấm công 7 ngày">
      {error && <p className="text-xs text-rose-600">Không tải được: {error.message}</p>}
      {isLoading && !data && <div className="h-56 animate-pulse rounded bg-slate-100" />}
      {data && (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={days} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" fontSize={11} stroke="#64748b" />
            <YAxis fontSize={11} stroke="#64748b" />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              labelFormatter={(_, items) => (items.length > 0 ? (items[0].payload as { date: string }).date : '')}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="on_time" name="Đúng giờ" stroke={COLORS.onTime} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="late" name="Muộn" stroke={COLORS.late} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="absent" name="Vắng" stroke={COLORS.absent} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </MiniCard>
  );
}

export function TodayStatusPie({ today }: { today: TodayStatus }) {
  const data = [
    { name: 'Đúng giờ', value: today.on_time, color: COLORS.onTime },
    { name: 'Muộn', value: today.late, color: COLORS.late },
    { name: 'Vắng', value: today.absent, color: COLORS.absent },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <MiniCard title="🥧 Trạng thái hôm nay">
        <p className="py-8 text-center text-xs text-slate-400">Chưa có dữ liệu hôm nay.</p>
      </MiniCard>
    );
  }

  return (
    <MiniCard title="🥧 Trạng thái hôm nay">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            label={(entry) => `${entry.value}`}
            labelLine={false}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </MiniCard>
  );
}

export function TopBranchesBar({ branches }: { branches: BranchBar[] }) {
  if (branches.length === 0) {
    return (
      <MiniCard title="🏢 Top chi nhánh đi muộn">
        <p className="py-8 text-center text-xs text-slate-400">Không có chi nhánh nào đi muộn hôm nay 🎉</p>
      </MiniCard>
    );
  }
  const data = branches.slice(0, 10).map((b) => ({ name: b.name, late: b.late_count }));

  return (
    <MiniCard title="🏢 Top 10 chi nhánh đi muộn">
      <ResponsiveContainer width="100%" height={Math.max(220, data.length * 28 + 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" fontSize={11} stroke="#64748b" allowDecimals={false} />
          <YAxis dataKey="name" type="category" fontSize={11} stroke="#64748b" width={100} />
          <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="late" name="Đi muộn" fill={COLORS.late} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </MiniCard>
  );
}
