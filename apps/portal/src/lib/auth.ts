'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, isAdmin, isManager, type ApiUser } from './api';

export type RequiredRole = 'admin' | 'manager' | 'employee';

export function homeFor(user: ApiUser): string {
  if (isManager(user)) return '/dashboard';
  return '/checkin';
}

export function useRequireAuth(requiredRole?: RequiredRole): ApiUser | null {
  const router = useRouter();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    if (requiredRole) {
      const ok =
        requiredRole === 'admin'
          ? isAdmin(u)
          : requiredRole === 'manager'
            ? isManager(u)
            : true; // 'employee' = any logged-in user
      if (!ok) {
        router.replace(homeFor(u));
        return;
      }
    }
    setUser(u);
    setReady(true);
  }, [router, requiredRole]);

  return ready ? user : null;
}
