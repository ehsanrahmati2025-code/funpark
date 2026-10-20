/**
 * ============================================================
 *  webui.h — رابط وب داخلی گیت فان‌پارک (ESP32-S3)
 * ============================================================
 *  کل صفحه در فلش ذخیره می‌شود (PROGMEM) و با send_P سرو می‌شود،
 *  پس هیچ حافظه RAM اضافه‌ای مصرف نمی‌کند.
 *
 *  صفحه از سه بخش API تغذیه می‌شود (در gate.ino پیاده شده):
 *      GET /api/status  → وضعیت دستگاه، WiFi، دوربین، حافظه
 *      GET /api/scans   → آخرین اسکن‌ها + تحلیل QR + پاسخ سرور
 *      GET /api/wifi/portal , /api/wifi/reset
 * ============================================================
 */

#ifndef FUNPARK_WEBUI_H
#define FUNPARK_WEBUI_H

#include <Arduino.h>

const char PAGE_INDEX[] PROGMEM = R"FUNPARK(
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#7c3aed">
<title>فان‌پارک — پنل گیت</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --brand:#7c3aed; --brand-dark:#5b21b6; --brand-soft:#f5f3ff;
  --pink:#ec4899; --cyan:#06b6d4; --amber:#f59e0b;
  --ok:#059669; --ok-soft:#ecfdf5; --err:#e11d48; --err-soft:#fff1f2;
  --ink:#1e293b; --muted:#64748b; --line:#e2e8f0; --bg:#f1f5f9;
}
*{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:'Vazirmatn',Tahoma,system-ui,sans-serif;
  background:
    radial-gradient(1200px 600px at 100% -10%, #ede9fe 0%, transparent 55%),
    radial-gradient(900px 500px at 0% 0%, #cffafe 0%, transparent 45%),
    var(--bg);
  color:var(--ink); min-height:100vh; padding-bottom:40px;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1080px;margin:0 auto;padding:0 16px}

/* ---------- هدر ---------- */
header{
  background:linear-gradient(135deg,var(--brand-dark) 0%,var(--brand) 45%,var(--pink) 100%);
  color:#fff; padding:22px 0 26px; margin-bottom:22px;
  border-radius:0 0 32px 32px;
  box-shadow:0 18px 40px -20px rgba(91,33,182,.65);
  position:relative; overflow:hidden;
}
header::after{
  content:"🎡"; position:absolute; left:-10px; top:-20px;
  font-size:150px; opacity:.10; transform:rotate(-8deg);
}
.hrow{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.logo{display:flex;align-items:center;gap:12px}
.logo .mark{
  width:52px;height:52px;border-radius:18px;display:grid;place-items:center;
  font-size:26px;background:rgba(255,255,255,.16);
  border:1px solid rgba(255,255,255,.28);backdrop-filter:blur(6px);
}
.logo h1{font-size:20px;font-weight:800;letter-spacing:-.2px}
.logo p{font-size:12px;opacity:.82;margin-top:2px}
.pills{display:flex;gap:8px;flex-wrap:wrap}
.pill{
  display:inline-flex;align-items:center;gap:6px;
  background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.26);
  padding:7px 13px;border-radius:999px;font-size:12px;font-weight:600;
  backdrop-filter:blur(6px); white-space:nowrap;
}
.dot{width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 0 3px rgba(52,211,153,.28)}
.dot.off{background:#fb7185;box-shadow:0 0 0 3px rgba(251,113,133,.28)}

/* ---------- کارت‌ها ---------- */
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
.card{
  background:#fff;border:1px solid var(--line);border-radius:22px;padding:16px;
  box-shadow:0 8px 26px -18px rgba(15,23,42,.35);
}
.card .k{font-size:11px;color:var(--muted);font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:5px}
.card .v{font-size:19px;font-weight:800;letter-spacing:-.3px}
.card .s{font-size:11px;color:var(--muted);margin-top:3px}

/* ---------- پنل‌ها ---------- */
.panel{
  background:#fff;border:1px solid var(--line);border-radius:26px;
  box-shadow:0 10px 30px -22px rgba(15,23,42,.45);
  margin-bottom:20px; overflow:hidden;
}
.panel > .head{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:15px 20px;border-bottom:1px solid var(--line);
  background:linear-gradient(180deg,#fbfcff,#fff);
}
.panel > .head h2{font-size:14px;font-weight:800;display:flex;align-items:center;gap:7px}
.panel > .body{padding:20px}

.scan-grid{display:grid;grid-template-columns:320px 1fr;gap:22px;align-items:start}
@media(max-width:820px){.scan-grid{grid-template-columns:1fr}}

.qr-box{
  border:2px dashed var(--line);border-radius:22px;padding:16px;text-align:center;
  background:linear-gradient(180deg,#fff, #fafbff);
}
.qr-box img{width:100%;max-width:280px;border-radius:14px;background:#fff}
.qr-box .sn{
  font-family:ui-monospace,Consolas,monospace;font-size:17px;font-weight:800;
  letter-spacing:3px;margin-top:10px;color:var(--ink);
}
.qr-box .hint{font-size:11px;color:var(--muted);margin-top:4px}
.qr-empty{color:var(--muted);font-size:13px;padding:60px 10px}
#qrFallback{
  display:none;font-family:ui-monospace,Consolas,monospace;font-size:10px;
  word-break:break-all;background:#f8fafc;border:1px solid var(--line);
  border-radius:12px;padding:10px;margin-top:10px;text-align:left;direction:ltr;
  max-height:120px;overflow:auto;
}

/* ---------- پخش زنده ---------- */
.live-wrap{
  position:relative;background:#0b1020;border-radius:20px;overflow:hidden;
  aspect-ratio:4/3;display:grid;place-items:center;border:1px solid var(--line);
}
.live-wrap canvas{width:100%;height:100%;object-fit:contain;display:none;image-rendering:pixelated}
.live-wrap canvas.on{display:block}
.live-off{color:#94a3b8;font-size:12.5px;text-align:center;padding:20px;line-height:2}
.live-dot{
  position:absolute;top:10px;inset-inline-start:10px;display:inline-flex;align-items:center;gap:6px;
  background:rgba(0,0,0,.55);color:#fff;font-size:10.5px;padding:4px 9px;border-radius:999px;
  font-weight:700;
}
.live-dot i{width:7px;height:7px;border-radius:50%;background:#ef4444;display:inline-block;animation:blink 1.1s infinite}
@keyframes blink{50%{opacity:.25}}
@media(min-width:700px){.live-wrap{aspect-ratio:16/9}}

/* ---------- جدول تحلیل ---------- */
.kv{display:grid;grid-template-columns:1fr;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.kv .row{display:grid;grid-template-columns:150px 1fr;background:#fff}
.kv .row > div{padding:10px 14px;font-size:12.5px}
.kv .k{color:var(--muted);font-weight:600;background:#fafbff;border-inline-end:1px solid var(--line)}
.kv .v{font-weight:600;word-break:break-all}
.mono{font-family:ui-monospace,Consolas,monospace;direction:ltr;text-align:left;font-size:11.5px}
@media(max-width:520px){.kv .row{grid-template-columns:1fr}.kv .k{border-inline-end:none;border-bottom:1px solid var(--line)}}

.badge{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:999px;font-size:11px;font-weight:700}
.b-ok{background:var(--ok-soft);color:var(--ok)}
.b-err{background:var(--err-soft);color:var(--err)}
.b-warn{background:#fffbeb;color:#b45309}
.b-idle{background:#f1f5f9;color:var(--muted)}

pre{
  background:#0f172a;color:#e2e8f0;border-radius:16px;padding:14px;
  font-family:ui-monospace,Consolas,monospace;font-size:11.5px;line-height:1.65;
  direction:ltr;text-align:left;overflow:auto;max-height:240px;
}

/* ---------- لیست تاریخچه ---------- */
.hist{display:flex;flex-direction:column;gap:8px}
.hitem{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:12px 14px;border:1px solid var(--line);border-radius:16px;
  cursor:pointer;transition:.15s;background:#fff;
}
.hitem:hover{border-color:#c4b5fd;background:#faf8ff;transform:translateX(-2px)}
.hitem.sel{border-color:var(--brand);background:var(--brand-soft);box-shadow:0 0 0 3px #ede9fe}
.hitem .t{font-size:11px;color:var(--muted);font-family:ui-monospace,monospace;direction:ltr}
.hitem .m{font-size:12.5px;font-weight:700}
.hitem .r{font-size:11px;color:var(--muted);margin-top:2px}

/* ---------- دکمه‌ها ---------- */
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  padding:10px 16px;border-radius:14px;font-size:12.5px;font-weight:700;
  border:1px solid transparent;cursor:pointer;transition:.15s;font-family:inherit;
}
.btn:active{transform:scale(.98)}
.btn-p{background:var(--brand);color:#fff;box-shadow:0 8px 20px -10px rgba(124,58,237,.8)}
.btn-p:hover{background:var(--brand-dark)}
.btn-s{background:#fff;border-color:var(--line);color:var(--ink)}
.btn-s:hover{background:#f8fafc}
.btn-d{background:var(--err-soft);color:var(--err);border-color:#fecdd3}
.btn-d:hover{background:#ffe4e6}
.actions{display:flex;gap:8px;flex-wrap:wrap}

/* ---------- WiFi ---------- */
.wifi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px}
.wifi-cell{background:#fafbff;border:1px solid var(--line);border-radius:16px;padding:13px}
.wifi-cell .k{font-size:11px;color:var(--muted);margin-bottom:4px}
.wifi-cell .v{font-size:13.5px;font-weight:700;word-break:break-all}
.note{
  background:var(--brand-soft);border:1px solid #ddd6fe;color:#5b21b6;
  border-radius:14px;padding:12px 14px;font-size:12px;line-height:1.8;
}
.note b{font-weight:800}

footer{text-align:center;font-size:11px;color:var(--muted);padding:18px 0 4px}
.spin{
  width:14px;height:14px;border:2px solid #ddd6fe;border-top-color:var(--brand);
  border-radius:50%;animation:sp .7s linear infinite;display:inline-block;
}
@keyframes sp{to{transform:rotate(360deg)}}
.toast{
  position:fixed;inset-inline:16px;bottom:18px;margin:auto;max-width:420px;
  background:#0f172a;color:#fff;padding:13px 16px;border-radius:16px;
  font-size:12.5px;line-height:1.7;box-shadow:0 20px 50px -20px #000;
  opacity:0;transform:translateY(14px);pointer-events:none;transition:.25s;z-index:50;
}
.toast.show{opacity:1;transform:translateY(0)}
</style>
</head>
<body>

<header>
  <div class="wrap hrow">
    <div class="logo">
      <div class="mark">🎡</div>
      <div>
        <h1>پنل گیت فان‌پارک</h1>
        <p id="devLine">ESP32-S3 · در حال اتصال…</p>
      </div>
    </div>
    <div class="pills">
      <span class="pill"><span class="dot" id="dConn"></span><span id="pConn">اتصال</span></span>
      <span class="pill">📶 <span id="pRssi">—</span></span>
      <span class="pill">⏱ <span id="pUp">—</span></span>
    </div>
  </div>
</header>

<div class="wrap">

  <!-- کارت‌های وضعیت -->
  <div class="cards">
    <div class="card">
      <div class="k">📷 دوربین</div>
      <div class="v" id="sCam">—</div>
      <div class="s" id="sCamSub">—</div>
    </div>
    <div class="card">
      <div class="k">📶 شبکه</div>
      <div class="v" id="sSsid">—</div>
      <div class="s" id="sIp">—</div>
    </div>
    <div class="card">
      <div class="k">💾 حافظه آزاد</div>
      <div class="v" id="sHeap">—</div>
      <div class="s" id="sPsram">—</div>
    </div>
    <div class="card">
      <div class="k">🎫 کل اسکن‌ها</div>
      <div class="v" id="sTotal">0</div>
      <div class="s" id="sLast">—</div>
    </div>
  </div>

  <!-- پخش زنده -->
  <section class="panel">
    <div class="head">
      <h2>📹 پخش زنده دوربین</h2>
      <span class="badge b-idle" id="liveState">خاموش</span>
    </div>
    <div class="body">
      <div class="live-wrap">
        <canvas id="live" width="320" height="240"></canvas>
        <div class="live-off" id="liveOff">
          تصویر زنده خاموش است.<br>
          با روشن کردن آن، هر چه دوربین می‌بیند را همان لحظه می‌بینید.
        </div>
        <span class="live-dot" id="liveDot" style="display:none"><i></i> LIVE</span>
      </div>

      <div class="actions" style="margin-top:14px">
        <button class="btn btn-p" id="liveBtn" onclick="toggleLive()">▶️ روشن کردن تصویر</button>
        <span class="badge b-idle">۵ فریم بر ثانیه</span>
      </div>

      <div class="note" style="margin-top:12px">
        هنگام پخش زنده، سرعت تشخیص QR کمی کم می‌شود؛ چون دوربین فقط یک بافر فریم دارد
        و اسکنر و استریم روی آن شریک‌اند. برای بیشترین دقت، تصویر را هنگام اسکن خاموش کنید.
      </div>
    </div>
  </section>

  <!-- آخرین اسکن -->
  <section class="panel">
    <div class="head">
      <h2>🔍 آخرین اسکن — تحلیل کامل</h2>
      <span id="lastBadge" class="badge b-idle">بدون داده</span>
    </div>
    <div class="body">
      <div class="scan-grid">
        <div class="qr-box">
          <img id="qrImg" alt="QR" style="display:none">
          <div id="qrNoImg" class="qr-empty">هنوز کدی اسکن نشده است</div>
          <div id="qrFallback"></div>
          <div class="sn" id="qrSn"></div>
          <div class="hint" id="qrHint"></div>
        </div>

        <div>
          <h3 style="font-size:12.5px;color:var(--muted);font-weight:700;margin-bottom:9px">
            ساختار payload (بعد از decode شدن base64url)
          </h3>
          <div class="kv" id="kvBody">
            <div class="row"><div class="k">داده‌ای نیست</div><div class="v">—</div></div>
          </div>

          <h3 style="font-size:12.5px;color:var(--muted);font-weight:700;margin:18px 0 9px">
            پاسخ سرور (Apps Script)
          </h3>
          <div class="kv" id="kvResp">
            <div class="row"><div class="k">داده‌ای نیست</div><div class="v">—</div></div>
          </div>
        </div>
      </div>

      <h3 style="font-size:12.5px;color:var(--muted);font-weight:700;margin:18px 0 9px">
        JSON خام
      </h3>
      <pre id="rawJson">—</pre>
    </div>
  </section>

  <!-- تاریخچه -->
  <section class="panel">
    <div class="head">
      <h2>🕘 تاریخچه اسکن‌ها</h2>
      <span class="badge b-idle" id="histCount">۰ مورد</span>
    </div>
    <div class="body">
      <div class="hist" id="hist">
        <div style="color:var(--muted);font-size:13px;text-align:center;padding:18px">
          هنوز اسکنی ثبت نشده است — یک بلیط را جلوی دوربین بگیرید.
        </div>
      </div>
    </div>
  </section>

  <!-- WiFi -->
  <section class="panel">
    <div class="head">
      <h2>📡 مدیریت WiFi</h2>
      <span class="badge b-idle" id="wifiState">—</span>
    </div>
    <div class="body">
      <div class="wifi-grid">
        <div class="wifi-cell"><div class="k">شبکه فعلی</div><div class="v" id="wSsid">—</div></div>
        <div class="wifi-cell"><div class="k">آدرس IP</div><div class="v mono" id="wIp">—</div></div>
        <div class="wifi-cell"><div class="k">قدرت سیگنال</div><div class="v" id="wRssi">—</div></div>
        <div class="wifi-cell"><div class="k">MAC دستگاه</div><div class="v mono" id="wMac">—</div></div>
      </div>

      <div class="note">
        <b>تغییر شبکه:</b> با زدن دکمه زیر، دستگاه یک شبکه وای‌فای به نام
        <b>FunPark-Gate</b> (رمز <b>funpark1234</b>) باز می‌کند.
        با گوشی به آن وصل شوید؛ صفحه تنظیمات خودکار باز می‌شود و می‌توانید
        نام و رمز وای‌فای جدید را وارد کنید. پس از ذخیره، دستگاه ری‌استارت می‌شود.
      </div>

      <div class="actions" style="margin-top:14px">
        <button class="btn btn-p" onclick="openPortal()">📡 تغییر شبکه وای‌فای</button>
        <button class="btn btn-d" onclick="forgetWifi()">🗑 فراموش کردن شبکه</button>
      </div>
    </div>
  </section>

  <footer>فان‌پارک · کنترلر گیت ESP32-S3 · <span id="fMac"></span></footer>
</div>

<div class="toast" id="toast"></div>

<script>
const $ = (id) => document.getElementById(id);
let scans = [];
let sel = 0;
let liveOn = false;
let liveImgData = null;
let liveErrShown = false;

function faNum(n){ try{ return Number(n).toLocaleString('fa-IR'); }catch(e){ return n; } }
function faDate(unix){
  if(!unix) return '—';
  const d = new Date(unix * 1000);
  if(isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fa-IR',{year:'numeric',month:'long',day:'numeric'}) + ' ' +
         d.toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'});
}
function daysLeft(unix){
  if(!unix) return '—';
  const diff = (unix * 1000) - Date.now();
  const d = Math.floor(diff / 86400000);
  if(d < 0) return 'منقضی شده';
  if(d === 0) return 'امروز آخرین روز';
  return faNum(d) + ' روز مانده';
}
function bytes(n){
  if(n > 1048576) return (n/1048576).toFixed(1) + ' MB';
  if(n > 1024) return Math.round(n/1024) + ' KB';
  return n + ' B';
}
function uptime(ms){
  const s = Math.floor(ms/1000), h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
  return (h? h+'س ' : '') + m + 'د ' + (s%60) + 'ث';
}
function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(window._tt); window._tt = setTimeout(()=>t.classList.remove('show'), 6000);
}
async function getJSON(url){
  const r = await fetch(url, {cache:'no-store'});
  if(!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/* ---------------- وضعیت ---------------- */
function renderStatus(st){
  $('devLine').textContent = 'ESP32-S3 · ' + (st.device_id || 'gate');
  $('dConn').className = 'dot' + (st.wifi_connected ? '' : ' off');
  $('pConn').textContent = st.wifi_connected ? 'آنلاین' : 'آفلاین';
  $('pRssi').textContent = st.rssi ? st.rssi + ' dBm' : '—';
  $('pUp').textContent = uptime(st.uptime_ms || 0);

  $('sCam').textContent = st.camera_ready ? 'آماده' : 'خطا';
  $('sCam').style.color = st.camera_ready ? 'var(--ok)' : 'var(--err)';
  const fsName = {0:'96x96',1:'QQVGA',2:'QCIF',3:'HQVGA',4:'240x240',5:'QVGA',
                  6:'CIF',7:'HVGA',8:'VGA',9:'SVGA',10:'XGA',11:'HD',12:'SXGA'};
  $('sCamSub').textContent =
    (st.sensor || '—') +
    ' · ' + (fsName[st.cam_framesize] || ('fs' + st.cam_framesize)) +
    ' · PID 0x' + (st.cam_pid || '—') +
    (st.frame_mean != null ? ' · روشنایی ' + st.frame_mean : '');

  $('sSsid').textContent = st.ssid || '—';
  $('sIp').textContent = st.ip || '—';

  $('sHeap').textContent = bytes(st.free_heap || 0);
  $('sPsram').textContent = 'PSRAM آزاد: ' + bytes(st.free_psram || 0);

  $('sTotal').textContent = faNum(st.scan_total || 0);

  // ابعاد فریم زنده را از دستگاه بگیر (پیش‌فرض 320×240)
  const fw = st.frame_w || 320, fh = st.frame_h || 240;
  const cv = $('live');
  if(cv.width !== fw || cv.height !== fh){
    cv.width = fw;
    cv.height = fh;
    liveImgData = null;
  }
  $('sLast').textContent = st.last_ago_ms == null ? '—' : (Math.round(st.last_ago_ms/1000) + ' ثانیه پیش');

  $('wSsid').textContent = st.ssid || '—';
  $('wIp').textContent = st.ip || '—';
  $('wRssi').textContent = st.rssi ? st.rssi + ' dBm' : '—';
  $('wMac').textContent = st.mac || '—';
  $('fMac').textContent = st.mac || '';
  $('wifiState').textContent = st.wifi_connected ? 'متصل' : 'قطع';
  $('wifiState').className = 'badge ' + (st.wifi_connected ? 'b-ok' : 'b-err');
}

/* ---------------- جزئیات یک اسکن ---------------- */
function renderDetail(){
  const rec = scans[sel];
  const badge = $('lastBadge');

  if(!rec){
    badge.textContent = 'بدون داده';
    badge.className = 'badge b-idle';
    $('qrNoImg').style.display = 'block';
    $('qrImg').style.display = 'none';
    $('qrSn').textContent = '';
    $('qrHint').textContent = '';
    $('kvBody').innerHTML = '<div class="row"><div class="k">داده‌ای نیست</div><div class="v">—</div></div>';
    $('kvResp').innerHTML = '<div class="row"><div class="k">داده‌ای نیست</div><div class="v">—</div></div>';
    $('rawJson').textContent = '—';
    $('qrFallback').style.display = 'none';
    return;
  }

  /* --- QR --- */
  const img = $('qrImg');
  img.onerror = () => {
    img.style.display = 'none';
    $('qrNoImg').style.display = 'none';
    $('qrFallback').style.display = 'block';
  };
  img.onload = () => {
    img.style.display = 'block';
    $('qrNoImg').style.display = 'none';
    $('qrFallback').style.display = 'none';
  };
  img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&qzone=1&data=' +
            encodeURIComponent(rec.payload || '');
  $('qrFallback').textContent = rec.payload || '';
  $('qrSn').textContent = rec.serial || '';
  $('qrHint').textContent = rec.time_str || '';

  /* --- badge --- */
  if(rec.server_ok){
    badge.textContent = 'ورود مجاز';
    badge.className = 'badge b-ok';
  }else{
    badge.textContent = rec.reason || 'رد شد';
    badge.className = 'badge b-err';
  }

  /* --- ساختار payload --- */
  const b = rec.parsed || {};
  const rows = [
    ['نسخه (v)',      b.v != null ? b.v : '—'],
    ['شناسه بلیط (tid)', b.tid || '—'],
    ['شناسه رویداد (eid)', b.eid || '—'],
    ['سریال (sn)',    b.sn || '—'],
    ['نانس (nonce)',  b.nonce || '—'],
    ['صدور (iat)',    b.iat ? faDate(b.iat) : '—'],
    ['انقضا (exp)',   b.exp ? faDate(b.exp) : '—'],
    ['اعتبار باقی‌مانده', b.exp ? daysLeft(b.exp) : '—'],
    ['طول payload',   faNum(rec.payload_len || 0) + ' کاراکتر'],
    ['طول امضا',      faNum(rec.sig_len || 0) + ' کاراکتر'],
    ['ساختار',        rec.has_dot ? 'base64url(payload) . base64url(hmac)' : 'تک‌بخشی (نامعتبر)'],
  ];
  $('kvBody').innerHTML = rows.map(([k, v]) =>
    `<div class="row"><div class="k">${esc(k)}</div><div class="v ${/tid|eid|nonce/.test(k)?'mono':''}">${esc(v)}</div></div>`
  ).join('');

  /* --- پاسخ سرور --- */
  const r = [
    ['کد HTTP',       rec.http_status || '—'],
    ['وضعیت',         rec.server_ok ? '✅ ok' : '❌ رد'],
    ['action',        rec.action || '—'],
    ['reason',        rec.reason || '—'],
    ['پیام فارسی',    rec.message_fa || '—'],
    ['سریال بلیط',    rec.serial || '—'],
    ['اعتبار باقی‌مانده', rec.remaining != null ? faNum(rec.remaining) : '—'],
    ['زمان پاسخ',     rec.latency_ms != null ? faNum(rec.latency_ms) + ' ms' : '—'],
  ];
  $('kvResp').innerHTML = r.map(([k, v]) =>
    `<div class="row"><div class="k">${esc(k)}</div><div class="v ${/action|reason|HTTP/.test(k)?'mono':''}">${esc(v)}</div></div>`
  ).join('');

  /* --- JSON خام --- */
  let raw = rec.raw_json || '';
  try { raw = JSON.stringify(JSON.parse(raw), null, 2); } catch(e) {}
  if(!raw) raw = rec.body_json || '—';
  $('rawJson').textContent = raw;
}

/* ---------------- تاریخچه ---------------- */
function renderList(){
  const box = $('hist');
  $('histCount').textContent = faNum(scans.length) + ' مورد';

  if(!scans.length){
    box.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:18px">هنوز اسکنی ثبت نشده است — یک بلیط را جلوی دوربین بگیرید.</div>';
    return;
  }

  box.innerHTML = scans.map((s, i) => {
    const cls = 'hitem' + (i === sel ? ' sel' : '');
    const badge = s.server_ok ? 'b-ok' : 'b-err';
    const label = s.server_ok ? 'مجاز' : (s.reason || 'رد');
    return `<div class="${cls}" onclick="pick(${i})">
      <div>
        <div class="m">${esc(s.serial || '—')}</div>
        <div class="r">${esc(s.message_fa || s.reason || '')}</div>
      </div>
      <div style="text-align:left">
        <span class="badge ${badge}">${esc(label)}</span>
        <div class="t" style="margin-top:4px">${esc(s.time_str || '')}</div>
      </div>
    </div>`;
  }).join('');
}

function pick(i){ sel = i; renderList(); renderDetail(); }

/* ---------------- حلقه به‌روزرسانی ---------------- */
async function refresh(){
  try{
    const [st, sc] = await Promise.all([ getJSON('/api/status'), getJSON('/api/scans') ]);
    renderStatus(st);
    const prev = scans.length;
    scans = sc.scans || [];
    if(scans.length && (scans.length !== prev || sel >= scans.length)) sel = 0;
    renderList();
    renderDetail();
  }catch(e){
    $('dConn').className = 'dot off';
    $('pConn').textContent = 'قطع';
  }
}

/* ---------------- پخش زنده (canvas از فریم خام) ---------------- */
function toggleLive(){
  const cv = $('live');
  liveOn = !liveOn;

  if(liveOn){
    cv.classList.add('on');
    $('liveOff').style.display = 'none';
    $('liveDot').style.display = 'inline-flex';
    $('liveState').textContent = 'در حال پخش';
    $('liveState').className = 'badge b-ok';
    $('liveBtn').textContent = '⏸ توقف تصویر';
    liveErrShown = false;
    liveTick();
  }else{
    cv.classList.remove('on');
    $('liveOff').style.display = 'block';
    $('liveDot').style.display = 'none';
    $('liveState').textContent = 'خاموش';
    $('liveState').className = 'badge b-idle';
    $('liveBtn').textContent = '▶️ روشن کردن تصویر';
  }
}

async function liveTick(){
  if(!liveOn) return;

  try{
    const r = await fetch('/frame.raw?t=' + Date.now(), {cache:'no-store'});
    if(!r.ok){
      const t = await r.text();
      throw new Error(r.status + ' — ' + t);
    }

    const buf = new Uint8Array(await r.arrayBuffer());
    const cv  = $('live');
    const w = cv.width, h = cv.height;

    if(buf.length !== w * h){
      throw new Error('اندازه فریم ' + buf.length + ' ≠ ' + (w * h));
    }

    const ctx = cv.getContext('2d');
    if(!liveImgData) liveImgData = ctx.createImageData(w, h);

    const d = liveImgData.data;
    for(let i = 0, j = 0; i < buf.length; i++, j += 4){
      const v = buf[i];
      d[j] = v; d[j+1] = v; d[j+2] = v; d[j+3] = 255;
    }
    ctx.putImageData(liveImgData, 0, 0);
    liveErrShown = false;
  }catch(e){
    if(!liveErrShown){
      liveErrShown = true;
      toast('تصویر زنده: ' + e.message);
    }
  }

  /* ~۱۰ فریم بر ثانیه. اگر می‌خواهید سریع‌تر شود این عدد را کم کنید
     (مثلاً ۶۰ = حدود ۱۵ فریم)، ولی هر فریم از بافر دوربین گرفته می‌شود
     و روی سرعت تشخیص QR اثر می‌گذارد. */
  setTimeout(liveTick, 100);
}

/* ---------------- WiFi ---------------- */
async function openPortal(){
  toast('در حال باز کردن شبکه FunPark-Gate… با گوشی به آن وصل شوید و 192.168.4.1 را باز کنید.');
  try{ await fetch('/api/wifi/portal', {cache:'no-store'}); }catch(e){}
}
async function forgetWifi(){
  if(!confirm('تنظیمات وای‌فای پاک شود و دستگاه ری‌استارت شود؟')) return;
  toast('در حال پاک کردن تنظیمات و ری‌استارت…');
  try{ await fetch('/api/wifi/reset', {cache:'no-store'}); }catch(e){}
}

refresh();
setInterval(refresh, 2000);
</script>
</body>
</html>
)FUNPARK";

#endif // FUNPARK_WEBUI_H
