/**
 * ============================================================
 *  camera_test.ino — مرحله ۲: جست‌وجوی سخت‌افزاری دوربین
 *  برد: FREENOVE ESP32-S3 WROOM
 * ============================================================
 *
 *  نتیجه مرحله قبل:
 *      [I2C] NOTHING FOUND  →  هیچ دستگاهی روی گذرگاه پاسخ نداد
 *
 *  یعنی SCCB هیچ ACK نمی‌دهد. سه علت ممکن باقی می‌ماند:
 *      ۱) فرکانس XCLK (سنسور بدون کلاک صحیح، SCCB را جواب نمی‌دهد)
 *      ۲) جابه‌جایی SDA/SCL
 *      ۳) مشکل فیزیکی: کابل روبان / تغذیه ۳.۳V / ماژول
 *
 *  این اسکچ ۱ و ۲ را قطعی رد یا تأیید می‌کند:
 *      - XCLK را با ۲۴/۲۰/۱۰/۸ مگاهرتز امتحان می‌کند
 *      - گذرگاه را با SDA/SCL عادی و برعکس اسکن می‌کند
 *      - به محض پیدا شدن دستگاه، PID را می‌خواند و می‌ایستد
 *
 *  اگر هر ۶ حالت «NOTHING FOUND» داد، مشکل قطعاً فیزیکی است
 *  و چک‌لیست انتهای همین فایل را دنبال کنید.
 * ============================================================
 */

#include <Arduino.h>
#include <Wire.h>
#include <esp_camera.h>

/* ---------------- پین‌های سیلک‌اسکرین Freenove ---------------- */
#define PIN_XCLK  15
#define PIN_SIOD  4
#define PIN_SIOC  5

#define PIN_Y9    16
#define PIN_Y8    17
#define PIN_Y7    18
#define PIN_Y6    12
#define PIN_Y5    10
#define PIN_Y4    8
#define PIN_Y3    9
#define PIN_Y2    11
#define PIN_VSYNC 6
#define PIN_HREF  7
#define PIN_PCLK  13

/* ================================================================== */
/*  چاپ روی مسیر فعال (UART0 یا USB CDC) — بدون تکرار                  */
/* ================================================================== */
static void out(const char *s) {
#if defined(ARDUINO_USB_CDC_ON_BOOT) && ARDUINO_USB_CDC_ON_BOOT
  Serial.println(s);
  Serial0.println(s);
#else
  Serial0.println(s);      /* UART0 روی GPIO43/44 */
#endif
  ESP_LOGE("DIAG", "%s", s);
  delay(4);
}

static void outf(const char *fmt, ...) {
  char buf[220];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf, sizeof(buf), fmt, ap);
  va_end(ap);
  out(buf);
}

/* ================================================================== */
/*  تولید XCLK با فرکانس مشخص                                         */
/* ================================================================== */
static void startXclk(uint32_t hz) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcDetach(PIN_XCLK);
  ledcAttach(PIN_XCLK, hz, 1);
#else
  ledcDetachPin(PIN_XCLK);
  ledcSetup(0, hz, 1);
  ledcAttachPin(PIN_XCLK, 0);
#endif
}

/* ================================================================== */
/*  خواندن یک بایت — نقشه ۸ بیتی                                      */
/* ================================================================== */
static int rd8(uint8_t addr, uint8_t reg) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return -1;
  if (Wire.requestFrom((int)addr, 1) != 1) return -1;
  return Wire.read();
}

/* ================================================================== */
/*  خواندن یک بایت — نقشه ۱۶ بیتی                                     */
/* ================================================================== */
static int rd16(uint8_t addr, uint16_t reg) {
  Wire.beginTransmission(addr);
  Wire.write((uint8_t)(reg >> 8));
  Wire.write((uint8_t)(reg & 0xFF));
  if (Wire.endTransmission(false) != 0) return -1;
  if (Wire.requestFrom((int)addr, 1) != 1) return -1;
  return Wire.read();
}

/* ================================================================== */
/*  نام سنسور از روی PID                                              */
/* ================================================================== */
static const char *pidName(uint16_t pid) {
  switch (pid) {
    case 0x5640: return "OV5640";
    case 0x3660: return "OV3660";
    case 0x2640: case 0x2641: case 0x2642: case 0x2620: return "OV2640";
    case 0x7670: return "OV7670";
    case 0x7725: return "OV7725";
    case 0x2145: return "GC2145";
    case 0x232A: return "GC032A";
    case 0x009B: return "GC0308";
    case 0x1410: return "NT99141";
    case 0xDA4A: return "SC101IOT";
    case 0x9A46: return "SC030IOT";
    case 0xFFFF: return "NO_ANSWER";
    case 0x0000: return "ALL_ZEROS";
    default:     return "UNKNOWN";
  }
}

/* ================================================================== */
/*  اسکن گذرگاه — خروجی: تعداد دستگاه‌های پیدا‌شده                      */
/* ================================================================== */
static int scanBus() {
  int found = 0;
  for (uint8_t a = 0x08; a < 0x78; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) {
      outf("        ACK at 0x%02X", a);
      found++;
    }
  }
  return found;
}

/* ================================================================== */
/*  خواندن PID  (0xFFFF = بی‌پاسخ)                                     */
/* ================================================================== */
static uint16_t readPid(uint8_t addr, bool use16bit) {
  int h, l;
  if (use16bit) {
    h = rd16(addr, 0x300A);
    l = rd16(addr, 0x300B);
  } else {
    h = rd8(addr, 0x0A);
    l = rd8(addr, 0x0B);
  }
  if (h < 0 || l < 0) return 0xFFFF;
  return ((uint16_t)(h & 0xFF) << 8) | (uint16_t)(l & 0xFF);
}

/* ================================================================== */
/*  setup                                                             */
/* ================================================================== */
void setup() {
  Serial.begin(115200);
  Serial0.begin(115200);
  delay(1200);

  out("==================================================");
  out("  CAMERA SCAN — PHASE 2");
  out("==================================================");
  outf("  PSRAM=%u  heap=%u", (unsigned)ESP.getPsramSize(), (unsigned)ESP.getFreeHeap());
  out("==================================================");

  /* جدول ترکیب‌های آزمایشی: فرکانس XCLK × جهت SDA/SCL */
  struct Trial { uint32_t hz; bool swap; const char *note; };
  const Trial trials[] = {
    {24000000UL, false, "24MHz normal"},
    {20000000UL, false, "20MHz normal"},
    {10000000UL, false, "10MHz normal"},
    { 8000000UL, false, " 8MHz normal"},
    {20000000UL, true,  "20MHz SDA/SCL swapped"},
    {10000000UL, true,  "10MHz SDA/SCL swapped"},
  };

  int totalFound = 0;
  uint32_t goodHz = 0;
  bool goodSwap = false;

  for (uint8_t i = 0; i < sizeof(trials) / sizeof(trials[0]); i++) {
    outf("[TRY] XCLK=%s", trials[i].note);

    startXclk(trials[i].hz);
    delay(120);

    Wire.end();
    delay(10);
    if (trials[i].swap) Wire.begin(PIN_SIOC, PIN_SIOD, 100000UL);   /* عمداً برعکس */
    else                Wire.begin(PIN_SIOD, PIN_SIOC, 100000UL);
    delay(80);

    int found = scanBus();
    if (found > 0) {
      outf("[TRY] >>> %d device(s) found with %s", found, trials[i].note);
      totalFound = found;
      goodHz = trials[i].hz;
      goodSwap = trials[i].swap;
      break;
    }
    out("[TRY] nothing on the bus");
  }

  out("==================================================");

  if (totalFound == 0) {
    out("[RESULT] NO DEVICE ON ANY COMBINATION");
    out("[RESULT] -> the problem is PHYSICAL, not software");
    out("");
    out("CHECKLIST (do these in order):");
    out(" 1) کابل روبان دوربین را در آورده و دوباره محکم جا بزنید.");
    out("    اتصالات مسی باید رو به PCB باشد و کابل کامل تا ته برود.");
    out(" 2) ولتاژ ۳.۳V روی پین تغذیه ماژول دوربین را با مولتی‌متر بگیرید.");
    out(" 3) روی پین GPIO15 (CAM_XCLK) باید حدود ۱.۶ ولت DC ببینید.");
    out("    اگر ۰ است، کلاک تولید نمی‌شود؛ اگر ۳.۳ است، پین اتصال ندارد.");
    out(" 4) ماژول دوربین را روی یک برد دیگر یا با کابل دیگر تست کنید.");
    out(" 5) اگر ماژول و کابل سالم‌اند، برد مشکل دارد.");
  } else {
    outf("[RESULT] bus is alive at %lu Hz, swapped=%d", (unsigned long)goodHz, (int)goodSwap);
    out("[RESULT] reading PID ...");

    const uint8_t addrs[] = {0x3C, 0x30, 0x3D, 0x21};
    uint16_t best = 0xFFFF;
    uint8_t bestAddr = 0;

    for (uint8_t i = 0; i < sizeof(addrs); i++) {
      uint8_t a = addrs[i];
      uint16_t p16 = readPid(a, true);
      uint16_t p8  = readPid(a, false);
      outf("[PID] 0x%02X 16bit=0x%04X %s | 8bit=0x%04X %s",
           a, p16, pidName(p16), p8, pidName(p8));
      if (p16 != 0xFFFF && p16 != 0x0000 && best == 0xFFFF) { best = p16; bestAddr = a; }
      if (p8  != 0xFFFF && p8  != 0x0000 && best == 0xFFFF) { best = p8;  bestAddr = a; }
    }

    if (best == 0xFFFF) {
      out("[RESULT] device ACKs but PID is unreadable -> unknown sensor");
      out("[RESULT] report the ACK addresses above");
    } else {
      outf("[RESULT] sensor PID=0x%04X (%s) at 0x%02X", best, pidName(best), bestAddr);
      if (best == 0x5640) out("[RESULT] OV5640 detected - software path is OK");
    }
  }

  out("================= END =================");
}

void loop() {
  delay(5000);
}
