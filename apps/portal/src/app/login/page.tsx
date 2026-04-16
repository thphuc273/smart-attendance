'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import ky from 'ky';
import { storeAuth } from '../../lib/api';

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
      const res = await ky.post(`${API_BASE_URL}/auth/login`, { json: form }).json<LoginResponse>();
      storeAuth(res.data.access_token, res.data.user);
      router.replace('/dashboard');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
        <h1 className="text-2xl font-bold">Đăng nhập</h1>
        <label className="block">
          <span className="text-sm text-slate-700">Email</span>
          <input
            {...register('email')}
            type="email"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="admin@demo.com"
          />
          {formState.errors.email && <span className="text-xs text-red-600">{formState.errors.email.message}</span>}
        </label>
        <label className="block">
          <span className="text-sm text-slate-700">Mật khẩu</span>
          <input
            {...register('password')}
            type="password"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="Admin@123"
          />
          {formState.errors.password && (
            <span className="text-xs text-red-600">{formState.errors.password.message}</span>
          )}
        </label>
        <button
          type="submit"
          disabled={formState.isSubmitting}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50"
        >
          {formState.isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
