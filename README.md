# 🎡 فان‌پارک (FunPark)

سامانه کامل **فروش آنلاین بلیط** و **کنترل گیت ورودی با QR** برای پارک تفریحی — ساخته‌شده با Next.js، Google Apps Script و Google Sheets. بدون دیتابیس، بدون سرور، بدون Docker.

<p align="center">
  <b>Next.js 14</b> · <b>TypeScript</b> · <b>Tailwind CSS</b> · <b>Google Apps Script</b> · <b>Google Sheets</b> · <b>ESP32</b> · <b>PWA</b>
</p>

---

## ✨ امکانات

| بخش | امکانات |
|---|---|
| 👤 کاربران | ثبت‌نام و ورود با شماره موبایل، JWT با HMAC-SHA256، هش رمز با Salt |
| 🎢 رویدادها | لیست و جزئیات رویداد، کنترل ظرفیت، قیمت‌گذاری ریالی |
| 🧾 سفارش | ثبت سفارش، محاسبه خودکار مبلغ، درگاه پرداخت آزمایشی (Mock) |
| 🎫 بلیط | صدور خودکار بلیط پس از پرداخت، شماره سریال ۸ رقمی، اعتبار ۳۰ روزه |
| 📷 QR امن | امضای HMAC-SHA256، غیرقابل جعل، همراه nonce و زمان انقضا |
| 🚪 گیت | اسکن با ESP32، قفل ضد Race Condition، پاسخ فارسی، باز/بسته کردن رله |
| 📊 لاگ | ثبت تمام اسکن‌ها در شیت `ScanLogs` |
| 📲 PWA | نصب روی موبایل، کش آفلاین، رابط کاربری راست‌به‌چپ و فارسی |

---

## 🏗️ معماری

```
┌──────────────┐   POST text/plain    ┌──────────────────┐   ┌───────────────┐
│   Next.js    │ ───────────────────▶ │  Google Apps     │ ─▶│ Google Sheets │
│  (Frontend)  │ ◀─────────────────── │  Script (API)    │   │   (Database)  │
└──────────────┘   {status, data}     └──────────────────┘   └───────────────┘
                                              ▲
                                              │ scan.validate
                                              │
                                       ┌──────────────┐
                                       │  ESP32 Gate  │
                                       └──────────────┘
```

**چرا `text/plain`؟** چون درخواست‌های `application/json` در مرورگر باعث **CORS preflight** می‌شوند و Apps Script از آن پشتیبانی نمی‌کند. با `text/plain` درخواست «simple» است و بدون preflight ارسال می‌شود.

---

## 📁 ساختار پروژه

```
.
├── gas/                     # بک‌اند روی Google Apps Script
│   ├── appsscript.json      # Manifest (Web App, V8)
│   ├── Utils.gs             # شیت، UUID، هش، HMAC، قفل، پاسخ‌ها
│   ├── Code.gs              # doPost/doGet و روتر action ها
│   ├── Events.gs            # events.list / events.get
│   ├── Auth.gs              # ثبت‌نام، ورود، JWT، رمز عبور
│   ├── Orders.gs            # orders.create / orders.pay
│   ├── Tickets.gs           # صدور بلیط، امضای QR، خواندن بلیط
│   ├── Scan.gs              # scan.validate (ESP32)
│   └── Seed.gs              # admin.seed (دیتای دمو)
│
├── web/                     # فرانت‌اند Next.js 14 (App Router)
│   ├── app/
│   │   ├── page.tsx                     # خانه + لیست رویدادها
│   │   ├── login/page.tsx               # ورود
│   │   ├── register/page.tsx            # ثبت‌نام
│   │   ├── events/[slug]/page.tsx       # جزئیات رویداد و خرید
│   │   ├── checkout/[orderId]/page.tsx  # مرور نهایی سفارش
│   │   ├── mock-pay/[orderId]/page.tsx  # درگاه آزمایشی
│   │   ├── payment/success/page.tsx     # پرداخت موفق
│   │   ├── payment/failure/page.tsx     # پرداخت ناموفق
│   │   ├── dashboard/page.tsx           # داشبورد و بلیط‌های من
│   │   └── tickets/[id]/page.tsx        # نمایش QR بلیط
│   ├── components/          # Header و InstallPrompt (PWA)
│   ├── lib/                 # api.ts (کلاینت API) و auth-client.ts (نشست)
│   └── public/manifest.json # تنظیمات PWA
│
├── esp32/gate.ino           # فریم‌ور کنترلر گیت
├── SETUP.md                 # راهنمای نصب گام‌به‌گام
└── README.md
```

---

## 🗄️ اسکیمای Google Sheets

<details>
<summary>نمایش ستون‌های هر شیت</summary>

**Users**
```
id | phone | email | full_name | password_hash | created_at
```

**Events**
```
id | slug | title | description | starts_at | ends_at | location | capacity | price_rial | active
```

**Orders**
```
id | user_id | event_id | quantity | total_rial | status | payment_provider | payment_ref | created_at | paid_at
```

**Tickets**
```
id | order_id | event_id | user_id | serial_number | seat_or_zone | usage_type | total_credits | remaining_credits | status | issued_at | expires_at | used_at | nonce | signature
```

**Devices**
```
id | name | location | api_key_hash | active | last_seen_at
```

**ScanLogs**
```
id | ticket_id | device_id | result | credits_before | credits_after | ip | scanned_at
```

</details>

شیت‌ها در اولین اجرا **به صورت خودکار** ساخته می‌شوند.

---

## 🔌 API Actions

همه درخواست‌ها به شکل زیر ارسال می‌شوند:

```http
POST <APPS_SCRIPT_URL>
Content-Type: text/plain;charset=utf-8

{ "action": "events.list", "token": "optional.jwt.token", "...": "payload" }
```

| Action | ورودی | توکن | توضیح |
|---|---|:---:|---|
| `events.list` | — | ❌ | لیست رویدادهای فعال |
| `events.get` | `{ slug }` | ❌ | جزئیات یک رویداد |
| `auth.register` | `{ phone, full_name, password }` | ❌ | ثبت‌نام کاربر جدید |
| `auth.login` | `{ phone, password }` | ❌ | ورود و دریافت توکن |
| `auth.me` | — | ✅ | اطلاعات کاربر جاری |
| `orders.create` | `{ eventId, quantity }` | ✅ | ثبت سفارش |
| `orders.pay` | `{ orderId, success }` | ✅ | پرداخت آزمایشی + صدور بلیط |
| `tickets.list` | — | ✅ | بلیط‌های کاربر |
| `tickets.get` | `{ id }` | ✅ | یک بلیط |
| `scan.validate` | `{ device_id, device_key, payload }` | ❌ | اعتبارسنجی QR توسط ESP32 |
| `admin.seed` | — | ❌ | ساخت دیتای دمو |

### قالب پاسخ

موفق:

```json
{ "status": 200, "data": { "events": [] } }
```

خطا:

```json
{ "status": 400, "data": { "error": "پیام خطا به فارسی" } }
```

---

## 🔐 امنیت

| مورد | پیاده‌سازی |
|---|---|
| **رمز عبور** | `salt` = ۸ کاراکتر اول UUID · `hash` = SHA-256(salt + password) · ذخیره: `salt$base64(hash)` |
| **JWT** | HS256 با `JWT_SECRET` · payload: `{ uid, exp }` · انقضا: ۷ روز |
| **QR** | `base64url(payload_json) + "." + base64url(HMAC-SHA256(payload_json, QR_SECRET))` |
| **Payload QR** | `{ v, tid, eid, sn, nonce, iat, exp }` · انقضا: ۳۰ روز |
| **دستگاه** | `api_key_hash` = SHA-256(device_key) |
| **مقایسه** | مقایسه امن رشته‌ها (مقاوم در برابر timing attack) |

### جریان اسکن

```
۱. اعتبارسنجی دستگاه (device_id + device_key)
۲. اعتبارسنجی امضای QR و تاریخ انقضا
۳. LockService.waitLock(10000)  ← جلوگیری از اسکن همزمان
۴. بررسی وضعیت بلیط (issued یا partially_used)
۵. remaining_credits -= 1
۶. اگر صفر شد → status = used ، وگرنه partially_used
۷. ثبت در ScanLogs
۸. پاسخ: { ok, reason, action, message_fa, ticket? }
```

نمونه پاسخ موفق:

```json
{
  "status": 200,
  "data": {
    "ok": true,
    "reason": "ok",
    "action": "open_gate",
    "message_fa": "ورود مجاز است — ۲ اعتبار باقی مانده",
    "ticket": { "serial_number": "48213907", "remaining_credits": 2 }
  }
}
```

نمونه پاسخ رد:

```json
{
  "status": 200,
  "data": {
    "ok": false,
    "reason": "bad_signature",
    "action": "deny",
    "message_fa": "امضای کد QR معتبر نیست"
  }
}
```

دلایل ممکن برای `reason`:

`missing_device_credentials` · `unknown_device` · `inactive_device` · `invalid_device_key` · `missing_payload` · `malformed_qr` · `bad_signature` · `unsupported_version` · `incomplete_payload` · `expired` · `ticket_not_found` · `nonce_mismatch` · `wrong_event` · `not_usable` · `no_credits` · `busy` · `server_error`

---

## 🚀 شروع سریع

```bash
# ۱) بک‌اند: فایل‌های gas/ را در Apps Script بسازید و منتشر کنید
#    (راهنمای کامل: SETUP.md)

# ۲) فرانت‌اند
cd web
npm install
cp .env.local.example .env.local     # و مقدار NEXT_PUBLIC_API_URL را بگذارید
npm run dev                          # http://localhost:3000

# ۳) دیتای دمو
#    در صفحه اصلی روی «ساخت دیتای دمو» بزنید
#    یا: <API_URL>?action=admin.seed را در مرورگر باز کنید
```

راهنمای کامل و گام‌به‌گام: 👉 **[SETUP.md](SETUP.md)**

---

## 🧪 حساب و دستگاه آزمایشی

| مورد | مقدار |
|---|---|
| دستگاه | `gate-01` |
| کلید دستگاه | `test-key-123` |
| کاربر | با شماره دلخواه (مثلاً `09121234567`) و رمز ۶+ کاراکتری ثبت‌نام کنید |
| پرداخت | دکمه‌های «پرداخت موفق» / «انصراف» در صفحه درگاه آزمایشی |

---

## 🛠️ فناوری‌ها

| لایه | فناوری |
|---|---|
| فرانت‌اند | Next.js 14 (App Router)، TypeScript، Tailwind CSS 3 |
| PWA | next-pwa (Workbox) |
| QR | کتابخانه `qrcode` (خالص JS، بدون وابستگی native) |
| بک‌اند | Google Apps Script (V8) |
| دیتابیس | Google Sheets |
| سخت‌افزار | ESP32 + ماژول اسکنر QR + رله |

---

## ⚠️ محدودیت‌های نسخه دمو

- درگاه پرداخت **آزمایشی** است؛ هیچ تراکنش واقعی انجام نمی‌شود.
- `admin.seed` بدون احراز هویت است (برای راه‌اندازی سریع). در محیط واقعی آن را با توکن مدیریتی محافظت کنید.
- Google Sheets برای حجم کم تا متوسط مناسب است؛ برای ترافیک بالا به دیتابیس اختصاصی مهاجرت کنید.
- ESP32 از `setInsecure()` استفاده می‌کند؛ در محیط تولید گواهی ریشه واقعی را قرار دهید.
- محدودیت سهمیه Apps Script: حدود ۲۰٬۰۰۰ فراخوانی در روز برای حساب رایگان.

---

## 📄 مستندات بیشتر

- [SETUP.md](SETUP.md) — راه‌اندازی کامل، سیم‌بندی ESP32، رفع اشکال
- [Apps Script Web Apps](https://developers.google.com/apps-script/guides/web)
- [Next.js App Router](https://nextjs.org/docs/app)

---

<div align="center">
ساخته‌شده برای یادگیری 🎢
</div>
