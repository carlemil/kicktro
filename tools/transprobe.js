// --- Which transition a scene switch plays ------------------------------------------------
//
// Untouched, a scene switch is a CROSSFADE (1.95.2); the "+ Choose transitions" picker came
// back with Auto-cycle and what is ticked there is what plays: a ticked set goes through the
// weighted pick, "Select none" cuts. This pins the store's semantics (null = crossfade alone,
// collapse back to null, "Select all" a real full set) and that scenePick obeys them. Run it
// against a build from before the picker came back (v1.101.0's index.html) for the negative
// control: every pick there is a crossfade, so the ticked-set asserts go red.
//
// Slices real source by markers -- keep them:
//   "const TRANS_DUR = {"  ...  "// Live transition state."
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

const body = slice("const TRANS_DUR = {", "// Live transition state.");
let persisted = 0;
const T = new Function("el", "persist", "PALETTES", "EFFECTS", "FILTERS", "filtersOk", "presetFilters",
  body + "\nreturn { scenePick, setTransUse, setTransUseAll, transUseOk, transInUse, TRANS_PICKABLE," +
  " get transUse() { return transUse; } };")(
  () => null, () => { persisted++; }, [], [], [], () => null, () => []);

const a = { dense: true, retains: false, palette: 0 }, b = { dense: true, retains: false, palette: 0 };
const picks = n => { const s = new Set(); for (let i = 0; i < n; i++) s.add(T.scenePick(a, b).id); return s; };

ok("untouched: the store is null", T.transUse === null);
ok("untouched: every pick is a crossfade", [...picks(200)].join() === "crossfade", [...picks(200)].join());
ok("untouched: the picker shows Crossfade ticked, nothing else",
  T.transInUse("crossfade") && T.TRANS_PICKABLE.every(t => t.id === "crossfade" || !T.transInUse(t.id)));

T.setTransUse("dip", true);
ok("ticking Dip adds it to Crossfade", T.transUse && T.transUse.size === 2 && T.transUse.has("crossfade") && T.transUse.has("dip"));
const two = picks(400);
ok("...and a switch then picks from exactly those two", two.size === 2 && two.has("dip") && two.has("crossfade"), [...two].join());
T.setTransUse("dip", false);
ok("unticking it collapses back to null", T.transUse === null);

T.setTransUseAll(true);
ok("Select all stores a full set, not null", T.transUse && T.transUse.size === T.TRANS_PICKABLE.length);
const all = picks(2000);
ok("...and switches use the whole menu", all.size >= 8 && !all.has("cut"), all.size + " ids");

T.setTransUseAll(false);
ok("Select none is the cut-only set", T.transUse && T.transUse.size === 1 && T.transUse.has("cut"));
ok("...and every switch cuts", [...picks(50)].join() === "cut");
T.setTransUse("crossfade", true);
ok("ticking one from cut-only retires the cut", T.transUse === null && [...picks(50)].join() === "crossfade");

ok("decode: [] is null (crossfade)", T.transUseOk([]) === null);
ok("decode: a full list stays a full set", (T.transUseOk(T.TRANS_PICKABLE.map(t => t.id)) || new Set()).size === T.TRANS_PICKABLE.length);
ok("every change persisted", persisted === 5, String(persisted));

console.log("\n" + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
