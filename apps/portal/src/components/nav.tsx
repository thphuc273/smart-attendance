'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearAuth, getStoredUser, isAdmin, isManager, type ApiUser } from '../lib/api';

const NAV_ITEMS: { href: string; label: string; role?: 'admin' | 'manager' | 'employee' }[] = [
  { href: '/checkin', label: 'Check-in', role: 'employee' },
  { href: '/dashboard', label: 'Dashboard', role: 'manager' },
  { href: '/sessions', label: 'Sessions', role: 'manager' },
  { href: '/reports', label: 'Reports', role: 'manager' },
  { href: '/branches', label: 'Branches', role: 'admin' },
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
    // 'employee' — show only when user is NOT manager/admin (their landing area)
    return !isManager(user);
  });

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm font-bold tracking-tight">
            Smart Attendance
          </Link>
          <nav className="flex items-center gap-4">
            {items.map((i) => {
              const active = pathname.startsWith(i.href);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  className={
                    active
                      ? 'text-sm font-semibold text-slate-900'
                      : 'text-sm text-slate-600 hover:text-slate-900'
                  }
                >
                  {i.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="text-slate-600">
                {user.email}{' '}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                  {user.roles.join(', ')}
                </span>
              </span>
              <button
                onClick={logout}
                className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100"
              >
                Logout
              </button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
