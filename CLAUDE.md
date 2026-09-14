# CLAUDE.md

Rules for this repo. Terse on purpose: **"don't X" means X was tried and failed**. The rationale,
measurements and war stories were stripped in three passes — `git show v1.79.0:CLAUDE.md` has the
last full text, `git show v1.12.3:CLAUDE.md` and `git show 1d0eb06:CLAUDE.md` the older ones.
Read the old text before overruling a rule here.

## What this is

Self-contained demoscene visual on GitHub Pages, https://kicktro.com/. Effects share one palette +
glow + banding + beat-reactive pipeline, in four families. **This list is COMPLETE and
`tools/docsprobe.js` keeps it that way** (README.md too, including its stated count). Add an
effect ⇒ add it here and there in the same commit.

- **Point-accumulation** — Sierpiński (`sirpinfyer`), Tetrahedron (`tetrafyer`, "Tetrafyer" in
  older notes), Attractor (de Jong), Fractal flames (`flames`, the one **additive** stamper),
  Boids, Slime mould (`physarum`), Curl flow (`curl`), Harmonograph, Galaxy, Trees, Flying
  ribbons (the one that **rasterises geometry**), Polypinski (`polypinski`, the chaos game
  between N hashed corners on a sphere; Seed → `sdHash`, jump ratio free).
- **Shader fractals** — Julia, Burning Ship, Multibrot, Newton.
- **Shader pattern** — Plasma, Tunnel, Metaballs, Kaleidoscope, Rotozoomer, Moiré, Munching
  Squares, Copper Bars, Sun surface, Kefrens bars, Twister, Cymatics, Lightning storm, Starfield,
  Aurora, Reaction-diffusion, Voronoi cells (`voronoi`), Flow noise (`warpnoise`), Truchet tiles
  (`truchet`), God rays (`godray`), Cellular automata (`automata`, Life-like B/S rules on its own
  coarse state pair `glTex.ca`, torus via REPEAT; age fades LINEARLY — 8-bit multiplicative decay
  never reaches zero).
- **Shader SDF** — Polygon, Shape grid, Concentric rings, Bouncing shapes, Bouncing solids,
  Mandelbulb, Menger sponge, Apollonian gasket (`apollo`, by inversion), Mandelbox (`mbox`, box
  folds), Gyroid (`gyroid`, minimal surface, not a fractal), Smooth CSG (`csg`, IQ smooth ops over
  (brightness, distance) pairs; the cast is **hashed on the CPU** from Seed/Objects and shipped as
  uniform arrays), Terrain (`terrain`, height field with Ocean's step law), Volumetric clouds
  (`clouds`, integrates density along the ray), Vector balls (`vballs`, a projected sprite
  rasteriser), Glass ball (`glass`), Doughnut (`torus`), Ocean (`ocean`), Black hole (`bhole`),
  Quaternion Julia (`qjulia`) — everything from Bouncing solids on is raymarched.

Each = one `EFFECTS` descriptor + a `draw(dt)` shader hook or a `stamp(box)` point hook. No package
manager, test framework or runtime dependency.

## Build

- **Source of truth is `src/`.** `styles.css` + `*.js` concatenated in **`src/manifest.txt` order**
  into `dev-index.html`. Order is load-bearing (TDZ + forward refs) — don't reorder. Files are
  named by subsystem: `audio-*`, `render-*`, `effects-*`, `orbit-*`, `persist-*`, `stack-*`,
  `controls-*`, `ui-*`.
- **`src/config.js` loads first, holds `CONFIG`** — every default not part of a preset. Change
  defaults THERE. `PALETTES` is the single palette catalog.
- **Never hand-edit `dev-index.html` / `index.html`.** `node tools/build.js` rebuilds (split/join,
  never `String.replace` — `$` corrupts JS); `--check` exits non-zero if stale.
- **Deploy with `/deploy`.** `index.html` = production, `dev-index.html` = preview; probes run
  against the preview.
- **Every deploy is a numbered release.** `CONFIG.version` is the only version string; `/deploy`
  bumps it, writes the `CHANGELOG.md` section, tags `v<version>` (push the tag). A version with no
  tag is prepared-but-unreleased — publish that one. **major = a saved scene / share link / backup
  stops loading identically**, which must never happen; patch for fixes, minor for a new
  effect/filter/control.
- Pages deploys via `.github/workflows/pages.yml`. `.gitattributes` pins LF.

## Workflow

- **Always commit and push after a verified change**: edit `src/`, `node tools/build.js`, commit
  `src/` + `dev-index.html` together, `git push origin HEAD:main`. Don't ask first.
- Commit trailers end with the `Co-Authored-By` line + the `Claude-Session:` line.
- Preview: open `dev-index.html`, or `python -m http.server`.
- Don't re-run `gh api -X POST repos/carlemil/kicktro/pages`.

## Architecture (one IIFE, authored across `src/*.js`)

### Render pipeline — WebGL2 primary, Canvas2D fallback
`useGL` from `initGL()`; every draw path branches on it.
- **Fire** is a feedback FILTER (`fire`), run from `glBeginHeat`/`glLayerBeginHeat`, ping-ponging
  the heat textures. CPU fallback = `beginHeatTick()`.
- **Chaos-game points stay on the CPU** (deterministic): `pushPt()`/`glBlitPoints()`, or `plot()`.
  `simulate()` is reached only from the `if (!useGL)` branch; the GL point path closes its own tick
  inline.
- **Shader effects** write heat to `.r` (`o = vec4(heat,0,0,1)`), each with a CPU mirror. `FS_*` +
  `glProg.<id>` registered in `initGL`; `draw(dt)` calls `glShaderDraw(name, setU)` or the mirror.
  `*Seed(dt)` advances phase identically on both.
- **Glow**: `glRender()`/`render()` map heat through the palette, then composite an additive blur.

### Cardioid seed orbit (Julia / Burning Ship / Multibrot)
- All three call `juliaSeed(dt)` **once** in `draw`; the render functions never call it.
- Seed = rim point on the scaled main cardioid + riding circle of radius `juliaInnerR` at `ratio ×`
  the outer phase. The cardioid depends on the exponent: `d=2` Mandelbrot, else the degree-d
  boundary via `cardioidAt(th, d)` — **integer d only**; fractional d rides `cardioidBlendAt`
  (pushed out by `JULIA_FRAC_BOOST` 0.3 windowed by `4·f·(1−f)`). `juliaPower` is a **FLOAT**;
  `setEffect` resets it to 2; Multibrot sets it from `mbPower` **before** `juliaSeed`.
- Easing: `EASE_K · (1 + JULIA_EASE_A·cos((round(power)−1)·θ))`; cusp count stays whole;
  **`EASE_K = 1/√(1−A²)` is load-bearing**. Warp applies to the outer phase only. `juliaPower` is
  declared above `juliaEase`; `juliaSeedAt` stays unwarped; the Orbit editor integrates
  `dφ = ratio·dθ/ease(θ)`.
- **Burning Ship rides the "wrong" cardioid deliberately — do not "fix" the PATH.** Shipped
  `outrad` [1.4, 1.9] compensates. That rule is NOT a licence to draw the Mandelbrot set behind it:
  its locus is its own set (`locus: "ship"`).
- `tools/juliaprobe.js` locks this down.

### Effects that read the layers BENEATH them
**`glBelowTex` is the one seam**: `renderStackColor` points it at `glTex.color[acc]` before each
`renderLayerHeat` and nulls it after the loop. Null for the bottom layer and the single-layer path,
so a reader MUST have its own fallback (Glass ball: a procedural room).
- It is a **COLOUR** texture and effects write **HEAT**: take only luminance.
- Bind unit 3 to a complete texture even when unused (`glBelowTex || glTex.native`) with a
  `uHasBelow` switch. **Do not paint the environment outside the subject** when `uHasBelow` is set —
  that hides the layer below instead of reflecting it.

**Ocean is MARCHED, not projected**: geometric height-field steps, one secant step at the crossing.
`WAVE_OCT_MARCH` (3) for the silhouette, all six for the shading normal. Wave height capped at
`CAM_H*0.55` (taller puts the camera underwater). The CPU mirror keeps the flat plane.

### The shared 3D world (layers traced as ONE scene)
`FS_WORLD` traces several layers' geometry together. Opt-in per layer (`world`, default off).
- **Output is a G-BUFFER**: heat in `.r`, object ID in `.g`; `FS_WORLDPICK` hands each layer its
  own pixels, so per-layer palettes survive. `glTex.world` is **NEAREST**, compare is
  `step(|g*255 − id|, 0.5)`, **ID 0 is "nothing hit"**.
- A joined layer's `fx.draw(dt)` never runs; `glWorldDraw(plan, dt)` advances its clock (passing 0
  = a paused scene).
- **A placed SDF is `de_local((p − offset)/scale) * scale`** — drop the multiply and the marcher
  punches holes. Quaternion Julia's bounding-sphere early-out needs it too.
- Camera is the OCEAN's (`(0, CAM_H, 0)`, +z, −0.30 tilt), through `camProg`; the lowest joined
  layer's camera group orbits the world.
- **TWO marches**: SDF union sphere-traced, Ocean height-field stepped; nearer hit wins.
- Reflected light lands in the REFLECTOR's layer. **Reflection composites with `mix`, not `+=`.**
  `uReflect` is two-part: physical to 1, lifting toward a flat mirror above.
- **The other ~72 programs ARE built at startup and that is fine (measured, ~4 s cold boot; the ten
  raymarchers account for ≤1 s inside ±1 s noise).** Do not make them lazy without a sub-second
  timer; boot compile is also the only thing that catches a typo in a raymarcher. `makeProg`
  compiles `VS_QUAD` once (`vsCache`, a `var` with no initialiser).
- **THE WORLD PROGRAM IS NEVER BUILT AT STARTUP** — link cost compounds with what `worldMap` can
  reach (glass alone 7.7 s, all five kinds 134 s, measured in `tools/worldlink-check.js`).
  **GLASS IS THE WHOLE COST**; anything enlarging what `glassDE` reaches is paid sixteen times, so
  a second reflection bounce was never attempted. A bounding sphere on `glassDE` and a smaller ball
  loop bound were both measured NOT to help and reverted. Compare link totals across a whole run,
  never single entries (±15% noise). Two fixes, both needed: `#if W_GB/W_SD/W_QJ/W_VB` gate every
  group and `worldProgFor` builds one program per COMBINATION; the link is async via
  `KHR_parallel_shader_compile` — poll `COMPLETION_STATUS_KHR`, never read `LINK_STATUS` early.
  `planWorld`'s result is dropped while pending.
- **`glWorldMix` writes `glTex.worldMix` and returns it** — it reads the pick in `glTex.layer`, so
  it may not target `glFbo.layer` (a draw sampling its own attachment is silently dropped).
  `renderLayerHeat` tracks `outTex`. **`tools/world-check.js`** is the gate.
- **Handover is a CROSSFADE** (`L.worldFade`, `WORLD_FADE_S` 0.45 s): between 0 and 1 both the own
  draw (into `glTex.worldOwn`) and the pick render, blended by `FS_WORLDMIX` in heat space. Clock
  rule: own draw gets `dt` 0 while a world is live. A layer with no fade state snaps.
- **`worldProgs`/`worldPar`/`worldVs`/`worldFsBase` are `var` WITH NO INITIALISER**: `initGL()` is
  called from `palette.js`, two slices above; a `let` is a TDZ crash, a `var` with initialiser gets
  wiped later and compiles an empty string. Every `FS_*`/`VS_QUAD` is local to initGL.
- **The world shader is SIXTEEN shaders** (× 4 ocean surfaces): a brace unbalanced only when a
  group is ABSENT compiles fine in every manual test. `worldprobe` counts braces;
  **`tools/worldcompile-check.js` compiles all on the real GPU** and `/deploy` runs it.
- Quaternion Julia carries its own orientation (`qjpitch/yaw/roll` + `qjtumx/y/z` → `qjTx/Ty/Tz`
  on `PHASE_VARS`), applied in the same order standalone and in the world (`worldprobe` asserts).
  It tumbles the OBJECT, not the camera.
- **`WORLD_KINDS`**: `ocean`, `glass`, `solids`, `qjulia`, `vballs`. One layer per kind, **except
  GLASS, which is multi** (arrays, `glassDE` returns `(dist, groupIdx)`). The glass COUNT is baked
  into the program key (`#define W_GBN`) — a uniform loop bound made one ball link like four.
  Interior flights can never be added (`worldprobe` asserts).
- The `world` tick's single writer is its own change handler writing `stack[slot]` from
  `e.target.checked`; `captureLayerExtras` must NOT read it from the checkbox; the `worldChk`
  setter writes only the selected block.
- `shade0` for glass does a fresnel-weighted `skyOf(reflect(...))` — a reflected ball shows its
  material but not the scene (balls do not contain each other; that needs a second bounce).
- **World reflections drape the FILTERED picture, one frame late** (`uBelow`/`uHasBelow`, unit 2).
  `captureWorldBelow` blits `glTex.color[acc]` into `glTex.worldBelow` where `glBelowTex` is
  assigned for the LOWEST JOINED GLASS layer; `worldBelowOk` resets every `renderStackColor`
  (`var`, no initialiser). **The seam is `envRay`, NOT `shade0`** (shade0 also shades the primary
  ocean hit); it sits outside every `#if`. Water and empty sky come from the picture, solids keep
  their own shading. The projection is the crude directional one standalone uses — a true
  screen-space reflection is WORSE. **`tools/worldbelow-check.js` needs REAL TIME** (no
  `--virtual-time-budget`) and ships a negative-control page.
- Only the Glass ball traces secondary rays. Vector balls in the world = sphere union behind a
  bounding sphere; the sprite path stays standalone.
- GL only — Canvas2D renders one item. `tools/worldprobe.js`.

### Doughnut / Trees
- **Doughnut**: path = tube centre circle + wobble capped at `DN_WOB` 0.30 against a wall floor of
  0.743. `dnflute` is `single`; `dntwist` is a free float — the branch-cut shortfall is wound back
  over the last radian (`s`, `dlt` in `torusDE`), zero at a whole product. Heading is the CENTRE
  CIRCLE's tangent. `tools/dnutprobe.js`.
- **Trees**: `trMaxDepth` clamps DEPTH to `TR_SEG_MAX` (never split). Trunk length is solved so the
  tree fits the box at every Taper. Sway is added at every joint (`tools/treeprobe.js` measures
  tip-travel vs root-travel). Beat reactivity = arming Sway's chips.

### Flying ribbons (the ONLY effect that rasterises geometry)
Triangle list per band with the app's **only depth buffer**.
- `glRibbonDraw` attaches the depth renderbuffer for that draw ONLY; otherwise the `glShaderDraw`
  contract (layer scratch, blending off, overwrite).
- `camMapXY` is the shared screen mapping factored out of `plot()`; the vertices take the same one.
- Shading is the surface NORMAL. Buffers live in `boot-globals.js`. No Points slider.
- The two EDGES are placed in 3D and projected separately. Each band sweeps PAST the frame edge on
  a golden-angle heading; the motion is a wave down its length, never closed knots about the origin.
- Sample count comes from the MEASURED projected length (`RB_COARSE` pass, then ~1.4px steps).
  Cross-section points are offset by a hashed fraction of a step (`rbHash`, never `Math.random`).
- Owns its Points range (`min 6000, max 140000`, default 95000).

### Bouncing solids
`src/solids-3d.js`: CPU rigid-body physics, ≤8 bodies; shader gets `uPos`, `uQuat`, `uShape`.
- Orientation is a quaternion, undone per sample (`toBody`); one renormalise per frame.
- Collision is a bounding SPHERE; every SDF fits inside radius `r`. `Size` IS that radius.
- Clamp the step (`min(0.05, dt)`). Bodies live on the layer (`L.solids`); `installStackItem`
  calls `installSolids(L)`. Start state uses `sdHash`, not sines. `tools/solidsprobe.js`.

### Menger sponge camera
- Drives the street grid (corridors at x/z ≡ 1.5 mod 3, y = 1.5), turning at hash-picked
  intersections; `MG_DIVE_P` 0.72 of segments dive on a lane LADDER (levels 0/1/2, carve DE
  exactly 1/3 and 1/9). Level steps ±1 per crossing, only inside the gap slab.
- Whole path is C2: `mgSS` smootherstep, corners `mgCorner` (`MG_R` 0.9). **A free waypoint
  spline is NOT usable.**
- Path lives in `mengerSeed` (CPU, `PHASE_VARS`); shader gets `uPos`/`uFwd`/`uRoll`. `uFwd` tilts
  in swoops but never goes vertical. `mgLvlAt`/`mgEval` are pure. Bob scaled by `(1−g)`, phase must
  not contain `mgSeg`. Never put the camera on the lattice AXIS or a face-centre line.

### Effect-shader gotchas
- **NO BACKTICK ANYWHERE INSIDE AN `FS_*`/`VS_*` SOURCE, comments included** — one closes the
  template literal and the IIFE fails deep inside a shader. `build.js` won't catch it; syntax-check
  with `new Function`.
- **`smoothstep(hi, lo, x)` is UNDEFINED** when `edge0 >= edge1` (returns 0 here). Use
  `1.0 - smoothstep(lo, hi, x)`.
- **Name collisions inside one `main()` are a silent LINK failure.** Assert a console-error count
  of 0 (`glCompile`/`glLink` throw).
- **The heat buffer is Y-FLIPPED against the screen** — row 0 renders at the top.
- **Reaction–diffusion owns a state texture pair** (`glTex.rd`, RGBA16F where available, RGBA8
  fallback). `glRDTick` seeds on `rdNeedSeed`. **A SINGLETON deliberately.** Steps scale with `dt`.
- Headless virtual-time runs render FEW real frames with large clamped `dt`; before diagnosing a
  frozen per-frame sim, patch the pass in a probe copy.
- **Slime mould NORMALISES, it does not freeze**: `phScatter` is a coarse (13×8) drifting noise
  field scaling the trail's DECAY per cell. Heading noise per agent and agent relocation were both
  measured worse. Field + clock live on the LAYER.
- **Boids follows the solids arrangement**: `L.boids`, `installBoids(L)`, hash-seeded; only
  `bdPrev` rides `PHASE_VARS`.

### Point-accumulation effects
`simulate()` dispatches to `stamp(box)` if present. Stamp inside the **safe box** (heat grid less
1px); Size/Rotation scale & spin the corners about its centre.
- **Stamp at `POINT_HEAT`** (`CONFIG.tuning.pointHeat` = 209), not 255.
- **`stampAdd: true` (Fractal flames) makes the stamp ADDITIVE** on both paths (`plot(x,y,v,true)`;
  `glBlitPoints(..., "add")`). `flamesStamp` reseeds the PRNG and advances `flPhase` per tick.
- **Flames auto-exposure is load-bearing**: pass 1 runs the orbit unstamped to measure density,
  pass 2 re-runs the same seeded sequence and stamps with gain up to 6× (cap 220). Owns its Points
  range (2000–30000, default 12000).

### Credits overlay + scene banner
Credits draw on their own canvas (`#creditcv`, `z-index: 4`, `pointer-events: none`) via
`creditDraw()` from `frame()` after the render. **Never stamp them into heat.** `CREDIT_HOLD` 5s +
`CREDIT_FADE` 3s; `creditLeft` counts rendered time; `?credits=<s>` overrides the hold. `CREDITS`
drives overlay and panel list; the on/off preference has its own `localStorage` key.

**`#scenebanner` is DOM chrome**: `showSceneTitle(name, author)` arms `titleLeft`
(`CONFIG.credits.titleHold`/`titleFade`); `sceneBannerTick()` runs unconditionally and gates on
`creditLeft <= 0`; `frame()` decrements `titleLeft` only in the `else` of `creditLeft > 0`.
`applyPreset` calls `sceneTitleFor(i)`, never `p.name`. Author = `collection`, else `#cloud-name`.
Own `localStorage` key + "Show author" (`#sceneTitleOn`, `data-nopersist`, Scene box).
`createPreset` does not arm the banner.

### Preset transitions
**BOTH SIDES OF A BLEND ARE LIVE.** `transBegin` freezes the selected item, then keeps `stack` as
`prevStack` (`var` in `boot-globals.js`); `installStack` assigns a brand-new array.
- `renderStackColor(live, dt, now, ticks, base)` — `base` is 0 live, `STACK_MAX` outgoing
  (replaced `stack.indexOf(L)`, which is −1 for a detached item). Per-layer buffers are sized
  `STACK_MAX * 2`.
- Order in `frame()`: `renderPrevScene` BEFORE the live render; `updateAnims(now, dt, prevStack)`
  AFTER the live one. The outgoing scene drifts but does not re-trigger (null band, scene keys
  skipped). `transStep` nulls `prevStack`; the `transBegin` snapshot stays as the all-muted
  fallback. RD is a singleton (shared dish); Canvas2D keeps the frozen copy. No downscale.

`TRANSITIONS` — third registry, sixteen modes of the single `FS_TRANS` pass: `cut`, `burnoff`,
`crossfade`, `dip`, `flash`, `pixelate`, `blur`, `wipe`, `iris`, then the staggered family
`checker`, `bars`, `shutter`, `slide`, `clock`, `dissolve`, `ripple`. `burnoff` lends retention
(`hasFeedback()` true while `transBurning()`).
- **`cut` is the fallback, never a choice.** Everything iterates `TRANS_PICKABLE`; the one-member
  set `{"cut"}` = "none of these"; unticking the last row writes that set, not `null` (= all).
- Staggered family = one idea, seven delay fields; `hash21` has no time term. CPU mirror:
  mask-based ones paint a mask + `destination-in`; `dissolve`/`ripple` fall through to crossfade.
- `transUse` stored by stable id, skipped while `sharing`. `glRender` sends zoom output to
  `glFbo.post[0]` during a transition so the blend precedes the glow.
- Auto-pick = `fits(a, b) → weight` over `sceneInfo()`. Transition slider = [min,max] seconds;
  both thumbs 0 = cut; `trans.t` advances in rendered time.

### Filters (post-FX)
`FILTERS` — second registry, **three stages in this order** (`filterprobe` asserts).

**feedback** (`Fire`, `Fade pixel`, `Diffuse`, `Echo`, `Zoom feedback`, `Swirl`, `Cellular
automaton`) — mutate retained heat inside `glBeginHeat`. No feedback filter ⇒ `glBeginHeat` clears.
- Echo/Zoom feedback/Swirl are one program `FS_HWARP` via `glWarpFeedback(...)`, sampling through
  `glSampLin` — unbind the sampler immediately after.
- Each carries its own `Lifetime`; keys (`fade`, `diffkeep`, `echokeep`, `zfbkeep`, `swirlkeep`)
  are the wire format. All need CPU mirrors.

**post** (Twist, Wedge fold, Slice glitch, Pixelate, Blur/sharpen, Edge, Posterize, Halftone,
Solarize, Chromatic aberration, Mirror, Shockwave, Pixel sort, Lens bubble, Droste zoom, Oil paint,
Bloom) — read the palette-mapped image. `glPostChain()` ping-pongs `glTex.post[0]/[1]`, returns
`glTex.native` untouched when empty. Bloom has no pass — it is the glow composite.

**screen — EMPTY.** Barrel, Scanlines, Vignette, Film grain and Bloom are per-layer `post` passes
(`postPass`, fw×fh). `glRender`'s final `FS_COMP` pins `uBloom` to 0. `glBloomPass` borrows
`glFbo.blur1/blur2` and restores the caller's target — `curFbo/curW/curH` are `var`.
`SCENE_FILTER_IDS`/`SCENE_FILTER_KEYS` are empty wire-format seams; `migrateSceneFx` folds an old
scene's whole-scene filters onto its layers (both load paths, idempotent). `FILTER_LISTS` has ONE
entry — a filter routed to a missing host silently vanishes.

**ASCII mosaic builds a GLYPH ATLAS at runtime; the ramp is MEASURED.** `ASCII_SETS` names Unicode
ranges; `buildAsciiAtlas` renders, sums ink, sorts by coverage. Brightness picks a LEVEL
(`ASCII_LEVELS` 64 = shader `ASC_LEVELS`); an empty level must inherit the nearest filled one; cell
0 is the blank and the darkest level is it. **The atlas is sampled with NO Y flip** (the heat buffer
is already flipped; `asciiprobe` asserts the flip's absence). Glyph pick uses `ascHash` (integer),
never `fract(sin())`. Tofu rejection is PER GLYPH against `ASCII_TOFU`. Overflow is sampled evenly
(`pickChars`), capped by `MAX_TEXTURE_SIZE / 32`. `tools/asciiprobe.js`.

**Slice glitch and Film grain read `postTime`** (accumulated frame `dt`).

**Ping-pong parity**: `glBeginHeat` runs each ticked `glFeedback` in registry order; `pendingDst` =
wherever the last pass landed. `tools/heatprobe.js`.

**Feedback filters apply to shader effects too**: `frame()` advances retained heat first and
`glShaderDraw` MAX-blends. `hasFeedback()` is the single predicate. CPU: every mirror writes every
cell. `heatFeedbackTick()` flips `curHeat`, `beginHeatTick()` does not. `applyFilters()` wipes
`fire` on `!hasFeedback()`.

**CPU masking**: post filters carry `cpuOk: false`; mask at the point of use (`cpuBlocked` →
`filterOn()`), never remove from `activeIds`.

**BYPASS (`.filter-by`, the eye)** mutes a filter in place — transient (`L.fxOff`, a Set), never
serialised, dropped by `installStack`. `filterOn(id)` applies it; chain builders read
`liveChainIds(L)`. The eye is inside a `<summary>`: `preventDefault()` + `stopPropagation()`.
Eyes render `EYE_OPEN`/`EYE_SHUT` (boot-globals SVG).

**Foldable control groups** — `FOLDABLE_GROUPS` is EMPTY by request; machinery stays.

**The list shows only ADDED filters, in run order.** `+ Add filter` → `#fltdlg` is the catalogue
(sorted by name inside registry-ordered caption groups); the menu's list is the chain and must never
be sorted. Every section stays in the DOM forever; order = re-appending; `#flt-<id>` survives as a
hidden checkbox; `setFilterOn(id, on)` is the single toggle path. `buildFilterUI` runs before the
`POPPABLE` pass and after the registry block (TDZ). `makeFilterGrab`: transform the dragged section,
reorder once on release, never move the node mid-drag.

**A filter's `defaults` must SHOW IT OFF** (Shockwave's `shock` at 0 did nothing). Keep FILTERS
`defaults` and CONTROLS `lo`/`hi` in step. Where bold is the LOW end the default belongs there
(`soften: -1`, `poster: 3`); `shock` defaults to the spread `[0, 1]`. Measuring this needs a still
AND a moving subject, and seconds to settle for trail filters.

Filter `params` are CONTROLS keys (host `"filter"`, one contiguous `group`). `presetState` merges
`FILTER_DEFAULTS` into every effect's state. **Every effect defaults to NO filters**; `DEFAULT_SCENE`
carries `sceneFx:{on:["bloom"]}`. `mergeExtra` is mandatory; `loadExtra` re-runs
`refreshControlVisibility()`.

**The stored list is the USER'S ORDER**: every chain walks `orderFilters(ids)`. **The chain is
split, not sorted — `splitChain(ids)`**: everything at or above the last feedback filter runs in
the heat phase, everything below on the picture. **Never re-introduce a stage sort.** The divider
marks where the effect draws. Four sites respect the order: `glBeginHeat` + `glPostChain`,
`layerFeedbackChain` + `glLayerPostChain`, and `mergeExtra`. `orderFilters` is a function
declaration closing over `FILTER_STAGE_RANK`.

**Effect `defaults` are NEUTRAL**: `palcycle [0,0]`, banding off, no rotation, every dual `[lo,lo]`.

### Effects & per-effect state
**`EFFECTS` is the single source of truth** — `{id, name, presetName?, subtitle, help, params,
helpTags, draw?/fractal2d, bakesOwnZoom?, cardioid?, onEnter?, defaults, ranges?, beat, extras}`.
`assertRegistry()` warns on dup id / unknown keys.
- Dropdowns list effects BY NAME via `effectsByName()`; `EFFECTS` keeps registry order (the
  runtime `effect` is an index).
- Controls generate from `CONTROLS` (`buildControls()` → `#fxctl`/`#bandctl`). No hand-written
  control HTML. Include render-affecting keys the effect doesn't display in `defaults`.
- **Identity: the stable string `id` on the wire, never the index.** `serializeBlob`/
  `deserializeBlob` convert at the edge; `LEGACY_EFFECT_IDS` migrates pre-id blobs. **`MAP_DEFS`
  is the per-effect-map registry** (`states`, `beats`, `pulses`, `plens`, `btunes`, `extras`);
  the mechanical all-maps sites go through it (`saveLiveMaps`/`loadLiveMaps`/`initAllMaps`), the
  semantic sites (applyBlob's loops, `snapshotScene`, `applyPreset`, freeze/thaw) stay explicit,
  probe-pinned. **A new map = one `MAP_DEFS` row plus the semantic sites.** Unknown id ⇒ dropped.

**Per-effect slider bounds** — `ranges: { <key>: {min, max, step?} }`, per-LAYER keys only.
`rngShipped(id, fx)` is the single reader. `applyRangesFor` resolves the effect per block; `applyBlob`'s
`ok(id, x, e)` widens by the effect's range. Raising a `min` is a scene-visible change.

**SINGLE controls** — `single: true` on a `dual` entry: one integer, one thumb (the four enums
`flvar`/`mirror`/`pxdir`/`sdmix` and small counts; NOT `points`/`bdcount`/`xormask`/`bandsize` or
densities like `cocount`/`sgcells`). Stays `type: "dual"` (store and wire keys unchanged).
`SINGLE_KEYS` + `singlePair(id, v)` (function declaration) live in `controls-schema.js`; collapse
is lo-then-round. `ctlHTML` emits the real `step`; `RNG_ORIG` must carry it; `applyRangesFor` ignores
a stored `step` for these keys. `wireRange` suppresses triggers (`beat !== false && !single`).
Collapse sites: `mergeState`, `applyBlob`'s states loop, `paintBlock`. `tools/singleprobe.js`.

**Break-out boxes.** Every slider appears in the menu as a name + `+`/`−` launcher (`.ctl-row`);
the `#ctl-<key>` node lives in `#breakout`. A box belongs to a LAYER: `popped` keyed
`"<slot>/<key>"` (scene = `"s/<key>"`), `refreshBreakout()` shows one iff popped and still used.
- A SCENE filter param is ONE box and N rows (`bloom`, `burn`, `barrel`, `scan`, `scancount`,
  `vignette`, `grain`); it carries an `id`, dressed by a second pass over `FILTERS`' params in
  params order; `popSlot` folds those keys to `-1`. `ttl`/`tdur` have no launcher.
- `#breakout` is outside `#panel`: control CSS scoped `#panel …, #breakout …`; `onEdit` attached
  to both; its own capture-phase `pointerdown` + `focusin` selects `box.dataset.slot`'s layer.
- Box order: `.ctl-owner` (also the DRAG HANDLE, `.own-txt`); label+value; slider; `.rng-sec`
  (min/max/step, closed); `.ctl-div`; Triggers (`.trig-t`) over the chips; `.trig-body` — ONE
  folding element with Shape + pulse PLOT (`drawPulsePlot`, drawn from the SAME formula
  `updateAnims` applies, duration-invariant; every shipped slider is pinned so the default plot is
  flat), Duration (`.plen`), Tuning (`.trig-refs`: per-band Sensitivity, Floor, Refractory,
  shown for armed bands, `↺`); then `.ctl-div` + the Reset row, always visible. The range editor is
  inserted before the FIRST `.trig-t`. A `single` control has no trigger section or chevron.
- A SHAPE THUMBNAIL heads the box for the groups in `SHAPE_PREVIEW` (`polygon`, `concentric`,
  `shapegrid`, `bounce`, `solids`, `vballs`), keyed by GROUP, reading the slider values for its
  slot, redrawn on `input`/`refreshBreakout`, never per frame.
- The Triggers heading folds (`trigFolded`), hiding chips and body; `paintTuneRows` ANDs with it.

**ONE DRAG ENGINE.** Boxes and every floating tool panel (`#carddlg`, `#paledlg`, `#paldlg`, the
pickers, the modal dialogs) drag by their title bar onto one grid.
- `brkGrid()` measures the PANEL's live rect: origin at its right edge + gap, column `BRK_W +
  BRK_GAP`, rows dividing its height. Never hard-code 298/58.
- Snap is a QUARTER cell (`BRK_SUB` 4); `#brkgrid` draws both levels while dragging from the same
  `brkGrid()`.
- **A box is never placed partly off screen; `brkPlace` enforces it** by clamping the whole RECT in
  the anchor's frame (near edge wins when the box is larger than the room).
- **A drop resolves with `nearestFree`**, handed the drop point — never a one-direction nudge.
  `tools/brkdrop-check.js` drives the real handlers.
- Near the far edge a box is clamped (`right: 0`); `breakout-check` asserts the snap only when the
  clamp did not engage. `dragTargetFor` walks up to the first positioned ancestor (`#carddlg
  .card-box` is `position: static` on purpose). The dialog handler is delegated on `document`.

**`#breakout` IS A FULL-SCREEN FREE GRID** (`fixed; inset: 0; pointer-events: none`; boxes
`absolute; pointer-events: auto`). `layoutBreakout()` places never-dragged boxes into the column
(wrapping into a second) and dragged ones from `brkPos`. Snap = 12×8 grid with EDGE AFFINITY
(anchor the near edge, grow inward). `brkPos` keyed like `popped`; `remapPopped` moves both.
Transient. Never reparent mid-drag; write the anchor on release. Double-click the title returns a
box to the column. Below 760px boxes go back in flow as a bottom sheet (`brkFree()` gates both).

**Range editor** (`makeRangeEditor`): `rngApply` writes the attribute, re-clamps, dispatches `input`
on the slider. `applyRanges` calls `rngSyncAll()`.

**Blocked controls**: `CTL_BLOCKED` maps key → blocker; off when the dual's high thumb is 0
(`ctlHi`, read the thumb). `refreshBlocked` runs from `refreshControlVisibility` and `onEdit`.

**Orbit editor** (`#carddlg`), gated on `cardioid: true`. Floating, non-modal, `z-index: 5` —
never add a backdrop or click-outside-closes. Hides on `m`/`Esc`.
- Samples `juliaSeedAt(outer, inner)` (never advances the animation).
- Backdrop `cardLocus(w, h, d, win, ship)`: Mandelbrot / Multibrot / **Burning Ship** (a third
  family). `locusEsc` is the single escape test; family via `locusShip()`; `card.bgShip` is part
  of the cache key. View centres on the locus in BOTH axes (`cardWin.yc`, snaps to 0 below 1e-9);
  `cardY0`/`cardSpanY` are the only y mapping. Full res on the integer-2 path, half elsewhere.
- Canvas is 819×644 (drawing precision); `cardEventToC` reads the live rect. The title is in the
  paints-NOTHING list — assert `getComputedStyle`, never a screenshot.
- Stays live while paused: `cardTouch()` sets `cardDirty`; the paused branch calls
  `cardDrawPaused()`. `card`, `cardDirty`, `cardWanted` are `var`s.

**Seed path**: `seedPathMode` (`cardioid`|`circle`|`freehand`), `seedRideOn`, freehand `seedPts` →
`seedSpline`. `basePathAt(th)` is the fork; `juliaEase` is flat off the cardioid. Per-LAYER
(`L.seedPath`/`seedRide`/`seedPts`), `extras[e]` fallback; `installSeedPath(L)` from
`installStackItem`; `captureSeed(L)` swaps in a NEW array (WeakMap invalidation).
`stageLayerExtras`/`applyLayerExtras` install the seed, not `loadExtra`.

**Field of view** rides `uCam.w` (vec4, `uniform4f`): a radial scale on the sample coordinate
before the rotation in both `camFrag4()` and `camPix()`, normalised by the half diagonal. `camOn()`
includes `camFov`; default 0, in `CAM_KEYS`. **Point effects need the INVERSE** — `plot()` applies
`camUnlens` last (Newton on `k·u³ + u − v = 0`). A negative FOV folds; points past the fold are
dropped by design.

**Camera on CPU**: mirrors call `camPix(x, y)` per pixel; per-row hoists stay inside the x loop.
Copper Bars gates its row fast path on `camOn()`.

### UI: two menus
☰ opens the **menubar** (`src/ui-menubar.js`) — everything that is not scene data. `#panel` is only
the scene editor; `m` toggles it, ☰ does not. Audio and Resolution are ROOT items, each with its own
adopt host (`#audiobox`, `#resbox`).

**The menubar ADOPTS nodes** (`#audiobox`, `#resbox`, `#cloudbox`, `#creditbox` authored hidden in
the panel; `{adopt: "id"}` moves their children). `ui-menubar.js` is last in the manifest.
**`returnAdopted()` is load-bearing** — panels are destroyed on close.

**Every dialog's title + close button are STICKY**: first two children = the close button then an
`<h2>`. **Every dialog appears in FOUR lists** and `tools/uiprobe.js` asserts all from one table:
the Escape branch, the single `body.ui-hidden` selector, the sticky-header selectors, the
`padding-top` waiver.
- Panel-tool dialogs dock TOP-LEFT beside the panel (margin 58px/298px): `#fltdlg`,
  `#transpickdlg`, `#paledlg`, `#paldlg`. `#palpickdlg` CENTRES at `z-index: 21`, still not modal.
  Reading dialogs (Help, Gallery, Restore) centre.
- Close button is `sticky` + `float: right`. The box gives up `padding-top`; the header carries it
  (`box-shadow: 0 -30px 0 30px` + `backdrop-filter`). Name the element the `<h2>` is really a child
  of (`#carddlg .card-box > h2`). **The `padding-top: 0` waiver is the LAST rule in `styles.css`.**
- `role="dialog"` on the box; `aria-modal` + `dlgModal`/`dlgRelease` only on the four with a
  backdrop (`#help`, `#restoredlg`, `#galdlg`, `#syncpop`). Floating tool panels must NEVER trap
  focus. `dlgRelease(box)` is box-scoped.
- A probe that opens a dialog by un-hiding it proves nothing — click the real opener.

**Narrow viewports**: `1160px` centres `#help`; `760px` undocks the docked dialogs and makes
`#breakout` a bottom sheet. Probe asserts WIDTH, not just position.

**`setOff(node, off)`** is the one way to switch a control off (`.off` + `disabled` +
`aria-disabled`); `pointer-events: none` blocks the mouse only. `#mute` is dimmed but live.

**`#uihint`** is the way out of "Hide all UI" (times itself out); `setUiHidden(h, quiet)` passes
`quiet` on `?hideui`.

**Shared widget CSS is keyed on the CLASS** (`.pal-close`-family, `.audbtn`), never scoped to a
container. Control-appearance CSS names `#panel …, #breakout …, #menubar …`. `#menubar` is a
full-screen overlay; every rule an adopted block needs must name it, including the font.

**Panel layout**: header + four `.box` `<details>` (Scene, Scene filters, Beat tuning, hidden Layer
effect & filters) + `#lyrsec`. `buildControls` routes by `host`. `#scenenow` is filled by
`syncSceneTitle()` from `buildPresetList()`.

### One control block PER LAYER
A `.lyrblock` cloned from `<template id="lyrblock">`, `STACK_MAX` of them, living in a BOX IN THE
GRID (`#breakout .ctl.lyr-box[data-slot]`, `adoptLayerCtl`). The row's `+`/`−` (`button.lyr-pop`)
toggles `openSlots`. No `#lyrctl`, no `parkLayerCtl`.
- **Nothing inside a block carries an `id`**; `data-k` resolved via `ctl(k)` (selected),
  `ctlIn(slot, k)`, `ctlEach(k)`. Node REFERENCES in `keyMap[slot]`, not subtree queries. A SCENE
  control keeps its `id`, generated in slot 0 only; `ctl()` falls through to `getElementById`.
  `#effect` and `#palette` are hoisted out of the block.
- One set of maps pointed at one block: `wireRange(slot, …)` builds; `registerAnim` runs the single
  startup `apply()` from slot 0; **`pointMaps(slot)` never re-creates `animPhase` and never calls
  `apply()`**. `makeChips` handlers guard on being the live block.
- **`paintBlock(slot, L)`** fills a NON-selected block: skip the selected, bounds BEFORE values,
  never dispatch `input`. **`repaintAllBlocks()` runs wherever a slot changes which layer it holds**
  (inside `installStack`).
- Visibility passes are per block (`shownKeysFor`, `refreshBlockVisibility`, `markFirstGroup`,
  `refreshBlocked`, `ctlHiIn`). `RNG_ORIG` is built from `CONTROLS`, not a DOM scan.
- **`selectStack`'s order**: `freezeItem` → `stackSel = j` → `pointMaps(j)` → rest. Selection =
  capture-phase `pointerdown` AND `focusin`. Every layer starts closed; selecting does not open,
  opening selects. `dropOpen`/`moveOpen`/`remapPopped` remap on remove and drag.
- The row is a 3-column grid with EVERY child explicitly placed. Block CSS is scoped
  `#panel …, #breakout .lyr-box …`. **The box rule is `#breakout .ctl.poppable`, never bare `.ctl`.**
- A slider popped from an OPEN layer box lands beside it (`placeBeside`).

**A LAYER'S TINT IS RESOLVED ONCE AND STORED CONCRETE** (`L.tint`, an INDEX into
`CONFIG.layerTint`; `tintOk` accepts only an in-range integer; null = auto from slot at install).
`resolveTints(items)` in `installStack`, `freeTintIdx` in `addStackItem`. Tints edge and title
only. `syncPopOwners` stamps it; `syncStackUI` calls that. The swatch skips colours other layers
show. `tools/tintprobe.js`. A DOM check must neuter EVERY path that could supply the behaviour.

**Blend is per layer; an effect may SHIP one** (descriptor `blend`; Glass ball ships `"over"`),
applied on a fresh item and on a switch only while the layer still carries the outgoing default.
**`OVR` (`u: 20`) composites by COVERAGE** (`FS_PAL` alpha = `heat > 0`). **`KEY` (`u: 21`)** keys
on OKLab lightness (`smoothstep(0.05, 0.40, L)`), still gated on `lay.a`. Both share `OVR`'s
empty-accumulator guard. **Adding a mode is ONE `BLEND_MODES` row plus one `FS_OKMERGE` branch.**
- Every chevron is 2x; `::before` ones pin `line-height: 0`. `#effect` is hidden, not deleted.
  First visible group heading via `.grp-first` (`markFirstGroup()`), not `:first-child`.

**Palette cycle**: `palcycle` dual (host `pal`) = [min,max] seconds; both 0 pins. `morphing` is
derived (`palCycleOn()`); `extras.morph` still written for compat.

**The palette family is made CONCRETE per layer at install** (`installStack` + `addStackItem`
resolve a null `palette`/`paletteRev`/`paletteBg` from `extras[L.fx] || presetExtra` ONCE).
Filters and seedPts still fall back to the descriptor default on null.

**Each layer block has THREE TABS — Effect / Filters / Palette**; the open tab is PER LAYER
(`lyrTab` array by slot, `syncLyrTabs`), transient. Every pane opens with a ⚄ Random / ↺ Reset
tools row (`rnd-<t>`/`rst-<t>`). The old "Reset this effect" button is REMOVED. Break-out boxes are
not tied to the tab. Tab buttons `stopPropagation` on `click` only. `foldcycle-check` pins it.

**Reverse colours** (`#palrev`) per layer (`layerPalRev(L)`), flips LUT indices 1..255 at both bake
choke points (`composePalette`, `bakeLayerBytes`). **Background** (`#palbg`) per layer:
`"palette"` (default, also `bgOk`'s fallback) | `"black"` | `"white"`.

**Palette editor** (`#paledlg`, `src/palette-editor.js`): `✎` on a custom swatch; new customs via
the picker's Create new (`#palpick-new`, `prompt`, no name ⇒ no palette; must add the index to a
materialised `palUse`). Floating, non-modal. Edits LIVE; a fresh copy closed without an edit is
removed (`Save & close` overrides). Stop-handle drag listeners live on the dragged button;
`paleApply(full, dragLive)`; `setPointerCapture` in try/catch. Customs live in `PALETTES` after the
built-ins (`PAL_BUILTIN`). `applyBlob` installs customs BEFORE validating palette values;
`customPalettesOk` sorts stops. Deleting a custom shifts indices ⇒ `palRemapDeleted`.

**`palGone`** — soft-deleted built-ins (tombstone Set, persisted beside `palUse`, skipped while
sharing); `palInUse` gates them out. `deleteAnyPalette` is the one entry, the per-row ✕ its only
caller; floor = one alive palette. "Select all" clears tombstones. `palFallbackFor(gone)` walks
display order from after `gone`, prefers in-use, then alive, **never a tombstone**; returns a
pre-splice index. `palKeepInUse(land)` runs after every delete. `tools/palprobe.js`.

**`palUse`** (`#palpickdlg`) gates STRIP and CYCLE only; `null` = all; `setPalUse` collapses
full/empty to `null`; skipped while sharing; `palRemapDeleted` must remap it.

**Palette identity: stable string ids on the WIRE, indices at runtime.** `PAL_IDS` (frozen,
append-only) + content-hash ids for customs (`palHashId`). Conversion only in
`serializeBlob`/`deserializeBlob` (`palIdOut`/`palIdxIn` + wrappers). Decode order: numeric legacy
position, built-in id, the blob's own `palettes` list, live custom tail; unknown ⇒ dropped.
**Names may change; ids and order may not.** UI lists by name via `palByName()`.

**Palette picker**: `#palette <select>` is the hidden store; `#palswatches` visible; a swatch sets
`paletteSel.value` + bubbling `change`. `syncPalSwatches()` mirrors programmatic changes.

**`setEffect(i, save)`** shows `params`, runs `onEnter`, swaps the per-effect maps. Does not clear
the heat buffer.

**Beat chips ship unarmed**; band colours tint them unarmed; armed = solid fill + glow. **Beat
dots** (`.ctl-dot`, 12px, `opacity .75` idle — keep in step with `flashChips`'s ramp); `syncDots()`
from `syncChips()`.

**Beat pulse**: an armed slider snaps to the high thumb and `a.pulse` decays 1→0 over
`pulseLen[id]` (default `PULSE_DROP` 0.2s); `pulseShape[id]` reshapes:
`a.apply(mn + shape(a.pulse)*(mx-mn))`. Every `PULSE_SHAPES` fn has **`f(0)=0`** (load-bearing);
`f(1)=1` is only a convention — `swell`/`bloom` are humps. `pulseEls`/`plenEls` mirror `chipEls`.

### The effect stack (layers)
Ordered list of ≤4 effects. `stack`, `stackSel`, `STACK_MAX` = 4. **Never call it `layers` in
code** (`layers` is a CONTROLS key). Use `stackSel`, not `slot`.

**`effect` = the SELECTED item's effect**, assigned only in `setEffect`. Only the render path reads
`stack`. **`EFFECTS[effect]` must never reappear in a render path.**

Pressing anywhere in a row selects it (capture `pointerdown` + `focusin`; grab handle selects on
pointerup). **Rows are a FIXED POOL of `STACK_MAX`, keyed by slot, never destroyed**; `syncStackUI`
only paints; every handler reads `stack[slot]` live. Every row has its own `select.lyr-name`; a
change on a non-selected row calls `selectStack(j)` first, `fx` read before either call.

**The DOM is the store for the selected item; every other item holds plain numbers.**
`freezeItem`/`thawItem` move between them and null the record on thaw.

**Palette + filter stack are per-layer** (`L.palette`, `L.filters`). `applyLayerExtras(L)` /
`captureLayerExtras`. **Switching layers runs `stageLayerExtras(L)` BEFORE `setEffect`.** Changing
a layer's effect KEEPS its palette/filters.

**Animation is split scene vs layer** (`isSceneCtl`). Only `SHARED_FILTER_KEYS` are scene-wide:
`burn`, `bloom`, `barrel`, `scan`, `scancount`, `vignette`, `grain`. **They are stored per layer
and rendered scene-wide; four sites agree**: `saveState` WRITES them; `loadState` and `paintBlock`
SKIP them (an editing action must never change the render); `stackOut` STAMPS live values onto
every layer; `installStack` SEEDS the singletons from layer 0, captured before the thaw.
`bloomAmt` is gated, `bloomRaw` is not, and `glBloomPass` reads `bloomRaw`. Still ONE value per
scene — making them per-layer is a MAJOR bump. Feedback params are read during propagation; the
single-layer path calls `installStackItem(live[0])` up front.

`updateAnims` is key-major. **Epilogue `installStackItem(stack[stackSel])`** after the loop.
`clearBeats()` stays after the whole loop.

**Phase clocks are per item via `PHASE_VARS`** — add a line when you add an effect that
accumulates a clock, or two items share one clock. `installStack` seeds from the current clocks.

**Compositing (heat-space)**: each item renders into `glTex.layer`, merges via
`glMergeLayer(blend, gain)`. Gain is a multiply inside the shader (`blendEquation(MAX)` ignores
`blendFunc`). `glMergeLayer` restores BLEND, `blendEquation` and `blendFunc`.

**Per-layer palettes — two paths, gated on live-layer count.** ≤1 ⇒ heat-space merge; ≥2 ⇒
`renderStackColor`, each layer coloured with its own palette, blended in OKLab. Each layer owns
`glTex.heatL[slot]` and runs `glLayerBeginHeat` (a copy — `glBeginHeat` stays for `heatprobe`);
`stepLayerPal(slot)`; `bakeLayerBytes`; `layerPalIndex` reads the live dropdown for the selected
layer. `glColorizeLayer` → `glLayerPostChain(L)` → `glOkMerge`. `BLEND_MODES` is the single source
of truth (`u`: 0 add, 1 max, 2 diff, 3 colour, 4 luminosity, 20 over, 21 key); `accW < ε` guard;
`L.gain` scales the weight once. `STACK_MAX` is declared by the GL setup (TDZ).

**Point items own the tick loop**; shader items draw once per frame after. No point items and no
retention ⇒ `glClearHeatCurrent()`. Canvas2D renders ONE item (first unmuted).

**Zoom applies to CONTENT**: shaders divide by `zoom` (`bakesOwnZoom`); point effects scale in
`plot()`; `zoomPoints()` multiplies count by `zoom²` capped at `CONFIG.tuning.zoomPointCap` 8.
`stackZoom()` is always 1 (`FS_ZOOM` identity blit kept).

**Every scene loads through `mergeLayers`, single-layer included** — its fallback branch is the ONE
place a top-level scene becomes a stack item. Do not add an `extras[L.fx]` fallback to
`applyLayerExtras`; setting live `activeIds` does not survive.

**Persistence: an optional `layers` array**; one item ⇒ nothing emitted. `mergeLayers` truncates,
drops retired ids, clamps gain, defaults blend, runs every per-item map through its own `merge*`.
`blendOk`/`gainOk` are function declarations. `?stack=plasma,tunnel` is a dev hook.

### Scene collections
A preset carries an optional `collection` beside `name` (not in `snapshotScene`); **must be listed
in `validatePresetList`** or it is dropped on every cloud load. The gallery installs a collection:
`applySharedLibrary(raw, replace, collection)` → `applyRestore`'s third branch (drop every preset of
that collection, append the incoming). `#preset` is the hidden store; `#presetlist` is built by
`buildPresetList()` from `rebuildPresetOptions`, `applyPreset` and the `change` handler's `-1`
branch. `openCollections` is a transient Set. `myProfileName()` reads `#cloud-name` then
`PROFILE_NAME_KEY` synchronously; `setProfileName(v)` is the one setter. `myCollectionLabel()` =
`myProfileName() || "Kicktro"`.

**`p.rotate`** — per-scene auto-cycle; `inRotation(p)` is `!(p.rotate === false)`; `setRotation`
deletes the key rather than writing `true`; must be in `validatePresetList`. Nothing ticked ⇒ the
cycler idles.

**`autosavePreset` must carry every field beside `name`** — adding one means editing
`autosavePreset`, `validatePresetList`, and the setter. Third such field: `origin` (original author,
kept across a copy; `createPreset` stamps `originOf(cur)`, never `"Shared with you"`;
`sceneTitleFor` shows `name · origin · collection-or-you`). `tools/author-check.js`.

### Presets & persistence
User-facing word is "scene"; code word is "preset". `HELP.sliders[].n` must match the rendered
label; `safeFileName`'s fallback is `"Scene"`.

A preset = `snapshotScene()`: `{name, effect, state, beat, pulse, plen, cam, sceneFx, beatTune,
ranges, ttl, tdur, extra, layers}` — the globals are carried on purpose (anything missing renders as
the recipient's value). `applyPreset` applies `ranges` first, then `ttl`/`tdur`. Does not travel:
resolution, audio on/off, `randSeed` re-roll, chaos seed, phases.

**First-visit library** = `DEFAULT_LIBRARY` (FIFTEEN scenes since 1.72.0, wire format, every
`collection` stripped) **plus `blankPreset()` appended** (`neutralPreset("plasma")`,
`rotate: false`). `defaultPresets()` runs it through `deserializeBlob`, falling back to
`perEffectPresets()` if that drops the lot. **`function defaultPresets(` is a `presetprobe` marker
directly after `snapshotScene`.**

**AUTO-CYCLE RUNS WHETHER OR NOT THE EDITOR IS SHOWING** (panel gate reverted by request in 1.73.0
— do not put it back). `restore()` hides the panel when `saved.panelOpen` is absent.
`#panelbtn` toggles the panel through `setPanel` (`syncPanelBtn()`).

Creating a preset, adopting a shared scene and restoring a backup all `stopCycling()`
(`applyRestore` writes `out.cycle = false` last). Switching effect folds into the selected preset
(`setEffect`, `autosavePreset`, `persist`).

**Something is ALWAYS selected**: `ensureSelection()` is the single choke point; `curPreset = -1`
survives only in the bootstrap declaration and `applyBlob`'s empty-library fallback. Selection and
live state must AGREE — Delete and `dropCollection` call `applyPreset`. Deleting the last scene
re-seeds the library. A shared link is kept as a scene in `"Shared with you"`
(`SHARED_COLLECTION`): `installShared` parks `pendingShared` (it runs synchronously mid-slice);
`adoptSharedScene()` does the library write, idempotent, from the startup epilogue and the
`?z=`/`#c=` handlers. `bumpName` only when the name is taken.

Presets are local; `onEdit` → `autosavePreset()`. All four of `applyPreset`'s maps go through
`merge*`. `classList.toggle("on", undefined)` FLIPS — coerce with `!!`. Beat chips are `<button>`s:
`chipEdited()` autosaves + persists.

- **Storage**: `localStorage["burnTheWeb.v1"]` = `fullSnapshot()` — the definition of "everything
  we remember". `applyBlob(saved, sharing)` applies `ranges` + `beatTune` first, then validates.
  Anything not in `fullSnapshot()` is transient.
- Custom slider ranges: `RNG_ORIG` captures shipped bounds before `restore()`; `collectRanges()`
  stores differences; ride in localStorage, share URL and backup.

### Share / bundle / backup codecs
**Everything that DECODES must keep working forever**: `?z=`/`?s=`, `#zp=`/`#sp=`, `#c=`.
- `?z=` — JSON → deflate-raw → base64url; `?s=` plain base64 fallback, decoded forever; `?z=`
  checked first. Values rounded to `CONTROLS.step` then clamped. Decoding is async, landing after
  startup's `setEffect`; `shareUrl()` is async; `stripShareParam()` at startup. Encodes only the
  CURRENT scene; `pruneBeats()`/`prunePulses()` prune against the descriptor defaults (share only;
  works because `applyShared` re-seeds first).
- Short link: `shortenUrl(url)` POSTs to `tinyurl.com/api-create.php` (signals failure with 200 +
  an error string — validate the shape).
- Preset bundles: `libraryUrl(chosen)` in the URL FRAGMENT `#zp=` (`#sp=` fallback), never a
  query (414). Recipient: `applyShared()` → `openSharedLibrary` → `normalizeBackup` →
  `deserializeBlob` → `validatePresetList` → Restore dialog. File restore forces auto-cycle off;
  link honours the sender (`__link`). `applyRestore` stashes the index in
  `sessionStorage["btw.applyPreset"]`.
- **Ordering trap**: `applyShared()` runs during `audio-tuning-data.js`; `pendingRestore`/
  `openRestore` are in the TDZ, so the sync `#sp=`/`#c=` paths defer via `Promise.resolve().then`.
- Backup = one file per preset + `_settings.json` (`backupFiles()`); Chromium writes
  `Kicktro/<date>/` via `showDirectoryPicker` (handle in IndexedDB `burnTheWeb.fs`; Shift-click
  re-picks; `bkStore` must always resolve), else downloads ~150ms apart. `safeFileName` is
  probe-pinned. Restore takes multiple files; `normalizeBackup()` runs before `deserializeBlob`;
  `applyRestore()` starts from `fullSnapshot()`, writes `localStorage`, reloads.

Backup/Restore buttons are gone from the menu; builders are kept, probe-pinned. **Share is
`#sharepreset`** in the Scene box: `cloudShareScene()` → `#c=` link, `?z=` fallback; copy via
`ClipboardItem`'s promise form, then `writeText`, then `prompt()`.

### Cloud profiles (Firebase Auth + Firestore, over REST)
`src/cloud-profile.js` is the client; `firestore.rules` is the whole security boundary. No SDK —
`fetch()` against identitytoolkit / securetoken / firestore; the one remote script is Google
Identity Services. **`CONFIG.cloud.apiKey` is a kill switch** (empty ⇒ no request at all).

The payload is one deflated string via `cloudBlob()` → `serializeBlob` + `zipToB64` — same codec
and decode path as `#zp=` (content differs since 1.14.0: borrowed presets filtered, `collections`
added). Rules carry the size caps and `hasOnly()` pins the shape; the header lists the nine
Playground cases. Tokens refresh 60s early; a 401 retries exactly once; session tokens under their
own key.

**Shared scenes live in `/scenes`**, world-readable, owner-stamped, immutable, owner-deletable,
unlistable — the minted id is noted at share time in `burnTheWeb.sharelinks.v1`; "My shared links"
is the one retraction path; `cloudDelete` sweeps them.

**A first sign-in seeds the account from this machine**: `cloudFetchProfileMeta(seedIfMissing)`'s
404 branch calls `cloudSave()`, whose precondition asserts `exists=false`, so it can only CREATE.
`seedIfMissing` is passed by the sign-in caller only (`cloudprobe` asserts startup passes nothing).

`cloudApplyPayload(payload)` is the ONE place a stored payload becomes a library.

**Only the current version is stored** (no history). The save carries a `currentDocument`
precondition from `cloudSess.docTime` (`"none"` ⇒ `exists=false`; absent ⇒ unguarded); every path
that learns the version calls `cloudNoteDocTime`; a stale save re-arms via `cloudRearmDocTime()`.
- `cloudBlob()` sends YOUR scenes only, except `"Shared with you"`; other borrowed presets are
  dropped and `collections` (`{key, uid}`) rides instead — a borrowed collection with no follow
  entry is noted uid-less; never clobber an entry with a uid. `curPreset` is remapped.
  `cloudSave` refuses only with no scenes AND no follows.
- `collectionsHeld` is declared in `audio-tuning-data.js`, filled from `persist-presets.js`
  (function declarations). The follow is noted INSIDE `applySharedLibrary` after validation;
  `delpreset` calls `forgetCollection` when a delete empties a collection.
- `refollowCollections(raw)` runs INSIDE `cloudApplyPayload`: appended never prepended, re-stamped
  with the followed key, present collections not re-fetched, missing sources skipped and named
  (`{raw, missed}`), uid-less entries resolved by NAME against `galList()` and healed back into
  `raw.collections`. `galFetchLibrary(uid)` is the shared fetch→unzip→parse.
- `applyRestore`'s MERGE matches on `(name, collection)`. `sharedLibrary` carries `collections`;
  `applyRestore` writes it only when `__ownCloud` is set — an out-of-band `let` set only by
  `cloudApplyPayload`, never from the payload. Merge UNIONS follow-lists; Replace replaces.
- `firestore.rules` keeps a read-and-delete-only `snapshots` block until nothing is left. A
  subcollection does NOT inherit its parent match; Firestore does not cascade-delete.

**The gallery applies a row straight away** (`applySharedLibrary(raw, replace)` stages
`pendingRestore` and calls `applyRestore`; `sharedLibrary(raw)` is the decode+validate half).
Browsable signed out (`galFetchJson`, plain keyed fetch). `cloudPublish` re-saves the whole profile.
**The listing is ONE unordered query a day** (`galleryLimit` 200, cached under `GAL_KEY` for
`galleryTtlMs`; `galBust()` on your own publish/save). Shuffle, filter and pager are client-side.
`tools/gallery-check.js`. **`BUILTIN_GALLERY`** (`src/gallery-builtin.js`, GENERATED by
`node tools/ai-scenes.js --emit`) ships rows in the app — listed first, never cached, uid
`builtin:…`. Change the scenes in `tools/ai-scenes.js`, re-emit, rebuild.

### Audio & beat reactivity
`startAudio("capture"|"mic")` must run inside a user gesture. **The MIC is armed by default**:
`restore()` (not `applyBlob`) calls `armAudioResume("mic")` when no source was ever chosen. The
stored `audio` field has THREE states: a source name, `"off"` (user settled it; `audio.settled`,
which `applyBlob` reads back), null (never asked).

**Mute is `audio.muted`, split from `audio.on`.** `♪` / `S` key → `toggleMute` → `setMuted` (never
touches the stream). `audioLive() = audio.on && !audio.muted` at four sites (`stepAnim`'s `armed`,
`flashChips`, `frame()`, the `audio-off` class). `setMuted` zeroes `pulse`/`energy`/`beatNow`;
`audio.muted` is transient.

**`audioTick` is an ONSET detector — don't "simplify" it back to energy.** Per band: spectral flux
on float linear magnitudes (`smoothingTimeConstant = 0`); a beat is a local maximum above
`median(last ~1s) × beatCfg.fluxK[b]` and above `beatCfg.floor × recent peak`, with a per-band
refractory; causal, one hop of latency. Bands 30–150 / 150–2500 / 2500–12000 Hz (`computeBins`).
`beatCfg` (defaults `BEAT_DEFAULTS`) is the GLOBAL tuning. `mergeBeatTune` has replace semantics;
`installBeatTune` writes fields in place, never replaces the object, and re-runs `beatBuild()` +
`computeBins()` (the latter only when `audio.on`). Runs on `setInterval(HOP_MS)` (100Hz); beats
latch in `beatNow[]`; `frame()` calls `updateAnims()` then `clearBeats()`.

### Per-slider beat tuning
**Every armed slider detects its own beats.** A TRIGGER is `(layer slot, control key)`;
`trigState["<slot>/<id>"]` keeps its own `lastBeat`, latch and pulse; `clearBeats` drains them.
The expensive half is computed once per band (`audio.cand/med/candFlux`); the per-trigger pass
runs in `audioTick`, not at frame time. `trigList` is cached behind `trigDirty` (a `var`), set from
`chipEdited`, `selectStack`, `syncStackUI`, `installStack`, `loadBtune`, `beatChanged` and every
tuning row edit. **`tuneEff(t)` is the ONE inheritance resolver.** Storage mirrors `pulseLen`
(`beatTune[id]`, `btuneStates[e]`, `L.btune`, `"btunes"` in `EFFECT_MAPS`, `btune` in
`snapshotScene`/`applyPreset`/`validatePresetList`/`stackItemOut`) but starts EMPTY — absent means
inherit; `applyBlob` replaces per effect. `bands` is not per slider. `flashChips` lights from the
slider's own trigger pulse.

### Tempo tracking
A separate, additive layer at the END of `audioTick`: `audio.tempo = {period, bpm, anchor, conf}`,
`beatEta(now)`, `beatPhaseAt(now)`. `tools/tempoprobe.js`.
- PERIOD from autocorrelation (4×/s, `TEMPO_EVERY`), PHASE from a PLL.
- **The octave rule has three parts**: a WIDE log-Gaussian bias toward ~120 BPM (`tempoPrefW`
  2.2); prefer the shortest sub-multiple scoring `OCT_SUB` of the peak; compare INTERPOLATED peaks
  (`lagPeak`), not raw bins.
- The envelope is SMOOTHED (`tempoSmooth`, ~50ms) before correlation.
- Confidence is the NORMALISED correlation; below `CONF_MIN` nothing is published and
  `beatEta`/`beatPhaseAt` return −1.
- Predictive firing fires off the COUNTDOWN, never a grid index; window `max(lead, HOP_MS)`, half-
  period refractory. `lead` and `lock` ship NEUTRAL in `BEAT_DEFAULTS`, resolved by `tuneEff`, so
  old scenes detect tick for tick.
- `PULSE_PRE` shapes take `beatPhaseAt` (`f(1)=1` = peaks on the beat), falling back to Snap with
  no lock; `drawPulsePlot` follows (`tools/tempoui-check.js`).

**Global beat tuning** lives in `#beatDetails` (per-preset scene data). `beatChanged` must not
`persist()`; `beatReset` persists by hand. `RNG_ORIG`/`refreshRangeUI` skip `#beatDetails`.
`beatUi` is a `var`. `applyPreset` rebuilds the sliders — references across a switch are detached.

### Dev tools, nudge, tutorial
- Beat trace: `?debug=1` or the Beat tuning checkbox (`dbgInit`). `H` drives the fps counter via
  `body.ui-hidden`. Persistence opt-out is `data-nopersist`.
- `#syncpop` shows to users who haven't started audio at `SYNC_DELAYS` (30s, 5min, 1h), max 3
  ever, state in `burnTheWeb.sync.v1`; `showSyncPopup()` returns whether it opened and the caller
  only spends a showing when it did. `track(name, params)` is provider-agnostic; GA4 is live
  (`GA_MEASUREMENT_ID`; `""` makes it inert).
- **Tutorial** `#tutdlg` (`src/ui-tutorial.js`, before `ui-menubar.js`): `TUT_STEPS`; also ☰ →
  Tutorial. **Music is step TWO on purpose.** Own key `burnTheWeb.tutorial.v1`, written when it
  OPENS. Opens after the credits (`creditLeft <= 0`, `TUT_MAX_WAIT` 20s backstop). Holds the sync
  nudge (interval returns early on `tutorialOpen()`, `showSyncPopup` refuses; `closeTutorial`
  calls `syncResetDelay()`). `armAudioResume`'s listener skips it without `cleanup()`.
  `tutorialOpen` and `syncResetDelay` are function DECLARATIONS; `tutorialOpen` looks the node up.
  Only the step body re-renders; the `<h2>` text is constant.

### Timing & determinism
`frame()` runs every rAF; the fire sim is a fixed accumulator tick (`cfg.burn`, capped 4/frame).
Phase clocks accumulate per tick from the live speed. Clicking the canvas toggles `paused`.
Chaos game uses a mulberry32 PRNG re-seeded to `SEED` every frame; auto-morph uses `Math.random()`.
Julia: `reseedJulia()` on every entry (random lap when `randSeed` is on). Attractor jitter (`atjit`)
uses `Math.random()`, guarded by `jit > 0`; don't add a fixed-seed toggle for it.

## Config & control gotchas
`cfg = { points, speed, decay, scale, burn }`. `bindRange(id, valId, fmt, apply, durScale, beat)`;
`ui()` reads `lo.min`/`lo.max` live; a range spanning more than 1 shows at most one decimal
(readout only).
- Flame rise: `decay = 128 * R / (R - 1)`. Drift speed ÷ 100 → `cfg.speed`. Rotation deg/s →
  `rotSpeed`, accumulated into `spinAngle` per tick.
- Tetrafyer: `Rotation` yaws; pitch is `nodAmp·sin(nodPhase)`; `nodPhase` accumulates per tick
  (`NOD_RATE · nodSpd · cfg.speed / cfg.burn`), never `0.12·simT`.
- Palette bakes into a `Uint32Array` in little-endian ABGR. Banding is a filter over the palette.
- A preset switch always blends the palette in from what was on screen; the target is a random
  palette when cycling, the stored one when pinned (`beginMorph(fromRamp, …)`, `morphOnce`).
- `cfg.scale` changes need `resize()`. Reset restores the current effect's maps AND the shipped
  bounds (`rngShipped` before `loadState`, then `rngSyncAll()`).

## Testing (no framework — headless verification)
- Syntax check each script with `new Function`. Assertion probes inject a `<script>` into a temp
  copy; screenshot with `msedge --headless=new --screenshot=out.png --virtual-time-budget=N
  file:///C:/…` (a Git Bash path is not a `file://` URL). Results via a result `<div>` styled
  `position:fixed;inset:0;background:#fff;color:#000` or `console.log` with
  `--enable-logging=stderr --v=0` (`--dump-dom` returns nothing). Add `--disable-extensions`.
- `{bubbles:true}` on synthetic events; seed `localStorage` before the app; auto-morph off before
  asserting palette; analytics inert on `file://`.

**Headless runs WebGL2 on the REAL GPU by default — prefer that** (drop `--disable-gpu` and the
SwiftShader flags). Assert `gl.getError() === 0` inside a real frame and a console-error count of 0.
SwiftShader (`--enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader`) is the fallback
and the bit-reproducible pixel gate; under it virtual time only advances when the queue drains:
do not add a layer from a probe; the default scene is a four-layer stack (stop auto-cycle, or stub
rAF for DOM-only probes); bound every drive loop; kill stray `msedge*` incl. `msedgewebview2`.

**A probe-generator script must contain no backtick** in injected source inside a template
literal (the previous probe page is silently reused); `\n` there becomes a real newline. Check the
generator printed its "wrote" line. **The app is one IIFE** — DOM/localStorage assertions from the
page; internals need a Node probe that slices the source. Test CSS regressions in a bare page with
`styles.css` inlined; prove sensitivity by re-appending the old rules.

**Screenshotting ONE effect**: strip the layer's filters first (a switched effect keeps its chain);
set the Transition slider to 0; a WebGL canvas cannot be sampled after compositing (the screenshot
is the evidence); layer rows are a fixed pool (filter on `offsetParent !== null`); the row ✕ raises
`confirm()`; turn auto-cycle off and assert the effect is still the one under test; `?stack=` does
not survive a fresh profile; keep runs under 30s or the nudge opens; `?credits=0` doesn't clear
credits in a slow run.

**The pixel gate is BISTABLE** — re-run a mismatch 2–3 times. Pixel gates: shader effects only,
owned rAF queue, fixed 1/60 step, stubbed `Math.random`, `readPixels` in the same task, injected
into `<head>`, never clear the rAF queue.

**`fract(sin(x)*43758.5)` IS NOT A HASH, IT IS A DRIVER-BUILD DETECTOR** — the driver recompiles
in the background and two builds give two values (the v1.55.x ghost Glass ball). **Any per-frame
value that must be identical across frames may not come from a GPU hash**; hash on the CPU and pass
uniforms. When a fence is free and a ghost survives it, the two pictures are two computations.

**A driver PRESENTATION bug is invisible to every check that reads the frame** (NVIDIA D3D11 on
G-Sync re-presented a stale swapchain buffer): fix is an explicit `gl.clear` on the default
framebuffer before the final `FS_COMP`. **Do not "fix" it with `preserveDrawingBuffer: true`.**
Vary the thing between the frame and the eye (WARP test) early.

**A synchronous stall is invisible to every headless check except the wall clock**
(`--virtual-time-budget` waits through it). `tools/startup-check.sh` fails past 20 s; `/deploy`
runs it. **A CSS transition does not advance under virtual time** — set `transition = "none"` and
measure the rule. **A check's `ok(name, cond)` must hard-fail on a non-string first argument.**
**"Nothing happened after I toggled X" is almost always insensitive** — assert from the boot state
and always run the negative control (`tools/foldcycle-check.js`; browser checks are not named
`*probe.js` because `/deploy` runs `node tools/*probe.js`).

**THE FRAME IS NOT CPU-BOUND** (worst case ~4.2 ms of 16.7 at 4K on the 4090; LUT caching, palette
gating, `updateAnims` stubbing and the transition double-render all measured at zero gain). If
performance matters the work is in `FS_*`, never per-frame JS. **`tools/perf-check.js`** measures
per-effect GPU/CPU cost in REAL time; `--disable-gpu-shader-disk-cache` and compare cold with cold;
a cheap shader measured alone reads slow (GPU power state) — run a heavy effect first; the
instrument resolves milliseconds, not tenths. Volumetric clouds renders at HALF RESOLUTION
(`halfRes: true`, `glTex.halfLayer`); distance-tapered octaves and a jittered march were both
A/B-rejected. `tools/pixgate.js` proves "free"; `tools/abshot.js` takes same-frame A/Bs.

**The Ocean surface is a compile-time define, one program per surface** (`SURF_SINE`/`SURF_SEA`/
`SURF_SWELL`/`SURF_NOISE`, `W_`-prefixed in the world, `|s2` in the key). Plain flags, never
`SURF == n` (dead functions in one shader made surface 0 4× slower). `worldcompile-check` compiles
19; `pixgate` holds surface 0 bit-identical.

A green logic probe is necessary, not sufficient, for retained heat — drive real frames and look.
**Credits**: read `#creditcv` itself; assert zero heat with credits up; use ink bounding-box height;
step a stubbed rAF under 250ms (`frame()` clamps `dt`); compare pixel counts only between identical
strings. **Audio tests need `AudioContext` stubbed** (`sampleRate`, `resume`, `createAnalyser`,
`createMediaStreamSource`, analyser with `fftSize`/`frequencyBinCount`/`getFloatFrequencyData`/
`min|maxDecibels`) plus a no-op rAF. **Share tests need three stubs** (clipboard `writeText`/`write`,
`fetch`); run twice, once with `ClipboardItem` hidden.

### Node probes (`tools/*probe.js`)
All slice real source out of the built file by **markers — keep them** (each probe's header names
its own). What each pins:
- **`filterprobe`** — defaults, stage order, `cpuOk`, registry-order application, `filtersOk`,
  per-effect copies, empty stored list honoured.
- **`presetprobe`** — `applyPreset`/`snapshotScene`/import mapping agree in BOTH directions
  (`layers` exempt; comments stripped before matching `p.<key>`); every per-effect map in
  `EFFECT_MAPS`; `mergeBeatTune`; `safeFileName`; `normalizeBackup`; `ensureSelection` sites.
- **`heatprobe`** — ping-pong parity for `glBeginHeat` and `glLayerBeginHeat`.
- **`juliaprobe`** — seed geometry, once-per-frame advance, `locusEsc` vs references, ship locus.
- **`solidsprobe`** — containment, quaternion normality, `Shape mix`/`Count` bounds, ownership,
  determinism (double-exact on bodies, float32 tolerance on uniforms; strip comments first).
- **`beatprobe`** — real detector on synthetic spectra; per-slider tuning tick-for-tick identity;
  drains via the real `clearBeats`. The fixture is tuned (rising carrier for a non-zero median).
- **`singleprobe`** — `SINGLE_KEYS` is exactly the intended 23; collapse behaviour.
- **`galaxyprobe`** — arms trail and stay arms, measured as arm sharpness, not swept angle.
- **`tintprobe`** — tint is a property of the layer across every reorder/delete; hands the slice
  out of a `new Function`, not `eval`.
- **`slimeprobe`** — drift of a 3×2 block map (not per-cell churn), determinism, field on layer.
- **`palprobe`** — frozen `PAL_IDS`, codec round trip, deletion fallback never a tombstone.
- **`uiprobe`** — dialog invariants from one table; `setOff`; one-layer floor before `confirm`.
- **`stackprobe`** — stack-item lifecycle invariants; `fullSnapshot`/`applyBlob` key symmetry.
- **`shareprobe`** — share codec round trip. **`cloudprobe`** — cloud shares the codec; empty
  apiKey ⇒ zero requests. Plus `docsprobe`, `worldprobe`, `glassprobe`, `asciiprobe`,
  `dnutprobe`, `treeprobe`, `tempoprobe`, `heatprobe` and the browser `*-check.js` gates.
