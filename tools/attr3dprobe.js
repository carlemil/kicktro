#!/usr/bin/env node
// ATTRACTOR 3D STAYS ON ITS ATTRACTOR AND ON THE SCREEN. One trajectory per family (Lorenz, Thomas,
// Aizawa) is integrated over a fixed span and fitted to the frame by its mean and RMS radius.
//
//   node tools/attr3dprobe.js [dev-index.html]
//
// Slices `let a3Kind` … `// ---- Fractal flames` out of the built file and runs the real stamp with
// plot() stubbed. Checks: every family stays finite over the whole Shape range; the defaults are
// chaotic (they fill the frame, not a single loop); the stamp is deterministic; Points refines the
// same shape rather than changing it; and every stamped point lands inside the safe box.
"use strict";
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(process.argv[2] || path.join(__dirname, "..", "dev-index.html"), "utf8");
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (typeof name !== "string") throw new Error("ok() needs a string name first");
  console.log((cond ? "PASS  " : "FAIL  ") + name + (extra ? "  [" + extra + "]" : ""));
  cond ? pass++ : fail++;
};
const slice = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error("marker missing: " + from + " … " + to);
  return src.slice(a, b);
};
const body = slice("  let a3Kind", "  // ---- Fractal flames");
const W = 640, H = 360;
const mk = () => new Function("cfg", "plot", "POINT_HEAT", "fractalSize", "spinAngle", "nodAmp", "nodPhase",
  body + "\nreturn { a3Trace, attr3dStamp, set: (k, s) => { a3Kind = k; a3Shape = s; }, buf: () => a3Buf };");

function stamp(k, s, n) {
  const pts = [];
  const A = mk()({ burn: 60 }, (x, y, v) => pts.push(x, y, v), 209, 1, 0.7, 0.3, 1.1);
  A.set(k, s);
  A.attr3dStamp(1, W - 1, 1, H - 1, n);
  return pts;
}
const occ = pts => {
  const G = 64, seen = new Set();
  for (let i = 0; i < pts.length; i += 3) seen.add(((pts[i + 1] / H * G) | 0) * G + ((pts[i] / W * G) | 0));
  return seen.size;
};
const NAMES = ["Lorenz", "Thomas", "Aizawa"];

for (let k = 0; k < 3; k++) {
  let finite = true, worst = "", knot = Infinity;
  for (let s = 0; s <= 1.0001; s += 0.05) {
    const p = stamp(k, s, 4000);
    if (p.length < 3 * 3500 || p.some(v => !Number.isFinite(v))) { finite = false; worst = "s=" + s.toFixed(2) + " pts=" + p.length / 3; }
    knot = Math.min(knot, occ(stamp(k, s, 24000)));
  }
  ok(NAMES[k] + ": finite and on screen across the whole Shape range at the Points floor", finite, worst);

  const p = stamp(k, 0.15, 24000);
  let inside = true;
  for (let i = 0; i < p.length; i += 3) if (p[i] < 1 || p[i] >= W - 1 || p[i + 1] < 1 || p[i + 1] >= H - 1) inside = false;
  ok(NAMES[k] + ": every default point lands inside the safe box", inside && p.length > 3 * 23000, p.length / 3 + " points");
  const o = occ(p);
  // Shape passes through periodic windows on purpose; the sparsest point of the sweep is one of
  // those closed knots. The default must sit in a chaotic band, well clear of it.
  ok(NAMES[k] + ": the default Shape is chaotic -- it covers 1.5x the cells of the sparsest knot", o > 1.5 * knot, o + " vs knot " + knot);
  const q = stamp(k, 0.15, 24000);
  ok(NAMES[k] + ": deterministic -- the same sliders stamp the same points", p.length === q.length && p.every((v, i) => v === q[i]));
  const heat = p.filter((_, i) => i % 3 === 2);
  ok(NAMES[k] + ": heat never exceeds POINT_HEAT", Math.max(...heat) <= 209 + 1e-9, Math.max(...heat).toFixed(1));

  // Points refines the same curve: the fitted spread on screen barely moves between 8k and 48k.
  const spread = pts => { let mx = 0, my = 0, n = pts.length / 3; for (let i = 0; i < pts.length; i += 3) { mx += pts[i]; my += pts[i + 1]; }
    mx /= n; my /= n; let r = 0; for (let i = 0; i < pts.length; i += 3) r += (pts[i] - mx) ** 2 + (pts[i + 1] - my) ** 2; return Math.sqrt(r / n); };
  const a = spread(stamp(k, 0.15, 8000)), b = spread(stamp(k, 0.15, 48000));
  ok(NAMES[k] + ": Points refines the same shape (screen spread 8k vs 48k within 15%)", Math.abs(a - b) / b < 0.15, a.toFixed(1) + " vs " + b.toFixed(1));
}
// The kinds really differ.
const sig = k => { const p = stamp(k, 0.15, 12000); return occ(p); };
ok("the three families draw three different pictures", new Set([sig(0), sig(1), sig(2)]).size === 3);

console.log("\n" + (fail ? fail + " failed" : "all " + pass + " passed"));
process.exit(fail ? 1 : 0);
