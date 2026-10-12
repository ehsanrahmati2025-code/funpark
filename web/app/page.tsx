'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminApi, EventsApi, formatRial, formatDateFa } from '@/lib/api';

/** صفحه اصلی — معرفی فان‌پارک و لیست رویدادهای فعال */
export default function HomePage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seeding, setSeeding] = useState(false);

  /** دریافت لیست رویدادها از Apps Script */
  const loadEvents = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await EventsApi.list();
      setEvents(res?.events || []);
    } catch (err: any) {
      setError(err?.message || 'خطا در دریافت رویدادها');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  /** پر کردن دیتای دمو (فقط برای راه‌اندازی اولیه) */
  const handleSeed = async () => {
    setSeeding(true);
    setError('');
    try {
      await AdminApi.seed();
      await loadEvents();
    } catch (err: any) {
      setError(err?.message || 'خطا در ساخت دیتای دمو');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="container-app space-y-10">
      {/* قهرمان صفحه */}
      <section className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-brand-700 via-brand-600 to-fun-pink p-8 text-white shadow-soft sm:p-12">
        <div className="relative z-10 max-w-2xl space-y-5">
          <span className="badge bg-white/20 text-white">🎟️ خرید آنلاین بلیط</span>
          <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">
            یک بلیط، یک QR،
            <br />
            ورود بدون صف
          </h1>
          <p className="text-sm leading-7 text-white/85 sm:text-base">
            بلیط پارک تفریحی، پارک آبی و شهر کودکان را همین حالا آنلاین بخرید. بلیط شما
            بلافاصله با کد QR امن (امضای HMAC-SHA256) صادر می‌شود و در ورودی فقط اسکن می‌کنید.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#events" className="btn bg-white text-brand-700 hover:bg-white/90">
              مشاهده رویدادها
            </a>
            <Link href="/dashboard" className="btn border border-white/40 text-white hover:bg-white/10">
              بلیط‌های من
            </Link>
          </div>
        </div>

        <span className="pointer-events-none absolute -left-10 top-6 hidden animate-floaty text-8xl opacity-70 sm:block">
          🎢
        </span>
        <span className="pointer-events-none absolute bottom-2 left-32 hidden animate-floaty text-6xl opacity-60 sm:block">
          🎠
        </span>
      </section>

      {/* سه مرحله ساده */}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: '📱', title: '۱. ثبت‌نام سریع', text: 'فقط با شماره موبایل ثبت‌نام کنید.' },
          { icon: '💳', title: '۲. پرداخت آنلاین', text: 'بلیط را انتخاب و پرداخت کنید.' },
          { icon: '📷', title: '۳. اسکن در ورودی', text: 'QR بلیط را روی گیت اسکن کنید.' },
        ].map((s) => (
          <div key={s.title} className="card card-hover">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-2xl">
              {s.icon}
            </div>
            <h3 className="mb-1 font-bold text-slate-800">{s.title}</h3>
            <p className="text-sm text-slate-500">{s.text}</p>
          </div>
        ))}
      </section>

      {/* لیست رویدادها */}
      <section id="events" className="space-y-5 scroll-mt-20">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-slate-800">رویدادهای فعال</h2>
          <button onClick={loadEvents} className="btn-ghost" disabled={loading}>
            {loading ? 'در حال بارگذاری...' : '🔄 بروزرسانی'}
          </button>
        </div>

        {error && (
          <div className="alert-error">
            {error}
            <button onClick={handleSeed} disabled={seeding} className="mt-3 block btn-secondary">
              {seeding ? 'در حال ساخت...' : 'ساخت دیتای دمو (admin.seed)'}
            </button>
          </div>
        )}

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-56" />
            ))}
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="card text-center">
            <p className="mb-3 text-slate-600">هنوز رویدادی ثبت نشده است.</p>
            <button onClick={handleSeed} disabled={seeding} className="btn-primary">
              {seeding ? 'در حال ساخت...' : 'ساخت دیتای دمو'}
            </button>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <article key={event.id} className="card card-hover flex flex-col">
              <div className="mb-4 grid h-36 place-items-center rounded-3xl bg-gradient-to-br from-brand-100 to-brand-50 text-6xl">
                {event.slug === 'water-park' ? '🌊' : event.slug === 'kids-city' ? '🧒' : '🎡'}
              </div>

              <h3 className="mb-2 text-lg font-bold text-slate-800">{event.title}</h3>
              <p className="mb-4 line-clamp-3 flex-1 text-sm leading-6 text-slate-500">
                {event.description}
              </p>

              <dl className="mb-4 space-y-1 text-xs text-slate-500">
                <div className="flex items-center gap-1">
                  <span>📍</span>
                  <span>{event.location}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>📅</span>
                  <span>شروع: {formatDateFa(event.starts_at)}</span>
                </div>
                {event.capacity > 0 && (
                  <div className="flex items-center gap-1">
                    <span>👥</span>
                    <span>ظرفیت باقی‌مانده: {event.remaining} نفر</span>
                  </div>
                )}
              </dl>

              <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <span className="font-extrabold text-brand-700">
                  {formatRial(event.price_rial)}
                </span>
                <Link href={`/events/${event.slug}`} className="btn-primary">
                  خرید بلیط
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
