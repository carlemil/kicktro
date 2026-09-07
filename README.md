# Kicktro

A GPU demoscene visual: a collection of **thirty-eight effects** in four families,
all sharing one palette + glow + banding pipeline —

- **Fractal fire** — a Sierpiński triangle, a bouncing 3D tetrahedron, a de
  Jong strange attractor, an Apophysis-style fractal flame, a Victorian harmonograph,
  a log-spiral galaxy, a row of fractal trees bending in a wind that can gust on the beat,
  or a wheeling boids murmuration stamped as fresh heat into a classic rising-fire buffer.
- **Shader fractals** — animated Julia, Burning Ship, Multibrot and Newton.
- **Coordinate / pattern classics** — plasma, tunnel, metaballs, kaleidoscope,
  rotozoomer, moiré, munching squares, copper bars, Kefrens bars, a twister
  column, Amiga vector balls, Chladni-plate cymatics, a beat-fired lightning storm, a hyperspace
  starfield, aurora curtains, a living reaction–diffusion dish, a rolling Gerstner
  ocean whose waves are really intersected (so crests hide the troughs behind them) and
  which mirrors the layer beneath it, and a boiling sun surface.
- **Signed-distance shapes** — rotating polygons, a pulsing shape grid,
  concentric ring tunnels, bouncing 2D shapes, a raymarched 3D room of
  tumbling solids, raytraced glass and metal balls that reflect and refract the layers
  beneath them, a Mandelbulb flown from the inside, a flight down the inside of a
  fluted doughnut, a four-dimensional quaternion Julia solid, and an
  infinite Menger-sponge dive.

Stack up to four of them into one scene, each with its own palette and filters — and tick
**Share one 3D world** on two or more to have their geometry traced *together*, so a glass
ball really sits in the ocean: reflecting it, refracted by it, and hidden by it where it
should be. **Ocean, Glass ball, Bouncing solids, Quaternion Julia and Vector balls** can
join — and **several Glass ball layers can join at once**, each placed independently, so
two sets of balls reflect each other where they really stand; the effects you fly *inside* (Mandelbulb, Menger sponge, Doughnut) cannot, since they
put the camera in their own geometry.
The whole thing burns, flickers, and morphs continuously — and every effect can
**react to whatever music you're playing**.

🔥 **Live demo:** https://kicktro.com/

## Effects

Every row in the panel's **Layers** box carries an **Effect** chooser, switching that layer
between fifty-four visuals that share the same palette, glow and music-reactivity pipeline —
but each is an independent "scene" that remembers its own settings (see Controls). You can
**stack up to four of them at once**, each with its own palette and filters — see Layers
below:

- **Sierpiński** — the classic 2D Sierpiński-**triangle** fire described below.
- **Tetrahedron** — the same fire seeded by a 3D Sierpiński **tetrahedron** that
  is a rigid body **bouncing inside a rubbery box** in front of a fixed camera
  (or, with the box hidden, **orbiting the centre of the screen**).
  Each of the four corners collides with the walls under impulse-based physics
  (isotropic inertia, near-elastic restitution), so a corner-hit realistically
  kicks the solid into a tumble; each hit bursts a fading sphere of points out
  from the impact point. The chaos game runs in 3D between the physics-driven
  vertices and is perspective-projected. The view turns so you read the box as solid 3D:
  **Rotation** yaws it and **Box nod** pitches it in a slow sine — both on sliders, and
  both can be set to 0 to hold it still.
- **Julia** — an animated Julia set. The seed `c` is orbited around the
  Mandelbrot plane along two stacked loops: a large slow loop tracing just
  outside the inner bound (the main cardioid, pushed slightly outward) so the
  Julia set stays intricate, plus a much smaller, faster circle riding on top
  that keeps the seed's neighbourhood changing instead of retracing one closed curve
  (wind **Inner radius** up far enough and it does dip inside, which is where the
  solid-blob frames come from). The big
  loop turns slowly (a few hundredths of an rpm) and the small one a fair bit
  faster, so the fractal reshapes continuously. Per-pixel escape time is written
  as heat and coloured through the same palettes.
- **Plasma** — a classic old-school demoscene plasma: several sine/cosine waves
  (plus a domain-warp for swirl) interfere across the screen and animate over
  time, then the summed value is wrapped through a final sine so the palette
  cycles into smooth colour bands. Sliders tune the animation **Speed**, spatial
  **Scale** and **Warp**; **Banding** works here too (as in Julia).
- …plus more demoscene effects, each with its own sliders (react to music via the
  L/M/H chips like everything else):
  - **Tunnel** — polar-mapped rings rushing toward the vanishing point (Fly speed / Twist / Ring density).
  - **Metaballs** — gooey blobs that merge with organic necks; turn up Banding for iso-contour shells.
  - **Kaleidoscope** — a moving field folded into mirror-symmetric wedges (Segments / Spin / Flow).
  - **Rotozoomer** — the classic Amiga rotate-and-pulse-zoom of a tiled grid.
  - **Moiré** — two drifting concentric-ring sets interfering into shimmering fringes.
  - **Munching Squares** — the hypnotic `(x XOR y) + t` pattern with self-similar nested squares.
  - **Copper Bars** — horizontal gradient raster bars sliding up and down on sine motion.
  - **Burning Ship** — a jagged, flame-like fractal (Julia's abs-fold cousin), sharing Julia's controls.
  - **Multibrot** — `z^power + c`, where **Power** sweeps continuously from 2 to 6. Whole numbers give the classic sets — each adds a bulb of symmetry — and the fractions in between morph one into the next (with a straight seam ray where the fractional exponent's branch cut lies, a signature of every fractional multibrot). The seed orbits a blend of the two neighbouring whole-power boundaries, pushed a little further out at fractional powers so the fractal keeps its filigree, and it still sprints through every cusp and eases off in between. Drift Power's two thumbs apart and the set never stops reshaping.
  - **Newton** — the three interlocking root-basins of `z³−1` with fractal borders (Root spin / Relaxation).
  - **Attractor** — a de Jong strange attractor whose four coefficients a/b/c/d morph its delicate threads. **Point jitter** scatters each stamped point to soften them — set it to 0 for the bare, hard-edged curves.
  - **Polygon** — one rotating regular N-gon; **Sides** morphs triangle → square → … → circle, **Thickness** hollows it into an outline.
  - **Shape grid** — a tiled lattice of one shape, each cell breathing out of phase with its neighbours (Density / Size / Squareness / Pulse).
  - **Concentric rings** — nested polygon contours marching outward from the centre, a hypnotic shape-tunnel (Sides / Ring count / March speed / Spin).
  - **Bouncing shapes** — a handful of circles↔squares drifting and bouncing off the edges, DVD-logo style. Tick a Fade or Fire filter for glowing trails.
  - **Bouncing solids** — the 3D one: solid **spheres, boxes, doughnuts, capsules, octahedra and cylinders** tumbling and ricocheting around an invisible room, raymarched as signed-distance fields and shaded into the palette by surface angle and depth. **Count** sets how many bodies, **Size** how big (it is also the radius they bounce on, so bigger ones turn sooner), **Shape mix** how many different primitives are in play (1 = all spheres, 6 = one of each), **Speed** how fast they travel, **Tumble** how hard they spin — a wall hit turns slide into roll, so an angled clip kicks a body into a tumble — and **Edge glow** lights the silhouettes.
  - **Sun surface** — the sun's boiling granulation, Inouye-telescope style: a full-screen field of bright convection cells split by narrow dark lanes (animated Voronoi), each cell drifting, deforming and brightening on its own slow cycle, with tiny bright points sparking in the lanes. **Cell density** sets how fine the boil is, **Churn speed** how fast, **Lane width** how fat the dark cracks are, and **Sunspot** sinks a dark umbra ringed by radiating penumbral filaments into the middle (0 = the clean surface from the telescope footage). Amber/Fire/Ember palettes give it its colour.
  - **Kefrens bars** — the classic Amiga effect: vertical ribbons redrawn at a per-scanline phase offset, weaving impossibly through each other. **Bars**, **Sway**, **Speed** and **Bar width** shape the tangle.
  - **Twister** — the classic twisting column, each face shaded by its angle with bright seams on the edges. **Twist** wrings it, **Speed** turns it, **Columns** stands up to three side by side.
  - **Cymatics** — sand on a vibrating plate: bright lines trace a standing wave's nodes, snapping into a new symmetry as **Mode** changes — drift its thumbs for continuous morphing or arm its chips so the figure jumps on the beat. **Sharpness** engraves the lines, **Shimmer** makes them tremble.
  - **Lightning storm** — bolts tearing down the screen, every strike a new shape. **Rate** fires them on a clock; arm **Strike**'s chips and the beat fires them instead, each bolt decaying over the Trigger duration. **Bolts** strikes several at once, **Afterglow** lights the sky.
  - **Mandelbulb** — the 3D Mandelbrot, raymarched and slowly orbited. **Power** reshapes it (8 is the classic), **Detail** adds fractal depth, **Glow** lights the silhouette and haloes near-misses. The heaviest effect in the app — it wants a real GPU.
  - **Galaxy** — a disc of stars whose density follows **log spirals**, the shape real galaxies make: an arm is a straight line in log-radius, so the winding tightens toward the core by itself. The arms **trail** the rotation, the way real ones do — their tips lag behind the way the disc is turning. The pattern rotates rigidly with a bounded shear over it (a density wave), which is what stops the spiral winding itself out of existence the way a true 1/r rotation curve would. Stamped **additively**, so density is brightness and the bulge burns white. **Arms** how many, **Twist** how tightly they wind, **Scatter** how sharply they read against the disc, **Core** how hot the centre, **Spin** which way and how fast.
  - **Harmonograph** — the Victorian drawing machine: two pendulums per axis, each a dying sine, their sum traced by a pen. **Frequency ratio** picks the figure (whole numbers give the closed classical forms, the values between them the open weaving ones). **Detune** is the trick — at exactly 0 the curve closes and retraces itself forever, and a hair off it each lap misses by a little and the figure precesses into a woven ribbon. **Damping** is how fast the pendulums die, so low spirals a long way in and high draws a tight knot. Points is the pen’s resolution, sampled by arc length so the fast outer loops stay solid.
  - **Vector balls** — the Amiga classic: a rigid constellation of shaded spheres tumbling in 3D. **Formation** arranges them as a Lattice, an even Fibonacci **Sphere** shell, a tilted **Ring** or a double **Helix**; the set turns as one body, so the shape reads only from how the balls occlude and shade each other — which is exactly how the original worked. **Balls** sets how many (up to 48), **Ball size** how fat (wind it up and they merge into one lumpy solid), **Tumble** how fast, **Edge glow** how hard the silhouettes are lit.
  - **Ocean** — a rolling sea running out to a horizon. Six wave trains are summed and each is **sharpened** so troughs stay round and crests come to a point — that is **Chop**, and it is the difference between a real swell and a bland sine. The directions turn octave by octave, so the water interferes with itself and never repeats. **Swell** scales the surface normals (so the glint sharpens and the foam breaks earlier), **Foam** is how high and steep a crest must be before it breaks white, **Speed** how fast the trains run, **Wind** which way the sea is going. Amber and Ember make it a sunset; the cold palettes make it the North Sea.
  - **Black hole** — an accretion disk seen through the hole's own gravity. The photons are **integrated, not drawn straight**: light from the far side of the disk is bent up over the top of the shadow and back under the bottom, closing those arcs round the darkness — a straight-ray version is just an ellipse. **Tilt** is the camera's height above the disk plane (low is the iconic nearly-edge-on view), **Disk size** how far it extends, **Disk speed** how fast it turns (Keplerian, so the inside shears past the outside and the turbulence never repeats), **Beaming** the relativistic boost that makes the limb coming toward you far brighter than the one going away, and **Orbit speed** the camera's lap. Also wants a real GPU.
  - **Quaternion Julia** — the Julia set done in **four** dimensions: `z → z² + c` iterated in the quaternions and raymarched as a solid. A 4D object cannot be shown, only cut, so the two slice controls are where the shapes live: **Slice** is where the cut falls, **Cut angle** rotates the cutting plane itself, and between them the solid walks through cross-sections nothing in 3D can hold. Leave both at 0 and you get the ordinary Julia set spun about its axis. The seed rides the **same cardioid orbit as Julia**, so the Orbit editor drives it too — sit just outside the Mandelbrot set for filigree, well inside for a blob. **Detail** and **Glow** as on the Mandelbulb. Also wants a real GPU.
  - **Fractal flames** — an Apophysis-style iterated function system: the chaos game bounces between two slowly-morphing maps with a nonlinear **Variation** folding every step, and each landing **adds** heat — dense orbits burn white, wisps stay faint. The only point effect that accumulates density rather than stamping a fixed heat.
  - **Starfield** — a 3D starfield flying past on six parallax depths. Arm **Warp**'s beat chips and the kick punches to hyperspace, every star smearing into a radial streak.
  - **Aurora** — curtains of light hanging from the top of the sky, swaying and shimmering over a faint horizon glow. Ice, Electric and Verdant palettes were made for it.
  - **Reaction-diffusion** — a Gray–Scott dish: two chemicals feeding and killing each other into spots, stripes, coral and mazes that never repeat. **Feed**/**Kill** choose the regime — arm Feed's chips and the beat pushes the culture into a new life. One shared dish; it re-seeds each time you enter the effect.
  - **Cellular automata** — Conway's Life and five of its relatives (**Rule**) on a grid that wraps at every edge. **Rain** sprinkles new cells every generation so it never settles — arm its chips and each beat is a shower of new life; **Trail** fades the dead over that many generations.
  - **Menger sponge** — an endless lattice of Menger sponges (the 3D Sierpiński carpet), raymarched while the camera dives through the holes with a slow roll.
  - **Boids** — a murmuration: cohesion, alignment and separation, nothing else. Each bird trails a streak through the shipped Fade filter; arm **Scatter**'s chips and every beat is a hawk.
  - **Slime mould** — thousands of agents each doing one stupid thing: look ahead-left, ahead and ahead-right at the trail everyone has left behind, turn toward whichever smells strongest, step, deposit. Nothing instructs them to build anything — the veins, loops, junctions and pruning are all **emergent**, which is why it looks alive in a way a particle system never does. **Sense** is how far ahead they look (short gives fine felted mats, long gives bold highways), **Turn** how sharply they steer, **Trail life** how long a deposit survives. **Scatter** is what keeps it alive: without it the network settles into an even mesh at the same density everywhere and stops going anywhere.
  - **Curl flow** — particles carried by the **curl** of a noise field. A curl field is divergence-free, so the flow can swirl and braid but can never pile particles up or drain a region empty — which is exactly what happens if you drag points along a plain noise gradient, and why this reads as smoke rather than as dots sliding downhill. **Field scale** sets the eddy size, **Flow** the speed, **Lifetime** how long a particle lives before respawning. Pairs naturally with Fade pixel for streaks.
  - **Flying ribbons** — long bands writhing through space, and the only effect here that rasterises real geometry rather than stamping points. What makes a ribbon read as a ribbon is that it has a **face**: seen flat it is a wide sheet, seen edge-on it collapses to a bright hairline. Both edges are placed in 3D and projected separately, so the foreshortening, the twist and the collapse are one piece of geometry rather than three fudges. **Twist** is how many times the band rolls along its length, **Width** how broad, **Length** how far it runs.
  - **Volumetric clouds** — real volume: the ray does not look for a surface, it integrates **density** along its length and lets light through according to how much it has already passed. Every other 3D effect here answers *where does this ray stop*; this one answers *how much did it collect on the way*. **Cover** fills the sky, **Scale** sizes the formations, **Detail** the octaves, **Sun** how hard light falls off through the depth — down for flat overcast, up for towering lit banks.
  - **God rays** — shafts thrown through gaps in a drifting occluder. Built by stepping from every pixel back *toward* the source and asking what blocked the way, so the shadow is cast through the **air** rather than onto a surface. **Reach** is the important one — near 1 the beams cross the whole frame; **Brightness**, **Cloud scale** and **Spread** do the rest.
  - **Terrain** — a fractal landscape flown at low altitude, the ground counterpart to Ocean and built on the same trick: the step length grows with distance, because near ground needs fine sampling and far ground is a few pixels wide. **Relief** is how tall the mountains stand, **Scale** how far apart, **Haze** how fast distance washes them out, **Fly speed** how fast you travel.
  - **Apollonian gasket** — an infinite packing of spheres, each nestled in the gap between the last three, marched from inside. Built by **inversion** rather than by iterating a power: each step reflects the point through a sphere and folds it back into the unit cell, so the structure repeats at every scale without being drawn twice. **Packing** is the shape knob — small opens the gaps, large turns the whole thing to filigree.
  - **Mandelbox** — the Mandelbulb's architectural cousin. Where the bulb runs a power map and grows organic lobes, this **folds space** — reflect anything outside a box back in, invert anything inside a small sphere, scale, repeat — and the result is hard-edged: corridors, shells and rooms rather than petals. **Scale** is the whole character, and the negative values are the famous ones (the shipped −1.7 hollows it into chambers).
  - **Gyroid** — a triply-periodic minimal surface: the sheet soap film makes when it divides space into two interlocking labyrinths that never touch. Not a fractal but one smooth infinite lattice, which is why it reads so differently from the two beside it — and the whole surface is one line of trigonometry, so it is also the cheapest 3D effect here. **Cell size** sets the weave, **Thickness** how solid the sheet is.
  - **Smooth CSG** — constructive solid geometry raymarched as one scene: a **Seed**-rolled cast of spheres, boxes, tori and capsules on their own looping paths and spins, melting into each other where they meet (smooth union), some of them carving wandering cavities instead (smooth subtraction). **Objects** sets the head count; **Blend** is the melt radius — arm its chips and each beat fuses the cast into one blob; **Shine** and **Highlight width** set the plastic gloss.
  - **Voronoi cells** — space divided between wandering seed points, each pixel coloured by its distance to the nearest. **Edge** is the character knob: at 0 soft blobs, at 1 the crack *between* cells — the shattered-glass look. **Cells** sets how many, **Wander** how far each drifts from home.
  - **Flow noise** — fractal noise whose **input** is displaced by more noise, twice over: the marbled, slowly-flowing field most modern shader work is built on. **Warp** is what makes it — at 0 plain cloud noise, and as it rises the field folds into itself and grows filaments and eddies. Plasma is built from sines and cannot make this shape however many you stack.
  - **Truchet tiles** — every tile holds one of two quarter-arc pairs picked by a coin flip, and because the arcs always meet at the tile edges an endless woven maze falls out of it. **Weave** slides the threshold deciding which way each tile faces, so tiles turn over one at a time rather than the grid re-rolling — drift it, or arm it to a beat, and the maze re-knits itself continuously.

## How it works

- **Fire** — a low-resolution heat buffer where each cell averages the pixels
  below it with a slight decay, so heat rises and flickers. This is the classic
  algorithm from [Lode's computer graphics tutorial](https://lodev.org/cgtutor/fire.html).
  It's a *filter* now rather than something built into the point effects, so any effect
  can burn — and an effect with nothing ticked draws its raw output over black.
- **Sierpiński seed** — the fractal is generated with the
  [chaos game](https://en.wikipedia.org/wiki/Sierpi%C5%84ski_triangle): repeatedly
  jump halfway toward a randomly chosen corner. **Sierpiński** uses a 2D triangle
  (three corners); **Tetrahedron** uses a 3D tetrahedron (four vertices), running the
  walk in 3D and perspective-projecting each point. Each point is stamped into the
  heat buffer near the hot end of the ramp — near, not at the very top, because most
  palettes are white up there and the fractal would draw white whichever one you picked.
  Tick **Fire** and flames rise out of it.
- **Moving geometry** — the triangle's corners drift on their own `sin`/`cos`
  mixes driven by a phase that accumulates per simulation tick (not the wall clock,
  so changing Drift speed eases the motion instead of teleporting it), fit into a safe box that fills the frame with a
  single pixel of margin on every side. The
  tetrahedron instead moves under the rigid-body physics described above,
  ricocheting off the walls of its container.
- **Deterministic point cloud** — the chaos game uses a seeded PRNG (mulberry32)
  that resets to the same value every frame, so the point *sequence* is identical
  each frame. Only the moving geometry reshapes the fractal — no random shimmer.
- **Palettes & glow** — nineteen classic demoscene-style palettes (including a set of
  Rastafari ramps), each shown as a gradient swatch you click to preview and pick
  (Fire, Ice, Toxic, Copper, Purple, Rainbow, Grayscale, Electric, Amber, Matrix,
  Sunset, C64, CGA, Blood, Chrome) — plus as many of your own as you like, made in the
  palette editor. Tick the **Bloom** filter for the additive glow that makes the hot
  points flare. The palette-cycle slider
  continuously blends from the current palette to a random next one, taking a time
  drawn from its min–max range each cycle (set it to 0 to hold one palette), and each
  layer cycles on its own clock.
- **Banding** — an optional *filter* over whichever palette is active (not a
  palette of its own). It posterises the heat ramp into bands and dims
  alternating groups of three, turning any palette into crisp light/dark contour
  stripes. Its strength is set by a ranged slider (see below), so it can sit at a
  fixed level or wander between two bounds; while on it also shimmers as a slow
  wave along the ramp.
- **Timing** — the simulation advances on a slow fixed tick rate, decoupled from
  the render frame rate, so the burn stays smooth and controllable.

## Controls

An on-screen panel (top-left) lets you tune the effect live. Most controls are
**ranged sliders**: two thumbs set a lower and upper bound, and the live value
then wanders *erratically* between them (a random target reached over a random
time, eased, on repeat). Collapse the two thumbs together to pin a constant
value, so a ranged slider also works as an ordinary one.

**Each effect is a fully independent scene** — its sliders, beat chips, pulse shapes
and lengths and show-box are all remembered *separately per effect*, so tweaking
Tetrahedron never touches Julia. Palette and filters go one better and are
remembered **per layer**, so two layers running the same effect can look completely
different. A handful of things are deliberately **shared** across the whole scene
instead: auto-cycle and its hold time, the transition length, the camera angles, the
whole-scene filters, the beat tuning — and, outside the scene entirely, the render
resolution and the panel's open/closed state. Everything is **saved to your browser** and
restored on your next visit (persisted values that fall outside a slider's
current range are ignored, so updates can't load junk). The **?** by the title
opens an effect-aware help panel; a small **frame counter + rolling FPS** sits in
the top-right corner (**H** hides it along with the rest of the UI).

**Pop out a slider** — every slider has a small **+** button. Click it to break
that slider out into its own box in a column to the right of the menu; the menu
keeps the slider's name with a **−** to put it back. Pop out several and the boxes
stack from the top down, so you can line up just the controls you're playing with.
(This layout is per-session and isn't saved, but nothing clears it for you: boxes stay
where you put them while you switch effects and scenes, so you can keep two layers'
sliders side by side and compare them. A box whose control the new scene doesn't use
hides itself and comes back if you return to an effect that has it.) Each box is titled with what it
belongs to — the effect or the filter, e.g. *Camera*, *Plasma*, *Filter · Bloom* —
so a stack of boxes reading "Speed", "Strength", "Size" stays readable. A box
gives the slider room for
everything that belongs to it: its value, the **L / M / H** beat chips and
**pulse-shape** picker, a **Pulse** knob for how long its beat kick lasts, and a
**min / max** row that retunes that slider's own range live. **↺ resets the whole
slider** — value, bounds, beat chips, pulse shape and pulse length all go back to
this effect's defaults, so a slider you've wandered somewhere strange is one click
from sane. Custom bounds are saved: they persist in your browser and travel with the
scene into your cloud profile.

A slider's menu row also shows small **beat dots** just left of that **+** — one per
armed band, in the band's colour (L blue, M green, H red). They sit dim and light up
on the beat that drives them, so you can see at a glance which sliders a scene has
wired to the music without opening a single box.

**There are two menus, and they hold different kinds of thing.**

**☰ opens the application menu** — a fold-out, multi-level menu for everything that is
*not* part of a scene. Items with a **▸** open a submenu beside them: **Audio ▸** gets you
the Capture/Mic buttons and the level meter, **Resolution ▸** the render resolution,
**Cloud profile ▸** the whole sign-in, save and publish block, and **Credits ▸** the credit
list and the two overlay switches.
**Public scenes** sits at the root, because browsing what other people have published needs
no account. At the top sit **Controls panel**, **Fullscreen** and **Hide all UI** (the same
things **M**, **F** and **H** do), and at the bottom **Tutorial** and **Help**. Click away
or press **Esc** to close it.

**Tutorial** is an eight-step tour of the whole app — what it is, the two menus, scenes,
layers, ranged sliders, filters, music reactivity and sharing. It opens **by itself the
first time you visit**, once the startup credits have burned away and before anything asks
you for audio, and after that it lives in the ☰ menu for whenever you want it back. **Help**
is the other half: a reference that explains every single control of whatever effect is
selected.

**The controls panel is everything that edits the scene** — five foldable sections, click
a heading's chevron to collapse one: **Scene** (which scene, how long each is held and how
long the change takes), **Scene filters** (the effects that act once on the finished
picture), **Beat tuning** (how beats are detected), **Layers** (the effect stack) and
**Layer effect & filters** (the selected layer's visual, its sliders, its own filters and
its palette). Press **M** to show or hide it.

**React to music** — the **microphone is the default**: with no source of your own chosen,
the first click anywhere on the page asks to listen through your mic, so music playing in
the room drives the visual without you having to find anything. (The browser will only ask
from a real click, which is why it waits for one — and the tutorial holds it until you are
done reading.) Say no, or press **Stop**, and it is not asked again. Click **Capture**
to tap system/tab audio instead (so it reacts to whatever you're playing, e.g. Spotify: pick
*Entire Screen* + "share system audio", or a *tab* + "share tab audio"), or **Mic** for the
microphone. The
audio is split into **low / mid / high** bands with per-band beat detection (the
3-bar meter shows it working). Detection is **onset-based**: each band watches its
*spectral flux* — how much the spectrum jumped **up** since the last look — so it
fires on the attack of a kick or a hi-hat rather than on loudness, and a sustained
bass line no longer masks the kick riding on top of it. The bar it has to clear
adapts to the mix (it follows the recent flux, so a quiet verse still triggers),
and the analysis runs on its own **100 Hz clock**, independent of the framerate,
so beats stay in time even when the visual is working hard. Each ranged slider has three tiny **L / M / H**
toggle chips, all **off** to start — they stay dim and colourless until you arm
one, which lights it in that band's colour: arm one and — while audio is on — the slider stops drifting and
instead rests at its low thumb, snapping to its high thumb on each beat in that
band and dropping back over that slider's own **Pulse** time (0.2s by default, set
per slider in its pop-out box; the range width sets how *big* the pulse is, the
pulse time how *long* it lasts). Beside the chips is a **pulse-shape** dropdown that picks the curve the value
follows on the way back down — **Snap** (linear, the classic), **Pluck** (fast
percussive drop), **Sustain** (holds high, then falls), **Ease** (smooth S-curve),
**Bounce** (a few decaying bounces) or **Steps** (retro quantized). The chips and
shapes and pulse times are remembered per effect and persisted. Pinned sliders (thumbs
together) have no range to pulse within, so widen a slider to make it react.
Browsers can't silently re-grab tab/screen (or mic) audio after a reload, so the
last source is remembered and re-opened on your **first click/keypress** after
the page loads.

**Mute** — the **♪** button beside ☰ and ⛶ (or the **S** key) stops the music driving the
visual, and armed sliders go back to drifting on their own as if no audio were running.
It is **not** Stop: the source stays open, so unmuting is instant. That distinction is the
whole point — a browser can't silently re-grab tab or screen audio, so actually stopping
would make you pick the tab again to come back. Use it to calm the scene down for a moment
without losing the capture. The button is inert until a source is running, and is not
remembered across reloads — like pause and fullscreen, it's a per-moment thing.

*(ranged)* controls are the two-thumb sliders described above; the rest are
single sliders, dropdowns or toggles. Everything is remembered per effect (or per layer)
except the shared few listed above.

| Control | What it does |
| --- | --- |
| **Scenes** | A saved scene is a named full snapshot — every layer, its effect and all its settings. Pick one to load it; from then on every change is **auto-saved** back into it. **New** saves what is on screen as a fresh scene, selects it, and switches auto-cycle off so it stays on screen; **Rename** relabels it; **Delete** asks first, naming the scene, then removes it and moves you onto the scene beside it (delete your last one and the scenes that ship with the app are put back — there is always something selected). One scene is always selected, so everything you do is always being saved into something — to experiment without touching a scene you like, press **New** first and work on the copy. Switching a layer to a different **effect** keeps you on the scene you have selected and folds the change into it, the same as moving a slider does — so you carry on working on your scene rather than being moved somewhere else. Note the scene keeps its **name**, so one called "Sierpiński" that you switch to Tunnel stays called Sierpiński until you rename it. Switching to a scene blends over rather than cutting (see Transitions), and blends the palette in from whatever is on screen: to a fresh random one while the palette cycle is running, or to the scene's own stored palette when the cycle is pinned to 0. To get scenes on or off this machine, see **Cloud profile** below. The list is grouped into **collections** — see below. |
| **Collections** | The scene list is grouped, and each group folds. The first is **yours**, labelled with your profile name — remembered in this browser, so it is on the heading from the moment the page opens rather than appearing once a cloud fetch lands; every other one is somebody else's, named after them, created when you load their scenes from the gallery. Their scenes never mix with yours: their "Sunset" and your "Sunset" sit in different collections and neither overwrites the other, and loading the same person again refreshes just their set. **Collections start folded**, so the list opens as a short stack of names — click a name to open it, click again to fold it. **✕** on a collection removes that whole set (your own group has no ✕, because it isn't something you loaded). |
| **Effect** | Switch a layer between all twenty effects listed above, in dropdown order (Sierpiński, Tetrahedron, Julia, Plasma, Tunnel, Metaballs, Burning Ship, Kaleidoscope, Rotozoomer, Munching Squares, Moiré, Newton, Multibrot, Copper Bars, Attractor, Polygon, Shape grid, Concentric rings, Bouncing shapes, Bouncing solids). The chooser lives on **every row in the Layers box**, so you re-point a layer without leaving the list — picking on a row that isn't selected selects it first. The layer's sliders then appear in **Layer effect & filters** below. A layer keeps its palette and filters when you change its effect: they belong to the layer, not the effect. |
| **Auto-cycle scenes** | When on, a random saved scene is applied every so often; off to stay put. It only ever picks scenes whose **tick** is on — see below. **It pauses while this panel is open**, so a scene is never swapped out from under you mid-edit; hide the panel (**M**, or **H** for everything) and the show runs. The tick is left exactly as you set it — closing the panel starts a fresh hold rather than switching the instant you do. A first visit therefore opens with the panel closed, so the scenes that ship with the app run as a show straight away. *(Shared, not per-effect.)* |
| **Tick beside each scene** | Whether that scene is part of the show. Ticked scenes are the ones auto-cycle picks from; unticked ones dim slightly and are skipped — but they are still there and still selectable by hand, so this is a way to build a set out of part of your library rather than a way to hide scenes. Everything starts ticked, and untick them all and auto-cycle simply sits still rather than falling back to the whole list. The ticks travel with your scenes into backups, cloud profiles and published collections. |
| **Show author** | The banner naming each scene as you land on it — its name, a dash, and who made it. Off to keep the screen clean. *(Remembered in this browser, like the credits switch; never part of a scene.)* |
| **Scene TTL** *(ranged, seconds)* | How long auto-cycle holds each scene before applying a random other one — a random time drawn from this range. Grays out while auto-cycle is off. Each saved scene remembers the TTL it was authored with, so selecting one sets this to that scene's own pacing. |
| **Transition** *(ranged, seconds)* | How long a scene change takes to blend. **Both scenes keep running through it** — the one you are leaving is still animating as it goes, rather than freezing into a still the moment you switch. Both thumbs at 0 cuts hard. |
| **Moving things around** | Every floating panel — a popped-out slider box, the Orbit editor, the Palette editor and inspector, the pickers — is **dragged by its title bar** onto a shared grid, and the grid appears while you drag so you can see where a drop will land. It is the **editor's own grid**: it starts at the panel's right edge, one column is exactly one box wide, and the rows divide the panel's height, so everything lines up with the menu rather than with an arbitrary fraction of the window. Boxes snap to a **finer quarter-cell mesh** (the faint lines) so you can place them freely; the **strong lines** mark the whole cells — flush with the panel, exactly one box apart — where the neatest alignments are. Drag something past the middle and it re-aligns to the near edge and grows inward. Double-click a title bar to give the placement back. Positions are per session, not saved into a scene. |
| **Pulse plot** *(in a box's Triggers section)* | Under the **Shape** picker, a small graph of what the slider will actually do when a beat lands: resting on the low thumb, the snap up to the high thumb, and the fall back along the chosen curve — so you can see that Bounce overshoots and Steps holds without arming anything. It is drawn from the same formula the animation uses, on the slider's own range: a slider whose two thumbs sit together plots a flat line, because a trigger on it does nothing. |
| **Break-out boxes** *(the +/− beside a slider)* | Pops that slider into its own box. Boxes are dragged onto that same grid. For the shape effects (Polygon, Concentric rings, Shape grid, Bouncing shapes, Bouncing solids, Vector balls) the box also carries a **small thumbnail of the shape those sliders make**, so you can see a seven-sided ring rather than imagining it. The **Triggers** heading in a box has a chevron that folds the whole beat section away — chips included — even while a band is armed; the coloured dot on the menu row still tells you it is wired. Positions and folds are per session, not saved into a scene. |
| **Field of view** *(ranged)* | How wide a lens this layer is seen through — it moves where each pixel takes its colour from, so positive bows the middle out into a fisheye and negative flattens the frame into a telephoto. 0 is the normal lens; drift the thumbs and the layer breathes. Per layer, so one can bulge while another stays flat. It works on every effect, stamped ones included — those need the curve run backwards, so a wide lens pulls a stamped picture in from the corners rather than showing you more of it. |
| **A layer's settings open in the grid** | The **+** on the right of a layer's row opens that layer's whole settings block as a box beside the panel — the same box the sliders use, dragged by its title line, snapped to the same grid, closed with the **−** on the row or on the box. Any number of layers can be open at once, so two layers' controls can sit side by side. Selecting a layer does not open it; opening one selects it. |
| **Blend — OVR** | A new blend mode: where this layer drew something it **covers** the layers below; where it drew nothing they show through. The one for a solid object that should hide what is behind it. The Glass ball ships with it, so a metal ball is opaque. |
| **Effect / Filters / Palette tabs** | Every layer's block is split into three tabs: **Effect** holds the effect's own sliders, the Orbit editor and Reset; **Filters** holds that layer's filter chain; **Palette** holds the swatch strip, Reverse colours, Background, the palette cycle and Banding. Each layer's block remembers its own open tab, so two blocks opened side by side can show different tabs. Popped-out slider boxes stay in view whichever tab is open. Not remembered across a reload. |
| **Palettes in use** | The **+** tile at the end of the swatch strip opens a list of every ramp with a tick beside it. Only the ticked ones show in the strip, and only they are picked when the palette cycle runs — so a big catalogue can still cycle inside the four that suit a set. Nothing is deleted by unticking: a scene that stores an unticked ramp still loads and still renders it, and the one you are on always stays visible in the strip. *(Remembered per browser, like auto-cycle; not part of a scene you share.)* |
| **Palette** | Pick one of nineteen colour ramps — each is shown as a gradient swatch, so you preview the colours instead of reading a name. Click one to select it; the active ramp is highlighted. The **👁** button beside the label opens the inspector: the whole 0–255 ramp as a grid, hover any cell for its index and hex. |
| **Palette editor** | Hover a swatch and click **+** to make an editable copy of it, or **✎** on one of your own to edit it in place — the nineteen built-in ramps are never changed. The ramp is edited as **colour stops** on a gradient bar: click the bar to add a stop where you clicked, drag a handle to move it, and use the colour box to recolour the selected one. **Everything previews live on the scene as you edit**, so there is nothing to apply. Your palettes join the swatch list (and the palette-cycle rotation) and are saved with your settings. A copy you open and close without changing anything is discarded, so looking costs nothing — use **Save & close** if you wanted the duplicate anyway. **Delete palette** removes one of yours; any layer using it falls back to the ramp it was copied from. |
| **Palette cycle** | How long one blend to a random palette takes, as a min–max range in seconds — each cycle picks a time inside it. Collapse both thumbs to **0** for a fixed palette that never cycles. (This replaced the old Auto-morph checkbox.) |
| **Palette hold** | How long to rest on each palette before the next blend begins, as a min–max range in seconds — a fresh dwell is drawn each time. At **0** (the default) the palette cross-fades continuously; raise it to pause on each palette between changes. Only applies while Palette cycle is running. |
| **Reverse colours** | Runs this layer's ramp the other way, so what was the hot end becomes the cool one. The dark background end stays dark, so the effect still fades out of the background instead of sitting on a bright slab. *(Per layer.)* |
| **Background** | What unlit pixels show for this layer: **Palette** (the default — whatever colour the ramp itself defines at index 0), **Black** or **White**. Every built-in ramp starts black, so this only shows up on a custom palette, or on a bottom layer you want to sit on white. *(Per layer.)* |
| **Heat boost** *(ranged)* | Pushes the whole picture toward the bright end of the palette — a gamma curve on the heat before it is coloured, so faint structure lights up without touching the palette itself. **off** (the default) leaves the ramp exactly as it is. *(Per layer, and animatable / beat-armable like any other slider.)* |
| **React to music** | **Capture** system/tab audio (e.g. Spotify) or **Mic**; the audio is split into low/mid/high bands with per-band beat detection (see below). |
| **Banding** *(ranged)* | Most shader effects (Julia, Plasma, Metaballs, Burning Ship, Kaleidoscope, Rotozoomer, Moiré, Newton, Multibrot, Copper Bars, Sun surface, Kefrens bars, Twister, Cymatics, Lightning storm, Mandelbulb, Starfield, Aurora, Reaction-diffusion, Menger sponge) — strength of the light/dark contour-stripe filter over the active palette. |
| **Band size** *(ranged)* | Shader effects with banding — colours per light (and per dark) run in the banding pattern. |
| **Darkness** *(ranged)* | Shader effects with banding — how far the banding's dark runs are darkened. |
| **Points** | Number of points stamped per frame (100–8000). *(Sierpiński / Tetrahedron / Attractor.)* |
| **Objects** | −/+ add up to 6 copies of the fractal (the moving tetrahedra / triangles); each added copy is half the size and half the points of the last, with a new seed, so it drifts/tumbles independently. Distinct from the effect stack (also called Layers). *(Sierpiński / Tetrahedron.)* |
| **Drift speed** *(ranged)* | How fast the triangle's corners move / the tetrahedron's physics tempo. *(Sierpiński / Tetrahedron.)* |
| **Flame rise** *(ranged)* | How tall the flames climb before fading (linear in height). Belongs to the **Fire filter**, so it is available to any effect that has Fire ticked. |
| **Size** *(ranged)* | Scales the fractal about its centre — the triangle, or the tetrahedron with matching physics. Distinct from Zoom. *(Sierpiński / Tetrahedron.)* |
| **Rotation** *(ranged)* | Tetrahedron only — **yaw** rate in degrees/second for the scene orbit around the box. Ships drifting −5…5°/s; set both thumbs to 0 to hold still. |
| **Box nod** *(ranged)* | Tetrahedron only — how far the view **pitches** up and down in its slow sine, in degrees (default ≈17°). 0 holds the box dead level. This is the drift that used to be hardcoded with no control. |
| **Nod speed** *(ranged)* | Tetrahedron only — multiplier on how fast that nod swings. 0 freezes it mid-swing; the swing is also scaled by Drift speed, as it always was. |
| **Show box** | On: draw the wireframe box the tetrahedron bounces in (with a spark-sphere burst on each wall hit). Off: no box — with no walls to ricochet in, the tetrahedron orbits the centre of the screen instead. *(Tetrahedron.)* |
| **Box size** *(ranged)* | How large the box the tetrahedra bounce inside is — bigger gives them more room. *(Tetrahedron.)* |
| **Sway** *(ranged)* | With **Show box** off, how far the free-floating tetrahedron wanders around the centre on its slow drift (0 pins it to the middle and it just tumbles in place). *(Tetrahedron.)* |
| **Zoom** *(ranged)* | Zoom this layer's view in and out. Every effect zooms by **re-drawing itself at the zoomed scale**, not by blowing up the finished picture, so it stays sharp however far you go in — the fractals resolve more detail and the point effects stamp more points to match. Flames and glow keep their real size, so what you gain is detail rather than a bigger blur. *(Per layer.)* |
| **Camera X / Y / Z** *(ranged, degrees)* | Tilt and spin the whole scene in 3D — X and Y rock it away from you, Z rolls it in the plane of the screen. Shared across effects rather than per-effect, so it acts as a camera over whatever is running. |
| **Power** | Multibrot only — the exponent in `z^power + c`, a whole number. Each step adds a bulb of symmetry, and adds a cusp to the seed's cardioid, so the orbit gains a fast/slow stretch with it. |
| **Point jitter** *(ranged)* | Attractor only — scatters each plotted point by up to this many pixels to soften the map's hard threads. 0 gives the bare, razor-thin curves. |
| **Cardioid RPM** *(ranged)* | Julia, Burning Ship and Multibrot — how fast the big seed loop orbits the cardioid, in rpm. |
| **Inner : outer ratio** *(ranged)* | The cardioid-seeded effects — how many times the small seed circle spins per big-loop lap. Defaults to the hypocycloid ratio implied by the two circumferences (≈21.5×). |
| **Inner radius** *(ranged)* | The cardioid-seeded effects — the size of the small circle riding on the seed. Small values keep the seed just outside the cardioid (intricate); large values swing it wider and can dip inside, giving solid-blob frames. |
| **Outer radius** *(ranged)* | The cardioid-seeded effects — the scale of the big cardioid loop the seed traces. Larger values push the whole orbit outward, further clear of the set. Burning Ship ships this high (1.4–1.9) for exactly that reason; wind it down and it washes out. |
| **Cardioid start** *(ranged)* | The cardioid-seeded effects — an offset added to the seed's position around the cardioid, in laps (0 and 1 are the same point, 0.5 is halfway round). |
| **Cardioid X offset** *(ranged)* | The cardioid-seeded effects — slides the whole orbit along the real axis. Negative walks it toward the bulbs and the spike, positive past the cusp. |
| **Random seed each reload** | The cardioid-seeded effects — when on (the default), the fractal opens from a fresh random spot on the cardioid every page load and each time you switch to the effect. Turn off for a fixed, reproducible starting frame. |
| **Speed** *(ranged)* | Plasma only — how fast the waves animate (0 freezes the field). |
| **Scale** *(ranged)* | Plasma only — spatial frequency of the waves (fine vs coarse pattern). |
| **Warp** *(ranged)* | Plasma only — domain warp: bends the waves into swirls (0 = clean interference). |
| **Cell density** *(ranged)* | Sun surface only — how many convection cells fill the screen: a few huge granules at the low end, a fine boiling texture at the high. |
| **Churn speed** *(ranged)* | Sun surface only — how fast the cells boil (drift, deform, brighten and dim). 1× gives each granule a lifetime of roughly 15–30 s; 0 freezes the surface. |
| **Lane width** *(ranged)* | Sun surface only — how wide and soft the dark lanes between cells are, from hairline cracks to fat borders. |
| **Brightness** *(ranged)* | Sun surface only — scales the whole surface up or down the palette: lower sits the cells deeper in the oranges, higher pushes the centres toward white heat. |
| **Sunspot** *(ranged)* | Sun surface only — sinks a sunspot into the centre: a near-black umbra ringed by fine radiating penumbral filaments that fade into the granulation. 0 (the default) is the clean surface; the camera sliders move it off-centre. |
| **Bars / Sway / Bar width** *(ranged)* | Kefrens bars only — how many ribbons, how far they wander, how fat each one is. |
| **Columns / Twist** *(ranged)* | Twister only — side-by-side columns (up to 3) and how hard the column is wrung (negative reverses). |
| **Mode / Mode offset / Sharpness / Shimmer** *(ranged)* | Cymatics only — the standing wave's numbers (arm Mode's chips to snap figures on the beat), the skew off square, line thinness, and plate tremble. |
| **Strike / Rate / Bolts / Afterglow** *(ranged)* | Lightning storm only — the strike itself (arm its chips and the beat fires bolts), automatic strikes per second, simultaneous bolts, and sky glow. |
| **Power / Detail / Orbit speed / Glow** *(ranged)* | Mandelbulb only — the exponent (8 = classic; continuously variable, so drifting it morphs the bulb), fractal iterations, camera lap speed, and silhouette/halo lighting. |
| **Variation / Morph speed / Point glow** *(ranged)* | Fractal flames only — which nonlinear fold shapes the flame, how fast its maps morph, and how much heat each landing point adds. |
| **Star density / Fly speed / Warp / Twinkle** *(ranged)* | Starfield only — the traffic, the flight, the beat-armable hyperspace smear, and the shimmer. |
| **Curtains / Sway / Shimmer** *(ranged)* | Aurora only — how many light curtains hang, how far the sky bends them, how restless the light is. |
| **Feed / Kill / Sim speed** *(ranged)* | Reaction-diffusion only — the Gray–Scott regime knobs (arm Feed's chips to jump regimes on the beat) and how many chemistry steps run per frame. |
| **Dive speed / Roll** *(ranged)* | Menger sponge only — the flight through the lattice and its slow barrel roll. |
| **Flock / Cohesion / Scatter** *(ranged)* | Boids only — how many birds, how tightly they wheel, and the beat-armable hawk that blasts them apart. |
| **Reset this effect** | Put the current effect back the way it ships: every slider's **value and range**, its beat chips, pulse shapes and lengths, and its palette. Other effects and the shared controls are left alone. (The ↺ in a single slider's pop-out box does the same for just that slider.) |

**☰** opens the application menu (System, Cloud profile, Credits — see above); **M**
shows or hides the controls panel. **F** or **⛶** is fullscreen (works on
mobile too), **S** or **♪** mutes the music reaction, **H** hides all the UI (buttons,
FPS counter and both menus — press again to bring it back), **Esc** closes whatever popup is
open, and clicking the canvas pauses. Add **`?hideui`** to the URL to open with the UI already hidden — handy for a
clean screen recording or a kiosk. **M** also tucks away the floating tool panels
(the Orbit editor, the palette inspector and the palette editor) so you get a clean
view. A **Resolution** control in **System** drops the render
resolution on low-end devices. If your browser requests **reduced motion**, the
page opens paused (a static frame) — click the canvas to animate. On mobile,
tab/screen audio capture isn't available, so only **Mic** is shown.

## Transitions

When one scene gives way to the next, the change is blended rather than cut. Some
scenes always did this on their own — anything with **Fire** or **Fade pixel** on
keeps its buffer, so the old picture burns or smears away under the new one. Scenes
with neither redraw from scratch every frame, so they used to snap over in a single
frame.

A transition is now chosen automatically for each switch, from nine:

| | |
| --- | --- |
| **Cut** | No blend. Picked when the buffers already dissolve for you. |
| **Burn off** | Lends the old scene the fire's decay for the length of the switch, so it burns away even under an effect that has no filter on. |
| **Crossfade** | Straight dissolve between the two. |
| **Dip to black** | Down to black in the middle and back up. |
| **Flash** | A bright bloom over the join. |
| **Pixelate through** | Blocks grow, the scene changes at the coarsest point, blocks shrink again. |
| **Blur through** | The same shape, with blur instead of blocks. |
| **Wipe** | A soft edge travels across. |
| **Iris** | The new scene opens out from the centre. |
| **Checkerboard** | Tiles flip in a checkerboard, staggered so the change ripples across the grid. |
| **Bars** | Vertical bars, alternate ones rising and falling. |
| **Shutter** | Horizontal slats opening from their centres, like a venetian blind. |
| **Slide** | The new scene pushes the old one out sideways. |
| **Clock wipe** | A hand sweeps round from twelve, revealing as it goes. |
| **Dissolve** | Grain by grain, in a random order — the gentlest of the set, and good for a palette jump. |
| **Ripple** | A ring expands from the centre, carrying the change and bending the image as it passes. |

The choice isn't random for its own sake — each one knows which switches it flatters.
A crossfade between two full-screen fields looks lovely, but crossfading a sparse
point cloud against a dense one just looks like a double exposure, so those get the
ones that break the picture up (pixelate, blur, wipe) — they destroy the image exactly
where it changes, which is what hides the join. Big jumps in palette lean toward dip
and flash. Scenes that already dissolve on their own mostly get left alone.

**Transition** (in the **Scene** box, under Scene TTL) sets how long they take, as a
min–max range in seconds — each switch draws a length from it. Collapse both thumbs to
**0** for a hard cut, which is exactly how the app behaved before. Like Scene TTL, each
saved scene remembers its own, so a scene plays the way it was authored.

**+ Choose transitions**, just under that slider, opens the full list with a tick beside
each one. Only the ticked ones are ever picked — so if you want nothing but shutters and
dissolves, say so. They still only turn up where they suit the two scenes, since the pick
stays weighted; unticking narrows the pool rather than overriding the taste. Untick
everything and scene changes cut straight over. *(Remembered per browser, like auto-cycle;
not part of a scene you share.)*

One thing to know: during a transition the outgoing scene is a frozen frame, not still
running. Two effects can't be rendered at once here. At well under a second it reads
the way a video mixer's dissolve does.

## Layers

A scene can stack **up to four effects at once**, composited into one picture. The
**Layers** section holds one row per layer, and they combine in list order.

**Each layer is one complete box.** Click a layer and it opens out in place: its header
across the top — which effect it runs, its on/off dot, its strength slider, its blend mode —
and directly underneath, everything that shapes it. That effect's own sliders first, then its
filter chain, then its palette. So a layer is one object you scroll through rather than a row
here and a separate settings box somewhere else. The layers you are not editing stay as
single compact rows, so the list still reads as a stack.

Press anywhere on a row to select it — the sliders in **Layer effect & filters** below
then edit *that* layer, so each one keeps its own settings, its own drifting sliders and
its own beat reactions. **+ Add layer** adds another (it starts as a copy of the selected
layer's effect; change it with the row's own Effect chooser). Each row carries:

- **⠿** — the grab handle: drag it up or down to reorder the layer in the stack. The
  layer you dragged ends up selected wherever it lands.
- The **effect chooser** — what this layer draws.
- **●** — mute it. A muted layer costs nothing and leaves nothing behind, which makes it
  the quickest way to see what a layer is actually contributing.
- The **strength** slider — how much of the layer reaches the composite, from nothing to
  full.
- **✕** — remove it.
- **Blend** — how it combines with the layers below: a dropdown, with **▲/▼** beside it to
  step through the list one at a time when you just want to try them all. Because each
  layer carries its own palette (below), a multi-layer stack blends in **colour**, in the
  perceptual OKLab space, so hues mix cleanly instead of muddying to grey.

There are **twenty blend modes**. Every one has a tooltip in the dropdown; the ones worth
knowing first:

| | |
| --- | --- |
| **MAX** | The brighter layer wins each pixel. Clean separation, the safe default. |
| **ADD** | Screens the layers' brightness and averages their hue by brightness, so each colour shows in proportion to how bright it is where they overlap. |
| **CMX** *(channel max)* | The brighter of the two in *each* of red, green and blue separately — so red over green gives yellow where they overlap, which MAX never does. |
| **RGB** | Screens the three channels independently, keeping both layers' full colour instead of merging to one hue. |
| **OKL** / **HSV** | The vivid pair: blend the two hues around the colour wheel and keep the *higher* saturation, so overlaps stay saturated instead of greying out. HSV is the louder of the two. |
| **DOM** | At each pixel the more colourful layer keeps its exact hue — no mixing, crisp boundaries between two palettes. |
| **MUL** / **OVL** / **DDG** / **BRN** | The photo-editing family: multiply into rich ink, overlay for hard contrast, colour dodge for neon blowout, colour burn for crushed shadow. |
| **DIF** / **NEG** / **XOR** | The psychedelic ones: difference, negation, and a bitwise XOR of the raw channels for hard demoscene interference bands. |
| **COL** / **LUM** | Split hue from brightness — COL repaints the layers below in this layer's hue, LUM does the reverse. |
| **AVG** / **INT** / **CMP** / **RFL** | A plain perceptual 50/50; scanline interleave (even lines this layer, odd lines the one below); complement push, which rotates overlaps to the opposite hue; and reflect/glow, which flares this layer's highlights. |

Everything except MAX and ADD needs two or more layers to do anything — a lone layer has
nothing underneath to blend against.

Layers are part of the scene: they save into scenes and travel in cloud profiles and
links. A scene with a single layer is stored exactly the way it always was, so every
scene, backup and link made before layers existed still opens unchanged.

Each layer keeps its **own palette and its own filters**, so every effect in a stack shows
in its own colours and is shaped on its own — set a layer's palette and tick its filters
while that layer is selected, and they are remembered per layer. With the palette cycle
running, layers even morph on their own schedules. The menu splits the filters accordingly:
the **per-effect** ones (Fire, Fade and the trail effects; Wedge fold, Twist, Edge and the
rest of the image filters) live in **Layer effect & filters** and run on each layer on its
own, before they blend; the **whole-scene** ones (Bloom, Scanlines, Vignette, Film grain,
Barrel) have their own **Scene filters** box, and act once on the finished, blended
picture — as do beat tuning and render resolution. **Zoom** and the **camera** are per layer,
and every effect zooms by re-drawing itself at the zoomed scale, so each layer of a stack can
sit at its own zoom and all of them stay sharp.

On machines without WebGL the Canvas2D fallback renders the first unmuted layer only:
stacking is a GPU feature, and each extra layer there would be a full software render.

## Filters

There are twenty-four post-processing effects you can stack on top of whatever is
running. The menu lists only the ones you've **added**, in the order they run: press
**+ Add filter** to open the full catalogue and tick what you want, drag a row's **⠿**
handle to move it up or down the chain, and press **✕** to drop it. Each row folds open
to show its own settings, and the whole chain — order included — is saved into the scene.

There is one line in the list worth understanding: **the effect draws here.** Filters above
it shape the *heat* before the effect has drawn into it; filters below repaint the finished
*picture*. Dragging a filter across that line doesn't just change when it runs, it changes
what it does — and the list says so when you do it.

That makes ordering genuinely expressive. Put **Mirror** below **Swirl** and the swirl
churns the heat while the mirror lands last, so the frame comes out perfectly symmetric.
Drag Mirror *above* Swirl and it mirrors the heat first, which the swirl then twists — the
symmetry is gone. Same two filters, completely different picture. Trail filters (Fire, Fade,
Echo, Swirl…) only make sense on the heat, so they stay above the line; everything else goes
wherever you put it.

**Every filter belongs to a layer.** There used to be a second group that acted once on
the finished picture — Bloom, Barrel, Scanlines, Vignette and Film grain. They are all
per-layer passes now, so each layer glows, curves and gets its raster on its own before
the layers blend. Two things follow from that: a bright layer no longer smears the ones
above it, and if two layers both carry Scanlines the two rasters can interfere — put it
on one layer for a clean result. Bloom's place in the chain is yours to choose too: a
Vignette after it darkens the glow, a Vignette before it does not.

**Feedback (heat)** *— per layer* — these run on the retained heat, before the effect's fresh
output is mixed in, so they're what trails and long exposures are made of. Each
carries its own **Lifetime** — how much of the picture survives each tick — so it decays
on its own rather than piling up to white.

- **Fire** — the rising, cooling heat simulation. It used to be hardwired to the
  three point effects; now any effect can burn. **Flame rise** sets how tall the
  flames climb, **Burn rate** how many times a second the fire advances.
- **Fade pixel** — every pixel keeps a fraction of its brightness each tick, so
  the image smears into phosphor trails. **Lifetime** near 100% holds almost forever.
- **Diffuse** — heat bleeds sideways as well as up, so Fire's flames turn to smoke.
- **Echo** — trails drag in a **Direction** instead of just dimming in place.
- **Zoom feedback** — the retained heat is rescaled about the centre every tick.
  Over 1× it rushes outward into an endless tunnel; under 1× it falls inward.
- **Swirl** — the same, rotating instead of scaling, so trails spiral. Stack it
  with Zoom feedback for a vortex.
- **Cellular automaton** — the retained heat evolves as a cyclic CA every tick: any
  neighbour one **State** ahead pulls a cell forward, wrapping, so boiling fronts and
  spirals crawl through whatever the effect draws. **Blend** softens the rule's bite;
  **Lifetime** decays it like the other feedback filters.

**Post (image)** *— per layer* — these repaint each layer's coloured picture, before
the layers blend together.

- **Twist** — spin the middle of the image and leave the rim, so straight
  structure curls into the centre.
- **Wedge fold** — fold the picture into N mirrored **Segments**: Mirror's trick
  generalised to a kaleidoscope, available to every effect.
- **Slice glitch** — tear horizontal slices sideways at random. Arm **Amount** to
  a beat and the picture rips on the hit.
- **Noise** — push the colour with per-pixel noise: every pixel's brightness is
  nudged up or down by its own random value, black stays black (**Amount**).
  **Seed** keeps one pattern (*Static*, identical every frame) or re-rolls it every
  frame (*Random*). Arm **Amount** to a beat for a flash on the hit.
- **Pixelate** — snap the picture to a coarse grid. **Block** is the cell size.
- **Hex pixelate** — the same idea on a honeycomb: the picture snaps to hexagons instead
  of squares. **Cell** is the hex size.
- **Blur / sharpen** — one knob: negative blurs, positive sharpens (unsharp mask),
  with its own **Radius**.
- **Edge** — a Sobel outline that traces the shapes instead of filling them.
- **Posterize** — quantise the colours into flat bands. **Levels** sets how many.
- **Halftone** — a rotated dot screen whose dots grow with brightness: the print
  look. Posterize flattens the ramp, this one spends texture on it.
- **Solarize** — invert everything above a brightness **Level**.
- **Chromatic aberration** — split red and blue radially, so the picture fringes
  toward the corners the way a cheap lens does.
- **Mirror** — fold the image about its centre, on **X**, **Y** or both.
- **Pixel sort** — the modern glitch: pixels brighter than **Threshold** smear into
  **Streak**s along one **Direction**, dark areas stay put. Melts any effect into
  dripping light.
- **Lens bubble** — a wandering fisheye magnifier drifting over the picture — the classic
  demo lens. **Wander** at 0 parks it in the middle.
- **CRT phosphor** — the rest of the television, beside Scanlines and Barrel: RGB
  shadow-mask triads (**Mask**) and the electron beam’s horizontal smear (**Beam bleed**),
  which trails to the right the way a real sweep does. Phosphor *persistence* is
  deliberately not here — a post pass has no memory of the last frame; stack **Fade pixel**
  above the line for that.
- **Droste zoom** — the picture swallows itself: every ring inward is the whole image
  again, **Depth** times smaller, crawling endlessly toward the centre. **Spiral** shears
  it into a vortex — try it over Wedge fold.
- **Oil paint** — Kuwahara filtering: texture flattens into brushy patches while edges
  stay crisp, the screen-print look. **Brush size** sets how painterly.
- **Shockwave** — a displacement ring rushing out from the centre, shoving the picture
  aside as it passes. The **Shock** slider *is* the ring's position (1 = centre, 0 = gone
  off the edge), so arm its **L/M/H** beat chips and every kick fires a wave — the
  **Trigger duration** knob in its pop-out box sets how long the crossing takes, **Push**
  how hard it displaces, **Ring width** how fat the wavefront is.

**Whole scene (final)** *— the Scene filters box* — these go on top of the finished,
blended frame, at your display's real resolution rather than the fire grid's. They're the
"it's a screen you're looking at" layer, and they only read right after the bloom — a
vignette *under* an additive glow just gets lit back up again.

- **Bloom** — the additive glow: a blurred copy of the scene added back over it.
  **Strength** at 0 turns it off entirely.
- **Barrel distortion** — bulge the image as if it were painted on a CRT.
- **Scanlines** — darken alternating rows. **Lines** sets how many across the height.
- **Vignette** — fall off toward the corners.
- **Film grain** — animated noise over the whole frame.

Untick everything for the raw effect with no post-processing.

The feedback group is what decides whether the picture starts from a clean slate.
With none of them ticked, every frame is drawn fresh over black — which is what
the shader effects (Plasma, the fractals, Tunnel, …) have always done. Tick any
one and the previous frame stays put — decayed, drifting upward, dragged sideways
or spun — with the new frame laid over the top wherever it's brighter. That's
where trails, smears and long exposures come from.

On machines without WebGL the app falls back to a Canvas2D renderer. Every
feedback filter runs on both paths, so the fallback keeps its trails; the filters
that are GPU passes — everything under Post, and the whole-scene ones except Bloom —
are greyed out there rather than pretending to work.

## The Orbit editor

There's no separate Diagnostics section: the tuning tools sit next to the things they
tune. The **beat-detection trace** is a checkbox in the **Beat tuning** box (below), each
slider's **min / max / step** row is in its own pop-out box (above), and the third one is
the **Orbit editor** — a button in **Layer effect & filters**, shown for the effects whose
seed orbits a cardioid (Julia, Burning Ship,
Multibrot). It opens the fractal set the seed is riding — the Mandelbrot set, or
the matching Multibrot set once you move Multibrot's **Power** off 2 — with that
orbit drawn on top: the base curve, the path the seed actually traces at the
current ratio and radii, the little riding circle and the live seed point, so you
can see exactly where your **Cardioid RPM / ratio / radius / start / X offset**
settings land.

It also lets you **choose the shape the seed follows**, per layer:
- **Cardioid** — the classic path just outside the set's main cardioid (the default).
- **Circle** — a plain circle, sized by **Outer radius** and slid by **Cardioid X offset**.
- **Freehand** — drag on the canvas to draw a loop; it snaps to a smooth **closed spline**
  the seed then traces at even speed. **Edit** then shows the control points so you can drag
  them to reshape it, **Undo** steps back a change, and **Clear** starts over.

**⏸** pauses the seed where it is, so you can study one frame of the fractal (or line the
seed up on a spot by hand) without it drifting off. The **Riding circle** checkbox toggles
the small epicycle that keeps the seed's
neighbourhood varying — leave it on for the lively look, turn it off to follow the
bare curve exactly. The shape, the toggle and any drawn loop are saved with the
scene, per layer, so two cardioid layers can trace completely different paths.

It's a floating panel, not a modal: the menu stays live underneath it, so you can
drag those sliders and watch the orbit redraw. **×** or **Esc** closes it.

## Beat tuning

Its own box in the menu: live sliders for how beats are detected — per-band
**sensitivity** (lower = more beats), the **relative floor**, per-band **refractory**
gap (the minimum time between two beats), and each band's **frequency range** in Hz.
**Reset** restores the shipped defaults. The **Beat-detection trace** checkbox at the
foot of the same box (also `?debug=1`) draws a scrolling plot per band of the spectral
flux, the adaptive threshold it has to clear and a tick on every detected beat, plus a
rough BPM — so you can see *why* a beat was missed: the flux never rose, or it rose but
stayed under the threshold. The trace itself is a dev tool and is never saved into a scene.

**The tuning is part of the scene**, not a global setting — so a punchy kick-driven
scene and a hi-hat-driven one can each detect beats their own way, and switching
between them switches the tuning too. It rides along in scenes and in anything you
share, which means a scene you send someone reacts to music the way you set it up.

## Cloud profile

Your scenes live in this browser by default. The **Cloud profile** box is how you get them
off it — sign in with Google and your library follows you between machines.

- **Save to cloud** uploads **your own scenes**, replacing what is stored. It is a straight
  replace, not a merge, so a scene you deleted here is gone from the cloud after the next
  save — there is no leftover copy to come back.
  Scenes you loaded from someone else's collection are **not** uploaded: they are that
  person's to publish, and a copy in your profile would be counted on your gallery card and
  handed on again to whoever loads you. They stay in this browser, and what your profile
  records is simply **which collections you added** — the names, not the work.
  The one exception is **Shared with you**: a scene someone sent you as a link has no
  collection to re-fetch it from, so it saves with your own scenes rather than being lost.
  A follow-list with no scenes of your own still saves — following people is worth syncing
  on its own.
- **Load from cloud** fetches it back and asks whether to **merge** (add them to yours,
  overwriting any of yours with the same name) or **replace** (throw yours away and keep
  only these). Applying reloads the page.
  The collections you follow are fetched fresh at the same time and come back with you, so a
  new machine ends up with your scenes *and* everyone's sets you had added — up to date, not
  as they were when you saved. A collection whose owner has since deleted or unlisted their
  profile is simply skipped and named; the rest still load, and it returns if they do.
  A borrowed scene can never overwrite one of yours on a merge, even with the same name.
- Your **profile name** is yours to pick — click it to rename. It's written with your next
  save.
- **Delete profile** removes everything you have stored, and leaves this browser's scenes
  alone.
- **Sign out** signs out on this device only.

Only the current version is kept — there is no version history, so a save replaces what is
stored and the old copy is gone. Keep anything you might want back as its own scene.

Stored against your account: the profile name you choose, your own scenes, and the names of
the collections you follow. Nothing else — not your email, name or picture, and none of
anyone else's scenes.

**Publish to gallery** is opt-in and off by default. Tick it and your profile is listed
publicly, with your chosen name and how many scenes it holds. **Public scenes** on the ☰
menu opens that list — and it needs no account, so anyone can look. **Load scenes**
adds someone's scenes to your list as **their own collection**, named after them, so your
library is never touched and nothing of yours can be overwritten. Load the same person
again and their set is simply refreshed.

Links still work too, even though there are no longer buttons that make new ones: every
share link and preset-bundle link ever generated still opens, and lands in the same
merge-or-replace dialog, so nothing of yours is ever quietly overwritten.

### What a shared scene does and doesn't carry

A saved scene is a complete copy of the settings: every slider, the palette, the filters,
the camera, the beat chips and pulse shapes, the beat tuning, and any slider bounds
you widened. A few things deliberately stay behind:

- **Render resolution** is yours, not the scene's — otherwise a scene built on a fast
  GPU could bring a laptop or phone to a crawl with no obvious cause.
- **Audio** can't be started for you; browsers require you to click. A beat-reactive
  scene wanders gently until you turn on Capture or Mic — the mic is armed by default,
  but it still waits for your first click and your permission.
- **The random bits stay random** — where a Julia orbit starts (unless you turn off
  Random seed), the chaos game's speckle, and how far into its cycle the animation is.

So a shared scene is the same *configuration*, not the same *frame*. Open the same link
twice and it won't be pixel-identical — that's the demo running, not something broken.

## Credits

On startup the credits appear over whatever is running — each person's role and
name, in the same layout as the **Credits** box in the menu, since both are
generated from the same list. They hold for five seconds, then fade out over
three. They are drawn on their own layer above the visual, so they stay readable
whatever effect and filters you have on (Pixelate and Mirror used to chew them
up), and they ignore the camera and zoom.

That menu box also has a checkbox to stop them appearing on future visits
(remembered in this browser only, and kept out of scenes and share links
since it's a per-browser preference). `?credits=<seconds>` overrides the **hold**
if you want a longer look; the three-second fade is always added on top.

**The scene banner** names what you just landed on, in the top button row beside the mute
button. Every time you switch
scene — by hand, or on the auto-cycle — it names what you just landed on: the scene's
name, then a dash, then the account that made it. Scenes loaded from someone's published
profile are credited to them; your own show your cloud profile name, or just the scene
name if you haven't got one. It holds for two and a half seconds and fades over one and a
half, and on startup it waits politely for the credits to finish rather than talking over
them. Its own checkbox, beside the credits' one, turns it off — also per-browser.

## Running locally

The page that ships is a single self-contained `index.html` with no dependencies —
open it directly in a browser, or serve the folder:

```sh
python -m http.server
# then open http://localhost:8000
```

To work on it, edit `src/` and rebuild — the authoring is split into `src/styles.css`
plus a set of JS slices concatenated in `src/manifest.txt` order:

```sh
node tools/build.js          # regenerate dev-index.html from src/
node tools/build.js --check  # non-zero if dev-index.html is stale
```

`dev-index.html` is the current build (also served live as a preview);
`index.html` is the published page, and a release promotes one to the other. Both are
generated — never hand-edit them. The build script has no dependencies either; there is
no package manager and no test framework, and the checks under `tools/*probe.js` are
plain Node scripts that slice the built file and assert against it. Every release is
tagged and written up in [`CHANGELOG.md`](CHANGELOG.md), which is linked from the foot of
the menu.

## Tech

Vanilla JavaScript, no runtime dependencies, no framework. The per-pixel work (fire
propagation, palette + glow, the fractal escape-times, the raymarched solids and every
filter pass) runs on the GPU via **WebGL2**, with a Canvas2D fallback if WebGL2
is unavailable. The deterministic chaos game stays on the CPU and is drawn as
additive GL points. Hosted on GitHub Pages. Settings persist in `localStorage`.

Cloud profiles are **Firebase Auth + Firestore over plain REST** — no SDK, so the page
stays one self-contained file; the only remote script is Google's sign-in button. The
security boundary is [`firestore.rules`](firestore.rules), checked in so it's reviewable
in a diff rather than living only in a web console. The Firebase web API key in the
source is public by design: it names the project and authorises nothing.

A first-run **"Sync with your music"** nudge explains the Capture/Mic audio
buttons to visitors who haven't tried them yet — shown at three growing gaps of
active time (30s, 5min, 1h), at most three times, never again once an audio
source has been used. A **Google Analytics 4** hook (page views plus custom
events like Capture-button clicks) is active via the `GA_MEASUREMENT_ID`
constant. Clearing that constant back to `""` makes the whole hook inert again —
no script loaded, nothing sent.
