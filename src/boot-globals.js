  const canvas = document.getElementById("fire");

  // Max effects in one stack. Declared up here (far above the stack code that owns it)
  // because initGL() — called during startup, long before the stack block — allocates
  // STACK_MAX per-layer heat/palette buffers; a `const` down by newStackItem would be
  // in the temporal dead zone at that call. Same hoisting reason as `card`/`beatUi`.
  const STACK_MAX = CONFIG.stackMax;

  // ---- per-layer control blocks -----------------------------------------------------
  // Up to STACK_MAX copies of the layer control block, one per stack slot, so more than one
  // layer can be open and editable at a time. Everything that used to look a per-layer
  // control up by id goes through ctl()/ctlIn() instead, because four copies of a slider
  // cannot all carry id="speed-lo" — inside a block the id string lives on `data-k`.
  //
  // `var`, not let/const, and declared here rather than beside the control code: these are
  // read by function declarations, which hoist to the top of the IIFE and are called from
  // slices far above the one that owns them (palCycleBand in palette.js, layerPalIndex in
  // render-gl-pipeline.js). Same class as card / beatUi / curFbo / blendOk — a `const` here
  // throws "Cannot access before initialization" and takes the whole IIFE with it.
  var blocks = [];        // slot -> that stack slot's control block element
  var keyMap = [];        // slot -> { "<the string that used to be the id>": node }
  var W = [];             // slot -> { key: wiring record } — see wireRange
  // The OUTGOING stack while a preset transition runs: the array installStack replaced,
  // every item frozen, so it is a complete renderable scene (see renderPrevScene).
  // `var`, and declared here rather than beside `trans`: it is read by frame-loop.js and
  // render-gl-pipeline.js, both of which load BEFORE transitions.js, and a `let` there
  // would be in the TDZ for them.
  var prevStack = null;
  var secs = [];          // slot -> { filterId: that block's <details> } — see buildFilterUI
  // A HASH of node references, not a subtree query. The POPPABLE pass moves every .ctl out
  // of its block and into #breakout, so blocks[slot].querySelector would stop finding them —
  // whereas a registered reference keeps working wherever the node ends up. Exactly the
  // property `anims` already relies on.
  // Registering also STAMPS the key onto the node. The map is what lookups use, but keeping
  // data-k on the element as well means the DOM says which control it is — CSS can select it,
  // and a probe reading the page sees the same names the code does. Without it, the nodes
  // created in JS (the filter checkboxes, the Add buttons) were findable only through the map.
  function ctlReg(slot, k, node) {
    (keyMap[slot] || (keyMap[slot] = {}))[k] = node;
    if (node && node.dataset && node.dataset.k !== k) node.dataset.k = k;
  }
  function ctlIn(slot, k) { const m = keyMap[slot]; return (m && m[k]) || null; }
  // The SELECTED layer's node — the drop-in for el() at every control site, because
  // `stackSel` is what el() implicitly meant there. It falls through to getElementById, so
  // scene controls (ttl, tdur, burn, bloom, the screen filters) and every non-control id
  // keep resolving untouched.
  //
  // `keyMap.length &&` guards the read of `stackSel`, which is declared in stack-core.js far
  // below: nothing registers a block until after that runs, so until then the && short-
  // circuits and stackSel is never evaluated. Without it, any call during startup TDZs.
  function ctl(k) { return (keyMap.length && ctlIn(stackSel, k)) || document.getElementById(k); }
  // Every slot's node for one key, for the passes that must touch all N.
  function ctlEach(k) {
    const out = [];
    for (let s = 0; s < keyMap.length; s++) { const n = ctlIn(s, k); if (n) out.push(n); }
    return out;
  }

  // Prefer a WebGL2 renderer (the whole fire/Julia/palette/glow pipeline runs on
  // the GPU); fall back to the original Canvas2D path when WebGL2 is missing. A
  // canvas can only ever hold ONE context type, so we try webgl2 first and only
  // ask for "2d" if that fails.
  let gl = null, ctx = null, useGL = false, glReady = false;
  try {
    gl = canvas.getContext("webgl2", {
      antialias: false, depth: false, stencil: false,
      alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false,
    });
  } catch (e) { gl = null; }
  let off = null, offCtx = null;
  if (gl) {
    useGL = true;
  } else {
    ctx = canvas.getContext("2d");
    off = document.createElement("canvas");
    offCtx = off.getContext("2d");
  }

  // ---- GL resource handles (populated by initGL) ----
  const glProg = {};          // compiled/linked programs { p, u:{uniformLocs} }
  const glTex = {};           // textures (heat pair + colour/blur/palette)
  const glFbo = {};           // framebuffers matching the textures
  let quadVao = null, ptVao = null, ptVbo = null, ptVboCap = 0;
  let glSampLin = null;       // LINEAR sampler object for the warp feedback passes
  let curHeat = 0, pendingDst = 0;         // ping-pong index + propagation target
  const palBytes = new Uint8Array(256 * 4);// palette texture upload scratch
  let glPts = new Float32Array(3 * 8192), glPtCount = 0;   // CPU chaos-game stamps
  // How wide, in heat pixels, each stamped point is DRAWN. Per stamping item, reset to 1
  // before every one of them (see stampTick) so a fat-point effect cannot leak into the
  // next item's blit. Only Slime mould asks for anything but 1.
  let glPtSize = 1;
  // ---- automatic cloud save: its schedule ------------------------------------------
  // ITS OWN localStorage KEY, like the credits/tutorial/share-link preferences, and
  // deliberately NOT part of fullSnapshot(): everything in there rides a share link and a
  // backup, and when this browser last saved is nobody else's business.
  //
  // Declared HERE rather than beside the cloud code because persist() -- the change signal
  // -- lives five slices earlier, and a const in the cloud slice would be in the TDZ for
  // any persist() that fires before that slice is evaluated.
  const AUTOSAVE_KEY = "burnTheWeb.autosave.v1";   // FROZEN PREFIX: the old app name. Renaming the key orphans existing data.
  const AUTOSAVE_DELAY_MS = 2 * 60 * 60 * 1000;    // quiet time after the LAST change
  const AUTOSAVE_GAP_MS = 24 * 60 * 60 * 1000;     // at most one automatic save a day
  // A failed attempt is not a save, so it must not burn the daily slot -- but it must not
  // retry every tick either, or a permanently stale document would hammer the network.
  const AUTOSAVE_RETRY_MS = 60 * 60 * 1000;
  const AUTOSAVE_TICK_MS = 60 * 1000;
  // Flying ribbons draws real GEOMETRY -- a triangle list with a depth buffer, so the bands
  // occlude one another instead of one painting over the other. It is the only thing in the
  // app that rasterises anything but a full-screen quad and a point, hence its own VAO and
  // the only depth renderbuffer. Four floats a vertex: x, y in fire-pixel space, depth 0..1,
  // heat 0..255.
  let ribVao = null, ribVbo = null, ribVboCap = 0, ribDepthRb = null, ribDepthW = 0, ribDepthH = 0;
  let glRib = new Float32Array(4 * 6 * 2048), glRibCount = 0;

  const cfg = { ...CONFIG.fire };   // live, mutable copy of the shipped fire defaults (scale = default resolution)

  // Active effect: 0 = Sirpinfyer (2D Sierpiński triangle fire), 1 = Tetrafyer
  // (3D Sierpiński tetrahedron fire), 2 = Julia (animated Julia set). All
  // write heat into the shared `fire` buffer, so palettes, auto-morph and the
  // render/glow pipeline are identical for every mode.
  let effect = 0;
  let showBox = true;        // Tetrafyer: draw the box wireframe (toggle)
  let randSeed = true;       // Julia: re-roll the orbit start on reload / effect entry (toggle)
  let cycleOn = CONFIG.scene.autoCycle;   // auto-cycle saved presets on the TTL timer (toggle); default from config
  // Named full-scene snapshots. INVARIANT once startup has finished: presets.length >= 1 and
  // 0 <= curPreset < presets.length — something is ALWAYS selected, so every edit has a scene
  // to be auto-saved into. The -1 here is the pre-restore bootstrap value only;
  // ensureSelection() resolves it before the first paint. It is also what lets a stored blob or
  // share link carrying `curPreset: -1` (written before this change) keep loading — it decodes
  // to a real selection rather than being rejected.
  let presets = [], curPreset = -1, applyingPreset = false;
  // A shared link (?z=/?s=/#c=) hands its scene to the library instead of leaving it unsaved.
  // installShared cannot do that write itself — see adoptSharedScene — so it parks the intent
  // here and the write happens once everything exists. {name} or null.
  let pendingShared = null;

  // Zoom factor, per LAYER (1 = default; installStackItem installs the drawing layer's).
  // EVERY effect now zooms by re-evaluating its content at the zoomed coordinates rather
  // than by magnifying the finished picture: the shader effects divide their coordinates
  // by it, and the point effects scale the stamp in plot(). So the whole registry carries
  // `bakesOwnZoom` and the display-zoom pass is never asked for anything but 1 — see
  // stackZoom. (The point effects used to magnify the raster, which is exactly why they
  // went blocky as you zoomed while the shaders stayed sharp.)
  let zoom = 1;
  // How many more points to stamp to hold the on-screen density steady while the geometry
  // is zoomed: the stamps spread over zoom² the area, so the count follows zoom². Capped,
  // because the zoom slider's max is only a default the range editor can raise, and the
  // stacking multiplies it — up to 4 layers × ~2× for the Objects copies on top of this.
  const zoomPoints = () => zoom <= 1 ? 1 : Math.min(zoom * zoom, CONFIG.tuning.zoomPointCap);
  // The absolute stamp-count ceiling stampTick clamps to. Declared beside zoomPoints because the
  // two are applied on the same line; see CONFIG.tuning.pointCapHard for why it exists.
  const POINT_CAP_HARD = CONFIG.tuning.pointCapHard;
  // Additive glow strength. Was a hardcoded 0.35 in FS_COMP and its CPU twin;
  // hoisted so the Bloom filter can drive it (0 = no glow). BLOOM_DEFAULT is what
  // every scene was authored under, so it stays the default everywhere.
  const BLOOM_DEFAULT = 0.35;
  let bloomAmt = BLOOM_DEFAULT;
  // The SAME slider, ungated. `bloomAmt` is zeroed when the current filter set has no Bloom,
  // which is right for the Canvas2D composite (one picture, one chain) and WRONG per layer:
  // on the stacked GL path `filterOn` answers for the SELECTED layer -- renderFilters is null
  // there by construction -- so a non-selected layer's glow was silenced by a chain that is
  // not its own, and clicking another layer row changed the picture. glBloomPass reads this
  // instead; it only ever runs when the drawing layer's own chain contains Bloom, so the gate
  // was redundant there as well as wrong.
  let bloomRaw = BLOOM_DEFAULT;
  // Which post-FX filters are on for the live effect. Declared up here (and read
  // through a hoisted function) because bindRange runs a slider's apply() during
  // wiring, long before the FILTERS registry block is evaluated.
  let fadeKeep = 0.94, pixelBlock = 6, softenAmt = -0.6, softenRad = 1.5,
    edgeAmt = 0.7, posterLevels = 5, mirrorMode = 1, hexSize = 10,
    embAmt = 1.6, embAng = 135, embMix = 0.4,
    dithLvl = 4, dithAmt = 1, rblAmt = 1, rblMix = 0.7, polAmt = 1, polRep = 1,
    ascCell = 8, ascMix = 1, ascSet = 0, invAmt = 1, dblAmt = 24, dblAng = 0, anaAmt = 1, anaLen = 90;
  // Feedback warps (Echo / Zoom feedback / Swirl / Diffuse). Each carries its own
  // Keep, so it decays standalone instead of saturating to white when it is the only
  // feedback filter ticked — Fade is a separate filter you may or may not stack.
  let echoDist = 2, echoAng = 90, echoKeep = 0.94,
    zfbScale = 1.02, zfbKeep = 0.94, swirlSpin = 2, swirlKeep = 0.94,
    diffRad = 1, diffKeep = 0.97;
  // Post warps / colour
  let noiseAmt = 0.4, noiseSeedMode = 1, noiseFrame = 0;
  let twistAmt = 1.2, wedgeSeg = 6, wedgeRot = 0, glitchAmt = 0.05, glitchRows = 8,
    halfDot = 4, halfAmt = 0.8, threshLevel = 0.5, threshAmt = 0.8, chromaAmt = 1;
  // Screen stage (after the glow, at display resolution)
  let barrelAmt = 0.15, scanAmt = 0.35, scanCount = 240, vigAmt = 0.4, grainAmt = 0.08;
  let crtMask = 0.5, crtBleed = 0.4;                     // CRT phosphor: shadow mask, beam smear
  let shockAmt = 0, shockAmp = 0.06, shockWidth = 0.1;   // Shockwave ring: progress, push, thickness
  let pxThresh = 0.55, pxStreak = 0.5, pxDir = 0;        // Pixel sort
  let cellStates = 12, cellMix = 1, cellKeep = 1;        // Cellular automaton (feedback)
  let lensSize = 0.28, lensMag = 1.8, lensSpeed = 0.6;   // Lens bubble
  let drosteDepth = 2, drosteTwist = 0.5;                // Droste zoom
  let kuwRad = 3;                                        // Kuwahara oil-paint
  // Reaction–diffusion dish flags: declared here because glResize (an earlier slice than
  // the effect code) marks the dish for re-seeding when the grid reallocates. rdIsFloat
  // is a var on purpose — initGL assigns it while later slices' lets are still in TDZ.
  let rdNeedSeed = true, rdSalt = 1;
  var rdIsFloat = false;
  // Wall time for the post/screen passes that animate on their own (Slice glitch,
  // Grain). Accumulated from the frame loop's dt, never read off performance.now(),
  // so a stubbed-rAF pixel gate stays reproducible.
  let postTime = 0;
  let activeIds = new Set(["fire", "bloom"]);
  // GPU-only filters on the Canvas2D fallback. They are masked HERE, at the point of
  // use, and never removed from activeIds — that set is what saveExtra writes back, so
  // deleting them on load meant opening a scene on a fallback machine and touching
  // anything permanently stripped Pixelate/Blur/Edge/Posterize/Mirror from it. Filled
  // by the FILTERS block; empty until then, which is why filterOn stays safe to call
  // during slider wiring (bindRange runs apply() long before the registry exists).
  const cpuBlocked = new Set();
  // The whole-scene ("Scene filters") FX are SCENE-GLOBAL, not per layer: their on/off and
  // their slider values are one setting shared across every layer/effect. On/off lives in
  // `sceneOn` (not per-layer activeIds); values live in the DOM as singletons that loadState
  // /saveState/freezeItem skip (so switching layers never reloads them), persisted as the
  // top-level `sceneFx` blob field — modelled on the camera. The per-layer L.filters/states[e]
  // may still carry these ids/keys but they are INERT: filterOn and the checkbox route scene
  // filters through sceneOn, and the per-layer render chains exclude them by stage anyway.
  // EMPTY, deliberately. Every filter is per-layer now — Bloom became a real chain pass
  // (glBloomPass) instead of the whole-scene composite, and the four ex-screen filters became
  // ordinary image passes. Both sets are kept as the empty seams rather than being deleted:
  // isSceneFilter/filterOn/saveState/loadState/readSceneFx still route through them, so an
  // empty set is what makes "nothing is scene-global" true in one place instead of twenty.
  // Add an id here and it goes back to being one shared setting across every layer.
  const SCENE_FILTER_IDS = new Set();
  const SCENE_FILTER_KEYS = [];   // their dual-slider param keys — see above
  const isSceneFilter = id => SCENE_FILTER_IDS.has(id);
  let sceneOn = new Set();                     // scene-global filter on/off — none on by default (all filters off)
  // `activeIds` is the SELECTED layer's live filter set (the "DOM is the store for the
  // selected item" rule). The RENDER must follow what is on screen, not what is selected for
  // editing — you can select a muted layer to tweak it while a different one is the only
  // visible thing. `renderFilters` is that override: non-null only while the frame is drawing
  // a layer that is not the selected one, and always cleared before the frame returns, so
  // every UI caller (syncFilterUI, refreshControlVisibility) still sees activeIds.
  let renderFilters = null;
  // BYPASS: a filter that is in the chain but switched off for now. Purely a debugging aid —
  // A/B a filter without ✕-ing it out and losing its position and its settings — so it is
  // TRANSIENT and deliberately not in the wire format. A saved scene, share link or cloud
  // profile records the chain, never which of it you had muted while looking at it.
  //
  // Held on the LAYER object (`L.fxOff`), not in a slot-keyed map: layer objects move when you
  // reorder, so the bypass follows its layer for free, and stackItemOut names its fields
  // explicitly so an extra property is never serialised. installStack replaces the objects on
  // every scene load, which is exactly when the bypass should evaporate.
  const fxOffOf = L => (L && (L.fxOff || (L.fxOff = new Set()))) || new Set();
  // Eye icons for every "is this visible?" toggle (the layer mute, the filter bypass): an
  // OPEN eye = contributing to the picture, a CLOSED eye (lid + lashes) = muted. Inline
  // SVG on currentColor, sized in em, so each button tints and scales them exactly like
  // the ●/○ glyphs they replaced. Set via innerHTML at the two sync sites.
  const EYE_OPEN = '<svg viewBox="0 0 24 24" width="1.25em" height="1.25em" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/></svg>';
  const EYE_SHUT = '<svg viewBox="0 0 24 24" width="1.25em" height="1.25em" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M2 10c2.5 3.7 6 5.5 10 5.5s7.5-1.8 10-5.5"/>'
    + '<path d="M4.5 14 3 16.5"/><path d="M12 15.5v3"/><path d="M19.5 14l1.5 2.5"/></svg>';
  // "This control is not available right now" — the ONE way to say it. The `.off` class dims
  // it, and `disabled` is what actually stops it: the class used to be paired with
  // `pointer-events: none` in the CSS, which blocks the MOUSE ONLY. A dimmed button kept its
  // tab stop and still fired on Enter, so every handler needed a guard of its own to make the
  // press a silent no-op, and the layer ✕ (dimmed with no pointer-events rule at all) got as
  // far as raising a confirm() for a removal that could never happen.
  // `disabled` also takes the node out of the a11y tree, which is the honest announcement.
  // Not for #mute: that one is dimmed but deliberately still live.
  function setOff(node, off) {
    if (!node) return;
    node.classList.toggle("off", !!off);
    node.disabled = !!off;                 // a no-op on <b>/<span>, hence aria-disabled too
    node.setAttribute("aria-disabled", off ? "true" : "false");
  }
  // ---- modal dialog focus -------------------------------------------------------------
  // For the FOUR dialogs that darken the page behind them: #help, #restoredlg, #galdlg and
  // #syncpop. They already trap the mouse (a full-screen backdrop that closes on click); this
  // is the same containment for the keyboard, which they had none of — Tab walked straight out
  // of an "open" dialog and into the panel behind it, and closing left focus wherever it had
  // wandered to.
  //
  // NOT for the floating tool panels (#carddlg, #paledlg, #paldlg and the three pickers). Those
  // are deliberately non-modal — you drag a slider and watch the scene change through them — so
  // they carry role="dialog" for the announcement and nothing else. Trapping focus in the Orbit
  // editor would break the one thing it exists to let you do.
  //
  // `var`, not `let`: these are called from slices that load EARLIER than wherever the dialogs
  // are wired, the same hoisting the app relies on for `card` and `beatUi`.
  var dlgTrap = null;
  function dlgFocusable(box) {
    return [...box.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),'
      + 'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter(n => n.offsetWidth || n.offsetHeight || n === document.activeElement);
  }
  function dlgModal(box) {
    if (!box) return;
    dlgRelease();                                  // never stack two traps
    const prev = document.activeElement;
    const onKey = e => {
      if (e.key !== "Tab") return;
      const f = dlgFocusable(box);
      if (!f.length) { e.preventDefault(); box.focus(); return; }
      const first = f[0], last = f[f.length - 1];
      // Wrap at both ends, and pull focus back in if it has escaped (a click on the backdrop
      // leaves document.activeElement outside the box while the dialog is still open).
      if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    dlgTrap = { box, prev, onKey };
    if (!box.hasAttribute("tabindex")) box.setAttribute("tabindex", "-1");
    const f = dlgFocusable(box);
    (f[0] || box).focus();
  }
  // Pass the box: the close paths are called unconditionally (Escape closes every dialog
  // whether or not it was open), so releasing a trap that belongs to a DIFFERENT dialog would
  // yank focus somewhere the user never was.
  function dlgRelease(box) {
    if (!dlgTrap || (box && dlgTrap.box !== box)) return;
    document.removeEventListener("keydown", dlgTrap.onKey, true);
    const prev = dlgTrap.prev;
    dlgTrap = null;
    if (prev && prev.isConnected && typeof prev.focus === "function") prev.focus();
  }
  // Whichever layer is being drawn right now: renderFxOff is set per layer by the stacked
  // path, mirroring renderFilters; falling back to the selected layer covers the editor and
  // the single-layer render.
  let renderFxOff = null;
  const fxBypassed = id => (renderFxOff || fxOffOf(stack[stackSel])).has(id);
  // THE single predicate. Everything that asks "is this filter acting?" goes through here —
  // activeFilters(), hasFeedback() (so bypassing the only feedback filter really does let the
  // heat buffer clear again) and the CPU mirrors — so the bypass needs adding in one place.
  function filterOn(id) {
    const on = isSceneFilter(id) ? sceneOn.has(id) : (renderFilters || activeIds).has(id);
    return on && !cpuBlocked.has(id) && !fxBypassed(id);
  }
  // Camera rotation (radians) applied to each effect's own sampled space — see
  // camProg/camGlsl for the GL path and the camM matrix for the CPU path. These are the
  // LIVE globals for whichever layer is currently being drawn: the camera is per-layer
  // state (states[e].camrx/camry/camrz), and installStackItem pushes each layer's angles
  // in — plus camMat() — just before that layer renders.
  let camRX = 0, camRY = 0, camRZ = 0;
  // FIELD OF VIEW, and it works the way the camera rotation does: by moving WHERE EACH PIXEL
  // TAKES ITS COLOUR FROM, not by re-projecting anything. Positive pushes the sample outward
  // with the square of the radius (a fisheye / wide lens), negative pulls it in (telephoto).
  // Because it rides the shared camera it costs every shader effect one multiply and needs no
  // per-effect code at all.
  //
  // SHADER EFFECTS ONLY, deliberately: it is an inverse map on the SAMPLE coordinate, and a
  // point effect has no sample coordinate — it stamps a destination. Applying the same curve
  // to a stamped point would bend it the opposite way for the same slider value, and applying
  // the true inverse means solving a cubic per point. So `fov` is listed in the params of the
  // 33 effects with a `draw` hook and not the 8 with a `stamp` one.
  let camFov = 0;
  // WHERE A LAYER'S GEOMETRY SITS IN THE SHARED 3D WORLD (see glWorldDraw). The world's
  // frame is the Ocean's — camera at y = 3.4, water at y = 0 — so an object needs telling
  // where to stand in it. Per layer, like the camera angles: two joined layers place their
  // own geometry independently. Defaults put it a few units ahead and above the water, so
  // ticking the box produces something visible rather than something behind you.
  let wldX = 0, wldY = 1.6, wldZ = 6, wldScale = 1.2;
  // CPU mirror of the shader camera. Rotating (x, y, 0) by Rz·Ry·Rx and dropping z is a
  // plain 2×2 map, so the whole camera collapses to four numbers — worth hoisting,
  // since the CPU mirrors would otherwise call trig six times per pixel. Recomputed
  // once per frame by camMat(); the mirrors read camM and multiply.
  const camM = [1, 0, 0, 1];           // [m00, m01, m10, m11]
  function camMat() {
    const sx = Math.sin(camRX), cx = Math.cos(camRX);
    const sy = Math.sin(camRY), cy = Math.cos(camRY);
    const sz = Math.sin(camRZ), cz = Math.cos(camRZ);
    camM[0] = cy * cz;  camM[1] = sx * sy * cz - cx * sz;
    camM[2] = cy * sz;  camM[3] = sx * sy * sz + cx * cz;
    return camM;
  }
  const camOn = () => camRX !== 0 || camRY !== 0 || camRZ !== 0 || camFov !== 0;   // skip the maths at rest
  // Rotate a pixel about the frame centre into camPX/camPY. The CPU mirrors call
  // this per pixel, so it writes scratch globals rather than returning a pair.
  // Mirrors the shader camera (camGlsl), which rotates gl_FragCoord the same way.
  let camPX = 0, camPY = 0;
  function camPix(x, y) {
    if (!camOn()) { camPX = x; camPY = y; return; }
    let dx = x - fw * 0.5, dy = y - fh * 0.5;
    if (camFov !== 0) {                // lens first, then rotation — same order as camFrag4
      const half = fw * fw * 0.25 + fh * fh * 0.25;
      const k = 1 + camFov * (dx * dx + dy * dy) / half;
      dx *= k; dy *= k;
    }
    camPX = camM[0] * dx + camM[1] * dy + fw * 0.5;
    camPY = camM[2] * dx + camM[3] * dy + fh * 0.5;
  }
  // THE POINT SIDE OF THE LENS, which is the INVERSE map — and the reason FOV shipped as
  // "shader effects only" before this.
  //
  // camFrag4/camPix bend the SAMPLE coordinate: a screen offset s reads the effect at
  // lens(s) = s·(1 + k·|s|²/R²). A point effect runs the other way — it already knows the
  // content offset and has to be told where on screen to stamp it — so it needs lens⁻¹.
  // Applying lens() to a stamped point instead is the trap: it bows the picture the
  // OPPOSITE way for the same slider value, so a scene with a fisheye layer over a
  // stamped one would have the two curving against each other.
  //
  // lens⁻¹ is a depressed cubic — k·u³ + u − v = 0 in normalised radius — and Newton
  // solves it in three steps from u₀ = v. The map is near the identity over the visible
  // disc, so the first guess is already good to a few percent and three steps are exact to
  // float precision.
  //
  // A NEGATIVE FOV FOLDS, and dropping the point is the right answer. v = u(1 + k·u²)
  // peaks at u* = 1/√(−3k), so content past v* = ⅔u* has no screen position at all — that
  // is not a failure, it is what a long lens does, and those points fall outside the frame
  // exactly as a zoomed-out point does.
  let camUX = 0, camUY = 0;
  function camUnlens(dx, dy) {
    const r2 = dx * dx + dy * dy;
    if (r2 < 1e-12) { camUX = dx; camUY = dy; return true; }
    const R = Math.sqrt(fw * fw * 0.25 + fh * fh * 0.25);
    const v = Math.sqrt(r2) / R, k = camFov;
    if (k < 0) {
      const us = 1 / Math.sqrt(-3 * k);
      if (v > us * (1 + k * us * us)) return false;      // past the fold: off the frame
    }
    let u = v;
    for (let i = 0; i < 3; i++) {
      const gp = 3 * k * u * u + 1;
      if (gp < 1e-4) return false;                       // on the fold; no stable root
      u -= (k * u * u * u + u - v) / gp;
      if (!(u >= 0)) return false;                       // NaN-safe
    }
    const f = u / v;
    camUX = dx * f; camUY = dy * f;
    return true;
  }

  // Deterministic PRNG (mulberry32). Seeded once from unix time at load, then
  // re-seeded to that same value every frame so the chaos game draws the
  // identical point sequence each time — only the moving corners change the
  // shape, not the random noise. Different page loads get a different seed.
  const SEED = Date.now() | 0;
  let rngState = SEED;
  function rnd() {
    rngState |= 0;
    rngState = (rngState + 0x6D2B79F5) | 0;
    let z = rngState;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

