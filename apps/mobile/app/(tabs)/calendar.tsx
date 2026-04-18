import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar, DateData, LocaleConfig } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApi, hasToken } from '../../lib/api';
import { useRouter } from 'expo-router';
import { colors, radius, shadow } from '../../lib/theme';

LocaleConfig.locales['vi'] = {
  monthNames: [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
  ],
  monthNamesShort: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'],
  dayNames: ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'],
  dayNamesShort: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
  today: 'Hôm nay',
};
LocaleConfig.defaultLocale = 'vi';

interface Session {
  id: string;
  workDate: string;
  status: string;
  lateMinutes: number | null;
  workedMinutes: number | null;
}

interface Resp {
  data: Session[];
  meta: { total: number; page: number; limit: number; total_pages: number };
}

const STATUS_COLOR: Record<string, string> = {
  on_time: '#10b981',
  late: '#f59e0b',
  missing_checkout: '#f97316',
  early_leave: '#f59e0b',
  overtime: '#14b8a6',
  absent: '#ef4444',
};

function firstOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function lastOfMonth(d: Date): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CalendarTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<string>(() => isoDay(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (base: Date) => {
    setLoading(true);
    setError(null);
    try {
      const from = firstOfMonth(base);
      const to = lastOfMonth(base);
      const resp = await getApi()
        .get(`attendance/me?date_from=${from}&date_to=${to}&limit=100`)
        .json<Resp>();
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
      await load(focusDate);
    })();
  }, [focusDate, load, router]);

  const marked = useMemo(() => {
    const m: Record<string, { marked: boolean; dotColor: string; selected?: boolean; selectedColor?: string }> = {};
    for (const s of sessions) {
      const day = s.workDate.slice(0, 10);
      m[day] = { marked: true, dotColor: STATUS_COLOR[s.status] ?? '#94a3b8' };
    }
    m[selected] = { ...(m[selected] ?? { marked: false, dotColor: '#94a3b8' }), selected: true, selectedColor: colors.brand600 };
    return m;
  }, [sessions, selected]);

  const summary = useMemo(() => {
    const by: Record<string, number> = {};
    let totalMin = 0;
    for (const s of sessions) {
      by[s.status] = (by[s.status] ?? 0) + 1;
      totalMin += s.workedMinutes ?? 0;
    }
    return { by, totalMin, count: sessions.length };
  }, [sessions]);

  const selectedSession = sessions.find((s) => s.workDate.slice(0, 10) === selected);

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Lịch làm việc</Text>
        <Text style={styles.subtitle}>
          {focusDate.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
        </Text>
      </View>

      <View style={styles.cardWrap}>
        <Calendar
          current={isoDay(focusDate)}
          markedDates={marked}
          onDayPress={(d: DateData) => setSelected(d.dateString)}
          onMonthChange={(d: DateData) => setFocusDate(new Date(d.year, d.month - 1, 1))}
          theme={{
            backgroundColor: colors.surface,
            calendarBackground: colors.surface,
            selectedDayBackgroundColor: colors.brand600,
            todayTextColor: colors.brand600,
            arrowColor: colors.brand600,
            textDayFontWeight: '500',
            textMonthFontWeight: '700',
          }}
        />
        {loading && (
          <View style={styles.overlay}>
            <ActivityIndicator color={colors.brand600} />
          </View>
        )}
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.summary}>
        <Text style={styles.summaryHead}>Tổng kết tháng</Text>
        <View style={styles.row}>
          <Stat label="Phiên" value={String(summary.count)} />
          <Stat label="Đúng giờ" value={String(summary.by.on_time ?? 0)} tone="#10b981" />
          <Stat label="Muộn" value={String(summary.by.late ?? 0)} tone="#f59e0b" />
          <Stat label="Vắng" value={String(summary.by.absent ?? 0)} tone="#ef4444" />
        </View>
        <Text style={styles.totalHours}>
          Tổng thời gian làm: {Math.floor(summary.totalMin / 60)}h {summary.totalMin % 60}p
        </Text>
      </View>

      {selectedSession && (
        <View style={styles.selectedCard}>
          <Text style={styles.selectedHead}>Ngày {selected}</Text>
          <Text style={styles.selectedBody}>
            Trạng thái: <Text style={{ color: STATUS_COLOR[selectedSession.status] ?? colors.slate600, fontWeight: '700' }}>
              {selectedSession.status}
            </Text>
            {selectedSession.lateMinutes ? `  ·  muộn ${selectedSession.lateMinutes}′` : ''}
            {selectedSession.workedMinutes ? `  ·  làm ${Math.floor(selectedSession.workedMinutes / 60)}h${selectedSession.workedMinutes % 60}p` : ''}
          </Text>
        </View>
      )}

      <View style={styles.legend}>
        <LegendDot color="#10b981" label="Đúng giờ" />
        <LegendDot color="#f59e0b" label="Muộn" />
        <LegendDot color="#ef4444" label="Vắng" />
        <LegendDot color="#14b8a6" label="OT" />
      </View>
    </ScrollView>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: {
    padding: 20,
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    ...shadow.card,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.slate900 },
  subtitle: { fontSize: 13, color: colors.slate500, marginTop: 4, textTransform: 'capitalize' },
  cardWrap: {
    margin: 16,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    ...shadow.card,
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: { marginHorizontal: 16, backgroundColor: colors.rose100, padding: 12, borderRadius: radius.md },
  errorText: { color: colors.rose700, fontSize: 13 },
  summary: {
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    ...shadow.card,
  },
  summaryHead: { fontSize: 14, fontWeight: '700', color: colors.slate900, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.slate900 },
  statLabel: { fontSize: 11, color: colors.slate500, marginTop: 2 },
  totalHours: { fontSize: 12, color: colors.slate600, textAlign: 'center', fontStyle: 'italic' },
  selectedCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.brand600,
    ...shadow.card,
  },
  selectedHead: { fontSize: 13, fontWeight: '700', color: colors.slate900, marginBottom: 4 },
  selectedBody: { fontSize: 12, color: colors.slate600, lineHeight: 18 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 16,
    justifyContent: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: colors.slate600 },
});
