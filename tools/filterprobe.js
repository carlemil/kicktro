// Headless probe for the post-FX filter registry.
// Slices the REAL registry + its helpers out of index.html and exercises them on
// stub state — so this tests the shipped code, not a copy of it.
// Usage: node tools/filterprobe.js index.html
//
// It slices by source markers, so keep them: `// ---- FILTERS: stackable post-FX`
// … `function initStates(`, and `function presetExtra(` … `function initExtras(`.
const fs = require("fs");
const html = fs.readFileSync(process.argv[2] || "index.html", "utf8");
const s0 = html.indexOf("<script>"), s1 = html.indexOf("</script>", s0);
if (s0 < 0 || s1 < 0) throw new Error("probe: no inline <script> found");
const src = html.slice(s0 + 8, s1);

const cut = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to);
  if (a < 0 || b < 0 || b < a) throw new Error("probe: could not slice " + from + " .. " + to);
  return src.slice(a, b);
};

// The registry block references drawing globals only inside its gl/cpu callbacks,
// which we never invoke here — stub what the top level touches.
const stubs = `
  let useGL = true, curHeat = 0, fw = 8, fh = 8, cfg = { decay: 129 }, fire = new Uint8Array(0);
  let bloomAmt = 0.35, fadeKeep = 0.94, pixelBlock = 6, softenAmt = -0.6, softenRad = 1.5,
      edgeAmt = 0.7, posterLevels = 5, mirrorMode = 1;
  let activeIds = new Set(["fire", "bloom"]);
  // The per-layer set can be overridden while the frame draws a layer that is not the
  // selected one; activeFilters() reads it, so it has to exist here.
  let renderFilters = null;
  let sceneOn = new Set();
  // EMPTY, mirroring the app: nothing is scene-global any more. Left as a stub rather than
  // deleted because filterOn still routes through it, and an empty set is what makes that
  // route a no-op — testing the old contents here would test a fiction.
  const SCENE_FILTER_IDS = new Set();
  const isSceneFilter = id => SCENE_FILTER_IDS.has(id);
  function filterOn(id) { return (isSceneFilter(id) ? sceneOn : (renderFilters || activeIds)).has(id); }
  const SEED_MODES = { cardioid: 1, circle: 1, freehand: 1 };   // seed-path validation, defined in another slice
  const seedModeOk = m => SEED_MODES[m] ? m : "cardioid";
  const BG_MODES = { black: 1, white: 1, palette: 1 };          // background validation, another slice
  const bgOk = v => BG_MODES[v] ? v : "black";
  const gl = new Proxy({}, { get: () => () => {} });
  const glProg = new Proxy({}, { get: () => ({ p: null, u: {} }) });
  const glTex = { heat: [null, null], post: [null, null], native: null };
  function bindTexUnit() {} function drawQuad() {} function postPass() {} function el() { return null; }
  function screenPass() {} function glWarpFeedback() {} function heatWarpCPU() {} function heatDiffuseCPU() {}
  let echoDist = 2, echoAng = 90, echoKeep = 0.94, zfbScale = 1.02, zfbKeep = 0.94,
      swirlSpin = 2, swirlKeep = 0.94, diffRad = 1, diffKeep = 0.97, postTime = 0;
  let twistAmt = 1.2, wedgeSeg = 6, wedgeRot = 0, glitchAmt = 0.05, glitchRows = 8,
      halfDot = 4, halfAmt = 0.8, threshLevel = 0.5, threshAmt = 0.8, chromaAmt = 1,
      anaDepth = 8, anaTint = 1;
  let barrelAmt = 0.15, scanAmt = 0.35, scanCount = 240, vigAmt = 0.4, grainAmt = 0.08;
  function buildFilterUI() {}   // DOM-only; the registry calls it right after defining FILTERS
  const EFFECTS = [
    { id: "sirpinfyer", extras: {}, defaults: { points: 3850 } },                 // point effect: no draw hook
    { id: "attractor",  extras: {}, defaults: {}, stamp: () => {} },              // also a point effect
    { id: "plasma",     extras: {}, defaults: {}, draw: () => {} },               // shader effect
    { id: "julia",      extras: {}, defaults: { rise: [77, 77] }, draw: () => {} },// names a filter key itself
  ];
`;
const code = stubs +
  cut("  // ---- FILTERS: stackable post-FX applied after the effect renders", "  function presetState(") +
  cut("  function presetState(", "  function initStates(") +
  cut("  function presetExtra(", "  function initExtras(") +
  "\nreturn { FILTERS, FILTER_BY_ID, FILTER_DEFAULTS, filtersOk, orderFilters, splitChain, activeFilters, activeFilterIds, hasFeedback," +
  "  presetState, presetFilters, mergeExtra, presetExtra," +
  // setActive splits the ids the way the app does: the whole-scene ones live in `sceneOn`
  // (one global setting), the per-layer ones in `activeIds`. activeFilters() reads both.
  "  setActive(ids) { activeIds = new Set(ids.filter(i => !isSceneFilter(i)));" +
  "                   sceneOn = new Set(ids.filter(isSceneFilter)); }," +
  "  getActive() { return activeIds; } };";
const F = new Function(code)();

let pass = 0, fail = 0;
const ok = (cond, name, detail) => {
  (cond ? pass++ : fail++);
  console.log((cond ? "PASS  " : "FAIL  ") + name + (detail ? "  [" + detail + "]" : ""));
};
const ids = F.FILTERS.map(f => f.id);

// --- 1. registry shape --------------------------------------------------------
ok(ids.length >= 8, "at least 8 filters registered", ids.join(","));
ok(new Set(ids).size === ids.length, "no duplicate filter ids");
ok(F.FILTERS.every(f => ["feedback", "post", "screen"].indexOf(f.stage) >= 0),
   "every filter declares a known stage");
ok(F.FILTERS.every(f => Array.isArray(f.params) && f.params.length >= 0), "every filter declares params");
ok(F.FILTERS.every(f => f.defaults && Object.keys(f.defaults).length), "every filter ships defaults");
ok(F.FILTERS.every(f => f.params.every(k => k in f.defaults)),
   "every param has a default (else presetState can't seed it)");
// Bloom is the composite strength, not a chain pass; everything else post needs one.
ok(F.FILTERS.filter(f => f.stage === "post" && f.id !== "bloom").every(f => typeof f.gl === "function"),
   "post filters (bar Bloom) have a gl pass");
ok(F.FILTERS.filter(f => f.stage === "screen").every(f => typeof f.gl === "function"),
   "screen filters have a gl pass");
// The ex-screen filters are ordinary image passes now, and still GPU-only — the Canvas2D
// fallback runs no post chain at all.
ok(["barrel", "scanlines", "vignette", "grain"].every(id => F.FILTER_BY_ID[id].stage === "post"),
   "the four ex-screen filters are per-layer image passes");
ok(["barrel", "scanlines", "vignette", "grain"].every(id => F.FILTER_BY_ID[id].cpuOk === false),
   "...and still marked GPU-only");
// Bloom stays available on the Canvas2D path: render() glows from bloomAmt directly.
ok(F.FILTER_BY_ID.bloom.cpuOk !== false, "bloom is still available on the Canvas2D fallback");
ok(F.FILTERS.filter(f => f.stage === "feedback").every(f => typeof f.glFeedback === "function"),
   "feedback filters have a glFeedback pass");

// --- 2. the chain is a SEQUENCE, split at the effect — not sorted by stage ------
// Every per-effect filter carries a drag handle, and every position in the list is a
// position the pipeline can run. splitChain finds the one fixed point — the effect drawing
// into the heat buffer — and puts everything at or above the LAST feedback filter in the
// heat phase, the rest in the image phase. A `post` filter is just a pass over a texture,
// so dragged above a feedback filter it warps the heat instead of the picture. That is what
// makes "Mirror above Swirl" a real, visible change rather than a drag that snaps back.
{
  const back = ids.slice().reverse();
  const set = F.filtersOk(back);
  ok(JSON.stringify([...set]) === JSON.stringify(back),
     "filtersOk preserves the stored order (a Set iterates in insertion order)");
  const layerIds = ids.filter(id => F.FILTER_BY_ID[id].stage !== "screen");
  const revLayer = layerIds.slice().reverse();
  ok(JSON.stringify(F.orderFilters(revLayer).map(f => f.id)) === JSON.stringify(revLayer),
     "orderFilters keeps the user's order EXACTLY — no stage sort", F.orderFilters(revLayer).map(f => f.id).join(","));
  ok(JSON.stringify(F.orderFilters(["fire", "fire", "nope", "bloom"]).map(f => f.id)) === '["fire","bloom"]',
     "orderFilters drops duplicates and unknown ids");

  // The split itself. `fire` and `swirl` are feedback; `mirror` and `twist` are post.
  const idsOf = a => a.map(f => f.id);
  const s1 = F.splitChain(["swirl", "mirror"]);
  ok(JSON.stringify(idsOf(s1.heat)) === '["swirl"]' && JSON.stringify(idsOf(s1.image)) === '["mirror"]',
     "swirl→mirror: swirl warps the heat, mirror repaints the picture",
     idsOf(s1.heat) + " | " + idsOf(s1.image));
  const s2 = F.splitChain(["mirror", "swirl"]);
  ok(JSON.stringify(idsOf(s2.heat)) === '["mirror","swirl"]' && s2.image.length === 0,
     "mirror→swirl: BOTH run on the heat, mirror first — the reported case",
     idsOf(s2.heat) + " | " + idsOf(s2.image));
  const s3 = F.splitChain(["twist", "fire", "mirror"]);
  ok(JSON.stringify(idsOf(s3.heat)) === '["twist","fire"]' && JSON.stringify(idsOf(s3.image)) === '["mirror"]',
     "the boundary is the LAST feedback filter, wherever it sits",
     idsOf(s3.heat) + " | " + idsOf(s3.image));
  const s4 = F.splitChain(["mirror", "twist"]);
  ok(s4.heat.length === 0 && JSON.stringify(idsOf(s4.image)) === '["mirror","twist"]',
     "no feedback filter ⇒ nothing retains heat, so the whole chain repaints the picture",
     idsOf(s4.heat) + " | " + idsOf(s4.image));
  // Bloom is a REAL PASS now (glBloomPass), not the whole-scene composite, so it belongs in
  // the chain like anything else — that is what lets a layer glow on its own.
  ok(JSON.stringify(idsOf(F.splitChain(["fire", "bloom", "mirror"]).image)) === '["bloom","mirror"]',
     "bloom is an ordinary chain entry now, in the position it was placed",
     idsOf(F.splitChain(["fire", "bloom", "mirror"]).image).join(","));
  ok(typeof F.FILTER_BY_ID.bloom.gl === "function", "...because it has a gl pass of its own");
  const all = F.splitChain(ids);
  ok(all.heat.concat(all.image).length === ids.length,
     "nothing is added or dropped by the split",
     all.heat.length + "+" + all.image.length + " of " + ids.length);
  // Feedback still precedes post in the registry (the fallback order for a scene with no
  // stored chain). The `screen` stage is GONE — every filter is per-layer now, so there is
  // nothing left that acts on the finished composite.
  ok(F.FILTERS.every(f => f.stage !== "screen"),
     "no filter is scene-global any more (the screen stage is empty)",
     F.FILTERS.filter(f => f.stage === "screen").map(f => f.id).join(",") || "none");
  ok(F.FILTERS.filter(f => f.stage === "post").every(f => typeof f.gl === "function"),
     "every post filter has a gl pass, bloom included");
  const stages = F.FILTERS.map(f => f.stage);
  const firstPost = stages.indexOf("post"), lastFeedback = stages.lastIndexOf("feedback");
  const firstScreen = stages.indexOf("screen"), lastPost = stages.lastIndexOf("post");
  ok(lastFeedback < firstPost, "all feedback filters precede all post filters",
     "lastFeedback " + lastFeedback + " < firstPost " + firstPost);
  ok(firstScreen < 0 || lastPost < firstScreen, "all post filters precede all screen filters",
     "lastPost " + lastPost + " < firstScreen " + firstScreen);
  // Bloom no longer has to close the post stage: it was the composite, and the screen
  // filters had to follow it. They are all ordinary passes now, so registry order here is
  // only the fallback for a scene that has never been reordered.
}

// --- 3. filtersOk tolerates junk ---------------------------------------------
ok(F.filtersOk(null) === null, "null list rejected (⇒ caller uses the descriptor default)");
ok(F.filtersOk("fire") === null, "a non-array is rejected");
ok(F.filtersOk([]).size === 0, "an empty list is honoured (all filters off)");
{
  const s = F.filtersOk(["fire", "nope", "fire", 7, null, "bloom"]);
  ok(s.size === 2 && s.has("fire") && s.has("bloom"),
     "unknown/duplicate/non-string ids dropped", [...s].join(","));
}

// --- 4. every effect ships with NO filters on ---------------------------------
ok(JSON.stringify(F.presetFilters(0)) === "[]", "point effect defaults to no filters");
ok(JSON.stringify(F.presetFilters(1)) === "[]", "an effect with `stamp` but no `draw` also defaults to none");
ok(JSON.stringify(F.presetFilters(2)) === "[]", "shader effect defaults to no filters");
ok(F.FILTERS.every(f => F.presetFilters(2).indexOf(f.id) < 0),
   "no filter at all is on by default");

// --- 5. mergeExtra + the descriptor default ----------------------------------
{
  const old = { palette: "3", morph: true, showBox: true, randSeed: false };   // no `filters` key
  const m = F.mergeExtra(0, old);
  ok(JSON.stringify(m.filters) === "[]",
     "a preset with no `filters` key gets the descriptor default (now empty)");
  ok(m.palette === "3" && m.randSeed === false, "...while its other extras survive");
  // mergeExtra is the gate EVERY loaded scene passes through, so it must keep the user's
  // chain. It only normalizes by stage (fire is feedback, bloom is post) and drops junk —
  // re-sorting to registry order here would silently throw away every saved reorder.
  // mergeExtra is the gate EVERY loaded scene passes through, so it must return the chain
  // exactly as stored — re-sorting here would throw away the drag order on reload.
  const mOrd = F.mergeExtra(2, { filters: ["mirror", "swirl"] });
  ok(JSON.stringify(mOrd.filters) === '["mirror","swirl"]',
     "a stored chain reloads in the stored order, across stages included",
     JSON.stringify(mOrd.filters));
  // Only a MISSING key falls back to the descriptor. An empty list is a real
  // choice — "I turned everything off" — and must survive a save/load round trip,
  // or a no-filter scene would be impossible to keep.
  const m4 = F.mergeExtra(2, { filters: [] });
  ok(JSON.stringify(m4.filters) === "[]", "an empty stored list is honoured, not overridden");
  const m3 = F.mergeExtra(2, { filters: ["ghost"] });
  ok(JSON.stringify(m3.filters) === "[]",
     "a list naming only retired filters ends up empty (their choice is gone, not reset)");
  ok(JSON.stringify(F.mergeExtra(2, {}).filters) === "[]",
     "...but a missing key still falls back to the descriptor default (now empty)");
}

// --- 6. presetState seeds every filter's params on every effect ---------------
{
  const st = F.presetState(2);                       // a shader effect that names none of them
  const missing = Object.keys(F.FILTER_DEFAULTS).filter(k => !(k in st));
  ok(!missing.length, "every filter param is seeded on an effect that never mentions it",
     missing.length ? "missing " + missing.join(",") : Object.keys(F.FILTER_DEFAULTS).join(","));
  // Compared against the registry, NOT against a hard-coded 130. The claim is that the value
  // travels from the descriptor into the seeded state; pinning the number as well only made
  // this fail every time a default was retuned, which says nothing about the seeding path.
  const wantRise = F.FILTER_DEFAULTS.rise;
  ok(Array.isArray(st.rise) && Array.isArray(wantRise) && st.rise[0] === wantRise[0],
     "Fire's Flame rise is seeded from the registry",
     "state " + st.rise[0] + " vs registry " + (wantRise && wantRise[0]));
  const st3 = F.presetState(3);                      // this one sets `rise` itself
  ok(st3.rise[0] === 77, "an effect that names a filter key still wins", JSON.stringify(st3.rise));
  // seeded arrays must be copies, or two effects would share one array
  const a = F.presetState(2), b = F.presetState(2);
  a.rise[0] = 999;
  ok(b.rise[0] !== 999, "seeded params are per-effect copies, not shared references");
}

// --- 7. stage helpers ---------------------------------------------------------
{
  F.setActive(["bloom"]);
  ok(!F.hasFeedback(), "bloom alone is not feedback (so glBeginHeat clears)");
  F.setActive(["fire"]);
  ok(F.hasFeedback(), "fire is feedback");
  F.setActive(["fade"]);
  ok(F.hasFeedback(), "fade is feedback too");
  F.setActive(ids);
  ok(F.activeFilters().length === ids.length, "activeFilters returns them all when all are on");
  F.setActive([]);
  ok(F.activeFilters().length === 0 && !F.hasFeedback(), "nothing on ⇒ no chain at all");
}

console.log("\n" + (fail ? fail + " FAILED, " : "") + "all " + pass + " passed");
process.exit(fail ? 1 : 0);
