'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredUser } from '../lib/api';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    if (getStoredUser()) {
      router.replace('/dashboard');
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
        <Link href="/login" className="block rounded-md bg-slate-900 px-4 py-2 text-white">
          Đăng nhập
        </Link>
      </div>
    </main>
  );
}
