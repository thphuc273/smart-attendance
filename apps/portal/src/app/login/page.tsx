'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import ky from 'ky';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
type Form = z.infer<typeof schema>;

const api = ky.create({ prefixUrl: process.env.NEXT_PUBLIC_API_BASE_URL });

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = async (form: Form) => {
    setError(null);
    setSuccess(null);
    try {
      const res: { data: { access_token: string; user: { email: string; roles: string[] } } } = await api
        .post('auth/login', { json: form })
        .json();
      localStorage.setItem('access_token', res.data.access_token);
      setSuccess(`Logged in as ${res.data.user.email} (${res.data.user.roles.join(', ')})`);
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
        {success && <p className="text-sm text-green-700">{success}</p>}
      </form>
    </main>
  );
}
