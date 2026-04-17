import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow } from '../_lib/theme';

type Tone = 'brand' | 'violet' | 'teal' | 'emerald' | 'amber' | 'rose';

const TONE: Record<Tone, { accentBg: string; iconBg: string; iconFg: string }> = {
  brand: { accentBg: colors.brand500, iconBg: colors.brand50, iconFg: colors.brand700 },
  violet: { accentBg: colors.violet500, iconBg: '#f3e8ff', iconFg: colors.violet600 },
  teal: { accentBg: colors.teal500, iconBg: '#ccfbf1', iconFg: '#0f766e' },
  emerald: { accentBg: colors.emerald500, iconBg: colors.emerald100, iconFg: colors.emerald700 },
  amber: { accentBg: colors.amber500, iconBg: colors.amber100, iconFg: colors.amber700 },
  rose: { accentBg: colors.rose500, iconBg: colors.rose100, iconFg: colors.rose700 },
};

export function StatCard({
  label,
  value,
  icon,
  tone = 'brand',
}: {
  label: string;
  value: string | number;
  icon: string;
  tone?: Tone;
}) {
  const t = TONE[tone];
  return (
    <View style={styles.card}>
      <View style={[styles.accent, { backgroundColor: t.accentBg }]} />
      <View style={styles.inner}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </View>
          <View style={[styles.iconBox, { backgroundColor: t.iconBg }]}>
            <Text style={styles.icon}>{icon}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  accent: { height: 3, width: '100%' },
  inner: { padding: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: colors.slate500,
    textTransform: 'uppercase',
  },
  value: { marginTop: 6, fontSize: 24, fontWeight: '700', color: colors.slate900 },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 18 },
});
