# 🎡 راه‌اندازی پروژه فان‌پارک (FunPark)

راهنمای گام‌به‌گام راه‌اندازی سامانه فروش بلیط و کنترل گیت با QR.

معماری کلی:

```
[Next.js] ──POST text/plain──→ [Google Apps Script] ──→ [Google Sheets]
                                        ↑
                                    [ESP32]
```

---

## فهرست

1. [پیش‌نیازها](#۱-پیشنیازها)
2. [ساخت Google Sheets](#۲-ساخت-google-sheets)
3. [راه‌اندازی Apps Script](#۳-راهاندازی-apps-script)
4. [تنظیم Script Properties](#۴-تنظیم-script-properties)
5. [انتشار Web App](#۵-انتشار-web-app)
6. [پر کردن دیتای دمو](#۶-پر-کردن-دیتای-دمو)
7. [راه‌اندازی فرانت‌اند Next.js](#۷-راهاندازی-فرانتاند-nextjs)
8. [آیکون‌های PWA](#۸-آیکونهای-pwa)
9. [تنظیم ESP32](#۹-تنظیم-esp32)
10. [تست کامل سیستم](#۱۰-تست-کامل-سیستم)
11. [رفع اشکال](#۱۱-رفع-اشکال)

---

## ۱) پیش‌نیازها

| مورد | نسخه پیشنهادی |
|---|---|
| Node.js | 18.17 یا بالاتر (LTS) |
| npm | ۹ یا بالاتر |
| حساب Google | رایگان |
| Arduino IDE | 2.x + پکیج ESP32 |
| مرورگر | Chrome / Edge |

> برای اجرای فرانت‌اند به هیچ دیتابیس، Docker یا سرویس ابری جداگانه‌ای نیاز نیست. دیتابیس همان Google Sheets است.

---

## ۲) ساخت Google Sheets

1. وارد [Google Sheets](https://sheets.google.com) شوید و یک صفحه‌گسترده جدید بسازید.
2. نام آن را مثلاً `FunPark DB` بگذارید.
3. **نیازی به ساخت دستی شیت‌ها نیست** — اسکریپت در اولین اجرا هر ۶ شیت را با ستون‌های صحیح می‌سازد:

   `Users` · `Events` · `Orders` · `Tickets` · `Devices` · `ScanLogs`

4. از نوار آدرس مرورگر، **SPREADSHEET_ID** را کپی کنید:

   ```
   https://docs.google.com/spreadsheets/d/  <<< این بخش >>>  /edit
   ```

---

## ۳) راه‌اندازی Apps Script

1. در همان صفحه‌گسترده: **Extensions → Apps Script**.
2. پروژه جدید ساخته می‌شود. نام آن را `FunPark API` بگذارید.
3. محتوای فایل پیش‌فرض `Code.gs` را پاک کنید و فایل‌های زیر را از پوشه `gas/` پروژه **یکی‌یکی** ایجاد کنید:

   | فایل | نوع فایل در Apps Script |
   |---|---|
   | `appsscript.json` | Manifest (با View → Show manifest file فعال می‌شود) |
   | `Utils.gs` | Script |
   | `Code.gs` | Script |
   | `Events.gs` | Script |
   | `Auth.gs` | Script |
   | `Orders.gs` | Script |
   | `Tickets.gs` | Script |
   | `Scan.gs` | Script |
   | `Seed.gs` | Script |

4. ذخیره کنید: `Ctrl + S`.

> **نکته:** برای دیدن و ویرایش `appsscript.json` در تنظیمات پروژه گزینه *Show "appsscript.json" manifest file in editor* را فعال کنید.

---

## ۴) تنظیم Script Properties

در Apps Script: **Project Settings (⚙️) → Script Properties → Add script property**

| Key | Value | توضیح |
|---|---|---|
| `SPREADSHEET_ID` | شناسه شیت از مرحله ۲ | اتصال اسکریپت به شیت |
| `JWT_SECRET` | یک رشته تصادفی ۳۲+ کاراکتری | امضای توکن ورود |
| `QR_SECRET` | یک رشته تصادفی ۳۲+ کاراکتری دیگر | امضای HMAC کد QR |

برای ساخت رشته تصادفی می‌توانید از این دستور در ترمینال استفاده کنید:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ⚠️ `QR_SECRET` و `JWT_SECRET` باید **متفاوت** باشند و هرگز در گیت‌هاب قرار نگیرند. تغییر `QR_SECRET` باعث بی‌اعتبار شدن همه QRهای صادرشده می‌شود.

---

## ۵) انتشار Web App

1. در بالای ویرایشگر Apps Script روی **Deploy → New deployment** بزنید.
2. روی چرخ‌دنده کنار *Select type* کلیک کنید و **Web app** را انتخاب کنید.
3. تنظیمات:

   | گزینه | مقدار |
   |---|---|
   | Description | `FunPark API v1` |
   | Execute as | **Me** |
   | Who has access | **Anyone** |

4. **Deploy** بزنید و دسترسی‌ها را تأیید (Authorize) کنید.
5. اگر هشدار «Google hasn't verified this app» دیدید: **Advanced → Go to FunPark API (unsafe)**.
6. آدرس **Web app URL** را کپی کنید؛ به `/exec` ختم می‌شود:

   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

> هر بار کد Apps Script را تغییر دادید، باید **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** بزنید تا تغییرات روی همان URL اعمال شود.

---

## ۶) پر کردن دیتای دمو

روش ۱ — از مرورگر: آدرس زیر را باز کنید (مقدار URL خودتان را بگذارید):

```
https://script.google.com/macros/s/AKfycb.../exec?action=admin.seed
```

روش ۲ — از ترمینال:

```bash
curl -L -X POST "https://script.google.com/macros/s/AKfycb.../exec" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"admin.seed"}'
```

روش ۳ — از دکمه «ساخت دیتای دمو» در صفحه اصلی سایت.

خروجی موفق چیزی شبیه این است:

```json
{
  "status": 200,
  "data": {
    "message": "دیتای دمو با موفقیت آماده شد",
    "events_created": 3,
    "devices_created": 1,
    "device": { "id": "gate-01", "key": "test-key-123" }
  }
}
```

دیتای ساخته‌شده:

| رویداد | slug | قیمت (ریال) |
|---|---|---|
| پارک اصلی فان‌پارک | `main-park` | ۲۵۰٬۰۰۰ |
| شهر کودکان | `kids-city` | ۱۵۰٬۰۰۰ |
| پارک آبی موج‌ها | `water-park` | ۳۵۰٬۰۰۰ |

و یک دستگاه: `id=gate-01` / `key=test-key-123`

> این action **idempotent** است؛ اجرای دوباره آن داده تکراری نمی‌سازد.

---

## ۷) راه‌اندازی فرانت‌اند Next.js

```bash
cd web
npm install
```

فایل محیطی بسازید:

```bash
# ویندوز (PowerShell)
copy .env.local.example .env.local

# مک / لینوکس
cp .env.local.example .env.local
```

سپس `.env.local` را ویرایش کنید:

```env
NEXT_PUBLIC_API_URL=https://script.google.com/macros/s/AKfycb.../exec
NEXT_PUBLIC_APP_NAME=فان‌پارک
```

اجرای پروژه در حالت توسعه:

```bash
npm run dev
```

سایت روی <http://localhost:3000> بالا می‌آید.

> **نکته PWA:** سرویس‌ورکر فقط در حالت production و بعد از `npm run build` ساخته و فعال می‌شود:

```bash
npm run build
npm start
```

---

## ۸) آیکون‌های PWA

فایل `web/public/manifest.json` به دو آیکون زیر اشاره می‌کند. این دو فایل PNG را در مسیر `web/public/icons/` قرار دهید:

```
web/public/icons/icon-192.png   (192×192)
web/public/icons/icon-512.png   (512×512)
```

اگر این فایل‌ها نباشند، برنامه کار می‌کند ولی هنگام نصب PWA آیکون پیش‌فرض نمایش داده می‌شود.

---

## ۹) تنظیم ESP32

### الف) نصب پکیج برد

Arduino IDE → **File → Preferences → Additional Boards Manager URLs**:

```
https://espressif.github.io/arduino-esp32/package_esp32_index.json
```

سپس **Tools → Board → Boards Manager** → جستجوی `esp32` → نصب.

### ب) سیم‌بندی

| ESP32 | قطعه |
|---|---|
| GPIO 26 | رله (IN) — قفل برقی گیت |
| GPIO 2 | LED سبز (ورود مجاز) |
| GPIO 4 | LED قرمز (ورود غیرمجاز) |
| GPIO 27 | بازر (Buzzer) |
| GPIO 16 (RX2) | TX ماژول اسکنر QR |
| GPIO 17 (TX2) | RX ماژول اسکنر QR |
| VIN / 5V | تغذیه رله و اسکنر |
| GND | GND مشترک |

> ⚠️ ماژول رله و اسکنر را از یک منبع ۵ ولت پایدار تغذیه کنید؛ تغذیه از پورت USB معمولاً کافی نیست.

### ج) ویرایش فایل `gate.ino`

پوشه `esp32/` را در Arduino IDE باز کنید و این مقادیر را پر کنید:

```cpp
static const char *WIFI_SSID  = "نام وای‌فای";
static const char *WIFI_PASS  = "رمز وای‌فای";
static const char *API_URL    = "https://script.google.com/macros/s/AKfycb.../exec";
static const char *DEVICE_ID  = "gate-01";
static const char *DEVICE_KEY = "test-key-123";
```

سپس **Upload** کنید و Serial Monitor را روی `115200 baud` باز کنید.

---

## ۱۰) تست کامل سیستم

### تست ۱ — سلامت API

```bash
curl -L -X POST "https://script.google.com/macros/s/AKfycb.../exec" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"events.list"}'
```

باید `"status":200` و لیست ۳ رویداد را ببینید.

### تست ۲ — ثبت‌نام و ورود

```bash
curl -L -X POST "https://script.google.com/macros/s/AKfycb.../exec" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"auth.register","phone":"09121234567","full_name":"کاربر تست","password":"123456"}'
```

خروجی شامل `token` است. آن را در متغیر `TOKEN` بگذارید.

### تست ۳ — خرید بلیط از سایت

1. `http://localhost:3000` را باز کنید.
2. ثبت‌نام کنید.
3. یک رویداد انتخاب کرده و بلیط بخرید.
4. در درگاه آزمایشی روی **پرداخت موفق** بزنید.
5. در «بلیط‌های من» روی بلیط کلیک کنید تا QR نمایش داده شود.

### تست ۴ — اسکن روی ESP32

رشته QR را از صفحه بلیط کپی کنید و در Serial Monitor بچسبانید (Enter بزنید). باید ببینید:

```
[API] reason: ok
[API] message: ورود مجاز است — ۲ اعتبار باقی مانده
[GATE] OPEN — access granted
```

### تست ۵ — ضد تقلب

مقدار `payload` را دستی تغییر دهید (مثلاً یک کاراکتر از امضا):

```bash
curl -L -X POST "https://script.google.com/macros/s/AKfycb.../exec" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"scan.validate","device_id":"gate-01","device_key":"test-key-123","payload":"AAA.BBB"}'
```

باید `"ok":false` و `"reason":"bad_signature"` برگردد.

---

## ۱۱) رفع اشکال

| مشکل | علت احتمالی | راه‌حل |
|---|---|---|
| `SPREADSHEET_ID تنظیم نشده است` | Script Property ثبت نشده | مرحله ۴ را انجام دهید |
| پاسخ HTML به جای JSON | Web App با دسترسی Anyone منتشر نشده | مرحله ۵ را دوباره انجام دهید |
| `action نامعتبر است` | نام action اشتباه است | جدول action ها در README |
| `توکن نامعتبر یا منقضی شده است` | انقضای ۷ روزه یا تغییر `JWT_SECRET` | دوباره وارد شوید |
| `آدرس API تنظیم نشده است` | `.env.local` ساخته نشده | مرحله ۷ + ری‌استارت `npm run dev` |
| `bad_signature` در اسکن | `QR_SECRET` عوض شده یا QR دستکاری شده | بلیط جدید صادر کنید |
| `invalid_device_key` | کلید دستگاه با `api_key_hash` یکی نیست | `admin.seed` را دوباره اجرا کنید |
| خطای CORS در مرورگر | هدر Content-Type اشتباه | باید `text/plain;charset=utf-8` باشد |
| تغییرات Apps Script اعمال نمی‌شود | نسخه جدید Deploy نشده | New version در Manage deployments |
| QR اسکن نمی‌شود | نور کم یا کد کوچک | روشنایی صفحه را زیاد کنید یا از `npm start` (production) استفاده کنید |

### مشاهده لاگ‌های Apps Script

در ویرایشگر Apps Script: **Executions** (آیکون ⏱ در نوار کنار). همه فراخوانی‌ها، خطاها و زمان اجرا اینجا ثبت می‌شود.

### بررسی لاگ اسکن‌ها

در Google Sheets، شیت `ScanLogs` را باز کنید؛ هر اسکن (موفق یا ناموفق) با دلیل و اعتبار قبل/بعد ثبت می‌شود.

---

## وضعیت امنیتی این نسخه (دمو)

این پروژه برای **دمو و آموزش** ساخته شده است. برای استفاده واقعی این موارد را اضافه کنید:

- [ ] درگاه پرداخت واقعی (زرین‌پال، آیدی‌پی، …) به جای `orders.pay` آزمایشی
- [ ] محدودسازی `admin.seed` با یک توکن مدیریتی
- [ ] Rate limiting روی `auth.login` و `scan.validate`
- [ ] تأیید شماره موبایل با پیامک OTP
- [ ] استفاده از root CA به جای `setInsecure()` در ESP32
- [ ] پشتیبان‌گیری زمان‌بندی‌شده از Google Sheets
