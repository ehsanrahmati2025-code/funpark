'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatRial, formatDateTimeFa, getOrder, orderStatusFa } from '@/lib/api';
import { isLoggedIn, redirectToLogin } from '@/lib/auth-client';

/**
 * صفحه تسویه سفارش — مرور نهایی و انتقال به درگاه
 *
 * نکته مهم درباره Hydration:
 * اطلاعات سفارش از localStorage خوانده می‌شود و بررسی ورود هم به نشست کاربر
 * وابسته است؛ هیچ‌کدام در سرور قابل انجام نیست. بنابراین تا mount نشدن،
 * فقط اسکلتون رندر می‌شود تا خروجی سرور و اولین رندر کلاینت یکسان بماند.
 */
export default function CheckoutPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const orderId = params?.orderId;

  // رفع Hydration Error: در سرور و اولین رندر کلاینت همیشه false است
  const [isMounted, setIsMounted] = useState(false);
  const [data, setData] = useState<{ order: any; event: any } | null>(null);
  const [loading, setLoading] = useState(true);

  // علامت‌گذاری mount شدن در کلاینت
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // فقط بعد از mount شدن: بررسی ورود و خواندن سفارش از حافظه مرورگر
  useEffect(() => {
    if (!isMounted) return;
    if (!isLoggedIn()) {
      redirectToLogin(`/checkout/${orderId}`);
      return;
    }
    if (!orderId) return;
    setData(getOrder(orderId));
    setLoading(false);
  }, [isMounted, orderId, router]);

  // قبل از رندر اصلی: در SSR و اولین رندر کلاینت فقط اسکلتون (خروجی یکسان)
  if (!isMounted) {
    return (
      <div className="container-app">
        <div className="skeleton h-64" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container-app">
        <div className="skeleton h-64" />
      </div>
    );
  }

  if (!data || !data.order) {
    return (
      <div className="container-app">
        <div className="card space-y-4 text-center">
          <p className="text-4xl">🧾</p>
          <h1 className="text-lg font-bold text-slate-800">اطلاعات این سفارش یافت نشد</h1>
          <p className="text-sm text-slate-500">
            ممکن است حافظه مرورگر پاک شده باشد. لطفاً یک سفارش جدید ثبت کنید.
          </p>
          <Link href="/" className="btn-primary">
            بازگشت به رویدادها
          </Link>
        </div>
      </div>
    );
  }

  const { order, event } = data;

  return (
    <div className="container-app max-w-2xl space-y-5">
      <div className="text-center">
        <span className="mb-3 inline-grid h-14 w-14 place-items-center rounded-3xl bg-brand-50 text-3xl">
          🧾
        </span>
        <h1 className="text-2xl font-extrabold text-slate-800">بررسی نهایی سفارش</h1>
        <p className="mt-1 text-sm text-slate-500">
          شماره سفارش:{' '}
          <span className="font-mono text-xs text-slate-700" dir="ltr">
            {order.id}
          </span>
        </p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <span className="text-sm text-slate-500">رویداد</span>
          <span className="font-bold text-slate-800">
            {order.event_title || event?.title || '—'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">تعداد بلیط</span>
          <span className="font-semibold text-slate-700">{order.quantity} عدد</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">مکان</span>
          <span className="text-sm text-slate-700">
            {order.event_location || event?.location || '—'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">زمان ثبت</span>
          <span className="text-sm text-slate-700">{formatDateTimeFa(order.created_at)}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">وضعیت سفارش</span>
          <span className={order.status === 'paid' ? 'badge-green' : 'badge-amber'}>
            {orderStatusFa(order.status)}
          </span>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-brand-50 p-4">
          <span className="text-sm font-semibold text-brand-800">مبلغ قابل پرداخت</span>
          <span className="text-lg font-extrabold text-brand-800">
            {formatRial(order.total_rial)}
          </span>
        </div>

        {order.status === 'paid' ? (
          <div className="space-y-3">
            <div className="alert-success">این سفارش قبلاً پرداخت شده و بلیط‌ها صادر شده‌اند.</div>
            <Link href="/dashboard" className="btn-primary w-full">
              مشاهده بلیط‌ها
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={() => router.push(`/mock-pay/${order.id}`)}
              className="btn-primary w-full"
            >
              ورود به درگاه پرداخت (آزمایشی)
            </button>
            <Link href={`/events/${order.event_slug || event?.slug || ''}`} className="btn-secondary w-full">
              بازگشت و تغییر سفارش
            </Link>
          </div>
        )}

        <p className="rounded-2xl bg-amber-50 p-3 text-xs leading-6 text-amber-700">
          ⚠️ این یک درگاه پرداخت <b>آزمایشی (Mock)</b> است و هیچ تراکنش واقعی انجام نمی‌شود.
        </p>
      </div>
    </div>
  );
}
