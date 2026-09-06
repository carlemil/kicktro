  // ---- per-effect controls, generated from the CONTROLS schema ----
  // One entry per slider/checkbox; buildControls() renders the DOM (exactly what
  // bindRange/bind/makeChips expect) into the Effect section (`fx`) or the Colour
  // section's banding block (`band`), and setEffect shows only the keys listed in the
  // current effect's `params`. Adding a slider to a new effect = add a CONTROLS entry
  // and list its key in the descriptor's `params` — no hand-written HTML. Defaults for
  // the lo/hi thumbs are cosmetic (loadState overwrites them from the effect's defaults).
  // Every slider readout goes through this: at most 3 significant digits, with
  // trailing zeros trimmed — 0.00111, 0.0123, 21.5, 1000. Sliders are continuous
  // (step="any"), so a fixed number of decimals would either hide real movement
  // or print noise like 0.012340000000000001.
  const sig3 = v => String(Number((+v).toPrecision(3)));
  const CONTROLS = [
    { key: "showbox", host: "fx", group: "shape", type: "check", label: "Show box" },
    { key: "boxsize", host: "fx", group: "shape", type: "dual", label: "Box size", valId: "vBoxSize", min: 0.8, max: 5, step: 0.05, lo: 2, hi: 2, fmt: v => sig3(v) + "×", apply: v => boxSize = v, durScale: 10 },
    // max raised 8000 → 24000 for Fractal flames, whose whole picture is point DENSITY —
    // a range change only: every stored value stays in bounds, RNG_ORIG follows.
    { key: "points", host: "fx", group: "shape", type: "dual", label: "Points", valId: "vPoints", min: 100, max: 24000, step: 50, lo: 2500, hi: 2500, fmt: v => sig3(v), apply: v => cfg.points = Math.round(v), durScale: 10 },
    { key: "layers", host: "fx", group: "shape", type: "layers", label: "Objects", valId: "vLayers" },
    { key: "speed", host: "fx", group: "shape", type: "dual", label: "Drift speed", valId: "vSpeed", min: 1, max: 300, step: 1, lo: 92, hi: 92, fmt: v => sig3(v), apply: v => cfg.speed = v / 100 },

    { key: "size", host: "fx", group: "shape", type: "dual", label: "Size", valId: "vSize", min: 0.3, max: 5, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => fractalSize = v, durScale: 10 },
    { key: "rot", host: "fx", group: "shape", type: "dual", label: "Rotation", valId: "vRot", min: -180, max: 180, step: 1, lo: 0, hi: 0, fmt: v => sig3(v) + "°/s", apply: v => rotSpeed = v * Math.PI / 180, durScale: 10 },
    { key: "nod", host: "fx", group: "shape", type: "dual", label: "Box nod", valId: "vNod", min: 0, max: 90, step: 0.1, lo: 17.2, hi: 17.2, fmt: v => sig3(v) + "°", apply: v => nodAmp = v * Math.PI / 180, durScale: 10 },
    { key: "nodspd", host: "fx", group: "shape", type: "dual", label: "Nod speed", valId: "vNodSpd", min: 0, max: 4, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => nodSpd = v, durScale: 10 },
    { key: "sway", host: "fx", group: "shape", type: "dual", label: "Sway", valId: "vSway", min: 0, max: 1.2, step: 0.02, lo: 0.5, hi: 0.5, fmt: v => sig3(v) + "×", apply: v => swaySize = v, durScale: 10 },
    { key: "rpm", host: "fx", group: "cardioid", type: "dual", label: "Cardioid RPM", valId: "vRpm", min: 0, max: 4, step: 0.01, lo: 0.03, hi: 0.15, fmt: v => sig3(v), apply: v => juliaBigRpm = v, durScale: 10 },
    { key: "ratio", host: "fx", group: "cardioid", type: "dual", label: "Inner : outer ratio", valId: "vRatio", min: 1, max: 60, step: 0.5, lo: 21.5, hi: 21.5, fmt: v => sig3(v) + "×", apply: v => juliaRatio = v },
    { key: "inrad", host: "fx", group: "cardioid", type: "dual", label: "Inner radius", valId: "vInRad", min: 0, max: 0.5, step: 0.01, lo: 0.03, hi: 0.03, fmt: v => sig3(v), apply: v => juliaInnerR = v, durScale: 10 },
    { key: "outrad", host: "fx", group: "cardioid", type: "dual", label: "Outer radius", valId: "vOutRad", min: 0.5, max: 2.5, step: 0.01, lo: 1.05, hi: 1.05, fmt: v => sig3(v) + "×", apply: v => juliaOuterR = v, durScale: 10 },
    { key: "phase", host: "fx", group: "cardioid", type: "dual", label: "Cardioid start", valId: "vPhase", min: 0, max: 0.1, step: 0.001, lo: 0, hi: 0, fmt: v => sig3(v), apply: v => juliaPhase = v, durScale: 10 },
    // Slides the whole seed orbit along the real axis. Slider units are hundredths
    // of the complex plane (like Drift speed), so ±50 walks the orbit ±0.5 — enough
    // to ride it off the cardioid into the bulbs and back.
    { key: "cardx", host: "fx", group: "cardioid", type: "dual", label: "Cardioid X offset", valId: "vCardX", min: -50, max: 50, step: 1, lo: 0, hi: 0, fmt: v => (v > 0 ? "+" : "") + sig3(v), apply: v => juliaOffX = v / 100, durScale: 10 },
    { key: "pspeed", host: "fx", group: "plasma", type: "dual", label: "Speed", valId: "vPspeed", min: 0, max: 3, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => plasmaSpeed = v, durScale: 10 },
    { key: "pscale", host: "fx", group: "plasma", type: "dual", label: "Scale", valId: "vPscale", min: 0.3, max: 3, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => plasmaScale = v, durScale: 10 },
    { key: "pwarp", host: "fx", group: "plasma", type: "dual", label: "Warp", valId: "vPwarp", min: 0, max: 2, step: 0.05, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => plasmaWarp = v, durScale: 10 },
    { key: "tunspeed", host: "fx", group: "tunnel", type: "dual", label: "Fly speed", valId: "vTunSpeed", min: 0, max: 3, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => tunSpeed = v, durScale: 10 },
    { key: "tuntwist", host: "fx", group: "tunnel", type: "dual", label: "Twist", valId: "vTunTwist", min: -2, max: 2, step: 0.05, lo: 0.3, hi: 0.3, fmt: v => sig3(v), apply: v => tunTwist = v, durScale: 10 },
    { key: "tunrings", host: "fx", group: "tunnel", type: "dual", label: "Ring density", valId: "vTunRings", min: 1, max: 30, step: 0.5, lo: 10, hi: 10, fmt: v => sig3(v), apply: v => tunRings = v, durScale: 10 },
    { key: "mbcount", host: "fx", group: "metaball", type: "dual", single: true, label: "Ball count", valId: "vMbCount", min: 2, max: 16, step: 1, lo: 4, hi: 4, fmt: v => sig3(v), apply: v => mbCount = Math.round(v), durScale: 10 },   // max must stay <= the FS_METABALL loop bound (its hard ceiling)
    { key: "mbradius", host: "fx", group: "metaball", type: "dual", label: "Ball size", valId: "vMbRadius", min: 0.04, max: 0.3, step: 0.005, lo: 0.12, hi: 0.12, fmt: v => sig3(v), apply: v => mbRadius = v, durScale: 10 },
    { key: "mbspeed", host: "fx", group: "metaball", type: "dual", label: "Ball speed", valId: "vMbSpeed", min: 0, max: 3, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => mbSpeed = v, durScale: 10 },
    { key: "mbgain", host: "fx", group: "metaball", type: "dual", label: "Gain", valId: "vMbGain", min: 0.3, max: 3, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => mbGain = v, durScale: 10 },
    { key: "ksegments", host: "fx", group: "kaleido", type: "dual", single: true, label: "Segments", valId: "vKSeg", min: 3, max: 16, step: 1, lo: 6, hi: 6, fmt: v => sig3(v), apply: v => kSeg = Math.round(v), durScale: 10 },
    { key: "krotspeed", host: "fx", group: "kaleido", type: "dual", label: "Spin", valId: "vKRot", min: -1, max: 1, step: 0.02, lo: 0.2, hi: 0.2, fmt: v => sig3(v), apply: v => kRotSpeed = v, durScale: 10 },
    { key: "knoisespeed", host: "fx", group: "kaleido", type: "dual", label: "Flow", valId: "vKFlow", min: 0, max: 3, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => kNoiseSpeed = v, durScale: 10 },
    { key: "rzrot", host: "fx", group: "rotozoom", type: "dual", label: "Rotation", valId: "vRzRot", min: -2, max: 2, step: 0.02, lo: 0.4, hi: 0.4, fmt: v => sig3(v), apply: v => rzRot = v, durScale: 10 },
    { key: "rzzoom", host: "fx", group: "rotozoom", type: "dual", label: "Zoom pulse", valId: "vRzZoom", min: 0, max: 1.5, step: 0.02, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => rzZoomAmt = v, durScale: 10 },
    { key: "rztile", host: "fx", group: "rotozoom", type: "dual", label: "Tile density", valId: "vRzTile", min: 1, max: 12, step: 0.5, lo: 4, hi: 4, fmt: v => sig3(v), apply: v => rzTile = v, durScale: 10 },
    { key: "xorspeed", host: "fx", group: "munch", type: "dual", label: "Munch speed", valId: "vXorSpeed", min: 0, max: 80, step: 1, lo: 20, hi: 20, fmt: v => sig3(v), apply: v => xorSpeed = v, durScale: 10 },
    { key: "xorscale", host: "fx", group: "munch", type: "dual", label: "Square size", valId: "vXorScale", min: 0.1, max: 2, step: 0.02, lo: 0.4, hi: 0.4, fmt: v => sig3(1 / v) + "px", apply: v => xorScale = v, durScale: 10 },
    { key: "xormask", host: "fx", group: "munch", type: "dual", label: "Detail", valId: "vXorMask", min: 15, max: 255, step: 1, lo: 255, hi: 255, fmt: v => sig3(v), apply: v => xorMask = Math.round(v), durScale: 10 },
    { key: "mofreq", host: "fx", group: "moire", type: "dual", label: "Ring frequency", valId: "vMoFreq", min: 2, max: 40, step: 0.5, lo: 10, hi: 10, fmt: v => sig3(v), apply: v => moFreq = v, durScale: 10 },
    { key: "modrift", host: "fx", group: "moire", type: "dual", label: "Drift speed", valId: "vMoDrift", min: 0, max: 3, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => moDrift = v, durScale: 10 },
    { key: "momix", host: "fx", group: "moire", type: "dual", label: "Blend", valId: "vMoMix", min: 0, max: 1, step: 0.02, lo: 0.3, hi: 0.3, fmt: v => sig3(v), apply: v => moMix = v, durScale: 10 },
    { key: "nwspin", host: "fx", group: "newton", type: "dual", label: "Root spin", valId: "vNwSpin", min: -1, max: 1, step: 0.01, lo: 0.15, hi: 0.15, fmt: v => sig3(v), apply: v => nwSpin = v, durScale: 10 },
    { key: "nwrelax", host: "fx", group: "newton", type: "dual", label: "Relaxation", valId: "vNwRelax", min: 0.4, max: 1.8, step: 0.02, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => nwRelax = v, durScale: 10 },
    // FLOAT now — the fractal morphs continuously through fractional exponents. This used
    // to round, for two orbit-side reasons that are both handled elsewhere today: the
    // parametric cardioid only closes for integer d (the seed rides cardioidBlendAt, a
    // blend of the two neighbouring integer curves — closed for every d), and the cusp
    // easing needs an integer count (juliaEase keys off round(power)−1). The RENDER always
    // took a float uniform; z^d at fractional d shows the principal-branch seam ray along
    // the negative real axis, which is characteristic of every fractional multibrot and
    // part of the look, not a bug. (The old measurement — ~40–55% of a lap inside the
    // locus riding the RAW fractional curve — is what the blend fixes; juliaprobe pins it.)
    { key: "mbexp", host: "fx", group: "multibrot", type: "dual", label: "Power", valId: "vMbExp", min: 2, max: 6, step: 0.05, lo: 2, hi: 4, fmt: v => sig3(v), apply: v => mbPower = v, durScale: 10 },
    { key: "cbcount", host: "fx", group: "copper", type: "dual", single: true, label: "Bar count", valId: "vCbCount", min: 1, max: 12, step: 1, lo: 5, hi: 5, fmt: v => sig3(v), apply: v => cbCount = Math.round(v), durScale: 10 },
    { key: "cbspeed", host: "fx", group: "copper", type: "dual", label: "Bar speed", valId: "vCbSpeed", min: 0, max: 3, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => cbSpeed = v, durScale: 10 },
    { key: "cbwidth", host: "fx", group: "copper", type: "dual", label: "Bar width", valId: "vCbWidth", min: 0.02, max: 0.3, step: 0.005, lo: 0.12, hi: 0.12, fmt: v => sig3(v), apply: v => cbWidth = v, durScale: 10 },
    // Geometric shapes — Polygon
    // Shape grid
    // Density is a continuous zoom, not a count: the shader scales the grid by it
    // (g = p*uCells, cell = floor(g)), so a fractional value renders correctly and drifting
    // between two thumbs slides the grid smoothly instead of popping at each integer.
    { key: "phcount", host: "fx", group: "physarum", type: "dual", label: "Agents", valId: "vPhCount", min: 200, max: 6000, step: 50, lo: 2500, hi: 2500, fmt: v => sig3(Math.round(v)), apply: v => phCount = Math.round(v), durScale: 10 },
    { key: "phscatter", host: "fx", group: "physarum", type: "dual", label: "Scatter", valId: "vPhScatter", min: 0, max: 1, step: 0.01, lo: 0.3, hi: 0.3, fmt: v => sig3(v), apply: v => phScatter = v, durScale: 10 },
    { key: "phsize", host: "fx", group: "physarum", type: "dual", label: "Agent size", valId: "vPhSize", min: 0, max: 3, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => phSize = v, durScale: 10 },
    { key: "phsense", host: "fx", group: "physarum", type: "dual", label: "Sense", valId: "vPhSense", min: 1, max: 30, step: 1, lo: 9, hi: 9, fmt: v => sig3(Math.round(v)) + "px", apply: v => phSense = Math.round(v), durScale: 10 },
    { key: "phturn", host: "fx", group: "physarum", type: "dual", label: "Turn", valId: "vPhTurn", min: 0.05, max: 1.6, step: 0.01, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => phTurn = v, durScale: 10 },
    { key: "phdecay", host: "fx", group: "physarum", type: "dual", label: "Trail life", valId: "vPhDecay", min: 0.5, max: 0.995, step: 0.005, lo: 0.88, hi: 0.88, fmt: v => sig3(v), apply: v => phDecay = v, durScale: 10 },
    { key: "phspeed", host: "fx", group: "physarum", type: "dual", label: "Speed", valId: "vPhSpeed", min: 0.1, max: 3, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => phSpeed = v, durScale: 10 },
    { key: "cucount", host: "fx", group: "curl", type: "dual", label: "Particles", valId: "vCuCount", min: 200, max: 8000, step: 50, lo: 900, hi: 900, fmt: v => sig3(Math.round(v)), apply: v => cuCount = Math.round(v), durScale: 10 },
    { key: "cuscale", host: "fx", group: "curl", type: "dual", label: "Field scale", valId: "vCuScale", min: 0.2, max: 8, step: 0.05, lo: 2.2, hi: 2.2, fmt: v => sig3(v), apply: v => cuScale = v, durScale: 10 },
    { key: "cuspeed", host: "fx", group: "curl", type: "dual", label: "Flow", valId: "vCuSpeed", min: 0.05, max: 4, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => cuSpeed = v, durScale: 10 },
    { key: "culife", host: "fx", group: "curl", type: "dual", label: "Lifetime", valId: "vCuLife", min: 0.2, max: 10, step: 0.1, lo: 2.5, hi: 2.5, fmt: v => sig3(v) + "s", apply: v => cuLife = v, durScale: 10 },
    { key: "clcover", host: "fx", group: "clouds", type: "dual", label: "Cover", valId: "vClCover", min: 0.1, max: 1, step: 0.01, lo: 0.55, hi: 0.55, fmt: v => sig3(v), apply: v => clCover = v, durScale: 10 },
    { key: "clscale", host: "fx", group: "clouds", type: "dual", label: "Scale", valId: "vClScale", min: 0.15, max: 4, step: 0.05, lo: 1.1, hi: 1.1, fmt: v => sig3(v), apply: v => clScale = v, durScale: 10 },
    { key: "cloct", host: "fx", group: "clouds", type: "dual", label: "Detail", valId: "vClOct", min: 1, max: 6, step: 1, lo: 4, hi: 4, fmt: v => sig3(Math.round(v)), apply: v => clOct = Math.round(v), durScale: 10 },
    { key: "cllight", host: "fx", group: "clouds", type: "dual", label: "Sun", valId: "vClLight", min: 0, max: 3, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => clLight = v, durScale: 10 },
    { key: "clspeed", host: "fx", group: "clouds", type: "dual", label: "Drift", valId: "vClSpeed", min: 0, max: 4, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => clSpeed = v, durScale: 10 },
    { key: "grdecay", host: "fx", group: "godray", type: "dual", label: "Reach", valId: "vGrDecay", min: 0.8, max: 0.999, step: 0.001, lo: 0.96, hi: 0.96, fmt: v => sig3(v), apply: v => grDecay = v, durScale: 10 },
    { key: "grweight", host: "fx", group: "godray", type: "dual", label: "Brightness", valId: "vGrWeight", min: 0, max: 3, step: 0.01, lo: 1.1, hi: 1.1, fmt: v => sig3(v), apply: v => grWeight = v, durScale: 10 },
    { key: "grscale", host: "fx", group: "godray", type: "dual", label: "Cloud scale", valId: "vGrScale", min: 0.2, max: 8, step: 0.05, lo: 2.2, hi: 2.2, fmt: v => sig3(v), apply: v => grScale = v, durScale: 10 },
    { key: "grspread", host: "fx", group: "godray", type: "dual", label: "Spread", valId: "vGrSpread", min: 0.05, max: 3, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => grSpread = v, durScale: 10 },
    { key: "grspeed", host: "fx", group: "godray", type: "dual", label: "Drift", valId: "vGrSpeed", min: 0, max: 4, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => grSpeed = v, durScale: 10 },
    { key: "teheight", host: "fx", group: "terrain", type: "dual", label: "Relief", valId: "vTeHeight", min: 0.05, max: 5, step: 0.05, lo: 1.6, hi: 1.6, fmt: v => sig3(v), apply: v => teHeight = v, durScale: 10 },
    { key: "tescale", host: "fx", group: "terrain", type: "dual", label: "Scale", valId: "vTeScale", min: 0.05, max: 3, step: 0.01, lo: 0.55, hi: 0.55, fmt: v => sig3(v), apply: v => teScale = v, durScale: 10 },
    { key: "teoct", host: "fx", group: "terrain", type: "dual", label: "Detail", valId: "vTeOct", min: 1, max: 7, step: 1, lo: 5, hi: 5, fmt: v => sig3(Math.round(v)), apply: v => teOct = Math.round(v), durScale: 10 },
    { key: "tefog", host: "fx", group: "terrain", type: "dual", label: "Haze", valId: "vTeFog", min: 0, max: 3, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => teFog = v, durScale: 10 },
    { key: "tespeed", host: "fx", group: "terrain", type: "dual", label: "Fly speed", valId: "vTeSpeed", min: 0, max: 4, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => teSpeed = v, durScale: 10 },
    { key: "apscale", host: "fx", group: "apollo", type: "dual", label: "Packing", valId: "vApScale", min: 0.7, max: 1.6, step: 0.01, lo: 1.15, hi: 1.15, fmt: v => sig3(v), apply: v => apScale = v, durScale: 10 },
    { key: "apiter", host: "fx", group: "apollo", type: "dual", label: "Detail", valId: "vApIter", min: 3, max: 12, step: 1, lo: 8, hi: 8, fmt: v => sig3(Math.round(v)), apply: v => apIter = Math.round(v), durScale: 10 },
    { key: "apthin", host: "fx", group: "apollo", type: "dual", label: "Halo", valId: "vApThin", min: 0.2, max: 3, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => apThin = v, durScale: 10 },
    { key: "apglow", host: "fx", group: "apollo", type: "dual", label: "Glow", valId: "vApGlow", min: 0, max: 2, step: 0.01, lo: 0.6, hi: 0.6, fmt: v => sig3(v), apply: v => apGlow = v, durScale: 10 },
    { key: "apspeed", host: "fx", group: "apollo", type: "dual", label: "Orbit speed", valId: "vApSpeed", min: 0, max: 3, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => apSpeed = v, durScale: 10 },
    { key: "bxscale", host: "fx", group: "mbox", type: "dual", label: "Scale", valId: "vMbScale", min: -3, max: 3, step: 0.01, lo: -1.7, hi: -1.7, fmt: v => sig3(v), apply: v => bxScale = v, durScale: 10 },
    { key: "bxfold", host: "fx", group: "mbox", type: "dual", label: "Fold", valId: "vMbFold", min: 0.5, max: 2, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => bxFold = v, durScale: 10 },
    { key: "bxiter", host: "fx", group: "mbox", type: "dual", label: "Detail", valId: "vMbIter", min: 3, max: 12, step: 1, lo: 8, hi: 8, fmt: v => sig3(Math.round(v)), apply: v => bxIter = Math.round(v), durScale: 10 },
    { key: "bxglow", host: "fx", group: "mbox", type: "dual", label: "Glow", valId: "vMbGlow", min: 0, max: 2, step: 0.01, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => bxGlow = v, durScale: 10 },
    { key: "bxspeed", host: "fx", group: "mbox", type: "dual", label: "Orbit speed", valId: "vMbSpeed", min: 0, max: 3, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => bxSpeed = v, durScale: 10 },
    { key: "gyfreq", host: "fx", group: "gyroid", type: "dual", label: "Cell size", valId: "vGyFreq", min: 0.4, max: 6, step: 0.05, lo: 2.2, hi: 2.2, fmt: v => sig3(v), apply: v => gyFreq = v, durScale: 10 },
    { key: "gythick", host: "fx", group: "gyroid", type: "dual", label: "Thickness", valId: "vGyThick", min: 0, max: 1.2, step: 0.01, lo: 0.35, hi: 0.35, fmt: v => sig3(v), apply: v => gyThick = v, durScale: 10 },
    { key: "gywarp", host: "fx", group: "gyroid", type: "dual", label: "Drift", valId: "vGyWarp", min: 0, max: 3, step: 0.01, lo: 0.6, hi: 0.6, fmt: v => sig3(v), apply: v => gyWarp = v, durScale: 10 },
    { key: "gyglow", host: "fx", group: "gyroid", type: "dual", label: "Glow", valId: "vGyGlow", min: 0, max: 2, step: 0.01, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => gyGlow = v, durScale: 10 },
    { key: "gyspeed", host: "fx", group: "gyroid", type: "dual", label: "Orbit speed", valId: "vGySpeed", min: 0, max: 3, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => gySpeed = v, durScale: 10 },
    { key: "vocells", host: "fx", group: "voronoi", type: "dual", label: "Cells", valId: "vVoCells", min: 1, max: 24, step: 0.5, lo: 6, hi: 6, fmt: v => sig3(v), apply: v => voCells = v, durScale: 10 },
    { key: "voedge", host: "fx", group: "voronoi", type: "dual", label: "Edge", valId: "vVoEdge", min: 0, max: 1, step: 0.01, lo: 0.6, hi: 0.6, fmt: v => sig3(v), apply: v => voEdge = v, durScale: 10 },
    { key: "vojit", host: "fx", group: "voronoi", type: "dual", label: "Wander", valId: "vVoJit", min: 0, max: 1, step: 0.01, lo: 0.7, hi: 0.7, fmt: v => sig3(v), apply: v => voJit = v, durScale: 10 },
    { key: "vospeed", host: "fx", group: "voronoi", type: "dual", label: "Speed", valId: "vVoSpeed", min: 0, max: 3, step: 0.01, lo: 0.5, hi: 0.5, fmt: v => sig3(v) + "×", apply: v => voSpeed = v, durScale: 10 },
    { key: "wnscale", host: "fx", group: "warpnoise", type: "dual", label: "Scale", valId: "vWnScale", min: 0.2, max: 10, step: 0.1, lo: 3, hi: 3, fmt: v => sig3(v), apply: v => wnScale = v, durScale: 10 },
    { key: "wnwarp", host: "fx", group: "warpnoise", type: "dual", label: "Warp", valId: "vWnWarp", min: 0, max: 10, step: 0.1, lo: 4, hi: 4, fmt: v => sig3(v), apply: v => wnWarp = v, durScale: 10 },
    { key: "wnoct", host: "fx", group: "warpnoise", type: "dual", label: "Detail", valId: "vWnOct", min: 1, max: 8, step: 1, lo: 5, hi: 5, fmt: v => sig3(Math.round(v)), apply: v => wnOct = Math.round(v), durScale: 10 },
    { key: "wnspeed", host: "fx", group: "warpnoise", type: "dual", label: "Flow", valId: "vWnSpeed", min: 0, max: 4, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => wnSpeed = v, durScale: 10 },
    { key: "trucells", host: "fx", group: "truchet", type: "dual", label: "Tiles", valId: "vTruCells", min: 1, max: 24, step: 0.5, lo: 6, hi: 6, fmt: v => sig3(v), apply: v => truCells = v, durScale: 10 },
    { key: "truwidth", host: "fx", group: "truchet", type: "dual", label: "Line width", valId: "vTruWidth", min: 0.02, max: 1, step: 0.01, lo: 0.35, hi: 0.35, fmt: v => sig3(v), apply: v => truWidth = v, durScale: 10 },
    { key: "truflip", host: "fx", group: "truchet", type: "dual", label: "Weave", valId: "vTruFlip", min: 0, max: 1, step: 0.01, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => truFlip = v, durScale: 10 },
    { key: "truspeed", host: "fx", group: "truchet", type: "dual", label: "Turn rate", valId: "vTruSpeed", min: 0, max: 4, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => truSpeed = v, durScale: 10 },
    { key: "sgcells", host: "fx", group: "shapegrid", type: "dual", label: "Density", valId: "vSgCells", min: 2, max: 24, step: 1, lo: 9, hi: 9, fmt: v => sig3(v), apply: v => sgCells = v, durScale: 10 },
    { key: "sgdot", host: "fx", group: "shapegrid", type: "dual", label: "Size", valId: "vSgDot", min: 0.05, max: 0.6, step: 0.01, lo: 0.3, hi: 0.3, fmt: v => sig3(v), apply: v => sgDot = v, durScale: 10 },
    { key: "sgsquare", host: "fx", group: "shapegrid", type: "dual", label: "Squareness", valId: "vSgSquare", min: 0, max: 1, step: 0.02, lo: 0, hi: 0, fmt: v => sig3(v), apply: v => sgSquare = v, durScale: 10 },
    { key: "sgpulse", host: "fx", group: "shapegrid", type: "dual", label: "Pulse", valId: "vSgPulse", min: 0, max: 1, step: 0.02, lo: 0.35, hi: 0.35, fmt: v => sig3(v), apply: v => sgPulse = v, durScale: 10 },
    { key: "sgspeed", host: "fx", group: "shapegrid", type: "dual", label: "Pulse speed", valId: "vSgSpeed", min: 0, max: 4, step: 0.05, lo: 1.2, hi: 1.2, fmt: v => sig3(v) + "×", apply: v => sgSpeed = v, durScale: 10 },
    // Concentric rings
    { key: "cosides", host: "fx", group: "concentric", type: "dual", single: true, label: "Sides", valId: "vCoSides", min: 3, max: 12, step: 1, lo: 6, hi: 6, fmt: v => sig3(v), apply: v => coSides = Math.round(v), durScale: 10 },
    { key: "cocount", host: "fx", group: "concentric", type: "dual", label: "Ring count", valId: "vCoCount", min: 1, max: 20, step: 1, lo: 6, hi: 6, fmt: v => sig3(v), apply: v => coCount = v, durScale: 10 },
    { key: "cothick", host: "fx", group: "concentric", type: "dual", label: "Thickness", valId: "vCoThick", min: 0.02, max: 0.98, step: 0.02, lo: 0.4, hi: 0.4, fmt: v => sig3(v), apply: v => coThick = v, durScale: 10 },
    { key: "cospeed", host: "fx", group: "concentric", type: "dual", label: "March speed", valId: "vCoSpeed", min: -3, max: 3, step: 0.05, lo: 0.6, hi: 0.6, fmt: v => sig3(v) + "×", apply: v => coSpeed = v, durScale: 10 },
    { key: "cospin", host: "fx", group: "concentric", type: "dual", label: "Spin", valId: "vCoSpin", min: -2, max: 2, step: 0.05, lo: 0.1, hi: 0.1, fmt: v => sig3(v) + "×", apply: v => coSpinSpeed = v, durScale: 10 },
    // Bouncing shapes
    { key: "bncount", host: "fx", group: "bounce", type: "dual", single: true, label: "Count", valId: "vBnCount", min: 1, max: 8, step: 1, lo: 4, hi: 4, fmt: v => sig3(v), apply: v => bnCount = Math.round(v), durScale: 10 },
    { key: "bnrad", host: "fx", group: "bounce", type: "dual", label: "Size", valId: "vBnRad", min: 0.02, max: 0.25, step: 0.005, lo: 0.09, hi: 0.09, fmt: v => sig3(v), apply: v => bnRad = v, durScale: 10 },
    { key: "bnsquare", host: "fx", group: "bounce", type: "dual", label: "Squareness", valId: "vBnSquare", min: 0, max: 1, step: 0.02, lo: 0.6, hi: 0.6, fmt: v => sig3(v), apply: v => bnSquare = v, durScale: 10 },
    { key: "bnmix", host: "fx", group: "bounce", type: "dual", single: true, label: "Shape mix", valId: "vBnMix", min: 1, max: 7, step: 1, lo: 7, hi: 7, fmt: v => sig3(v), apply: v => bnMix = Math.round(v), durScale: 10 },
    { key: "bnspin", host: "fx", group: "bounce", type: "dual", label: "Spin", valId: "vBnSpin", min: 0, max: 3, step: 0.01, lo: 0.8, hi: 0.8, fmt: v => sig3(v) + "×", apply: v => bnSpin = v, durScale: 10 },
    { key: "bnspeed", host: "fx", group: "bounce", type: "dual", label: "Speed", valId: "vBnSpeed", min: 0, max: 4, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => bnSpeed = v, durScale: 10 },
    // Bouncing solids (3D). Count/Size feed the physics as well as the shader — Size IS the
    // bounding radius every wall test uses, so widening it makes them bounce sooner too.
    { key: "sdcount", host: "fx", group: "solids", type: "dual", single: true, label: "Count", valId: "vSdCount", min: 1, max: 8, step: 1, lo: 5, hi: 5, fmt: v => sig3(v), apply: v => sdCount = Math.round(v), durScale: 10 },
    { key: "sdsize", host: "fx", group: "solids", type: "dual", label: "Size", valId: "vSdSize", min: 0.08, max: 0.5, step: 0.005, lo: 0.26, hi: 0.26, fmt: v => sig3(v), apply: v => sdSize = v, durScale: 10 },
    { key: "sdmix", host: "fx", group: "solids", type: "dual", single: true, label: "Shape mix", valId: "vSdMix", min: 1, max: 6, step: 1, lo: 6, hi: 6, fmt: v => sig3(v), apply: v => sdMix = Math.round(v), durScale: 10 },
    { key: "sdspeed", host: "fx", group: "solids", type: "dual", label: "Speed", valId: "vSdSpeed", min: 0, max: 4, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => sdSpeed = v, durScale: 10 },
    { key: "sdspin", host: "fx", group: "solids", type: "dual", label: "Tumble", valId: "vSdSpin", min: 0, max: 4, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => sdSpin = v, durScale: 10 },
    { key: "sdrim", host: "fx", group: "solids", type: "dual", label: "Edge glow", valId: "vSdRim", min: 0, max: 1.5, step: 0.02, lo: 0.55, hi: 0.55, fmt: v => sig3(v), apply: v => sdRim = v, durScale: 10 },
    { key: "ata", host: "fx", group: "attractor", type: "dual", label: "Coeff a", valId: "vAtA", min: -3, max: 3, step: 0.01, lo: 1.4, hi: 1.4, fmt: v => sig3(v), apply: v => atA = v, durScale: 10 },
    { key: "atb", host: "fx", group: "attractor", type: "dual", label: "Coeff b", valId: "vAtB", min: -3, max: 3, step: 0.01, lo: -2.3, hi: -2.3, fmt: v => sig3(v), apply: v => atB = v, durScale: 10 },
    { key: "atc", host: "fx", group: "attractor", type: "dual", label: "Coeff c", valId: "vAtC", min: -3, max: 3, step: 0.01, lo: 2.4, hi: 2.4, fmt: v => sig3(v), apply: v => atC = v, durScale: 10 },
    { key: "atd", host: "fx", group: "attractor", type: "dual", label: "Coeff d", valId: "vAtD", min: -3, max: 3, step: 0.01, lo: -2.1, hi: -2.1, fmt: v => sig3(v), apply: v => atD = v, durScale: 10 },
    { key: "atjit", host: "fx", group: "attractor", type: "dual", label: "Point jitter", valId: "vAtJit", min: 0, max: 3, step: 0.05, lo: 0.5, hi: 0.5, fmt: v => sig3(v) + "px", apply: v => atJit = v, durScale: 10 },
    { key: "sunscale", host: "fx", group: "sun", type: "dual", label: "Cell density", valId: "vSunScale", min: 4, max: 32, step: 0.5, lo: 14, hi: 14, fmt: v => sig3(v), apply: v => sunDensity = v, durScale: 10 },
    { key: "sunspeed", host: "fx", group: "sun", type: "dual", label: "Churn speed", valId: "vSunSpeed", min: 0, max: 3, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => sunSpeed = v, durScale: 10 },
    { key: "sunlane", host: "fx", group: "sun", type: "dual", label: "Lane width", valId: "vSunLane", min: 0.1, max: 1.2, step: 0.02, lo: 0.35, hi: 0.35, fmt: v => sig3(v), apply: v => sunLaneW = v, durScale: 10 },
    { key: "sunglow", host: "fx", group: "sun", type: "dual", label: "Brightness", valId: "vSunGlow", min: 0.5, max: 1.4, step: 0.02, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => sunGlow = v, durScale: 10 },
    { key: "sunspot", host: "fx", group: "sun", type: "dual", label: "Sunspot", valId: "vSunSpot", min: 0, max: 1, step: 0.02, lo: 0, hi: 0, fmt: v => v <= 0 ? "off" : sig3(v), apply: v => sunSpotAmt = v, durScale: 10 },
    { key: "kfbars", host: "fx", group: "kefrens", type: "dual", single: true, label: "Bars", valId: "vKfBars", min: 1, max: 12, step: 1, lo: 6, hi: 6, fmt: v => sig3(Math.round(v)), apply: v => kfBars = Math.round(v), durScale: 10 },
    { key: "kfsway", host: "fx", group: "kefrens", type: "dual", label: "Sway", valId: "vKfSway", min: 0, max: 0.45, step: 0.01, lo: 0.25, hi: 0.25, fmt: v => sig3(v), apply: v => kfSway = v, durScale: 10 },
    { key: "kfspeed", host: "fx", group: "kefrens", type: "dual", label: "Speed", valId: "vKfSpeed", min: 0, max: 3, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => kfSpeed = v, durScale: 10 },
    { key: "kfwidth", host: "fx", group: "kefrens", type: "dual", label: "Bar width", valId: "vKfWidth", min: 0.01, max: 0.15, step: 0.005, lo: 0.045, hi: 0.045, fmt: v => sig3(v), apply: v => kfWidth = v, durScale: 10 },
    { key: "twcols", host: "fx", group: "twister", type: "dual", single: true, label: "Columns", valId: "vTwCols", min: 1, max: 3, step: 1, lo: 1, hi: 1, fmt: v => sig3(Math.round(v)), apply: v => twCols = Math.round(v), durScale: 10 },
    { key: "twwidth", host: "fx", group: "twister", type: "dual", label: "Width", valId: "vTwWidth", min: 0.05, max: 0.4, step: 0.01, lo: 0.22, hi: 0.22, fmt: v => sig3(v), apply: v => twWidth = v, durScale: 10 },
    { key: "twtwist", host: "fx", group: "twister", type: "dual", label: "Twist", valId: "vTwTwist", min: -6, max: 6, step: 0.1, lo: 2, hi: 2, fmt: v => sig3(v), apply: v => twTwist = v, durScale: 10 },
    { key: "twspeed", host: "fx", group: "twister", type: "dual", label: "Speed", valId: "vTwSpeed", min: 0, max: 3, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => twSpeed = v, durScale: 10 },
    { key: "cymode", host: "fx", group: "chladni", type: "dual", label: "Mode", valId: "vCyMode", min: 1, max: 12, step: 0.05, lo: 3, hi: 3, fmt: v => sig3(v), apply: v => cyModeV = v, durScale: 10 },
    { key: "cymoff", host: "fx", group: "chladni", type: "dual", label: "Mode offset", valId: "vCyMoff", min: 0, max: 6, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => cyOff = v, durScale: 10 },
    { key: "cysharp", host: "fx", group: "chladni", type: "dual", label: "Sharpness", valId: "vCySharp", min: 1, max: 12, step: 0.1, lo: 5, hi: 5, fmt: v => sig3(v), apply: v => cySharp = v, durScale: 10 },
    { key: "cyshimmer", host: "fx", group: "chladni", type: "dual", label: "Shimmer", valId: "vCyShim", min: 0, max: 2, step: 0.05, lo: 0.4, hi: 0.4, fmt: v => sig3(v), apply: v => cyShim = v, durScale: 10 },
    { key: "ltstrike", host: "fx", group: "storm", type: "dual", label: "Strike", valId: "vLtStrike", min: 0, max: 1, step: 0.01, lo: 0, hi: 0, fmt: v => sig3(v), apply: v => ltStrikeV = v, durScale: 10 },
    { key: "ltrate", host: "fx", group: "storm", type: "dual", label: "Rate", valId: "vLtRate", min: 0, max: 3, step: 0.05, lo: 0.5, hi: 0.5, fmt: v => sig3(v) + "/s", apply: v => ltRateV = v, durScale: 10 },
    { key: "ltspd", host: "fx", group: "storm", type: "dual", label: "Strike speed", valId: "vLtSpd", min: 2, max: 40, step: 0.5, lo: 12, hi: 12, fmt: v => sig3(v) + "×", apply: v => ltSpdV = v, durScale: 10 },
    { key: "ltbolts", host: "fx", group: "storm", type: "dual", single: true, label: "Bolts", valId: "vLtBolts", min: 1, max: 5, step: 1, lo: 2, hi: 2, fmt: v => sig3(Math.round(v)), apply: v => ltBoltsV = Math.round(v), durScale: 10 },
    { key: "ltglow", host: "fx", group: "storm", type: "dual", label: "Afterglow", valId: "vLtGlow", min: 0, max: 1, step: 0.02, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => ltGlowV = v, durScale: 10 },
    { key: "bpdist", host: "fx", group: "bulb", type: "dual", label: "Distance", valId: "vBpDist", min: 0, max: 6, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => bpDist = v, durScale: 10 },
    { key: "bplift", host: "fx", group: "bulb", type: "dual", label: "Height", valId: "vBpLift", min: -3, max: 3, step: 0.05, lo: 0, hi: 0, fmt: v => sig3(v), apply: v => bpLift = v, durScale: 10 },
    { key: "bppower", host: "fx", group: "bulb", type: "dual", label: "Power", valId: "vBpPower", min: 2, max: 12, step: 0.05, lo: 8, hi: 8, fmt: v => sig3(v), apply: v => bpPower = v, durScale: 10 },
    { key: "bpdetail", host: "fx", group: "bulb", type: "dual", single: true, label: "Detail", valId: "vBpDetail", min: 3, max: 12, step: 1, lo: 7, hi: 7, fmt: v => sig3(Math.round(v)), apply: v => bpDetail = Math.round(v), durScale: 10 },
    { key: "bpspin", host: "fx", group: "bulb", type: "dual", label: "Orbit speed", valId: "vBpSpin", min: 0, max: 2, step: 0.02, lo: 0.35, hi: 0.35, fmt: v => sig3(v) + "×", apply: v => bpSpin = v, durScale: 10 },
    { key: "bpglow", host: "fx", group: "bulb", type: "dual", label: "Glow", valId: "vBpGlow", min: 0, max: 1.2, step: 0.02, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => bpGlow = v, durScale: 10 },
    { key: "flvar", host: "fx", group: "flames", type: "dual", single: true, label: "Variation", valId: "vFlVar", min: 1, max: 6, step: 1, lo: 3, hi: 3, fmt: v => ["", "Sinusoidal", "Spherical", "Swirl", "Horseshoe", "Polar", "Disc"][Math.round(v)] || "?", apply: v => flVar = Math.round(v), durScale: 10 },
    { key: "flmorph", host: "fx", group: "flames", type: "dual", label: "Morph speed", valId: "vFlMorph", min: 0, max: 2, step: 0.02, lo: 0.3, hi: 0.3, fmt: v => sig3(v) + "×", apply: v => flMorph = v, durScale: 10 },
    { key: "flglow", host: "fx", group: "flames", type: "dual", label: "Point glow", valId: "vFlGlow", min: 2, max: 120, step: 1, lo: 30, hi: 30, fmt: v => sig3(Math.round(v)), apply: v => flGlow = v, durScale: 10 },
    { key: "stdensity", host: "fx", group: "stars", type: "dual", label: "Star density", valId: "vStDensity", min: 0.4, max: 3, step: 0.05, lo: 1.2, hi: 1.2, fmt: v => sig3(v) + "×", apply: v => stDensity = v, durScale: 10 },
    { key: "stspeed", host: "fx", group: "stars", type: "dual", label: "Fly speed", valId: "vStSpeed", min: 0, max: 4, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => stSpeed = v, durScale: 10 },
    { key: "stwarp", host: "fx", group: "stars", type: "dual", label: "Warp", valId: "vStWarp", min: 0, max: 1, step: 0.01, lo: 0, hi: 0, fmt: v => sig3(v), apply: v => stWarp = v, durScale: 10 },
    { key: "sttwinkle", host: "fx", group: "stars", type: "dual", label: "Twinkle", valId: "vStTwinkle", min: 0, max: 2, step: 0.05, lo: 0.8, hi: 0.8, fmt: v => sig3(v), apply: v => stTwinkle = v, durScale: 10 },
    { key: "aucurtains", host: "fx", group: "aurora", type: "dual", single: true, label: "Curtains", valId: "vAuCurtains", min: 1, max: 5, step: 1, lo: 3, hi: 3, fmt: v => sig3(Math.round(v)), apply: v => auCurtains = Math.round(v), durScale: 10 },
    { key: "ausway", host: "fx", group: "aurora", type: "dual", label: "Sway", valId: "vAuSway", min: 0, max: 1, step: 0.02, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => auSway = v, durScale: 10 },
    { key: "auspeed", host: "fx", group: "aurora", type: "dual", label: "Speed", valId: "vAuSpeed", min: 0, max: 3, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => auSpeed = v, durScale: 10 },
    { key: "aushimmer", host: "fx", group: "aurora", type: "dual", label: "Shimmer", valId: "vAuShim", min: 0, max: 3, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => auShim = v, durScale: 10 },
    { key: "rdfeed", host: "fx", group: "rd", type: "dual", label: "Feed", valId: "vRdFeed", min: 0.01, max: 0.09, step: 0.001, lo: 0.03, hi: 0.03, fmt: v => sig3(v), apply: v => rdFeed = v, durScale: 10 },
    { key: "rdkill", host: "fx", group: "rd", type: "dual", label: "Kill", valId: "vRdKill", min: 0.04, max: 0.075, step: 0.0005, lo: 0.062, hi: 0.062, fmt: v => sig3(v), apply: v => rdKill = v, durScale: 10 },
    { key: "rdspeed", host: "fx", group: "rd", type: "dual", single: true, label: "Sim speed", valId: "vRdSpeed", min: 1, max: 16, step: 1, lo: 8, hi: 8, fmt: v => sig3(Math.round(v)) + "/f", apply: v => rdSpeedV = Math.round(v), durScale: 10 },
    { key: "rdgain", host: "fx", group: "rd", type: "dual", label: "Brightness", valId: "vRdGain", min: 0.4, max: 2, step: 0.02, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => rdGain = v, durScale: 10 },
    { key: "gxarms", host: "fx", group: "galaxy", type: "dual", single: true, label: "Arms", valId: "vGxArms", min: 1, max: 6, step: 1, lo: 2, hi: 2, fmt: v => sig3(Math.round(v)), apply: v => gxArms = Math.round(v), durScale: 10 },
    { key: "gxtwist", host: "fx", group: "galaxy", type: "dual", label: "Twist", valId: "vGxTwist", min: 0.15, max: 1.6, step: 0.01, lo: 0.55, hi: 0.55, fmt: v => sig3(v), apply: v => gxTwist = v, durScale: 10 },
    { key: "gxspin", host: "fx", group: "galaxy", type: "dual", label: "Spin", valId: "vGxSpin", min: -2, max: 2, step: 0.02, lo: 0.5, hi: 0.5, fmt: v => sig3(v) + "×", apply: v => gxSpin = v, durScale: 10 },
    { key: "gxcore", host: "fx", group: "galaxy", type: "dual", label: "Core", valId: "vGxCore", min: 0, max: 1.5, step: 0.02, lo: 0.35, hi: 0.35, fmt: v => sig3(v), apply: v => gxCore = v, durScale: 10 },
    { key: "gxscatter", host: "fx", group: "galaxy", type: "dual", label: "Scatter", valId: "vGxScat", min: 0, max: 1.2, step: 0.01, lo: 0.30, hi: 0.30, fmt: v => sig3(v), apply: v => gxScatter = v, durScale: 10 },
    { key: "hgratio", host: "fx", group: "harmo", type: "dual", label: "Frequency ratio", valId: "vHgRatio", min: 1, max: 7, step: 0.001, lo: 3, hi: 3, fmt: v => sig3(v), apply: v => hgRatio = v, durScale: 10 },
    { key: "hgdetune", host: "fx", group: "harmo", type: "dual", label: "Detune", valId: "vHgDet", min: 0, max: 0.06, step: 0.0005, lo: 0.012, hi: 0.012, fmt: v => sig3(v), apply: v => hgDetune = v, durScale: 10 },
    { key: "hgdecay", host: "fx", group: "harmo", type: "dual", label: "Damping", valId: "vHgDecay", min: 0.004, max: 0.09, step: 0.001, lo: 0.022, hi: 0.022, fmt: v => sig3(v), apply: v => hgDecay = v, durScale: 10 },
    { key: "hgmorph", host: "fx", group: "harmo", type: "dual", label: "Morph speed", valId: "vHgMorph", min: 0, max: 2, step: 0.02, lo: 0.35, hi: 0.35, fmt: v => sig3(v) + "×", apply: v => hgMorph = v, durScale: 10 },
    { key: "vbcount", host: "fx", group: "vballs", type: "dual", single: true, label: "Balls", valId: "vVbCount", min: 6, max: 48, step: 1, lo: 24, hi: 24, fmt: v => sig3(Math.round(v)), apply: v => vbCount = Math.round(v), durScale: 10 },
    { key: "vbshape", host: "fx", group: "vballs", type: "dual", single: true, label: "Formation", valId: "vVbShape", min: 0, max: 3, step: 1, lo: 1, hi: 1, fmt: v => ["Lattice", "Sphere", "Ring", "Helix"][Math.round(v)] || "", apply: v => vbShape = Math.round(v), durScale: 10 },
    { key: "vbsize", host: "fx", group: "vballs", type: "dual", label: "Ball size", valId: "vVbSize", min: 0.08, max: 0.6, step: 0.005, lo: 0.30, hi: 0.30, fmt: v => sig3(v), apply: v => vbRad = v, durScale: 10 },
    { key: "vbspin", host: "fx", group: "vballs", type: "dual", label: "Tumble", valId: "vVbSpin", min: 0, max: 2, step: 0.02, lo: 0.5, hi: 0.5, fmt: v => sig3(v) + "×", apply: v => vbSpin = v, durScale: 10 },
    { key: "vbglow", host: "fx", group: "vballs", type: "dual", label: "Edge glow", valId: "vVbGlow", min: 0, max: 1.5, step: 0.02, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => vbGlow = v, durScale: 10 },
    // Glass ball. Material is an enum, Balls a count -- both single.
    { key: "gbcount", host: "fx", group: "glass", type: "dual", single: true, label: "Balls", valId: "vGbCount", min: 1, max: 3, step: 1, lo: 3, hi: 3, fmt: v => sig3(Math.round(v)), apply: v => gbCount = Math.round(v), durScale: 10 },
    { key: "gbsize", host: "fx", group: "glass", type: "dual", label: "Size", valId: "vGbSize", min: 0.2, max: 1.2, step: 0.01, lo: 0.62, hi: 0.62, fmt: v => sig3(v), apply: v => gbRad = v, durScale: 10 },
    { key: "gbmat", host: "fx", group: "glass", type: "dual", single: true, label: "Material", valId: "vGbMat", min: 0, max: 2, step: 1, lo: 1, hi: 1, fmt: v => ["Metal", "Glass", "Bubble"][Math.round(v)] || "Glass", apply: v => gbMat = Math.round(v), durScale: 10 },
    { key: "gbior", host: "fx", group: "glass", type: "dual", label: "Refraction", valId: "vGbIor", min: 1.02, max: 2.2, step: 0.01, lo: 1.45, hi: 1.45, fmt: v => sig3(v), apply: v => gbIor = v, durScale: 10 },
    { key: "gbglow", host: "fx", group: "glass", type: "dual", label: "Edge glow", valId: "vGbGlow", min: 0, max: 1.5, step: 0.02, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => gbGlow = v, durScale: 10 },
    // Doughnut. Twist and Flutes are `single` because the flute pattern is
    // cos(flute·(tubeAngle + twist·arc)) over an atan2 `arc` — it only closes across the
    // branch cut when flute·twist is a whole number. A fractional twist draws a seam.
    // Trees. Count/Depth/Splits are single -- they count things, and a fractional branch
    // count is not a shape. Depth is also what the segment budget clamps (see TR_SEG_MAX).
    { key: "trwidth", host: "fx", group: "trees", type: "dual", label: "Branch width", valId: "vTrWidth", min: 0, max: 10, step: 0.5, lo: 3, hi: 3, fmt: v => sig3(v) + "px", apply: v => trWidth = v, durScale: 10 },
    { key: "trtaper", host: "fx", group: "trees", type: "dual", label: "Width taper", valId: "vTrTaper", min: 0.2, max: 1, step: 0.01, lo: 0.62, hi: 0.62, fmt: v => sig3(v), apply: v => trTaper = v, durScale: 10 },
    { key: "trcurve", host: "fx", group: "trees", type: "dual", label: "Bend", valId: "vTrCurve", min: 0, max: 2, step: 0.01, lo: 0.45, hi: 0.45, fmt: v => sig3(v), apply: v => trCurve = v, durScale: 10 },
    { key: "trcount", host: "fx", group: "trees", type: "dual", single: true, label: "Trees", valId: "vTrCount", min: 1, max: 5, step: 1, lo: 3, hi: 3, fmt: v => sig3(Math.round(v)), apply: v => trCount = Math.round(v), durScale: 10 },
    { key: "trdepth", host: "fx", group: "trees", type: "dual", single: true, label: "Depth", valId: "vTrDepth", min: 3, max: 11, step: 1, lo: 8, hi: 8, fmt: v => sig3(Math.round(v)), apply: v => trDepth = Math.round(v), durScale: 10 },
    { key: "trsplit", host: "fx", group: "trees", type: "dual", single: true, label: "Splits", valId: "vTrSplit", min: 2, max: 4, step: 1, lo: 2, hi: 2, fmt: v => sig3(Math.round(v)), apply: v => trSplit = Math.round(v), durScale: 10 },
    { key: "trangle", host: "fx", group: "trees", type: "dual", label: "Branch angle", valId: "vTrAngle", min: 5, max: 65, step: 0.5, lo: 28, hi: 28, fmt: v => sig3(v) + "°", apply: v => trAngle = v, durScale: 10 },
    { key: "trshrink", host: "fx", group: "trees", type: "dual", label: "Taper", valId: "vTrShrink", min: 0.45, max: 0.85, step: 0.005, lo: 0.72, hi: 0.72, fmt: v => sig3(v) + "×", apply: v => trShrink = v, durScale: 10 },
    { key: "trsway", host: "fx", group: "trees", type: "dual", label: "Sway", valId: "vTrSway", min: 0, max: 1.5, step: 0.01, lo: 0.35, hi: 0.35, fmt: v => sig3(v), apply: v => trSway = v, durScale: 10 },
    { key: "trspeed", host: "fx", group: "trees", type: "dual", label: "Wind speed", valId: "vTrSpeed", min: 0, max: 4, step: 0.02, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => trSpeed = v, durScale: 10 },
    // Flying ribbons. Count is single -- it counts bands. Twist is NOT: a fractional twist
    // is a perfectly good part-turn along the length, and a spread between the thumbs makes
    // the band wind and unwind, which is the whole reason to drift it.
    { key: "rbcount", host: "fx", group: "ribbons", type: "dual", single: true, label: "Ribbons", valId: "vRbCount", min: 1, max: 8, step: 1, lo: 4, hi: 4, fmt: v => sig3(Math.round(v)), apply: v => rbCount = Math.round(v), durScale: 10 },
    { key: "rbwidth", host: "fx", group: "ribbons", type: "dual", label: "Width", valId: "vRbWidth", min: 0.02, max: 1.2, step: 0.01, lo: 0.38, hi: 0.38, fmt: v => sig3(v), apply: v => rbWidth = v, durScale: 10 },
    { key: "rblen", host: "fx", group: "ribbons", type: "dual", label: "Length", valId: "vRbLen", min: 0.3, max: 3, step: 0.05, lo: 0.5, hi: 0.5, fmt: v => sig3(v) + "×", apply: v => rbLen = v, durScale: 10 },
    { key: "rbtwist", host: "fx", group: "ribbons", type: "dual", label: "Twist", valId: "vRbTwist", min: 0, max: 12, step: 0.05, lo: 2.5, hi: 2.5, fmt: v => sig3(v), apply: v => rbTwist = v, durScale: 10 },
    { key: "rbwave", host: "fx", group: "ribbons", type: "dual", label: "Waviness", valId: "vRbWave", min: 0, max: 3, step: 0.02, lo: 0.55, hi: 0.55, fmt: v => sig3(v), apply: v => rbWave = v, durScale: 10 },
    { key: "rbspeed", host: "fx", group: "ribbons", type: "dual", label: "Speed", valId: "vRbSpeed", min: -3, max: 3, step: 0.02, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => rbSpeed = v, durScale: 10 },
    { key: "dnring", host: "fx", group: "torus", type: "dual", label: "Ring radius", valId: "vDnRing", min: 1.5, max: 6, step: 0.05, lo: 3, hi: 3, fmt: v => sig3(v), apply: v => dnRing = v, durScale: 10 },
    { key: "dntube", host: "fx", group: "torus", type: "dual", label: "Tube radius", valId: "vDnTube", min: 0.25, max: 1.6, step: 0.01, lo: 0.8, hi: 0.8, fmt: v => sig3(v), apply: v => dnTube = v, durScale: 10 },
    { key: "dnspeed", host: "fx", group: "torus", type: "dual", label: "Speed", valId: "vDnSpeed", min: -3, max: 3, step: 0.02, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => dnSpeed = v, durScale: 10 },
    { key: "dntwist", host: "fx", group: "torus", type: "dual", label: "Twist", valId: "vDnTwist", min: -4, max: 4, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => dnTwist = v, durScale: 10 },
    { key: "dnflute", host: "fx", group: "torus", type: "dual", single: true, label: "Flutes", valId: "vDnFlute", min: 0, max: 12, step: 1, lo: 6, hi: 6, fmt: v => Math.round(v) === 0 ? "smooth" : sig3(Math.round(v)), apply: v => dnFlute = Math.round(v), durScale: 10 },
    { key: "dnglow", host: "fx", group: "torus", type: "dual", label: "Glow", valId: "vDnGlow", min: 0, max: 1.5, step: 0.02, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => dnGlow = v, durScale: 10 },
    { key: "gosurf", host: "fx", group: "ocean", type: "dual", single: true, label: "Surface", valId: "vGoSurf", min: 0, max: 3, step: 1, lo: 0, hi: 0, fmt: v => ["Sine chop", "Seascape", "Long swell", "Rolling noise"][Math.round(v)] || "?", apply: v => goSurf = Math.round(v), durScale: 10 },
    { key: "goswell", host: "fx", group: "ocean", type: "dual", label: "Swell", valId: "vGoSwell", min: 0, max: 2.5, step: 0.02, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => goSwell = v, durScale: 10 },
    { key: "gochop", host: "fx", group: "ocean", type: "dual", label: "Chop", valId: "vGoChop", min: 1, max: 6, step: 0.05, lo: 2.5, hi: 2.5, fmt: v => sig3(v), apply: v => goChop = v, durScale: 10 },
    { key: "gospeed", host: "fx", group: "ocean", type: "dual", label: "Speed", valId: "vGoSpeed", min: 0, max: 3, step: 0.02, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => goSpeed = v, durScale: 10 },
    { key: "gofoam", host: "fx", group: "ocean", type: "dual", label: "Foam", valId: "vGoFoam", min: 0.1, max: 1, step: 0.01, lo: 0.45, hi: 0.45, fmt: v => sig3(v), apply: v => goFoam = v, durScale: 10 },
    { key: "goheight", host: "fx", group: "ocean", type: "dual", label: "Wave height", valId: "vGoHeight", min: 0.05, max: 1.8, step: 0.01, lo: 0.7, hi: 0.7, fmt: v => sig3(v), apply: v => goHeight = v, durScale: 10 },
    { key: "goreflect", host: "fx", group: "ocean", type: "dual", label: "Reflection", valId: "vGoReflect", min: 0, max: 2, step: 0.02, lo: 0.6, hi: 0.6, fmt: v => sig3(v), apply: v => goReflect = v, durScale: 10 },
    { key: "gowind", host: "fx", group: "ocean", type: "dual", label: "Wind", valId: "vGoWind", min: 0, max: 360, step: 1, lo: 0, hi: 0, fmt: v => sig3(v) + "°", apply: v => goWind = v, durScale: 10 },
    { key: "bhtilt", host: "fx", group: "bhole", type: "dual", label: "Tilt", valId: "vBhTilt", min: 2, max: 80, step: 1, lo: 12, hi: 12, fmt: v => sig3(v) + "°", apply: v => bhTilt = v, durScale: 10 },
    { key: "bhouter", host: "fx", group: "bhole", type: "dual", label: "Disk size", valId: "vBhOuter", min: 4, max: 14, step: 0.1, lo: 8, hi: 8, fmt: v => sig3(v), apply: v => bhOuter = v, durScale: 10 },
    { key: "bhspin", host: "fx", group: "bhole", type: "dual", label: "Disk speed", valId: "vBhSpin", min: 0, max: 3, step: 0.02, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => bhSpin = v, durScale: 10 },
    { key: "bhbeam", host: "fx", group: "bhole", type: "dual", label: "Beaming", valId: "vBhBeam", min: 0, max: 1.5, step: 0.02, lo: 0.8, hi: 0.8, fmt: v => sig3(v), apply: v => bhBeam = v, durScale: 10 },
    { key: "bhorbit", host: "fx", group: "bhole", type: "dual", label: "Orbit speed", valId: "vBhOrbit", min: 0, max: 1, step: 0.01, lo: 0.08, hi: 0.08, fmt: v => sig3(v) + "×", apply: v => bhOrbSpd = v, durScale: 10 },
    { key: "qjslice", host: "fx", group: "qjulia", type: "dual", label: "Slice", valId: "vQjSlice", min: -1, max: 1, step: 0.005, lo: 0, hi: 0, fmt: v => sig3(v), apply: v => qjSlice = v, durScale: 10 },
    { key: "qjcut", host: "fx", group: "qjulia", type: "dual", label: "Cut angle", valId: "vQjCut", min: 0, max: 180, step: 1, lo: 0, hi: 0, fmt: v => sig3(v) + "°", apply: v => qjCut = v, durScale: 10 },
    { key: "qjdetail", host: "fx", group: "qjulia", type: "dual", single: true, label: "Detail", valId: "vQjDetail", min: 4, max: 12, step: 1, lo: 8, hi: 8, fmt: v => sig3(Math.round(v)), apply: v => qjDetail = Math.round(v), durScale: 10 },
    { key: "qjspin", host: "fx", group: "qjulia", type: "dual", label: "Orbit speed", valId: "vQjSpin", min: 0, max: 2, step: 0.02, lo: 0.3, hi: 0.3, fmt: v => sig3(v) + "×", apply: v => qjSpin = v, durScale: 10 },
    { key: "qjglow", host: "fx", group: "qjulia", type: "dual", label: "Glow", valId: "vQjGlow", min: 0, max: 1.2, step: 0.02, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => qjGlow = v, durScale: 10 },
    // Orientation of the solid itself -- the only way to turn it once the shared 3D world
    // has fixed the camera. Degrees, plus a tumble rate per axis in turns per minute.
    { key: "qjpitch", host: "fx", group: "qjulia", type: "dual", label: "Pitch", valId: "vQjPitch", min: -180, max: 180, step: 1, lo: 0, hi: 0, fmt: v => sig3(v) + "°", apply: v => qjPitch = v, durScale: 10 },
    { key: "qjyaw", host: "fx", group: "qjulia", type: "dual", label: "Yaw", valId: "vQjYaw", min: -180, max: 180, step: 1, lo: 0, hi: 0, fmt: v => sig3(v) + "°", apply: v => qjYaw = v, durScale: 10 },
    { key: "qjroll", host: "fx", group: "qjulia", type: "dual", label: "Roll", valId: "vQjRoll", min: -180, max: 180, step: 1, lo: 0, hi: 0, fmt: v => sig3(v) + "°", apply: v => qjRoll = v, durScale: 10 },
    { key: "qjtumx", host: "fx", group: "qjulia", type: "dual", label: "Tumble X", valId: "vQjTumX", min: -2, max: 2, step: 0.02, lo: 0, hi: 0, fmt: v => sig3(v) + "×", apply: v => qjTumX = v, durScale: 10 },
    { key: "qjtumy", host: "fx", group: "qjulia", type: "dual", label: "Tumble Y", valId: "vQjTumY", min: -2, max: 2, step: 0.02, lo: 0, hi: 0, fmt: v => sig3(v) + "×", apply: v => qjTumY = v, durScale: 10 },
    { key: "qjtumz", host: "fx", group: "qjulia", type: "dual", label: "Tumble Z", valId: "vQjTumZ", min: -2, max: 2, step: 0.02, lo: 0, hi: 0, fmt: v => sig3(v) + "×", apply: v => qjTumZ = v, durScale: 10 },
    { key: "mgdive", host: "fx", group: "menger", type: "dual", label: "Dive speed", valId: "vMgDive", min: 0, max: 2, step: 0.02, lo: 0.5, hi: 0.5, fmt: v => sig3(v) + "×", apply: v => mgDive = v, durScale: 10 },
    { key: "mgrot", host: "fx", group: "menger", type: "dual", label: "Roll", valId: "vMgRot", min: 0, max: 2, step: 0.02, lo: 0.3, hi: 0.3, fmt: v => sig3(v) + "×", apply: v => mgRot = v, durScale: 10 },
    { key: "mgiter", host: "fx", group: "menger", type: "dual", single: true, label: "Detail", valId: "vMgIter", min: 2, max: 5, step: 1, lo: 4, hi: 4, fmt: v => sig3(Math.round(v)), apply: v => mgIter = Math.round(v), durScale: 10 },
    { key: "mgglow", host: "fx", group: "menger", type: "dual", label: "Glow", valId: "vMgGlow", min: 0, max: 1.2, step: 0.02, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => mgGlow = v, durScale: 10 },
    { key: "bdcount", host: "fx", group: "boids", type: "dual", label: "Flock", valId: "vBdCount", min: 10, max: 200, step: 5, lo: 80, hi: 80, fmt: v => sig3(Math.round(v)), apply: v => bdCount = Math.round(v), durScale: 10 },
    { key: "bdspeed", host: "fx", group: "boids", type: "dual", label: "Speed", valId: "vBdSpeed", min: 0.2, max: 3, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => bdSpeedV = v, durScale: 10 },
    { key: "bdcoh", host: "fx", group: "boids", type: "dual", label: "Cohesion", valId: "vBdCoh", min: 0, max: 2, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => bdCoh = v, durScale: 10 },
    { key: "bdfear", host: "fx", group: "boids", type: "dual", label: "Scatter", valId: "vBdFear", min: 0, max: 1, step: 0.01, lo: 0, hi: 0, fmt: v => sig3(v), apply: v => bdFearV = v, durScale: 10 },
    { key: "zoom", host: "fx", group: "camera", type: "dual", label: "Zoom", valId: "vZoom", min: 0.5, max: 4, step: 0.05, lo: 1, hi: 1, fmt: v => sig3(v) + "×", apply: v => zoom = v, durScale: 10 },
    // Camera rotation, in degrees, shown for every effect. Global on purpose:
    // deliberately absent from every effect's `defaults`, so save/loadState (which
    // iterate the defaults) leave them alone and they persist across effect switches.
    { key: "camrx", host: "fx", group: "camera", type: "dual", label: "Camera X", valId: "vCamRX", min: -180, max: 180, step: 1, lo: 0, hi: 0, fmt: v => sig3(v) + "°", apply: v => camRX = v * Math.PI / 180, durScale: 10 },
    { key: "camry", host: "fx", group: "camera", type: "dual", label: "Camera Y", valId: "vCamRY", min: -180, max: 180, step: 1, lo: 0, hi: 0, fmt: v => sig3(v) + "°", apply: v => camRY = v * Math.PI / 180, durScale: 10 },
    { key: "camrz", host: "fx", group: "camera", type: "dual", label: "Camera Z", valId: "vCamRZ", min: -180, max: 180, step: 1, lo: 0, hi: 0, fmt: v => sig3(v) + "°", apply: v => camRZ = v * Math.PI / 180, durScale: 10 },
    // Field of view. Shown for the 33 SHADER effects only -- see the note on camFov: a
    // point effect stamps a destination and has no sample coordinate to bend.
    { key: "fov", host: "fx", group: "camera", type: "dual", label: "Field of view", valId: "vFov", min: -0.8, max: 2, step: 0.02, lo: 0, hi: 0, fmt: v => v === 0 ? "normal" : (v > 0 ? "wide " : "tele ") + sig3(Math.abs(v)), apply: v => camFov = v, durScale: 10 },
    // The shared 3D world. `world` is per LAYER and defaults OFF, so every scene saved
    // before it renders unchanged; the four placements say where this layer's geometry
    // stands in the Ocean's frame (water at y=0, camera at y=3.4).
    { key: "world", host: "fx", group: "world", type: "check", label: "Share one 3D world" },
    { key: "wldx", host: "fx", group: "world", type: "dual", label: "Place X", valId: "vWldX", min: -12, max: 12, step: 0.1, lo: 0, hi: 0, fmt: v => sig3(v), apply: v => wldX = v, durScale: 10 },
    { key: "wldy", host: "fx", group: "world", type: "dual", label: "Place Y", valId: "vWldY", min: -2, max: 10, step: 0.05, lo: 1.6, hi: 1.6, fmt: v => sig3(v), apply: v => wldY = v, durScale: 10 },
    { key: "wldz", host: "fx", group: "world", type: "dual", label: "Place Z", valId: "vWldZ", min: 1, max: 40, step: 0.1, lo: 6, hi: 6, fmt: v => sig3(v), apply: v => wldZ = v, durScale: 10 },
    { key: "wldscale", host: "fx", group: "world", type: "dual", label: "World scale", valId: "vWldScale", min: 0.1, max: 6, step: 0.05, lo: 1.2, hi: 1.2, fmt: v => sig3(v) + "×", apply: v => wldScale = v, durScale: 10 },
    { key: "randseed", host: "fx", group: "other", type: "check", label: "Random seed each reload" },
    // Palette cycle time, in seconds, as a [min,max] band: each morph holds for a
    // random time drawn from it (like Preset TTL). Collapsed to 0 = fixed palette.
    // This replaced the old "Auto-morph palettes" checkbox — `morphing` is now
    // derived from the slider rather than stored separately.
    // Bounds 0..2 / 0..10 by request (steps shrunk to match — 0..2 at step 1 is three
    // positions). A scene that stored a slower cycle under the old 0..120 bounds either
    // carries its own `ranges` (custom bounds travel per scene) or clamps to the new max
    // on load. The initial lo/hi must sit inside the new bounds (8 no longer does).
    { key: "palcycle", host: "pal", group: "palette", type: "dual", label: "Palette cycle", valId: "vPalCycle", min: 0, max: 2, step: 0.05, lo: 1, hi: 1, fmt: v => v <= 0 ? "fixed" : sig3(v) + "s", apply: v => palCycleLive = v, durScale: 10 },
    { key: "palhold", host: "pal", group: "palette", type: "dual", label: "Palette hold", valId: "vPalHold", min: 0, max: 10, step: 0.1, lo: 0, hi: 0, fmt: v => v <= 0 ? "none" : sig3(v) + "s", apply: v => palHoldLive = v, durScale: 10, beat: false },
    // Heat boost: remap the heat toward the palette's bright end (see heatBoost). 0 = the palette
    // as-is; per-layer (host "pal"), so each layer boosts its own palette. Animatable + beat-armable.
    { key: "heatboost", host: "pal", group: "palette", type: "dual", label: "Heat boost", valId: "vHeatBoost", min: 0, max: 4, step: 0.05, lo: 0, hi: 0, fmt: v => v <= 0 ? "off" : "+" + sig3(v), apply: v => heatBoost = v, durScale: 10 },
    // ---- filter parameters. Contiguous, one group per filter, host "filter" so
    // they render in the Filters box; shown only while their filter is ticked. ----
    { key: "rise", host: "filter", group: "f_fire", type: "dual", label: "Flame rise", valId: "vRise", min: 3, max: 200, step: 1, lo: 165, hi: 165, fmt: v => sig3(v), apply: v => cfg.decay = 128 * v / (v - 1) },
    { key: "burn", host: "filter", group: "f_fire", type: "dual", label: "Burn rate", valId: "vBurn", min: 20, max: 240, step: 1, lo: 120, hi: 120, fmt: v => sig3(v) + "/s", apply: v => cfg.burn = Math.max(1, v), durScale: 10 },
    { key: "fade", host: "filter", group: "f_fade", type: "dual", label: "Lifetime", valId: "vFade", min: 0.5, max: 0.995, step: 0.001, lo: 0.985, hi: 0.985, fmt: v => sig3(v * 100) + "%", apply: v => fadeKeep = v, durScale: 10 },
    { key: "diffuse", host: "filter", group: "f_diffuse", type: "dual", label: "Spread", valId: "vDiffuse", min: 0.5, max: 6, step: 0.1, lo: 3.6, hi: 3.6, fmt: v => sig3(v) + "px", apply: v => diffRad = v, durScale: 10 },
    { key: "diffkeep", host: "filter", group: "f_diffuse", type: "dual", label: "Lifetime", valId: "vDiffKeep", min: 0.5, max: 1, step: 0.001, lo: 0.985, hi: 0.985, fmt: v => sig3(v * 100) + "%", apply: v => diffKeep = v, durScale: 10 },
    { key: "echo", host: "filter", group: "f_echo", type: "dual", label: "Distance", valId: "vEcho", min: 0, max: 8, step: 0.1, lo: 4.5, hi: 4.5, fmt: v => sig3(v) + "px", apply: v => echoDist = v, durScale: 10 },
    { key: "echoang", host: "filter", group: "f_echo", type: "dual", label: "Angle", valId: "vEchoAng", min: 0, max: 360, step: 1, lo: 90, hi: 90, fmt: v => sig3(v) + "°", apply: v => echoAng = v, durScale: 10 },
    { key: "echokeep", host: "filter", group: "f_echo", type: "dual", label: "Lifetime", valId: "vEchoKeep", min: 0.5, max: 0.995, step: 0.001, lo: 0.94, hi: 0.94, fmt: v => sig3(v * 100) + "%", apply: v => echoKeep = v, durScale: 10 },
    { key: "zfb", host: "filter", group: "f_zoomfb", type: "dual", label: "Scale", valId: "vZfb", min: 0.9, max: 1.1, step: 0.001, lo: 1.02, hi: 1.02, fmt: v => sig3(v) + "×", apply: v => zfbScale = v, durScale: 10 },
    { key: "zfbkeep", host: "filter", group: "f_zoomfb", type: "dual", label: "Lifetime", valId: "vZfbKeep", min: 0.5, max: 0.995, step: 0.001, lo: 0.94, hi: 0.94, fmt: v => sig3(v * 100) + "%", apply: v => zfbKeep = v, durScale: 10 },
    { key: "swirl", host: "filter", group: "f_swirl", type: "dual", label: "Spin", valId: "vSwirl", min: -15, max: 15, step: 0.1, lo: 6, hi: 6, fmt: v => sig3(v) + "°", apply: v => swirlSpin = v, durScale: 10 },
    { key: "swirlkeep", host: "filter", group: "f_swirl", type: "dual", label: "Lifetime", valId: "vSwirlKeep", min: 0.5, max: 0.995, step: 0.001, lo: 0.94, hi: 0.94, fmt: v => sig3(v * 100) + "%", apply: v => swirlKeep = v, durScale: 10 },
    { key: "twist", host: "filter", group: "f_twist", type: "dual", label: "Amount", valId: "vTwist", min: -4, max: 4, step: 0.05, lo: 1.2, hi: 1.2, fmt: v => sig3(v), apply: v => twistAmt = v, durScale: 10 },
    { key: "wedgeseg", host: "filter", group: "f_wedge", type: "dual", single: true, label: "Segments", valId: "vWedgeSeg", min: 2, max: 16, step: 1, lo: 6, hi: 6, fmt: v => sig3(Math.round(v)), apply: v => wedgeSeg = Math.round(v), durScale: 10 },
    { key: "wedgerot", host: "filter", group: "f_wedge", type: "dual", label: "Spin", valId: "vWedgeRot", min: 0, max: 360, step: 1, lo: 0, hi: 0, fmt: v => sig3(v) + "°", apply: v => wedgeRot = v, durScale: 10 },
    { key: "glitch", host: "filter", group: "f_glitch", type: "dual", label: "Amount", valId: "vGlitch", min: 0, max: 0.5, step: 0.005, lo: 0.22, hi: 0.22, fmt: v => sig3(v * 100) + "%", apply: v => glitchAmt = v, durScale: 10 },
    { key: "noise", host: "filter", group: "f_noise", type: "dual", label: "Amount", valId: "vNoise", min: 0, max: 1, step: 0.01, lo: 0.4, hi: 0.4, fmt: v => sig3(v * 100) + "%", apply: v => noiseAmt = v, durScale: 10 },
    { key: "noiseseed", host: "filter", group: "f_noise", type: "dual", single: true, label: "Seed", valId: "vNoiseSeed", min: 0, max: 1, step: 1, lo: 1, hi: 1, fmt: v => ["Static", "Random"][Math.round(v)] || "Random", apply: v => noiseSeedMode = Math.round(v), durScale: 10 },
    { key: "glitchrows", host: "filter", group: "f_glitch", type: "dual", label: "Slice height", valId: "vGlitchRows", min: 1, max: 40, step: 1, lo: 10, hi: 10, fmt: v => sig3(v) + "px", apply: v => glitchRows = v, durScale: 10 },
    { key: "pixel", host: "filter", group: "f_pixelate", type: "dual", label: "Block", valId: "vPixel", min: 2, max: 40, step: 1, lo: 14, hi: 14, fmt: v => sig3(v) + "px", apply: v => pixelBlock = v, durScale: 10 },
    { key: "hexsize", host: "filter", group: "f_hexpix", type: "dual", label: "Cell", valId: "vHexSize", min: 3, max: 48, step: 1, lo: 20, hi: 20, fmt: v => sig3(v) + "px", apply: v => hexSize = v, durScale: 10 },
    { key: "crtmask", host: "filter", group: "f_crt", type: "dual", label: "Mask", valId: "vCrtMask", min: 0, max: 1, step: 0.02, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => crtMask = v, durScale: 10 },
    { key: "crtbleed", host: "filter", group: "f_crt", type: "dual", label: "Beam bleed", valId: "vCrtBleed", min: 0, max: 1, step: 0.02, lo: 0.4, hi: 0.4, fmt: v => sig3(v), apply: v => crtBleed = v, durScale: 10 },
    { key: "soften", host: "filter", group: "f_soften", type: "dual", label: "Amount", valId: "vSoften", min: -1, max: 2, step: 0.01, lo: -1, hi: -1, fmt: v => v < 0 ? "blur " + sig3(-v) : "sharp " + sig3(v), apply: v => softenAmt = v, durScale: 10 },
    { key: "softrad", host: "filter", group: "f_soften", type: "dual", label: "Radius", valId: "vSoftRad", min: 0.5, max: 6, step: 0.1, lo: 5.5, hi: 5.5, fmt: v => sig3(v) + "px", apply: v => softenRad = v, durScale: 10 },
    { key: "edge", host: "filter", group: "f_edge", type: "dual", label: "Amount", valId: "vEdge", min: 0, max: 1, step: 0.01, lo: 0.7, hi: 0.7, fmt: v => sig3(v), apply: v => edgeAmt = v, durScale: 10 },
    { key: "embamt", host: "filter", group: "f_emboss", type: "dual", label: "Depth", valId: "vEmbAmt", min: 0, max: 4, step: 0.05, lo: 1.6, hi: 1.6, fmt: v => sig3(v), apply: v => embAmt = v, durScale: 10 },
    { key: "embang", host: "filter", group: "f_emboss", type: "dual", label: "Light angle", valId: "vEmbAng", min: 0, max: 360, step: 1, lo: 135, hi: 135, fmt: v => sig3(v) + "°", apply: v => embAng = v, durScale: 10 },
    { key: "embmix", host: "filter", group: "f_emboss", type: "dual", label: "Metal", valId: "vEmbMix", min: 0, max: 1, step: 0.01, lo: 0.4, hi: 0.4, fmt: v => sig3(v), apply: v => embMix = v, durScale: 10 },
    { key: "dithlvl", host: "filter", group: "f_dither", type: "dual", label: "Levels", valId: "vDithLvl", min: 2, max: 12, step: 1, lo: 4, hi: 4, fmt: v => sig3(Math.round(v)), apply: v => dithLvl = Math.round(v), durScale: 10 },
    { key: "dithamt", host: "filter", group: "f_dither", type: "dual", label: "Stipple", valId: "vDithAmt", min: 0, max: 2, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => dithAmt = v, durScale: 10 },
    { key: "rblamt", host: "filter", group: "f_rblur", type: "dual", label: "Streak", valId: "vRblAmt", min: 0, max: 3, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => rblAmt = v, durScale: 10 },
    { key: "rblmix", host: "filter", group: "f_rblur", type: "dual", label: "Mix", valId: "vRblMix", min: 0, max: 1, step: 0.01, lo: 0.7, hi: 0.7, fmt: v => sig3(v), apply: v => rblMix = v, durScale: 10 },
    { key: "polamt", host: "filter", group: "f_polar", type: "dual", label: "Amount", valId: "vPolAmt", min: 0, max: 1, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => polAmt = v, durScale: 10 },
    { key: "polrep", host: "filter", group: "f_polar", type: "dual", label: "Repeat", valId: "vPolRep", min: 1, max: 12, step: 1, lo: 1, hi: 1, fmt: v => sig3(Math.round(v)) + "\u00d7", apply: v => polRep = Math.round(v), durScale: 10 },
    { key: "ascset", host: "filter", group: "f_ascii", type: "dual", single: true, label: "Script", valId: "vAscSet", min: 0, max: 7, step: 1, lo: 0, hi: 0, fmt: v => ["Latin", "Arabic", "Georgian", "Japanese", "Cyrillic", "Greek", "Braille", "Mixed"][Math.round(v)] || "Latin", apply: v => ascSet = Math.round(v), durScale: 10 },
    { key: "ascell", host: "filter", group: "f_ascii", type: "dual", label: "Cell", valId: "vAscCell", min: 3, max: 24, step: 1, lo: 8, hi: 8, fmt: v => sig3(Math.round(v)) + "px", apply: v => ascCell = Math.round(v), durScale: 10 },
    { key: "ascmix", host: "filter", group: "f_ascii", type: "dual", label: "Mix", valId: "vAscMix", min: 0, max: 1, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => ascMix = v, durScale: 10 },
    { key: "invamt", host: "filter", group: "f_invert", type: "dual", label: "Amount", valId: "vInvAmt", min: 0, max: 1, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => invAmt = v, durScale: 10 },
    { key: "dblamt", host: "filter", group: "f_dblur", type: "dual", label: "Length", valId: "vDblAmt", min: 0, max: 80, step: 1, lo: 24, hi: 24, fmt: v => sig3(v) + "px", apply: v => dblAmt = v, durScale: 10 },
    { key: "dblang", host: "filter", group: "f_dblur", type: "dual", label: "Angle", valId: "vDblAng", min: 0, max: 360, step: 1, lo: 0, hi: 0, fmt: v => sig3(v) + "\u00b0", apply: v => dblAng = v, durScale: 10 },
    { key: "anaamt", host: "filter", group: "f_anamorph", type: "dual", label: "Strength", valId: "vAnaAmt", min: 0, max: 3, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => anaAmt = v, durScale: 10 },
    { key: "analen", host: "filter", group: "f_anamorph", type: "dual", label: "Spread", valId: "vAnaLen", min: 10, max: 400, step: 1, lo: 90, hi: 90, fmt: v => sig3(v) + "px", apply: v => anaLen = v, durScale: 10 },
    { key: "poster", host: "filter", group: "f_poster", type: "dual", single: true, label: "Levels", valId: "vPoster", min: 2, max: 16, step: 1, lo: 3, hi: 3, fmt: v => sig3(Math.round(v)), apply: v => posterLevels = Math.round(v), durScale: 10 },
    { key: "halfdot", host: "filter", group: "f_halftone", type: "dual", label: "Dot size", valId: "vHalfDot", min: 2, max: 20, step: 0.5, lo: 6, hi: 6, fmt: v => sig3(v) + "px", apply: v => halfDot = v, durScale: 10 },
    { key: "halfamt", host: "filter", group: "f_halftone", type: "dual", label: "Amount", valId: "vHalfAmt", min: 0, max: 1, step: 0.01, lo: 0.9, hi: 0.9, fmt: v => sig3(v), apply: v => halfAmt = v, durScale: 10 },
    { key: "threshlvl", host: "filter", group: "f_thresh", type: "dual", label: "Level", valId: "vThreshLvl", min: 0, max: 1, step: 0.01, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => threshLevel = v, durScale: 10 },
    { key: "threshamt", host: "filter", group: "f_thresh", type: "dual", label: "Amount", valId: "vThreshAmt", min: 0, max: 1, step: 0.01, lo: 0.8, hi: 0.8, fmt: v => sig3(v), apply: v => threshAmt = v, durScale: 10 },
    { key: "chroma", host: "filter", group: "f_chroma", type: "dual", label: "Amount", valId: "vChroma", min: 0, max: 6, step: 0.05, lo: 2.8, hi: 2.8, fmt: v => sig3(v), apply: v => chromaAmt = v, durScale: 10 },
    { key: "mirror", host: "filter", group: "f_mirror", type: "dual", single: true, label: "Axis", valId: "vMirror", min: 1, max: 3, step: 1, lo: 1, hi: 1, fmt: v => ["", "X", "Y", "Both"][Math.round(v)] || "X", apply: v => mirrorMode = Math.round(v), durScale: 10 },
    { key: "shock", host: "filter", group: "f_shock", type: "dual", label: "Shock", valId: "vShock", min: 0, max: 1, step: 0.01, lo: 0, hi: 1, fmt: v => sig3(v), apply: v => shockAmt = v, durScale: 10 },
    { key: "shockamp", host: "filter", group: "f_shock", type: "dual", label: "Push", valId: "vShockAmp", min: 0, max: 0.2, step: 0.005, lo: 0.11, hi: 0.11, fmt: v => sig3(v), apply: v => shockAmp = v, durScale: 10 },
    { key: "shockwidth", host: "filter", group: "f_shock", type: "dual", label: "Ring width", valId: "vShockWidth", min: 0.02, max: 0.4, step: 0.01, lo: 0.16, hi: 0.16, fmt: v => sig3(v), apply: v => shockWidth = v, durScale: 10 },
    { key: "pxthresh", host: "filter", group: "f_pixsort", type: "dual", label: "Threshold", valId: "vPxThresh", min: 0, max: 1, step: 0.01, lo: 0.42, hi: 0.42, fmt: v => sig3(v), apply: v => pxThresh = v, durScale: 10 },
    { key: "pxstreak", host: "filter", group: "f_pixsort", type: "dual", label: "Streak", valId: "vPxStreak", min: 0, max: 1, step: 0.01, lo: 0.75, hi: 0.75, fmt: v => sig3(v), apply: v => pxStreak = v, durScale: 10 },
    { key: "pxdir", host: "filter", group: "f_pixsort", type: "dual", single: true, label: "Direction", valId: "vPxDir", min: 0, max: 3, step: 1, lo: 0, hi: 0, fmt: v => ["Down", "Up", "Right", "Left"][Math.round(v)] || "Down", apply: v => pxDir = Math.round(v), durScale: 10 },
    { key: "cellstates", host: "filter", group: "f_cell", type: "dual", single: true, label: "States", valId: "vCellStates", min: 3, max: 24, step: 1, lo: 12, hi: 12, fmt: v => sig3(Math.round(v)), apply: v => cellStates = Math.round(v), durScale: 10 },
    { key: "cellmix", host: "filter", group: "f_cell", type: "dual", label: "Blend", valId: "vCellMix", min: 0, max: 1, step: 0.01, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => cellMix = v, durScale: 10 },
    { key: "cellkeep", host: "filter", group: "f_cell", type: "dual", label: "Lifetime", valId: "vCellKeep", min: 0.85, max: 1, step: 0.002, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => cellKeep = v, durScale: 10 },
    { key: "lenssize", host: "filter", group: "f_lens", type: "dual", label: "Lens size", valId: "vLensSize", min: 0.1, max: 0.5, step: 0.01, lo: 0.28, hi: 0.28, fmt: v => sig3(v), apply: v => lensSize = v, durScale: 10 },
    { key: "lensmag", host: "filter", group: "f_lens", type: "dual", label: "Magnify", valId: "vLensMag", min: 1, max: 3, step: 0.05, lo: 1.8, hi: 1.8, fmt: v => sig3(v) + "×", apply: v => lensMag = v, durScale: 10 },
    { key: "lensspeed", host: "filter", group: "f_lens", type: "dual", label: "Wander", valId: "vLensSpeed", min: 0, max: 2, step: 0.05, lo: 0.6, hi: 0.6, fmt: v => sig3(v) + "×", apply: v => lensSpeed = v, durScale: 10 },
    { key: "drdepth", host: "filter", group: "f_droste", type: "dual", label: "Depth", valId: "vDrDepth", min: 1.3, max: 4, step: 0.05, lo: 2, hi: 2, fmt: v => sig3(v), apply: v => drosteDepth = v, durScale: 10 },
    { key: "drtwist", host: "filter", group: "f_droste", type: "dual", label: "Spiral", valId: "vDrTwist", min: -1.5, max: 1.5, step: 0.05, lo: 0.5, hi: 0.5, fmt: v => sig3(v), apply: v => drosteTwist = v, durScale: 10 },
    { key: "kuwrad", host: "filter", group: "f_kuwahara", type: "dual", single: true, label: "Brush size", valId: "vKuwRad", min: 1, max: 6, step: 1, lo: 6, hi: 6, fmt: v => sig3(Math.round(v)) + "px", apply: v => kuwRad = Math.round(v), durScale: 10 },
    { key: "bloom", host: "filter", group: "f_bloom", type: "dual", label: "Strength", valId: "vBloom", min: 0, max: 1.5, step: 0.01, lo: 0.35, hi: 0.35, fmt: v => sig3(v) + "×", apply: v => { bloomRaw = v; bloomAmt = filterOn("bloom") ? v : 0; }, durScale: 10 },
    { key: "barrel", host: "filter", group: "f_barrel", type: "dual", label: "Amount", valId: "vBarrel", min: 0, max: 0.6, step: 0.01, lo: 0.32, hi: 0.32, fmt: v => sig3(v), apply: v => barrelAmt = v, durScale: 10 },
    { key: "scan", host: "filter", group: "f_scanlines", type: "dual", label: "Amount", valId: "vScan", min: 0, max: 1, step: 0.01, lo: 0.35, hi: 0.35, fmt: v => sig3(v), apply: v => scanAmt = v, durScale: 10 },
    { key: "scancount", host: "filter", group: "f_scanlines", type: "dual", label: "Lines", valId: "vScanCount", min: 60, max: 800, step: 1, lo: 240, hi: 240, fmt: v => sig3(v), apply: v => scanCount = v, durScale: 10 },
    { key: "vignette", host: "filter", group: "f_vignette", type: "dual", label: "Amount", valId: "vVignette", min: 0, max: 1, step: 0.01, lo: 0.4, hi: 0.4, fmt: v => sig3(v), apply: v => vigAmt = v, durScale: 10 },
    { key: "grain", host: "filter", group: "f_grain", type: "dual", label: "Amount", valId: "vGrain", min: 0, max: 0.5, step: 0.005, lo: 0.22, hi: 0.22, fmt: v => sig3(v), apply: v => grainAmt = v, durScale: 10 },
    { key: "band", host: "band", group: "banding", type: "dual", label: "Banding", valId: "vBand", min: 0, max: 100, step: 1, lo: 0, hi: 0, fmt: v => sig3(v) + "%", apply: v => bandLevel = v / 100 },
    { key: "bandsize", host: "band", group: "banding", type: "dual", label: "Band size", valId: "vBandSize", min: 1, max: 9, step: 1, lo: 1, hi: 1, fmt: v => sig3(v), apply: v => bandGroup = Math.round(v) },
    { key: "banddim", host: "band", group: "banding", type: "dual", label: "Darkness", valId: "vBandDim", min: 0, max: 100, step: 1, lo: 0, hi: 0, fmt: v => sig3(v) + "%", apply: v => bandDim = 1 - v / 100 },
  ];
  // ---- SINGLE controls: one integer, still a `dual` underneath ----------------------------
  // A `single` control names one thing (Variation, Axis, Direction) or counts a small number
  // of them (sides, segments, bolts, iterations), so a float is meaningless and a RANGE is
  // worse — "Variation 2–5" drifts across four unrelated warp functions.
  //
  // It stays `type: "dual"` on purpose. The STORE is still the [lo,hi] pair and the wire keys
  // are still <key>-lo/<key>-hi, so every saved scene, share link and backup keeps loading
  // with no migration; the second thumb is simply mirrored to the first and hidden. Switching
  // these to `type: "plain"` would change both the stored shape and the wire keys — and the
  // plain path is dormant anyway (nothing wires it, so its apply would never run).
  //
  // Three consequences fall out of the pinned pair, none of them special-cased:
  //   * no drift — stepAnim's `mx - mn < 1e-9` branch parks it and draws no Math.random;
  //   * one number in the readout — ui() already prints A when A === B;
  //   * no triggers — wireRange skips makeChips, so the key never enters beatReact /
  //     pulseShape / pulseLen, and every merge*/prune*/sync* that iterates those maps skips
  //     it for free (a saved scene's stale beat entry is simply never visited).
  const SINGLE_KEYS = new Set(CONTROLS.filter(c => c.single).map(c => c.key));
  // Collapse a stored pair to the one integer a single control holds. LO wins, then round:
  // lo is the canonical thumb everywhere already (registerAnim seeds newPhase(+w.lo.value),
  // ctlDefault returns [c.lo, c.hi]), and rounding reproduces what these controls' own
  // Math.round(v) applies already computed — so a scene that RENDERED as N still renders as N.
  // A function DECLARATION, not a const arrow: mergeState, applyBlob and paintBlock all call
  // it from later slices, and a const would leave it in the TDZ there.
  function singlePair(id, v) {
    if (!SINGLE_KEYS.has(id) || !Array.isArray(v)) return v;
    const n = Math.round(+v[0]);
    return (n === +v[0] && n === +v[1]) ? v : [n, n];      // already collapsed ⇒ untouched
  }
  // A control belongs to the SCENE rather than to one effect when it is not an effect
  // control (palette, banding) or the shared camera/display zoom. Everything else — every
  // effect param, AND now most filter params — is owned per stacked LAYER, so each effect
  // in a stack carries its own filter settings (each layer runs its own filter chain, see
  // renderStackColor). The exceptions stay scene-wide because they act on the ONE finished
  // image, not a layer: the sim tick-rate `burn` (a shared clock), the glow `bloom`, and
  // the four "screen" filters (Scanlines / Vignette / Film grain / Barrel).
  const SHARED_FILTER_KEYS = new Set(["burn", "bloom", "barrel", "scan", "scancount", "vignette", "grain"]);
  // Hosts whose sliders are PER-LAYER. "fx" is every effect slider, including the whole camera
  // group (zoom AND camera X/Y/Z) — each stacked effect samples its own space, so it holds its
  // own camera, pushed into camRX/RY/RZ by installStackItem before that layer draws.
  // "band" (banding) and "pal" (palette cycle/hold) are here because their values ALREADY live
  // per-effect in states[e], so loadState rewrote these supposedly scene-wide globals on every
  // layer selection — selecting a layer visibly re-banded the scene and changed its cycle timing.
  // They are per-layer in the render too: bakeLayerBytes bands each layer's own ramp and
  // stepLayerPal runs each layer's own clock, so nothing had to change downstream.
  const LAYER_HOSTS = new Set(["fx", "band", "pal"]);
  const isSceneCtl = c => c.host === "filter"
    ? SHARED_FILTER_KEYS.has(c.key)                       // filter params: per-layer unless shared
    : !LAYER_HOSTS.has(c.host);                           // TTL / transition / the scene filters stay scene-wide
  // A control's identifying attribute. A LAYER control exists once per stack slot, so it
  // cannot carry an id: duplicate ids are invalid and getElementById returns whichever comes
  // first, which would quietly route every edit to layer 1. It carries the same string on
  // `data-k` instead and is looked up through ctl()/ctlIn(). A SCENE control (ttl, tdur, burn,
  // bloom, the screen filters) exists once in the whole page and keeps its id, which is what
  // lets ctl() fall through to getElementById for it and leaves those sites untouched.
  //
  // The STRING never changes either way: "speed-lo" is a wire key (a stored `ranges` map is
  // keyed by it), so nothing on the wire moves.
  const kAttr = c => (isSceneCtl(c) ? ' id="' : ' data-k="');
  function ctlHTML(c) {
    const K = kAttr(c);
    const open = '<div class="ctl"' + K + 'ctl-' + c.key + '">';
    if (c.type === "check")
      return open + '<label class="check"><input type="checkbox"' + K + c.key + '" checked> ' + c.label + "</label></div>";
    // ONE row — name · − value + — using the small side-by-side stepper buttons every
    // number field carries, instead of the old full-width −/+ bar below the label (which
    // read as add/remove-something and matched nothing else in the panel).
    if (c.type === "layers")
      return open + '<div class="obj-row"><span class="obj-name">' + c.label + '</span>' +
        '<button' + K + 'layer-minus" class="num-arrow" type="button" title="Remove the smallest copy of ' + c.label + '" aria-label="Fewer">−</button>' +
        '<span class="val obj-val"' + K + 'vLayers"></span>' +
        '<button' + K + 'layer-plus" class="num-arrow" type="button" title="Add a smaller copy — half size, half points, new seed" aria-label="More">+</button>' +
        '<input type="number"' + K + 'layers" min="1" max="6" step="1" value="1" style="display:none"></div></div>';
    const lbl = "<label>" + c.label + ' <span class="val"' + K + c.valId + '"></span></label>';
    if (c.type === "plain")
      return open + lbl + '<input' + K + c.key + '" type="range" min="' + c.min + '" max="' + c.max + '" step="any" value="' + c.value + '"></div>';
    // step="any": sliders are continuous. A quantised step made the readout lie
    // (a 0.001-step control formatted to 2dp looked like it jumped 0.01 -> 0.02),
    // and every value is shown to 3 significant digits by sig3() instead.
    // A SINGLE control is the exception and emits its real step, which is what makes the
    // browser's own value sanitisation snap every `.value =` write onto the min + n·step
    // grid — loadState, paintBlock, rngApply and a manual drag all quantise for free — and
    // what makes snapStep (which short-circuits on a NaN step) finally quantise the animated
    // output too. Both thumbs are still emitted: wireRange, saveState, loadState, freezeItem
    // and RNG_ORIG all require the pair to exist. The hi one is hidden by CSS, not omitted.
    const st = c.single ? String(c.step) : "any";
    const inp = t => '<input type="range" class="thumb-' + t + '"' + K + c.key + "-" + t + '" min="' + c.min + '" max="' + c.max + '" step="' + st + '" value="' + (t === "lo" ? c.lo : c.hi) + '">';
    return open + lbl + '<div class="dual' + (c.single ? " single" : "") + '"><div class="track"></div><div class="fill"></div>' + inp("lo") + inp("hi") + "</div></div>";
  }
  // The Filters checkbox list. Ticking one reveals its parameter group (see the
  // dynamic `shown` set in setEffect) and re-derives the live chain. Built once —
  // the list is the same for every effect, only the ticks differ.
  // Subheadings that say not just what each group of filters does, but WHERE it acts —
  // the one thing that matters now that filters are per-layer. Feedback and post filters
  // both run on EACH stacked effect on its own, with that effect's own values, so they are
  // ONE group; Bloom (the glow) and the screen filters act once on the finished, blended
  // image, so they read "Whole scene". Grouping is by this behaviour, not raw stage — Bloom
  // is a "post" filter internally but belongs with the whole-scene set, and it sits last
  // among the post filters, so it falls into that group without reordering FILTERS.
  //
  // Feedback and post were two headings ("heat & trails" / "image") until they were merged:
  // the split was the pipeline's, not the user's — both are "this layer's own filters", and
  // two captions saying so in different words only made the list longer. The single heading
  // still works out of the registry order (all feedback, then all post-but-Bloom, then the
  // whole-scene set), so the run stays contiguous and one caption is emitted for it.
  // ONE group, and now ONE list: every filter belongs to a layer. There was a "Whole scene ·
  // final image" group for Bloom and the four screen filters, routed to its own box; they are
  // per-layer passes now, so both the group and the box had nothing to hold. Putting a filter
  // back on the whole scene means re-adding a host and a FILTER_LISTS entry as well as an id
  // to SCENE_FILTER_IDS — the id seam alone no longer has anywhere to render.
  // WHICH GROUP EACH FILTER BELONGS TO -- the same table treatment as EFFECT_CATS, and for
  // the same reason: 37 filters under one caption is a list you scroll rather than read.
  // filterGroup used to return a single constant, left from when whole-scene filters had to
  // be separated from per-layer ones; that distinction is gone, so the caption carried no
  // information. Registry order still decides RUN order -- this only changes the picker.
  const FILTER_CATS = [
    { name: "Trails & feedback", desc: "what the previous frame leaves behind",
      ids: ["fire", "fade", "diffuse", "echo", "zoomfb", "swirl", "cellular"] },
    { name: "Warp & distort", desc: "move the pixels somewhere else",
      ids: ["twist", "wedge", "polar", "lens", "droste", "mirror", "shock", "barrel"] },
    { name: "Stylise", desc: "redraw it as something else",
      ids: ["poster", "dither", "halftone", "ascii", "kuwahara", "edge", "emboss", "pixelate", "hexpix", "crt", "scanlines"] },
    { name: "Colour & tone", desc: "same shapes, different colour",
      ids: ["thresh", "invert", "chroma", "noise", "vignette", "grain"] },
    { name: "Blur & light", desc: "spread it, streak it, glow it",
      ids: ["soften", "dblur", "rblur", "anamorph", "bloom", "glitch", "pixsort"] },
  ];
  const FILTER_CAT_OF = {};
  FILTER_CATS.forEach((c, gi) => c.ids.forEach(id => FILTER_CAT_OF[id] = gi));
  function filterGroup(f) {
    const gi = FILTER_CAT_OF[f.id];
    const c = gi === undefined ? null : FILTER_CATS[gi];
    return c ? { key: c.name, title: c.name, desc: c.desc }
             : { key: "other", title: "Other", desc: "" };
  }
  // One <details> per filter: a grab handle + name in the summary, that filter's own params
  // in the body. Must run BEFORE the POPPABLE pass, which inserts each slider's .ctl-row
  // launcher next to its .ctl — moving the .ctl into a body afterwards would strand the row
  // in #filterctl.
  //
  // THE LIST SHOWS ONLY THE FILTERS YOU HAVE ADDED. It used to show all 22 with a checkbox
  // each, which is a wall of options you mostly are not using; now "+ Add filter" opens a
  // picker and the menu is just your chain, in order. Two consequences worth knowing:
  //
  //  - **Every section is built once and stays in the DOM forever**, hidden rather than
  //    removed. It holds this filter's `#ctl-<key>` param nodes, which were ADOPTED out of
  //    #filterctl — and `el()` is getElementById, which cannot find a detached node. Drop a
  //    section from the document and every lookup of its sliders (loadState, bindRange,
  //    refreshControlVisibility, the pop-out boxes) silently stops finding them.
  //  - **Order is expressed by re-appending**, since appendChild MOVES a node. renderFilterList
  //    re-appends the added sections in chain order on every change, so DOM order is the
  //    order, and a moved node keeps its children, listeners and adopted controls.
  //
  // `#flt-<id>` survives as a hidden checkbox inside each section: it is still the on/off
  // VALUE STORE that syncFilterUI writes and the picker reads, exactly as `#preset` and
  // `#palette` sit behind their visible pickers. Deleting it would mean rewriting all of them.
  // Per slot in `secs`; `filterSecs` is the SELECTED block's, installed by pointMaps. `let`,
  // not const, precisely so pointMaps can re-point it — setFilterOn, syncFilterSec and
  // flashStageMove all read it and must act on the layer you are editing.
  let filterSecs = {};
  // The two lists, and whether their order is the user's to choose. Only the per-effect
  // group is reorderable: the whole-scene filters are one fixed post-composite pass each,
  // and there is nothing meaningful to permute.
  const FILTER_LISTS = [
    { key: "layer", hostId: "filterlist", addId: "filter-add", reorder: true },
  ];
  function filterListOf(f) { return FILTER_LISTS[0]; }
  const filterSetOf = id => (isSceneFilter(id) ? sceneOn : activeIds);
  // The ids currently in one list, in the order they will be applied.
  function listIds(key) { return listIdsFor(stackSel, key); }
  // One slot's chain. The selected layer's live set is `activeIds`; any other layer reads its
  // own record, falling back to its effect's shipped list — the same fallback stageLayerExtras
  // uses, and deliberately NOT `extras[L.fx]`, which is the per-effect last-used value and
  // would make every same-effect layer mirror the last one edited.
  function listIdsFor(slot, key) {
    const L = stack[slot];
    const src = slot === stackSel ? [...activeIds]
      : (L ? (filtersOk(L.filters) || presetFilters(L.fx)) : []);
    return orderFilters(src).filter(f => filterListOf(f).key === key).map(f => f.id);
  }
  // Built once PER BLOCK. The call site stays literally `buildFilterUI();` (filterprobe stubs
  // it by name) with the slot loop INSIDE, so the probe's slice is unaffected.
  function buildFilterUI() {
    for (let slot = 0; slot < STACK_MAX; slot++) buildFilterUIFor(slot);
    pointMaps(0);
  }
  function buildFilterUIFor(slot) {
    secs[slot] = {};
    const ctlHost = ctlIn(slot, "filterctl");
    // One caption over the per-effect chain. The Scene filters box's own title already says
    // what that list is, so only this one gets a heading — and it earns it twice over now:
    // it distinguishes per-layer from whole-scene, and it is where "top to bottom is the
    // order they run" is stated.
    const lay = ctlIn(slot, FILTER_LISTS[0].hostId);
    if (lay) {
      const g = filterGroup(FILTERS.find(f => f.stage === "feedback"));
      const h = document.createElement("div");
      h.className = "ctl-grp filter-grp";
      h.textContent = g.title;
      const d = document.createElement("div");
      d.className = "filter-grp-d";
      d.textContent = "runs top to bottom — drag ⠿ to reorder";
      h.appendChild(d);
      lay.appendChild(h);
    }
    FILTERS.forEach(f => {
      const L = filterListOf(f), dest = ctlIn(slot, L.hostId);
      if (!dest) return;
      const sec = document.createElement("details");
      sec.className = "filter-sec";
      sec.dataset.fid = f.id;
      const sum = document.createElement("summary");
      // Hidden value store — the picker dialog ticks it, syncFilterUI reads it.
      const cb = document.createElement("input");
      cb.type = "checkbox"; ctlReg(slot, "flt-" + f.id, cb);
      cb.style.display = "none";
      if (L.reorder) sum.appendChild(makeFilterGrab(f, sec, slot));
      const nm = document.createElement("span");
      nm.className = "filter-name"; nm.textContent = f.name;
      // Remove from the chain without opening the picker — the commonest edit by far.
      const rm = document.createElement("button");
      rm.type = "button"; rm.className = "filter-rm"; rm.textContent = "✕";
      rm.title = "Remove " + f.name + " from this list";
      rm.setAttribute("aria-label", "Remove " + f.name);
      rm.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); setFilterOn(f.id, false); });
      // BYPASS EYE. ✕ removes a filter, which loses its place in the chain and its settings —
      // no good when you just want to see what it is contributing. This mutes it in place:
      // the row stays, the order stays, the sliders keep their values.
      //
      // It is inside a <summary>, so preventDefault as well as stopPropagation — a click
      // anywhere in a summary toggles the <details>, and opening the body every time you
      // A/B a filter is not what you asked for.
      const by = document.createElement("button");
      by.type = "button"; by.className = "filter-by";
      by.addEventListener("click", e => {
        e.preventDefault(); e.stopPropagation();
        const L = stack[slot];
        if (!L) return;
        const off = fxOffOf(L);
        if (off.has(f.id)) off.delete(f.id); else off.add(f.id);
        syncFilterBypass(slot);
        applyFilters();               // recompute the chain the render reads
      });
      sum.appendChild(cb); sum.appendChild(by); sum.appendChild(nm); sum.appendChild(rm);
      sum.title = f.help || f.name;
      sec.appendChild(sum);
      const body = document.createElement("div");
      body.className = "filter-body";
      // Adopt this filter's controls out of the flat #filterctl list.
      (f.params || []).forEach(k => { const n = ctlIn(slot, "ctl-" + k); if (n) body.appendChild(n); });
      sec.appendChild(body);
      // A GPU-only filter on the Canvas2D fallback: say so rather than leaving a row that
      // silently does nothing. (It stays in the list — see cpuBlocked: never removed.)
      if (f.cpuOk === false && !useGL) {
        cb.disabled = true;
        sec.classList.add("off");
        sum.title = f.name + " needs WebGL — unavailable on this device's fallback renderer.";
      }
      secs[slot][f.id] = sec;
      dest.appendChild(sec);
    });
    // "+ Add filter" per list, plus the caption that used to head the group.
    FILTER_LISTS.forEach(L => {
      const dest = ctlIn(slot, L.hostId);
      if (!dest) return;
      const b = document.createElement("button");
      b.type = "button"; b.className = "filter-add";
      ctlReg(slot, L.addId, b);
      b.textContent = "+ Add filter";
      b.title = "Choose which filters this list runs";
      b.addEventListener("click", () => openFilterPicker(L.key));
      dest.appendChild(b);
    });
    if (ctlHost) ctlHost.style.display = "none";   // now empty; keep the node for scans
  }
  // Put one list in order: the added sections first, in chain order, then the rest hidden,
  // then the Add button. Everything stays a child of the host — see the note above on why a
  // section must never leave the document.
  // A labelled hairline marking where one pipeline stage ends and the next begins. Made fresh
  // each render and stamped with the pass id, so the sweep at the end of renderFilterLists can
  // drop the ones left over from the previous layout.
  let renderPass = "0";
  function stageDivider() {
    const d = document.createElement("div");
    d.className = "filter-div";
    d.dataset.live = renderPass;
    d.textContent = "▲ heat & trails · effect draws here · ▼ image";
    d.title = "Filters above this line run on the heat before the effect draws; filters below run on the finished picture. Drag one across to change which it does.";
    return d;
  }
  // Every block, each ordered by ITS OWN layer's chain. Reading `activeIds` for all of them
  // would render four copies of the selected layer's order, with the divider in the wrong
  // place — the kind of wrong that looks like the feature half-works.
  function renderFilterLists() {
    for (let slot = 0; slot < STACK_MAX; slot++) { renderFilterListsFor(slot); syncFilterBypass(slot); }
  }
  // Paint one block's bypass eyes from its layer's live set. Separate from renderFilterListsFor
  // so a bypass toggle repaints the eyes without re-appending every section (which would fight
  // an in-flight drag) — and so a layer reorder, which re-points the blocks, repaints them too.
  function syncFilterBypass(slot) {
    const L = stack[slot], off = (L && L.fxOff) || null;
    const mySecs = secs[slot] || {};
    for (const id in mySecs) {
      const sec = mySecs[id];
      if (!sec) continue;
      const muted = !!(off && off.has(id));
      sec.classList.toggle("bypassed", muted);
      const dot = sec.querySelector(".filter-by");
      if (!dot) continue;
      const nm = (FILTER_BY_ID[id] || {}).name || id;
      dot.innerHTML = muted ? EYE_SHUT : EYE_OPEN;
      dot.title = muted ? "Switch " + nm + " back on" : "Mute " + nm + " without removing it";
      dot.setAttribute("aria-label", dot.title);
      dot.setAttribute("aria-pressed", muted ? "true" : "false");
    }
  }
  function renderFilterListsFor(slot) {
    renderPass = String(+renderPass + 1);
    const mySecs = secs[slot] || {};
    FILTER_LISTS.forEach(L => {
      const host = ctlIn(slot, L.hostId);
      if (!host) return;
      const ids = listIdsFor(slot, L.key), added = new Set(ids);
      const cap = host.querySelector(".filter-grp");
      if (cap) host.appendChild(cap);                       // caption stays on top
      // Rows go wherever you put them — the chain is a sequence, not two sorted groups. The
      // one line that still means something is where the EFFECT DRAWS: everything above it
      // reshapes the heat, everything below repaints the finished picture, and moving a row
      // across it genuinely changes what that filter does. splitChain puts that line straight
      // after the last feedback filter, so the marker is drawn there and nowhere else.
      const cut = splitChain(ids).heat.length;
      ids.forEach((id, i) => {
        const sec = mySecs[id];
        if (!sec) return;
        if (L.reorder && cut > 0 && i === cut) host.appendChild(stageDivider());
        sec.style.display = "";
        sec.classList.toggle("solo", ids.length < 2);
        host.appendChild(sec);
      });
      // Stale dividers from the previous render, now that the runs have moved.
      [...host.querySelectorAll(".filter-div")].forEach(d => { if (d.dataset.live !== renderPass) d.remove(); });
      FILTERS.forEach(f => {
        const sec = mySecs[f.id];
        if (!sec || added.has(f.id) || filterListOf(f).key !== L.key) return;
        sec.style.display = "none";
        sec.open = false;
        host.appendChild(sec);
      });
      const btn = ctlIn(slot, L.addId);
      if (btn) host.appendChild(btn);
      host.classList.toggle("empty", ids.length === 0);
    });
  }
  // The one way a filter goes on or off, wherever it is toggled from (the picker, a row's ✕,
  // or a programmatic load). Adding appends, so a new filter lands at the end of its stage.
  function setFilterOn(id, on) {
    const set = filterSetOf(id);
    if (on) set.add(id); else set.delete(id);
    const sec = filterSecs[id];
    if (sec && on) sec.open = true;        // reveal what you just added
    applyFilters();
    syncFilterPicker();
  }
  // Drag to reorder, modelled directly on the layer rows' handle (see syncStackUI) — same
  // gesture, same trick: the dragged section is TRANSFORMED and a marker shows where it will
  // land, and the actual reorder happens once, on release. Moving the section's DOM node
  // mid-drag would detach the handle holding the pointer capture, and Chromium drops capture
  // on reparent, which kills the drag after the first pixel.
  //
  // The handle also swallows the summary's click, or every drag would toggle the fold open.
  function makeFilterGrab(f, sec, slot) {
    const grab = document.createElement("span");
    grab.className = "filter-grab";
    grab.textContent = "⠿";
    grab.title = "Drag to reorder — filters run top to bottom";
    grab.setAttribute("aria-label", "Drag to reorder " + f.name);
    grab.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); });
    grab.addEventListener("pointerdown", e => {
      // The reorder below rewrites `activeIds`, which is the SELECTED layer's set — so a drag
      // that starts in another layer's list has to select it first, or it would silently
      // reorder the wrong chain. The row's own capture-phase handler is bypassed here because
      // the grab stops propagation (it must: a rebuild mid-drag drops the pointer capture).
      if (slot !== stackSel) selectStack(slot);
      const host = sec.parentNode;
      const rows = () => [...host.querySelectorAll(".filter-sec")].filter(s => s.style.display !== "none");
      if (rows().length < 2) return;
      e.preventDefault(); e.stopPropagation();
      grab.setPointerCapture(e.pointerId);
      const startY = e.clientY;
      sec.classList.add("dragging");
      const marker = document.createElement("div");
      marker.className = "filter-drop";
      let to = rows().indexOf(sec);
      const onMove = ev => {
        sec.style.transform = "translateY(" + (ev.clientY - startY) + "px)";
        // Scan only the OTHER rows: their rects are stable, while the dragged one's rides
        // the pointer.
        const others = rows().filter(s => s !== sec);
        to = 0;
        for (const s of others) {
          const b = s.getBoundingClientRect();
          if (ev.clientY < b.top + b.height / 2) break;
          to++;
        }
        host.insertBefore(marker, others[to] || ctlIn(slot, filterListOf(f).addId) || null);
      };
      const onUp = () => {
        grab.releasePointerCapture(e.pointerId);
        grab.removeEventListener("pointermove", onMove);
        grab.removeEventListener("pointerup", onUp);
        grab.removeEventListener("pointercancel", onUp);
        marker.remove();
        sec.style.transform = "";
        sec.classList.remove("dragging");
        // Rebuild the set in the new order. A Set iterates in INSERTION order, so the way
        // to reorder one is to rebuild it — which is also why `activeIds` is re-assigned
        // rather than mutated in place.
        const key = filterListOf(f).key;
        const ids = listIds(key);
        const from = ids.indexOf(f.id);
        if (from < 0 || to === from) { renderFilterLists(); return; }
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        // Nothing is overruled any more: every position in the list is a position the
        // pipeline can actually run (see splitChain). The only thing worth saying is when a
        // move changed WHICH SIDE of the effect a filter is on, because that is a change of
        // meaning rather than of order.
        const wasHeat = splitChain(listIds(filterListOf(f).key)).heat.some(x => x.id === f.id);
        const nowHeat = splitChain(ids).heat.some(x => x.id === f.id);
        if (wasHeat !== nowHeat) flashStageMove(f, nowHeat);
        if (key === "scene") { sceneOn = new Set(ids); }
        else {
          // Keep any id the list does not own (scene ids never live here, but a stale one
          // from an old blob might) rather than dropping it on a reorder.
          const keep = [...activeIds].filter(id => !ids.includes(id));
          activeIds = new Set(ids.concat(keep));
        }
        applyFilters();          // re-render, re-derive the chains, persist
        autosavePreset();
      };
      grab.addEventListener("pointermove", onMove);
      grab.addEventListener("pointerup", onUp);
      grab.addEventListener("pointercancel", onUp);
    });
    return grab;
  }
  // A move that crossed the effect: say what the filter now does, since it is doing a
  // different job rather than the same job in a different order. A few seconds, then gone.
  let stageBlockT = 0;
  function flashStageMove(f, nowHeat) {
    const host = el(FILTER_LISTS[0].hostId);
    if (!host) return;
    let note = host.querySelector(".filter-note");
    if (!note) {
      note = document.createElement("div");
      note.className = "filter-note";
      const cap = host.querySelector(".filter-grp");
      if (cap) cap.appendChild(note); else host.prepend(note);
    }
    note.textContent = nowHeat
      ? f.name + " now shapes the heat, before the effect draws into it."
      : f.name + " now repaints the finished picture, after the effect has drawn.";
    note.classList.remove("on"); void note.offsetWidth; note.classList.add("on");
    clearTimeout(stageBlockT);
    stageBlockT = setTimeout(() => note.classList.remove("on"), 5200);
    const sec = filterSecs[f.id];
    if (sec) { sec.classList.remove("bump"); void sec.offsetWidth; sec.classList.add("bump"); }
  }
  // ---- "Add filter" picker ----------------------------------------------------------
  // A floating, translucent, non-modal panel like the palette editor and the Orbit editor,
  // hidden on m/Esc with the rest. It is the ONLY place the full catalogue is listed now,
  // which is the whole point: the menu shows your chain, this shows what you could add.
  let filterPickKey = "layer";
  function openFilterPicker(key) {
    const dlg = el("fltdlg");
    if (!dlg) return;
    filterPickKey = key;
    el("flt-title").textContent = "Filters for this layer";
    el("flt-hint").textContent = "Each layer runs its own chain. Grouped by what they do to the picture; the order you add them in is the order they run, and you can drag them to reorder.";
    buildFilterPicker();
    dlg.classList.remove("hidden");
  }
  function closeFilterPicker() { const d = el("fltdlg"); if (d) d.classList.add("hidden"); }
  function filterPickerOpen() { const d = el("fltdlg"); return !!d && !d.classList.contains("hidden"); }
  function buildFilterPicker() {
    const host = el("flt-pick");
    if (!host) return;
    // KEEP THE KEYBOARD'S PLACE. This runs from setFilterOn -> syncFilterPicker, i.e. from
    // inside the `change` of a checkbox that the next line destroys -- so Chromium blurred to
    // <body> and the next Tab restarted from the top of the DOCUMENT. The picker is non-modal,
    // so no focus trap pulled it back, and ticking five filters meant finding your place five
    // times. Invisible with a mouse, which is why it survived.
    const hadFocus = host.contains(document.activeElement) ? document.activeElement.dataset.fid : null;
    host.textContent = "";
    // Collect first, render second: the sub-captions keep REGISTRY order because they mirror
    // the pipeline (heat and trails, then the image), but the filters INSIDE each are listed
    // by name — a catalogue is for finding one, and registry order is a pipeline concern.
    // Only this dialog sorts: the menu's own list is the CHAIN, whose order is the run order.
    const groups = [];
    FILTERS.forEach(f => {
      if (filterListOf(f).key !== filterPickKey) return;
      // Sub-captions inside the picker only — the menu list itself is one flat chain.
      // BY KIND, from FILTER_CATS, not by pipeline stage. Stage split 37 filters into two
      // buckets ("Heat & trails" and "Image"), and "Image" was thirty of them — a caption
      // that tells you nothing is a caption you scroll past. What you actually want to know
      // is whether a thing warps, stylises, blurs or recolours.
      const cat = filterGroup(f);
      let g = groups.find(x => x.s === cat.title);
      if (!g) groups.push(g = { s: cat.title, desc: cat.desc, items: [] });
      g.items.push(f);
    });
    // FILTER_CATS order, not first-seen registry order: the table is where the grouping is
    // designed, so it is also where the reading order is decided.
    const catOrder = FILTER_CATS.map(c => c.name);
    groups.sort((a, b) => {
      const ia = catOrder.indexOf(a.s), ib = catOrder.indexOf(b.s);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    groups.forEach(g => {
      const h = document.createElement("div");
      h.className = "flt-stage"; h.textContent = g.s;
      if (g.desc) h.title = g.desc;
      host.appendChild(h);
      g.items.sort((a, b) => a.name.localeCompare(b.name)).forEach(f => {
      const lab = document.createElement("label");
      lab.className = "flt-opt";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = filterSetOf(f.id).has(f.id);
      cb.disabled = f.cpuOk === false && !useGL;
      cb.dataset.fid = f.id;                 // so the rebuild below can put focus back on this row
      cb.addEventListener("change", () => setFilterOn(f.id, cb.checked));
      const nm = document.createElement("span");
      nm.className = "flt-opt-n"; nm.textContent = f.name;
      lab.appendChild(cb); lab.appendChild(nm);
      if (f.help) {
        const d = document.createElement("span");
        d.className = "flt-opt-d"; d.textContent = f.help;
        lab.appendChild(d);
      }
      if (cb.disabled) lab.title = f.name + " needs WebGL — unavailable on this device's fallback renderer.";
      host.appendChild(lab);
      });
    });
    // Put the keyboard back where it was (see the note at the top of this function).
    if (hadFocus) {
      const back = host.querySelector('[data-fid="' + hadFocus + '"]');
      if (back) back.focus();
    }
  }
  // Mirror the live sets onto the picker's ticks whenever they change underneath it (a row's
  // ✕, a scene load, an effect switch). Cheap enough to just rebuild.
  function syncFilterPicker() { if (filterPickerOpen()) buildFilterPicker(); }
  if (el("flt-close")) el("flt-close").addEventListener("click", closeFilterPicker);
  // Kept for the callers that only want the fold state refreshed.
  function syncFilterSec(id) { syncFilterSecIn(stackSel, id); }
  function syncFilterSecIn(slot, id) {
    const sec = (secs[slot] || {})[id], cb = ctlIn(slot, "flt-" + id);
    if (!sec || !cb) return;
    sec.classList.toggle("idle", !cb.checked);
    if (!cb.checked) sec.open = false;
  }
  // A control is visible when the current effect declares it OR it belongs to a
  // ticked filter — so filter params appear and vanish with their checkbox without
  // any effect needing to list them.
  function shownKeys() { return shownKeysFor(stackSel); }
  // What ONE slot's block shows: its own effect's params plus its own ticked filters'. For the
  // selected layer that is the live `effect` + activeFilters(); for any other it is read off
  // the record, so four open blocks each show their own controls instead of four copies of
  // whichever layer happens to be selected.
  function shownKeysFor(slot) {
    const L = stack[slot];
    const sel = slot === stackSel || !L;
    const shown = new Set(EFFECTS[sel ? effect : L.fx].params);
    const fs = sel ? activeFilters() : orderFilters(filtersOk(L.filters) || presetFilters(L.fx));
    for (const f of fs) for (const k of f.params) shown.add(k);
    shown.add("heatboost");           // a palette-box control that applies to every effect (like palcycle/palhold)
    return shown;
  }
  // The topmost VISIBLE group heading in #fxctl sits directly under the box title, where its
  // top border reads as a stray rule below the heading rather than as a separator between two
  // groups. CSS `:first-child` cannot express this: every group exists in the DOM (they are
  // all built once, from CONTROLS) and only some are shown, so the first *child* is whichever
  // group comes first in the schema — "Shape & motion" — while the first *visible* one depends
  // on the effect ("Cardioid seed" on Julia, "Plasma" on Plasma, …). Hence a class,
  // re-marked on every visibility pass.
  function markFirstGroup(slot) {
    const host = ctlIn(slot, "fxctl");
    if (!host) return;
    let seen = false;
    host.querySelectorAll(".ctl-grp").forEach(h => {
      const vis = h.style.display !== "none";
      h.classList.toggle("grp-first", vis && !seen);
      if (vis) seen = true;
    });
  }
  function refreshControlVisibility() {
    for (let slot = 0; slot < STACK_MAX; slot++) refreshBlockVisibility(slot);
    refreshBreakout();                // show/hide the pop-out boxes to match
  }
  // One block, against its own layer's effect and filters.
  function refreshBlockVisibility(slot) {
    const shown = shownKeysFor(slot);
    CONTROLS.forEach(c => {           // poppable sliders toggle their menu row; other controls toggle themselves
      // A folded group hides its ROWS but keeps its HEADING (below), which is the only way
      // back. Folding is deliberately not the same thing as "this effect does not use it":
      // `shown` decides what exists here at all, the fold decides what you are looking at.
      const vis = (shown.has(c.key) && !foldedGroups.has(c.group)) ? "" : "none";
      const row = ctlIn(slot, "row-" + c.key), box = ctlIn(slot, "ctl-" + c.key);
      if (row) row.style.display = vis;
      else if (box) box.style.display = vis;
      // A scene control has one row and one box, both outside every block; slot 0 owns them.
      else if (slot === 0 && rows[c.key]) rows[c.key].style.display = vis;
      else if (slot === 0 && el("ctl-" + c.key)) el("ctl-" + c.key).style.display = vis;
    });
    for (const g in CTL_GROUPS) {     // a heading shows only if something under it is shown
      const hdr = ctlIn(slot, "grp-" + g);
      if (!hdr) continue;
      // Against `shown`, NOT the fold: a folded group hid its own rows a moment ago, so asking
      // "is anything visible under me" would hide the heading too and strip the only way to
      // unfold it.
      hdr.style.display = CONTROLS.some(c => c.group === g && shown.has(c.key)) ? "" : "none";
      hdr.classList.toggle("folded", foldedGroups.has(g));
    }
    markFirstGroup(slot);              // ...and the topmost visible one loses its divider
    refreshBlocked(slot, shown);      // grey any control another setting has neutralised
  }
  // A control that does nothing while another slider sits at its neutral value (a dual
  // whose HIGH thumb is 0 — i.e. turned fully off, so the drift can never leave 0). Keyed
  // blocked-control → the blocker it depends on. Extend by adding an entry.
  const CTL_BLOCKED = { bandsize: "band", banddim: "band", nodspd: "nod" };
  function ctlHi(key) { return ctlHiIn(stackSel, key); }
  // A control is "off" when its dual's HIGH thumb is 0 — read off that block's own thumb, so a
  // blocked control is greyed per layer rather than from whichever one is selected.
  function ctlHiIn(slot, key) {
    const n = ctlIn(slot, key + "-hi") || ctlIn(slot, key) || el(key + "-hi") || el(key);
    return n ? +n.value : 1;
  }
  // Grey the blocked control's menu row + box, kill its +/- button, and stash the blocker
  // on the row so a click can flash it. Reads live thumb values, so it must run on edits too.
  function refreshBlocked(slot, shown) {
    if (slot === undefined) slot = stackSel;
    shown = shown || shownKeysFor(slot);
    for (const key in CTL_BLOCKED) {
      const by = CTL_BLOCKED[key];
      const blocked = shown.has(key) && ctlHiIn(slot, by) === 0;
      const row = ctlIn(slot, "row-" + key) || (slot === 0 ? rows[key] : null);
      const box = ctlIn(slot, "ctl-" + key) || (slot === 0 ? el("ctl-" + key) : null);
      if (row) {
        row.classList.toggle("ctl-blocked", blocked);
        row.dataset.blocker = blocked ? by : "";
        row.title = blocked ? "Does nothing while " + ctlLabel(by) + " is 0 — click to highlight it" : "";
      }
      if (box) box.classList.toggle("ctl-blocked", blocked);
    }
  }
  // Draw the eye to a control: open its section, scroll it into view, and pulse it once.
  function flashCtl(key) {
    const row = rows[key]; if (!row) return;
    const sec = row.closest("details"); if (sec) sec.open = true;
    row.scrollIntoView({ block: "nearest" });
    row.classList.remove("ctl-flash"); void row.offsetWidth; row.classList.add("ctl-flash");
    setTimeout(() => row.classList.remove("ctl-flash"), 1400);
  }
  // Every block's checkboxes, each from ITS OWN layer's set — the hidden #flt-<id> store is
  // per block, so writing only the selected one would leave the other three showing whatever
  // they were built with.
  function syncFilterUI() {
    for (let slot = 0; slot < STACK_MAX; slot++) {
      const own = new Set(listIdsFor(slot, "layer"));
      FILTERS.forEach(f => {
        const cb = ctlIn(slot, "flt-" + f.id);
        if (cb) cb.checked = slot === stackSel ? filterSetOf(f.id).has(f.id) : own.has(f.id);
        syncFilterSecIn(slot, f.id);
      });
    }
    renderFilterLists();     // membership AND order both come from the sets, so re-render
    syncFilterPicker();
  }
  // Re-derive everything a filter change affects: which param groups are visible,
  // the bloom strength (off ⇒ 0), and the banked sim time (a fresh Fire shouldn't
  // burst catch-up ticks). Called on every tick/untick and after loading a scene.
  function applyFilters() {
    syncFilterUI();
    refreshControlVisibility();
    bloomRaw = +el("bloom-lo").value; bloomAmt = filterOn("bloom") ? bloomRaw : 0;   // the slider's apply respects this too
    acc = 0;
    // Only wipe when nothing carries heat over — Fade alone still retains it.
    if (!hasFeedback()) { if (fire) fire.fill(0); if (fireNext) fireNext.fill(0); }
    persist();
  }
  // Controls carrying a `group` are rendered under a shared subheading (Camera,
  // Banding), so the Settings box reads as sections rather than one long list.
  // setEffect shows a heading only while at least one of its controls is in the
  // current effect's params.
  // Which control groups can be folded away, and which start folded. Transient, like every
  // other fold state in the panel (the boxes, the layer blocks, the scene collections) — it is
  // how you are looking at the panel right now, not part of the scene.
  //
  // EMPTY on purpose: Camera used to be the one foldable group (chevron, started collapsed)
  // and the user asked for it always open with no chevron. The machinery stays — heading
  // build, click handler and visibility pass all read this one set, so making a group
  // foldable again is one key here. `foldedGroups` starts as a copy, so nothing starts folded.
  const FOLDABLE_GROUPS = new Set([]);
  const foldedGroups = new Set(FOLDABLE_GROUPS);
  const CTL_GROUPS = {
    shape: "Shape & motion", cardioid: "Cardioid seed", plasma: "Plasma", tunnel: "Tunnel",
    metaball: "Metaballs", kaleido: "Kaleidoscope", rotozoom: "Rotozoomer", munch: "Munching squares",
    moire: "Moiré", newton: "Newton", multibrot: "Multibrot", copper: "Copper bars",
    attractor: "Attractor", physarum: "Slime mould", curl: "Curl flow", clouds: "Volumetric clouds", godray: "God rays", terrain: "Terrain", apollo: "Apollonian gasket", mbox: "Mandelbox", gyroid: "Gyroid", voronoi: "Voronoi cells", warpnoise: "Flow noise", truchet: "Truchet tiles", shapegrid: "Shape grid", concentric: "Concentric rings", bounce: "Bouncing shapes",
    solids: "Bouncing solids", sun: "Sun surface", kefrens: "Kefrens bars", twister: "Twister",
    chladni: "Cymatics", storm: "Lightning storm", bulb: "Mandelbulb", flames: "Fractal flames",
    stars: "Starfield", aurora: "Aurora", rd: "Reaction-diffusion", menger: "Menger sponge",
    boids: "Boids", galaxy: "Galaxy", harmo: "Harmonograph", vballs: "Vector balls", ocean: "Ocean",
    torus: "Doughnut", trees: "Trees", ribbons: "Flying ribbons", glass: "Glass ball", world: "Shared 3D world",
    bhole: "Black hole", qjulia: "Quaternion Julia",
    camera: "Camera", other: "Other",
    f_fire: "Fire", f_fade: "Fade pixel", f_pixelate: "Pixelate", f_soften: "Blur / sharpen",
    f_edge: "Edge", f_poster: "Posterize", f_mirror: "Mirror", f_bloom: "Bloom",
    f_diffuse: "Diffuse", f_echo: "Echo", f_zoomfb: "Zoom feedback", f_swirl: "Swirl",
    f_twist: "Twist", f_wedge: "Wedge fold", f_noise: "Noise", f_glitch: "Slice glitch", f_shock: "Shockwave",
    f_pixsort: "Pixel sort", f_cell: "Cellular automaton",
    f_lens: "Lens bubble", f_droste: "Droste zoom", f_kuwahara: "Oil paint",
    f_halftone: "Halftone", f_thresh: "Solarize", f_chroma: "Chromatic aberration",
    f_barrel: "Barrel distortion", f_scanlines: "Scanlines", f_vignette: "Vignette", f_grain: "Film grain",
    f_hexpix: "Hex pixelate", f_crt: "CRT phosphor",
    palette: "Palette", banding: "Banding",
  };
  // Render the schema into ONE block, then index everything it made under `slot`. Group
  // headings carry data-k too: a heading belongs to the block it titles, and each block shows
  // the headings of ITS OWN effect.
  function buildControls(slot) {
    const root = blocks[slot];
    const q = k => root.querySelector('[data-k="' + k + '"]');
    const fxHost = q("fxctl"), bandHost = q("bandctl"), palHost = q("palctl"), filterHost = q("filterctl");
    // A SCENE control exists ONCE in the whole page and keeps its id — so it is generated in
    // slot 0 only. Generating it per block would put four elements carrying id="bloom-lo" in
    // the document, and getElementById would hand every one of its sites the first.
    // Filtered before the loop rather than skipped inside it, so a group whose members are
    // all scene controls never opens an empty heading in the other blocks.
    let open = null;
    CONTROLS.filter(c => slot === 0 || !isSceneCtl(c)).forEach(c => {
      const host = c.host === "band" ? bandHost : c.host === "pal" ? palHost
        : c.host === "filter" ? filterHost : fxHost;
      if (c.group !== open) {
        open = c.group;
        // A FOLDABLE group carries a chevron and can be collapsed; the rest are plain headings.
        // None currently (Camera was, and was un-folded by request). Extend by adding a key to
        // FOLDABLE_GROUPS — the heading, the click handler and the visibility pass all read
        // that one set.
        if (c.group) host.insertAdjacentHTML("beforeend",
          '<div class="ctl-grp' + (FOLDABLE_GROUPS.has(c.group) ? " foldable" : "")
          + '" data-k="grp-' + c.group + '" data-grp="' + c.group + '">'
          + (FOLDABLE_GROUPS.has(c.group) ? '<b class="grp-chev">▾</b>' : "")
          // A group with no CTL_GROUPS entry used to render the string "undefined" as its
          // heading — eight of them shipped that way. Fall back to the key, which is at least
          // a name, and keep the table the place to make it a pretty one.
          + (CTL_GROUPS[c.group] || c.group) + "</div>");
      }
      host.insertAdjacentHTML("beforeend", ctlHTML(c));
    });
    // Index every [data-k] the block now holds: the ones authored in the template (the four
    // hosts, the palette strip, Reset, Orbit) and the ones just generated. Registered by
    // REFERENCE, so a node keeps resolving after buildFilterUI adopts it into a filter body or
    // the POPPABLE pass exports it to #breakout.
    for (const n of root.querySelectorAll("[data-k]")) ctlReg(slot, n.dataset.k, n);
  }
  // One block per stack slot, cloned from the authored <template>. Each is built by the same
  // passes rather than copied from the finished first one: cloneNode copies nodes, not
  // listeners, so a clone of a wired block would look right and do nothing.
  const blockTpl = el("lyrblock");
  for (let slot = 0; slot < STACK_MAX; slot++) {
    blocks[slot] = blockTpl.content.firstElementChild.cloneNode(true);
    blocks[slot].dataset.slot = String(slot);
    buildControls(slot);
  }
  // All four go into the document now (the wiring passes below read them); syncStackUI moves
  // each into its layer's row on the first paint.
  for (const b of blocks) el("fxbox").appendChild(b);

  // Fold a control group from its heading. DELEGATED on #panel rather than a listener per
  // heading: every block builds its own headings and they are re-rendered by the visibility
  // pass, so per-heading listeners would have to be re-attached each time. One listener on a
  // container that never goes away cannot get out of step.
  panel.addEventListener("click", e => {
    const h = e.target.closest(".ctl-grp.foldable");
    if (!h || !panel.contains(h) || !h.dataset.grp) return;
    const g = h.dataset.grp;
    if (foldedGroups.has(g)) foldedGroups.delete(g); else foldedGroups.add(g);
    refreshControlVisibility();       // every block at once — the fold is not per-layer
  });

  function bind(id, valId, fmt, onChange) {
    const input = el(id), out = el(valId);
    const update = () => { out.textContent = fmt(input.value); onChange(input.value); };
    input.addEventListener("input", update);
    update();
  }
  // (Points is a dual/ranged slider now — wired by the bindRange loop below, so it gets
  // L/M/H beat chips like the other ranged controls; `bind` is left for any future plain one.)

  // Layers: the −/+ buttons drive a hidden number input (so it rides the normal
  // per-effect state/persist/preset machinery); each layer adds a smaller,
  // fewer-point, differently-seeded copy of the fractal.
  const LAYER_MAX = CONFIG.layerMax;
  function applyLayers(v) { layerCount = Math.max(1, Math.min(LAYER_MAX, v | 0)); ctl("vLayers").textContent = layerCount; }
  function stepLayers(d) {
    const v = Math.max(1, Math.min(LAYER_MAX, (+ctl("layers").value | 0) + d));
    ctl("layers").value = v;
    ctl("layers").dispatchEvent(new Event("input", { bubbles: true }));   // updates + persists via onEdit
  }
  // Wired per block. The handlers read back through ctl(), i.e. the SELECTED layer's nodes,
  // which is right because touching a block selects it first.
  for (let slot = 0; slot < STACK_MAX; slot++) {
    ctlIn(slot, "layers").addEventListener("input", () => applyLayers(+ctl("layers").value));
    ctlIn(slot, "layer-plus").addEventListener("click", () => stepLayers(1));
    ctlIn(slot, "layer-minus").addEventListener("click", () => stepLayers(-1));
  }

  // Ranged (dual-thumb) sliders: the two thumbs set a [lo,hi] band and the live
  // value wanders erratically inside it — a random target reached over a random
  // duration, eased, repeating. Collapse the thumbs (lo==hi) to pin a constant
  // value, so a ranged slider still works as an ordinary one.
  // Every accumulated phase clock in the app, as name + getter + setter. These are
  // `let` bindings scattered through the effect sections, so a generic loop cannot
  // reach them by name — hence the table. It is the authoritative list: ADD A LINE
  // HERE when you add an effect that accumulates a clock, or two stack items running
  // that effect will share one clock and render as a single slightly brighter copy.
  // That failure has no error and no probe; it is the most easily missed thing in the
  // whole stack feature.
  // (Deliberately a table rather than renaming all sixteen into one `phase` object:
  // juliaprobe slices the real juliaOuter/juliaInner source out of this file by marker,
  // and a rename would break that slice for no gain.)
  const PHASE_VARS = [
    ["simT", () => simT, v => simT = v],
    ["spinAngle", () => spinAngle, v => spinAngle = v],
    ["nodPhase", () => nodPhase, v => nodPhase = v],
    ["juliaOuter", () => juliaOuter, v => juliaOuter = v],
    ["juliaInner", () => juliaInner, v => juliaInner = v],
    ["plasmaTime", () => plasmaTime, v => plasmaTime = v],
    ["tunTime", () => tunTime, v => tunTime = v],
    ["tunTwistPhase", () => tunTwistPhase, v => tunTwistPhase = v],
    ["bxTime", () => bxTime, v => bxTime = v],
    ["kRotPhase", () => kRotPhase, v => kRotPhase = v],
    ["kNoiseTime", () => kNoiseTime, v => kNoiseTime = v],
    ["rzAngle", () => rzAngle, v => rzAngle = v],
    ["rzTime", () => rzTime, v => rzTime = v],
    ["xorTime", () => xorTime, v => xorTime = v],
    ["moTime", () => moTime, v => moTime = v],
    ["nwPhase", () => nwPhase, v => nwPhase = v],
    ["cbTime", () => cbTime, v => cbTime = v],
    ["clTime", () => clTime, v => clTime = v],
    ["grTime", () => grTime, v => grTime = v],
    ["teTime", () => teTime, v => teTime = v],
    ["rbTime", () => rbTime, v => rbTime = v],
    ["apTime", () => apTime, v => apTime = v],
    ["mbTime", () => mbTime, v => mbTime = v],
    ["gyTime", () => gyTime, v => gyTime = v],
    ["voTime", () => voTime, v => voTime = v],
    ["wnTime", () => wnTime, v => wnTime = v],
    ["truTime", () => truTime, v => truTime = v],
    ["sgTime", () => sgTime, v => sgTime = v],
    ["coTime", () => coTime, v => coTime = v],
    ["coSpin", () => coSpin, v => coSpin = v],
    ["bnTime", () => bnTime, v => bnTime = v],
    ["sunTime", () => sunTime, v => sunTime = v],
    ["kfTime", () => kfTime, v => kfTime = v],
    ["twTime", () => twTime, v => twTime = v],
    ["cyTime", () => cyTime, v => cyTime = v],
    // Lightning carries five: the auto clock, the strike counter, the last Strike value
    // (the rising-edge detector), the racing strike front and the fresh-bolt detector —
    // all per layer, or two storms share bolts and light up in lock-step.
    ["ltTime", () => ltTime, v => ltTime = v],
    ["ltSeed", () => ltSeed, v => ltSeed = v],
    ["ltPrev", () => ltPrev, v => ltPrev = v],
    ["ltFront", () => ltFront, v => ltFront = v],
    ["ltSeedPrev", () => ltSeedPrev, v => ltSeedPrev = v],
    ["bpPhase", () => bpPhase, v => bpPhase = v],
    // The Mandelbulb camera flies INSIDE the fractal, and its escape offset is state the
    // solver warm-starts from each frame — two bulb layers sharing one would fly one camera.
    ["bpOffX", () => bpOffX, v => bpOffX = v],
    ["bpOffY", () => bpOffY, v => bpOffY = v],
    ["bpOffZ", () => bpOffZ, v => bpOffZ = v],
    ["qjPhase", () => qjPhase, v => qjPhase = v],
    ["qjTx", () => qjTx, v => qjTx = v],
    ["qjTy", () => qjTy, v => qjTy = v],
    ["qjTz", () => qjTz, v => qjTz = v],
    ["goTime", () => goTime, v => goTime = v],
    ["dnPhase", () => dnPhase, v => dnPhase = v],
    ["trPhase", () => trPhase, v => trPhase = v],
    ["gbPhase", () => gbPhase, v => gbPhase = v],
    ["vbPhase", () => vbPhase, v => vbPhase = v],
    ["hgPhase", () => hgPhase, v => hgPhase = v],
    ["gxTime", () => gxTime, v => gxTime = v],
    // The black hole carries two: the disk's own rotation and the camera's lap round it.
    ["bhTime", () => bhTime, v => bhTime = v],
    ["bhOrbit", () => bhOrbit, v => bhOrbit = v],
    ["flPhase", () => flPhase, v => flPhase = v],
    ["stTime", () => stTime, v => stTime = v],
    ["auTime", () => auTime, v => auTime = v],
    // Menger carries its whole street-drive state — segment progress, segment counter,
    // current corner, headings — so two sponge layers wander different routes.
    ["mgS", () => mgS, v => mgS = v],
    ["mgSeg", () => mgSeg, v => mgSeg = v],
    ["mgCx", () => mgCx, v => mgCx = v],
    ["mgCz", () => mgCz, v => mgCz = v],
    ["mgDirI", () => mgDirI, v => mgDirI = v],
    ["mgPrevI", () => mgPrevI, v => mgPrevI = v],
    ["mgSpin", () => mgSpin, v => mgSpin = v],
    // Boids' flock lives on the layer (L.boids, like L.solids) — only the Scatter
    // rising-edge detector is a scalar that must not be shared between flocks.
    ["bdPrev", () => bdPrev, v => bdPrev = v],
  ];
  const phaseSnapshot = () => { const o = {}; for (const p of PHASE_VARS) o[p[0]] = p[1](); return o; };
  // Taken once, here, while every clock still holds its declared starting value — a new
  // stack item starts from these rather than from whatever the previously drawn item
  // left in the globals.
  const PHASE_INIT = phaseSnapshot();
  function installPhase(L) { for (const p of PHASE_VARS) if (p[0] in L.phase) p[2](L.phase[p[0]]); }
  function capturePhase(L) { for (const p of PHASE_VARS) L.phase[p[0]] = p[1](); }

