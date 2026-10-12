/**
 * auth-client.ts — مدیریت نشست کاربر در مرورگر (localStorage)
 * توکن JWT و اطلاعات کاربر از Apps Script دریافت و در مرورگر نگهداری می‌شود.
 */

const TOKEN_KEY = 'funpark_token';
const USER_KEY = 'funpark_user';

/** رویداد سراسری تغییر وضعیت ورود (برای به‌روزرسانی Header و ...) */
export const AUTH_EVENT = 'funpark-auth-change';

/** بررسی اجرا در مرورگر (SSR-safe) */
function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/** اعلام تغییر وضعیت احراز هویت به سایر کامپوننت‌ها */
function emitAuthChange(): void {
  if (!isBrowser()) return;
  try {
    window.dispatchEvent(new Event(AUTH_EVENT));
  } catch (e) {
    // نادیده گرفتن خطای مرورگرهای قدیمی
  }
}

/** خواندن توکن JWT */
export function getToken(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

/** خواندن اطلاعات کش‌شده کاربر */
export function getCachedUser(): any | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/** ذخیره نشست پس از ورود یا ثبت‌نام */
export function setSession(token: string, user: any): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token || '');
    window.localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
  } catch (e) {
    // نادیده گرفتن خطای حجم/دسترسی
  }
  emitAuthChange();
}

/** به‌روزرسانی اطلاعات کاربر بدون تغییر توکن */
export function setCachedUser(user: any): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
  } catch (e) {}
  emitAuthChange();
}

/** پاک کردن نشست (خروج) */
export function clearSession(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  } catch (e) {}
  emitAuthChange();
}

/** آیا کاربر وارد شده است؟ */
export function isLoggedIn(): boolean {
  const token = getToken();
  return !!token && token.length > 20;
}

/**
 * بررسی انقضای توکن بر اساس بخش payload (بدون اعتبارسنجی امضا — فقط برای UX)
 */
export function isTokenExpired(token?: string | null): boolean {
  const t = token || getToken();
  if (!t) return true;
  try {
    const parts = t.split('.');
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(decodeURIComponent(escape(window.atob(padded))));
    return Number(payload.exp || 0) * 1000 < Date.now();
  } catch (e) {
    return true;
  }
}

/** هدایت به صفحه ورود با پارامتر بازگشت */
export function redirectToLogin(nextPath?: string): void {
  if (!isBrowser()) return;
  const next = nextPath || window.location.pathname + window.location.search;
  window.location.href = '/login?next=' + encodeURIComponent(next);
}

/** خروج و بازگشت به صفحه اصلی */
export function logout(redirect: string = '/'): void {
  clearSession();
  if (isBrowser()) window.location.href = redirect;
}

/** قالب‌بندی نام کاربر برای نمایش در هدر */
export function displayName(user?: any): string {
  const u = user || getCachedUser();
  if (!u) return '';
  return u.full_name || u.phone || 'کاربر';
}
