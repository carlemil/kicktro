#!/usr/bin/env node
// STOCK probe: server/stock.js (the scenes the app ever shipped, which the gallery sync never
// publishes under your name) is current with src/ and git history, and the match holds.
//
//   node tools/stockprobe.js            (any extra argument, e.g. dev-index.html, is ignored)
//
// A new DEFAULT_LIBRARY scene with no regenerated stock.js would post every user's untouched
// copy of it as their own card: `node tools/stock-emit.js` fixes it.
"use strict";
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
let fails = 0, passes = 0;
function ok(name, cond, extra) {
  if (typeof name !== "string") throw new Error("ok(name, cond): name must be a string");
  if (cond) passes++; else fails++;
  console.log((cond ? "PASS " : "FAIL ") + name + (extra !== undefined && !cond ? "  [" + extra + "]" : ""));
}

let fresh = true, why = "";
try { execFileSync(process.execPath, [path.join(__dirname, "stock-emit.js"), "--check"], { cwd: ROOT, stdio: "pipe" }); }
catch (e) { fresh = false; why = String(e.stderr || e.message).trim(); }
ok("server/stock.js is current (node tools/stock-emit.js)", fresh, why);

const STOCK = require(path.join(ROOT, "server", "stock.js"));
const { isStock } = require(path.join(ROOT, "server", "gallery-sync.js"));
ok("every shipped first-visit library is in it", STOCK.scenes.length >= 15, STOCK.scenes.length);
ok("...and the effect names of the old one-scene-per-effect library", STOCK.effects.Plasma === "plasma"
  && STOCK.effects["Blank canvas"] === "plasma" && Object.keys(STOCK.effects).length > 40, JSON.stringify(STOCK.effects));
const asScene = s => ({ name: s.name, effect: s.effect, state: s.state, extra: { palette: s.palette, filters: s.filters },
  layers: s.layers.map(L => ({ ...L })) });
ok("an untouched copy of every stock scene is stock", STOCK.scenes.every(s => isStock(asScene(s))));
const later = STOCK.scenes.map(s => {
  const p = asScene(s);
  p.state = { ...p.state, someLaterControl: 0 };          // a later version saves neutral new keys
  p.layers = p.layers.map(L => ({ ...L, state: { ...L.state, someLaterControl: 0 } }));
  p.rotate = false; p.sid = "abcdefgh12"; p.edited = 1;
  return p;
});
ok("...also with keys a later version added, and library bookkeeping", later.every(isStock));
const moved = STOCK.scenes.filter(s => s.layers.length && Object.keys(s.layers[0].state).some(k => typeof s.layers[0].state[k] === "number"))
  .map(s => {
    const p = asScene(s), st = p.layers[0].state, k = Object.keys(st).find(x => typeof st[x] === "number");
    p.layers[0] = { ...p.layers[0], state: { ...st, [k]: st[k] + 0.37 } };
    return p;
  });
ok("a stock scene with a slider moved is the user's own", moved.length > 0 && moved.every(p => !isStock(p)), moved.length);
ok("...so is one renamed", STOCK.scenes.every(s => !isStock({ ...asScene(s), name: s.name + " (mine)" })));
ok("a neutral per-effect scene is stock", isStock({ name: "Tunnel", effect: "tunnel", state: { speed: 3 }, layers: [{ effect: "tunnel", state: {} }] }));
ok("...but not once it has a filter", !isStock({ name: "Tunnel", effect: "tunnel", state: {}, layers: [{ effect: "tunnel", state: {}, filters: ["blur"] }] }));
ok("...or a second layer", !isStock({ name: "Tunnel", effect: "tunnel", state: {},
  layers: [{ effect: "tunnel", state: {} }, { effect: "plasma", state: {} }] }));
ok("...or another effect than its name says", !isStock({ name: "Tunnel", effect: "plasma", state: {}, layers: [{ effect: "plasma", state: {} }] }));

console.log((fails ? "FAILED" : "OK") + ": " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
