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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApi, hasToken } from '../lib/api';
import { colors, radius, shadow } from '../lib/theme';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: any;
  read_at: string | null;
  created_at: string;
}

interface Resp {
  data: Notification[];
  meta: { total: number; unread: number; page: number; limit: number; total_pages: number };
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const resp = await getApi().get('notifications?limit=50').json<Resp>();
      setItems(resp.data);
      setUnread(resp.meta.unread);
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
      await load();
    })();
  }, [load, router]);

  const markOne = async (id: string) => {
    try {
      await getApi().patch(`notifications/${id}/read`);
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
      );
      setUnread((u) => Math.max(0, u - 1));
    } catch {}
  };

  const markAll = async () => {
    try {
      await getApi().post('notifications/read-all');
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
      setUnread(0);
    } catch {}
  };

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
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>← Quay lại</Text>
        </Pressable>
        <Text style={styles.title}>Thông báo {unread > 0 ? `(${unread})` : ''}</Text>
        {unread > 0 ? (
          <Pressable onPress={markAll} hitSlop={8} style={styles.markBtn}>
            <Text style={styles.markText}>Đã đọc</Text>
          </Pressable>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand600} />}
        ListEmptyComponent={<Text style={styles.empty}>Chưa có thông báo nào.</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              markOne(item.id);
              if (item.data?.sessionId) router.push(`/session/${item.data.sessionId}` as never);
            }}
          >
            <View style={[styles.card, !item.read_at && styles.cardUnread]}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardBody}>{item.body}</Text>
                  <Text style={styles.cardTime}>{formatTime(item.created_at)}</Text>
                </View>
                {!item.read_at && <View style={styles.dot} />}
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
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
  markBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.brand50,
  },
  markText: { color: colors.brand700, fontSize: 13, fontWeight: '600' },
  errorBox: { margin: 16, backgroundColor: colors.rose100, padding: 12, borderRadius: radius.md },
  errorText: { color: colors.rose700, fontSize: 13 },
  empty: { textAlign: 'center', padding: 40, color: colors.slate400 },
  card: {
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: radius.md,
    marginBottom: 10,
    ...shadow.card,
  },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: colors.brand500 },
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.slate900 },
  cardBody: { fontSize: 13, color: colors.slate600, marginTop: 4, lineHeight: 18 },
  cardTime: { fontSize: 11, color: colors.slate400, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand500, marginTop: 6, marginLeft: 8 },
});
