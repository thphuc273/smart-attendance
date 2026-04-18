'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getApi } from '../../../lib/api';

interface QrTokenData {
  token: string;
  expires_at: string;
  bucket_seconds: number;
  refresh_every_seconds: number;
}
interface QrTokenResp {
  data: QrTokenData;
}

export default function KioskPage() {
  const params = useParams();
  const branchId = params.branchId as string;
  const storageKey = `kiosk_token_${branchId}`;

  const [kioskToken, setKioskToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenData, setTokenData] = useState<QrTokenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(25);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setKioskToken(localStorage.getItem(storageKey));
    }
  }, [storageKey]);

  useEffect(() => {
    if (!kioskToken) return;
    let unmounted = false;
    let timer: ReturnType<typeof setInterval>;

    const fetchToken = async () => {
      try {
        const res = await getApi()
          .get(`kiosk/branches/${branchId}/qr-token`, {
            headers: { 'x-kiosk-token': kioskToken },
          })
          .json<QrTokenResp>();
        if (unmounted) return;
        setTokenData(res.data);
        setError(null);
        const remains = Math.max(1, res.data.refresh_every_seconds || 25);
        setTimeLeft(remains);
      } catch (err) {
        if (!unmounted) setError((err as Error).message);
      }
    };

    fetchToken();
    timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          fetchToken();
          return tokenData?.refresh_every_seconds || 25;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      unmounted = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, kioskToken]);

  const saveToken = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    localStorage.setItem(storageKey, tokenInput.trim());
    setKioskToken(tokenInput.trim());
  };

  if (!kioskToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6 text-slate-100">
        <form onSubmit={saveToken} className="w-full max-w-md rounded-lg bg-slate-800 p-6">
          <h1 className="text-xl font-semibold">Kiosk Setup</h1>
          <p className="mt-2 text-sm text-slate-400">
            Dán Kiosk Token của chi nhánh <span className="font-mono">{branchId.slice(0, 8)}</span> vào
            đây. Token được tạo từ trang Branches → Rotate Secret.
          </p>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            className="mt-4 w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-sm"
            placeholder="kiosk token…"
            autoFocus
          />
          <button
            type="submit"
            className="mt-4 w-full rounded bg-brand-500 px-3 py-2 text-sm font-semibold hover:bg-brand-400"
          >
            Save & Start Kiosk
          </button>
        </form>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-red-50 p-6 text-red-700">
        <p className="text-xl font-bold">Kiosk Error</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={() => {
            localStorage.removeItem(storageKey);
            setKioskToken(null);
            setError(null);
          }}
          className="rounded border border-red-400 px-3 py-1 text-xs hover:bg-red-100"
        >
          Reset kiosk token
        </button>
      </div>
    );
  }

  if (!tokenData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-100">
        <p className="animate-pulse text-2xl font-semibold">Khởi tạo Kiosk…</p>
      </div>
    );
  }

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
    tokenData.token,
  )}`;

  const refreshWindow = tokenData.refresh_every_seconds || 25;
  const radius = 180;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (timeLeft / refreshWindow) * circumference;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-6 font-sans text-slate-100 selection:bg-brand-500/30">
      <div className="absolute top-8 left-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
          FinOS <span className="font-light text-brand-400">Smart Attendance</span>
        </h1>
        <p className="mt-1 text-slate-400">
          Kiosk Mode • Chi nhánh:{' '}
          <span className="font-mono text-slate-300">{branchId.slice(0, 8)}</span>
        </p>
      </div>

      <div className="relative flex items-center justify-center">
        <svg className="absolute -inset-8 h-[380px] w-[380px] -rotate-90 transform">
          <circle
            cx="190"
            cy="190"
            r={radius}
            stroke="currentColor"
            strokeWidth="8"
            fill="transparent"
            className="text-slate-800"
          />
          <circle
            cx="190"
            cy="190"
            r={radius}
            stroke="currentColor"
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="text-brand-500 transition-all duration-1000 ease-linear"
          />
        </svg>
        <div className="relative rounded-2xl bg-white p-6 shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt="Check-in QR Code"
            className="h-[300px] w-[300px] object-contain transition-opacity duration-300"
          />
        </div>
      </div>

      <div className="mt-16 space-y-2 text-center">
        <p className="font-mono text-5xl font-bold tracking-tight tabular-nums text-white">
          00:{timeLeft.toString().padStart(2, '0')}
        </p>
        <p className="text-lg text-slate-400">
          Mở ứng dụng FinOS Employee, quét mã để Check-in
        </p>
      </div>
    </div>
  );
}
