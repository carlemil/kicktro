#!/usr/bin/env node
// WHAT A SCENE SWITCH COSTS, measured on the real GPU in REAL time.
//
//   node tools/transperf-check.js <outdir> [dev-index.html] [--tag=x]
//
// then run the printed msedge line (NO --virtual-time-budget: it fast-forwards the clock and
// every timing below would be fiction). Results arrive as TPERF lines on stderr.
//
// Walks the library in order, one transition per pair (scene i -> i+1), the way auto-cycle
// does it, and reports for each:
//   sw     the SYNCHRONOUS cost of the switch: applyPreset(i, true), exactly as cyclePresets calls it
//   gap    the longest gap between two frames while the blend runs -- the hitch you see
//   gA     median GPU ms per frame on the outgoing scene alone, before the switch
//   gT     median GPU ms per frame DURING the blend (both scenes render)
//   gTx    the worst GPU frame during the blend
//   jump   the largest step the blend took between two frames (0..1 of the whole blend): a
//          hitch that lands in the blend shows up here as a skip
//   fps1   frames rendered in the first SECOND after the switch call began, the freeze inside
//          it included: what the eye gets. Only meaningful with the printed vsync-off flags
//          (headless otherwise caps the frame rate).
//   fpsT   frames per second while the blend ran, over its own wall span
// --dur=<s> pins every switch to an eased crossfade of that length, on old builds too (they
// auto-picked a mode per pair): the way to A/B one build against another.
// Same instrument as perf-check (its frame hook), same traps: compare cold against cold.
//
// Named -check, not *probe.js: /deploy runs node tools/*probe.js. No backtick in the injected
// source (CLAUDE.md).
const fs = require("fs");
const path = require("path");
const NL = String.fromCharCode(10);

const outDir = process.argv[2];
const appFile = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "dev-index.html";
const TAG = (process.argv.find(a => a.startsWith("--tag=")) || "").slice(6);
const DUR = +(process.argv.find(a => a.startsWith("--dur=")) || "").slice(6) || 0;
if (!outDir) { console.error("usage: node tools/transperf-check.js <outdir> [dev-index.html] [--tag=x]"); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const app = fs.readFileSync(appFile, "utf8");

const HOOK_BEGIN = "function frame(now) {" + NL + "    requestAnimationFrame(frame);";
const HOOK_END = "if (useGL) glRender();";
const HOOK_LEN = "const len = transLen();";
const HOOK_TRANS = "  const trans = { on: false, t: 0, dur: 0, mode: -1, burn: false, id: \"cut\" };";
for (const h of [HOOK_BEGIN, HOOK_END, HOOK_TRANS, HOOK_LEN]) {
  const n = app.split(h).length - 1;
  if (n !== 1) throw new Error("hook '" + h.slice(0, 50) + "' matched " + n + " times, expected exactly 1");
}

// Each GPU query carries the phase it was issued in, since results arrive frames late.
const PERF = [
  "  var __tpQ = [], __tpExt = null, __tpCur = null, __tpReady = false, __tpLast = 0;",
  "  window.__tp = { gpu: [], gaps: [], tt: [], phase: '' };",
  "  function __tpBegin() {",
  "    var t = performance.now();",
  "    if (__tpLast) window.__tp.gaps.push({ ph: window.__tp.phase, d: t - __tpLast, w: t });",
  "    __tpLast = t;",
  "    if (window.__trans && window.__trans.on) window.__tp.tt.push({ ph: window.__tp.phase, d: window.__trans.t, w: performance.now() });",
  "    if (typeof useGL === 'undefined' || !useGL || !gl) return;",
  "    if (!__tpReady) { __tpReady = true; __tpExt = gl.getExtension('EXT_disjoint_timer_query_webgl2'); }",
  "    if (!__tpExt) return;",
  "    if (__tpCur) { try { gl.endQuery(__tpExt.TIME_ELAPSED_EXT); } catch (e) {} __tpCur = null; }",
  "    var q = gl.createQuery(); q.__ph = window.__tp.phase;",
  "    try { gl.beginQuery(__tpExt.TIME_ELAPSED_EXT, q); __tpCur = q; } catch (e) { __tpCur = null; }",
  "  }",
  "  function __tpEnd() {",
  "    if (typeof useGL === 'undefined' || !useGL || !gl || !__tpExt) return;",
  "    if (__tpCur) { gl.endQuery(__tpExt.TIME_ELAPSED_EXT); __tpQ.push(__tpCur); __tpCur = null; }",
  "    var dis = gl.getParameter(__tpExt.GPU_DISJOINT_EXT);",
  "    for (var i = __tpQ.length - 1; i >= 0; i--) {",
  "      var qq = __tpQ[i];",
  "      if (gl.getQueryParameter(qq, gl.QUERY_RESULT_AVAILABLE)) {",
  "        if (!dis) window.__tp.gpu.push({ ph: qq.__ph, ms: gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6 });",
  "        __tpQ.splice(i, 1); gl.deleteQuery(qq);",
  "      }",
  "    }",
  "  }",
  "",
].join(NL);

let s = app.split(HOOK_BEGIN).join(HOOK_BEGIN + " __tpBegin();");
s = s.split(HOOK_END).join("__tpEnd(); " + HOOK_END);
s = s.split("  function frame(now) {" + NL).join(PERF + "  function frame(now) {" + NL);
s = s.split(HOOK_TRANS).join(HOOK_TRANS + NL + "  window.__trans = trans; window.__cycleTo = function (j) { applyPreset(j, true); }; window.__presetNames = function () { return presets.map(function (p) { return p.name; }); }; window.__pinX = function () { transUse = new Set([\"crossfade\"]); };");
if (DUR) s = s.split(HOOK_LEN).join("const len = window.__tlen || transLen();");

const SEED = [
  "<script>(function(){",
  "  try {",
  "    localStorage.clear();",
  "    localStorage.setItem('burnTheWeb.v1', JSON.stringify({ panelOpen: false, cycle: false }));",
  "    localStorage.setItem('burnTheWeb.tutorial.v1', '1');",
  "    localStorage.setItem('burnTheWeb.credits.v1', 'off');",
  "    localStorage.setItem('burnTheWeb.sync.v1', JSON.stringify({ shows: 9, done: true }));",
  "  } catch (e) {}",
  "  var mm = window.matchMedia;   // reduced motion would pause the app after two frames",
  "  window.matchMedia = function (q) { return /reduced-motion/.test(q) ? mm.call(window, 'not all') : mm.call(window, q); };",
  "  window.__errs = 0;",
  "  var ce = console.error; console.error = function(){ window.__errs++; ce.apply(console, arguments); };",
  "  window.addEventListener('error', function(){ window.__errs++; });",
  "})();</" + "script>",
].join(NL);

const RUN = [
  "<script>(function(){",
  "  function med(a){ if (!a.length) return -1; var b = a.slice().sort(function(x,y){return x-y;}); return b[Math.floor(b.length/2)]; }",
  "  function mx(a){ return a.length ? Math.max.apply(null, a) : -1; }",
  "  function r(v){ return Math.round(v * 100) / 100; }",
  "  function pick(list, ph){ return list.filter(function(o){ return o.ph === ph; }).map(function(o){ return o.ms !== undefined ? o.ms : o.d; }); }",
  "  if (typeof window.__presetNames !== 'function') { return setTimeout(arguments.callee, 200); }",
  "  var names = window.__presetNames(), N = names.length, i = 0;",
  "  var cv = document.getElementById('fire');",
  "  console.log('TPERF setup|' + N + ' scenes|' + cv.width + 'x' + cv.height);",
  "  function go(j){ var t0 = performance.now(); window.__cycleTo(j); return performance.now() - t0; }",
  "  if (" + DUR + ") { window.__tlen = { a: " + DUR + ", b: " + DUR + " }; window.__pinX(); }",
  "  go(0);",
  "  function step(){",
  "    if (i >= N - 1) { console.log('TPERF DONE errs=' + window.__errs); return; }",
  "    var A = 'A' + i, T = 'T' + i;",
  "    window.__tp.phase = A;",
  "    setTimeout(function(){",
  "      window.__tp.phase = T;",
  "      var tsw = performance.now(), sw = go(i + 1);",
  "      var id = window.__trans.on ? window.__trans.id : 'none', dur = window.__trans.dur;",
  "      var t0 = performance.now();",
  "      (function wait(){",
  "        if (window.__trans.on && performance.now() - t0 < 4000) return setTimeout(wait, 20);",
  "        window.__tp.phase = 'S';",
  "        setTimeout(function(){",
  "          var gA = pick(window.__tp.gpu, A), gT = pick(window.__tp.gpu, T), dT = pick(window.__tp.gaps, T);",
  "          var f1 = window.__tp.gaps.filter(function(o){ return o.w > tsw && o.w <= tsw + 1000; }).length;",
  "          var tw = window.__tp.tt.filter(function(o){ return o.ph === T; }), fT = tw.length > 1 ? (tw.length - 1) * 1000 / (tw[tw.length - 1].w - tw[0].w) : -1;",
  "          var tt = pick(window.__tp.tt, T), jump = 0; for (var q = 1; q < tt.length; q++) jump = Math.max(jump, tt[q] - tt[q - 1]);",
  "          console.log('TPERF pair|' + names[i] + ' -> ' + names[i + 1] + '|' + id + '|dur=' + r(dur) +",
  "            '|sw=' + r(sw) + '|fps1=' + f1 + '|fpsT=' + r(fT) + '|gap=' + r(mx(dT)) + '|jump=' + r(jump) + '|gA=' + r(med(gA)) + '|gT=' + r(med(gT)) + '|gTx=' + r(mx(gT)) + '|nT=' + gT.length);",
  "          i++; step();",
  "        }, 300);",
  "      })();",
  "    }, 1800);",
  "  }",
  "  setTimeout(step, 2500);",
  "})();</" + "script>",
].join(NL);

s = s.split("<head>").join("<head>" + NL + SEED);
s = s.split("</body>").join(RUN + NL + "</body>");
const file = path.join(outDir, "transperf" + (TAG ? "-" + TAG : "") + ".html");
fs.writeFileSync(file, s);
console.log("wrote " + file);
const abs = path.resolve(file).split(path.sep).join("/");
console.log("run (REAL time, cold shader cache):");
console.log("  msedge --headless=new --disable-extensions --enable-logging=stderr --v=0 --window-size=1920,1080 " +
  "--disable-gpu-vsync --disable-frame-rate-limit --disable-gpu-shader-disk-cache --user-data-dir=<tmp> \"file:///" + abs + "\" 2>&1 | grep -a -oE '\"TPERF[^\"]*\"'");
