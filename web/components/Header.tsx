'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  AUTH_EVENT,
  clearSession,
  getCachedUser,
  isLoggedIn,
} from '@/lib/auth-client';
import { APP_NAME } from '@/lib/api';

/**
 * هدر سراسری سایت با نمایش وضعیت ورود کاربر
 *
 * نکته مهم درباره Hydration:
 * اطلاعات کاربر در localStorage ذخیره می‌شود و در سرور قابل خواندن نیست.
 * بنابراین بخش وابسته به نشست (نام کاربر / دکمه‌های ورود و خروج) فقط بعد از
 * mount شدن در کلاینت رندر می‌شود تا خروجی سرور و اولین رندر کلاینت یکسان بماند.
 * پوسته هدر (لوگو و لینک‌های ثابت) در سرور رندر می‌شود تا layout shift نداشته باشیم.
 */
export default function Header() {
  const pathname = usePathname();

  // رفع Hydration Error: در سرور و اولین رندر کلاینت همیشه false است
  const [isMounted, setIsMounted] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [open, setOpen] = useState(false);

  // در سرور و اولین رندر کلاینت مقدار false است؛ فقط در کلاینت true می‌شود
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // همگام‌سازی وضعیت ورود با localStorage
  useEffect(() => {
    const sync = () => {
      setLoggedIn(isLoggedIn());
      setUser(getCachedUser());
    };
    sync();
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [pathname]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleLogout = () => {
    clearSession();
    window.location.href = '/';
  };

  const linkClass = (href: string) =>
    `rounded-xl px-3 py-2 text-sm font-medium transition ${
      pathname === href
        ? 'bg-brand-50 text-brand-700'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  // اسکلتون هم‌ابعاد با دکمه‌ها؛ هم در سرور و هم در اولین رندر کلاینت نمایش داده می‌شود
  const authSkeleton = (
    <div className="flex items-center gap-2" aria-hidden="true">
      <span className="skeleton block h-10 w-20" />
      <span className="skeleton block h-10 w-24" />
    </div>
  );

  // بخش ورود/خروج دسکتاپ — فقط بعد از mount رندر می‌شود
  const authArea = !isMounted ? (
    authSkeleton
  ) : loggedIn ? (
    <div className="flex items-center gap-2">
      <span className="badge-gray">👤 {user?.full_name || user?.phone || 'کاربر'}</span>
      <button onClick={handleLogout} className="btn-ghost text-rose-600">
        خروج
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Link href="/login" className="btn-secondary">
        ورود
      </Link>
      <Link href="/register" className="btn-primary">
        ثبت‌نام
      </Link>
    </div>
  );

  // بخش ورود/خروج موبایل — فقط بعد از mount رندر می‌شود
  const mobileAuthArea = !isMounted ? (
    <div className="mt-2">{authSkeleton}</div>
  ) : loggedIn ? (
    <>
      <div className="badge-gray my-2 w-fit">
        👤 {user?.full_name || user?.phone || 'کاربر'}
      </div>
      <button onClick={handleLogout} className="btn-danger">
        خروج از حساب
      </button>
    </>
  ) : (
    <div className="grid grid-cols-2 gap-2 pt-2">
      <Link href="/login" className="btn-secondary">
        ورود
      </Link>
      <Link href="/register" className="btn-primary">
        ثبت‌نام
      </Link>
    </div>
  );

  return (
    <header className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur-md">
      <div className="container-app flex h-16 items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-fun-pink text-lg text-white shadow-soft">
            🎡
          </span>
          <span className="text-lg font-extrabold text-slate-800">{APP_NAME}</span>
        </Link>

        {/* ناوبری دسکتاپ */}
        <nav className="hidden items-center gap-1 md:flex">
          <Link href="/" className={linkClass('/')}>
            خانه
          </Link>
          <Link href="/dashboard" className={linkClass('/dashboard')}>
            بلیط‌های من
          </Link>

          {authArea}
        </nav>

        {/* دکمه منوی موبایل */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-2xl border border-slate-200 text-slate-600 md:hidden"
          aria-label="منو"
        >
          {open ? '✕' : '☰'}
        </button>
      </div>

      {/* منوی موبایل */}
      {open && (
        <div className="container-app animate-pop border-t border-slate-100 pb-4 md:hidden">
          <nav className="flex flex-col gap-1 pt-3">
            <Link href="/" className={linkClass('/')}>
              🏠 خانه
            </Link>
            <Link href="/dashboard" className={linkClass('/dashboard')}>
              🎫 بلیط‌های من
            </Link>

            {mobileAuthArea}
          </nav>
        </div>
      )}
    </header>
  );
}
