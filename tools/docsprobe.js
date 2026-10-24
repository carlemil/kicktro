#!/usr/bin/env node
// EVERY EFFECT IS DOCUMENTED. CLAUDE.md's build section says "Keep `README.md` in sync", and its
// own "What this is" section presents a four-family taxonomy that reads as exhaustive.
//
//   node tools/docsprobe.js [dev-index.html]
//
// WHY THIS EXISTS. That instruction was an instruction, not a check, and it had drifted a long
// way: 12 of 52 effects appeared in NEITHER document, and the README's own count still said
// "thirty-eight". So the map a reader uses to decide where a new effect belongs was missing a
// fifth of the territory, and the user-facing page did not mention Flying ribbons -- the only
// effect that rasterises geometry -- at all.
//
// Adding an effect is meant to be "append one descriptor". This is what makes the docs part of
// that, at the cost of one sentence per effect.
//
// It reads README.md and CLAUDE.md from the REPO, not the built page (they are not in it), and
// takes the effect list from the built file so it is checking what actually shipped.
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const src = fs.readFileSync(process.argv[2] || path.join(root, "dev-index.html"), "utf8");

let fails = 0, passes = 0;
function ok(name, cond, extra) {
  if (typeof name !== "string") { console.log("FAIL  ok() called with its arguments swapped"); fails++; return; }
  console.log((cond ? "PASS  " : "FAIL  ") + name + (extra ? "  [" + extra + "]" : ""));
  cond ? passes++ : fails++;
}

// name + presetName, because the docs legitimately use either: CLAUDE.md calls Tetrahedron
// "Tetrafyer" throughout, which is its presetName, and that is not a gap.
// SCOPED TO THE EFFECTS ARRAY. `{ id: "...", name: "..." }` is also the shape of the TRANSITIONS
// and FILTERS registries, and scanning the whole file quietly picked those up instead -- 16
// "effects" called Burn off, Clock wipe and Checkerboard, with the README assertion passing
// because it happened to mention them all. Slice first, then match.
const a0 = src.indexOf("const EFFECTS = [");
const a1 = src.indexOf("const effectsByName", a0);
if (a0 < 0 || a1 < 0) throw new Error("EFFECTS registry markers missing — keep `const EFFECTS = [` and `const effectsByName`");
const block = src.slice(a0, a1);

const eff = [];
// No lookahead to the next descriptor: help texts run well past any sane window, so a
// `(?=\{ id: ")` bound simply never matched and the scan silently found nothing. presetName sits
// immediately after name, so a short fixed window is both sufficient and honest.
const re = /\{ id: "([a-zA-Z0-9]+)",\s*name: "([^"]+)"([\s\S]{0,200})/g;
let m;
while ((m = re.exec(block))) {
  const preset = (m[3].match(/presetName:\s*"([^"]+)"/) || [])[1] || null;
  eff.push({ id: m[1], name: m[2], preset });
}
ok("found the effect registry", eff.length > 20, eff.length + " effects");

// Whitespace-collapsed and case-insensitive, so a name broken across two lines by the 100-column
// wrap still counts. Anything else would fail on correct docs, which is worse than not checking.
const flat = s => s.replace(/\s+/g, " ").toLowerCase();
function documented(doc, e) {
  return doc.includes(flat(e.name)) || (e.preset && doc.includes(flat(e.preset)));
}

for (const [file, label] of [["README.md", "README"], ["CLAUDE.md", "CLAUDE.md"]]) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) { ok(label + " exists", false, p); continue; }
  const doc = flat(fs.readFileSync(p, "utf8"));
  const missing = eff.filter(e => !documented(doc, e));
  ok("every effect is named in " + label, missing.length === 0,
     missing.length ? missing.length + " missing: " + missing.map(e => e.name).join(", ") : eff.length + " effects");
}

// The README states the count in prose, and it had been wrong for fourteen effects.
{
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
    "nineteen", "twenty", "twenty-one", "twenty-two", "twenty-three", "twenty-four", "twenty-five",
    "twenty-six", "twenty-seven", "twenty-eight", "twenty-nine", "thirty", "thirty-one", "thirty-two",
    "thirty-three", "thirty-four", "thirty-five", "thirty-six", "thirty-seven", "thirty-eight",
    "thirty-nine", "forty", "forty-one", "forty-two", "forty-three", "forty-four", "forty-five",
    "forty-six", "forty-seven", "forty-eight", "forty-nine", "fifty", "fifty-one", "fifty-two",
    "fifty-three", "fifty-four", "fifty-five", "fifty-six", "fifty-seven", "fifty-eight",
    "fifty-nine", "sixty", "sixty-one", "sixty-two", "sixty-three", "sixty-four", "sixty-five",
    "sixty-six", "sixty-seven", "sixty-eight", "sixty-nine", "seventy"];
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const claim = readme.match(/between ([a-z-]+) visuals/);
  ok("the README states how many effects there are", !!claim, claim ? claim[1] : "phrase missing");
  if (claim) {
    const want = words[eff.length];
    ok("...and the number is right", claim[1] === want,
       "says " + claim[1] + ", registry has " + eff.length + " (" + want + ")");
  }
}

console.log("\n" + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
