#!/usr/bin/env node
// SERVER probe: starts the real API (server/main.js) on a temp SQLite file and a random port,
// with a local stand-in for Google's key endpoint, and drives it over HTTP.
//
//   node tools/serverprobe.js            (any extra argument, e.g. dev-index.html, is ignored)
//
// Google ID tokens are minted here with a throwaway RSA key the stand-in JWKS publishes, so the
// server's REAL verifier runs: signature, algorithm pin, issuer, audience, expiry, unknown kid.
// What it pins (each one replaces something firestore.rules used to enforce, or is new):
//   auth: bad/expired/foreign tokens refused; same Google account => same uid; revocation
//   profile: If-Match none/stale/current (the currentDocument precondition), caps, hasOnly
//   public profiles: private stays 404, published readable signed out, by legacy uid too
//   shares: owner-only create/delete, anonymous get, no listing, per-user rate limit
//   gallery: publish, sort by favourites vs newest vs name, filter, idempotent favs, built-in favs,
//            delete takes its favourites with it; dislikes: one vote per person (a 💔 clears
//            the ♥ and back), Most loved sorts by loves minus dislikes, built-in dislikes ride
//            along as builtinHates, a removed scene takes its dislikes
//   admin: token required, thumbnail upload checks magic bytes, versioned immutable files,
//          Range replies, old version removed; Firebase import is idempotent and maps accounts
//   every scene a card (PUT /api/me/gallery): an edit is public only once an hour old (PENDING_MS,
//          1.5 s here), a further edit restarts the hour, an older copy is ignored, stock and
//          borrowed scenes are not cards, a scene gone hides its card (votes kept), hand-published
//          and backfilled cards are adopted; anonymous accounts: per-IP limit, push only (no
//          profile, links or votes), Anonymous author, claimed on Google sign-in; the backfill
//          (dry run changes nothing, insert-only, idempotent); a promoted edit re-renders
//   cors, body limit, account deletion, data surviving a restart (migrations re-run cleanly),
//   migration 3 over a v2 database
"use strict";
const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "ktsrv-"));
const CLIENT = "probe-client.apps.googleusercontent.com";
const ADMIN = "probe-admin-token-0123456789abcdef";
const PENDING = 1500;   // the gallery's hour (PENDING_MS), shortened so the probe can wait it out
let fails = 0, passes = 0;
function ok(name, cond, extra) {
  if (typeof name !== "string") throw new Error("ok(name, cond): name must be a string");
  if (cond) passes++; else fails++;
  console.log((cond ? "PASS " : "FAIL ") + name + (extra !== undefined && !cond ? "  [" + extra + "]" : ""));
}

// ---- a stand-in for https://www.googleapis.com/oauth2/v3/certs ----------------------------
const good = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const rogue = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
let jwksHits = 0;
const jwks = http.createServer((req, res) => {
  jwksHits++;
  const k = good.publicKey.export({ format: "jwk" });
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" });
  res.end(JSON.stringify({ keys: [{ ...k, kid: "k1", alg: "RS256", use: "sig" }] }));
});

const b64u = o => Buffer.from(JSON.stringify(o)).toString("base64url");
function idToken(sub, over = {}, { key = good.privateKey, kid = "k1", alg = "RS256" } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u({ alg, kid, typ: "JWT" });
  const c = b64u({ iss: "https://accounts.google.com", aud: CLIENT, sub, iat: now, exp: now + 3600, ...over });
  const sig = alg === "none" ? "" : crypto.sign("RSA-SHA256", Buffer.from(h + "." + c), key).toString("base64url");
  return h + "." + c + "." + sig;
}

// ---- the server under test --------------------------------------------------------------
let proc = null, base = "", extraEnv = {};
function start(db = path.join(TMP, "kt.db")) {
  return new Promise((resolve, reject) => {
    proc = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", path.join(ROOT, "server", "main.js")], {
      env: {
        ...process.env, PORT: "0", HOST: "127.0.0.1", QUIET: "1",
        DB_PATH: db, PENDING_MS: String(PENDING), THUMB_DIR: path.join(TMP, "thumbs"),
        GOOGLE_CLIENT_ID: CLIENT, GOOGLE_JWKS_URL: "http://127.0.0.1:" + jwks.address().port + "/certs",
        SESSION_SECRET: "probe-session-secret-0123456789abcdef", ADMIN_TOKEN: ADMIN,
        ALLOWED_ORIGINS: "https://kicktro.com", ALLOW_DEV_ORIGINS: "0", GIT_REV: "probe", ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const timer = setTimeout(() => reject(new Error("server did not start: " + out)), 10000);
    proc.stdout.on("data", d => {
      out += d;
      const m = /listening on :(\d+)/.exec(out);
      if (m) { clearTimeout(timer); base = "http://127.0.0.1:" + m[1]; resolve(); }
    });
    proc.stderr.on("data", d => { out += d; process.stderr.write("  server: " + d); });
    proc.on("exit", c => { if (!base) { clearTimeout(timer); reject(new Error("server exited " + c + ": " + out)); } });
  });
}
function stop() {
  return new Promise(resolve => {
    if (!proc || proc.exitCode !== null) return resolve();
    proc.once("exit", () => resolve());
    proc.kill();
  });
}

async function call(method, p, { token, body, headers = {}, raw } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = "Bearer " + token;
  let payload;
  if (raw !== undefined) payload = raw;
  else if (body !== undefined) { payload = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const r = await fetch(base + p, { method, headers: h, body: payload });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
  return { status: r.status, json, text, headers: r.headers };
}
async function signIn(sub) {
  const r = await call("POST", "/api/auth/google", { body: { idToken: idToken(sub) } });
  return r.json;
}
const PAY = "eJzLSM3JyVcozy_KSQEAGgQEXQ";   // any base64url string will do; the server never decodes it

async function main() {
  await new Promise(r => jwks.listen(0, "127.0.0.1", r));
  await start();

  let r = await call("GET", "/api/health");
  ok("health answers with the schema version", r.status === 200 && r.json.ok && r.json.schema >= 1, r.text);

  // ---- auth --------------------------------------------------------------------------------
  r = await call("POST", "/api/auth/google", { body: {} });
  ok("auth: no idToken is 401", r.status === 401, r.status);
  r = await call("POST", "/api/auth/google", { body: { idToken: "a.b.c" } });
  ok("auth: garbage token is 401", r.status === 401, r.status);
  r = await call("POST", "/api/auth/google", { body: { idToken: idToken("s1", { aud: "someone-else" }) } });
  ok("auth: wrong audience is 401", r.status === 401 && /audience/.test(r.json.error), r.text);
  r = await call("POST", "/api/auth/google", { body: { idToken: idToken("s1", { iss: "https://evil.example" }) } });
  ok("auth: wrong issuer is 401", r.status === 401 && /issuer/.test(r.json.error), r.text);
  r = await call("POST", "/api/auth/google", { body: { idToken: idToken("s1", { exp: Math.floor(Date.now() / 1000) - 600 }) } });
  ok("auth: expired token is 401", r.status === 401 && /expired/.test(r.json.error), r.text);
  r = await call("POST", "/api/auth/google", { body: { idToken: idToken("s1", {}, { key: rogue.privateKey }) } });
  ok("auth: a token signed by another key is 401", r.status === 401 && /signature/.test(r.json.error), r.text);
  r = await call("POST", "/api/auth/google", { body: { idToken: idToken("s1", {}, { alg: "none" }) } });
  ok("auth: alg none is 401", r.status === 401, r.text);
  const hitsBefore = jwksHits;
  r = await call("POST", "/api/auth/google", { body: { idToken: idToken("s1", {}, { kid: "k9" }) } });
  ok("auth: an unknown kid is 401", r.status === 401 && /signing key/.test(r.json.error), r.text);
  await call("POST", "/api/auth/google", { body: { idToken: idToken("s1", {}, { kid: "k8" }) } });
  ok("auth: unknown kids refetch the keys at most once per 30 s", jwksHits - hitsBefore <= 1, jwksHits - hitsBefore);

  const A = await signIn("google-sub-A");
  ok("auth: a good token signs in and creates the account", A && A.token && A.uid && A.created === true, JSON.stringify(A));
  const A2 = await signIn("google-sub-A");
  ok("auth: the same Google account gets the same uid", A2.uid === A.uid && A2.created === false);
  const B = await signIn("google-sub-B");
  ok("auth: another Google account gets another uid", B.uid && B.uid !== A.uid);
  ok("ids are 20 characters of [A-Za-z0-9]", /^[A-Za-z0-9]{20}$/.test(A.uid), A.uid);

  r = await call("GET", "/api/me", { token: A.token });
  ok("me: signed in", r.status === 200 && r.json.uid === A.uid, r.text);
  r = await call("GET", "/api/me");
  ok("me: signed out is 401", r.status === 401);
  const forged = A.token.slice(0, -2) + (A.token.slice(-2) === "AA" ? "BB" : "AA");
  r = await call("GET", "/api/me", { token: forged });
  ok("me: a tampered session token is 401", r.status === 401);
  r = await call("POST", "/api/auth/refresh", { token: A.token });
  ok("refresh hands out a new working token", r.status === 200 && (await call("GET", "/api/me", { token: r.json.token })).status === 200);

  // ---- profile ------------------------------------------------------------------------------
  r = await call("GET", "/api/profile", { token: A.token });
  ok("profile: none yet is 404", r.status === 404);
  const prof = { name: "Alice", payload: PAY, count: 3, pub: false };
  r = await call("PUT", "/api/profile", { token: A.token, body: prof, headers: { "If-Match": "none" } });
  ok("profile: create with If-Match none", r.status === 200 && r.json.updated > 0, r.text);
  const v1 = r.json.updated;
  r = await call("PUT", "/api/profile", { token: A.token, body: prof, headers: { "If-Match": "none" } });
  ok("profile: If-Match none over an existing profile is 412", r.status === 412, r.status);
  r = await call("PUT", "/api/profile", { token: A.token, body: prof, headers: { "If-Match": '"' + (v1 - 5) + '"' } });
  ok("profile: a stale If-Match is 412", r.status === 412, r.status);
  r = await call("PUT", "/api/profile", { token: A.token, body: { ...prof, count: 4 }, headers: { "If-Match": '"' + v1 + '"' } });
  ok("profile: the current If-Match saves and moves the version forward", r.status === 200 && r.json.updated > v1, r.text);
  r = await call("GET", "/api/profile", { token: A.token });
  ok("profile: reads back what was saved, with an ETag", r.status === 200 && r.json.count === 4 && r.json.payload === PAY
    && r.headers.get("etag") === '"' + r.json.updated + '"', r.text);
  const full = r.json;
  r = await call("GET", "/api/profile?meta=1", { token: A.token });
  ok("profile: ?meta=1 is the same answer without the payload", r.status === 200 && !("payload" in r.json)
    && r.json.count === full.count && r.json.updated === full.updated && r.json.name === full.name, r.text);
  r = await call("PUT", "/api/profile", { token: A.token, body: { ...prof, name: "x".repeat(41) } });
  ok("profile: a 41-character name is 400", r.status === 400, r.status);
  r = await call("PUT", "/api/profile", { token: A.token, body: { ...prof, payload: "A".repeat(300000) } });
  ok("profile: a 300000-character payload is 400", r.status === 400, r.status);
  r = await call("PUT", "/api/profile", { token: A.token, body: { ...prof, payload: "not base64!" } });
  ok("profile: a non-base64 payload is 400", r.status === 400, r.status);
  r = await call("PUT", "/api/profile", { token: A.token, body: { ...prof, count: 501 } });
  ok("profile: count 501 is 400", r.status === 400, r.status);
  r = await call("PUT", "/api/profile", { token: A.token, body: { ...prof, extra: 1 } });
  ok("profile: an unknown field is 400", r.status === 400 && /unknown field/.test(r.json.error), r.text);
  r = await call("PUT", "/api/profile", { token: A.token, raw: JSON.stringify({ ...prof, payload: "A".repeat(500000) }),
    headers: { "Content-Type": "application/json" } });
  ok("a body past the route's limit is 413", r.status === 413, r.status);

  // ---- public profiles ----------------------------------------------------------------------
  r = await call("GET", "/api/profiles/" + A.uid);
  ok("public profile: private is 404 signed out", r.status === 404);
  r = await call("GET", "/api/profiles/" + A.uid, { token: B.token });
  ok("public profile: private is 404 to someone else", r.status === 404);
  r = await call("GET", "/api/profiles/" + A.uid, { token: A.token });
  ok("public profile: private is readable by its owner", r.status === 200);
  await call("PUT", "/api/profile", { token: A.token, body: { ...prof, pub: true } });
  r = await call("GET", "/api/profiles/" + A.uid);
  ok("public profile: published is readable signed out", r.status === 200 && r.json.payload === PAY);
  r = await call("GET", "/api/profiles");
  ok("public profile: the listing has it, without payloads", r.status === 200
    && r.json.items.some(x => x.uid === A.uid && x.name === "Alice") && r.json.items.every(x => !("payload" in x)), r.text);

  // ---- share links --------------------------------------------------------------------------
  r = await call("POST", "/api/scenes", { body: { name: "S", payload: PAY } });
  ok("share: signed out is 401", r.status === 401);
  r = await call("POST", "/api/scenes", { token: A.token, body: { name: "Shared one", payload: PAY } });
  ok("share: create", r.status === 200 && /^[A-Za-z0-9]{20}$/.test(r.json.id), r.text);
  const sid = r.json.id;
  r = await call("GET", "/api/scenes/" + sid);
  ok("share: anyone opens it by id", r.status === 200 && r.json.payload === PAY && r.json.name === "Shared one");
  r = await call("GET", "/api/scenes");
  ok("share: there is no listing", r.status === 404 || r.status === 405, r.status);
  r = await call("GET", "/api/me/scenes", { token: A.token });
  ok("share: the owner sees their own links", r.json.items.some(x => x.id === sid));
  r = await call("DELETE", "/api/scenes/" + sid, { token: B.token });
  ok("share: someone else cannot delete it", r.status === 403, r.status);
  r = await call("DELETE", "/api/scenes/" + sid, { token: A.token });
  ok("share: the owner deletes it", r.status === 200);
  r = await call("GET", "/api/scenes/" + sid);
  ok("share: gone after delete", r.status === 404);
  const C = await signIn("google-sub-C");
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await call("POST", "/api/scenes", { token: C.token, body: { name: "n" + i, payload: PAY } })).status;
  ok("share: the 31st link in an hour is 429", last === 429, last);

  // ---- gallery ------------------------------------------------------------------------------
  r = await call("POST", "/api/gallery", { token: A.token, body: { name: "", payload: PAY } });
  ok("gallery: a scene needs a name", r.status === 400);
  const a1 = (await call("POST", "/api/gallery", { token: A.token, body: { name: "Neon Reef", payload: PAY } })).json.id;
  const a2 = (await call("POST", "/api/gallery", { token: A.token, body: { name: "Storm Front", payload: PAY } })).json.id;
  await new Promise(res => setTimeout(res, 5));
  const b1 = (await call("POST", "/api/gallery", { token: B.token, body: { name: "Deep Glass", payload: PAY } })).json.id;
  ok("gallery: three scenes published", a1 && a2 && b1);
  r = await call("PUT", "/api/gallery/" + a1 + "/fav");
  ok("fav: signed out is 401", r.status === 401);
  await call("PUT", "/api/gallery/" + a1 + "/fav", { token: B.token });
  await call("PUT", "/api/gallery/" + a1 + "/fav", { token: A.token });
  r = await call("PUT", "/api/gallery/" + a1 + "/fav", { token: A.token });
  ok("fav: favouriting twice counts once", r.status === 200 && r.json.favs === 2 && r.json.mine === true, r.text);
  await call("PUT", "/api/gallery/" + a2 + "/fav", { token: B.token });
  r = await call("GET", "/api/gallery");
  ok("gallery: sorted by favourites by default", r.status === 200
    && r.json.items.map(x => x.id).join() === [a1, a2, b1].join() && r.json.items[0].favs === 2, r.text);
  ok("gallery: rows carry the author and no payload", r.json.items[0].author === "Alice" && !("payload" in r.json.items[0]));
  ok("gallery: no thumbnail yet means null poster and clip", r.json.items[0].poster === null && r.json.items[0].clip === null);
  r = await call("GET", "/api/gallery?sort=new");
  ok("gallery: sort=new puts the newest first", r.json.items[0].id === b1, r.text);
  r = await call("GET", "/api/gallery?sort=name");
  ok("gallery: sort=name is A to Z", r.json.sort === "name"
    && r.json.items.map(x => x.id).join() === [b1, a1, a2].join(), r.text);
  r = await call("GET", "/api/gallery?q=storm");
  ok("gallery: q filters by name", r.json.total === 1 && r.json.items[0].id === a2, r.text);
  r = await call("GET", "/api/gallery?q=alice");
  ok("gallery: q filters by author", r.json.total === 2, r.text);
  r = await call("GET", "/api/gallery?limit=1&offset=1");
  ok("gallery: limit and offset page it", r.json.items.length === 1 && r.json.items[0].id === a2 && r.json.total === 3, r.text);
  r = await call("DELETE", "/api/gallery/" + a1 + "/fav", { token: A.token });
  ok("fav: un-favourite drops the count", r.json.favs === 1 && r.json.mine === false, r.text);
  r = await call("PUT", "/api/gallery/NoSuchScene1234567890/fav", { token: A.token });
  ok("fav: an unknown scene is 404", r.status === 404);
  r = await call("PUT", "/api/gallery/builtin:neon-reef/fav", { token: A.token });
  ok("fav: a built-in scene can be favourited", r.status === 200 && r.json.favs === 1, r.text);
  r = await call("GET", "/api/gallery");
  ok("gallery: built-in favourite counts ride along", r.json.builtin["builtin:neon-reef"] === 1, r.text);
  r = await call("GET", "/api/me/favs", { token: B.token });
  ok("fav: my favourites", r.json.ids.includes(a1) && r.json.ids.includes(a2), r.text);
  r = await call("GET", "/api/gallery?mine=favs");
  ok("gallery: mine=favs needs a session", r.status === 401, r.status);
  r = await call("GET", "/api/gallery?mine=favs", { token: B.token });
  ok("gallery: mine=favs lists only my favourites", r.status === 200 && r.json.total === 2
    && r.json.items.map(x => x.id).sort().join() === [a1, a2].sort().join(), r.text);
  r = await call("GET", "/api/gallery?mine=favs&q=storm", { token: B.token });
  ok("gallery: ...and filters like the other tabs", r.json.total === 1 && r.json.items[0].id === a2, r.text);
  r = await call("GET", "/api/gallery?mine=own");
  ok("gallery: mine=own needs a session", r.status === 401, r.status);
  r = await call("GET", "/api/gallery?mine=own&sort=new", { token: A.token });
  ok("gallery: mine=own lists only the scenes I published, newest first", r.status === 200 && r.json.total === 2
    && r.json.items.map(x => x.id).join() === [a2, a1].join(), r.text);
  ok("gallery: ...privately", /no-store/.test(r.headers.get("cache-control") || ""), r.headers.get("cache-control"));
  r = await call("GET", "/api/gallery?mine=own", { token: B.token });
  ok("gallery: ...someone else's are not mine", r.json.total === 1 && r.json.items[0].id === b1, r.text);
  r = await call("GET", "/api/gallery?mine=own&q=storm", { token: A.token });
  ok("gallery: ...and filters like the other tabs", r.json.total === 1 && r.json.items[0].id === a2, r.text);
  r = await call("GET", "/api/gallery?mine=own", { token: C.token });
  ok("gallery: ...none published, none listed", r.status === 200 && r.json.total === 0 && r.json.items.length === 0, r.text);
  r = await call("GET", "/api/gallery/" + a1);
  ok("gallery: one scene with its payload", r.status === 200 && r.json.payload === PAY && r.json.favs === 1);
  // ---- dislikes ---------------------------------------------------------------------------
  // a1 has B's ♥ (1), a2 has B's ♥ (1), b1 nothing. Two 💔 on a2 put it below b1.
  r = await call("PUT", "/api/gallery/" + a2 + "/hate");
  ok("hate: signed out is 401", r.status === 401);
  await call("PUT", "/api/gallery/" + a2 + "/hate", { token: A.token });
  await call("PUT", "/api/gallery/" + a2 + "/hate", { token: C.token });
  r = await call("PUT", "/api/gallery/" + a2 + "/hate", { token: C.token });
  ok("hate: disliking twice counts once", r.status === 200 && r.json.hates === 2 && r.json.hate === true
    && r.json.mine === false && r.json.favs === 1, r.text);
  r = await call("GET", "/api/gallery");
  ok("gallery: Most loved sorts by loves minus dislikes", r.json.items.map(x => x.id).join() === [a1, b1, a2].join()
    && r.json.items[2].hates === 2 && r.json.items[2].favs === 1, r.text);
  r = await call("PUT", "/api/gallery/" + a2 + "/hate", { token: B.token });
  ok("hate: a 💔 takes back your ♥", r.json.hate === true && r.json.mine === false && r.json.favs === 0 && r.json.hates === 3, r.text);
  r = await call("PUT", "/api/gallery/" + a2 + "/fav", { token: B.token });
  ok("fav: a ♥ takes back your 💔", r.json.mine === true && r.json.hate === false && r.json.favs === 1 && r.json.hates === 2, r.text);
  r = await call("DELETE", "/api/gallery/" + a2 + "/hate", { token: C.token });
  ok("hate: taking it back drops the count", r.json.hate === false && r.json.hates === 1, r.text);
  r = await call("GET", "/api/me/favs", { token: A.token });
  ok("hate: my dislikes ride beside my favourites", Array.isArray(r.json.hates) && r.json.hates.includes(a2)
    && !r.json.ids.includes(a2), r.text);
  r = await call("PUT", "/api/gallery/NoSuchScene1234567890/hate", { token: A.token });
  ok("hate: an unknown scene is 404", r.status === 404);
  r = await call("PUT", "/api/gallery/builtin:neon-reef/hate", { token: C.token });
  ok("hate: a built-in scene can be disliked", r.status === 200 && r.json.hates === 1 && r.json.favs === 1, r.text);
  r = await call("GET", "/api/gallery");
  ok("gallery: built-in dislikes ride along apart from the loves", r.json.builtinHates["builtin:neon-reef"] === 1
    && r.json.builtin["builtin:neon-reef"] === 1, r.text);
  r = await call("GET", "/api/gallery/" + a2);
  ok("gallery: one scene carries its dislikes", r.json.hates === 1 && r.json.favs === 1, r.text);
  await call("PUT", "/api/gallery/" + a1 + "/hate", { token: C.token });
  r = await call("DELETE", "/api/gallery/" + a2, { token: B.token });
  ok("gallery: someone else cannot remove it", r.status === 403, r.status);

  // ---- admin: thumbnails ---------------------------------------------------------------------
  r = await call("GET", "/api/admin/thumbs/todo");
  ok("admin: no token is 401", r.status === 401);
  r = await call("GET", "/api/admin/thumbs/todo", { token: A.token });
  ok("admin: a user token is not an admin token", r.status === 401);
  r = await call("GET", "/api/admin/thumbs/todo", { token: ADMIN });
  ok("admin: todo lists the scenes without thumbnails, with payloads", r.status === 200
    && r.json.items.length === 3 && r.json.items[0].payload === PAY, r.text);
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), crypto.randomBytes(200)]);
  const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom"), crypto.randomBytes(5000)]);
  // A WebP header carrying a canvas size, in each of the three first-chunk layouts.
  function webpOf(kind, w, h, len = 400) {
    const b = crypto.randomBytes(len);
    b.write("RIFF", 0, "latin1"); b.writeUInt32LE(len - 8, 4); b.write("WEBP" + kind, 8, "latin1");
    b.writeUInt32LE(len - 20, 16);
    if (kind === "VP8 ") { b[23] = 0x9d; b[24] = 0x01; b[25] = 0x2a; b.writeUInt16LE(w, 26); b.writeUInt16LE(h, 28); }
    if (kind === "VP8L") { b[20] = 0x2f; b.writeUInt32LE(((w - 1) | ((h - 1) << 14)) >>> 0, 21); }
    if (kind === "VP8X") { b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); }
    return b;
  }
  r = await call("PUT", "/api/admin/thumbs/" + a1, { token: ADMIN, body: { poster: mp4.toString("base64"), clip: mp4.toString("base64") } });
  ok("thumbs: a poster that is not WebP is 400", r.status === 400, r.text);
  r = await call("PUT", "/api/admin/thumbs/" + a1, { token: ADMIN, body: { poster: webp.toString("base64"), clip: mp4.toString("base64") } });
  ok("thumbs: upload sets version 1", r.status === 200 && r.json.thumb_ver === 1 && r.json.poster === "/thumbs/" + a1 + "-1.webp", r.text);
  r = await call("GET", "/thumbs/" + a1 + "-1.webp");
  ok("thumbs: served back byte for byte, cached forever", r.status === 200
    && /immutable/.test(r.headers.get("cache-control")) && r.headers.get("content-type") === "image/webp"
    && Buffer.from(await (await fetch(base + "/thumbs/" + a1 + "-1.webp")).arrayBuffer()).equals(webp));
  const rr = await fetch(base + "/thumbs/" + a1 + "-1.mp4", { headers: { Range: "bytes=100-199" } });
  const part = Buffer.from(await rr.arrayBuffer());
  ok("thumbs: a Range request gets 206 and exactly that slice", rr.status === 206 && part.equals(mp4.subarray(100, 200))
    && rr.headers.get("content-range") === "bytes 100-199/" + mp4.length, rr.status + " " + rr.headers.get("content-range"));
  r = await call("GET", "/api/gallery?sort=new");
  ok("thumbs: the listing points at the files", r.json.items.find(x => x.id === a1).clip === "/thumbs/" + a1 + "-1.mp4");
  r = await call("GET", "/api/admin/thumbs/todo", { token: ADMIN });
  ok("thumbs: a rendered scene leaves the todo list", r.json.items.length === 2 && !r.json.items.some(x => x.id === a1));
  r = await call("PUT", "/api/admin/thumbs/" + a1, { token: ADMIN, body: { poster: webp.toString("base64"), clip: mp4.toString("base64") } });
  ok("thumbs: a re-render is version 2", r.json.thumb_ver === 2);
  await new Promise(res => setTimeout(res, 100));
  ok("thumbs: the old version's files are removed", (await call("GET", "/thumbs/" + a1 + "-1.webp")).status === 404
    && (await call("GET", "/thumbs/" + a1 + "-2.webp")).status === 200);
  r = await call("GET", "/thumbs/..%2F..%2Fkt.db");
  ok("thumbs: path traversal is 404", r.status === 404, r.status);

  // ---- a visitor's poster (the first browser to open a card with no thumbnail renders it) ----
  r = await call("PUT", "/api/gallery/" + a2 + "/thumb", { body: { poster: mp4.toString("base64") } });
  ok("viewer thumb: not a WebP is 400", r.status === 400, r.text);
  r = await call("PUT", "/api/gallery/" + a2 + "/thumb", { body: { poster: webp.toString("base64") } });
  ok("viewer thumb: a WebP with no readable size is 400", r.status === 400, r.text);
  for (const [kind, w, h] of [["VP8 ", 480, 271], ["VP8L", 640, 270], ["VP8X", 960, 540]]) {
    r = await call("PUT", "/api/gallery/" + a2 + "/thumb", { body: { poster: webpOf(kind, w, h).toString("base64") } });
    ok("viewer thumb: " + kind.trim() + " " + w + "x" + h + " is the wrong size, 400", r.status === 400, r.text);
  }
  r = await call("PUT", "/api/gallery/" + a2 + "/thumb", { body: { poster: webpOf("VP8X", 480, 270, 300 << 10).toString("base64") } });
  ok("viewer thumb: over 256 KB is refused", r.status === 400 || r.status === 413, r.status);
  r = await call("PUT", "/api/gallery/" + a2 + "/thumb", { body: { poster: webpOf("VP8X", 480, 270).toString("base64"), clip: "x" } });
  ok("viewer thumb: only a poster may be sent", r.status === 400, r.text);
  r = await call("PUT", "/api/gallery/nosuchcard01/thumb", { body: { poster: webpOf("VP8 ", 480, 270).toString("base64") } });
  ok("viewer thumb: an unknown card is 404", r.status === 404, r.text);
  const vp = webpOf("VP8 ", 480, 270);
  r = await call("PUT", "/api/gallery/" + a2 + "/thumb", { body: { poster: vp.toString("base64") } });
  ok("viewer thumb: a 480x270 poster on a card with none is taken, signed out, as a poster only",
    r.status === 200 && r.json.thumb_ver === 1 && r.json.clip === null && r.json.poster === "/thumbs/" + a2 + "-1.webp", r.text);
  ok("viewer thumb: ...served back byte for byte",
    Buffer.from(await (await fetch(base + "/thumbs/" + a2 + "-1.webp")).arrayBuffer()).equals(vp));
  r = await call("GET", "/api/gallery?sort=new");
  let c2 = r.json.items.find(x => x.id === a2);
  ok("viewer thumb: the listing has the poster and no clip", c2.poster === "/thumbs/" + a2 + "-1.webp" && c2.clip === null
    && !("stale" in c2), JSON.stringify(c2));
  r = await call("PUT", "/api/gallery/" + a2 + "/thumb", { body: { poster: webpOf("VP8L", 480, 270).toString("base64") } });
  ok("viewer thumb: the first one wins (409 after)", r.status === 409, r.text);
  r = await call("GET", "/api/admin/thumbs/todo", { token: ADMIN });
  ok("viewer thumb: a visitor's poster stays on the admin todo list", r.json.items.some(x => x.id === a2), r.text);
  await call("PUT", "/api/admin/thumbs/" + a2, { token: ADMIN, body: { poster: webp.toString("base64"), clip: mp4.toString("base64") } });
  r = await call("GET", "/api/admin/thumbs/todo", { token: ADMIN });
  c2 = (await call("GET", "/api/gallery/" + a2)).json;
  ok("viewer thumb: ...until a real render replaces it, clip and all", !r.json.items.some(x => x.id === a2)
    && c2.poster === "/thumbs/" + a2 + "-2.webp" && c2.clip === "/thumbs/" + a2 + "-2.mp4", r.text + " " + JSON.stringify(c2));
  r = await call("PUT", "/api/gallery/" + a2 + "/thumb", { body: { poster: vp.toString("base64") } });
  ok("viewer thumb: a card with a real render refuses a visitor's poster", r.status === 409, r.text);

  // ---- gallery delete takes its favourites ----------------------------------------------
  r = await call("DELETE", "/api/gallery/" + a1, { token: A.token });
  ok("gallery: the owner removes a scene", r.status === 200);
  r = await call("GET", "/api/me/favs", { token: B.token });
  ok("gallery: removing a scene removes its favourites", !r.json.ids.includes(a1) && r.json.ids.includes(a2), r.text);
  r = await call("GET", "/api/me/favs", { token: C.token });
  ok("gallery: ...and its dislikes", !r.json.hates.includes(a1) && r.json.hates.includes("builtin:neon-reef"), r.text);
  await new Promise(res => setTimeout(res, 100));
  ok("gallery: removing a scene removes its thumbnail", (await call("GET", "/thumbs/" + a1 + "-2.webp")).status === 404);

  // ---- admin: Firebase import ----------------------------------------------------------------
  const FB = "FirebaseUid0000000000000001";
  const FSID = "AbCdEfGhIjKlMnOpQrSt";
  const imp = {
    users: [{ firebase_uid: FB, google_sub: "google-sub-old", name: "Oldtimer" },
            { firebase_uid: "FirebaseUidForA00000000001", google_sub: "google-sub-A", name: "Alice" },
            { firebase_uid: "x", google_sub: "g" }],
    profiles: [{ firebase_uid: FB, name: "Oldtimer", payload: PAY, count: 7, pub: true, updated: "2026-09-01T10:00:00Z" },
               { firebase_uid: "NobodyNobodyNobody01", name: "?", payload: PAY, count: 1, pub: true }],
    shares: [{ id: FSID, owner_firebase_uid: FB, name: "Old link", payload: PAY, created: "2026-08-01T00:00:00Z" },
             { id: "OrphanOrphanOrphan01", owner_firebase_uid: "gone", name: "Orphan", payload: PAY }],
  };
  r = await call("POST", "/api/admin/import", { body: imp });
  ok("import: needs the admin token", r.status === 401);
  r = await call("POST", "/api/admin/import", { token: ADMIN, body: imp });
  ok("import: adds users, links an account that already signed in, reports bad rows", r.status === 200
    && r.json.users.added === 1 && r.json.users.linked === 1 && r.json.profiles.added === 1
    && r.json.shares.added === 2 && r.json.errors.length === 2, r.text);
  r = await call("POST", "/api/admin/import", { token: ADMIN, body: imp });
  ok("import: running it again adds nothing", r.json.users.added === 0 && r.json.profiles.added === 0
    && r.json.profiles.updated === 0 && r.json.shares.added === 0, r.text);
  const older = { profiles: [{ ...imp.profiles[0], count: 3, updated: "2026-08-01T10:00:00Z" }] };
  r = await call("POST", "/api/admin/import", { token: ADMIN, body: older });
  ok("import: an OLDER copy of a profile is skipped", r.json.profiles.skipped === 1 && r.json.profiles.updated === 0, r.text);
  r = await call("GET", "/api/profiles/" + FB);
  ok("import: and the stored profile is untouched", r.json.count === 7, r.text);
  const newer = { profiles: [{ ...imp.profiles[0], count: 8, updated: "2026-09-02T10:00:00Z" }] };
  r = await call("POST", "/api/admin/import", { token: ADMIN, body: newer });
  ok("import: a NEWER copy of a profile replaces it", r.json.profiles.updated === 1 && r.json.profiles.added === 0, r.text);
  r = await call("GET", "/api/profiles/" + FB);
  ok("import: and the newer library is what is served", r.json.count === 8, r.text);
  r = await call("POST", "/api/admin/import", { token: ADMIN, body: { profiles: [imp.profiles[0]] } });
  ok("import: re-sending the first copy does not roll it back", r.json.profiles.skipped === 1, r.text);
  r = await call("GET", "/api/scenes/" + FSID);
  ok("import: an old #c= link opens under its Firestore id", r.status === 200 && r.json.name === "Old link");
  r = await call("GET", "/api/profiles/" + FB);
  ok("import: a published profile resolves by its old Firebase uid", r.status === 200 && r.json.count === 8, r.text);
  const OLD = await signIn("google-sub-old");
  ok("import: signing in with the migrated Google account lands on the imported user", OLD.created === false && OLD.hasProfile === true);
  r = await call("GET", "/api/profile", { token: OLD.token });
  ok("import: and finds the imported library", r.status === 200 && r.json.count === 8 && r.json.name === "Oldtimer");
  r = await call("GET", "/api/me", { token: A.token });
  ok("import: the account that signed in first is marked migrated", r.json.migrated === true);

  // ---- cors -----------------------------------------------------------------------------------
  let c = await fetch(base + "/api/gallery", { method: "OPTIONS", headers: { Origin: "https://kicktro.com",
    "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "authorization,if-match" } });
  ok("cors: kicktro.com is allowed, with If-Match", c.status === 204 && c.headers.get("access-control-allow-origin") === "https://kicktro.com"
    && /If-Match/.test(c.headers.get("access-control-allow-headers")));
  c = await fetch(base + "/api/gallery", { headers: { Origin: "https://evil.example" } });
  ok("cors: another origin gets no allow header", c.status === 200 && !c.headers.get("access-control-allow-origin"));
  c = await fetch(base + "/api/gallery", { headers: { Origin: "null" } });
  ok("cors: the null origin is refused when dev origins are off", !c.headers.get("access-control-allow-origin"));

  // ---- revocation and account deletion -------------------------------------------------------
  r = await call("POST", "/api/auth/signout-all", { token: B.token });
  ok("signout-all: answers", r.status === 200);
  r = await call("GET", "/api/me", { token: B.token });
  ok("signout-all: the old token stops working", r.status === 401);
  const B2 = await signIn("google-sub-B");
  r = await call("DELETE", "/api/me", { token: B2.token });
  ok("delete account: answers", r.status === 200);
  r = await call("GET", "/api/gallery/" + b1);
  ok("delete account: their published scenes go with it", r.status === 404);
  r = await call("GET", "/api/gallery/" + a2);
  ok("delete account: their favourites go with it", r.json.favs === 0, r.text);
  const B3 = await signIn("google-sub-B");
  ok("delete account: signing in again starts a NEW account", B3.created === true && B3.uid !== B.uid);

  // ---- every scene is a card: the library push, the hour, anonymous accounts, backfill -------
  const H = PENDING;
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const lib = (presets, extra = {}) => zlib.deflateRawSync(Buffer.from(JSON.stringify({ presets, curPreset: 0, cycle: false, ...extra })))
    .toString("base64url");
  const unlib = b64 => JSON.parse(zlib.inflateRawSync(Buffer.from(b64, "base64url")).toString("utf8"));
  const scene = (name, v, more = {}) => ({ name, effect: "plasma", state: { speed: v },
    layers: [{ effect: "plasma", state: { speed: v }, filters: ["blur"] }], ...more });
  const speedOf = b64 => unlib(b64).presets[0].state.speed;
  const STOCK = require(path.join(ROOT, "server", "stock.js"));
  const st = STOCK.scenes.find(s => s.layers.length >= 1);
  const stockCopy = { name: st.name, effect: st.effect, state: st.state, extra: { palette: st.palette, filters: st.filters },
    layers: st.layers.map(L => ({ ...L })) };
  const stockEdited = { ...stockCopy, layers: [...stockCopy.layers, { effect: "tunnel", state: {} }] };
  const push = (tok, presets, name) => call("PUT", "/api/me/gallery", { token: tok,
    body: { payload: lib(presets), ...(name !== undefined ? { name } : {}) } });
  const cardsOf = async (tok, q) => (await call("GET", "/api/gallery?mine=own&sort=name&limit=100"
    + (q ? "&q=" + encodeURIComponent(q) : ""), { token: tok })).json;
  const publicNamed = async q => (await call("GET", "/api/gallery?sort=name&limit=100&q=" + encodeURIComponent(q))).json;
  const glory0 = scene("Old Glory", 2, { sid: "sidOldGlory1", edited: Date.now() - 2 * H });

  const N1 = (await call("POST", "/api/auth/anon")).json;
  ok("anon: a signed-out browser gets an account and a session", N1 && N1.token && N1.uid && N1.anon === true && N1.name === "",
    JSON.stringify(N1));
  const N2 = (await call("POST", "/api/auth/anon")).json;
  for (let i = 0; i < 3; i++) await call("POST", "/api/auth/anon");
  r = await call("POST", "/api/auth/anon");
  ok("anon: five accounts per address per day, then 429", r.status === 429, r.status);
  r = await call("POST", "/api/gallery", { token: N1.token, body: { name: "Hand", payload: PAY } });
  ok("anon: may not publish by hand", r.status === 403, r.status);
  r = await call("PUT", "/api/profile", { token: N1.token, body: { name: "", payload: PAY, count: 1, pub: false } });
  ok("anon: has no profile", r.status === 403, r.status);
  r = await call("PUT", "/api/gallery/" + a2 + "/fav", { token: N1.token });
  ok("anon: may not vote (minting accounts must not stuff the score)", r.status === 403, r.status);
  r = await call("PUT", "/api/gallery/" + a2 + "/hate", { token: N1.token });
  ok("anon: ...nor dislike", r.status === 403, r.status);
  r = await call("POST", "/api/scenes", { token: N1.token, body: { name: "x", payload: PAY } });
  ok("anon: makes no share links", r.status === 403, r.status);
  r = await call("PATCH", "/api/me", { token: N1.token, body: { name: "Sneaky" } });
  ok("anon: has no name to set", r.status === 403, r.status);

  r = await call("PUT", "/api/me/gallery", { body: { payload: lib([]) } });
  ok("sync: needs a session", r.status === 401, r.status);
  r = await call("PUT", "/api/me/gallery", { token: N1.token, body: { payload: PAY } });
  ok("sync: a payload that is not a deflated library is 400", r.status === 400, r.text);
  r = await call("PUT", "/api/me/gallery", { token: N1.token, body: { payload: lib([]), pub: true } });
  ok("sync: an unknown field is 400", r.status === 400, r.text);
  const t0 = Date.now();
  const reef0 = scene("Reef One", 1, { sid: "sidReefOne01", edited: t0, rotate: false });
  r = await push(N1.token, [reef0, glory0,
    scene("Borrowed", 3, { collection: "Shared with you", origin: "Bob" }),
    { name: "Plasma", effect: "plasma", state: { speed: 0.4 }, layers: [{ effect: "plasma", state: {} }] },
    stockCopy, stockEdited,
  ], "Ignored");
  ok("sync: a fresh edit waits, an hour-old one is public, stock and borrowed scenes are not cards",
    r.status === 200 && r.json.pending === 1 && r.json.added === 2 && r.json.stock === 2 && r.json.theirs === 1, r.text);
  let mine = await cardsOf(N1.token);
  const reef = mine.items.find(x => x.name === "Reef One"), glory = mine.items.find(x => x.name === "Old Glory");
  ok("sync: My scenes lists the waiting one with when it goes public", mine.total === 3 && reef && reef.live === false
    && Math.abs(reef.pending - (t0 + H)) < 5 && glory && glory.live === true && !("pending" in glory), JSON.stringify(mine.items));
  ok("sync: an edited stock scene is the user's own card", mine.items.some(x => x.name === st.name), JSON.stringify(mine.items));
  ok("anon: cards read Anonymous (a name sent by an anonymous account is ignored)",
    mine.items.every(x => x.author === "Anonymous"), JSON.stringify(mine.items));
  ok("hour: others do not see a scene inside its first hour", (await publicNamed("Reef One")).total === 0);
  ok("hour: ...but do see the hour-old one", (await publicNamed("Old Glory")).total === 1);
  r = await call("GET", "/api/gallery/" + reef.id);
  ok("hour: ...nor can open it by id", r.status === 404, r.status);
  r = await call("GET", "/api/gallery/" + reef.id, { token: N1.token });
  const reefScene = r.json && unlib(r.json.payload).presets[0];
  ok("hour: the owner can, and the card holds the scene without its library bookkeeping", r.status === 200
    && reefScene.name === "Reef One" && !("sid" in reefScene) && !("edited" in reefScene) && !("rotate" in reefScene), r.text);
  ok("sync: the listing marks a card that follows a scene (synced)", reef.synced === true
    && !("synced" in (await call("GET", "/api/gallery?q=Storm")).json.items[0]), JSON.stringify(reef));
  r = await push(N1.token, [reef0, glory0, stockEdited]);
  ok("sync: pushing the same library again changes nothing", r.json.same === 3
    && r.json.added + r.json.updated + r.json.pending === 0, r.text);

  await sleep(Math.max(0, t0 + H + 150 - Date.now()));
  ok("hour: once the edit is an hour old it is public", (await publicNamed("Reef One")).total === 1);
  r = await call("GET", "/api/admin/thumbs/todo", { token: ADMIN });
  ok("thumbs: a newly public card is on the todo list", r.json.items.some(x => x.id === reef.id), r.text);
  await call("PUT", "/api/admin/thumbs/" + reef.id, { token: ADMIN, body: { poster: webp.toString("base64"), clip: mp4.toString("base64") } });
  r = await call("GET", "/api/admin/thumbs/todo", { token: ADMIN });
  ok("thumbs: ...and leaves it once rendered", !r.json.items.some(x => x.id === reef.id), r.text);

  // An edit: everyone keeps the public version for an hour; a further edit restarts the hour.
  const e1 = Date.now();
  r = await push(N1.token, [scene("Reef One", 5, { sid: "sidReefOne01", edited: e1 }), glory0, stockEdited]);
  ok("hour: an edit waits", r.json.pending === 1, r.text);
  ok("hour: ...others still get the public version", speedOf((await call("GET", "/api/gallery/" + reef.id)).json.payload) === 1);
  ok("hour: ...the owner gets the edit",
    speedOf((await call("GET", "/api/gallery/" + reef.id, { token: N1.token })).json.payload) === 5);
  r = await push(N1.token, [scene("Reef One", 9, { sid: "sidReefOne01", edited: t0 }), glory0, stockEdited]);
  ok("hour: an OLDER copy of a scene (another device) is ignored", r.json.stale === 1
    && speedOf((await call("GET", "/api/gallery/" + reef.id, { token: N1.token })).json.payload) === 5, r.text);
  await sleep(H / 2);
  const e2 = Date.now();
  const reef6 = scene("Reef One", 6, { sid: "sidReefOne01", edited: e2 });
  r = await push(N1.token, [reef6, glory0, stockEdited]);
  mine = await cardsOf(N1.token, "Reef");
  ok("hour: a further edit moves the hour to start at that edit", r.json.pending === 1
    && Math.abs(mine.items[0].pending - (e2 + H)) < 5, r.text + " " + JSON.stringify(mine.items));
  await sleep(Math.max(0, e1 + H + 150 - Date.now()));
  ok("hour: ...so an hour after the FIRST edit it is still the old version",
    speedOf((await call("GET", "/api/gallery/" + reef.id)).json.payload) === 1);
  await sleep(Math.max(0, e2 + H + 150 - Date.now()));
  ok("hour: ...and an hour after the last edit it is the new one",
    speedOf((await call("GET", "/api/gallery/" + reef.id)).json.payload) === 6);
  r = await call("GET", "/api/admin/thumbs/todo", { token: ADMIN });
  ok("thumbs: a promoted edit is re-rendered", r.json.items.some(x => x.id === reef.id), r.text);
  r = await publicNamed("Reef One");
  ok("thumbs: ...and the listing says its thumbnail is stale", r.items[0].stale === true, JSON.stringify(r.items));
  r = await call("PUT", "/api/gallery/" + reef.id + "/thumb", { body: { poster: webpOf("VP8X", 480, 270).toString("base64") } });
  ok("viewer thumb: a stale card takes a visitor's poster", r.status === 200 && r.json.clip === null, r.text);
  r = await publicNamed("Reef One");
  ok("viewer thumb: ...and is no longer stale", !("stale" in r.items[0]) && r.items[0].clip === null, JSON.stringify(r.items));
  await push(N1.token, [scene("Reef One", 7, { sid: "sidReefOne01", edited: Date.now() }), glory0, stockEdited]);
  r = await push(N1.token, [scene("Reef One", 6, { sid: "sidReefOne01", edited: Date.now() }), glory0, stockEdited]);
  mine = await cardsOf(N1.token, "Reef");
  ok("hour: an edit undone before its hour is up leaves nothing waiting", r.json.same === 3 && !("pending" in mine.items[0]),
    r.text + " " + JSON.stringify(mine.items));

  // A scene gone from the library hides its card; votes are kept for when it comes back.
  await call("PUT", "/api/gallery/" + glory.id + "/fav", { token: A.token });
  r = await push(N1.token, [reef6, stockEdited]);
  ok("sync: a scene no longer in the library hides its card", r.json.hidden === 1 && (await publicNamed("Old Glory")).total === 0
    && (await call("GET", "/api/gallery/" + glory.id)).status === 404, r.text);
  r = await push(N1.token, [reef6, glory0, stockEdited]);
  r = await call("GET", "/api/gallery/" + glory.id);
  ok("sync: ...and back, with its votes, when the scene returns", r.status === 200 && r.json.favs === 1, r.text);

  // The owner's ✕ deletes a synced card for everyone, for good: no later push makes it again.
  r = await call("DELETE", "/api/gallery/" + glory.id, { token: A.token });
  ok("delete own: someone else's card is refused (403)", r.status === 403, r.status);
  r = await call("DELETE", "/api/gallery/" + glory.id, { token: N1.token });
  ok("delete own: the owner deletes a synced card, told which scene to drop", r.status === 200 && r.json.sid === "sidOldGlory1"
    && r.json.name === "Old Glory", r.text);
  ok("delete own: ...gone for everyone", (await call("GET", "/api/gallery/" + glory.id)).status === 404
    && (await publicNamed("Old Glory")).total === 0);
  r = await call("GET", "/api/gallery/" + glory.id, { token: N1.token });
  ok("delete own: ...the owner included", r.status === 404, r.status);
  r = await push(N1.token, [reef6, glory0, stockEdited]);
  mine = await cardsOf(N1.token, "Old Glory");
  ok("delete own: a push still carrying the scene (another device) does not bring it back", r.json.deleted === 1
    && r.json.added + r.json.pending === 0 && mine.total === 0, r.text + " " + JSON.stringify(mine.items));
  r = await push(N1.token, [reef6, scene("Old Glory", 3, { sid: "sidOldGlory1", edited: Date.now() }), stockEdited]);
  ok("delete own: ...nor does an edit of it", r.json.deleted === 1 && (await cardsOf(N1.token, "Old Glory")).total === 0, r.text);
  r = await push(N1.token, [reef6, scene("Old Glory", 2, { edited: Date.now() - 2 * H }), stockEdited]);
  ok("delete own: ...nor an unkeyed copy of the same name", r.json.deleted === 1, r.text);
  r = await push(N1.token, [reef6, scene("New Glory", 2, { sid: "sidNewGlory1", edited: Date.now() - 2 * H }), stockEdited]);
  ok("delete own: another scene still becomes a card", r.json.added === 1 && r.json.deleted === 0, r.text);
  r = await call("GET", "/api/gallery?mine=own&limit=100", { token: N1.token });
  ok("delete own: ...and the deleted card's votes are gone", r.json.items.every(x => x.favs === 0), r.text);

  // Signed in: a card published by hand is adopted by name (votes kept); the name credits.
  const D = await signIn("google-sub-D");
  const hand = (await call("POST", "/api/gallery", { token: D.token, body: { name: "Hand Made", payload: PAY } })).json.id;
  await call("PUT", "/api/gallery/" + hand + "/fav", { token: A.token });
  const old = Date.now() - 2 * H;
  r = await push(D.token, [scene("Hand Made", 4, { sid: "sidHandMade1", edited: old })], "Dee");
  mine = await cardsOf(D.token);
  ok("sync: a card published by hand is adopted by its scene, votes kept", r.json.updated === 1 && mine.total === 1
    && mine.items[0].id === hand && mine.items[0].favs === 1, r.text + " " + JSON.stringify(mine.items));
  ok("sync: cards are credited to the profile name the push carries", mine.items[0].author === "Dee", JSON.stringify(mine.items));
  ok("sync: ...and the adopted card holds the scene now", speedOf((await call("GET", "/api/gallery/" + hand)).json.payload) === 4);
  r = await push(D.token, [scene("Hand Made", 4, { sid: "sidHandMade1", edited: old }),
    scene("Twin", 1, { sid: "sidTwinTwin1", edited: old }), scene("Twin", 2, { sid: "sidTwinTwin1", edited: old })]);
  ok("sync: two scenes sharing an id are two cards", r.json.added === 2 && (await cardsOf(D.token, "Twin")).total === 2, r.text);

  // Signing in from an anonymous browser: its cards become the account's.
  await push(N2.token, [scene("Night Drive", 3, { sid: "sidNightDrv1", edited: old }),
    scene("Hand Made", 8, { sid: "sidHandMade1", edited: old }), scene("Left Behind", 1, { sid: "sidLeftBhnd1", edited: old })]);
  const left = (await cardsOf(N2.token, "Left Behind")).items[0];
  r = await call("DELETE", "/api/gallery/" + left.id, { token: N2.token });
  ok("delete own: an anonymous browser deletes its own card", r.status === 200 && r.json.sid === "sidLeftBhnd1", r.text);
  r = await call("POST", "/api/auth/google", { body: { idToken: idToken("google-sub-D"), anon: N2.token.slice(0, -2) + "xx" } });
  ok("claim: a forged anonymous session claims nothing", r.status === 200 && r.json.claimed === 0, r.text);
  r = await call("POST", "/api/auth/google", { body: { idToken: idToken("google-sub-D"), anon: N2.token } });
  ok("claim: signing in takes the anonymous browser's cards", r.status === 200 && r.json.claimed === 1 && r.json.uid === D.uid, r.text);
  mine = await cardsOf(D.token);
  ok("claim: ...except one for a scene the account already has a card for", mine.total === 4
    && mine.items.filter(x => x.name === "Hand Made").length === 1
    && mine.items.find(x => x.name === "Night Drive").author === "Dee", JSON.stringify(mine.items));
  r = await push(D.token, [scene("Hand Made", 4, { sid: "sidHandMade1", edited: old }), scene("Twin", 1, { sid: "sidTwinTwin1", edited: old }),
    scene("Twin", 2, { sid: "sidTwinTwin1", edited: old }), scene("Night Drive", 3, { sid: "sidNightDrv1", edited: old }),
    scene("Left Behind", 1, { sid: "sidLeftBhnd1", edited: old })]);
  ok("claim: what the anonymous browser deleted stays deleted under the account", r.json.deleted === 1
    && (await cardsOf(D.token, "Left Behind")).total === 0, r.text);
  ok("claim: ...and the anonymous account is gone",
    (await call("PUT", "/api/me/gallery", { token: N2.token, body: { payload: lib([]) } })).status === 401);

  // The one-time backfill: every stored profile's own scenes, public at once.
  const E = await signIn("google-sub-E");
  r = await call("PUT", "/api/profile", { token: E.token, headers: { "If-Match": "none" }, body: { name: "dyze", count: 4, pub: false,
    payload: lib([scene("Dyze Dream", 1), scene("Dyze Two", 2), stockCopy, scene("Borrowed Too", 3, { collection: "Kicktro" })]) } });
  ok("backfill: a private profile to backfill", r.status === 200, r.text);
  ok("backfill: ...whose scenes are not in the gallery yet", (await publicNamed("Dyze")).total === 0);
  r = await call("POST", "/api/admin/backfill?dry=1");
  ok("backfill: needs the admin token", r.status === 401, r.status);
  r = await call("POST", "/api/admin/backfill?dry=1", { token: ADMIN });
  let acc = r.json && r.json.accounts.find(x => x.uid === E.uid);
  ok("backfill: a dry run reports what it would add", r.status === 200 && r.json.dry === true && acc && acc.added === 2
    && acc.stock === 1 && acc.theirs === 1, r.text);
  ok("backfill: ...a profile that is not a library is an error, not a stop", r.json.errors.some(x => x.startsWith(A.uid)), r.text);
  ok("backfill: ...and changes nothing", (await publicNamed("Dyze")).total === 0);
  r = await call("POST", "/api/admin/backfill", { token: ADMIN });
  acc = r.json.accounts.find(x => x.uid === E.uid);
  const pub = await publicNamed("Dyze");
  ok("backfill: the real run makes them public at once, credited to the profile", acc.added === 2 && pub.total === 2
    && pub.items.every(x => x.author === "dyze"), r.text + " " + JSON.stringify(pub));
  r = await call("POST", "/api/admin/backfill", { token: ADMIN });
  acc = r.json.accounts.find(x => x.uid === E.uid);
  ok("backfill: running it again adds nothing", acc.added === 0 && acc.same === 2 && (await publicNamed("Dyze")).total === 2, r.text);
  const dyzeId = pub.items[0].id;
  await call("PUT", "/api/gallery/" + dyzeId + "/fav", { token: A.token });
  r = await push(E.token, [scene("Dyze Dream", 1, { sid: "sidDyzeDrm1", edited: old }), scene("Dyze Two", 2, { sid: "sidDyzeTwo1", edited: old })]);
  mine = await cardsOf(E.token);
  ok("backfill: the page's first push adopts the backfilled cards, votes kept", r.json.same === 2 && r.json.added === 0
    && mine.total === 2 && mine.items.find(x => x.id === dyzeId).favs === 1, r.text);
  r = await call("POST", "/api/admin/backfill", { token: ADMIN });
  ok("backfill: ...and a later run does not duplicate them", r.json.accounts.find(x => x.uid === E.uid).added === 0
    && (await cardsOf(E.token)).total === 2, r.text);

  // ---- restart: the data is on disk and the migrations re-run cleanly ------------------------
  // It comes back with ADMIN_UIDS naming Alice (a Google account) and the anonymous N1: uids
  // are minted at sign-in, so only a restart can name them.
  await stop();
  base = "";
  extraEnv = { ADMIN_UIDS: A.uid + ", " + N1.uid };
  await start();
  r = await call("GET", "/api/profile", { token: A.token });
  ok("restart: data and sessions survive a restart", r.status === 200 && r.json.name === "Alice", r.text);
  r = await call("GET", "/api/gallery?sort=name&limit=100&q=Dyze");
  ok("restart: ...the cards too", r.json.total === 2, r.text);

  // ---- admins (ADMIN_UIDS) delete any card; an anonymous account never is one ---------------
  r = await call("GET", "/api/me/favs", { token: A.token });
  ok("admin: an admin's /api/me/favs says so", r.status === 200 && r.json.admin === true, r.text);
  r = await call("GET", "/api/me/favs", { token: D.token });
  ok("admin: ...nobody else's does", r.status === 200 && !("admin" in r.json), r.text);
  const dyzeTwo = (await publicNamed("Dyze Two")).items[0];
  r = await call("DELETE", "/api/gallery/" + dyzeTwo.id, { token: D.token });
  ok("admin: a non-admin still cannot delete someone else's card", r.status === 403, r.status);
  r = await call("DELETE", "/api/gallery/" + dyzeTwo.id, { token: N1.token });
  ok("admin: an anonymous account named in ADMIN_UIDS is not an admin", r.status === 403, r.status);
  r = await call("DELETE", "/api/gallery/" + dyzeTwo.id, { token: A.token });
  ok("admin: an admin deletes someone else's card, told no scene to drop", r.status === 200 && r.json.ok === true
    && !("sid" in r.json) && !("name" in r.json), r.text);
  ok("admin: ...gone for everyone", (await call("GET", "/api/gallery/" + dyzeTwo.id)).status === 404
    && (await publicNamed("Dyze Two")).total === 0);
  r = await push(E.token, [scene("Dyze Dream", 1, { sid: "sidDyzeDrm1", edited: old }), scene("Dyze Two", 2, { sid: "sidDyzeTwo1", edited: old })]);
  ok("admin: ...and the owner's next push does not bring it back (tombstoned under the owner)", r.json.deleted === 1
    && (await cardsOf(E.token, "Dyze Two")).total === 0 && (await cardsOf(E.token, "Dyze Dream")).total === 1, r.text);

  // ---- migration 3 over a database the previous server wrote --------------------------------
  await stop();
  base = "";
  const { DatabaseSync } = require("node:sqlite");
  const { MIGRATIONS } = require(path.join(ROOT, "server", "db.js"));
  const oldFile = path.join(TMP, "v2.db");
  const odb = new DatabaseSync(oldFile);
  odb.exec(MIGRATIONS[0]); odb.exec(MIGRATIONS[1]); odb.exec("pragma user_version = 2");
  odb.prepare("insert into users (uid, google_sub, name, created) values ('OldUser0001', 'old-sub', 'Olga', 1)").run();
  odb.prepare("insert into gallery (id, owner, name, payload, created) values ('OldCard00001', 'OldUser0001', 'Vintage', ?, 1)").run(PAY);
  odb.close();
  await start(oldFile);
  r = await call("GET", "/api/health");
  ok("migrate: a v2 database comes up at the current schema", r.json.schema === MIGRATIONS.length, r.text);
  r = await call("GET", "/api/gallery?q=Vintage");
  ok("migrate: a card published before it is still public, as it was", r.json.total === 1 && r.json.items[0].author === "Olga", r.text);
  r = await call("GET", "/api/gallery/OldCard00001");
  ok("migrate: ...with its payload", r.status === 200 && r.json.payload === PAY, r.text);

  await stop();
  jwks.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log((fails ? "FAILED" : "OK") + ": " + passes + " passed, " + fails + " failed");
  process.exit(fails ? 1 : 0);
}

main().catch(async e => {
  console.error("FAIL probe crashed: " + (e && e.stack || e));
  await stop();
  jwks.close();
  process.exit(1);
});
