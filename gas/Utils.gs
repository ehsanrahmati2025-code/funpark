/**
 * Utils.gs — توابع کمکی مشترک پروژه FunPark
 * دسترسی به Google Sheets، ساخت UUID، هش، HMAC، قالب پاسخ‌ها و قفل‌گذاری
 */

/** اسکیمای دقیق شیت‌ها: نام شیت => نام ستون‌ها به ترتیب */
var SHEET_SCHEMA = {
  Users: ['id', 'phone', 'email', 'full_name', 'password_hash', 'created_at'],
  Events: ['id', 'slug', 'title', 'description', 'starts_at', 'ends_at', 'location', 'capacity', 'price_rial', 'active'],
  Orders: ['id', 'user_id', 'event_id', 'quantity', 'total_rial', 'status', 'payment_provider', 'payment_ref', 'created_at', 'paid_at'],
  Tickets: ['id', 'order_id', 'event_id', 'user_id', 'serial_number', 'seat_or_zone', 'usage_type', 'total_credits', 'remaining_credits', 'status', 'issued_at', 'expires_at', 'used_at', 'nonce', 'signature'],
  Devices: ['id', 'name', 'location', 'api_key_hash', 'active', 'last_seen_at'],
  ScanLogs: ['id', 'ticket_id', 'device_id', 'result', 'credits_before', 'credits_after', 'ip', 'scanned_at']
};

/** مدت اعتبار بلیط (روز) */
var TICKET_TTL_DAYS = 30;
/** مدت اعتبار توکن JWT (روز) */
var JWT_TTL_DAYS = 7;

/* ------------------------------------------------------------------ */
/*  پاسخ‌های استاندارد                                                 */
/* ------------------------------------------------------------------ */

/** خروجی موفق: { status: 200, data: ... } */
function ok_(data) {
  return { status: 200, data: data === undefined ? {} : data };
}

/** خروجی خطا: { status: n, data: { error: msg } } */
function fail_(message, status) {
  return { status: status || 400, data: { error: String(message || 'خطای نامشخص') } };
}

/** تبدیل پاسخ به خروجی JSON متنی برای Apps Script */
function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/*  دسترسی به Google Sheets                                            */
/* ------------------------------------------------------------------ */

/** گرفتن اسپردشیت از Script Properties یا اسپردشیت فعال */
function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('SPREADSHEET_ID در Script Properties تنظیم نشده است');
  return active;
}

/** گرفتن شیت با نام مشخص و اطمینان از وجود سطر هدر */
function getSheet_(name) {
  var cols = SHEET_SCHEMA[name];
  if (!cols) throw new Error('شیت ناشناخته: ' + name);
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** ساخت همه شیت‌ها در صورت نبود */
function ensureAllSheets_() {
  Object.keys(SHEET_SCHEMA).forEach(function (name) { getSheet_(name); });
}

/** خواندن همه سطرهای یک شیت به صورت آرایه‌ای از آبجکت (به همراه _row) */
function readRows_(name) {
  var sh = getSheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  var header = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (String(row[0]).trim() === '') continue;
    var obj = { _row: r + 1 };
    for (var c = 0; c < header.length; c++) obj[String(header[c])] = row[c];
    out.push(obj);
  }
  return out;
}

/** فیلتر کردن سطرها بر اساس شرط */
function queryRows_(name, filter) {
  var rows = readRows_(name);
  if (typeof filter !== 'function') return rows;
  return rows.filter(filter);
}

/** پیدا کردن اولین سطر مطابق شرط */
function findRow_(name, filter) {
  var rows = queryRows_(name, filter);
  return rows.length ? rows[0] : null;
}

/** افزودن یک سطر جدید بر اساس اسکیمای شیت */
function appendRow_(name, obj) {
  var sh = getSheet_(name);
  var cols = SHEET_SCHEMA[name];
  var out = cols.map(function (c) {
    var v = obj[c];
    return (v === undefined || v === null) ? '' : v;
  });
  sh.appendRow(out);
  return obj;
}

/** به‌روزرسانی یک سطر با شماره سطر و آبجکت تغییرات */
function updateRow_(name, rowIndex, patch) {
  var sh = getSheet_(name);
  var cols = SHEET_SCHEMA[name];
  var current = sh.getRange(rowIndex, 1, 1, cols.length).getValues()[0];
  var obj = {};
  for (var i = 0; i < cols.length; i++) obj[cols[i]] = current[i];
  Object.keys(patch || {}).forEach(function (k) { obj[k] = patch[k]; });
  var out = cols.map(function (c) {
    var v = obj[c];
    return (v === undefined || v === null) ? '' : v;
  });
  sh.getRange(rowIndex, 1, 1, cols.length).setValues([out]);
  return obj;
}

/** به‌روزرسانی بر اساس id */
function updateById_(name, id, patch) {
  var row = findRow_(name, function (r) { return String(r.id) === String(id); });
  if (!row) return null;
  return updateRow_(name, row._row, patch);
}

/* ------------------------------------------------------------------ */
/*  ابزارهای عمومی                                                     */
/* ------------------------------------------------------------------ */

/** شناسه یکتا */
function uuid_() {
  return Utilities.getUuid();
}

/** زمان فعلی به صورت ISO */
function nowIso_() {
  return new Date().toISOString();
}

/** زمان فعلی به صورت unix (ثانیه) */
function unixNow_() {
  return Math.floor(new Date().getTime() / 1000);
}

/** عدد صحیح امن */
function toInt_(v, def) {
  var n = parseInt(v, 10);
  return isNaN(n) ? (def === undefined ? 0 : def) : n;
}

/** تبدیل مقادیر شیت به بولین */
function toBool_(v) {
  if (v === true) return true;
  if (v === false) return false;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'بله';
}

/** خواندن یک Script Property و خطا در صورت نبود */
function getProp_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('Script Property تعیین نشده است: ' + key);
  return v;
}

/** رشته تصادفی هگز با طول دلخواه */
function randomHex_(len) {
  var chars = '0123456789abcdef';
  var out = '';
  for (var i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

/** شماره سریال ۸ رقمی بلیط */
function serialNumber_() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

/** بررسی وجود فیلدهای الزامی در بدنه درخواست */
function requireFields_(body, fields) {
  var missing = [];
  fields.forEach(function (f) {
    var v = body ? body[f] : null;
    if (v === undefined || v === null || String(v).trim() === '') missing.push(f);
  });
  if (missing.length) throw new Error('فیلدهای الزامی ارسال نشده: ' + missing.join(', '));
  return true;
}

/** اعتبارسنجی شماره موبایل ایران */
function isValidPhone_(phone) {
  return /^09\d{9}$/.test(String(phone || '').trim());
}

/* ------------------------------------------------------------------ */
/*  رمزنگاری                                                           */
/* ------------------------------------------------------------------ */

/** تبدیل آرایه بایت به رشته hex */
function bytesToHex_(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    out += ((bytes[i] & 0xff) + 0x100).toString(16).slice(1);
  }
  return out;
}

/** SHA-256 به صورت hex */
function sha256Hex_(text) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text),
    Utilities.Charset.UTF_8
  );
  return bytesToHex_(bytes);
}

/** SHA-256 به صورت base64 استاندارد */
function sha256B64_(text) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(bytes);
}

/** base64url بدون padding از آرایه بایت */
function bytesToB64Url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

/** base64url یک رشته UTF-8 */
function strToB64Url_(text) {
  var bytes = Utilities.newBlob(String(text)).getBytes();
  return bytesToB64Url_(bytes);
}

/** بازگرداندن padding رشته base64url */
function padB64_(s) {
  var mod = s.length % 4;
  if (mod === 2) return s + '==';
  if (mod === 3) return s + '=';
  if (mod === 1) return s + '===';
  return s;
}

/** دیکد base64url به رشته UTF-8 */
function b64UrlToStr_(s) {
  var bytes = Utilities.base64DecodeWebSafe(padB64_(String(s)));
  return Utilities.newBlob(bytes).getDataAsString('UTF-8');
}

/** HMAC-SHA256 به صورت base64url */
function hmacSha256B64Url_(message, secret) {
  var sig = Utilities.computeHmacSha256Signature(
    String(message),
    String(secret),
    Utilities.Charset.UTF_8
  );
  return bytesToB64Url_(sig);
}

/** مقایسه امن دو رشته (مقاوم در برابر timing attack) */
function safeEqual_(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

/* ------------------------------------------------------------------ */
/*  قفل‌گذاری (جلوگیری از Race Condition در اسکن همزمان)                */
/* ------------------------------------------------------------------ */

/** اجرای یک تابع داخل قفل اسکریپت */
function withLock_(fn, timeoutMs) {
  var lock = LockService.getScriptLock();
  var got = lock.tryLock(timeoutMs || 10000);
  if (!got) throw new Error('سیستم مشغول است، لطفاً دوباره تلاش کنید');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
