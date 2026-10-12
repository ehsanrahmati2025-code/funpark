'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { OrdersApi, formatRial, getOrder, saveLastPayment, updateStoredOrder } from '@/lib/api';
import { isLoggedIn, redirectToLogin } from '@/lib/auth-client';

/**
 * صفحه درگاه پرداخت آزمایشی (Mock Gateway)
 *
 * نکته مهم درباره Hydration:
 * اطلاعات سفارش از localStorage خوانده می‌شود و بررسی ورود هم به نشست کاربر
 * وابسته است؛ هیچ‌کدام در سرور قابل انجام نیست. بنابراین تا mount نشدن،
 * فقط اسکلتون رندر می‌شود تا خروجی سرور و اولین رندر کلاینت یکسان بماند.
 */
export default function MockPayPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const orderId = params?.orderId;

  // رفع Hydration Error: در سرور و اولین رندر کلاینت همیشه false است
  const [isMounted, setIsMounted] = useState(false);
  const [data, setData] = useState<{ order: any; event: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<'' | 'success' | 'fail'>('');
  const [error, setError] = useState('');

  // علامت‌گذاری mount شدن در کلاینت
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // فقط بعد از mount شدن: بررسی ورود و خواندن سفارش از حافظه مرورگر
  useEffect(() => {
    if (!isMounted) return;
    if (!isLoggedIn()) {
      redirectToLogin(`/mock-pay/${orderId}`);
      return;
    }
    if (!orderId) return;
    setData(getOrder(orderId));
    setLoading(false);
  }, [isMounted, orderId, router]);

  /** نهایی کردن پرداخت (موفق یا ناموفق) */
  const handlePay = async (success: boolean) => {
    setError('');
    setProcessing(success ? 'success' : 'fail');

    try {
      const res = await OrdersApi.pay(String(orderId), success);

      // ذخیره نتیجه برای نمایش در صفحات موفقیت/شکست
      saveLastPayment({
        orderId: String(orderId),
        order: res.order,
        tickets: res.tickets || [],
        failed: !!res.failed,
        success: success && !res.failed,
      });

      if (res.order) updateStoredOrder(res.order);

      if (success && !res.failed) {
        router.push(`/payment/success?orderId=${orderId}`);
      } else {
        router.push(`/payment/failure?orderId=${orderId}`);
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با درگاه پرداخت');
      setProcessing('');
    }
  };

  // قبل از رندر اصلی: در SSR و اولین رندر کلاینت فقط اسکلتون (خروجی یکسان)
  if (!isMounted) {
    return (
      <div className="container-app max-w-lg">
        <div className="skeleton h-72" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container-app max-w-lg">
        <div className="skeleton h-72" />
      </div>
    );
  }

  if (!data || !data.order) {
    return (
      <div className="container-app max-w-lg">
        <div className="card space-y-4 text-center">
          <p className="text-4xl">💳</p>
          <h1 className="text-lg font-bold text-slate-800">سفارش یافت نشد</h1>
          <Link href="/" className="btn-primary">
            بازگشت به فروشگاه
          </Link>
        </div>
      </div>
    );
  }

  const { order } = data;

  return (
    <div className="container-app max-w-lg space-y-5">
      <div className="card overflow-hidden !p-0">
        {/* هدر درگاه */}
        <div className="flex items-center justify-between bg-gradient-to-l from-slate-800 to-slate-700 px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-lg">🏦</span>
            <div className="leading-4">
              <p className="text-sm font-bold">درگاه پرداخت آزمایشی</p>
              <p className="text-[11px] text-white/70">Mock Payment Gateway</p>
            </div>
          </div>
          <span className="badge bg-amber-400/90 text-amber-950">تست</span>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="mb-1 text-xs text-slate-500">پذیرنده</p>
            <p className="font-bold text-slate-800">فان‌پارک</p>
          </div>

          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">شماره سفارش</dt>
              <dd className="font-mono text-xs text-slate-700" dir="ltr">
                {order.id}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">بابت</dt>
              <dd className="text-slate-700">
                {order.quantity} بلیط {order.event_title}
              </dd>
            </div>
            <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-3">
              <dt className="font-semibold text-slate-600">مبلغ</dt>
              <dd className="text-lg font-extrabold text-brand-700">
                {formatRial(order.total_rial)}
              </dd>
            </div>
          </dl>

          {error && <div className="alert-error">{error}</div>}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => handlePay(true)}
              className="btn-success w-full"
              disabled={!!processing}
            >
              {processing === 'success' ? 'در حال پرداخت...' : 'پرداخت موفق ✅'}
            </button>
            <button
              onClick={() => handlePay(false)}
              className="btn-danger w-full"
              disabled={!!processing}
            >
              {processing === 'fail' ? 'در حال لغو...' : 'انصراف از پرداخت ❌'}
            </button>
          </div>

          <p className="rounded-2xl bg-amber-50 p-3 text-xs leading-6 text-amber-700">
            در این محیط آزمایشی هیچ مبلغی از حساب شما کسر نمی‌شود. یکی از دو دکمه بالا را برای
            شبیه‌سازی نتیجه پرداخت انتخاب کنید.
          </p>
        </div>
      </div>
    </div>
  );
}
