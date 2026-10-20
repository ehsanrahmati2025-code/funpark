/**
 * ============================================================
 *  config.h — تنظیمات فریمور گیت فان‌پارک (ESP32-S3-CAM)
 * ============================================================
 *  فقط همین فایل را برای هر دستگاه ویرایش کنید.
 *  فایل اصلی فریمور: gate.ino
 * ============================================================
 */

#ifndef FUNPARK_GATE_CONFIG_H
#define FUNPARK_GATE_CONFIG_H

/* ------------------------------------------------------------------ */
/*  ۱) شبکه WiFi                                                      */
/* ------------------------------------------------------------------ */
#define WIFI_SSID       "Ehsan3"
#define WIFI_PASSWORD   "abcd1234"

/* ------------------------------------------------------------------ */
/*  ۲) آدرس Google Apps Script و هویت دستگاه                          */
/*     GAS_URL باید آدرس Web App منتشرشده و به /exec ختم شود.          */
/*     DEVICE_KEY همان کلیدی است که در شیت Devices با sha256 ذخیره شد. */
/* ------------------------------------------------------------------ */
#define GAS_URL     "https://script.google.com/macros/s/AKfycbxzfJzgcw1fZGzGHbrOOT6BnaGMGAbvqQ4uMFFyyPrkWy1d6udSzy8Z865lGJsBkwz4/exec"
#define DEVICE_ID   "gate-01"
#define DEVICE_KEY  "test-key-123"

/* ------------------------------------------------------------------ */
/*  ۳) زمان‌بندی (میلی‌ثانیه)                                          */
/* ------------------------------------------------------------------ */
#define WIFI_TIMEOUT_MS    20000   // حداکثر انتظار برای اتصال WiFi
#define HTTP_TIMEOUT_MS    15000   // حداکثر انتظار برای پاسخ GAS
#define GATE_OPEN_MS       1500    // مدت باز بودن رله گیت (دمو: سریع)
#define SCAN_COOLDOWN_MS   1500    // فاصله بین دو اسکن (ضد اسکن تکراری)
#define BEEP_SUCCESS_MS    150     // طول بوق موفق
#define BEEP_ERROR_MS      250     // طول بوق خطا
#define ERROR_BEEP_COUNT   3       // تعداد بوق خطا
#define LED_SETTLE_MS      400     // مدت نمایش رنگ قرمز بعد از خطا

/* ------------------------------------------------------------------ */
/*  ۴) پین‌های خروجی                                                   */
/* ------------------------------------------------------------------ */
#define PIN_RELAY       41
#define PIN_BUZZER      42

/* LED وضعیت: فقط یک عدد نئوپیکسل RGB روی GPIO48
   (LED داخلی بردهای ESP32-S3 DevKitC-1 و مشابه)
   دیگر هیچ LED ساده‌ای استفاده نمی‌شود. */
#define PIN_RGB_LED        48
#define RGB_LED_COUNT      1
#define RGB_LED_BRIGHTNESS 40      // ۰..۲۵۵ — ۴۰ روشنایی مطبوع است

/* اکثر ماژول‌های رله ارزان Active-LOW هستند (با LOW روشن می‌شوند).
   اگر رله شما برعکس عمل می‌کند این مقدار را ۰ بگذارید. */
#define RELAY_ACTIVE_LOW  1

/* ------------------------------------------------------------------ */
/*  ۵) پین‌های دوربین                                                  */
/*     برد: FREENOVE ESP32-S3 WROOM                                    */
/*     مقادیر زیر عیناً از سیلک‌اسکرین خود برد خوانده شده‌اند و          */
/*     برابر CAMERA_MODEL_ESP32S3_EYE در camera_pins.h هستند:          */
/*                                                                     */
/*       GPIO4  = CAM_SIOD    GPIO5  = CAM_SIOC                        */
/*       GPIO6  = CAM_VSYNC   GPIO7  = CAM_HREF                        */
/*       GPIO15 = CAM_XCLK    GPIO16 = CAM_Y9                          */
/*       GPIO17 = CAM_Y8      GPIO18 = CAM_Y7                          */
/*       GPIO8  = CAM_Y4      GPIO9  = CAM_Y3                          */
/*       GPIO10 = CAM_Y5      GPIO11 = CAM_Y2                          */
/*       GPIO12 = CAM_Y6      GPIO13 = CAM_PCLK                        */
/*                                                                     */
/*     PWDN و RESET روی این برد به هیچ GPIO وصل نیستند (-1).           */
/* ------------------------------------------------------------------ */
#define CAM_PIN_PWDN   -1
#define CAM_PIN_RESET  -1
#define CAM_PIN_XCLK   15
#define CAM_PIN_SIOD   4
#define CAM_PIN_SIOC   5

#define CAM_PIN_Y9     16
#define CAM_PIN_Y8     17
#define CAM_PIN_Y7     18
#define CAM_PIN_Y6     12
#define CAM_PIN_Y5     10
#define CAM_PIN_Y4     8
#define CAM_PIN_Y3     9
#define CAM_PIN_Y2     11

#define CAM_PIN_VSYNC  6
#define CAM_PIN_HREF   7
#define CAM_PIN_PCLK   13

/* ------------------------------------------------------------------ */
/*  ۶) تنظیمات دوربین                                                  */
/*                                                                     */
/*  توجه: ESP32QRCodeReader در setup() خودش این‌ها را مقدار می‌دهد و    */
/*  قابل تغییر از اینجا نیست:                                          */
/*      pixel_format = PIXFORMAT_GRAYSCALE                             */
/*      xclk_freq_hz = 10 MHz                                          */
/*      jpeg_quality = 15                                              */
/*      fb_count     = 2  (در نسخه این پروژه اصلاح شد)                 */
/*                                                                     */
/*  ⚠️ محدودیت کتابخانه: اگر frameSize بزرگ‌تر از FRAMESIZE_SVGA باشد،  */
/*  تسک دیکد QR بلافاصله خودش را حذف می‌کند و هیچ کدی اسکن نمی‌شود.     */
/*  (این همان دلیلی است که باید اندازه را کوچک نگه داریم.)             */
/*                                                                     */
/*  برای سرعت (حالت دمو) QVGA انتخاب شده:                          */
/*    - هر فریم ۷۶KB است در مقابل ۳۰۷KB در VGA ⟹ دیکد QR حدود     */
/*      ۴ برابر سریع‌تر (quirc روی تعداد پیکسل کار می‌کند).          */
/*    - چون QR حالا نسخه ۱ (۲۱×۲۱ ماژول) است، همان ۳۲۰×۲۴۰ هم      */
/*      برای هر ماژول ۵ تا ۸ پیکسل می‌دهد که کافی است.              */
/*  اگر روزی به دقت بیشتر نیاز داشتید VGA را برگردانید (کندتر است). */
/* ------------------------------------------------------------------ */
#define CAM_FRAMESIZE    FRAMESIZE_QVGA

/* ------------------------------------------------------------------ */
/*  ۷) دیباگ                                                          */
/* ------------------------------------------------------------------ */
#define DEBUG_SERIAL  1

#if DEBUG_SERIAL
  #define LOG(x)        Serial.print(x)
  #define LOGLN(x)      Serial.println(x)
  #define LOGF(...)     Serial.printf(__VA_ARGS__)
#else
  #define LOG(x)
  #define LOGLN(x)
  #define LOGF(...)
#endif

#endif // FUNPARK_GATE_CONFIG_H
