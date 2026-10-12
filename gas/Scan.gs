/**
 * Scan.gs — اعتبارسنجی QR توسط دستگاه ESP32 و کنترل ورود
 * جریان: verify دستگاه → verify QR → قفل → بررسی وضعیت بلیط → کم کردن اعتبار → ثبت لاگ
 */

/* ------------------------------------------------------------------ */
/*  اعتبارسنجی دستگاه                                                  */
/* ------------------------------------------------------------------ */

/** پیدا کردن دستگاه و بررسی کلید API (هش SHA-256) */
function authenticateDevice_(deviceId, deviceKey) {
  if (!deviceId || !deviceKey) return { ok: false, reason: 'missing_device_credentials' };

  var device = findRow_('Devices', function (d) { return String(d.id) === String(deviceId); });
  if (!device) return { ok: false, reason: 'unknown_device' };
  if (!toBool_(device.active)) return { ok: false, reason: 'inactive_device' };

  var hash = sha256Hex_(deviceKey);
  if (!safeEqual_(hash, String(device.api_key_hash))) {
    return { ok: false, reason: 'invalid_device_key' };
  }

  return { ok: true, reason: 'ok', device: device };
}

/* ------------------------------------------------------------------ */
/*  پاسخ‌های اسکن                                                      */
/* ------------------------------------------------------------------ */

/** ساخت پاسخ استاندارد اسکن */
function scanResult_(ok, reason, action, messageFa, ticket) {
  var out = {
    ok: !!ok,
    reason: String(reason),
    action: String(action),
    message_fa: String(messageFa)
  };
  if (ticket) out.ticket = ticket;
  return ok_(out);
}

/** پیام فارسی متناسب با دلیل رد شدن */
function denyMessageFa_(reason) {
  var map = {
    missing_device_credentials: 'اطلاعات دستگاه ارسال نشده است',
    unknown_device: 'دستگاه ناشناس است',
    inactive_device: 'دستگاه غیرفعال است',
    invalid_device_key: 'کلید دستگاه نامعتبر است',
    missing_payload: 'کد QR ارسال نشده است',
    malformed_qr: 'کد QR نامعتبر یا مخدوش است',
    bad_signature: 'امضای کد QR معتبر نیست',
    unsupported_version: 'نسخه کد QR پشتیبانی نمی‌شود',
    incomplete_payload: 'اطلاعات کد QR ناقص است',
    expired: 'اعتبار این بلیط به پایان رسیده است',
    ticket_not_found: 'بلیط در سیستم یافت نشد',
    nonce_mismatch: 'این کد QR دیگر معتبر نیست',
    wrong_event: 'این بلیط برای رویداد دیگری صادر شده است',
    not_usable: 'وضعیت بلیط اجازه ورود نمی‌دهد',
    no_credits: 'اعتبار این بلیط تمام شده است',
    busy: 'سیستم مشغول است، دوباره تلاش کنید',
    server_error: 'خطای داخلی سرور'
  };
  return map[reason] || 'ورود مجاز نیست';
}

/** ثبت لاگ اسکن در شیت ScanLogs */
function logScan_(ticketId, deviceId, result, before, after, ip) {
  try {
    appendRow_('ScanLogs', {
      id: uuid_(),
      ticket_id: String(ticketId || ''),
      device_id: String(deviceId || ''),
      result: String(result || ''),
      credits_before: before === undefined || before === null ? '' : before,
      credits_after: after === undefined || after === null ? '' : after,
      ip: String(ip || ''),
      scanned_at: nowIso_()
    });
  } catch (err) {
    // لاگ نباید جریان اسکن را متوقف کند
  }
}

/* ------------------------------------------------------------------ */
/*  Action اصلی                                                        */
/* ------------------------------------------------------------------ */

/** action: scan.validate — { device_id, device_key, payload, ip? } (ESP32) */
function handleScanValidate(ctx) {
  var body = ctx.body || {};
  var deviceId = body.device_id;
  var deviceKey = body.device_key;
  var qr = body.payload || body.qr;
  var ip = body.ip || '';

  try {
    ensureAllSheets_();

    // ۱) اعتبارسنجی دستگاه
    var dev = authenticateDevice_(deviceId, deviceKey);
    if (!dev.ok) {
      logScan_('', deviceId, dev.reason, null, null, ip);
      return scanResult_(false, dev.reason, 'deny', denyMessageFa_(dev.reason));
    }

    if (!qr) {
      logScan_('', deviceId, 'missing_payload', null, null, ip);
      return scanResult_(false, 'missing_payload', 'deny', denyMessageFa_('missing_payload'));
    }

    // ۲) اعتبارسنجی امضا و انقضای QR
    var parsed = parseQrString_(qr);
    if (!parsed.valid) {
      logScan_('', deviceId, parsed.reason, null, null, ip);
      return scanResult_(false, parsed.reason, 'deny', denyMessageFa_(parsed.reason));
    }

    var payload = parsed.payload;

    // به‌روزرسانی last_seen_at دستگاه
    try { updateById_('Devices', deviceId, { last_seen_at: nowIso_() }); } catch (e) {}

    // ۳) قفل‌گذاری برای جلوگیری از اسکن همزمان
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      logScan_(payload.tid, deviceId, 'busy', null, null, ip);
      return scanResult_(false, 'busy', 'deny', denyMessageFa_('busy'));
    }

    try {
      var row = findRow_('Tickets', function (t) { return String(t.id) === String(payload.tid); });

      if (!row) {
        logScan_(payload.tid, deviceId, 'ticket_not_found', null, null, ip);
        return scanResult_(false, 'ticket_not_found', 'deny', denyMessageFa_('ticket_not_found'));
      }

      // بررسی تطابق nonce (جلوگیری از کپی کد QR قدیمی)
      if (!safeEqual_(String(row.nonce), String(payload.nonce))) {
        logScan_(payload.tid, deviceId, 'nonce_mismatch', null, null, ip);
        return scanResult_(false, 'nonce_mismatch', 'deny', denyMessageFa_('nonce_mismatch'));
      }

      // بررسی رویداد مقصد (در صورت ارسال event_id از دستگاه)
      if (body.event_id && String(body.event_id) !== String(row.event_id)) {
        logScan_(payload.tid, deviceId, 'wrong_event', null, null, ip);
        return scanResult_(false, 'wrong_event', 'deny', denyMessageFa_('wrong_event'));
      }

      // ۴) وضعیت بلیط باید issued یا partially_used باشد
      var status = String(row.status);
      if (status !== 'issued' && status !== 'partially_used') {
        logScan_(payload.tid, deviceId, 'not_usable', null, null, ip);
        return scanResult_(false, 'not_usable', 'deny', denyMessageFa_('not_usable'));
      }

      // بررسی انقضای ذخیره‌شده در شیت
      if (row.expires_at && new Date(row.expires_at).getTime() < new Date().getTime()) {
        updateRow_('Tickets', row._row, { status: 'expired' });
        logScan_(payload.tid, deviceId, 'expired', null, null, ip);
        return scanResult_(false, 'expired', 'deny', denyMessageFa_('expired'));
      }

      var before = toInt_(row.remaining_credits, 0);
      if (before <= 0) {
        logScan_(payload.tid, deviceId, 'no_credits', before, before, ip);
        return scanResult_(false, 'no_credits', 'deny', denyMessageFa_('no_credits'));
      }

      // ۵و۶) کم کردن اعتبار و به‌روزرسانی وضعیت
      var after = before - 1;
      var newStatus = after === 0 ? 'used' : 'partially_used';
      var patch = { remaining_credits: after, status: newStatus };
      if (after === 0) patch.used_at = nowIso_();
      var updated = updateRow_('Tickets', row._row, patch);

      // ۷) ثبت لاگ
      logScan_(payload.tid, deviceId, 'granted', before, after, ip);

      // ۸) پاسخ
      var ev = findEventById_(row.event_id);
      var ticket = publicTicket_(updated, ev);
      var msg = after === 0
        ? 'ورود مجاز است — اعتبار بلیط به پایان رسید'
        : 'ورود مجاز است — ' + after + ' اعتبار باقی مانده';

      return scanResult_(true, 'ok', 'open_gate', msg, ticket);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    logScan_('', deviceId, 'server_error', null, null, ip);
    return scanResult_(false, 'server_error', 'deny', denyMessageFa_('server_error') + ' (' + err.message + ')');
  }
}
