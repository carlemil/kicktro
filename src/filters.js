  // ---- FILTERS: stackable post-FX applied after the effect renders ------------
  // The fire simulation used to be hardwired to the three point effects; it is now
  // one entry here, so any effect can have it. Three stages, split by where in the
  // pipeline the filter writes — and they must be listed in that order (filterprobe):
  //   feedback — mutates heat that survives to the next frame (Fire, Fade, Diffuse,
  //              Echo, Zoom feedback, Swirl). Runs inside glBeginHeat, before the
  //              effect's output is MAX-injected. Each carries its own Lifetime (the
  //              `*Keep` globals — the label was renamed, the state names were not): a pure
  //              displacement conserves heat, so a warp with nothing decaying it
  //              saturates to white on its own.
  //   post     — reads the palette-mapped image; Bloom is the existing glow composite,
  //              now with its strength under a filter, and closes this stage.
  //   screen   — runs AFTER that composite, at display resolution (glRender step F).
  //              A vignette under an additive glow just gets lit back up, and a
  //              scanline count means nothing against the fire grid — hence a stage
  //              of its own rather than four more post filters.
  // Order here is the order they apply — a checkbox list can't be reordered, so this
  // is a design decision, not an implementation detail.
  // `params` are CONTROLS keys shown only while the filter is ticked; `defaults`
  // seed every effect's state (see presetState) so any effect can use any filter
  // without editing all 19 descriptors. `cpu: false` marks a filter the Canvas2D
  // fallback can't do — the UI greys those out rather than lying.
  // CPU mirror of FS_CELL — the cyclic-CA feedback pass. A feedback filter MUST have a
  // CPU mirror (the fallback would otherwise have nothing carrying heat over). Reads
  // fire whole, writes a scratch, copies back — the same shape as heatDiffuseCPU.
  let cellBuf = null;
  function cellularCPU(states, mix, keep) {
    if (!cellBuf || cellBuf.length !== fire.length) cellBuf = new Float32Array(fire.length);
    const S = Math.round(states), q = S / 256;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const i = y * fw + x, h = fire[i];
        const s = Math.min(S - 1, (h * q) | 0), nxt = (s + 1) % S;
        let adv = false;
        for (let j = -1; j <= 1 && !adv; j++) for (let k = -1; k <= 1; k++) {
          if (!j && !k) continue;
          const yy = y + j, xx = x + k;
          if (yy < 0 || yy >= fh || xx < 0 || xx >= fw) continue;
          if (Math.min(S - 1, (fire[yy * fw + xx] * q) | 0) === nxt) { adv = true; break; }
        }
        const ca = adv ? (nxt + 0.5) * 256 / S : h;
        cellBuf[i] = (h + (ca - h) * mix) * keep;
      }
    }
    for (let i = 0; i < fire.length; i++) fire[i] = cellBuf[i];
  }
  const FILTERS = [
    { id: "fire",  name: "Fire",  stage: "feedback", params: ["rise", "burn"],
      help: "Heat rises and cools, the classic fire sim — now available to every effect, not just the point ones.",
      defaults: { rise: [165, 165], burn: [120, 120] },
      glFeedback: src => {
        gl.useProgram(glProg.prop.p);
        bindTexUnit(0, src);
        gl.uniform1i(glProg.prop.u.uHeat, 0);
        gl.uniform2f(glProg.prop.u.uSize, fw, fh);
        gl.uniform1f(glProg.prop.u.uDecay, cfg.decay);
        drawQuad();
      } },
    { id: "fade",  name: "Fade pixel", stage: "feedback", params: ["fade"],
      help: "Each pixel keeps a fraction of its heat every tick — phosphor trails.",
      defaults: { fade: [0.985, 0.985] },
      glFeedback: src => {
        const P = glProg.fade;
        gl.useProgram(P.p);
        bindTexUnit(0, src); gl.uniform1i(P.u.uHeat, 0);
        gl.uniform1f(P.u.uKeep, fadeKeep);
        drawQuad();
      },
      cpuFeedback: () => { for (let i = 0; i < fire.length; i++) fire[i] = fire[i] * fadeKeep; } },
    { id: "diffuse", name: "Diffuse", stage: "feedback", params: ["diffuse", "diffkeep"],
      help: "Heat bleeds sideways as well as up — Fire's flames turn to smoke.",
      defaults: { diffuse: [3.6, 3.6], diffkeep: [0.985, 0.985] },
      glFeedback: src => {
        const P = glProg.diffuse;
        gl.useProgram(P.p);
        bindTexUnit(0, src); gl.uniform1i(P.u.uHeat, 0);
        gl.uniform2f(P.u.uSize, fw, fh);
        gl.uniform1f(P.u.uRadius, diffRad);
        gl.uniform1f(P.u.uKeep, diffKeep);
        drawQuad();
      },
      cpuFeedback: () => heatDiffuseCPU(diffRad, diffKeep) },
    { id: "echo", name: "Echo", stage: "feedback", params: ["echo", "echoang", "echokeep"],
      help: "Trails drag in a direction instead of just dimming in place.",
      defaults: { echo: [4.5, 4.5], echoang: [90, 90], echokeep: [0.94, 0.94] },
      glFeedback: src => glWarpFeedback(src, echoDist, echoAng, 1, 0, echoKeep),
      cpuFeedback: () => heatWarpCPU(echoDist, echoAng, 1, 0, echoKeep) },
    { id: "zoomfb", name: "Zoom feedback", stage: "feedback", params: ["zfb", "zfbkeep"],
      help: "The retained heat is rescaled about the centre every tick — over 1 it rushes outward into an endless tunnel, under 1 it falls inward.",
      defaults: { zfb: [1.02, 1.02], zfbkeep: [0.94, 0.94] },
      glFeedback: src => glWarpFeedback(src, 0, 0, zfbScale, 0, zfbKeep),
      cpuFeedback: () => heatWarpCPU(0, 0, zfbScale, 0, zfbKeep) },
    { id: "swirl", name: "Swirl", stage: "feedback", params: ["swirl", "swirlkeep"],
      help: "The retained heat is rotated about the centre every tick, so trails spiral. Stack it with Zoom feedback for a vortex.",
      defaults: { swirl: [6, 6], swirlkeep: [0.94, 0.94] },
      glFeedback: src => glWarpFeedback(src, 0, 0, 1, swirlSpin, swirlKeep),
      cpuFeedback: () => heatWarpCPU(0, 0, 1, swirlSpin, swirlKeep) },
    { id: "cellular", name: "Cellular automaton", stage: "feedback", params: ["cellstates", "cellmix", "cellkeep"],
      help: "The retained heat evolves as a cyclic cellular automaton every tick: any neighbour one state ahead pulls a cell forward, wrapping — boiling fronts and spirals crawl through whatever the effect draws. States sets the cycle length, Blend how hard the rule bites.",
      defaults: { cellstates: [12, 12], cellmix: [1, 1], cellkeep: [1, 1] },
      glFeedback: src => {
        const P = glProg.cell;
        gl.useProgram(P.p);
        bindTexUnit(0, src); gl.uniform1i(P.u.uHeat, 0);
        gl.uniform2f(P.u.uSize, fw, fh);
        gl.uniform1f(P.u.uStates, cellStates);
        gl.uniform1f(P.u.uMix, cellMix);
        gl.uniform1f(P.u.uKeep, cellKeep);
        drawQuad();
      },
      cpuFeedback: () => cellularCPU(cellStates, cellMix, cellKeep) },
    { id: "twist", cpuOk: false, name: "Twist", stage: "post", params: ["twist"],
      help: "Spin the middle of the image and leave the rim — straight structure curls into the centre.",
      defaults: { twist: [1.2, 1.2] },
      gl: src => postPass("twist", src, u => gl.uniform1f(u.uAmount, twistAmt)) },
    { id: "wedge", cpuOk: false, name: "Wedge fold", stage: "post", params: ["wedgeseg", "wedgerot"],
      help: "Fold the image into N mirrored wedges — Mirror's X/Y fold generalised to a kaleidoscope, for any effect.",
      defaults: { wedgeseg: [6, 6], wedgerot: [0, 0] },
      gl: src => postPass("wedge", src, u => { gl.uniform1f(u.uSeg, wedgeSeg); gl.uniform1f(u.uRot, wedgeRot * Math.PI / 180); }) },
    { id: "glitch", cpuOk: false, name: "Slice glitch", stage: "post", params: ["glitch", "glitchrows"],
      help: "Tear horizontal slices sideways at random. Arm the amount to a beat and it rips on the hit.",
      defaults: { glitch: [0.22, 0.22], glitchrows: [10, 10] },
      gl: src => postPass("glitch", src, u => {
        gl.uniform1f(u.uAmount, glitchAmt); gl.uniform1f(u.uRows, glitchRows); gl.uniform1f(u.uTime, postTime);
      }) },
    // Seed: Static is ONE pattern, identical every frame (a still scene stays still); Random
    // re-rolls every pixel every frame. No scale -- the noise is per pixel by request.
    { id: "noise", cpuOk: false, name: "Noise", stage: "post", params: ["noise", "noiseseed"],
      help: "Push the colour with per-pixel noise — every pixel's brightness is nudged up or down by its own random value, black stays black. Seed keeps one pattern or re-rolls it every frame. Arm Amount to a beat for a flash on the hit.",
      defaults: { noise: [0.4, 0.4], noiseseed: [1, 1] },
      gl: src => postPass("noise", src, u => {
        gl.uniform1f(u.uAmount, noiseAmt);
        gl.uniform1f(u.uTime, noiseSeedMode === 0 ? 0 : (noiseFrame = (noiseFrame + 1) % 65536));
      }) },
    { id: "pixelate", cpuOk: false, name: "Pixelate", stage: "post", params: ["pixel"],
      help: "Snap the image to a coarse grid of blocks.",
      defaults: { pixel: [14, 14] },
      gl: src => postPass("pixelate", src, u => gl.uniform1f(u.uBlock, pixelBlock)) },
    { id: "hexpix", cpuOk: false, name: "Hex pixelate", stage: "post", params: ["hexsize"],
      help: "Snap the image to a honeycomb of hexagons instead of squares.",
      defaults: { hexsize: [20, 20] },
      gl: src => postPass("hexpix", src, u => gl.uniform1f(u.uSize2, hexSize)) },
    { id: "soften", cpuOk: false, name: "Blur / sharpen", stage: "post", params: ["soften", "softrad"],
      help: "One knob: negative blurs, positive sharpens (unsharp mask).",
      defaults: { soften: [-1, -1], softrad: [5.5, 5.5] },
      gl: src => postPass("soften", src, u => { gl.uniform1f(u.uRadius, softenRad); gl.uniform1f(u.uAmount, softenAmt); }) },
    { id: "edge", cpuOk: false, name: "Edge", stage: "post", params: ["edge"],
      help: "Sobel outline — traces the shapes instead of filling them.",
      defaults: { edge: [0.7, 0.7] },
      gl: src => postPass("edge", src, u => gl.uniform1f(u.uAmount, edgeAmt)) },
    { id: "emboss", cpuOk: false, name: "Emboss", stage: "post", params: ["embamt", "embang", "embmix"],
      help: "Lights the picture from one side so contours stand up like stamped metal. Edge outlines a shape from every direction at once; this one has a light angle, so one side of a contour lights and the other darkens. Metal 0 keeps the palette and uses the relief as shading; Metal 1 is the classic grey stamp — which also lifts flat black to mid grey, so on a dark scene keep it low.",
      defaults: { embamt: [1.6, 1.6], embang: [135, 135], embmix: [0.4, 0.4] },
      gl: src => postPass("emboss", src, u => {
        gl.uniform1f(u.uAmount, embAmt);
        gl.uniform1f(u.uAngle, embAng * Math.PI / 180);
        gl.uniform1f(u.uMix, embMix);
      }) },
    { id: "dither", cpuOk: false, name: "Ordered dither", stage: "post", params: ["dithlvl", "dithamt"],
      help: "Quantises to a few Levels like Posterize, but scatters the error through a 4x4 Bayer matrix first, so the bands break into a stipple instead of hard edges - the Amiga / Atari look. Stipple 0 is plain Posterize; past 1 the dots start to dominate.",
      defaults: { dithlvl: [4, 4], dithamt: [1, 1] },
      gl: src => postPass("dither", src, u => { gl.uniform1f(u.uLevels, dithLvl); gl.uniform1f(u.uAmount, dithAmt); }) },
    { id: "rblur", cpuOk: false, name: "Radial blur", stage: "post", params: ["rblamt", "rblmix"],
      help: "Smears every pixel along the line from the centre, so the light appears to stream outward. Blur / sharpen spreads evenly and Zoom feedback builds up over time; this is the single-frame streak.",
      defaults: { rblamt: [1, 1], rblmix: [0.7, 0.7] },
      gl: src => postPass("rblur", src, u => { gl.uniform1f(u.uAmount, rblAmt); gl.uniform1f(u.uMix, rblMix); }) },
    { id: "polar", cpuOk: false, name: "Polar warp", stage: "post", params: ["polamt", "polrep"],
      help: "Reads the frame in polar coordinates: horizontal bands become rings and vertical structure becomes spokes. Repeat folds the angle, which turns almost anything into a rosette.",
      defaults: { polamt: [1, 1], polrep: [1, 1] },
      gl: src => postPass("polar", src, u => { gl.uniform1f(u.uAmount, polAmt); gl.uniform1f(u.uRepeat, polRep); }) },
    { id: "ascii", cpuOk: false, name: "ASCII mosaic", stage: "post", params: ["ascset", "ascell", "ascmix"],
      help: "Replaces each cell with a character picked by its brightness, keeping the cell's colour \u2014 the darker the cell, the emptier the glyph. **Script** chooses the character set: Latin, Arabic, Georgian, Japanese, Cyrillic, Greek, Braille, or **Mixed** \u2014 every script at once. Each set is a whole alphabet \u2014 the letters, digits and punctuation you would write words with, up to 255 of them \u2014 sorted by how much ink they actually carry in your machine's font, and grouped into levels by weight \u2014 every character of the same weight is interchangeable, and each cell picks one of them at random, so a flat area is drawn with a whole spread of characters instead of one repeated tile. Halftone is the dot version of the same idea; a character grid reads quite differently.",
      defaults: { ascset: [0, 0], ascell: [8, 8], ascmix: [1, 1] },
      gl: src => { ensureAsciiAtlas();
        postPass("ascii", src, u => {
          bindTexUnit(1, glTex.ascii); gl.uniform1i(u.uAtlas, 1);
          gl.uniform1f(u.uCell, ascCell); gl.uniform1f(u.uMix, ascMix); gl.uniform1f(u.uGlyphs, asciiAtlasN);
          gl.uniform2fv(u.uBucket, asciiBuckets);
        }); } },
    { id: "invert", cpuOk: false, name: "Invert", stage: "post", params: ["invamt"],
      help: "The plain negative, on a slider - so it can be crossfaded, drifted, or flicked by a beat. Solarize only folds the top of the ramp back down; this turns the whole thing over.",
      defaults: { invamt: [1, 1] },
      gl: src => postPass("invert", src, u => gl.uniform1f(u.uAmount, invAmt)) },
    { id: "dblur", cpuOk: false, name: "Directional blur", stage: "post", params: ["dblamt", "dblang"],
      help: "A straight smear along one angle - motion blur without the motion. Blur / sharpen uses a symmetric kernel; this one has a direction, so it can rake the picture the same way Emboss lights it.",
      defaults: { dblamt: [24, 24], dblang: [0, 0] },
      gl: src => postPass("dblur", src, u => { gl.uniform1f(u.uAmount, dblAmt); gl.uniform1f(u.uAngle, dblAng * Math.PI / 180); }) },
    { id: "anamorph", cpuOk: false, name: "Anamorphic streaks", stage: "post", params: ["anaamt", "analen"],
      help: "The horizontal flare bars a spherical lens throws off a bright highlight. Bloom spreads a highlight evenly in every direction; this spreads it along one axis only, so the two read as different kinds of light rather than two blurs.",
      defaults: { anaamt: [1, 1], analen: [90, 90] },
      gl: src => postPass("anamorph", src, u => { gl.uniform1f(u.uAmount, anaAmt); gl.uniform1f(u.uLen, anaLen); }) },
    { id: "poster", cpuOk: false, name: "Posterize", stage: "post", params: ["poster"],
      help: "Quantise the colours into flat bands.",
      defaults: { poster: [3, 3] },
      gl: src => postPass("posterize", src, u => gl.uniform1f(u.uLevels, posterLevels)) },
    { id: "halftone", cpuOk: false, name: "Halftone", stage: "post", params: ["halfdot", "halfamt"],
      help: "A rotated dot screen whose dots grow with brightness — the print look. Posterize flattens the ramp; this one spends texture on it.",
      defaults: { halfdot: [6, 6], halfamt: [0.9, 0.9] },
      gl: src => postPass("halftone", src, u => { gl.uniform1f(u.uDot, halfDot); gl.uniform1f(u.uAmount, halfAmt); }) },
    { id: "thresh", cpuOk: false, name: "Solarize", stage: "post", params: ["threshlvl", "threshamt"],
      help: "Invert everything above a brightness level — Posterize's nastier cousin.",
      defaults: { threshlvl: [0.5, 0.5], threshamt: [0.8, 0.8] },
      gl: src => postPass("thresh", src, u => { gl.uniform1f(u.uLevel, threshLevel); gl.uniform1f(u.uAmount, threshAmt); }) },
    { id: "chroma", cpuOk: false, name: "Chromatic aberration", stage: "post", params: ["chroma"],
      help: "Split the red and blue channels radially, so the image fringes toward the corners like a cheap lens.",
      defaults: { chroma: [2.8, 2.8] },
      gl: src => postPass("chroma", src, u => gl.uniform1f(u.uAmount, chromaAmt)) },
    { id: "mirror", cpuOk: false, name: "Mirror", stage: "post", params: ["mirror"],
      help: "Fold the image about its centre — X, Y or both.",
      defaults: { mirror: [1, 1] },
      gl: src => postPass("mirror", src, u => gl.uniform1f(u.uMode, mirrorMode)) },
    // The Shock value IS the ring's position (1 = centre, 0 = off the edge), so arming its
    // beat chips and letting the pulse decay it over the Trigger duration is what animates
    // the wave — the filter itself is stateless. Inserted BEFORE bloom: the menu's
    // per-effect/whole-scene grouping needs the bloom+screen run to stay contiguous.
    { id: "shock", cpuOk: false, name: "Shockwave", stage: "post", params: ["shock", "shockamp", "shockwidth"],
      help: "A displacement ring rushing out from the centre. Arm Shock's beat chips and every beat fires a wave — Trigger duration sets how long it takes to cross the screen.",
      defaults: { shock: [0, 1], shockamp: [0.11, 0.11], shockwidth: [0.16, 0.16] },
      gl: src => postPass("shock", src, u => { gl.uniform1f(u.uAmount, shockAmt); gl.uniform1f(u.uAmp, shockAmp); gl.uniform1f(u.uWidth, shockWidth); }) },
    { id: "pixsort", cpuOk: false, name: "Pixel sort", stage: "post", params: ["pxthresh", "pxstreak", "pxdir"],
      help: "The modern glitch: pixels brighter than the threshold smear into streaks along one direction, dark areas stay put. Lower the threshold to melt more of the picture.",
      defaults: { pxthresh: [0.42, 0.42], pxstreak: [0.75, 0.75], pxdir: [0, 0] },
      gl: src => postPass("pixsort", src, u => { gl.uniform1f(u.uThresh, pxThresh); gl.uniform1f(u.uLen, pxStreak); gl.uniform1f(u.uDir, pxDir); }) },
    { id: "lens", cpuOk: false, name: "Lens bubble", stage: "post", params: ["lenssize", "lensmag", "lensspeed"],
      help: "A wandering fisheye magnifier drifting over the picture — the classic demo lens. Wander at 0 parks it in the middle.",
      defaults: { lenssize: [0.28, 0.28], lensmag: [1.8, 1.8], lensspeed: [0.6, 0.6] },
      gl: src => {
        const cx = 0.5 + 0.33 * Math.sin(postTime * lensSpeed * 0.7);
        const cy = 0.5 + 0.30 * Math.cos(postTime * lensSpeed * 0.53);
        postPass("lens", src, u => { gl.uniform2f(u.uCenter, cx, cy); gl.uniform1f(u.uRad, lensSize); gl.uniform1f(u.uMag, lensMag); });
      } },
    { id: "droste", cpuOk: false, name: "Droste zoom", stage: "post", params: ["drdepth", "drtwist"],
      help: "The picture swallows itself: every ring inward is the whole image again, Depth times smaller, crawling endlessly toward the centre. Spiral shears the rings into a vortex — try it over Wedge fold.",
      defaults: { drdepth: [2, 2], drtwist: [0.5, 0.5] },
      gl: src => postPass("droste", src, u => { gl.uniform1f(u.uDepth, drosteDepth); gl.uniform1f(u.uTwist, drosteTwist); gl.uniform1f(u.uTime, postTime); }) },
    { id: "kuwahara", cpuOk: false, name: "Oil paint", stage: "post", params: ["kuwrad"],
      help: "Kuwahara filtering: each pixel takes the calmest neighbourhood's average, flattening texture while keeping edges — the screen-print / oil-paint look.",
      defaults: { kuwrad: [6, 6] },
      gl: src => postPass("kuwahara", src, u => gl.uniform1f(u.uRad, kuwRad)) },
    // Bloom is a REAL PASS now, not the composite. It used to BE the whole-scene glow with its
    // strength as a uniform, which is exactly why it had no `gl` hook and could never be
    // per-layer. glBloomPass makes it an ordinary chain entry, so each layer glows on its own
    // before the layers blend. (The Canvas2D path still glows via bloomAmt in render(), so it
    // stays available there — hence no cpuOk: false.)
    { id: "bloom", name: "Bloom", stage: "post", params: ["bloom"],
      help: "Additive glow: a blurred copy added back over this layer.",
      defaults: { bloom: [0.35, 0.35] },
      gl: src => glBloomPass(src) },
    // ---- the ex-"screen" filters, now ordinary PER-LAYER image passes ----------------
    // They ran once on the finished composite, at display resolution. Every filter belongs to
    // a layer now and nothing acts on the whole screen. Two consequences worth knowing rather
    // than discovering:
    //   * uSize is the render buffer (fw x fh), not the canvas, so Scanline count means lines
    //     across the render buffer. At Full resolution that is the number it always was; at
    //     lower resolutions the same count is a coarser raster.
    //   * On a stack each layer carries its own and the results blend, so two layers with
    //     scanlines can moire against each other. Put it on ONE layer for a clean raster.
    //   * The old stage existed partly because a vignette UNDER an additive glow gets lit back
    //     up. That is now yours to order: put Vignette after Bloom in the chain and it darkens
    //     the glow too, which is what the old fixed order did.
    { id: "barrel", cpuOk: false, name: "Barrel distortion", stage: "post", params: ["barrel"],
      help: "Bulge the image as if it were painted on the front of a CRT.",
      defaults: { barrel: [0.32, 0.32] },
      gl: src => postPass("barrel", src, u => gl.uniform1f(u.uAmount, barrelAmt)) },
    { id: "scanlines", cpuOk: false, name: "Scanlines", stage: "post", params: ["scan", "scancount"],
      help: "Darken alternating rows — the raster you are pretending to be.",
      defaults: { scan: [0.35, 0.35], scancount: [240, 240] },
      gl: src => postPass("scan", src, u => { gl.uniform1f(u.uAmount, scanAmt); gl.uniform1f(u.uCount, scanCount); }) },
    { id: "crt", cpuOk: false, name: "CRT phosphor", stage: "post", params: ["crtmask", "crtbleed"],
      help: "Shadow-mask RGB triads and the beam's horizontal smear — the rest of the CRT, beside Scanlines and Barrel.",
      defaults: { crtmask: [0.5, 0.5], crtbleed: [0.4, 0.4] },
      gl: src => postPass("crt", src, u => { gl.uniform1f(u.uMask, crtMask); gl.uniform1f(u.uBleed, crtBleed); }) },
    { id: "vignette", cpuOk: false, name: "Vignette", stage: "post", params: ["vignette"],
      help: "Fall off toward the corners.",
      defaults: { vignette: [0.4, 0.4] },
      gl: src => postPass("vignette", src, u => gl.uniform1f(u.uAmount, vigAmt)) },
    { id: "grain", cpuOk: false, name: "Film grain", stage: "post", params: ["grain"],
      help: "Animated noise over the finished frame.",
      defaults: { grain: [0.22, 0.22] },
      gl: src => postPass("grain", src, u => { gl.uniform1f(u.uAmount, grainAmt); gl.uniform1f(u.uTime, postTime); }) },
  ];
  const FILTER_BY_ID = {};
  FILTERS.forEach(f => FILTER_BY_ID[f.id] = f);
  // Fill the fallback mask now that the registry exists (see cpuBlocked's declaration).
  if (!useGL) FILTERS.forEach(f => { if (f.cpuOk === false) cpuBlocked.add(f.id); });
  const FILTER_DEFAULTS = {};                 // merged into every effect's state
  FILTERS.forEach(f => Object.assign(FILTER_DEFAULTS, f.defaults));
  // ---- ORDER: the stored list is the USER's order, not the registry's ----------------
  // Each per-effect filter carries a drag handle, so `L.filters` is an ORDERED list and
  // everything that walks a chain iterates that order. (`filtersOk` builds its Set by
  // inserting in array order and a JS Set iterates in insertion order, so the stored order
  // survives it untouched.) Registry order is still the fallback for anything with no
  // stored list, and ids are still matched by name, so reordering FILTERS itself cannot
  // remap a saved scene.
  //
  // STAGE OUTRANKS THE USER'S ORDER, and it has to. A `feedback` filter mutates retained
  // heat BEFORE the effect draws, a `post` filter runs on the palette-mapped image AFTER,
  // and a `screen` filter after the composite — there is no pipeline position where
  // Pixelate could run before Fire. So a chain is stage-partitioned, stably, and the MENU
  // is rendered from this same normalized order. That is what keeps "applied in the order
  // shown" literally true rather than approximately: drag an image filter above a heat one
  // and it visibly lands at the boundary instead of pretending to move.
  //
  // A function declaration, not a const arrow: render-gl-pipeline.js is 5th in the manifest
  // and calls this, while FILTERS lives here at 21st. Hoisting is what makes that legal —
  // exactly the arrangement `filtersOk` already relies on.
  const FILTER_STAGE_RANK = { feedback: 0, post: 1, screen: 2 };
  function orderFilters(ids) {
    const out = [], seen = new Set();
    for (const id of ids || []) {
      const f = FILTER_BY_ID[id];
      if (f && !seen.has(id)) { seen.add(id); out.push(f); }
    }
    // NO stage sort for the per-layer chain — see splitChain. `screen` filters belong to the
    // scene list, which is not reorderable, so they are pushed last purely for tidiness.
    return out.sort((a, b) => (a.stage === "screen" ? 1 : 0) - (b.stage === "screen" ? 1 : 0));
  }
  // ---- WHERE EACH FILTER RUNS: split the chain, do not sort it ------------------------
  // The chain is a sequence and it is honoured as one. The pipeline has exactly one fixed
  // point — the effect draws its fresh output into the heat buffer — and everything the user
  // puts ABOVE that runs on the heat, everything below runs on the palette-mapped picture.
  //
  // A `feedback` filter (Fire, Fade, Diffuse, Echo, Zoom feedback, Swirl) reads and writes
  // retained heat with a keep factor; it is only meaningful in the heat phase, so the LAST
  // feedback filter in the chain marks the boundary. A `post` filter is just a pass that
  // samples a texture and draws a quad, so it runs happily in EITHER phase: placed above a
  // feedback filter it warps the heat (heat textures are R8, the shader writes .r back);
  // placed below, it repaints the finished image as before.
  //
  // This is what makes "Mirror above Swirl" a real, visible thing rather than a drag that
  // snaps back — reported twice, and the previous answer (partition by stage, draw the
  // boundary, explain the clamp) was solving the wrong problem. With no feedback filter at
  // all the heat is cleared every frame, so there is nothing to warp and the whole chain runs
  // in the image phase.
  function splitChain(ids) {
    const list = orderFilters(ids).filter(f => f.stage !== "screen");
    let last = -1;
    list.forEach((f, i) => { if (f.stage === "feedback") last = i; });
    return {
      heat: list.slice(0, last + 1).filter(f => f.glFeedback || f.gl),
      image: list.slice(last + 1).filter(f => f.gl),
    };
  }
  // Run one entry of a heat-phase chain: a feedback filter through its own hook, a post
  // filter through the ordinary pass it already has. Both draw into the bound FBO.
  function runHeatPass(f, srcTex) {
    if (f.glFeedback) f.glFeedback(srcTex); else f.gl(srcTex);
  }
  // Which filters are on for the live effect, in the order they will be applied: the
  // selected layer's own ordered set, plus the scene-global ones (which are not per-layer
  // and so have no user order of their own).
  function activeFilters() {
    const ids = [...(renderFilters || activeIds)];
    for (const f of FILTERS) if (isSceneFilter(f.id) && sceneOn.has(f.id)) ids.push(f.id);
    return orderFilters(ids).filter(f => filterOn(f.id));
  }
  // The SELECTED layer's per-effect filter ids in the user's order — what saveExtra and
  // captureLayerExtras write back. They used to write `FILTERS.filter(...)`, i.e. registry
  // order, which silently discarded any reordering on the very next capture.
  const activeFilterIds = () => orderFilters(activeIds).map(f => f.id);
  // AFTER the ORDER block, not before it: buildFilterUI ends in renderFilterLists, which
  // calls orderFilters, which reads the `const FILTER_STAGE_RANK` above. Called any earlier
  // that const is in the temporal dead zone and the whole list silently fails to render —
  // every filter showing at once, because nothing ever hid the ones you have not added.
  // (`function orderFilters` itself hoists fine; it is the const it closes over that does not.)
  buildFilterUI();                           // must follow FILTERS, not buildControls
  // transBurning(): a "burn off" transition lends retention to a scene that has none,
  // so the outgoing image decays under it instead of being wiped on the first frame.
  const hasFeedback = () => transBurning() || FILTERS.some(f => f.stage === "feedback" && filterOn(f.id));
  // ONE layer's chain as it will actually be drawn: its stored order (or the descriptor
  // default) less anything bypassed. The stored list itself is never touched — bypass is a
  // view of the chain, not an edit to it, so it survives no save and changes no scene.
  function liveChainIds(L) {
    const set = filtersOk(L && L.filters) || new Set(presetFilters(L ? L.fx : effect));
    const off = (L && L.fxOff) || null;
    if (!off || !off.size) return set;
    return new Set([...set].filter(id => !off.has(id)));
  }
  function filtersOk(v) {                     // validate a stored list
    if (!Array.isArray(v)) return null;
    const seen = new Set();
    for (const id of v) if (typeof id === "string" && FILTER_BY_ID[id]) seen.add(id);
    return seen;
  }
  // A descriptor's default filter list. Every effect now ships with NO filters on — a new
  // effect / layer starts as its raw output, and you tick the filters you want. (A descriptor
  // may still pin its own `filters` list; none do.) NOTE: point effects (Sierpiński / Tetrafyer
  // / Attractor) render as raw stamped points without `fire` — tick Fire to get the rising-fire
  // look. Bloom is off too, so nothing glows until you enable it.
  function presetFilters(e) {
    const d = EFFECTS[e].filters || [];
    return d.slice();
  }
