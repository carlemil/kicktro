#!/usr/bin/env node
// A/B SCREENSHOT of one effect from one build, at a DETERMINISTIC instant.
//
//   node tools/abshot.js <outdir> <page.html> <tag> "<Effect name>" [frames]
//
// then run the printed msedge line, which writes <outdir>/shot-<tag>.png.
//
// Two shots taken with this from two builds show the same scene at the same frame, so any
// difference between them is the build and nothing else. That is the property a wall-clock
// screenshot cannot give: two headless runs never land on the same frame, and a lossy
// optimisation judged against a picture from a different instant is judged against noise.
// Same harness as pixgate.js -- owned rAF queue with a fixed 1/60 step, stubbed Math.random
// -- with the UI hidden and the frame left on screen for the screenshot to catch.
//
// No backtick anywhere in the injected source; arrays joined by an explicit newline.
const fs = require("fs");
const path = require("path");
const NL = String.fromCharCode(10);

if (process.argv[2] === "--decode") {
  const out = process.argv[3];
  let buf = "";
  process.stdin.on("data", d => buf += d);
  process.stdin.on("end", () => {
    // Chrome quotes the console line; the payload runs to the closing quote.
    const m = buf.match(/SHOTB64\|[^|"]*\|([A-Za-z0-9+/=]+)/);
    if (!m) { console.error("no SHOTB64 line found"); process.exit(1); }
    fs.writeFileSync(out, Buffer.from(m[1], "base64"));
    console.log("wrote " + out + " (" + fs.statSync(out).size + " bytes)");
  });
  return;
}
// --set key=value (repeatable) sets a slider before the frames are pumped.
// --filter=<id> (repeatable) turns that filter ON after the strip, so a filter can be shot.
const SET = {};
const FLT = [];
const argv = process.argv.slice(2).filter(a => {
  const f = a.match(/^--filter=(.+)$/); if (f) { FLT.push(f[1]); return false; }
  const m = a.match(/^--set=?(.+?)=(.+)$/); if (m) { SET[m[1]] = m[2]; return false; } return true;
});
const [outDir, pageFile, tag, effect, framesArg] = argv;
if (!outDir || !pageFile || !tag || !effect) {
  console.error("usage: node tools/abshot.js <outdir> <page.html> <tag> \"<Effect name>\" [frames]");
  process.exit(2);
}
const FRAMES = +framesArg || 90;
fs.mkdirSync(outDir, { recursive: true });
const app = fs.readFileSync(pageFile, "utf8");

const HEAD = [
  "(function(){",
  "  try {",
  "    localStorage.clear();",
  "    localStorage.setItem(\"burnTheWeb.v1\", JSON.stringify({ panelOpen: true, cycle: false, tdur: [0, 0] }));",
  "    localStorage.setItem(\"burnTheWeb.tutorial.v1\", \"1\");",
  "    localStorage.setItem(\"burnTheWeb.credits.v1\", \"off\");",
  "    localStorage.setItem(\"burnTheWeb.sync.v1\", JSON.stringify({ shows: 9, done: true }));",
  "  } catch (e) {}",
  "  var st = 0x9E3779B9;",
  "  Math.random = function(){ st ^= st << 13; st ^= st >>> 17; st ^= st << 5; return ((st >>> 0) % 1000000) / 1000000; };",
  "  var q = [], t = 1000;",
  "  window.__realRAF = window.requestAnimationFrame.bind(window);",
  "  window.requestAnimationFrame = function(cb){ q.push(cb); return q.length; };",
  "  window.cancelAnimationFrame = function(){};",
  "  window.__pump = function(n){",
  "    for (var i = 0; i < n; i++){ var cur = q; q = []; t += 1000 / 60; for (var j = 0; j < cur.length; j++) cur[j](t); }",
  "  };",
  "})();",
].join(NL);

const BODY = [
  "(function(){",
  "  function vis(l){ return [].slice.call(l).filter(function(n){ return n.offsetParent !== null; }); }",
  "  function go(){",
  "    window.__pump(4);",
  "    var sel = vis(document.querySelectorAll(\"select.lyr-name\"))[0];",
  "    // STRIP THROUGH THE HOOK, not the ✕ buttons: those live in the layer box, which starts",
  "    // closed, so vis() never finds them and the shipped twelve-filter chain (Kaleidoscope",
  "    // included) stayed on -- the first 'clouds' shot was a six-fold kaleidoscope of it.",
  "    window.__filterIds().forEach(function(id){ window.__setFilterOn(id, false); });",
  "    var chain = document.querySelectorAll(\".filter-sec:not([hidden])\").length;",
  "    console.log(\"SHOT|chain|\" + chain);",
  "    var o = [].slice.call(sel.options).filter(function(x){ return x.textContent.trim() === " + JSON.stringify(effect) + "; })[0];",
  "    if (!o){ console.log(\"SHOT|MISSING\"); return; }",
  "    sel.value = o.value; sel.dispatchEvent(new Event(\"change\", { bubbles: true }));",
  "    " + JSON.stringify(FLT) + ".forEach(function(id){ window.__setFilterOn(id, true); });",
  "    console.log(\"SHOT|filters|\" + document.querySelectorAll(\".filter-sec:not([hidden])\").length);",
  "    // Optional slider overrides (--set key=value): both thumbs, dispatched as the user's own",
  "    // input so apply() runs and a single control collapses the way it does for a person.",
  "    var SET = " + JSON.stringify(SET) + ";",
  "    Object.keys(SET).forEach(function(k){ [\"-lo\", \"-hi\"].forEach(function(t){",
  "      var e = document.querySelector(\"[data-k=\" + JSON.stringify(k + t) + \"]\");",
  "      if (e){ e.value = String(SET[k]); e.dispatchEvent(new Event(\"input\", { bubbles: true })); }",
  "    }); });",
  "    // GRAYSCALE, deliberately. Heat is one channel, so luminance IS the difference between",
  "    // two builds -- and the shipped Fire palette is near-white at the top, where a dense",
  "    // effect (clouds at full cover) pins and every shot came back a flat yellow.",
  "    var pal = document.getElementById(\"palette\");",
  "    if (pal){ var g = [].slice.call(pal.options).filter(function(x){ return /gray|grey/i.test(x.textContent); })[0];",
  "      if (g){ pal.value = g.value; pal.dispatchEvent(new Event(\"change\", { bubbles: true })); } }",
  "    document.body.classList.add(\"ui-hidden\");",
  "    window.__pump(" + FRAMES + ");",
  "    // NOT --screenshot. With the rAF queue owned the page never asks the browser for a frame,",
  "    // and headless snapshots before the compositor has presented anything: every shot came",
  "    // back as one 4.7 KB solid, and requesting a real rAF for the final frame did not help.",
  "    // So the picture is taken the way pixgate reads pixels -- IN THE SAME TASK as the last",
  "    // draw, before the drawing buffer is cleared -- by copying the WebGL canvas into a 2D one",
  "    // and shipping it out through the console as base64. Deterministic, compositor-free.",
  "    var src = document.getElementById(\"fire\");",
  "    var c2 = document.createElement(\"canvas\"); c2.width = " + 800 + "; c2.height = " + 500 + ";",
  "    c2.getContext(\"2d\").drawImage(src, 0, 0, c2.width, c2.height);",
  "    console.log(\"SHOTB64|\" + " + JSON.stringify(tag) + " + \"|\" + c2.toDataURL(\"image/png\").split(\",\")[1]);",
  "    console.log(\"SHOT|ready|\" + " + JSON.stringify(tag) + ");",
  "  }",
  "  if (window.__appReady) go(); else addEventListener(\"app:ready\", go, { once: true });",
  "})();",
].join(NL);

// The same one-line hook perf-check splices: the real filter toggle and the registry, so the
// strip cannot depend on which UI happens to be open. Lazy, because the splice point sits
// above the registry's const.
const HOOK_FLT = "  function closeFilterPicker() {";
if (app.split(HOOK_FLT).length - 1 !== 1) throw new Error("filter hook did not match exactly once");
let s = app.replace(HOOK_FLT, "  window.__setFilterOn = setFilterOn; window.__filterIds = function(){ return FILTERS.map(function(f){ return f.id; }); };" + NL + HOOK_FLT);
s = s.replace("<head>", "<head>" + NL + "<script>" + HEAD + "<" + "/script>");
s = s.replace("</body>", "<script>" + BODY + "<" + "/script>" + NL + "</body>");
if (s === app) throw new Error("injection failed");
const f = path.join(outDir, "ab-" + tag + ".html");
fs.writeFileSync(f, s);
const abs = path.resolve(outDir).split(path.sep).join("/");
console.log("wrote " + f);
console.log("  msedge --headless=new --disable-extensions --enable-logging=stderr --v=0 --window-size=1280,800"
  + " --virtual-time-budget=8000 --user-data-dir=\"" + abs + "/ud-ab-" + tag + "\""
  + " \"file:///" + abs + "/ab-" + tag + ".html\" 2>&1 | node tools/abshot.js --decode " + abs + "/shot-" + tag + ".png");
