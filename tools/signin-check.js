// node tools/signin-check.js <outdir> [dev-index.html]
//
// Browser check for Sign in with Apple and the first-sign-in name step (card 826). Writes one
// page per case; each drives the REAL openers (the gallery's My favourites tab opens
// #signindlg, the dialog's own Apple button, Google's callback) against a stub API, a stub
// AppleID (appleid.auth.js is never fetched) and a stub Google Identity Services. Every result
// is a PASS/FAIL console line; DONE closes the case. Run each printed msedge line.
//
// case-apple  : signed out, both Apple buttons are shown; the dialog's sends Apple the Services
//               ID, the popup flag, scope name, the live redirect and a fresh nonce; the token
//               goes to /api/auth/apple WITH THAT NONCE; a nameless new account then gets the
//               name step, prefilled from Apple's name and focused; typing in it fires no
//               window shortcut; Enter PATCHes /api/me and lands the name in the popover.
// case-named  : Google sign-in to an account that HAS a name: no name step (the negative
//               control for case-apple's prompt), and no PATCH.
// case-later  : Google sign-in to a new nameless account: the step shows; Later closes it with
//               no PATCH; Save with an empty field refuses.
// case-cancel : closing Apple's popup posts nothing and says nothing; the dialog stays on sign-in.
// case-off    : no Services ID (appleClientId ""): both Apple buttons stay hidden and Apple's
//               script is never asked for.
const fs = require("fs"), path = require("path");
const outDir = process.argv[2];
const appFile = process.argv[3] || "dev-index.html";
if (!outDir) { console.error("usage: node tools/signin-check.js <outdir> [dev-index.html]"); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const app = fs.readFileSync(appFile, "utf8");
const CFG_ON = 'appleClientId: "com.kicktro.signin"';
if (app.split(CFG_ON).length !== 2) { console.error("marker not found once: " + CFG_ON); process.exit(2); }
const NL = "\n";

const head = [
  "<script>",
  "(function () {",
  "  var CASE = document.currentScript.dataset.c;",
  "  var fails = 0;",
  "  function ok(name, cond, extra) {",
  "    if (typeof name !== 'string') throw new Error('ok(name, cond): name must be a string');",
  "    if (!cond) fails++;",
  "    console.log((cond ? 'PASS ' : 'FAIL ') + ' ' + CASE + ' :: ' + name + (extra ? '  [' + extra + ']' : ''));",
  "  }",
  "  window.__ok = ok; window.__fails = function () { return fails; };",
  "  requestAnimationFrame = function () { return 0; };",
  "  localStorage.setItem('burnTheWeb.tutorial.v1', '1');",
  "  localStorage.setItem('burnTheWeb.credits.v1', 'off');",
  "  localStorage.setItem('burnTheWeb.v1', JSON.stringify({ panelOpen: false, cycle: false, audio: 'off' }));",
  "  localStorage.removeItem('burnTheWeb.cloud.v2');",
  "  localStorage.removeItem('burnTheWeb.profile.v1');",
  "  localStorage.removeItem('kt.anon.v1');",
  // the two sign-in SDKs, stubbed where the page appends their script tags
  "  window.__scripts = []; window.__appleCfg = null; window.__gcb = null;",
  "  var realAppend = document.head.appendChild.bind(document.head);",
  "  document.head.appendChild = function (n) {",
  "    if (n && n.tagName === 'SCRIPT' && n.src) {",
  "      window.__scripts.push(n.src);",
  "      if (/appleid\\.cdn-apple\\.com/.test(n.src)) {",
  "        window.AppleID = { auth: {",
  "          init: function (c) { window.__appleCfg = c; },",
  "          signIn: function () {",
  "            if (CASE === 'case-cancel') return Promise.reject({ error: 'popup_closed_by_user' });",
  "            return Promise.resolve({ authorization: { id_token: 'apple-jwt', code: 'c', state: window.__appleCfg.state },",
  "              user: { email: 'x@privaterelay.appleid.com', name: { firstName: 'Ada', lastName: 'Lovelace' } } });",
  "          } } };",
  "        setTimeout(function () { n.onload && n.onload(); }, 10);",
  "        return n;",
  "      }",
  "      if (/accounts\\.google\\.com/.test(n.src)) {",
  "        window.google = { accounts: { id: {",
  "          initialize: function (o) { window.__gcb = o.callback; },",
  "          renderButton: function (host) { var b = document.createElement('div'); b.className = 'gsi-stub'; b.textContent = 'Google'; host.appendChild(b); } } } };",
  "        setTimeout(function () { n.onload && n.onload(); }, 10);",
  "        return n;",
  "      }",
  "    }",
  "    return realAppend(n);",
  "  };",
  // the stub API
  "  window.__req = [];",
  "  function answer(status, body) {",
  "    return Promise.resolve({ ok: status >= 200 && status < 300, status: status,",
  "      json: function () { return Promise.resolve(body); }, text: function () { return Promise.resolve(JSON.stringify(body)); } });",
  "  }",
  "  var realFetch = window.fetch;",
  "  window.fetch = function (url, opts) {",
  "    var u = String(url);",
  "    if (u.indexOf('/api/') < 0) return realFetch.apply(this, arguments);",
  "    opts = opts || {};",
  "    var method = (opts.method || 'GET').toUpperCase();",
  "    var p = u.slice(u.indexOf('/api/')), path = p.split('?')[0];",
  "    var body = null; try { body = opts.body ? JSON.parse(opts.body) : null; } catch (e) {}",
  "    window.__req.push({ m: method, p: path, body: body });",
  "    var sess = { token: 'tok-1', expires: Date.now() + 60 * 86400000, created: true, claimed: false, hasProfile: false };",
  "    if (path === '/api/auth/apple' && method === 'POST') return answer(200, Object.assign({ uid: 'ap-uid', name: '' }, sess));",
  "    if (path === '/api/auth/google' && method === 'POST') return answer(200, Object.assign({ uid: 'g-uid', name: CASE === 'case-named' ? 'Existing Name' : '' }, sess));",
  "    if (path === '/api/me' && method === 'PATCH') return answer(200, { uid: 'x', name: body && body.name });",
  "    if (path === '/api/profile' && method === 'GET') return answer(404, { error: 'no profile' });",
  "    if (path === '/api/profile' && method === 'PUT') return answer(200, { updated: 1234 });",
  "    if (path === '/api/me/favs') return answer(200, { ids: [], hates: [] });",
  "    if (path === '/api/me/scenes') return answer(200, { items: [] });",
  "    if (path === '/api/me/gallery') return answer(200, { added: 0, changed: 0, same: 0, hidden: 0, stock: 0 });",
  "    return answer(200, { items: [], builtin: {}, builtinHates: {} });",
  "  };",
  "})();",
  "</script>",
].join(NL);

const tail = [
  "<script>",
  "(function () {",
  "  var CASE = document.currentScript.dataset.c, ok = window.__ok;",
  "  var $ = function (id) { return document.getElementById(id); };",
  "  var reqs = function (re) { return window.__req.filter(function (r) { return re.test(r.m + ' ' + r.p); }); };",
  "  var shown = function (n) { return !!n && n.offsetParent !== null; };",
  "  var done = function () { console.log('DONE ' + CASE + ' fails=' + window.__fails()); };",
  "  var steps = [], at = 0;",
  "  function then(ms, f) { steps.push([ms, f]); }",
  "  function run() { if (at >= steps.length) return; var s = steps[at++]; setTimeout(function () { try { s[1](); } catch (e) { ok('step threw: ' + e.message, false); done(); return; } run(); }, s[0]); }",
  "  var dlgApple = function () { return document.querySelector('#signindlg [data-apple-signin]'); };",
  "  var rowApple = function () { return document.querySelector('#cloudrow [data-apple-signin]') || document.querySelector('#cloudbox [data-apple-signin]'); };",
  "  function key(n, k) { var e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); n.dispatchEvent(e); return e; }",
  // the real opener: a signed-out press on My favourites
  "  function openDialog() { $('galbtn').click(); document.querySelector('.gal-tab[data-tab=mine]').click(); }",
  "  then(2500, function () {",
  "    ok('the page booted signed out', !localStorage.getItem('burnTheWeb.cloud.v2'));",
  "    if (CASE === 'case-off') {",
  "      ok('no Services ID: Apple\\'s script is never asked for', !window.__scripts.some(function (s) { return /apple/.test(s); }), window.__scripts.join(' '));",
  "      ok('...the profile row\\'s Apple button stays hidden', rowApple() && rowApple().parentNode.hidden === true);",
  "      openDialog();",
  "      return;",
  "    }",
  "    ok('signed out, Apple\\'s script is loaded ahead of the click', window.__scripts.some(function (s) { return /appleid\\.cdn-apple\\.com\\/appleauth\\/static\\/jsapi\\/appleid\\/1\\/en_US\\/appleid\\.auth\\.js$/.test(s); }), window.__scripts.join(' '));",
  "    ok('...the profile row has its Apple button, un-hidden', rowApple() && rowApple().parentNode.hidden === false);",
  "    openDialog();",
  "  });",
  "  then(400, function () {",
  "    ok('My favourites, signed out, opens the sign-in dialog', !$('signindlg').classList.contains('hidden'));",
  "    ok('...on its sign-in step', shown($('signin-step')) && !shown($('signin-namestep')) && $('signin-title').textContent === 'Sign in', $('signin-title').textContent);",
  "    ok('...with Google\\'s button drawn', !!document.querySelector('#signin-gsi .gsi-stub'));",
  "    if (CASE === 'case-off') {",
  "      ok('...and NO Apple button without a Services ID', !shown(dlgApple()));",
  "      done(); steps = []; return;",
  "    }",
  "    ok('...and Apple\\'s beside it', shown(dlgApple()) && /Sign in with Apple/.test(dlgApple().textContent));",
  "    if (CASE === 'case-named' || CASE === 'case-later') { window.__gcb({ credential: 'g-jwt' }); return; }",
  "    dlgApple().click();",
  "  });",
  "  then(600, function () {",
  "    if (CASE === 'case-cancel') {",
  "      ok('a closed popup posts nothing', reqs(/^POST \\/api\\/auth\\/apple$/).length === 0);",
  "      ok('...says nothing', $('signin-msg').textContent === '', $('signin-msg').textContent);",
  "      ok('...and the dialog stays on sign-in', !$('signindlg').classList.contains('hidden') && shown($('signin-step')));",
  "      done(); steps = []; return;",
  "    }",
  "    if (CASE === 'case-apple') {",
  "      var c = window.__appleCfg || {};",
  "      ok('Apple is handed the Services ID', c.clientId === 'com.kicktro.signin', c.clientId);",
  "      ok('...in popup mode, asking for the name only', c.usePopup === true && c.scope === 'name', c.scope);",
  "      ok('...with the live site as redirect', c.redirectURI === 'https://kicktro.com/', c.redirectURI);",
  "      ok('...and a fresh 128-bit nonce and state', /^[0-9a-f]{32}$/.test(c.nonce || '') && /^[0-9a-f]{32}$/.test(c.state || '') && c.nonce !== c.state);",
  "      var a = reqs(/^POST \\/api\\/auth\\/apple$/);",
  "      ok('the token goes to /api/auth/apple', a.length === 1 && a[0].body.idToken === 'apple-jwt', a.length);",
  "      ok('...WITH the nonce Apple was given', a[0] && a[0].body.nonce === c.nonce);",
  "      ok('...and never Apple\\'s email', a[0] && JSON.stringify(a[0].body).indexOf('privaterelay') < 0);",
  "    } else {",
  "      var g = reqs(/^POST \\/api\\/auth\\/google$/);",
  "      ok('Google\\'s token goes to /api/auth/google', g.length === 1 && g[0].body.idToken === 'g-jwt', g.length);",
  "    }",
  "    ok('signed in', !!localStorage.getItem('burnTheWeb.cloud.v2'));",
  "    if (CASE === 'case-named') {",
  "      ok('an account with a name gets NO name step', $('signindlg').classList.contains('hidden'));",
  "      ok('...and nothing is PATCHed', reqs(/^PATCH \\/api\\/me$/).length === 0);",
  "      done(); steps = []; return;",
  "    }",
  "    ok('a nameless new account gets the name step', !$('signindlg').classList.contains('hidden') && shown($('signin-namestep')) && !shown($('signin-step')));",
  "    ok('...titled for it', $('signin-title').textContent === 'Choose a profile name', $('signin-title').textContent);",
  "    ok('...with the field focused', document.activeElement === $('signin-name'));",
  "    if (CASE === 'case-later') {",
  "      ok('...empty, with no name to offer', $('signin-name').value === '', $('signin-name').value);",
  "      $('signin-namesave').click();",
  "      ok('Save with an empty field refuses, and stays', !$('signindlg').classList.contains('hidden') && /Type a name/.test($('signin-msg').textContent), $('signin-msg').textContent);",
  "      $('signin-nameskip').click();",
  "      return;",
  "    }",
  "    ok('...prefilled from the name Apple sent', $('signin-name').value === 'Ada Lovelace', $('signin-name').value);",
  "    var hid = function () { return $('panel').classList.contains('hidden'); };",
  "    var panel0 = hid();",
  "    key(document.body, 'm');",
  "    ok('NEGATIVE: m pressed outside the field does toggle the panel', hid() !== panel0, panel0 + ' -> ' + hid());",
  "    key(document.body, 'm');",
  "    key($('signin-name'), 'm');",
  "    ok('typing in it fires no window shortcut (m = the panel)', hid() === panel0, panel0 + ' -> ' + hid());",
  "    $('signin-name').value = 'Ada L';",
  "    key($('signin-name'), 'Enter');",
  "  });",
  "  then(500, function () {",
  "    var p = reqs(/^PATCH \\/api\\/me$/);",
  "    if (CASE === 'case-later') {",
  "      ok('Later closes the step', $('signindlg').classList.contains('hidden'));",
  "      ok('...with nothing PATCHed', p.length === 0);",
  "      ok('...and the dialog is a sign-in again next time', shown($('signin-step')) || $('signin-title').textContent === 'Sign in');",
  "      done(); return;",
  "    }",
  "    ok('Enter PATCHes the name to /api/me', p.length === 1 && p[0].body && p[0].body.name === 'Ada L', JSON.stringify(p[0] && p[0].body));",
  "    ok('...and closes the dialog', $('signindlg').classList.contains('hidden'));",
  "    ok('...the popover carries the name', $('cloud-name').value === 'Ada L' && $('cloud-nameview').textContent === 'Ada L', $('cloud-nameview').textContent);",
  "    ok('...and so does the cache', localStorage.getItem('burnTheWeb.profile.v1') === 'Ada L');",
  "    ok('signed in, the profile row\\'s Apple button goes', $('cloudrow').classList.contains('signed-in') && getComputedStyle(rowApple().parentNode).display === 'none');",
  "    done();",
  "  });",
  "  run();",
  "})();",
  "</script>",
].join(NL);

function build(c) {
  let html = c === "case-off" ? app.split(CFG_ON).join('appleClientId: ""') : app;
  html = html.split("<head>").join("<head>" + head.replace("<script>", "<script data-c=\"" + c + "\">"));
  html = html.split("</body>").join(tail.replace("<script>", "<script data-c=\"" + c + "\">") + "</body>");
  fs.writeFileSync(path.join(outDir, c + ".html"), html);
  console.log("wrote " + c + ".html");
}
const CASES = ["case-apple", "case-named", "case-later", "case-cancel", "case-off"];
CASES.forEach(build);
const abs = path.resolve(outDir).split(path.sep).join("/");
console.log(NL + "run each with:");
for (const c of CASES) {
  console.log('  msedge --headless=new --disable-extensions --enable-logging=stderr --v=0 --virtual-time-budget=15000'
    + ' --user-data-dir="' + abs + '/ud-' + c + '" "file:///' + abs + '/' + c + '.html" 2>&1 | grep -oE \'"(PASS|FAIL|DONE)[^"]*"\'');
}
