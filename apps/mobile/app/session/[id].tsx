import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getApi, hasToken } from '../../lib/api';

interface Event {
  id: string;
  eventType: 'check_in' | 'check_out';
  status: 'success' | 'failed';
  validationMethod: string;
  trustScore: number;
  latitude: string | number | null;
  longitude: string | number | null;
  accuracyMeters: number | null;
  ssid: string | null;
  bssid: string | null;
  riskFlags: string[] | null;
  rejectReason: string | null;
  createdAt: string;
}

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
  branch: { id: string; name: string };
  events: Event[];
}

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!(await hasToken())) {
        router.replace('/login' as never);
        return;
      }
      try {
        const r = await getApi()
          .get(`attendance/sessions/${id}`)
          .json<{ data: Session }>();
        setSession(r.data);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [id, router]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{error}</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.header}>
        <Text style={styles.date}>
          {new Date(session.workDate).toLocaleDateString('vi-VN', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
        </Text>
        <Text style={styles.branchName}>{session.branch.name}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <Text style={styles.value}>{session.status}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Check-in</Text>
          <Text style={styles.value}>
            {session.checkInAt
              ? new Date(session.checkInAt).toLocaleTimeString('vi-VN')
              : '—'}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Check-out</Text>
          <Text style={styles.value}>
            {session.checkOutAt
              ? new Date(session.checkOutAt).toLocaleTimeString('vi-VN')
              : '—'}
          </Text>
        </View>
        {session.workedMinutes !== null && (
          <View style={styles.row}>
            <Text style={styles.label}>Worked</Text>
            <Text style={styles.value}>{session.workedMinutes} min</Text>
          </View>
        )}
        {session.lateMinutes !== null && session.lateMinutes > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>Late</Text>
            <Text style={[styles.value, { color: '#92400e' }]}>{session.lateMinutes} min</Text>
          </View>
        )}
        {session.overtimeMinutes !== null && session.overtimeMinutes > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>Overtime</Text>
            <Text style={[styles.value, { color: '#0369a1' }]}>{session.overtimeMinutes} min</Text>
          </View>
        )}
        {session.trustScore !== null && (
          <View style={styles.row}>
            <Text style={styles.label}>Trust score</Text>
            <Text
              style={[
                styles.value,
                {
                  color:
                    session.trustScore >= 70
                      ? '#166534'
                      : session.trustScore >= 40
                        ? '#92400e'
                        : '#991b1b',
                },
              ]}
            >
              {session.trustScore}/100
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.sectionTitle}>Events ({session.events.length})</Text>
      {session.events.length === 0 ? (
        <Text style={styles.empty}>Không có event nào.</Text>
      ) : (
        session.events.map((ev) => <EventRow key={ev.id} event={ev} />)
      )}
    </ScrollView>
  );
}

function EventRow({ event }: { event: Event }) {
  return (
    <View
      style={[
        styles.eventCard,
        event.status === 'failed' && { borderLeftColor: '#dc2626', borderLeftWidth: 3 },
      ]}
    >
      <View style={styles.row}>
        <Text style={styles.eventType}>
          {event.eventType === 'check_in' ? '→ check-in' : '← check-out'}
        </Text>
        <Text
          style={[
            styles.eventStatus,
            { color: event.status === 'success' ? '#166534' : '#991b1b' },
          ]}
        >
          {event.status}
        </Text>
      </View>
      <Text style={styles.eventTime}>{new Date(event.createdAt).toLocaleString('vi-VN')}</Text>
      <Text style={styles.eventMeta}>
        {event.validationMethod} · trust {event.trustScore}
        {event.accuracyMeters ? ` · accuracy ${event.accuracyMeters}m` : ''}
      </Text>
      {event.latitude !== null && event.longitude !== null && (
        <Text style={styles.eventMeta}>
          GPS {Number(event.latitude).toFixed(4)}, {Number(event.longitude).toFixed(4)}
        </Text>
      )}
      {event.bssid && (
        <Text style={styles.eventMeta}>WiFi {event.ssid} · {event.bssid}</Text>
      )}
      {event.riskFlags && event.riskFlags.length > 0 && (
        <Text style={[styles.eventMeta, { color: '#92400e' }]}>
          ⚠ {event.riskFlags.join(', ')}
        </Text>
      )}
      {event.rejectReason && (
        <Text style={[styles.eventMeta, { color: '#991b1b' }]}>✗ {event.rejectReason}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  err: { color: '#dc2626' },
  header: { marginBottom: 12 },
  date: { fontSize: 20, fontWeight: '700' },
  branchName: { fontSize: 14, color: '#64748b', marginTop: 2 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  label: { fontSize: 13, color: '#64748b' },
  value: { fontSize: 13, fontFamily: 'Menlo' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  empty: { color: '#64748b', fontSize: 13 },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  eventType: { fontSize: 14, fontWeight: '600' },
  eventStatus: { fontSize: 12, fontWeight: '600' },
  eventTime: { fontSize: 11, color: '#64748b', marginTop: 2 },
  eventMeta: { fontSize: 11, color: '#475569', marginTop: 2, fontFamily: 'Menlo' },
});
