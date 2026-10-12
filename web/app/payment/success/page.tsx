'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatRial, getLastPayment } from '@/lib/api';

/** صفحه پرداخت موفق — نمایش بلیط‌های صادرشده */
export default function PaymentSuccessPage() {
  const [data, setData] = useState<any>(null);
  const [orderId, setOrderId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setOrderId(params.get('orderId') || '');
    } catch (e) {}

    const last = getLastPayment();
    setData(last);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="container-app max-w-2xl">
        <div className="skeleton h-64" />
      </div>
    );
  }

  const tickets: any[] = data?.tickets || [];
  const order = data?.order;

  return (
    <div className="container-app max-w-2xl space-y-5">
      <div className="card space-y-4 text-center">
        <span className="mx-auto grid h-20 w-20 animate-pop place-items-center rounded-full bg-emerald-50 text-5xl">
          ✅
        </span>
        <h1 className="text-2xl font-extrabold text-emerald-700">پرداخت با موفقیت انجام شد</h1>
        <p className="text-sm text-slate-500">
          بلیط‌های شما صادر شد و از همین حالا در بخش «بلیط‌های من» قابل مشاهده است.
        </p>

        {order && (
          <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-right sm:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500">رویداد</p>
              <p className="font-semibold text-slate-800">{order.event_title}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">تعداد بلیط</p>
              <p className="font-semibold text-slate-800">{order.quantity} عدد</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">مبلغ پرداخت‌شده</p>
              <p className="font-semibold text-slate-800">{formatRial(order.total_rial)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">کد پیگیری</p>
              <p className="font-mono text-xs text-slate-800" dir="ltr">
                {order.payment_ref || '—'}
              </p>
            </div>
          </div>
        )}
      </div>

      {tickets.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-slate-800">
            🎫 بلیط‌های صادرشده ({tickets.length})
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            {tickets.map((t) => (
              <Link
                key={t.id}
                href={`/tickets/${t.id}`}
                className="card card-hover flex items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <p className="font-bold text-slate-800">{t.event_title}</p>
                  <p className="text-xs text-slate-500">
                    سریال:{' '}
                    <span className="font-mono" dir="ltr">
                      {t.serial_number}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">محدوده: {t.seat_or_zone}</p>
                </div>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-2xl">
                  📷
                </span>
              </Link>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/dashboard" className="btn-primary w-full">
              مشاهده همه بلیط‌ها
            </Link>
            <Link href="/" className="btn-secondary w-full">
              خرید بلیط دیگر
            </Link>
          </div>
        </section>
      ) : (
        <div className="card space-y-4 text-center">
          <p className="text-sm text-slate-500">
            اطلاعات این تراکنش در مرورگر یافت نشد، اما پرداخت شما ثبت شده است.
            {orderId && (
              <>
                {' '}
                شماره سفارش:{' '}
                <span className="font-mono text-xs" dir="ltr">
                  {orderId}
                </span>
              </>
            )}
          </p>
          <Link href="/dashboard" className="btn-primary">
            مشاهده بلیط‌های من
          </Link>
        </div>
      )}
    </div>
  );
}
