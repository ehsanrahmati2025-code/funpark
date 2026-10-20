/**
 * Code.gs — نقطه ورود Web App و روتر action ها
 * همه درخواست‌ها: POST با Content-Type: text/plain;charset=utf-8
 * بدنه: { action: string, token?: string, ...payload }
 * پاسخ: { status: number, data: any }
 */

/** نقطه ورود POST */
function doPost(e) {
  var res;
  try {
    var body = readBody_(e);
    res = route_(body, e);
  } catch (err) {
    res = fail_('خطای داخلی سرور: ' + (err && err.message ? err.message : String(err)), 500);
  }
  return jsonOut_(res);
}

/** نقطه ورود GET — برای تست سریع در مرورگر: ?action=events.list */
function doGet(e) {
  var res;
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    var body = { action: p.action || 'events.list' };
    Object.keys(p).forEach(function (k) { body[k] = p[k]; });
    res = route_(body, e);
  } catch (err) {
    res = fail_('خطای داخلی سرور: ' + (err && err.message ? err.message : String(err)), 500);
  }
  return jsonOut_(res);
}

/** خواندن بدنه درخواست (JSON یا متن ساده) */
function readBody_(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    var raw = String(e.postData.contents).trim();
    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
      return { action: String(parsed) };
    } catch (err) {
      // اگر JSON نبود، بدنه را به عنوان نام action در نظر می‌گیریم
      return { action: raw };
    }
  }
  if (e.parameter && e.parameter.action) return e.parameter;
  return {};
}

/**
 * مسیریابی action ها
 * auth=true یعنی توکن JWT الزامی است
 */
function route_(body, e) {
  var action = String((body && body.action) || '').trim();

  /* ------------------------------------------------------------------
     ثبت مسیرها به‌صورت امن.
     اگر یکی از فایل‌های پروژه (مثلاً Auth.gs) در Apps Script جا افتاده
     باشد، ارجاع مستقیم به تابعش کل روتر را با خطای
     «handleAuthRegister is not defined» از کار می‌انداخت و همه action‌ها
     ۵۰۰ می‌دادند. با بررسی typeof، فقط همان مسیر غایب می‌شود.
     ------------------------------------------------------------------ */
  var routes = {};

  if (typeof handleEventsList === 'function')   routes['events.list']   = { fn: handleEventsList,   auth: false };
  if (typeof handleEventsGet === 'function')    routes['events.get']    = { fn: handleEventsGet,    auth: false };
  if (typeof handleAuthRegister === 'function') routes['auth.register'] = { fn: handleAuthRegister, auth: false };
  if (typeof handleAuthLogin === 'function')    routes['auth.login']    = { fn: handleAuthLogin,    auth: false };
  if (typeof handleAuthMe === 'function')       routes['auth.me']       = { fn: handleAuthMe,       auth: true  };
  if (typeof handleOrdersCreate === 'function') routes['orders.create'] = { fn: handleOrdersCreate, auth: true  };
  if (typeof handleOrdersPay === 'function')    routes['orders.pay']    = { fn: handleOrdersPay,    auth: true  };
  if (typeof handleTicketsList === 'function')  routes['tickets.list']  = { fn: handleTicketsList,  auth: true  };
  if (typeof handleTicketsGet === 'function')   routes['tickets.get']   = { fn: handleTicketsGet,   auth: true  };
  if (typeof handleScanValidate === 'function') routes['scan.validate'] = { fn: handleScanValidate, auth: false };
  if (typeof handleAdminSeed === 'function')    routes['admin.seed']    = { fn: handleAdminSeed,    auth: false };

  var route = routes[action];
  if (!route) {
    var present = Object.keys(routes);
    return fail_(
      'action در دسترس نیست: ' + action +
      ' | مسیرهای موجود: ' + (present.length ? present.join(', ') : 'هیچ') +
      ' — احتمالاً یکی از فایل‌های .gs در پروژه Apps Script جا افتاده است.',
      404
    );
  }

  var ctx = { body: body, event: e, user: null };

  if (route.auth) {
    var payload = verifyJwt_(body.token);
    if (!payload) return fail_('توکن نامعتبر یا منقضی شده است', 401);
    var user = findRow_('Users', function (r) { return String(r.id) === String(payload.uid); });
    if (!user) return fail_('کاربر یافت نشد', 401);
    ctx.user = user;
  }

  return route.fn(ctx);
}
