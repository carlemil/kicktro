  // ---- custom slider ranges (min/max/step) — persisted, shared and backed up ----
  // The sliders' bounds ship as HTML attributes; capture them once, pristine, so we
  // can store only the ones the user actually retunes (and let a changed shipped
  // default flow through to sliders they never touched). This must run before the
  // first applyBlob() (restore/share) below, which applies saved ranges via RNG_ORIG.
  // Keyed by the WIRE key ("speed-lo"), which is what a stored `ranges` map names.
  //
  // Built from the CONTROLS schema rather than by scanning the panel, for two reasons and the
  // second is the silent one. A layer control exists once per stack slot and carries no id, so
  // a scan would key every one of them `undefined`; and by the time this runs the layer rows
  // exist, so the scan would also swallow the four gain sliders — type=range, no id — into
  // that same junk key, which rangesDiffering would then skip without ever complaining.
  // ctlHTML emits step="any" and min/max straight from the schema, so this reproduces exactly
  // what the scan used to find.
  // A slider's key in RNG_ORIG (and in a stored `ranges` map). Scene sliders carry it as
  // their `id`; a per-layer slider exists once per stack slot and carries it on `data-k`.
  // Reading `inp.id` alone silently returns "" for every layer slider, so every bounds
  // RESTORE became a no-op — ↺ and "Reset this effect" reset the value and left the widened
  // range. Nothing warned, because RNG_ORIG[""] is just undefined and the loops skip it.
  const rngKeyOf = inp => inp.id || (inp.dataset && inp.dataset.k) || "";
  // A SINGLE control ships its real step, not "any". This is load-bearing rather than
  // cosmetic: applyRangesFor resets every slider's step from rngShipped on every scene load
  // and every effect switch, so an "any" here silently un-quantises all of them the moment
  // the first scene lands — the change would look like it worked and then evaporate.
  const RNG_ORIG = {};
  CONTROLS.forEach(c => {
    const step = c.single ? String(c.step) : "any";
    if (c.type === "dual") { for (const t of ["lo", "hi"]) RNG_ORIG[c.key + "-" + t] = { min: String(c.min), max: String(c.max), step }; }
    else if (c.type === "plain") RNG_ORIG[c.key] = { min: String(c.min), max: String(c.max), step };
  });
  // ...plus the two scene ranges authored in the markup rather than generated (TTL, transition).
  ["ttl-lo", "ttl-hi", "tdur-lo", "tdur-hi"].forEach(id => {
    const i = el(id);
    if (i) RNG_ORIG[id] = { min: i.min, max: i.max, step: i.step };
  });
  // A slider's BOUNDS are per-LAYER exactly when the slider itself is (effect params, incl.
  // zoom) and scene-wide otherwise (camera rotation, palette cycle, banding, TTL, scene
  // filters) — the same split as isSceneCtl / the value store, so a custom bound stays with
  // the exact layer + effect + slider it tunes instead of being shared across every layer.
  // Memoised: the answer is fixed by the schema, and the range loops ask it for every key in
  // RNG_ORIG several times per scene switch — a CONTROLS.find each time was a quarter of the
  // auto-cycle hitch (tools/transperf-check.js). The memo hangs off the hoisted function, not a
  // const beside it, so a caller from an earlier slice cannot land in the TDZ.
  function rangeIsLayer(id) {
    const memo = rangeIsLayer.memo || (rangeIsLayer.memo = new Map());
    let v = memo.get(id);
    if (v === undefined) {
      const c = CONTROLS.find(x => x.key === id.replace(/-(lo|hi)$/, ""));
      memo.set(id, v = !!c && !isSceneCtl(c));
    }
    return v;
  }
  // A shipped bound can be PER EFFECT. Fractal flames wants a Points slider an order of
  // magnitude longer than Tetrafyer's, and the schema carries exactly one range per key, so
  // a descriptor may name its own bounds for a per-LAYER slider it declares:
  //   ranges: { points: { min: 10000, max: 200000 } }
  // Widening the schema entry instead would drag every other point effect's floor up with
  // it and silently re-clamp their saved values on load — the "a saved scene stops loading
  // identically" break. Scene-wide sliders are excluded: one palette/camera/TTL bound is
  // shared by the whole scene, so no single effect can own it.
  function effectRange(id, fx) {
    if (!rangeIsLayer(id)) return null;
    const f = EFFECTS[fx === undefined ? effect : fx];
    return (f && f.ranges && f.ranges[id.replace(/-(lo|hi)$/, "")]) || null;
  }
  // The bounds a slider SHIPS with for a given effect: RNG_ORIG with that effect's override
  // laid over it. Every "put it back the way it ships" and "is this one the user retuned?"
  // path reads THIS rather than RNG_ORIG, so an effect's own bounds are never mistaken for a
  // user widening (which would store them in `ranges` on every scene) and ↺ / Reset put back
  // the effect's range instead of the schema's.
  // A single control's step is never overridable — an effect that widened its bounds must not
  // be able to un-quantise it (assertRegistry warns if one ever names a single key at all).
  function rngShipped(id, fx) {
    const o = RNG_ORIG[id]; if (!o) return o;
    const r = effectRange(id, fx); if (!r) return o;
    return {
      min: r.min !== undefined ? String(r.min) : o.min,
      max: r.max !== undefined ? String(r.max) : o.max,
      step: SINGLE_KEYS.has(id.replace(/-(lo|hi)$/, "")) ? o.step : (r.step !== undefined ? String(r.step) : o.step)
    };
  }
  function rangesDiffering(want) {         // { id: {min,max,step} } for bounds ≠ shipped, filtered by want(id)
    const out = {};
    for (const id in RNG_ORIG) {
      if (!want(id)) continue;
      const inp = ctl(id), o = rngShipped(id);
      if (inp && (inp.min !== o.min || inp.max !== o.max || inp.step !== o.step))
        out[id] = { min: inp.min, max: inp.max, step: inp.step };
    }
    return out;
  }
  function collectRanges() { return rangesDiffering(id => !rangeIsLayer(id)); }   // scene-wide bounds only (per-layer ones ride on the stack item)
  function collectLayerRanges() { return rangesDiffering(rangeIsLayer); }         // this layer's custom bounds
  function layerRangesOf(r) {              // the per-layer-slider entries of a scene-wide ranges map (old-scene migration)
    const out = {};
    if (r && typeof r === "object") for (const id in r) if (rangeIsLayer(id)) out[id] = r[id];
    return out;
  }
  // The top-level `ranges` for a blob/preset: scene-wide bounds always, PLUS the sole layer's
  // per-layer bounds when the stack holds one item (stackOut emits no `layers` then, so they
  // would otherwise be lost — the same "single layer stores its per-layer bits at the top" rule
  // as palette/filters). Multi-layer stacks carry each layer's bounds in layers[].ranges.
  function sceneRanges() { return stack.length <= 1 ? { ...collectRanges(), ...collectLayerRanges() } : collectRanges(); }
  // Each pop-out box's range editor registers a sync fn here, so bounds loaded from
  // a blob (restore / share link) show up in the fields. Declared beside applyRanges
  // because applyRanges calls it, and applyBlob can run before the boxes are built.
  const rngSyncs = [];
  function rngSyncAll() {
    if (applyingPreset) { rngSyncAll.later = true; return; }   // once, from presetUiCatchUp
    rngSyncs.forEach(f => f());
  }
  // Put one slider back the way it ships for the CURRENT effect: bounds, value,
  // beat chips, pulse shape and pulse length. The box's ↺ used to restore only the
  // range, which left a slider you had wandered off into a strange place still
  // strange. Bounds go first, so the value below validates against them.
  // A control's shipped default straight from the CONTROLS schema — the source of truth
  // for sliders no effect's `defaults` mentions. Dual sliders carry lo/hi, plain ones a
  // single `value`; checkboxes have neither and reset elsewhere.
  function ctlDefault(key) {
    const c = CONTROLS.find(x => x.key === key);
    if (!c) return undefined;
    if (c.type === "dual") return [c.lo, c.hi];
    if (c.type === "plain") return c.value;
    return undefined;
  }
  function resetControl(key) {
    const els = ctlRangeInputs(key);
    for (const inp of els) {
      const o = rngShipped(rngKeyOf(inp)); if (!o) continue;
      inp.min = o.min; inp.max = o.max; inp.step = o.step;
    }
    // presetState merges the filter + camera defaults, so their params reset too — but it
    // only knows keys the effect declares in `defaults` (plus those merged-in sets), and some
    // on-screen sliders are none of those. Fall back to the shipped default from the CONTROLS
    // schema, which every slider has by construction. (The camera was the case that bit here:
    // camrx/camry/camrz sit in most effects' `params` but not their `defaults`; presetState now
    // seeds them to [0,0] as per-layer state, so st[key] resolves — the fallback still covers
    // any other params-but-not-defaults slider.)
    const st = presetState(effect);
    const v = st[key] !== undefined ? st[key] : ctlDefault(key);
    if (Array.isArray(v)) {
      const lo = ctl(key + "-lo"), hi = ctl(key + "-hi");
      if (lo && hi) { lo.value = v[0]; hi.value = v[1]; }
    } else if (v !== undefined && ctl(key)) {
      ctl(key).value = v;
    }
    const b = presetBeat(effect)[key];
    if (b && beatReact[key]) {
      for (const band of ["low", "mid", "high"]) beatReact[key][band] = !!b[band];
      syncChips();
    }
    const ps = presetPulse(effect)[key];
    if (ps && pulseShape[key] !== undefined) { pulseShape[key] = ps; syncPulse(); }
    const pl = presetPlen(effect)[key];
    if (pl !== undefined && pulseLen[key] !== undefined) { pulseLen[key] = pl; syncPlen(); }
    // Re-dispatch so the fill, the readout and the effect all follow, and the
    // delegated onEdit persists it (and autosaves into the selected preset).
    for (const inp of els) inp.dispatchEvent(new Event("input", { bubbles: true }));
    persist();
  }
  // Set custom bounds onto the slider elements (validated). Restores every slider to its
  // shipped bounds first, so this is a REPLACE, not a merge: `r` is always the complete
  // set of non-default bounds (collectRanges only stores what differs), and switching to
  // a preset that widened nothing must narrow the previous preset's widening back.
  function applyRangesFor(r, want, slot) {      // reset the wanted sliders to shipped, then apply r's bounds for them
    const g = id => (slot === undefined ? ctl(id) : (ctlIn(slot, id) || (slot === 0 ? el(id) : null)));
    // "Shipped" is per effect for a layer slider, so this needs the effect whose block we are
    // painting: the selected one for the live sliders, that slot's for any other block. It is
    // also what re-widens the slider on an effect SWITCH — setEffect calls applyLayerRanges
    // after assigning `effect`, so entering flames stretches Points to its own bounds.
    const fx = slot === undefined ? effect : (stack[slot] ? stack[slot].fx : effect);
    for (const id in RNG_ORIG) {
      if (!want(id)) continue;
      const inp = g(id), o = rngShipped(id, fx);
      // Only what differs: every write re-sanitises the slider, and this loop covers every
      // slider in the page on every scene load. Writing an unchanged bound is a no-op anyway.
      if (inp) {
        if (inp.min !== o.min) inp.min = o.min;
        if (inp.max !== o.max) inp.max = o.max;
        if (inp.step !== o.step) inp.step = o.step;
      }
    }
    if (r && typeof r === "object") for (const id in r) {
      if (!want(id)) continue;
      const inp = g(id), o = rngShipped(id, fx), v = r[id]; if (!inp || !o || !v) continue;
      const single = SINGLE_KEYS.has(id.replace(/-(lo|hi)$/, ""));
      let mn = +v.min, mx = +v.max;
      if (!isFinite(mn) || !isFinite(mx) || mx <= mn) continue;
      // A SANITY ENVELOPE, not a clamp back to the shipped bounds -- widening a slider is a real
      // feature and a widened scene has to keep loading identically. `ranges` rides in the share
      // URL, the bundle, the backup and the cloud profile, and applyBlob installs it FIRST, so
      // its own ok() check then validates every value against whatever bounds the payload chose.
      // Any finite pair used to be accepted. 100x the shipped span either side is far past any
      // deliberate widening and still finite. CLAMPED rather than rejected so the scene loads.
      const span = Math.max(1e-6, o.max - o.min), pad = span * 100;
      const lim = (x) => Math.max(o.min - pad, Math.min(o.max + pad, x));
      mn = lim(mn); mx = lim(mx);
      if (mx <= mn) continue;
      // Widen a single control's stored bounds out to the integers so the grid stays whole.
      // FLOOR/CEIL, never round: widening can never re-clamp a value the scene already
      // stored, where rounding inward could.
      if (single) { mn = Math.floor(mn); mx = Math.ceil(mx); }
      inp.min = String(mn); inp.max = String(mx);
      // Honour a saved step; a blob that omits it (older ones, and every non-stepped
      // scene) keeps the shipped step set in the reset loop above. A saved 0 means the
      // author made the slider continuous, so it overrides a shipped integer step —
      // except on a single control, whose whole point is that it cannot be un-quantised.
      // (The shipped library really does carry both "step":"1" and "step":"any" entries.)
      if (v.step !== undefined && !single) { const sp = +v.step; inp.step = isFinite(sp) && sp > 0 ? String(sp) : "any"; }
    }
    rngSyncAll();                         // the in-box min/max/step fields follow
  }
  function applyRanges(r) { applyRangesFor(r, id => !rangeIsLayer(id)); }   // scene-wide bounds (a REPLACE — see the old note)
  function applyLayerRanges(r) { applyRangesFor(r, rangeIsLayer); }         // one layer's per-layer-slider bounds
  // ...and the same for a block that is not the selected one. paintBlock MUST call this
  // BEFORE it writes that block's values: a value painted into a slider whose bounds are
  // still the shipped ones is silently clamped by the browser, and the next freezeItem then
  // writes the clamped number back. That is data loss, not cosmetics, and it only shows on
  // scenes with widened sliders.
  function applyLayerRangesTo(slot, r) { applyRangesFor(r, rangeIsLayer, slot); }
  // sceneRangeInputs() and refreshRangeUI() used to live here and are GONE. They had no
  // callers, and with one control block per stack slot they had become a landmine for
  // whoever re-attached them: the scan walked the whole panel, so it would have found
  // every layer's copy of every slider and re-dispatched `input` on all of them — one
  // delegated onEdit, one persist and one autosave per slider per block. Re-clamping
  // after a bounds change is done per slider by rngApply and per block by paintBlock.

