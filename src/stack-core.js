  // ---- the effect STACK ------------------------------------------------------
  // A scene is an ordered list of effects composited into the one heat buffer, not a
  // single effect. Deliberately NOT called "layers" anywhere in the code: `layers` is
  // already a control key (layerCount / LAYER_MAX — the count of progressively smaller
  // copies of the *fractal*), and it is persisted in every states[e]. "Layer" is the
  // user-facing word in the menu and the README only.
  //
  // An item carries only what belongs to one effect. The palette, the filter chain,
  // the camera, beat tuning and slider ranges are scene-level and live where they
  // always did — see snapshotScene.
  //
  // `state`/`beat`/`pulse`/`plen` are frozen copies, and are NULL while the item is
  // selected: the selected item's live store is the DOM, exactly as it has always
  // been. Exactly one of "selected" / "holds numbers" is true for an item, ever.
  function newStackItem(fx) {
    // `palette`/`filters` are per-LAYER (not per-effect), so two layers of the same
    // effect can look different. null means "not captured yet" — applyLayerExtras fills
    // them from the effect's stored/default extras on first use. They can't be seeded
    // here: this runs at `let stack = […]` before EFFECTS / presetExtra exist (TDZ).
    return { fx, state: null, beat: null, pulse: null, plen: null, btune: null,
      palette: null, paletteRev: null, paletteBg: null, filters: null, ranges: null,
      seedPath: null, seedRide: null, seedPts: null, showBox: null, world: null,
      // Which colour marks this layer's row and boxes. An INDEX into LYR_TINT, never a
      // colour string: the value reaches CSS, and a scene from someone else is untrusted
      // input. null ⇒ "not chosen", which layerTint() resolves from the slot, so a scene
      // saved before this renders and reads exactly as it did.
      tint: null,
      blend: "max", gain: 1, mute: false, anim: {}, phase: Object.assign({}, PHASE_INIT) };
  }
  // An effect may SHIP a blend (descriptor `blend`): Glass ball is "over", because a ball
  // is an object that hides what is behind it and MAX let the layer beneath glow straight
  // through it. Applied on a fresh item and on an effect switch -- but on a switch only
  // while the layer still carries the OUTGOING effect's default, so a blend you chose by
  // hand is never overwritten. Function declaration: called from setEffect, slices away.
  function effectBlend(fx) { return (EFFECTS[fx] && EFFECTS[fx].blend) || "max"; }
  function applyEffectBlend(L, prevFx) {
    if (!L) return;
    if (prevFx === undefined || L.blend === effectBlend(prevFx)) L.blend = effectBlend(L.fx);
  }
  let stack = [newStackItem(0)], stackSel = 0;
  const selItem = () => stack[stackSel];
  // Display zoom is scene-level and applied ONCE, to the composite. An effect that
  // bakes zoom into its own shader has already consumed it, so applying it again would
  // zoom that item twice. "Any", not "all": an unzoomed point item is a smaller lie
  // than a doubly-zoomed fractal. A one-item stack reduces to the original rule exactly.
  // Visible consequence, and intended: adding a shader item to a point scene un-zooms
  // the point item.
  // Display zoom for the composite. EVERY effect in the registry now bakes its own zoom —
  // the shaders divide their coordinates by it, the point effects scale the stamp in
  // plot() — so in practice this always returns 1 and the FS_ZOOM pass is an identity.
  // Kept as-is rather than ripped out: it is the one place that would have to come back if
  // an effect ever zoomed by magnification again, the CPU path reads it too, and at z == 1
  // the pass samples exact texel centres, so it costs a blit and changes nothing.
  // Its old job — one un-baked point layer beside a baking shader layer un-zoomed the point
  // layer — is gone with it: every layer zooms itself now, so a mixed stack is correct.
  const stackZoom = () => stack.some(L => !L.mute && EFFECTS[L.fx].bakesOwnZoom) ? 1 : zoom;
  // ---- the per-layer tint -----------------------------------------------------------
  // The colour that marks a layer's row and every box belonging to it. A layer stores an
  // INDEX (L.tint) or null; null means "auto", resolved from the slot so a fresh scene is
  // colour-coded without anybody choosing anything and a scene saved before this looks the
  // same as it always did.
  //
  // tintOk is the validator at the trust boundary: this value ends up in a CSS custom
  // property, and a layer can arrive from a share link, so nothing but an in-range integer
  // index is ever accepted. A colour STRING is never stored, which is what makes that safe.
  const LYR_TINT = CONFIG.layerTint;
  function tintOk(v) {
    return (typeof v === "number" && v === Math.round(v) && v >= 0 && v < LYR_TINT.length) ? v : null;
  }
  // THE STRONGEST COLOUR IN A PALETTE. Sampled across the whole ramp and scored on saturation
  // first, then on being neither nearly black nor nearly white -- the ends of most ramps are
  // exactly those, and they are useless as a marker. It is a DERIVED colour, never a stored
  // one: the input is a palette index that has already been validated, so nothing a share link
  // carries reaches CSS as a colour, which is the property tintOk exists to protect.
  const PAL_TINT = {};
  const hex2 = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  const rgbHex = c => "#" + hex2(c[0]) + hex2(c[1]) + hex2(c[2]);
  // THE TINT IS TEXT, NOT JUST A STRIPE. A layer box's title is rendered IN this colour on a
  // near-black panel, so a dark one is unreadable -- #650000 against this background is about
  // 1.6:1, which is not text, it is a smudge.
  //
  // Judged on real RELATIVE LUMINANCE, with the sRGB curve decoded. The cheap (max+min)/2
  // "lightness" used elsewhere in this file is fine for ranking candidates and useless here:
  // it calls pure blue and pure yellow equally bright, when one is 0.07 and the other 0.93.
  const srgbLin = u => { u /= 255; return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); };
  const relLum = c => 0.2126 * srgbLin(c[0]) + 0.7152 * srgbLin(c[1]) + 0.0722 * srgbLin(c[2]);
  // 0.16 puts it around 4:1 against the panel, which is legible at the 9px this text is set
  // at without washing every colour out to pastel.
  const TINT_MIN_LUM = 0.16;
  // Bring a colour up to that floor while keeping its hue: first take it to full brightness
  // for that hue (a scale, so saturation is untouched), and only then wash toward white if it
  // is STILL too dark -- which happens for blues and deep violets, whose pure form carries
  // barely a fifteenth of the luminance a yellow does.
  function tintReadable(c) {
    const mx = Math.max(c[0], c[1], c[2]);
    let out = mx > 0 ? [c[0] * 255 / mx, c[1] * 255 / mx, c[2] * 255 / mx] : [255, 255, 255];
    for (let i = 0; i < 32 && relLum(out) < TINT_MIN_LUM; i++)
      out = [out[0] + (255 - out[0]) * 0.1, out[1] + (255 - out[1]) * 0.1, out[2] + (255 - out[2]) * 0.1];
    return out;
  }
  // SEVERAL strong colours from one palette, best first and each visibly different from the
  // ones before it. A list rather than a single colour because two layers can share a palette
  // -- and if they did, one colour would mark them both and the cue would say nothing about
  // which is which, which is the entire point of it.
  function palTintList(pi) {
    const key = pi | 0;
    if (PAL_TINT[key]) return PAL_TINT[key];
    const P = PALETTES[key], cand = [];
    if (P && P.fn) {
      for (let s = 8; s <= 255; s += 3) {
        const c = P.fn(s);
        const r = Math.max(0, Math.min(255, c[0] | 0));
        const g = Math.max(0, Math.min(255, c[1] | 0));
        const b = Math.max(0, Math.min(255, c[2] | 0));
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (!mx) continue;
        const sat = (mx - mn) / mx;                 // 0 grey, 1 pure hue
        const lum = (mx + mn) / 510;                // 0 black, 1 white
        // THE ENDS OF THE RAMP ARE OUT, whatever hue they carry. Most palettes run from near
        // black to near white, and both ends are useless as a marker -- one disappears against
        // the panel and the other against the text. Scoring them down was not enough: a ramp
        // ending in #fff0eb has just enough of a tint to beat a ramp with no colour at all,
        // and it was picked. Rejecting the band outright is what makes such a palette fall
        // through to the fixed set instead, which is the honest answer for it.
        if (lum < 0.12 || lum > 0.9) continue;
        // Mid-bright wins. The saturation term dominates so a vivid mid tone beats a wash.
        // Scored on the SAMPLE, stored BRIGHTENED. Scoring the brightened version would rank
        // every candidate as fully saturated and lose the ordering entirely.
        cand.push({ c: tintReadable([r, g, b]), s: sat * (1 - Math.abs(lum - 0.55) * 1.3) });
      }
    }
    cand.sort((a, b) => b.s - a.s);
    const out = [];
    // Greedy, best first, keeping only what is far enough from everything already taken --
    // otherwise a smooth ramp hands out four samples of the same orange.
    for (const k of cand) {
      if (k.s <= 0.06) break;                       // nothing colourful enough left
      if (out.every(o => Math.abs(o[0] - k.c[0]) + Math.abs(o[1] - k.c[1]) + Math.abs(o[2] - k.c[2]) > 150))
        out.push(k.c);
      if (out.length >= LYR_TINT.length) break;
    }
    // A palette with no colour in it at all (a pure greyscale ramp) has nothing to offer, so
    // fall back to the fixed set rather than marking the layer in grey.
    if (!out.length) return (PAL_TINT[key] = LYR_TINT.slice());
    // A single-hue ramp yields one entry -- and brightening collapses two shades of one hue
    // onto the same colour, which is most palettes -- so wash the base toward WHITE for the
    // rest. Toward white and never toward black: darkening is what the readability floor above
    // exists to undo, and a variant nobody can read is not a second colour, it is a smudge.
    const hexes = out.map(rgbHex);
    for (let i = 1; hexes.length < LYR_TINT.length; i++) {
      // Capped short of white: at a full wash the marker is the same colour as ordinary text
      // and stops being a marker at all. The last step is a pale tint of the hue, not white.
      const base = out[(i - 1) % out.length], m = Math.min(0.72, 0.3 * Math.ceil(i / out.length) + 0.28 * ((i - 1) % out.length));
      hexes.push(rgbHex([base[0] + (255 - base[0]) * m,
                         base[1] + (255 - base[1]) * m,
                         base[2] + (255 - base[2]) * m]));
    }
    return (PAL_TINT[key] = hexes);
  }
  // Which of them this layer gets: its position among the layers sharing that palette, so the
  // first takes the strongest and a second on the same palette takes the next one along.
  function palTintColor(pi, rank) {
    const list = palTintList(pi);
    return list[((rank | 0) % list.length + list.length) % list.length];
  }
  // WHICH of them this layer gets: its SALT, not its position. Position was the first
  // version and it re-broke the rule the tint already had to obey -- deleting a layer shifts
  // every later layer's position, so the survivors were all recoloured, which is exactly the
  // bug the tint was pinned down to avoid in the first place.
  //
  // The salt is already the right shape: a first-free integer, unique among live layers, kept
  // by a layer through a reorder or a deletion, and released for reuse when one goes. It was
  // added so two Glass ball layers would not draw the same balls; separating two layers that
  // share a palette is the same question with a different subject.
  function palTintRank(L) { return typeof L.salt === "number" ? L.salt : 0; }
  // THE PER-LAYER SALT every ensure*() decorrelating two layers of the same effect should use.
  // It replaced `stack.indexOf(L)` at five sites, which was wrong twice over: indexOf returns -1
  // for a DETACHED layer -- and the outgoing half of a preset crossfade is exactly that, since
  // renderPrevScene renders prevStack after installStack has replaced `stack` -- and a slot index
  // also changes under a reorder, so two layers could swap arrangements by being dragged. `salt`
  // belongs to the layer, is unique among the live ones, and returns to the pool when one is
  // deleted. installStackItem already reads it this way for gbSalt; this is the same rule, named.
  function layerSalt(L) { return typeof L.salt === "number" ? L.salt : 0; }
  // Editing a custom palette changes what its strong colour is, so the cache has to go.
  function palTintFlush() { for (const k in PAL_TINT) delete PAL_TINT[k]; }
  function layerTintIdx(L, slot) {
    const t = L ? tintOk(L.tint) : null;
    return t == null ? ((slot | 0) % LYR_TINT.length) : t;
  }
  // THE COLOUR BELONGS TO THE LAYER, NOT TO THE SLOT. A null tint resolves from the slot
  // above, which means an unresolved layer's colour follows its POSITION -- so reordering
  // recoloured every layer it moved past, and deleting one recoloured everything below it.
  // The cue exists to say "this box belongs to that layer", and a cue that changes when you
  // drag a different row is worse than none.
  //
  // The fix is the one installStack already uses for palettes: resolve the fallback ONCE,
  // when the layer joins the stack, and store the concrete index from then on. Everything
  // downstream already reads L.tint first, so reorder and delete need no code at all --
  // they stop mattering.
  //
  // `taken` is the set of indices in use, so a new layer takes a free colour and a colour
  // freed by a deleted layer is available again rather than being burned for the session.
  // Falling back to slot-modulo when every colour is in use keeps this total: LYR_TINT has
  // exactly STACK_MAX entries today, so that only fires if the palette is ever shortened.
  function freeTintIdx(taken, slot) {
    for (let i = 0; i < LYR_TINT.length; i++) if (!taken.has(i)) return i;
    return (slot | 0) % LYR_TINT.length;
  }
  // Every layer in `items` ends up with a concrete tint. Layers that already stored one keep
  // it untouched -- including a duplicate, which is a choice a user can make by hand and not
  // this function's business. A null takes its SLOT's colour when that colour is still free,
  // which is precisely what it rendered as before, so a scene saved without tints opens
  // looking exactly as it always did and is merely stable from then on.
  // The smallest salt no live layer is using. See the note on installStackItem.
  function freeSalt(items, except) {
    const taken = new Set();
    for (const L of items) if (L !== except && typeof L.salt === "number") taken.add(L.salt);
    for (let i = 0; ; i++) if (!taken.has(i)) return i;
  }
  function resolveSalts(items) {
    for (const L of items) if (typeof L.salt !== "number") L.salt = freeSalt(items, L);
  }
  function resolveTints(items) {
    const taken = new Set();
    for (const L of items) { const t = tintOk(L.tint); if (t != null) taken.add(t); }
    items.forEach((L, i) => {
      if (tintOk(L.tint) != null) return;
      const own = (i | 0) % LYR_TINT.length;
      const t = taken.has(own) ? freeTintIdx(taken, i) : own;
      L.tint = t; taken.add(t);
    });
  }
  // An explicit pick wins; otherwise the layer's palette decides. `null` is the normal state
  // -- nothing auto-assigns an index any more, because the palette already gives every layer
  // a colour of its own that travels with it.
  function layerTint(L, slot) {
    const t = L ? tintOk(L.tint) : null;
    if (t != null) return LYR_TINT[t];
    return L ? palTintColor(layerPalIndex(L), palTintRank(L)) : LYR_TINT[(slot | 0) % LYR_TINT.length];
  }
  // The same colour as a bare "r, g, b" triple, so CSS can build translucent shades of it
  // with plain rgba(). `color-mix` would do this in the stylesheet alone, but this costs one
  // extra property and works everywhere, which for a purely cosmetic cue is the better trade.
  const TINT_RGB = {};
  function tintRGB(hex) {
    let v = TINT_RGB[hex];
    if (!v) {
      const n = parseInt(hex.slice(1), 16);
      v = TINT_RGB[hex] = ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255);
    }
    return v;
  }
  // The ONE place a tint reaches the DOM: both custom properties, always together, so a rule
  // can never find one without the other.
  function setTintVars(node, hex) {
    if (!node) return;
    node.style.setProperty("--lyr", hex);
    node.style.setProperty("--lyr-rgb", tintRGB(hex));
  }
  // The four accessors that make the "DOM is the selected item's store" rule work.
  // With a one-item stack they all short-circuit to today's singletons on every call,
  // which is what makes the stack refactor inert rather than merely tested.
  function bandOf(L, id) {
    if (L === stack[stackSel]) { const a = anims[id]; return a ? [+a.lo.value, +a.hi.value] : null; }
    const v = L.state && L.state[id];
    return Array.isArray(v) ? v : null;
  }
  const beatOf = (L, id) => L === stack[stackSel] ? beatReact[id] : (L.beat && L.beat[id]);
  const shapeOf = (L, id) => L === stack[stackSel] ? pulseShape[id] : (L.pulse && L.pulse[id]);
  const tuneOf = (L, id) => L === stack[stackSel] ? beatTune[id] : (L.btune && L.btune[id]);
  const plenOf = (L, id) => L === stack[stackSel] ? pulseLen[id] : (L.plen && L.plen[id]);
  // The selected item's animation phase IS the singleton animPhase record — not a copy
  // seeded from it. Seeding lazily from the DOM instead would diverge on the first
  // frame for any slider whose thumbs moved between wiring and the first tick (restore,
  // loadState), because the original code seeds `val` once at bind time and never again.
  function itemAnim(L, id) {
    if (L === stack[stackSel]) return animPhase[id];
    return L.anim[id] || (L.anim[id] = newPhase(bandOf(L, id) ? bandOf(L, id)[0] : 0));
  }
  const anims = {};
  // Mutable animation phase, split out of the anims entry: `val` is where the erratic
  // drift currently sits, `out` is the value last handed to apply() (they differ while
  // a slider is beat-armed — the pulse must NOT move the drift position, or a slider
  // resumes drifting from wherever the last beat left it). One record per key today;
  // one record per key PER LAYER once effects stack.
  const animPhase = {};
  const newPhase = v => ({ val: v, out: v, from: v, to: v, t0: 0, dur: 1, pulse: 0 });
  const beatReact = {};        // id -> {low,mid,high} : which bands kick this slider (per-effect)
  const chipEls = {};          // id -> {low,mid,high} : the chip <button>s (never persisted)
  const dotEls = {};           // id -> {low,mid,high} : the menu row's beat dots (ditto)
  const refEls = {};           // id -> {wrap,rows,fields} : the per-box refractory rows (ditto)
  const PULSE_DROP = CONFIG.pulse.drop;   // s for a beat pulse to fall from the high thumb back to the low — now only the DEFAULT
  const PLEN_MIN = CONFIG.pulse.min, PLEN_MAX = CONFIG.pulse.max;   // bounds of the per-slider pulse-length slider (s)
  // How far the editable "max" row under Trigger duration may raise the slider — and the
  // ceiling plenOk VALIDATES against (not PLEN_MAX): a stored pulse length above the
  // shipped slider max must still load, or raising the max, setting 5 s and reloading
  // would silently snap the fall back to the default.
  const PLEN_HARD_MAX = 30;

  // Beat-pulse SHAPE (per slider, per effect). On a beat an armed slider snaps to
  // its high thumb and `a.pulse` decays linearly 1→0 over PULSE_DROP; the chosen
  // envelope reshapes that decay into the value actually applied. Each fn maps the
  // linear phase p (1 at the beat, 0 at rest) to an amplitude in [0,1] — so the
  // value stays inside [lo,hi] whatever the shape. `snap` is the identity = the
  // original linear fall, i.e. the default preserves prior behaviour exactly.
  const PULSE_SHAPES = [
    { key: "snap",    name: "Snap",    fn: p => p },                                          // linear (default)
    { key: "pluck",   name: "Pluck",   fn: p => p * p },                                      // fast percussive release
    { key: "sustain", name: "Sustain", fn: p => p * (2 - p) },                                // holds high, then drops
    { key: "ease",    name: "Ease",    fn: p => p * p * (3 - 2 * p) },                         // smooth S-curve fall
    { key: "bounce",  name: "Bounce",  fn: p => Math.abs(Math.cos((1 - p) * Math.PI * 2.5)) * p },  // decaying bounces
    { key: "steps",   name: "Steps",   fn: p => Math.ceil(p * 5) / 5 },                        // retro quantized decay
    // ---- THE SWELLS: the only shapes that do NOT start at the high thumb -----------------
    // Every shape above satisfies f(1) = 1, so the slider is at `hi` the instant the beat
    // lands and everything after it is a release. These two give up that convention: they
    // are 0 at the beat, rise to the high thumb partway through, and fall back. That is the
    // "swell another" half of what the per-slider Duration was added for.
    //
    // f(0) = 0 STILL HOLDS, and it is the half that is load-bearing: the pulse sits at 0
    // once it has run out, so a shape that is non-zero there would pin the slider at `hi`
    // for good. That is why the naive inversion (1 - p) is not what a swell is.
    { key: "swell",   name: "Swell",   fn: p => Math.sin((1 - p) * Math.PI) },                 // symmetric rise and fall, peaks halfway
    // Peaks LATE (three quarters through): u^3(1-u) maxes at u = 3/4 and the 256/27 puts
    // that peak exactly on 1, so the high thumb still means the high thumb.
    { key: "bloom",   name: "Late swell", fn: p => { const u = 1 - p; return u * u * u * (1 - u) * 256 / 27; } },
    // ---- THE ANTICIPATORY SHAPES: their argument runs the OTHER WAY ----------------------
    // Every shape above is a RELEASE. Its argument is the decaying st.pulse -- 1 the instant
    // the beat lands, falling to 0 -- so the slider is at the high thumb on the hit and
    // everything after is a fall. That is all the onset detector can support, because it only
    // knows a beat AFTER it happened.
    //
    // These are driven by the tempo tracker's phase instead: 0 just after a beat, rising to 1
    // AT the next one. So they rise INTO the beat and peak exactly on it. `f(0) = 0` still
    // holds and still means the same thing -- the slider sits at the low thumb right after a
    // beat -- but `f(1) = 1` now means "peaks on the beat" rather than "starts there".
    //
    // They need a locked tempo. With none (free tempo, speech, silence) stepAnim falls back to
    // reactive Snap, so an armed slider still moves rather than freezing at its low thumb.
    { key: "rise",    name: "\u2197 Rise",    pre: true, fn: q => q },                                  // straight ramp up to the hit
    { key: "swoop",   name: "\u2197 Swoop",   pre: true, fn: q => q * q * q },                          // hangs low, rushes up at the last moment
    { key: "breathe", name: "\u2197 Breathe", pre: true, fn: q => (1 - Math.cos(Math.PI * q)) / 2 },    // smooth inhale, peaks on the beat
  ];
  // Which keys are anticipatory. Read by stepAnim and by the plot, so the two cannot disagree.
  const PULSE_PRE = {}; PULSE_SHAPES.forEach(s => { if (s.pre) PULSE_PRE[s.key] = true; });
  const PULSE_FN = {}; PULSE_SHAPES.forEach(s => PULSE_FN[s.key] = s.fn);
  const PULSE_DEFAULT = "snap";
  const pulseShape = {};       // id -> shape key : live per-effect selection (drives updateAnims)
  const pulseEls = {};         // id -> <select> : the shape pickers (never persisted)
  // Beat-pulse LENGTH (per slider, per effect): how long that decay takes. It used
  // to be the hardcoded PULSE_DROP for every slider; each slider now owns its own,
  // set by a small range in its pop-out box, so a kick can flick one param and
  // swell another. PULSE_DROP stays the default, so untouched scenes are unchanged.
  const pulseLen = {};         // id -> seconds : live per-effect value (drives updateAnims)
  const plenEls = {};          // id -> {inp,out} : the length slider + readout (never persisted)
  // Beat DETECTOR TUNING, per slider (per effect, per layer) — the same shape as pulseLen
  // above and stored the same way. Each field is OPTIONAL and absent means "inherit the
  // scene-wide beatCfg": a slider that has never been tuned behaves exactly as it did before
  // this map existed, which is the property beatprobe pins.
  //
  // It exists because the Refractory rows in a slider's box used to write straight into
  // beatCfg.refract[band] — the SCENE-WIDE value — so a control presented as belonging to one
  // slider silently retuned every armed slider in the scene.
  //
  // `bands` is deliberately NOT here: the L/M/H Hz edges say what "low" MEANS for the meter,
  // the chip colours and the trace, and per-slider ranges would need their own FFT band pass.
  const beatTune = {};         // id -> {fluxK?:[l,m,h], floor?:n, refract?:[l,m,h]} : live per-effect
  const tuneEls = {};          // id -> the row nodes in the pop-out box (never persisted)
  // The effective tuning for one trigger: this slider's overrides laid over the scene-wide
  // beatCfg. The ONE place inheritance is resolved — the detector, the UI's "(global)" tag
  // and the ↺ all go through it, so they cannot disagree about what a slider is actually using.
  function tuneEff(t) {
    const fluxK = beatCfg.fluxK, refract = beatCfg.refract;
    if (!t) return { fluxK, floor: beatCfg.floor, refract, lead: beatCfg.lead, lock: beatCfg.lock };
    return {
      fluxK: Array.isArray(t.fluxK) ? t.fluxK : fluxK,
      floor: typeof t.floor === "number" ? t.floor : beatCfg.floor,
      refract: Array.isArray(t.refract) ? t.refract : refract,
      // The tempo pair inherits by the same rule. Both are neutral in BEAT_DEFAULTS, so an
      // untouched slider resolves to lead 0 / lock false and the predictive path in audioTick
      // is unreachable for it.
      lead: typeof t.lead === "number" ? t.lead : beatCfg.lead,
      lock: typeof t.lock === "boolean" ? t.lock : beatCfg.lock,
    };
  }
  // Three L/M/H toggle chips next to a slider's label, feeding beatReact[id].
  //
  // Built once PER BLOCK, so it hangs its nodes on that block's wiring record `w` rather
  // than writing chipEls/pulseEls/plenEls directly — pointMaps installs whichever block is
  // selected into those singletons. The three LIVE maps it seeds (beatReact, pulseShape,
  // pulseLen) belong to the selected layer and must be seeded exactly ONCE: seeding them
  // per block would have slot 3's build reset whatever slot 0 already held.
  //
  // The handlers still write those singletons directly, and that is correct rather than
  // sloppy: a block can only be reached by touching it, and touching a row selects it first
  // (the capture-phase pointerdown). Each guards on being the LIVE block — the one pointMaps
  // has installed — rather than on `slot === stackSel`, and the difference matters: while
  // there is a single block it serves whichever layer is selected, so a slot test would
  // deaden every chip the moment you selected layer 2. Identity is true in both worlds, and
  // it also stops a synthetic dispatch writing across layers.
  // ---- trigger fold ------------------------------------------------------------
  // The trigger section shows itself the moment a chip is armed, which is right the first
  // time and wrong afterwards: an armed slider you have finished tuning still spends most
  // of the box on Shape, Duration and Tuning. The chevron on the Triggers heading collapses
  // the lot INCLUDING THE CHIPS, armed or not.
  //
  // Keyed by control id, not by slot, because everything else about a trigger's UI already
  // is (chipEls, pulseEls, refEls are singletons re-pointed on selection). Transient — not
  // in fullSnapshot(), like every other fold.
  //
  // The armed state stays visible while folded: the menu row's .ctl-dot is outside this
  // section, so a folded box still says the slider is wired to the beat.
  const trigFolded = new Set();
  // The chips and the chevron live in EVERY block, so they are painted across all of them;
  // the body's visibility also depends on `any`, which only paintTuneRows knows, so that
  // stays where it is and simply ANDs with the fold.
  function trigFoldPaint(id) {
    const folded = trigFolded.has(id);
    for (let s = 0; s < STACK_MAX; s++) {
      const w = W[s] && W[s][id];
      if (!w || !w.trigChev) continue;
      w.trigChev.textContent = folded ? "▸" : "▾";
      w.trigChev.title = folded ? "Show the beat triggers" : "Hide the beat triggers";
      w.trigChev.setAttribute("aria-expanded", folded ? "false" : "true");
      if (w.trigWrap) w.trigWrap.style.display = folded ? "none" : "";
      if (w.trigBody && folded) w.trigBody.style.display = "none";
    }
  }
  function toggleTrigFold(id) {
    trigFolded.has(id) ? trigFolded.delete(id) : trigFolded.add(id);
    trigFoldPaint(id);
    syncTrigTune();          // the body comes back only if something is still armed
  }
  function makeChips(id, label, w) {
    if (!(id in beatReact)) beatReact[id] = { low: false, mid: false, high: false };
    const chips = w.chips = {};
    const wrap = document.createElement("span");
    wrap.className = "bandchips";
    for (const k of ["low", "mid", "high"]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = k[0].toUpperCase();
      btn.title = k + " beat";
      // The accessible name has to be the BAND, not the letter: the visible text is just "L".
      // And aria-pressed, because armed-vs-not is otherwise carried only by fill colour --
      // this was the one toggle family in the app without it, while #mute, the layer mute, the
      // filter bypass eye and the transition ticks all set it.
      btn.setAttribute("aria-label", k + " beat");
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => {
        if (chipEls[id] !== chips) return;      // not the live block
        beatReact[id][k] = !beatReact[id][k];
        btn.classList.toggle("on", beatReact[id][k]);
        btn.setAttribute("aria-pressed", beatReact[id][k] ? "true" : "false");
        syncDots();              // the menu row shows the same armed state
        syncTrigTune();          // ...and this band's tuning rows appear/hide
        // A <button> click fires neither input nor change, so the delegated onEdit
        // never sees it — do its job by hand, autosave included. Without the
        // autosave the chip reached localStorage but not the *selected preset*,
        // so re-selecting that preset silently disarmed it again.
        chipEdited();
      });
      wrap.appendChild(btn);
      chips[k] = btn;
    }
    // Shape picker: how this slider's value animates back down after a beat. Its
    // `change` bubbles to the panel's delegated onEdit, which persists + autosaves,
    // so we only update the live value here (like the palette <select>).
    const psel = document.createElement("select");
    psel.className = "pulsesel";
    psel.title = "Beat pulse shape";
    PULSE_SHAPES.forEach(s => psel.appendChild(new Option(s.name, s.key)));
    psel.value = PULSE_DEFAULT;
    psel.addEventListener("change", () => { if (pulseEls[id] === psel) pulseShape[id] = psel.value; drawPulsePlots(id); });
    w.psel = psel;
    // THE SHAPE, DRAWN: this slider's value against time after one beat. Plotted from the
    // same formula updateAnims applies -- lo + shape(pulse)*(hi-lo), pulse falling 1->0 over
    // the Duration -- so the picture cannot disagree with what the slider will do. A named
    // curve in a dropdown tells you nothing about whether "Bounce" overshoots or "Steps"
    // holds; the plot does. It redraws on shape and duration changes (drawPulsePlots).
    const pplot = document.createElement("canvas");
    pplot.className = "pulse-plot";
    pplot.width = 200; pplot.height = 56;         // backing store; CSS scales it to the box
    pplot.setAttribute("aria-hidden", "true");
    w.pplot = pplot;
    if (!(id in pulseShape)) pulseShape[id] = PULSE_DEFAULT;
    // ---- pop-out box layout: value on top, then the SLIDER, then the beat controls ----
    // The chips used to be tucked into the label's right edge, above the slider. They are
    // their own titled block under it now, because the slider is the thing you are actually
    // tuning and it should sit directly under its own name and readout; the beat wiring is
    // a second subject and reads better labelled than inferred from three lettered buttons.
    //
    // Appended to the .ctl (label.parentNode), which at this point holds only [label,
    // slider] — so appending lands everything after the slider, in the order added. The
    // owner line is prepended and the range editor appended later, so both still bracket
    // this correctly.
    const host = label.parentNode;
    const trigT = document.createElement("div");
    trigT.className = "trig-t"; trigT.textContent = "Triggers";
    trigT.title = "Which beat bands make this slider jump";
    // Fold chevron. It hides the chips too, so an armed slider can be put away completely.
    const trigChev = document.createElement("b");
    trigChev.className = "trig-chev"; trigChev.textContent = "▾";
    trigChev.setAttribute("role", "button");
    trigChev.setAttribute("tabindex", "0");
    trigChev.setAttribute("aria-label", "Collapse beat triggers");
    trigChev.title = "Hide the beat triggers";
    const foldGo = e => { e.preventDefault(); e.stopPropagation(); toggleTrigFold(id); };
    trigChev.addEventListener("click", foldGo);
    // A <b> gets no keyboard activation from role=button alone -- same gap setOff documents.
    trigChev.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") foldGo(e); });
    trigT.appendChild(trigChev);
    w.trigChev = trigChev; w.trigWrap = wrap;
    host.append(trigT, wrap);
    // THIS SLIDER'S OWN detector thresholds — Sensitivity, Floor and Refractory. They used to
    // be one Refractory group writing straight into beatCfg.refract[band], i.e. into the
    // SCENE-WIDE tuning, so a control sitting in one slider's box silently retuned every armed
    // slider in the scene. Each row now writes into beatTune[id] instead.
    //
    // INHERIT UNTIL TOUCHED: a row shows the global value with a "global" tag until you move
    // it, at which point it becomes this slider's own; the ↺ on the heading gives every row in
    // the section back. So an untouched slider behaves exactly as it did before this existed.
    //
    // Rows exist for all three bands but show only while their chip is armed (syncTrigTune);
    // the whole block hides with nothing armed. Built here, APPENDED at the foot of the trigger
    // section (below Duration) — see the append after the max row.
    const refs = w.refs = { wrap: null, fields: {}, rows: {}, vals: {}, tips: {}, floor: null };
    const refWrap = document.createElement("div");
    refWrap.className = "trig-refs";
    refWrap.style.display = "none";
    const refT = document.createElement("div");
    refT.className = "trig-t"; refT.textContent = "Tuning";
    refT.title = "How this slider decides what counts as a beat. Untouched rows follow Global beat tuning.";
    // ↺ — drop every override in this section and go back to inheriting. Same affordance and
    // placement as the Value range editor's reset.
    const refRst = document.createElement("button");
    refRst.type = "button"; refRst.className = "rng-rst trig-rst"; refRst.textContent = "↺";
    refRst.title = "Follow Global beat tuning again — clears this slider's own thresholds";
    // NOT ctlLabel(id): that is a `const` arrow in controls-breakout.js, ten slices below
    // this one, and makeChips runs while the controls are being BUILT — reading it here is a
    // TDZ abort that surfaces as an unrelated "nextSwitch before initialization" at startup.
    // The box's own .ctl-owner line already names the control this belongs to.
    refRst.setAttribute("aria-label", "Follow global beat tuning");
    refRst.addEventListener("click", e => {
      e.preventDefault();
      if (refEls[id] !== refs) return;
      delete beatTune[id];
      trigDirty = true;
      paintTuneRows(id);
      tuneEdited();
    });
    refT.appendChild(refRst);
    refWrap.appendChild(refT);
    // One row builder for all three groups: label, range, readout, and a "global" tag that
    // clears the moment the row carries an override.
    const tuneRow = (cls, name, lo, hi, st, fmt, onSet) => {
      const r = document.createElement("div");
      r.className = "trig-ref " + cls;
      const lb = document.createElement("span");
      lb.className = "rng-lbl"; lb.textContent = name;
      const f = document.createElement("input");
      f.type = "range"; f.min = String(lo); f.max = String(hi); f.step = String(st);
      const val = document.createElement("span");
      val.className = "trig-ref-val";
      // NO "global" TAG ANY MORE. Every untouched row carried the word, so the ordinary
      // state was the loud one and an override -- the thing worth noticing -- was silent.
      // A row following the default is dimmed instead (see .trig-ref.is-default), which
      // says the same thing without spending a line of prose on it. The title still
      // explains it, because dimming alone is not self-describing the first time.
      const DEFAULT_TIP = "Following Global beat tuning — move this to give the slider its own";
      f.addEventListener("input", () => {
        if (refEls[id] !== refs) return;         // not the live block
        onSet(+f.value);
        trigDirty = true;
        paintTuneRows(id);
        tuneEdited();
      });
      r.append(lb, f, val);
      return { row: r, field: f, val, tip: DEFAULT_TIP, fmt };
    };
    const own = () => beatTune[id] || (beatTune[id] = {});
    // Sensitivity — how far above the running median the flux has to jump. Per band.
    const senT = document.createElement("div");
    senT.className = "trig-sub"; senT.textContent = "Sensitivity";
    senT.title = "How much louder than usual a rise must be to count as a beat, per band";
    refWrap.appendChild(senT);
    for (const k of ["low", "mid", "high"]) {
      const b = { low: 0, mid: 1, high: 2 }[k];
      const R = tuneRow("trig-sen", k, 0.5, 6, 0.1, null, v => {
        const t = own(); t.fluxK = (t.fluxK || beatCfg.fluxK).slice(); t.fluxK[b] = v;
      });
      R.fmt = v => v.toFixed(1) + "×";
      R.field.title = k + " band sensitivity"; R.field.setAttribute("aria-label", k + " band sensitivity");
      refs.fields["sen-" + k] = R.field; refs.rows["sen-" + k] = R.row;
      refs.vals["sen-" + k] = R.val; refs.tips["sen-" + k] = R.tip;
      refWrap.appendChild(R.row);
    }
    // Floor — one value, not per band: it gates against the band's own recent peak.
    const flrT = document.createElement("div");
    flrT.className = "trig-sub"; flrT.textContent = "Floor";
    flrT.title = "How strong a beat must be relative to this slider's recent loudest, across all bands";
    refWrap.appendChild(flrT);
    {
      const R = tuneRow("trig-flr", "all", 0, 1, 0.01, null, v => { own().floor = v; });
      R.fmt = v => v.toFixed(2);
      R.field.title = "beat floor"; R.field.setAttribute("aria-label", "beat floor");
      refs.floor = R;
      refs.fields.floor = R.field; refs.rows.floor = R.row;
      refs.vals.floor = R.val; refs.tips.floor = R.tip;
      refWrap.appendChild(R.row);
    }
    // Refractory — the one that started this: minimum gap between this slider's own beats.
    const refSub = document.createElement("div");
    refSub.className = "trig-sub"; refSub.textContent = "Refractory (ms)";
    refSub.title = "Minimum gap between beats on an armed band, for THIS slider only";
    refWrap.appendChild(refSub);
    for (const k of ["low", "mid", "high"]) {
      const b = { low: 0, mid: 1, high: 2 }[k];
      const R = tuneRow("trig-ref-ms", k, 20, 500, 5, null, v => {
        const t = own(); t.refract = (t.refract || beatCfg.refract).slice(); t.refract[b] = v;
      });
      R.fmt = v => v + "ms";
      R.field.title = k + " band refractory (ms)"; R.field.setAttribute("aria-label", k + " band refractory");
      refs.fields[k] = R.field; refs.rows[k] = R.row;
      refs.vals[k] = R.val; refs.tips[k] = R.tip;
      refWrap.appendChild(R.row);
    }
    // Lead — this slider's own anticipation. The rows above tune what COUNTS as a beat;
    // this one moves when the slider reacts to it, which only the tempo tracker can offer.
    // 0 is off and is the shipped default, so the predictive path in audioTick is unreachable
    // for a slider nobody has touched.
    const leadT = document.createElement("div");
    leadT.className = "trig-sub"; leadT.textContent = "Lead (ms early)";
    leadT.title = "Fire this slider BEFORE the beat, so the visual peaks on it rather than behind it. Needs a tempo it can lock onto.";
    refWrap.appendChild(leadT);
    {
      const R = tuneRow("trig-lead", "all", 0, 400, 5, null, v => { own().lead = v; });
      R.fmt = v => v ? v + "ms" : "off";
      R.field.title = "lead (ms early)"; R.field.setAttribute("aria-label", "beat lead in milliseconds");
      refs.fields.lead = R.field; refs.rows.lead = R.row;
      refs.vals.lead = R.val; refs.tips.lead = R.tip;
      refWrap.appendChild(R.row);
    }
    refs.wrap = refWrap;
    // The fall-back CURVE, titled like everything else here rather than left as an
    // unlabelled dropdown floated to the right of the chips. The section titles under
    // "Triggers" drop the word Trigger — the heading already says it.
    const shapeT = document.createElement("div");
    shapeT.className = "trig-t"; shapeT.textContent = "Shape";
    shapeT.title = "The curve this slider follows on its way back down after a trigger";
    // How long that jump takes to fall back, for THIS slider. Title above its own slider
    // rather than inline, to match the control it belongs to.
    if (!(id in pulseLen)) pulseLen[id] = PULSE_DROP;
    const durT = document.createElement("div");
    durT.className = "plen-name"; durT.textContent = "Duration";
    const row = document.createElement("div");
    row.className = "plen";
    const sl = document.createElement("input");
    // No id: it carried "plen-<id>" and nothing ever looked it up (the RNG_ORIG scan excludes
    // these by their .plen wrapper, not by id), so with a copy per block it would only have
    // been a set of duplicate ids waiting to shadow each other.
    sl.type = "range"; sl.min = PLEN_MIN; sl.max = PLEN_MAX; sl.step = 0.01; sl.value = PULSE_DROP;
    sl.title = "How long a trigger takes to fall back";
    sl.setAttribute("aria-label", "Trigger duration");
    const out = document.createElement("span");
    out.className = "plen-val"; out.textContent = plenFmt(PULSE_DROP);
    sl.addEventListener("input", () => { if (plenEls[id] && plenEls[id].inp === sl) pulseLen[id] = +sl.value; out.textContent = plenFmt(+sl.value); drawPulsePlots(id); });
    row.append(sl, out);
    w.plen = { inp: sl, out };
    // An editable MAX below the slider, like the bounds rows on the value slider itself:
    // the shipped 2 s ceiling is short for slow falls (Shockwave rings, long strikes).
    // Edits apply to EVERY block's copy of this key's slider (the pulse length is a
    // per-key singleton, so its reach should be too). Transient like a fold — the stored
    // pulse length persists (plenOk validates against PLEN_HARD_MAX); the slider's
    // reachable max resets to the shipped bound on reload.
    const mrow = document.createElement("div");
    mrow.className = "rng-cell plen-max";
    const mlbl = document.createElement("span");
    // "limit", not "max" — Value range's max row (the slider bound) can be on screen a
    // few rows up, and two visible "max" fields meaning different things confused.
    mlbl.className = "rng-lbl"; mlbl.textContent = "limit";
    mlbl.title = "How far the Duration slider reaches (seconds)";
    const mf = document.createElement("input");
    mf.type = "number"; mf.step = "any"; mf.value = String(PLEN_MAX);
    mf.min = "0.1"; mf.max = String(PLEN_HARD_MAX);
    mf.title = "Trigger duration max (seconds)";
    const mline = document.createElement("span");
    mline.className = "num-line";
    mline.appendChild(mf);
    mrow.append(mlbl, mline);
    w.plenMax = mf;
    mf.addEventListener("input", () => {
      const v = +mf.value;
      if (!isFinite(v) || v < 0.1 || v > PLEN_HARD_MAX) return;
      for (let s2 = 0; s2 < STACK_MAX; s2++) {
        const ww = W[s2] && W[s2][id];
        if (!ww || !ww.plen) continue;
        ww.plen.inp.max = String(v);
        // re-clamp + repaint through the slider's own listener (guarded, so only the
        // live block writes pulseLen)
        ww.plen.inp.dispatchEvent(new Event("input", { bubbles: false }));
        if (ww.plenMax && ww.plenMax !== mf) ww.plenMax.value = mf.value;   // keep the sibling fields in step
      }
    });
    addNumArrows(mf, () => 0.5);
    // ONE folding body for everything a trigger needs: Shape, Duration (+max) and
    // Refractory live together in .trig-body, hidden until any chip is armed and shown
    // as one element when one is (syncTrigTune toggles it via refs.body). Only the
    // Triggers heading and the chips stay out — they are how you arm one.
    const trigBody = document.createElement("div");
    trigBody.className = "trig-body";
    trigBody.style.display = "none";
    trigBody.append(shapeT, psel, pplot, durT, row, mrow, refWrap);
    refs.body = trigBody;
    w.trigBody = trigBody;
    host.append(trigBody);
  }
  const plenFmt = v => (v < 1 ? Math.round(v * 1000) + "ms" : v.toFixed(2) + "s");
  // Draw one slider's pulse plot: value (y) against time after a beat (x). The x axis spans
  // the pulse length plus a little rest on either side, so the hit, the fall and the landing
  // back on the low thumb are all in frame; the y axis is the slider's own [lo, hi] band,
  // so a pinned slider (lo == hi) is honestly drawn as a flat line -- a trigger on it does
  // nothing, and the plot says so.
  function drawPulsePlot(w, shapeKey, lenS) {
    const cv = w && w.pplot; if (!cv) return;
    const c = cv.getContext("2d"), W2 = cv.width, H = cv.height;
    const fn = PULSE_FN[shapeKey] || PULSE_FN[PULSE_DEFAULT];
    const len = lenS > 0 ? lenS : PULSE_DROP;
    // An ANTICIPATORY shape spends its whole cycle approaching the beat, so the beat line goes
    // near the RIGHT of the plot and the curve rises across everything before it. Drawing one
    // with the reactive layout would put the entire shape after the hit and show a fall where
    // the slider actually rises -- and this plot exists precisely because it is drawn from the
    // same formula the animation applies and therefore cannot disagree with it.
    const pre = !!PULSE_PRE[shapeKey];
    const span = len * 1.35, hit = pre ? len * 1.35 * 0.82 : len * 0.12;
    const lo = +w.lo.value, hi = +w.hi.value;
    const rng = Math.abs(hi - lo);
    const padL = 4, padR = 4, padT = 6, padB = 6;
    const X = t => padL + (t / span) * (W2 - padL - padR);
    const Y = f => H - padB - f * (H - padT - padB);           // f in 0..1 = fraction of the band
    c.clearRect(0, 0, W2, H);
    // the band: low thumb at the bottom, high thumb at the top
    c.strokeStyle = "rgba(255, 140, 40, 0.25)"; c.lineWidth = 1;
    c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(padL, Y(0) + 0.5); c.lineTo(W2 - padR, Y(0) + 0.5); c.stroke();
    c.beginPath(); c.moveTo(padL, Y(1) + 0.5); c.lineTo(W2 - padR, Y(1) + 0.5); c.stroke();
    c.setLineDash([]);
    // the beat
    c.strokeStyle = "rgba(255, 220, 176, 0.45)";
    c.beginPath(); c.moveTo(X(hit) + 0.5, padT); c.lineTo(X(hit) + 0.5, H - padB); c.stroke();
    // the curve: rests at lo, snaps to hi on the beat, falls back along the shape
    c.strokeStyle = "#ff9a3c"; c.lineWidth = 2; c.lineJoin = "round";
    c.beginPath();
    for (let i = 0; i <= W2; i++) {
      const t = (i / W2) * span;
      let f = 0;
      if (pre) {
        // Phase rising to 1 at each beat line, then wrapping straight back to 0 -- so the drop
        // lands exactly ON the beat, which is what the slider does.
        f = rng > 1e-9 ? fn((t % hit) / hit) : 0;
      } else if (t >= hit) { const pulse = Math.max(0, 1 - (t - hit) / len); f = rng > 1e-9 ? fn(pulse) : 0; }
      i ? c.lineTo(X(t), Y(f)) : c.moveTo(X(t), Y(f));
    }
    c.stroke();
  }
  // Every block's copy of one key, from that block's own picker and duration slider, so a
  // non-selected layer's box shows ITS setting and not the live one. Called on a shape or
  // duration change, and from syncPulse/syncPlen so a layer switch repaints too.
  function drawPulsePlots(id) {
    for (let s2 = 0; s2 < STACK_MAX; s2++) {
      const ww = W[s2] && W[s2][id];
      if (ww && ww.pplot) drawPulsePlot(ww, ww.psel ? ww.psel.value : pulseShape[id], ww.plen ? +ww.plen.inp.value : pulseLen[id]);
    }
  }
  // Wiring a control splits in two, because several open layers need one set of DOM nodes
  // EACH against one shared definition.
  //
  //   wireRange(slot, …)  per block: the nodes, the fill/readout ui() closure, the two
  //       cross-clamp listeners, the beat block. Registers nothing global, and — load-bearing
  //       — does NOT call apply(). Building slot 1's `bloom` must not write bloomAmt.
  //   registerAnim(…)  once per key, from slot 0: anims[id], animPhase[id] and the single
  //       startup apply().
  //   pointMaps(slot)  on every layer selection: re-points the singleton maps at another
  //       block's nodes. It must never re-create animPhase — that would teleport every
  //       drifting slider on every layer click — and must never call apply(), which would
  //       rewrite the render globals out of turn.
  function wireRange(slot, id, valId, fmt, beat) {
    const lo = ctlIn(slot, id + "-lo") || ctl(id + "-lo");
    const hi = ctlIn(slot, id + "-hi") || ctl(id + "-hi");
    const out = ctlIn(slot, valId) || ctl(valId);
    const fill = lo.closest(".dual").querySelector(".fill");
    // A SINGLE control (see SINGLE_KEYS) is this same dual with its thumbs pinned together:
    // one visible thumb, the hidden one mirrored so the store stays [v,v], and no triggers.
    const single = SINGLE_KEYS.has(id);
    // a11y: each dual slider is two anonymous inputs — name the low/high thumbs. A single
    // control is ONE value, so it gets the plain name; its hi thumb is display:none and so
    // is out of the tab order and the a11y tree already.
    const lbl = lo.closest(".dual").previousElementSibling;
    const nm = (lbl && lbl.childNodes[0] ? lbl.childNodes[0].nodeValue : id).trim();
    lo.setAttribute("aria-label", single ? nm : nm + " (low)");
    if (!single) hi.setAttribute("aria-label", nm + " (high)");
    function ui() {
      // min/max are read live, not closed over: each box's range editor
      // rewrites them at runtime and the fill must follow.
      const mn = +lo.min, mx = +lo.max, span = (mx - mn) || 1;
      const A = Math.min(+lo.value, +hi.value), B = Math.max(+lo.value, +hi.value);
      // A single control's band is always zero-wide, so the ordinary [A,B] fill would be a
      // 0px sliver. Paint min→value instead and it reads as an ordinary slider.
      fill.style.left = single ? "0%" : (A - mn) / span * 100 + "%";
      fill.style.width = (single ? (A - mn) : (B - A)) / span * 100 + "%";
      // READOUT ONLY — never the applied value, which stays a free float (see stepAnim).
      // A slider whose range spans more than 1 gets at most one decimal: three significant
      // digits is right for a 0–1 knob but absurd on a wider one, where it produced readouts
      // like "0.00815×–1.5×" for a bloom that goes to 1.5. Rounding before fmt keeps each
      // control's own units and suffixes intact, and sig3 of an already-1dp number is that
      // same number, so nothing narrower than 1 changes.
      const show = v => fmt(mx - mn > 1 ? Math.round(v * 10) / 10 : v);
      out.textContent = A === B ? show(A) : show(A) + "–" + show(B);
    }
    // Single ⇒ MIRROR (both ways, so no site has to know which thumb moved); otherwise the
    // usual cross-clamp that stops the thumbs crossing over.
    // ...and the pulse plot, whose y axis IS this band: drag the thumbs together and it has
    // to flatten, or it shows a jump the trigger will not make.
    lo.addEventListener("input", () => { if (single) hi.value = lo.value; else if (+lo.value > +hi.value) hi.value = lo.value; ui(); if (w.pplot) drawPulsePlot(w, w.psel.value, +w.plen.inp.value); });
    hi.addEventListener("input", () => { if (single) lo.value = hi.value; else if (+hi.value < +lo.value) lo.value = hi.value; ui(); if (w.pplot) drawPulsePlot(w, w.psel.value, +w.plen.inp.value); });
    const w = { lo, hi, out, ui, name: nm, chips: null, dots: null, psel: null, plen: null, row: null };
    (W[slot] || (W[slot] = {}))[id] = w;
    // THE one place triggers are suppressed for a single control — not a per-entry
    // `beat: false`, which can be forgotten and would describe it as a per-key choice
    // rather than as part of what `single` means.
    if (beat !== false && !single) makeChips(id, lbl, w);
    ui();                                // ...and no apply(): see the note above
    return w;
  }
  // The DEFINITION, created once. The mutable animation PHASE lives in animPhase[id] (see
  // newPhase); they are split because a stack of effects needs one phase record per layer
  // per key while sharing one definition and one apply closure. The DOM refs on it name
  // the SELECTED block and are re-pointed by pointMaps; everything else is immutable.
  // `scene` marks a control belonging to the whole scene rather than to one effect — the
  // palette, banding, the camera, display zoom and the shared filter params. Those animate
  // once per frame no matter how many effects are stacked, and their nodes are singletons
  // outside every block, so pointMaps never touches them. Derived from CONTROLS
  // (host/group), NOT from the FILTERS registry, which does not exist yet when this runs.
  function registerAnim(id, apply, durScale, scene, w) {
    const a = anims[id] = { lo: w.lo, hi: w.hi, apply, name: w.name, durScale: durScale || 1, scene: scene !== false };
    animPhase[id] = newPhase(+w.lo.value);
    a.ui = w.ui;
    apply(animPhase[id].val);
  }
  function bindRange(id, valId, fmt, apply, durScale, beat, scene) {
    registerAnim(id, apply, durScale, scene, wireRange(0, id, valId, fmt, beat));
  }
  // Point the singleton wiring maps at one block's nodes — the whole of what "selecting a
  // layer" means to the control machinery. Nothing is created, moved or applied; a node the
  // user has a pointer down on is untouched, which is what lets a drag that started on a
  // non-selected layer's slider carry straight on once the row selects it.
  //
  // Only keys this block actually holds are re-pointed. A scene control has no entry in any
  // block's W, so `anims.bloom.lo` keeps naming its one true node forever.
  function pointMaps(slot) {
    const w = W[slot];
    if (!w) return;
    for (const id in w) {
      const e = w[id], a = anims[id];
      if (a) { a.lo = e.lo; a.hi = e.hi; a.ui = e.ui; }   // NOT a.apply, and NOT animPhase
      if (e.chips) chipEls[id] = e.chips;
      if (e.dots) dotEls[id] = e.dots;
      if (e.psel) pulseEls[id] = e.psel;
      if (e.plen) plenEls[id] = e.plen;
      if (e.refs) refEls[id] = e.refs;
      if (e.row) rows[id] = e.row;
    }
    syncTrigTune();              // the re-pointed boxes show THEIR armed bands' rows
  }
  // Wire every generated dual slider from the schema (fmt/apply/durScale live in CONTROLS).
  // Wire every generated dual slider in EVERY block, then register the definition once from
  // slot 0. The order matters: registerAnim seeds animPhase from slot 0's thumbs and runs the
  // one startup apply(), so wiring the other blocks first would be harmless but wiring them
  // through bindRange would re-seed the phase three more times.
  CONTROLS.filter(c => c.type === "dual").forEach(c => {
    bindRange(c.key, c.valId, c.fmt, c.apply, c.durScale, c.beat, isSceneCtl(c));   // slot 0 + the definition
    // A scene control exists only in slot 0, so there is nothing to wire in the others.
    if (!isSceneCtl(c)) for (let slot = 1; slot < STACK_MAX; slot++) wireRange(slot, c.key, c.valId, c.fmt, c.beat);
  });
  // Effect TTL is a range in *seconds*, not an animated value: each effect is
  // held for a random time drawn from [lo,hi] before switching. lo=hi=0 ⇒ never
  // switch. No-op apply; its thumbs are read directly by the cycler.
  bindRange("ttl", "vTtl", v => sig3(v) + "s", () => {}, 1, false, true);   // no chips; scene-level
  // Transition length, same shape as TTL: a range in seconds, read per switch by
  // transBegin. Pinch both thumbs to 0 for a hard cut. No chips, no per-effect state.
  bindRange("tdur", "vTdur", v => v <= 0 ? "cut" : sig3(v) + "s", () => {}, 1, false, true);

  // Advance ONE slider's animation by one frame. `a` is the definition (anims[id]),
  // `st` the mutable phase — a separate argument because a stack of effects keeps one
  // phase record per layer against the same definition. The band [mn,mx], the beat
  // arming, the pulse shape and the pulse length are all passed in for the same reason:
  // for the selected layer they come from the DOM and the singleton maps, for any other
  // layer from that layer's stored copy.
  // `doApply` false computes the value without touching the global, so the stack loop
  // can install each layer's values immediately before that layer draws.
  // Snap an animated value onto the slider's step grid, so an animating slider only ever
  // lands on values a manual drag could — a slider [3,11] step 2 sits on 3/5/7/9/11 and
  // never 6 or 5.5. Anchored to the slider's `min` (native HTML range semantics — a drag
  // snaps to min + n·step), then clamped into the live band. Only the OUTPUT is snapped;
  // the drift integrator (st.val) stays continuous so the motion between grid points is
  // smooth and can't get wedged. step "any"/0 ⇒ returned unchanged.
  function snapStep(a, v, mn, mx) {
    const step = a.lo ? +a.lo.step : NaN;
    if (!(step > 0)) return v;
    const base = +a.lo.min;
    const q = base + Math.round((v - base) / step) * step;
    return q < mn ? mn : q > mx ? mx : q;
  }
  // `slot`/`id` name the TRIGGER whose beats this slider follows — its own, with its own
  // thresholds, rather than the one scene-wide beatNow[] every armed slider used to share.
  function stepAnim(a, st, mn, mx, br, shape, plen, now, dt, doApply, slot, id) {
    // Armed: audio reaching the visual and at least one L/M/H chip selected. Armed sliders
    // stop drifting and only move on a beat — snap to the high thumb, drop back to
    // the low thumb over this slider's own pulse length (default PULSE_DROP).
    // audioLive(), not audio.on, so muting drops straight through to the wander below
    // instead of leaving every armed slider parked at its low thumb with no beats coming.
    const armed = audioLive() && br && (br.low || br.mid || br.high);

    if (armed) {
      const beat = (br.low && trigBeat(slot, id, 0)) || (br.mid && trigBeat(slot, id, 1)) || (br.high && trigBeat(slot, id, 2));
      const drop = plen > 0 ? plen : PULSE_DROP;
      if (beat) st.pulse = 1;                                    // immediate, significant
      else st.pulse = st.pulse - dt / drop > 0 ? st.pulse - dt / drop : 0;
      // An anticipatory shape is a function of the phase toward the NEXT beat, not of the
      // decay since the last one -- which is the whole point of the tempo tracker. beatPhaseAt
      // returns -1 when there is no usable grid, and that is deliberately an obviously wrong
      // number rather than a plausible invented beat: it drops us onto reactive Snap below.
      const pre = !!PULSE_PRE[shape];
      // LEAD APPLIES HERE TOO, and it has to. Lead works by firing the trigger early, which
      // sets st.pulse -- and an anticipatory shape does not read st.pulse at all, it reads the
      // tempo phase. So as first shipped, Lead moved all eight RELEASE shapes and did exactly
      // nothing to the three that rise into the beat, which is the opposite of what the
      // control looks like it does. Offsetting the phase instead gives it one meaning
      // everywhere: peak this far BEFORE the beat.
      const lead = pre ? (tuneEff(slot != null ? tuneOf(stack[slot], id) : null).lead || 0) : 0;
      const q = pre ? beatPhaseAt(now + lead) : -1;
      const fn = pre ? (q >= 0 ? PULSE_FN[shape] : PULSE_FN[PULSE_DEFAULT])
                     : (PULSE_FN[shape] || PULSE_FN[PULSE_DEFAULT]);
      // Deliberately writes `out`, not `val`: the drift position must survive the
      // pulse untouched, so unarming resumes the wander where it left off.
      st.out = snapStep(a, mn + fn(q >= 0 ? q : st.pulse) * (mx - mn), mn, mx);   // rest at mn, snap to mx, decay back along the chosen curve
      if (doApply) a.apply(st.out);
      return;
    }

    // otherwise: erratic wander between [mn,mx] (pinned ⇒ constant)
    if (mx - mn < 1e-9) {
      st.val = mn;
    } else {
      let f = (now - st.t0) / st.dur;
      if (f >= 1) {                      // begin a fresh erratic segment
        st.from = st.val;
        st.to = mn + Math.random() * (mx - mn);
        st.t0 = now; st.dur = (350 + Math.random() * 1650) * a.durScale;
        f = 0;
      }
      const s = f * f * (3 - 2 * f);     // smoothstep between targets
      st.val = st.from + (st.to - st.from) * s;
      st.val = st.val < mn ? mn : st.val > mx ? mx : st.val;
    }
    st.out = snapStep(a, st.val, mn, mx);
    if (doApply) a.apply(st.out);
  }
  // The loop is KEY-major, not item-major, and that ordering is load-bearing: every
  // fresh drift segment draws twice from Math.random, so stepping key-by-key keeps a
  // one-item stack drawing in exactly the sequence the un-stacked code did, and the
  // rendered frames stay bit-identical. Item-major would be equally correct and would
  // silently change every scene.
  // Scene keys (palette, banding, camera, zoom, filter params) step once from the DOM
  // and apply immediately — frame() reads cfg.burn, cfg.decay, zoom and bloomAmt
  // between here and the draw. Layer keys are computed only; installStackItem() puts
  // each item's values into the globals just before that item draws.
  // `items` runs the loop over a DETACHED stack instead of the live one — the outgoing
  // scene during a transition, which keeps drifting rather than freezing (renderPrevScene).
  // Called AFTER the live pass, deliberately: each fresh drift segment draws twice from
  // Math.random, so putting the outgoing scene second leaves the live scene's sequence
  // exactly as it was.
  //
  // Two things are skipped for a detached stack. SCENE keys are shared — `burn`, `bloom`
  // and the four screen filters belong to the one finished picture, and the incoming scene
  // owns them. And its sliders are NOT beat-armed: `trigState` is keyed by slot, the
  // outgoing slots are not in `trigList`, so `clearBeats` would never drain their latches
  // and every armed slider would sit pinned at its high thumb for the length of the blend.
  // Passing a null band drops each one straight through to the drift, which is what a
  // sub-second dissolve wants anyway.
  function updateAnims(now, dt, items) {
    const list = items || stack;
    const detached = !!items;
    for (const id in anims) {
      const a = anims[id];
      if (a.scene) {
        if (detached) continue;
        const mn = Math.min(+a.lo.value, +a.hi.value), mx = Math.max(+a.lo.value, +a.hi.value);
        // A scene control belongs to no layer, so its trigger is filed under the SELECTED
        // slot — the same slot its tuning is edited from and stored under.
        stepAnim(a, animPhase[id], mn, mx, beatReact[id], pulseShape[id], pulseLen[id], now, dt, true, stackSel, id);
        continue;
      }
      for (let s = 0; s < list.length; s++) {
        const L = list[s];
        const b = bandOf(L, id);
        if (!b) continue;                 // this item's effect doesn't carry the key
        stepAnim(a, itemAnim(L, id), Math.min(b[0], b[1]), Math.max(b[0], b[1]),
          detached ? null : beatOf(L, id), shapeOf(L, id), plenOf(L, id), now, dt, false, s, id);
      }
    }
  }
  // Push one stack item's animated values into the module-level globals the effects
  // read (plasmaSpeed, cfg.points, juliaOuterR, …). Scene keys are skipped — they were
  // applied in updateAnims and must not be rewritten per item.
  function installStackItem(L) {
    for (const id in anims) {
      const a = anims[id];
      if (a.scene) continue;
      const st = L === stack[stackSel] ? animPhase[id] : L.anim[id];
      if (st) a.apply(st.out);
    }
    // "layers" (the per-effect object / fractal-copy count) is a −/+ stepper, not a ranged
    // slider, so it is NOT in `anims` above and was never installed per item — layerCount kept
    // the SELECTED layer's value. With two point layers that meant the visible layer's object
    // count jumped to whatever layer you selected. Install it per item: the selected item's
    // store is the DOM (#layers), a frozen item's is L.state.layers.
    const lv = (L === stack[stackSel]) ? +ctl("layers").value : (L.state ? L.state.layers : layerCount);
    layerCount = Math.max(1, Math.min(LAYER_MAX, (lv | 0) || 1));
    camMat();       // camera X/Y/Z are per-layer now — refold camM for THIS layer's angles, so
                    // plot()'s point stamping and the CPU mirrors rotate about this layer's camera
                    // (the GL shaders read camRX/RY/RZ live for uCam, so they need nothing here)
    showBox = layerShowBox(L);   // ...and the box belongs to the LAYER, not to whatever is selected
    // THE PER-LAYER SALT, and Glass ball is what needs it. Its ball positions come from the
    // clock and the ball index alone, so two glass layers put ball 1 in exactly the same
    // place as each other and kept it there -- reported as three balls perfectly centred on
    // three others. A per-layer number in the orbit decorrelates them, in both the starting
    // angle and the rate, so they never re-synchronise either.
    //
    // Not derived from stack.indexOf(L): that returns -1 for a DETACHED item, which is
    // exactly what the outgoing scene's layers are during a transition (the trap
    // renderStackColor's `base` parameter exists for). The number lives on the layer.
    gbSalt = typeof L.salt === "number" ? L.salt : 0;
    if (EFFECTS[L.fx].cardioid) installSeedPath(L);
    // Bouncing solids carries a list of rigid bodies, not a scalar clock, so it can't ride
    // PHASE_VARS — it follows the tetrahedron's L.tetras arrangement instead: the bodies
    // live on the layer and this points the globals at THIS layer's set before it draws.
    // Without it two Bouncing solids layers would share one set and render as one.
    if (EFFECTS[L.fx].solids) installSolids(L);
    if (EFFECTS[L.fx].goo) installGoo(L);
    // Boids follow the identical arrangement: the flock is a list on the layer, not a
    // scalar clock, so it can't ride PHASE_VARS either.
    if (EFFECTS[L.fx].boids) installBoids(L);
    // Same rule as boids/solids/tetras: the agents live on the LAYER, so two layers of the
    // same effect do not share one culture and render as a single brighter copy.
    if (EFFECTS[L.fx].physarum) installPhysarum(L);
    if (EFFECTS[L.fx].curl) installCurl(L);
  }
  // Seed-path config is PER-LAYER (L.seedPath/seedRide/seedPts), so two layers of the same
  // effect keep separate orbits. The render loop installs each layer's config into the seed
  // globals before it draws; the epilogue restores the selected layer's, which is what the
  // editor (cardDraw) reads. A layer that hasn't captured its own — a fresh layer, or a scene
  // saved before per-layer seed — falls back to the effect's extras. The spline is cached per
  // layer by the points array's identity, so it recompiles only when those points change (an
  // edit swaps in a NEW array, which is what invalidates it — never mutate seedPts in place).
  const seedSplineCache = new WeakMap();
  // The fallback for a layer that hasn't captured its own seed is the DESCRIPTOR default
  // (presetExtra ⇒ empty freehand / cardioid), NOT the runtime `extras[L.fx]`. extras is the
  // per-effect *last-used* value that `saveExtra` overwrites on every edit, so falling back to
  // it made every not-yet-drawn same-effect layer mirror the last loop drawn — the "all layers
  // share one polygon" bug. A layer with a concrete `L.seedPts` (drawn, or loaded from a scene
  // that stored it) is unaffected either way.
  function layerSeedPts(L) {
    return L.seedPts != null ? L.seedPts : presetExtra(L.fx).seedPts;
  }
  function seedSplineFor(L) {
    const pts = layerSeedPts(L), c = seedSplineCache.get(L);
    if (c && c.pts === pts) return c.sp;
    const sp = buildSeedSpline(pts);
    seedSplineCache.set(L, { pts, sp });
    return sp;
  }
  function installSeedPath(L) {
    const fx = presetExtra(L.fx);
    seedPathMode = seedModeOk(L.seedPath != null ? L.seedPath : fx.seedPath);
    seedRideOn = (L.seedRide != null ? L.seedRide : fx.seedRide) !== false;
    seedPts = layerSeedPts(L);
    seedSpline = seedSplineFor(L);
  }
  // Capture the live seed globals into a layer — its orbit path, remembered per layer.
  function captureSeed(L) {
    L.seedPath = seedPathMode;
    L.seedRide = seedRideOn;
    L.seedPts = seedPts;
  }

  const effectSel = el("effect");
  const sub = el("sub");
  const grpTtl = el("grp-ttl");   // effect-specific groups are shown/hidden via each descriptor's `controls`
  // Preset TTL only matters while auto-cycle is on — gray it out and block input
  // (plus disable the thumbs for keyboard) when the cycle toggle is off.
  function syncTtlEnabled() {
    const on = cycleChk.checked;
    grpTtl.classList.toggle("ctl-off", !on);
    el("ttl-lo").disabled = el("ttl-hi").disabled = !on;
  }
  const paletteSel = el("palette");
