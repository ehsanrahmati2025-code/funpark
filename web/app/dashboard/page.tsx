'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AuthApi,
  TicketsApi,
  formatDateTimeFa,
  ticketStatusFa,
} from '@/lib/api';
import { clearSession, isLoggedIn, redirectToLogin, setCachedUser } from '@/lib/auth-client';

/**
 * داشبورد کاربر — پروفایل و لیست بلیط‌ها
 *
 * نکته مهم درباره Hydration:
 * قبلاً مقدار اولیه user با getCachedUser() مستقیم از localStorage خوانده می‌شد؛
 * در نتیجه سرور «کاربر فان‌پارک» و کلاینت نام واقعی کاربر را رندر می‌کرد و خطای
 * "Text content does not match server-rendered HTML" رخ می‌داد.
 * اکنون user با null شروع می‌شود و تا mount نشدن، محتوای وابسته به localStorage
 * اصلاً رندر نمی‌شود.
 */
export default function DashboardPage() {
  const router = useRouter();

  // رفع Hydration Error: در سرور و اولین رندر کلاینت همیشه false است
  const [isMounted, setIsMounted] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'usable' | 'finished'>('all');

  // علامت‌گذاری mount شدن در کلاینت
  useEffect(() => {
    setIsMounted(true);
  }, []);

  /** بارگذاری اطلاعات کاربر و بلیط‌ها */
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [me, list] = await Promise.all([AuthApi.me(), TicketsApi.list()]);
      setUser(me.user);
      setCachedUser(me.user);
      setStats(me.stats);
      setTickets(list.tickets || []);
    } catch (err: any) {
      if (err?.status === 401) {
        clearSession();
        redirectToLogin('/dashboard');
        return;
      }
      setError(err?.message || 'خطا در دریافت اطلاعات');
    } finally {
      setLoading(false);
    }
  }, []);

  // فقط بعد از mount شدن: بررسی ورود و دریافت داده‌ها از Apps Script
  useEffect(() => {
    if (!isMounted) return;
    if (!isLoggedIn()) {
      redirectToLogin('/dashboard');
      return;
    }
    load();
  }, [isMounted, load]);

  const handleLogout = () => {
    clearSession();
    router.replace('/');
  };

  // قبل از رندر اصلی: در SSR و اولین رندر کلاینت فقط اسکلتون (خروجی یکسان)
  if (!isMounted) {
    return (
      <div className="container-app space-y-6">
        <div className="skeleton h-32" />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
        </div>
      </div>
    );
  }

  const usableCount = tickets.filter(
    (t) => (t.status === 'issued' || t.status === 'partially_used') && t.remaining_credits > 0
  ).length;

  const finishedCount = tickets.length - usableCount;

  const visible = tickets.filter((t) => {
    const usable = (t.status === 'issued' || t.status === 'partially_used') && t.remaining_credits > 0;
    if (filter === 'usable') return usable;
    if (filter === 'finished') return !usable;
    return true;
  });

  return (
    <div className="container-app space-y-6">
      {/* پروفایل */}
      <section className="card flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-brand-500 to-fun-pink text-3xl text-white">
            👤
          </span>
          <div>
            <h1 className="text-xl font-extrabold text-slate-800">
              {user?.full_name || 'کاربر فان‌پارک'}
            </h1>
            <p className="mt-1 text-sm text-slate-500" dir="ltr">
              {user?.phone || ''}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              عضویت از: {formatDateTimeFa(user?.created_at)}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary">
            🔄 بروزرسانی
          </button>
          <button onClick={handleLogout} className="btn-danger">
            خروج
          </button>
        </div>
      </section>

      {/* آمار */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-xs text-slate-500">کل بلیط‌ها</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-800">
            {stats?.tickets_count ?? tickets.length}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500">بلیط‌های قابل استفاده</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-600">{usableCount}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500">سفارش‌های ثبت‌شده</p>
          <p className="mt-1 text-2xl font-extrabold text-brand-700">{stats?.orders_count ?? 0}</p>
        </div>
      </section>

      {error && <div className="alert-error">{error}</div>}

      {/* لیست بلیط‌ها */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-slate-800">🎫 بلیط‌های من</h2>

          <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">
            {[
              { key: 'all', label: 'همه' },
              { key: 'usable', label: `قابل استفاده (${usableCount})` },
              { key: 'finished', label: `پایان‌یافته (${finishedCount})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key as any)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  filter === tab.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="skeleton h-40" />
            ))}
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="card space-y-4 text-center">
            <p className="text-4xl">🎟️</p>
            <p className="text-slate-600">هنوز بلیطی در این بخش ندارید.</p>
            <Link href="/" className="btn-primary">
              خرید بلیط
            </Link>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((t) => {
            const usable =
              (t.status === 'issued' || t.status === 'partially_used') && t.remaining_credits > 0;
            return (
              <Link
                key={t.id}
                href={`/tickets/${t.id}`}
                className="card card-hover flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-800">{t.event_title}</h3>
                    <p className="mt-1 text-xs text-slate-500">{t.event_location}</p>
                  </div>
                  <span className={usable ? 'badge-green' : 'badge-gray'}>
                    {ticketStatusFa(t.status)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <div className="rounded-xl bg-slate-50 p-2">
                    سریال:{' '}
                    <span className="font-mono text-slate-700" dir="ltr">
                      {t.serial_number}
                    </span>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2">
                    محدوده: <span className="text-slate-700">{t.seat_or_zone}</span>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2">
                    اعتبار باقی‌مانده:{' '}
                    <span className="font-bold text-slate-700">
                      {t.remaining_credits} از {t.total_credits}
                    </span>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2">
                    اعتبار تا: <span className="text-slate-700">{formatDateTimeFa(t.expires_at)}</span>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                  <span className="text-slate-400">مشاهده و اسکن QR</span>
                  <span className="text-brand-700">📷 نمایش بلیط</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
