import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../lib/theme';

/**
 * Placeholder shift calendar. Shows upcoming 7 days from work-schedule.
 * TODO: integrate react-native-calendars once /schedules/my is wired.
 */
export default function CalendarTab() {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() + i * 86_400_000);
    return {
      iso: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }),
    };
  });
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Lịch làm việc</Text>
      <Text style={styles.subtitle}>7 ngày tới</Text>
      {days.map((d) => (
        <View key={d.iso} style={styles.row}>
          <Text style={styles.day}>{d.label}</Text>
          <Text style={styles.shift}>—</Text>
        </View>
      ))}
      <Text style={styles.note}>
        Tính năng lịch ca chi tiết sẽ cập nhật trong bản v0.3.1 (react-native-calendars).
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: colors.slate900 },
  subtitle: { fontSize: 13, color: colors.slate500, marginTop: 4, marginBottom: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  day: { fontWeight: '600', color: colors.slate700 },
  shift: { color: colors.slate400, fontFamily: 'monospace' },
  note: { marginTop: 20, fontSize: 12, color: colors.slate500, fontStyle: 'italic' },
});
