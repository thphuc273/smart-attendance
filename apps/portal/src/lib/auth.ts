'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, type ApiUser } from './api';

export function useRequireAuth(requiredRole?: 'admin' | 'manager'): ApiUser | null {
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
          ? u.roles.includes('admin')
          : u.roles.some((r) => r === 'admin' || r === 'manager');
      if (!ok) {
        router.replace('/dashboard');
        return;
      }
    }
    setUser(u);
    setReady(true);
  }, [router, requiredRole]);

  return ready ? user : null;
}
