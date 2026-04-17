import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getApi, getStoredUser, hasToken, type StoredUser } from './_lib/api';
import { colors, radius, shadow } from './_lib/theme';
import { Header } from './_components/Header';
import { StatCard } from './_components/StatCard';

interface AdminOverview {
  data: {
    total_employees: number;
    total_branches: number;
    today: {
      checked_in: number;
      on_time: number;
      late: number;
      absent: number;
      on_time_rate: number;
    };
    top_branches_on_time: { branch_id: string; name: string; rate: number }[];
    top_branches_late: { branch_id: string; name: string; late_count: number }[];
  };
}

interface Anomalies {
  branches_late_spike: {
    branch_id: string;
    name: string;
    late_rate_today: number;
    spike_ratio: number | null;
  }[];
  employees_low_trust: { employee_id: string; code: string; low_trust_count_7d: number }[];
  untrusted_devices_new_today: number;
}

export default function AdminScreen() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [overview, setOverview] = useState<AdminOverview['data'] | null>(null);
  const [anomalies, setAnomalies] = useState<Anomalies | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const api = getApi();
      const [o, a] = await Promise.all([
        api.get('dashboard/admin/overview').json<AdminOverview>(),
        api.get('dashboard/anomalies').json<{ data: Anomalies }>(),
      ]);
      setOverview(o.data);
      setAnomalies(a.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (!(await hasToken())) {
        router.replace('/login' as never);
        return;
      }
      const u = await getStoredUser();
      if (!u?.roles.includes('admin')) {
        router.replace('/login' as never);
        return;
      }
      setUser(u);
      await load();
    })();
  }, [router, load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand600} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Admin Dashboard" user={user} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.brand600}
          />
        }
      >
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {overview && (
          <>
            <View style={styles.grid}>
              <StatCard label="Nhân viên" value={overview.total_employees} icon="👥" tone="brand" />
              <StatCard label="Chi nhánh" value={overview.total_branches} icon="🏢" tone="violet" />
            </View>
            <View style={[styles.grid, { marginTop: 12 }]}>
              <StatCard label="Check-in hôm nay" value={overview.today.checked_in} icon="✅" tone="teal" />
              <StatCard
                label="On-time rate"
                value={`${Math.round(overview.today.on_time_rate * 100)}%`}
                icon={overview.today.on_time_rate > 0.9 ? '🚀' : '⚠️'}
                tone={overview.today.on_time_rate > 0.9 ? 'emerald' : 'amber'}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Trạng thái hôm nay</Text>
              <StatusRow label="Đúng giờ" count={overview.today.on_time} color={colors.emerald500} />
              <StatusRow label="Đi muộn" count={overview.today.late} color={colors.amber500} />
              <StatusRow label="Vắng" count={overview.today.absent} color={colors.rose500} />
            </View>

            {overview.top_branches_on_time.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>🏆 Top đúng giờ</Text>
                {overview.top_branches_on_time.map((b, i) => (
                  <View key={b.branch_id} style={styles.row}>
                    <Text style={styles.rank}>#{i + 1}</Text>
                    <Text style={styles.rowText}>{b.name}</Text>
                    <View style={[styles.pill, { backgroundColor: colors.emerald100 }]}>
                      <Text style={[styles.pillText, { color: colors.emerald700 }]}>
                        {(b.rate * 100).toFixed(0)}%
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {anomalies && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🚨 Bất thường</Text>
            <View style={styles.row}>
              <Text style={styles.rowText}>Branches đi muộn tăng đột biến</Text>
              <View style={[styles.pill, { backgroundColor: colors.rose100 }]}>
                <Text style={[styles.pillText, { color: colors.rose700 }]}>
                  {anomalies.branches_late_spike.length}
                </Text>
              </View>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowText}>Nhân viên trust thấp (7d)</Text>
              <View style={[styles.pill, { backgroundColor: colors.amber100 }]}>
                <Text style={[styles.pillText, { color: colors.amber700 }]}>
                  {anomalies.employees_low_trust.length}
                </Text>
              </View>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowText}>Thiết bị mới hôm nay</Text>
              <View style={[styles.pill, { backgroundColor: colors.brand100 }]}>
                <Text style={[styles.pillText, { color: colors.brand700 }]}>
                  {anomalies.untrusted_devices_new_today}
                </Text>
              </View>
            </View>
          </View>
        )}

        <Text style={styles.foot}>
          ℹ️ Mobile hiển thị overview. Dùng portal cho CRUD & báo cáo đầy đủ.
        </Text>
      </ScrollView>
    </View>
  );
}

function StatusRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.rowText}>{label}</Text>
      <Text style={styles.rowCount}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  scroll: { padding: 16, paddingBottom: 40 },
  errorBox: {
    backgroundColor: colors.rose100,
    padding: 12,
    borderRadius: radius.md,
    marginBottom: 12,
  },
  errorText: { color: colors.rose700, fontSize: 13 },
  grid: { flexDirection: 'row', gap: 12 },
  card: {
    marginTop: 16,
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.slate900, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: 10,
  },
  rank: { fontSize: 11, fontWeight: '700', color: colors.slate400, width: 22 },
  rowText: { flex: 1, fontSize: 14, color: colors.slate700 },
  rowCount: { fontSize: 15, fontWeight: '700', color: colors.slate900 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full },
  pillText: { fontSize: 12, fontWeight: '700' },
  foot: { marginTop: 20, textAlign: 'center', fontSize: 11, color: colors.slate400 },
});
