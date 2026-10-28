  // ---- TRANSITIONS: how one preset gives way to the next ---------------------
  // Scenes that retain heat (Fire / Fade ticked) already dissolve on their own —
  // setEffect leaves the old heat in place and it decays under the new scene. Scenes
  // with no feedback filter rewrite the buffer on their first frame by design, so they
  // used to cut hard. These cover that gap.
  //
  // Every one is a mode of the single FS_TRANS pass, run between the zoom and the glow
  // against glTex.prev — which holds the OUTGOING SCENE, STILL RUNNING. Both sides of a
  // blend are live: `prevStack` is the stack array installStack replaced, every item frozen
  // and therefore self-contained, re-rendered each frame by renderPrevScene into the second
  // half of the per-slot buffers. (It was a frozen still until 1.34.0, on the grounds that
  // two live scenes would need two copies of singleton state; the per-layer colour path had
  // since made that false.)
  //
  // `fits(a, b)` returns a *weight* for a switch from scene a to scene b — 0 means
  // "never pick me for this pair". Both sides are {dense, retains, palette} summaries,
  // so the choice costs nothing: no pixel readback, just the descriptors.
  const TRANS_DUR = { fast: 0.45, mid: 0.6, slow: 0.75 };
  const TRANSITIONS = [
    // Nothing at all. Only sensible when the buffers already blend for us.
    { id: "cut", name: "Cut", mode: -1, dur: 0,
      tip: "No blend at all. Instant, and the right answer when a scene already carries its own trails.",
      fits: (a, b) => (a.retains || b.retains) ? 3 : 0.2 },
    // Retention borrowed for the length of the transition: the incoming scene
    // MAX-blends over decaying old heat, exactly like the scenes that already work.
    { id: "burnoff", name: "Burn off", mode: -1, dur: TRANS_DUR.slow, burn: true,
      tip: "Lends the incoming scene some retention, so the old picture decays underneath it like embers.",
      fits: (a, b) => b.retains ? 0 : 2.5 },
    { id: "crossfade", name: "Crossfade", mode: 0, dur: TRANS_DUR.slow,
      // Two full-screen fields blend beautifully; a sparse point cloud crossfaded
      // against a dense field just looks like a double exposure.
      tip: "A straight dissolve. Best when both scenes fill the frame.",
      fits: (a, b) => (a.dense && b.dense) ? 3 : (a.dense !== b.dense ? 0.3 : 1) },
    { id: "dip", name: "Dip to black", mode: 1, dur: TRANS_DUR.mid,
      // Always defensible; earns its keep most when the palettes jump.
      tip: "Falls to black through the middle and comes back up. Always defensible; earns its keep when the palettes jump.",
      fits: (a, b) => 1 + 2 * palDist(a.palette, b.palette) },
    { id: "flash", name: "Flash", mode: 2, dur: TRANS_DUR.fast,
      tip: "Blows out to white on the change. Short and percussive.",
      fits: (a, b) => 0.8 + 1.6 * palDist(a.palette, b.palette) },
    // The structure-destroying pair: they wreck the image exactly when it changes,
    // which is what rescues switches a crossfade would ghost through.
    { id: "pixelate", name: "Pixelate through", mode: 3, dur: TRANS_DUR.slow,
      tip: "Both scenes break down into blocks and reassemble. Destroys the structure exactly when it changes.",
      fits: (a, b) => a.dense !== b.dense ? 3 : 1.2 },
    { id: "blur", name: "Blur through", mode: 4, dur: TRANS_DUR.slow,
      tip: "Defocuses through the swap and pulls back into focus.",
      fits: (a, b) => a.dense !== b.dense ? 2 : 1.2 },
    { id: "wipe", name: "Wipe", mode: 5, dur: TRANS_DUR.mid,
      tip: "A soft-edged edge travelling left to right.",
      fits: (a, b) => a.dense !== b.dense ? 2 : 1 },
    { id: "iris", name: "Iris", mode: 6, dur: TRANS_DUR.mid,
      tip: "A circle opening from the centre.",
      fits: (a, b) => a.dense !== b.dense ? 1.6 : 0.9 },
    // ---- the staggered-reveal family -------------------------------------------------
    // One idea, seven delay fields: every part of the frame gets its own moment to change.
    // They suit a switch between two scenes that would otherwise ghost through each other,
    // because the edge between old and new is a hard one wherever it happens to be — so
    // they lean the same way as wipe/iris in `fits` rather than competing with crossfade.
    { id: "checker", name: "Checkerboard", mode: 7, dur: TRANS_DUR.mid,
      tip: "Tiles flip in a checkerboard, staggered so the change ripples across the grid.",
      fits: (a, b) => a.dense !== b.dense ? 1.8 : 1.1 },
    { id: "bars", name: "Bars", mode: 8, dur: TRANS_DUR.mid,
      tip: "Vertical bars, alternate ones rising and falling.",
      fits: (a, b) => a.dense !== b.dense ? 1.6 : 1 },
    { id: "shutter", name: "Shutter", mode: 9, dur: TRANS_DUR.mid,
      tip: "Horizontal slats opening from their centres, like a venetian blind.",
      fits: (a, b) => a.dense !== b.dense ? 1.6 : 1 },
    // A push needs something to push: against a sparse point cloud there is little to read
    // as movement, so it earns its weight when both sides fill the frame.
    { id: "slide", name: "Slide", mode: 10, dur: TRANS_DUR.mid,
      tip: "The new scene pushes the old one out sideways.",
      fits: (a, b) => (a.dense && b.dense) ? 2 : 0.6 },
    { id: "clock", name: "Clock wipe", mode: 11, dur: TRANS_DUR.mid,
      tip: "A hand sweeps round from twelve, revealing as it goes.",
      fits: (a, b) => a.dense !== b.dense ? 1.4 : 1 },
    // Dissolve is the gentlest of the family and the one that suits a palette jump, since
    // the two ramps interleave pixel by pixel instead of meeting along an edge.
    { id: "dissolve", name: "Dissolve", mode: 12, dur: TRANS_DUR.slow,
      tip: "Grain-by-grain, in a random order. The gentlest of the family, and good for a palette jump.",
      fits: (a, b) => 1 + 1.4 * palDist(a.palette, b.palette) },
    { id: "ripple", name: "Ripple", mode: 13, dur: TRANS_DUR.slow,
      tip: "A ring expands from the centre, carrying the change and bending the image as it passes.",
      fits: (a, b) => (a.dense && b.dense) ? 1.8 : 0.7 },
  ];
  const TRANS_BY_ID = {};
  TRANSITIONS.forEach(t => TRANS_BY_ID[t.id] = t);
  // ---- which transitions the auto-pick may use --------------------------------------
  // Same shape as `palUse`: `null` means all of them, which is the shipped state and what
  // every blob saved before this decodes to. Stored by stable id (not index, unlike the
  // palettes) because the registry is a fixed list of named modes, so an id survives
  // reordering it. Global, like auto-cycle and Preset TTL — a shared scene does not carry it.
  let transUse = null;
  const transInUse = id => !transUse || transUse.has(id);
  // "cut" IS NOT A CHOICE — it is the floor under the choices. It is not listed in the picker,
  // it is never auto-picked while anything else is ticked, and ticking anything drops it from
  // the set. It survives only as the one-member set `{"cut"}`, which is how "none of these,
  // thanks" is stored (and what "Select none" writes): pickTransition finds an empty pool and
  // falls back to it. So every count and every list here runs over TRANS_PICKABLE, not
  // TRANSITIONS — comparing a full set against TRANSITIONS.length would never collapse to null.
  const TRANS_PICKABLE = TRANSITIONS.filter(t => t.id !== "cut");
  function transUseOk(v) {
    if (!Array.isArray(v)) return null;
    const s = new Set();
    for (const id of v) if (typeof id === "string" && TRANS_BY_ID[id]) s.add(id);
    return s.size ? s : null;                // empty ⇒ "all", never "none"
  }
  // The picker. Floating, translucent, non-modal like the palette and filter ones, and hidden
  // on m/Esc with them. Function declarations, because ui-diagnostics.js wires those keys.
  function openTransPick() { buildTransPick(); el("transpickdlg").classList.remove("hidden"); }
  function closeTransPick() { const d = el("transpickdlg"); if (d) d.classList.add("hidden"); }
  function transPickOpen() { const d = el("transpickdlg"); return !!d && !d.classList.contains("hidden"); }
  function buildTransPick() {
    const host = el("transpick-list");
    if (!host) return;
    host.textContent = "";
    TRANS_PICKABLE.forEach(t => {
      const lab = document.createElement("label");
      lab.className = "flt-opt";
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = transInUse(t.id);
      cb.addEventListener("change", () => setTransUse(t.id, cb.checked));
      const nm = document.createElement("span");
      nm.className = "flt-opt-n"; nm.textContent = t.name;
      const d = document.createElement("span");
      d.className = "flt-opt-d"; d.textContent = t.tip;
      lab.appendChild(cb); lab.appendChild(nm); lab.appendChild(d);
      host.appendChild(lab);
    });
  }
  // `transUse` is null while everything is in use, so the first untick has to materialise the
  // full set before removing from it — and a set that ends up full or empty collapses back to
  // null, which is also how it is stored.
  function setTransUse(id, on) {
    if (!transUse) transUse = new Set(TRANS_PICKABLE.map(t => t.id));
    if (on) transUse.add(id); else transUse.delete(id);
    transUse.delete("cut");                  // ticking anything at all retires the fallback
    if (!transUse.size) transUse = new Set(["cut"]);         // emptied ⇒ cut-only, not "all"
    else if (transUse.size === TRANS_PICKABLE.length) transUse = null;
    buildTransPick();
    persist();
  }
  function setTransUseAll(on) {
    transUse = on ? null : new Set(["cut"]);   // "none" still leaves the hard cut available
    buildTransPick();
    persist();
  }
  if (el("transpick-open")) el("transpick-open").addEventListener("click", openTransPick);
  if (el("transpick-close")) el("transpick-close").addEventListener("click", closeTransPick);
  if (el("transpick-all")) el("transpick-all").addEventListener("click", () => setTransUseAll(true));
  if (el("transpick-none")) el("transpick-none").addEventListener("click", () => setTransUseAll(false));
  // 0 = same palette, 1 = maximally different. Cheap: the ramps are already in memory.
  function palDist(i, j) {
    if (i === j) return 0;
    const A = PALETTES[i], B = PALETTES[j];
    if (!A || !B) return 0.5;
    let d = 0;
    for (let k = 32; k < 256; k += 32) {
      const a = A.fn(k), b = B.fn(k);
      d += (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 765;
    }
    return Math.min(1, d / 7);
  }
  // A scene summary for fits(): dense = fills the frame (shader effects) vs a sparse
  // point cloud; retains = has a feedback filter, so its buffer survives frame to frame.
  // `fxList` (optional) describes a whole stack: the scene is dense if ANY live item
  // fills the frame, since that is what a crossfade would be blending against. Omitted
  // ⇒ the single effect `e`, which is what a pre-stack preset carries.
  function sceneInfo(e, filters, palette, fxList) {
    const fx = EFFECTS[e];
    const f = filtersOk(filters) || new Set(presetFilters(e));
    return {
      dense: fxList && fxList.length ? fxList.some(i => !!(EFFECTS[i] && EFFECTS[i].draw)) : !!fx.draw,
      retains: FILTERS.some(x => x.stage === "feedback" && f.has(x.id)),
      palette: +palette || 0,
    };
  }
  // Weighted pick among the transitions that fit this pair at all AND are ticked in the
  // picker. Unticking everything falls back to Cut rather than to the whole list: "none of
  // these, thanks" is a real choice, and a hard cut is the honest way to honour it.
  function pickTransition(a, b) {
    // TRANS_PICKABLE, not TRANSITIONS: "cut" is the fallback, never a candidate. With everything
    // in use (transUse null) the old pool included it, and its fits() weight of 3 when either
    // side retains meant a retaining scene mostly cut — which is the behaviour this removes.
    const pool = TRANS_PICKABLE.filter(t => transInUse(t.id));
    if (!pool.length) return TRANS_BY_ID.cut;
    const w = pool.map(t => Math.max(0, t.fits(a, b)));
    const total = w.reduce((x, y) => x + y, 0);
    if (total <= 0) return pool[0];
    let r = Math.random() * total;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
    return pool[0];
  }
  // THE SCENE SWITCH IS A CROSSFADE (by request, 1.95.2): both scenes render, live, and the mix
  // slides from all of the old one to all of the new. The weighted menu above (flash, pixelate,
  // checker…) read as glitches on an auto-cycle, and its picker is switched off for good, so
  // nothing reaches pickTransition from here; it and every `fits` stay for the registry. A
  // remembered "none of these" (the cut-only set) is still honoured.
  function scenePick(a, b) {
    return transUse && transUse.size === 1 && transUse.has("cut") ? TRANS_BY_ID.cut : TRANS_BY_ID.crossfade;
  }
  // Live transition state. `t` counts 0→1 in RENDERED time, like the credits, so a
  // backgrounded tab doesn't burn through it unseen.
  const trans = { on: false, t: 0, dur: 0, mode: -1, burn: false, id: "cut" };
  function transActive() { return trans.on && trans.mode >= 0; }
  // Borrowed retention: hasFeedback() consults this, so a burn-off transition makes
  // even a no-filter scene decay its predecessor instead of wiping it.
  function transBurning() { return trans.on && trans.burn; }
  function transLen() {                      // [min,max] seconds from the slider; 0 = off
    const a = Math.min(+el("tdur-lo").value, +el("tdur-hi").value);
    const b = Math.max(+el("tdur-lo").value, +el("tdur-hi").value);
    return { a: a, b: b };
  }
  // Freeze the outgoing frame and start a transition into scene `to`.
  function transBegin(to) {
    const len = transLen();
    if (len.b <= 0) return;                  // slider pinned at 0 ⇒ transitions off
    // The outgoing side is the live stack, not just the selected item.
    const from = sceneInfo(effect, extras[effect] && extras[effect].filters, +paletteSel.value,
      stack.filter(L => !L.mute).map(L => L.fx));
    const pick = scenePick(from, to);
    const scale = (len.a + Math.random() * (len.b - len.a)) / TRANS_DUR.slow;
    trans.on = true; trans.t = 0; trans.id = pick.id;
    trans.mode = pick.mode; trans.burn = !!pick.burn;
    trans.dur = Math.max(0.05, pick.dur * scale);
    if (pick.mode < 0) return;               // cut / burn-off need no outgoing copy
    // KEEP THE OUTGOING STACK ALIVE. `stack` is about to be replaced wholesale by
    // installStack with a brand-new array of new item objects, so simply holding this
    // reference leaves the old scene intact and unowned — and a frozen stack item already
    // carries everything needed to render it. Freezing the SELECTED one first is what makes
    // that true of all of them: the selected item's store is the DOM, and without this its
    // record would be null and the layer you were editing would drop out of the blend.
    if (useGL && glReady) {
      if (stack[stackSel]) freezeItem(stack[stackSel]);
      prevStack = stack;
    }
    // The one-off snapshot STAYS, even though renderPrevScene rewrites glTex.prev before the
    // first composite. It is the fallback for the case renderPrevScene returns early on:
    // an outgoing scene with every layer muted has nothing to render, and without this the
    // blend would run against whatever glTex.prev last held. Verified the other way round
    // too — delete this copy and the outgoing half still draws, which is what proves the
    // live path is doing the work rather than this.
    if (useGL && glReady) {                  // snapshot glTex.scene → glTex.prev
      // Through bindFbo/bindDefault, not raw gl.bindFramebuffer: those two are what track
      // curFbo/curW/curH, and glBloomPass restores the caller's target FROM curFbo. Binding
      // behind their backs leaves that tracking stale. It happened to be safe here (glRender
      // always exits with curFbo null and this runs before the frame's first bind), but "happens
      // to be safe" is the state this pair exists to eliminate.
      bindFbo(glFbo.scene, fw, fh);
      gl.bindTexture(gl.TEXTURE_2D, glTex.prev);
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, fw, fh);
      bindDefault(canvas.width, canvas.height);
    } else if (off && off.width) {
      if (!transOff) transOff = document.createElement("canvas");
      if (transOff.width !== off.width || transOff.height !== off.height) {
        transOff.width = off.width; transOff.height = off.height;
      }
      transOff.getContext("2d").drawImage(off, 0, 0);
    }
  }
  let transOff = null, transTmp = null;      // CPU path's frozen copy + downsample scratch
  // At most TRANS_MAX_STEP seconds of blend per frame. The scene switch is a synchronous task
  // that runs INSIDE the frame that begins the blend (cyclePresets precedes transStep), so the
  // next frame arrives carrying the whole switch as its dt — clamped to 0.25 s, which against
  // a 0.45-0.9 s blend skipped a third to a half of it in one frame. Capped, a hitch (that one,
  // or the incoming scene's first draws) pauses the blend instead of jumping it. 1/20 s leaves
  // every frame rate from 20 fps up exactly as it was.
  const TRANS_MAX_STEP = 1 / 20;
  function transStep(dt) {
    if (!trans.on) return;
    trans.t += Math.min(dt, TRANS_MAX_STEP) / trans.dur;
    if (trans.t >= 1) {
      trans.on = false; trans.t = 0; trans.mode = -1; trans.burn = false;
      prevStack = null;                      // stop rendering the scene that has gone
    }
  }
  function presetState(e) {           // a fresh copy of effect e's default slider values
    const st = {}, d = EFFECTS[e].defaults;
    // Filter params first, so an effect that names one (e.g. its own Flame rise)
    // still wins. This is why adding a filter needs no edit to the 19 descriptors.
    for (const id in FILTER_DEFAULTS) st[id] = FILTER_DEFAULTS[id].slice();
    // Camera X/Y/Z rotation is per-layer state now (was the scene-wide `cam`), so seed it into
    // every effect exactly like a filter default — an effect that named it would still win below.
    st.camrx = [0, 0]; st.camry = [0, 0]; st.camrz = [0, 0];
    st.fov = [0, 0];         // neutral, so every scene saved before FOV existed renders identically
    st.heatboost = [0, 0];   // per-layer palette control, seeded like the camera so no effect descriptor needs it
    // World placement (Place X/Y/Z + World scale) — params-but-not-defaults on the five
    // world effects, so until seeded here the values were silently DROPPED by saveState/
    // mergeState and never persisted at all. Seeded at the CONTROLS shipped lo/hi, so a
    // scene saved before this renders identically.
    st.wldx = [0, 0]; st.wldy = [1.6, 1.6]; st.wldz = [6, 6]; st.wldscale = [1.2, 1.2];
    for (const id in d) { const v = d[id]; st[id] = Array.isArray(v) ? v.slice() : v; }
    return st;
  }
  // EVERY SLIDER AN EFFECT SHOWS MUST RESOLVE IN presetState(e), or it is silently dropped:
  // saveState/mergeState only ever walk the keys presetState seeds, so a params-but-not-
  // defaults slider never persists AND never installs per layer — it silently keeps whichever
  // layer was selected last. That has shipped twice (camrx/camry/camrz, then wldx/wldy/wldz/
  // wldscale), both times invisible until someone noticed a value not surviving a reload.
  //
  // This is assertRegistry's check by rights, but it cannot live there: effects-registry.js
  // loads two slices ABOVE filters.js, so calling presetState at that point reads
  // FILTER_DEFAULTS in its TDZ and kills startup. It lives here, directly under the function
  // it validates, which is also the file that has to change when a new key is seeded.
  //
  // `check` controls are exempt BY DESIGN: showbox, randseed and world are extras
  // (L.showBox / L.world / extras.randSeed), not state, so they are correctly absent.
  (function assertPresetStateCovers() {
    EFFECTS.forEach((f, i) => {
      const st = presetState(i);
      (f.params || []).forEach(k => {
        const c = CONTROLS.find(x => x.key === k);
        if (!c || c.type === "check") return;
        if (st[k] === undefined)
          console.warn(f.id + ": params has '" + k + "' but presetState does not seed it — it will not persist or install per layer");
      });
    });
  })();
  // Camera zoom + X/Y/Z rotation are PER-LAYER state (see isSceneCtl / presetState) — each
  // stacked effect carries its own angles in its state map, installed into camRX/RY/RZ by
  // installStackItem before it draws. There is no camera tween — the camera snaps per layer
  // like every other effect param. On the wire the four keys are grouped into a per-layer `cam`
  // node (splitLayerCam/joinLayerCam below); there is no camera object at the preset root.
  const CAM_KEYS = ["zoom", "camrx", "camry", "camrz", "fov"];
  // A layer's camera (zoom + X/Y/Z rotation) is per-layer STATE — the four keys live in the
  // layer's `state` map with every other slider. On the WIRE they are grouped into a `cam`
  // sub-object per layer instead (layers[i].cam), so the serialized shape reads cleanly and the
  // camera isn't a redundant object at the preset root. splitLayerCam pulls them out of a state
  // map for serialization; joinLayerCam folds a stored `cam` back in before mergeState on load.
  // A scene saved before this grouping carried the keys inline in state and no `cam` node — that
  // still loads: joinLayerCam leaves the inline keys untouched when `cam` is absent.
  function splitLayerCam(st) {
    const state = {}, cam = {};
    for (const k in st) (CAM_KEYS.includes(k) ? cam : state)[k] = st[k];
    return { state, cam };
  }
  function joinLayerCam(state, cam) {
    const out = Object.assign({}, state);
    if (cam && typeof cam === "object") for (const k of CAM_KEYS) if (Array.isArray(cam[k])) out[k] = cam[k];
    return out;
  }
  // Every filter is per-layer now, so a scene that stored WHOLE-SCENE filters (Bloom + the
  // four screen ones, in `sceneFx`) has to have them folded onto its layers or it would open
  // with its glow, vignette and scanlines silently gone. Runs from both load paths, beside
  // migrateCam, and for the same reason: fix the shape once, before anything merges it.
  //
  // The ids are APPENDED to each layer's chain, not prepended — they used to run last, on the
  // finished picture, so last in the chain is the position that matches. The values overwrite
  // whatever the per-effect state carries, because sceneFx was the authoritative copy while
  // they were global (saveState/loadState skipped those keys on purpose).
  //
  // `sceneFx` is deleted afterwards so the migration is idempotent and the field stops
  // travelling; readSceneFx now returns an empty pair, so nothing rewrites it.
  function migrateSceneFx(p) {
    const sf = p && p.sceneFx;
    if (!sf || typeof sf !== "object") return;
    const on = (Array.isArray(sf.on) ? sf.on : []).filter(id => FILTER_BY_ID[id]);
    const vals = (sf.vals && typeof sf.vals === "object") ? sf.vals : {};
    const fold = (state, holder) => {
      if (state) for (const k in vals) if (Array.isArray(vals[k])) state[k] = vals[k].slice();
      if (holder) {
        const cur = Array.isArray(holder.filters) ? holder.filters.slice() : [];
        for (const id of on) if (cur.indexOf(id) < 0) cur.push(id);
        holder.filters = cur;
      }
    };
    fold(p.state, p.extra);                            // the single/selected effect
    if (p.states) for (const k in p.states) fold(p.states[k], p.extras && p.extras[k]);
    (Array.isArray(p.layers) ? p.layers : []).forEach(L => { if (L) fold(L.state, L); });
    delete p.sceneFx;
  }
  function migrateCam(p) {
    // A scene saved before the camera was per-layer stored one scene-wide `cam`. Fold its
    // camrx/camry/camrz onto every effect's / layer's state that doesn't already carry them, so
    // an old scene loads with all layers sharing that camera and looks exactly as it did. A
    // new scene's states already include the keys (presetState seeds them), so inject() skips.
    if (!p || !p.cam || typeof p.cam !== "object") return;
    const inject = st => { if (st) for (const k of ["camrx", "camry", "camrz"]) if (st[k] === undefined && Array.isArray(p.cam[k])) st[k] = p.cam[k].slice(); };
    if (p.states) for (const k in p.states) inject(p.states[k]);
    inject(p.state);
    if (Array.isArray(p.layers)) for (const L of p.layers) if (L) inject(L.state);
  }
  // THE ONE MIGRATION FUNNEL. Every legacy-shape fix runs here, in order, and BOTH load paths
  // (applyBlob for a whole blob, applyPreset for one scene) call this instead of picking
  // migrations individually — that split is how a future migration gets added to one path and
  // silently skipped by the other. A new `migrate*` function goes on this list, nowhere else;
  // presetprobe asserts every function named migrate* in the source is called from this body.
  // Each migration sniffs its own old shape and is idempotent, so the funnel needs no version
  // number and is safe to run on any blob of any age.
  function migrateBlob(p) {
    migrateSceneFx(p);   // whole-scene filters (retired `sceneFx`) → folded onto layers/effects
    migrateCam(p);       // scene-wide camera → folded into every layer/effect state
    return p;
  }
  // Scene filters (Bloom + the screen-stage FX) are scene-global — read/write their on/off
  // and dual-slider values as one blob (readSceneFx/writeSceneFx/sceneFxOk).
  function readSceneFx() {
    const vals = {};
    for (const k of SCENE_FILTER_KEYS) { const lo = el(k + "-lo"); if (lo) vals[k] = [+lo.value, +el(k + "-hi").value]; }
    return { on: [...sceneOn], vals };
  }
  function sceneFxOk(sf) {           // validate a stored sceneFx against the live filter ids + bounds
    if (!sf || typeof sf !== "object") return null;
    const on = Array.isArray(sf.on) ? sf.on.filter(id => SCENE_FILTER_IDS.has(id)) : null;
    const vals = {};
    const raw = sf.vals && typeof sf.vals === "object" ? sf.vals : {};
    for (const k of SCENE_FILTER_KEYS) {
      const v = raw[k], lo = el(k + "-lo"); if (!Array.isArray(v) || !lo) continue;
      const mn = +lo.min, mx = +lo.max, a = +v[0], b = +v[1];
      if (isFinite(a) && isFinite(b) && a >= mn && a <= mx && b >= mn && b <= mx) vals[k] = [a, b];
    }
    return (on || Object.keys(vals).length) ? { on, vals } : null;
  }
  function writeSceneFx(sf) {
    if (!sf) return;
    if (Array.isArray(sf.on)) sceneOn = new Set(sf.on.filter(id => SCENE_FILTER_IDS.has(id)));
    for (const k of SCENE_FILTER_KEYS) {
      const v = sf.vals && sf.vals[k]; if (!Array.isArray(v)) continue;
      el(k + "-lo").value = v[0]; el(k + "-hi").value = v[1];
      el(k + "-lo").dispatchEvent(new Event("input"));
      el(k + "-hi").dispatchEvent(new Event("input"));
    }
    syncFilterUI();                  // the scene-filter checkboxes follow sceneOn
    bloomRaw = +el("bloom-lo").value; bloomAmt = filterOn("bloom") ? bloomRaw : 0;
  }
  function initStates() { EFFECTS.forEach((_, k) => states[k] = presetState(k)); }
  initStates();
  function saveState(e) {
    const st = states[e];
    for (const id in st) {
      // NO SKIP HERE, deliberately -- saveState is a WRITE of the live DOM into states[e],
      // and the seven shared keys must keep flowing that way or a single-layer scene (whose
      // state rides top-level, not in a `layers` array) would stop persisting its glow and
      // scanlines entirely. The asymmetry is the point: loadState below SKIPS them, because
      // reading them back per effect is what let selecting a layer retune the whole scene.
      st[id] = Array.isArray(st[id])
        ? [+ctl(id + "-lo").value, +ctl(id + "-hi").value]
        : +ctl(id).value;
    }
  }
  function loadState(e) {
    suppressPersist = true;           // the per-slider input events below would
    const st = states[e];             // otherwise persist a half-loaded state
    for (const id in st) {
      if (SHARED_FILTER_KEYS.has(id)) continue;   // scene-wide: see saveState above
      const v = st[id];
      if (Array.isArray(v)) {
        ctl(id + "-lo").value = v[0]; ctl(id + "-hi").value = v[1];
        ctl(id + "-lo").dispatchEvent(new Event("input"));
        ctl(id + "-hi").dispatchEvent(new Event("input"));
      } else { ctl(id).value = v; ctl(id).dispatchEvent(new Event("input")); }
    }
    suppressPersist = false;
  }

