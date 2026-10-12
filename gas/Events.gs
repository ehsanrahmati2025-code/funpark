/**
 * Events.gs — مدیریت رویدادها (events.list / events.get)
 */

/** تبدیل سطر شیت به آبجکت عمومی رویداد */
function publicEvent_(row, soldCount) {
  var capacity = toInt_(row.capacity, 0);
  var sold = toInt_(soldCount, 0);
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    description: String(row.description || ''),
    starts_at: row.starts_at ? String(row.starts_at) : '',
    ends_at: row.ends_at ? String(row.ends_at) : '',
    location: String(row.location || ''),
    capacity: capacity,
    sold: sold,
    remaining: capacity > 0 ? Math.max(capacity - sold, 0) : null,
    price_rial: toInt_(row.price_rial, 0),
    active: toBool_(row.active)
  };
}

/** شمارش بلیط‌های فروخته‌شده یک رویداد */
function countSoldTickets_(eventId) {
  var rows = queryRows_('Tickets', function (r) { return String(r.event_id) === String(eventId); });
  return rows.length;
}

/** پیدا کردن رویداد بر اساس slug */
function findEventBySlug_(slug) {
  return findRow_('Events', function (r) { return String(r.slug) === String(slug); });
}

/** پیدا کردن رویداد بر اساس id */
function findEventById_(id) {
  return findRow_('Events', function (r) { return String(r.id) === String(id); });
}

/** action: events.list — لیست رویدادهای active */
function handleEventsList(ctx) {
  try {
    ensureAllSheets_();
    var rows = queryRows_('Events', function (r) { return toBool_(r.active); });
    var events = rows.map(function (r) { return publicEvent_(r, countSoldTickets_(r.id)); });
    return ok_({ events: events, count: events.length });
  } catch (err) {
    return fail_('خطا در دریافت رویدادها: ' + err.message, 500);
  }
}

/** action: events.get — { slug } => یک رویداد */
function handleEventsGet(ctx) {
  try {
    ensureAllSheets_();
    var body = ctx.body || {};
    var slug = body.slug || body.id;
    if (!slug) return fail_('پارامتر slug ارسال نشده است', 400);

    var row = findEventBySlug_(slug);
    if (!row && body.id) row = findEventById_(body.id);
    if (!row) return fail_('رویداد یافت نشد', 404);

    return ok_({ event: publicEvent_(row, countSoldTickets_(row.id)) });
  } catch (err) {
    return fail_('خطا در دریافت رویداد: ' + err.message, 500);
  }
}
