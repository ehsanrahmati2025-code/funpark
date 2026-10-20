/**
 * ============================================================
 *  net_test.ino — تست شبکه خالی، بدون دوربین و بدون وب‌سرور
 * ============================================================
 *
 *  چرا این اسکچ؟
 *    فریمور گیت با خطای -80 (MBEDTLS_ERR_NET_CONN_RESET) روی TLS
 *    گیر می‌کند، ولی «یک ساعت قبل» کار می‌کرد. برای اینکه بفهمیم
 *    مقصر خودِ شبکه است یا انبوه کارهای فریمور (دوربین + وب‌سرور +
 *    استریم)، این اسکچ هیچ‌کدام از آن‌ها را ندارد: فقط WiFi و TLS.
 *
 *  اگر اینجا هم شکست خورد  ⟹ مشکل شبکه/فیلترینگ است، نه کد.
 *  اگر اینجا موفق بود       ⟹ فشار منابع در فریمور گیت مقصر است.
 *
 *  آپلود با همان تنظیمات:
 *    Board            : ESP32S3 Dev Module
 *    PSRAM            : OPI PSRAM
 *    USB CDC On Boot  : Disabled
 * ============================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>

/* همان مقادیر config.h فریمور گیت */
#define WIFI_SSID       "Ehsan3"
#define WIFI_PASSWORD   "abcd1234"
#define GAS_URL         "https://script.google.com/macros/s/AKfycbxzfJzgcw1fZGzGHbrOOT6BnaGMGAbvqQ4uMFFyyPrkWy1d6udSzy8Z865lGJsBkwz4/exec"

static void line(const char *title) {
  Serial.println();
  Serial.println("----------------------------------------------");
  Serial.println(title);
  Serial.println("----------------------------------------------");
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println();
  Serial.println("##############################################");
  Serial.println("#        NETWORK ONLY TEST  (no camera)      #");
  Serial.println("##############################################");
  Serial.printf("  free heap : %u\n", (unsigned)ESP.getFreeHeap());
  Serial.printf("  max alloc : %u\n", (unsigned)ESP.getMaxAllocHeap());

  /* ---------- ۱) WiFi ---------- */
  line("1) WIFI");
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[FAIL] WiFi not connected");
    return;
  }
  Serial.print("[OK] IP = ");
  Serial.println(WiFi.localIP());
  Serial.printf("[OK] RSSI = %d dBm\n", WiFi.RSSI());
  Serial.printf("[OK] gateway = %s\n", WiFi.gatewayIP().toString().c_str());
  Serial.printf("[OK] DNS = %s\n", WiFi.dnsIP().toString().c_str());

  /* ---------- ۲) DNS ---------- */
  line("2) DNS");
  IPAddress ip;
  if (WiFi.hostByName("script.google.com", ip)) {
    Serial.printf("[OK] script.google.com = %s\n", ip.toString().c_str());
  } else {
    Serial.println("[FAIL] DNS");
  }

  /* ---------- ۳) TCP ---------- */
  line("3) TCP 443");
  WiFiClient tcp;
  if (tcp.connect("script.google.com", 443, 6000)) {
    Serial.println("[OK] tcp connect");
    tcp.stop();
  } else {
    Serial.println("[FAIL] tcp connect");
  }

  /* ---------- ۴) NTP ---------- */
  line("4) NTP");
  configTime(3 * 3600, 0, "pool.ntp.org", "time.google.com");
  time_t now = time(nullptr);
  int tries = 0;
  while (now < 1700000000L && tries++ < 24) {
    delay(250);
    now = time(nullptr);
  }
  Serial.printf("[%s] epoch = %ld\n", now > 1700000000L ? "OK" : "FAIL", (long)now);

  /* ---------- ۵) TLS ---------- */
  line("5) TLS HANDSHAKE");
  {
    WiFiClientSecure tls;
    tls.setInsecure();
    bool ok = tls.connect("script.google.com", 443, 10000);

    char ebuf[96];
    memset(ebuf, 0, sizeof(ebuf));
    int ecode = tls.lastError(ebuf, sizeof(ebuf));

    Serial.printf("[%s] tls google   err=%d (%s)\n", ok ? "OK" : "FAIL", ecode, ebuf);
    if (ok) tls.stop();
  }
  {
    WiFiClientSecure tls2;
    tls2.setInsecure();
    bool ok2 = tls2.connect("example.com", 443, 10000);

    char ebuf2[96];
    memset(ebuf2, 0, sizeof(ebuf2));
    int e2 = tls2.lastError(ebuf2, sizeof(ebuf2));

    Serial.printf("[%s] tls example  err=%d (%s)\n", ok2 ? "OK" : "FAIL", e2, ebuf2);
    if (ok2) tls2.stop();
  }

  /* ---------- ۶) درخواست واقعی به Apps Script ---------- */
  line("6) HTTPS GET  GAS");
  {
    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;
    http.setTimeout(15000);
    http.setReuse(false);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

    String url = String(GAS_URL) + "?action=events.list";

    if (!http.begin(client, url)) {
      Serial.println("[FAIL] http.begin");
    } else {
      int code = http.GET();
      Serial.printf("[%s] GET -> %d\n", code > 0 ? "OK" : "FAIL", code);

      if (code > 0) {
        String body = http.getString();
        Serial.printf("       bytes = %u\n", (unsigned)body.length());
        Serial.println("       " + body.substring(0, 180));
      }
      http.end();
    }
  }

  line("TEST FINISHED");
  Serial.printf("  free heap : %u\n", (unsigned)ESP.getFreeHeap());
  Serial.printf("  max alloc : %u\n", (unsigned)ESP.getMaxAllocHeap());
}

void loop() {
  delay(10000);
}
