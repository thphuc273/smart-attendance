'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearAuth, getStoredUser, isAdmin, isManager, type ApiUser } from '../lib/api';

const NAV_ITEMS: { href: string; label: string; role?: 'admin' | 'manager' | 'employee' }[] = [
  { href: '/checkin', label: 'Chấm công', role: 'employee' },
  { href: '/dashboard', label: 'Dashboard', role: 'manager' },
  { href: '/sessions', label: 'Sessions', role: 'manager' },
  { href: '/employees', label: 'Nhân viên', role: 'manager' },
  { href: '/reports', label: 'Báo cáo', role: 'manager' },
  { href: '/schedules', label: 'Ca làm', role: 'admin' },
  { href: '/branches', label: 'Chi nhánh', role: 'admin' },
  { href: '/audit-logs', label: 'Audit', role: 'admin' },
];

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<ApiUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
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

  const homeHref = user ? (isManager(user) ? '/dashboard' : '/checkin') : '/';

  return (
    <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          <Link href={homeHref} className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 via-violet-500 to-pink-500 text-sm font-bold text-white shadow-sm">
              SA
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              Smart Attendance
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {items.map((i) => {
              const active = pathname.startsWith(i.href);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  className={
                    active
                      ? 'rounded-md bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700'
                      : 'rounded-md px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900'
                  }
                >
                  {i.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {user ? (
            <>
              <div className="hidden items-center gap-2 md:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-violet-400 text-[11px] font-semibold text-white">
                  {user.full_name?.charAt(0).toUpperCase() ?? user.email.charAt(0).toUpperCase()}
                </span>
                <div className="leading-tight">
                  <div className="text-xs font-medium text-slate-900">
                    {user.full_name ?? user.email}
                  </div>
                  <div className="flex gap-1">
                    {user.roles.map((r) => (
                      <span
                        key={r}
                        className="rounded bg-slate-100 px-1 text-[10px] font-medium text-slate-600"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={logout} className="btn-ghost">
                Đăng xuất
              </button>
            </>
          ) : null}
        </div>
      </div>
      {/* Mobile nav */}
      <div className="border-t border-slate-100 px-6 py-2 md:hidden">
        <div className="flex flex-wrap gap-1">
          {items.map((i) => {
            const active = pathname.startsWith(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                className={
                  active
                    ? 'rounded bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700'
                    : 'rounded px-2 py-1 text-xs text-slate-600'
                }
              >
                {i.label}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
