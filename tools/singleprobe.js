// Headless probe for SINGLE controls — the `single: true` flag on a `dual` entry.
//
// A single control is one integer, but it keeps `type: "dual"` so the STORE stays the
// [lo,hi] pair and the wire keys stay <key>-lo/<key>-hi. That is the whole reason no
// migration was needed, and it is what this probe defends: the flag set itself, the
// integer grid, the two behaviours that fall out of the pinned pair (no drift, no
// quantiser bypass), and the collapse of a pair saved before a control became single.
// It slices the REAL source out of the built file, so it tests the shipped code.
//
// Usage: node tools/singleprobe.js dev-index.html
//
// Slices by source markers, so keep them: `const sig3 =` … `// A control belongs to the
// SCENE`; `function snapStep(` … `function stepAnim(` … `// The loop is KEY-major`; and
// `function mergeState(` … `function mergeBeat(`.
const fs = require("fs");
const html = fs.readFileSync(process.argv[2] || "dev-index.html", "utf8");
const s0 = html.indexOf("<script>"), s1 = html.indexOf("</script>", s0);
if (s0 < 0 || s1 < 0) throw new Error("probe: no inline <script> found");
const src = html.slice(s0 + 8, s1);

const cut = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a + 1);
  if (a < 0 || b < 0 || b < a) throw new Error("probe: could not slice " + from + " .. " + to);
  return src.slice(a, b);
};

// The schema's `apply` arrows write render globals and its `fmt` arrows read sig3; nothing
// runs at definition time, and the only arrows this probe invokes are the enum `fmt`s.
const schema = cut("  const sig3 =", "  // A control belongs to the SCENE");

// stepAnim's armed branch needs the audio surface; the drift branch needs PULSE_* only
// through that branch. We only ever exercise it unarmed.
const anim = `
  let audio = { beatNow: [0, 0, 0] };
  function audioLive() { return false; }
  const PULSE_DROP = 0.2, PULSE_DEFAULT = "snap", PULSE_FN = { snap: v => v };
` + cut("  function snapStep(", "  function stepAnim(")
  + cut("  function stepAnim(", "  // The loop is KEY-major");

// mergeState normalises a saved state against the effect's shipped one. presetState is
// stubbed to the shape the real one returns: every key an array, seeded from defaults.
const merge = `
  const BASE = {};
  function presetState() { const o = {}; for (const k in BASE) o[k] = BASE[k].slice(); return o; }
` + cut("  function mergeState(", "  function mergeBeat(");

const P = new Function(schema + anim + merge +
  "\nreturn { CONTROLS, SINGLE_KEYS, singlePair, snapStep, stepAnim, mergeState," +
  "  setBase(b) { for (const k in BASE) delete BASE[k]; for (const k in b) BASE[k] = b[k]; } };")();

let pass = 0, fail = 0;
const ok = (cond, name, detail) => {
  (cond ? pass++ : fail++);
  console.log((cond ? "PASS  " : "FAIL  ") + name + (detail ? "  [" + detail + "]" : ""));
};
const by = k => P.CONTROLS.find(c => c.key === k);

// --- 1. the set itself --------------------------------------------------------
// Hard-coded on purpose: the danger with a flag like this is not that it stops working,
// it is that someone adds `points` to it and quietly kills a ranged, beat-armable
// control that ships advertising both. Changing this list should be a deliberate edit.
const EXPECT = [
  "mbcount", "ksegments", "cbcount", "cosides", "bncount", "bnmix", "sdcount",
  "sdmix", "kfbars", "twcols", "ltbolts", "bpdetail", "flvar", "aucurtains", "rdspeed",
  "mgiter", "wedgeseg", "poster", "mirror", "pxdir", "cellstates", "kuwrad", "qjdetail",
  "carule", "cacells",   // Cellular automata: a rule enum and a grid width
  "noiseseed",   // Noise warp: Static / Drift / Random is a mode, not a quantity
  "vbcount", "vbshape", "gxarms", "gosurf",
  // Doughnut: both are single because the flute pattern cos(flute·(ang + twist·arc))
  // only closes across the atan2 branch cut when flute·twist is a whole number.
  "dnflute",
  // Trees: all three COUNT something, and a fractional branch count is not a shape.
  "trcount", "trdepth", "trsplit",
  // ASCII mosaic: the Script picker is an enum -- eight named character sets.
  "ascset",
  // Flying ribbons: the band COUNT only. Twist is deliberately NOT here -- a fractional
  // twist is a real part-turn along the length, and a spread between the thumbs winds and
  // unwinds the band, which is the best reason the effect has to drift a slider at all.
  "rbcount",
  // Glass ball: a count and an enum.
  "gbcount", "gbmat",
].sort();
const got = [...P.SINGLE_KEYS].sort();
ok(got.length === EXPECT.length && got.every((k, i) => k === EXPECT[i]),
   "SINGLE_KEYS is exactly the " + EXPECT.length + " intended keys", got.join(","));
// The ones deliberately left ranged: a spread or a fraction is meaningful on each. sgcells is
// here rather than above because Shape grid's Density scales the grid rather than counting
// anything — the same family as cocount, mofreq and rztile.
["points", "bdcount", "xormask", "bandsize", "cocount", "sgcells", "mbexp", "scancount", "pixel"]
  .forEach(k => ok(!P.SINGLE_KEYS.has(k), k + " is NOT single (its range or its float matters)"));

// --- 2. every single entry sits on a whole grid --------------------------------
const whole = n => typeof n === "number" && n === Math.round(n);
[...P.SINGLE_KEYS].forEach(k => {
  const c = by(k);
  ok(c.type === "dual", k + ": still type 'dual' (the [lo,hi] pair IS the wire format)");
  ok(whole(c.step) && c.step > 0, k + ": whole positive step", "step=" + c.step);
  ok(whole(c.min) && whole(c.max), k + ": whole bounds", c.min + ".." + c.max);
  ok(c.lo === c.hi && whole(c.lo), k + ": ships collapsed and whole", "lo=" + c.lo + " hi=" + c.hi);
});
// step 1 specifically: a coarser grid would be legal but no single control wants one, and
// the range editor no longer offers a way to change it.
ok([...P.SINGLE_KEYS].every(k => by(k).step === 1), "every single control steps by exactly 1");

// --- 3. the enums name every value they can hold -------------------------------
// A single control can now only land on integers in [min,max], so the name table has to
// cover all of them — an "?" fallback would mean a reachable value with no label.
["flvar", "mirror", "pxdir", "noiseseed"].forEach(k => {
  const c = by(k);
  let bad = null;
  for (let v = c.min; v <= c.max; v++) {
    const s = c.fmt(v);
    if (!s || s === "?" || s === "undefined") { bad = v; break; }
  }
  ok(bad === null, k + ": every integer in range has a name", bad === null ? c.fmt(c.lo) : "no name for " + bad);
});

// --- 4. the quantiser is live now ----------------------------------------------
// snapStep short-circuits on a NaN step, which is what step="any" gives it — so this is
// the proof that emitting the real step is what turned it on.
const A = { lo: { step: "1", min: "2" } };
ok(P.snapStep(A, 5.4, 2, 16) === 5, "snapStep quantises down with step 1", String(P.snapStep(A, 5.4, 2, 16)));
ok(P.snapStep(A, 5.6, 2, 16) === 6, "snapStep quantises up with step 1", String(P.snapStep(A, 5.6, 2, 16)));
ok(P.snapStep(A, 99, 2, 16) === 16, "snapStep clamps into the live band");
const ANY = { lo: { step: "any", min: "0" } };
ok(P.snapStep(ANY, 5.4321, 0, 10) === 5.4321, "step 'any' still passes through untouched (non-single controls unaffected)");

// --- 5. a pinned pair never drifts ---------------------------------------------
// The structural version of "no drift": stepAnim's pinned branch must not draw from
// Math.random at all, because every drift segment draws twice and the key-major loop
// order is what keeps a one-item stack bit-identical to the un-stacked code.
const realRandom = Math.random;
let draws = 0;
Math.random = () => { draws++; return realRandom(); };
const st = { val: 0, out: 0, pulse: 0, t0: 0, dur: 1000, from: 0, to: 0 };
const a = { lo: { step: "1", min: "1" }, durScale: 1, apply: () => {} };
P.stepAnim(a, st, 5, 5, undefined, "snap", 0.2, 10000, 0.016, true);
Math.random = realRandom;
ok(st.out === 5, "a pinned single control holds its value", String(st.out));
ok(draws === 0, "...and draws nothing from Math.random", draws + " draws");

// --- 6. an old spread collapses -------------------------------------------------
ok(JSON.stringify(P.singlePair("flvar", [2, 5])) === "[2,2]", "singlePair collapses a spread to lo");
ok(JSON.stringify(P.singlePair("wedgeseg", [14.8586, 15.1630])) === "[15,15]", "...rounding lo, so a scene that RENDERED 15 still renders 15");
ok(JSON.stringify(P.singlePair("mbexp", [2, 4])) === "[2,4]", "a non-single key is left alone");
const same = [6, 6];
ok(P.singlePair("cbcount", same) === same, "an already-collapsed pair is returned untouched (no needless churn)");
ok(P.singlePair("flvar", 3) === 3, "a scalar is passed through");

// mergeState is the funnel every load path uses, and the only fix for a NON-selected
// layer — bandOf reads that layer's pair straight out of L.state, never via the DOM.
P.setBase({ flvar: [3, 3], wedgeseg: [6, 6], mbexp: [2, 4] });
const m = P.mergeState(0, { flvar: [2, 5], wedgeseg: [14.8586, 15.163], mbexp: [2.5, 4.5] });
ok(JSON.stringify(m.flvar) === "[2,2]", "mergeState collapses a stored spread", JSON.stringify(m.flvar));
ok(JSON.stringify(m.wedgeseg) === "[15,15]", "mergeState rounds a stored fraction", JSON.stringify(m.wedgeseg));
ok(JSON.stringify(m.mbexp) === "[2.5,4.5]", "mergeState leaves a ranged float control alone", JSON.stringify(m.mbexp));

console.log("\n" + (fail ? fail + " FAILED, " : "all ") + (fail ? pass + " passed" : pass + " passed"));
process.exit(fail ? 1 : 0);
