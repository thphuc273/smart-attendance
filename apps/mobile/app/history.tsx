import { useCallback, useEffect, useState } from 'react';
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
import { getApi, getStoredUser, hasToken, type StoredUser } from './_lib/api';
import { colors, radius, shadow, statusTone } from './_lib/theme';

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

function vnDateString(d: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(d);
}

export default function HistoryScreen() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const resp = await getApi().get('attendance/me?limit=30').json<Resp>();
      setSessions(resp.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (!(await hasToken())) {
        router.replace('/login' as never);
        return;
      }
      setUser(await getStoredUser());
      await load();
    })();
  }, [load, router]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand600} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>← Quay lại</Text>
        </Pressable>
        <Text style={styles.title}>Lịch sử</Text>
        <View style={{ width: 80 }} />
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
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand600} />}
        ListEmptyComponent={<Text style={styles.empty}>Chưa có session nào.</Text>}
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
      </View>
      {(session.lateMinutes || session.overtimeMinutes) && (
        <View style={styles.deltaRow}>
          {session.lateMinutes ? (
            <View style={[styles.deltaPill, { backgroundColor: colors.amber100 }]}>
              <Text style={[styles.deltaText, { color: colors.amber700 }]}>
                Late {session.lateMinutes}m
              </Text>
            </View>
          ) : null}
          {session.overtimeMinutes ? (
            <View style={[styles.deltaPill, { backgroundColor: colors.emerald100 }]}>
              <Text style={[styles.deltaText, { color: colors.emerald700 }]}>
                OT {session.overtimeMinutes}m
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 56,
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    ...shadow.card,
  },
  backBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.slate100,
  },
  backText: { color: colors.brand700, fontSize: 13, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: colors.slate900 },
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
});
