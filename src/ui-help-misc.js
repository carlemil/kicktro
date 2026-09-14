  // ---- help popup: effect-aware explanation of every control ----
  const HELP = {
    intro: "Most sliders are <b>ranged</b>: the two thumbs set a low and a high bound and the live value drifts erratically between them — pinch the thumbs together to hold a constant. With <b>React to music</b> on, each slider's L/M/H chips make it react to low/mid/high beats, and the dropdown beside them picks the <b>pulse shape</b> — how the value animates back down after each hit. Everything is saved in your browser, per stacked layer — bar a shared few that belong to the whole scene: auto-cycle and its timing, the whole-scene (Scene) filters, the render resolution, and whether the menu is open.",
    // Per-effect names/blurbs come from the EFFECTS registry (see renderHelp).
    // Each slider blurb's `w:` tag is matched against the effect's `helpTags`
    // (see the EFFECTS registry). "all" shows on every effect; "band" on every
    // shader effect with a Banding slider; the rest are per-effect tags.
    sliders: [
      { n: "Scenes", w: "all", t: "A saved scene is a named full snapshot — the effect plus every setting. Pick one to load it; from then on any change you make is auto-saved straight back into it. New saves what is on screen as a fresh scene, selects it and turns auto-cycle off so it stays up; Rename renames the selected one; Delete removes it and moves you to the one beside it. One scene is always selected, so every change you make is always being saved into something — if you want to experiment without touching a scene you like, press New first and work on the copy. Open a link somebody sent you and that scene is kept too, in a “Shared with you” group of its own, so it can never overwrite a scene of yours; drop the whole group with its ✕ when you are done with it. Your whole library can be kept against a Google account in the Cloud profile box, and published there for other people to load." },
      { n: "Auto-cycle scenes", w: "all", t: "When on, a random saved scene is applied every so often (see Scene TTL) — it cycles whole scenes, not effects, though a scene switch can change the effect too. Turn off to stay put. Needs at least two saved scenes. Creating a scene or restoring a backup switches it off, so the one you just chose stays on screen." },
      { n: "Scene TTL", w: "all", t: "How long auto-cycle holds each scene: a random time in this range (seconds) before applying a random other one." },
      { n: "Transition", w: "all", t: "How long a scene change takes to blend, as a range in seconds — each switch draws a length from it. A suitable transition is chosen automatically for the two scenes involved: a crossfade between two full-screen effects, something that breaks the picture up (pixelate, blur, wipe) when a sparse point cloud meets a dense field, a dip or flash when the palettes jump, and often nothing at all when the scenes already dissolve on their own through Fire or Fade pixel. Collapse both thumbs to 0 to cut straight over instead." },
      { n: "Effect", w: "all", t: "Which visual is running — the chooser at the top of the Effects section, directly above that effect's own sliders. Switching keeps the scene you have selected and folds the change into it, like any other edit — so you carry on working on your scene. The scene keeps its name, so rename it if it no longer suits. Part of a saved scene, so auto-cycle can switch it for you." },
      { n: "Palette", w: "all", t: "The colour ramp this layer's heat is mapped through — click a swatch to pick it. Per-layer, so stacked effects can each carry their own colours (blended together in perceptual OKLab space when they overlap)." },
      { n: "Reverse colours", w: "all", t: "Runs this layer's palette the other way round — the dark (background) end stays black, so only the lit ramp is flipped. Per-layer." },
      { n: "Background", w: "all", t: "What this layer's unlit pixels (heat 0) show: Black (default), White, or the palette's own colour 0. In a multi-layer scene it's per-layer, so a background layer can wash the scene while the ones above keep a black backdrop." },
      { n: "Palette cycle", w: "all", t: "How long one cross-fade to a random new palette takes, as a range in seconds — each cycle draws a fresh duration from it. Pinch both thumbs to 0 to hold the chosen palette still. Every scene switch also blends the palette rather than snapping to it." },
      { n: "Palette hold", w: "all", t: "How long to rest on each palette before starting the next cross-fade, as a range in seconds — a fresh dwell is drawn each time. At 0 (the default) the colours cross-fade continuously with no pause; raise it to sit on each palette for a while between changes. Only matters while Palette cycle is running." },
      { n: "React to music", w: "all", t: "Capture system/tab audio (e.g. Spotify) or the microphone, split into low/mid/high bands. Arm a slider with its L/M/H chips: while audio is on it stops drifting and instead sits at its low end, snapping to its high end on each beat in that band and dropping back over its Pulse time. Chips glow on the beats that drive them, and each menu row shows a small dot per armed band in the same colour — dim at rest, lit on the beat — so you can see what a scene has wired to the music without opening a single box." },
      { n: "Pulse shape", w: "all", t: "The little dropdown beside each slider's L/M/H chips picks the curve the value follows back down after a beat: Snap (linear, the classic), Pluck (fast percussive drop), Sustain (holds high then falls), Ease (smooth S-curve), Bounce (a few decaying bounces), or Steps (retro quantized). Saved per slider, per effect." },
      { n: "Pulse", w: "all", t: "In a slider's pop-out box: how long that slider's beat kick lasts — the time it takes to fall from its high end back to its low end after a beat (0.2s by default). Short is a tight flick, long is a swell. Saved per slider, per effect." },
      { n: "Pop-out boxes", w: "all", t: "The + beside a slider's name breaks it out into its own box to the right of the menu, with room for its value, beat chips, pulse shape, pulse length and range editor; − puts it back. Each box is titled with what it belongs to — the effect or the filter — so a stack of them stays readable. Pop out several and they queue top-down. The layout is per-session, and clears when you change effect or scene." },
      { n: "Slider range (min / max / step)", w: "all", t: "The Value range section in a slider's pop-out box retunes that slider's own bounds live: min and max are the ends of the slider's travel, step is the drag resolution (0 = continuous), so you can push a control past its shipped limits or make it finer. ↺ restores the shipped range. Custom bounds are saved in your browser, ride along in Share links and go into Backups." },
      { n: "Show box", w: "tetra", t: "Tetrahedron only — ON draws the wireframe box the tetrahedron bounces inside (with a burst of sparks on each wall hit). OFF hides the box and, with no walls to ricochet in, the tetrahedron orbits the centre of the screen instead." },
      { n: "Box size", w: "tetra", t: "Tetrahedron only — zooms the whole scene (box and tetrahedra together). Bigger fills more of the frame; past 1× the box corners run off the edges." },
      { n: "Banding", w: "band", t: "Strength of a filter that posterises the palette into hard light/dark contour stripes." },
      { n: "Band size", w: "band", t: "How many palette colours make up each light (and each dark) stripe." },
      { n: "Darkness", w: "band", t: "How far the dark stripes are darkened (0% = none, 100% = black)." },
      { n: "Points", w: "fire", t: "Chaos-game points stamped per frame — the density and brightness of the fractal seed feeding the fire. Ranged, so spread the thumbs to let the density wander, or arm its L/M/H chips to burst more points on the beat." },
      { n: "Objects", w: "fire", t: "− / + add extra copies of the fractal (up to 6) — the tetrahedra / triangles moving on screen. Each added copy is half the size and half the points of the last, with a new seed, so it drifts/tumbles on its own. (Distinct from the effect stack, also called Layers.)" },
      { n: "Drift speed", w: "fire", t: "Sierpiński: how fast the triangle's three corners wander. Tetrahedron: the physics tempo — how fast it bounces (or orbits, with the box hidden)." },
      { n: "Size", w: "fire", t: "Scales the fractal itself about its centre — Sierpiński's triangle or the Tetrahedron's solid (which grows/shrinks with matching physics). Separate from Zoom, which scales the whole view." },
      { n: "Rotation", w: "tetra", t: "Tetrahedron only — the yaw rate in degrees per second for the scene's rotation about the box. It defaults to 0 (held still); spread the two thumbs to let it drift, or set one thumb to a constant spin." },
      { n: "Box nod", w: "tetra", t: "Tetrahedron only — how far the view pitches up and down in its slow sine, in degrees. This is the second, slower drift that used to be built in with no control at all; 0 holds the box dead level." },
      { n: "Nod speed", w: "tetra", t: "Tetrahedron only — how fast that nod swings, as a multiplier; 0 freezes it mid-swing. Drift speed scales it too, so a faster scene nods faster." },
      { n: "Sway", w: "tetra", t: "Tetrahedron only, and only with Show box OFF — how far the whole object wanders up/down, sideways and in/out around the centre on a slow looping path (0 pins it to the centre so it just spins in place). Each stacked Object wanders on its own phase. The tempo follows Drift speed; arm its L/M/H chips to lunge on the beat." },
      { n: "Zoom", w: "all", t: "Scales the whole view in and out." },
      { n: "Camera X / Y / Z", w: "all", t: "Tilt and spin this layer in 3D, in degrees. X and Y rock it away from you; Z rolls it in the plane of the screen. Per-layer, like Zoom — each stacked effect keeps its own camera, applied to that layer before the layers are blended (in a one-layer scene it's simply the camera over what's running). The startup credits deliberately ignore it and stay level." },
      { n: "Filters", w: "all", t: "A stack of post-effects, all OFF by default — tick the ones you want. Every one is PER-LAYER: each layer keeps its own chain, listed in the order it runs, so two layers can be filtered completely differently before they blend. Where a filter sits in that list matters — above the line it shapes the heat before the effect draws, below it repaints the finished picture — so dragging one across the line changes what it does. Fire and Fade pixel feed back into the layer, building up over successive frames; the rest are single passes. Ticking one reveals its own sliders. Without WebGL the GPU-only ones are greyed out." },
      { n: "Fire", w: "all", t: "The classic rising-fire feedback: heat drifts upward and cools each frame, so whatever the effect draws sprouts flames. Flame rise sets how tall they climb before fading (linear in height); Burn rate how many simulation steps run per second — faster is livelier and flickerier." },
      { n: "Fade pixel", w: "all", t: "Keeps a fraction of the previous frame instead of clearing it, leaving motion trails. Lifetime near 100% smears almost forever; lower values fade quickly. Stacks with Fire." },
      { n: "Pixelate", w: "all", t: "Chunks the image into blocks. Block sets the size — a direct route to a lo-fi console look." },
      { n: "Hex pixelate", w: "all", t: "The same idea on a honeycomb: the picture snaps to hexagons instead of squares. Cell sets the size. Hexes read as a deliberate screen where squares read as low resolution, so it suits organic effects (plasma, aurora, the ocean) far better than Pixelate does." },
      { n: "CRT phosphor", w: "all", t: "The rest of the television, beside Scanlines and Barrel. Mask lays RGB shadow-mask triads over the picture the way a real tube's aperture grille does, and Beam bleed smears each scanline horizontally — asymmetrically, trailing to the right, because that is the direction the beam sweeps. Phosphor persistence is deliberately not here: a post filter sees one finished frame and has no memory of the last one, so stack Fade pixel above the line if you want the afterglow." },
      { n: "Blur / sharpen", w: "all", t: "One kernel doing both: negative Amount blurs, positive sharpens, 0 is off. Radius sets how far it reaches, so a wide soft blur and a tight crisp edge come from the same pass." },
      { n: "Edge", w: "all", t: "Edge detection over the finished image — Amount fades between the original and the outlines it finds." },
      { n: "Posterize", w: "all", t: "Crushes the colours to a fixed number of Levels, turning smooth gradients into flat bands." },
      { n: "Mirror", w: "all", t: "Reflects the image about its centre. Axis picks horizontal, vertical or both (kaleidoscope-style quadrants)." },
      { n: "Bloom", w: "all", t: "The additive glow around the brightest areas. Per-layer like every other filter, so each layer can glow by a different amount — or not at all. Off by default; add it to a layer's chain and raise Strength." },
      { n: "Cardioid RPM", w: "julia", t: "How fast the seed orbits the big cardioid loop, in revolutions per minute." },
      { n: "Inner : outer ratio", w: "julia", t: "A small circle rides on the seed; this is how many turns it makes per big-loop lap (a spirograph gear ratio). It reshapes the fractal's fine filigree." },
      { n: "Inner radius", w: "julia", t: "Size of the small circle that rides on the seed. Small values keep the seed just outside the cardioid (intricate fractals); larger ones swing it wider and can dip inside for solid-blob frames." },
      { n: "Outer radius", w: "julia", t: "Scale of the big cardioid loop the seed traces. Larger values push the whole orbit outward, further clear of the set, which keeps the fractal intricate rather than solid. Burning Ship ships this high (1.4-1.9) for exactly that reason — wind it down and it washes out faster than the others do." },
      { n: "Cardioid debug", w: "julia", t: "Opens the fractal set this effect's seed is riding — the Mandelbrot set, or the matching Multibrot set once Multibrot's Power is above 2 — with the orbit drawn on top: the full seed cardioid, the path the seed actually traces at the current ratio and radii, the small riding circle and the live seed point. Use it to see where the Cardioid RPM / ratio / radius / start settings put the seed: right at the frontier gives intricate fractals, too far inside gives solid blobs. It floats rather than blocking the menu, so you can drag the sliders and watch the orbit redraw." },
      { n: "Cardioid X offset", w: "julia", t: "Slides the whole seed orbit left or right along the real axis (0 = the Mandelbrot cardioid's own position). Negative walks it toward the bulbs and the spike; positive pushes it out past the cusp. Use Cardioid debug to see where it lands." },
      { n: "Cardioid start", w: "julia", t: "A fixed offset added to the seed's position around the cardioid, in laps (0 and 1 are the same point, 0.5 is halfway round)." },
      { n: "Random seed each reload", w: "julia", t: "When on, the fractal opens from a fresh random spot on the cardioid every page load and each time you switch to this effect. Turn off for a fixed, reproducible starting frame. Applies to all three cardioid-seeded effects (Julia, Burning Ship, Multibrot)." },
      { n: "Speed", w: "plasma", t: "How fast the plasma's waves animate. 0 freezes the field." },
      { n: "Scale", w: "plasma", t: "Spatial frequency of the waves — how fine or coarse the interference pattern is." },
      { n: "Warp", w: "plasma", t: "Domain warp: bends the waves into swirls. 0 = clean straight interference; higher = turbulent." },
      { n: "Fly speed", w: "tunnel", t: "Tunnel only — how fast you fly down the pipe toward the vanishing point (0 freezes)." },
      { n: "Twist", w: "tunnel", t: "Tunnel only — how fast the pipe rotates around you; negative spins the other way." },
      { n: "Ring density", w: "tunnel", t: "Tunnel only — how many rings are packed along the depth of the tunnel." },
      { n: "Ball count", w: "meta", t: "Metaballs only — how many blobs (2–16). Spread the thumbs to make the count pulse." },
      { n: "Ball size", w: "meta", t: "Metaballs only — each blob's radius; bigger blobs merge into larger gooey masses." },
      { n: "Ball speed", w: "meta", t: "Metaballs only — how fast the blobs drift along their paths (0 freezes them)." },
      { n: "Gain", w: "meta", t: "Metaballs only — overall field strength: raises the threshold so blobs fill more of the screen." },
      { n: "Segments", w: "kaleido", t: "Kaleidoscope only — how many mirror wedges the plane is folded into (the order of symmetry)." },
      { n: "Spin", w: "kaleido", t: "Kaleidoscope only — how fast the whole mandala rotates; negative spins the other way." },
      { n: "Flow", w: "kaleido", t: "Kaleidoscope only — how fast the underlying pattern animates inside the wedges (0 freezes it)." },
      { n: "Rotation", w: "roto", t: "Rotozoomer only — spin rate of the tiled plane; negative spins the other way." },
      { n: "Zoom pulse", w: "roto", t: "Rotozoomer only — how much the tile scale breathes in and out over time (0 holds a fixed zoom)." },
      { n: "Tile density", w: "roto", t: "Rotozoomer only — how many grid cells fill the plane (fine vs coarse texture)." },
      { n: "Munch speed", w: "xor", t: "Munching squares only — how fast the XOR pattern churns (0 freezes a still frame)." },
      { n: "Square size", w: "xor", t: "Munching squares only — the pixel-block size; bigger blocks read as chunkier retro squares." },
      { n: "Detail", w: "xor", t: "Munching squares only — the bit mask the value wraps at; higher = finer nested detail." },
      { n: "Ring frequency", w: "moire", t: "Moiré only — how tightly packed the concentric rings are; higher = finer, more shimmer." },
      { n: "Drift speed", w: "moire", t: "Moiré only — how fast the two ring centres wander over each other (0 holds still)." },
      { n: "Blend", w: "moire", t: "Moiré only — fades the two ring sets between multiply (0, dark webs) and add (1, bright overlaps)." },
      { n: "Root spin", w: "newton", t: "Newton only — rotates the whole basin structure; negative spins the other way." },
      { n: "Relaxation", w: "newton", t: "Newton only — the Newton step size (1 = standard). Away from 1 warps and swirls the basin boundaries." },
      { n: "Power", w: "multibrot", t: "Multibrot only — the exponent in z^power + c, a whole number. 2 is the Julia set; step up for more symmetric bulbs (3, 4, …). It also sets the shape of the seed orbit: the cardioid gains a cusp per step, and the seed sprints through each cusp and slows between them." },
      { n: "Bar count", w: "copper", t: "Copper bars only — how many horizontal bars slide up and down (1–12)." },
      { n: "Bar speed", w: "copper", t: "Copper bars only — how fast the bars bob on their sine paths (0 holds them still)." },
      { n: "Bar width", w: "copper", t: "Copper bars only — the thickness of each gradient bar." },
      { n: "Point jitter", w: "attractor", t: "Attractor only — scatters each plotted point by up to this many pixels, softening the map's hard threads into something more alive. The de Jong map is exact, so 0 gives the bare, razor-thin curves." },
      { n: "Coeff a", w: "attractor", t: "Attractor only — the a coefficient of the de Jong map; one of the four shape knobs. Arm its L/M/H chips to morph on the beat." },
      { n: "Coeff b", w: "attractor", t: "Attractor only — the b coefficient of the de Jong map." },
      { n: "Coeff c", w: "attractor", t: "Attractor only — the c coefficient of the de Jong map." },
      { n: "Coeff d", w: "attractor", t: "Attractor only — the d coefficient of the de Jong map." },
      { n: "Count", w: "solids", t: "Bouncing solids only — how many bodies share the room, up to 8. Each one is a different primitive (see Shape mix) with its own start position, heading and tumble, so they never move as a group." },
      { n: "Size", w: "solids", t: "Bouncing solids only — how big the bodies are. This is also the radius the physics bounces on, so larger solids turn away from the walls sooner and crowd the room; push it far enough and they barely have anywhere to go." },
      { n: "Shape mix", w: "solids", t: "Bouncing solids only — how many different primitives are in play, in order: sphere, box, doughnut, capsule, octahedron, cylinder. 1 gives a room of spheres, 6 gives one of each cycling through the bodies. Arm its L/M/H chips to swap the whole cast on the beat." },
      { n: "Speed", w: "solids", t: "Bouncing solids only — how fast the bodies travel, and so how often they hit a wall. 0 freezes them mid-air, still lit and still spinning down." },
      { n: "Tumble", w: "solids", t: "Bouncing solids only — how fast the bodies rotate. A wall impact converts sideways travel into roll, so an angled clip visibly kicks a body into a tumble; this scales all of that. 0 holds every solid at a fixed orientation." },
      { n: "Edge glow", w: "solids", t: "Bouncing solids only — lights the silhouettes, brightest where a surface turns away from you. Low values give flat shaded solids; high values outline every body in fire and read almost like an X-ray." },
      { n: "Shock", w: "all", t: "The Shockwave filter's wave itself: 1 puts the ring at the centre, 0 has it gone off the edge — so the value IS the ring's position. Arm its L/M/H chips and every beat snaps it to the high thumb and lets it fall, firing a wave that crosses the screen in one Trigger duration." },
      { n: "Push", w: "all", t: "How hard the Shockwave ring displaces the picture as it passes — 0 is an invisible wave, high values shove pixels aside like a blast front." },
      { n: "Ring width", w: "all", t: "How thick and soft the Shockwave ring is, from a hairline ripple to a broad swell." },
      { n: "Cell density", w: "sun", t: "Sun surface only — how many convection cells fill the screen. Low values give a few huge granules; high values a fine boiling texture like the telescope footage." },
      { n: "Churn speed", w: "sun", t: "Sun surface only — how fast the cells boil: drift, deform and brighten or dim. 1× gives each granule a lifetime of roughly 15–30 seconds; 0 freezes the surface." },
      { n: "Lane width", w: "sun", t: "Sun surface only — how wide and soft the dark lanes between cells are. Low values give hairline cracks; high values fat dark borders that shrink the bright cells." },
      { n: "Brightness", w: "sun", t: "Sun surface only — scales the whole surface up or down the palette. Lower it to sit the cells deeper in the ramp's oranges; raise it to push the centres toward white heat." },
      { n: "Bars", w: "kefrens", t: "Kefrens bars only — how many ribbons weave down the screen, up to 12." },
      { n: "Sway", w: "kefrens", t: "Kefrens bars only — how far the ribbons wander sideways. High values whip them across the full width." },
      { n: "Speed", w: "kefrens", t: "Kefrens bars only — how fast the ribbons weave. 0 freezes the tangle." },
      { n: "Bar width", w: "kefrens", t: "Kefrens bars only — how fat each ribbon is. Thin bars read as threads, fat ones as overlapping silk." },
      { n: "Columns", w: "twister", t: "Twister only — how many columns stand side by side, up to three, each turning out of phase with its neighbours." },
      { n: "Width", w: "twister", t: "Twister only — how fat the column is (and how far apart multiple columns stand)." },
      { n: "Twist", w: "twister", t: "Twister only — how hard the column is wrung along its height. 0 is an untwisted turning bar; negative reverses the wring." },
      { n: "Speed", w: "twister", t: "Twister only — how fast the column turns. 0 holds it still, faces frozen mid-twist." },
      { n: "Mode", w: "chladni", t: "Cymatics only — the standing wave's mode number. Every value has its own figure; drift the two thumbs apart for continuous morphing, or arm the L/M/H chips and the figure snaps to a new symmetry on the beat." },
      { n: "Mode offset", w: "chladni", t: "Cymatics only — offsets the second wave's mode from the first. 0 is fully symmetric; raising it skews the figure into rectangular patterns." },
      { n: "Sharpness", w: "chladni", t: "Cymatics only — how thin the sand lines are. Low is a soft glow around the nodes, high is a fine engraved line figure." },
      { n: "Shimmer", w: "chladni", t: "Cymatics only — a slow tremble in the plate, so the sand lines breathe instead of standing perfectly still." },
      { n: "Strike", w: "storm", t: "Lightning storm only — the strike itself: 1 is a fresh bolt at full brightness, decaying to darkness at 0. Arm its L/M/H chips and every beat fires a NEW bolt that fades over the Trigger duration — the storm plays the drums." },
      { n: "Rate", w: "storm", t: "Lightning storm only — automatic strikes per second, for a storm that rolls without music. 0 leaves firing entirely to the Strike chips." },
      { n: "Strike speed", w: "storm", t: "Lightning storm only — how fast a fresh bolt races from the cloud to the ground, in screen-heights per second. Low values let you watch the hot tip crawl down and the branches catch light; high ones flash the whole bolt at once." },
      { n: "Bolts", w: "storm", t: "Lightning storm only — how many bolts each strike throws down at once, up to five." },
      { n: "Afterglow", w: "storm", t: "Lightning storm only — how much each strike lights the sky behind it, and how much ambient glow remains between strikes." },
      { n: "Power", w: "bulb", t: "Mandelbulb only — the exponent in z → z^p + c, continuously variable. 8 is the classic bulb; low values melt it toward a sphere, high values bristle it with fine lobes, and fractional values morph between forms — drift the two thumbs apart and it never stops reshaping." },
      { n: "Detail", w: "bulb", t: "Mandelbulb only — how many fractal iterations the surface gets. More is crisper and more filigreed, and costs GPU directly." },
      { n: "Orbit speed", w: "bulb", t: "Mandelbulb only — how fast the camera flies its lap through the inside of the bulb, winding about the polar axis while it rises and falls. 0 parks it, still inside." },
      { n: "Glow", w: "bulb", t: "Mandelbulb only — rim lighting on the walls plus a halo where a ray only just misses the surface. High values fill the canyons with fire." },
      { n: "Arms", w: "galaxy", t: "Galaxy only — how many spiral arms the disc has. 2 is the common grand-design spiral, 1 gives a single sweeping arm, and higher counts give the flocculent many-armed look. Arm its L/M/H chips and the galaxy restructures on the beat." },
      { n: "Twist", w: "galaxy", t: "Galaxy only — how tightly the arms wind. An arm is a straight line in log-radius, so this is that line's slope: low values sweep the arms out into a barred, open spiral, high values wind them into a nearly circular ring. It is the single biggest change to the galaxy's character." },
      { n: "Spin", w: "galaxy", t: "Galaxy only — how fast the disc turns. The arms TRAIL, as real spiral arms do: their tips lag behind the direction of travel. What rotates is the spiral pattern rather than the stars themselves — a density wave — with a slow shear over it, which is what keeps the arms from winding themselves out of existence the way a true inner-faster rotation would within a minute. Negative runs it backwards, so the arms lead; unphysical, and there if you want it. 0 holds the disc still." },
      { n: "Core", w: "galaxy", t: "Galaxy only — how bright and dense the central bulge burns. 0 leaves a bare disc with no centre to it; higher values pile a tight ball of stars into the middle that blows out to white through the palette." },
      { n: "Scatter", w: "galaxy", t: "Galaxy only — how far stars stray from their arm. Low values give hard, almost drawn-on arms; high values dissolve them into a general disc where the spiral is only just readable. The scatter widens outward, so the core stays tight either way." },
      { n: "Corners", w: "poly", t: "Polypinski only — how many corners the chaos game jumps between, 3 to 24, all on the surface of one sphere. 3 is a triangle, 4 a tetrahedron, and past that the shape depends entirely on where Seed put them." },
      { n: "Seed", w: "poly", t: "Polypinski only — which roll of the dice places the corners on the sphere. The same seed always gives the same formation, so when one looks good, note the number." },
      { n: "Jump", w: "poly", t: "Polypinski only — how far each step goes toward the chosen corner. 0.5 is the Sierpiński rule for 3 or 4 corners; higher values shrink each copy so a crowd of corners stops overlapping and the structure opens up, lower values fill the ball in." },
      { n: "Wiggle", w: "poly", t: "Polypinski only — how far each corner wanders about its home on the sphere. 0 holds the formation rigid (only the tumble moves), 1 lets the corners roam the whole ball." },
      { n: "Wiggle speed", w: "poly", t: "Polypinski only — how fast the corners wander and the solid tumbles. 0 freezes both." },
      { n: "Frequency ratio", w: "harmo", t: "Harmonograph only — how many times the fast pendulum swings per swing of the slow one, and so which figure the pen draws. Whole numbers give the closed classical forms (2 a figure-of-eight, 3 a trefoil, and so on); the values in between give the open weaving ones. Drift the two thumbs and it walks through the whole family." },
      { n: "Detune", w: "harmo", t: "Harmonograph only — how far the paired pendulums are out of tune with each other, and the trick the whole machine rests on. At exactly 0 the curve closes and retraces its own line forever, so you get a bare wire figure; a hair off zero and each lap misses the last by a little, the figure precesses, and the accumulated near-misses are what make it a woven ribbon rather than a line." },
      { n: "Damping", w: "harmo", t: "Harmonograph only — how fast the pendulums die away. Low values let the pen spiral a long way inward, filling a broad figure; high values kill the swing quickly and draw a small tight knot. Real harmonographs ran down in a minute or two — this is that dial." },
      { n: "Morph speed", w: "harmo", t: "Harmonograph only — how fast the four pendulum phases drift apart. They move at unrelated rates, so the figure never returns to a pose it has held before. 0 freezes one drawing." },
      { n: "Balls", w: "vballs", t: "Vector balls only — how many spheres are in the formation, up to 48. The arrangement rebuilds around the count, so changing it is not just adding: a Lattice re-sizes its cube, a Sphere re-spaces its shell. Arm its L/M/H chips and the whole constellation rebuilds on the beat." },
      { n: "Formation", w: "vballs", t: "Vector balls only — how the balls are arranged: Lattice (a cube of them), Sphere (an even Fibonacci-spaced shell), Ring (a tilted circle) or Helix (a double strand). The set is rigid and turns as one body, so the shape only reads from how the balls occlude and shade one another — which is exactly how the Amiga original worked." },
      { n: "Ball size", w: "vballs", t: "Vector balls only — how fat each sphere is. Small keeps them clearly separate points of light; wind it up and neighbours overlap until the formation reads as one lumpy solid." },
      { n: "Tumble", w: "vballs", t: "Vector balls only — how fast the constellation turns. It yaws and pitches at different rates, so it never repeats a pose. 0 holds it still." },
      { n: "Edge glow", w: "vballs", t: "Vector balls only — lights the rim of each sphere where its surface turns away from you. Low is flat shading, high outlines every ball and the formation reads as a cloud of bright shells." },
      { n: "Field of view", w: "all", t: "How wide a lens this layer is seen through. It works the way the Camera X/Y/Z sliders do — by moving where each pixel takes its colour from — so it costs nothing and applies to every shader effect: positive pushes the sample outward with the square of the radius, which is a fisheye that bows the middle out and drags the corners in; negative pulls it in, which is a telephoto that flattens the frame. 0 is the normal lens. Drift the two thumbs and the whole layer breathes in and out. It is per LAYER, so one layer can bulge while another stays flat. The point effects (Sierpński, Trees, Boids and the rest) get it too, through the inverse of the same curve — they stamp a position rather than sampling one, so the lens has to be run backwards for them, which is what makes a stamped layer and a shader layer bow the SAME way at the same setting. A wide lens pulls a stamped picture in from the corners, so expect dark edges where a shader effect would simply show you more; a long one folds the far field away entirely and those points are dropped, which is what being outside the frame means." },
      { n: "Share one 3D world", w: "all", t: "Traces this layer's geometry TOGETHER with every other layer that has it ticked, as one scene, instead of drawing it on its own. Tick it on an Ocean and a Glass ball and the balls really sit in the water: the water is reflected and refracted through them, they are reflected back in it, each hides the other where it should, and there is a real waterline across them. **Ocean, Glass ball, Bouncing solids, Quaternion Julia and Vector balls** can join, one layer of each per world. The ones you fly INSIDE (Mandelbulb, Menger sponge, Doughnut) never can — they put the camera in their own geometry, so they have nowhere to stand in anyone else's. Only the Glass ball traces reflections of its own; the others are there to be seen in it and to block it. Each layer keeps its own palette, so the water seen inside the ball is tinted like the ball; that is deliberate, and it is the same rule the rest of the app follows. The camera comes from the lowest layer that has joined — its Camera X/Y/Z, Zoom and Field of view now move the whole world." },
      { n: "Place X", w: "all", t: "Where this layer's geometry stands in the shared world, left to right. The world is the Ocean's: the water is at height 0 and the camera floats above it looking out to sea." },
      { n: "Place Y", w: "all", t: "How high this layer's geometry stands in the shared world. 0 is the waterline — set it low and a ball is half submerged, with the surface cutting across it and its reflection right beneath." },
      { n: "Place Z", w: "all", t: "How far out to sea this layer's geometry stands. Near objects are big and steeply lit; far ones sit toward the horizon where the water is most reflective, so that is where a mirror image reads most strongly." },
      { n: "World scale", w: "all", t: "How big this layer's geometry is in the shared world. It scales the whole arrangement, not one object, so the balls spread apart as they grow." },
      { n: "Pitch", w: "qjulia", t: "Quaternion Julia only — tips the solid forward or back, in degrees. Together with Yaw and Roll this is how you turn the object itself; it matters most in the shared 3D world, where the camera is fixed and these are the only way to see another side of it." },
      { n: "Yaw", w: "qjulia", t: "Quaternion Julia only — turns the solid about its vertical axis, in degrees." },
      { n: "Roll", w: "qjulia", t: "Quaternion Julia only — rolls the solid about the line of sight, in degrees." },
      { n: "Tumble X", w: "qjulia", t: "Quaternion Julia only — a steady rotation rate about the pitch axis, on top of the fixed angle. Set two or three of these to different values and the solid tumbles rather than spins. Negative runs backwards, 0 holds it." },
      { n: "Tumble Y", w: "qjulia", t: "Quaternion Julia only — a steady rotation rate about the yaw axis. Unlike Orbit speed, which swings the camera around the object (and moves the object when the camera is shared), this turns the object on its own axis." },
      { n: "Tumble Z", w: "qjulia", t: "Quaternion Julia only — a steady rotation rate about the roll axis." },
      { n: "Balls", w: "glass", t: "Glass ball only — how many spheres are in the air. Each drifts on its own pair of clocks, so they pass through each other's reflections rather than orbiting in formation." },
      { n: "Material", w: "glass", t: "Glass ball only. **Metal** is an opaque mirror — you see only what is behind you. **Glass** refracts the scene through both surfaces, so the layer underneath appears inside the ball, shrunk and turned over. **Bubble** is a thin shell: it barely bends what is behind it, but the rim rings bright. Metal reads best over a busy layer, Glass over a big simple one." },
      { n: "Refraction", w: "glass", t: "Glass ball only — how dense the glass is (its index of refraction). Around 1.05 is barely more than air and the scene passes almost straight through; 1.45 is real glass; past 2 the whole picture is squeezed into a bright knot at the centre of the ball. Only Glass and Bubble use it — Metal never lets a ray in." },
      { n: "Edge glow", w: "glass", t: "Glass ball only — how hard the rim lights up where the surface turns away from you. That grazing brightening is what makes a sphere read as a sphere rather than as a flat disc, so a little of it is worth keeping even on Metal." },
      { n: "Trees", w: "trees", t: "Trees only — how many trunks stand in the row. They are spread across the frame and each is seeded differently, so they lean and gust out of step with one another rather than moving as one." },
      { n: "Depth", w: "trees", t: "Trees only — how many times the tree splits. This is where the filigree comes from, and it is also the expensive slider: the branch count is Splits to the power of Depth, so a deep 4-way tree is millions of segments. The depth is quietly clamped to whatever keeps the total drawable, which is why very deep 3- and 4-way trees stop getting finer." },
      { n: "Splits", w: "trees", t: "Trees only — how many branches come off each joint. 2 is the classic Y-forked tree, 3 and 4 give a denser, more shrub-like crown — and cost far more, so they reach less depth before the budget stops them." },
      { n: "Branch angle", w: "trees", t: "Trees only — how wide each fork opens, in degrees. Narrow angles give a tall poplar; wide ones splay the crown out flat. Drift the two thumbs and the whole canopy opens and closes." },
      { n: "Taper", w: "trees", t: "Trees only — how much shorter each generation of branch is than its parent. Low values give a stubby tree with a thick trunk and twigs that vanish almost at once; high values a wispy one whose branches barely shorten, so the detail is spread evenly out to the tips. The tree is scaled to fit the frame either way, so this changes its proportions rather than its size." },
      { n: "Sway", w: "trees", t: "Trees only — the wind strength. The bend is added at every joint, so it accumulates out along each branch: the trunk hardly moves and the tips whip, the way a real tree does. **Arm this slider's L/M/H chips and the trees gust on the beat** — that is what makes them sway in time with the music." },
      { n: "Wind speed", w: "trees", t: "Trees only — how fast the wind cycles. Each branch carries its own phase, so the gust travels through the canopy instead of every twig moving together. 0 freezes the trees mid-bend." },
      { n: "Ring radius", w: "torus", t: "Doughnut only — how big the doughnut is, measured to the centre of the tube. Small values bend the tunnel hard, so the wall closes off the view a short way ahead and the flight feels fast and tight; large values straighten the pipe out and you can see a long way down it." },
      { n: "Tube radius", w: "torus", t: "Doughnut only — how wide the pipe is around you. The camera's wander scales with it, so this changes how close the wall gets without ever letting you touch it." },
      { n: "Twist", w: "torus", t: "Doughnut only — how many extra turns the flutes make in one lap of the doughnut, so it winds the grooves into a spiral. Whole numbers only, and deliberately: the pattern has to close on itself after a full lap or there would be a seam running down the tunnel. 0 leaves the grooves running straight, and negative winds them the other way." },
      { n: "Flutes", w: "torus", t: "Doughnut only — how many lengthwise grooves are cut into the pipe. 0 is a smooth tube; higher counts give it a fluted, organ-pipe cross-section that the Twist can then spiral. Whole numbers, for the same reason Twist is." },
      { n: "Swell", w: "ocean", t: "Ocean only — how big the sea is. It scales the surface normals rather than the height, so raising it steepens every face at once: the glint gets sharper, the foam breaks earlier, and the water goes from a lazy roll to a heavy sea." },
      { n: "Wave height", w: "ocean", t: "Ocean only — how tall the swell actually stands, in world units. This is real geometry, not shading: the surface is intersected ray by ray, so raising it makes crests hide the troughs behind them and breaks up the horizon line. It is capped short of the camera height — a sea taller than the viewpoint would put you underwater." },
      { n: "Reflection", w: "ocean", t: "Ocean only — how strongly the water mirrors what is around it: the layer underneath, or — if the Ocean has joined the shared 3D world — a real traced reflection of the other objects in it. Up to 1 it behaves like water, weighted by Fresnel so it concentrates toward the horizon; ABOVE 1 it lifts toward a flat mirror, which is there because a camera this close to the surface sees the near sea too steeply for the physical amount to show. Put the Ocean on top of another layer and that layer appears in the water, concentrated toward the horizon the way a real reflection is: water is a mirror at a glancing angle and nearly clear straight down. With nothing beneath it there is nothing to reflect and this does nothing. What comes back is brightness, so the reflection is tinted by the water's own palette." },
      { n: "Chop", w: "ocean", t: "Ocean only — how peaked the crests are. Each wave train is a sine raised to this power, so 1 is a bland sine swell with rounded tops, and higher values keep the troughs round while drawing the crests up to a point — which is what real water does. Drift the two thumbs and the sea builds and lays down again." },
      { n: "Speed", w: "torus", t: "Doughnut only — how fast the flight runs along the tube. Negative flies it backwards, and 0 parks you inside, still looking down the pipe." },
      { n: "Glow", w: "torus", t: "Doughnut only — grazing light on the wall, brightest where the surface turns away from you. High values light the far bend before you reach it." },
      { n: "Speed", w: "ocean", t: "Ocean only — how fast the waves travel. Each octave runs a little faster than the one below, so the small chop skitters across the big swell. 0 freezes the surface mid-wave." },
      { n: "Foam", w: "ocean", t: "Ocean only — the threshold a crest has to pass before it breaks white: high water and a steep face together. Low values leave the whole sea flecked, high values keep it to the biggest crests only." },
      { n: "Wind", w: "ocean", t: "Ocean only — the direction the swell runs, in degrees. Turning it swings the whole sea, and because the octaves fan out from it the interference pattern changes too rather than just rotating." },
      { n: "Tilt", w: "bhole", t: "Black hole only — how high above the disk plane the camera sits. Low angles are the iconic view: the disk is nearly edge-on, so the light from its far side is bent up over the top of the shadow and back under the bottom, closing a ring round the darkness. Wind it high and you are looking down on a plain flat ring with the lensing barely visible." },
      { n: "Disk size", w: "bhole", t: "Black hole only — how far out the accretion disk extends. Small keeps a tight bright annulus hugging the shadow; large spreads a broad faint disk across the frame. The inner edge is fixed where the last stable orbit is." },
      { n: "Disk speed", w: "bhole", t: "Black hole only — how fast the disk turns. It orbits Keplerian, so the inner ring always shears past the outer one and the turbulence never repeats however long you watch. 0 freezes the pattern (the lensing and the beaming stay)." },
      { n: "Beaming", w: "bhole", t: "Black hole only — relativistic Doppler beaming: the side of the disk rotating toward you is boosted and the side going away is dimmed, which is why one limb is far brighter than the other. 0 gives an evenly lit disk, which reads as wrong once you have seen the real thing." },
      { n: "Orbit speed", w: "bhole", t: "Black hole only — how fast the camera circles the hole. 0 parks it. Slow is best: the lensed arcs change shape as the viewing angle turns." },
      { n: "Slice", w: "qjulia", t: "Quaternion Julia only — the 4D set is cut to a 3D solid before it can be drawn, and this is where that cut falls along the fourth axis. 0 is the natural slice; move it either way and the solid melts through a continuous family of shapes, shedding and growing whole limbs. Spread the two thumbs and it never stops changing; arm its L/M/H chips and the beat jumps it to a new form." },
      { n: "Cut angle", w: "qjulia", t: "Quaternion Julia only — rotates the cutting plane itself, rather than sliding it. At 0° the solid is cut the usual way; wind it round and the real axis is traded for the fourth one, so the same 4D object is sighted along a different direction entirely and shows cross-sections the Slice slider alone never reaches. Pairs well with Slice: spread one and pin the other." },
      { n: "Detail", w: "qjulia", t: "Quaternion Julia only — how many iterations the distance estimate runs. More is crisper and more filigreed, and costs GPU directly." },
      { n: "Orbit speed", w: "qjulia", t: "Quaternion Julia only — how fast the camera circles the solid, with a slow nod built in. 0 parks it." },
      { n: "Glow", w: "qjulia", t: "Quaternion Julia only — silhouette lighting plus a halo where a ray only just misses the surface. High values wrap the whole thing in fire." },
      { n: "Variation", w: "flames", t: "Fractal flames only — the nonlinear fold applied to every step of the chaos game: Sinusoidal, Spherical, Swirl, Horseshoe, Polar or Disc. Each is a different family of shapes; Spherical and Swirl are the classic flame looks." },
      { n: "Morph speed", w: "flames", t: "Fractal flames only — how fast the underlying maps' coefficients orbit, morphing the flame through its family of shapes. 0 freezes the form." },
      { n: "Point glow", w: "flames", t: "Fractal flames only — how much heat every landing point ADDS. Flames accumulate density instead of stamping a fixed heat, so this sets how quickly the dense heart burns toward white." },
      { n: "Star density", w: "stars", t: "Starfield only — how thick the star traffic is across all six parallax depths." },
      { n: "Fly speed", w: "stars", t: "Starfield only — how fast you fly through the field. 0 parks the ship; the stars just twinkle." },
      { n: "Warp", w: "stars", t: "Starfield only — hyperspace: every star smears into a radial streak. Arm its L/M/H chips and the kick punches to warp, easing back as the pulse decays." },
      { n: "Twinkle", w: "stars", t: "Starfield only — how much the stars shimmer. 0 is a steady field." },
      { n: "Curtains", w: "aurora", t: "Aurora only — how many light curtains hang in the sky, up to five, each wandering on its own." },
      { n: "Sway", w: "aurora", t: "Aurora only — how far the whole sky bends the curtains as they hang." },
      { n: "Speed", w: "aurora", t: "Aurora only — how fast the display moves: the wander, the sway and the shimmer all scale with it." },
      { n: "Shimmer", w: "aurora", t: "Aurora only — how restless the light inside each curtain is." },
      { n: "Feed", w: "rd", t: "Reaction-diffusion only — how fast chemical U is replenished. With Kill it chooses the regime: spots, stripes, coral, mazes. Arm its chips and the beat pushes the culture into a new pattern family." },
      { n: "Kill", w: "rd", t: "Reaction-diffusion only — how fast chemical V dies off. Tiny nudges against Feed cross into whole new pattern families." },
      { n: "Sim speed", w: "rd", t: "Reaction-diffusion only — chemistry steps per frame. More is faster evolution, not a different pattern." },
      { n: "Brightness", w: "rd", t: "Reaction-diffusion only — scales the culture up or down the palette ramp." },
      { n: "Rule", w: "ca", t: "Cellular automata only — which birth/survival rule the grid runs: Life, HighLife, Day & Night, Seeds, Maze or Coral. Changing it re-seeds the grid." },
      { n: "Cells", w: "ca", t: "Cellular automata only — how many cells across the grid is. Fewer is chunkier; more is finer and busier." },
      { n: "Speed", w: "ca", t: "Cellular automata only — generations per second." },
      { n: "Rain", w: "ca", t: "Cellular automata only — the chance each dead cell is born anyway, every generation, so the grid never settles. Arm its chips and each beat is a shower of new cells." },
      { n: "Trail", w: "ca", t: "Cellular automata only — how many generations a dead cell takes to fade out. 0 is a hard blink." },
      { n: "Dive speed", w: "menger", t: "Menger sponge only — how fast the camera drives the streets of the lattice. 0 parks at the kerb." },
      { n: "Roll", w: "menger", t: "Menger sponge only — the slow barrel roll (and vertical bob) of the drive." },
      { n: "Detail", w: "menger", t: "Menger sponge only — fractal recursion depth. Each step cubes the holes and multiplies the GPU cost." },
      { n: "Glow", w: "menger", t: "Menger sponge only — lights the tunnel walls and haloes the near-misses." },
      { n: "Flock", w: "boids", t: "Boids only — how many birds fly, up to 200." },
      { n: "Speed", w: "boids", t: "Boids only — how fast the flock flies. Scattering birds also fly faster while Scatter is raised." },
      { n: "Cohesion", w: "boids", t: "Boids only — how strongly the birds pull toward their neighbours. Low is a loose drift, high a tight wheeling ball." },
      { n: "Scatter", w: "boids", t: "Boids only — a rising value blasts the flock apart from its centre (the fall regathers it). Arm its L/M/H chips and every beat is a hawk." },
      { n: "Sunspot", w: "sun", t: "Sun surface only — sinks a sunspot into the centre: a near-black core (the umbra) ringed by fine bright and dark filaments radiating outward (the penumbra) that fade into the granulation. 0, the default, is a clean surface; higher values grow the spot. The camera sliders move it off-centre." },
    ],
  };
  const helpEl = el("help");
  // The help panel is rebuilt from scratch on every open (four different openers below), so
  // its wrapper and close button are one string rather than four copies that drift. It is a
  // MODAL dialog — backdrop, click-outside-closes — hence aria-modal and the focus trap that
  // showHelp arms. The h2 carries the id aria-labelledby points at; every opener writes one.
  const HELP_HEAD = '<div class="help-box" role="dialog" aria-modal="true" aria-labelledby="help-title">'
    + '<button class="help-close" type="button" aria-label="Close">×</button>';
  // The one place the help panel becomes visible, so the trap can never be armed by three
  // openers out of four.
  function showHelp() {
    helpEl.classList.remove("hidden");
    dlgModal(helpEl.querySelector(".help-box"));
  }
  function renderHelp() {
    const e = EFFECTS[effect];
    const rel = HELP.sliders.filter(s => e.helpTags.includes(s.w));   // which slider blurbs apply to this effect
    let html = HELP_HEAD;
    html += '<h2 id="help-title">Kicktro — ' + e.name + "</h2><p>" + e.help + "</p>";
    html += '<p class="help-intro">' + HELP.intro + '</p><dl class="help-cols">';
    for (const s of rel) html += "<dt>" + s.n + "</dt><dd>" + s.t + "</dd>";
    html += "</dl></div>";
    helpEl.innerHTML = html;
  }
  function openHelp() { renderHelp(); showHelp(); }
  function closeHelp() {
    const box = helpEl.querySelector(".help-box");
    helpEl.classList.add("hidden");
    dlgRelease(box);
  }
  // The per-box ? — reuses the same modal as the panel help, but focused on one slider:
  // its own blurb (a filter param uses the filter's description; an effect control matches
  // its HELP entry, disambiguated by the live effect's tags — "Drift speed" and "Rotation"
  // each mean two different things), then the shared note on how a slider box works.
  function ctlHelpBlurb(key) {
    const label = ctlLabel(key);
    const f = FILTERS.find(x => Array.isArray(x.params) && x.params.includes(key));
    if (f) return { owner: "Filter · " + f.name, body: f.help || "" };
    const tags = (EFFECTS[effect] && EFFECTS[effect].helpTags) || [];
    const cands = HELP.sliders.filter(s => s.n === label || s.n.split(" / ")[0] === label);
    const s = cands.find(x => tags.includes(x.w)) || cands[0];
    // -1: the help dialog describes the CONTROL, not one layer's copy of it, so it takes the
    // owner line without the "L2 ·" prefix the pop-out boxes carry.
    return { owner: ctlOwner(-1, key), body: s ? s.t : "" };
  }
  const RANGE_BLURB = () => (HELP.sliders.find(s => s.n === "Slider range (min / max / step)") || {}).t || "";
  // The range blurb no longer rides every control's ? — the Value range section carries
  // its own ? (openRangeHelp below), so the per-control dialog stays about the control.
  function openCtlHelp(key) {
    const { owner, body } = ctlHelpBlurb(key);
    let html = HELP_HEAD;
    html += '<h2 id="help-title">' + ctlLabel(key) + "</h2>";
    if (owner) html += '<p class="help-owner">' + owner + "</p>";
    if (body) html += "<p>" + body + "</p>";
    html += '<p class="help-intro">' + HELP.intro + "</p>";
    html += "</div>";
    helpEl.innerHTML = html;
    showHelp();
  }
  // The Value range section's own ? (see makeRangeEditor).
  function openRangeHelp() {
    const rb = RANGE_BLURB();
    helpEl.innerHTML = HELP_HEAD
      + '<h2 id="help-title">Value range</h2>' + (rb ? "<p>" + rb + "</p>" : "") + "</div>";
    showHelp();
  }
  el("help-btn").addEventListener("click", openHelp);
  // The Scenes ? — what a saved scene actually stores. It is a COMPLETE snapshot
  // (snapshotScene / stackItemOut) nesting three scopes: scene-wide, the per-layer stack,
  // and a selected-effect copy that also serves single-layer scenes. Reuses the help modal.
  function openPresetHelp() {
    const tree =
      "<b>scene</b>                     <i>everything on screen — snapshotScene()</i>\n" +
      "├─ name\n" +
      "├─ effect                  <i>the SELECTED layer's effect (a stable name)</i>\n" +
      "├─ state·beat·pulse·plen   <i>selected effect's copy (single-layer fallback)</i>\n" +
      "├─ extra                   <i>…its palette / seed / filters</i>\n" +
      "├─ <b>beatTune</b>  { fluxK, floor, refract, bands }\n" +
      "├─ <b>ranges</b>    { slider min/max/step }   <i>scene-wide bounds</i>\n" +
      "└─ <b>layers[ ]</b>                 <i>the stack, draw order (omitted if 1 layer)</i>\n" +
      "   └─ layer  { effect, state, beat, pulse, plen,\n" +
      "               <b>cam</b> { zoom, camrx, camry, camrz },\n" +
      "               palette, paletteRev, paletteBg,\n" +
      "               seedPath, seedRide, seedPts,\n" +
      "               ranges, filters, blend, gain, mute }";
    let html = HELP_HEAD;
    html += '<h2 id="help-title">What a scene saves</h2>';
    html += "<p>A saved scene is a <b>complete snapshot of what is on screen</b> — the effect stack plus every setting — portable enough to hand to someone else. It nests three scopes of state.</p>";
    html += '<pre class="help-tree">' + tree + "</pre>";
    html += "<dl>";
    html += "<dt>Scene-wide — one per scene</dt><dd>The beat-detector tuning and the scene-wide slider bounds.</dd>";
    html += "<dt>Per-layer — the stack</dt><dd>Each layer keeps its own effect, slider values, beat wiring, <b>camera</b> (zoom + X/Y/Z, in its own <code>cam</code>), palette, cardioid orbit, its <em>own</em> slider bounds, filters, and how it blends into the stack (blend / gain / mute).</dd>";
    html += "<dt>Selected-effect copy</dt><dd>The top-level effect and its values describe the selected layer — the whole story for a one-layer scene (its camera rides inside that <code>state</code>), and a fallback for a stack (which a one-layer scene omits entirely, so it stays byte-identical to how scenes were stored before stacking).</dd>";
    html += "</dl>";
    html += '<p class="help-intro">Effects are stored as stable names, not positions, so reordering or removing one never corrupts a saved scene. Deliberately <b>not</b> saved: the render resolution, audio on/off, and the running animation phase — a saved scene is the same <em>configuration</em>, not the same <em>frame</em>. Your cloud profile carries the whole library of them; a share link carries just the one.</p>';
    html += "</div>";
    helpEl.innerHTML = html;
    showHelp();
  }
  el("preset-help-btn").addEventListener("click", openPresetHelp);
  helpEl.addEventListener("click", e => { if (e.target === helpEl || e.target.classList.contains("help-close")) closeHelp(); });

  // ---- version + release-notes link (panel footer) ----
  // Filled in from CONFIG.version so the version string exists in exactly ONE place; the
  // /deploy skill bumps it there and writes the matching CHANGELOG.md section. The href is
  // set here too rather than hardcoded in the HTML, so both come from CONFIG.
  // Guarded: a missing node must not throw during startup and take the whole panel with it.
  {
    const vn = el("vernum"), vl = el("verlink");
    if (vn) vn.textContent = "v" + CONFIG.version;
    if (vl) {
      vl.href = CONFIG.changelogUrl;
      vl.title = "Kicktro v" + CONFIG.version + " — what changed in this and previous releases";
      vl.addEventListener("click", () => track("release_notes_open", { version: CONFIG.version }));
    }
  }

  // ---- analytics (Google Analytics 4) ----
  // Live: GA_MEASUREMENT_ID (CONFIG.analyticsId) holds a real "G-XXXXXXXXXX" web-stream
  // id, so gtag.js loads, page views are counted automatically and track() fires custom
  // events. Clearing it back to "" makes this completely inert again — no script is
  // loaded and track() becomes a no-op, so nothing is sent.
  const GA_MEASUREMENT_ID = CONFIG.analyticsId;
  function track(name, params) {
    try { if (window.gtag) window.gtag("event", name, params || {}); } catch (e) {}
  }
  (function initAnalytics() {
    if (!GA_MEASUREMENT_ID) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID);
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_MEASUREMENT_ID;
    document.head.appendChild(s);
  })();

  // ---- "Sync with your music" nudge ----
  // Shown only to users who haven't successfully started an audio source, at three
  // growing gaps of *active* (tab-visible) time — 30s, then 5min, then 1h — and
  // never more than three times, ever. State persists across reloads.
  const SYNC_KEY = "burnTheWeb.sync.v1";   // FROZEN PREFIX: the old app name. Renaming the key orphans existing data.
  const SYNC_DELAYS = CONFIG.sync.delays;
  let syncState = { shows: 0, sinceLast: 0, used: false };
  try {
    const s = JSON.parse(localStorage.getItem(SYNC_KEY) || "null");
    if (s && typeof s === "object") syncState = { shows: s.shows | 0, sinceLast: s.sinceLast | 0, used: !!s.used };
  } catch (e) {}
  function saveSync() { try { localStorage.setItem(SYNC_KEY, JSON.stringify(syncState)); } catch (e) {} }
  // Put the first nudge a full delay away again. Called by the tutorial when it closes, so
  // reading the tour never eats into the thirty seconds of scene that is supposed to come
  // before anyone is asked to share their audio. A function declaration, because the caller
  // is in a LATER slice and this must not be reached through the tutorial's own state.
  function syncResetDelay() { syncState.sinceLast = 0; saveSync(); }

  const syncPop = el("syncpop");
  function hideSyncPopup() {
    syncPop.classList.add("hidden");
    dlgRelease(syncPop.querySelector(".sync-box"));
  }
  function dismissSync() { hideSyncPopup(); track("sync_popup_dismiss"); }
  // Escape's route in. Guarded on being open, because the key handler fires on every Escape
  // press whether or not the nudge is up, and an unguarded dismissSync would post a
  // sync_popup_dismiss event each time — analytics for a popup nobody was shown.
  function dismissSyncIfOpen() { if (!syncPop.classList.contains("hidden")) dismissSync(); }
  function syncWhy(msg) {
    const n = el("sync-why");
    if (!n) return;
    n.textContent = msg || "";
    n.hidden = !msg;
  }
  // OPENED BY A CLICK, not by the timer. Deliberately NOT showSyncPopup: that one spends one
  // of the three showings a visitor ever gets and posts sync_popup_shown, and neither is right
  // for a dialog the user asked for by touching a control. Same dialog, same buttons -- the
  // one the startup nudge shows -- with a line at the top saying what prompted it.
  function openAudioDialog(why) {
    if (tutorialOpen()) return false;
    syncWhy(why);
    syncPop.classList.remove("hidden");
    dlgModal(syncPop.querySelector(".sync-box"));
    track("audio_dialog_opened", { why: why ? "trigger" : "manual" });
    return true;
  }
  // A BEAT TRIGGER TOUCHED WITH NO AUDIO RUNNING does nothing at all, and nothing on screen
  // says why: the chips light, the slider sits still, and the feature reads as broken. So say it.
  //
  // IT DOES NOT BLOCK THE CLICK. Arming chips, picking a pulse shape and setting per-slider
  // thresholds are all scene data you can legitimately author before turning audio on -- a
  // modal that swallowed the click would make authoring a beat-reactive scene impossible
  // without a microphone. The click goes through; this only explains.
  //
  // Once per page load. Authoring a scene means touching these controls dozens of times, and
  // a dialog on every one of them would be a slideshow. `audioLive()` (not audio.on) so a
  // MUTED source counts as off -- muted is exactly the state where nothing moves.
  let audioHintShown = false;
  {
    const brk = el("breakout");
    if (brk) brk.addEventListener("click", e => {
      if (audioHintShown || audioLive()) return;
      const t = e.target;
      if (!t || !t.closest || !t.closest(".bandchips, .trig-body")) return;
      audioHintShown = true;
      openAudioDialog("Beat triggers need a live audio source \u2014 with audio off, arming a slider "
        + "stores the setting but nothing will move. Turn one on below and it starts reacting.");
    });
  }
  // Returns whether it actually opened, and the caller only spends one of the three
  // allowed showings when it did. That is not pedantry: a refusal that still incremented
  // `shows` would silently use up a nudge nobody saw, and with only three ever, two
  // refusals leave one.
  function showSyncPopup() {
    // Never over the tutorial. The interval below already holds its counter while the tour
    // is up, so this is belt and braces — but it is the important half: dlgModal
    // deliberately releases any existing trap before arming its own, so a nudge opening on
    // top would take the keyboard and leave the tutorial visible underneath and dead.
    if (tutorialOpen()) return false;
    syncWhy("");                      // the TIMED nudge has no reason to give
    syncPop.classList.remove("hidden");
    // This one opens on a TIMER, not on a click, so taking focus is a real interruption — but
    // it is a full-screen modal that has already taken the pointer, and leaving the keyboard
    // behind the backdrop is worse: you would be tabbing through controls you cannot see.
    dlgModal(syncPop.querySelector(".sync-box"));
    track("sync_popup_shown", { shows: syncState.shows + 1 });
    return true;
  }
  function markAudioUsed() {          // a source is live — satisfy the nudge permanently
    if (!syncState.used) { syncState.used = true; saveSync(); }
    hideSyncPopup();
  }
  el("sync-close").addEventListener("click", dismissSync);
  el("sync-later").addEventListener("click", dismissSync);
  syncPop.addEventListener("click", e => { if (e.target === syncPop) dismissSync(); });
  el("sync-capture").addEventListener("click", () => { track("sync_popup_capture"); startAudio("capture"); });
  el("sync-mic").addEventListener("click", () => { track("sync_popup_mic"); startAudio("mic"); });

  if (!syncState.used && syncState.shows < 3) {
    const syncTimer = setInterval(() => {
      if (syncState.used || syncState.shows >= 3) { clearInterval(syncTimer); return; }
      if (document.hidden) return;              // only count time while the tab is visible
      if (tutorialOpen()) return;               // ...and not while the tutorial has the screen
      syncState.sinceLast += 1000;
      if (syncState.sinceLast >= SYNC_DELAYS[syncState.shows] && showSyncPopup()) {
        syncState.shows += 1;
        syncState.sinceLast = 0;
        if (syncState.shows >= 3) clearInterval(syncTimer);
      }
      saveSync();
    }, 1000);
  }
