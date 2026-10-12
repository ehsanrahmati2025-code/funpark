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

  var routes = {
    'events.list':   { fn: handleEventsList,   auth: false },
    'events.get':    { fn: handleEventsGet,    auth: false },
    'auth.register': { fn: handleAuthRegister, auth: false },
    'auth.login':    { fn: handleAuthLogin,    auth: false },
    'auth.me':       { fn: handleAuthMe,       auth: true  },
    'orders.create': { fn: handleOrdersCreate, auth: true  },
    'orders.pay':    { fn: handleOrdersPay,    auth: true  },
    'tickets.list':  { fn: handleTicketsList,  auth: true  },
    'tickets.get':   { fn: handleTicketsGet,   auth: true  },
    'scan.validate': { fn: handleScanValidate, auth: false },
    'admin.seed':    { fn: handleAdminSeed,    auth: false }
  };

  var route = routes[action];
  if (!route) return fail_('action نامعتبر است: ' + action, 404);

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
