import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { clearAuth, type StoredUser } from '../lib/api';
import { colors, radius, shadow } from '../lib/theme';

export function Header({ title, user }: { title: string; user: StoredUser | null }) {
  const router = useRouter();
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
        <Pressable onPress={logout} hitSlop={8} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </Pressable>
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
  logo: { width: 90, height: 28 },
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
