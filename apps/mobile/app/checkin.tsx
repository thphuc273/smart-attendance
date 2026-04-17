import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { getApi, hasToken, clearAuth } from './_lib/api';
import { getDeviceFingerprint, getDeviceName, getPlatform } from './_lib/device';

interface SessionSummary {
  id: string;
  workDate: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number | null;
  overtimeMinutes: number | null;
  trustScore: number | null;
}

interface CheckInResult {
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

export default function CheckInScreen() {
  const router = useRouter();
  const [today, setToday] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<'in' | 'out' | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [lastResult, setLastResult] = useState<CheckInResult | null>(null);

  const loadToday = useCallback(async () => {
    try {
      const api = getApi();
      const resp = await api
        .get('attendance/me?limit=1')
        .json<{ data: SessionSummary[] }>();
      const todayISO = new Date().toISOString().slice(0, 10);
      setToday(resp.data.find((s) => s.workDate.slice(0, 10) === todayISO) ?? null);
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message });
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
      await loadToday();
    })();
  }, [loadToday, router]);

  const doCheck = async (kind: 'in' | 'out') => {
    setSubmitting(kind);
    setMessage(null);
    setLastResult(null);
    try {
      // Request foreground location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Cần cho phép truy cập vị trí để chấm công');
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const fingerprint = await getDeviceFingerprint();

      const body = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_meters: Math.round(pos.coords.accuracy ?? 0),
        device_fingerprint: fingerprint,
        platform: getPlatform(),
        device_name: getDeviceName(),
        app_version: Constants.expoConfig?.version ?? '0.1.0',
        is_mock_location: pos.mocked ?? false,
      };

      const api = getApi();
      const resp = await api
        .post(`attendance/check-${kind}`, { json: body })
        .json<{ data: CheckInResult }>();
      setLastResult(resp.data);
      setMessage({
        kind: 'ok',
        text: `✅ Check-${kind} thành công tại ${resp.data.branch.name} · Trust ${resp.data.trust_score}/100`,
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
              details?: { distance_meters?: number; risk_flags?: string[] };
            };
          };
          if (body.error) {
            text = `❌ ${body.error.code}: ${body.error.message}`;
            if (body.error.details?.distance_meters !== undefined) {
              text += ` (cách geofence ${body.error.details.distance_meters}m)`;
            }
          }
        }
      } catch {
        // fallback
      }
      Alert.alert('Lỗi chấm công', text);
      setMessage({ kind: 'err', text });
    } finally {
      setSubmitting(null);
    }
  };

  const logout = async () => {
    await clearAuth();
    router.replace('/login' as never);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const checkedIn = !!today?.checkInAt;
  const checkedOut = !!today?.checkOutAt;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={loadToday} />}
    >
      <View style={styles.header}>
        <View style={styles.brand}>
          <Image
            source={require('../assets/finos-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Chấm công</Text>
        </View>
        <Pressable onPress={logout} hitSlop={8}>
          <Text style={styles.logout}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Hôm nay</Text>
        <Text style={styles.date}>
          {new Date().toLocaleDateString('vi-VN', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
          })}
        </Text>

        {today && (
          <View style={[styles.badge, STATUS_TONE[today.status] ?? STATUS_TONE.default]}>
            <Text style={styles.badgeText}>{today.status}</Text>
          </View>
        )}

        <View style={styles.times}>
          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>Check-in</Text>
            <Text style={styles.timeValue}>
              {today?.checkInAt
                ? new Date(today.checkInAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                : '—'}
            </Text>
          </View>
          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>Check-out</Text>
            <Text style={styles.timeValue}>
              {today?.checkOutAt
                ? new Date(today.checkOutAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                : '—'}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => doCheck('in')}
          disabled={submitting !== null || (checkedIn && !checkedOut)}
          style={[styles.primaryBtn, (submitting !== null || (checkedIn && !checkedOut)) && styles.btnDisabled]}
        >
          <Text style={styles.primaryBtnText}>
            {submitting === 'in' ? 'Đang check-in…' : checkedIn ? 'Đã check-in' : 'Check-in'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => doCheck('out')}
          disabled={submitting !== null || !checkedIn || checkedOut}
          style={[styles.secondaryBtn, (submitting !== null || !checkedIn || checkedOut) && styles.btnDisabled]}
        >
          <Text style={styles.secondaryBtnText}>
            {submitting === 'out' ? 'Đang check-out…' : checkedOut ? 'Đã check-out' : 'Check-out'}
          </Text>
        </Pressable>

        {message && (
          <Text style={[styles.msg, message.kind === 'ok' ? styles.msgOk : styles.msgErr]}>
            {message.text}
          </Text>
        )}

        {lastResult && (
          <View style={styles.resultBox}>
            <ResultRow label="Validation" value={lastResult.validation_method} />
            <ResultRow label="Trust" value={`${lastResult.trust_score} (${lastResult.trust_level})`} />
            {lastResult.risk_flags.length > 0 && (
              <ResultRow label="Flags" value={lastResult.risk_flags.join(', ')} tone="warn" />
            )}
            {lastResult.worked_minutes !== undefined && (
              <ResultRow label="Worked" value={`${lastResult.worked_minutes} min`} />
            )}
            {lastResult.overtime_minutes !== undefined && lastResult.overtime_minutes > 0 && (
              <ResultRow label="Overtime" value={`${lastResult.overtime_minutes} min`} tone="ot" />
            )}
          </View>
        )}
      </View>

      <Pressable onPress={() => router.push('/history' as never)} style={styles.linkBtn}>
        <Text style={styles.linkBtnText}>→ Xem lịch sử</Text>
      </Pressable>
    </ScrollView>
  );
}

function ResultRow({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'ot' }) {
  return (
    <View style={styles.resultRow}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text
        style={[
          styles.resultValue,
          tone === 'warn' && { color: '#92400e' },
          tone === 'ot' && { color: '#0369a1' },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const STATUS_TONE: Record<string, { backgroundColor: string }> & { default: { backgroundColor: string } } = {
  on_time: { backgroundColor: '#dcfce7' },
  late: { backgroundColor: '#fef3c7' },
  overtime: { backgroundColor: '#e0f2fe' },
  early_leave: { backgroundColor: '#fee2e2' },
  absent: { backgroundColor: '#fee2e2' },
  missing_checkout: { backgroundColor: '#fef3c7' },
  default: { backgroundColor: '#e2e8f0' },
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
  title: { fontSize: 22, fontWeight: '700' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 72, height: 24 },
  logout: { color: '#64748b', fontSize: 13 },
  card: {
    margin: 16,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardLabel: { fontSize: 11, textTransform: 'uppercase', color: '#64748b', letterSpacing: 1 },
  date: { fontSize: 18, fontWeight: '600', marginTop: 4 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginTop: 6 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  times: { flexDirection: 'row', gap: 10, marginTop: 14 },
  timeBox: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
  },
  timeLabel: { fontSize: 11, color: '#64748b' },
  timeValue: { fontSize: 16, fontFamily: 'Menlo', marginTop: 2 },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: '#0f172a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  secondaryBtn: {
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#0f172a',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#0f172a', fontWeight: '600', fontSize: 16 },
  btnDisabled: { opacity: 0.4 },
  msg: { marginTop: 12, padding: 10, borderRadius: 6, fontSize: 13 },
  msgOk: { backgroundColor: '#dcfce7', color: '#166534' },
  msgErr: { backgroundColor: '#fee2e2', color: '#991b1b' },
  resultBox: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 6,
  },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  resultLabel: { fontSize: 11, color: '#64748b' },
  resultValue: { fontSize: 12, fontFamily: 'Menlo', color: '#0f172a' },
  linkBtn: { marginHorizontal: 16, padding: 14, alignItems: 'center' },
  linkBtnText: { color: '#0f172a', fontSize: 14, fontWeight: '500' },
});
