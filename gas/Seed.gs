/**
 * Seed.gs — پر کردن دیتای دمو (admin.seed)
 * ۳ رویداد + ۱ دستگاه اسکنر
 */

/** تاریخ ISO با جابه‌جایی روز */
function isoPlusDays_(days) {
  return new Date(new Date().getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** دیتای اولیه رویدادها */
function seedEventsData_() {
  return [
    {
      slug: 'main-park',
      title: 'پارک اصلی فان‌پارک',
      description: 'بزرگ‌ترین پارک تفریحی فان‌پارک با بیش از ۲۰ بازی مهیج برای تمام سنین. شامل قطار مرگ، چرخ و فلک، خانه وحشت و سالن بازی‌های دیجیتال.',
      location: 'تهران، بزرگراه شهید همت، خروجی فان‌پارک',
      capacity: 500,
      price_rial: 250000,
      active: true
    },
    {
      slug: 'kids-city',
      title: 'شهر کودکان',
      description: 'شهر بازی مخصوص کودکان ۳ تا ۱۲ سال با نظارت مربیان مجرب. شامل سرسره‌های بادی، استخر توپ، کارگاه نقاشی و اتاق بازی آموزشی.',
      location: 'تهران، سعادت‌آباد، بلوار دریا، شهر کودکان',
      capacity: 200,
      price_rial: 150000,
      active: true
    },
    {
      slug: 'water-park',
      title: 'پارک آبی موج‌ها',
      description: 'پارک آبی سرپوشیده با استخر موج، سرسره‌های بلند آبی، رودخانه تنبل و بخش مخصوص کودکان. ورودی شامل ۳ اعتبار استفاده است.',
      location: 'تهران، بزرگراه خرازی، مجموعه ورزشی موج‌ها',
      capacity: 300,
      price_rial: 350000,
      active: true
    }
  ];
}

/** action: admin.seed — پر کردن دیتای دمو (idempotent) */
function handleAdminSeed(ctx) {
  try {
    ensureAllSheets_();

    var createdEvents = 0;
    var skippedEvents = 0;

    // --- رویدادها ---
    seedEventsData_().forEach(function (e) {
      if (findEventBySlug_(e.slug)) {
        skippedEvents++;
        return;
      }
      appendRow_('Events', {
        id: uuid_(),
        slug: e.slug,
        title: e.title,
        description: e.description,
        starts_at: isoPlusDays_(1),
        ends_at: isoPlusDays_(60),
        location: e.location,
        capacity: e.capacity,
        price_rial: e.price_rial,
        active: e.active
      });
      createdEvents++;
    });

    // --- دستگاه اسکنر ---
    var createdDevices = 0;
    var skippedDevices = 0;
    var deviceId = 'gate-01';
    var deviceKey = 'test-key-123';

    var existingDevice = findRow_('Devices', function (d) { return String(d.id) === deviceId; });
    if (existingDevice) {
      skippedDevices++;
    } else {
      appendRow_('Devices', {
        id: deviceId,
        name: 'گیت ورودی اصلی',
        location: 'ورودی شماره ۱',
        api_key_hash: sha256Hex_(deviceKey),
        active: true,
        last_seen_at: ''
      });
      createdDevices++;
    }

    return ok_({
      message: 'دیتای دمو با موفقیت آماده شد',
      events_created: createdEvents,
      events_skipped: skippedEvents,
      devices_created: createdDevices,
      devices_skipped: skippedDevices,
      device: { id: deviceId, key: deviceKey },
      events: queryRows_('Events').map(function (r) {
        return { id: String(r.id), slug: String(r.slug), title: String(r.title), price_rial: toInt_(r.price_rial, 0) };
      })
    });
  } catch (err) {
    return fail_('خطا در اجرای seed: ' + err.message, 500);
  }
}
