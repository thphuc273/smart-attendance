import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApi, hasToken } from '../../lib/api';
import { colors, radius, shadow, statusTone } from '../../lib/theme';

interface Session {
  id: string;
  workDate: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number | null;
  overtimeMinutes: number | null;
  lateMinutes: number | null;
  trustScore: number | null;
}

interface Resp {
  data: Session[];
  meta: { total: number; page: number; limit: number; total_pages: number };
}

const PAGE_SIZE = 20;

function vnDateString(d: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(d);
}

export default function HistoryTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const fetchPage = useCallback(async (targetPage: number, replace: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const resp = await getApi()
        .get(`attendance/me?page=${targetPage}&limit=${PAGE_SIZE}`)
        .json<Resp>();
      setSessions((prev) => (replace ? resp.data : [...prev, ...resp.data]));
      setTotalPages(resp.meta.total_pages);
      setPage(resp.meta.page);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (!(await hasToken())) {
        router.replace('/login' as never);
        return;
      }
      await fetchPage(1, true);
      setLoading(false);
    })();
  }, [fetchPage, router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPage(1, true);
    setRefreshing(false);
  }, [fetchPage]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || loadingRef.current) return;
    if (page >= totalPages) return;
    setLoadingMore(true);
    await fetchPage(page + 1, false);
    setLoadingMore(false);
  }, [fetchPage, loadingMore, page, totalPages]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand600} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Lịch sử chấm công</Text>
        <Text style={styles.subtitle}>
          {sessions.length} / {totalPages * PAGE_SIZE}+ phiên
        </Text>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand600} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={<Text style={styles.empty}>Chưa có session nào.</Text>}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.brand600} />
            </View>
          ) : page >= totalPages && sessions.length > 0 ? (
            <Text style={styles.endMarker}>· Hết lịch sử ·</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/session/${item.id}` as never)}>
            <SessionRow session={item} />
          </Pressable>
        )}
      />
    </View>
  );
}

function SessionRow({ session }: { session: Session }) {
  const inTime = session.checkInAt
    ? new Date(session.checkInAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '—';
  const outTime = session.checkOutAt
    ? new Date(session.checkOutAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '—';
  const tone = statusTone[session.status] ?? {
    bg: colors.slate100,
    fg: colors.slate600,
    label: session.status,
  };

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.date}>{vnDateString(new Date(session.workDate))}</Text>
        <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusBadgeText, { color: tone.fg }]}>{tone.label}</Text>
        </View>
      </View>
      <View style={[styles.rowBetween, { marginTop: 10 }]}>
        <View style={styles.timeCol}>
          <Text style={styles.timeLabel}>In</Text>
          <Text style={styles.timeValue}>{inTime}</Text>
        </View>
        <View style={styles.timeCol}>
          <Text style={styles.timeLabel}>Out</Text>
          <Text style={styles.timeValue}>{outTime}</Text>
        </View>
        {session.trustScore !== null && (
          <View style={styles.timeCol}>
            <Text style={styles.timeLabel}>Trust</Text>
            <Text style={styles.timeValue}>{session.trustScore}</Text>
          </View>
        )}
      </View>
      {!!(session.lateMinutes || session.overtimeMinutes) && (
        <View style={styles.deltaRow}>
          {session.lateMinutes ? (
            <View style={[styles.deltaPill, { backgroundColor: colors.amber100 }]}>
              <Text style={[styles.deltaText, { color: colors.amber700 }]}>
                Muộn {session.lateMinutes}′
              </Text>
            </View>
          ) : null}
          {session.overtimeMinutes ? (
            <View style={[styles.deltaPill, { backgroundColor: colors.emerald100 }]}>
              <Text style={[styles.deltaText, { color: colors.emerald700 }]}>
                OT {session.overtimeMinutes}′
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  header: {
    padding: 20,
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    ...shadow.card,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.slate900 },
  subtitle: { fontSize: 12, color: colors.slate500, marginTop: 4 },
  errorBox: { margin: 16, backgroundColor: colors.rose100, padding: 12, borderRadius: radius.md },
  errorText: { color: colors.rose700, fontSize: 13 },
  empty: { textAlign: 'center', padding: 40, color: colors.slate400 },
  card: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: radius.md,
    marginBottom: 10,
    ...shadow.card,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontSize: 15, fontWeight: '700', color: colors.slate900 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: radius.full },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  timeCol: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeLabel: { fontSize: 11, color: colors.slate400, fontWeight: '600' },
  timeValue: { fontSize: 14, color: colors.slate700, fontFamily: 'Menlo', fontWeight: '600' },
  deltaRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  deltaPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm },
  deltaText: { fontSize: 11, fontWeight: '700' },
  footer: { paddingVertical: 20 },
  endMarker: { textAlign: 'center', padding: 16, color: colors.slate400, fontSize: 11 },
});
