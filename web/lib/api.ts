/**
 * api.ts — کلاینت ارتباط با Google Apps Script
 * همه درخواست‌ها به صورت POST با Content-Type: text/plain ارسال می‌شوند
 * تا درخواست «simple» باشد و CORS preflight رخ ندهد.
 */

import { getToken, clearSession } from './auth-client';

/** آدرس Web App منتشرشده Apps Script */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

/** نام نمایشی برنامه */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'فان‌پارک';

/** خطای API با کد وضعیت */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number = 400) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type ApiOptions = {
  /** ارسال توکن JWT الزامی است */
  auth?: boolean;
  /** توکن دستی (به جای خواندن از localStorage) */
  token?: string | null;
};

/**
 * فراخوانی یک action در Apps Script
 * بدنه: { action, token?, ...payload }
 * پاسخ: { status: number, data: any }
 */
export async function apiCall<T = any>(
  action: string,
  payload: any = {},
  options: ApiOptions = {}
): Promise<T> {
  if (!API_URL || API_URL.indexOf('PASTE_DEPLOYMENT_ID_HERE') !== -1) {
    throw new ApiError(
      'آدرس API تنظیم نشده است. مقدار NEXT_PUBLIC_API_URL را در فایل .env.local قرار دهید.',
      500
    );
  }

  const token = options.token !== undefined ? options.token : getToken();

  if (options.auth && !token) {
    throw new ApiError('برای این عملیات باید وارد حساب خود شوید', 401);
  }

  const body: any = { action };
  if (token) body.token = token;
  Object.keys(payload || {}).forEach((key) => {
    if (key === 'action' || key === 'token') return;
    body[key] = payload[key];
  });

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      // text/plain باعث می‌شود درخواست simple باشد و preflight نداشته باشیم
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch (err: any) {
    throw new ApiError('اتصال به سرور برقرار نشد. اینترنت خود را بررسی کنید.', 0);
  }

  let json: any;
  try {
    json = await response.json();
  } catch (err) {
    throw new ApiError(
      'پاسخ سرور قابل خواندن نبود. مطمئن شوید Web App با دسترسی Anyone منتشر شده است.',
      response.status || 500
    );
  }

  const status = Number(json?.status || response.status || 500);

  if (status >= 400) {
    const message = json?.data?.error || 'خطای نامشخص در سرور';
    // توکن منقضی شده => پاک کردن نشست
    if (status === 401) clearSession();
    throw new ApiError(message, status);
  }

  return (json?.data ?? {}) as T;
}

/* ------------------------------------------------------------------ */
/*  توابع میان‌بر برای هر گروه از action ها                             */
/* ------------------------------------------------------------------ */

export const EventsApi = {
  list: () => apiCall<{ events: any[]; count: number }>('events.list'),
  get: (slug: string) => apiCall<{ event: any }>('events.get', { slug }),
};

export const AuthApi = {
  register: (data: { phone: string; full_name: string; password: string; email?: string }) =>
    apiCall<{ token: string; user: any }>('auth.register', data),
  login: (data: { phone: string; password: string }) =>
    apiCall<{ token: string; user: any }>('auth.login', data),
  me: () => apiCall<{ user: any; stats: any }>('auth.me', {}, { auth: true }),
};

export const OrdersApi = {
  create: (eventId: string, quantity: number) =>
    apiCall<{ order: any; event: any }>('orders.create', { eventId, quantity }, { auth: true }),
  pay: (orderId: string, success: boolean = true) =>
    apiCall<{ order: any; tickets: any[]; already_paid?: boolean; failed?: boolean }>(
      'orders.pay',
      { orderId, success },
      { auth: true }
    ),
};

export const TicketsApi = {
  list: () => apiCall<{ tickets: any[]; count: number }>('tickets.list', {}, { auth: true }),
  get: (id: string) => apiCall<{ ticket: any }>('tickets.get', { id }, { auth: true }),
};

export const AdminApi = {
  seed: () => apiCall<any>('admin.seed'),
};

/* ------------------------------------------------------------------ */
/*  کش محلی سفارش‌ها (چون action ای برای خواندن سفارش وجود ندارد)        */
/* ------------------------------------------------------------------ */

const ORDERS_KEY = 'funpark_orders';
const LAST_PAYMENT_KEY = 'funpark_last_payment';

function readJson(key: string, fallback: any): any {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key: string, value: any): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

/** ذخیره سفارش تازه‌ساخته‌شده برای نمایش در صفحه checkout و mock-pay */
export function saveOrder(order: any, event?: any): void {
  const all = readJson(ORDERS_KEY, {});
  all[String(order.id)] = { order, event: event || null, saved_at: Date.now() };
  writeJson(ORDERS_KEY, all);
}

/** خواندن سفارش ذخیره‌شده */
export function getOrder(orderId: string): { order: any; event: any } | null {
  const all = readJson(ORDERS_KEY, {});
  const item = all[String(orderId)];
  return item ? { order: item.order, event: item.event } : null;
}

/** به‌روزرسانی وضعیت سفارش ذخیره‌شده */
export function updateStoredOrder(order: any): void {
  if (!order || !order.id) return;
  const all = readJson(ORDERS_KEY, {});
  const prev = all[String(order.id)] || {};
  all[String(order.id)] = { order, event: prev.event || null, saved_at: Date.now() };
  writeJson(ORDERS_KEY, all);
}

/** ذخیره نتیجه پرداخت برای نمایش در صفحه موفقیت */
export function saveLastPayment(data: any): void {
  writeJson(LAST_PAYMENT_KEY, { ...data, saved_at: Date.now() });
}

/** خواندن نتیجه آخرین پرداخت */
export function getLastPayment(): any | null {
  return readJson(LAST_PAYMENT_KEY, null);
}

/* ------------------------------------------------------------------ */
/*  ابزارهای نمایشی                                                     */
/* ------------------------------------------------------------------ */

/** تبدیل عدد به فرمت فارسی با جداکننده هزارگان */
export function formatRial(value: any): string {
  const n = Number(value || 0);
  return n.toLocaleString('fa-IR') + ' ریال';
}

/** تبدیل تاریخ ISO به تاریخ و ساعت شمسی فارسی */
export function formatDateFa(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch (e) {
    return String(iso);
  }
}

/** تبدیل تاریخ ISO به تاریخ + ساعت شمسی */
export function formatDateTimeFa(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return (
      d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }) +
      ' - ' +
      d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
    );
  } catch (e) {
    return String(iso);
  }
}

/** برچسب فارسی وضعیت بلیط */
export function ticketStatusFa(status: string): string {
  const map: Record<string, string> = {
    issued: 'صادر شده',
    partially_used: 'نیمه استفاده‌شده',
    used: 'استفاده‌شده',
    expired: 'منقضی شده',
    canceled: 'لغو شده',
  };
  return map[status] || status || '—';
}

/** برچسب فارسی وضعیت سفارش */
export function orderStatusFa(status: string): string {
  const map: Record<string, string> = {
    pending: 'در انتظار پرداخت',
    paid: 'پرداخت‌شده',
    failed: 'ناموفق',
    canceled: 'لغو شده',
  };
  return map[status] || status || '—';
}
