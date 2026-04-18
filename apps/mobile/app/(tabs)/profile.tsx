import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { clearAuth, getApi, getStoredUser, type StoredUser } from '../../lib/api';
import {
  disableGeofenceNotify,
  enableGeofenceNotify,
  isGeofenceNotifyEnabled,
} from '../../lib/geofence-notify';
import { colors, radius } from '../../lib/theme';

interface ZeroTapDevice {
  id: string;
  zeroTapEnabled: boolean;
}

export default function ProfileTab() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [device, setDevice] = useState<ZeroTapDevice | null>(null);
  const [zeroTap, setZeroTap] = useState(false);
  const [geofenceNotify, setGeofenceNotify] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setUser(await getStoredUser());
      try {
        const res = await getApi()
          .get('attendance/zero-tap/settings/me')
          .json<{ data: { items: ZeroTapDevice[] } }>();
        const first = res.data.items[0] ?? null;
        setDevice(first);
        setZeroTap(first?.zeroTapEnabled ?? false);
      } catch {
        // ignore if endpoint missing
      }
      setGeofenceNotify(await isGeofenceNotifyEnabled());
      setLoading(false);
    })();
  }, []);

  const toggleGeofence = useCallback(async (next: boolean) => {
    setGeofenceNotify(next);
    if (next) {
      const res = await enableGeofenceNotify();
      if (!res.ok) {
        setGeofenceNotify(false);
        const reasonMap: Record<string, string> = {
          expo_go_unsupported:
            'Expo Go (SDK 53+) không hỗ trợ geofencing + background location. Cần build dev client: chạy `npx expo run:ios` (hoặc `eas build --profile development`).',
          foreground_denied: 'Bạn chưa cấp quyền vị trí.',
          background_denied: 'Thiếu quyền vị trí nền — nhắc chấm công sẽ không chạy khi app đóng.',
          notifications_denied: 'Bạn chưa cấp quyền thông báo.',
          no_geofences: 'Chi nhánh chưa cấu hình geofence.',
        };
        Alert.alert('Không bật được', reasonMap[res.reason ?? ''] ?? res.reason ?? 'Lỗi không xác định.');
      }
    } else {
      await disableGeofenceNotify();
    }
  }, []);

  const toggleZeroTap = useCallback(async (next: boolean) => {
    if (!device) {
      Alert.alert(
        'Chưa có thiết bị',
        'Hãy check-in thủ công ít nhất 1 lần trên thiết bị này để đăng ký, sau đó quay lại bật Zero-tap.',
      );
      return;
    }
    setZeroTap(next);
    try {
      const res = await getApi()
        .patch('attendance/zero-tap/settings/me', {
          json: { device_id: device.id, enabled: next, revoke: false },
        })
        .json<{ data: ZeroTapDevice }>();
      setDevice(res.data);
      setZeroTap(res.data.zeroTapEnabled);
    } catch (err) {
      setZeroTap(!next);
      Alert.alert('Lỗi', (err as Error).message);
    }
  }, [device]);

  const logout = useCallback(async () => {
    await clearAuth();
    router.replace('/login');
  }, [router]);

  if (loading) return <ActivityIndicator style={{ marginTop: 48 }} />;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{user?.full_name ?? '—'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={styles.roleRow}>
          {(user?.roles ?? []).map((r) => (
            <Text key={r} style={styles.role}>
              {r}
            </Text>
          ))}
        </View>
      </View>

      <Text style={styles.section}>Tuỳ chọn</Text>

      <View style={styles.settingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.settingTitle}>Zero-tap check-in</Text>
          <Text style={styles.settingDesc}>Tự động chấm công khi vào vùng Wifi/GPS đã tin cậy.</Text>
        </View>
        <Switch value={zeroTap} onValueChange={toggleZeroTap} />
      </View>

      <View style={styles.settingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.settingTitle}>Nhắc chấm công (geofence)</Text>
          <Text style={styles.settingDesc}>Thông báo khi vào/ra vùng chi nhánh — tiết kiệm pin, debounce 30'.</Text>
        </View>
        <Switch value={geofenceNotify} onValueChange={toggleGeofence} />
      </View>

      <Pressable onPress={logout} style={styles.logout}>
        <Text style={styles.logoutTxt}>Đăng xuất</Text>
      </Pressable>

      <Text style={styles.footer}>FinOS Smart Attendance • v0.3.0-bonus</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontSize: 20, fontWeight: '700', color: colors.slate900 },
  email: { marginTop: 2, color: colors.slate500 },
  roleRow: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  role: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    backgroundColor: colors.brand100,
    color: colors.brand700,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  section: { marginTop: 24, marginBottom: 8, fontWeight: '700', color: colors.slate700 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    gap: 12,
  },
  settingTitle: { fontWeight: '600', color: colors.slate700 },
  settingDesc: { marginTop: 2, fontSize: 12, color: colors.slate500 },
  logout: {
    marginTop: 24,
    backgroundColor: colors.rose500,
    padding: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  logoutTxt: { color: '#fff', fontWeight: '700' },
  footer: { marginTop: 24, textAlign: 'center', fontSize: 11, color: colors.slate400 },
});
