/**
 * Auth.gs — ثبت‌نام، ورود، توکن JWT و هش رمز عبور
 */

/* ------------------------------------------------------------------ */
/*  رمز عبور                                                           */
/* ------------------------------------------------------------------ */

/**
 * هش رمز عبور
 * Salt = ۸ کاراکتر اول یک UUID
 * Hash = SHA-256(salt + password)
 * قالب ذخیره‌سازی: salt$base64(hash)
 */
function hashPassword_(password) {
  var salt = uuid_().replace(/-/g, '').slice(0, 8);
  var hash = sha256B64_(salt + String(password));
  return salt + '$' + hash;
}

/** بررسی صحت رمز عبور در برابر مقدار ذخیره‌شده */
function verifyPassword_(password, stored) {
  try {
    var parts = String(stored || '').split('$');
    if (parts.length !== 2) return false;
    var salt = parts[0];
    var expected = parts[1];
    var actual = sha256B64_(salt + String(password));
    return safeEqual_(actual, expected);
  } catch (err) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  JWT (HS256)                                                        */
/* ------------------------------------------------------------------ */

/** ساخت توکن JWT با انقضای ۷ روز */
function createJwt_(userId) {
  var secret = getProp_('JWT_SECRET');
  var header = { alg: 'HS256', typ: 'JWT' };
  var payload = {
    uid: String(userId),
    exp: unixNow_() + (JWT_TTL_DAYS * 24 * 60 * 60)
  };
  var h = strToB64Url_(JSON.stringify(header));
  var p = strToB64Url_(JSON.stringify(payload));
  var sig = hmacSha256B64Url_(h + '.' + p, secret);
  return h + '.' + p + '.' + sig;
}

/** اعتبارسنجی توکن JWT و برگرداندن payload یا null */
function verifyJwt_(token) {
  try {
    if (!token) return null;
    var parts = String(token).split('.');
    if (parts.length !== 3) return null;
    var secret = getProp_('JWT_SECRET');
    var expected = hmacSha256B64Url_(parts[0] + '.' + parts[1], secret);
    if (!safeEqual_(expected, parts[2])) return null;
    var payload = JSON.parse(b64UrlToStr_(parts[1]));
    if (!payload || !payload.uid) return null;
    if (toInt_(payload.exp, 0) < unixNow_()) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  کاربر                                                              */
/* ------------------------------------------------------------------ */

/** خروجی عمومی کاربر (بدون هش رمز) */
function publicUser_(row) {
  return {
    id: String(row.id),
    phone: String(row.phone || ''),
    email: String(row.email || ''),
    full_name: String(row.full_name || ''),
    created_at: row.created_at ? String(row.created_at) : ''
  };
}

/** پیدا کردن کاربر بر اساس شماره موبایل */
function findUserByPhone_(phone) {
  var p = String(phone || '').trim();
  return findRow_('Users', function (r) { return String(r.phone).trim() === p; });
}

/* ------------------------------------------------------------------ */
/*  Action ها                                                          */
/* ------------------------------------------------------------------ */

/** action: auth.register — { phone, full_name, password } */
function handleAuthRegister(ctx) {
  try {
    ensureAllSheets_();
    var body = ctx.body || {};
    requireFields_(body, ['phone', 'full_name', 'password']);

    var phone = String(body.phone).trim();
    var fullName = String(body.full_name).trim();
    var password = String(body.password);

    if (!isValidPhone_(phone)) return fail_('شماره موبایل نامعتبر است (مثال: 09121234567)', 400);
    if (fullName.length < 3) return fail_('نام و نام خانوادگی باید حداقل ۳ کاراکتر باشد', 400);
    if (password.length < 6) return fail_('رمز عبور باید حداقل ۶ کاراکتر باشد', 400);
    if (findUserByPhone_(phone)) return fail_('این شماره موبایل قبلاً ثبت‌نام کرده است', 409);

    var user = {
      id: uuid_(),
      phone: phone,
      email: body.email ? String(body.email).trim() : '',
      full_name: fullName,
      password_hash: hashPassword_(password),
      created_at: nowIso_()
    };

    appendRow_('Users', user);

    return ok_({
      token: createJwt_(user.id),
      user: publicUser_(user)
    });
  } catch (err) {
    return fail_('خطا در ثبت‌نام: ' + err.message, 400);
  }
}

/** action: auth.login — { phone, password } */
function handleAuthLogin(ctx) {
  try {
    ensureAllSheets_();
    var body = ctx.body || {};
    requireFields_(body, ['phone', 'password']);

    var user = findUserByPhone_(body.phone);
    if (!user) return fail_('شماره موبایل یا رمز عبور نادرست است', 401);
    if (!verifyPassword_(body.password, user.password_hash)) {
      return fail_('شماره موبایل یا رمز عبور نادرست است', 401);
    }

    return ok_({
      token: createJwt_(user.id),
      user: publicUser_(user)
    });
  } catch (err) {
    return fail_('خطا در ورود: ' + err.message, 400);
  }
}

/** action: auth.me — اطلاعات کاربر فعلی */
function handleAuthMe(ctx) {
  try {
    if (!ctx.user) return fail_('کاربر یافت نشد', 401);
    var tickets = queryRows_('Tickets', function (r) { return String(r.user_id) === String(ctx.user.id); });
    var orders = queryRows_('Orders', function (r) { return String(r.user_id) === String(ctx.user.id); });
    return ok_({
      user: publicUser_(ctx.user),
      stats: {
        tickets_count: tickets.length,
        orders_count: orders.length
      }
    });
  } catch (err) {
    return fail_('خطا در دریافت اطلاعات کاربر: ' + err.message, 500);
  }
}
