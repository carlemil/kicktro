// --- Contours + Smoke: the CPU mirrors behave like the shaders they mirror --------------------
//
// Both effects are pure fields (no state beyond a clock), so the questions are about SHAPE:
// Contours must draw lines -- thin bright ridges on a dark ground whose coverage grows with
// Thickness and whose ground lifts with Fill -- and Smoke must be a plume: nothing at the
// top of the frame above Height, nothing at the edges low down, mass at the bottom centre,
// and NOTHING AT ALL at Density 0 (the one guarantee the help text makes). Plus the rules
// every mirror shares: every cell written, every value in [0, 255], the same picture twice
// from the same clock, a frozen clock (Drift / Rise 0) giving a frozen picture.
//
// Slices by markers -- keep them:
//   "  const SH_TAU = "               ...  "  // Polygon: one rotating regular N-gon"
//   "  function shHash21("            ...  "  let voCells"
//   "  function shVNoise3("           ...  "  let clCover"
//   "  // Contours: one octave of value noise"  ...  "  // Shape grid: a tiled lattice"
"use strict";
const fs = require("fs");
const file = process.argv[2] || "dev-index.html";
const src = fs.readFileSync(file, "utf8");

let fails = 0, passes = 0;
function ok(name, cond, note) {
  if (typeof name !== "string") { console.log("BAD ASSERTION: name must be a string"); process.exit(1); }
  if (cond) { passes++; console.log("PASS  " + name + (note ? "  [" + note + "]" : "")); }
  else { fails++; console.log("FAIL  " + name + (note ? "  [" + note + "]" : "")); }
}
function slice(from, to) {
  const a = src.indexOf(from);
  if (a < 0) throw new Error("marker missing: " + from);
  const b = src.indexOf(to, a);
  if (b < 0) throw new Error("marker missing: " + to);
  return src.slice(a, b);
}

// A REAL-SIZED field. Contours draws lines of a pixel thickness between isolines whose spacing
// is set by the field, so a toy 160x90 grid puts the lines closer together than they are
// wide and everything reads bright; at 960x540 the default spacing is ~22 px against 2.5.
const FW = 960, FH = 540;
function make() {
  const fire = new Float64Array(FW * FH);
  const api = new Function("fw, fh, fire, zoom",
    "let camPX = 0, camPY = 0; function camPix(x, y) { camPX = x; camPY = y; }\n" +
    slice("  const SH_TAU = ", "  // Polygon: one rotating regular N-gon") +
    slice("  function shHash21(", "  let voCells") +
    slice("  function shVNoise3(", "  let clCover") +
    slice("  // Contours: one octave of value noise", "  // Shape grid: a tiled lattice") +
    "\nreturn { contoursSeed, contours, smokeSeed, smoke," +
    "  cn: o => { if (o.lines !== undefined) cnLines = o.lines; if (o.width !== undefined) cnWidth = o.width;" +
    "             if (o.scale !== undefined) cnScale = o.scale; if (o.drift !== undefined) cnDrift = o.drift;" +
    "             if (o.fill !== undefined) cnFill = o.fill; if (o.t !== undefined) cnTime = o.t; }," +
    "  sm: o => { if (o.rise !== undefined) smRise = o.rise; if (o.turb !== undefined) smTurb = o.turb;" +
    "             if (o.scale !== undefined) smScale = o.scale; if (o.density !== undefined) smDensity = o.density;" +
    "             if (o.height !== undefined) smHeight = o.height; if (o.t !== undefined) smTime = o.t; }," +
    "  defaults: { cn: { lines: cnLines, width: cnWidth, scale: cnScale, drift: cnDrift, fill: cnFill }," +
    "              sm: { rise: smRise, turb: smTurb, scale: smScale, density: smDensity, height: smHeight } } };"
  )(FW, FH, fire, 1);
  return { api, fire };
}
const { api, fire } = make();
const DT = 1 / 60;
function renderCn(ticks) { let s; for (let i = 0; i < (ticks || 1); i++) s = api.contoursSeed(DT); fire.fill(NaN); api.contours(s); return Float64Array.from(fire); }
function renderSm(ticks) { let s; for (let i = 0; i < (ticks || 1); i++) s = api.smokeSeed(DT); fire.fill(NaN); api.smoke(s); return Float64Array.from(fire); }
const frac = (a, pred) => { let n = 0; for (const v of a) if (pred(v)) n++; return n / a.length; };
// half a million cells: Math.min(...a) blows the stack, so reduce
const lo = a => a.reduce((m, v) => v < m ? v : m, Infinity), hi = a => a.reduce((m, v) => v > m ? v : m, -Infinity);
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function region(a, x0, x1, y0, y1) {
  const out = [];
  for (let y = Math.floor(y0 * FH); y < Math.floor(y1 * FH); y++) for (let x = Math.floor(x0 * FW); x < Math.floor(x1 * FW); x++) out.push(a[y * FW + x]);
  return out;
}

console.log("--- Contours (" + file + ")\n");
ok("defaults are the registry's", api.defaults.cn.lines === 12 && api.defaults.cn.width === 2.5 && api.defaults.cn.fill === 0.2, JSON.stringify(api.defaults.cn));
{
  api.cn({ t: 3 });
  const a = renderCn();
  ok("every cell is written", !a.some(Number.isNaN));
  ok("every value is in [0, 255]", a.every(v => v >= 0 && v <= 255), "min " + lo(a).toFixed(1) + " max " + hi(a).toFixed(1));
  const bright = frac(a, v => v > 200), dark = frac(a, v => v < 60);
  ok("lines: a minority of cells is bright", bright > 0.02 && bright < 0.5, (bright * 100).toFixed(1) + "% > 200");
  ok("ground: most cells are dark", dark > 0.4, (dark * 100).toFixed(1) + "% < 60");
  api.cn({ t: 3 });
  ok("the same clock gives the same picture", same(a, renderCn()));
  api.cn({ t: 3, drift: 0 });
  const f1 = renderCn(), f2 = renderCn(5);
  ok("Drift 0 freezes the map", same(f1, f2));
  api.cn({ t: 3, drift: 0.6 });
  ok("Drift > 0 moves it", !same(renderCn(), renderCn(5)));
  api.cn({ t: 3, width: 1 }); const thin = frac(renderCn(), v => v > 200);
  api.cn({ t: 3, width: 6 }); const thick = frac(renderCn(), v => v > 200);
  ok("Thickness widens the lines", thick > thin * 2, "1px " + (thin * 100).toFixed(1) + "%  6px " + (thick * 100).toFixed(1) + "%");
  api.cn({ t: 3, width: 2.5, fill: 0 }); const z0 = frac(renderCn(), v => v === 0);
  api.cn({ t: 3, fill: 1 }); const z1 = frac(renderCn(), v => v === 0);
  // the halo reaches 4x the thickness from a line; past it, with no Fill, the ground is 0
  ok("Fill 0 leaves the ground black, Fill 1 lifts it", z0 > 0.03 && z1 < z0 * 0.1, "zeros: fill 0 " + (z0 * 100).toFixed(1) + "%  fill 1 " + (z1 * 100).toFixed(2) + "%");
  api.cn({ fill: 0.2, lines: 4 }); const few = frac(renderCn(), v => v > 200);
  api.cn({ lines: 30 }); const many = frac(renderCn(), v => v > 200);
  ok("more Lines means more line pixels", many > few * 2, "4: " + (few * 100).toFixed(1) + "%  30: " + (many * 100).toFixed(1) + "%");
  api.cn({ lines: 12 });
}

console.log("\n--- Smoke\n");
ok("defaults are the registry's", api.defaults.sm.density === 0.55 && api.defaults.sm.height === 0.75 && api.defaults.sm.turb === 1.6, JSON.stringify(api.defaults.sm));
{
  api.sm({ t: 5 });
  const a = renderSm();
  ok("every cell is written", !a.some(Number.isNaN));
  ok("every value is in [0, 255]", a.every(v => v >= 0 && v <= 255), "min " + lo(a).toFixed(1) + " max " + hi(a).toFixed(1));
  ok("there is smoke", frac(a, v => v > 40) > 0.02, (frac(a, v => v > 40) * 100).toFixed(1) + "% > 40");
  // row 0 is the TOP of the screen (the heat buffer is Y-flipped); Height 0.75 ends at up 0.79
  ok("nothing above Height at the top of the frame", mean(region(a, 0, 1, 0, 0.15)) === 0);
  ok("nothing at the edges low down (the column is narrow at its base)",
     mean(region(a, 0, 0.12, 0.6, 1)) < 1 && mean(region(a, 0.88, 1, 0.6, 1)) < 1);
  const centre = mean(region(a, 0.4, 0.6, 0.55, 0.95)), side = mean(region(a, 0.05, 0.25, 0.55, 0.95));
  ok("the mass sits at the bottom centre", centre > side * 4 && centre > 20, "centre " + centre.toFixed(1) + " side " + side.toFixed(1));
  api.sm({ t: 5 });
  ok("the same clock gives the same picture", same(a, renderSm()));
  api.sm({ t: 5, rise: 0 });
  ok("Rise 0 freezes the plume", same(renderSm(), renderSm(5)));
  api.sm({ t: 5, rise: 1 });
  ok("Rise > 0 moves it", !same(renderSm(), renderSm(5)));
  api.sm({ t: 5, density: 0 });
  ok("Density 0 puts the fire out", renderSm().every(v => v === 0));
  api.sm({ t: 5, density: 1 }); const full = mean(renderSm());
  api.sm({ t: 5, density: 0.55 }); const half = mean(renderSm());
  ok("Density 1 is thicker than the default", full > half * 1.3, "1: " + full.toFixed(1) + "  0.55: " + half.toFixed(1));
  api.sm({ t: 5, height: 1.2 }); const tall = mean(region(renderSm(), 0, 1, 0.05, 0.3));
  api.sm({ t: 5, height: 0.4 }); const low = mean(region(renderSm(), 0, 1, 0.05, 0.3));
  ok("Height lifts the plume into the upper frame", tall > low && tall > 2, "1.2: " + tall.toFixed(1) + "  0.4: " + low.toFixed(1));
  api.sm({ height: 0.75 });
}

console.log("\n" + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
