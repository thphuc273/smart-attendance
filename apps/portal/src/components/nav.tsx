'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearAuth, getStoredUser, isAdmin, isManager, type ApiUser } from '../lib/api';
import { NotificationBell } from './notification-bell';
import { ChatWidget } from './chat-widget';

type Role = 'admin' | 'manager' | 'employee';

const NAV_ITEMS: { href: string; label: string; icon: string; role?: Role }[] = [
  { href: '/checkin', label: 'Chấm công', icon: '🕐', role: 'employee' },
  { href: '/dashboard', label: 'Dashboard', icon: '📊', role: 'manager' },
  { href: '/sessions', label: 'Sessions', icon: '📋', role: 'manager' },
  { href: '/employees', label: 'Nhân viên', icon: '👥', role: 'manager' },
  { href: '/reports', label: 'Báo cáo', icon: '📈', role: 'manager' },
  { href: '/schedules', label: 'Ca làm', icon: '⏰', role: 'admin' },
  { href: '/branches', label: 'Chi nhánh', icon: '🏢', role: 'admin' },
  { href: '/audit-logs', label: 'Audit', icon: '🔍', role: 'admin' },
  { href: '/chat', label: 'Trợ lý AI', icon: '🤖' },
];

/**
 * Sidebar + layout wrapper. Each page that needs auth UI does:
 *   <TopNav><main>...</main></TopNav>
 * Sidebar is fixed on ≥lg screens; collapsed to top bar + drawer on mobile.
 */
export function TopNav({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
  }, [pathname]);

  useEffect(() => {
    setMobileOpen(false); // close drawer on route change
  }, [pathname]);

  const logout = () => {
    clearAuth();
    router.replace('/login');
  };

  const items = NAV_ITEMS.filter((i) => {
    if (!i.role) return true;
    if (i.role === 'admin') return isAdmin(user);
    if (i.role === 'manager') return isManager(user);
    return !isManager(user);
  });

  const homeHref = user ? (isAdmin(user) || isManager(user) ? '/dashboard' : '/checkin') : '/';

  const navList = (
    <nav className="mt-6 flex flex-col gap-1 px-3">
      {items.map((i) => {
        const active = pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={
              active
                ? 'flex items-center gap-3 rounded-lg bg-gradient-to-r from-brand-50 to-violet-50 px-3 py-2.5 text-sm font-semibold text-brand-700 shadow-sm'
                : 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900'
            }
          >
            <span className="w-5 text-center text-base">{i.icon}</span>
            <span>{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const userPanel = user && (
    <div className="border-t border-slate-100 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-violet-400 text-sm font-semibold text-white">
          {user.full_name?.charAt(0).toUpperCase() ?? user.email.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold text-slate-900">
            {user.full_name ?? user.email}
          </div>
          <div className="mt-0.5 flex gap-1">
            {user.roles.map((r) => (
              <span
                key={r}
                className="rounded bg-slate-100 px-1.5 text-[10px] font-medium uppercase text-slate-600"
              >
                {r}
              </span>
            ))}
          </div>
        </div>
        <NotificationBell popupClassName="left-0 bottom-full mb-2 origin-bottom-left" />
      </div>
      <button
        onClick={logout}
        className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        Đăng xuất
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-100 bg-white/80 backdrop-blur-md lg:flex">
        <Link href={homeHref} className="flex items-center gap-3 px-5 pt-5">
          <Image
            src="/finos-logo.png"
            alt="FinOS Smart Attendance"
            width={160}
            height={52}
            priority
            className="h-11 w-auto"
          />
        </Link>
        <div className="flex-1 overflow-y-auto">{navList}</div>
        {userPanel}
      </aside>

      {/* Mobile topbar */}
      <div className="lg:hidden">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-100 bg-white/90 px-4 py-3 backdrop-blur">
          <Link href={homeHref} className="flex items-center gap-2">
            <Image
              src="/finos-logo.png"
              alt="FinOS Smart Attendance"
              width={120}
              height={39}
              priority
              className="h-9 w-auto"
            />
          </Link>
          <div className="flex items-center gap-1">
            {user && <NotificationBell />}
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-2 hover:bg-slate-100"
              aria-label="Mở menu"
            >
              <span className="block h-0.5 w-5 bg-slate-700" />
              <span className="mt-1 block h-0.5 w-5 bg-slate-700" />
              <span className="mt-1 block h-0.5 w-5 bg-slate-700" />
            </button>
          </div>
        </header>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            className="flex h-full w-72 flex-col bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5">
              <Image
                src="/finos-logo.png"
                alt="FinOS Smart Attendance"
                width={160}
                height={52}
                priority
                className="h-11 w-auto"
              />
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Đóng menu"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{navList}</div>
            {userPanel}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0">{children}</div>

      {/* Role-scoped chatbot — mounted only when user is authenticated */}
      {user && (
        <ChatWidget
          userLabel={`${isAdmin(user) ? 'Admin' : isManager(user) ? 'Manager' : 'Nhân viên'} • ${user.full_name}`}
        />
      )}
    </div>
  );
}
