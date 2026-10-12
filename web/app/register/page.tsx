'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthApi } from '@/lib/api';
import { isLoggedIn, setSession } from '@/lib/auth-client';

/** صفحه ثبت‌نام کاربر جدید */
export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    password: '',
    confirm: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoggedIn()) router.replace('/dashboard');
  }, [router]);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  /** اعتبارسنجی سمت کلاینت و ارسال به Apps Script */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.full_name.trim().length < 3) {
      setError('نام و نام خانوادگی را کامل وارد کنید');
      return;
    }
    if (!/^09\d{9}$/.test(form.phone.trim())) {
      setError('شماره موبایل را به شکل 09121234567 وارد کنید');
      return;
    }
    if (form.password.length < 6) {
      setError('رمز عبور باید حداقل ۶ کاراکتر باشد');
      return;
    }
    if (form.password !== form.confirm) {
      setError('تکرار رمز عبور مطابقت ندارد');
      return;
    }

    setLoading(true);
    try {
      const res = await AuthApi.register({
        phone: form.phone.trim(),
        full_name: form.full_name.trim(),
        password: form.password,
      });
      setSession(res.token, res.user);
      router.replace('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'ثبت‌نام ناموفق بود');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-app flex justify-center">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <span className="mb-3 inline-grid h-14 w-14 place-items-center rounded-3xl bg-brand-50 text-3xl">
            ✨
          </span>
          <h1 className="text-2xl font-extrabold text-slate-800">ساخت حساب جدید</h1>
          <p className="mt-1 text-sm text-slate-500">
            در کمتر از یک دقیقه عضو فان‌پارک شوید
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && <div className="alert-error">{error}</div>}

          <div>
            <label className="label" htmlFor="full_name">
              نام و نام خانوادگی
            </label>
            <input
              id="full_name"
              className="input"
              placeholder="مثلاً: علی رضایی"
              value={form.full_name}
              onChange={(e) => update('full_name', e.target.value)}
              autoComplete="name"
            />
          </div>

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
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
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
              placeholder="حداقل ۶ کاراکتر"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="label" htmlFor="confirm">
              تکرار رمز عبور
            </label>
            <input
              id="confirm"
              type="password"
              className="input"
              placeholder="••••••"
              value={form.confirm}
              onChange={(e) => update('confirm', e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'در حال ثبت‌نام...' : 'ثبت‌نام'}
          </button>

          <p className="text-center text-sm text-slate-500">
            قبلاً ثبت‌نام کرده‌اید؟{' '}
            <Link href="/login" className="font-semibold text-brand-700 hover:underline">
              وارد شوید
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
