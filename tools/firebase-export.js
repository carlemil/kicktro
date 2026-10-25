#!/usr/bin/env node
"use strict";
// One-time move of the cloud data off Firebase (card 825, M2) into the Kicktro API.
//
//   node tools/firebase-export.js --key <service-account.json> --dry-run
//       reads every profile, shared scene and Google account from Firebase, writes the export
//       file and prints what an import would do. Sends nothing anywhere else.
//   node tools/firebase-export.js --key <service-account.json>
//       the same, then POSTs it to <api>/api/admin/import and checks the result.
//   node tools/firebase-export.js --from <export.json>
//       imports a file written earlier, without touching Firebase (the key can be gone).
//
// Options: --out <file> (default: kicktro-firebase-export.json in the temp folder; refused
// inside the repo, since it is everybody's scene library), --api <base> (https://api.kicktro.com),
// --project <id> (the key's project_id), --ssh <user@host> (where to read ADMIN_TOKEN from).
// The admin token comes from KICKTRO_ADMIN_TOKEN, else from /srv/kicktro/.env over ssh. It is
// never printed. GOOGLE_ACCESS_TOKEN (gcloud auth print-access-token) may stand in for --key.
//
// SAFE TO RE-RUN: the import adds what is missing, refreshes a profile only from a newer copy,
// and never overwrites users or share links. Share ids are kept verbatim: #c= links must
// decode forever. No npm packages, like server/.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) die("unexpected argument " + a);
  const k = a.slice(2);
  if (k === "dry-run" || k === "help") args[k] = true;
  else if (i + 1 < process.argv.length) args[k] = process.argv[++i];
  else die("--" + k + " needs a value");
}
if (args.help || (!args.key && !args.from && !process.env.GOOGLE_ACCESS_TOKEN)) {
  console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(2, 22).map(l => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(args.help ? 0 : 2);
}
const API = (args.api || "https://api.kicktro.com").replace(/\/+$/, "");
const SSH = args.ssh || "deploy@136.148.210.49";
const OUT = path.resolve(args.out || path.join(os.tmpdir(), "kicktro-firebase-export.json"));
// The caps the API enforces (server/routes.js CAP). Checked here so the report names a row
// that will be refused before anything is sent.
const CAP = { profileName: 40, profilePayload: 300000, profileCount: 500, sceneName: 60, scenePayload: 200000 };
const CHUNK = 6 << 20;   // bytes per import request; Caddy's outer bound is 16 MB

function die(msg) { console.error("firebase-export: " + msg); process.exit(1); }
const b64url = b => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

// ---- Google auth: a service-account JWT traded for an access token ----------------------
async function accessToken(key) {
  if (!key) return process.env.GOOGLE_ACCESS_TOKEN;
  const uri = key.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: key.client_email, aud: uri,
    scope: "https://www.googleapis.com/auth/cloud-platform", iat: now, exp: now + 3600,
  }));
  const sig = b64url(crypto.sign("RSA-SHA256", Buffer.from(head + "." + claim), key.private_key));
  const r = await fetch(uri, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")
      + "&assertion=" + head + "." + claim + "." + sig,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) die("the service account was not accepted: " + (j.error_description || j.error || r.status));
  return j.access_token;
}
async function gget(url, tok) {
  const r = await fetch(url, { headers: { Authorization: "Bearer " + tok } });
  const t = await r.text();
  if (!r.ok) die("GET " + url.split("?")[0] + " answered " + r.status + ": " + t.slice(0, 300));
  return JSON.parse(t);
}

// ---- Firestore: every document of a collection -----------------------------------------
function fsIn(doc) {
  const out = {};
  const f = (doc && doc.fields) || {};
  for (const k in f) {
    const v = f[k];
    if ("stringValue" in v) out[k] = v.stringValue;
    else if ("booleanValue" in v) out[k] = v.booleanValue;
    else if ("integerValue" in v) out[k] = +v.integerValue;
    else if ("doubleValue" in v) out[k] = +v.doubleValue;
    else if ("timestampValue" in v) out[k] = v.timestampValue;
    else if ("nullValue" in v) out[k] = null;
  }
  return out;
}
async function listCollection(project, coll, tok) {
  const base = "https://firestore.googleapis.com/v1/projects/" + project + "/databases/(default)/documents/" + coll;
  const docs = [];
  let page = "";
  do {
    const j = await gget(base + "?pageSize=300" + (page ? "&pageToken=" + encodeURIComponent(page) : ""), tok);
    for (const d of j.documents || []) {
      docs.push({ id: String(d.name).split("/").pop(), updateTime: d.updateTime, createTime: d.createTime, ...fsIn(d) });
    }
    page = j.nextPageToken || "";
  } while (page);
  return docs;
}
// ---- Firebase Auth: uid -> Google account id (the `sub` the API keys users by) ----------
async function listAccounts(project, tok) {
  const base = "https://identitytoolkit.googleapis.com/v1/projects/" + project + "/accounts:batchGet?maxResults=500";
  const out = [];
  let page = "";
  do {
    const j = await gget(base + (page ? "&nextPageToken=" + encodeURIComponent(page) : ""), tok);
    for (const u of j.users || []) {
      const g = (u.providerUserInfo || []).find(p => p.providerId === "google.com");
      out.push({ uid: u.localId, sub: g ? String(g.rawId || "") : "" });
    }
    page = j.nextPageToken || "";
  } while (page);
  return out;
}

// ---- export ----------------------------------------------------------------------------
async function exportFirebase() {
  let key = null;
  if (args.key) {
    try { key = JSON.parse(fs.readFileSync(args.key, "utf8")); } catch (e) { die("cannot read the key file: " + e.message); }
    if (!key.private_key || !key.client_email) die("that is not a service-account key");
  }
  const project = args.project || (key && key.project_id) || "burntheweb-3cd05";
  const tok = await accessToken(key);
  console.log("reading Firebase project " + project + "...");
  const [profiles, scenes, accounts] = await Promise.all([
    listCollection(project, "profiles", tok), listCollection(project, "scenes", tok), listAccounts(project, tok)]);
  const byProfile = new Map(profiles.map(p => [p.id, p]));
  return {
    exported: new Date().toISOString(), project,
    users: accounts.filter(a => a.sub).map(a => ({
      firebase_uid: a.uid, google_sub: a.sub,
      name: String((byProfile.get(a.uid) || {}).name || "").slice(0, CAP.profileName) })),
    profiles: profiles.map(p => ({ firebase_uid: p.id, name: p.name == null ? "" : String(p.name), payload: p.payload,
      count: p.count, pub: !!p.pub, updated: p.updated || p.updateTime })),
    shares: scenes.map(s => ({ id: s.id, owner_firebase_uid: s.owner || "", name: s.name == null ? "" : String(s.name),
      payload: s.payload, created: s.created || s.createTime })),
    noGoogle: accounts.filter(a => !a.sub).map(a => a.uid),
  };
}

// What an import will refuse or leave dangling, said before anything is sent.
function report(body) {
  const users = new Set(body.users.map(u => u.firebase_uid));
  const warn = [];
  for (const p of body.profiles) {
    if (!users.has(p.firebase_uid)) warn.push("profile " + p.firebase_uid + ": no Google account, will be refused");
    if (typeof p.payload !== "string" || p.payload.length >= CAP.profilePayload) warn.push("profile " + p.firebase_uid + ": payload missing or over the cap");
    if (!Number.isInteger(p.count) || p.count < 0 || p.count > CAP.profileCount) warn.push("profile " + p.firebase_uid + ": count " + p.count + " out of range");
    if (p.name.length > CAP.profileName) warn.push("profile " + p.firebase_uid + ": name longer than " + CAP.profileName);
  }
  for (const s of body.shares) {
    if (!/^[A-Za-z0-9]{10,40}$/.test(s.id)) warn.push("share " + s.id + ": an id the API cannot keep");
    if (typeof s.payload !== "string" || s.payload.length >= CAP.scenePayload) warn.push("share " + s.id + ": payload missing or over the cap");
    if (s.name.length > CAP.sceneName) warn.push("share " + s.id + ": name longer than " + CAP.sceneName);
    if (!users.has(s.owner_firebase_uid)) warn.push("share " + s.id + ": owner unknown, imported without one (it opens; nobody can delete it from the app)");
  }
  for (const u of body.noGoogle || []) warn.push("account " + u + ": no Google sign-in, not imported");
  const pub = body.profiles.filter(p => p.pub).length;
  console.log("export: " + body.users.length + " Google accounts, " + body.profiles.length + " profiles ("
    + pub + " published), " + body.shares.length + " shared scenes");
  for (const w of warn) console.log("  ! " + w);
  return warn;
}

// ---- import ----------------------------------------------------------------------------
function adminToken() {
  if (process.env.KICKTRO_ADMIN_TOKEN) return process.env.KICKTRO_ADMIN_TOKEN.trim();
  const r = spawnSync("ssh", [SSH, "sed -n 's/^ADMIN_TOKEN=//p' /srv/kicktro/.env"], { encoding: "utf8" });
  const t = (r.stdout || "").trim();
  if (r.status !== 0 || t.length < 24) die("could not read ADMIN_TOKEN over ssh from " + SSH + " (set KICKTRO_ADMIN_TOKEN instead)");
  return t;
}
// Users first, in a request of their own: a profile or share names its owner by Firebase uid,
// which only resolves once the user row exists. Then rows in requests under CHUNK bytes.
function chunks(body) {
  const out = [{ users: body.users }];
  for (const kind of ["profiles", "shares"]) {
    let cur = [], size = 0;
    for (const row of body[kind]) {
      const n = JSON.stringify(row).length + 1;
      if (cur.length && size + n > CHUNK) { out.push({ [kind]: cur }); cur = []; size = 0; }
      cur.push(row); size += n;
    }
    if (cur.length) out.push({ [kind]: cur });
  }
  return out;
}
async function importAll(body) {
  const tok = adminToken();
  const sum = { users: { added: 0, linked: 0, skipped: 0 }, profiles: { added: 0, updated: 0, skipped: 0 },
    shares: { added: 0, skipped: 0 }, errors: [] };
  const parts = chunks(body);
  for (let i = 0; i < parts.length; i++) {
    const r = await fetch(API + "/api/admin/import", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
      body: JSON.stringify(parts[i]),
    });
    const t = await r.text();
    if (!r.ok) die("import request " + (i + 1) + "/" + parts.length + " answered " + r.status + ": " + t.slice(0, 300));
    const j = JSON.parse(t);
    for (const k of ["users", "profiles", "shares"]) for (const f in sum[k]) sum[k][f] += (j[k] && j[k][f]) || 0;
    sum.errors.push(...(j.errors || []));
  }
  console.log("import (" + parts.length + " requests): " + JSON.stringify({ users: sum.users, profiles: sum.profiles, shares: sum.shares }));
  for (const e of sum.errors) console.log("  ! " + e);
  return sum;
}
// Read back through the PUBLIC endpoints, the way a visitor would: every published profile
// opens by its old Firebase uid (what stored follows carry), and every share link opens with
// its old id and the exact exported payload.
async function verify(body) {
  let bad = 0;
  const users = new Set(body.users.map(u => u.firebase_uid));
  const pub = body.profiles.filter(p => p.pub && users.has(p.firebase_uid));
  const pace = () => new Promise(res => setTimeout(res, 120));   // well under the per-IP limit
  for (const p of pub) {
    const r = await fetch(API + "/api/profiles/" + encodeURIComponent(p.firebase_uid));
    if (r.status !== 200) { bad++; console.log("  ! published profile " + p.firebase_uid + " does not open (" + r.status + ")"); }
    await pace();
  }
  for (const s of body.shares) {
    const r = await fetch(API + "/api/scenes/" + encodeURIComponent(s.id));
    const j = r.ok ? await r.json() : null;
    if (!j || j.payload !== s.payload) { bad++; console.log("  ! #c=" + s.id + " does not open with the exported payload (" + r.status + ")"); }
    await pace();
  }
  console.log("verify: " + pub.length + " published profiles and " + body.shares.length + " share links checked, "
    + (bad ? bad + " PROBLEM(S)" : "all good"));
  return bad;
}

(async () => {
  let body;
  if (args.from) {
    try { body = JSON.parse(fs.readFileSync(args.from, "utf8")); } catch (e) { die("cannot read " + args.from + ": " + e.message); }
  } else {
    const rel = path.relative(ROOT, OUT);
    if (!rel.startsWith("..") && !path.isAbsolute(rel)) die("--out must be outside the repo: the export holds everybody's scenes");
    body = await exportFirebase();
    fs.writeFileSync(OUT, JSON.stringify(body), { mode: 0o600 });
    console.log("wrote " + OUT);
  }
  report(body);
  if (args["dry-run"]) return console.log("dry run: nothing was sent to " + API);
  const sum = await importAll(body);
  const bad = await verify(body);
  process.exit(bad || sum.errors.length ? 1 : 0);
})().catch(e => die(e.stack || e.message));
