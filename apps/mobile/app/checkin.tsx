import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { getApi, getStoredUser, hasToken, type StoredUser } from '../lib/api';
import { getDeviceFingerprint, getDeviceName, getPlatform } from '../lib/device';
import { colors, radius, shadow, statusTone } from '../lib/theme';
import { Header } from '../components/Header';

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

interface CheckResult {
  session_id: string;
  status: string;
  trust_score: number;
  trust_level: string;
  validation_method: string;
  risk_flags: string[];
  branch: { id: string; name: string };
  check_in_at?: string;
  check_out_at?: string;
  worked_minutes?: number;
  overtime_minutes?: number;
}

interface Streak {
  currentStreak: number;
  bestStreak: number;
  onTimeRate30d: number;
}

interface ZeroTapSetting {
  id: string;
  zeroTapEnabled: boolean;
  zeroTapConsentAt: string | null;
}

function vnDateString(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
}

export default function CheckinScreen() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [today, setToday] = useState<Session | null>(null);
  const [submitting, setSubmitting] = useState<'in' | 'out' | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [streak, setStreak] = useState<Streak | null>(null);
  const [setting, setSetting] = useState<ZeroTapSetting | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadToday = useCallback(async () => {
    try {
      const api = getApi();
      const r = await api.get('attendance/me?limit=1').json<{ data: Session[] }>();
      const todayVN = vnDateString(new Date());
      setToday(r.data.find((s) => vnDateString(new Date(s.workDate)) === todayVN) ?? null);

      try {
        const streakRes = await api.get('attendance/me/streak').json<{ data: Streak }>();
        setStreak(streakRes.data);
      } catch(e) {}

      try {
        const setRes = await api.get('attendance/zero-tap/settings/me').json<{ data: { items: ZeroTapSetting[] } }>();
        if (setRes.data.items.length > 0) {
          setSetting(setRes.data.items[0]);
        }
      } catch(e) {}

    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message });
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
      if (!u) {
        router.replace('/login' as never);
        return;
      }
      setUser(u);
      await loadToday();
    })();
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      loadToday();
    }, [loadToday])
  );

  const doCheck = async (kind: 'in' | 'out') => {
    setSubmitting(kind);
    setMessage(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Cần quyền truy cập vị trí để chấm công');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

      const body = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_meters: Math.round(pos.coords.accuracy ?? 0),
        device_fingerprint: await getDeviceFingerprint(),
        platform: getPlatform(),
        device_name: getDeviceName(),
        app_version: Constants.expoConfig?.version ?? '0.1.0',
        is_mock_location: pos.mocked ?? false,
      };

      const r = await getApi()
        .post(`attendance/check-${kind}`, { json: body })
        .json<{ data: CheckResult }>();
      setMessage({
        kind: 'ok',
        text: `✅ Check-${kind === 'in' ? 'in' : 'out'} thành công tại ${r.data.branch.name}`,
      });
      await loadToday();
    } catch (e) {
      let text = (e as Error).message;
      try {
        const err = e as { response?: Response };
        if (err.response) {
          const body = (await err.response.clone().json()) as {
            error?: {
              code?: string;
              message?: string;
              details?: { hint?: string; distance_meters?: number | null };
            };
          };
          if (body.error) {
            text = `❌ ${body.error.message}`;
            if (body.error.details?.hint) text += `\n💡 ${body.error.details.hint}`;
            else if (body.error.details?.distance_meters != null) {
              text += ` (cách geofence ${body.error.details.distance_meters}m)`;
            }
          }
        }
      } catch {
        /* fallback */
      }
      Alert.alert('Chấm công thất bại', text);
      setMessage({ kind: 'err', text });
    } finally {
      setSubmitting(null);
    }
  };

  const toggleZeroTap = async () => {
    if (!setting) return;
    try {
      setLoading(true);
      const api = getApi();
      const newEnabled = !setting.zeroTapEnabled;
      const res = await api.patch('attendance/zero-tap/settings/me', {
        json: { device_id: setting.id, enabled: newEnabled, revoke: false }
      }).json<{ data: ZeroTapSetting }>();
      setSetting(res.data);
      Alert.alert('Thành công', newEnabled ? 'Đã bật Zero-Tap' : 'Đã tắt Zero-Tap');
    } catch(e) {
      Alert.alert('Lỗi', (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand600} />
      </View>
    );
  }

  const checkedIn = !!today?.checkInAt;
  const checkedOut = !!today?.checkOutAt;
  const tone = today
    ? statusTone[today.status] ?? { bg: colors.slate100, fg: colors.slate600, label: today.status }
    : null;

  return (
    <View style={styles.container}>
      <Header title="Chấm công" user={user} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadToday();
            }}
            tintColor={colors.brand600}
          />
        }
      >
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <Text style={styles.heroLabel}>Hôm nay</Text>
            {tone && (
              <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
                <Text style={[styles.statusBadgeText, { color: tone.fg }]}>{tone.label}</Text>
              </View>
            )}
          </View>
          <Text style={styles.heroDate}>
            {new Date().toLocaleDateString('vi-VN', {
              weekday: 'long',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
          </Text>

          <View style={styles.times}>
            <View style={[styles.timeBox, { backgroundColor: colors.emerald100 }]}>
              <Text style={[styles.timeLabel, { color: colors.emerald700 }]}>Check-in</Text>
              <Text style={styles.timeValue}>
                {today?.checkInAt
                  ? new Date(today.checkInAt).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </Text>
            </View>
            <View style={[styles.timeBox, { backgroundColor: colors.brand50 }]}>
              <View style={styles.liveRow}>
                <Text style={[styles.timeLabel, { color: colors.brand700 }]}>Check-out</Text>
                {!checkedOut && (
                  <View style={styles.liveDot}>
                    <View style={styles.liveDotPulse} />
                    <Text style={styles.liveText}>live</Text>
                  </View>
                )}
              </View>
              <Text style={styles.timeValue}>
                {checkedOut
                  ? new Date(today!.checkOutAt!).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : now.toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => doCheck('in')}
            disabled={submitting !== null || checkedIn}
            style={[styles.primaryBtn, (submitting !== null || checkedIn) && styles.btnDisabled]}
          >
            <Text style={styles.primaryBtnText}>
              {submitting === 'in' ? 'Đang check-in…' : checkedIn ? '✓ Đã check-in' : '→ Check-in'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => doCheck('out')}
            disabled={submitting !== null || !checkedIn}
            style={[styles.secondaryBtn, (submitting !== null || !checkedIn) && styles.btnDisabled]}
          >
            <Text style={styles.secondaryBtnText}>
              {submitting === 'out'
                ? 'Đang check-out…'
                : checkedOut
                  ? '↻ Cập nhật check-out'
                  : '← Check-out'}
            </Text>
          </Pressable>

          {message && (
            <View
              style={[
                styles.msg,
                { backgroundColor: message.kind === 'ok' ? colors.emerald100 : colors.rose100 },
              ]}
            >
              <Text
                style={[
                  styles.msgText,
                  { color: message.kind === 'ok' ? colors.emerald700 : colors.rose700 },
                ]}
              >
                {message.text}
              </Text>
            </View>
          )}
        </View>

        <Pressable onPress={() => router.push('/history' as never)} style={styles.historyLink}>
          <Text style={styles.historyLinkText}>📅 Xem lịch sử 14 ngày</Text>
          <Text style={styles.historyArrow}>→</Text>
        </Pressable>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          {streak && (
            <View style={[styles.heroCard, { flex: 1, padding: 14 }]}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.slate500, textTransform: 'uppercase' }}>🔥 Streak</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', marginTop: 4 }}>{streak.currentStreak} ngày</Text>
              <Text style={{ fontSize: 12, color: colors.slate500, marginTop: 2 }}>Best: {streak.bestStreak} • Rate: {streak.onTimeRate30d}%</Text>
            </View>
          )}
          <Pressable
            onPress={() => router.push('/scanner' as never)}
            style={[styles.heroCard, { flex: 1, padding: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.slate900 }]}
          >
            <Text style={{ fontSize: 32 }}>📷</Text>
            <Text style={{ color: 'white', fontWeight: '700', marginTop: 8 }}>Quét QR Kiosk</Text>
          </Pressable>
        </View>

        {setting && (
          <Pressable onPress={toggleZeroTap} style={[styles.historyLink, { marginTop: 16, backgroundColor: setting.zeroTapEnabled ? colors.emerald100 : colors.slate100 }]}>
            <View>
              <Text style={[styles.historyLinkText, { color: setting.zeroTapEnabled ? colors.emerald700 : colors.slate700 }]}>
                {setting.zeroTapEnabled ? '⚡ Zero-tap đang BẬT' : '⚡ Zero-tap đang TẮT'}
              </Text>
              <Text style={{ fontSize: 12, color: colors.slate500, marginTop: 2 }}>Thiết bị: {setting.id.split('-')[0]}</Text>
            </View>
            <Text style={styles.historyArrow}>{setting.zeroTapEnabled ? 'Bật' : 'Tắt'}</Text>
          </Pressable>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  scroll: { padding: 16, paddingBottom: 40 },
  heroCard: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: radius.xl,
    ...shadow.card,
  },
  heroHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.slate500,
  },
  heroDate: { marginTop: 6, fontSize: 20, fontWeight: '700', color: colors.slate900 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  times: { flexDirection: 'row', gap: 10, marginTop: 18 },
  timeBox: { flex: 1, padding: 14, borderRadius: radius.md },
  timeLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  timeValue: { fontSize: 20, fontWeight: '700', color: colors.slate900, fontFamily: 'Menlo' },
  liveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveDot: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDotPulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand600 },
  liveText: { fontSize: 9, fontWeight: '700', color: colors.brand600, textTransform: 'uppercase' },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: colors.emerald500,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    ...shadow.button,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    marginTop: 10,
    borderWidth: 2,
    borderColor: colors.brand600,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.brand700, fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
  msg: { marginTop: 14, padding: 12, borderRadius: radius.md },
  msgText: { fontSize: 13, fontWeight: '500' },
  historyLink: {
    marginTop: 16,
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadow.card,
  },
  historyLinkText: { fontSize: 15, fontWeight: '600', color: colors.slate700 },
  historyArrow: { fontSize: 20, color: colors.brand600 },
});
