/**
 * Orders.gs — ثبت سفارش و پرداخت (Mock)
 */

/** تبدیل سطر شیت به آبجکت عمومی سفارش */
function publicOrder_(row) {
  var event = findEventById_(row.event_id);
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    event_id: String(row.event_id),
    event_title: event ? String(event.title) : '',
    event_slug: event ? String(event.slug) : '',
    event_location: event ? String(event.location || '') : '',
    event_starts_at: event && event.starts_at ? String(event.starts_at) : '',
    quantity: toInt_(row.quantity, 0),
    total_rial: toInt_(row.total_rial, 0),
    status: String(row.status || ''),
    payment_provider: String(row.payment_provider || ''),
    payment_ref: String(row.payment_ref || ''),
    created_at: row.created_at ? String(row.created_at) : '',
    paid_at: row.paid_at ? String(row.paid_at) : ''
  };
}

/** محاسبه تعداد بلیط‌های فروخته‌شده یک رویداد (فقط سفارش‌های پرداخت‌شده) */
function countPaidSeats_(eventId) {
  var orders = queryRows_('Orders', function (r) {
    return String(r.event_id) === String(eventId) && String(r.status) === 'paid';
  });
  var total = 0;
  orders.forEach(function (o) { total += toInt_(o.quantity, 0); });
  return total;
}

/**
 * action: orders.create — { eventId, quantity }
 * اعتبارسنجی ظرفیت، ساخت سفارش با وضعیت pending
 */
function handleOrdersCreate(ctx) {
  try {
    ensureAllSheets_();
    var body = ctx.body || {};
    requireFields_(body, ['eventId', 'quantity']);

    var quantity = toInt_(body.quantity, 0);
    if (quantity < 1 || quantity > 10) return fail_('تعداد بلیط باید بین ۱ تا ۱۰ باشد', 400);

    var event = findEventById_(body.eventId);
    if (!event) return fail_('رویداد یافت نشد', 404);
    if (!toBool_(event.active)) return fail_('این رویداد فعال نیست', 400);

    var capacity = toInt_(event.capacity, 0);
    if (capacity > 0) {
      var remaining = capacity - countPaidSeats_(event.id);
      if (quantity > remaining) {
        return fail_('ظرفیت باقی‌مانده کافی نیست (باقی‌مانده: ' + Math.max(remaining, 0) + ')', 400);
      }
    }

    var price = toInt_(event.price_rial, 0);
    var order = {
      id: uuid_(),
      user_id: String(ctx.user.id),
      event_id: String(event.id),
      quantity: quantity,
      total_rial: price * quantity,
      status: 'pending',
      payment_provider: '',
      payment_ref: '',
      created_at: nowIso_(),
      paid_at: ''
    };

    appendRow_('Orders', order);

    return ok_({
      order: publicOrder_(order),
      event: publicEvent_(event, countSoldTickets_(event.id))
    });
  } catch (err) {
    return fail_('خطا در ایجاد سفارش: ' + err.message, 400);
  }
}

/**
 * action: orders.pay — { orderId, success }  (درگاه Mock)
 * در صورت موفقیت، بلیط‌ها صادر می‌شوند. این action idempotent است.
 */
function handleOrdersPay(ctx) {
  try {
    var body = ctx.body || {};
    requireFields_(body, ['orderId']);

    var row = findRow_('Orders', function (r) { return String(r.id) === String(body.orderId); });
    if (!row) return fail_('سفارش یافت نشد', 404);
    if (String(row.user_id) !== String(ctx.user.id)) return fail_('دسترسی به این سفارش مجاز نیست', 403);

    // اگر قبلاً پرداخت شده، همان بلیط‌ها را برمی‌گردانیم (idempotent)
    if (String(row.status) === 'paid') {
      var existing = queryRows_('Tickets', function (t) { return String(t.order_id) === String(row.id); });
      var ev = findEventById_(row.event_id);
      return ok_({
        order: publicOrder_(row),
        tickets: existing.map(function (t) { return publicTicket_(t, ev); }),
        already_paid: true
      });
    }

    var success = (body.success === undefined) ? true : toBool_(body.success);

    if (!success) {
      var failed = updateRow_('Orders', row._row, { status: 'failed' });
      return ok_({ order: publicOrder_(failed), tickets: [], failed: true });
    }

    var paidAt = nowIso_();
    var ref = 'MOCK-' + randomHex_(10).toUpperCase();
    var paid = updateRow_('Orders', row._row, {
      status: 'paid',
      payment_provider: 'mock',
      payment_ref: ref,
      paid_at: paidAt
    });

    var tickets = issueTicketsForOrder_(paid);

    return ok_({
      order: publicOrder_(paid),
      tickets: tickets.map(function (t) { return publicTicket_(t); }),
      already_paid: false
    });
  } catch (err) {
    return fail_('خطا در پرداخت سفارش: ' + err.message, 500);
  }
}
