import { useEffect, useState, useCallback } from 'react';
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
import { getApi, hasToken } from './_lib/api';

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

export default function HistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const api = getApi();
      const resp = await api.get('attendance/me?limit=30').json<Resp>();
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
        router.replace('/login');
        return;
      }
      await load();
    })();
  }, [load, router]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>← Check-in</Text>
        </Pressable>
        <Text style={styles.title}>Lịch sử</Text>
        <View style={{ width: 80 }} />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 12 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
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
  const date = new Date(session.workDate).toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
  const inTime = session.checkInAt
    ? new Date(session.checkInAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '—';
  const outTime = session.checkOutAt
    ? new Date(session.checkOutAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '—';

  const tone = STATUS_TONE[session.status] ?? { bg: '#e2e8f0', fg: '#334155' };

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.date}>{date}</Text>
        <View style={[styles.badge, { backgroundColor: tone.bg }]}>
          <Text style={[styles.badgeText, { color: tone.fg }]}>{session.status}</Text>
        </View>
      </View>
      <View style={[styles.rowBetween, { marginTop: 8 }]}>
        <Text style={styles.time}>
          In {inTime} → Out {outTime}
        </Text>
        {session.trustScore !== null && (
          <Text style={[styles.trustBase, trustColor(session.trustScore)]}>
            Trust {session.trustScore}
          </Text>
        )}
      </View>
      {(session.lateMinutes || session.overtimeMinutes) && (
        <View style={[styles.rowBetween, { marginTop: 6 }]}>
          {session.lateMinutes ? (
            <Text style={styles.late}>⏰ Late {session.lateMinutes}m</Text>
          ) : (
            <Text />
          )}
          {session.overtimeMinutes ? (
            <Text style={styles.ot}>✨ OT {session.overtimeMinutes}m</Text>
          ) : (
            <Text />
          )}
        </View>
      )}
    </View>
  );
}

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  on_time: { bg: '#dcfce7', fg: '#166534' },
  late: { bg: '#fef3c7', fg: '#92400e' },
  overtime: { bg: '#e0f2fe', fg: '#0369a1' },
  early_leave: { bg: '#fee2e2', fg: '#991b1b' },
  absent: { bg: '#fee2e2', fg: '#991b1b' },
  missing_checkout: { bg: '#fef3c7', fg: '#92400e' },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: { fontSize: 20, fontWeight: '700' },
  back: { color: '#0f172a', fontSize: 14, fontWeight: '500' },
  logout: { color: '#64748b', fontSize: 13 },
  error: { padding: 12, color: '#dc2626', fontSize: 13 },
  empty: { textAlign: 'center', padding: 40, color: '#64748b' },
  card: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontSize: 15, fontWeight: '600' },
  time: { fontSize: 13, color: '#475569' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  late: { color: '#92400e', fontSize: 12 },
  ot: { color: '#0369a1', fontSize: 12 },
  trustBase: { fontSize: 12, fontWeight: '600' },
});

function trustColor(score: number) {
  if (score >= 70) return { color: '#166534' };
  if (score >= 40) return { color: '#92400e' };
  return { color: '#991b1b' };
}
