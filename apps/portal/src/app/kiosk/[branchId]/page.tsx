'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getApi } from '../../../lib/api';

interface QrTokenResp {
  data: {
    token: string;
    exp: number;
    nonce: string;
    next_rotate_at: string;
  };
}

export default function KioskPage() {
  const params = useParams();
  const branchId = params.branchId as string;
  const [tokenData, setTokenData] = useState<QrTokenResp['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(25);

  useEffect(() => {
    let unmounted = false;
    let timer: NodeJS.Timeout;

    const fetchToken = async () => {
      try {
        const api = getApi();
        // Cần truyền header x-kiosk-token nếu branch có khoá
        const res = await api.get(`kiosk/branches/${branchId}/qr-token`).json<QrTokenResp>();
        if (!unmounted) {
          setTokenData(res.data);
          setError(null);
          
          // Tính thời gian còn lại
          const nextRotate = new Date(res.data.next_rotate_at).getTime();
          const now = Date.now();
          const remains = Math.max(0, Math.floor((nextRotate - now) / 1000));
          setTimeLeft(remains || 25);
        }
      } catch (err) {
        if (!unmounted) setError((err as Error).message);
      }
    };

    fetchToken();

    // Lặp mỗi giây để tick countdown
    timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          fetchToken();
          return 25;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      unmounted = true;
      clearInterval(timer);
    };
  }, [branchId]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-red-50 text-red-600">
        <p className="text-xl font-bold">Error: {error}</p>
      </div>
    );
  }

  if (!tokenData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-100">
        <p className="animate-pulse text-2xl font-semibold">Khởi tạo Kiosk...</p>
      </div>
    );
  }

  // QR string: api.qrserver.com
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(tokenData.token)}`;

  // Vòng đo countdown SVG (tương đối đơn giản)
  const radius = 180;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (timeLeft / 25) * circumference;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 text-slate-100 p-6 selection:bg-brand-500/30 font-sans">
      <div className="absolute top-8 left-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">FinOS <span className="font-light text-brand-400">Smart Attendance</span></h1>
        <p className="text-slate-400 mt-1">Kiosk Mode • Chi nhánh: <span className="font-mono text-slate-300">{branchId.substring(0,8)}</span></p>
      </div>

      <div className="relative flex items-center justify-center">
        {/* Vòng tròn đếm ngược */}
        <svg className="absolute -inset-8 transform -rotate-90 w-[380px] h-[380px]">
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

        {/* Nội dung QR bên trong */}
        <div className="relative rounded-2xl bg-white p-6 shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt="Check-in QR Code"
            className="h-[300px] w-[300px] object-contain transition-opacity duration-300"
          />
        </div>
      </div>

      <div className="mt-16 text-center space-y-2">
        <p className="text-5xl font-mono font-bold text-white tabular-nums tracking-tight">
          00:{timeLeft.toString().padStart(2, '0')}
        </p>
        <p className="text-lg text-slate-400">
          Mở ứng dụng FinOS Employee, quét mã để Check-in
        </p>
      </div>
    </div>
  );
}
