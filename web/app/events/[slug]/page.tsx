'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { EventsApi, OrdersApi, formatRial, formatDateFa, saveOrder } from '@/lib/api';
import { isLoggedIn, redirectToLogin } from '@/lib/auth-client';

/** صفحه جزئیات رویداد و ثبت سفارش */
export default function EventDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug;

  const [event, setEvent] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  /** دریافت اطلاعات رویداد بر اساس slug */
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!slug) return;
      setLoading(true);
      setError('');
      try {
        const res = await EventsApi.get(slug);
        if (alive) setEvent(res?.event || null);
      } catch (err: any) {
        if (alive) setError(err?.message || 'رویداد یافت نشد');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  const maxQty = (() => {
    if (!event) return 10;
    const cap = event.capacity > 0 ? Number(event.remaining ?? event.capacity) : 10;
    return Math.max(1, Math.min(10, cap));
  })();

  /** ثبت سفارش و انتقال به صفحه پرداخت */
  const handleCheckout = async () => {
    setError('');

    if (!isLoggedIn()) {
      redirectToLogin(`/events/${slug}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await OrdersApi.create(event.id, quantity);
      // سفارش را محلی ذخیره می‌کنیم چون action ای برای خواندن سفارش وجود ندارد
      saveOrder(res.order, res.event || event);
      router.push(`/checkout/${res.order.id}`);
    } catch (err: any) {
      setError(err?.message || 'ثبت سفارش ناموفق بود');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container-app space-y-5">
        <div className="skeleton h-52" />
        <div className="skeleton h-40" />
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="container-app">
        <div className="card space-y-4 text-center">
          <p className="text-4xl">🤔</p>
          <p className="text-slate-600">{error}</p>
          <Link href="/" className="btn-primary">
            بازگشت به صفحه اصلی
          </Link>
        </div>
      </div>
    );
  }

  if (!event) return null;

  const total = Number(event.price_rial || 0) * quantity;

  return (
    <div className="container-app space-y-5">
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/" className="hover:text-brand-700">
          خانه
        </Link>
        <span>/</span>
        <span className="text-slate-700">{event.title}</span>
      </nav>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* اطلاعات رویداد */}
        <section className="lg:col-span-2 card space-y-5">
          <div className="grid h-48 place-items-center rounded-3xl bg-gradient-to-br from-brand-100 to-brand-50 text-7xl">
            {event.slug === 'water-park' ? '🌊' : event.slug === 'kids-city' ? '🧒' : '🎡'}
          </div>

          <div className="space-y-3">
            <h1 className="text-2xl font-extrabold text-slate-800">{event.title}</h1>
            <p className="text-sm leading-7 text-slate-600">{event.description}</p>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: '📍', label: 'مکان', value: event.location },
              { icon: '📅', label: 'شروع رویداد', value: formatDateFa(event.starts_at) },
              { icon: '🏁', label: 'پایان رویداد', value: formatDateFa(event.ends_at) },
              {
                icon: '👥',
                label: 'ظرفیت',
                value:
                  event.capacity > 0
                    ? `${event.remaining} نفر باقی‌مانده از ${event.capacity}`
                    : 'نامحدود',
              },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-slate-50 p-4">
                <dt className="mb-1 text-xs text-slate-500">
                  {item.icon} {item.label}
                </dt>
                <dd className="text-sm font-semibold text-slate-700">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* کارت خرید */}
        <aside className="card h-fit space-y-4 lg:sticky lg:top-24">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">قیمت هر بلیط</span>
            <span className="font-extrabold text-brand-700">{formatRial(event.price_rial)}</span>
          </div>

          <div className="rounded-2xl border border-slate-100 p-4">
            <span className="label">تعداد بلیط</span>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="btn-secondary !px-4 !py-2 text-lg"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
              >
                −
              </button>
              <span className="text-2xl font-extrabold text-slate-800">{quantity}</span>
              <button
                type="button"
                className="btn-secondary !px-4 !py-2 text-lg"
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                disabled={quantity >= maxQty}
              >
                +
              </button>
            </div>
            {event.capacity > 0 && (
              <p className="mt-2 text-xs text-slate-400">
                حداکثر قابل انتخاب: {maxQty} بلیط
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-brand-50 p-4">
            <span className="text-sm font-semibold text-brand-800">مبلغ قابل پرداخت</span>
            <span className="font-extrabold text-brand-800">{formatRial(total)}</span>
          </div>

          {error && <div className="alert-error">{error}</div>}

          <button onClick={handleCheckout} className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'در حال ثبت سفارش...' : 'ادامه و پرداخت'}
          </button>

          <p className="text-center text-xs leading-6 text-slate-400">
            بلیط‌ها پس از پرداخت با کد QR امن صادر می‌شوند و تا ۳۰ روز اعتبار دارند.
          </p>
        </aside>
      </div>
    </div>
  );
}
