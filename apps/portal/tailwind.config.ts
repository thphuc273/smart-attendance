import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        accent: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
        },
      },
      fontFamily: {
        sans: [
          'Inter var',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.02), 0 4px 12px -2px rgb(79 70 229 / 0.04)',
        'card-hover': '0 4px 20px -4px rgb(79 70 229 / 0.15)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
        'brand-soft': 'linear-gradient(135deg, #eef2ff 0%, #fce7f3 100%)',
        'mesh-bg':
          'radial-gradient(at 20% 20%, rgba(129,140,248,0.12) 0, transparent 40%), radial-gradient(at 80% 10%, rgba(236,72,153,0.08) 0, transparent 40%), radial-gradient(at 40% 90%, rgba(20,184,166,0.08) 0, transparent 40%)',
      },
    },
  },
  plugins: [],
};

export default config;
