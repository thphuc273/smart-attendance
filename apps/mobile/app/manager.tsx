import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getApi, getStoredUser, hasToken, type StoredUser } from '../lib/api';
import { colors, radius, shadow } from '../lib/theme';
import { Header } from '../components/Header';
import { StatCard } from '../components/StatCard';

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface ManagerDashboard {
  data: {
    branch: { id: string; name: string };
    today: {
      total: number;
      checked_in: number;
      not_yet: number;
      absent: number;
      on_time: number;
      late: number;
    };
    low_trust_today: {
      session_id: string;
      employee: { code: string; name: string };
      trust_score: number;
      risk_flags: string[];
    }[];
  };
}

export default function ManagerScreen() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dash, setDash] = useState<ManagerDashboard['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBranches = useCallback(async () => {
    try {
      const r = await getApi().get('branches?limit=50').json<{ data: Branch[] }>();
      setBranches(r.data);
      if (r.data.length && !selected) setSelected(r.data[0].id);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [selected]);

  const loadDash = useCallback(async (branchId: string) => {
    setError(null);
    try {
      const r = await getApi()
        .get(`dashboard/manager/${branchId}`)
        .json<ManagerDashboard>();
      setDash(r.data);
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
      if (!u?.roles.some((r) => r === 'manager' || r === 'admin')) {
        router.replace('/login' as never);
        return;
      }
      setUser(u);
      await loadBranches();
    })();
  }, [router, loadBranches]);

  useEffect(() => {
    if (selected) loadDash(selected);
  }, [selected, loadDash]);

  if (loading && !dash) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand600} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Manager Dashboard" user={user} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              if (selected) loadDash(selected);
            }}
            tintColor={colors.brand600}
          />
        }
      >
        {branches.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabs}
          >
            {branches.map((b) => {
              const active = b.id === selected;
              return (
                <Pressable
                  key={b.id}
                  onPress={() => setSelected(b.id)}
                  style={[styles.tab, active && styles.tabActive]}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{b.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {dash && (
          <>
            <Text style={styles.branchName}>{dash.branch.name}</Text>

            <View style={styles.grid}>
              <StatCard label="Tổng NV" value={dash.today.total} icon="👥" tone="brand" />
              <StatCard label="Đã check-in" value={dash.today.checked_in} icon="✅" tone="teal" />
            </View>
            <View style={[styles.grid, { marginTop: 12 }]}>
              <StatCard label="Chưa đến" value={dash.today.not_yet} icon="⏳" tone="amber" />
              <StatCard label="Vắng" value={dash.today.absent} icon="❌" tone="rose" />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Trạng thái hôm nay</Text>
              <StatusRow label="Đúng giờ" count={dash.today.on_time} color={colors.emerald500} />
              <StatusRow label="Đi muộn" count={dash.today.late} color={colors.amber500} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>⚠️ Trust thấp hôm nay ({dash.low_trust_today.length})</Text>
              {dash.low_trust_today.length === 0 ? (
                <Text style={styles.muted}>Không có cảnh báo 👌</Text>
              ) : (
                dash.low_trust_today.map((s) => (
                  <View key={s.session_id} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowText}>{s.employee.name}</Text>
                      <Text style={styles.subtext}>
                        {s.employee.code}
                        {s.risk_flags.length > 0 ? ` · ${s.risk_flags.join(', ')}` : ''}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.pill,
                        { backgroundColor: s.trust_score < 40 ? colors.rose100 : colors.amber100 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          { color: s.trust_score < 40 ? colors.rose700 : colors.amber700 },
                        ]}
                      >
                        {s.trust_score}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        <Text style={styles.foot}>
          ℹ️ Override session & báo cáo đầy đủ có trên portal web.
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
  tabs: { gap: 8, paddingBottom: 12 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.brand600, borderColor: colors.brand600 },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.slate600 },
  tabTextActive: { color: '#fff' },
  branchName: { fontSize: 18, fontWeight: '700', color: colors.slate900, marginBottom: 12 },
  errorBox: { backgroundColor: colors.rose100, padding: 12, borderRadius: radius.md, marginBottom: 12 },
  errorText: { color: colors.rose700, fontSize: 13 },
  grid: { flexDirection: 'row', gap: 12 },
  card: {
    marginTop: 16,
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.slate900, marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: 10,
  },
  rowText: { flex: 1, fontSize: 14, color: colors.slate700 },
  rowCount: { fontSize: 15, fontWeight: '700', color: colors.slate900 },
  subtext: { fontSize: 11, color: colors.slate500, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full },
  pillText: { fontSize: 12, fontWeight: '700', fontFamily: 'Menlo' },
  muted: { fontSize: 13, color: colors.slate400 },
  foot: { marginTop: 20, textAlign: 'center', fontSize: 11, color: colors.slate400 },
});
