// Headless probe for preset completeness.
// Usage: node tools/presetprobe.js index.html
//
// Why this exists: a preset is what you hand to someone else, so anything it fails to
// carry is a scene that silently renders differently on their machine. That failure is
// invisible locally — the recipient just gets *their* camera, *their* beat tuning — and
// it already happened once: applyRestore's mapping rebuilt every imported preset without
// `cam`, and at the time camrx/camry/camrz lived nowhere else, so every imported preset
// quietly inherited whatever camera the recipient was sitting at. (The camera is per-layer
// state now — inline in the top-level `state` and in each layer's own `cam` node — so root
// `cam` is only the legacy migration carrier, still imported for pre-per-layer backups.)
//
// Two kinds of check:
//   1. STRUCTURAL — every key applyPreset restores must be a key snapshotScene captures,
//      and the import mapping must carry them all too. Read off the real source, so
//      adding a field to one and forgetting the other two is caught by construction
//      rather than by someone noticing their camera is wrong.
//   2. BEHAVIOURAL — mergeBeatTune sliced out and run, pinning its replace semantics.
//
// It slices by source markers, so keep them: `const BEAT_DEFAULTS` … `const beatCfg`,
// `function mergeBeatTune(` … `function installBeatTune(`, `function snapshotScene()`
// … `function defaultPresets(`, `function applyPreset(` … `function createPreset(`,
// `const valid = arr` … `if (!valid.length`, and
// `effectSel.addEventListener("change"` … `paletteSel.addEventListener(`.
const fs = require("fs");
const html = fs.readFileSync(process.argv[2] || "index.html", "utf8");
const s0 = html.indexOf("<script>"), s1 = html.indexOf("</script>", s0);
if (s0 < 0 || s1 < 0) throw new Error("probe: no inline <script> found");
const src = html.slice(s0 + 8, s1);

const cut = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a + 1);
  if (a < 0 || b < 0 || b < a) throw new Error("probe: could not slice " + from + " .. " + to);
  return src.slice(a, b);
};

let pass = 0, fail = 0;
const ok = (cond, name, detail) => {
  (cond ? pass++ : fail++);
  console.log((cond ? "PASS  " : "FAIL  ") + name + (detail ? "  [" + detail + "]" : ""));
};

// --- 1. structural: snapshotScene vs applyPreset vs the import mapping --------
const snapSrc = cut("  function snapshotScene()", "  function defaultPresets(");
const applySrc = cut("  function applyPreset(", "  function createPreset(");
// The import mapping now lives in validatePresetList (shared by file import and preset-bundle
// links), so slice that function's body — its object literal is the per-preset rebuild.
const importSrc = cut("function validatePresetList(", "  // `validatePresetList` and `normalizeBackup` above");

// Keys of the object literal snapshotScene returns (one per line, `key:` or `key,`).
const snapKeys = new Set();
for (const line of snapSrc.slice(snapSrc.indexOf("return {")).split("\n")) {
  const m = line.match(/^\s{6}(\w+)\s*[:,]/);
  if (m) snapKeys.add(m[1]);
}
// Every `p.<key>` applyPreset reads off the stored preset. COMMENTS STRIPPED FIRST — this
// source is heavily commented and the comments name the very fields being matched, so a
// deleted line whose comment survived would keep its key in the set and the check would pass
// over the regression. (Exactly what happened the first time the reverse check below was
// tried.) Same precaution solidsprobe takes before grepping for Math.random.
const noComments = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const readKeys = new Set([...noComments(applySrc).matchAll(/\bp\.(\w+)/g)].map(m => m[1]));
// Keys the import mapping rebuilds each preset with.
const importKeys = new Set([...importSrc.matchAll(/(\w+):/g)].map(m => m[1]));

ok(snapKeys.size >= 9, "snapshotScene returns a populated object", [...snapKeys].join(","));
for (const k of ["effect", "state", "beat", "pulse", "plen", "btune", "beatTune", "ranges", "extra"])
  ok(snapKeys.has(k), "snapshotScene captures `" + k + "`");
{
  // EVERY per-effect map has to be a MAP_DEFS row — the one registry its wire name, save,
  // load and init hooks all come from. A map left out still saves and still loads — until
  // someone reorders or removes an effect, at which point every stored entry silently
  // reattaches to whichever effect now sits at that index. Invisible until it bites.
  const defs = (src.match(/const MAP_DEFS = \[([\s\S]*?)\n  \];/) || [])[1] || "";
  for (const m of ["states", "beats", "pulses", "plens", "btunes", "extras"])
    ok(defs.includes('wire: "' + m + '"'), "MAP_DEFS carries `" + m + "` across the storage edge");
  ok(/const EFFECT_MAPS = MAP_DEFS\.map\(d => d\.wire\)/.test(src),
     "EFFECT_MAPS derives from MAP_DEFS — one list, not two to keep in step");
  for (const hook of ["save", "load", "init"])
    ok(defs.split(hook + ":").length - 1 === 6, "every MAP_DEFS row carries a `" + hook + "` hook");
  // The site that motivated the table: installShared's re-seed was a hand list that missed
  // initBtuneStates, so a recipient's own per-slider beat tuning bled into shared scenes.
  const shared = cut("function installShared(", "function applyShared()");
  ok(/initAllMaps\(\)/.test(shared),
     "installShared re-seeds every map through the table (the hand list missed btunes)");
}
// The camera moved OUT of the preset root: it is per-layer state now, so snapshotScene must
// NOT emit a root `cam` (that field was a redundant mirror, and its presence at root is the
// thing the user asked to remove). Locked in so it can't quietly come back.
ok(!snapKeys.has("cam"), "snapshotScene no longer emits a root `cam` (camera is per-layer)");

{
  const missing = [...readKeys].filter(k => !snapKeys.has(k));
  ok(!missing.length,
     "every field applyPreset restores is one snapshotScene captures",
     missing.length ? "applyPreset reads p." + missing.join(", p.") + " — never saved" : [...readKeys].join(","));
}
{
  // ...AND THE OTHER WAY ROUND. The check above only caught "restores something never saved";
  // the costlier direction is a field that IS saved and never read back, because that one is
  // silent — the scene carries the data, every switch discards it, and the user's setting
  // evaporates with no error. (Caught adding `btune`: dropping its applyPreset line left
  // every other assertion green.)
  // `layers` is the one legitimate exemption: applyPreset hands the whole preset to
  // mergeLayers/installStack rather than reading p.layers itself.
  const EXEMPT = new Set(["layers"]);
  const unread = [...snapKeys].filter(k => !readKeys.has(k) && !EXEMPT.has(k));
  ok(!unread.length,
     "every field snapshotScene captures is one applyPreset restores",
     unread.length ? "saved but never read back: " + unread.join(", ") : [...snapKeys].join(","));
}
{
  // `name` is added by the caller, not by snapshotScene.
  const missing = [...snapKeys].filter(k => !importKeys.has(k));
  ok(!missing.length,
     "the import mapping carries every field a preset stores",
     missing.length ? "dropped on import: " + missing.join(", ") : [...importKeys].join(","));
  ok(importKeys.has("name"), "...and names the imported preset");
}
// The regression that motivated the probe, pinned by name so it reads as intent. `cam` is
// now the legacy migration carrier (a pre-per-layer backup's root camera) — still imported so
// those old files load, even though new presets carry the camera in state / per-layer `cam`.
ok(importKeys.has("cam"), "import still carries `cam` (migration source for pre-per-layer backups)");
ok(importKeys.has("beatTune"), "import keeps `beatTune`");

// --- 1b. structural: ONE migration funnel -------------------------------------
// Every legacy-shape fix must run from migrateBlob, and BOTH load paths must call the
// funnel rather than picking migrations individually — the split is exactly how a future
// migration gets added to one path and silently skipped by the other. Comments stripped
// before matching: the surrounding prose names these very functions.
{
  const funnel = cut("  function migrateBlob(p) {", "  function readSceneFx(");
  const blobSrc = cut("  function applyBlob(", "  function restore(");
  const migrators = [...new Set([...src.matchAll(/function (migrate\w+)\(/g)].map(m => m[1]))]
    .filter(n => n !== "migrateBlob");
  ok(migrators.length >= 2, "there are migrations to funnel", migrators.join(","));
  for (const name of migrators)
    ok(new RegExp(name + "\\(").test(noComments(funnel)), "migrateBlob runs " + name);
  ok(/migrateBlob\(/.test(noComments(blobSrc)), "applyBlob migrates through the funnel");
  ok(/migrateBlob\(/.test(noComments(applySrc)), "applyPreset migrates through the funnel");
  for (const [where, body] of [["applyBlob", blobSrc], ["applyPreset", applySrc]])
    for (const name of migrators)
      ok(!new RegExp(name + "\\(").test(noComments(body)),
         where + " does not bypass the funnel with " + name);
}

// --- 2. behavioural: mergeBeatTune replace semantics --------------------------
const code =
  cut("const CONFIG =", "// ==== end CONFIG ====") +   // BEAT_DEFAULTS sources from CONFIG now
  "  const " + cut("const BEAT_DEFAULTS", "const beatCfg").slice("const ".length) + ";\n" +
  cut("  function mergeBeatTune(", "  // Write a validated tuning") +
  "\nreturn { mergeBeatTune, BEAT_DEFAULTS };";
const P = new Function(code)();
const D = P.BEAT_DEFAULTS;

{
  const d = P.mergeBeatTune(null);
  ok(JSON.stringify(d.fluxK) === JSON.stringify(D.fluxK) &&
     d.floor === D.floor &&
     JSON.stringify(d.refract) === JSON.stringify(D.refract) &&
     JSON.stringify(d.bands) === JSON.stringify(D.bands),
     "mergeBeatTune(null) is exactly the shipped defaults");
  ok(P.mergeBeatTune(undefined).floor === D.floor, "...and so is mergeBeatTune(undefined)");
  ok(P.mergeBeatTune({}).floor === D.floor, "...and an empty object (a pre-feature preset)");

  // THE assertion: a partial tuning must not inherit the previously applied one. This is
  // what merging into the live beatCfg would get wrong — preset A's sensitivity would
  // leak into preset B, and a preset saved before the feature would inherit everything.
  const a = P.mergeBeatTune({ fluxK: [5, 5, 5], floor: 0.9, refract: [400, 400, 400] });
  const b = P.mergeBeatTune({ floor: 0.2 });
  ok(a.fluxK[0] === 5 && a.floor === 0.9, "a full tuning round-trips", JSON.stringify(a.fluxK));
  ok(b.floor === 0.2, "a partial tuning keeps the field it supplies");
  ok(JSON.stringify(b.fluxK) === JSON.stringify(D.fluxK) &&
     JSON.stringify(b.refract) === JSON.stringify(D.refract),
     "...and DEFAULTS the rest rather than inheriting the previous preset",
     "fluxK " + JSON.stringify(b.fluxK) + " refract " + JSON.stringify(b.refract));

  // Returned arrays must be copies, or two presets would share one tuning.
  const c1 = P.mergeBeatTune(null), c2 = P.mergeBeatTune(null);
  c1.fluxK[0] = 99; c1.bands[0][0] = 99;
  ok(c2.fluxK[0] !== 99 && c2.bands[0][0] !== 99 && D.fluxK[0] !== 99 && D.bands[0][0] !== 99,
     "results are deep copies — neither shared with each other nor with BEAT_DEFAULTS");
}
{
  // Junk must fall back rather than throw or land in the detector.
  ok(P.mergeBeatTune({ fluxK: "nope", floor: "x", refract: null, bands: 7 }).floor === D.floor,
     "wrong-typed fields are ignored");
  ok(P.mergeBeatTune({ floor: 5 }).floor === D.floor, "an out-of-range floor is rejected");
  ok(P.mergeBeatTune({ fluxK: [-1, 0, NaN] }).fluxK[0] === D.fluxK[0], "a non-positive fluxK is rejected");
  ok(P.mergeBeatTune({ bands: [[100, 50]] }).bands[0][0] === D.bands[0][0], "an inverted band is rejected");
  ok(P.mergeBeatTune({ bands: [[1, 99000]] }).bands[0][1] === D.bands[0][1], "a band above Nyquist is rejected");
  let threw = false;
  try { P.mergeBeatTune({ bands: [] }); P.mergeBeatTune({ bands: [null, 3] }); } catch (e) { threw = true; }
  ok(!threw, "a short/sparse bands array doesn't throw (reachable from a hand-edited backup)");
}

// --- 3. switching effect stays on the selected preset and folds the change in ----
// This has been all three ways round: deselect, auto-select a preset for the new effect,
// and now stay put. A preset is "my scene" and its effect is just another field of it, so
// the switch is an edit like any other. The knock-on is intended: a preset keeps its name
// when you change its effect. Asserted structurally because the previous two behaviours
// both looked reasonable in isolation and someone will be tempted to "fix" this again.
{
  const src2 = cut('effectSel.addEventListener("change"', "paletteSel.addEventListener(");
  ok(!/curPreset\s*=\s*-1/.test(src2), "the effect chooser no longer deselects the preset");
  ok(/autosavePreset\(\)/.test(src2), "...it folds the new effect into the selected preset");
  ok(/setEffect\(/.test(src2), "...and still switches the effect");
}

// --- 3b. something is ALWAYS selected -------------------------------------------
// There is no "— unsaved scene —" any more, and the invariant behind that is worth pinning:
// with no scratch mode, autosavePreset() writes on every edit, so a curPreset of -1 anywhere
// past startup means an edit goes nowhere — or, worse, that a path selected a scene without
// applying it and the next slider move overwrites that scene with a different picture.
// Invisible to a screenshot: the panel looks right the whole time and the damage only shows
// the next time you open the scene that got clobbered.
{
  const body = src.replace(/^\s*\/\/.*$/gm, "");     // comments discuss -1; code must not use it
  const writes = body.match(/curPreset\s*=\s*-1/g) || [];
  // Exactly two are legitimate: the bootstrap declaration in boot-globals, and applyBlob's
  // fallback for an empty library (both are resolved by ensureSelection before anything paints).
  ok(writes.length <= 2, "no path drops the selection to -1 beyond the two bootstrap sites",
     writes.length + " site(s)");
  ok(/function ensureSelection\(\)/.test(body), "ensureSelection() exists as the single choke point");
  ok(/presets\s*=\s*defaultPresets\(\)/.test(cut("function ensureSelection()", "function adoptSharedScene")),
     "...and re-seeds the library rather than allowing an empty one");
  // Card 827 removed the panel's Rename / Delete / Share buttons, the scene list and its
  // collection-drop X. No path deletes the selected scene any more; if one comes back it must
  // APPLY the neighbour it selects (highlighting alone lets the next edit overwrite it).
  ok(!body.includes('el("delpreset")') && !body.includes("function dropCollection("),
     "no Delete / drop-collection path is left in the panel");
  ok(body.includes('el("newpreset").addEventListener("click", createPreset)'), "New is still wired");
  // The scratch mode is gone from the UI too.
  ok(!/pl-unsaved/.test(body), "the unsaved row is gone from the scene list");
  ok(!/— unsaved scene —/.test(body), "...and so is its label");
}

// --- 3c. a shared scene is kept, and the write is deferred ----------------------
// installShared runs SYNCHRONOUSLY for the legacy ?s= link, three slices before the preset
// code exists and before restore() has built the library the scene has to join. Writing there
// would be discarded by the load that follows. So it parks an intent and adoptSharedScene does
// the write later — from the startup epilogue (which covers ?s=) and from the ?z=/#c= handlers.
{
  const inst = cut("function installShared(", "// ?z= (deflated)");
  ok(/pendingShared\s*=/.test(inst), "installShared parks the intent instead of writing presets");
  ok(!/presets\.push\(/.test(inst), "...and does not touch the library itself");
  const adopt = cut("function adoptSharedScene()", "// ---- Scene collections");
  ok(/pendingShared\s*=\s*null/.test(adopt), "adoptSharedScene is idempotent (clears the marker)");
  ok(/collection:\s*SHARED_COLLECTION/.test(adopt), "...files the scene in its own collection");
  ok(/stopCycling\(\)/.test(adopt), "...and stops the cycler swapping straight off it");
}

// --- 4. saved scenes survive a registry reorder -------------------------------
// The per-effect maps used to be stored keyed by registry position, so reordering or
// removing an effect silently handed every saved scene to whichever effect now sat at
// that index — in localStorage, Backups and share links. Nothing surfaces it until
// someone reorders EFFECTS, at which point everyone's saved settings are already wrong.
// Serialize under one registry, deserialize under a shuffled one, and check the values
// followed their effect rather than their slot.
{
  const mk = ids => ids.map(id => ({ id }));
  // The codec also converts palette refs now; stub those converters to pass-through — the
  // real ones are exercised by palprobe, and THIS check is about effect keying alone.
  const palStubs =
    "const palIdOut = () => null;\n" +
    "const palIdxIn = v => (typeof v === 'number' ? v : (/^\\d+$/.test(v) ? +v : -1));\n" +
    "const customPalettesOk = a => (Array.isArray(a) ? a : []);\n";
  const build = ids => new Function("EFFECTS",
    palStubs +
    cut("  const LEGACY_EFFECT_IDS", "  // Per-effect slider presets") +
    "\nreturn { serializeBlob, deserializeBlob };")(mk(ids));

  const A = ["sirpinfyer", "tetrafyer", "animejulia", "plasma", "tunnel"];
  const wrote = build(A).serializeBlob({
    effect: 4,                                   // tunnel
    states: { 0: { points: 111 }, 3: { pspeed: 333 }, 4: { tunspeed: 444 } },
    extras: { 3: { palette: "3" }, 4: { palette: "9" } },
  });
  ok(typeof wrote.states.tunnel === "object" && wrote.states.plasma.pspeed === 333,
     "stored scenes are keyed by stable id, not by position", Object.keys(wrote.states).join(","));

  // Same data read back by a build where the registry has been shuffled and one effect
  // removed. Nothing else about the blob changes.
  const B = ["plasma", "tunnel", "sirpinfyer", "animejulia"];   // tetrafyer retired
  const read = build(B).deserializeBlob(JSON.parse(JSON.stringify(wrote)));
  ok(read.effect === 1, "`effect` still resolves to tunnel's new index", String(read.effect));
  ok(read.states[0] && read.states[0].pspeed === 333, "plasma's scene followed plasma to index 0",
     JSON.stringify(read.states[0]));
  ok(read.states[1] && read.states[1].tunspeed === 444, "tunnel's scene followed tunnel to index 1",
     JSON.stringify(read.states[1]));
  ok(read.states[2] && read.states[2].points === 111, "sirpinfyer's scene followed it to index 2",
     JSON.stringify(read.states[2]));
  ok(read.extras[0].palette === "3" && read.extras[1].palette === "9",
     "extras follow their effect too, not just states");
  ok(Object.keys(read.states).length === 3, "the retired effect's scene is dropped, not misfiled",
     Object.keys(read.states).join(","));

  // Blobs written before this change carry numeric keys; the registry has only ever been
  // appended to, so those positions are still correct and must load unchanged.
  const legacy = build(A).deserializeBlob({ effect: "plasma", states: { 0: { points: 7 }, 3: { pspeed: 8 } } });
  ok(legacy.states[0].points === 7 && legacy.states[3].pspeed === 8,
     "a pre-id blob's numeric keys still load", JSON.stringify(Object.keys(legacy.states)));
}

// --- 5. backup file naming + shape normalization ------------------------------
const B = new Function(
  cut("  const WIN_RESERVED", "  function stampNow(") +
  cut("  function normalizeBackup(", "  // `validatePresetList` and `normalizeBackup` above") +
  "\nreturn { safeFileName, normalizeBackup };")();

{
  const f = B.safeFileName;
  ok(f("Fire Thing") === "Fire Thing", "an ordinary name is left alone", f("Fire Thing"));
  // A preset name is free text and becomes a filename; these are the ways that bites.
  ok(!/[\/\\:*?"<>|]/.test(f('a/b\\c:d*e?f"g<h>i|j')), "path separators and illegal chars are stripped",
     f('a/b\\c:d*e?f"g<h>i|j'));
  ok(f("  padded  ") === "padded", "surrounding whitespace is trimmed", "'" + f("  padded  ") + "'");
  ok(!/[. ]$/.test(f("trailing dot.")), "no trailing dot (Windows drops them silently)", f("trailing dot."));
  ok(f("") === "Scene" && f(null) === "Scene" && f(undefined) === "Scene",
     "an empty/missing name falls back rather than producing '.json'");
  ok(f("CON") === "_CON" && f("nul") === "_nul" && f("COM1") === "_COM1",
     "Windows reserved device names are escaped", f("CON") + "," + f("nul"));
  ok(f("ok.name") === "ok.name", "an interior dot is fine");
  ok(f("x".repeat(300)).length <= 80, "absurdly long names are truncated", f("x".repeat(300)).length);
  ok(f("a bc") === "abc", "control characters are removed", JSON.stringify(f("a bc")));
}
{
  const n = B.normalizeBackup;
  // Every shape Backup has ever written has to keep restoring.
  ok(JSON.stringify(n([{ name: "x" }])) === '{"presets":[{"name":"x"}]}',
     "oldest bare array becomes { presets }");
  ok(n({ kind: "preset", preset: { name: "p" } }).presets.length === 1,
     "a single-preset file becomes a one-entry preset list");
  ok(n({ kind: "settings", settings: { states: {} } }).states !== undefined,
     "a settings file unwraps to the settings object");
  ok(n({ presets: [], ranges: {} }).ranges !== undefined, "a legacy { presets, ranges } passes through");
  ok(n({ states: {}, presets: [] }).states !== undefined, "a whole-library snapshot passes through");
  ok(n(null) === null && n(7) === null && n("x") === null, "junk is rejected, not guessed at");
  ok(n({ kind: "preset" }).kind === "preset",
     "a preset file with no payload falls through rather than throwing");
}

console.log("\n" + (fail ? fail + " FAILED, " : "") + "all " + pass + " passed");
process.exit(fail ? 1 : 0);
