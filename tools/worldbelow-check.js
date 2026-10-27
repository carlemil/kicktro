#!/usr/bin/env node
// Does the shared world's glass actually RECEIVE the filtered picture?
//
//   node tools/worldbelow-check.js <outdir> [dev-index.html]
//
// then run the two printed msedge commands. Every line is PASS/FAIL on stderr.
//
// WHY THIS EXISTS. The feature is one capture guarded by
//   if (glBelowTex && worldPlan && L === worldPlan.gbs[0]) captureWorldBelow(acc);
// and if that identity test never matches -- a different object in live[] than in
// worldPlan.gbs, or a glass layer that is always bottom-most -- the capture never fires,
// uHasBelow stays 0, and FS_WORLD shades exactly as it did before. Nothing errors, the
// picture is plausible, and worldprobe, worldcompile-check and world-check all stay GREEN,
// because not one of them can see whether a uniform was ever set to 1.
//
// That is the vacuous-check failure this project has already been bitten by once: the
// per-layer tint DOM check passed against the broken build, because the fix also patched
// the path the check happened to drive. So this counts the two events that matter and
// ships with a NEGATIVE CONTROL page that neuters the capture call. If the control does
// not go red, the check is measuring nothing.
//
// No backtick anywhere in the injected source; assembled from arrays joined by an explicit
// newline, per the rule in CLAUDE.md.
const fs = require("fs");
const path = require("path");
const NL = String.fromCharCode(10);
const Q = String.fromCharCode(39);

const outDir = process.argv[2];
const appFile = process.argv[3] || "dev-index.html";
if (!outDir) { console.error("usage: node tools/worldbelow-check.js <outdir> [dev-index.html]"); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const app = fs.readFileSync(appFile, "utf8");

// ---- instrumentation, applied to a COPY of the built app --------------------------------
const CAP_SET  = "worldBelowOk = true;";
const HAS_SET  = "gl.uniform1f(P.u.uHasBelow, worldBelowOk ? 1 : 0);";
const CAP_CALL = "if (glBelowTex && worldPlan && L === worldPlan.gbs[0]) captureWorldBelow(acc);";
for (const pair of [["CAP_SET", CAP_SET], ["HAS_SET", HAS_SET], ["CAP_CALL", CAP_CALL]]) {
  if (!app.includes(pair[1]))
    throw new Error("anchor missing (" + pair[0] + ") -- the feature moved: " + pair[1].slice(0, 60));
}

function instrument(src, neuter) {
  let s = src
    .replace(CAP_SET, CAP_SET + " window.__wbCap = (window.__wbCap || 0) + 1;")
    .replace(HAS_SET, HAS_SET + " if (worldBelowOk) window.__wbHas = (window.__wbHas || 0) + 1;");
  // The negative control removes the ONE line that arms the whole feature.
  if (neuter) s = s.replace(CAP_CALL, ";");
  return s;
}

const SEED = [
  "(function(){",
  "  try {",
  "    localStorage.clear();",
  "    localStorage.setItem(\"burnTheWeb.v1\", JSON.stringify({ panelOpen: true, cycle: false, tdur: [0, 0] }));",
  "    localStorage.setItem(\"burnTheWeb.tutorial.v1\", \"1\");",
  "    localStorage.setItem(\"burnTheWeb.credits.v1\", \"off\");",
  "    localStorage.setItem(\"burnTheWeb.sync.v1\", JSON.stringify({ shows: 9, done: true }));",
  "  } catch (e) {}",
  "  window.__errs = 0;",
  "  var ce = console.error;",
  "  console.error = function(){ window.__errs++; ce.apply(console, arguments); };",
  "  window.addEventListener(\"error\", function(){ window.__errs++; });",
  "})();",
].join(NL);

function assertSrc(neg) {
  const want = JSON.stringify(neg ? "0" : "more than 0");
  return [
    "(function(){",
    "  var fails = 0;",
    "  var NEG = " + (neg ? "true" : "false") + ";",
    "  var WANT = " + want + ";",
    "  function ok(name, cond, extra){",
    "    // NAME FIRST -- swapped, every assertion passes unconditionally.",
    "    if (typeof name !== \"string\") {",
    "      console.log(\"FAIL  ok() called with its arguments swapped: \" + name + \" / \" + cond);",
    "      fails++; return;",
    "    }",
    "    console.log((cond ? \"PASS  \" : \"FAIL  \") + name + (extra ? \"  [\" + extra + \"]\" : \"\"));",
    "    if (!cond) fails++;",
    "  }",
    "  function vis(list){ return [].slice.call(list).filter(function(n){ return n.offsetParent !== null; }); }",
    "  // The rows are a FIXED POOL with the spares hidden, so filter on visibility -- and query",
    "  // the selects globally the way world-check does, since the block lives in #breakout now.",
    "  function setFx(i, name){",
    "    var sel = vis(document.querySelectorAll(\"select.lyr-name\"))[i]; if (!sel) return false;",
    "    var o = [].slice.call(sel.options).filter(function(x){ return x.textContent.trim() === name; })[0];",
    "    if (!o) return false;",
    "    sel.value = o.value; sel.dispatchEvent(new Event(\"change\", { bubbles: true }));",
    "    return true;",
    "  }",
    "  function done(){ console.log(\"DONE fails=\" + fails); }",
    "",
    "  setTimeout(function(){",
    "    ok(\"the app started clean\", window.__errs === 0, window.__errs + \" console errors\");",
    "    // A fresh profile opens on the library's FIRST scene, which is single-layer -- so pick a",
    "    // shipped two-layer one rather than adding a layer from a probe. Changing a layer's",
    "    // effect keeps its slot, so this just gives us two rows to point at Ocean and Glass.",
    "    var ps = document.getElementById(\"preset\");",
    "    var sc = [].slice.call(ps.options).filter(function(n){",
    "      return /Round and round|Julia shapes/.test(n.textContent);",
    "    })[0];",
    "    ok(\"a shipped two-layer scene is in the list\", !!sc);",
    "    if (!sc) return done();",
    "    ps.value = sc.value; ps.dispatchEvent(new Event(\"change\", { bubbles: true }));",
    "  setTimeout(function(){",
    "    // Ocean on the BOTTOM so the glass above it has something to capture, glass ABOVE so",
    "    // li > 0 and gbs[0] is a layer the render loop actually walks past.",
    "    var a = setFx(0, \"Ocean\"), b = setFx(1, \"Glass ball\");",
    "    ok(\"Ocean and Glass ball are both in the effect list\", a && b,",
    "       \"ocean=\" + a + \" glass=\" + b + \" selects=\" + vis(document.querySelectorAll(\"select.lyr-name\")).length);",
    "    if (!(a && b)) return done();",
    "    var pops = vis(document.querySelectorAll(\"#panel .lyr button.lyr-pop\"));",
    "    if (pops[0]) pops[0].click();",
    "    if (pops[1]) pops[1].click();",
    "    setTimeout(function(){",
    "      // One tick per layer -- each checkbox writes the layer it BELONGS to, so both have",
    "      // to be ticked for the two effects to share one world.",
    "      var ws = vis(document.querySelectorAll(\"[data-k=world]\"));",
    "      ok(\"both layers expose a Share one 3D world tick\", ws.length >= 2, ws.length + \" ticks\");",
    "      if (ws.length < 2) return done();",
    "      ws[0].checked = true; ws[0].dispatchEvent(new Event(\"change\", { bubbles: true }));",
    "      ws[1].checked = true; ws[1].dispatchEvent(new Event(\"change\", { bubbles: true }));",
    "      // POLL IN REAL TIME, and this check runs with NO --virtual-time-budget because of it.",
    "      // Until the world program links, worldProgFor returns null, renderStackColor nulls",
    "      // worldPlan and the joined layers draw themselves standalone -- so nothing captures",
    "      // yet. That link is ocean+glass, the slowest combination, measured around 7.7s COLD.",
    "      // A virtual clock blows straight through a setTimeout of any size while the driver is",
    "      // still really linking, so a timer here reports 0 captures against correct code.",
    "      var t0 = Date.now();",
    "      (function poll(){",
    "        var cap = window.__wbCap || 0, has = window.__wbHas || 0;",
    "        var over = Date.now() - t0 > 90000;",
    "        // The negative control can only be confirmed by waiting the whole deadline out.",
    "        if (!over && (NEG || !(cap > 0 && has > 0))) return setTimeout(poll, 250);",
    "        ok(\"the capture fires for the lowest joined glass layer (want \" + WANT + \")\",",
    "           NEG ? cap === 0 : cap > 0, \"captures=\" + cap + \" after \" + Math.round((Date.now()-t0)/1000) + \"s\");",
    "        ok(\"the world pass is handed the picture, uHasBelow=1 (want \" + WANT + \")\",",
    "           NEG ? has === 0 : has > 0, \"draws with a picture=\" + has + \" frames\");",
    "        ok(\"no console errors across the whole run\", window.__errs === 0, window.__errs + \" errors\");",
    "        done();",
    "        try { window.close(); } catch (e) {}",
    "      })();",
    "    }, 900);",
    "  }, 900);",
    "  }, 1800);",
    "})();",
  ].join(NL);
}

const abs = path.resolve(outDir).split(path.sep).join("/");
const pages = [[false, "wbelow.html"], [true, "wbelow-neg.html"]];
for (const pg of pages) {
  let s = instrument(app, pg[0]);
  s = s.replace("<head>", "<head>" + NL + "<script>" + SEED + "<" + "/script>");
  s = s.replace("</body>", "<script>" + assertSrc(pg[0]) + "<" + "/script>" + NL + "</body>");
  fs.writeFileSync(path.join(outDir, pg[1]), s);
  console.log("wrote " + path.join(outDir, pg[1]));
}
console.log(NL + "run BOTH -- the second must go red, or the first is measuring nothing:");
for (const pg of pages) {
  console.log((pg[0] ? "  [negative control] " : "  [real]             ")
    + "msedge --headless=new --disable-extensions --enable-logging=stderr --v=0"
    + " --window-size=1280,800"   // NO virtual time: the link is real seconds, see the poll
    + " --user-data-dir=\"" + abs + "/ud-wb\""
    + " \"file:///" + abs + "/" + pg[1] + "\" 2>&1 | grep -oE " + Q + "\"(PASS|FAIL|DONE)[^\"]*\"" + Q);
}
