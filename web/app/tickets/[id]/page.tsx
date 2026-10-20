'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { TicketsApi, formatDateTimeFa, ticketStatusFa } from '@/lib/api';
import { clearSession, isLoggedIn, redirectToLogin } from '@/lib/auth-client';

/**
 * صفحه نمایش یک بلیط همراه با کد QR قابل اسکن
 *
 * نکته مهم درباره Hydration:
 * بررسی ورود و خواندن بلیط به localStorage وابسته است و در سرور قابل انجام نیست.
 * بنابراین تا mount نشدن، فقط اسکلتون رندر می‌شود تا خروجی سرور و اولین رندر
 * کلاینت دقیقاً یکسان بماند.
 */
export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  // رفع Hydration Error: در سرور و اولین رندر کلاینت همیشه false است
  const [isMounted, setIsMounted] = useState(false);
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // علامت‌گذاری mount شدن در کلاینت
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // فقط بعد از mount شدن: بررسی ورود و دریافت بلیط
  useEffect(() => {
    if (!isMounted) return;
    if (!isLoggedIn()) {
      redirectToLogin(`/tickets/${id}`);
      return;
    }
    let alive = true;

    (async () => {
      try {
        const res = await TicketsApi.get(String(id));
        if (!alive) return;
        setTicket(res.ticket);
      } catch (err: any) {
        if (!alive) return;
        if (err?.status === 401) {
          clearSession();
          redirectToLogin(`/tickets/${id}`);
          return;
        }
        setError(err?.message || 'خطا در دریافت بلیط');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isMounted, id, router]);

  // قبل از رندر اصلی: در SSR و اولین رندر کلاینت فقط اسکلتون (خروجی یکسان)
  if (!isMounted) {
    return (
      <div className="container-app max-w-2xl">
        <div className="skeleton h-96" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container-app max-w-2xl">
        <div className="skeleton h-96" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="container-app max-w-2xl">
        <div className="card space-y-4 text-center">
          <p className="text-4xl">🎫</p>
          <p className="text-slate-600">{error || 'بلیط یافت نشد'}</p>
          <Link href="/dashboard" className="btn-primary">
            بازگشت به بلیط‌های من
          </Link>
        </div>
      </div>
    );
  }

  // مقدار QR: ممکنه در فیلد signature یا qr باشه
  const qrValue = ticket.signature || ticket.qr || '';

  const usable =
    (ticket.status === 'issued' || ticket.status === 'partially_used') &&
    ticket.remaining_credits > 0;

  const usedRatio =
    ticket.total_credits > 0
      ? Math.round(((ticket.total_credits - ticket.remaining_credits) / ticket.total_credits) * 100)
      : 0;

  return (
    <div className="container-app max-w-2xl space-y-5">
      <div className="no-print flex items-center justify-between">
        <Link href="/dashboard" className="btn-ghost">
          → بازگشت به بلیط‌ها
        </Link>
        <button onClick={() => window.print()} className="btn-secondary">
          🖨️ چاپ / ذخیره
        </button>
      </div>

      {/* کارت بلیط */}
      <article className="card space-y-5 overflow-hidden">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-slate-800">{ticket.event_title}</h1>
            <p className="mt-1 text-xs text-slate-500">{ticket.event_location}</p>
          </div>
          <span className={usable ? 'badge-green' : 'badge-gray'}>
            {ticketStatusFa(ticket.status)}
          </span>
        </header>

        <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-3 text-center">
          {qrValue ? (
            /* حاشیه سفید (quiet zone) اجباری است: بدون آن quirc در فاصله
               و زاویه به‌سختی کد را پیدا می‌کند. marginSize={4} چهار ماژول
               حاشیه در خود QR می‌گذارد و p-4 هم همان را روی صفحه تضمین می‌کند. */
            <div className="mx-auto w-full max-w-[360px] rounded-2xl bg-white p-4 leading-none">
              <QRCodeSVG
                value={qrValue}
                size={360}
                level="L"
                marginSize={4}
                bgColor="#ffffff"
                fgColor="#000000"
                className="block h-auto w-full"
              />
            </div>
          ) : (
            <div className="mx-auto grid h-56 w-56 place-items-center rounded-2xl bg-slate-100 text-sm text-slate-400">
              اطلاعات QR موجود نیست
            </div>
          )}

          <p className="mt-4 font-mono text-lg font-extrabold tracking-widest text-slate-800" dir="ltr">
            {ticket.serial_number}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            این کد را در ورودی روی دستگاه اسکنر قرار دهید
          </p>
        </div>

        {/* اعتبارها */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">اعتبار باقی‌مانده</span>
            <span className="font-bold text-slate-800">
              {ticket.remaining_credits} از {ticket.total_credits}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-l from-brand-500 to-fun-cyan transition-all"
              style={{ width: `${Math.max(0, Math.min(100, 100 - usedRatio))}%` }}
            />
          </div>
          <p className="text-xs text-slate-400">
            نوع استفاده: {ticket.usage_type === 'multi_entry' ? 'چند ورودی' : 'تک ورودی'}
          </p>
        </div>

        {/* جزئیات */}
        <dl className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
          {[
            { label: 'محدوده / جایگاه', value: ticket.seat_or_zone || '—' },
            { label: 'تاریخ صدور', value: formatDateTimeFa(ticket.issued_at) },
            { label: 'اعتبار تا', value: formatDateTimeFa(ticket.expires_at) },
            { label: 'آخرین استفاده', value: ticket.used_at ? formatDateTimeFa(ticket.used_at) : '—' },
          ].map((row) => (
            <div key={row.label} className="rounded-2xl bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">{row.label}</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-700">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">شناسه بلیط</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-700" dir="ltr">
            {ticket.id}
          </p>
        </div>
      </article>

      {/* راهنما */}
      <div className="no-print alert-info leading-7">
        <p className="font-semibold">راهنمای استفاده</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
          <li>روشنایی صفحه را زیاد کنید تا اسکنر سریع‌تر کد را بخواند.</li>
          <li>هر بار اسکن، یک اعتبار از بلیط کم می‌شود.</li>
          <li>پس از پایان اعتبار، بلیط به وضعیت «استفاده‌شده» تغییر می‌کند.</li>
          <li>کد QR امضای دیجیتال دارد و قابل جعل نیست.</li>
        </ul>
      </div>
    </div>
  );
}
