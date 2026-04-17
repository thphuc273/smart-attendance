'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredUser } from '../lib/api';
import { homeFor } from '../lib/auth';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const user = getStoredUser();
    if (user) {
      router.replace(homeFor(user));
    }
  }, [router]);

  return (
    <main className="mx-auto max-w-3xl p-10">
      <h1 className="text-3xl font-bold tracking-tight">Smart Attendance — Portal</h1>
      <p className="mt-2 text-slate-600">
        Admin &amp; Manager portal. API:{' '}
        <code className="rounded bg-slate-100 px-1 text-xs">
          {process.env.NEXT_PUBLIC_API_BASE_URL}
        </code>
      </p>
      <div className="mt-8 space-y-3">
        <Link href="/login" className="block rounded-lg bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm">
          Đăng nhập
        </Link>
      </div>
    </main>
  );
}
