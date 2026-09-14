#!/usr/bin/env node
// POLYPINSKI'S CORNERS ARE THE REGULAR SOLIDS. The effect is the chaos game between k corners on a
// sphere, and it only reads as Sierpiński when those corners are spread EVENLY: 3 must be an
// equilateral triangle on a great circle, 4 a regular tetrahedron, 6 an octahedron. v1.80.0 hashed
// them uniformly at random instead and 3 corners drew a lopsided sliver.
//
//   node tools/polyprobe.js [dev-index.html]
//
// Slices sdHash and pyHomes out of the built file (markers: `function sdHash(`, `function pyHomes(`,
// `function polypinskiStamp(`) and checks the pairwise corner distances for several seeds.
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
const hash = slice("function sdHash(", "function makeSolid(");
const homes = slice("const PY_MAX", "function polypinskiStamp(");
const P = new Function(hash + homes + "\nreturn { pyHomes, pyHx, pyHy, pyHz, touch: () => pyTouch };")();

const dists = k => {
  const d = [];
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++)
    d.push(Math.hypot(P.pyHx[i] - P.pyHx[j], P.pyHy[i] - P.pyHy[j], P.pyHz[i] - P.pyHz[j]));
  return d.sort((a, b) => a - b);
};
const near = (a, b) => Math.abs(a - b) < 1e-3;

for (const seed of [1, 2, 7, 999]) {
  P.pyHomes(seed, 3);
  let d = dists(3);
  ok("seed " + seed + ": 3 corners are an equilateral triangle on a great circle", d.every(x => near(x, Math.sqrt(3))), d.map(x => x.toFixed(4)).join(","));
  P.pyHomes(seed, 4);
  d = dists(4);
  ok("seed " + seed + ": 4 corners are a regular tetrahedron", d.every(x => near(x, Math.sqrt(8 / 3))), d.map(x => x.toFixed(4)).join(","));
  P.pyHomes(seed, 6);
  d = dists(6);
  ok("seed " + seed + ": 6 corners are an octahedron", d.slice(0, 12).every(x => near(x, Math.SQRT2)) && d.slice(12).every(x => near(x, 2)), d.map(x => x.toFixed(3)).join(","));
  P.pyHomes(seed, 12);
  d = dists(12);
  const edge = 4 / Math.sqrt(10 + 2 * Math.sqrt(5));   // icosahedron edge on a unit sphere
  ok("seed " + seed + ": 12 corners are an icosahedron", d.slice(0, 30).every(x => near(x, edge)), d[0].toFixed(4) + " vs " + edge.toFixed(4));
}
// THE JUMP FOLLOWS THE CORNERS: the copy scale at Gap 0 is the one where copies just touch. It must
// reproduce the classic flakes -- 1/2 for the triangle, tetrahedron and octahedron, 1/(1+phi) for
// the icosahedron -- and fall as corners crowd, or many corners blur into a solid ball.
for (const [k, want] of [[3, 0.5], [4, 0.5], [6, 0.5], [12, 1 / (1 + (1 + Math.sqrt(5)) / 2)]]) {
  P.pyHomes(5, k);
  ok(k + " corners touch at copy scale " + want.toFixed(4), Math.abs(P.touch() - want) < 1e-3, P.touch().toFixed(4));
}
{
  let prev = 1, falls = true;
  for (const k of [6, 12, 24]) { P.pyHomes(5, k); if (P.touch() > prev + 1e-9) falls = false; prev = P.touch(); }
  ok("the touching scale never grows as corners are added (6, 12, 24)", falls && prev < 0.5, prev.toFixed(4));
  P.pyHomes(5, 3); P.pyHomes(5, 12); const fresh = P.touch(); P.pyHomes(5, 3); P.pyHomes(5, 12);
  ok("a cached (seed, k) restores its own touching scale", P.touch() === fresh);
}
// Every corner stays on the unit sphere, and the seed changes the orientation.
P.pyHomes(1, 24);
const onSphere = [...Array(24).keys()].every(i => near(Math.hypot(P.pyHx[i], P.pyHy[i], P.pyHz[i]), 1));
ok("24 corners all lie on the unit sphere", onSphere);
const a = P.pyHx[0];
P.pyHomes(2, 24);
ok("a different seed gives a different orientation", Math.abs(P.pyHx[0] - a) > 1e-3);

console.log("\n" + (fail ? fail + " failed" : "all " + pass + " passed"));
process.exit(fail ? 1 : 0);
