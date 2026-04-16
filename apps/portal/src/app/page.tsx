import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl p-10">
      <h1 className="text-3xl font-bold tracking-tight">Smart Attendance — Portal</h1>
      <p className="mt-2 text-slate-600">
        Admin & Manager portal. API: <code>{process.env.NEXT_PUBLIC_API_BASE_URL}</code>
      </p>
      <div className="mt-8 space-y-3">
        <Link href="/login" className="block rounded-md bg-slate-900 px-4 py-2 text-white">
          Đăng nhập
        </Link>
        <Link href="/branches" className="block rounded-md border border-slate-300 px-4 py-2">
          Chi nhánh (admin)
        </Link>
      </div>
    </main>
  );
}
