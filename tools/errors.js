#!/usr/bin/env node
"use strict";
// CRASH REPORTS from visitors' pages: what reached the page's last-resort error handler
// (armCrashReport in src/config.js), grouped by kind on the API (POST /api/errors).
//
//   node tools/errors.js [--sort last|count] [--limit N] [--stack] [--json]
//       list them, most recent first (or most frequent): count, how many stopped the render,
//       when, the version that last sent one, the message and where it was thrown.
//       --stack prints each one's latest stack and context; --json the raw answer.
//   node tools/errors.js --forget <fp>     forget one kind (fixed); it returns if it recurs
//   node tools/errors.js --forget-all      forget every one
//
// Options: --api <base> (https://api.kicktro.com), --ssh <user@host>.
// The admin token comes from KICKTRO_ADMIN_TOKEN, else from /srv/kicktro/.env over ssh, as in
// tools/thumbs.js; it is never printed. A moderator's own session reads the same route.
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const NL = String.fromCharCode(10);
const args = { sort: "last", limit: "100" };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (["--stack", "--json", "--forget-all", "--help"].includes(a)) args[a.slice(2)] = true;
  else if (["--sort", "--limit", "--forget", "--api", "--ssh"].includes(a) && i + 1 < process.argv.length) args[a.slice(2)] = process.argv[++i];
  else die("unexpected argument " + a);
}
if (args.help) {
  console.log(fs.readFileSync(__filename, "utf8").split(NL).slice(2, 16).map(l => l.replace(/^\/\/ ?/, "")).join(NL));
  process.exit(0);
}
const API = (args.api || "https://api.kicktro.com").replace(/\/+$/, "");
const SSH = args.ssh || "deploy@136.148.210.49";
function die(msg) { console.error("errors: " + msg); process.exit(1); }

function adminToken() {
  if (process.env.KICKTRO_ADMIN_TOKEN) return process.env.KICKTRO_ADMIN_TOKEN.trim();
  const r = spawnSync("ssh", [SSH, "sed -n 's/^ADMIN_TOKEN=//p' /srv/kicktro/.env"], { encoding: "utf8" });
  const t = (r.stdout || "").trim();
  if (r.status !== 0 || t.length < 24) die("could not read ADMIN_TOKEN over ssh from " + SSH + " (set KICKTRO_ADMIN_TOKEN instead)");
  return t;
}

async function call(method, p) {
  const r = await fetch(API + p, { method, headers: { Authorization: "Bearer " + adminToken() } });
  const text = await r.text();
  if (!r.ok) die(method + " " + p + " answered " + r.status + ": " + text.slice(0, 200));
  return JSON.parse(text);
}

const ago = t => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  return s < 90 ? Math.round(s) + "s" : s < 5400 ? Math.round(s / 60) + "m" : s < 129600 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d";
};

(async () => {
  if (args.forget) {
    if (!/^[0-9a-f]{40}$/.test(args.forget)) die("--forget takes a 40-hex fp from the listing");
    const r = await call("DELETE", "/api/errors/" + args.forget);
    console.log(r.deleted ? "forgot " + args.forget : "no such report " + args.forget);
    return;
  }
  if (args["forget-all"]) {
    console.log("forgot " + (await call("DELETE", "/api/errors")).deleted + " kinds of error");
    return;
  }
  const r = await call("GET", "/api/errors?sort=" + (args.sort === "count" ? "count" : "last") + "&limit=" + (parseInt(args.limit, 10) || 100));
  if (args.json) { console.log(JSON.stringify(r, null, 2)); return; }
  console.log(r.n + " kinds of error, " + r.reports + " reports" + (r.items.length < r.n ? " (showing " + r.items.length + ")" : ""));
  for (const e of r.items) {
    console.log("");
    console.log(e.count + "x" + (e.stalled ? " (" + e.stalled + " stopped the render)" : "") + "  " + e.kind
      + "  last " + ago(e.last) + " ago, first " + ago(e.first) + " ago  v" + (e.version || "?") + "  " + e.fp);
    console.log("  " + e.msg);
    if (e.src) console.log("  at " + e.src);
    if (args.stack) {
      if (e.ctx) console.log("  ctx: " + e.ctx);
      if (e.path) console.log("  page: " + e.path);
      if (e.ua) console.log("  ua: " + e.ua);
      for (const l of (e.stack || "").split(NL)) console.log("    " + l.trim());
    }
  }
})().catch(e => die(e && e.stack || String(e)));
