'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getLastPayment } from '@/lib/api';

/** صفحه پرداخت ناموفق */
export default function PaymentFailurePage() {
  const [orderId, setOrderId] = useState('');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setOrderId(params.get('orderId') || '');
    } catch (e) {}
    setData(getLastPayment());
  }, []);

  return (
    <div className="container-app max-w-lg space-y-5">
      <div className="card space-y-4 text-center">
        <span className="mx-auto grid h-20 w-20 animate-pop place-items-center rounded-full bg-rose-50 text-5xl">
          ❌
        </span>
        <h1 className="text-2xl font-extrabold text-rose-700">پرداخت ناموفق بود</h1>
        <p className="text-sm leading-7 text-slate-500">
          تراکنش شما تکمیل نشد و هیچ مبلغی کسر نشده است. می‌توانید دوباره تلاش کنید یا رویداد
          دیگری انتخاب کنید.
        </p>

        {orderId && (
          <p className="text-xs text-slate-400">
            شماره سفارش:{' '}
            <span className="font-mono text-slate-600" dir="ltr">
              {orderId}
            </span>
          </p>
        )}

        {data?.order?.event_title && (
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            سفارش «{data.order.event_title}» با {data.order.quantity} بلیط لغو شد.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {orderId ? (
            <Link href={`/mock-pay/${orderId}`} className="btn-primary w-full">
              تلاش مجدد برای پرداخت
            </Link>
          ) : (
            <Link href="/" className="btn-primary w-full">
              بازگشت به رویدادها
            </Link>
          )}
          <Link href="/" className="btn-secondary w-full">
            انتخاب رویداد دیگر
          </Link>
        </div>

        <p className="text-xs text-slate-400">
          اگر مبلغی از حساب شما کسر شده است، طی ۷۲ ساعت آینده به صورت خودکار بازگردانده می‌شود.
        </p>
      </div>
    </div>
  );
}
