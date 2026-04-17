/**
 * Mobile design tokens — matches portal brand palette.
 */
export const colors = {
  // Brand (indigo → violet)
  brand50: '#eef2ff',
  brand100: '#e0e7ff',
  brand400: '#818cf8',
  brand500: '#6366f1',
  brand600: '#4f46e5',
  brand700: '#4338ca',

  violet500: '#8b5cf6',
  violet600: '#7c3aed',

  pink500: '#ec4899',

  // Accents
  teal500: '#14b8a6',
  emerald100: '#d1fae5',
  emerald500: '#10b981',
  emerald700: '#047857',

  amber100: '#fef3c7',
  amber500: '#f59e0b',
  amber700: '#b45309',

  rose100: '#ffe4e6',
  rose500: '#f43f5e',
  rose700: '#be123c',

  sky100: '#e0f2fe',
  sky700: '#0369a1',

  // Neutrals
  bg: '#fafaff',
  surface: '#ffffff',
  surfaceAlt: '#f8fafc',
  border: '#e2e8f0',
  borderSoft: '#f1f5f9',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate900: '#0f172a',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const shadow = {
  card: {
    shadowColor: colors.brand500,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  button: {
    shadowColor: colors.brand600,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
};

export const statusTone: Record<
  string,
  { bg: string; fg: string; label: string }
> = {
  on_time: { bg: colors.emerald100, fg: colors.emerald700, label: 'Đúng giờ' },
  late: { bg: colors.amber100, fg: colors.amber700, label: 'Đi muộn' },
  overtime: { bg: colors.sky100, fg: colors.sky700, label: 'Làm thêm giờ' },
  early_leave: { bg: colors.rose100, fg: colors.rose700, label: 'Về sớm' },
  absent: { bg: colors.rose100, fg: colors.rose700, label: 'Vắng' },
  missing_checkout: { bg: colors.amber100, fg: colors.amber700, label: 'Chưa check-out' },
};
