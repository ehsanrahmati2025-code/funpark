'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthApi } from '@/lib/api';
import { isLoggedIn, setSession } from '@/lib/auth-client';

/** صفحه ورود به حساب کاربری */
export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nextPath, setNextPath] = useState('/dashboard');

  // اگر کاربر قبلاً وارد شده، به داشبورد برود + خواندن مسیر بازگشت
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next');
      if (next) setNextPath(next);
      if (isLoggedIn()) router.replace(next || '/dashboard');
    } catch (e) {}
  }, [router]);

  /** ارسال فرم ورود */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!/^09\d{9}$/.test(phone.trim())) {
      setError('شماره موبایل را به شکل 09121234567 وارد کنید');
      return;
    }
    if (password.length < 6) {
      setError('رمز عبور باید حداقل ۶ کاراکتر باشد');
      return;
    }

    setLoading(true);
    try {
      const res = await AuthApi.login({ phone: phone.trim(), password });
      setSession(res.token, res.user);
      router.replace(nextPath || '/dashboard');
    } catch (err: any) {
      setError(err?.message || 'ورود ناموفق بود');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-app flex justify-center">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <span className="mb-3 inline-grid h-14 w-14 place-items-center rounded-3xl bg-brand-50 text-3xl">
            🔐
          </span>
          <h1 className="text-2xl font-extrabold text-slate-800">ورود به حساب</h1>
          <p className="mt-1 text-sm text-slate-500">
            برای مشاهده و مدیریت بلیط‌ها وارد شوید
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && <div className="alert-error">{error}</div>}

          <div>
            <label className="label" htmlFor="phone">
              شماره موبایل
            </label>
            <input
              id="phone"
              className="input"
              inputMode="numeric"
              dir="ltr"
              placeholder="09121234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              رمز عبور
            </label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'در حال ورود...' : 'ورود'}
          </button>

          <p className="text-center text-sm text-slate-500">
            حساب کاربری ندارید؟{' '}
            <Link href="/register" className="font-semibold text-brand-700 hover:underline">
              ثبت‌نام کنید
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
