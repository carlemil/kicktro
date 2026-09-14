  // ---- effect registry: the single source of truth for each effect. Adding an
  // effect = append a descriptor here. (Phase 0 holds metadata — name/subtitle/help
  // and the default-preset name; dispatch, controls and persistence move here next.)
  // `name` is the dropdown/help name; `presetName` (optional) is the default preset's
  // name when it differs. Order = the current numeric effect index.
  // Fields per descriptor: `params` = the ordered control keys this effect shows
  // (rendered from the CONTROLS schema; setEffect toggles their visibility);
  // `helpTags` = which HELP.sliders `w:` tags apply; `draw(dt)` = a shader effect that
  // writes heat directly (its presence routes frame() away from the fire sim);
  // `fractal2d` = fire-sim effect stamps the 2D chaos game (else the 3D tetra);
  // `bakesOwnZoom` = zoom is baked into the shader so display zoom is forced to 1;
  // `onEnter()` = run on switching to this effect.
  const EFFECTS = [
    { id: "sirpinfyer", name: "Sierpiński", subtitle: "Sierpiński triangle · classic fire",
      help: "A 2D Sierpiński triangle drawn by the chaos game — repeatedly jump halfway toward a random one of three slowly drifting corners — stamped as fresh heat into a classic rising-fire buffer.",
      params: ["points", "layers", "speed", "size", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold"], helpTags: ["all", "fire"], fractal2d: true, bakesOwnZoom: true,
      defaults: { palcycle: [0, 0], palhold: [0, 0], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], speed: [22, 22], rise: [52, 52], zoom: [1, 1], size: [1, 1], rot: [0, 0], layers: 3, rpm: [0.03, 0.03], ratio: [21.5, 21.5], inrad: [0.03, 0.03], outrad: [1.05, 1.05], phase: [0, 0], points: [3850, 3850] },
      beat: {}, extras: { palette: "7", morph: false, showBox: true, randSeed: true } },
    { id: "tetrafyer", name: "Tetrahedron", subtitle: "Sierpiński tetrahedron · classic fire",
      help: "A 3D Sierpiński tetrahedron, a rigid body under real physics whose four tumbling corners seed the same fire. With Show box on it bounces inside an invisible box, bursting a sphere of sparks on each wall hit; with the box off there are no walls, so it orbits the centre of the screen instead. Objects stacks more tetrahedra, each smaller and moving on its own. Two rotations turn the view: Rotation yaws it (0 by default — spread the thumbs to drift) and Box nod pitches it up and down in a slow sine (Nod speed sets how fast).",
      params: ["showbox", "boxsize", "points", "layers", "speed", "size", "rot", "nod", "nodspd", "sway", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold"], helpTags: ["all", "fire", "tetra"], bakesOwnZoom: true,
      defaults: { palcycle: [0, 0], palhold: [0, 0], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], speed: [23, 23], rise: [105, 105], zoom: [1, 1], size: [1.75, 1.75], rot: [0, 0], nod: [17.2, 17.2], nodspd: [1, 1], sway: [0.5, 0.5], boxsize: [4, 4], layers: 3, rpm: [0.03, 0.03], ratio: [21.5, 21.5], inrad: [0.03, 0.03], outrad: [1.05, 1.05], phase: [0, 0], points: [1500, 1500] },
      beat: {}, extras: { palette: "1", morph: false, showBox: false, randSeed: true } },
    { id: "animejulia", name: "Julia", subtitle: "Julia set · animated seed",
      help: "A live Julia set. The seed point c orbits the rim of the Mandelbrot cardioid; each pixel's escape time is coloured through the palette.",
      params: ["rpm", "ratio", "inrad", "outrad", "phase", "cardx", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim", "randseed"], helpTags: ["all", "julia", "band"],
      bakesOwnZoom: true, cardioid: true, onEnter: () => reseedJulia(), draw: dt => { const s = juliaSeed(dt); if (useGL) glJulia(s); else julia(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], speed: [92, 92], rise: [130, 130], zoom: [1, 1], size: [1, 1], rot: [0, 0], layers: 1, rpm: [0.28, 0.28], ratio: [8.5, 8.5], inrad: [0.03, 0.03], outrad: [1, 1], phase: [0, 0], cardx: [0, 0], points: [1500, 1500] },
      beat: {}, extras: { palette: "5", morph: false, showBox: true, randSeed: true } },
    { id: "plasma", name: "Plasma", subtitle: "Plasma · sinusoidal interference",
      help: "An old-school plasma: several sine/cosine waves interfere across the screen and animate over time, coloured through the palette. Add banding for classic hard contour stripes.",
      params: ["pspeed", "pscale", "pwarp", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "plasma", "band"],
      bakesOwnZoom: true, draw: dt => { if (useGL) glPlasma(plasmaSeed(dt)); else plasma(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], zoom: [1, 1], pspeed: [0.5, 0.5], pscale: [0.9, 0.9], pwarp: [0.4, 0.4] },
      beat: {}, extras: { palette: "3", morph: false, showBox: true, randSeed: true } },
    { id: "tunnel", name: "Tunnel", subtitle: "Tunnel · demoscene flythrough",
      help: "A classic demoscene tunnel: the screen is polar-mapped so concentric rings rush toward the vanishing point. Fly speed drives you forward; Twist rotates the pipe.",
      params: ["tunspeed", "tuntwist", "tunrings", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold"], helpTags: ["all", "tunnel"], bakesOwnZoom: true,
      draw: dt => { const s = tunnelSeed(dt); if (useGL) glShaderDraw("tunnel", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uTwist, s.twist); gl.uniform1f(u.uRings, s.rings); gl.uniform1f(u.uZoom, s.zoom); }); else tunnel(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], tunspeed: [0.6, 0.6], tuntwist: [0.1, 0.1], tunrings: [8, 8], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "0", morph: false, showBox: true, randSeed: true } },
    { id: "metaballs", name: "Metaballs", subtitle: "Metaballs · gooey blobs",
      help: "Blobby fields that merge and split like lava-lamp goo — a sum of inverse-square fields from moving centres, soft-saturated. Turn up Banding for hard iso-contour shells.",
      params: ["mbcount", "mbradius", "mbspeed", "mbgain", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "meta", "band"], bakesOwnZoom: true,
      draw: dt => { const s = metaSeed(dt); if (useGL) glShaderDraw("metaball", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uCount, s.count); gl.uniform1f(u.uRadius, s.radius); gl.uniform1f(u.uGain, s.gain); gl.uniform1f(u.uZoom, s.zoom); }); else metaballs(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], mbcount: [5, 5], mbradius: [0.16, 0.16], mbspeed: [0.6, 0.6], mbgain: [0.8, 0.8], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "2", morph: false, showBox: true, randSeed: true } },
    { id: "burningship", name: "Burning Ship", subtitle: "Burning Ship · fractal",
      help: "The Burning Ship fractal — like the Julia set but each step folds the value to |Re·Im|, giving jagged, architectural, flame-like structures. The seed orbits the Mandelbrot cardioid exactly like Julia, so it shares those controls.",
      params: ["rpm", "ratio", "inrad", "outrad", "phase", "cardx", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim", "randseed"], helpTags: ["all", "julia", "band"],
      // `locus: "ship"` — the Orbit editor's backdrop. This effect folds Re·Im to its absolute
      // value, so the set of seeds that give a connected fractal is the Burning Ship set, not
      // the Mandelbrot set the other two cardioid effects share. Without this the editor drew
      // the seed comfortably outside a set it was in fact well inside. It does NOT change the
      // seed path, which still rides the Mandelbrot main cardioid on purpose (see CLAUDE.md).
      bakesOwnZoom: true, cardioid: true, locus: "ship", onEnter: () => reseedJulia(),
      draw: dt => { const s = juliaSeed(dt); if (useGL) glShaderDraw("burning", u => { gl.uniform2f(u.uC, s.cx, s.cy); gl.uniform2f(u.uSpan, s.spanX, s.spanY); }); else burningShip(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], zoom: [0.5, 0.5], rpm: [0.2, 0.2], ratio: [8.5, 8.5], inrad: [0.15, 0.15], outrad: [1.4, 1.4], phase: [0, 0], cardx: [0, 0] },
      beat: {}, extras: { palette: "0", morph: false, showBox: true, randSeed: true } },
    { id: "kaleidoscope", name: "Kaleidoscope", subtitle: "Kaleidoscope · mirrored symmetry",
      help: "A moving field folded into mirror-symmetric wedges, like looking down a kaleidoscope. Segments sets the symmetry, Spin rotates the whole thing, Flow animates the pattern. Add banding for sharp mandala rings.",
      params: ["ksegments", "krotspeed", "knoisespeed", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "kaleido", "band"], bakesOwnZoom: true,
      draw: dt => { const s = kaleidoSeed(dt); if (useGL) glShaderDraw("kaleido", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uSeg, s.seg); gl.uniform1f(u.uRot, s.rot); gl.uniform1f(u.uZoom, s.zoom); }); else kaleidoscope(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], ksegments: [6, 6], krotspeed: [0.1, 0.1], knoisespeed: [0.6, 0.6], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "5", morph: false, showBox: true, randSeed: true } },
    { id: "rotozoom", name: "Rotozoomer", subtitle: "Rotozoomer · rotate + zoom",
      help: "The classic Amiga rotozoomer: a tiled grid texture spun and pulse-zoomed in real time. Rotation sets the spin, Zoom pulse the breathing scale, Tile density how fine the grid is.",
      params: ["rzrot", "rzzoom", "rztile", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "roto", "band"], bakesOwnZoom: true,
      draw: dt => { const s = rotozoomSeed(dt); if (useGL) glShaderDraw("rotozoom", u => { gl.uniform1f(u.uAngle, s.angle); gl.uniform1f(u.uScale, s.scale); gl.uniform1f(u.uTile, s.tile); gl.uniform1f(u.uZoom, s.zoom); }); else rotozoom(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], rzrot: [0.2, 0.2], rzzoom: [0.3, 0.3], rztile: [3, 3], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "7", morph: false, showBox: true, randSeed: true } },
    { id: "munch", name: "Munching Squares", subtitle: "Munching squares · XOR pattern",
      help: "The hypnotic PDP-1 classic: each pixel is ((x XOR y) + time) masked to a value, mapped through the palette. Munch speed animates it, Square size sets the pixel chunkiness, Detail the wrap.",
      params: ["xorspeed", "xorscale", "xormask", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold"], helpTags: ["all", "xor"], bakesOwnZoom: true,
      draw: dt => { const s = munchSeed(dt); if (useGL) glShaderDraw("munch", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uScale, s.scale); gl.uniform1f(u.uMask, s.mask); gl.uniform1f(u.uZoom, s.zoom); }); else munch(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], xorspeed: [12, 12], xorscale: [0.35, 0.35], xormask: [255, 255], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "5", morph: false, showBox: true, randSeed: true } },
    { id: "moire", name: "Moiré", subtitle: "Moiré · interference shimmer",
      help: "Two sets of concentric rings drift over each other and interfere into shimmering moiré bands. Ring frequency sets how tight the rings are, Drift speed how fast the centres move, Blend fades between multiply and add.",
      params: ["mofreq", "modrift", "momix", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "moire", "band"], bakesOwnZoom: true,
      draw: dt => { const s = moireSeed(dt); if (useGL) glShaderDraw("moire", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uFreq, s.freq); gl.uniform1f(u.uMix, s.mix); gl.uniform1f(u.uZoom, s.zoom); }); else moire(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], mofreq: [8, 8], modrift: [0.6, 0.6], momix: [0.3, 0.3], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "1", morph: false, showBox: true, randSeed: true } },
    { id: "newton", name: "Newton", subtitle: "Newton fractal · root basins",
      help: "The Newton fractal: each pixel is coloured by which root of z³−1 Newton's method converges to, plus how many steps it took, giving three interlocking basins with fractal borders. Root spin rotates it; Relaxation warps the convergence.",
      params: ["nwspin", "nwrelax", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "newton", "band"], bakesOwnZoom: true,
      draw: dt => { const s = newtonSeed(dt); if (useGL) glShaderDraw("newton", u => { gl.uniform1f(u.uSpin, s.spin); gl.uniform1f(u.uRelax, s.relax); gl.uniform1f(u.uZoom, s.zoom); }); else newton(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], nwspin: [0.05, 0.05], nwrelax: [0.9, 0.9], zoom: [0.8, 0.8], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "5", morph: false, showBox: true, randSeed: true } },
    { id: "multibrot", name: "Multibrot", subtitle: "Multibrot · power sweep",
      help: "The Multibrot family: z^power + c, with the seed orbiting the cardioid like Julia (so it shares those controls). Power now sweeps CONTINUOUSLY — whole numbers give the classic sets (each adds a bulb of symmetry), and the fractions in between morph one into the next, with a characteristic straight seam ray where the fractional exponent's branch cut lies. The seed rides a blend of the two neighbouring whole-power cardioids, sprinting through the cusps and easing off between them.",
      params: ["mbexp", "rpm", "ratio", "inrad", "outrad", "phase", "cardx", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim", "randseed"], helpTags: ["all", "julia", "band", "multibrot"],
      bakesOwnZoom: true, cardioid: true, onEnter: () => reseedJulia(),
      // juliaPower BEFORE juliaSeed: the orbit must ride this frame's power, not the last one's.
      draw: dt => { juliaPower = mbPower; const s = juliaSeed(dt); if (useGL) glShaderDraw("multibrot", u => { gl.uniform2f(u.uC, s.cx, s.cy); gl.uniform2f(u.uSpan, s.spanX, s.spanY); gl.uniform1f(u.uPower, mbPower); }); else multibrot(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], mbexp: [2, 2], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], zoom: [1, 1], rpm: [0.15, 0.15], ratio: [8.5, 8.5], inrad: [0.03, 0.03], outrad: [1, 1], phase: [0, 0], cardx: [0, 0] },
      beat: {}, extras: { palette: "4", morph: false, showBox: true, randSeed: true } },
    { id: "copperbars", name: "Copper Bars", subtitle: "Copper bars · raster sine bars",
      help: "The Amiga copper-bar effect: horizontal gradient bars sliding up and down on sine motion. Bar count, Bar speed and Bar width shape them; the Copper palette gives them their metallic sheen.",
      params: ["cbcount", "cbspeed", "cbwidth", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "copper", "band"], bakesOwnZoom: true,
      draw: dt => { const s = copperSeed(dt); if (useGL) glShaderDraw("copper", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uCount, s.count); gl.uniform1f(u.uWidth, s.width); gl.uniform1f(u.uZoom, s.zoom); }); else copperbars(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], cbcount: [5, 5], cbspeed: [0.6, 0.6], cbwidth: [0.08, 0.08], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "3", morph: false, showBox: true, randSeed: true } },
    { id: "attractor", name: "Attractor", subtitle: "Strange attractor · de Jong",
      help: "A de Jong strange attractor — millions of points from x'=sin(a·y)−cos(b·x), y'=sin(c·x)−cos(d·y) stamped into the fire. The four coefficients a/b/c/d are the shape knobs; nudge them (or arm their L/M/H chips) and the delicate threads morph. Points sets the density, Flame rise the glow. The map is exact, so Point jitter scatters each point a little to soften the threads — set it to 0 for the bare, hard-edged curves.",
      params: ["ata", "atb", "atc", "atd", "atjit", "points", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold"], helpTags: ["all", "attractor"], bakesOwnZoom: true,
      stamp: (xL, xR, yT, yB, n) => attractorStamp(xL, xR, yT, yB, n),
      defaults: { palcycle: [0, 0], palhold: [0, 0], ata: [1.3, 1.3], atb: [-2.4, -2.4], atc: [2.3, 2.3], atd: [-2.2, -2.2], atjit: [0.5, 0.5], points: [6000, 6000], rise: [130, 130], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], speed: [10, 10], size: [1, 1], rot: [0, 0], layers: 1 },
      beat: {}, extras: { palette: "7", morph: false, showBox: true, randSeed: true } },
    // ---- Geometric shapes (SDF shader effects; append-only for id stability) ----
    { id: "physarum", name: "Slime mould", subtitle: "Physarum · agents that build networks",
      help: "Thousands of agents, each doing one stupid thing: look ahead-left, ahead and ahead-right at the trail everyone has left behind, turn toward whichever smells strongest, step forward and deposit a little more. Nothing instructs them to build anything — the veins, the loops, the junctions and the pruning are all EMERGENT, which is why it looks alive in a way a particle system never does. **Sense** is how far ahead they look (the single biggest change in character: short gives fine felted mats, long gives bold highways), Turn how sharply they can steer, Trail life how long a deposit survives — low starves the network back to wandering, high lets it set into a permanent map. Agents is the population. Try a Fade or Fire filter over it. **Scatter** is what keeps it alive. With it at 0 the culture solves its dish and stops \u2014 the veins reinforce themselves, every agent follows the strongest trail it can find, and after a few seconds you are looking at a static diagram. Scatter adds a little noise to each agent\u2019s heading every step, so they wander off the veins, start branches that sometimes take and usually do not, and the network keeps reorganising instead of settling. Low values give a network that breathes and drifts; high ones tear it apart faster than it can form, which is its own look. **Agent size** is how big a mark each agent leaves, measured in trail cells rather than in pixels — the trail is a fixed grid while the picture follows your window, so at 1 the marks are one cell across and just touch each other whatever the screen size. Below 1 the network breaks up into the dot grid it used to draw; above 1 the veins thicken and run together.",
      params: ["phcount", "phsense", "phturn", "phdecay", "phscatter", "phsize", "phspeed", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold"],
      helpTags: ["all"], bakesOwnZoom: true, physarum: true,
      stamp: (xL, xR, yT, yB, n) => physarumStamp(xL, xR, yT, yB, n),
      defaults: { palcycle: [0, 0], palhold: [0, 0], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], speed: [10, 10], size: [1, 1], rot: [0, 0], layers: 1, points: [2000, 2000],
        phcount: [2500, 2500], phsense: [9, 9], phturn: [0.5, 0.5], phdecay: [0.88, 0.88], phscatter: [0.3, 0.3], phsize: [1, 1], phspeed: [1, 1] },
      beat: {}, extras: { palette: "11", morph: false } },
    { id: "curl", name: "Curl flow", subtitle: "Curl noise · divergence-free particles",
      help: "Particles carried by the CURL of a noise field. That matters: a curl field is divergence-free, so the flow can swirl and braid but can never pile particles up or drain a region empty — which is exactly what happens if you drag points along a plain noise gradient instead, and why this reads as smoke or water rather than as dots sliding downhill. **Field scale** sets how big the eddies are, Flow how fast, Lifetime how long a particle lives before it is respawned somewhere new (short keeps the whole field being explored, long lets long filaments draw themselves). Pairs naturally with a Fade pixel filter for streaks.",
      params: ["cucount", "cuscale", "cuspeed", "culife", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold"],
      helpTags: ["all"], bakesOwnZoom: true, curl: true,
      stamp: (xL, xR, yT, yB, n) => curlStamp(xL, xR, yT, yB, n),
      defaults: { palcycle: [0, 0], palhold: [0, 0], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], speed: [10, 10], size: [1, 1], rot: [0, 0], layers: 1, points: [3000, 3000],
        cucount: [900, 900], cuscale: [2.2, 2.2], cuspeed: [1, 1], culife: [2.5, 2.5] },
      // SHIPS WITH Fade pixel, and it has to. The heat buffer is rewritten every frame, so
      // without retention you see one tick's stamps -- and because a curl field is
      // divergence-free it never clumps, which means those stamps are an even scatter no
      // matter how good the flow is. The structure IS the path, so the path has to persist.
      // Measured the other way first: at 3000 particles with no filter it rendered as static
      // noise and looked broken.
      beat: {}, extras: { palette: "12", morph: false, filters: ["fade"] } },
    // halfRes: rendered at half resolution and upsampled (glShaderDraw) -- the march is
    // the app's most expensive shader and the picture has no edge that survives 2px.
    { id: "clouds", name: "Volumetric clouds", halfRes: true, subtitle: "Clouds · marched participating media",
      help: "Real volume: the ray does not look for a surface, it integrates DENSITY along its length and lets light through according to how much it has already passed — which is why the clouds have depth and a lit side rather than being a flat noise field. Every other 3D effect here answers *where does this ray stop*; this one answers *how much did it collect on the way*. **Cover** is how much of the sky is filled (low leaves scattered wisps, high closes it over), Scale the size of the formations, Detail the octaves (and most of the cost), Sun how hard the light falls off through the depth — turn it down for flat overcast, up for towering lit banks. Drift moves the field past you.",
      params: ["clcover", "clscale", "cloct", "cllight", "clspeed", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "band"], bakesOwnZoom: true,
      draw: dt => { const s = cloudsSeed(dt); if (useGL) glShaderDraw("clouds", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uCover, s.cover); gl.uniform1f(u.uScale, s.scale); gl.uniform1f(u.uOct, s.oct); gl.uniform1f(u.uLight, s.light); gl.uniform1f(u.uZoom, s.zoom); }); else clouds(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], clcover: [0.55, 0.55], clscale: [1.1, 1.1], cloct: [4, 4], cllight: [1, 1], clspeed: [1, 1] },
      beat: {}, extras: { palette: "10", morph: false } },
    { id: "godray", name: "God rays", subtitle: "God rays · volumetric light shafts",
      help: "Shafts of light thrown through gaps in a drifting occluder — the beams you see when sun comes through cloud or a window. It is built by stepping from every pixel back TOWARD the source and asking what blocked the way, so the shadow is cast through the AIR rather than onto a surface. **Reach** is how far a shaft travels before it fades (the single most important knob — near 1 the beams cross the whole frame), Brightness how strong they are, Cloud scale the size of the gaps they come through, Spread how wide the fan opens.",
      params: ["grdecay", "grweight", "grscale", "grspread", "grspeed", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "band"], bakesOwnZoom: true,
      draw: dt => { const s = godraySeed(dt); if (useGL) glShaderDraw("godray", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uDecay, s.decay); gl.uniform1f(u.uWeight, s.weight); gl.uniform1f(u.uScale, s.scale); gl.uniform1f(u.uSpread, s.spread); gl.uniform1f(u.uZoom, s.zoom); }); else godray(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], grdecay: [0.96, 0.96], grweight: [1.1, 1.1], grscale: [2.2, 2.2], grspread: [1, 1], grspeed: [1, 1] },
      beat: {}, extras: { palette: "1", morph: false } },
    { id: "terrain", name: "Terrain", subtitle: "Terrain · raymarched landscape",
      help: "A fractal landscape flown at low altitude, raymarched as a height field with distance haze — the ground counterpart to Ocean, and it uses the same trick: the step length grows with distance, because near ground needs fine sampling and far ground is only a few pixels wide. **Relief** is how tall the mountains stand, Scale how far apart they are (low gives vast rolling country, high a crowded range), Detail the octaves of erosion, Haze how quickly distance washes it out, Fly speed how fast you travel.",
      params: ["teheight", "tescale", "teoct", "tefog", "tespeed", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "band"], bakesOwnZoom: true,
      draw: dt => { const s = terrainSeed(dt); if (useGL) glShaderDraw("terrain", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uHeight, s.height); gl.uniform1f(u.uScale, s.scale); gl.uniform1f(u.uOct, s.oct); gl.uniform1f(u.uFog, s.fog); gl.uniform1f(u.uZoom, s.zoom); }); else terrain(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], teheight: [1.6, 1.6], tescale: [0.55, 0.55], teoct: [5, 5], tefog: [1, 1], tespeed: [1, 1] },
      beat: {}, extras: { palette: "8", morph: false } },
    { id: "apollo", name: "Apollonian gasket", subtitle: "Apollonian · recursive sphere packing",
      help: "An infinite packing of spheres, each nestled in the gap between the last three, raymarched from inside the gasket. It is built by INVERSION rather than by iteration of a power: each step reflects the point through a sphere and folds it back into the unit cell, so the structure repeats at every scale without ever being drawn twice. **Packing** is the inversion radius and the shape knob — small values open the gaps out, large ones pack them tight and the whole thing turns into filigree. Detail is how many folds (and how much GPU), Halo how tightly the near-miss glow hugs the surface, Glow how bright it burns.",
      params: ["apscale", "apiter", "apthin", "apglow", "apspeed", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "band"], bakesOwnZoom: true,
      draw: dt => { const s = apolloSeed(dt); if (useGL) glShaderDraw("apollo", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uScale, s.scale); gl.uniform1f(u.uIter, s.iter); gl.uniform1f(u.uGlow, s.glow); gl.uniform1f(u.uThin, s.thin); gl.uniform1f(u.uZoom, s.zoom); }); else apollo(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], apscale: [1.15, 1.15], apiter: [8, 8], apthin: [1, 1], apglow: [0.6, 0.6], apspeed: [1, 1] },
      beat: {}, extras: { palette: "7", morph: false } },
    { id: "mbox", name: "Mandelbox", subtitle: "Mandelbox · box-fold fractal",
      help: "The Mandelbulb's architectural cousin. Where the bulb runs a POWER map and grows organic lobes, this folds space — reflect anything outside a box back in, invert anything inside a small sphere, scale, repeat — and the result is hard-edged: corridors, shells and rooms rather than petals. **Scale** is the whole character, and NEGATIVE values are the famous ones (the shipped -1.7 hollows it into chambers); push it positive and it collapses toward a solid block. Fold sets the size of the box being folded against, Detail how many iterations.",
      params: ["bxscale", "bxfold", "bxiter", "bxglow", "bxspeed", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "band"], bakesOwnZoom: true,
      draw: dt => { const s = mboxSeedFn(dt); if (useGL) glShaderDraw("mbox", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uScale, s.scale); gl.uniform1f(u.uIter, s.iter); gl.uniform1f(u.uGlow, s.glow); gl.uniform1f(u.uFold, s.fold); gl.uniform1f(u.uZoom, s.zoom); }); else mbox(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], bxscale: [-1.7, -1.7], bxfold: [1, 1], bxiter: [8, 8], bxglow: [0.5, 0.5], bxspeed: [1, 1] },
      beat: {}, extras: { palette: "3", morph: false } },
    { id: "gyroid", name: "Gyroid", subtitle: "Gyroid · infinite minimal surface",
      help: "A triply-periodic minimal surface — the sheet that soap film makes when it divides space into two interlocking labyrinths that never touch. It is NOT a fractal: it is one smooth infinite lattice, which is why it reads so differently from the two beside it. The entire surface is one line of trigonometry, so it is also the cheapest 3D effect here. **Cell size** sets the scale of the weave, Thickness how solid the sheet is (thin gives a delicate membrane, thick closes the gaps into tunnels), Drift slides the lattice past the camera.",
      params: ["gyfreq", "gythick", "gywarp", "gyglow", "gyspeed", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "band"], bakesOwnZoom: true,
      draw: dt => { const s = gyroidSeed(dt); if (useGL) glShaderDraw("gyroid", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uFreq, s.freq); gl.uniform1f(u.uThick, s.thick); gl.uniform1f(u.uGlow, s.glow); gl.uniform1f(u.uWarp, s.warp); gl.uniform1f(u.uZoom, s.zoom); }); else gyroid(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], gyfreq: [2.2, 2.2], gythick: [0.35, 0.35], gywarp: [0.6, 0.6], gyglow: [0.5, 0.5], gyspeed: [1, 1] },
      beat: {}, extras: { palette: "5", morph: false } },
    { id: "csg", name: "Smooth CSG", subtitle: "CSG · smooth-blended solids",
      help: "Constructive solid geometry raymarched as one scene: a cast of spheres, boxes, tori and capsules, each on its own looping path and spin, MELTING into each other where they meet (smooth union) — and some of them carving cavities that wander through the others instead (smooth subtraction). Seed rolls a new cast: how many of each kind, their sizes, homes and paths; Objects sets the head count. Blend is the melt radius — arm its chips and every beat fuses the whole cast into one blob before it pulls apart again. Shine and Highlight width set the plastic gloss: tight and bright, or broad and soft.",
      params: ["csgcount", "csgseed", "csgblend", "csgspeed", "csgorbit", "csgshine", "csgwidth", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "band"], bakesOwnZoom: true,
      draw: dt => { const s = csgSeed(dt); if (useGL) glShaderDraw("csg", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uOrbit, s.orbit); gl.uniform1f(u.uBlend, s.blend); gl.uniform1f(u.uShine, s.shine); gl.uniform1f(u.uWidth, s.width); gl.uniform1f(u.uZoom, s.zoom); gl.uniform1f(u.uCount, s.count); gl.uniform4fv(u.uObj, s.obj); gl.uniform4fv(u.uPath, s.path); gl.uniform4fv(u.uSpin, s.spin); gl.uniform4fv(u.uPhase, s.phase); }); else csgCPU(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], csgcount: [5, 5], csgseed: [1, 1], csgblend: [0.35, 0.35], csgspeed: [1, 1], csgorbit: [1, 1], csgshine: [1.25, 1.25], csgwidth: [0.21, 0.21] },
      beat: {}, extras: { palette: "5", morph: false } },
    { id: "voronoi", name: "Voronoi cells", subtitle: "Voronoi · cracked cellular field",
      help: "A cellular field: space is divided between wandering seed points, and every pixel is coloured by how far it is from the nearest one. **Edge** is the character knob — at 0 you get soft blobs (distance to the nearest seed), at 1 the crack BETWEEN cells (the gap between nearest and second-nearest), which is the shattered-glass look. Cells sets how many, Wander how far each seed drifts from its home, Speed how fast. Nothing else here measures cellular distance — Reaction-diffusion is a chemical simulation and Cellular automaton is a filter over heat.",
      params: ["vocells", "voedge", "vojit", "vospeed", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "band"], bakesOwnZoom: true,
      draw: dt => { const s = voronoiSeed(dt); if (useGL) glShaderDraw("voronoi", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uCells, s.cells); gl.uniform1f(u.uEdge, s.edge); gl.uniform1f(u.uJit, s.jit); gl.uniform1f(u.uZoom, s.zoom); }); else voronoi(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], vocells: [6, 6], voedge: [0.6, 0.6], vojit: [0.7, 0.7], vospeed: [0.5, 0.5] },
      beat: {}, extras: { palette: "2", morph: false } },
    { id: "warpnoise", name: "Flow noise", subtitle: "Flow noise · domain-warped fbm",
      help: "Fractal noise whose INPUT is displaced by more noise, twice over — the marbled, slowly-flowing field that most modern shader work is built on. **Warp** is what makes it: at 0 it is plain cloud noise, and as it rises the field folds into itself and grows filaments and eddies. Scale is how big the features are, Detail how many octaves (and how much GPU), Flow how fast it moves. Plasma is built from sines and cannot make this shape however many you stack.",
      params: ["wnscale", "wnwarp", "wnoct", "wnspeed", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "band"], bakesOwnZoom: true,
      draw: dt => { const s = warpnoiseSeed(dt); if (useGL) glShaderDraw("warpnoise", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uScale, s.scale); gl.uniform1f(u.uWarp, s.warp); gl.uniform1f(u.uOct, s.oct); gl.uniform1f(u.uZoom, s.zoom); }); else warpnoise(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], wnscale: [3, 3], wnwarp: [4, 4], wnoct: [5, 5], wnspeed: [1, 1] },
      beat: {}, extras: { palette: "4", morph: false } },
    { id: "truchet", name: "Truchet tiles", subtitle: "Truchet · woven arc maze",
      help: "Every tile holds one of two quarter-arc pairs, picked by a coin flip, and because the arcs always meet at the tile edges an endless woven maze falls out of it. **Weave** slides the threshold that decides which way each tile faces, so tiles turn over one at a time rather than the whole grid re-rolling — drift it, or arm it to a beat, and the maze re-knits itself continuously. Tiles sets the grid, Line width the ribbon, Turn rate how fast the flipping travels.",
      params: ["trucells", "truwidth", "truflip", "truspeed", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "band"], bakesOwnZoom: true,
      draw: dt => { const s = truchetSeed(dt); if (useGL) glShaderDraw("truchet", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uCells, s.cells); gl.uniform1f(u.uWidth, s.width); gl.uniform1f(u.uFlip, s.flip); gl.uniform1f(u.uZoom, s.zoom); }); else truchet(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], trucells: [6, 6], truwidth: [0.35, 0.35], truflip: [0.5, 0.5], truspeed: [1, 1] },
      beat: {}, extras: { palette: "9", morph: false } },
    { id: "shapegrid", name: "Shape grid", subtitle: "Shape grid · pulsing lattice",
      help: "A tiled lattice of one shape. Density sets how many cells fill the screen, Size the shape within each cell, Squareness morphs circle → square, and Pulse (with Pulse speed) makes every cell breathe out of phase with its neighbours. Reads like a pulsing dot-grid or checkerboard.",
      params: ["sgcells", "sgdot", "sgsquare", "sgpulse", "sgspeed", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "shape"], bakesOwnZoom: true,
      draw: dt => { const s = shapegridSeed(dt); if (useGL) glShaderDraw("shapegrid", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uCells, s.cells); gl.uniform1f(u.uDot, s.dot); gl.uniform1f(u.uSquare, s.square); gl.uniform1f(u.uPulse, s.pulse); gl.uniform1f(u.uZoom, s.zoom); }); else shapegrid(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], sgcells: [9, 9], sgdot: [0.3, 0.3], sgsquare: [0, 0], sgpulse: [0.35, 0.35], sgspeed: [1.2, 1.2], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "7", morph: false, showBox: true, randSeed: true } },
    { id: "concentric", name: "Concentric rings", subtitle: "Concentric · shape tunnel",
      help: "Nested polygon (or circle) contours radiating out from the centre and marching outward over time — a hypnotic target / shape-tunnel. Sides sets the shape, Ring count how tightly packed the rings are, March speed how fast they travel (negative pulls inward), Thickness the ring width, and Spin rotates the whole thing.",
      params: ["cosides", "cocount", "cothick", "cospeed", "cospin", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "shape"], bakesOwnZoom: true,
      draw: dt => { const s = concentricSeed(dt); if (useGL) glShaderDraw("concentric", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uSides, s.sides); gl.uniform1f(u.uCount, s.count); gl.uniform1f(u.uThick, s.thick); gl.uniform1f(u.uSpin, s.spin); gl.uniform1f(u.uZoom, s.zoom); }); else concentric(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], cosides: [6, 6], cocount: [6, 6], cothick: [0.4, 0.4], cospeed: [0.6, 0.6], cospin: [0.1, 0.1], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "1", morph: false, showBox: true, randSeed: true } },
    { id: "bounce", name: "Bouncing shapes", subtitle: "Bouncing shapes · DVD-logo drift",
      help: "A handful of shapes drifting and bouncing off the edges, DVD-logo style. **Shape mix** is how many different KINDS are in play — 1 is all the same (circle↔square, as it always was), and up to 7 brings in triangles, pentagons, hexagons, stars, rings and crosses, each object picking one and keeping it. Count sets how many objects, Size how big, Squareness morphs circle → square (kind 1 only), Spin how fast they turn — a still triangle reads as a texture, a turning one reads as an object — and Speed how fast they travel. Tick a Fade pixel or Fire feedback filter to give them glowing trails.",
      params: ["bncount", "bnrad", "bnsquare", "bnmix", "bnspin", "bnspeed", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "shape"], bakesOwnZoom: true,
      draw: dt => { const s = bounceSeed(dt); if (useGL) glShaderDraw("bounce", u => { gl.uniform2fv(u.uPos, s.pos); gl.uniform1f(u.uCount, s.count); gl.uniform1f(u.uRad, s.rad); gl.uniform1f(u.uSquare, s.square); gl.uniform1f(u.uZoom, s.zoom); gl.uniform1f(u.uMix, s.mix); gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uSpin, s.spin); }); else bounce(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], bncount: [4, 4], bnrad: [0.09, 0.09], bnsquare: [0.6, 0.6], bnmix: [7, 7], bnspin: [0.8, 0.8], bnspeed: [1, 1], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "2", morph: false, showBox: true, randSeed: true } },
    { id: "solids", name: "Bouncing solids", subtitle: "Solids · raymarched 3D",
      help: "Real 3D: a handful of solid primitives — sphere, box, doughnut, capsule, octahedron, cylinder — tumbling and ricocheting off the walls of an invisible room, raymarched as signed-distance fields and shaded into the palette by surface angle and depth. Count sets how many bodies, Size how big (which is also the radius they bounce on, so bigger ones turn sooner), Shape mix how many different primitives are in play (1 = all spheres, 6 = all six), Speed how fast they travel and Tumble how hard they spin — a wall hit converts slide into roll, so they kick into a tumble on an angled clip. Edge glow lights the silhouettes. Tick Fire or Fade pixel for trails.",
      params: ["sdcount", "sdsize", "sdmix", "sdspeed", "sdspin", "sdrim", "world", "wldx", "wldy", "wldz", "wldscale", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "solids", "band"],
      bakesOwnZoom: true, solids: true,
      draw: dt => { const s = solidsSeed(dt); if (useGL) glShaderDraw("solids", u => { gl.uniform4fv(u.uPos, s.pos); gl.uniform4fv(u.uQuat, s.quat); gl.uniform1fv(u.uShape, s.shape); gl.uniform1f(u.uCount, s.count); gl.uniform1f(u.uRim, s.rim); gl.uniform1f(u.uZoom, s.zoom); }); else solids(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], sdcount: [5, 5], sdsize: [0.26, 0.26], sdmix: [6, 6], sdspeed: [1, 1], sdspin: [1, 1], sdrim: [0.55, 0.55], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "1", morph: false, showBox: true, world: false, randSeed: true } },
    { id: "sunsurface", name: "Sun surface", subtitle: "Sun surface · solar granulation",
      help: "The boiling surface of the sun, as the Inouye Solar Telescope sees it: a full-screen field of bright convection cells separated by narrow dark lanes, each cell slowly drifting, deforming and brightening as it churns, with tiny bright points sparking in the lanes. Raise Sunspot to sink a dark spot into the middle — a near-black core ringed by fine filaments radiating out into the granulation. Fire-family palettes (Amber, Fire, Ember, Sunburst) give it its colour.",
      params: ["sunscale", "sunspeed", "sunlane", "sunglow", "sunspot", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "sun", "band"], bakesOwnZoom: true,
      // Plasma-shaped draw: the clock advances exactly ONCE per frame on either path —
      // sun(dt) calls sunSeed itself, so nothing may pre-call it before the CPU branch.
      // (The metaballs-style `const s = seed(dt); ... else mirror(dt)` double-advances.)
      draw: dt => { if (useGL) { const s = sunSeed(dt); glShaderDraw("sun", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uDensity, s.density); gl.uniform1f(u.uLane, s.lane); gl.uniform1f(u.uGlow, s.glow); gl.uniform1f(u.uSpot, s.spot); gl.uniform1f(u.uZoom, s.zoom); }); } else sun(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], sunscale: [14, 14], sunspeed: [1, 1], sunlane: [0.35, 0.35], sunglow: [1, 1], sunspot: [0, 0], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "8", morph: false, showBox: true, randSeed: true } },
    { id: "kefrens", name: "Kefrens bars", subtitle: "Kefrens · weaving ribbons",
      help: "The classic Amiga effect: vertical bars redrawn at a phase offset on every scanline, so the ribbons weave impossibly through each other. Bars sets how many, Sway how far they wander, Speed how fast, and Bar width how fat each ribbon is. Arm Sway or Speed to a beat to make them lash.",
      params: ["kfbars", "kfsway", "kfspeed", "kfwidth", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "kefrens", "band"], bakesOwnZoom: true,
      draw: dt => { if (useGL) { const s = kefrensSeed(dt); glShaderDraw("kefrens", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uBars, s.bars); gl.uniform1f(u.uSway, s.sway); gl.uniform1f(u.uWidth, s.width); gl.uniform1f(u.uZoom, s.zoom); }); } else kefrens(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], kfbars: [6, 6], kfsway: [0.25, 0.25], kfspeed: [1, 1], kfwidth: [0.045, 0.045], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "3", morph: false, showBox: true, randSeed: true } },
    { id: "twister", name: "Twister", subtitle: "Twister · liquorice column",
      help: "The classic twisting column: a square bar wrung along its height, each face shaded by its angle, bright seams on the edges. Twist sets how hard it is wrung (negative reverses), Speed how fast it turns, Width how fat it is, and Columns puts up to three side by side, out of phase.",
      params: ["twcols", "twwidth", "twtwist", "twspeed", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "twister", "band"], bakesOwnZoom: true,
      draw: dt => { if (useGL) { const s = twisterSeed(dt); glShaderDraw("twister", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uCols, s.cols); gl.uniform1f(u.uWidth, s.width); gl.uniform1f(u.uTwist, s.twist); gl.uniform1f(u.uZoom, s.zoom); }); } else twister(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], twcols: [1, 1], twwidth: [0.22, 0.22], twtwist: [2, 2], twspeed: [1, 1], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "8", morph: false, showBox: true, randSeed: true } },
    { id: "cymatics", name: "Cymatics", subtitle: "Cymatics · Chladni plate",
      help: "Sand on a vibrating plate: bright lines trace the nodes of a standing wave, and the figure snaps into a new symmetry every time the mode changes. Mode is the wave number — drift its two thumbs apart for continuous morphing, or arm its chips so the figure JUMPS on the beat. Mode offset skews the pattern off square, Sharpness thins the lines, Shimmer makes the sand tremble.",
      params: ["cymode", "cymoff", "cysharp", "cyshimmer", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "chladni", "band"], bakesOwnZoom: true,
      draw: dt => { if (useGL) { const s = cymaticsSeed(dt); glShaderDraw("cymatics", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uModeN, s.n); gl.uniform1f(u.uModeM, s.m); gl.uniform1f(u.uSharp, s.sharp); gl.uniform1f(u.uShim, s.shim); gl.uniform1f(u.uZoom, s.zoom); }); } else cymatics(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], cymode: [3, 3], cymoff: [1, 1], cysharp: [5, 5], cyshimmer: [0.4, 0.4], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "1", morph: false, showBox: true, randSeed: true } },
    { id: "lightning", name: "Lightning storm", subtitle: "Lightning · beat-fired bolts",
      help: "Forked fractal bolts tearing down the screen, each one a fresh shape: a jagged main channel that splits into side branches on its way down, lighting up from the cloud to the ground with a hot racing tip — Strike speed is how fast it travels. Rate fires strikes on a clock; arm Strike's L/M/H chips and the BEAT fires them instead — a kick snaps Strike to full and the bolt decays over the Trigger duration, exactly like Shockwave's ring. Bolts sets how many strike at once, Afterglow how much the sky lights up.",
      params: ["ltstrike", "ltrate", "ltspd", "ltbolts", "ltglow", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "storm", "band"], bakesOwnZoom: true,
      draw: dt => { if (useGL) { const s = stormSeed(dt); glShaderDraw("storm", u => { gl.uniform1f(u.uEnv, s.env); gl.uniform1f(u.uSeed, s.seed); gl.uniform1f(u.uBolts, s.bolts); gl.uniform1f(u.uGlow, s.glow); gl.uniform1f(u.uZoom, s.zoom); gl.uniform1f(u.uFront, s.front); }); } else storm(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], ltstrike: [0, 0], ltrate: [0.5, 0.5], ltspd: [12, 12], ltbolts: [2, 2], ltglow: [0.5, 0.5], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "7", morph: false, showBox: true, randSeed: true } },
    { id: "mandelbulb", name: "Mandelbulb", subtitle: "Mandelbulb · flight inside a 3D fractal",
      help: "The 3D Mandelbrot: z → z^p + c run in spherical coordinates and raymarched as a solid, with the camera in a slow orbit around it. **Distance** is how far the camera sits from the centre, and it is the whole character of the effect. It ships at 1, which is INSIDE the outer lobes — you are down among the structure, looking out along a canyon. Raise it to 1.5 to skim the surface, 2.5 to frame the whole solid from outside. Wind it down to 0 and it stops short rather than reaching the centre, which is deliberate: the middle of a Mandelbulb is the DENSEST part of the set, not a cavity. The iteration there never escapes, the distance estimate goes flat, and a camera actually at the origin sees nothing at all — a black screen. There is no hollow middle to fly through, so 0 parks you as deep as there is anything left to see from. Height lifts the orbit off the equator, which shows the lobed structure far better than looking at it dead-on. Power reshapes it continuously — 8 is the classic bulb, low values melt it toward a sphere, high values bristle it, and the fractions in between morph smoothly (drift Power's two thumbs apart and the bulb never stops reshaping around you). Detail adds fractal depth (and GPU cost), Orbit speed is how fast the flight winds through it, Glow lights the walls and puts a halo where a ray only just misses. The heaviest effect in the app — it wants a real GPU.",
      params: ["bpdist", "bplift", "bppower", "bpdetail", "bpspin", "bpglow", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "bulb", "band"], bakesOwnZoom: true,
      draw: dt => { if (useGL) { const s = bulbSeed(dt); glShaderDraw("bulb", u => { gl.uniform3f(u.uPos, s.px, s.py, s.pz); gl.uniform3f(u.uFwd, s.fx, s.fy, s.fz); gl.uniform1f(u.uPower, s.power); gl.uniform1f(u.uIter, s.iter); gl.uniform1f(u.uGlow, s.glow); gl.uniform1f(u.uZoom, s.zoom); }); } else bulb(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], bpdist: [1, 1], bplift: [0, 0], bppower: [8, 8], bpdetail: [7, 7], bpspin: [0.35, 0.35], bpglow: [0.5, 0.5], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "4", morph: false, showBox: true, randSeed: true } },
    { id: "flames", name: "Fractal flames", subtitle: "Fractal flames · IFS density",
      help: "An iterated function system in the Apophysis / Electric Sheep style: the chaos game bounces between two slowly-morphing affine maps, a nonlinear Variation bends every step, and each landing ADDS heat — so the dense heart of the orbit burns white while the wisps stay faint. Variation picks the fold (Spherical and Swirl are the classics), Morph speed orbits the coefficients, Point glow sets how much each landing adds, and Points the density budget.",
      params: ["flvar", "flmorph", "flglow", "points", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold"], helpTags: ["all", "flames"], bakesOwnZoom: true, stampAdd: true,
      stamp: (xL, xR, yT, yB, n) => flamesStamp(xL, xR, yT, yB, n),
      // The ONE effect that ships with a filter: additive stamps + Fade retention IS the
      // fractal-flame render model — density accumulates over ~a second and decays, so the
      // dense heart of the orbit stacks toward white while the wisps stay faint. Without
      // retention each tick starts from black and the picture is a sparse dust.
      filters: ["fade", "diffuse"],
      // Points is the density budget of an ADDITIVE stamper, so it wants a range of its own:
      // the shared schema tops out at 24000, which is where flames only starts to fill in.
      // Per-effect bounds (see rngShipped) instead of widening the schema — a 10k floor on the
      // shared slider would clamp every other point effect's shipped default upward.
      ranges: { points: { min: 2000, max: 30000 } },
      defaults: { palcycle: [0, 0], palhold: [0, 0], flvar: [3, 3], flmorph: [0.3, 0.3], flglow: [30, 30], points: [12000, 12000], fade: [0.975, 0.975], diffuse: [0.8, 0.8], diffkeep: [0.985, 0.985], rise: [130, 130], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], speed: [10, 10], size: [1, 1], rot: [0, 0], layers: 1 },
      beat: {}, extras: { palette: "7", morph: false, showBox: true, randSeed: true } },
    { id: "starfield", name: "Starfield", subtitle: "Starfield · hyperspace",
      help: "A 3D starfield flying past — six parallax depths of hash-placed stars, each twinkling on its own phase. Warp smears every star into a radial streak: arm its L/M/H chips and the kick punches to hyperspace, easing back as the pulse decays. Star density and Fly speed set the traffic, Twinkle the shimmer.",
      params: ["stdensity", "stspeed", "stwarp", "sttwinkle", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "stars", "band"], bakesOwnZoom: true,
      draw: dt => { if (useGL) { const s = starsSeed(dt); glShaderDraw("stars", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uDensity, s.density); gl.uniform1f(u.uWarp, s.warp); gl.uniform1f(u.uTwinkle, s.twinkle); gl.uniform1f(u.uZoom, s.zoom); }); } else stars(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], stdensity: [1.2, 1.2], stspeed: [1, 1], stwarp: [0, 0], sttwinkle: [0.8, 0.8], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "6", morph: false, showBox: true, randSeed: true } },
    { id: "aurora", name: "Aurora", subtitle: "Aurora · northern lights",
      help: "Curtains of light hanging from the top of the sky, swaying on slow layered waves, each rippling and shimmering on its own phase over a faint horizon glow. Curtains sets how many, Sway how far the whole sky bends, Shimmer how restless the light is. Ice and Electric palettes were made for it; Verdant gives the green aurora.",
      params: ["aucurtains", "ausway", "auspeed", "aushimmer", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "aurora", "band"], bakesOwnZoom: true,
      draw: dt => { if (useGL) { const s = auroraSeed(dt); glShaderDraw("aurora", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uCurtains, s.curtains); gl.uniform1f(u.uSway, s.sway); gl.uniform1f(u.uShim, s.shim); gl.uniform1f(u.uZoom, s.zoom); }); } else aurora(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], aucurtains: [3, 3], ausway: [0.5, 0.5], auspeed: [1, 1], aushimmer: [1, 1], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "1", morph: false, showBox: true, randSeed: true } },
    { id: "reactdiff", name: "Reaction-diffusion", subtitle: "Gray–Scott · living patterns",
      help: "Two chemicals feeding and killing each other on a dish, forming spots, stripes, coral and mazes that grow and never repeat. Feed and Kill choose the regime — tiny nudges cross into whole new pattern families, and some settings kill the culture outright; when everything dies, the dish quietly re-seeds itself, so exploring (or arming Feed's chips to let the beat push the culture into a new life) is always safe. Sim speed is how many chemistry steps run per frame. The state is ONE shared dish: two layers of it show the same culture.",
      params: ["rdfeed", "rdkill", "rdspeed", "rdgain", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "rd", "band"], bakesOwnZoom: true,
      onEnter: () => { rdNeedSeed = true; rdCpuSeed = true; },
      draw: dt => { const s = rdSeedFn(dt); if (useGL) { glRDTick(s.steps, s.feed, s.kill); glShaderDraw("rdshow", u => { bindTexUnit(0, glTex.rd[rdCur]); gl.uniform1i(u.uState, 0); gl.uniform1f(u.uGain, s.gain); gl.uniform1f(u.uZoom, s.zoom); }); } else rdCPU(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], rdfeed: [0.03, 0.03], rdkill: [0.062, 0.062], rdspeed: [8, 8], rdgain: [1, 1], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "2", morph: false, showBox: true, randSeed: true } },
    { id: "automata", name: "Cellular automata", subtitle: "Life-like automata · B/S rules on a torus",
      help: "Conway's Game of Life and its relatives, run on a grid of cells that wraps at every edge. Rule picks the family: Life (gliders and still lifes), HighLife (replicators), Day & Night (boiling fronts), Seeds (explosive), Maze and Coral (slow growth). Rain sprinkles new cells every generation so the grid never settles for good — arm its chips and every beat is a shower of new life. Trail lets a dead cell fade over that many generations, Cells sets the grid, Speed the generations per second. One shared grid; changing Rule or entering the effect re-seeds it.",
      params: ["carule", "cacells", "caspeed", "carain", "catrail", "cagain", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "ca", "band"], bakesOwnZoom: true,
      onEnter: () => { caNeedSeed = true; caCpuSeed = true; },
      draw: dt => { const s = caSeedFn(dt); if (useGL) { glCATick(s); glShaderDraw("cashow", u => { bindTexUnit(0, glTex.ca[caCur]); gl.uniform1i(u.uState, 0); gl.uniform1f(u.uGain, s.gain); gl.uniform1f(u.uZoom, s.zoom); }); } else caCPU(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], carule: [0, 0], cacells: [120, 120], caspeed: [12, 12], carain: [0.002, 0.002], catrail: [12, 12], cagain: [1, 1], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "2", morph: false, showBox: true, randSeed: true } },
    { id: "menger", name: "Menger sponge", subtitle: "Menger · fractal city drive",
      help: "An endless lattice of Menger sponges — the 3D Sierpiński carpet — raymarched while the camera drives the streets between them, turning at intersections and swooping down to thread the carved tunnels straight through the sponges, on a wandering route that never repeats. Dive speed is the flight, Detail the fractal depth (and the GPU bill), Glow lights the canyon walls. Kin to Sierpiński: this is what its carpet looks like grown into a solid.",
      params: ["mgdive", "mgrot", "mgiter", "mgglow", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"], helpTags: ["all", "menger", "band"], bakesOwnZoom: true,
      draw: dt => { if (useGL) { const s = mengerSeed(dt); glShaderDraw("menger", u => { gl.uniform3f(u.uPos, s.px, s.py, s.pz); gl.uniform3f(u.uFwd, s.fx, s.fy, s.fz); gl.uniform1f(u.uRoll, s.roll); gl.uniform1f(u.uIter, s.iter); gl.uniform1f(u.uGlow, s.glow); gl.uniform1f(u.uZoom, s.zoom); }); } else menger(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], mgdive: [0.5, 0.5], mgrot: [0.3, 0.3], mgiter: [4, 4], mgglow: [0.5, 0.5], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "3", morph: false, showBox: true, randSeed: true } },
    { id: "boids", name: "Boids", subtitle: "Boids · murmuration",
      help: "A flock of birds wheeling as one — cohesion, alignment and separation, nothing else, which is the whole magic of boids. Each bird stamps a short streak, and the shipped Fade filter turns the flock into a smoky murmuration. Arm Scatter's L/M/H chips and every beat BLASTS the flock apart from its centre before it regathers; Cohesion sets how tightly it wheels.",
      params: ["bdcount", "bdspeed", "bdcoh", "bdfear", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold"], helpTags: ["all", "boids"], boids: true,
      stamp: (xL, xR, yT, yB, n) => boidsStamp(xL, xR, yT, yB, n),
      bakesOwnZoom: true,
      filters: ["fade"],
      defaults: { palcycle: [0, 0], palhold: [0, 0], bdcount: [80, 80], bdspeed: [1, 1], bdcoh: [1, 1], bdfear: [0, 0], fade: [0.93, 0.93], points: [2500, 2500], rise: [130, 130], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], speed: [10, 10], size: [1, 1], rot: [0, 0], layers: 1 },
      beat: {}, extras: { palette: "1", morph: false, showBox: true, randSeed: true } },
    { id: "galaxy", name: "Galaxy", subtitle: "Galaxy · log-spiral star disc",
      help: "A disc of stars whose density follows log spirals — the shape real galaxies make, where an arm is a straight line in log-radius so the winding tightens toward the core by itself rather than being drawn tighter by hand. The stars differentially rotate too: inner orbits sweep round faster, so the arms shear and re-form instead of turning like a rigid pinwheel. Arms sets how many, Twist how tightly they wind (low is a barred spiral, high a nearly circular ring), Scatter how sharply defined they are against the disc, Core how bright the central bulge burns. Arm Core or Scatter to the beat and the galaxy flares.",
      params: ["gxarms", "gxtwist", "gxspin", "gxcore", "gxscatter", "points", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold"],
      helpTags: ["all", "galaxy"], bakesOwnZoom: true, stampAdd: true,
      stamp: (xL, xR, yT, yB, n) => galaxyStamp(xL, xR, yT, yB, n),
      ranges: { points: { min: 3000, max: 40000 } },
      defaults: { palcycle: [0, 0], palhold: [0, 0], gxarms: [2, 2], gxtwist: [0.55, 0.55], gxspin: [0.5, 0.5], gxcore: [0.35, 0.35], gxscatter: [0.30, 0.30],
        points: [16000, 16000], rise: [130, 130], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], speed: [10, 10], size: [1, 1], rot: [0, 0], layers: 1 },
      beat: {}, extras: { palette: "6", morph: false, showBox: true, randSeed: true } },
    { id: "harmonograph", name: "Harmonograph", subtitle: "Harmonograph · damped pendulum ribbons",
      help: "The Victorian drawing machine: two pendulums per axis, each a dying sine, their sum traced by a pen. Frequency ratio is the figure — whole numbers give the closed classical forms, and the values between them the open weaving ones. Detune is the trick: at exactly 0 the curve closes and retraces itself forever, and a hair off it each lap misses by a little and the whole figure precesses into a ribbon. Damping is how fast the pendulums die, so low values spiral a long way in and high ones draw a tight knot. Points is how finely the pen is sampled; add a Fade or Fire filter and the ribbons trail.",
      params: ["hgratio", "hgdetune", "hgdecay", "hgmorph", "points", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold"],
      helpTags: ["all", "harmo"], bakesOwnZoom: true,
      stamp: (xL, xR, yT, yB, n) => harmonographStamp(xL, xR, yT, yB, n),
      // Its own Points range, like Flames. This effect samples ONE continuous curve rather
      // than scattering a cloud, so the count is the pen's resolution: below ~10k the line
      // breaks into visible dots, and the shared floor of 500 would only ever look broken.
      ranges: { points: { min: 4000, max: 60000 } },
      defaults: { palcycle: [0, 0], palhold: [0, 0], hgratio: [3, 3], hgdetune: [0.012, 0.012], hgdecay: [0.022, 0.022], hgmorph: [0.35, 0.35],
        points: [24000, 24000], rise: [130, 130], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], speed: [10, 10], size: [1, 1], rot: [0, 0], layers: 1 },
      beat: {}, extras: { palette: "5", morph: false, showBox: true, randSeed: true } },
    { id: "vballs", name: "Vector balls", subtitle: "Vector balls · Amiga bobs in formation",
      help: "The Amiga classic: a rigid constellation of shaded spheres tumbling in 3D. Formation picks how they are arranged — Lattice (a cube of them), Sphere (an even shell), Ring or Helix — and the whole set turns as one body, so the shape reads only from how the balls occlude and shade each other. Balls sets how many, Ball size how fat (wind it up and they merge into a solid), Tumble how fast, Edge glow how hard the silhouettes are lit. Nearer balls are brighter, which is what separates the formation in depth.",
      params: ["vbcount", "vbshape", "vbsize", "vbspin", "vbglow", "world", "wldx", "wldy", "wldz", "wldscale", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"],
      helpTags: ["all", "vballs", "band"], bakesOwnZoom: true,
      draw: dt => { const s = vballsSeed(dt);
        if (useGL) glShaderDraw("vballs", u => { gl.uniform1f(u.uPhase, s.phase); gl.uniform1f(u.uCount, s.count); gl.uniform1f(u.uShape, s.shape); gl.uniform1f(u.uRad, s.rad); gl.uniform1f(u.uGlow, s.glow); gl.uniform1f(u.uZoom, s.zoom); });
        else vballsCPU(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], vbcount: [24, 24], vbshape: [1, 1], vbsize: [0.30, 0.30], vbspin: [0.5, 0.5], vbglow: [0.5, 0.5],
        zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "6", morph: false, showBox: true, world: false, randSeed: true } },
    { id: "glass", name: "Glass ball", subtitle: "Glass ball · raytraced spheres over the layers below",
      help: "Raytraced spheres that reflect and refract WHAT IS UNDERNEATH THEM. Put this layer on top of another one and the balls pick that layer's picture up: Metal mirrors it, Glass bends it through and turns it upside down the way a real ball does, Bubble is a thin shell that barely bends it but rings hard at the edge. Refraction is the glass's density — low is nearly water, high squeezes the whole scene into the middle of the ball. On its own, with no layer beneath, the balls fall back to reflecting a procedural room so the effect still stands up. The reflection is of BRIGHTNESS, not colour — everything is re-tinted by this layer's own palette.",
      params: ["gbcount", "gbsize", "gbmat", "gbior", "gbglow", "world", "wldx", "wldy", "wldz", "wldscale", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"],
      helpTags: ["all", "glass", "band"], bakesOwnZoom: true,
      draw: dt => { const s = glassSeed(dt);
        if (useGL) glShaderDraw("glass", u => {
          gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uCount, s.count); gl.uniform1f(u.uRad, s.rad);
          gl.uniform1f(u.uMat, s.mat); gl.uniform1f(u.uIor, s.ior); gl.uniform1f(u.uGlow, s.glow);
          gl.uniform1f(u.uZoom, s.zoom); gl.uniform2f(u.uSalt, s.h1, s.h2);
          // The layers beneath, as this ball's environment. A sampler must be bound to a
          // COMPLETE texture even when the shader never reads it, so with nothing underneath
          // bind any real texture and let uHasBelow switch the branch.
          bindTexUnit(3, glBelowTex || glTex.native); gl.uniform1i(u.uBelow, 3);
          gl.uniform1f(u.uHasBelow, glBelowTex ? 1 : 0);
        });
        else glassCPU(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], gbcount: [3, 3], gbsize: [0.62, 0.62], gbmat: [1, 1], gbior: [1.45, 1.45], gbglow: [0.5, 0.5],
        zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      // OVER by default: a ball is an object that hides what is behind it. With MAX a bright
      // layer beneath showed straight through a metal ball, which read as "transparent".
      blend: "over",
      // HOW SOLID THE BALL IS, by material, and it is the whole answer to "I expect to see
      // through glass and bubble". The effect ships an OVER blend because a metal ball is an
      // object that hides what is behind it -- but the same effect also makes a glass ball
      // and a soap bubble, and those are things you look THROUGH. One flat coverage test
      // cannot be right for all three.
      //
      // Metal stays fully opaque, which is what OVER was added for. Glass passes about half
      // the layer beneath -- it already refracts that layer's brightness INSIDE the ball, so
      // this is the rest of the picture arriving around and through it. A bubble is a thin
      // shell that barely bends anything, so it passes most of it and reads as a rim.
      cover: () => [1, 0.3, 0.15][Math.round(gbMat)] || 1,
      beat: {}, extras: { palette: "2", morph: false, showBox: true, world: false, randSeed: true } },
    { id: "trees", name: "Trees", subtitle: "Trees · recursive canopy in the wind",
      help: "A row of fractal trees bending in a wind. Each trunk splits, each branch splits again, and the sway is added at every joint rather than to the tree as a whole — so it accumulates from trunk to tip and the twigs whip while the trunk barely moves, which is what a real tree does. Depth is how many times it splits (the picture gets its filigree from here), Splits how many branches come off each joint, Branch angle how wide the fork opens and Taper how much shorter each generation is — low taper gives a stubby shrub, high a tall wispy one. **Branch width** makes them solid rather than a wireframe, and **Width taper** shrinks it generation by generation so the trunk is thick and the twigs stay fine — a constant width looks like pipe cleaners and is most of why an untapered tree never reads as one. **Bend** bows each bough along its own length instead of leaving all the flex in the joints, which is what a real branch does and what stops low Depth settings looking polygonal; at 0 the branches are straight sticks, as they were. Sway is the wind strength and Wind speed its rate. **Arm Sway's L/M/H chips and the trees gust on the beat.** It stamps into the fire buffer like the other point effects, so a Fade or Fire filter turns the moving tips into trails.",
      params: ["trcount", "trdepth", "trsplit", "trangle", "trshrink", "trwidth", "trtaper", "trcurve", "trsway", "trspeed", "points", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold"],
      helpTags: ["all", "trees"], bakesOwnZoom: true,
      stamp: (xL, xR, yT, yB, n) => treeStamp(xL, xR, yT, yB, n),
      // TREES OWN THEIR POINTS RANGE, and it is high for a reason: this effect draws LINES,
      // not a cloud, so the budget is spread over the tree's total length rather than
      // scattered. Three default trees are ~26k pixels of branch at full resolution, so the
      // shared 2500 default drew a dotted wireframe. 30000 is roughly one point per pixel.
      ranges: { points: { min: 4000, max: 60000 } },
      defaults: { palcycle: [0, 0], palhold: [0, 0], trwidth: [3, 3], trtaper: [0.62, 0.62], trcurve: [0.45, 0.45], trcount: [3, 3], trdepth: [8, 8], trsplit: [2, 2], trangle: [28, 28], trshrink: [0.72, 0.72], trsway: [0.35, 0.35], trspeed: [1, 1],
        points: [30000, 30000], rise: [130, 130], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], speed: [10, 10], size: [1, 1], rot: [0, 0], layers: 1 },
      beat: {}, extras: { palette: "6", morph: false, showBox: true, randSeed: true } },
    { id: "ribbons", name: "Flying ribbons", subtitle: "Flying ribbons · twisting bands through space",
      help: "Long bands writhing through space on closed loops, so they never end and never repeat. What makes a ribbon read as a ribbon rather than as a fat line is that it has a FACE: seen flat it is a wide sheet, seen edge-on it collapses to a bright hairline, and the flip between the two as it turns is the whole effect. Both of the band's edges are placed in 3D and projected separately, so the foreshortening, the twist and the edge-on collapse are all the same piece of geometry rather than three separate tricks. **Twist** is how many times the band rolls over along its length — at 0 it is a flat streamer that only turns as the path turns, wound up it flashes light and dark as each face comes round. **Width** is how broad the band is, **Length** how far the loop runs before it closes (under 1 it is a short arc, above it folds back through itself), and **Waviness** kinks the path so it crumples like foil instead of sweeping in clean curves. **Ribbons** is how many fly at once, each on its own hashed path. Speed runs the whole thing and negative reverses it. The bands are drawn as real surfaces with a depth buffer, so one passing behind another is genuinely hidden by it, and the shading comes from the surface normal — a face turned toward you is bright, one turned edge-on goes dark, and the twist rolls that into bands of light travelling along each ribbon.",
      params: ["rbcount", "rbwidth", "rblen", "rbtwist", "rbwave", "rbspeed", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"],
      helpTags: ["all", "ribbons", "band"], bakesOwnZoom: true,
      // NOT a `stamp`: this one rasterises triangles. There is no Points slider because
      // coverage is not stochastic here -- a surface is filled exactly, once.
      draw: dt => ribbonDraw(dt),
      defaults: { palcycle: [0, 0], palhold: [0, 0], rbcount: [4, 4], rbwidth: [0.38, 0.38], rblen: [0.5, 0.5], rbtwist: [2.5, 2.5], rbwave: [0.55, 0.55], rbspeed: [1, 1],
        zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "2", morph: false, showBox: true, randSeed: true } },
    { id: "torus", name: "Doughnut", subtitle: "Doughnut · flight inside a torus",
      help: "The inside of a doughnut, flown along the tube. The camera rides the pipe's centre line, so the wall wraps the whole frame and the curve of the ring keeps bringing new surface into view — you are always about to round a bend you can never quite see past. Flutes cuts lengthwise grooves into the pipe and Twist winds them into a spiral (both whole numbers, so the pattern closes on itself with no seam; set Flutes to 0 for a smooth pipe). Ring radius is how big the doughnut is — small values bend the tunnel hard and shorten the view, large ones straighten it out. Tube radius is how tight it is around you. Speed runs the flight, and negative reverses it.",
      params: ["dnring", "dntube", "dnspeed", "dntwist", "dnflute", "dnglow", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"],
      helpTags: ["all", "torus", "band"], bakesOwnZoom: true,
      draw: dt => { const s = torusSeed(dt);
        if (useGL) glShaderDraw("torus", u => { gl.uniform3f(u.uPos, s.px, s.py, s.pz); gl.uniform3f(u.uFwd, s.fx, s.fy, s.fz); gl.uniform1f(u.uRing, s.ring); gl.uniform1f(u.uTube, s.tube); gl.uniform1f(u.uTwist, s.twist); gl.uniform1f(u.uFlute, s.flute); gl.uniform1f(u.uGlow, s.glow); gl.uniform1f(u.uZoom, s.zoom); });
        else torusCPU(dt); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], dnring: [3, 3], dntube: [0.8, 0.8], dnspeed: [1, 1], dntwist: [1, 1], dnflute: [6, 6], dnglow: [0.5, 0.5],
        zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "4", morph: false, showBox: true, randSeed: true } },
    { id: "ocean", name: "Ocean", subtitle: "Ocean · Gerstner swell to the horizon",
      help: "A rolling sea running out to a horizon. Surface picks the shape of the water: Sine chop is the original sharpened-sine sum, Seascape is the classic rolling shader sea, Long swell puts two big slow swells under the chop, and Rolling noise is an irregular, bending surface. Six wave trains are summed, each sharpened so the troughs stay round and the crests come to a point — that is Chop, and it is the difference between a real swell and a bland sine. The directions turn octave by octave, so the water interferes with itself and never repeats. Swell scales the whole surface (and with it the glint and the foam), Foam sets how high and how steep a crest has to be before it breaks white, and Wind turns the whole sea. Amber and Ember make it a sunset; the cold palettes make it the North Sea.",
      params: ["gosurf", "goswell", "goheight", "gochop", "gospeed", "gofoam", "goreflect", "gowind", "world", "wldx", "wldy", "wldz", "wldscale", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"],
      helpTags: ["all", "ocean", "band"], bakesOwnZoom: true,
      draw: dt => { const s = oceanSeed(dt);
        if (useGL) glShaderDraw("ocean" + s.surf, u => {
          gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uSwell, s.swell); gl.uniform1f(u.uChop, s.chop);
          gl.uniform1f(u.uFoam, s.foam); gl.uniform1f(u.uWind, s.wind); gl.uniform1f(u.uZoom, s.zoom);
          gl.uniform1f(u.uHeight, s.height); gl.uniform1f(u.uReflect, s.reflect);
          // The layers beneath, for the reflection. Bind a real texture either way — a
          // sampler must point at a COMPLETE one even on the branch that never reads it.
          bindTexUnit(3, glBelowTex || glTex.native); gl.uniform1i(u.uBelow, 3);
          gl.uniform1f(u.uHasBelow, glBelowTex ? 1 : 0);
        });
        else oceanCPU(s); },
      defaults: { gosurf: [0, 0], palcycle: [0, 0], palhold: [0, 0], goswell: [1, 1], gochop: [2.5, 2.5], gospeed: [1, 1], gofoam: [0.45, 0.45], gowind: [0, 0], goheight: [0.7, 0.7], goreflect: [0.6, 0.6],
        zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "1", morph: false, showBox: true, world: false, randSeed: true } },
    { id: "bhole", name: "Black hole", subtitle: "Black hole · lensed accretion disk",
      help: "An accretion disk seen through the hole's own gravity. The photons are integrated rather than drawn straight, so light from the FAR side of the disk is bent up over the top of the shadow and back under the bottom — those arcs closing round the dark centre are the whole point, and a straight-ray version would just be an ellipse. Tilt is the camera's height above the disk plane: low is the iconic nearly-edge-on view, high looks down on a plain ring. Beaming is the relativistic boost that makes the limb coming toward you far brighter than the one going away; wind it to 0 for an evenly lit disk. The disk orbits Keplerian, so the inside shears past the outside and the turbulence never repeats. Heavy: it wants a real GPU.",
      params: ["bhtilt", "bhouter", "bhspin", "bhbeam", "bhorbit", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim"],
      helpTags: ["all", "bhole", "band"], bakesOwnZoom: true,
      draw: dt => { const s = bholeSeed(dt);
        if (useGL) glShaderDraw("bhole", u => { gl.uniform1f(u.uTime, s.t); gl.uniform1f(u.uOrbit, s.orbit); gl.uniform1f(u.uTilt, s.tilt); gl.uniform1f(u.uOuter, s.outer); gl.uniform1f(u.uBeam, s.beam); gl.uniform1f(u.uZoom, s.zoom); });
        else bholeCPU(s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], bhtilt: [12, 12], bhouter: [8, 8], bhspin: [1, 1], bhbeam: [0.8, 0.8], bhorbit: [0.08, 0.08],
        zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "0", morph: false, showBox: true, randSeed: true } },
    { id: "qjulia", name: "Quaternion Julia", subtitle: "Quaternion Julia · raymarched 4D fractal",
      help: "The Julia set done in four dimensions: z → z² + c iterated in the quaternions and raymarched as a solid. What you see can only ever be a 3D SLICE of a 4D object, and the two slice controls are where the shapes come from — Slice is where the cut falls, Cut angle rotates the cutting plane itself, and between them they walk the solid through cross-sections nothing in three dimensions can show. Leave both at 0 and you get the plain Julia set spun about its axis. The seed c rides the SAME cardioid orbit as Julia, so the Orbit editor drives this too and the same rule applies: just outside the set gives intricate filigree, well inside gives a blob. Heavy: it wants a real GPU.",
      params: ["qjslice", "qjcut", "qjdetail", "qjspin", "qjpitch", "qjyaw", "qjroll", "qjtumx", "qjtumy", "qjtumz", "qjglow", "rpm", "ratio", "inrad", "outrad", "phase", "cardx", "world", "wldx", "wldy", "wldz", "wldscale", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold", "band", "bandsize", "banddim", "randseed"],
      helpTags: ["all", "julia", "qjulia", "band"], bakesOwnZoom: true, cardioid: true, onEnter: () => reseedJulia(),
      // ONE juliaSeed() per frame, like the other three — the mirror takes the seed rather
      // than re-advancing it (juliaprobe pins both halves of that for every cardioid effect).
      draw: dt => { const seed = juliaSeed(dt), s = qjuliaSeed(dt);
        if (useGL) glShaderDraw("qjulia", u => { gl.uniform4f(u.uC, seed.cx, seed.cy, 0, 0); gl.uniform1f(u.uPhase, s.phase); gl.uniform1f(u.uSlice, s.slice); gl.uniform1f(u.uCut, s.cut); gl.uniform1f(u.uIter, s.iter); gl.uniform1f(u.uGlow, s.glow); gl.uniform1f(u.uZoom, s.zoom); gl.uniform3f(u.uRot, s.rx, s.ry, s.rz); });
        else qjulia(seed, s); },
      defaults: { palcycle: [0, 0], palhold: [0, 0], qjslice: [0, 0], qjcut: [0, 0], qjdetail: [8, 8], qjspin: [0.3, 0.3], qjglow: [0.5, 0.5],
        qjpitch: [0, 0], qjyaw: [0, 0], qjroll: [0, 0], qjtumx: [0, 0], qjtumy: [0, 0], qjtumz: [0, 0],
        rpm: [0.15, 0.15], ratio: [6.5, 6.5], inrad: [0.12, 0.12], outrad: [1.02, 1.02], phase: [0, 0], cardx: [0, 0],
        zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0] },
      beat: {}, extras: { palette: "4", morph: false, showBox: true, world: false, randSeed: true } },
    { id: "polypinski", name: "Polypinski", subtitle: "Polypinski · chaos game on a sphere",
      help: "Sierpiński set free: the chaos game played between any number of corners on the surface of a sphere. Corners sets how many; Seed rolls where on the sphere they sit, so a formation you like is one number you can come back to. Jump is how far each step goes toward the chosen corner — 0.5 with 3 or 4 corners is the classic triangle or tetrahedron; a crowd of corners wants a LONGER jump, which shrinks each copy so they stop overlapping into a fuzzy ball. Wiggle lets every corner wander about its home, Wiggle speed how fast; the whole solid tumbles slowly and Rotation spins it. Zoom in on the structure — the points are re-stamped at full resolution at any zoom.",
      params: ["pycorners", "pyseed", "pyjump", "pywiggle", "pywspeed", "points", "size", "rot", "zoom", "camrx", "camry", "camrz", "fov", "palcycle", "palhold"],
      helpTags: ["all", "poly"], bakesOwnZoom: true,
      stamp: (xL, xR, yT, yB, n) => polypinskiStamp(xL, xR, yT, yB, n),
      ranges: { points: { min: 2000, max: 60000 } },
      defaults: { palcycle: [0, 0], palhold: [0, 0], pycorners: [6, 6], pyseed: [3, 3], pyjump: [0.62, 0.62], pywiggle: [0.25, 0.25], pywspeed: [0.5, 0.5],
        points: [20000, 20000], rise: [130, 130], zoom: [1, 1], band: [0, 0], bandsize: [1, 1], banddim: [0, 0], speed: [10, 10], size: [1, 1], rot: [0, 0], layers: 1 },
      beat: {}, extras: { palette: "2", morph: false, showBox: true, randSeed: true } },
  ];
  // DISPLAY order only: every effect dropdown lists by name (twenty-odd effects in registry
  // order are a pile to hunt through), while EFFECTS keeps its own order — the runtime
  // `effect` is an index into it, and each option carries that index as its value.
  // WHICH GROUP EACH EFFECT BELONGS TO, in one table rather than a field on 51 descriptors:
  // the point of a grouping is to see it whole and rebalance it, which you cannot do when it
  // is one line inside each of 51 objects. Order here is the order the menus show; effects
  // are sorted by NAME inside each group. An id missing from this table falls into "Other"
  // rather than disappearing from the list, which is the safe way to be wrong.
  const EFFECT_CATS = [
    { name: "Fractals", desc: "the classic escape-time sets and their 3D relatives",
      ids: ["animejulia", "burningship", "multibrot", "newton", "mandelbulb", "qjulia", "menger", "apollo", "mbox", "flames", "sirpinfyer", "tetrafyer", "polypinski"] },
    { name: "3D & raymarched", desc: "solids, surfaces and landscapes traced through space",
      ids: ["solids", "glass", "ocean", "terrain", "gyroid", "torus", "bhole", "vballs", "clouds"] },
    { name: "Demoscene classics", desc: "the effects the scene has been writing since the 90s",
      ids: ["plasma", "tunnel", "copperbars", "kefrens", "twister", "rotozoom", "munch", "moire", "metaballs", "starfield", "kaleidoscope"] },
    { name: "Patterns & noise", desc: "fields, tilings and shapes built from a formula",
      ids: ["voronoi", "warpnoise", "truchet", "shapegrid", "concentric", "bounce", "cymatics", "reactdiff", "harmonograph", "ribbons"] },
    { name: "Nature & simulation", desc: "things that grow, flock, flow or weather",
      ids: ["boids", "physarum", "curl", "trees", "galaxy", "aurora", "lightning", "sunsurface", "attractor", "godray"] },
  ];
  // id -> group index, built once. Anything unlisted sorts last, under "Other".
  const EFFECT_CAT_OF = {};
  EFFECT_CATS.forEach((c, gi) => c.ids.forEach(id => EFFECT_CAT_OF[id] = gi));
  // The menus' shape: [{ name, items:[effectIndex] }], groups in table order, effects by name
  // inside each. Display only -- every option still carries the registry INDEX as its value,
  // because that is what `effect` is at runtime.
  function effectsGrouped() {
    const out = EFFECT_CATS.map(c => ({ name: c.name, desc: c.desc, items: [] }));
    const other = { name: "Other", desc: "", items: [] };
    EFFECTS.forEach((f, i) => {
      const gi = EFFECT_CAT_OF[f.id];
      (gi === undefined ? other : out[gi]).items.push(i);
    });
    if (other.items.length) out.push(other);
    for (const g of out) g.items.sort((a, b) => EFFECTS[a].name.localeCompare(EFFECTS[b].name) || a - b);
    return out.filter(g => g.items.length);
  }
  // Fill one <select> with grouped <optgroup>s. Both effect dropdowns go through here, so
  // they cannot drift apart -- they did not share a builder before, only a sort.
  function fillEffectSelect(sel, withTitles) {
    sel.textContent = "";
    for (const g of effectsGrouped()) {
      const og = document.createElement("optgroup");
      og.label = g.name;
      if (g.desc) og.title = g.desc;
      for (const i of g.items) {
        const o = document.createElement("option");
        o.value = String(i); o.textContent = EFFECTS[i].name;
        if (withTitles) o.title = EFFECTS[i].subtitle;
        og.appendChild(o);
      }
      sel.appendChild(og);
    }
  }
  const effectsByName = () => EFFECTS.map((_, i) => i)
    .sort((a, b) => EFFECTS[a].name.localeCompare(EFFECTS[b].name) || a - b);
  fillEffectSelect(effectSel, false);
  // Dev sanity check: catch a mis-authored descriptor (dup id, param/default that
  // isn't a real control) at load instead of as a silent runtime break. Warns only.
  (function assertRegistry() {
    const ctlKeys = new Set(CONTROLS.map(c => c.key)), seen = new Set();
    EFFECTS.forEach((f, i) => {
      if (!f.id || seen.has(f.id)) console.warn("EFFECTS[" + i + "]: missing or duplicate id:", f.id);
      seen.add(f.id);
      (f.params || []).forEach(k => { if (!ctlKeys.has(k)) console.warn(f.id + ": params references unknown control '" + k + "'"); });
      for (const k in (f.defaults || {})) if (!ctlKeys.has(k)) console.warn(f.id + ": defaults references unknown control '" + k + "'");
      for (const k in (f.ranges || {})) if (!ctlKeys.has(k)) console.warn(f.id + ": ranges references unknown control '" + k + "'");
      for (const k in (f.ranges || {})) if (SINGLE_KEYS.has(k)) console.warn(f.id + ": ranges overrides single control '" + k + "' — its bounds must stay whole");
    });
    // The params ⊆ presetState check that belongs here CANNOT live here: it has to call
    // presetState, whose FILTER_DEFAULTS is a `const` two slices below (filters.js), so
    // calling it at this slice's load time is a TDZ crash. It runs instead as
    // assertPresetStateCovers(), immediately after presetState in transitions.js.
    // A single control is a dual with its thumbs pinned, so it only makes sense on an integer
    // grid: a fractional step, bound or default would put every snapped value off it.
    const whole = n => typeof n === "number" && n === Math.round(n);
    CONTROLS.forEach(c => {
      if (!c.single) return;
      if (c.type !== "dual") console.warn(c.key + ": single needs type 'dual' — the [lo,hi] pair IS the wire format");
      if (!whole(c.step) || !(c.step > 0)) console.warn(c.key + ": single needs a whole positive step");
      if (!whole(c.min) || !whole(c.max)) console.warn(c.key + ": single needs whole bounds");
      if (c.lo !== c.hi || !whole(c.lo)) console.warn(c.key + ": single needs lo === hi, whole");
    });
  })();

  // Effect identity in *saved* blobs is a stable string id, not the volatile numeric
  // index — so reordering/removing effects never silently remaps or drops saved
  // presets. Everything in memory stays a numeric index; convert only at the
  // serialize/deserialize edge (persist/backup/share out, applyBlob/restore in).
  const LEGACY_EFFECT_IDS = ["sirpinfyer", "tetrafyer", "animejulia", "plasma"];   // old index → id, for blobs saved before ids existed
  // RETIRED EFFECTS, mapped to their nearest surviving relative. An id that resolves to -1 is
  // DROPPED by every caller -- mergeLayers loses the layer, validatePresetList loses the whole
  // scene -- so simply deleting a descriptor silently damages every saved scene, share link and
  // backup that used it. Retiring one means naming its heir here instead, and this is the single
  // choke point all the decode paths already funnel through.
  //
  // Polygon -> Concentric rings: a single N-gon outline is the one-ring case of nested N-gon
  // contours, so the layer keeps its shape family rather than becoming something unrelated.
  // NOTE it is NOT in LEGACY_EFFECT_IDS above (that list is positional, and only covers the
  // four ids that predate string ids), so nothing numeric depended on its index.
  const RETIRED_EFFECT_IDS = { polygon: "concentric" };
  const effectId = idx => (EFFECTS[idx] || EFFECTS[0]).id;
  function effectIndexFromId(v) {                 // id (or a legacy number) → current numeric index, or -1
    if (typeof v === "number") v = LEGACY_EFFECT_IDS[v];
    if (RETIRED_EFFECT_IDS[v]) v = RETIRED_EFFECT_IDS[v];   // a retired effect becomes its heir, never -1
    return EFFECTS.findIndex(f => f.id === v);
  }
  // ---- THE per-effect-map registry ---------------------------------------------------
  // One row per per-effect map, naming its wire field and its whole verb family. The verbs
  // are function declarations from later slices — hoisting is what lets this table sit here.
  // The MECHANICAL all-maps sites iterate this table instead of hand-listing six calls:
  // the three snapshot preambles (saveLiveMaps), setEffect's save/load runs (loadLiveMaps),
  // and installShared's re-seed (initAllMaps) — which is exactly the site that proved the
  // point: its hand-list was missing initBtuneStates, so a recipient's own per-slider beat
  // tuning silently bled into every shared scene they opened. A new map = one row here.
  //
  // The SEMANTIC per-map sites stay explicit on purpose — applyBlob's validation loops,
  // snapshotScene's literal, applyPreset's merge lines, freezeItem/thawItem — because their
  // per-map differences (bounds-checking, replace-vs-merge, deep copies) are the behaviour,
  // and presetprobe/stackprobe pin them line by line.
  //
  // The wire names double as EFFECT_MAPS: the maps are keyed by registry POSITION in memory,
  // which only means anything in the build that wrote them, so they get the same id
  // treatment as `effect` at the storage edge — otherwise reordering or removing an effect
  // silently reattaches every saved scene to whichever effect now sits at that index.
  const MAP_DEFS = [
    { wire: "states", save: e => saveState(e), load: e => loadState(e), init: () => initStates() },
    { wire: "beats",  save: e => saveBeat(e),  load: e => loadBeat(e),  init: () => initBeatStates() },
    { wire: "pulses", save: e => savePulse(e), load: e => loadPulse(e), init: () => initPulseStates() },
    { wire: "plens",  save: e => savePlen(e),  load: e => loadPlen(e),  init: () => initPlenStates() },
    { wire: "btunes", save: e => saveBtune(e), load: e => loadBtune(e), init: () => initBtuneStates() },
    { wire: "extras", save: e => saveExtra(e), load: e => loadExtra(e), init: () => initExtras() },
  ];
  const EFFECT_MAPS = MAP_DEFS.map(d => d.wire);
  function saveLiveMaps(e) { for (const d of MAP_DEFS) d.save(e); }   // fold the live DOM/singletons into effect e's maps
  function loadLiveMaps(e) { for (const d of MAP_DEFS) d.load(e); }   // put effect e's maps onto the live DOM/singletons
  function initAllMaps() { for (const d of MAP_DEFS) d.init(); }      // re-seed every map to its shipped defaults
  function keysToIds(m) {                          // { 3: {...} } → { plasma: {...} }
    const out = {};
    for (const k in m) { const f = EFFECTS[+k]; if (f) out[f.id] = m[k]; }
    return out;
  }
  function keysToIdx(m) {                          // ...and back, tolerating legacy keys
    const out = {};
    for (const k in m) {
      // A numeric key is a blob written before this change. The registry has only ever
      // been appended to, so the position it recorded is still the right one.
      const i = /^\d+$/.test(k) ? +k : effectIndexFromId(k);
      if (i >= 0 && EFFECTS[i]) out[i] = m[k];     // an id we no longer ship is dropped
    }
    return out;
  }
  // ---- palette references get the same edge treatment as effect ids -----------------
  // Palette refs live NESTED — extras values, layer items, presets' extra + layers — and the
  // inputs alias RUNTIME objects (extras[e], the presets array), so every level that gets a
  // rewritten field is copied, never mutated in place. Encode keeps the raw value when the
  // index resolves to no id (nothing to say about it ⇒ say what was there); decode drops an
  // unknown id (never misfile) and emits STRING indices, the shape the runtime has always
  // stored (`L.palette`/`extras[e].palette` are numeric strings).
  const palExOut = ex => {
    if (!ex || typeof ex !== "object" || ex.palette == null) return ex;
    const id = palIdOut(ex.palette);
    return id ? { ...ex, palette: id } : ex;
  };
  const palLayersOut = ls => (Array.isArray(ls)
    ? ls.map(L => {
        if (!L || typeof L !== "object" || L.palette == null) return L;
        const id = palIdOut(L.palette);
        return id ? { ...L, palette: id } : L;
      })
    : ls);
  const palListOut = a => (Array.isArray(a) ? a.map(palIdOut).filter(Boolean) : a);
  // Decode halves. `customs` is the blob's own (already-validated) `palettes` list, which is
  // where a custom id resolves — see palIdxIn.
  // ---- CUSTOM PALETTES TRAVEL WITH THE SCENES THAT USE THEM ------------------------------
  // The decode side has always been ready for this: deserializeBlob resolves palette ids
  // against the blob's OWN `palettes` list, and applyBlob installs it before validating any
  // palette value. Nothing ever put the list INTO a shared payload, so a published profile or
  // a share link naming a custom ramp arrived with an id that resolved to nothing, and the
  // scene silently fell back to a built-in -- the recipient saw the wrong colours with no
  // hint that anything was missing.
  //
  // Takes a SERIALIZED blob, so every reference is already a string id and there is one form
  // to scan rather than three. Returns null when the blob names no customs at all, which is
  // the common case and keeps those payloads BYTE-IDENTICAL to what they have always been --
  // no key appears, so every link minted before this still decodes to exactly the same bytes.
  function palettesUsedBy(b) {
    if (!b || typeof b !== "object") return null;
    const want = new Set();
    const note = v => { if (typeof v === "string" && PAL_IDS.indexOf(v) < 0) want.add(v); };
    const ex = x => { if (x && typeof x === "object") note(x.palette); };
    ex(b.extra);
    if (b.extras && typeof b.extras === "object") for (const k in b.extras) ex(b.extras[k]);
    if (Array.isArray(b.layers)) b.layers.forEach(L => { if (L) note(L.palette); });
    if (Array.isArray(b.presets)) b.presets.forEach(p => {
      if (!p || typeof p !== "object") return;
      ex(p.extra);
      if (Array.isArray(p.layers)) p.layers.forEach(L => { if (L) note(L.palette); });
    });
    if (!want.size) return null;
    // Only the ramps actually referenced. Sending the whole custom tail would publish work
    // that has nothing to do with the scenes being shared, and grow every payload against the
    // rules' size cap for no reason.
    const used = customPalettes().filter(d => want.has(d.id));
    return used.length ? used : null;
  }
  const palExIn = (ex, customs) => {
    if (!ex || typeof ex !== "object" || ex.palette == null) return ex;
    const i = palIdxIn(ex.palette, customs);
    if (i < 0) { const c = { ...ex }; delete c.palette; return c; }
    return { ...ex, palette: String(i) };
  };
  const palLayersIn = (ls, customs) => (Array.isArray(ls)
    ? ls.map(L => {
        if (!L || typeof L !== "object" || L.palette == null) return L;
        const i = palIdxIn(L.palette, customs);
        if (i < 0) { const c = { ...L }; delete c.palette; return c; }
        return { ...L, palette: String(i) };
      })
    : ls);
  const palListIn = (a, customs) => (Array.isArray(a)
    ? a.map(v => palIdxIn(v, customs)).filter(i => i >= 0) : a);
  const mapValues = (m, fn) => {
    const out = {};
    for (const k in m) out[k] = fn(m[k]);
    return out;
  };
  function serializeBlob(b) {                      // numeric effect indices → ids, for storage
    const out = { ...b };
    if (typeof b.effect === "number") out.effect = effectId(b.effect);
    if (Array.isArray(b.presets)) out.presets = b.presets.map(p => {
      if (!p || typeof p !== "object") return p;
      const q = { ...p, extra: palExOut(p.extra) };
      if (typeof p.effect === "number") q.effect = effectId(p.effect);
      if (Array.isArray(p.layers)) q.layers = palLayersOut(p.layers);
      return q;
    });
    for (const f of EFFECT_MAPS) if (b[f] && typeof b[f] === "object") out[f] = keysToIds(b[f]);
    if (out.extras && typeof out.extras === "object") out.extras = mapValues(out.extras, palExOut);
    if (Array.isArray(b.layers)) out.layers = palLayersOut(b.layers);
    if (Array.isArray(b.palUse)) out.palUse = palListOut(b.palUse);
    if (Array.isArray(b.palGone)) out.palGone = palListOut(b.palGone);
    return out;
  }
  function deserializeBlob(b) {                    // ids (or legacy numbers) → numeric indices; drops unknown-effect presets
    if (!b || typeof b !== "object") return b;
    const out = { ...b };
    // The custom list first: it is what the palette refs below resolve their ids against,
    // and normalizing it HERE (rather than only in applyBlob) pins the positions — applyBlob
    // installs this same validated list, so an id resolved to PAL_BUILTIN+n now still names
    // that ramp after the install. customPalettesOk is idempotent, so the second run in
    // applyBlob sees it unchanged.
    if (b.palettes !== undefined) out.palettes = customPalettesOk(b.palettes);
    const customs = out.palettes;
    if (b.effect !== undefined) { const i = effectIndexFromId(b.effect); if (i >= 0) out.effect = i; else delete out.effect; }
    if (Array.isArray(b.presets)) out.presets = b.presets.map(p => {
      if (!p || typeof p !== "object") return null;
      const i = effectIndexFromId(p.effect);
      if (i < 0) return null;
      const q = { ...p, effect: i, extra: palExIn(p.extra, customs) };
      if (Array.isArray(p.layers)) q.layers = palLayersIn(p.layers, customs);
      return q;
    }).filter(Boolean);
    for (const f of EFFECT_MAPS) if (b[f] && typeof b[f] === "object") out[f] = keysToIdx(b[f]);
    if (out.extras && typeof out.extras === "object") out.extras = mapValues(out.extras, ex => palExIn(ex, customs));
    if (Array.isArray(b.layers)) out.layers = palLayersIn(b.layers, customs);
    if (Array.isArray(b.palUse)) out.palUse = palListIn(b.palUse, customs);
    if (Array.isArray(b.palGone)) out.palGone = palListIn(b.palGone, customs);
    return out;
  }
  // Per-effect slider presets, loaded whenever an effect becomes active (manual
  // pick, Reset, or the auto-cycle). Arrays are [lo,hi] for ranged sliders; a
  // bare number is a simple slider. Each effect gets its own tuned look.
  // Each effect keeps its own slider values, seeded from its descriptor's `defaults`.
  // Switching saves the outgoing effect's sliders and restores the incoming effect's,
  // so per-effect tweaks are kept. The whole thing is mirrored to localStorage and
  // restored next visit — values outside a slider's current bounds are ignored, so
  // changing a slider's range can never load stale/junk values. `defaults` includes a
  // few render-affecting keys the effect doesn't display (e.g. band) at safe values so
  // switching to it resets them rather than inheriting the previous effect's.
  const states = {};
