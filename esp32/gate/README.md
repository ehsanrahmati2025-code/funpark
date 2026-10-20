# 🔧 فریمور گیت فان‌پارک — FREENOVE ESP32-S3 WROOM

کنترلر ورودی که کد QR بلیط را با دوربین می‌خواند، به Google Apps Script می‌فرستد
و در صورت تأیید، قفل برقی گیت را باز می‌کند.

```
[دوربین OV5640] → [quirc decode] → POST scan.validate → [Apps Script]
                                                              │
        [رله / بازر / RGB] ←──────── ok=true ─────────────────┘
```

---

## ۱) سخت‌افزار

| قطعه | مشخصات |
|---|---|
| برد | FREENOVE ESP32-S3 WROOM (16MB Flash / 8MB PSRAM) |
| دوربین | ماژول OV5640 روی کانکتور FPC برد |
| رله | ۵ ولت تک‌کانال — **GPIO 41** |
| بازر | اکتیو ۵ ولت — **GPIO 42** |
| LED وضعیت | نئوپیکسل WS2812 **روی برد** — **GPIO 48** |
| منبع تغذیه | ۵V / ۲A (USB معمولی برای رله کافی نیست) |

> ✅ **هیچ LED ساده‌ای لازم نیست.** فقط همان یک نئوپیکسل داخلی برد استفاده می‌شود.

---

## ۲) نصب برد در Arduino IDE

1. **File → Preferences → Additional Boards Manager URLs**:

   ```
   https://espressif.github.io/arduino-esp32/package_esp32_index.json
   ```

2. **Tools → Board → Boards Manager** → جستجوی `esp32` → نصب **esp32 by Espressif Systems** (تست‌شده روی **3.3.11**).
3. **Tools → Board → ESP32S3 Dev Module**.

---

## ۳) ⚠️ تنظیمات حیاتی Arduino IDE

| گزینه | مقدار | دلیل |
|---|---|---|
| **Board** | `ESP32S3 Dev Module` | — |
| **PSRAM** | **`OPI PSRAM`** | بدون آن `psramFound()` خطا می‌دهد و reader اصلاً بالا نمی‌آید |
| **Flash Size** | `16MB` | مطابق برد |
| **Partition Scheme** | **`Huge APP (3MB No OTA/1MB SPIFFS)`** | فریمور با quirc + TLS از ۱MB پیش‌فرض بزرگ‌تر است |
| **CPU Frequency** | `240MHz` | سرعت دیکد QR |
| **USB CDC On Boot** | `Disabled` | خروجی `Serial` روی **پورت UART** (GPIO43/44) می‌رود |
| **Core Debug Level** | `None` | برای عیب‌یابی موقتاً `Info` |
| **Upload Speed** | `921600` | — |

### 🔌 دو پورت USB برد

| پورت | کاربرد | تنظیم لازم |
|---|---|---|
| **UART** (CH340) | Serial Monitor معمولی | `USB CDC On Boot = Disabled` ✅ |
| **USB** (بومی) | دیباگ/فلش سریع | `USB CDC On Boot = Enabled` |

اگر تنظیم CDC با پورتی که استفاده می‌کنید هم‌خوان نباشد، **لاگ‌های برنامه را نمی‌بینید** ولی لاگ‌های داخلی ESP-IDF (مثل خطاهای `camera:`) نمایش داده می‌شوند. این دقیقاً همان چیزی است که باعث سردرگمی می‌شود.

---

## ۴) کتابخانه‌ها

| کتابخانه | نصب از | وضعیت |
|---|---|---|
| **ArduinoJson** | Library Manager (Benoit Blanchon) | نسخه ۶ یا ۷ |
| **Adafruit NeoPixel** | Library Manager | برای LED روی GPIO48 |
| **WiFiManager** | Library Manager (tzapu) | نسخه ۲.x — پورتال پیکربندی WiFi |
| **WebServer** | داخل هسته ESP32 | برای پنل وب محلی |
| **ESP32QRCodeReader** | دستی — فایل‌هایش **داخل همین پوشه** هستند | نیازی به نصب جداگانه نیست |

> 📌 `ESP32QRCodeReader` و `quirc` به‌صورت سورس داخل پوشه اسکچ قرار گرفته‌اند تا نیازی به ZIP نصب دستی نباشد. **همه فایل‌های `.c` باید در ریشه پوشه بمانند** — آردوینو زیرپوشه‌ها را کامپایل نمی‌کند.

---

## ۵) سیم‌بندی

### خروجی‌ها

| ESP32-S3 | قطعه | نکته |
|---|---|---|
| `GPIO 41` | رله (IN) | قفل برقی گیت |
| `GPIO 42` | بازر (+) | — |
| `GPIO 48` | WS2812 روی برد | نیازی به سیم‌کشی نیست |
| `5V` | VCC رله و بازر | — |
| `GND` | GND مشترک | **حتماً مشترک** |

### دوربین (از قبل روی برد سیم‌بندی شده)

| سیگنال | GPIO | | سیگنال | GPIO |
|---|---|---|---|---|
| CAM_SIOD | 4 | | CAM_Y9 | 16 |
| CAM_SIOC | 5 | | CAM_Y8 | 17 |
| CAM_VSYNC | 6 | | CAM_Y7 | 18 |
| CAM_HREF | 7 | | CAM_Y6 | 12 |
| CAM_XCLK | 15 | | CAM_Y5 | 10 |
| CAM_PCLK | 13 | | CAM_Y4 | 8 |
| CAM_Y2 | 11 | | CAM_Y3 | 9 |

این نقشه عیناً برابر `CAMERA_MODEL_ESP32S3_EYE` در `camera_pins.h` است.

---

## ۶) تنظیم `config.h`

```c
#define WIFI_SSID       "نام وای‌فای"
#define WIFI_PASSWORD   "رمز وای‌فای"

#define GAS_URL     "https://script.google.com/macros/s/AKfycb.../exec"
#define DEVICE_ID   "gate-01"
#define DEVICE_KEY  "test-key-123"
```

| مقدار | از کجا |
|---|---|
| `GAS_URL` | آدرس Web App منتشرشده (باید به `/exec` ختم شود) |
| `DEVICE_ID` | شناسه دستگاه در شیت `Devices` |
| `DEVICE_KEY` | کلید خام؛ `sha256` آن در شیت ذخیره شده |

اگر رله برعکس کار می‌کند: `#define RELAY_ACTIVE_LOW 0`
اگر LED خیلی پرنور است: `RGB_LED_BRIGHTNESS` را کم کنید (پیش‌فرض ۴۰).

---

## ۷) آپلود و تست

1. `esp32/gate/gate.ino` را در Arduino IDE باز کنید.
2. تنظیمات بخش ۳ را اعمال و **Upload** کنید.
3. Serial Monitor روی **115200**.

### خروجی موفق

```
==============================================
  FunPark Gate Controller — ESP32-S3-CAM
  Device ID : gate-01
  PSRAM     : found
  Free heap : 289604 bytes
==============================================
[CAM] camera initialized (grayscale, fb_count=1, PSRAM frame buffer)
[CAM] sensor=OV5640 PID=0x5640 VER=0x?? 
[CAM] framesize=8 pixformat=3
[QR] reader started on core 1
[WiFi] connecting....
[WiFi] connected. IP: 10.23.83.246
[WiFi] RSSI: -32 dBm
[SYS] Ready. Hold a ticket QR in front of the camera...
```

LED آبی کم‌رنگ روشن می‌شود (حالت آماده).

### اسکن موفق

```
[QR] scanned — 143 bytes
[HTTP] status=200, bytes=214
[SCAN] ok=1 action=open_gate reason=ok
[SCAN] message: ورود مجاز است — ۲ اعتبار باقی مانده
[GATE] ACCESS GRANTED
[GATE] serial=48213907 remaining=2
```

LED **سبز** می‌شود، رله ۳ ثانیه باز می‌ماند، یک بوق کوتاه.

### اسکن رد‌شده

```
[SCAN] ok=0 action=deny reason=bad_signature
[SCAN] message: امضای کد QR معتبر نیست
[GATE] ACCESS DENIED
```

LED **قرمز** + ۳ بوق. رله هرگز باز نمی‌شود.

---

## ۸) رنگ‌های LED

| وضعیت | رنگ | مدت |
|---|---|---|
| آماده به کار | آبی کم‌رنگ | دائمی |
| ورود مجاز | سبز | ۳ ثانیه (همزمان با رله) |
| ورود غیرمجاز | قرمز | ۴۰۰ms + ۳ بوق |
| دوربین خراب | چشمک قرمز | هر ۱.۵ ثانیه |

---

## ۹) عیب‌یابی

| علامت | علت | راه‌حل |
|---|---|---|
| `PSRAM not found` | PSRAM خاموش | `Tools → PSRAM → OPI PSRAM` |
| `Sketch too big` | پارتیشن پیش‌فرض | `Huge APP (3MB No OTA)` |
| `undefined reference to quirc_*` | فایل‌های `.c` در زیرپوشه‌اند | همه `.c` باید در **ریشه** پوشه اسکچ باشند |
| `undefined reference to lifo_*` | `collections.c` کامپایل نشده | همان بالا |
| `unknown type name 'bool'` | `.c` بدون `<stdbool.h>` | در `quirc.c` / `decode.c` موجود است |
| **`Detected camera not supported (0x106)`** | **هیچ دستگاهی روی SCCB پاسخ نمی‌دهد** | بخش ۱۰ |
| `invalid_device_key` | کلید دستگاه اشتباه | `admin.seed` را دوباره اجرا کنید |
| `[HTTP] status=-1` | WiFi قطع | `WIFI_SSID` / RSSI را چک کنید |
| `[HTTP] status=302` و قطع شدن | ریدایرکت دنبال نشد | `HTTPC_STRICT_FOLLOW_REDIRECTS` باید فعال بماند |
| خروجی Serial دیده نمی‌شود | `USB CDC On Boot` با پورت شما هم‌خوان نیست | بخش ۳ |
| رله برعکس | Active-HIGH | `RELAY_ACTIVE_LOW 0` |
| ریست مداوم | تغذیه ضعیف | منبع ۵V/۲A مستقل برای رله |

---

## ۱۰) 🔴 خطای `Camera probe failed 0x106`

این خطا مستقیماً از `esp32-camera` می‌آید و معنی‌اش دقیق است:

| کد | معنا |
|---|---|
| `0x20001` `ESP_ERR_CAMERA_NOT_DETECTED` | سنسور روی I2C **دیده نشد** |
| **`0x106` `ESP_ERR_NOT_SUPPORTED`** | به I2C وصل شد ولی PID شناسایی نشد |

**نکته مهم:** `0x106` همیشه یعنی «PID ناشناس»، نه «کابل قطع». برای تفکیک این دو، اسکچ [`../camera_test/camera_test.ino`](../camera_test/camera_test.ino) نوشته شد که گذرگاه SCCB را مستقیم اسکن می‌کند.

### آنچه در عمل به آن رسیدیم

```
[I2C] NOTHING FOUND on the bus
[RESULT] bus empty -> ribbon / power / XCLK problem
```

یعنی هیچ آدرسی ACK نمی‌داد — و علت **تعویض ماژول دوربین** بود. ماژول قبلی خراب بود.

### اگر دوباره این خطا را دیدید

1. `camera_test.ino` را فلش کنید و خروجی `[I2C]` را ببینید.
2. اگر `NOTHING FOUND` بود، مشکل فیزیکی است:
   - کابل روبان را در آورده و محکم جا بزنید (اتصالات مسی رو به PCB)
   - ولتاژ ۳.۳V پایه تغذیه ماژول را با مولتی‌متر بگیرید
   - روی `GPIO15` باید حدود **۱.۶ ولت DC** ببینید (XCLK با دیوتی ۵۰٪)
3. اگر آدرسی ACK داد ولی PID ناشناس بود، ماژول چیز دیگری غیر از OV5640/OV3660/OV2640 است.

---

## ۱۱) ساختار پوشه

```
esp32/gate/                 ← این پوشه را در Arduino IDE باز کنید
├── gate.ino                ← فریمور اصلی
├── config.h                ← تنها فایلی که ویرایش می‌کنید
│
├── ESP32QRCodeReader.h     ┐
├── ESP32QRCodeReader.cpp   │
├── ESP32CameraPins.h       │
│                           │
├── quirc.c                 │  ⚠️ همه این فایل‌ها باید در ریشه بمانند
├── decode.c                │     (آردوینو زیرپوشه را کامپایل نمی‌کند)
├── identify.c              │
├── version_db.c            │
├── collections.c           │
├── quirc.h                 │
├── quirc_internal.h        ┘
│
├── openmv/                 ← فقط هدر (کامپایل نمی‌شود)
│   ├── fmath.h
│   └── collections.h
├── quirc/                  ← فقط LICENSE و README اصلی quirc
└── README.md
```

---

## ۱۲) نکات تولیدی

- [ ] در `esp32_s3_cam.ino`/`gate.ino` جای `client.setInsecure()` گواهی ریشه واقعی را با `client.setCACert(CA_CERT)` بگذارید.
- [ ] برای هر گیت `DEVICE_ID` و `DEVICE_KEY` یکتا تعریف کنید (نه `gate-01` مشترک).
- [ ] رله را روی منبع تغذیه مستقل با فیوز بگذارید.
- [ ] پارتیشن `Huge APP` یعنی OTA غیرفعال است؛ برای تولید `Minimal SPIFFS with OTA` را در نظر بگیرید.
- [ ] برد را در جعبه با درپوش محافظ قرار دهید.
