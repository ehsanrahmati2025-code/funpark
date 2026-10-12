'use client';

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'funpark_install_dismissed';

/**
 * InstallPrompt — پیشنهاد نصب PWA
 * رویداد beforeinstallprompt را می‌گیرد و یک نوار پایین صفحه نمایش می‌دهد.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // اگر کاربر قبلاً بسته باشد، نمایش نده
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch (e) {}

    // اگر از قبل نصب شده باشد (standalone)، نمایش نده
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (standalone) return;

    const onBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // اگر مرورگر از رویداد پشتیبانی می‌کند ولی دیر می‌رسد، بعد از ۳ ثانیه هم بررسی می‌کنیم
    const timer = setTimeout(() => {
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        setVisible((v) => v);
      }
    }, 3000);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch (e) {}
  };

  const install = async () => {
    if (!deferred) return;
    try {
      deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice?.outcome === 'accepted') {
        setVisible(false);
      }
    } catch (e) {
      // نادیده گرفتن خطای نصب
    } finally {
      setDeferred(null);
    }
  };

  if (!visible || !deferred) return null;

  return (
    <div className="no-print fixed inset-x-0 bottom-0 z-50 p-3">
      <div className="container-app">
        <div className="animate-pop flex items-center justify-between gap-3 rounded-3xl border border-brand-100 bg-white p-4 shadow-soft">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-fun-cyan text-xl text-white">
              📲
            </span>
            <div className="leading-5">
              <p className="text-sm font-bold text-slate-800">فان‌پارک را نصب کنید</p>
              <p className="text-xs text-slate-500">
                دسترسی سریع‌تر به بلیط‌ها، حتی بدون اینترنت
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={dismiss} className="btn-ghost text-slate-500">
              بعداً
            </button>
            <button onClick={install} className="btn-primary">
              نصب
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
