import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { clearAuth, getApi, type StoredUser } from '../lib/api';
import { colors, radius, shadow } from '../lib/theme';

export function Header({ title, user }: { title: string; user: StoredUser | null }) {
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(async () => {
    if (!user) return;
    try {
      const res = await getApi()
        .get('notifications', { searchParams: { limit: 1, unread_only: 'true' } })
        .json<{ data: { meta: { unread: number } } }>();
      setUnread(res.data.meta.unread);
    } catch {
      // silent — bell is best-effort
    }
  }, [user]);

  useEffect(() => {
    loadUnread();
    const id = setInterval(loadUnread, 60_000);
    return () => clearInterval(id);
  }, [loadUnread]);

  useFocusEffect(
    useCallback(() => {
      loadUnread();
    }, [loadUnread]),
  );

  const logout = async () => {
    await clearAuth();
    router.replace('/login' as never);
  };
  const rolePill = user?.roles.find((r) => r === 'admin' || r === 'manager') ?? 'employee';
  const pillColor =
    rolePill === 'admin'
      ? { bg: colors.rose100, fg: colors.rose700 }
      : rolePill === 'manager'
        ? { bg: colors.amber100, fg: colors.amber700 }
        : { bg: colors.emerald100, fg: colors.emerald700 };

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Image
          source={require('../assets/finos-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.rightActions}>
          {user && (
            <Pressable
              onPress={() => router.push('/notifications' as never)}
              hitSlop={8}
              style={styles.bellBtn}
              accessibilityLabel="Thông báo"
            >
              <Text style={styles.bellIcon}>🔔</Text>
              {unread > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              )}
            </Pressable>
          )}
          <Pressable onPress={logout} hitSlop={8} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Đăng xuất</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {user && (
            <Text style={styles.greet}>
              Xin chào, <Text style={styles.greetName}>{user.full_name ?? user.email}</Text>
            </Text>
          )}
        </View>
        {user && (
          <View style={[styles.rolePill, { backgroundColor: pillColor.bg }]}>
            <Text style={[styles.rolePillText, { color: pillColor.fg }]}>{rolePill}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    ...shadow.card,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  logo: { width: 140, height: 44 },
  rightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bellBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.slate100,
    position: 'relative',
  },
  bellIcon: { fontSize: 16 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#e11d48',
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.slate100,
    borderRadius: radius.sm,
  },
  logoutText: { color: colors.slate600, fontSize: 12, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.slate900 },
  greet: { marginTop: 2, fontSize: 13, color: colors.slate500 },
  greetName: { fontWeight: '600', color: colors.slate700 },
  rolePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  rolePillText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
});
