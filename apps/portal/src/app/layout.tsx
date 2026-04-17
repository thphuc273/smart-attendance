import './globals.css';
import type { Metadata, Viewport } from 'next';
import { QueryProvider } from '../lib/query-provider';

export const metadata: Metadata = {
  title: 'Smart Attendance — Portal',
  description: 'Admin & Manager portal',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
