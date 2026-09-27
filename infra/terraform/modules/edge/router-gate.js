// Viewer-request gate on the 9router distribution, rendered by templatefile(). /admin/router
// hands out /__gate?t=<exp>.<hmac>, good for 5 minutes; this trades it for a cookie good
// for 12 hours and refuses every other request without one. 9router then asks for its own
// password. test/admin-router.test.ts runs this file against lib/admin/router.ts.
var crypto = require('crypto');

var KEY = '${key}';
var COOKIE = 'zhesen_gate';
var COOKIE_SECONDS = 43200;

function sign(kind, exp) {
  return crypto.createHmac('sha256', KEY).update(kind + ':' + exp).digest('hex');
}

function valid(kind, token, now) {
  var m = /^(\d{10})\.([0-9a-f]{64})$/.exec(token || '');
  return m !== null && Number(m[1]) > now && sign(kind, m[1]) === m[2];
}

function refuse() {
  return {
    statusCode: 403,
    statusDescription: 'Forbidden',
    headers: { 'content-type': { value: 'text/plain' }, 'cache-control': { value: 'no-store' } },
    body: 'Open the 9router dashboard from /admin/router.'
  };
}

function handler(event) {
  var request = event.request;
  var now = Math.floor(Date.now() / 1000);
  if (request.uri === '/__gate') {
    var t = request.querystring.t;
    if (!valid('link', t && t.value, now)) return refuse();
    var exp = now + COOKIE_SECONDS;
    var cookies = {};
    cookies[COOKIE] = {
      value: exp + '.' + sign('cookie', exp),
      attributes: 'Path=/; Max-Age=' + COOKIE_SECONDS + '; Secure; HttpOnly; SameSite=Lax'
    };
    return {
      statusCode: 302,
      statusDescription: 'Found',
      headers: { location: { value: '/dashboard' }, 'cache-control': { value: 'no-store' } },
      cookies: cookies
    };
  }
  // Browsers fetch the web app manifest without cookies; it holds only 9router's name and icons.
  if (request.uri === '/manifest.webmanifest') return request;
  var c = request.cookies[COOKIE];
  return valid('cookie', c && c.value, now) ? request : refuse();
}
