# CLAUDE.md

Rules for this repo. Deliberately terse — nearly every line is load-bearing, and **"don't X"
means X was tried and failed**. Rationale, evidence and war stories were stripped in two
compaction passes: `git show v1.12.3:CLAUDE.md` and `git show 1d0eb06:CLAUDE.md` have them.
Before overruling a rule here, read the old text first.

## What this is

Self-contained demoscene visual on GitHub Pages, served at https://kicktro.com/.
Effects share one palette + glow + banding + beat-reactive pipeline, in four families:

**This list is COMPLETE and `tools/docsprobe.js` keeps it that way** — it had drifted twelve
effects behind the registry, which made a taxonomy that reads as exhaustive into a map missing a
fifth of the territory. The probe also holds README.md to the same rule, and to its own stated
count. Add an effect ⇒ add it here and there, in the same commit.

- **Point-accumulation** — Sierpiński (`sirpinfyer`), Tetrahedron (`tetrafyer`, called
  "Tetrafyer" throughout the older notes below), Attractor (de Jong), Fractal flames
  (`flames`, the one **additive** stamper — `stampAdd`), Boids, Slime mould (`physarum`),
  Curl flow (`curl`), Harmonograph, Galaxy, Trees, Flying ribbons (the one that **rasterises
  geometry** — see its own section).
- **Shader fractals** — Julia, Burning Ship, Multibrot, Newton.
- **Shader pattern** — Plasma, Tunnel, Metaballs, Kaleidoscope, Rotozoomer, Moiré, Munching
  Squares, Copper Bars, Sun surface, Kefrens bars, Twister, Cymatics, Lightning storm,
  Starfield, Aurora, Reaction-diffusion, Voronoi cells (`voronoi`), Flow noise (`warpnoise`,
  domain-warped fbm), Truchet tiles (`truchet`), God rays (`godray`), Cellular automata
  (`automata`, Life-like B/S rules on its own coarse state pair — `glTex.ca`, the
  Reaction-diffusion arrangement; a torus via REPEAT; age fades LINEARLY because 8-bit
  multiplicative decay never reaches zero).
- **Shader SDF** — Polygon, Shape grid, Concentric rings, Bouncing shapes, Bouncing solids,
  Mandelbulb, Menger sponge, Apollonian gasket (`apollo`, built by **inversion**, not by
  iterating a power), Mandelbox (`mbox`, **box folds** — hard-edged where the bulb is organic),
  Gyroid (`gyroid`, a triply-periodic minimal surface, NOT a fractal and the cheapest 3D effect
  here), Smooth CSG (`csg`, IQ smooth union/subtraction over (brightness, distance) pairs so
  the tone melts across a join as the surface does — after the godotshaders demo; the cast is
  HASHED ON THE CPU from Seed/Objects and shipped as uniform arrays, never a GPU hash), Terrain (`terrain`, a height field with Ocean's distance-scaled step law), Volumetric
  clouds (`clouds`, the one that integrates **density** along the ray rather than looking for a
  surface) — everything from Bouncing solids on is 3D raymarched.

Each = one `EFFECTS` descriptor + a `draw(dt)` shader hook or a `stamp(box)` point hook. No
package manager, test framework or runtime dependency. Keep `README.md` in sync.

## Build

- **Source of truth is `src/`.** `styles.css` + `*.js` concatenated in **`src/manifest.txt`
  order** into `dev-index.html`. That order is load-bearing (TDZ + forward refs) — don't reorder.
  Files named by subsystem: `audio-*`, `render-*`, `effects-*`, `orbit-*`, `persist-*`, `stack-*`,
  `controls-*`, `ui-*`.
- **`src/config.js` loads first, holds `CONFIG`** — every default not part of a preset. Scattered
  `const NAME = CONFIG.path` keeps original names; change defaults THERE. `PALETTES` is the single
  palette catalog.
- **Never hand-edit `dev-index.html` / `index.html`.** `node tools/build.js` rebuilds byte-for-byte
  (split/join, never `String.replace` — `$` corrupts JS); `--check` exits non-zero if stale.
- **Deploy with `/deploy`**. `index.html` = production, `dev-index.html` = preview; probes run
  against the preview.
- **Every deploy is a numbered release.** `CONFIG.version` is the only version string; `/deploy`
  bumps it, writes the `CHANGELOG.md` section, tags `v<version>` (push the tag). A version with
  **no tag** is prepared-but-unreleased — publish *that* one, don't bump past it. **major = a
  saved scene / share link / backup stops loading identically**, which must never happen: patch
  for fixes, minor for a new effect/filter/control. `CHANGELOG.md` is user-facing (linked live).
- **Pages deploys via `.github/workflows/pages.yml`** (Actions), not the legacy branch builder.
  Status + logs: Actions tab.
- `.gitattributes` pins LF (global `core.autocrlf=true`).

## Workflow

- **Always commit and push after a verified change**: edit `src/`, `node tools/build.js`, commit
  **`src/` + `dev-index.html`** together, `git push origin HEAD:main`. Don't ask first.
- Commit trailers end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
  + the `Claude-Session:` line.
- Preview: open `dev-index.html`, or `python -m http.server`.
- Don't re-run `gh api -X POST repos/carlemil/kicktro/pages`.

## Architecture (one IIFE, authored across `src/*.js`)

### Render pipeline — WebGL2 primary, Canvas2D fallback
`useGL` from `initGL()`; every draw path branches on it.
- **Fire**: low-res heat grid. It is a **feedback FILTER** (`FILTERS` id `fire`), so its pass runs
  from `glBeginHeat`/`glLayerBeginHeat` like every other one, ping-ponging the heat textures
  (cgtutor averaging `v = sum_of_4_below * 32 / decay`; `>128` decays, `<128` amplifies). CPU
  fallback = the double loop in `beginHeatTick()`.
- **Chaos-game points stay on the CPU** (deterministic): `pushPt()`/`glBlitPoints()`, or `plot()`.
  (`glDrawPoints`/`glEndHeat` were the single-layer close and are **gone** — `simulate()` is
  reached only from the frame loop's `if (!useGL)` branch, so the GL half of them was dead. The
  GL point path closes its own tick inline after every item has blitted.)
- **Shader effects** write heat to the texture's `.r` (`o = vec4(heat,0,0,1)`), each with a CPU
  mirror. Each has an `FS_*` + `glProg.<id>` registered in `initGL`; `draw(dt)` calls
  `glShaderDraw(name, setU)` or the mirror. `*Seed(dt)` advances phase (identical GL/CPU).
- **Adding a shader effect = append one descriptor** (`FS_*`+`glProg`, `draw`/`cpu`,
  `params`/`defaults`). Sliders generate from `CONTROLS`.
- **Glow**: `glRender()`/`render()` map heat through the palette, then composite an additive
  blurred copy.

### Cardioid seed orbit (Julia / Burning Ship / Multibrot)
- All three call `juliaSeed(dt)` **once** in `draw`; `julia`/`burningShip`/`multibrot` must
  **never** call it themselves.
- `juliaSeed` = rim point on the scaled main cardioid + a riding circle of radius `juliaInnerR`
  at `ratio ×` the outer phase.
- **The cardioid depends on the exponent**: `d=2` ⇒ Mandelbrot cardioid, else the degree-d
  Multibrot boundary `c = z − z^d` on `|z| = d^(−1/(d−1))`. `cardioidAt(th, d)` is that curve,
  **integer d only — it doesn't close otherwise**; fractional d rides `cardioidBlendAt` (blend of
  the two neighbouring integer cardioids, pushed out by **`JULIA_FRAC_BOOST` 0.3 windowed by
  `4·f·(1−f)`**, zero at whole powers). `juliaPower` is a **FLOAT**, taken raw by the render;
  `setEffect` resets it to 2; Multibrot's `draw` sets it from `mbPower` **before** `juliaSeed`.
  Integer d stays bit-identical to the old hardcoded form.
- Easing: each step × `EASE_K · (1 + JULIA_EASE_A·cos((round(power)−1)·θ))` — the cusp count
  **must stay whole**. **`EASE_K = 1/√(1−A²)` is load-bearing** (lap time `1/rpm` at any power).
  Warp applies to the **outer phase only**, symmetric about θ=π.
- `juliaPower` is declared **above `juliaEase`**. `juliaSeedAt` stays unwarped; the Orbit editor
  **integrates** `dφ = ratio·dθ/ease(θ)`.
- **Burning Ship rides the "wrong" cardioid deliberately — do not "fix" it.** Shipped `outrad`
  **[1.4, 1.9]** compensates; washed out ⇒ check that slider first.
  - **That rule is about the seed PATH, and nothing else.** It is *not* a licence to draw the
    Mandelbrot set behind it, which is a separate decision and was simply wrong: Burning Ship's
    connectedness locus is its own set (`locus: "ship"` on the descriptor). On the shipped path
    at `outrad` 1.4, **17 of 72 sampled seeds fall inside one set and outside the other** — the
    editor drew the seed comfortably clear of a set it was well inside. Same failure the
    Multibrot backdrop already fixed.
- `tools/juliaprobe.js` locks this down.

### Effects that read the layers BENEATH them
**`glBelowTex` is the one seam** (declared beside `glColorTex`): `renderStackColor` points it
at `glTex.color[acc]` — the OKLab accumulator holding every layer merged so far — immediately
before each `renderLayerHeat`, and **nulls it after the loop**. It is null for the bottom-most
live layer and for the whole single-layer path, so an effect reading it MUST have a fallback of
its own; Glass ball's is a procedural room, and an effect whose subject is reflection renders as
a flat disc without one.
- It is a **COLOUR** texture and effects write **HEAT**, so all an effect can take from it is
  **luminance**. Reflecting the colour would mean an effect that outputs RGB — a different
  pipeline. Brightness through the reading layer's own palette is the version that fits.
- The sampler must be bound to a **complete** texture even when the shader will not read it
  (`bindTexUnit(3, glBelowTex || glTex.native)`), with a `uHasBelow` float switching the branch.
- **Do not paint the environment outside the subject** when `uHasBelow` is set: that repaints
  the layer below in this layer's palette, which HIDES it rather than reflecting it.

**Ocean is MARCHED, not projected.** The first version solved one plane hit and displaced
only the shading normal — a crest could not hide the trough behind it and the horizon was a
ruler-straight line at any sea state. It now steps the height field geometrically (near water
needs fine sampling, far water is a few pixels) and takes ONE secant step at the crossing; a
bisection loop is not worth it at that spacing. **Two octave counts on purpose**:
`WAVE_OCT_MARCH` (3) for the silhouette, all six for the shading normal — the fine chop moves
the silhouette by under a pixel and paying for it 32× per ray is the whole cost. Wave height
is capped at `CAM_H*0.55`: a swell taller than the viewpoint puts the camera underwater, the
march never crosses, and the frame goes to sky. **The CPU mirror keeps the flat plane** and
says so — 32 steps × 3 octaves is a shader's budget, not a JS loop's.

### The shared 3D world (layers traced as ONE scene)
Layers are independent full-screen passes; `glBelowTex` lets one READ what is beneath it, but
that is screen-space — one-directional, no occlusion, no contact line. **`FS_WORLD` traces
several layers' geometry together**, so a Glass ball reflects in the Ocean *and* the Ocean
reflects in the ball. Opt-in per layer (`world`, **default off**), so every scene saved before
it renders unchanged.
- **The output is a G-BUFFER, not a picture**: heat in `.r`, object **ID** in `.g`. `FS_WORLDPICK`
  then hands each layer only its own pixels, and everything downstream — feedback, palette, post
  chain, OKLab merge — is untouched. **That is what keeps per-layer palettes.** `glTex.world` is
  **NEAREST** (interpolating two IDs invents a third), the compare is `step(|g*255 − id|, 0.5)`
  (anything looser bleeds heat between palettes), and **ID 0 is "nothing hit"** so no layer holds it.
- **A joined layer's `fx.draw(dt)` never runs**, so `glWorldDraw(plan, dt)` is the ONLY place its
  clock still advances. Passing 0 renders perfect geometry that never moves — shipped that way
  once; it reads as a paused scene, not a missing argument.
- **A placed SDF is `de_local((p − offset)/scale) * scale`.** Drop the multiply and the marcher
  steps in local units through world space, overshoots, and punches holes in the object.
- **The camera is the OCEAN's** (`(0, CAM_H, 0)`, +z, −0.30 tilt) — the only participant with a
  ground and a horizon. `FS_WORLD` still goes through `camProg`, so the **lowest joined layer's**
  camera group orbits the whole world and no control stops working.
- **TWO marches, not one**: the SDF union is sphere-traced, the Ocean is a height field with a
  geometric step law, and the nearer hit wins. Occlusion falls out of that comparison.
- **Reflected light lands in the REFLECTOR's layer** — water seen inside the ball is tinted by
  the ball's palette. Same rule `glBelowTex` follows; it is what makes a split by primary-hit ID
  coherent.
- **Reflection composites with `mix`, not `+=`.** Adding it means a mirror image landing on a
  bright ripple clamps out and vanishes: the ray was hitting the ball perfectly (verified by
  outputting the hit test alone) and the picture showed nothing. Its `uReflect` is also
  two-part — physical up to 1, lifting toward a flat mirror above — because at this camera
  height the near sea is viewed far too steeply for the honest amount to read.
- **THE OTHER ~72 PROGRAMS *ARE* BUILT AT STARTUP, AND THAT IS FINE — MEASURED.** The obvious
  follow-up to the v1.37.0 story is "make the ten raymarchers lazy too". It was measured and
  it is NOT worth it: whole cold boot is **4 s wall**, and an A/B with all ten raymarcher
  `camProg` lines deleted moved it by at most ~1 s against ±1 s of run-to-run noise. The
  prize was bounded at 2–3 s to begin with, not 64. Moving them off boot would also remove
  the only thing that catches a typo in a raymarcher — `glCompile`/`glLink` THROW at boot and
  `breakout-check` asserts zero console errors, and no probe cycles every effect and renders
  it. **Do not reopen this without a sub-second timer** (`startup-check.sh` reports whole
  seconds, so it cannot resolve the question it would be asked).
  - `makeProg` compiles `VS_QUAD` **once** now (`vsFor`, keyed by source) and deletes each
    fragment shader after linking. Correct, but **not a speed-up**: boot stayed at 4 s. The
    1 s readings taken while proving it were a **dead page** — a TDZ crash meant `initGL`
    threw before compiling anything. A page that fails early looks exactly like a fast one to
    a wall-clock gate.
  - `vsCache` is a **`var` with no initialiser**, for the reason the next bullet gives.
- **THE WORLD PROGRAM IS NEVER BUILT AT STARTUP.** The driver's backend optimises everything
  `worldMap` can reach, not what a frame uses, and the cost compounds — synchronously, at boot,
  which is the hang v1.37.0 shipped.
  **MEASURED, cold cache, on the dev 4090** (`tools/worldlink-check.js`; the older 3.5/25/64 s
  figures here predated the `W_GBN` and `#if` fixes and were never re-taken, so they were
  understating it by half):

  | combination | link | | combination | link |
  |---|---|---|---|---|
  | ocean only | 0.1 s | | glass+solids | 19.8 s |
  | solids | 0.9 s | | glass+qjulia | 17.6 s |
  | qjulia | 0.8 s | | glass+solids+qjulia | 47.6 s |
  | vballs | 1.1 s | | glass+vballs | 28.5 s |
  | solids+qjulia+vballs | 3.4 s | | glass+solids+vballs | 65.6 s |
  | **glass alone** | **7.7 s** | | **all five** | **133.8 s** |

  **GLASS IS THE WHOLE COST.** Every combination containing it is 7.7–134 s; every combination
  without it is under 3.4 s. Anything that enlarges what `glassDE` or the glass material can
  reach is paid sixteen times over, which is why **a second reflection bounce was costed
  against this table and never attempted** — the combination it would target (glass alone) is
  the one already at 7.7 s, and the bounce roughly doubles what the backend must inline.
  `worldcompile-check` cannot see any of this: it compiles and deliberately never links.

  **Two changes measured NOT to help, both reverted or left alone.** The ball loop bound (5→3)
  moved the five-way by less than the run-to-run noise. A bounding sphere on `glassDE` — the
  one CLAUDE.md used to list as missing — moved the sixteen-program total the WRONG way
  the WRONG way, and the attribution is clean because it was measured three times: **399 s
  baseline → 472 s with the sphere → 407 s with it reverted**, the material change (which
  stayed) accounting for the ~8 s between first and last, i.e. nothing outside the noise.
  Its frame benefit could not be demonstrated at all. Beware measuring that
  benefit on the standalone Glass ball: `FS_GLASS` is analytic and never calls `glassDE`, so a
  before/after there compares a shader to itself. Frame time has ~4× headroom anyway; link time
  does not, so the trade was backwards.

  **Run-to-run variation is large** — individual combinations swing ±15% and glass-bearing ones
  further. Compare totals across a whole run, never single entries, and re-run before believing
  a small movement in either direction. (Not loop unrolling: rewriting every march bound as a uniform changed
  nothing.) Two fixes, both needed. **`#if W_GB/W_SD/W_QJ/W_VB` gate every group** and
  `worldProgFor` assembles one program per COMBINATION, so two effects never pay for the other
  three; and the link is **asynchronous** via `KHR_parallel_shader_compile` —
  `COMPLETION_STATUS_KHR` is polled and `LINK_STATUS` is not read until it says done (reading
  it early IS the stall). `planWorld`'s result is dropped while the program is pending, so the
  joined layers draw themselves for a few frames and the world appears when ready.
- **`glWorldMix` WRITES A THIRD BUFFER (`glTex.worldMix`) AND RETURNS IT.** It reads the pick,
  which lives in `glTex.layer`, so it may not target `glFbo.layer` — that is the same texture,
  and WebGL2 rejects a draw that samples its own colour attachment. It did exactly that for
  three releases and the draw was **silently dropped**: joining a world read as a cut, and
  LEAVING one showed the layer black for the whole 0.45 s (that branch clears `glTex.layer`
  first, then mixes into nothing). `renderLayerHeat` therefore tracks `outTex` and everything
  downstream reads THAT, never the global. **`tools/world-check.js`** is the gate — neither
  `worldprobe` (static source) nor `worldcompile-check` (compiles, never runs a frame) can see
  a rejected draw, and it is invisible to a screenshot.
- **The handover is a CROSSFADE, not a cut.** `L.worldFade` (transient, on the layer object,
  `WORLD_FADE_S` 0.45 s each way) eases toward 1 while the layer is in a *ready* world and
  toward 0 otherwise; strictly between, `renderLayerHeat` renders BOTH — the own draw into
  `glTex.worldOwn` (swapping `glFbo.layer` for the call, since `fx.draw` writes it and the
  pick needs it), then the pick — and `FS_WORLDMIX` blends them in heat space so it is one
  picture becoming another rather than two added. **Clock rule**: while a world is live the own
  draw gets `dt` 0 (the world pass already advanced the layer's clocks); with no world ready it
  gets the real `dt` and captures. A layer with no fade state **snaps** to its side, so a
  scene that loads already joined does not fade in from black.
- **`worldProgs`/`worldPar`/`worldVs`/`worldFsBase` are `var` WITH NO INITIALISER**, and both
  halves cost a bug. `initGL()` is called from `palette.js`, two slices above the pipeline: a
  `let` is a TDZ crash (blank page), and a `var` *with* an initialiser is worse because it
  fails silently — initGL assigns, the declaration line runs later and wipes it, and the
  shader compiles from an empty string (`1:1 syntax error` every frame, black canvas). Every
  `FS_*`/`VS_QUAD` is **local to initGL**, which is why it hands the sources out.
- **The world shader is SIXTEEN shaders.** A brace that is only unbalanced when a group is
  ABSENT compiles fine in every manual test that has it present — `W_GB=0` shipped with an
  unclosed `else {` for three releases, and every world without a Glass ball died with
  `0:398 syntax error` on every frame, silently (a failed link draws nothing). `worldprobe`
  preprocesses all 16 and counts braces; **`tools/worldcompile-check.js` compiles all 16 on
  the real GPU** and `/deploy` runs it. When editing FS_WORLD, run that, not a screenshot of
  the one combination you happen to be looking at.
- **Quaternion Julia carries its own orientation** (`qjpitch/yaw/roll` + `qjtumx/y/z`, rates
  accumulating into `qjTx/Ty/Tz` on `PHASE_VARS`): with the world's camera fixed it is the only
  way to turn the solid. It applies in BOTH modes — `qjOrient()` in `FS_QJULIA`, the same three
  rotations in the same order inside `qjuliaDE` in the world — so a scene set up standalone
  keeps its pose when it joins. `worldprobe` asserts the order matches.
- **`WORLD_KINDS` is the roster**: `ocean`, `glass`, `solids`, `qjulia`, `vballs`. One layer
  per kind — **except GLASS, which is multi**: every joined Glass ball layer is its own group
  (up to `STACK_MAX`), with its own ID, placement, clock and material, so two glass layers
  reflect each other at their true positions. The uniforms are arrays; `glassDE` returns
  `(dist, groupIdx)` and the shading indexes the hit group's material. **The glass COUNT is
  baked into the program key (`gb2|oc`) as `#define W_GBN`** — a uniform loop bound made ONE
  glass layer link like four (12 s against 3.5), because the backend optimises for every
  group a loop can reach. The interior flights can never be added, and `worldprobe` asserts
  their absence by name.
- **The `world` tick's single writer is its own change handler**, writing `stack[slot]` (the
  layer the checkbox BELONGS to) from `e.target.checked` — never `stack[stackSel]` from the
  selected block's node. `captureLayerExtras` must NOT read it back from the checkbox:
  `applyLayerExtras` repaints checkboxes from the incoming layer, so a freeze could capture a
  value another selection had just painted over and a tick silently unticked itself. The
  `worldChk` setter writes ONLY the selected block (`paintBlock` maintains the others).
- **A reflected glass ball shows its MATERIAL but not the scene.** `shade0` — where a reflection
  ray ends — used to return a flat lambert for glass, so Metal, Glass and Bubble came back as the
  same featureless sphere and `uGbMat`/`uGbIor` were ignored one bounce out. It now does a
  fresnel-weighted `skyOf(reflect(...))`, which is free: the normal is already computed for the
  face term and `skyOf` touches no `worldMap`. Its environment is still the SKY, not the scene —
  balls do not contain each other. That needs a second bounce; see the link table above for why
  there is not one.
- **WORLD REFLECTIONS DRAPE THE FILTERED PICTURE, ONE FRAME LATE** (`uBelow`/`uHasBelow` on
  `FS_WORLD`, texture unit 2). Standalone Glass and Ocean both read `glBelowTex`, so before the
  world program finished linking the balls reflected the ocean WITH its filters — and the moment
  the world landed they switched to procedurally shaded water and the filters dropped out. That
  read as a bug and was reported as one. `FS_WORLD` had no sampler at all.
  - **It has to be last frame's.** `glWorldDraw` runs BEFORE the layer loop (a joined layer's
    heat is a slice of the world), and the accumulator is cleared four lines later, so nothing
    is coloured or filtered yet when the ball is shaded. `captureWorldBelow` blits
    `glTex.color[acc]` into `glTex.worldBelow` at the one moment it is right — where
    `glBelowTex` is assigned for the LOWEST JOINED GLASS layer — and the world reads it next
    frame. Capturing an accumulator that already contains the balls is a hall of mirrors.
  - **`worldBelowOk` is reset to false every `renderStackColor`** and set only by a capture, so
    a frame with no joined glass (or glass on the bottom, nothing beneath it) cannot reuse a
    stale picture. `var` with no initialiser, the `worldProgs` rule — `glResize` writes it from
    an earlier slice. Half res (`wbW`/`wbH`), RGBA8 LINEAR, its own texture: `glTex.prev` is the
    transition's and `worldOwn`/`worldMix` are R8 heat.
  - **The seam is `envRay`, NOT `shade0`.** `shade0`'s ocean branch also shades the PRIMARY
    ocean hit, so sampling there repaints the water with the layers below it — the same
    'hides it rather than reflecting it' trap `glBelowTex` already carries a rule about.
    `envRay` is the reflection-only entry and sits outside every `#if` group, so all sixteen
    programs get it and no brace can unbalance.
  - **Water and empty sky come from the picture; SOLIDS keep their own shading**, so a ball
    reflected in a ball still reads as a ball. The trace still decides which of the three a ray
    found, so occlusion, the horizon and every silhouette are unchanged — only brightness moves.
    `uOcId` is 0 with no ocean and 0 is the reserved 'nothing hit' id, so the test cannot fire
    on a real hit in a waterless world. No distance fade in `envRay`: the ocean caller divides
    by its own primary fade and glass applies none, which is what standalone does on both sides.
  - **The projection is the CRUDE DIRECTIONAL one standalone uses**, deliberately. A true
    screen-space reflection is available (the camera inverts cleanly) and is WORSE: a mirror
    ball reflects a hemisphere the camera never saw, so it would be filtered over the wedge
    that happens to be on screen and unfiltered everywhere else, with a moving seam between.
    Parity with standalone is the goal; the fake is what produces the wanted look.
  - **`tools/worldbelow-check.js` is the gate, and it needs REAL TIME.** The whole feature is
    one identity test (`L === worldPlan.gbs[0]`); if it never matches, nothing errors, the
    picture is plausible and `worldprobe`, `worldcompile-check` and `world-check` all stay
    GREEN, because none of them can see whether a uniform was ever set to 1. It counts the
    capture and the uniform and ships a NEGATIVE CONTROL page that neuters the capture call.
    Run it with **no `--virtual-time-budget`**: until the program links there is no world and
    no capture, and a virtual clock blows straight through any `setTimeout` while the driver
    is still really linking — a timer version reported 0 captures against correct code.
  - Link cost measured both ways under one command: **512.3 s baseline vs 582.9 s after**,
    +13.8% on the total, inside the ±15% band, with individual combinations moving BOTH ways
    (gb+sd 28% faster, gb 50% slower). Compare totals; single entries are noise.
- **Only the Glass ball traces secondary rays.** The others shade exactly as they do
  standalone; they are in the world to be SEEN in its reflections and to occlude it. Giving
  them reflection rays would double the trace for materials that never had one.
- **Quaternion Julia tumbles the OBJECT, not the camera.** Standalone it orbits its camera
  about the solid; in a shared world the camera belongs to everyone, so the same rotation has
  to move the object or the whole scene swings with it. Its DE also returns the distance to
  its **bounding sphere** outside |q| = 2 — a valid bound, and what stops the marcher crawling
  through vacuum. That return path needs the placement multiply too; it is the easy one to
  miss because it reads as an early-out rather than as a distance.
- **Vector balls needed new geometry.** Standalone it is a projected sprite rasteriser with no
  distance function at all — it z-sorts discs. In the world its bobs become a sphere union
  (`vbForm` already supplies the centres), behind a **bounding sphere** so the 48-iteration
  loop is skipped for the empty space that is most of the march. The sprite path stays: the
  cheap projection IS the Amiga look.
- GL only — the Canvas2D fallback renders one item. `tools/worldprobe.js`.

### Doughnut / Trees (the two effects with a cheap invariant worth pinning)
- **Doughnut** needs no DE-escape solver — unlike the Mandelbulb the free space is known, so the
  path is the tube's centre circle plus a wobble capped at `DN_WOB` 0.30 of the tube against a
  wall floor of 0.743. **`dnflute` is `single`; `dntwist` is a FREE float since 1.71.0.** The
  pattern is `cos(flute·(ang + twist·arc))` over an atan2 `arc`, which only closes across the
  branch cut when `flute·twist` is whole — a fractional twist drew one hard seam, so Twist was
  pinned to integers and could not drift. Now the shortfall (≤ π/flute of tube angle) is
  wound back over the last radian before the cut (`s`, `dlt` in `torusDE`), exactly zero at a
  whole product, so integer scenes are unchanged. Heading is the
  CENTRE CIRCLE's tangent, not the wobbling path's (the path tangent swings the vanishing point
  off-frame and reads as drift). `tools/dnutprobe.js`.
- **Trees**: segment count is `split^depth`, four million at the extremes, so **`trMaxDepth`
  clamps the DEPTH** to `TR_SEG_MAX` (clamping split would change the silhouette the user
  asked for). Trunk length is **solved so the tree fits the box at every Taper** — a fixed L0
  grew a wispy tree to 290px in a 178px frame and `plot()` dropped 40% of it silently.
  Sway is added **at every joint**, so the bend accumulates trunk→tip; that is the property
  a still frame cannot show and `tools/treeprobe.js` measures it as tip-travel vs root-travel.
  **Beat reactivity needed no code** — arming Sway's chips is the gust.

### Flying ribbons (the ONLY effect that rasterises geometry)
Bands sweeping across the frame, drawn as **real surfaces**: a triangle list per band, with the
app's **only depth buffer**, so one band passing behind another is genuinely hidden by it.
- **It was a point effect first, and that was the wrong shape for it.** A filled surface costs
  one stamp per COVERED PIXEL - measured at **279k against a 95k budget**, so it was a third
  covered and read as a stipple - and no budget makes a point cloud OCCLUDE anything.
  Rasterising is both the right answer and the cheaper one: the GPU interpolates between
  cross-sections, so ~220 per band describe the curve completely and the fill is free. The
  whole effect is ~1500 triangles a frame, against ~100k `plot()` calls.
- **`glRibbonDraw` attaches the depth renderbuffer for that draw ONLY.** Every other pass runs
  with `DEPTH_TEST` off, and quietly changing the completeness rules of a framebuffer a dozen
  passes share is not worth the one attach call it saves. Contract otherwise identical to
  `glShaderDraw`: bind the layer scratch, blending off, overwrite.
- **`camMapXY` is the shared screen mapping**, factored out of `plot()`: zoom about the grid
  centre, the camera's 2x2, then the inverse lens. The ribbon vertices take the SAME one, or a
  stamped layer and a drawn one bow differently at the same slider value.
- **Shading is the surface NORMAL** (perpendicular to the tangent and the width direction), so
  a face turned toward the eye is bright and one edge-on goes dark - and the twist rolls that
  into bands of light travelling along each ribbon. The point version had to infer it from how
  wide the projection came out.
- Its buffers live in **`boot-globals.js`** beside the point ones, for the same reason: `initGL`
  is called from `palette.js`, an earlier slice than `render-gl-pipeline.js`.
- **No Points slider**: coverage is not stochastic when the surface is filled exactly, once.
- **The two EDGES are placed in 3D and projected separately**, and the whole effect rests on
  that: seen flat the band is a wide sheet, seen edge-on the two projections converge on their
  own and it collapses to a bright hairline. Foreshortening, the twist and the collapse are
  then one piece of geometry rather than three fudges, and Width is not a stroke thickness.
- **Each band sweeps PAST the frame edge on its own heading** (golden-angle spread), and the
  motion is a wave travelling down its length, not the band moving. Closed Lissajous knots
  centred on the origin were the first version: every ribbon enclosed the centre, so they
  piled into one tangle in the middle of the screen with dead space around it and nothing read
  as flying. Sweeping past the edge also hides the two raw ends off-screen for free, and an
  undulating band never has to be recycled the way a translating one would.
- **Sample count comes from the MEASURED projected length** (`RB_COARSE` pass, then ~1.4px
  steps). A fixed count combs — the cross-sections end up further apart than they are wide and
  the band renders as a row of separate ribs. Length and Waviness each change how far the curve
  travels on screen several times over, so no constant is right for both ends of either slider.
- **The cross-section's points are offset by a hashed fraction of a step.** A band wide enough
  to see is a big AREA and the budget rarely covers it at one point per pixel; spacing them
  evenly from the same edge every time lines the gaps up across neighbouring cross-sections and
  the surface moirés into a comb. Scattering the gaps reads as a solid sheet well below full
  coverage. Deterministic, like every point effect — variation is `rbHash`, never `Math.random`.
- Owns its Points range (`min 6000, max 140000`, default 95000) for the reason Trees does: it
  fills an area, so the budget buys far less picture per point than a cloud does.

### Bouncing solids (the one 3D shader effect)
`src/solids-3d.js`: CPU rigid-body physics, ≤8 bodies, hands the shader only `uPos`
(centre+radius `vec4`), `uQuat`, `uShape`. `FS_SOLIDS` raymarches; CPU mirror `solids()` uses half
the steps.
- **Orientation is a quaternion**; the shader undoes it per sample (`toBody`, conjugate rotation).
  One renormalise per frame.
- **Collision is a bounding SPHERE**; every SDF fits inside radius `r` (box half-extent `0.55r`,
  torus `0.70r`+`0.30r`, …). `Size` IS that radius.
- **Clamp the step (`min(0.05, dt)`)** — one huge `dt` from a backgrounded tab tunnels a body out.
- Bodies live on the **layer** (`L.solids`), like `L.tetras`; they can't ride `PHASE_VARS`.
  `installStackItem` calls **`installSolids(L)`**, else two solids layers share one set.
- Start state uses `sdHash(k, salt, i)`, **not sines**; positions scale to `SOLID_BOX[ax] − radius`.
- `tools/solidsprobe.js` pins containment, quaternion normality, per-layer ownership, spread.

### Menger sponge camera (street drive + tunnel dives)
- Camera **drives the street grid** (corridors at x/z ≡ 1.5 mod 3, y = 1.5 plane), turning at
  hash-picked intersections. **Most segments (`MG_DIVE_P` 0.72) dive on a lane LADDER**: level 0
  street, level 1 the edge tunnel (`(±1, ±1)` lines, carve DE exactly **1/3**), level 2 the inner
  corridor (`(±1/3, ±1/3)` lines, carve DE exactly **1/9**). The DE is `max`-composed, so fewest
  iterations is the binding case.
- **Adjacent lanes cannot be cut between mid-cube.** Swoops happen only inside the open gap slab
  between cube rows; the level steps by at most ±1 per crossing (pyramid `min(r, C−1−r, 2)` in
  `mgLvlAt`). Dives run 4–7 cells, weighted long: ~50% of drive time inside the sponges, ~21% in
  the deep corridors.
- **The whole path is C2.** Swoops and level blends use SMOOTHERSTEP (`mgSS`, window ±0.42 of the
  0.45 gap half-width); corners blend **between the two street lines** (`mgCorner`, `MG_R` 0.9).
  **A free waypoint spline is NOT usable** — it bows off the lane inside a 1/9 tunnel.
- Path lives in **`mengerSeed` on the CPU** (scalar state → `PHASE_VARS`); the shader gets
  `uPos`/`uFwd`/`uRoll` and only builds the view basis; aim = lookahead 1.6. `uFwd` **tilts during
  swoops (|fy| ≤ ~0.36) but must never go vertical**; the CPU mirror builds the same tilted basis.
  `mgLvlAt` and `mgEval` are **pure**; the committed advance lives only in `mengerSeed`.
- Bob is scaled by `(1−g)` (off in tunnels) and its phase **must not contain `mgSeg`**.
- **Never put the camera on the lattice AXIS or a face-centre line** — carve pinch points,
  clearance zero. Scan-verified: min DE 0.107, ~940 dives over 6000 s at max sliders.

### Effect-shader gotchas
- **NO BACKTICK ANYWHERE INSIDE AN `FS_*`/`VS_*` SOURCE, comments included** — they are JS
  template literals, so one stray backtick closes the literal and the rest of the GLSL is
  parsed as JavaScript. The whole IIFE then fails with a baffling error deep inside a shader
  (`Unexpected identifier 'oct'`) and the page renders nothing. The rule was written for probe
  generators; it applies to the shader sources themselves for exactly the same reason. Quote
  identifiers in a shader comment with 'single quotes'. `node tools/build.js` will not catch
  it — scan for it, or syntax-check the built file with `new Function`.
- **`smoothstep(hi, lo, x)` is UNDEFINED in GLSL** when `edge0 >= edge1`, and this GPU
  returns **0**. Use `1.0 - smoothstep(lo, hi, x)` for a falling ramp. It silently zeroed the
  whole Black hole disk and left only the photon ring — the shader compiled, the geometry was
  provably right, and the picture was still black.
- **Name collisions inside one `main()` are a LINK failure, and a link failure is silent** —
  `useProgram(null)` just draws nothing. The Black hole/Quaternion Julia camera basis owns
  `ca`/`sa`; a second cosine pair in the same scope has to be called something else. Assert a
  console-error count of 0 (`glCompile`/`glLink` throw, which surfaces as an uncaught error).
- **The heat buffer is Y-FLIPPED against the screen** — buffer row 0 renders at the screen TOP
  (`fire[]` row 0 too). An orientation-sensitive shader (Aurora, Lightning) must treat
  `gl_FragCoord.y/fh − 0.5` as pointing DOWN, or negate it at construction.
- **Reaction–diffusion owns a state texture pair** (`glTex.rd`, RGBA16F where
  `EXT_color_buffer_float` exists, RGBA8 fallback — 8-bit increments under 1/510 freeze the
  culture). `glRDTick` seeds on `rdNeedSeed` (set by `glResize` and `onEnter`) and ping-pongs
  `rdCur`. **A SINGLETON deliberately.** Steps scale with `dt` ⇒ frame-rate independent.
- **Headless virtual-time runs render FEW real frames with large clamped `dt`** — a
  per-frame-stepped sim looks frozen while dt-driven animation sails on. Before diagnosing a
  freeze, patch the pass in a PROBE COPY (hard zero / pure decay / accumulator writes).
**Slime mould NORMALISES, it does not freeze - and the difference is the whole fix.** Reported
as "static after a few seconds"; measured per cell, the trail map changes as fast at minute one
as at second one. What it reaches is a HOMOGENEOUS equilibrium: an evenly spaced mesh at the
same density everywhere, forever. **`phScatter` is a coarse, slowly drifting noise field that
scales the trail's DECAY per cell**, so veins starve in some regions and thrive in others and
that pattern migrates. Two things were tried first and MEASURED WORSE: heading noise per agent
(at a quarter strength indistinguishable from off; turned up it floods - lit cells 7.8k to 38k,
an even mush), and relocating a fraction of the agents (dilutes rather than disrupts). The field
is **13x8 coarse** (about 100 noise evaluations a step against 99k per-cell) and the 3-tap blur
softens the cell edges. It and its clock live on the LAYER beside the agents.

- **Boids follows the solids arrangement exactly**: flock on `L.boids`, `installStackItem` calls
  `installBoids(L)` for `boids: true`, hash-seeded start, deterministic flight. Only `bdPrev`
  rides `PHASE_VARS`.

### Point-accumulation effects
Run the fire sim, stamp via `plot()`. `simulate()` dispatches to `stamp(box)` if present, else the
`fractal2d`/tetra branches. Adding one = a descriptor with `stamp`, no `draw`. Stamping happens
inside a **safe box** (heat grid less a 1px margin); Size/Rotation scale & spin the corners about
its centre.
- **Stamp at `POINT_HEAT` (`CONFIG.tuning.pointHeat` = 209), not 255** — 14/19 palettes are
  near-white at 255 and effects ship with no filters.
- **`stampAdd: true` (Fractal flames) makes the stamp ADDITIVE**: `plot(x, y, v, true)` does
  `min(255, heat + v)` on the CPU, and all three `glBlitPoints` call sites pass `"add"` (FUNC_ADD
  ONE/ONE) when the descriptor carries the flag. Density is the picture; the saturated core IS the
  look. `flamesStamp` reseeds the chaos PRNG itself and advances `flPhase` per tick; Strike-style
  beat wiring does not apply.
- **Flames auto-exposure is load-bearing.** Pass 1 runs the orbit unstamped to measure
  hits-per-occupied-cell (64×36 grid); thin phases boost per-point heat up to 6× (capped 220);
  pass 2 re-runs the SAME seeded sequence and stamps. Dense phases keep gain 1. Both passes reseed
  identically — determinism holds with zero per-layer state.
- **Flames owns its Points range**: `ranges: { points: { min: 2000, max: 30000 } }`, default 12000.
  See per-effect ranges under *Effects & per-effect state*.

### Credits overlay + scene banner
Credits draw on **their own canvas** (`#creditcv`, `z-index: 4`, `pointer-events: none`) via
`creditDraw()` from `frame()` **after** `glRender()`/`render()`; below the menu (`z-index: 10`).
**Never stamp them into heat.**
- `CREDIT_HOLD` 5s then `CREDIT_FADE` 3s; `creditLeft` counts **rendered** time. `?credits=<s>`
  overrides the hold. Once expired, `creditDraw` clears once and sets `display: none`.
- `CREDITS` drives both the overlay and the panel's Credits box (`buildCreditList()`). The on/off
  preference has its own `localStorage` key, **not** the scene blob.

**`#scenebanner` is DOM CHROME, not part of the frame** — `"<scene name>  ·  <account>"` in the top
button row. `showSceneTitle(name, author)` arms `titleLeft` from
`CONFIG.credits.titleHold`/`titleFade` (2.5s + 1.5s); `sceneBannerTick()` pushes that clock.
- **BOTH halves gate on the credits**: `frame()` decrements `titleLeft` only in the `else` of
  `creditLeft > 0`, **and** `sceneBannerTick` gates on `creditLeft <= 0`. The tick runs
  **unconditionally**, not inside that `else`.
- **`applyPreset` must not read `p.name`/`p.collection`** — it calls **`sceneTitleFor(i)`**,
  declared beside `collectionOf`.
- Author = `collection`; absent ⇒ `#cloud-name`; no profile ⇒ name alone, dash dropped. **Not**
  `myCollectionLabel()`.
- Own `localStorage` key + **"Show author"** (`#sceneTitleOn`) in the **Scene box under
  Auto-cycle**; no second copy in the Credits box. `#sceneTitleOn` and `#creditsOn` carry
  **`data-nopersist`**.
- **`createPreset` does not arm the banner.**

### Preset transitions
**BOTH SIDES OF A BLEND ARE LIVE.** `glTex.prev` holds the OUTGOING SCENE, re-rendered every
frame — it was a frozen still until 1.34.0, on the grounds that two live scenes would need two
copies of singleton state, which the per-layer colour path had since made false.
- `transBegin` **freezes the selected item, then keeps `stack`** as `prevStack` (a `var` in
  `boot-globals.js` — frame-loop and the pipeline both read it and both load before
  `transitions.js`). `installStack` assigns a **brand-new array**, so the old one survives
  untouched, and a frozen item is already a complete self-contained scene.
  **Freezing the selected one first is what makes that true of all of them** — its store is
  the DOM, so without it the layer you were editing drops out of the outgoing half.
- **`renderStackColor(live, dt, now, ticks, base)`** — `base` is 0 for the live scene and
  `STACK_MAX` for the outgoing one, and it replaced `stack.indexOf(L)`, **which returns −1 for
  a detached item**. That one line is the whole difference between this working and the
  outgoing half silently drawing nothing. `glTex.heatL`/`glFbo.heatL`/`glTex.palL`/`layerCur`
  are therefore sized `STACK_MAX * 2`.
- **Order in `frame()` is load-bearing both ways**: `renderPrevScene` runs BEFORE the live
  render (they share `glTex.color`, and the outgoing frame is copied to `glTex.prev` before
  the live pass wants the accumulator), and `updateAnims(now, dt, prevStack)` runs AFTER the
  live one (each fresh drift segment draws twice from `Math.random`, so this keeps the live
  scene's sequence unchanged).
- The outgoing scene **drifts but does not re-trigger**: `trigState` is keyed by slot, the
  outgoing slots are not in `trigList`, so `clearBeats` would never drain their latches and
  every armed slider would sit pinned for the length of the blend. `updateAnims` passes a
  null band for a detached stack, and skips SCENE keys (the incoming scene owns `burn`,
  `bloom` and the four screen filters).
- `transStep` nulls `prevStack` when the blend ends. The `transBegin` snapshot **stays** as
  the all-layers-muted fallback; deleting it and watching the outgoing half still draw is the
  negative control that proves the live path is doing the work.
- Known ceilings: reaction–diffusion is a deliberate singleton (`glTex.rd`), so an outgoing RD
  scene shares the incoming one's dish for the blend; and the Canvas2D fallback keeps the
  frozen `transOff` copy, since it renders one layer and has no spare per-layer buffers.
  **No resolution downscale** — measured no fps drop across a blend, so it is not paid for.

`TRANSITIONS` — third registry beside `EFFECTS`/`FILTERS`. Sixteen entries, each a `mode` of the
single **`FS_TRANS`** pass: `cut`, `burnoff`, `crossfade`, `dip`, `flash`, `pixelate`, `blur`,
`wipe`, `iris`, then the staggered family `checker`, `bars`, `shutter`, `slide`, `clock`,
`dissolve`, `ripple`. `cut` needs no pass; **`burnoff` lends retention** (`hasFeedback()` true
while `transBurning()`).

**`cut` is the fallback, never a choice.** Not listed, never auto-picked while anything else is
ticked, and ticking anything drops it. Everything iterates **`TRANS_PICKABLE`** (registry minus
cut): `buildTransPick`, `setTransUse` (materialise + size-compare — comparing to
`TRANSITIONS.length` would never collapse to `null`), `pickTransition`. It survives only as the
one-member set `{"cut"}` = "none of these"; an empty pool falls back to it. Unticking the last row
writes that set, **not** `null` (which means all).

- Staggered family = one idea, seven delay fields (cell parity, bar index, slat distance, angle,
  hash, ring radius); `slide` translates both frames. **`hash21` has no time term.**
- CPU mirror: mask-based ones (wipe, iris, checker, bars, shutter, clock) paint a white mask,
  `destination-in`, old frame underneath; `slide` = two offset `drawImage`s; `dissolve`/`ripple`
  fall through to a crossfade. `render()` mirrors all seven visible modes.
- `transUse`: `null` = all pickable; stored **by stable id**, not index. Global blob field, skipped
  while `sharing`.
- `glRender` sends the zoom output to `glFbo.post[0]` (not `glFbo.scene`) while a transition is
  live, so the blend precedes the glow. **The outgoing frame is frozen** (`transBegin` copies
  `glTex.scene` → `glTex.prev`).
- Auto-pick = `fits(a, b) → weight` over `sceneInfo()` (`{dense, retains, palette}`), no pixel
  readback. Both dense ⇒ crossfade; density differs ⇒ pixelate/blur/wipe; palettes far apart ⇒
  dip/flash.
- **Transition** slider = [min,max] seconds, drawn per switch like `ttlMs`/`morphMs`. Both thumbs
  0 = cut. `trans.t` advances in **rendered** time.

### Filters (post-FX)
`FILTERS` — second registry, **three stages, listed in that order** (`filterprobe` asserts it).

**feedback** (`Fire`, `Fade pixel`, `Diffuse`, `Echo`, `Zoom feedback`, `Swirl`, `Cellular
automaton`) — mutate retained heat inside `glBeginHeat`, before the effect is MAX-injected. With
no feedback filter `glBeginHeat` **clears** and the CPU path zeroes `fire`.
- Echo/Zoom feedback/Swirl are **one program**, `FS_HWARP`, via
  `glWarpFeedback(src, dist, ang, scale, spin, keep)`. It samples through **`glSampLin`** (heat
  textures are `NEAREST`); a sampler binds to the **texture unit** — unbind immediately after.
- **Each of the four carries its own `Lifetime`.** The label is the only place that says
  "Lifetime"; keys (`fade`, `diffkeep`, `echokeep`, `zfbkeep`, `swirlkeep`), globals and `uKeep`
  keep their names — **keys are the wire format**.
- All four need **CPU mirrors** (`heatWarpCPU`/`heatDiffuseCPU`, sharing `bilinearHeat` +
  `warpBuf`); `cpuOk: false` here leaves the fallback with nothing carrying heat over.

**post** (Twist, Wedge fold, Slice glitch, Pixelate, Blur/sharpen, Edge, Posterize, Halftone,
Solarize, Chromatic aberration, Mirror, Shockwave, Pixel sort, Lens bubble, Droste zoom, Oil paint,
Bloom) — read the palette-mapped image. `glPostChain()` ping-pongs `glTex.post[0]/[1]` and
**returns `glTex.native` untouched when empty**. Bloom has no pass — it is the glow composite under
`bloomAmt`/`uBloom`.

**screen — EMPTY.** Barrel, Scanlines, Vignette, Film grain and Bloom are per-layer `post` passes;
`glBloomPass` makes the glow a chain entry, the other four use `postPass` (fw×fh), not
`screenPass`.
- `glRender`'s final step is `FS_COMP` with **`uBloom` pinned to 0**.
- `glBloomPass` borrows `glFbo.blur1/blur2` and must restore the caller's target — hence
  `bindFbo`/`bindDefault` track `curFbo/curW/curH`, **`var`, not `let`** (`bindFbo` is hoisted and
  called before the declaration line runs).
- `uSize` is the render buffer ⇒ Scanline count = lines across `fh`; two scanline layers can moiré;
  Vignette after Bloom darkens the glow.
- **`SCENE_FILTER_IDS`/`SCENE_FILTER_KEYS` are empty seams**, kept as the **wire-format** seam.
  `sceneFx` still rides in every blob; **`migrateSceneFx`** folds an old scene's whole-scene
  filters onto its layers (ids appended last, values overwrite), runs beside `migrateCam` in both
  load paths, deletes the field, idempotent.
- **No "Scene filters" box; `FILTER_LISTS` has ONE entry.** Putting a filter back on the whole
  scene needs a host + a `FILTER_LISTS` entry as well as an id — a filter routed to a missing host
  silently vanishes.

**ASCII mosaic builds a GLYPH ATLAS at runtime, and the ramp is MEASURED, not authored.**
`ASCII_SETS` names Unicode RANGES (eight sets, `Mixed` reading the other seven); Canvas2D renders
each candidate with the system font, `buildAsciiAtlas` sums its ink and sorts by coverage, and
`buildAsciiAtlas0` copies the cells into a strip with `drawImage` — the pixels uploaded are the
pixels measured. So a set only has to be a wide SPREAD of shapes; the measurement makes it a
dither, and it calibrates to the font the machine actually has.
- **Brightness picks a LEVEL, not a glyph.** `ASCII_LEVELS` (64) must equal the shader's
  `#define ASC_LEVELS`; `uBucket[lv]` is `(first glyph, how many)` and the cell hashes to one of
  them, so a flat area uses many characters at one brightness. **An empty level must inherit the
  nearest filled one** — count 0 makes `bk.x + floor(r*bk.y)` collapse to glyph 0, the blank, and
  punches black holes through the midtones. Cell 0 IS that blank, and the darkest level is it:
  without a guaranteed-empty glyph, shadows fill in.
- **The atlas is sampled with NO Y flip, and that is not an oversight.** The heat buffer is
  ALREADY Y-flipped against the screen (see *Effect-shader gotchas*), so a rising
  `gl_FragCoord.y` walks DOWN the picture — the same direction as the Canvas2D atlas's own
  top-down rows, uploaded without `UNPACK_FLIP_Y`. `inCell.y` maps straight onto `v`. A second
  flip shipped in 1.56.0 and drew **every glyph upside down for four releases**: the ramp was
  still correct so the effect looked like it worked, and dithered capitals are terrible
  witnesses — M and W swap, and A/N/U/O/X/H all still read as letters. It shows on a J, F, L,
  G or P at a large Cell. `asciiprobe` asserts the flip's ABSENCE.
- **The glyph pick uses an INTEGER hash (`ascHash`), never `fract(sin(...))`** — same rule as the
  glass ball. It decides which character a cell shows forever, so a driver recompile must not be
  able to change it.
- **Tofu rejection is PER GLYPH**, against a known-absent codepoint (`ASCII_TOFU`): a font with
  partial coverage draws one identical box for everything missing, and those all measure the same
  coverage, so they would sit in the ramp as a run of the same heavy blob. A whole-set spread
  check misses exactly that case.
- Overflow is **sampled evenly** (`pickChars`), never truncated — a script whose
  ranges exceed the cap keeps its full spread of shapes rather than only its first block. Count is also capped by `MAX_TEXTURE_SIZE / 32`,
  since the strip is one texture row. `tools/asciiprobe.js`.

**Slice glitch and Film grain read `postTime`**, accumulated from the frame loop's `dt` — not
`performance.now()`, not `simT`.

**Ping-pong parity**: `glBeginHeat` runs each ticked `glFeedback(srcTex)` in registry order, one
pass each, **`pendingDst` = wherever the last pass landed** (not a fixed `1 - curHeat`);
`pendingDst = src` after the loop. `tools/heatprobe.js` locks this down.

**Feedback filters apply to shader effects too**: `frame()` advances retained heat first
(`heatFeedbackTick()` × `ticks`) and `glShaderDraw` **MAX-blends** over it. `hasFeedback()` is the
single predicate. On CPU, `frame()` hands the mirror the *other* buffer (`fire`/`fireKeep` swap)
and MAX-merges — depends on **every CPU mirror writing every cell**; no early-outs.
`beginHeatTick()` does **not** flip `curHeat`; `heatFeedbackTick()` does. `applyFilters()` wipes
`fire` on `!hasFeedback()`, **not** `!filterOn("fire")`.

**CPU masking**: post filters carry `cpuOk: false` on the fallback. Mask **at the point of use**
(`cpuBlocked` → `filterOn()` → `activeFilters()`/`hasFeedback()`) and **never remove them from
`activeIds`**. `cpuBlocked` is filled by the FILTERS block but declared with the render globals.

**BYPASS (`.filter-by`, the eye beside each filter row)** mutes a filter *in place*. **Transient
and deliberately outside the wire format.**
- Held on the **layer object** (`L.fxOff`, a Set), so it follows its layer through a reorder;
  `stackItemOut` names its fields explicitly so it is never serialised, and `installStack` drops it
  on every scene load.
- **`filterOn(id)` is the one place it is applied** for the drawing layer. `renderFxOff` is set per
  layer in `frame()` beside `renderFilters`.
- The two per-layer chain builders read **`liveChainIds(L)`**, which strips the bypass **before
  `splitChain`**.
- The eye is inside a `<summary>`, so its handler must `preventDefault()` as well as
  `stopPropagation()`. Both visibility toggles (this and the layer mute `b.lyr-eye`) render
  `EYE_OPEN`/`EYE_SHUT` (boot-globals, inline SVG on currentColor) via innerHTML.

**Foldable control groups** — `FOLDABLE_GROUPS` is **EMPTY by request**; the machinery stays
(heading build, delegated `#panel` click, visibility pass all read that one set).
`refreshBlockVisibility` hides a folded group's ROWS but **the heading is shown against `shown`,
never the fold**. The heading click is delegated on `#panel`. Folds apply to every block at once.

**The list shows only the filters you have ADDED, in run order.** `+ Add filter` → `#fltdlg` is the
only place the full catalogue appears; rows carry `⠿` and `✕`. `buildFilterUI` builds one
`<details>` per filter (body adopted out of `#filterctl`); `renderFilterLists()` re-appends the
added ones in chain order. **Only the catalogue sorts**: `buildFilterPicker` collects into caption
groups first, keeps the captions in REGISTRY order (they mirror the pipeline) and lists the
filters inside each **by name**. The menu's own list is the chain — its order IS the run order and
must never be sorted.
- **Every section stays in the DOM forever**, hidden not removed (`el()` is `getElementById`).
  **Order is expressed by re-appending** — DOM order *is* the order. **`#flt-<id>` survives as a
  hidden checkbox** (the value store); `setFilterOn(id, on)` is the single toggle path.
- `buildFilterUI` must run **before** the `POPPABLE` pass. `#filterctl` survives empty and hidden.
- `makeFilterGrab`: transform the dragged section, show a `.filter-drop` marker, reorder once on
  release. **Never move the node mid-drag** (Chromium drops pointer capture on reparent).

**A filter's `defaults` must SHOW IT OFF.** Ticking one in the picker is how a user finds out
what it does, so a default that reads as "off" is a filter nobody adopts. Several shipped that
way — **Shockwave's `shock` defaulted to 0, which is the ring already gone off the edge, so
adding it did literally nothing** — and a dozen more sat in the bottom fifth of their travel.
Keep the FILTERS `defaults` and the CONTROLS `lo`/`hi` **in step**: the registry is what a
fresh layer gets (via `presetState`), the control is the slider's shipped position, and two
different answers to "what is the default" is a trap.
- Where "bold" is the LOW end, the default belongs there: `soften: -1` is maximum blur,
  `poster: 3` is the hardest banding. An audit that flags low values will flag these; they are
  inversions, not omissions. Same for the enums (`mirror`, `pxdir`) and for `shock`, whose
  default is the *spread* `[0, 1]` so the ring sweeps instead of sitting still.
- **Measuring this needs BOTH a still and a moving subject, and both a smooth and a sparse
  one.** A moving scene confounds the filter with its own motion (Bouncing shapes at speed 1
  gave a noise floor of 34.8, which nothing could clear); freezing the effect isolates the
  filter perfectly but kills the TRAIL filters by construction — retaining a fraction of an
  identical frame changes nothing, and Fade pixel measured a flat 0.00. Accumulating filters
  also need seconds to settle, not milliseconds: judged after 450ms, Fire looked inert.

Filter `params` are ordinary CONTROLS keys (host `"filter"`, one contiguous `group` per filter).
`refreshControlVisibility()` shows a control when the effect declares it **or** a ticked filter owns
it. `presetState` merges `FILTER_DEFAULTS` into every effect's state (an effect naming the same key
wins).

**Every effect defaults to NO filters** (`presetFilters` → `[]`); `DEFAULT_SCENE` carries an
explicit `sceneFx:{on:["bloom"]}`. Per-effect list = `extras[e].filters` (stable string ids);
**`mergeExtra` is mandatory**. `setEffect` runs its visibility pass before `loadExtra` knows the new
list, so `loadExtra` re-runs `refreshControlVisibility()`.

**The stored list is the USER'S ORDER.** Every chain walks it via **`orderFilters(ids)`** — never
`FILTERS.filter(...)`. `filtersOk` returns a Set built in array order.
- **The chain is a SEQUENCE, split not sorted — `splitChain(ids)`.** Everything at or above the
  **last feedback filter** runs in the heat phase; everything below runs on the palette-mapped
  picture. A `post` filter runs in **either** (above ⇒ warps heat, `R8`, shader writes `.r`; below
  ⇒ repaints). `runHeatPass(f, tex)` dispatches (`glFeedback` if present, else `gl`).
- **Never re-introduce a stage sort** — it made Swirl+Mirror unswappable.
- **The divider marks where the EFFECT draws**, not a barrier: `stageDivider()` emitted once after
  `splitChain(...).heat.length` rows; `flashStageMove` explains a cross-boundary drag. No feedback
  filter ⇒ no divider.
- **Both render paths**: single-layer runs `activeFilters()` off `activeIds`; a stack runs
  `renderStackColor` → `layerFeedbackChain`/`glLayerPostChain` off **`L.filters`** (kept current for
  the selected layer by `applyFilters()` → `persist()` → `stackOut()`). `DEFAULT_SCENE` is a
  four-layer stack, so the stacked path is what users hit first.
- **Four sites must respect the order**: `glBeginHeat` + `glPostChain`, `layerFeedbackChain` +
  `glLayerPostChain`, and — easiest to miss — **`mergeExtra`**. `activeFilterIds()` is the write
  side (`saveExtra`, `captureLayerExtras`).
- **`orderFilters` is a function declaration; `FILTER_STAGE_RANK` is a const it closes over** —
  `buildFilterUI()` must run **after** that block, or the TDZ throws and every filter shows.

**Effect `defaults` are NEUTRAL**: `palcycle [0,0]`, banding off, no rotation, every dual `[lo,lo]`.

TDZ: the registry block sits **above `presetState`**; `buildFilterUI()` **after** the registry;
`activeIds` + `filterOn` with the render globals (`bindRange` runs `apply()` during wiring).

### Effects & per-effect state
**`EFFECTS` is the single source of truth** — `{id, name, presetName?, subtitle, help, params,
helpTags, draw?/fractal2d, bakesOwnZoom?, cardioid?, onEnter?, defaults, ranges?, beat, extras}`.
Adding an effect = append one descriptor (`assertRegistry()` warns on dup id and on unknown
`params`/`defaults`/`ranges` keys).
- **The dropdowns list effects BY NAME** via **`effectsByName()`** (declared with the registry) —
  `#effect` and every row's `select.lyr-name`. Display only: `EFFECTS` keeps registry order
  because the runtime `effect` is an index into it, and each option's `value` is that index.
- **Controls** generate from `CONTROLS` (type, label, range, `fmt`, `apply`, `durScale`, host).
  `buildControls()` → `#fxctl`/`#bandctl`; `setEffect` shows only the descriptor's ordered
  `params`. No hand-written control HTML.
- **Defaults** seed `states[e]`/`beatStates[e]`/`extras[e]` via
  `presetState`/`presetBeat`/`presetExtra`. Include render-affecting keys the effect doesn't
  display (e.g. `band` at 0) so switching resets them.
- **Render**: `frame()` runs `draw(dt)` or the fire accumulator; `simulate()` stamps 2D when
  `fractal2d`; `setEffect` runs `onEnter`; `renderHelp` filters by `helpTags`.
- **Identity: the stable string `id`, never the index.** `serializeBlob`/`deserializeBlob` convert
  at the storage edge; `LEGACY_EFFECT_IDS` migrates pre-id blobs; `effect` stays the runtime index.
  **`MAP_DEFS` is THE per-effect-map registry** — one row per map (`states`, `beats`, `pulses`,
  `plens`, `btunes`, `extras`) naming its wire field + `save`/`load`/`init` hooks. `EFFECT_MAPS`
  derives from it; `keysToIds`/`keysToIdx` do the edge conversion. The MECHANICAL all-maps sites
  go through the table (`saveLiveMaps` in the three snapshot preambles + `setEffect`,
  `loadLiveMaps` in `setEffect`, `initAllMaps` in `installShared` — whose hand list missed
  `initBtuneStates` and bled recipient beat tuning into shared scenes); the SEMANTIC sites
  (applyBlob's validation loops, `snapshotScene`'s literal, `applyPreset`'s merges,
  freeze/thaw) stay explicit on purpose, probe-pinned. **A new map = one `MAP_DEFS` row plus
  the semantic sites.** Numeric key ⇒ pre-id blob; unknown id ⇒ dropped, never misfiled.

**Per-effect slider bounds** — optional `ranges: { <key>: {min, max, step?} }`, **per-LAYER keys
only** (a scene key's bounds are shared scene-wide). Flames' `points` is the one user; widening the
shared schema entry instead would raise every other point effect's floor and re-clamp saved values.
- **`rngShipped(id, fx)` is the single reader** — `RNG_ORIG` with that effect's override laid over
  it. `rangesDiffering`, `resetControl`, `applyRangesFor` and the Reset-effect button all go through
  it, so an effect's bounds are never mistaken for a user widening and ↺ restores the *effect's*
  range.
- `applyRangesFor` resolves the effect per block (`stack[slot].fx`, else `effect`) — also what
  re-widens the slider on an effect SWITCH (`setEffect` calls `applyLayerRanges` after assigning
  `effect`, before `loadState`).
- **`applyBlob`'s `ok(id, x, e)` takes the effect** and widens by its declared range before testing;
  it validates every effect's states against the LIVE sliders, which belong to whichever effect is
  on screen.
- A stored value below a newly-declared floor clamps up when that effect goes live — declaring or
  raising a `min` is a scene-visible change.

**SINGLE controls** — `single: true` on a `dual` entry: one integer, one thumb. Used by the four
enums (`flvar`, `mirror`, `pxdir`, `sdmix`) and the small-domain counts (sides, segments, bars,
bolts, iterations, …). Not `points`/`bdcount`/`xormask`/`bandsize`, nor anything that scales
rather than counts — `cocount` and `sgcells` are densities the shader multiplies by, so a
fraction renders correctly and a spread is worth drifting.
- **It stays `type: "dual"`.** The store is still the `[lo,hi]` pair and the wire keys are still
  `<key>-lo`/`<key>-hi`, so no scene, link or backup needed migrating. `type: "plain"` would have
  changed both — and nothing wires `plain` (the loop filters `type === "dual"`), so its `apply`
  would never run.
- `SINGLE_KEYS` + **`singlePair(id, v)`** live in `controls-schema.js` (first slice — `ctlHTML`,
  `wireRange`, `RNG_ORIG`, `applyBlob`, `mergeState` and `paintBlock` all read them).
  **`singlePair` is a function declaration**, not a const arrow (TDZ, same rule as `blendOk`). It
  collapses a stored pair **lo-then-round**, which reproduces what these controls' own
  `Math.round(v)` applies already computed — a scene that *rendered* N still renders N.
- `ctlHTML` emits the real `step` (not `"any"`) and a `.dual.single` wrapper + `.thumb-hi` class;
  the browser then snaps every `.value =` write onto the grid, and **`snapStep` becomes live**
  (it short-circuits on the `NaN` that `"any"` gives it).
- **`RNG_ORIG` must carry that step too**, and `applyRangesFor` must ignore a stored `step` for
  these keys — it resets every slider's step from `rngShipped` on every scene load and effect
  switch, so an `"any"` there silently un-quantises the lot on the first load.
- `wireRange` mirrors the hidden thumb and is **the one place triggers are suppressed**
  (`beat !== false && !single`). No chips ⇒ the key never enters
  `beatReact`/`pulseShape`/`pulseLen`, so every `merge*`/`prune*`/`sync*` that iterates those maps
  skips it and a saved scene's stale `beat` entry is simply never visited.
- **No drift comes free**: with `lo === hi`, `stepAnim` takes its `mx - mn < 1e-9` branch and
  draws no `Math.random`. The readout is free too — `ui()` already prints one number when `A === B`.
- Collapse sites are `mergeState` (the funnel, and the only fix for a non-selected layer —
  `bandOf` reads `L.state` directly), `applyBlob`'s states loop (it bypasses `mergeState`) and
  `paintBlock` (the one site that writes values without dispatching `input`).
- The range editor drops its step row for these keys and rounds typed bounds; `tools/singleprobe.js`
  pins the set and the behaviour.

**Break-out boxes.** Every `dual`/`plain` slider appears in the menu as a name + `+`/`−` launcher
(`.ctl-row`); the `#ctl-<key>` node lives in `#breakout`, a `position:fixed` column filling top→down
in click order. A thumb is only ever visible in the column.
- **A box belongs to a LAYER**: `popped` keyed `"<slot>/<key>"` (scene = `"s/<key>"`).
  `refreshBreakout()` shows one iff its slot/key is popped **and** that layer still uses the
  control. `ctlOwner(slot, key)` prefixes `L2 ·`; `syncPopOwners()` re-stamps after a reorder.
  Transient.
- **A SCENE filter param is ONE box and N rows** (`bloom`, `burn`, `barrel`, `scan`, `scancount`,
  `vignette`, `grain`). It carries an `id`, not `data-k`, so the map lookup `ctlIn` never finds it:
  a second pass over `FILTERS`' params — **params order, not `POPPABLE` order** — dresses one box
  into `#breakout` with **no `data-slot`** and appends a launcher row to *every* block's copy of
  that section. **`popSlot(slot, key)` folds those keys to `-1`** inside `syncPopBtns`. `ttl`/`tdur`
  are scene controls too but have one home in the Scene box — no launcher.
- **NOTHING calls `dockAll()`** — kept, no callers.
- `#breakout` is **outside** `#panel`, so: control CSS scoped `#panel …, #breakout …`; `onEdit`
  attached to `#breakout` too; its **own capture-phase `pointerdown` + `focusin`** selecting
  `box.dataset.slot`'s layer.
- Box order top→bottom: `.ctl-owner`; label+value; slider; **`.rng-sec`** (collapsible "Value range"
  wrapping `.rng-edit` — min/max/step only, closed by default, summary `?` opens `openRangeHelp`);
  `.ctl-div`; **Triggers** (`.trig-t`) over the chips; **`.trig-body` — ONE folding element holding
  the whole trigger kit** (**Shape** over the `PULSE_SHAPES` picker and **the pulse PLOT**
  (`canvas.pulse-plot`, `drawPulsePlot` — the slider's value against time after a beat, drawn
  from the SAME formula `updateAnims` applies, `lo + shape(pulse)·(hi−lo)`, so it cannot
  disagree with the animation; y is the slider's own band, so a pinned slider honestly plots
  flat, and x is scaled to the pulse length, so it is deliberately duration-INVARIANT; redrawn
  on shape/duration/thumb input and from `syncPulse`/`syncPlen`; **every shipped slider is
  pinned, so the default plot is flat** — a check must spread the band first), **Duration** (`.plen-name`)
  over `.plen` + its max row, **Tuning** (`.trig-refs`) closing it — **this slider's OWN detector
  thresholds**: `.trig-sub` groups for Sensitivity (per band, 0.5–6×), Floor (one row, 0–1) and
  Refractory (per band, 20–500 ms), shown only for armed bands, with a `↺` on the heading); then
  **a `.ctl-div` + the Reset row (`.ctl-reset`) CLOSING the box, outside both foldables, always
  visible**.
  The trigger body is hidden until ANY chip is armed and shows as one element when one is
  (`syncTrigTune` via `refs.body`, re-pointed like the chips via `refEls`). Sub-titles drop the word
  "Trigger". `makeChips` **appends** (append order = display order). The range editor is built later
  (POPPABLE pass) and must **`insertBefore` `.trig-t`** — the FIRST `.trig-t` is the Triggers
  heading. It carries no `border-top`. The trigger section exists only in a box.
- `.ctl-owner` = `ctlOwner(key)` → `CTL_GROUPS[control.group]`, `"Filter · "` prefix for `f_*`.
  Added in `POPPABLE.forEach`, not `ctlHTML`. **It is also the DRAG HANDLE** (`.own-txt`,
  `touch-action: none`).
- **A SHAPE THUMBNAIL** heads the box for the six groups in `SHAPE_PREVIEW`
  (`polygon`, `concentric`, `shapegrid`, `bounce`, `solids`, `vballs`). Keyed by **GROUP**,
  not by control — the figure is made by the whole group, so every one of Polygon's boxes
  shows the same shape and each says what its own slider acts on. It reads the **slider
  values for its slot**, not the animated globals: the globals hold whichever layer drew
  last (wrong for a non-selected layer's box) and a jittering thumbnail is harder to read
  than the setting. Redrawn from a delegated `input` on `#breakout` and from
  `refreshBreakout` — never per frame.
- **The Triggers heading folds** (`trigFolded`, keyed by control id like every other
  trigger singleton), hiding the CHIPS as well as the body, armed or not — the menu row's
  `.ctl-dot` still says the slider is wired. `paintTuneRows` ANDs `any` with the fold.
  A `single` control has no trigger section at all (`wireRange` suppresses it), so it has
  no chevron either — asserting the fold on one is a check of nothing.

**ONE DRAG ENGINE, AND THE GRID IS THE EDITOR'S GRID.** Break-out boxes and every floating
tool panel (`#carddlg`, `#paledlg`, `#paldlg`, the three pickers, and the modal dialogs) are
dragged by their **title bar** — `.ctl-owner .own-txt` for a box, the `<h2>` for a dialog —
onto one shared grid. They are three different positioning schemes (a JS-placed column, a
fixed corner, a margin-docked box inside a full-screen shell), and unifying the DRAG rather
than the CSS is what stops that becoming a fourth.
- **`brkGrid()` measures the PANEL's live bounding rect**: origin at its right edge + gap and
  its top, one column exactly `BRK_W + BRK_GAP` wide, rows dividing the panel's height. So
  column 0 is flush beside the menu and a snap lines up with the editor. Hard-coding 298/58
  here is how the two drift apart — the panel's width is a CSS number that has moved before.
- **The snap is a QUARTER cell** (`BRK_SUB` 4 — `gx`/`gy` are stored in quarter-cells, so
  a position on a coarse line is an exact multiple and unchanged). **`#brkgrid` draws BOTH
  levels while dragging** (`body.brk-gridding`): four background layers, the faint 1px
  quarter mesh on top, the strong 2px whole-cell lines behind — those are the "best"
  alignments, flush with the panel or exactly one box apart. All four sizes come from the same
  `brkGrid()` the snap uses, so the drawing and the maths cannot disagree.
- **A BOX IS NEVER PLACED PARTLY OFF SCREEN, AND `brkPlace` IS WHERE THAT IS ENFORCED.**
  Every path that positions a box — a drop, the default column, a resize, a reorder — ends
  there, so the guard belongs there and nowhere else. The original `Math.max(0, …)` pair was
  **not** that guard: it clamps the anchored edge's OFFSET, which stops a box escaping past
  the edge it is anchored TO and says nothing about its far edge, so a bottom-anchored box
  tall enough to reach past the top of the viewport was placed exactly there. `brkPlace`
  clamps the whole RECT in whichever frame the anchor is expressed (`x`/`y` are left/top for
  a near anchor, right/bottom for a far one), pinning to the near edge when the box is larger
  than the room available.
- **A DROP RESOLVES WITH `nearestFree`, NOT A NUDGE.** `dragEnd` used to step a quarter-cell
  at a time in ONE direction — up for a bottom-anchored box, down otherwise — until the spot
  was clear. Dropping a slider box on the LOWER EDGE of layer 1's box put its centre just past
  the vertical middle, so it took a bottom anchor, so the nudge walked its bottom edge UPWARD;
  layer 1's corner is the top of the screen, so the first clear spot put the slider box's
  bottom against the layer box's top with the rest of it above the viewport. It searched one
  of the four directions it needed. `nearestFree` already enumerates only positions that fit
  on screen, skips overlaps and returns the closest to a point — handing it the point the box
  was dropped at is exactly "as close as possible to where you let go, fully on screen,
  touching nothing". A drop into free space returns that same quarter-cell, so an ordinary
  drop still lands where the grid says. **`tools/brkdrop-check.js`** drives the real drag
  handlers at four heights down a layer box and is verified to reproduce the bug without the
  fix (`t=-155` against a 908px viewport).
- A box near the far edge is **clamped to the viewport** (`right: 0`), and the viewport edge
  is not on the grid — `breakout-check` asserts the snap only when the clamp did not engage
  (at whole-cell resolution that assertion passed by luck).
- The dialogs' movable node is **not always the `<h2>`'s parent** — `#carddlg .card-box` is
  deliberately `position: static` and the host carries the placement — so `dragTargetFor`
  walks up to the first positioned ancestor. A `relative` box is converted to `absolute`;
  its shell being `inset: 0` is what makes viewport and absolute coordinates the same number,
  which is why one rect-based engine drives boxes and dialogs alike.
- The dialog handler is **delegated on `document`** (capture): `#help` builds its whole box on
  open, so nothing to wire exists at startup.

**`#breakout` IS A FULL-SCREEN FREE GRID.** `position: fixed; inset: 0; pointer-events: none`,
every visible box `position: absolute; pointer-events: auto`. **One positioning model, not
two**: `layoutBreakout()` places the never-dragged boxes into the same 298/58 column (wrapping
into a second column — a full-screen host cannot scroll) and the dragged ones from
`brkPos`. Two layouts, or a second host, was the alternative — and a second host means adding
its id to every `#panel …, #breakout …` control rule, the mistake recorded three times above.
- Snap = a **12 × 8 grid over the viewport**, with **EDGE AFFINITY**: a box whose centre is in
  the left half anchors its LEFT edge and grows right, past the middle it anchors its RIGHT
  edge and grows left (same vertically). Crossing the middle therefore re-aligns it to the
  near edge and it grows inward, and a corner box stays in its corner as its content grows.
- `brkPos` is keyed like `popped` (`"<slot>/<key>"`) and **`remapPopped` must move both** — you
  placed a LAYER's box, not a position's. Transient; never in `fullSnapshot()`.
- Never reparent mid-drag (Chromium drops pointer capture); pin `left`/`top` for the drag and
  write the anchor only on release. Double-click the title returns a box to the column.
- Below **760px** the CSS puts the boxes back in flow as a bottom sheet and `layoutBreakout`
  clears its inline offsets — `brkFree()` gates both.

**Range editor** (`makeRangeEditor`): `min`/`max`/`step` + ↺ (→ `resetControl`). `rngApply` writes
the attribute onto the real slider(s), re-clamps, dispatches `input` **on the slider** (the number
fields are skipped in `onEdit`). `applyRanges` calls `rngSyncAll()`.

**Blocked controls**: `CTL_BLOCKED` maps blocked key → blocker (`bandsize`/`banddim` → `band`,
`nodspd` → `nod`). A control is off when its dual's **high thumb is 0** (`ctlHi`) — read the thumb,
not the animated value. `refreshBlocked` runs from `refreshControlVisibility` **and `onEdit`**.

**Orbit editor** (`#carddlg`, `#cardbtn`), gated on `cardioid: true`. Floating, non-modal,
bottom-right, `z-index: 5` — **never add a backdrop or click-outside-closes**. Hides on `m`/`Esc`.
- Samples **`juliaSeedAt(outer, inner)`** so opening never advances the animation; `frame()` redraws
  while open.
- Backdrop **`cardLocus(w, h, d, win, ship)`**: Mandelbrot at power 2, degree-d Multibrot
  otherwise — **or the Burning Ship set**, which is a THIRD family, not a power of the first.
  **`locusEsc` is the single escape test** shared by the render and the framing scan; two copies
  is how the window ends up framing a different set from the one it draws. The family comes from
  the selected layer's descriptor (`locus: "ship"`) via `locusShip()`, and **`card.bgShip` is part
  of the backdrop cache key** — Julia and Burning Ship are both `d=2`, so without it
  selecting one keeps showing the other's set.
- **The view centres on the locus in BOTH axes** (`cardWin.yc`). It tracked x only, on the
  grounds that the locus is symmetric about the real axis — true of every Multibrot, false of
  Burning Ship (y ∈ [−1.53, +0.45]). `yc` **snaps to 0 below 1e-9** and the half-height is
  measured about `yc`, so the Multibrot framing is bit-identical to before (verified: the
  Julia backdrop hashes the same either side of the change). **`cardY0`/`cardSpanY` are the
  only place the y mapping is written** — `cardLocus`, the overlay's `Y()` and `cardEventToC`
  each used to spell out `-spanY / 2` and would silently re-assume a y-centred view.
  Quantised to `CARD_POW_Q`. **Resolution is set by what a pixel COSTS**: full res on the integer-2 fast path
  (`sq`, three multiplies — Julia and Burning Ship both live here), **half res everywhere
  else**, where each iteration is a `pow`/`atan2`/`cos`/`sin` *and* the Power slider re-renders the
  cache every `CARD_POW_Q` (0.05) step as it drifts — a 2→8 sweep is ~120 repaints.
- **The canvas is 819×644** and its size IS the freehand drawing precision (strokes are thinned by
  a minimum spacing in c-units). `cardEventToC` reads the live bounding rect, so CSS-scaling it is
  safe.
- **The title is in the paints-NOTHING list**, with the pickers and the palette editor — `#carddlg`
  is `rgba(10,6,4,.8)` with its own `blur(6px)`, so a nested backdrop-filtered header composites
  toward black on a real GPU. It was briefly moved to the sticky list and shipped a black bar
  under the title; **the headless screenshot taken to check that change showed a clean header.**
  Assert `getComputedStyle` for this, never a screenshot.
- **The editor stays live while the SCENE is paused.** `frame()` returns early when `paused`, which
  froze the editor canvas: switching path mode, editing, undo and clear all changed state and
  redrew nothing, so the whole panel read as broken. **`cardTouch()` sets `cardDirty`** (from
  `syncOrbitUI`, `commitSeedPath`, `cardOpen(true)` and the canvas pointer handlers) and the paused
  branch calls **`cardDrawPaused()`**, which repeats the render epilogue's
  `installStackItem`/`installPhase`/`juliaPower` install and draws once. `cardDraw` clears the flag.
- `card` is a **`var`** (and so are `cardDirty`/`cardWanted`); `cardOpen`/`cardDraw` early-return on
  falsy `card`.

**Seed path**: `seedPathMode` (`"cardioid"`|`"circle"`|`"freehand"`), per-path `seedRideOn`,
freehand `seedPts` → arc-length LUT `seedSpline`. **`basePathAt(th)`** is the fork; freehand is a
closed periodic Catmull-Rom traversed by arc length. `juliaSeedAt` adds the riding circle only when
`seedRideOn`. **`juliaEase` is a flat 1 off the cardioid.** Default (cardioid + ride on) reproduces
the original math byte-for-byte.
- **Per-LAYER scene data** (`L.seedPath`/`seedRide`/`seedPts`), `extras[e]` as per-effect fallback.
  Shares at 4dp, capped by `seedPtsOk`; rides via `stackItemOut`/`mergeLayers`.
- **`installSeedPath(L)`** from `installStackItem`; epilogue restores the selected layer's.
  **`captureSeed(L)`** swaps in a **NEW** `seedPts` array (never mutate in place) so the
  `seedSplineFor` WeakMap invalidates.
- `stageLayerExtras`/`applyLayerExtras` install the seed, **not `loadExtra`**. `syncOrbitUI()`
  reflects live state; `seedDrawing` is transient.

**Field of view** rides the shared camera as `uCam.w` (so `uCam` is a **vec4** and
`glShaderDraw` sets it with `uniform4f`): a radial scale on the SAMPLE coordinate, applied
**before** the rotation in both `camFrag4()` and `camPix()` so the two compose identically,
normalised by the half diagonal so one slider means one lens at any resolution. `camOn()`
must include `camFov`. Default 0, seeded in `presetState` and listed in `CAM_KEYS`, so every
scene saved before it renders identically (`camOn()` is still false at rest).
- **Point effects need the INVERSE**, and `camUnlens` is it. A shader bends the coordinate it
  SAMPLES; a stamped point already knows its content offset and has to be told where to land,
  so applying `lens()` to it would bow the picture the OPPOSITE way at the same slider value
  and a fisheye layer over a stamped one would curve against it. `plot()` therefore applies
  `camUnlens` **last, to the screen offset** — the far end of the chain whose near end is
  `camFrag4`'s lens.
- `lens⁻¹` is the depressed cubic `k·u³ + u − v = 0`; Newton from `u₀ = v` converges in three
  steps. **A negative FOV FOLDS** — `v = u(1+k·u²)` peaks at `u* = 1/√(−3k)` — and content
  past `v* = ⅔u*` has no screen position, so those points are DROPPED. That is what a long
  lens does, not a failure. A wide lens on a stamped effect pulls the picture in from the
  corners and leaves dark edges, where a shader effect simply shows more of itself.

**Camera on CPU**: mirrors call `camPix(x, y)` per pixel (scratch `camPX`/`camPY`, no allocation).
Per-row hoists must stay **inside** the x loop — rotation mixes x into y. **Copper Bars** keeps its
row-constant fast path but gates it on `camOn()`.

### UI: two menus
☰ opens the **menubar** (`src/ui-menubar.js`, `#menubar`) — everything that is *not* scene data:
Controls panel / Fullscreen / Hide all UI, **Audio**, **Resolution**, Cloud profile, Public scenes,
Credits, help. **`#panel` is only the scene editor.** ☰ does **not** toggle the panel; `m` does.

**Audio and Resolution are ROOT items** (no "System" parent). Each needs **its own adopt host**
(`#audiobox`, `#resbox`) — one host per leaf.

**The menubar ADOPTS nodes, it does not rebuild them.** `#audiobox`, `#resbox`, `#cloudbox`,
`#creditbox` are authored hidden in the panel markup; `{adopt: "id"}` *moves their children* in.
`ui-menubar.js` is **last in the manifest**. **`returnAdopted()` is load-bearing and its absence is
destructive** — panels are destroyed on close, so an adopted block must go home first or the real
audio buttons, resolution select, `#cloudrow` and credits list are **deleted from the document**.
`box.dataset.adopt` names home.

**Every dialog's title + close button are STICKY.** First two children = the `.pal-close`-family
button and an `<h2>` — **in that order**, because the button is `float: right` and only floats
alongside a title that follows it. **Every dialog appears in FOUR separate lists**, and each has
been missed at least once; `tools/uiprobe.js` now asserts all four from one table:
the Escape branch (`ui-diagnostics.js`), the `body.ui-hidden` selector (ONE list — a stray
second copy for `#galdlg` is what hid the problem), the sticky-header selectors, and the
`padding-top` waiver.
- **The panel-tool dialogs dock TOP-LEFT beside the panel** (margin 58px/298px, the `#breakout`
  column line): two of the three pickers (`#fltdlg`, `#transpickdlg`), the Palette editor
  (`#paledlg`), the Palette inspector (`#paldlg`). **`#palpickdlg` is the exception — it CENTRES**
  and sits at `z-index: 21`, above the other tool panels, because choosing which palettes a scene
  may use is a decision about the picture rather than a panel tool. It has its own copies of the
  shell and `.flt-box` rules (identical but for the margin and the flex alignment), is out of the
  760px undock (already centred) but stays in that block's width clamp, and is still NOT modal —
  no backdrop, no focus trap, still in all four dialog lists. Reading/flow dialogs (Help, Gallery, Restore)
  stay centered. Their `h2` has **no right margin**, their header tone matches the box tint, and the
  × is pulled 12px into the side padding and 12px down.
- Button is `position: sticky` + `float: right`, **not `absolute`**. **The box gives up its
  `padding-top`; the header carries it.** Header background bleeds over side padding via
  `box-shadow: 0 -30px 0 30px` (18–26px per dialog) plus a `backdrop-filter`.
- **Name the element the `<h2>` is really a child of.** Every dialog wraps its body in an inner
  box, so the h2 is a GRANDCHILD of the id: `#carddlg .card-box > h2`, never `#carddlg > h2`.
  Those two selectors matched nothing for several releases and both titles scrolled away.
- **The `padding-top: 0` waiver is the LAST rule in `styles.css` and must stay there** — half the
  dialogs declare a `padding` shorthand further down, equal specificity, and a shorthand always
  reinstates the top. It was defeated on four of the five sticky dialogs.
- **`role="dialog"` on the BOX, and `aria-modal` only on the four with a backdrop** (`#help`,
  `#restoredlg`, `#galdlg`, `#syncpop`). Those four call **`dlgModal`/`dlgRelease`** (in
  `boot-globals.js`, `var` state) for focus-in / trap / focus-restore. **The floating tool panels
  must NEVER trap focus** — `#carddlg`, `#paledlg`, `#paldlg` and the pickers exist to be used
  *while* the scene runs. `dlgRelease(box)` is box-scoped, because Escape closes every dialog
  unconditionally and an unscoped release yanks focus out of a different one.
- **A probe that opens a dialog by un-hiding it proves nothing** — content is built on open. Click
  the real opener (`#transpick-open`, `#pal-detail-btn`).

**Narrow viewports — two breakpoints, deliberately different numbers.** `1160px` centres `#help`
(a wide multi-column reading box that should stop sitting beside the pop-out column while there is
still room). **`760px`** undocks the five 298px-docked dialogs and turns `#breakout` into a bottom
sheet — 298 + a 430px box needs ~742px, and undocking at 1160 would slide them over a panel with
600px of clear space beside it. They are in a flex row, so a docked box does not overflow: it gets
**squeezed** (~180px), which is why the probe asserts WIDTH, not just position.

**`setOff(node, off)`** (`boot-globals.js`) is the one way to switch a control off: `.off` class +
the real `disabled` + `aria-disabled`. **`pointer-events: none` blocks the mouse only** — a dimmed
button kept its tab stop and fired on Enter, and the layer ✕ got as far as raising a `confirm()`
for a removal the one-layer floor then refused. The `<b>` row controls (`.lyr b.off`) still need
`pointer-events: none`, since `disabled` does nothing on a `<b>`. `#mute` is the one deliberate
exception: dimmed but live.

**`#uihint`** is the way back out of "Hide all UI" — the only element NOT in the `body.ui-hidden`
list, since hiding the chrome also hides the footer line naming the `H` key. It times itself out
instead (2.2s + fade), and **`setUiHidden(h, quiet)` passes `quiet` on the `?hideui` path**, which
exists for headless screenshots that must render nothing but the visual.

**Shared widget CSS is keyed on the CLASS, never scoped to a container** (bitten three times).
`.pal-close, .card-close, .help-close, .sync-close` and `.audbtn` are single unscoped rules; a
dialog need only be `position: relative` (or deliberately `static`, as `#carddlg .card-box` is). The
control-appearance CSS is the exception — it names `#panel …, #breakout …, #menubar …`, three real
hosts for the same nodes.

`#menubar` is a full-screen overlay that **catches** pointer events while open (it is the
click-outside closer). Every CSS rule an adopted block needs must name `#menubar` alongside `#panel`
— **including the font**, which lives on `#panel`, not `body`.

**Panel layout**: header + **four `.box` `<details>`** (fold transient) — *Scene*, *Scene filters*,
*Beat tuning*, hidden *Layer effect & filters* — plus **`#lyrsec`, a plain titled SECTION** for
Layers (not a box). The hidden box holds `#effect`, `#fxctl`, the Orbit editor, Reset, per-layer
filters, palette. `buildControls` routes by `host`: `"band"` → `#bandctl`, `"pal"` → `#palctl`, else
`#fxctl`. **`#scenenow`** names the selected scene, filled by `syncSceneTitle()` from
**`buildPresetList()`** — the choke point every selection path goes through.

### One control block PER LAYER
A `.lyrblock` cloned from `<template id="lyrblock">`, `STACK_MAX` of them, built at startup —
and **living permanently in a BOX IN THE GRID** (`#breakout .ctl.lyr-box[data-slot]`, built by
`adoptLayerCtl`), not in the row. The row's **`+`/`−` on the right** (`button.lyr-pop`, the same
control a slider row carries) toggles `openSlots`, and `refreshBreakout` shows a layer box iff
its slot is in that set. The box is an ordinary `.ctl` with `data-slot` and `data-brk
"<slot>/layer"`, so the break-out engine drags, snaps, selects (the capture-phase handler on
`#breakout`) and remaps it on reorder without knowing what it holds. Any number open at once.
No `#lyrctl`, no `parkLayerCtl`.

- **Nothing inside a block carries an `id`.** They carry the same string on **`data-k`**, resolved
  via **`ctl(k)`** (selected), **`ctlIn(slot, k)`** (one), **`ctlEach(k)`** (all). The STRING never
  changes — `speed-lo` is a wire key. `ctlReg` registers a node *and* stamps `data-k`.
- **Node REFERENCES, not subtree queries**: `keyMap[slot]` is a hash, because POPPABLE moves every
  `.ctl` into `#breakout`.
- **A SCENE control keeps its `id`, generated in slot 0 only** — the seven `SHARED_FILTER_KEYS`
  plus `ttl`/`tdur`. `ctl()` falls through to `getElementById`. `isSceneCtl` sits above `ctlHTML`.
  **`#effect` and `#palette` are hoisted OUT of the block** (single value stores).
- **One set of maps pointed at one block**: `wireRange(slot, …)` builds nodes, `ui()`, clamps and
  the beat block; `registerAnim` creates `anims`/`animPhase` and runs the single startup `apply()`
  from slot 0; **`pointMaps(slot)`** re-points on selection — it must **never** re-create
  `animPhase` and **never** call `apply()`. `makeChips` handlers guard on being the **live** block,
  not `slot === stackSel`.
- **`paintBlock(slot, L)`** fills a NON-selected block from its frozen record: skip the selected
  block, apply that layer's **bounds BEFORE its values**, and **never dispatch `input`**.
  **`repaintAllBlocks()` must run wherever a slot changes which layer it holds** — reorder, add,
  remove, `installStack`. It lives inside `installStack`, not `applyPreset`.
- **Visibility passes are per block**: `shownKeysFor(slot)`, `refreshBlockVisibility`,
  `markFirstGroup`, `refreshBlocked`, `ctlHiIn` all take a slot.
- **`RNG_ORIG` is built from `CONTROLS`, not a DOM scan.**
- **`selectStack`'s order is load-bearing**: `freezeItem` → `stackSel = j` → `pointMaps(j)` → rest.
- Selection = capture-phase **`pointerdown` AND `focusin`** on the row; pointer alone leaves a
  keyboard hole.
- Open via the row's **`+`** (`openSlots`) — the box is hidden, never destroyed. **Every layer
  starts closed**, `openSlots` starts empty, and **selecting does not open**. Opening does
  select. `dropOpen`/`moveOpen` remap on remove and drag, and `remapPopped` carries the box's
  grid position with them.
- **The row is a 3-column grid and EVERY child is explicitly placed** (`grab` col 1 rows 1–3,
  `select.lyr-name` col 2 row 1, `.lyr-ctl` cols 2–4 row 2, `.lyr-blend` cols 2–4 row 3,
  `button.lyr-pop` col 3 row 1). Appending the button last without a placement let
  auto-flow take row 1 col 3 first; the name narrowed, the control rows wrapped into column 2
  and the panel grew a horizontal scrollbar. Styled `#panel .lyr button.lyr-pop`.
- **The block's CSS is scoped `#panel …, #breakout .lyr-box …`** — 46 rules were widened in one
  pass when the block moved. A rule that names only `#panel` no longer reaches it.
- **The box rule is `#breakout .ctl.poppable`, never bare `.ctl`.** Every generated control is a
  `.ctl`, and the never-popped check controls (Show box, Random seed, Share one 3D world) live
  inside the block, which lives inside `#breakout` — with a bare selector each rendered as its
  own absolutely-positioned 244px box floating in the grid. That is how "Share one 3D world"
  shipped sitting away from the rest of the settings.
- **A slider popped from an OPEN layer box lands beside it** (`placeBeside`: first clear
  quarter-cell to the right, wrapping down), not at the foot of the default column.

**A LAYER'S TINT IS RESOLVED ONCE AND STORED CONCRETE** — `null` means "not chosen" and
`layerTintIdx` resolves it from the SLOT, so an unresolved layer's colour follows its
POSITION: reordering recoloured every layer a row moved past, and deleting one recoloured
everything below it. A cue that says "this box belongs to that layer" is worse than useless
when dragging a different row changes it. **`resolveTints(items)` in `installStack`** and a
`freeTintIdx` assignment in **`addStackItem`** make it concrete at the two points a layer
joins the stack — the same "resolve the fallback once at install" pattern the palette family
already uses, and for the same reason. Everything downstream reads `L.tint` first, so reorder
and delete need no code at all; they stop mattering. A null resolves to its own slot's colour
when that is free, which is exactly what it rendered as before, so a scene saved without tints
opens unchanged and is merely stable from then on. `freeTintIdx` asks the CURRENT stack what
is taken, so a colour freed by a deleted layer is available again rather than burned.
`tools/tintprobe.js` pins reorder, delete and reuse.
- **The DOM half of this was VACUOUS on the first try, and passed against the broken build.**
  A browser check that adds four layers with `+` and then deletes one exercises
  `addStackItem` — which the fix also patches — so `resolveTints` never ran and the check was
  green either way. A negative control has to neuter **every** path that could supply the
  behaviour, not the one the fix happened to be written for first.

**Each layer carries a TINT COLOUR** (`L.tint`) marking its row, its settings box and every
slider box popped out of it — with several boxes spread over the grid, the 9px `L2 · PLASMA`
label was the only thing tying one to its layer. It is an **INDEX into `CONFIG.layerTint`,
never a colour string**: the value reaches CSS as the `--lyr` custom property and a layer can
arrive from a share link, so `tintOk` accepts nothing but an in-range integer. `null` = auto
from the slot, so every scene saved before it colour-codes itself and nothing needed
migrating. It tints the **edge and the title only** — the palette is amber on near-black and
the tints are not. `syncPopOwners` stamps it beside the layer number it already re-stamps,
and **`syncStackUI` calls that**, because add/remove/scene-load change which layer a slot
holds just as much as a drag does. The swatch **skips colours the other layers show** — the
point is telling two layers apart.

**Blend on the wire is per layer; an effect may SHIP one** (descriptor `blend`, read by
`effectBlend`/`applyEffectBlend`). Glass ball ships `"over"`. Applied on a fresh item and on
an effect switch — on a switch only while the layer still carries the OUTGOING effect's
default, so a hand-picked blend is never overwritten. **`OVR` (`u: 20`) composites by
COVERAGE, not brightness**: `FS_PAL`'s alpha is `heat > 0` (it was a constant 1 nobody read),
and `FS_OKMERGE` returns the layer where covered and the accumulator where not, ignoring the
gain weight. With MAX a bright layer beneath showed straight through a metal ball, which read
as "the metal is transparent" — it was not; the mode was additive.
**`KEY` (`u: 21`) is the same idea keyed on BRIGHTNESS**, for the case `OVR` cannot serve: a
full-screen pattern shader writes heat at every pixel, so its coverage is total and `OVR`
hides everything beneath it. `KEY` ramps the layer in over `smoothstep(0.05, 0.40, L)` of
**OKLab lightness** (not Rec.709 luma — that rates a saturated blue far darker than an
equally bright red and punches a hole through it), so dark regions let the layers below
show through. It is **still gated on `lay.a`**, and that is not redundant: heat 0 maps to
palette index 0, which is a real and possibly WHITE colour, so keying on brightness alone
would let a pale background cover everything — the exact opposite of the point. A ramp, not
a step: a hard cut aliases every edge and makes the constant critical. Both modes share
`OVR`'s empty-accumulator guard, so a lone layer is opaque rather than dimmed toward black.
**Adding a mode is ONE `BLEND_MODES` row plus one `FS_OKMERGE` branch** — the dropdown, the
steppers, `blendOk` and the uniform all derive from the registry, and ids are the wire
format so list ORDER is free. There is no Canvas2D mirror to write: the fallback renders one
layer and never merges.
- **Every chevron in the app is 2x** (~20–22px); `::before` ones pin `line-height: 0`.
- **`#effect` is hidden here, not deleted** — it stays the effect value store.
- First *visible* group heading's top border via **`.grp-first`, set by `markFirstGroup()`** —
  **not `:first-child`**.

**Palette cycle**: `palcycle` dual (host `pal`) = [min,max] seconds per morph; `morphMs()` draws
each duration like `ttlMs()`. Both thumbs 0 pins it. `morphing` is **derived** (`palCycleOn()`), not
stored; `syncMorphFromSlider()` starts/pins on edit. `extras.morph` still written for compat.

**The palette family is made CONCRETE per layer at install** (`installStack` + `addStackItem`
resolve a null `palette`/`paletteRev`/`paletteBg` from `extras[L.fx] || presetExtra` ONCE).
The old policy left null palettes falling back to the runtime extras at render time —
per-effect palette memory — and its "accepted cost" stopped being acceptable the day two
same-effect layers sat open side by side: editing one glass layer's palette re-tinted the
other. Resolving once at install keeps what the fallback was for (a legacy shared-palette
scene still LOADS looking shared, both layers resolving from the same extras) while ending
the bleed. Filters and seedPts still fall back to the **descriptor default** on null.

**Each layer block has THREE TABS — Effect / Filters / Palette**, and the open tab is
**PER LAYER** (`lyrTab` is an array by slot): it shipped shared for one release, and the layer
boxes made that wrong — side-by-side workspaces must not flip each other's tabs. The block (`.lyr-tabs`, panes
`[data-k="tab-fx|tab-flt|tab-pal"]`) over the three runs of controls the block always had:
`fxctl` + Orbit editor; `filterlist` + `filterctl`; swatches + Reverse + Background +
cycle + **banding** (a filter over the palette, so it lives there). Every pane opens with a
**⚄ Random / ↺ Reset tools row** (`rnd-<t>`/`rst-<t>`): Random rolls the pane's sliders
uniformly in-range and sometimes arms a trigger; on Filters it also coin-flip-adds filters
(cap 5), on Palette it rolls the palette + sometimes Reverse. Reset = `resetControl` over the
pane's keys, plus the default chain on Filters. The old bottom "Reset this effect" button is
REMOVED — extras (palette memory, morph, show-box) are deliberately no longer one button away. **Which tab is open is ONE
value for every block** (`lyrTab`, `syncLyrTabs`), like the group folds — a tab is a way of
looking at a layer, and selecting another layer must not also switch what you are looking at.
Transient, never in `fullSnapshot()`. **It REPLACED the palette fold**: a tab is a fold with a
name, and two ways to hide the same controls is one too many. Break-out boxes are deliberately
**not** tied to the tab — you popped a slider out precisely so it stays in view. The tab
buttons `stopPropagation` on `click` only; the row's capture-phase `pointerdown` still selects
the layer, because clicking a tab IS reaching for that layer. `foldcycle-check` pins the
pane contents and the "selecting another layer keeps the tab" rule.

**Reverse colours** (`#palrev`) — **per layer**: live `paletteReverse` for the selected layer,
`L.paletteRev` otherwise (`layerPalRev(L)`), `extras[e].paletteRev` as single-layer fallback. Flips
indices **1..255** of the baked LUT, leaving 0 as background. Both bake choke points:
`composePalette` and `bakeLayerBytes(…, rev)`.

**Background** (`#palbg`) — **per layer**: `paletteBg` ∈ `"palette"` (**default**) | `"black"` |
`"white"`. Default in both deciding places: the initial global and **`bgOk`'s fallback**.

**Palette editor** (`#paledlg`, `src/palette-editor.js`): `✎` on a CUSTOM swatch edits it; new
customs come from the **picker's Create new** (`#palpick-new`) — a plain RGB ramp under a
user-supplied name via `prompt`, and **no name ⇒ no palette**. A named creation goes through the
custom branch, so closing without an edit KEEPS it. Create new must add the new index to a
**materialised `palUse` set**. Floating, non-modal, hides on `m`/`Esc`.
- **Edits LIVE, not as a draft.** **A fresh copy closed without an edit is removed again**;
  `Save & close` overrides.
- **A stop-handle drag must not rebuild `#pale-stops`** — the capture and move/up listeners live on
  the dragged button (same rule as the filter-list drag). Mid-drag goes through
  `paleApply(full, dragLive)`; the full re-render runs on release. `setPointerCapture` is wrapped in
  try/catch (synthetic probe events carry no live pointer).
- **Customs live in the SAME `PALETTES` array**, after the built-ins; `PAL_BUILTIN` captured
  immediately after the literal. `grad()` hangs `stops` on the returned fn; `palStopsOf` samples the
  three procedural ramps.
- **`applyBlob` must install customs BEFORE validating any palette value.** `customPalettesOk` drops
  malformed entries and **sorts stop lists**.
- **Deleting a custom shifts later indices down** ⇒ `palRemapDeleted` rewrites the live stack,
  per-effect `extras` and every preset (runtime is index-based). Links written since palette
  ids shipped are immune (ids don't shift); OLD numeric links still resolve by position and can
  land on a different custom after a deletion — unfixable for links already minted.

**`palGone`** — SOFT-deleted shipped palettes (a tombstone Set of built-in indices, persisted beside
`palUse`, skipped while sharing). **A built-in can never really be removed** — indices are the wire
format — so the entry stays in `PALETTES` and `palInUse` gates it out of the strip/picker/cycle.
`deleteAnyPalette` is the one entry and the **per-row ✕ is its only caller** (a "Delete selected"
button acting on the swatch highlighted behind the dialog was a second, blinder way into the same
destructive path — removed): customs really delete, built-ins tombstone; **floor = one alive palette
total**, enforced again at `applyBlob`. **"Select all" clears the tombstones** — the recovery path.
- **Deleting falls back to an IN-USE palette** — `palFallbackFor(gone)` (beside `palInUse`) walks
  **display order** (`palByName`) from just after `gone`, wrapping, and takes the first palette
  `palInUse` allows; if nothing else is in use, the first that is merely **ALIVE**. It must
  **never return a tombstoned palette** — the first version fell through to `PALETTES[0]`, so
  deleting Fire and then deleting the palette you were on landed straight back on Fire.
  `tools/palprobe.js` pins exactly that case.
- It returns a **pre-splice** index, so `deleteCustomPalette`/`deletePalEditor` shift a result
  above `gone` down by one before handing it to `palRemapDeleted` — `palRemapOne` writes `back`
  verbatim. The editor's own Delete still prefers the palette the copy came from, but only while
  that one is in use.
- **`palKeepInUse(land)`** runs after every delete (after `palRemapDeleted`, which shifts
  `palUse`'s indices): if you had narrowed the in-use set to the palette you just deleted, the
  landing one joins it, so the strip never goes empty and the cycle always has somewhere to go.

**`palUse`** (`#palpickdlg`, the "+ Choose palettes" tile ending the strip): gates the STRIP and the
CYCLE only (`pickOther` picks from it). A scene storing an unticked palette still loads and renders.
`null` = all; `setPalUse` collapses full/empty back to `null`. Global blob field, skipped while
`sharing`. **Indices ⇒ `palRemapDeleted` must remap it.**

**Palette identity: stable string ids on the WIRE, indices at runtime** — same split as effects.
`PAL_IDS` (frozen against the `PALETTES` literal, append-only, ids are forever) + content-hash
ids for customs (`palHashId`, minted/deduped in `customPalettesOk`, riding in the blob's
`palettes` entries). Conversion happens only in `serializeBlob`/`deserializeBlob` (`palIdOut`/
`palIdxIn` + the `palEx*`/`palLayers*`/`palList*` wrappers over extras values, layer items,
presets' extra+layers, `palUse`, `palGone`). Decode order: numeric = legacy position (why the
ORDER is still append-only forever), built-in id, the **blob's own `palettes` list** (normalized
in `deserializeBlob` so positions match what `applyBlob` installs), then the live custom tail
(content ids let identical ramps match across users); unknown ⇒ dropped, never misfiled.
**Names may change freely; ids and order may not.** `palprobe` pins the table and the round trip.
The UI lists palettes **by name** through **`palByName()`** (beside `palInUse`): the strip, the
picker rows and the hidden `#palette` options are appended in name order while `PALETTES` itself
never moves, and every option/swatch still carries the real index (`value`, `data-pal`).

**Palette picker**: `#palette <select>` is the hidden value store; `#palswatches` is visible (one
gradient per in-use entry via `palGradientCss(i)`). A swatch sets `paletteSel.value` and dispatches
a bubbling `change` — no extra state. `syncPalSwatches()` mirrors the highlight on programmatic
changes. Keep the select in the DOM.

**`setEffect(i, save)`** shows `params`, runs `onEnter`, swaps five per-effect maps: `states[e]`,
`beatStates[e]`, `pulseStates[e]` (default `"snap"`), `plenStates[e]` (default `PULSE_DROP`),
`extras[e]`. Calls `save*` for the outgoing effect, `load*` for the incoming. **It does not clear
the heat buffer**; `acc = 0` still resets.

**Beat chips ship unarmed**; per-band colours (L blue, M green, H red) tint them even UNARMED
(letter/border/faint fill); armed = full solid fill + glow.

**Beat dots** (`.ctl-dot`, `dotEls`): ≤3 per row, **12px**, chip colours, `display:none` unless
armed, `opacity .75` idle, lit by `flashChips()` (the idle figure is repeated in `flashChips`'s ramp
— keep the two in step). `syncDots()` is called **from** `syncChips()`; dots exist only for keys
present in `chipEls`.

**Beat pulse**: `updateAnims` snaps an armed slider to the high thumb and decays `a.pulse` linearly
1→0 over `pulseLen[id]` seconds (`.plen`, `PLEN_MIN`–`PLEN_MAX`, default `PULSE_DROP` = 0.2s).
`pulseShape[id]` reshapes it: `a.apply(mn + shape(a.pulse)*(mx-mn))`. Every `PULSE_SHAPES` fn maps
`[0,1]→[0,1]` with **`f(0)=0`**; `snap` is identity.
- **`f(0)=0` is the load-bearing half** — the pulse rests at 0 once it has run out, so a shape
  that is non-zero there pins the slider at the high thumb permanently.
- **`f(1)=1` is only a CONVENTION**, and `swell`/`bloom` deliberately break it. It makes a
  shape a pure *release* (high the instant the beat lands, then falling), which is why for a
  long time there was no way to make a beat swell a slider up — the naive inversion `1 - p`
  is not a swell, it is the permanent pin above. A hump (0 at the beat, 1 partway through,
  0 at rest) satisfies the real constraint and is what those two are. `pulseEls`/`syncPulse` mirror
`chipEls`/`syncChips`; `plenEls`/`syncPlen`/`prunePlens`/`mergePlen` mirror the shape set.

### The effect stack (layers)
Ordered list of ≤4 effects composited into one heat buffer. `stack`, `stackSel`, `STACK_MAX` = 4.

**Never call it `layers` in code** — `layers` is already a CONTROLS key (`layerCount`/`LAYER_MAX`,
copies of the *fractal*) persisted in every `states[e]`. "Layer" is user-facing only. Use
`stackSel`, not `slot` (a local in both ping-pong loops).

**`effect` = the SELECTED item's effect**, assigned only in `setEffect`. Only the render path reads
`stack`. **`EFFECTS[effect]` must never reappear in a render path.**

**Pressing anywhere in a row selects that layer** — capture-phase `pointerdown` (children
`stopPropagation()` on `click`) plus capture-phase `focusin`. The `click` listener stays for
synthetic clicks; `selectStack` early-returns when already selected. **The grab handle is excluded**
— it selects on pointer**up**.

**Rows are a FIXED POOL of `STACK_MAX`, keyed by SLOT, built once, never destroyed.** `syncStackUI`
only paints; spares hidden. **Every handler reads `stack[slot]` live.**

**Every row has its own effect `<select>`** (`select.lyr-name`). A change on a non-selected row calls
`selectStack(j)` **first**; `fx` is read off the `<select>` **before** either call.

**The DOM is the store for the selected item; every other item holds plain numbers.** `loadState`
writes the DOM and dispatches synthetic `input`. `bandOf`/`beatOf`/`shapeOf`/`plenOf` short-circuit
to singletons for a one-item stack. `freezeItem`/`thawItem` move between representations and **null
the record on thaw**. Reading a frozen record without freezing first loses the last edit.

**Palette + filter stack are per-layer** (`L.palette`, `L.filters` — not `extras[e]`). Live
`paletteSel.value` + `activeIds` are the selected layer's. `applyLayerExtras(L)` puts a layer's
palette+filters live; `captureLayerExtras` reads them back. **Switching layers must run
`stageLayerExtras(L)` BEFORE `setEffect`.** Changing a layer's effect KEEPS its palette/filters.

**Animation is split scene vs layer.** `bindRange` tags `anims` entries `scene` via `isSceneCtl` —
palette, banding, camera, display zoom. Most filter params are LAYER keys; only
`SHARED_FILTER_KEYS` are scene-wide: `burn`, `bloom`, `barrel`, `scan`, `scancount`, `vignette`,
`grain`. Scene keys apply immediately; layer keys are computed, then `installStackItem(L)` pushes

**THE SEVEN SHARED KEYS ARE STORED PER LAYER AND RENDERED SCENE-WIDE, and four sites have to
agree about that.** They ride every layer's `state` on the wire (that is the format saved
scenes already use, and `freezeItem` deliberately does NOT skip them), but there is one live
value for the picture and its nodes are **singletons** — `W[0]` holds them, because `ctlIn`
falls through to `getElementById`. So:
- **`saveState` WRITES them** (no skip) — a single-layer scene's state rides top-level rather
  than in a `layers` array, so skipping here would stop it persisting its glow entirely.
- **`loadState` and `paintBlock` SKIP them** (`SHARED_FILTER_KEYS`, *not* the deliberately
  empty `SCENE_FILTER_KEYS`, which is the whole-scene-filter WIRE seam `migrateSceneFx`
  needs). Both used to write them, so selecting a layer or switching an effect retuned the
  whole picture's Burn/Bloom/Barrel/Scanlines/Vignette/Grain. **An editing action must never
  change the render.**
- **`stackOut` STAMPS the live values onto every layer** before serialising. Only the
  SELECTED layer is ever frozen, so an edit made with layer 2 up reached layer 2's record and
  nowhere else — while the load side reads layer 0's, and silently discarded it.
- **`installStack` SEEDS the singletons from layer 0** after the thaw, capturing them
  **BEFORE** it (`thawItem` NULLS `L.state`). Layer 0 is not arbitrary: installStack has
  always thawed item 0 and let `loadState` write from its state, so that is the copy every
  existing scene has been rendering with. Reading any other layer changes how saved scenes
  look.
- **`bloomAmt` is GATED, `bloomRaw` is NOT**, and `glBloomPass` reads `bloomRaw`. The gate is
  `filterOn("bloom")`, which answers for the SELECTED layer — `renderFilters` is null on the
  stacked path by construction — so a layer with Bloom in its own chain rendered at strength
  0 whenever the selected layer lacked it. `bloomAmt` keeps its meaning for the Canvas2D
  composite, which really is one picture with one chain.
- **Still ONE value for the scene**: two layers cannot have different Vignette amounts.
  Making them per-layer means reclassifying out of `SHARED_FILTER_KEYS`, and the normal case
  (a value set with layer 0 selected, the others still on the shipped seed) would then load
  looking different — a MAJOR bump. It needs a wire marker and a migration.
them before that item draws. **Feedback params are read during propagation, before
`installStackItem` in the single-layer path** — that branch calls `installStackItem(live[0])` up
front.

`updateAnims` is **key-major, not item-major** (each drift segment draws twice from `Math.random`).

**Epilogue `installStackItem(stack[stackSel])`** after the loop — `glRender`, `render()` and
`cardDraw` read these globals outside any item's turn.

Beats need no per-item work (`beatReact`/`pulseShape`/`pulseLen` are singletons; the stack loop
lives *inside* `updateAnims`). **`clearBeats()` must stay after the whole loop.**

**Phase clocks are per item via `PHASE_VARS`** — 16 accumulators (`simT`, `spinAngle`, `nodPhase`,
`juliaOuter/Inner`, `plasmaTime`, …), installed before an item draws, captured after. **Add a line
when you add an effect that accumulates a clock** — otherwise two items share one clock and render
as a single brighter copy; no error, no probe. `installStack` seeds each item's phase from the
**current** clocks.

**Compositing (heat-space)**: each item renders into `glTex.layer`, merges via
`glMergeLayer(blend, gain)` (`FS_MERGE`). `glShaderDraw` overwrites the scratch with blending off.
**Gain must be a multiply inside the shader, not a blend factor** (`blendEquation(MAX)` ignores
`blendFunc`). `glMergeLayer` restores BLEND **and** `blendEquation` **and** `blendFunc`.

**Per-layer palettes — two paths, gated on live-layer count.** `live.length <= 1` ⇒ the old
heat-space merge, byte-for-byte. Two or more ⇒ **`renderStackColor`**, each layer coloured with its
own palette and blended in **OKLab**.
- Each layer owns `glTex.heatL[slot]` and runs its own feedback via **`glLayerBeginHeat`** (a copy
  of `glBeginHeat`'s ping-pong — **not** `glBeginHeat` itself, which stays untouched for the
  `heatprobe` slice). `renderLayerHeat` calls `installStackItem(L)` first.
- `stepLayerPal(slot)` is a per-slot morph clock drawing durations from the shared sliders.
  `bakeLayerBytes` bakes ramp + live banding into `glTex.palL[slot]`. `layerPalIndex` reads the
  **live dropdown** for the selected layer (`L.palette` is null while selected), `L.palette`
  otherwise.
- `glColorizeLayer` (FS_PAL) → `glLayerPostChain(L)` → `glOkMerge` into `glTex.color[0/1]`. Blend =
  `L.blend` → `BLEND_MODES[].u` → `FS_OKMERGE` branch: `0` add (brightness-weighted), `1` max, `2`
  diff, `3` colour, `4` luminosity. **`BLEND_MODES` is the single source of truth** (row button,
  uniform, `blendOk`). An **`accW < ε` guard** returns the plain layer before the branch. `L.gain`
  scales the weight ONCE here. `FS_OKMERGE` takes a finished RGB layer (`uLayer`). `glRender` starts
  from `glColorTex`, skipping the shared `FS_PAL` and composite `glPostChain`.
- **Menu grouping**: `buildFilterUI` groups by `filterGroup(f)` — feedback + post-minus-Bloom are
  ONE group ("Per-effect · heat, trails & image"), Bloom + screen are "Whole scene · final image".
  Works only because registry order keeps that run contiguous.
- Canvas2D fallback untouched: one item, one palette.
- `STACK_MAX` is declared up by the canvas/GL setup (TDZ — `initGL` allocates per-layer buffers).

**Point items own the tick loop**: one `beginHeatTick()` per tick, then every point item stamps and
blits (`glPtCount` reset per item), `curHeat = pendingDst` once at tick end; shader items draw once
per frame after. `stampTick(L, now)` is the reusable stamp half. No point items and no retention ⇒
**`glClearHeatCurrent()`**, *not* `glBeginHeat`'s no-chain branch.

**Canvas2D fallback renders ONE item** (first unmuted) — mirrors assign rather than MAX.

**Zoom applies to CONTENT, never the finished picture.** Shaders divide coordinates by `zoom`
(`bakesOwnZoom`); point effects **`plot()`-scale about the grid centre before stamping**, composed
with the camera 2×2. The fractal rasterises at full grid resolution; out-of-grid points drop.
- `zoomPoints()` multiplies count by `zoom²` at the one choke point in `stampTick`, capped at
  `CONFIG.tuning.zoomPointCap` = **8**.
- **`stackZoom()` is always 1** ⇒ `FS_ZOOM` is an identity blit and the CPU zoom block is dead. Both
  kept deliberately.

**Every scene loads through `mergeLayers`, single-layer included.** `applyBlob`'s no-`layers`
branch hands mergeLayers a preset-shaped view of the just-validated runtime maps
(`states[e]`/`extras[e]`/…, plus `saved.ranges` — one item's bounds ride in the scene-wide map),
so its fallback branch is the ONE place a top-level-fields scene becomes a stack item. It used to
hand-seed `stack[0].filters`/`ranges` instead, and each was a shipped bug first. Two non-fixes:
**do not add an `extras[L.fx]` fallback to `applyLayerExtras`**, and **setting live `activeIds`
does not survive** (`stackOut()` returns null for one item).

**Persistence: an optional `layers` array.** One item ⇒ **nothing emitted**. `mergeLayers` truncates
to `STACK_MAX`, drops retired effect ids, clamps gain, defaults blend, and runs every per-item map
through its own `merge*` **against that item's own effect**. Items omitting `palette`/`filters` fall
back to the top-level `extra`. `installShared` re-seeds a single-item stack. **`blendOk`/`gainOk`
are function declarations, not const arrows** (a const TDZ there aborts startup and surfaces as a
confusing later TDZ on `nextSwitch`).

`?stack=plasma,tunnel` — dev hook, never persisted.

### Scene collections
A preset carries an optional **`collection`** (the published profile it came from), riding **beside
`name`**, **not** part of `snapshotScene`. **Must be listed explicitly in `validatePresetList`** —
that mapping rebuilds each preset from an object literal, so anything missing is dropped on every
cloud load and gallery install.

**The gallery installs a collection instead of merging**: `applySharedLibrary(raw, replace,
collection)` stages `pendingRestore`, and `applyRestore` has a third branch — drop every preset
carrying that collection, append the incoming ones stamped with it. `out.curPreset` matches the
sender's selection **within that collection**. One button (`Load scenes`).

**`#preset` is the hidden value store**; `#presetlist` is visible, built by `buildPresetList()` (a
`<select>` cannot collapse an `<optgroup>`). Called from `rebuildPresetOptions`, from `applyPreset`,
and from the `change` handler's `-1` branch — miss one and the highlight goes stale.

**`openCollections` is a transient Set starting empty.** Your own group is always emitted, even
empty. `dropCollection` re-finds the selection **by identity** after filtering.

**Your own group is labelled with your profile name, cached for the FIRST paint.** `myProfileName()`
reads `#cloud-name` then falls back to **`PROFILE_NAME_KEY`** (`burnTheWeb.profile.v1`)
*synchronously*. **`setProfileName(v)` is the one way the name is set** — writes field, cache, and
calls `buildPresetList()`. Its own key, **not** part of `cloudSess`. `myCollectionLabel()` =
`myProfileName() || DEFAULT_PROFILE_NAME` (`"Kicktro"`); `sceneTitleFor` uses `myProfileName()`
**without** the default.

**`p.rotate`** — per-scene auto-cycle checkbox. `inRotation(p)` is `!(p.rotate === false)` —
**absent means IN**; `setRotation` *deletes* the key rather than writing `true`. `rotationPool()` is
rebuilt per tick; nothing ticked ⇒ the cycler **idles**. `setRotation` calls `persist()` but **not**
`autosavePreset()`. Like `collection`, **not** in `snapshotScene` and **must be listed in
`validatePresetList`**. The row is a `.pl-row` with the checkbox **beside** the `.pl-scene` button;
its click `stopPropagation()`s. Every `.pl-scene` is a real saved scene.

**`autosavePreset` must carry over every field that rides beside `name`** (it rebuilds from
`snapshotScene()`, which captures none of them). Adding such a field means editing **three** places:
`autosavePreset`, `validatePresetList`, and wherever it is set. The third such field is **`origin`**,
the scene's ORIGINAL author, kept across a copy: `createPreset` stamps `originOf(cur)` (the source's
`origin`, else its `collection` — never `"Shared with you"`), `adoptSharedScene` takes it from the
share blob's `author` (`sceneBlob` writes yours, or the copied scene's), and `sceneTitleFor` shows
`name · origin · collection-or-you`. `tools/author-check.js` pins it.

### Presets & persistence
**User-facing word is "scene"; the code word is "preset".** Nothing in the code or wire format was
renamed (`presets`, `curPreset`, `kind: "preset"`, `#preset`, `.presetrow`, every `*Preset*`).
Consequences: **`HELP.sliders[].n` must match the rendered label text** (`ctlHelpBlurb` looks up by
`ctlLabel(key)`), and `safeFileName`'s empty-name fallback is `"Scene"`.

A preset = `snapshotScene()`: `{name, effect, state, beat, pulse, plen, cam, sceneFx, beatTune,
ranges, ttl, tdur, extra, layers}`. The globals are deliberately carried, because anything missing
renders as the recipient's value: `cam` (in no effect's `defaults`), `sceneFx` (lives nowhere in an
effect's state), `beatTune` (different thresholds = different animation), `ranges` (`mergeState`
does **no** bounds check and `loadState`'s `el.value =` is DOM-clamped), `ttl` + `tdur` (installed
via `applyPresetDual`).

`applyPreset` applies `ranges` **first**, then `ttl`/`tdur`. `presetprobe` asserts every restored
field is one `snapshotScene` captures *and* one the import mapping carries.

**Does not travel**: resolution (`cfg.scale`), audio on/off, the `randSeed` re-roll, the
`Date.now()` chaos seed, every accumulated phase.

**First-visit library** built once when `presets.length === 0`: `defaultPresets()`, applied at index
0, then `persist()` once. It is **`DEFAULT_LIBRARY` — FIFTEEN scenes since 1.72.0**: the whole
published *Erbsman* cloud library (minus its own Blank canvas) plus *dyze*'s `Fetingen` as
`Fetingen (dyze)`, pulled from Firestore and pasted in with every `collection` field STRIPPED
(a stray one would file the scene under a borrowed collection) — **plus `blankPreset()` APPENDED**: `Blank canvas`, one neutral Plasma layer,
no filters, built live from the shipped defaults via **`neutralPreset(e, name)`** (never a
hand-frozen blob) and carrying **`rotate: false`** so the deliberately-still scene stays out of the
auto-cycle show.
- **Wire format** (effect ids), so a registry reorder cannot remap them, and every map is kept
  **whole**. Re-export from the app and paste over to change them.
- `defaultPresets()` runs it through `deserializeBlob`, which drops any scene naming a retired
  effect; if that took the lot it falls back to **`perEffectPresets()`** (backstop only), so the
  library can never be empty and break the always-something-selected invariant. The fallback does
  **not** append the blank (its scenes are all already the neutral defaults); a retired `plasma`
  id makes `blankPreset()` return null — dropped, never misfiled.
- **`function defaultPresets(` is a `presetprobe` slicing marker** — keep the name and keep it
  directly after `snapshotScene`.

**AUTO-CYCLE RUNS WHETHER OR NOT THE EDITOR IS SHOWING** (the panel gate of 1.5x–1.72 was
reverted by request in 1.73.0 — do not put it back). `restore()` still hides the panel when
`saved.panelOpen` is ABSENT (first visit only) so a new visitor lands on the show, not the
editor. `tools/foldcycle-check.js` asserts the cycle switches with the panel open.

**The ⚙ top button (`#panelbtn`) toggles the panel** through the same `setPanel` the M key
and the ☰ entry use; `syncPanelBtn()` inside `setPanel` mirrors `aria-pressed`/`.on`. It is
in every `#toggle, #fs, #mute` CSS list, `body.ui-hidden` included.

**Creating a preset, adopting a shared scene and restoring a backup all `stopCycling()`.**
`applyRestore` can't (it reloads), so it writes `out.cycle = false` **last**.

**Switching effect stays on the selected preset and folds the change into it** — three lines:
`setEffect`, `autosavePreset`, `persist`. A preset named after its original effect keeps that name;
**intended**. `presetprobe` asserts this structurally.

**THERE IS NO "unsaved scene" — something is ALWAYS selected**: `presets.length >= 1` and
`0 <= curPreset < presets.length`. **`ensureSelection()`** is the single choke point; `curPreset =
-1` survives only as the bootstrap declaration and `applyBlob`'s empty-library fallback, and
`presetprobe` fails if a third site appears. A stored blob or link carrying `-1` resolves to scene 0.
- **The corollary is the whole risk: selection and live state must AGREE.** `autosavePreset()`
  writes on every edit, so any path that changes the selection while leaving a different picture up
  overwrites the newly selected scene on the next slider move. **Delete** and **`dropCollection`**
  therefore call `applyPreset`, and a settings-only restore lands on scene 0 *and applies it*.
- Deleting the last scene **re-seeds** the shipped library.
- **A shared link is kept**, as a scene in a `"Shared with you"` collection (`SHARED_COLLECTION`).
  `installShared` only parks `pendingShared`; **`adoptSharedScene()`** does the library write. That
  split is mandatory: the legacy `?s=` path calls `installShared` **synchronously mid-slice**, three
  slices before the preset code exists and before `restore()` has built the library.
  `adoptSharedScene` is idempotent and is called from the startup epilogue (covering `?s=`) and from
  the `?z=`/`#c=` handlers. Only `#c=` has a real name (the `/scenes` doc's `name`); the rest fall
  back to `"Shared scene"` — **`bumpName` only when it is taken**.

Presets are **local to the browser**; selecting one links edits to it (`onEdit` →
`autosavePreset()`, no manual save). `mergeState()` normalizes against `presetState(e)`;
`mergePulse()` does the same for `pulse`. **All four of `applyPreset`'s maps must go through
`merge*`** — `mergeState`, `mergeBeat`, `mergePulse`, `mergePlen`. **`classList.toggle("on",
undefined)` *flips* the class**, so `loadBeat` spreads over an all-false base and `syncChips`
coerces with `!!`.

**Beat chips are `<button>`s — no `input`/`change`, so `onEdit` cannot see them.** `chipEdited()`
calls `autosavePreset()` (guarded on `persistReady && !applyingPreset`) then `persist()`.

- **Storage**: `localStorage["burnTheWeb.v1"]` = `{states, beats, pulses, plens, extras, effect,
  ranges, beatTune, presets, curPreset, cycle, ttl, scale, panelOpen, audio}`, built by
  **`fullSnapshot()`** — the definition of "everything we remember". `persist()` and Backup
  serialize exactly that. `applyBlob(saved, sharing)` applies `ranges` + `beatTune` **first**, then
  validates every value against those bounds. Anything not in `fullSnapshot()` is transient.
- **Custom slider ranges** are saved: `RNG_ORIG` captures shipped bounds up top (before
  `restore()`), `collectRanges()` stores only differences, `applyRanges()` sets them back. They ride
  in `localStorage`, the share URL and Backup.

### Share / bundle / backup codecs
**Everything that DECODES must keep working forever.** `?z=`/`?s=`, `#zp=`/`#sp=`, `#c=` all still
open, landing in the **Restore dialog**.

- **`?z=`** — JSON → `CompressionStream("deflate-raw")` → **base64url**. `?s=` (plain base64) is
  emitted when `CompressionStream` is missing and **decoded forever**; `?z=` is checked first,
  mutually exclusive. Values rounded to `CONTROLS.step` then **clamped to live bounds**
  (`applyBlob`'s `ok()` hard-rejects). Decoding is **async**, landing after startup's `setEffect`,
  so the promise re-activates with `resize()` + `setEffect(…)`. `shareUrl()` is async; Share copies
  via `ClipboardItem`'s promise form so the gesture survives the `await`. `stripShareParam()` runs
  at startup.
- **Encodes only the CURRENT scene** — `{states, beats, pulses, plens, extras, effect, cam,
  beatTune, ranges}`, one entry per per-effect map. Map *shape* unchanged (`{[effectIndex]: …}`), so
  old all-effects links still decode. `cycle`/`ttl` dropped.
- **`pruneBeats()`/`prunePulses()` prune against the descriptor's defaults, not all-false.**
  Share-only; `fullSnapshot()` stays verbose. Works **only because `applyShared` re-seeds first**.
- **Short link**: `shortenUrl(url)` POSTs to `tinyurl.com/api-create.php` (301s byte-for-byte, CORS,
  no key, doesn't block `github.io`; is.gd/v.gd reject all GitHub domains). It signals failure with
  **200 + an error string**, so validate the response shape.
- **Preset bundles**: `libraryUrl(chosen)` = `serializeBlob({presets, cycle, curPreset})` → deflate.
  **Rides in the URL FRAGMENT — `#zp=` (fallback `#sp=`), never a `?query`** (a multi-KB query gets
  **414** from Pages/Fastly before any JS runs). Recipient: `applyShared()` checks the fragment
  **first** → **`openSharedLibrary`** → `normalizeBackup` → `deserializeBlob` →
  **`validatePresetList`** → Restore dialog. A **file** restore forces auto-cycle off; a **link**
  honours the sender's toggle (`__link` gates it). `applyRestore` stashes the preset index in
  `sessionStorage["btw.applyPreset"]`; startup reads it once.
- **Ordering trap**: `openSharedLibrary` lives in `persist-backup-restore.js` but `applyShared()` is
  called during the earlier `audio-tuning-data.js` load, so `pendingRestore`/`openRestore` are in
  the TDZ. The async `#zp=` `.then` lands after all slices; the sync `#sp=` path must be deferred
  the same way (`Promise.resolve().then(…)`). Same for `#c=`.
- **Backup** = one file per preset + `_settings.json`. `backupFiles()` builds `[{name, text}]`; each
  preset file is `{app, kind: "preset", version, preset}` through `serializeBlob`. `curPreset` is
  **not** in `_settings.json`. Delivery splits on `showDirectoryPicker`: Chromium writes
  `Kicktro/<YYYY-MM-DD_HHMM>/`; everything else downloads **~150ms apart** and **flattens**.
  - Folder handle lives in IndexedDB (`burnTheWeb.fs`); `backupRoot()` reuses it while permitted.
    **Shift-click Backup forces a re-pick.** A write failure calls `bkClear()`. **`bkStore` must
    always resolve** — a throw inside an IDB event handler hangs Backup forever.
  - **`safeFileName`** strips path separators, Windows-illegal chars and control codes, trims, drops
    trailing dots/spaces, escapes device names (`CON`, `NUL`, `COM1`…), truncates to 80, falls back
    to `Scene`. `backupFiles` de-duplicates with ` (2)`. Pinned by `presetprobe`.
- **Restore** takes **multiple files**. `normalizeBackup()` folds every shape ever written into one
  and runs **before** `deserializeBlob`. `openRestore(parsed, valid, name)` shows a checkbox per
  part plus merge-vs-replace (**Presets is not always enabled** — `_settings.json` alone is
  legitimate). `applyRestore()` starts from `fullSnapshot()`, overrides ticked parts, writes
  `localStorage`, **reloads**. (`location.reload` is non-configurable in Chromium — tests read
  `localStorage` synchronously and stash the verdict in `sessionStorage`.)

**Backup / Restore buttons are gone from the menu**; the cloud profile is the way in and out. Only
the file/link *creating* half was removed. `libraryUrl`, `shortenUrl`, `backupFiles`, `safeFileName`
and the IndexedDB helpers are **deliberately kept** (pure builders, probe-pinned);
`validatePresetList` and `normalizeBackup` are live — the cloud path uses them.
**Share came back by request as `#sharepreset`** in the Scene box's button row (wired in
`persist-presets.js`): `cloudShareScene()` → the ~30-char Firestore `#c=` link, `?z=` fallback when
signed out or on any cloud failure. The copy uses **`ClipboardItem`'s promise form** (claim the
clipboard inside the click gesture, before the async link resolves), then `writeText`, then
`prompt()` — the link is never silently lost.

### Cloud profiles (Firebase Auth + Firestore, over REST)
`src/cloud-profile.js` is the whole client; `firestore.rules` is the whole security boundary.

**No Firebase SDK** — `fetch()` against `identitytoolkit` (exchange a Google ID token),
`securetoken` (refresh), `firestore` (the document). The one remote script is Google Identity
Services for the sign-in button. **`CONFIG.cloud.apiKey` is a kill switch** (like
`CONFIG.analyticsId`): empty ⇒ row hidden, no script injected, **no request at all**.

**The payload is one deflated string, not Firestore structure.** `cloudBlob()` builds a
`libraryUrl()`-shaped blob through the same `serializeBlob` + `zipToB64` — **same codec, same decode
path**, so a downloaded profile goes straight to `openSharedLibrary(raw)`. Since 1.14.0 the CONTENT
differs on purpose (borrowed presets filtered, plus a `collections` field `libraryUrl` never emits)
— a filtered superset of the shape, NOT the same bytes. **What must never diverge is the
codec/decode path itself**; `cloudprobe` asserts it structurally.

**Rules are the only defence** (the web API key is public by design, there is no backend). They
carry the size caps a server's body limit would provide, and `hasOnly()` pins the document shape.
`firestore.rules` is checked in; its header lists the nine cases to verify in the Rules Playground.

Tokens: id token ~1h, refreshed **60s early**; a 401 mid-flight refreshes and retries **exactly
once**. Session tokens live under their own `localStorage` key, **not** the scene blob.

**"Share this scene"** stores the scene in Firestore, returns `#c=<docId>` (~12 chars). Signed out
or refused ⇒ falls back to `?z=`; the cloud route is an optimisation, not a gate. Payload is
**`sceneBlob()`, split out of `shareUrl`**; the recipient path is `installShared`.

**Shared scenes live in `/scenes`, NOT `/profiles`.** World-readable, created only by a signed-in
user stamping their own uid as `owner`, **immutable** (`allow update: if false`), deletable by their
owner.
- **`/scenes` is unlistable by design, so the minted id is NOTED at share time** —
  `burnTheWeb.sharelinks.v1` (device history, its own key) is the only record that can ever
  exist, and "My shared links" in the cloud box (copy / ✕ = delete the document) is the one
  retraction path. Links minted before the note existed can't be listed. `cloudDelete` sweeps
  the noted ones (`shareLinksDeleteAll`) beside the snapshots sweep. `cloudprobe` pins all of it.

**A FIRST SIGN-IN SEEDS THE ACCOUNT FROM THIS MACHINE.** Signing in used to leave the profile
empty until the user found Save, so the scenes they had been working on — or the shipped library
they had just been shown — lived only in that browser and the account read as broken.
`cloudFetchProfileMeta(seedIfMissing)`'s 404 branch calls `cloudSave()`.
- **Only `cloudSave` may do the writing**, because its precondition asserts `exists=false` from
  the `docTime` that branch has just recorded — so seeding can only ever CREATE. It cannot
  overwrite a profile, and two fresh machines racing their first save still lose cleanly.
- **`seedIfMissing` is passed by the SIGN-IN caller only.** The same function runs at startup for
  an existing session, and an unconditional seed would silently re-upload the local library
  every time someone who deliberately DELETED their cloud profile opened the page. `cloudprobe`
  asserts the startup call passes nothing.

**`cloudApplyPayload(payload)` is the ONE place a stored payload becomes a library** — unzip → parse
→ `openSharedLibrary`. `cloudLoad` is its only caller today; the seam is kept deliberately.
`cloudprobe` pins it.

**ONLY THE CURRENT VERSION IS STORED.** A profile is one document; a save replaces it. No version
history (shipped 1.13.0, removed 1.13.1 — a snapshot was a copy of the *whole library*, not a delta).
- **The save carries a `currentDocument` precondition** from `cloudSess.docTime` — the server
  `updateTime` this browser last saw (`"none"` = known absent ⇒ `exists=false`; absent = never
  seen ⇒ unguarded, the pre-feature behaviour). Every path that learns the version records it
  (`cloudNoteDocTime`: load, meta fetch, save response, delete, 404s). A stale save re-arms via
  `cloudRearmDocTime()` and reports; a deliberate second Save overwrites. This is what makes the
  Publish checkbox safe on a stale machine — it routes through `cloudSave`. `cloudprobe` pins it.
- **Deleting a scene locally already removes it from the cloud** — `cloudBlob()` is built from
  `fullSnapshot()` and the write is a full replace. A deleted scene survives only in `/scenes` share
  links, immutable by design.
- **`cloudBlob()` sends YOUR scenes only — except `"Shared with you"`**, which uploads like your own
  work (an adopted link scene has no source profile to re-fetch from). Every other preset carrying a
  `collection` is dropped. What rides instead is **`collections`**, the list of `{key, uid}` you
  hold. A borrowed collection with **no follow entry** is noted **uid-less** before its scenes are
  dropped, and `refollowCollections` resolves it by name; never clobber an entry that has a uid.
  `curPreset` indexes the array being sent, so it is **remapped, not copied**, falling back to 0.
  `cloudSave` refuses only when there are **no scenes AND no follows** — a follow-list alone is a
  legal, count-0 document.
- **`collectionsHeld` is declared in `audio-tuning-data.js`, filled from `persist-presets.js`**
  (`noteCollection`/`forgetCollection`/`collectionsOk`, function declarations so they hoist).
  `restore()` runs at the foot of that earlier slice, so a `let` beside the functions is in the TDZ
  on **every reload that carries the field** — the same split as `cpuBlocked`. **The follow is noted
  INSIDE `applySharedLibrary`, after validation passes** (galLoad hands the uid through).
  **`delpreset` calls `forgetCollection` when the delete empties a collection**; its confirm says a
  partially-kept collection refreshes on load (the follow model, not a bug).
- **`refollowCollections(raw)` puts them back, INSIDE `cloudApplyPayload`** — before anything is
  applied, so the whole load stays **one `applyRestore` and one reload**.
  - **Appended, never prepended** — `curPreset` indexes that array.
  - Each fetched scene is **re-stamped with the key YOU follow it under**.
  - A collection **already present in the payload is not re-fetched**.
  - A source that is gone/unpublished/corrupt is **skipped and named**; it resolves `{raw, missed}`
    so the caller can report without `cloudMsg("")` wiping it. Sequential.
  - **A uid-less entry is resolved by NAME against `galList()`** (the collection key IS the source
    profile's name). One listing covers every such entry; a healed uid is **written back into
    `raw.collections`**. Still unresolved ⇒ `missed`, by name — a `c.uid &&` filter would make
    uid-less entries doubly invisible.
  - `galFetchLibrary(uid)` is the shared fetch→unzip→parse, split out of `galLoad`.
- **`applyRestore`'s MERGE matches on `(name, collection)`, not name alone** — else a borrowed
  "Sunset" overwrites yours. Identical for anything with no collections (every key is `""`).
- **`sharedLibrary` carries `collections` through**, and `applyRestore` writes it **only when
  `__ownCloud` is set** (and `coll` unset). `__ownCloud` comes from **`cloudOwnLoad`, an
  out-of-band `let` beside `sharedLibrary`** that only `cloudApplyPayload` sets and the next
  `sharedLibrary()` consumes — **never from the payload**, which is attacker-authored JSON.
  **Merge mode UNIONS the follow-lists** (local wins unless the incoming one has a uid the local
  lacks); Replace replaces.
- `firestore.rules` still carries a **read-and-delete-only** `snapshots` block: those documents are
  owner-only and **Firestore does not cascade-delete**, so without it anything written while the
  feature existed would be permanently unreachable *and* undeletable. Drop the block once satisfied
  nothing is left.
- Two general lessons: **a subcollection does NOT inherit `match /profiles/{uid}`**, and **Firestore
  does not cascade-delete** — any subcollection needs an explicit sweep before its parent goes.

**`installShared` hands its scene to the library**: it parks `pendingShared` and
`adoptSharedScene()` files it under `"Shared with you"`.

**The gallery applies a row straight away — no Restore dialog.** Rows offer *Load and merge* / *Load
and replace*. **`applySharedLibrary(raw, replace)` does not reimplement the apply** — it stages
`pendingRestore` + checkbox state and calls `applyRestore`. `sharedLibrary(raw)` is the shared
decode+validate half.

**The gallery is browsable signed out** — `galFetchJson` uses a plain keyed `fetch`, not
`cloudFetch`, and Browse sits *outside* `#cloud-authed`. **`cloudPublish` re-saves the whole
profile** rather than patching `pub` (the rules require name/payload/count).

**The listing is ONE unordered query a day** (`galleryLimit` 200 brings the whole list; a read
is billed per document returned, so the daily cost is the published-profile count). Cached
under `GAL_KEY` for `galleryTtlMs` (24h) and Refresh cannot undercut that; `galBust()` on your
own publish/save is the deliberate exception. **Shuffle, name filter and 20-a-page pager are all
client-side on the cache** (`galShow`/`galPaint`, `Math.random` — UI, not scene content); the
ordered query and its index fallback are gone, since random order made them pointless.
`tools/gallery-check.js` is the browser gate (cached ⇒ zero fetches; stale ⇒ exactly one).
**`BUILTIN_GALLERY` (`src/gallery-builtin.js`, GENERATED by `node tools/ai-scenes.js --emit`)
ships rows inside the app** — the *AI-Generated* collection — listed FIRST, unshuffled, never
cached, and decoded by `galFetchLibrary` from the local payload (uid `builtin:…`), so a
follow of it resolves offline. Change the scenes in `tools/ai-scenes.js`, re-emit, rebuild.

### Audio & beat reactivity
`audio` holds the WebAudio graph; `startAudio("capture"|"mic")` must run inside a user gesture.

**The MIC is armed by default.** `restore()` — not `applyBlob`, which also runs for an
incoming share blob and would arm a second listener — calls `armAudioResume("mic")` when no
source was ever chosen. The stored `audio` field therefore has **THREE** states, not two:
a source name re-arms it, **`"off"` means the user settled the question** (Stop, or a refused
permission prompt) and is left alone, and null/absent means never asked.
- **`audio.settled` is the flag behind `"off"`**, set by `stopAudio` and by `startAudio`'s
  catch. `applyBlob` must **read it back** on `"off"` — `fullSnapshot` rebuilds the field from
  the flag, so a session that only loaded `"off"` would write null on its next edit and
  re-arm the mic on the load after that.
- Old blobs carry null, which correctly reads as never-asked.
 With
audio on and a chip armed, `updateAnims()` stops that slider drifting — it rests at the low thumb
and snaps to the high thumb on each beat. `armAudioResume()` re-opens the last source on the first
post-load gesture.

**Mute is `audio.muted`; the split from `audio.on` is the design.** `♪` (and the **S** key — `M` is
the menu) → `toggleMute` → `setMuted`, which **never touches the stream**; `audioTick` early-returns
instead.
- `audio.on` = **a stream is open**. "Is audio reaching the visual?" is **`audioLive() = audio.on &&
  !audio.muted`** — four sites: `stepAnim`'s `armed` (the important one), `flashChips`'s `lit`,
  `frame()`'s `updateMeter`/`flashChips`/`clearBeats`, the `audio-off` class. Still reading
  `audio.on`: Capture/Mic lit state, `armAudioResume`, `fullSnapshot`'s last-live-source.
- `setMuted` zeroes `pulse`/`energy`/`beatNow` and calls `updateMeter()` + `flashChips()` **once** on
  the way down. `stopAudio` clears `muted`. `audio.muted` is **transient**.
- Same `♪` glyph in both states; `.muted` adds `line-through` (never changes width or baseline).

**`audioTick` is an ONSET detector, not an energy detector — don't "simplify" it back.** Per band it
computes **spectral flux** (sum of positive bin-to-bin changes since the previous tick):
- **Float, linear magnitudes** — `getFloatFrequencyData` → `10^(dB/20)`; a ratio test on the byte
  spectrum is a ratio in log space. **`smoothingTimeConstant = 0`.**
- **Adaptive threshold + peak picking**: a beat is a *local maximum* above
  `median(last ~1s) × beatCfg.fluxK[b]` and above `beatCfg.floor × recent peak`, with a per-band
  refractory. Causal — inspects the *previous* tick (one 10ms hop of latency).
- **Bands are narrow on purpose**: 30–150 / 150–2500 / 2500–12000 Hz, mapped by `computeBins`.
- **Thresholds are per-preset scene data.** `beatCfg` (defaults `BEAT_DEFAULTS`, both in the detector
  constants block) holds per-band `fluxK`, global `floor`, per-band `refract`, `bands`. This is the
  **GLOBAL** tuning — the box is named that — and it is what an un-overridden slider inherits.
  **`mergeBeatTune(saved)` has replace semantics.** **`installBeatTune` writes fields in place,
  never replacing the object** (`audioTick` closes over it; `beatprobe` slices it out). It re-runs
  `beatBuild()` and `computeBins()` (the latter only when `audio.on` — it throws before audio
  starts).

**`audioTick` runs on `setInterval(HOP_MS)` (100Hz), not rAF.** Beats are **latched** in `beatNow[]`;
`frame()` calls `updateAnims()` then `clearBeats()`. `audioTick(t)` takes an optional timestamp for
fake clocks.

### Per-slider beat tuning
**Every armed slider detects its own beats.** The Refractory rows in a slider's box used to write
into `beatCfg.refract[band]` — the SCENE-WIDE value — so a control presented as belonging to one
slider silently retuned every armed slider in the scene.
- **A TRIGGER is `(layer slot, control key)`**, not just a key: `beatOf(L, id)` is per layer, so two
  layers can arm the same slider differently. `trigState["<slot>/<id>"]` keeps its own `lastBeat`,
  latch and pulse. **`clearBeats` must drain the per-trigger latches too**, or a slider stays pinned
  at its high thumb forever.
- **The expensive half is computed ONCE per band and shared** — the bin loop, `flux`, `peak` and the
  adaptive median, plus the tuning-free part of the peak-pick (warm, local max, not silent),
  published as `audio.cand/med/candFlux`. The per-trigger pass is only the three comparisons that
  read tuning. **It has to run in `audioTick`, not at frame time**: the candidate exists for exactly
  one 10ms tick, which is why beats are latched at all.
- **`trigList` is cached behind `trigDirty`** (a `var` — `loadBtune` runs from `restore()`, slices
  earlier). Set it from `chipEdited`, `selectStack`, `syncStackUI`, `installStack`, `loadBtune`,
  **`beatChanged`** (the global box changes what everyone inheriting resolves to) and every tuning
  row edit.
- **`tuneEff(t)` is the ONE inheritance resolver** — the slider's overrides laid over `beatCfg`,
  field by field. The detector, the `(global)` tags and the `↺` all go through it.
- **Storage mirrors `pulseLen` exactly**: live `beatTune[id]`, per-effect `btuneStates[e]`,
  per-layer `L.btune`, `presetBtune`/`saveBtune`/`loadBtune`/`mergeBtune`/`pruneBtunes`, `"btunes"`
  in **`EFFECT_MAPS`**, `btune` in `snapshotScene`/`applyPreset`/`validatePresetList`/`stackItemOut`.
  Unlike the other four it starts **EMPTY** and `mergeBtune` builds only what validates — so an
  absent, unknown or malformed entry all mean *inherit*, which is why every scene written before
  this renders identically. `applyBlob` **replaces** per effect rather than merging: an override is
  something you can take away, and merging would make a cleared one immortal.
- `bands` is deliberately NOT per slider — the Hz edges define what "low" means for the meter, the
  chip colours and the trace, and per-slider ranges need their own FFT band pass.
- **`flashChips` lights from the slider's own trigger pulse**, not the band's.

### Tempo tracking (knowing a beat BEFORE it lands)
`audioTick` is an ONSET detector and stays one: it peak-picks the previous hop, so a beat is
known 10ms AFTER it happened, and every `PULSE_SHAPES` entry built on it is therefore a
*release*. The tracker is a **separate, additive** layer that maintains a continuous grid —
`audio.tempo = {period, bpm, anchor, conf}` — from which `beatEta(now)` and `beatPhaseAt(now)`
fall out. It lives at the END of `audioTick`, after the per-band and per-trigger loops, and
**nothing above it changed**. `tools/tempoprobe.js`.
- **PERIOD from autocorrelation, PHASE from a PLL.** The correlation needs seconds of history
  and runs 4×/s (`TEMPO_EVERY`), never per tick; the PLL nudges `anchor`/`period` on each
  confirmed onset and is what keeps the grid glued between estimates.
- **THE OCTAVE RULE IS THE HARD PART, AND IT HAS THREE PARTS.** A periodic signal correlates at
  its period *and every multiple*, so "tallest peak" picks a multiple as often as the
  fundamental. (1) A **log-Gaussian bias** toward ~120 BPM, deliberately WIDE (`tempoPrefW`
  2.2) — at 0.9 it dragged a real 176 BPM down to 88, so it must lose to evidence. (2) Prefer
  the **shortest sub-multiple that scores `OCT_SUB` of the peak**. (3) **Compare INTERPOLATED
  peaks, not raw bins** (`lagPeak`) — a period between two lags reads low at both while its
  double lands on a whole lag and reads high, so bin-to-bin comparison inverts the rule exactly
  when it matters: measured 907.8ms for a 455ms tempo *with every other assertion green*.
- **The envelope is SMOOTHED (`tempoSmooth`, ~50ms) before correlation.** A one-sample-wide
  onset train correlates with nothing at its own period when that period lands between samples,
  and perfectly at its double — a guaranteed octave error. Real onset envelopes are not that
  sharp either.
- **Confidence is the NORMALISED correlation** at the chosen lag, not a peak-to-average ratio.
  The ratio version scored unstructured noise 0.71 and free-tempo onsets 0.90 — both read as a
  solid tempo. Below `CONF_MIN` the tracker publishes nothing and `beatEta`/`beatPhaseAt`
  return **−1**, deliberately an obviously wrong number rather than an invented beat.
- **Predictive firing fires off the COUNTDOWN, never a grid index.** Numbering beats from
  `anchor` fails because the PLL *moves* `anchor` onto every onset: relative to a moving origin
  the index oscillates across a single beat and fires on both transitions (79 fires for 48
  beats). Its window is `max(lead, HOP_MS)` so `lead` 0 — plain lock — fires ON the beat rather
  than never, plus a half-period refractory.
- **`lead` and `lock` are ONE mechanism and ship NEUTRAL** (0 / false in `BEAT_DEFAULTS`,
  resolved by `tuneEff` like `fluxK`): firing from the grid is fill, doing it early is lead.
  Off, the predictive branch is unreachable, so **a scene saved before this detects beats tick
  for tick as it always did** — `tempoprobe` asserts exactly that, and it is the whole reason
  this could ship as a minor.
- **The anticipatory shapes' argument runs the OTHER WAY.** `PULSE_PRE` marks them; they take
  `beatPhaseAt` (0 just after a beat → 1 AT the next) instead of the decaying `st.pulse`.
  `f(0)=0` still holds; `f(1)=1` now means "peaks on the beat". With no lock they fall back to
  reactive Snap. **`drawPulsePlot` must follow** — it puts the beat line near the right and
  draws the rise into it, because the plot is drawn from the same formula the animation applies
  and may never contradict it (`tools/tempoui-check.js` measures the tilt of both).

**Global beat tuning** lives in `<details class="box" id="beatDetails">` (per-preset scene data,
must autosave). CSS scoped to `#beatDetails`. The name carries weight now that a slider can
override it — it is the defaults, not the only tuning there is.
- `beatChanged` must **not** `persist()` (the delegated `onEdit` already does). `beatReset` is a
  click, so it persists + autosaves by hand.
- **`RNG_ORIG` and `refreshRangeUI` skip `#beatDetails`** — the generated sliders have no `id`, so a
  scan writes `RNG_ORIG[undefined]` and `collectRanges` emits a junk key into every blob.
- **`beatUi` is a `var`** (like `card`) — `installBeatTune` reads it during startup before the
  declaration.
- `applyPreset` rebuilds the sliders (`beatBuild`), so any reference held across a preset switch is
  a **detached node**.

### Dev tools
No Diagnostics section. The **beat trace** (`?debug=1` or the Beat tuning checkbox; `dbgInit` builds
a floating canvas of flux + threshold + beat ticks per band, lane labels from `beatCfg.bands`) lives
in the Beat tuning box. The frame/FPS counter has no toggle — `H` drives it via `body.ui-hidden`;
`#frames.hidden` survives in the CSS as the mechanism `?hideui`/`H` use.

**The persistence opt-out is `data-nopersist`**, not `#diag`: `onEdit` early-returns on
`closest("[data-nopersist]")`; `RNG_ORIG`/`refreshRangeUI` use the same marker.

### Sync nudge + analytics
`#syncpop` shows to users who haven't started audio at growing gaps of active (tab-visible) time
(`SYNC_DELAYS` = 30s, 5min, 1h), capped at 3 showings ever; state in
`localStorage["burnTheWeb.sync.v1"]`, satisfied for good once any source goes live.
**`showSyncPopup()` returns whether it opened and the caller only spends a showing when it did** —
a refusal that still incremented `shows` would burn one of the three on a popup nobody saw.
`track(name, params)` is provider-agnostic; the GA4 gtag scaffold is **live**
(`GA_MEASUREMENT_ID` is a real `G-…` id) — clearing it to `""` makes it inert.

### First-run tutorial
`#tutdlg` (`src/ui-tutorial.js`, manifest slice **before `ui-menubar.js`** so the menubar stays
last) — an eight-step modal tour, `TUT_STEPS` × `{head, body, art}`, `art` an inline SVG string
on `currentColor` like `EYE_OPEN`. Also at **☰ → Tutorial**, above Help.
- **Music is step TWO, on purpose** — it is the headline feature and the one nobody finds
  unaided, so it comes before the furniture and forward-refers to the slider chips rather than
  waiting for them. Don't file it back under "in logical order".
- **Seen-once flag is its OWN key** `burnTheWeb.tutorial.v1`, like the credits and banner
  preferences — **not** in `fullSnapshot()`, so it never rides a share link or a backup. Written
  when it OPENS, so a dismissal still counts.
- **It opens after the CREDITS**: a 250 ms interval skipping `document.hidden`, waiting for
  `creditLeft <= 0` (rendered time). **`TUT_MAX_WAIT` (20s of visible time) is the backstop** —
  `?credits=<big>` and a scene paused on arrival both stop that clock dead.
- **It HOLDS the sync nudge**, and both halves are needed: the 1s interval returns early on
  `tutorialOpen()` so the counter does not advance, and `showSyncPopup` refuses outright —
  `dlgModal` releases any existing trap, so a nudge opening over the tour would take the
  keyboard and leave it visible but dead. `closeTutorial` calls **`syncResetDelay()`** so
  reading the tour does not eat into the nudge's first 30s.
- **`armAudioResume`'s resume listener must skip it too.** That is a capture-phase
  `pointerdown`/`keydown` on the **document** that reopens the last source on the FIRST
  gesture anywhere — and on a fresh load the first thing anyone clicks is the tour's Next
  button, which threw the browser's "Choose what to share" picker straight over it. The
  guard **returns without `cleanup()`**, so the arm survives for a real gesture afterwards.
- **`tutorialOpen` and `syncResetDelay` are function DECLARATIONS** — they are called across
  slices in both directions (the sync block and `armAudioResume` are earlier, the tutorial
  later), and only declarations hoist across the one IIFE. **`tutorialOpen` looks the node
  up rather than closing over `tutDlg`**, so hoisting alone makes it safe to call from
  anywhere, including a listener armed during startup.
- Only the step body is re-rendered; the `<h2>`, dots and buttons are permanent nodes updated in
  place, so the sticky title never reflows and the modal trap's focus survives a Next. The `<h2>`
  text is CONSTANT — the step's own title is the `<h3>`.

### Timing
`frame()` runs every rAF. **The fire sim is decoupled**: a fixed accumulator tick (`cfg.burn`
ticks/sec, capped 4/frame) while render/morph/beat run every frame. Phase clocks accumulate per tick
from the live speed, never the wall clock. Clicking the canvas toggles `paused`.

### Determinism
Chaos game uses a **mulberry32 PRNG re-seeded to `SEED` every frame** — the point *sequence* is
identical each frame; only moving geometry reshapes the fractal. Auto-morph uses `Math.random()`,
kept separate.
- **Julia**: `juliaOuter/juliaInner` default 0, set by `reseedJulia()` — a random lap when the
  per-effect **Random seed** toggle (`randSeed`, an `extras` field, default on) is on, else 0.
  `setEffect` calls it on every entry.
- **Attractor jitter**: the de Jong map is exact; `atjit` scatters each point by ±jit heat pixels
  from `Math.random()` (clear of the chaos PRNG). The `jit > 0` guard keeps jitter 0 byte-identical.
- **Don't add a fixed-seed toggle for the jitter.**

## Config & control gotchas

`cfg = { points, speed, decay, scale, burn }`. Sliders wired via `bindRange(id, valId, fmt, apply,
durScale, beat)`, registered in `anims`; `updateAnims()` drives drift between the thumbs.
`bindRange`'s `ui()` reads `lo.min`/`lo.max` **live** (bounds are runtime-editable) and uses them for
precision: **a range spanning more than 1 shows at most one decimal**. Rounding applies to the value
handed to `fmt` and is **readout only** — the applied value stays a free float.

- **Flame rise** is linear in flame *height*: `decay = 128 * R / (R - 1)`.
- **Drift speed** slider ÷ 100 → `cfg.speed`.
- **Rotation** slider is degrees/second → rad/s (`rotSpeed`), accumulated into `spinAngle` per tick
  (independent of drift speed and burn rate).
- **Tetrafyer has two rotations**: `Rotation` yaws (`spinAngle`); pitch is `nodAmp·sin(nodPhase)`
  behind **Box nod** (degrees) and **Nod speed** (×). **`nodPhase` accumulates per tick**
  (`NOD_RATE · nodSpd · cfg.speed / cfg.burn`), never derived as `0.12·simT`. At `nodSpd` 1 it
  tracks `0.12·simT` exactly.
- **Palette** bakes into a `Uint32Array` in **little-endian ABGR**. **Banding is a filter over the
  active palette**, not a palette.
- **A preset switch always blends the palette in from what was on screen** (no snap); **where it
  blends to depends on the cycle** — cycling on ⇒ a fresh random palette, pinned ⇒ the palette the
  preset **stored**. `applyPreset` snapshots live `paletteBase` *before* `setEffect`/`loadExtra` can
  overwrite it, then `beginMorph(fromRamp, morphing ? pickOther(...) : +paletteSel.value)`.
  `beginMorph` paints `fromRamp` into `paletteBase` immediately and arms the blend; `morphOnce =
  !morphing` makes it one-shot. A manual pick or plain scene load clears `morphOnce`.
- `cfg.scale` changes need `resize()` to reallocate buffers.
- **Reset** restores the current effect's `state`/`beat`/`pulse`/`plen`/`extra` **and the shipped
  bounds** (`rngShipped` over every key in `presetState(effect)`, **before** `loadState`, then
  `rngSyncAll()`). Current effect only.

## Testing (no framework — headless verification)

- **Syntax check** each `<script>`: `node -e "...new Function(scriptText)..."`.
- **Assertion probe**: inject a `<script>` into a temp copy that manipulates the DOM, asserts and
  reports; screenshot with `msedge --headless=new --screenshot=out.png --virtual-time-budget=N
  file:///…`; Read the PNG.
- Results come back **either** as a result `<div>` styled
  `position:fixed;inset:0;background:#fff;color:#000` (unstyled it renders under the canvas and a
  red run looks clean) **or** via `console.log` captured with `--enable-logging=stderr --v=0` —
  `--dump-dom` returns nothing in the installed Edge. Add `--disable-extensions`, or an extension
  delays `load`.
- `{bubbles:true}` on synthetic events. Seed `localStorage` **before** the app. Auto-morph off
  before asserting palette. `setInterval` advances under `--virtual-time-budget`; `document.hidden`
  may read true. Analytics are inert on `file://`/`localhost`.

**Headless runs WebGL2 on the REAL GPU by default — prefer that.** Drop `--disable-gpu` and the
SwiftShader flags entirely: on this dev machine (RTX 4090) four effect screenshots take ~12 s where
SwiftShader took ~10 min, and heavy raymarchers render fully. Assert `gl.getError() === 0` and a
console-error count of 0 (a failed link is otherwise silent — `useProgram(null)` just draws
nothing).
- **SwiftShader remains the fallback** for machines without a GPU and for the bit-reproducible pixel
  gates: `--enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader`, ~8–15 fps. The stall
  traps below apply ONLY under SwiftShader.

**SwiftShader is why probes HANG** — virtual time only advances when the task queue drains:
- **Do not add a layer from a probe** (two live layers switch on `renderStackColor` and the frame
  loop stops yielding). Test per-layer UI by toggling classes.
- **The shipped `DEFAULT_SCENE` is a FOUR-LAYER stack, so a fresh profile starts on the heavy
  path.** Anything that keeps it on screen for the run stalls — stopping auto-cycle is enough,
  because the cycler is otherwise what moves you onto a cheap single-layer scene. **For a DOM-only
  probe, stub rAF in `<head>`** (`requestAnimationFrame = () => 0`, or let ~4 frames through so the
  app initialises).
- **Never `while (...) el.click()`** — bound every drive loop.
- Kill stray `msedge*` first, **including `msedgewebview2`**.
- **A Git Bash path is not a `file://` URL.** `file:///c/Users/…` loads Chromium's "File not found"
  page, which *passes* every "did it finish" check instantly. Use `file:///C:/Users/…`.

**A probe-generator script must contain no backtick** anywhere in the injected source (comments
included) when that source sits in a template literal — it closes the literal, node dies, and **the
previous probe page is silently reused**. Same class: `\n` in that literal becomes a real newline.
Use `String.fromCharCode(10)`, or keep the injected source in its OWN file and `readFileSync` it
(sidesteps both). Check the generator printed its "wrote" line.

**The app is one IIFE, so an injected `<script>` cannot call into it.** DOM/menu/`localStorage`
assertions work from the page; anything needing an internal function must be a Node probe that
slices the source.

**Test a CSS regression WITHOUT the app**: inline `src/styles.css` into a bare page with a synthetic
node and read `getComputedStyle`. Prove the check is sensitive by re-appending the old rules and
watching it go red.

**Five traps when screenshotting ONE effect** (each produced a confident wrong reading):
- **STRIP THE LAYER'S FILTERS FIRST.** Changing a layer's effect deliberately KEEPS its
  filter chain, and the shipped `Fetingen` starter carries **twelve** — Fire feedback
  included. A brand-new effect selected onto it is fed through a fire sim and comes out a
  smeared radial haze that reads exactly like a broken shader. Click every `.filter-rm`.
- **Set the Transition slider to 0 (both thumbs) before selecting a scene.** `trans.t`
  advances in RENDERED time and headless produces few frames, so a half-second blend is
  still half-drawn at screenshot time: the `bars` mode puts vertical stripes across the
  effect, and a black outgoing frame reads as "renders nothing".
- **A WebGL canvas cannot be sampled after compositing** — `drawImage(#fire, …)` comes back
  empty however good the frame looked. The screenshot is the pixel evidence; use the fps
  counter for liveness.
- **The layer rows are a fixed pool with the spares HIDDEN**, so `querySelectorAll(".lyr")`
  always says 4. Filter on `offsetParent !== null`.
- **Reaching one layer via the row ✕ raises a `confirm()`**, which headless auto-dismisses.
  Select the single-layer starter scene instead (or stub `window.confirm`).
- **Turn auto-cycle off first** (`#cycle`), and assert the effect is *still* the one under test at
  screenshot time.
- **`gl.getError()` must be sampled inside a real frame** (afterwards it returns a spurious `0x502`
  from the probe's own `readPixels`). Pixel evidence must be the screenshot, not `readPixels`.
- **`?stack=<id>` does not survive a fresh profile** — the first-visit branch installs
  `DEFAULT_LIBRARY`'s first scene over it.
- **The shipped scenes are not headlessly renderable under SwiftShader** (`Fetingen` runs the fire
  sim, `Round and round` is two layers). Verify the library through the DOM.
- **Keep the run under 30s of active time** or `SYNC_DELAYS[0]` opens the nudge over the canvas.
  `?credits=0` doesn't clear credits in a slow run (`creditLeft` counts *rendered* time).

**The pixel gate is BISTABLE — a single mismatch is inconclusive.** No-filter Plasma matches ~9/10;
Plasma + Fire ~3/4. **Re-run a mismatch 2–3 times.**

**Pixel gates: shader effects only.** With a stubbed rAF (own the callback queue, fixed 1/60 step)
shader effects are bit-reproducible; **point effects are not** — gate those on logic. **Inject
before the app**, into `<head>`. **Do not clear the rAF queue** — `frame()` re-arms itself. Stub
`Math.random`; read pixels with `readPixels` in the **same task** as the last frame.

**`fract(sin(x)*43758.5)` IS NOT A HASH, IT IS A DRIVER-BUILD DETECTOR.** The v1.55.x
"ghost" Glass ball — a second copy of the balls, the same animation far behind, the ORIGINAL
vanishing whenever it showed, appearing the moment shaders finished compiling — was this
formula seeding the ball positions inside the shader. It amplifies the low bits of whichever
`sin()` the driver's *current build* uses into a wholly different value; NVIDIA's D3D11 backend
recompiles programs in the background, so two builds gave two trajectories, drawn on alternate
frames as the driver swapped. WARP (one deterministic compiler) never showed it. **Six fixes
shipped before this one and every one was wrong**: the per-layer salt, per-slot heat on
reorder, Zoom feedback, a refracted rim in a still, a back-buffer clear (v1.55.4) and a
`gl.finish()` fence (v1.55.5) — the last two aimed at *presentation*, and the fence surviving is
what proved presentation was innocent: if the GPU provably finished the frame and it was STILL
wrong, the frame itself differed between builds. Fix: hash on the CPU (`gbHashJS`, exact) and
pass finished values as uniforms; `glassprobe` asserts no `sin`-hash in either glass shader,
comments stripped. **The general rule: any per-frame value that must be IDENTICAL across
frames may not come from a GPU hash.** Rule for next time: when the fence is free and the
ghost survives it, the two pictures are two *computations*, not two presentations — go look
for what the driver is allowed to compute differently.

**A DRIVER PRESENTATION BUG IS INVISIBLE TO EVERY CHECK THAT READS THE FRAME.** v1.55.x
chased a "ghost" Glass ball for a day: a second copy of the balls, the same animation but far
behind, the ORIGINAL vanishing whenever the ghost showed. Four fixes shipped for it, all aimed
at real bugs that were not this one (the per-layer salt, per-slot heat moving with a reorder,
Zoom feedback, a refracted rim mistaken for the ghost in a still). Every instrument said the
frame was correct — every uniform, the clock and the salt logged single-valued in real Chrome
on the reporter's own 4090; a period-2 detector on the composite read ordinary motion; a screen
recording did not capture it. All of that was TRUE, because the app's frames were correct. What
pinned it was switching Chrome's ANGLE backend to **D3D11 WARP** (software rendering, identical
WebGL code): the ghost was gone. It is the NVIDIA D3D11 driver, on a G-Sync panel at 175Hz,
re-presenting a STALE swapchain buffer in place of the live one. The fix is an explicit
`gl.clear` on the default framebuffer before the final `FS_COMP` present — one fill per frame,
pinned to a known state, which a stale re-present cannot survive. **Do not "fix" it with
`preserveDrawingBuffer: true`**: that taxes every machine with a per-frame copy to solve one
driver's problem. Two lessons: when every measurement of the frame says "correct" and the
user still sees it, stop measuring the frame and vary the thing BETWEEN the frame and the eye;
and the reporter's "ghost gone under WARP" was worth more than a day of instrumentation —
ask for the discriminating test early.

**A SYNCHRONOUS STALL IS INVISIBLE TO EVERY HEADLESS CHECK EXCEPT THE WALL CLOCK.** v1.37.0
linked a shader at boot that the driver took 64 seconds to optimise. No error, DOM fine, every
probe green — and the browser checks passed too, reading "17 frames, 45 fps", because
`--virtual-time-budget` simply waits through a blocking call. **`tools/startup-check.sh`** is
the gate: real GPU, real seconds, fails past 20. `/deploy` runs it. The cause and the two
fixes are under *The shared 3D world*.

**A CSS TRANSITION DOES NOT ADVANCE UNDER VIRTUAL TIME.** It runs on real time, which
`--virtual-time-budget` skips past, so a fade read 400 virtual ms after the class goes on
comes back somewhere between 0 and 0.03 depending on how much real time that run happened to
spend — an end-value assertion fails against correct code and a greater-than-zero one is
simply flaky. **Set `style.transition = "none"` first and measure the RULE**, which is the
part that can actually break.

**A check's own `ok(name, cond)` signature is a trap worth enforcing in code.** Swapped, every
assertion passes — the name is a non-empty string and therefore always a truthy condition —
and it went unnoticed four times in one sitting, hiding a real miss behind a green line
reading `PASS true`. Both browser checks now hard-fail on a non-string first argument.

**A headless assertion of the form "nothing happened after I toggled X" is almost always
INSENSITIVE.** After a mid-run state change the page renders ~2 frames in *twenty* virtual
seconds — the initial burst is all you get — so anything driven by the frame loop would not
have fired regardless, and the check passes against a build with the feature deleted. Measured
on the auto-cycle gate: "opening the editor stops the cycle" was green either way, while the
mirror claim taken from the LOAD state ("no switch while the editor is open", panel open from
boot) went red the moment the gate was removed. **Assert from the boot state, and always run
the negative control.** `tools/foldcycle-check.js` is that check (a browser one — deliberately
NOT named `*probe.js`, since `/deploy` runs `node tools/*probe.js` over the whole directory).

**THE FRAME IS NOT CPU-BOUND, AND THE PER-FRAME "OPTIMISATIONS" ARE ALL WORTHLESS — MEASURED.**
Real-time headless run on the dev 4090 (no `--virtual-time-budget`; it fast-forwards the clock
and makes every timing meaningless), CPU via `performance.now()` around the real functions and
GPU via `EXT_disjoint_timer_query_webgl2`, which is the only instrument that sees past the
~175 fps headless cap:

| scene | canvas | GPU ms | CPU ms | idle ms |
|---|---|---|---|---|
| 4-layer default | 1576×908 | 2.23 | 1.77 | 3.95 |
| 4-layer default | 3816×2068 | 2.43 | 1.60 | 4.14 |
| Mandelbulb | 1576×908 | 1.37 | 0.80 | 4.92 |
| Mandelbulb | 3816×2068 | 3.46 | 0.78 | 4.94 |

CPU split on the 4-layer scene: `renderStackColor` 0.98, `updateAnims` 0.58,
`installStackItem` 0.23, the per-layer LUT bake **0.007** and its four uploads **0.026**.
So, against the candidates that look obvious in the source:
- **Caching the per-layer LUT bake + `texSubImage2D` buys 0.033 ms/frame** — 0.6% of the
  frame. The suspicion that four uploads into just-sampled textures stall the driver is
  simply false here. Not worth the invalidation bugs.
- **Gating the global palette compose/upload on `onePal` buys nothing**: `composePalette`
  already runs 0 times/frame on the stacked path and `uploadPalette` costs 0.001 ms, because
  `paletteDirty` gates it already.
- **`updateAnims` + `installStackItem` (~0.8 ms) is the biggest JS item and still buys
  nothing.** Stubbing BOTH to no-ops moved the frame rate from 175.1 to 175.0.
- **The transition double-render costs no frame rate either** — measured with `TRANS_DUR`
  patched to 600 s so a blend could be held in steady state. `updateAnims` does rise 0.58 →
  0.86 ms during one, exactly as the "runs twice, live + prevStack" comment says.

**The headroom is ~4×**: the worst case measured is ~4.2 ms of a 16.7 ms 60 fps budget at 4K.
Hardware four times slower than this still holds 60 fps. Below that the bound is the SHADERS,
not the JS — so if performance ever does matter, the work is in `FS_*` (the ocean march
computing wave derivatives it discards, the doubled `pow` in `FS_OCEAN`/`FS_BULB`/`FS_BHOLE`,
the missing bounding sphere on `solidsDE` — `glassDE` deliberately has NONE: one was
added, measured to move the sixteen-program link total the wrong way with no demonstrable
frame benefit, and reverted; the three-point measurement is inline at its definition), never
in the per-frame JS above.

**PER-EFFECT COST IS MEASURED, NOT GUESSED — `tools/perf-check.js`.** GPU via
`EXT_disjoint_timer_query_webgl2` (headless caps at ~175 fps, so wall-clock fps is blind past
it), CPU via `performance.now()`, median of a settled window, both resolutions, **real time**
(`--virtual-time-budget` produced plausible zeros twice). Filters toggle through a spliced
`window.__setFilterOn` hook — every UI route failed — and the base is measured at BOTH ends.
First run (v1.67): **Volumetric clouds was the one effect over the 60 fps budget at 4K on the
4090, 21.3 ms, 5× the next**; its shadow march (5 taps × full octaves per dense step) was the
whole cost, and half-octave/3-tap shadowing took it to 9.3 ms for a 3.7/255 mean pixel diff. **Since 1.73.3 clouds
renders at HALF RESOLUTION** (`halfRes: true` on the descriptor; `glShaderDraw` draws into
`glTex.halfLayer` and blits up LINEAR): 9.3 → 2.4 ms at 4K, A/B mean ≤ 0.1/255 — the march is
the whole cost and the picture has no edge that survives 2px. Two more rungs were tried and
REVERTED, both A/B-failed: distance-tapered octaves INVENT far blobs at low Cover (fewer
octaves lifts fbm over the coverage threshold), and a jittered 32×0.195 march reads as film
grain on the app's softest picture — 0.6 ms was not worth either.
Everything else has 4×+ headroom; the 7 feedback filters cost ~0.15 ms each at 4K and every
post filter is at the noise floor. **`tools/pixgate.js`** proves 'free': owned rAF queue, fixed
1/60 step, stubbed `Math.random`, `readPixels` same task, shader effects only, bistable. It
REJECTED two of three planned free wins (pow folds are not bit-identical in float).
**`tools/abshot.js`** takes a same-frame A/B per build, shipped out as base64 — headless
`--screenshot` snapshots before the compositor presents a canvas drawn under an owned queue.
**TWO WAYS THE GPU TIMER LIES ON CHEAP SHADERS, both found chasing an Ocean 'regression'
that did not exist.** (1) **Chrome's shader disk cache**: a source compiled before comes
back as a program binary the driver optimised in an earlier session, a never-seen source
runs the quick build — the SAME v1.68.0 Ocean read 0.257 ms cached and 0.907 cold. Pass
`--disable-gpu-shader-disk-cache` (perf-check prints it) and compare cold with cold only.
(2) **GPU power state**: a 0.25 ms shader is ~4% load, the clocks never boost, and a cheap
effect measured ALONE reads 2–4× slow; the full sweep is continuous load and is fine, an
`--only` run wants a heavy effect first. Ocean swung 0.24–0.9 ms across protocols with
nothing changed. **The instrument resolves milliseconds, not tenths**; the wave pow fold is
NEITHER 3.6× slower NOR 12% faster — cold-vs-cold it is 0.234 → 0.239, i.e. nothing, and
the Mandelbulb fold is −4.5%, not −12%. Clouds (21 → 9 ms) was never in doubt: heavy shaders
boost the clocks themselves.

**THE OCEAN SURFACE IS A COMPILE-TIME DEFINE, ONE PROGRAM PER SURFACE** (`SURF_SINE` /
`SURF_SEA` / `SURF_SWELL` / `SURF_NOISE`, `W_`-prefixed in the world and carried in the world
key as `|s2`). Plain flags, never `SURF == n`: with every surface in one shader behind a
uniform, surface 0 measured 4× slower, and deleting the three DEAD functions alone brought
it back — past some source size the compiler stops unrolling the 32-step march whether the
code runs or not. Changing Surface while joined relinks the world (async; ocean-only is
~0.1 s). `worldprobe` balances braces over 16 groups × 4 surfaces, `worldcompile-check`
compiles 19. The surface functions are hash-free on purpose (`fract(sin()*43758)` is a
driver-build detector). `pixgate` holds surface 0 bit-identical to the pre-surface Ocean.

**A green logic probe is necessary, not sufficient**, for anything writing retained heat — drive a
few hundred real frames and look at the screenshot.

**Credits overlay**: read `#creditcv` itself (`getImageData`, count alpha > 8), not the composited
frame; assert the layer properties (own canvas, `pointer-events: none`, z-index above `#fire`, under
the menu). **The claim to nail: credits never touch heat** — zero `fire`, put credits up, call
`creditDraw()`, assert the buffer still sums to zero. **Never diff heat with credits up vs down**
(`simT` advances between runs).

**Credits/banner, three traps** (each red on correct code):
- **Inked-row runs are NOT a stable identity** (2 bands at full alpha, 4 mid-fade). Use the ink
  **bounding-box height**; `bands === 1` is only safe for the title.
- **`frame()` clamps `dt` to 0.25s** — step a stubbed rAF **under** 250ms or the credits never
  expire.
- **Compare pixel COUNTS only between identical strings.** Re-select the *same* scene to prove a
  re-arm; compare bounding-box **width** across very different name lengths to prove the name is
  drawn (`prompt` is stubbable).

**Audio tests need `AudioContext` stubbed**, not just `getUserMedia` (a real one never settles
headless). Contract: `sampleRate`, `resume`, `createAnalyser`, `createMediaStreamSource`, and an
analyser with `fftSize`/`frequencyBinCount`/`getFloatFrequencyData`/`min|maxDecibels`. Pair with a
no-op rAF.

**Share tests need three stubs**: `navigator.clipboard` with capturing `writeText`/`write` (the
`write` stub must resolve the ClipboardItem promise and read the Blob back), and a stubbed `fetch`
for Short link. **Run twice** — once as-is, once with `ClipboardItem` hidden.

### Node probes (`tools/*probe.js`)
All slice real source out of the built file by **markers — keep them**.

- **`filterprobe.js`** — params have defaults; three stages in pipeline order with Bloom last
  **among the post ones**; every screen filter `cpuOk: false`; a stored list applies in registry
  order; `filtersOk` drops unknown/duplicate/non-string ids; point-vs-shader defaults;
  `presetState`'s seeded arrays are per-effect **copies**; an **empty** stored list is honoured
  (only a *missing* key falls back). Markers: `// ---- FILTERS: stackable post-FX` …
  `function initStates(`; `function presetExtra(` … `function initExtras(`.
- **`presetprobe.js`** — structural, and **BOTH directions**: every `p.<field>` `applyPreset`
  restores is one `snapshotScene` captures *and* one the import mapping rebuilds, **and every field
  `snapshotScene` captures is one `applyPreset` restores** (`layers` exempt — it goes through
  `mergeLayers`). The second direction is the silent one: the scene carries the data, every switch
  discards it, nothing errors. **It strips comments before matching `p.<key>`** — this source names
  its own fields in prose, so a deleted line whose comment survived kept the key in the set and the
  check passed straight over the regression. Also asserts every per-effect map is in `EFFECT_MAPS`
  (missing ⇒ the map keys stay effect INDICES and silently reattach on any registry reorder).
  Behavioural: `mergeBeatTune` replace semantics +
  junk rejection. Also pins `safeFileName`, `normalizeBackup`. Markers: `const BEAT_DEFAULTS` …
  `const beatCfg`; `function mergeBeatTune(` … `function installBeatTune(`;
  `function snapshotScene()` … `function defaultPresets(`; `function applyPreset(` …
  `function createPreset(`; `function validatePresetList(` … the comment that replaced the old
  import button.
- **`heatprobe.js`** — parity is invisible to a screenshot. Chains of 0–4 passes from either buffer:
  `pendingDst` names the buffer the *last* pass wrote, no pass samples its own render target, the
  final FBO is still bound on exit. Also pins **`glLayerBeginHeat`**. Markers:
  `function glBeginHeat(` … `function glBlitPoints(`; `function glLayerBeginHeat(` …
  `function renderLayerHeat(`.
- **`juliaprobe.js`** — rim point matches the cardioid formula; the seed sits exactly `juliaInnerR`
  off it; the inner phase advances at `ratio ×` the outer, `ratio` epicycles per lap; `juliaOffX`
  shifts only the real axis; each of the three descriptors advances the orbit **once** per frame.
  Also the **Orbit editor's backdrop**: `locusEsc` reproduces the Mandelbrot map and the shipped
  Burning Ship recurrence (checked against references written from `FS_BURNING`), the two sets
  genuinely differ, they disagree on the shipped seed path, `yc` is exactly 0 for a y-symmetric
  locus and off-axis for the ship, and only one effect declares `locus: "ship"`.
  Markers: `const RPM` … `function julia(`; `function locusEsc(` … `function cardLocus(`.
- **`solidsprobe.js`** — containment (6000 steps, a 9.5s frame, every slider extreme), quaternion
  normality, `Shape mix` never naming a primitive the shader lacks, `Count` clamped to the shader
  array size, per-layer ownership, determinism, per-axis spread. **Two tolerance traps**: assert
  double-exactness on the BODIES (`S.Q`), float32 tolerance only on staged uniform arrays; strip
  comments before grepping for `Math.random`. Markers: `const SOLID_SHAPES` …
  `// ---- CPU mirror of FS_SOLIDS`.
- **`beatprobe.js`** — runs the real detector against a stub analyser fed synthetic dB spectra on a
  fake clock: kick over sustained bass, hi-hats on 8ths (no low-band leak), a 20dB quiet verse,
  silence and a sustained tone (no false positives), a double-time fill (refractory holds).
  Also **per-slider tuning**: with nothing overridden a trigger's beats equal the scene-wide ones
  **tick for tick** (the safety property everything rests on); a slider's own refractory throttles
  only itself and leaves its neighbour's sequence byte-identical; sensitivity and floor likewise;
  clearing an override restores the global sequence exactly; a trigger is keyed by slot as well as
  key. **The fixture is tuned, not guessed**: sparse onsets give a median flux of exactly 0, so no
  `fluxK` can gate anything, and a clean synthetic hit measures ~57× the median — outside the 0.5–6
  a user can store. The varied scene carries a rising carrier for a non-zero median and lands a min
  flux/median ratio of ~3.7, between the shipped 2.0 and the max 6.0. **The probe drains latches via
  the real `clearBeats`**, not by hand, or "the latch is cleared" would be a property of the probe.
  Markers: `const HOP_MS` … `const meterBars`; `const medBuf` … `function audioMsg`;
  `function audioTick` … `function updateMeter`; `function tuneEff(` …
  `// Three L/M/H toggle chips`.
- **`singleprobe.js`** — `SINGLE_KEYS` is exactly the intended 23 (hard-coded, so nobody quietly
  adds `points`); every single entry is a `dual` on a whole grid with `lo === hi`; each enum's
  `fmt` names every integer it can now hold; `snapStep` quantises with step 1 and still passes
  through with `"any"`; `stepAnim` on a pinned pair draws **zero** `Math.random`; `singlePair`
  and `mergeState` collapse a stored spread/fraction and leave ranged float keys alone. Markers:
  `const sig3 =` … `// A control belongs to the SCENE`; `function snapStep(` …
  `function stepAnim(` … `// The loop is KEY-major`; `function mergeState(` … `function mergeBeat(`.
- **`galaxyprobe.js`** — the two GALAXY properties a still frame cannot show, both of which
  shipped wrong: the arms must **trail** (angle falls as radius rises, against a
  forward-turning disc — the log term's sign), and they must **stay arms** (the pattern
  rotates rigidly with a bounded shear; a 1/r curve winds them out of existence, and merely
  capping the centre-to-rim ratio does NOT fix that — both terms still grow with the clock).
  Winding is measured as **arm sharpness**, the circular concentration of the folded angle in
  a radius bin, NOT as a swept angle: the ±5% per-star radius jitter smears a steep spiral
  across a whole arm spacing, so a sweep degenerates into noise and any fold-and-compare
  aliases past half an arm. Two earlier versions of the check passed the very bug they were
  written for. Markers: `function galaxyStamp(` … `// ---- Harmonograph`.
- **`tintprobe.js`** — the per-layer TINT is a property of the LAYER, not the slot: an
  untinted scene keeps exactly the colours it already rendered and becomes concrete; a stored
  tint is never overwritten and a null never collides with one; **every pairwise reorder** and
  **every single delete** leave all survivors' colours unchanged (one permutation passes by
  luck — a slot-derived colour survives swapping two layers whose slots share a colour); a new
  layer reuses a colour a deleted layer gave up, and churning layers never exhausts the
  palette. `tintOk` still rejects everything that is not an in-range index. Slices by
  `const LYR_TINT = CONFIG.layerTint;` … `const TINT_RGB`. **It hands the slice back out of a
  `new Function` rather than `eval`-ing it** — the file is strict, and a strict `eval` keeps
  its declarations to itself, so the names silently would not exist.
- **`slimeprobe.js`** - the slime mould must not NORMALISE: with Scatter 0 the coarse
  block-density map stops moving, Scatter makes it rearrange (>3x), more of it upsets more, and
  none of that is achieved by dissolving the network. Plus determinism, the field living on the
  layer, and Scatter 0 building no field at all. **The metric is DRIFT of a 3x2 block map** -
  deliberately not per-cell churn, which reported a normalised culture as busy, and deliberately
  not a fine grid, which measures where individual veins ran and scores 1.18 on a fully
  normalised dish. Markers: `function shHash21(` ... `let voCells`; `const PHY_MAX = 6000` ...
  `// CURL-NOISE FLOW`.
- **`palprobe.js`** — palette DELETION and the palette ID CODEC: the frozen `PAL_IDS` table
  (hard-coded, so a reorder/rename-as-id goes red); the full serialize/deserialize round trip
  over extras/layers/presets/`palUse`/`palGone`; legacy numeric passthrough; custom id minting,
  idempotency, dedup, blob-own-list resolution; unknown-id dropped-never-misfiled; and that
  encoding copies rather than mutating runtime objects. Deletion half: `palByName` orders by name while `PALETTES` stays put;
  `palFallbackFor` takes the next in-use palette in display order (wrapping), prefers an in-use
  one over a nearer unticked one, **never returns a tombstoned palette** (the Fire case) and skips
  a whole run of them; `palKeepInUse` re-ticks when the set would be left empty; and `palRemapOne`
  shifts references (and the fallback itself) around the deleted index. Markers:
  `let palGone = new Set();` … `function palGoneOk(`; `function palRemapOne(` …
  `function palRemapDeleted(`.
- **`uiprobe.js`** — the DIALOG INVARIANTS, from **one table of dialogs** checked against every
  list each one has to appear in: the Escape branch, the single `body.ui-hidden` selector, the
  sticky-header selectors (and that each names the box the `<h2>` is really a child of, not the
  id), the `padding-top` waiver (and that **no dialog's `padding` shorthand is declared below
  it**), `role="dialog"` with `aria-modal` on exactly the four backdrop dialogs, and close-button-
  before-`<h2>`. Also pins `setOff` as the only way a control is disabled and the one-layer floor
  being checked BEFORE the ✕'s `confirm`. Reads the built markup/CSS/JS as text rather than
  slicing functions — these are all *lists*, and every one of them rotted by omission.
  Adding a dialog and forgetting a list fails here.
- **`stackprobe.js`** — the stack-item LIFECYCLE invariants, previously comment-enforced only:
  `thawItem` nulls the record; `paintBlock` never dispatches `input`, skips the selected slot,
  applies bounds before values, collapses singles itself; `selectStack`'s eight-step order;
  `pointMaps` calls no `apply` and never touches `animPhase`; `stackItemOut` serialises no
  transient field (`anim`/`phase`/`fxOff`/`solids`/`boids`/`tetras`); `stackOut` is
  freeze→map→thaw; `installStack` re-points before thawing and repaints every block. Plus the
  blob-level symmetry: every field `fullSnapshot` writes is one `applyBlob` reads and vice
  versa (depth-scanned literal keys vs `saved.<key>` reads, comments stripped). Markers listed
  in its header — keep them.
- **`shareprobe.js`** — the share codec round trip.
- **`cloudprobe.js`** — the cloud path structurally shares `serializeBlob` + the codec with `#zp=`
  bundles; an empty `CONFIG.cloud.apiKey` makes zero network requests at startup.
