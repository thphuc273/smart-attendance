'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import ky from 'ky';
import { storeAuth } from '../../lib/api';
import { homeFor } from '../../lib/auth';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
type Form = z.infer<typeof schema>;

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

interface LoginResponse {
  data: {
    access_token: string;
    refresh_token: string;
    user: { id: string; email: string; full_name: string; roles: string[] };
  };
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { email: 'admin@demo.com', password: 'Admin@123' },
  });

  const onSubmit = async (form: Form) => {
    setError(null);
    try {
      const res = await ky
        .post(`${API_BASE_URL}/auth/login`, { json: form })
        .json<LoginResponse>();
      storeAuth(res.data.access_token, res.data.user);
      router.replace(homeFor(res.data.user));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Decorative gradient blobs */}
      <div className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-brand-300 opacity-30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-pink-300 opacity-30 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 via-violet-500 to-pink-500 shadow-lg">
            <span className="text-xl font-bold text-white">SA</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Smart Attendance</h1>
          <p className="mt-1 text-sm text-slate-500">Đăng nhập để tiếp tục</p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-5 rounded-3xl border border-white bg-white/80 p-8 shadow-xl backdrop-blur"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <input
              {...register('email')}
              type="email"
              className="input"
              placeholder="admin@demo.com"
              autoComplete="email"
            />
            {formState.errors.email && (
              <span className="mt-1 block text-xs text-rose-600">
                {formState.errors.email.message}
              </span>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Mật khẩu</label>
            <input
              {...register('password')}
              type="password"
              className="input"
              placeholder="••••••••"
              autoComplete="current-password"
            />
            {formState.errors.password && (
              <span className="mt-1 block text-xs text-rose-600">
                {formState.errors.password.message}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={formState.isSubmitting}
            className="btn-primary w-full py-2.5"
          >
            {formState.isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>

          {error && (
            <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
          )}

          <div className="border-t border-slate-100 pt-4 text-center text-xs text-slate-400">
            Tài khoản demo: <span className="font-mono">admin@demo.com</span> /{' '}
            <span className="font-mono">Admin@123</span>
          </div>
        </form>
      </div>
    </main>
  );
}
