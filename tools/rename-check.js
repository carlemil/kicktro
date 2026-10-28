#!/usr/bin/env node
// BROWSER check: the Scene box's title names the selected scene, and its pencil renames it.
// Lives in a live DOM (a <summary> folds on any click inside it, and the app's m / Escape
// shortcuts listen on window), so it needs a browser -- hence NOT *probe.js.
//
//   node tools/rename-check.js <outdir> [dev-index.html]
//
// then run the msedge line it prints (Edge 156+: the console goes to --log-file, grep it for
// PASS / FAIL / DONE). The negative control is the build before the pencil: index.html of
// 1.99.2 has no #scenerename and goes red.
//
// No backtick anywhere in the injected source (CLAUDE.md).
const fs = require("fs");
const path = require("path");
const NL = String.fromCharCode(10);

const outDir = process.argv[2];
const appFile = process.argv[3] || "dev-index.html";
if (!outDir) { console.error("usage: node tools/rename-check.js <outdir> [dev-index.html]"); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const app = fs.readFileSync(appFile, "utf8");

const SEED_JS = [
  "(function () {",
  "  try {",
  "    localStorage.clear();",
  "    localStorage.setItem(\"burnTheWeb.v1\", JSON.stringify({ panelOpen: true, cycle: false, tdur: [0, 0] }));",
  "    localStorage.setItem(\"burnTheWeb.tutorial.v1\", \"1\");",
  "    localStorage.setItem(\"burnTheWeb.credits.v1\", \"off\");",
  "    localStorage.setItem(\"burnTheWeb.sync.v1\", JSON.stringify({ shows: 9, done: true }));",
  "  } catch (e) {}",
  "})();"
].join(NL);

const ASSERT_JS = [
  "(function () {",
  "  function whenReady(fn) { if (window.__appReady) return fn(); addEventListener(\"app:ready\", fn, { once: true }); }",
  "  whenReady(function () { setTimeout(function () {",
  "    var fails = 0;",
  "    function ok(name, cond, extra) {",
  "      if (typeof name !== \"string\") { console.log(\"FAIL  ok() called with its arguments swapped\"); fails++; return; }",
  "      console.log((cond ? \"PASS  \" : \"FAIL  \") + name + (extra ? \"  [\" + extra + \"]\" : \"\"));",
  "      if (!cond) fails++;",
  "    }",
  "    function done() { console.log(\"DONE fails=\" + fails); }",
  "    var $ = function (id) { return document.getElementById(id); };",
  "    var box = $(\"scenebox\"), now = $(\"scenenow\"), pen = $(\"scenerename\"), inp = $(\"scenename\"), sel = $(\"preset\");",
  "    var shown = function (n) { return !!n && n.offsetParent !== null; };",
  "    var key = function (k) { inp.dispatchEvent(new KeyboardEvent(\"keydown\", { key: k, bubbles: true, cancelable: true })); };",
  "    var selName = function () { var o = sel && sel.options[sel.selectedIndex]; return o ? o.text : \"\"; };",
  "    var stored = function () { try { return localStorage.getItem(\"burnTheWeb.v1\") || \"\"; } catch (e) { return \"\"; } };",
  "    ok(\"the panel is open\", !$(\"panel\").classList.contains(\"hidden\"));",
  "    ok(\"the Scene box exists and its title holds the name\", !!box && !!now && now.parentNode === box.querySelector(\"summary\"));",
  "    if (!box || !now || !pen || !inp) { ok(\"the rename pencil and field exist\", false); done(); return; }",
  "    var first = selName();",
  "    ok(\"the title IS the selected scene's name\", first !== \"\" && now.textContent === first, now.textContent + \" / \" + first);",
  "    ok(\"the pencil is visible, the field is not\", shown(pen) && !shown(inp));",
  "    box.open = true;",
  "    pen.click();",
  "    ok(\"the pencil does not fold the box\", box.open);",
  "    ok(\"the pencil opens the field on the old name\", shown(inp) && !shown(now) && inp.value === first, inp.value);",
  "    ok(\"the field has focus\", document.activeElement === inp);",
  "    key(\"m\");",
  "    ok(\"typing m in the field does not hide the panel\", !$(\"panel\").classList.contains(\"hidden\"));",
  "    inp.click();",
  "    ok(\"clicking in the field does not fold the box\", box.open);",
  "    inp.value = \"Renamed by check\";",
  "    key(\"Enter\");",
  "    ok(\"Enter renames: the title\", now.textContent === \"Renamed by check\", now.textContent);",
  "    ok(\"Enter renames: the scene itself\", selName() === \"Renamed by check\", selName());",
  "    ok(\"Enter closes the field\", !shown(inp) && shown(now) && shown(pen));",
  "    ok(\"the rename is saved\", stored().indexOf(\"Renamed by check\") >= 0);",
  "    ok(\"the box is still open\", box.open);",
  "    pen.click();",
  "    inp.value = \"Thrown away\";",
  "    key(\"Escape\");",
  "    ok(\"Escape keeps the old name\", now.textContent === \"Renamed by check\" && selName() === \"Renamed by check\", now.textContent);",
  "    ok(\"Escape closes the field\", !shown(inp) && shown(now));",
  "    var other = sel.options.length > 1 ? sel.options[sel.selectedIndex === 0 ? 1 : 0].text : \"\";",
  "    pen.click();",
  "    inp.value = other;",
  "    key(\"Enter\");",
  "    ok(\"a name another scene has is bumped, never shared\", other !== \"\" && now.textContent !== other && now.textContent.indexOf(other) === 0, other + \" -> \" + now.textContent);",
  "    pen.click();",
  "    inp.value = \"   \";",
  "    key(\"Enter\");",
  "    ok(\"an empty name changes nothing\", now.textContent !== \"\" && selName() === now.textContent, now.textContent);",
  "    done();",
  "  }, 500); });",
  "})();"
].join(NL);

let s = app.replace("<head>", "<head>" + NL + "<script>" + SEED_JS + "<" + "/script>");
s = s.replace("</body>", "<script>" + ASSERT_JS + "<" + "/script>" + NL + "</body>");
if (s === app) throw new Error("injection failed");
const f = path.join(outDir, "rename.html");
fs.writeFileSync(f, s);
console.log("wrote " + f);
const abs = path.resolve(outDir);
console.log(NL + "run with:");
console.log('  msedge --headless=new --disable-extensions --enable-logging --log-file="' + abs + '\\rename.log" --v=0'
  + ' --virtual-time-budget=30000 --user-data-dir="' + abs + '\\ud-rename"'
  + ' "file:///' + abs.split(path.sep).join("/") + '/rename.html"');
