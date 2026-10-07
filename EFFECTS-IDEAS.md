# Effect ideas — demo & game effects we haven't built yet

A curated backlog, written 2026-08-06 (at v1.15.0: 21 effects, 22 filters, 16 transitions).
High-end entries assume a powerful GPU. Everything here was chosen to FIT the engine — an
effect writes scalar heat to `.r` and gets its colour from the palette pipeline, so ideas
that are inherently "one animated scalar field" rank above ones that need real RGB.

★ = recommended, ★★ = flagship pick. See the build order at the bottom.

## A. Missed demoscene classics (cheap, high nostalgia)

| Effect | What it is | How it fits |
|---|---|---|
| ~~**Kefrens bars**~~ ✅ | SHIPPED in 1.16.0 | weaving ribbons, Bars / Sway / Speed / Bar width |
| ~~**Twister**~~ ✅ | SHIPPED in 1.16.0 | shaded faces + edge seams, up to 3 columns |
| ~~**Starfield / hyperspace**~~ ✅ | SHIPPED post-1.16.0 | 6 parallax depths, beat-armed Warp streaks |
| **Sine scroller** | Marquee text riding a sine wave. Needs a text source (procedural glyph SDFs, or a fixed string; user text is a wire-format question) | Pattern shader; medium effort for the font |
| **Shadebobs** | Additive blobs orbiting Lissajous paths, trailing via the existing Fade filter | Nearly covered by Metaballs+Fade; only worth it as a distinct look |
| ~~**Glenz / vector balls**~~ ✅ | SHIPPED post-1.25.0 as "Vector balls" | per-pixel z-test over projected discs (a painter's algorithm done per fragment), 4 formations, no per-layer state |

## B. Organic / natural fields (palette-native beauty)

| Effect | What it is | How it fits |
|---|---|---|
| ~~**Aurora borealis**~~ ✅ | SHIPPED post-1.16.0 | gaussian curtains; surfaced the buffer-Y-flip gotcha now in CLAUDE.md |
| ~~**Lightning storm**~~ ✅ | SHIPPED in 1.16.0 | value-is-progress Strike + auto Rate, up to 5 bolts |
| ~~**Reaction–diffusion (Gray–Scott)**~~ ✅ | SHIPPED post-1.16.0 | own RGBA16F ping-pong pair, dt-scaled steps, mitosis defaults |
| ~~**Cymatics / Chladni plate**~~ ✅ | SHIPPED in 1.16.0 | Mode drift morphs, beat chips snap figures |
| ~~**Gerstner ocean**~~ ✅ | SHIPPED post-1.25.0 as "Ocean" | screen ray x flat plane (no marching), 6 pow-sharpened trains, analytic normals for glint + foam |
| **Volumetric nebula** | fbm cloud raymarch with light scattering — slow, huge, high-end | Raymarch; Density / Light / Drift; CPU mirror at low steps |
| ~~**Crystal growth**~~ ✅ | SHIPPED post-1.82.0 | vapour field + freezing on its own RGBA16F pair; 7 extra diffusion passes per freezing step (growth must be slow against diffusion or it fills as noise — measured offline); grow/thaw/re-seed cycle is global, per-cell melting regrew as noise |

## C. High-end 3D / raymarched flagships

| Effect | What it is | How it fits |
|---|---|---|
| ~~**Mandelbulb**~~ ✅ | SHIPPED in 1.16.0 | 64-step raymarch, Power 2–12, halo on misses |
| ~~**Menger sponge flythrough**~~ ✅ | SHIPPED post-1.16.0 | infinite periodic lattice, dive + roll |
| ~~**Quaternion Julia (4D)**~~ ✅ | SHIPPED post-1.25.0 | seed rides `juliaSeed` + the Orbit editor; Slice / Cut angle are the 4D knobs — a `c` component is NOT (see below) |
| ~~**Kleinian limit set**~~ ✅ | SHIPPED post-1.82.0 | Jos Leys / Knighty Maskit DE, group pinned at the classic trace; the knobs are the cut plane (Slice, Cut angle, Cut tilt) per the lesson below; cut face lit flat with a 4-tap in-plane rim |
| ~~**Black hole**~~ ✅ | SHIPPED post-1.25.0 | photon INTEGRATION (weak-field deflection), disk collected on plane crossings, Keplerian shear + Doppler beaming |
| ~~**3D metaball goo**~~ ✅ | SHIPPED post-1.82.0 as "Metaball goo" | the solids' bodies as sphere centres (`L.goo`), IQ polynomial smooth-min, 56-step march; the solids' CPU marcher takes the map as an argument |

## D. Point-accumulation (the underused family — 3 of 21 effects)

| Effect | What it is | How it fits |
|---|---|---|
| ~~**Fractal flames**~~ ✅ | SHIPPED in 1.16.0 | additive `stampAdd` + shipped Fade/Diffuse retention turned out to be the density model — no log-normalise pass needed |
| ~~**Lorenz / Thomas / Aizawa**~~ ✅ | SHIPPED post-1.82.0 as "Attractor 3D" | one RK2 trajectory per frame over a fixed flow span, fitted by mean + RMS radius (a bounding box jumps with every outlier lap); Shape walks each family's parameter through chaos and periodic knots |
| ~~**Particle galaxy**~~ ✅ | SHIPPED post-1.25.0 as "Galaxy" | `stampAdd` (density IS brightness — MAX stamping gave the bulge no core), BOUNDED differential rotation |
| ~~**Harmonograph**~~ ✅ | SHIPPED post-1.25.0 | `stamp()`, whole curve per frame; ARC-LENGTH sampling and unequal pendulum amplitudes are what make it work |
| ~~**Boids murmuration**~~ ✅ | SHIPPED post-1.16.0 | per-layer flock (L.boids), beat-armed Scatter |

## E. Game-style FILTERS (the beat system makes these shine)

| Filter | What it is | How it fits |
|---|---|---|
| ~~**Shockwave**~~ ✅ | SHIPPED (post-1.15.0): the Shock value IS the ring position, so the beat pulse animates the wave — a trick worth reusing (see Lightning) | Done — `FS_SHOCK`, Shock / Push / Ring width |
| ~~**Pixel sort**~~ ✅ | SHIPPED in 1.16.0 | 32-tap directional max-smear |
| ~~**Droste zoom**~~ ✅ | SHIPPED post-1.16.0 | log-polar tiling, endless inward crawl |
| ~~**Kuwahara oil-paint**~~ ✅ | SHIPPED post-1.16.0 as "Oil paint" | 4-quadrant, Brush size 1–4 |
| ~~**Hex pixelate**~~ ✅ | SHIPPED post-1.25.0 | two offset lattices, nearer candidate centre — no axial round trip |
| ~~**Lens bubble**~~ ✅ | SHIPPED post-1.16.0 | Lissajous wander on postTime |
| ~~**Cellular automaton**~~ ✅ | SHIPPED in 1.16.0 | cyclic CA over retained heat, feedback stage |
| ~~**CRT phosphor + mask**~~ ✅ | SHIPPED post-1.25.0 as "CRT phosphor" | shadow mask + asymmetric beam bleed; PERSISTENCE deliberately omitted (a post pass has no memory — Fade pixel already is it) |
| ~~**Anaglyph split**~~ ✅ | SHIPPED post-1.82.0 | post filter `anaglyph`; pixel shift scaled by brightness (bright = nearer); Depth ships as the spread [8, 24] px so it breathes unarmed; Glasses defaults to full red/cyan |
| ~~**Stained glass**~~ ✅ | SHIPPED post-1.82.0 | post filter `stained`; Voronoi mosaic, one integer-hashed seed per cell, colour sampled at the seed, IQ exact border distance for the lead (multiply to black); Lead ships as the spread [0.06, 0.22] so it breathes unarmed; Shimmer wanders the seeds on postTime |

## Considered and rejected (poor fit for this engine)

- **Buddhabrot** — needs minutes of accumulation; fights the live-animation model.
- **Cloth / flag / soft bodies** — reads wrong through a 1-D palette ramp.
- **Datamosh** — no real motion vectors in this pipeline; fakes just look like Swirl.
- **Voxel terrain (Comanche)** — the heightfield's own colour IS the content; the ramp fights it.

## Recommended build order (updated after the second eight shipped)

What remains, strongest first:

**The recommended build order is now empty — all eight shipped.** What is left is the
"also open" list below, which was never ranked.

Also still open: Sine scroller (needs a glyph source), Volumetric nebula, Shadebobs.

## Lesson from Quaternion Julia (shipped post-1.25.0)

The obvious extra knob for it was a third component on the seed `c`, to "break the symmetry".
It cannot: `z² + c` in the quaternions is invariant under rotations of the imaginary 3-space,
so **every** member of this family is a surface of revolution and any `c` can be rotated back
into the complex plane. All that control did was raise `|c|` until the set escaped and the
screen went black. The variety in a 4D fractal is in **how you cut it**, not in nudging the
seed off-plane — hence Slice (where the cut falls) and Cut angle (the cut plane's orientation).
Worth remembering for **Kleinian** and any other 4D/hyperbolic entry above.
