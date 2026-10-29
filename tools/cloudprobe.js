#!/usr/bin/env node
// Cloud profiles — client probe.
//
//   node tools/cloudprobe.js dev-index.html
//
// Slices the REAL cloud client out of the built file. Two kinds of assertion:
//
// BEHAVIOUR, run in Node with stubbed fetch/localStorage/location: which API base the page
// talks to (the kill switch, and the ?api= dev override that must never work on a real host),
// the session's lifetime (renewed inside its last week, signed out when expired or revoked —
// never a retry loop), the If-Match header the save precondition becomes, and that an old
// Firebase session is dropped rather than half-used.
//
// STRUCTURE, against the source: a profile's payload is byte-for-byte the same blob a `#zp=`
// preset-bundle link carries. If those two ever diverge, a cloud profile stops being loadable
// through openSharedLibrary and the feature quietly needs its own decoder. That is asserted
// against the source rather than by round-tripping (the codec is the browser's
// CompressionStream, which Node's slice cannot run). The server half is tools/serverprobe.js.
const fs = require("fs");

const file = process.argv[2] || "dev-index.html";
const src = fs.readFileSync(file, "utf8");

function slice(from, to) {
  const a = src.indexOf(from);
  if (a < 0) throw new Error("marker not found: " + from);
  const b = src.indexOf(to, a);
  if (b < 0) throw new Error("marker not found: " + to);
  return src.slice(a, b);
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (typeof name !== "string") throw new Error("ok(name, cond): name must be a string");
  console.log((cond ? "PASS " : "FAIL ") + " " + name + (extra !== undefined ? "  [" + extra + "]" : ""));
  cond ? pass++ : fail++;
}

console.log("--- Cloud profiles: the API client (" + file + ")\n");

// ---- behaviour: which API the page talks to ----------------------------------------------
{
  const head = slice("const API = (function () {", "const cloudOn =");
  const apiFor = (apiBase, href, thumb) => {
    const u = new URL(href);
    return new Function("CLOUD", "location", "THUMB", head + "\n return API;")(apiBase == null ? undefined : { apiBase }, {
      search: u.search, protocol: u.protocol, hostname: u.hostname,
    }, thumb || null);
  };
  ok("a THUMBNAIL render (a hidden copy of the page) talks to no API at all",
     apiFor("https://api.kicktro.com", "https://kicktro.com/", { sink: "parent" }) === "");
  ok("the configured base is used as is, trailing slash dropped",
     apiFor("https://api.kicktro.com/", "https://kicktro.com/") === "https://api.kicktro.com");
  ok("an empty apiBase is the kill switch (no API at all)", apiFor("", "https://kicktro.com/") === "");
  ok("...and so is a missing cloud block", apiFor(null, "https://kicktro.com/") === "");
  ok("?api= points a file:// page at a dev server",
     apiFor("https://api.kicktro.com", "file:///C:/x/dev-index.html?api=http://localhost:8080") === "http://localhost:8080");
  ok("...and a localhost page", apiFor("https://api.kicktro.com", "http://localhost:8000/dev-index.html?api=http://127.0.0.1:9000") === "http://127.0.0.1:9000");
  ok("?api= is IGNORED on the real site (a crafted link cannot move your session)",
     apiFor("https://api.kicktro.com", "https://kicktro.com/?api=https://evil.example") === "https://api.kicktro.com");
  ok("...and an override with a path is refused, not half-used",
     apiFor("https://api.kicktro.com", "file:///x.html?api=http://localhost:8080/steal?x=") === "https://api.kicktro.com");
  const on = slice("const cloudOn =", "const CLOUD_KEY");
  ok("cloudOn is exactly 'there is an API base'", /=>\s*!!API/.test(on), on.trim());
}

// ---- behaviour: the stored session -------------------------------------------------------
{
  const code = slice("const CLOUD_KEY =", "const GIS_SRC") + slice("let cloudSess = null;", "// ---- tokens ----");
  const run = store => {
    const ls = {
      d: { ...store },
      getItem(k) { return k in this.d ? this.d[k] : null; },
      setItem(k, v) { this.d[k] = String(v); },
      removeItem(k) { delete this.d[k]; },
    };
    const sess = new Function("localStorage", code + "\n cloudLoadSess(); return cloudSess;")(ls);
    return { sess, store: ls.d };
  };
  const fb = JSON.stringify({ uid: "fb", idToken: "x", refreshToken: "y", expires: Date.now() + 3600000 });
  let r = run({ "burnTheWeb.cloud.v1": fb });
  ok("an old FIREBASE session is not used", r.sess === null);
  ok("...and is removed from storage", !("burnTheWeb.cloud.v1" in r.store));
  const live = { uid: "u1", token: "kt1.a.b", expires: Date.now() + 86400000 };
  r = run({ "burnTheWeb.cloud.v2": JSON.stringify(live) });
  ok("a live API session is loaded", r.sess && r.sess.token === "kt1.a.b");
  r = run({ "burnTheWeb.cloud.v2": JSON.stringify({ ...live, expires: Date.now() - 1 }) });
  ok("an EXPIRED API session is dropped at load, and forgotten", r.sess === null && !("burnTheWeb.cloud.v2" in r.store));
  r = run({ "burnTheWeb.cloud.v2": "{not json" });
  ok("a corrupt stored session is no session", r.sess === null);
  ok("the session has its own storage key, not the scene blob", /CLOUD_KEY\s*=\s*"burnTheWeb\.cloud\.v2"/.test(src));
}

// ---- behaviour: tokens --------------------------------------------------------------------
(async () => {
  const code = slice("const CLOUD_RENEW_MS", "// A public read");
  const make = (sess, answer) => {
    const calls = [];
    const env = { signedOut: 0 };
    const fetch = (url, opts) => {
      calls.push({ url, opts });
      return Promise.resolve().then(() => answer(url, opts));   // a real fetch REJECTS, never throws
    };
    const api = new Function("fetch", "env", "init",
      "let cloudSess = init; const API = 'https://api.test';"
      + "function cloudSaveSess() {} function cloudSignOut() { cloudSess = null; env.signedOut++; }\n"
      + code + "\n return { cloudFresh, apiFetch, sess: () => cloudSess };")(fetch, env, sess);
    return { api, calls, env };
  };
  const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
  const DAY = 86400000;

  let t = make({ token: "T1", expires: Date.now() + 30 * DAY }, () => json(200, {}));
  ok("a token with weeks left is used without a request", await t.api.cloudFresh() === "T1" && t.calls.length === 0);

  t = make({ token: "T1", expires: Date.now() + 3 * DAY }, () => json(200, { token: "T2", expires: Date.now() + 60 * DAY }));
  const got = await t.api.cloudFresh();
  ok("inside its last week it is RENEWED (POST /api/auth/refresh with the old token)",
     got === "T2" && t.calls.length === 1 && t.calls[0].url === "https://api.test/api/auth/refresh"
     && t.calls[0].opts.headers.Authorization === "Bearer T1", got + " / " + t.calls.length);
  t = make({ token: "T1", expires: Date.now() + 3 * DAY }, () => json(200, { token: "T2", expires: Date.now() + 60 * DAY }));
  await Promise.all([t.api.cloudFresh(), t.api.cloudFresh(), t.api.cloudFresh()]);
  ok("...ONCE, however many calls are waiting on it", t.calls.length === 1, t.calls.length);
  t = make({ token: "T1", expires: Date.now() + 3 * DAY }, () => { throw new Error("offline"); });
  ok("a renewal that fails offline keeps the still-valid token", await t.api.cloudFresh() === "T1" && t.env.signedOut === 0);
  t = make({ token: "T1", expires: Date.now() + 3 * DAY }, () => json(401, { error: "revoked" }));
  let threw = false;
  try { await t.api.cloudFresh(); } catch (e) { threw = true; }
  ok("a renewal answered 401 (revoked) signs out", threw && t.env.signedOut === 1);
  t = make({ token: "T1", expires: Date.now() - 1 }, () => json(200, {}));
  threw = false;
  try { await t.api.cloudFresh(); } catch (e) { threw = true; }
  ok("an expired token signs out WITHOUT a request", threw && t.env.signedOut === 1 && t.calls.length === 0);

  t = make({ token: "T1", expires: Date.now() + 30 * DAY }, () => json(200, { a: 1 }));
  await t.api.apiFetch("/api/profile", { method: "PUT", headers: { "If-Match": "none" }, body: "{}" });
  const h = t.calls[0].opts.headers;
  ok("apiFetch sends the bearer token, JSON, and keeps the caller's headers",
     t.calls[0].url === "https://api.test/api/profile" && h.Authorization === "Bearer T1"
     && h["Content-Type"] === "application/json" && h["If-Match"] === "none");
  t = make({ token: "T1", expires: Date.now() + 30 * DAY }, () => json(401, { error: "sign in required" }));
  const r401 = await t.api.apiFetch("/api/profile", { method: "GET" });
  ok("a 401 signs out and hands the response back — exactly ONE request, no retry loop",
     r401.status === 401 && t.env.signedOut === 1 && t.calls.length === 1, t.calls.length);

  // ---- behaviour: the save precondition becomes If-Match ----------------------------------
  {
    const im = new Function(slice("const cloudIfMatch =", "\n") + "\n return cloudIfMatch;")();
    ok("known-absent profile ⇒ If-Match: none (create only)", JSON.stringify(im("none")) === '{"If-Match":"none"}');
    ok("a seen version ⇒ If-Match: \"<updated>\"", JSON.stringify(im("1761400000000")) === '{"If-Match":"\\"1761400000000\\""}');
    ok("never seen ⇒ no header (an unguarded save)", JSON.stringify(im(null)) === "{}" && JSON.stringify(im(undefined)) === "{}");
  }

  // ---- behaviour: #c= with the API off, and its Firestore fallback ------------------------
  {
    const code2 = slice("function cloudFetchScene(id) {", "// ---- profile name");
    const run = (apiOn, cloud, answer) => {
      const calls = [];
      const fetch = url => { calls.push(url); return Promise.resolve(answer(url)); };
      const fn = new Function("fetch", "CLOUD", "on",
        "const cloudOn = () => on; const API = 'https://api.test';"
        + "function apiGet(p) { return fetch(API + p); }"
        + "function unzipFromB64(p) { return Promise.resolve('json:' + p); }\n" + code2 + "\n return cloudFetchScene;")(fetch, cloud, apiOn);
      return fn("AbCdEfGhIjKlMnOpQrSt").then(res => ({ res, calls }));
    };
    let r = await run(false, { apiKey: "k", projectId: "p" }, () => json(200, {}));
    ok("with the API switched off a #c= link makes NO request at all", r.res === null && r.calls.length === 0, r.calls.join(","));
    r = await run(true, { apiKey: "k", projectId: "p" }, url => json(200, { payload: "P", name: "N" }));
    ok("a link the API knows opens from the API, with its name", r.res && r.res.json === "json:P" && r.res.name === "N"
       && r.calls.length === 1 && r.calls[0] === "https://api.test/api/scenes/AbCdEfGhIjKlMnOpQrSt");
    r = await run(true, { apiKey: "k", projectId: "p" }, url => (url.indexOf("api.test") >= 0 ? json(404, {})
      : json(200, { fields: { payload: { stringValue: "F" }, name: { stringValue: "Old" } } })));
    ok("a link the API does not know falls back to the old Firestore document",
       r.res && r.res.json === "json:F" && r.res.name === "Old" && r.calls.length === 2 && /firestore\.googleapis\.com/.test(r.calls[1]));
    r = await run(true, { apiKey: "", projectId: "p" }, () => json(404, {}));
    ok("...and with no Firebase key there is no fallback request", r.res === null && r.calls.length === 1);
  }

  // ---- structural: the payload IS a preset-bundle blob --------------------------------------
  {
    const blobFn = slice("function cloudBlob() {", "// ---- save / load / delete ----");
    ok("cloudBlob runs the same serializeBlob() the share link does", /serializeBlob\(/.test(blobFn));
    ok("...and carries presets + cycle + curPreset, like libraryUrl",
       /presets:/.test(blobFn) && /cycle:/.test(blobFn) && /curPreset/.test(blobFn));
    const save = slice("function cloudSave() {", "function cloudApplyPayload(");
    ok("save compresses with the share codec (zipToB64)", /zipToB64\(/.test(save));
    ok("...and enforces the same size cap the API does", /maxPayload/.test(save));
    // The save is a FULL REPLACE, so without a server precondition two devices are silent
    // last-write-wins — and the Publish checkbox routes through cloudSave, so ticking it on a
    // stale machine would overwrite a real library with this browser's. Pin the guard, the
    // stale-failure re-arm (a deliberate second Save must overwrite), and that every path
    // that LEARNS the version records it.
    ok("save PUTs with an If-Match built from the last-seen version",
       /method: "PUT"/.test(save) && /cloudIfMatch\(cloudSess\.docTime\)/.test(save));
    ok("...and a 412 re-arms the version instead of leaving Save dead",
       /status === 412/.test(save) && /cloudRearmDocTime\(\)/.test(save));
    ok("...and a successful save records the NEW version", /cloudNoteDocTime\(res\.updated\)/.test(save));
    const loadT = slice("function cloudLoad() {", "function cloudDelete()");
    ok("load records the version it fetched (the precondition compares against it)",
       /cloudNoteDocTime\(d\.updated\)/.test(loadT));
    const meta = slice("function cloudFetchProfileMeta(seedIfMissing) {", "function cloudErr(");
    ok("the meta fetch leaves the payload on the server (?meta=1)", /\/api\/profile\?meta=1/.test(meta));
    ok("...records the version too, and 404 as known-absent",
       /cloudNoteDocTime\(d\.updated\)/.test(meta) && /cloudNoteDocTime\("none"\)/.test(meta));
    // SEEDING A BRAND-NEW ACCOUNT. On a first sign-in with no profile the local library is
    // uploaded, so the account does not start empty. Two things make that safe, and both are
    // easy to lose in a refactor.
    ok("a first sign-in with no profile seeds the account from this machine",
       /seedIfMissing/.test(meta) && /cloudSave\(\)/.test(meta));
    // It can only CREATE: the save's precondition asserts "none" from the docTime this
    // branch just recorded, so seeding can never overwrite a real profile.
    ok("...and the seed runs only AFTER 404 is recorded as known-absent",
       meta.indexOf('cloudNoteDocTime("none")') >= 0 && meta.indexOf('cloudNoteDocTime("none")') < meta.indexOf("cloudSave()"));
    // The startup call must NOT pass the flag, or anyone who deliberately deleted their cloud
    // profile gets it silently re-uploaded on their next visit.
    const startupCall = src.match(/if \(cloudSess\) cloudFetchProfileMeta\(([^)]*)\)/);
    ok("...and the STARTUP meta fetch never seeds", !!startupCall && startupCall[1].trim() === "",
       startupCall ? "cloudFetchProfileMeta(" + startupCall[1] + ")" : "startup call not found");
    const signIn = slice("function cloudSignIn(path, body, nameHint) {", "function cloudSignOut()");
    ok("sign-in hands the provider's token to the API, and seeds", /fetch\(API \+ path/.test(signIn)
       && /\.\.\.body/.test(signIn) && /cloudFetchProfileMeta\(true\)/.test(signIn));
    ok("...Google's callback goes to /api/auth/google",
       /cloudSignIn\("\/api\/auth\/google", \{ idToken: res\.credential \}\)/.test(src));
    // A new account with no name is asked for one — but never one whose profile carries it.
    ok("...and a nameless NEW account is asked for a profile name",
       /if \(!j\.name && !j\.hasProfile\) nameAsk\(/.test(signIn));
    // SIGN IN WITH APPLE. The nonce is what binds Apple's token to THIS press: the same value
    // must go to Apple's init AND to the API, which refuses a token whose nonce differs.
    const apple = slice("// ---- Sign in with Apple", "// ---- share the running scene");
    ok("Apple's script loads only when configured and signed out",
       /if \(!CLOUD\.appleClientId \|\| cloudSess \|\| appleState\) return/.test(apple) && /APPLE_SRC/.test(apple));
    ok("...the nonce goes to Apple's init and to the API alike",
       /usePopup: true, nonce, state/.test(apple)
       && /cloudSignIn\("\/api\/auth\/apple", \{ idToken: a\.id_token, nonce \}/.test(apple));
    ok("...from crypto.getRandomValues, not Math.random", /crypto\.getRandomValues/.test(apple) && !/Math\.random/.test(apple));
    const init0 = slice("function cloudInit() {", "if (el(\"cloud-delete\")");
    ok("...and its buttons stay hidden without a Services ID",
       /h\.hidden = !CLOUD\.appleClientId/.test(init0));
    // ONE decode path for every transport. It lives in a helper rather than inside cloudLoad,
    // which is a seam worth keeping even with a single caller: the moment anything else needs to
    // turn a stored payload into a library, it must come through here, or a cloud payload stops
    // being a #zp= bundle by accident.
    const apply = slice("function cloudApplyPayload(payload) {", "function cloudLoad()");
    ok("the shared apply path expands with the share codec (unzipFromB64)", /unzipFromB64\(/.test(apply));
    ok("...and hands the blob to openSharedLibrary, not a private decoder",
       /openSharedLibrary\(/.test(apply));
    const load = slice("function cloudLoad() {", "function cloudDelete()");
    ok("load decodes through the shared path", /cloudApplyPayload\(/.test(load));
    ok("...and does not unzip on its own", !/unzipFromB64\(/.test(load));
  }

  // ---- structural: shared links and Delete profile ------------------------------------------
  {
    const share = slice("function cloudShareScene() {", "// ---- my shared links");
    ok("sharing POSTs the scene and lets the SERVER mint the id", /apiFetch\("\/api\/scenes", \{ method: "POST"/.test(share));
    ok("...and falls back to the self-contained link on any failure", /\.catch\(\(\) => shareUrl\(\)\)/.test(share));
    const links = slice("// ---- my shared links", "function cloudFetchScene(");
    ok("your shared links are LISTED BY THE SERVER, so every machine's links show", /\/api\/me\/scenes/.test(links));
    ok("...and the old local note is dropped", /removeItem\("burnTheWeb\.sharelinks\.v1"\)/.test(links));
    ok("retracting a link tolerates an already-deleted one", /r\.ok \|\| r\.status === 404/.test(links));
    const del = slice("function cloudDelete() {", "// Read just the metadata");
    // BOTH indices are required to exist. `indexOf` returns -1 for a missing needle, and -1 is
    // less than everything — so the bare `a < b` form PASSES when the sweep has been deleted,
    // which is the one case this assertion exists to catch.
    const at = del.indexOf("shareLinksDeleteAll("), parent = del.indexOf('method: "DELETE"');
    ok("Delete profile sweeps your share links BEFORE deleting the profile",
       at >= 0 && parent >= 0 && at < parent, "sweep at " + at + ", profile delete at " + parent);
    ok("no Firestore write is left anywhere in the client",
       !/firestore\.googleapis\.com[^"]*"\s*\+[^;]*method: "(POST|PATCH|DELETE)"/.test(src)
       && !/currentDocument|signInWithIdp|securetoken|:runQuery/.test(src));
  }

  // ---- structural: the kill switch ---------------------------------------------------------
  {
    const init = slice("function cloudInit() {", "if (el(\"cloud-delete\")");
    ok("cloudInit early-returns when unconfigured", /if\s*\(!cloudOn\(\)\)\s*return/.test(init));
    ok("...before loading any third-party script",
       init.indexOf("!cloudOn()") >= 0 && init.indexOf("!cloudOn()") < init.indexOf("GIS_SRC"), "gate precedes the script append");
    const scene = slice("function cloudFetchScene(id) {", "// ---- profile name");
    ok("a #c= fetch is behind the same switch", /if \(!cloudOn\(\)\) return Promise\.resolve\(null\)/.test(scene));
  }

  console.log("\n" + (fail ? fail + " FAILED, " + pass + " passed" : "all " + pass + " passed"));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
