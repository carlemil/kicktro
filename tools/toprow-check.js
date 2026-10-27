#!/usr/bin/env node
// BROWSER check: the top row of buttons that replaced the ☰ dropdown. Every claim lives in a
// live DOM, so it is NOT named *probe.js (/deploy runs `node tools/*probe.js`).
//
//   node tools/toprow-check.js <outdir> [dev-index.html]
//
// (it prints the msedge line). Every line is PASS/FAIL on stderr via CONSOLE.
//
// Pins: no ☰ (#toggle) is left; the buttons sit in ONE row in order; ♪, the profile button and
// © open a popover holding their adopted block and closing returns it home; a second press
// closes; a press on another button while one is open goes THROUGH to it; Escape closes and
// hands focus back; the Pause tick is off with no source; the fullscreen button carries an
// icon that says which way it goes; i and ? open the tutorial and Help.
// NEGATIVE CONTROL: run it against an index.html from before the change — it goes red.
//
// No backtick anywhere in the injected source (CLAUDE.md).
const fs = require("fs");
const path = require("path");
const NL = String.fromCharCode(10);
const Q = String.fromCharCode(39);

const outDir = process.argv[2];
const appFile = process.argv[3] || "dev-index.html";
if (!outDir) { console.error("usage: node tools/toprow-check.js <outdir> [dev-index.html]"); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const app = fs.readFileSync(appFile, "utf8");

const SEED_JS = [
  "(function () {",
  "  try {",
  "    localStorage.clear();",
  "    localStorage.setItem(\"burnTheWeb.v1\", JSON.stringify({ panelOpen: false, cycle: false, tdur: [0, 0] }));",
  "    localStorage.setItem(\"burnTheWeb.tutorial.v1\", \"1\");",
  "    localStorage.setItem(\"burnTheWeb.credits.v1\", \"off\");",
  "    localStorage.setItem(\"burnTheWeb.sync.v1\", JSON.stringify({ shows: 9, done: true }));",
  "  } catch (e) {}",
  "})();"
].join(NL);

const ASSERT_JS = [
  "(function () {",
  "  function whenReady(fn) {",
  "    if (window.__appReady) return fn();",
  "    addEventListener(\"app:ready\", fn, { once: true });",
  "  }",
  "  whenReady(function () { setTimeout(function () {",
  "    var CASE = \"case-row\", fails = 0;",
  "    function ok(name, cond, extra) {",
  "      if (typeof name !== \"string\") { console.log(\"FAIL  \" + CASE + \" :: ok() called with its arguments swapped\"); fails++; return; }",
  "      console.log((cond ? \"PASS  \" : \"FAIL  \") + CASE + \" :: \" + name + (extra ? \"  [\" + extra + \"]\" : \"\"));",
  "      if (!cond) fails++;",
  "    }",
  "    try {",
  "    var $ = function (id) { return document.getElementById(id); };",
  "    var shown = function (n) { return !!n && n.getClientRects().length > 0 && getComputedStyle(n).display !== \"none\" && getComputedStyle(n).visibility !== \"hidden\"; };",
  "    var mb = $(\"menubar\");",
  "    var popUp = function () { return !!mb && !mb.classList.contains(\"hidden\") && !!mb.querySelector(\".mb-panel\"); };",
  "    var inPop = function (id) { var n = $(id); return !!n && !!mb && mb.contains(n); };",
  "    var home = function (id, box) { var n = $(id); return !!n && !!$(box) && $(box).contains(n); };",
  "",
  "    ok(\"the dropdown button is gone\", !$(\"toggle\"));",
  "    ok(\"a top row exists\", !!$(\"toprow\"));",
  "    var ORDER = [\"galbtn\", \"fs\", \"mute\", \"panelbtn\", \"profbtn\", \"credbtn\", \"tourbtn\", \"helpbtn\"];",
  "    var vis = ORDER.filter(function (id) { return shown($(id)); });",
  "    ok(\"every button but the API-gated ones is shown\", [\"fs\", \"mute\", \"panelbtn\", \"credbtn\", \"tourbtn\", \"helpbtn\"].every(function (id) { return vis.indexOf(id) >= 0; }), vis.join(\",\"));",
  "    ok(\"...the profile button follows the gallery button's API gate\", shown($(\"profbtn\")) === shown($(\"galbtn\")));",
  "    var rects = vis.map(function (id) { return $(id).getBoundingClientRect(); });",
  "    var inOrder = rects.every(function (r, i) { return i === 0 || r.left >= rects[i - 1].right - 0.5; });",
  "    ok(\"...left to right in order, one row\", inOrder && rects.every(function (r) { return Math.abs(r.top - rects[0].top) < 1; }), rects.map(function (r) { return Math.round(r.left); }).join(\",\"));",
  "    ok(\"...and the scene banner comes after the last button\", !!$(\"scenebanner\") && rects.length > 0 && $(\"scenebanner\").getBoundingClientRect().left >= rects[rects.length - 1].right - 0.5);",
  "",
  "    // Fullscreen: an icon that says which way it goes.",
  "    var fsb = $(\"fs\");",
  "    ok(\"the fullscreen button draws an icon\", !!fsb && !!fsb.querySelector(\"svg\"));",
  "    ok(\"...the ENTER one while windowed\", !!fsb && fsb.dataset.fs === \"enter\", fsb && fsb.dataset.fs);",
  "",
  "    // ♪ opens the Audio popover.",
  "    ok(\"nothing is open at boot\", !popUp());",
  "    ok(\"the audio block starts at home\", home(\"audCapture\", \"audiobox\"));",
  "    $(\"mute\").click();",
  "    ok(\"♪ opens a popover\", popUp());",
  "    ok(\"...holding the audio block\", inPop(\"audCapture\") && inPop(\"audPause\"));",
  "    ok(\"...marked expanded\", $(\"mute\").getAttribute(\"aria-expanded\") === \"true\");",
  "    ok(\"...with Pause off while no source runs\", !!$(\"audPause\") && $(\"audPause\").disabled && !$(\"audPause\").checked);",
  "    ok(\"...and focus inside it\", !!mb && mb.contains(document.activeElement));",
  "    $(\"mute\").click();",
  "    ok(\"a second press closes it\", !popUp());",
  "    ok(\"...and the block goes home\", home(\"audCapture\", \"audiobox\") && home(\"audPause\", \"audiobox\"));",
  "    ok(\"...not expanded\", $(\"mute\").getAttribute(\"aria-expanded\") === \"false\");",
  "",
  "    // A press on another button while one is open goes through to it.",
  "    $(\"mute\").click();",
  "    var cr = $(\"credbtn\").getBoundingClientRect();",
  "    var x = cr.left + cr.width / 2, y = cr.top + cr.height / 2;",
  "    var under = document.elementFromPoint(x, y);",
  "    ok(\"the open popover's overlay is what lies under ©\", !!mb && (under === mb || mb.contains(under)), under && (under.id || under.className));",
  "    if (mb) mb.dispatchEvent(new MouseEvent(\"click\", { bubbles: true, clientX: x, clientY: y }));",
  "    ok(\"a press on © closes Audio and opens Credits\", popUp() && inPop(\"creditlist\") && !inPop(\"audCapture\"));",
  "    ok(\"...Audio went home\", home(\"audCapture\", \"audiobox\"));",
  "    if (mb) mb.dispatchEvent(new MouseEvent(\"click\", { bubbles: true, clientX: innerWidth / 2, clientY: innerHeight - 20 }));",
  "    ok(\"a press elsewhere just closes it\", !popUp() && home(\"creditlist\", \"creditbox\"));",
  "",
  "    // Escape closes and hands focus back to the button.",
  "    $(\"credbtn\").click();",
  "    ok(\"© opens Credits\", popUp() && inPop(\"creditlist\"));",
  "    window.dispatchEvent(new KeyboardEvent(\"keydown\", { key: \"Escape\", bubbles: true }));",
  "    ok(\"Escape closes it\", !popUp() && home(\"creditlist\", \"creditbox\"));",
  "    ok(\"...and focus returns to ©\", document.activeElement === $(\"credbtn\"));",
  "",
  "    if (shown($(\"profbtn\"))) {",
  "      $(\"profbtn\").click();",
  "      ok(\"the profile button opens the Cloud profile block\", popUp() && inPop(\"cloudrow\"));",
  "      $(\"profbtn\").click();",
  "      ok(\"...and gives it back\", !popUp() && home(\"cloudrow\", \"cloudbox\"));",
  "    }",
  "",
  "    // i and ? open their dialogs.",
  "    $(\"tourbtn\").click();",
  "    ok(\"i opens the tutorial\", shown($(\"tutdlg\")));",
  "    window.dispatchEvent(new KeyboardEvent(\"keydown\", { key: \"Escape\", bubbles: true }));",
  "    $(\"helpbtn\").click();",
  "    ok(\"? opens Help\", shown($(\"help\")));",
  "    } catch (e) { ok(\"no exception\", false, String(e)); }",
  "    console.log(\"DONE \" + CASE + \" fails=\" + fails);",
  "  }, 1500); });",
  "})();"
].join(NL);

let s = app.replace("<head>", "<head>" + NL + "<script>" + SEED_JS + "<" + "/script>");
s = s.replace("</body>", "<script>" + ASSERT_JS + "<" + "/script>" + NL + "</body>");
if (s === app) throw new Error("injection failed");
const f = path.join(outDir, "case-row.html");
fs.writeFileSync(f, s);
console.log("wrote " + f);
const abs = path.resolve(outDir).split(path.sep).join("/");
console.log(NL + "run with:");
console.log("  msedge --headless=new --disable-extensions --enable-logging=stderr --v=0"
  + " --virtual-time-budget=30000 --user-data-dir=\"" + abs + "/ud-row\""
  + " \"file:///" + abs + "/case-row.html\" 2>&1 | grep -oE " + Q + "\"(PASS|FAIL|DONE)[^\"]*\"" + Q);
