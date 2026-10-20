/**
 * ============================================================
 *  gate.ino — فریمور کنترلر گیت فان‌پارک
 *  برد: ESP32-S3-CAM (Freenove ESP32-S3 WROOM CAM یا مشابه)
 * ============================================================
 *
 *  جریان کار:
 *    ۱) ESP32QRCodeReader با دوربین فریم می‌گیرد و با quirc کد QR را دیکد می‌کند.
 *    ۲) رشته خوانده‌شده به Google Apps Script ارسال می‌شود (action=scan.validate).
 *    ۳) اگر data.ok === true و action === "open_gate" → رله ۳ ثانیه باز می‌شود.
 *       در غیر این صورت → LED قرمز و ۳ بوق خطا (رله بسته می‌ماند).
 *
 *  نسخه کتابخانه ESP32QRCodeReader این پروژه:
 *    سازنده‌ها: () | (CameraPins) | (CameraPins, framesize_t) | (framesize_t)
 *    setup()  → QRCodeReaderSetupErr
 *    receiveQrCode(struct QRCodeData*, long timeoutMs)
 *    نکته: خودِ کتابخانه دوربین را با esp_camera_init راه می‌اندازد
 *          (PIXFORMAT_GRAYSCALE, fb_count=1, xclk=10MHz, quality=15)
 *          پس نباید بیرون از آن esp_camera_init صدا زده شود.
 *
 *  پیش‌نیازها: ArduinoJson + ESP32QRCodeReader (فایل‌های .h/.cpp داخل همین پوشه)
 * ============================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_NeoPixel.h>
#include <WebServer.h>
#include <WiFiManager.h>
#include <time.h>

#include "esp_camera.h"
#include "ESP32QRCodeReader.h"

#include "config.h"
#include "webui.h"

/* ------------------------------------------------------------------ */
/*  LED وضعیت — یک عدد نئوپیکسل RGB روی GPIO48                        */
/* ------------------------------------------------------------------ */
Adafruit_NeoPixel rgbLed(RGB_LED_COUNT, PIN_RGB_LED, NEO_GRB + NEO_KHZ800);

/* ================================================================== */
/*  پین‌های دوربین در قالب CameraPins کتابخانه                         */
/* ================================================================== */
static const CameraPins GATE_CAMERA_PINS = {
  .PWDN_GPIO_NUM  = CAM_PIN_PWDN,
  .RESET_GPIO_NUM = CAM_PIN_RESET,
  .XCLK_GPIO_NUM  = CAM_PIN_XCLK,
  .SIOD_GPIO_NUM  = CAM_PIN_SIOD,
  .SIOC_GPIO_NUM  = CAM_PIN_SIOC,
  .Y9_GPIO_NUM    = CAM_PIN_Y9,
  .Y8_GPIO_NUM    = CAM_PIN_Y8,
  .Y7_GPIO_NUM    = CAM_PIN_Y7,
  .Y6_GPIO_NUM    = CAM_PIN_Y6,
  .Y5_GPIO_NUM    = CAM_PIN_Y5,
  .Y4_GPIO_NUM    = CAM_PIN_Y4,
  .Y3_GPIO_NUM    = CAM_PIN_Y3,
  .Y2_GPIO_NUM    = CAM_PIN_Y2,
  .VSYNC_GPIO_NUM = CAM_PIN_VSYNC,
  .HREF_GPIO_NUM  = CAM_PIN_HREF,
  .PCLK_GPIO_NUM  = CAM_PIN_PCLK,
};

/* ================================================================== */
/*  نمونه سراسری خواننده QR                                            */
/*  نکته: CAM_FRAMESIZE باید ≤ FRAMESIZE_SVGA باشد وگرنه تسک دیکد      */
/*        خودش را حذف می‌کند (محدودیت داخلی کتابخانه).                 */
/* ================================================================== */
ESP32QRCodeReader reader(GATE_CAMERA_PINS, CAM_FRAMESIZE);

/* ================================================================== */
/*  ساختار نتیجه اسکن                                                  */
/* ================================================================== */
struct ScanResult {
  bool   ok;
  String reason;
  String action;
  String message;   // پیام فارسی سرور (message_fa)
  String serial;    // شماره سریال بلیط
  int    remaining; // اعتبار باقی‌مانده
};

/* ================================================================== */
/*  متغیرهای سراسری                                                    */
/* ================================================================== */
unsigned long lastScanAt  = 0;      // زمان آخرین اسکن (ضد اسکن تکراری)
bool          cameraReady = false;  // آیا دوربین و reader با موفقیت راه افتادند
String        sensorName  = "—";    // نام سنسور شناسایی‌شده (OV2640 و ...)

/* آخرین بلیط پردازش‌شده — تا وقتی از دید دوربین خارج نشده، دوباره
   پردازش نمی‌شود. (منطق «حضور»: نبودن بلیط یعنی برداشته شد) */
String        lastPayload   = "";
unsigned long lastDecodeAt  = 0;

/* وضعیت رله — باز شدن غیرمسدودکننده تا دستگاه آماده اسکن بعدی بماند */
bool          relayOpen     = false;
unsigned long relayOpenedAt = 0;

/* وقتی درخواست اسکن در جریان است، استریم تصویر سوکت جدید باز نکند */
volatile bool httpBusy      = false;

/* ------------------------------------------------------------------ */
/*  وب‌سرور و WiFiManager                                              */
/* ------------------------------------------------------------------ */
#define PORTAL_AP_SSID    "FunPark-Gate"   // نام شبکه پیکربندی
#define PORTAL_AP_PASS    "funpark1234"    // رمز شبکه پیکربندی
#define PORTAL_TIMEOUT_S  300              // ۵ دقیقه فرصت برای پیکربندی

WebServer   webServer(80);
WiFiManager wifiManager;
bool        portalActive = false;

/* ------------------------------------------------------------------ */
/*  تصویر زنده: فریم خام GRAYSCALE کوچک‌شده به QVGA                    */
/*                                                                     */
/*  چرا دیگر از MJPEG/JPEG استفاده نمی‌کنیم؟                           */
/*    دوربین روی PIXFORMAT_GRAYSCALE کار می‌کند، پس fb->buf یک بافر خام */
/*    ۳۰۷KB است نه JPEG. تبدیل آن با fmt2jpg هم CPU می‌خواهد و هم به    */
/*    پشتیبانی آن تابع وابسته است. به جای آن فقط هر پیکسل/سطرِ دوم را   */
/*    برمی‌داریم (کوچک‌سازی ۲:۱ به 320×240 = 76,800 بایت) و همان بایت‌ها */
/*    را به مرورگر می‌فرستیم؛ مرورگر خودش آن را روی canvas رسم می‌کند.  */
/* ------------------------------------------------------------------ */
static uint8_t *frameBuf    = nullptr;  // بافر PSRAM برای فریم کوچک‌شده
static int      frameW      = 0;
static int      frameH      = 0;
static uint32_t frameOkCount = 0;       // چند فریم تا حالا ارسال شده
static uint8_t  frameMean    = 0;       // میانگین روشنایی آخرین فریم (۰..۲۵۵)

/* اطلاعات سنسور — برای نمایش در پنل وب */
static uint16_t camPid       = 0;
static uint8_t  camVer       = 0;
static int      camFramesize = -1;
static int      camPixformat = -1;

/* ------------------------------------------------------------------ */
/*  تاریخچه اسکن (برای پنل وب)                                         */
/* ------------------------------------------------------------------ */
#define SCAN_HISTORY_MAX 10

struct ScanRecord {
  uint32_t seq;
  uint32_t uptimeMs;
  String   payload;

  // ساختار QR
  bool     hasDot;
  uint16_t payloadLen;
  uint16_t sigLen;
  String   bodyJson;    // payload بعد از decode شدن base64url

  // فیلدهای استخراج‌شده از JSON
  int      v;
  String   tid, eid, sn, nonce;
  uint32_t iat, exp;

  // پاسخ سرور
  int      httpStatus;
  bool     serverOk;
  String   action, reason, messageFa, serial;
  int      remaining;
  uint16_t latencyMs;
  String   rawJson;
  String   timeStr;
};

ScanRecord scanHistory[SCAN_HISTORY_MAX];
int        scanHead       = 0;   // اندیس نوشتن بعدی
int        scanCount      = 0;   // تعداد رکوردهای معتبر
uint32_t   scanTotal      = 0;   // شمارنده کل اسکن‌ها
uint32_t   scanSeqCounter = 0;

// نتیجه آخرین ارتباط با سرور (برای ثبت در تاریخچه)
int    lastHttpStatus = 0;
String lastRawJson    = "";

/* ================================================================== */
/*  setup                                                             */
/* ================================================================== */
void setup() {
  Serial.begin(115200);
  delay(400);

  LOGLN("");
  LOGLN("==============================================");
  LOGLN("  FunPark Gate Controller — ESP32-S3-CAM");
  LOGF("  Device ID : %s\n", DEVICE_ID);
  LOGF("  PSRAM     : %s\n", psramFound() ? "found" : "NOT FOUND");
  LOGF("  Free heap : %u bytes\n", ESP.getFreeHeap());
  LOGLN("==============================================");

  initOutputPins();

  // ۱) راه‌اندازی دوربین + تسک دیکد QR
  setupQrReader();

  // ۲) اتصال به WiFi (config.h یا پورتال WiFiManager)
  connectWiFi();

  // تست کوتاه شبکه تا اگر سرور در دسترس نیست، سریع معلوم شود
  checkNetwork();

  // ۳) وب‌سرور محلی: پنل نمایش QR و مدیریت WiFi
  setupWebServer();

  if (cameraReady) {
    LOGLN("[SYS] Ready. Hold a ticket QR in front of the camera...");
    ledBlue();                         // آبی کم‌رنگ = آماده به کار
  } else {
    LOGLN("[SYS] CAMERA NOT READY — check PSRAM / pin config.");
    ledRed();
  }
}

/* ================================================================== */
/*  loop                                                              */
/* ================================================================== */
void loop() {
  // همیشه به درخواست‌های وب پاسخ بده (مستقل از وضعیت دوربین)
  webServer.handleClient();

  // بستن رله وقتی زمانش تمام شد — بدون بلاک کردن حلقه
  relayService();

  // اگر دوربین راه نیفتاده، فقط خطا را نشان بده
  if (!cameraReady) {
    ledRed();
    delay(400);
    ledOff();
    delay(400);
    return;
  }

  // ضد اسکن تکراری: تا پایان cooldown هیچ کدی پردازش نمی‌شود
  if (millis() - lastScanAt < SCAN_COOLDOWN_MS) {
    delay(20);
    return;
  }

  struct QRCodeData qrCodeData;

  // دریافت یک کد QR از صف (انتظار کوتاه تا وب‌سرور معطل نماند)
  if (!reader.receiveQrCode(&qrCodeData, 30)) {
    /* هیچ کدی در دید نیست. اگر بلیط قبلی مدتی است دیده نشده، یعنی از
       جلوی دوربین برداشته شده؛ آن را «آزاد» می‌کنیم تا بار بعد دوباره
       بتوان همان بلیط را اسکن کرد. */
    if (lastPayload.length() > 0 && (millis() - lastDecodeAt) > TICKET_RELEASE_MS) {
      lastPayload = "";
      LOGLN("[QR] ticket removed — scanner armed again");
    }
    delay(2);
    return;
  }

  lastDecodeAt = millis();

  // اگر دیکد ناموفق بود، کتابخانه متن خطای quirc را در payload می‌گذارد
  if (!qrCodeData.valid || qrCodeData.payloadLen <= 0) {
    LOG("[QR] decode failed: ");
    LOGLN((const char *)qrCodeData.payload);
    return;
  }

  // payload یک بافر ثابت uint8_t[1024] است و کتابخانه آن را null-terminate می‌کند
  String payload((const char *)qrCodeData.payload, (unsigned int)qrCodeData.payloadLen);
  payload.trim();

  if (payload.length() == 0) {
    LOGLN("[QR] empty payload");
    return;
  }

  LOGF("[QR] scanned — %u bytes\n", (unsigned int)payload.length());

  /* ----------------------------------------------------------------
     منطق «حضور بلیط»:
       تا وقتی همین بلیط جلوی دوربین است، همان QR ده‌ها بار دیکد می‌شود.
       تا وقتی از دید خارج نشود (یعنی TICKET_RELEASE_MS هیچ کدی دیده
       نشود) فقط بار اول پردازش می‌شود. بعد از برداشتن بلیط، خودکار
       «مسلح» می‌شود و می‌توان دوباره اسکن کرد.
     ---------------------------------------------------------------- */
  if (payload == lastPayload) {
    LOGLN("[QR] same ticket still in view — ignored");
    delay(20);
    return;
  }

  lastPayload = payload;
  lastScanAt  = millis();

  // ارسال به سرور و تصمیم‌گیری
  ScanResult res;
  uint32_t t0 = millis();

  httpBusy = true;
  sendScanToServer(payload, res);
  httpBusy = false;

  // ثبت در تاریخچه برای نمایش در پنل وب
  recordScan(payload, res, (uint16_t)(millis() - t0));

  LOGF("[SCAN] ok=%d action=%s reason=%s\n",
       res.ok, res.action.c_str(), res.reason.c_str());
  if (res.message.length() > 0) {
    LOG("[SCAN] message: ");
    LOGLN(res.message);
  }

  if (res.ok && res.action == "open_gate") {
    grantAccess(res);
  } else {
    denyAccess(res);
  }

  /* کول‌داون کوتاه از پایان کار — تا اسکن بعدی فوراً ممکن باشد */
  lastScanAt = millis();

  delay(20); // فرصت تنفس برای FreeRTOS
}

/* ================================================================== */
/*  رنگ LED وضعیت                                                     */
/* ================================================================== */
void ledOff()   { rgbLed.setPixelColor(0, 0, 0, 0);     rgbLed.show(); }
void ledGreen() { rgbLed.setPixelColor(0, 0, 255, 0);   rgbLed.show(); }
void ledRed()   { rgbLed.setPixelColor(0, 255, 0, 0);   rgbLed.show(); }
void ledAmber() { rgbLed.setPixelColor(0, 255, 140, 0); rgbLed.show(); }
void ledBlue()  { rgbLed.setPixelColor(0, 0, 60, 255);  rgbLed.show(); }

/* ================================================================== */
/*  کنترل غیرمسدودکننده رله                                            */
/*                                                                     */
/*  قبلاً grantAccess() با delay(GATE_OPEN_MS) منتظر می‌ماند و در تمام */
/*  آن مدت دستگاه هیچ بلیطی نمی‌خواند. حالا رله فقط روشن می‌شود و       */
/*  loop() در هر دور چک می‌کند که زمانش تمام شده یا نه؛ پس همان لحظه   */
/*  که گیت باز است، بلیط بعدی هم اسکن می‌شود.                           */
/* ================================================================== */
void relayPulseStart() {
  relayOn();
  relayOpen     = true;
  relayOpenedAt = millis();
}

void relayService() {
  if (relayOpen && (millis() - relayOpenedAt) >= GATE_OPEN_MS) {
    relayOff();
    relayOpen = false;
    ledBlue();                    // بازگشت LED به حالت آماده
    LOGLN("[GATE] closed — ready for next scan");
  }
}

/* ================================================================== */
/*  مقداردهی پین‌های خروجی                                             */
/* ================================================================== */
void initOutputPins() {
  pinMode(PIN_RELAY, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  // نئوپیکسل: راه‌اندازی و خاموش کردن
  rgbLed.begin();
  rgbLed.setBrightness(RGB_LED_BRIGHTNESS);
  rgbLed.clear();
  rgbLed.show();

  relayOff();                          // گیت بسته
  digitalWrite(PIN_BUZZER, LOW);
}

/* ================================================================== */
/*  راه‌اندازی ESP32QRCodeReader                                       */
/* ================================================================== */
void setupQrReader() {
  /* ------------------------------------------------------------------
     تنظیمات مشترک همه سنسورها (GC2145 / OV2640 / OV3660 / OV5640)
     ------------------------------------------------------------------
     شیء reader سراسری است، پس cameraConfig آن با صفر مقداردهی می‌شود؛
     یعنی fb_location = CAMERA_FB_IN_DRAM. برای اینکه DRAM آزاد بماند،
     محل بافر فریم را قبل از setup() به PSRAM منتقل می‌کنیم.

     توجه: setup() کتابخانه این فیلدها را بازنویسی نمی‌کند
     (فقط پین‌ها، xclk، pixel_format، frame_size، quality و fb_count را
     ست می‌کند)، بنابراین مقداردهی ما معتبر باقی می‌ماند.
     ------------------------------------------------------------------ */
  reader.cameraConfig.fb_location = CAMERA_FB_IN_PSRAM;
  reader.cameraConfig.grab_mode   = CAMERA_GRAB_LATEST;  // همیشه تازه‌ترین فریم

  // setup() خودش esp_camera_init را با پیکربندی درست صدا می‌زند
  QRCodeReaderSetupErr err = reader.setup();

  switch (err) {
    case SETUP_OK:
      LOGLN("[CAM] camera initialized (grayscale, fb_count=2, PSRAM frame buffer)");
      cameraReady = true;
      break;

    case SETUP_NO_PSRAM_ERROR:
      LOGLN("[CAM] ERROR: PSRAM not found!");
      LOGLN("      → Tools > PSRAM > 'OPI PSRAM' and re-upload.");
      cameraReady = false;
      return;

    case SETUP_CAMERA_INIT_ERROR:
      LOGLN("[CAM] ERROR: esp_camera_init failed!");
      LOGLN("      → check camera pins in config.h / ribbon cable.");
      LOGLN("      → if the sensor is OV5640, try CAM_FRAMESIZE = FRAMESIZE_QVGA in config.h.");
      cameraReady = false;
      return;

    default:
      LOGLN("[CAM] ERROR: unknown setup error");
      cameraReady = false;
      return;
  }

  // شناسایی سنسور + اجبار اندازه فریم
  sensor_t *s = esp_camera_sensor_get();
  if (s != nullptr) {
    const char *name = "unknown";
    switch (s->id.PID) {
      case OV5640_PID: name = "OV5640"; break;
      case OV3660_PID: name = "OV3660"; break;
      case OV2640_PID: name = "OV2640"; break;
      case GC2145_PID: name = "GC2145"; break;
      case GC0308_PID: name = "GC0308"; break;
      case OV7725_PID: name = "OV7725"; break;
      case OV7670_PID: name = "OV7670"; break;
      default:         name = "unexpected"; break;
    }
    LOGF("[CAM] sensor=%s PID=0x%04X VER=0x%02X\n",
         name, (unsigned)s->id.PID, (unsigned)s->id.VER);

    /* ⚠️ مهم: بعضی سنسورها (مثل GC2145) با اندازه پیش‌فرض بزرگ‌تر از
       FRAMESIZE_SVGA بالا می‌آیند (مثلاً XGA = 1024×768). تسک دیکد
       کتابخانه در این حالت بلافاصله خودش را حذف می‌کند و هیچ کدی اسکن
       نمی‌شود. پس اندازه را بعد از init اجبار می‌کنیم. */
    if ((int)s->status.framesize != (int)CAM_FRAMESIZE) {
      LOGF("[CAM] framesize was %d — forcing %d\n",
           (int)s->status.framesize, (int)CAM_FRAMESIZE);
      if (s->set_framesize(s, CAM_FRAMESIZE) != 0) {
        LOGLN("[CAM] WARNING: set_framesize failed");
      }
      delay(150);
    }

    LOGF("[CAM] framesize=%d pixformat=%d\n",
         (int)s->status.framesize, (int)s->pixformat);

    if (s->status.framesize > FRAMESIZE_SVGA) {
      LOGLN("[CAM] ERROR: framesize still > SVGA — the QR task will not run!");
    }

    if (strcmp(name, "unexpected") == 0) {
      LOGLN("[CAM] WARNING: unknown sensor PID — check module / pin map.");
    }

    sensorName = name;   // برای نمایش در پنل وب

    camPid       = s->id.PID;
    camVer       = s->id.VER;
    camFramesize = (int)s->status.framesize;
    camPixformat = (int)s->pixformat;
  }

  // لاگ داخلی کتابخانه را خاموش می‌گذاریم (برای عیب‌یابی true کنید)
  reader.setDebug(false);

  // تسک دیکد روی هسته ۱ اجرا شود (هسته ۰ برای WiFi/TLS آزاد بماند)
  reader.beginOnCore(1);

  LOGLN("[QR] reader started on core 1");
}

/* ================================================================== */
/*  اتصال WiFi: اول config.h، در صورت شکست پورتال WiFiManager          */
/* ================================================================== */

/** وقتی پورتال پیکربندی باز می‌شود: LED نارنجی + راهنمای سریال */
void onPortalStart(WiFiManager *wm) {
  (void)wm;
  portalActive = true;
  ledAmber();
  LOGLN("[WiFi] ---- CONFIG PORTAL OPEN ----");
  LOGF("[WiFi] SSID: %s   PASS: %s\n", PORTAL_AP_SSID, PORTAL_AP_PASS);
  LOGLN("[WiFi] connect your phone then open http://192.168.4.1");
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);          // کاهش تأخیر پاسخ HTTP

  /* ---------- ۱) تلاش با اطلاعات config.h ---------- */
  if (strlen(WIFI_SSID) > 0 && strcmp(WIFI_SSID, "YOUR_WIFI_SSID") != 0) {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    LOG("[WiFi] trying config.h credentials");
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) {
      delay(300);
      LOG(".");
    }
    LOGLN("");

    if (WiFi.status() == WL_CONNECTED) {
      LOG("[WiFi] connected. IP: ");
      LOGLN(WiFi.localIP());
      LOGF("[WiFi] RSSI: %d dBm\n", WiFi.RSSI());
      return;
    }
    LOGLN("[WiFi] config.h credentials failed → opening portal");
  }

  /* ---------- ۲) پورتال WiFiManager ---------- */
  wifiManager.setDebugOutput(false);
  wifiManager.setConfigPortalTimeout(PORTAL_TIMEOUT_S);
  wifiManager.setAPCallback(onPortalStart);

  bool ok = wifiManager.autoConnect(PORTAL_AP_SSID, PORTAL_AP_PASS);
  portalActive = false;

  if (!ok) {
    LOGLN("[WiFi] could not connect — restarting in 3s");
    delay(3000);
    ESP.restart();
  }

  LOG("[WiFi] connected. IP: ");
  LOGLN(WiFi.localIP());
  LOGF("[WiFi] RSSI: %d dBm\n", WiFi.RSSI());
}

/* ================================================================== */
/*  ابزار: decode کردن base64url (بدون padding)                        */
/* ================================================================== */
static int b64urlVal(char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '-') return 62;
  if (c == '_') return 63;
  return -1;
}

/** رشته base64url را به بایت‌های اصلی برمی‌گرداند (خروجی String خام) */
static String b64urlDecode(const String &in) {
  String out;
  out.reserve(in.length());
  uint32_t buf = 0;
  int bits = 0;
  for (size_t i = 0; i < in.length(); i++) {
    int v = b64urlVal(in.charAt(i));
    if (v < 0) continue;
    buf = (buf << 6) | (uint32_t)v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += (char)((buf >> bits) & 0xFF);
    }
  }
  return out;
}

/** فرار دادن کاراکترهای خاص JSON */
static String jsonEsc(const String &s) {
  String o;
  o.reserve(s.length() + 8);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s.charAt(i);
    switch (c) {
      case '"':  o += "\\\""; break;
      case '\\': o += "\\\\"; break;
      case '\n': o += "\\n";  break;
      case '\r': o += "\\r";  break;
      case '\t': o += "\\t";  break;
      default:
        if ((uint8_t)c < 0x20) {
          char b[8];
          snprintf(b, sizeof(b), "\\u%04x", (unsigned)(uint8_t)c);
          o += b;
        } else {
          o += c;
        }
    }
  }
  return o;
}

/* ================================================================== */
/*  ثبت یک اسکن در تاریخچه                                             */
/* ================================================================== */
void recordScan(const String &payload, const ScanResult &res, uint16_t latency) {
  ScanRecord &r = scanHistory[scanHead];
  r = ScanRecord();               // پاک کردن رکورد قبلی

  r.seq        = ++scanSeqCounter;
  r.uptimeMs   = millis();
  r.payload    = payload;
  r.payloadLen = payload.length();

  /* ---------- تفکیک بدنه و امضا ----------
     سه قالب ممکن است به دستگاه برسد:
     ۱) v-tid12-sig20          ← قالب فعلی (فوق فشرده، آلفانومریک)
     ۲) base64url(v|tid|n|exp).sig   ← قالب میانی
     ۳) base64url({"v":1,...}).sig   ← قالب اولیه
     -------------------------------------------------- */
  r.v = 0; r.iat = 0; r.exp = 0;

  int dot = payload.indexOf('.');

  if (dot < 0 && payload.indexOf('-') > 0) {
    /* ---------- قالب ۱: v-tid12-sig ---------- */
    r.hasDot   = false;
    r.bodyJson = payload;                       // خودِ رشته را نشان می‌دهیم

    int d1 = payload.indexOf('-');
    int d2 = payload.indexOf('-', d1 + 1);
    if (d1 > 0 && d2 > 0) {
      r.v      = payload.substring(0, d1).toInt();
      r.tid    = payload.substring(d1 + 1, d2);
      r.sigLen = payload.length() - d2 - 1;
    }
  } else if (dot > 0) {
    /* ---------- قالب‌های ۲ و ۳: base64url + نقطه ---------- */
    r.hasDot = true;
    r.sigLen = payload.length() - dot - 1;
    r.bodyJson = b64urlDecode(payload.substring(0, dot));

#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument d;
#else
    DynamicJsonDocument d(1024);
#endif

    if (r.bodyJson.startsWith("{")) {
      /* قالب ۳: JSON کامل */
      if (!deserializeJson(d, r.bodyJson)) {
        r.v     = d["v"]     | 0;
        r.tid   = String((const char *)(d["tid"]   | ""));
        r.eid   = String((const char *)(d["eid"]   | ""));
        r.sn    = String((const char *)(d["sn"]    | ""));
        r.nonce = String((const char *)(d["nonce"] | ""));
        r.iat   = (uint32_t)(d["iat"] | 0);
        r.exp   = (uint32_t)(d["exp"] | 0);
      }
    } else {
      /* قالب ۲: v|tid|nonce|exp */
      int p1 = r.bodyJson.indexOf('|');
      int p2 = (p1 >= 0) ? r.bodyJson.indexOf('|', p1 + 1) : -1;
      int p3 = (p2 >= 0) ? r.bodyJson.indexOf('|', p2 + 1) : -1;

      if (p1 > 0 && p2 > 0 && p3 > 0) {
        r.v     = r.bodyJson.substring(0, p1).toInt();
        r.tid   = r.bodyJson.substring(p1 + 1, p2);
        r.nonce = r.bodyJson.substring(p2 + 1, p3);
        r.exp   = (uint32_t)r.bodyJson.substring(p3 + 1).toInt();
      }
    }
  } else {
    /* ---------- ناشناخته ---------- */
    r.hasDot   = false;
    r.bodyJson = payload;
  }

  /* ---------- نتیجه سرور ---------- */
  r.httpStatus = lastHttpStatus;
  r.serverOk   = res.ok && res.action == "open_gate";
  r.action     = res.action;
  r.reason     = res.reason;
  r.messageFa  = res.message;
  r.serial     = res.serial;
  r.remaining  = res.remaining;
  r.latencyMs  = latency;
  r.rawJson    = lastRawJson;

  uint32_t up = millis() / 1000;
  char tb[16];
  snprintf(tb, sizeof(tb), "T+%lus", (unsigned long)up);
  r.timeStr = tb;

  scanHead = (scanHead + 1) % SCAN_HISTORY_MAX;
  if (scanCount < SCAN_HISTORY_MAX) scanCount++;
  scanTotal++;
}

/* ================================================================== */
/*  API: /api/status                                                   */
/* ================================================================== */
void handleApiStatus() {
  String j;
  j.reserve(420);
  j += "{";
  j += "\"device_id\":\"" + jsonEsc(DEVICE_ID) + "\",";
  j += "\"uptime_ms\":" + String(millis()) + ",";
  j += "\"camera_ready\":" + String(cameraReady ? "true" : "false") + ",";
  j += "\"sensor\":\"" + jsonEsc(sensorName) + "\",";
  j += "\"wifi_connected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false") + ",";
  j += "\"ssid\":\"" + jsonEsc(WiFi.SSID()) + "\",";
  j += "\"ip\":\"" + jsonEsc(WiFi.localIP().toString()) + "\",";
  j += "\"rssi\":" + String(WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0) + ",";
  j += "\"mac\":\"" + jsonEsc(WiFi.macAddress()) + "\",";
  j += "\"free_heap\":" + String((uint32_t)ESP.getFreeHeap()) + ",";
  j += "\"free_psram\":" + String((uint32_t)ESP.getFreePsram()) + ",";
  j += "\"scan_total\":" + String(scanTotal) + ",";
  j += "\"frame_w\":" + String(frameW > 0 ? frameW : 320) + ",";
  j += "\"frame_h\":" + String(frameH > 0 ? frameH : 240) + ",";
  j += "\"frame_ok\":" + String(frameOkCount) + ",";
  j += "\"frame_mean\":" + String((int)frameMean) + ",";
  j += "\"cam_pid\":\"" + String((unsigned)camPid, HEX) + "\",";
  j += "\"cam_ver\":\"" + String((unsigned)camVer, HEX) + "\",";
  j += "\"cam_framesize\":" + String(camFramesize) + ",";
  j += "\"cam_pixformat\":" + String(camPixformat) + ",";
  j += "\"last_ago_ms\":";
  j += (scanTotal > 0) ? String((uint32_t)(millis() - lastScanAt)) : String("null");
  j += "}";

  webServer.send(200, "application/json", j);
}

/* ================================================================== */
/*  API: /api/scans — جدیدترین اول                                     */
/* ================================================================== */
void handleApiScans() {
  String j;
  j.reserve(4096);
  j += "{\"scans\":[";

  for (int i = 0; i < scanCount; i++) {
    int idx = (scanHead - 1 - i + SCAN_HISTORY_MAX * 2) % SCAN_HISTORY_MAX;
    const ScanRecord &r = scanHistory[idx];
    if (i) j += ",";

    j += "{";
    j += "\"seq\":" + String(r.seq) + ",";
    j += "\"payload\":\"" + jsonEsc(r.payload) + "\",";
    j += "\"payload_len\":" + String(r.payloadLen) + ",";
    j += "\"sig_len\":" + String(r.sigLen) + ",";
    j += "\"has_dot\":" + String(r.hasDot ? "true" : "false") + ",";
    j += "\"body_json\":\"" + jsonEsc(r.bodyJson) + "\",";
    j += "\"parsed\":{";
    j += "\"v\":" + String(r.v) + ",";
    j += "\"tid\":\"" + jsonEsc(r.tid) + "\",";
    j += "\"eid\":\"" + jsonEsc(r.eid) + "\",";
    j += "\"sn\":\"" + jsonEsc(r.sn) + "\",";
    j += "\"nonce\":\"" + jsonEsc(r.nonce) + "\",";
    j += "\"iat\":" + String(r.iat) + ",";
    j += "\"exp\":" + String(r.exp);
    j += "},";
    j += "\"http_status\":" + String(r.httpStatus) + ",";
    j += "\"server_ok\":" + String(r.serverOk ? "true" : "false") + ",";
    j += "\"action\":\"" + jsonEsc(r.action) + "\",";
    j += "\"reason\":\"" + jsonEsc(r.reason) + "\",";
    j += "\"message_fa\":\"" + jsonEsc(r.messageFa) + "\",";
    j += "\"serial\":\"" + jsonEsc(r.serial) + "\",";
    j += "\"remaining\":" + String(r.remaining) + ",";
    j += "\"latency_ms\":" + String(r.latencyMs) + ",";
    j += "\"time_str\":\"" + jsonEsc(r.timeStr) + "\",";
    j += "\"raw_json\":\"" + jsonEsc(r.rawJson) + "\"";
    j += "}";
  }

  j += "]}";
  webServer.send(200, "application/json", j);
}

/* ================================================================== */
/*  API: باز کردن پورتال پیکربندی WiFi                                 */
/* ================================================================== */
void handleWifiPortal() {
  webServer.send(200, "application/json", "{\"ok\":true}");
  delay(700);

  ledAmber();
  LOGLN("[WiFi] opening config portal on demand ...");
  wifiManager.setConfigPortalTimeout(PORTAL_TIMEOUT_S);
  wifiManager.setAPCallback(onPortalStart);
  wifiManager.startConfigPortal(PORTAL_AP_SSID, PORTAL_AP_PASS);

  delay(300);
  ESP.restart();
}

/* ================================================================== */
/*  API: پاک کردن تنظیمات WiFi                                         */
/* ================================================================== */
void handleWifiReset() {
  wifiManager.resetSettings();
  webServer.send(200, "application/json", "{\"ok\":true}");
  delay(700);
  LOGLN("[WiFi] settings cleared — restarting");
  ESP.restart();
}

/* ================================================================== */
/*  راه‌اندازی وب‌سرور                                                  */
/* ================================================================== */
void setupWebServer() {
  webServer.on("/", []() {
    webServer.send_P(200, "text/html; charset=utf-8", PAGE_INDEX);
  });

  webServer.on("/api/status", handleApiStatus);
  webServer.on("/api/scans",  handleApiScans);
  webServer.on("/frame.raw",  handleFrameRaw);
  webServer.on("/api/wifi/portal", handleWifiPortal);
  webServer.on("/api/wifi/reset",  handleWifiReset);

  webServer.onNotFound([]() {
    if (webServer.uri() == "/favicon.ico") {
      webServer.send(204, "text/plain", "");
      return;
    }
    webServer.send(404, "application/json", "{\"error\":\"not found\"}");
  });

  webServer.begin();

  String msg = "[WEB] panel ready → http://";
  msg += WiFi.localIP().toString();
  msg += "/";
  LOGLN(msg);
}

/* ================================================================== */
/*  /frame.raw — یک فریم خام GRAYSCALE برای نمایش زنده در مرورگر       */
/* ================================================================== */
void handleFrameRaw() {
  if (!cameraReady) {
    webServer.send(503, "text/plain", "camera not ready");
    return;
  }

  /* اگر همین حالا یک درخواست اسکن در جریان است، سوکت جدید باز نکن؛
     همان آخرین فریمِ کش‌شده را بفرست. این کار هم پنل را روان نگه
     می‌دارد و هم سوکت‌های TCP را برای handshake های TLS آزاد می‌گذارد. */
  if (httpBusy) {
    if (frameBuf != nullptr && frameW > 0 && frameH > 0) {
      webServer.send_P(200, "application/octet-stream",
                       (const char *)frameBuf,
                       (size_t)frameW * (size_t)frameH);
    } else {
      webServer.send(503, "text/plain", "busy");
    }
    return;
  }

  /* با fb_count=2 همیشه یک بافر آزاد برای استریم هست، ولی برای اطمینان
     چند بار تلاش می‌کنیم (تسک QR ممکن است لحظه‌ای هر دو بافر را بگیرد). */
  camera_fb_t *fb = nullptr;
  for (int i = 0; i < 8 && fb == nullptr; i++) {
    fb = esp_camera_fb_get();
    if (fb == nullptr) delay(25);
  }

  if (fb == nullptr) {
    LOGLN("[FRAME] no framebuffer available");
    webServer.send(503, "text/plain", "no frame");
    return;
  }

  /* اگر درایور سنسور به هر دلیلی YUV422 برگرداند، پلن Y همان روشنایی است
     (در YUYV بایتِ 2*pix همیشه Y است). این‌طوری تصویر زنده در هر حالتی
     نمایش داده می‌شود، نه صفحه سیاه. */
  int bpp = 0;
  if (fb->format == PIXFORMAT_GRAYSCALE)      bpp = 1;
  else if (fb->format == PIXFORMAT_YUV422)    bpp = 2;

  if (bpp == 0) {
    LOGF("[FRAME] unsupported pixformat=%d\n", (int)fb->format);
    esp_camera_fb_return(fb);
    webServer.send(409, "text/plain", "unexpected pixel format");
    return;
  }

  const int sw = (int)fb->width;
  const int sh = (int)fb->height;

  /* اگر فریم از QVGA بزرگ‌تر بود نصف می‌کنیم تا حجم انتقال کم شود؛
     برای QVGA (320×240) همان اندازه اصلی ارسال می‌شود. */
  const int factor = (sw > 320 || sh > 240) ? 2 : 1;
  const int ow = sw / factor;
  const int oh = sh / factor;

  if (ow < 1 || oh < 1) {
    esp_camera_fb_return(fb);
    webServer.send(500, "text/plain", "bad frame size");
    return;
  }

  const size_t need = (size_t)ow * (size_t)oh;

  /* تخصیص یک‌باره بافر خروجی در PSRAM */
  if (frameBuf == nullptr || need > (size_t)frameW * (size_t)frameH) {
    if (frameBuf != nullptr) free(frameBuf);
    frameBuf = (uint8_t *)ps_malloc(need);
    if (frameBuf == nullptr) {
      esp_camera_fb_return(fb);
      webServer.send(500, "text/plain", "psram alloc failed");
      return;
    }
  }

  /* برداشتن هر پیکسل و سطر دوم — سبک و سریع */
  uint32_t sum = 0;
  const size_t srcStride = (size_t)sw * (size_t)bpp;

  for (int y = 0; y < oh; y++) {
    const uint8_t *src = fb->buf + (size_t)(y * factor) * srcStride;
    uint8_t       *dst = frameBuf + (size_t)y * (size_t)ow;
    for (int x = 0; x < ow; x++) {
      uint8_t v = src[(size_t)(x * factor) * (size_t)bpp];
      dst[x] = v;
      sum += v;
    }
  }
  frameMean = (uint8_t)(sum / need);   // ۰ = سیاه، ۲۵۵ = سفید

  esp_camera_fb_return(fb);    // بافر دوربین فوراً آزاد می‌شود

  frameW = ow;
  frameH = oh;
  frameOkCount++;

  webServer.send_P(200, "application/octet-stream", (const char *)frameBuf, need);
}

/* ================================================================== */
/*  تست شبکه — جدا کردن مشکل DNS از مشکل TLS                           */
/*  اگر POST با -1 شکست بخورد، این تست می‌گوید کجا گیر کرده است.        */
/* ================================================================== */
void checkNetwork() {
  if (WiFi.status() != WL_CONNECTED) {
    LOGLN("[NET] wifi not connected — test skipped");
    return;
  }

  IPAddress ip;
  if (WiFi.hostByName("script.google.com", ip)) {
    String m = "[NET] DNS script.google.com = ";
    m += ip.toString();
    LOGLN(m);
  } else {
    LOGLN("[NET] DNS FAILED — cannot resolve script.google.com");
  }

  WiFiClient probe;
  if (probe.connect("script.google.com", 443, 6000)) {
    LOGLN("[NET] TCP 443 OK");
    probe.stop();
  } else {
    LOGLN("[NET] TCP 443 FAILED — firewall / internet / DNS");
  }

  /* همگام‌سازی ساعت — بعضی سرورها بدون زمان درست handshake را رد می‌کنند */
  LOGLN("[NET] syncing time (NTP) ...");
  configTime(3 * 3600, 0, "pool.ntp.org", "time.google.com");
  time_t nowEpoch = time(nullptr);
  int tries = 0;
  while (nowEpoch < 1700000000L && tries++ < 24) {
    delay(250);
    nowEpoch = time(nullptr);
  }
  LOGF("[NET] epoch = %ld  (%s)\n", (long)nowEpoch,
       nowEpoch > 1700000000L ? "time OK" : "time NOT synced");

  /* تست TLS در بوت — با حافظه تازه، پیش از هرگونه فعالیت دوربین/وب */
  {
    WiFiClientSecure tls;
    tls.setInsecure();
    tls.setHandshakeTimeout(10);

    bool tlsOk = tls.connect("script.google.com", 443, 10000);
    char ebuf[96];
    memset(ebuf, 0, sizeof(ebuf));
    int ecode = tls.lastError(ebuf, sizeof(ebuf));

    LOGF("[NET] TLS boot test = %s  err=%d (%s)\n",
         tlsOk ? "OK" : "FAILED", ecode, ebuf);

    if (tlsOk) tls.stop();
  }
}

/* ================================================================== */
/*  ارسال POST و دنبال کردن دستی ریدایرکت Apps Script                  */
/*                                                                     */
/*  مشکل: Apps Script همیشه 302 به script.googleusercontent.com می‌دهد.*/
/*  حالت HTTPC_STRICT_FOLLOW_REDIRECTS همان POST را دوباره به آدرس      */
/*  ریدایرکت می‌فرستد و گوگل پاسخ HTML «400 Bad Request» می‌دهد.        */
/*  راه درست: Location را خودمان بخوانیم و مرحله دوم را با GET بزنیم.  */
/* ================================================================== */
static String httpPostFollowRedirectsOnce(const String &url, const String &body, int &outCode) {
  outCode = 0;

  /* ---------------- مرحله ۱: POST بدون ریدایرکت ---------------- */
  {
    WiFiClientSecure client;
    client.setInsecure();               // دمو؛ در تولید گواهی ریشه بگذارید
    client.setHandshakeTimeout(8);      // ثانیه — پیش‌فرض ۱۲۰ برای این کار زیاد است

    HTTPClient http;
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.setReuse(false);
    http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);

    const char *keys[] = {"Location"};
    http.collectHeaders(keys, 1);

    if (!http.begin(client, url)) {
      LOGLN("[HTTP] begin() failed");
      outCode = -1;
      return "";
    }

    http.addHeader("Content-Type", "text/plain;charset=utf-8");

    int code = http.POST(body);
    outCode = code;
    LOGF("[HTTP] POST -> %d\n", code);

    if (code == 200) {
      String r = http.getString();
      http.end();
      return r;
    }

    String location = http.header("Location");
    http.end();

    if (!(code == 301 || code == 302 || code == 303 || code == 307 || code == 308)) {
      return "";
    }
    if (location.length() == 0) {
      LOGLN("[HTTP] redirect without Location header");
      return "";
    }

    /* اگر Location نسبی بود، میزبان را از آدرس اصلی برمی‌داریم */
    if (location.startsWith("/")) {
      int hostStart = url.indexOf("://");
      int pathStart = url.indexOf('/', hostStart + 3);
      String origin = (pathStart > 0) ? url.substring(0, pathStart) : url;
      location = origin + location;
    }

    LOG("[HTTP] GET  -> ");
    LOGLN(location);

    /* ---------------- مرحله ۲: GET روی Location ---------------- */
    WiFiClientSecure client2;
    client2.setInsecure();
    client2.setHandshakeTimeout(8);

    HTTPClient http2;
    http2.setTimeout(HTTP_TIMEOUT_MS);
    http2.setReuse(false);
    http2.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);

    if (!http2.begin(client2, location)) {
      LOGLN("[HTTP] follow-up begin() failed");
      outCode = -1;
      return "";
    }

    int code2 = http2.GET();
    outCode = code2;
    LOGF("[HTTP] GET  -> %d\n", code2);

    String r;
    if (code2 == 200) r = http2.getString();
    http2.end();
    return r;
  }
}

/* ================================================================== */
/*  تلاش مجدد خودکار                                                   */
/*                                                                     */
/*  اولین اتصال TLS بعد از یک دوره بی‌کاری، یا وقتی چند سوکت همزمان باز */
/*  است (پنل وب + استریم تصویر)، ممکن است با -1 شکست بخورد. یک یا دو   */
/*  تلاش دوباره معمولاً مشکل را حل می‌کند.                              */
/* ================================================================== */
static String httpPostFollowRedirects(const String &url, const String &body, int &outCode) {
  const int MAX_ATTEMPTS = 3;

  for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    outCode = 0;
    LOGF("[HTTP] attempt %d/%d  (free heap=%u)\n",
         attempt, MAX_ATTEMPTS, (unsigned)ESP.getFreeHeap());

    /* --------------------------------------------------------------
       تست‌های عمیق — فقط اگر HTTP_DEBUG_PROBES=1 باشد.
       در حالت عادی خاموش‌اند تا هر اسکن فقط یک اتصال TLS بسازد.
       -------------------------------------------------------------- */
#if HTTP_DEBUG_PROBES
    if (attempt == 1) {
      WiFiClient probe;
      bool tcpOk = probe.connect("script.google.com", 443, 4000);
      LOGF("[HTTP] tcp probe = %s\n", tcpOk ? "OK" : "FAILED");
      if (tcpOk) probe.stop();
      delay(60);

      /* TLS به گوگل + کد خطای دقیق mbedTLS */
      {
        WiFiClientSecure tls;
        tls.setInsecure();
        tls.setHandshakeTimeout(8);

        bool tlsOk = tls.connect("script.google.com", 443, 9000);
        char ebuf[96];
        memset(ebuf, 0, sizeof(ebuf));
        int ecode = tls.lastError(ebuf, sizeof(ebuf));

        LOGF("[HTTP] tls(google) = %s  err=%d (%s)  maxAlloc=%u\n",
             tlsOk ? "OK" : "FAILED", ecode, ebuf,
             (unsigned)ESP.getMaxAllocHeap());

        if (tlsOk) tls.stop();
        delay(60);
      }

      /* TLS به یک میزبان دیگر — برای جدا کردن «مشکل دستگاه» از «مشکل شبکه/DPI» */
      {
        WiFiClientSecure tls2;
        tls2.setInsecure();
        tls2.setHandshakeTimeout(8);

        bool ok2 = tls2.connect("example.com", 443, 9000);
        char ebuf2[96];
        memset(ebuf2, 0, sizeof(ebuf2));
        int e2 = tls2.lastError(ebuf2, sizeof(ebuf2));

        LOGF("[HTTP] tls(example.com) = %s  err=%d (%s)\n",
             ok2 ? "OK" : "FAILED", e2, ebuf2);

        if (ok2) tls2.stop();
        delay(60);
      }
    }
#endif  // HTTP_DEBUG_PROBES

    String r = httpPostFollowRedirectsOnce(url, body, outCode);

    if (outCode > 0) return r;          // پاسخ گرفته شد (۲۰۰ یا هر کد دیگری)

    LOGF("[HTTP] attempt %d failed (code=%d)\n", attempt, outCode);

    /* تشخیص سریع: اگر TCP هم شکست بخورد یعنی سوکت/شبکه؛ اگر TCP سالم
       بود ولی POST مرده، مشکل TLS است. */
    {
      WiFiClient diag;
      bool tcpOk = diag.connect("script.google.com", 443, 3000);
      LOGF("[HTTP] diag: tcp=%s wifi=%d rssi=%d heap=%u maxAlloc=%u\n",
           tcpOk ? "OK" : "FAIL",
           (int)WiFi.status(), WiFi.RSSI(),
           (unsigned)ESP.getFreeHeap(),
           (unsigned)ESP.getMaxAllocHeap());
      if (tcpOk) diag.stop();
    }

    if (WiFi.status() != WL_CONNECTED) {
      LOGLN("[HTTP] wifi lost — reconnecting");
      WiFi.reconnect();
      unsigned long t0 = millis();
      while (WiFi.status() != WL_CONNECTED && millis() - t0 < 4000) {
        webServer.handleClient();
        delay(100);
      }
    }

    delay(300);
  }

  return "";
}

/* ================================================================== */
/*  ارسال کد QR به Apps Script و پارس پاسخ                             */
/* ================================================================== */
bool sendScanToServer(const String &qrPayload, ScanResult &out) {
  out.ok        = false;
  out.reason    = "";
  out.action    = "";
  out.message   = "";
  out.serial    = "";
  out.remaining = 0;

  lastHttpStatus = 0;
  lastRawJson    = "";

  // اطمینان از اتصال شبکه (بدون باز کردن پورتال، تا اسکن معطل نماند)
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    unsigned long t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 5000) {
      webServer.handleClient();
      delay(50);
    }
    if (WiFi.status() != WL_CONNECTED) {
      out.reason = "wifi_down";
      return false;
    }
  }

  /* ---------- ۱) ساخت بدنه JSON درخواست ---------- */
#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument reqDoc;
#else
  DynamicJsonDocument reqDoc(1024);
#endif

  reqDoc["action"]     = "scan.validate";
  reqDoc["device_id"]  = DEVICE_ID;
  reqDoc["device_key"] = DEVICE_KEY;
  reqDoc["payload"]    = qrPayload;

  String body;
  serializeJson(reqDoc, body);

  /* ---------- ۲) ارسال POST و دنبال کردن دستی ریدایرکت ---------- */
  int httpCode = 0;
  String response = httpPostFollowRedirects(GAS_URL, body, httpCode);

  // ذخیره برای نمایش در پنل وب
  lastHttpStatus = httpCode;
  lastRawJson    = response;

  LOGF("[HTTP] status=%d, bytes=%u\n", httpCode, (unsigned int)response.length());

  if (httpCode <= 0) {
    out.reason = "no_connection";
    return false;
  }

  if (response.length() == 0) {
    out.reason = "empty_response";
    return false;
  }

  /* اگر گوگل صفحه HTML برگرداند (۴۰۰/۴۰۴/۵۰۰) پیام گویا بده */
  if (response.charAt(0) == '<') {
    LOGLN("[HTTP] server returned an HTML page instead of JSON");
    out.reason = String("http_html_") + httpCode;
    return false;
  }

  /* ---------- ۳) پارس پاسخ JSON ---------- */
#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  DynamicJsonDocument doc(4096);
#endif

  DeserializationError err = deserializeJson(doc, response);
  if (err) {
    LOGF("[JSON] parse error: %s\n", err.c_str());
    out.reason = String("json_") + err.c_str();
    return false;
  }

  int apiStatus = doc["status"] | httpCode;
  JsonObject data = doc["data"];

  if (data.isNull()) {
    out.reason = "no_data";
    return false;
  }

  // خطای سطح API (۴۰۰/۴۰۱/…): پیام در data.error است
  if (apiStatus >= 400) {
    out.reason  = String("api_") + apiStatus;
    out.message = data["error"] | "";
    LOGF("[API] error %d: %s\n", apiStatus, out.message.c_str());
    return false;
  }

  out.ok      = data["ok"] | false;
  out.reason  = data["reason"] | "";
  out.action  = data["action"] | "";
  out.message = data["message_fa"] | "";

  JsonObject ticket = data["ticket"];
  if (!ticket.isNull()) {
    out.serial    = ticket["serial"] | "";
    out.remaining = ticket["remaining"] | 0;
  }

  return true;
}

/* ================================================================== */
/*  ورود مجاز: رله + LED سبز + بوق موفق                                */
/* ================================================================== */
void grantAccess(const ScanResult &res) {
  LOGLN("[GATE] ACCESS GRANTED");

  if (res.serial.length() > 0) {
    LOG("[GATE] serial=");
    LOG(res.serial);
    LOGF(" remaining=%d\n", res.remaining);
  }

  relayPulseStart();                  // رله روشن؛ بسته‌شدن خودکار
  ledGreen();                         // سبز = ورود مجاز
  beep(1, BEEP_SUCCESS_MS);

  /* هیچ delay ای اینجا نیست — حلقه بلافاصله آزاد میشود و میتواند
     بلیط بعدی را بخواند. رله در relayService() بسته میشود. */
}

/* ================================================================== */
/*  ورود غیرمجاز: LED قرمز + ۳ بوق خطا (رله هرگز باز نمی‌شود)           */
/* ================================================================== */
void denyAccess(const ScanResult &res) {
  LOGLN("[GATE] ACCESS DENIED");

  ledRed();                           // قرمز = ورود غیرمجاز

  beep(ERROR_BEEP_COUNT, BEEP_ERROR_MS);

  delay(LED_SETTLE_MS);
  ledBlue();                          // بازگشت به حالت آماده
}

/* ================================================================== */
/*  کنترل رله (با در نظر گرفتن Active-LOW / Active-HIGH)               */
/* ================================================================== */
void relayOn() {
#if RELAY_ACTIVE_LOW
  digitalWrite(PIN_RELAY, LOW);
#else
  digitalWrite(PIN_RELAY, HIGH);
#endif
}

void relayOff() {
#if RELAY_ACTIVE_LOW
  digitalWrite(PIN_RELAY, HIGH);
#else
  digitalWrite(PIN_RELAY, LOW);
#endif
}

/* ================================================================== */
/*  بوق زدن: تعداد × مدت                                              */
/* ================================================================== */
void beep(int times, int durationMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(PIN_BUZZER, HIGH);
    delay(durationMs);
    digitalWrite(PIN_BUZZER, LOW);
    if (i < times - 1) delay(120);
  }
}
