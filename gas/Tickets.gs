/**
 * Tickets.gs — صدور، امضای QR و خواندن بلیط‌ها
 */

/**
 * تعداد اعتبار (credits) هر بلیط بر اساس slug رویداد.
 * برای دمو: پارک آبی چند ورودی دارد تا حالت partially_used تست شود.
 */
var CREDITS_BY_SLUG = {
  'main-park': 1,
  'kids-city': 2,
  'water-park': 3
};

/** تعداد اعتبار پیش‌فرض یک رویداد */
function creditsForEvent_(event) {
  var n = CREDITS_BY_SLUG[String(event.slug)];
  return n ? n : 1;
}

/* ------------------------------------------------------------------ */
/*  امضای QR (HMAC-SHA256)                                             */
/* ------------------------------------------------------------------ */

/** ساخت JSON کانونیکال payload — ترتیب کلیدها ثابت است تا امضا پایدار بماند */
function qrCanonical_(p) {
  return JSON.stringify({
    v: 1,
    tid: String(p.tid),
    eid: String(p.eid),
    sn: String(p.sn),
    nonce: String(p.nonce),
    iat: toInt_(p.iat, 0),
    exp: toInt_(p.exp, 0)
  });
}

/** ساخت رشته QR: base64url(payload_json) + "." + base64url(hmac_sha256(payload_json, QR_SECRET)) */
function buildQrString_(payload) {
  var json = qrCanonical_(payload);
  var secret = getProp_('QR_SECRET');
  return strToB64Url_(json) + '.' + hmacSha256B64Url_(json, secret);
}

/** تجزیه و اعتبارسنجی رشته QR — خروجی: { valid, reason, payload } */
function parseQrString_(qr) {
  try {
    var parts = String(qr || '').trim().split('.');
    if (parts.length !== 2) return { valid: false, reason: 'malformed_qr' };

    var json = b64UrlToStr_(parts[0]);
    var secret = getProp_('QR_SECRET');
    var expected = hmacSha256B64Url_(json, secret);
    if (!safeEqual_(expected, parts[1])) return { valid: false, reason: 'bad_signature' };

    var payload = JSON.parse(json);
    if (toInt_(payload.v, 0) !== 1) return { valid: false, reason: 'unsupported_version' };
    if (!payload.tid || !payload.eid || !payload.nonce) return { valid: false, reason: 'incomplete_payload' };

    if (toInt_(payload.exp, 0) < unixNow_()) return { valid: false, reason: 'expired', payload: payload };

    return { valid: true, reason: 'ok', payload: payload };
  } catch (err) {
    return { valid: false, reason: 'malformed_qr' };
  }
}

/* ------------------------------------------------------------------ */
/*  صدور بلیط                                                          */
/* ------------------------------------------------------------------ */

/** صدور یک بلیط برای سفارش، همراه با امضای QR */
function issueTicketFor_(order, event, index) {
  var now = new Date();
  var exp = new Date(now.getTime() + TICKET_TTL_DAYS * 24 * 60 * 60 * 1000);
  var credits = creditsForEvent_(event);
  var tid = uuid_();
  var nonce = randomHex_(32);
  var sn = serialNumber_();

  var payload = {
    v: 1,
    tid: tid,
    eid: String(event.id),
    sn: sn,
    nonce: nonce,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(exp.getTime() / 1000)
  };

  var ticket = {
    id: tid,
    order_id: String(order.id),
    event_id: String(event.id),
    user_id: String(order.user_id),
    serial_number: sn,
    seat_or_zone: 'A-' + (index + 1),
    usage_type: credits > 1 ? 'multi_entry' : 'single_entry',
    total_credits: credits,
    remaining_credits: credits,
    status: 'issued',
    issued_at: now.toISOString(),
    expires_at: exp.toISOString(),
    used_at: '',
    nonce: nonce,
    signature: buildQrString_(payload)
  };

  appendRow_('Tickets', ticket);
  return ticket;
}

/** صدور همه بلیط‌های یک سفارش */
function issueTicketsForOrder_(order) {
  var event = findEventById_(order.event_id);
  if (!event) throw new Error('رویداد سفارش یافت نشد');

  var qty = toInt_(order.quantity, 1);
  var tickets = [];
  for (var i = 0; i < qty; i++) {
    tickets.push(issueTicketFor_(order, event, i));
  }
  return tickets;
}

/* ------------------------------------------------------------------ */
/*  خروجی عمومی بلیط                                                   */
/* ------------------------------------------------------------------ */

/** تبدیل سطر شیت به آبجکت عمومی بلیط */
function publicTicket_(row, event) {
  var ev = event || findEventById_(row.event_id);
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    event_id: String(row.event_id),
    event_title: ev ? String(ev.title) : '',
    event_slug: ev ? String(ev.slug) : '',
    event_location: ev ? String(ev.location || '') : '',
    event_starts_at: ev && ev.starts_at ? String(ev.starts_at) : '',
    serial_number: String(row.serial_number || ''),
    seat_or_zone: String(row.seat_or_zone || ''),
    usage_type: String(row.usage_type || ''),
    total_credits: toInt_(row.total_credits, 1),
    remaining_credits: toInt_(row.remaining_credits, 0),
    status: String(row.status || ''),
    issued_at: row.issued_at ? String(row.issued_at) : '',
    expires_at: row.expires_at ? String(row.expires_at) : '',
    used_at: row.used_at ? String(row.used_at) : '',
    // رشته کامل QR (payload.signature) — برای نمایش در کلاینت
    qr: String(row.signature || '')
  };
}

/* ------------------------------------------------------------------ */
/*  Action ها                                                          */
/* ------------------------------------------------------------------ */

/** action: tickets.list — بلیط‌های کاربر جاری */
function handleTicketsList(ctx) {
  try {
    var rows = queryRows_('Tickets', function (r) { return String(r.user_id) === String(ctx.user.id); });
    rows.sort(function (a, b) { return String(b.issued_at).localeCompare(String(a.issued_at)); });

    var eventMap = {};
    readRows_('Events').forEach(function (e) { eventMap[String(e.id)] = e; });

    var tickets = rows.map(function (r) { return publicTicket_(r, eventMap[String(r.event_id)]); });
    return ok_({ tickets: tickets, count: tickets.length });
  } catch (err) {
    return fail_('خطا در دریافت بلیط‌ها: ' + err.message, 500);
  }
}

/** action: tickets.get — { id } */
function handleTicketsGet(ctx) {
  try {
    var id = (ctx.body || {}).id;
    if (!id) return fail_('پارامتر id ارسال نشده است', 400);

    var row = findRow_('Tickets', function (r) { return String(r.id) === String(id); });
    if (!row) return fail_('بلیط یافت نشد', 404);
    if (String(row.user_id) !== String(ctx.user.id)) return fail_('دسترسی به این بلیط مجاز نیست', 403);

    return ok_({ ticket: publicTicket_(row) });
  } catch (err) {
    return fail_('خطا در دریافت بلیط: ' + err.message, 500);
  }
}
