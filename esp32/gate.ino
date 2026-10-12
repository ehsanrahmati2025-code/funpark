/*
 * ============================================================
 *  gate.ino — کنترل گیت ورودی فان‌پارک با ESP32
 * ============================================================
 *  جریان کار:
 *    ۱) ماژول اسکنر QR روی UART2 یک رشته می‌فرستد
 *    ۲) ESP32 رشته را به Apps Script ارسال می‌کند (scan.validate)
 *    ۳) در صورت ok=true و action=open_gate، رله گیت باز می‌شود
 *
 *  وابستگی‌ها: فقط کتابخانه‌های پیش‌فرض ESP32 (WiFi, HTTPClient)
 *  برد پیشنهادی: ESP32 DevKit V1 / NodeMCU-32S
 * ============================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

/* ------------------- تنظیمات (اینجا را ویرایش کنید) ------------------- */
static const char *WIFI_SSID  = "YOUR_WIFI_SSID";
static const char *WIFI_PASS  = "YOUR_WIFI_PASSWORD";
static const char *API_URL    = "https://script.google.com/macros/s/PASTE_DEPLOYMENT_ID_HERE/exec";
static const char *DEVICE_ID  = "gate-01";
static const char *DEVICE_KEY = "test-key-123";

/* ------------------- پین‌ها ------------------- */
#define RELAY_PIN      26   // رله قفل برقی گیت
#define LED_GREEN      2    // LED ورود مجاز
#define LED_RED        4    // LED ورود غیرمجاز
#define BUZZER_PIN     27   // بازر
#define SCANNER_RX     16   // TX اسکنر  -> RX2
#define SCANNER_TX     17   // RX اسکنر  <- TX2

/* رله ماژول‌های ارزان معمولاً Active-LOW هستند */
#define RELAY_ACTIVE_LOW 1
#define GATE_OPEN_MS     3000   // مدت باز بودن گیت (میلی‌ثانیه)
#define WIFI_TIMEOUT_MS  20000
#define HTTP_TIMEOUT_MS  15000

HardwareSerial qrScanner(2);

/* ------------------- وضعیت ------------------- */
String qrBuffer = "";
unsigned long lastScanMs = 0;
const unsigned long SCAN_COOLDOWN_MS = 1500;   // جلوگیری از اسکن تکراری

/* ==================================================================== */
/*  setup                                                               */
/* ==================================================================== */
void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  closeGate();
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED, LOW);

  // اسکنر QR معمولاً با 9600 baud کار می‌کند
  qrScanner.begin(9600, SERIAL_8N1, SCANNER_RX, SCANNER_TX);

  Serial.println();
  Serial.println("[FunPark] Gate Controller v1.0");
  Serial.print("[FunPark] Device: ");
  Serial.println(DEVICE_ID);

  connectWiFi();
}

/* ==================================================================== */
/*  loop                                                                */
/* ==================================================================== */
void loop() {
  // ۱) خواندن خط از اسکنر سخت‌افزاری
  while (qrScanner.available()) {
    char c = (char)qrScanner.read();
    if (c == '\n' || c == '\r') {
      if (qrBuffer.length() > 0) {
        handleQr(qrBuffer);
        qrBuffer = "";
      }
    } else {
      qrBuffer += c;
      if (qrBuffer.length() > 512) qrBuffer = "";   // محافظت از حافظه
    }
  }

  // ۲) امکان تست دستی از Serial Monitor (برای دیباگ)
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (qrBuffer.length() > 0) {
        handleQr(qrBuffer);
        qrBuffer = "";
      }
    } else {
      qrBuffer += c;
      if (qrBuffer.length() > 512) qrBuffer = "";
    }
  }

  // ۳) اطمینان از اتصال WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] قطع شد، تلاش برای اتصال مجدد...");
    connectWiFi();
  }

  delay(10);
}

/* ==================================================================== */
/*  اتصال WiFi                                                          */
/* ==================================================================== */
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();
  Serial.print("[WiFi] Connecting");
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] Connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WiFi] Connection failed (will retry in loop)");
  }
}

/* ==================================================================== */
/*  پردازش یک کد QR اسکن‌شده                                            */
/* ==================================================================== */
void handleQr(const String &qr) {
  unsigned long now = millis();
  if (now - lastScanMs < SCAN_COOLDOWN_MS) return;   // ضد اسکن تکراری
  lastScanMs = now;

  Serial.println();
  Serial.print("[QR] payload length: ");
  Serial.println(qr.length());

  String response = postToAppsScript(qr);
  if (response.length() == 0) {
    Serial.println("[API] No response — DENY");
    denyBeep(3);
    return;
  }

  bool granted = response.indexOf("\"ok\":true") >= 0;
  bool openGate = response.indexOf("\"action\":\"open_gate\"") >= 0;
  String messageFa = extractJsonString(response, "message_fa");
  String reason = extractJsonString(response, "reason");

  Serial.print("[API] reason: ");
  Serial.println(reason);
  Serial.print("[API] message: ");
  Serial.println(messageFa);

  if (granted && openGate) {
    grantAccess();
  } else {
    denyBeep(2);
  }
}

/* ==================================================================== */
/*  ارسال درخواست به Apps Script                                        */
/*  نکته: Apps Script با 302 به googleusercontent ریدایرکت می‌کند؛       */
/*  چون HTTPClient در ریدایرکت POST را به GET تبدیل می‌کند، خودمان       */
/*  هدر Location را می‌خوانیم و مرحله دوم را GET می‌زنیم.                 */
/* ==================================================================== */
String postToAppsScript(const String &qr) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) return "";
  }

  String body = "{\"action\":\"scan.validate\",\"device_id\":\"" + String(DEVICE_ID) +
                "\",\"device_key\":\"" + String(DEVICE_KEY) +
                "\",\"payload\":\"" + jsonEscape(qr) + "\"}";

  WiFiClientSecure client;
  client.setInsecure();          // برای دمو؛ در تولید از root CA استفاده کنید

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);

  const char *headerKeys[] = {"Location"};
  http.collectHeaders(headerKeys, 1);

  if (!http.begin(client, API_URL)) {
    Serial.println("[HTTP] begin failed");
    return "";
  }

  http.addHeader("Content-Type", "text/plain;charset=utf-8");
  int code = http.POST(body);

  Serial.print("[HTTP] POST status: ");
  Serial.println(code);

  String result = "";

  if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
    String location = http.header("Location");
    http.end();

    if (location.length() == 0) {
      Serial.println("[HTTP] redirect without Location header");
      return "";
    }

    // مرحله دوم: دریافت بدنه واقعی پاسخ از آدرس ریدایرکت
    WiFiClientSecure client2;
    client2.setInsecure();
    HTTPClient http2;
    http2.setTimeout(HTTP_TIMEOUT_MS);
    if (!http2.begin(client2, location)) {
      Serial.println("[HTTP] follow-up begin failed");
      return "";
    }
    int code2 = http2.GET();
    Serial.print("[HTTP] GET status: ");
    Serial.println(code2);
    if (code2 == 200) result = http2.getString();
    http2.end();

  } else if (code == 200) {
    result = http.getString();
    http.end();
  } else {
    http.end();
  }

  return result;
}

/* ==================================================================== */
/*  فرمان‌های سخت‌افزاری                                                 */
/* ==================================================================== */

/** باز کردن گیت و نمایش موفقیت */
void grantAccess() {
  Serial.println("[GATE] OPEN — access granted");
  digitalWrite(LED_RED, LOW);
  digitalWrite(LED_GREEN, HIGH);
  beep(1, 120);

  openGate();
  delay(GATE_OPEN_MS);
  closeGate();

  digitalWrite(LED_GREEN, LOW);
}

/** اعلام ورود غیرمجاز */
void denyBeep(int times) {
  Serial.println("[GATE] DENY — access denied");
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED, HIGH);
  beep(times, 250);
  delay(400);
  digitalWrite(LED_RED, LOW);
}

/** فعال کردن رله (باز شدن گیت) */
void openGate() {
#if RELAY_ACTIVE_LOW
  digitalWrite(RELAY_PIN, LOW);
#else
  digitalWrite(RELAY_PIN, HIGH);
#endif
}

/** غیرفعال کردن رله (بسته شدن گیت) */
void closeGate() {
#if RELAY_ACTIVE_LOW
  digitalWrite(RELAY_PIN, HIGH);
#else
  digitalWrite(RELAY_PIN, LOW);
#endif
}

/** بوق زدن با تعداد و مدت مشخص */
void beep(int times, int durationMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(durationMs);
    digitalWrite(BUZZER_PIN, LOW);
    if (i < times - 1) delay(120);
  }
}

/* ==================================================================== */
/*  ابزارهای JSON ساده (بدون کتابخانه خارجی)                            */
/* ==================================================================== */

/** فرار دادن کاراکترهای خاص JSON */
String jsonEscape(const String &in) {
  String out = "";
  for (unsigned int i = 0; i < in.length(); i++) {
    char c = in.charAt(i);
    if (c == '"' || c == '\\') {
      out += '\\';
      out += c;
    } else if (c == '\n') {
      out += "\\n";
    } else if (c == '\r') {
      out += "\\r";
    } else if (c == '\t') {
      out += "\\t";
    } else {
      out += c;
    }
  }
  return out;
}

/** استخراج مقدار یک کلید رشته‌ای از پاسخ JSON */
String extractJsonString(const String &json, const String &key) {
  String needle = "\"" + key + "\":\"";
  int start = json.indexOf(needle);
  if (start < 0) return "";
  start += needle.length();

  String out = "";
  for (int i = start; i < (int)json.length(); i++) {
    char c = json.charAt(i);
    if (c == '\\' && i + 1 < (int)json.length()) {
      // دنباله‌های یونیکد \uXXXX را به UTF-8 تبدیل می‌کنیم
      if (json.charAt(i + 1) == 'u') {
        String hex = json.substring(i + 2, i + 6);
        long code = strtol(hex.c_str(), NULL, 16);
        if (code < 0x80) {
          out += (char)code;
        } else if (code < 0x800) {
          out += (char)(0xC0 | (code >> 6));
          out += (char)(0x80 | (code & 0x3F));
        } else {
          out += (char)(0xE0 | (code >> 12));
          out += (char)(0x80 | ((code >> 6) & 0x3F));
          out += (char)(0x80 | (code & 0x3F));
        }
        i += 5;
        continue;
      }
      out += json.charAt(i + 1);
      i++;
      continue;
    }
    if (c == '"') break;
    out += c;
  }
  return out;
}
