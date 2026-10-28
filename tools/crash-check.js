#!/usr/bin/env node
"use strict";
// CRASH REPORTING check: the page's last-resort handler (armCrashReport, src/config.js) against
// a stub API, in headless Edge on the real GPU, in REAL time (the handler waits CRASH_WAIT ms
// to see whether the frame counter still moves).
//
//   node tools/crash-check.js <scratchdir> [dev-index.html]
//
// Self-driving, unlike the other browser checks: it serves the stub API itself, launches Edge
// once per case (each its own profile), collects what the page POSTs and kills that Edge.
// Cases:
//   nonfatal  a throw and a rejection of OURS while the picture keeps running: both reported
//             with stalled:false, version and context, a duplicate once, NO banner; an
//             extension's error, an opaque "Script error." and an extension's rejection are
//             neither reported nor shown
//   stall     the frame loop stops (rAF stubbed out), then a throw: reported stalled:true, banner
//   cap       seven different errors: five reports (CRASH_MAX)
//   boot      the app throws during boot (every getElementById answers null): reported, banner
//   noapi     no ?api= on file://: nothing posts (the headless tools must never publish)
// Against the build before this change, nonfatal shows the banner and nothing posts: red.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const SCRATCH = path.resolve(process.argv[2] || path.join(os.tmpdir(), "kt-crash"));
const PAGE = path.resolve(process.argv[3] || path.join(__dirname, "..", "dev-index.html"));
const NL = String.fromCharCode(10);
let fails = 0, passes = 0;
function ok(name, cond, extra) {
  if (typeof name !== "string") throw new Error("ok(name, cond): name must be a string");
  if (cond) passes++; else fails++;
  console.log((cond ? "PASS " : "FAIL ") + name + (extra !== undefined && !cond ? "  [" + extra + "]" : ""));
}

// ---- the stub API: crash reports and the page's own results ---------------------------------
const got = { cur: [], results: {} };   // cur = the reports of the case now running
const srv = http.createServer((req, res) => {
  let body = "";
  req.on("data", c => { body += c; });
  req.on("end", () => {
    const u = new URL(req.url, "http://x");
    const cs = u.searchParams.get("case") || "?";
    let j = null;
    try { j = JSON.parse(body); } catch (e) { /* not JSON */ }
    if (req.method === "POST" && u.pathname === "/api/errors") got.cur.push({ j, ct: req.headers["content-type"] });
    if (req.method === "POST" && u.pathname === "/result") got.results[cs] = j;
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end("{\"ok\":true}");
  });
});

// The page's own script, injected before the app; it posts its result to /result?case=. Cases
// run one at a time, so a report belongs to the case running. No backtick anywhere in here.
function probeScript(cs, port) {
  const R = "http://127.0.0.1:" + port;
  const lines = [
    "(function () {",
    "  var R = " + JSON.stringify(R) + ", CASE = " + JSON.stringify(cs) + ";",
    "  function banner() { var d = document.querySelector('div[role=alert]'); return d ? d.textContent : null; }",
    "  function done(o) { o.banner = banner(); fetch(R + '/result?case=' + CASE, { method: 'POST', body: JSON.stringify(o) }); }",
    "  function later(ms, f) { setTimeout(f, ms); }",
    "  function boom(m) { setTimeout(function () { throw new TypeError(m); }, 0); }",
    "  if (CASE === 'boot') { document.getElementById = function () { return null; }; }",
    "  addEventListener('load', function () {",
    "    if (CASE === 'nonfatal') later(3000, function () {",
    "      boom('probe nonfatal'); boom('probe dup'); later(50, function () { boom('probe dup'); });",
    "      Promise.reject(new RangeError('probe rejection'));",
    "      var ee = new Error('ext boom');",
    "      dispatchEvent(new ErrorEvent('error', { message: 'ext boom', filename: 'chrome-extension://abcdef/content.js', lineno: 3, colno: 4, error: ee }));",
    "      dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));",
    "      var xr = new Error('ext rejection'); xr.stack = 'Error: ext rejection\\n    at x (chrome-extension://abcdef/y.js:1:1)';",
    "      Promise.reject(xr);",
    "      later(4000, function () { done({}); });",
    "    });",
    "    if (CASE === 'stall') later(3000, function () {",
    "      window.requestAnimationFrame = function () { return 0; };",
    "      later(300, function () { boom('probe stall'); later(4000, function () { done({}); }); });",
    "    });",
    "    if (CASE === 'cap') later(3000, function () {",
    "      for (var i = 0; i < 7; i++) boom('probe cap ' + String.fromCharCode(97 + i));",
    "      later(4000, function () { done({}); });",
    "    });",
    "    if (CASE === 'boot' || CASE === 'noapi') later(6000, function () { done({}); });",
    "  });",
    "})();",
  ];
  return lines.join(NL);
}

function killEdge(udd) {
  spawnSync("powershell.exe", ["-NoProfile", "-Command",
    "Get-CimInstance Win32_Process -Filter \"Name like 'msedge%'\" | Where-Object { $_.CommandLine -like '*" + udd.replace(/'/g, "''") + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"],
    { stdio: "ignore" });
}

async function runCase(cs, html, port) {
  const file = path.join(SCRATCH, "crash-" + cs + ".html");
  const at = html.indexOf("<head>") + "<head>".length;
  const tag = "scr" + "ipt";
  fs.writeFileSync(file, html.slice(0, at) + "<" + tag + ">" + probeScript(cs, port) + "</" + tag + ">" + html.slice(at));
  const udd = path.join(SCRATCH, "udd-crash-" + cs + "-" + Date.now());
  const q = cs === "noapi" ? "" : "?api=http://127.0.0.1:" + port;
  got.cur = [];
  const url = "file:///" + file.replace(/\\/g, "/") + q;
  spawn(EDGE, ["--headless=new", "--disable-extensions", "--no-first-run", "--window-size=800,600",
    "--user-data-dir=" + udd, url], { stdio: "ignore", detached: true }).unref();
  const t0 = Date.now();
  while (!got.results[cs] && Date.now() - t0 < 40000) await new Promise(r => setTimeout(r, 200));
  await new Promise(r => setTimeout(r, 300));   // a report posted with the result still in flight
  killEdge(udd);
  try { fs.rmSync(udd, { recursive: true, force: true }); } catch (e) { /* Edge still letting go */ }
  return { result: got.results[cs], reports: got.cur };
}

(async () => {
  if (!fs.existsSync(EDGE)) { console.error("crash-check: Edge not found at " + EDGE); process.exit(1); }
  fs.mkdirSync(SCRATCH, { recursive: true });
  const html = fs.readFileSync(PAGE, "utf8");
  const version = (/version:\s*"([^"]+)"/.exec(html) || [])[1];
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;

  const msgs = rs => rs.map(x => x.j && x.j.msg);
  let c = await runCase("nonfatal", html, port);
  ok("nonfatal: the page finished", !!c.result, "no result posted");
  const nf = c.reports.map(x => x.j || {});
  ok("nonfatal: our throw is reported", nf.some(x => x.kind === "error" && /probe nonfatal/.test(x.msg)), JSON.stringify(msgs(c.reports)));
  ok("nonfatal: our rejection is reported, named", nf.some(x => x.kind === "rejection" && x.msg === "RangeError: probe rejection"), JSON.stringify(msgs(c.reports)));
  ok("nonfatal: a duplicate is reported once", nf.filter(x => /probe dup/.test(x.msg)).length === 1, JSON.stringify(msgs(c.reports)));
  ok("nonfatal: nothing foreign is reported (extension error, Script error., extension rejection)",
    !nf.some(x => /ext boom|ext rejection|Script error/.test(x.msg)), JSON.stringify(msgs(c.reports)));
  ok("nonfatal: exactly three reports", nf.length === 3, JSON.stringify(msgs(c.reports)));
  const one = nf.find(x => /probe nonfatal/.test(x.msg)) || {};
  ok("nonfatal: ...stalled false while the picture runs", one.stalled === false, JSON.stringify(one));
  ok("nonfatal: ...carrying the version, the path and where it was thrown", one.version === version
    && /crash-nonfatal\.html$/.test(one.path) && /crash-nonfatal\.html:\d+:\d+$/.test(one.src) && /probe nonfatal/.test(one.stack), JSON.stringify(one));
  ok("nonfatal: ...and the scene's shape", /^(gl|2d) \d+x\d+ \S+/.test(one.ctx || ""), one.ctx);
  ok("nonfatal: ...posted as text/plain (no preflight)", c.reports.every(x => /^text\/plain/.test(x.ct || "")), c.reports.map(x => x.ct).join());
  ok("nonfatal: NO banner while the page still runs", c.result && c.result.banner === null, c.result && c.result.banner);

  c = await runCase("stall", html, port);
  const st = c.reports.map(x => x.j || {});
  ok("stall: the page finished", !!c.result, "no result posted");
  ok("stall: reported with stalled true", st.length === 1 && st[0].stalled === true && /probe stall/.test(st[0].msg), JSON.stringify(st));
  ok("stall: the banner says it stopped", c.result && /stopped/.test(c.result.banner || ""), c.result && c.result.banner);

  c = await runCase("cap", html, port);
  ok("cap: seven different errors make five reports", c.reports.length === 5, JSON.stringify(msgs(c.reports)));

  c = await runCase("boot", html, port);
  const bt = c.reports.map(x => x.j || {});
  ok("boot: the page finished", !!c.result, "no result posted");
  ok("boot: a boot crash is reported, stalled", bt.length >= 1 && bt[0].stalled === true, JSON.stringify(bt));
  ok("boot: the banner shows", c.result && /stopped/.test(c.result.banner || ""), c.result && c.result.banner);

  c = await runCase("noapi", html, port);
  ok("noapi: the page finished", !!c.result, "no result posted");
  ok("noapi: file:// without ?api= posts nothing", c.reports.length === 0, JSON.stringify(msgs(c.reports)));

  srv.close();
  console.log((fails ? "FAILED" : "OK") + ": " + passes + " passed, " + fails + " failed");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FAIL check crashed: " + (e && e.stack || e)); process.exit(1); });
