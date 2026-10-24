// --- Shader wiring: every uniform a hook sets is registered and declared -----------------
//
// A shader effect or post filter is wired at THREE points that nothing checks at runtime:
// the hook sets `u.uFoo`, the registration lists "uFoo" for getUniformLocation, and the
// GLSL declares `uniform float uFoo`. Miss any one and the frame renders quietly wrong --
// gl.uniform1f(null, v) is a no-op, an undeclared uniform's location is null, a name typo'd
// in the hook reads undefined -- and no console error, no probe and no pixel gate says so.
// The same goes for the control side: a `params` key with no CONTROLS row draws no slider,
// a group missing from CTL_GROUPS has no heading, an id missing from FILTER_CATS or
// EFFECT_CATS is absent from the picker, and a *Seed clock that is not in PHASE_VARS makes
// two layers of the effect share one clock (CLAUDE.md, "Phase clocks are per item").
// This probe reads all of it out of the built page and cross-checks, for EVERY hook.
//
// Slices by markers -- keep them:
//   "  // ---- FILTERS: stackable post-FX"  ...  "  function presetState("
//   "const EFFECTS = ["                      ...  "const effectsByName"
//   "const CTL_GROUPS = {"  "const FILTER_CATS = ["  "const EFFECT_CATS = ["  "const PHASE_VARS = ["
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
console.log("--- shader + control wiring (" + file + ")\n");

// 1. Every template-literal const in the page (FS_*, VS_*, SH_* preludes). No backtick is
//    allowed inside a shader source, so a lazy match to the closing "`;" is exact.
const lits = {};
for (const m of src.matchAll(/const ([A-Z][A-Z0-9_]+) = `([\s\S]*?)`;/g)) lits[m[1]] = m[2];
const fsCount = Object.keys(lits).filter(k => k.startsWith("FS_")).length;
ok("found the shader sources", fsCount > 80, fsCount + " FS_* literals");
// Preludes are spliced with ${NAME}; expand what we know so a uniform declared in one counts.
function expand(s, depth) {
  return s.replace(/\$\{([A-Z][A-Z0-9_]+)\}/g, (all, n) => lits[n] !== undefined && depth < 4 ? expand(lits[n], depth + 1) : all);
}
function declaredUniforms(s) {
  const out = new Set();
  for (const m of expand(s, 0).matchAll(/\buniform\s+(?:lowp|mediump|highp)?\s*\w+\s+([^;]+);/g))
    m[1].split(",").forEach(d => { const n = d.trim().replace(/\s*\[.*$/, ""); if (n) out.add(n); });
  return out;
}

// 2. Registrations: glProg.<id> = makeProg|camProg(VS_QUAD, FS_X, [...names]), plus the
//    per-surface family glProg["ocean" + n] = camProg(VS_QUAD, FS_OCEAN.replace(...), OCEAN_U)
//    whose uniform list is a named const.
const regs = {};
const nameList = s => s.split(",").map(x => x.trim().replace(/^"|"$/g, "")).filter(Boolean);
for (const m of src.matchAll(/glProg\.(\w+) = (makeProg|camProg)\(VS_QUAD, (FS_\w+), \[([^\]]*)\]\)/g))
  regs[m[1]] = { kind: m[2], fs: m[3], names: nameList(m[4]) };
for (const m of src.matchAll(/glProg\["(\w+)" \+ \w+\] = (makeProg|camProg)\(VS_QUAD, (FS_\w+).*?, (\w+)\);/g)) {
  const list = src.match(new RegExp("const " + m[4] + " = \\[([^\\]]*)\\]"));
  if (list) regs[m[1]] = { kind: m[2], fs: m[3], names: nameList(list[1]) };
}
ok("found the program registrations", Object.keys(regs).length > 60, Object.keys(regs).length + " programs");
{
  // every registered name is declared in its shader (a typo here silently loses the uniform)
  const bad = [];
  for (const [id, r] of Object.entries(regs)) {
    if (lits[r.fs] === undefined) { bad.push(id + ": source " + r.fs + " not a plain literal"); continue; }
    const decl = declaredUniforms(lits[r.fs]);
    const implicit = new Set(["uCam"]);   // camProg splices its own uCam into the source
    r.names.filter(n => !decl.has(n) && !implicit.has(n)).forEach(n => bad.push(id + ": " + n + " registered but not declared in " + r.fs));
  }
  ok("every registered uniform is declared in its shader", bad.length === 0, bad.length ? bad.join("; ") : Object.keys(regs).length + " programs");
}

// 3. Hooks: each FILTERS row's postPass("id", ...) and each EFFECTS row's glShaderDraw("id", ...)
//    sets only uniforms its program(s) registered. Rows are split on the descriptor opener.
function rowsOf(block) { return block.split(/\n    \{ id: "/).slice(1).map(r => ({ id: r.slice(0, r.indexOf('"')), text: r })); }
function checkHooks(rows, callRe, what) {
  const bad = []; let hooked = 0;
  for (const row of rows) {
    const progs = [...row.text.matchAll(callRe)].map(m => m[1]);
    if (!progs.length) continue;
    hooked++;
    const reg = new Set();
    for (const p of progs) {
      if (!regs[p]) { bad.push(row.id + ": no registration for glProg." + p); continue; }
      regs[p].names.forEach(n => reg.add(n));
    }
    // the first setU callback's u.<name> tokens; uSrc/uSize are bound by the pass itself
    for (const m of row.text.matchAll(/\bu\.(u[A-Z]\w*)/g)) if (!reg.has(m[1]) && m[1] !== "uSize" && m[1] !== "uSrc") bad.push(row.id + ": sets u." + m[1] + " which " + progs.join("/") + " never registered");
  }
  ok("every " + what + " hook sets only registered uniforms", bad.length === 0, bad.length ? bad.join("; ") : hooked + " hooks");
}
const filtBlock = slice("  // ---- FILTERS: stackable post-FX", "// ---- TRANSITIONS: how one preset gives way");
const fxBlock = slice("const EFFECTS = [", "const effectsByName");
const filters = rowsOf(filtBlock), effects = rowsOf(fxBlock);
ok("found the filter registry", filters.length > 30, filters.length + " filters");
ok("found the effect registry", effects.length > 50, effects.length + " effects");
checkHooks(filters, /postPass\("(\w+)"/g, "filter");
checkHooks(effects, /glShaderDraw\("(\w+)"/g, "effect");

// 4. Controls: every params key has a CONTROLS row; filter rows are host "filter"; every
//    group named by those rows is in CTL_GROUPS.
const ctlRows = {};
for (const m of src.matchAll(/\{ key: "(\w+)", host: "(\w+)", group: "(\w+)"/g)) ctlRows[m[1]] = { host: m[2], group: m[3] };
const groups = slice("const CTL_GROUPS = {", "};");
{
  const bad = [], seenGroups = new Set();
  for (const row of filters) {
    const pm = row.text.match(/params: \[([^\]]*)\]/); if (!pm) continue;
    for (const k of pm[1].split(",").map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean)) {
      const c = ctlRows[k];
      if (!c) { bad.push(row.id + ": param " + k + " has no CONTROLS row"); continue; }
      if (c.host !== "filter") bad.push(row.id + ": param " + k + " is host " + c.host);
      seenGroups.add(c.group);
    }
  }
  ok("every filter param is a filter-hosted CONTROLS row", bad.length === 0, bad.length ? bad.join("; ") : filters.length + " filters");
  const missing = [...seenGroups].filter(g => !new RegExp("\\b" + g + ": \"").test(groups));
  ok("every filter control group has a CTL_GROUPS caption", missing.length === 0, missing.length ? missing.join(", ") : seenGroups.size + " groups");
}
{
  const bad = [], seenGroups = new Set();
  for (const row of effects) {
    const pm = row.text.match(/params: \[([^\]]*)\]/); if (!pm) continue;
    for (const k of pm[1].split(",").map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean)) {
      const c = ctlRows[k];
      if (!c) { bad.push(row.id + ": param " + k + " has no CONTROLS row"); continue; }
      if (c.host === "fx") seenGroups.add(c.group);
    }
  }
  ok("every effect param is a CONTROLS row", bad.length === 0, bad.length ? bad.join("; ") : effects.length + " effects");
  const missing = [...seenGroups].filter(g => !new RegExp("\\b" + g + ": \"").test(groups));
  ok("every effect control group has a CTL_GROUPS caption", missing.length === 0, missing.length ? missing.join(", ") : seenGroups.size + " groups");
}

// 5. Pickers: every id the category tables name is a real one (a typo there drops the entry
//    from its group without a sound), and every filter is in a group. EFFECT_CATS may leave
//    an effect out by design -- it sorts last under "Other" -- so unlisted effects are noted,
//    not failed.
{
  const fc = slice("const FILTER_CATS = [", "];"), ec = slice("const EFFECT_CATS = [", "];");
  const idsIn = block => [...block.matchAll(/"([a-z0-9]+)"/g)].map(m => m[1]).filter(id => !/^(ids|name|desc)$/.test(id));
  const fIds = new Set(filters.map(r => r.id)), eIds = new Set(effects.map(r => r.id));
  const fBogus = idsIn(fc).filter(id => !fIds.has(id)), eBogus = idsIn(ec).filter(id => !eIds.has(id));
  ok("every FILTER_CATS id is a registered filter", fBogus.length === 0, fBogus.length ? fBogus.join(", ") : idsIn(fc).length + " ids");
  ok("every EFFECT_CATS id is a registered effect", eBogus.length === 0, eBogus.length ? eBogus.join(", ") : idsIn(ec).length + " ids");
  const fMissing = [...fIds].filter(id => !fc.includes('"' + id + '"'));
  ok("every filter is in a FILTER_CATS group", fMissing.length === 0, fMissing.length ? fMissing.join(", ") : filters.length + " filters");
  const eMissing = [...eIds].filter(id => !ec.includes('"' + id + '"'));
  console.log("note  effects under \"Other\" (unlisted in EFFECT_CATS): " + (eMissing.length ? eMissing.join(", ") : "none"));
}

// 6. Clocks: every `function xSeed(dt) { v += dt ...` accumulator rides PHASE_VARS, so two
//    layers of the same effect keep separate time.
{
  const pv = slice("const PHASE_VARS = [", "];");
  const bad = []; let n = 0;
  for (const m of src.matchAll(/function (\w+)Seed\(dt\) \{ (\w+) \+= dt/g)) {
    n++;
    if (!pv.includes('["' + m[2] + '"')) bad.push(m[1] + " accumulates " + m[2]);
  }
  ok("every *Seed(dt) clock is in PHASE_VARS", bad.length === 0, bad.length ? bad.join("; ") : n + " clocks");
}

console.log("\n" + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
