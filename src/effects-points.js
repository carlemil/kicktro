  // ---- Geometric shape effects (CPU mirrors of FS_POLYGON / FS_SHAPEGRID / FS_CONCENTRIC
  // / FS_BOUNCE). Each *Seed(dt) advances this frame's phase and is called ONCE per frame
  // in the descriptor's draw hook; the mirror TAKES that seed and never re-seeds, so the
  // Canvas2D path can't advance the clock twice a frame (the trap the cardioid effects hit).
  const SH_TAU = 6.2831853;
  const shMod = (a, b) => a - b * Math.floor(a / b);                 // GLSL mod (handles negatives)
  const shStep = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };  // smoothstep (works either direction)
  // Polygon: one rotating regular N-gon; thick=1 filled, →0 a thin outline.
  // ---- Batch D: Physarum and curl-noise flow, both agent simulations --------------------
  // PHYSARUM (slime mould): each agent samples the trail map ahead-left, ahead and ahead-right,
  // turns toward whichever is strongest, moves, and deposits. Nothing tells them to make
  // networks -- the veins, the loops and the pruning are all emergent from those four lines,
  // which is why it looks alive in a way a particle system does not.
  //
  // The trail map is its OWN buffer, not the heat buffer. Reading heat back would mean a GPU
  // readback every frame on the GL path, and the trail needs its own decay and blur anyway --
  // the heat buffer is shared with every other layer and is cleared by the feedback rules.
  const PHY_MAX = 6000, PHY_W = 420, PHY_H = 236;
  // The disturbance field: its resolution, and how hard it bites into the trail's decay at
  // Scatter 1. See the note where it is built.
  const SCAT_CW = 13, SCAT_CH = 8, SCAT_BITE = 0.85;
  let phCount = 2500, phSense = 9, phTurn = 0.5, phDecay = 0.88, phSpeed = 1, phScatter = 0.3, phSize = 1, phAgents = null;
  // GROW AND SHRINK IN PLACE, like ensureSolids/ensureTetras -- never reallocate and re-seed.
  // Agents is an ordinary drift-able dual with step 50, so spreading its band or arming a beat
  // chip lands Math.round() on a different count most ticks. Re-seeding on every length change
  // teleported all 2500 agents back to their hashed start positions several times a second, so
  // the network could never form: it read as a physics bug rather than an allocation one.
  function ensurePhy(P, n, salt) {
    const seed = (a, i) => {
      const h = shHash21(i * 3.7 + salt, i * 1.3 + salt * 2.1);
      const h2 = shHash21(i * 9.1 + salt * 5, i * 0.7 + salt);
      a[i * 3] = h; a[i * 3 + 1] = h2; a[i * 3 + 2] = h * 6.2831;
    };
    if (!P.a) { P.a = new Float32Array(n * 3); for (let i = 0; i < n; i++) seed(P.a, i); }
    else if (P.a.length !== n * 3) {
      const old = P.a, keep = Math.min(old.length, n * 3);
      P.a = new Float32Array(n * 3);
      P.a.set(old.subarray(0, keep));                       // survivors keep their position + heading
      for (let i = keep / 3 | 0; i < n; i++) seed(P.a, i);   // only the NEW agents are placed
    }
    // THE TRAIL MAP HAS ITS OWN FIXED RESOLUTION, not the heat grid's. At full resolution it
    // is ~1.4M cells, and stamping the lit ones meant millions of plot() calls against an
    // 8192-point blit buffer -- the network formed correctly and then arrived nearly black
    // because almost every point was dropped. At 420x236 a vein is a few thousand cells,
    // which is a budget the point pipeline actually has.
    if (!P.tr) { P.tr = new Float32Array(PHY_W * PHY_H); P.tw = PHY_W; P.th = PHY_H; }
  }
  function installPhysarum(L) {
    L.physarum = L.physarum || {};
    ensurePhy(L.physarum, Math.max(200, Math.min(PHY_MAX, Math.round(phCount))), layerSalt(L) + 1);
    phAgents = L.physarum;
  }
  function physarumStamp(xL, xR, yT, yB, n) {
    const P = phAgents;
    if (!P) return;
    ensurePhy(P, Math.max(200, Math.min(PHY_MAX, Math.round(phCount))), 1);
    const A = P.a, tr = P.tr, W = P.tw, H = P.th, N = A.length / 3;
    const sense = Math.max(1, phSense), turn = phTurn, step = 0.6 + phSpeed * 1.4;
    // SCATTER. Without it the culture SOLVES its dish and then stops: the veins reinforce
    // themselves, every agent follows the strongest trail it can see, and within a few
    // seconds the picture is a static diagram that never changes again. The four rules that
    // make the network emerge are also what make it a fixed point.
    //
    // A little heading noise per step is the standard cure and the honest one -- a real
    // slime mould is noisy, and the network it builds is a moving equilibrium rather than a
    // final answer. Agents wander off a vein, find nothing, come back or start a new branch,
    // and the whole thing keeps reorganising.
    //
    // The noise has to vary with TIME, not just with the agent: a per-agent constant is a
    // fixed bias each one steers with, and the culture settles into a skewed network just as
    // completely as it settled into a straight one. Hence the tick counter -- which lives on
    // the layer beside the agents, so two slime layers scatter independently. Still no
    // Math.random anywhere: this is a hash, so a run is reproducible.
    const scat = Math.max(0, phScatter);
    P.t = (P.t || 0) + 1;
    const tk = P.t;
    // A COARSE, SLOWLY DRIFTING FIELD, rebuilt each step. Where it is high the trail decays
    // faster, so the veins there starve and the agents abandon them; as the field drifts,
    // that dead ground reopens and the network grows back into it somewhere else. The result
    // is weather moving over the culture -- large-scale structure that never stops
    // rearranging, which is the thing that was missing.
    //
    // Coarse and bilinear-free on purpose: 26x15 is 390 noise evaluations a step against
    // 99k if it were per cell, and the 3-tap blur in the decay pass smooths the cell edges
    // out anyway. The picture is a slow modulation, not a texture.
    if (scat > 0) {
      if (!P.fld || P.fld.length !== SCAT_CW * SCAT_CH) P.fld = new Float32Array(SCAT_CW * SCAT_CH);
      const ft = tk * 0.004;
      for (let j = 0; j < SCAT_CH; j++)
        for (let i2 = 0; i2 < SCAT_CW; i2++)
          P.fld[j * SCAT_CW + i2] = shVNoise(i2 * 0.42 + ft, j * 0.42 - ft * 0.71);
    }
    const at = (x, y) => tr[((y % H) + H) % H * W + (((x % W) + W) % W)];
    for (let i = 0; i < N; i++) {
      const x = A[i * 3] * W, y = A[i * 3 + 1] * H, a = A[i * 3 + 2];
      // three sensors: ahead-left, ahead, ahead-right
      const fl = at((x + Math.cos(a - 0.6) * sense) | 0, (y + Math.sin(a - 0.6) * sense) | 0);
      const fc = at((x + Math.cos(a) * sense) | 0, (y + Math.sin(a) * sense) | 0);
      const fr = at((x + Math.cos(a + 0.6) * sense) | 0, (y + Math.sin(a + 0.6) * sense) | 0);
      let na = a;
      if (fc >= fl && fc >= fr) { /* straight on */ }
      else if (fl > fr) na = a - turn;
      else if (fr > fl) na = a + turn;
      else na = a + (shHash21(i, fc) - 0.5) * turn * 2;
      const nx = x + Math.cos(na) * step, ny = y + Math.sin(na) * step;
      A[i * 3] = ((nx / W) % 1 + 1) % 1;            // wrap, so the culture never runs out of dish
      A[i * 3 + 1] = ((ny / H) % 1 + 1) % 1;
      A[i * 3 + 2] = na;
      const ix = A[i * 3] * W | 0, iy = A[i * 3 + 1] * H | 0;
      tr[iy * W + ix] = Math.min(1, tr[iy * W + ix] + 0.5);
    }
    // decay + a cheap 3-tap blur along x, which is what turns dots into veins
    const keep = Math.max(0.5, Math.min(0.995, phDecay));
    const sx = (xR - xL) / W, sy = (yB - yT) / H;
    // AGENT SIZE, measured in TRAIL CELLS rather than in screen pixels, which is the whole
    // reason it is worth having. The trail map is a fixed 420x236 while the heat grid follows
    // the window, so one cell is about 2.3px across at a typical size -- and stamping a single
    // point per cell left a 1.3px hole beside every one of them. That gap is why the network
    // has always drawn as a dot grid rather than as veins, and it got wider on a bigger
    // screen. At size 1 the marks are one cell across and just touch, at any resolution.
    //
    // IT COSTS NOTHING, AND THE FIRST VERSION COST A LOT. That one stamped a block of points
    // per lit cell -- 7.4k points a tick became 96k at the top of the slider, and the effect
    // visibly slowed down. It is the rasteriser's job to fill a mark, not the CPU's: the
    // count of points is unchanged now, and only gl_PointSize moves. One point at size 5
    // costs a point.
    //
    // A point sprite is square, so this is one number rather than the ellipse the block
    // version could express; sx and sy differ only by the window's aspect against the trail
    // map's, which is a few percent, and FS_PTS rounds the sprite off anyway.
    glPtSize = Math.max(1, Math.max(0, phSize) * (sx + sy) * 0.5);
    const fldRow = scat > 0 ? SCAT_CH / H : 0, fldCol = scat > 0 ? SCAT_CW / W : 0;
    for (let y2 = 0; y2 < H; y2++) {
      const row = y2 * W;
      // Hoisted: the field row is constant across the scanline, and this loop is the
      // hottest in the effect.
      const fRow = scat > 0 ? ((y2 * fldRow) | 0) * SCAT_CW : 0;
      let prev = tr[row + W - 1];
      for (let x2 = 0; x2 < W; x2++) {
        const cur = tr[row + x2], nxt = tr[row + (x2 + 1) % W];
        const k2 = scat > 0 ? keep * (1 - scat * SCAT_BITE * P.fld[fRow + ((x2 * fldCol) | 0)]) : keep;
        const v = (prev * 0.25 + cur * 0.5 + nxt * 0.25) * k2;
        prev = cur; tr[row + x2] = v;
        // Only the LIT cells are stamped. The threshold is what keeps this inside the point
        // budget: the network is a thin set, and the dark 95% of the dish costs nothing.
        // ONE point per lit cell, whatever the size -- glPtSize above does the widening.
        if (v > 0.06) plot(xL + x2 * sx, yT + y2 * sy, Math.min(255, v * 420));
      }
    }
  }
  // CURL-NOISE FLOW. The velocity field is the CURL of a noise field, which is divergence-free
  // by construction -- so particles never pile up or thin out, they only swirl. That is the
  // difference between this and dragging points along a plain noise gradient, which drains.
  const CURL_MAX = 8000;
  let cuCount = 900, cuScale = 2.2, cuSpeed = 1, cuLife = 2.5, cuField = null;
  // Grows and shrinks IN PLACE, for the reason spelled out above ensurePhy: Count is a
  // drift-able dual, and re-seeding on every length change restarts every particle mid-flight.
  function ensureCurl(C, n, salt) {
    const seed = (p, i) => {
      p[i * 3] = shHash21(i * 2.1 + salt, i * 5.7 + salt);
      p[i * 3 + 1] = shHash21(i * 7.3 + salt * 3, i * 1.9 + salt);
      p[i * 3 + 2] = shHash21(i * 4.4 + salt, i * 8.1) * cuLife;
    };
    if (!C.p) { C.p = new Float32Array(n * 3); for (let i = 0; i < n; i++) seed(C.p, i); }
    else if (C.p.length !== n * 3) {
      const old = C.p, keep = Math.min(old.length, n * 3);
      C.p = new Float32Array(n * 3);
      C.p.set(old.subarray(0, keep));
      for (let i = keep / 3 | 0; i < n; i++) seed(C.p, i);
    }
  }
  function installCurl(L) {
    L.curl = L.curl || {};
    ensureCurl(L.curl, Math.max(200, Math.min(CURL_MAX, Math.round(cuCount))), layerSalt(L) + 1);
    cuField = L.curl;
  }
  function curlStamp(xL, xR, yT, yB, n) {
    const C = cuField;
    if (!C) return;
    ensureCurl(C, Math.max(200, Math.min(CURL_MAX, Math.round(cuCount))), 1);
    const P = C.p, N = P.length / 3, sc = Math.max(0.2, cuScale);
    const dt = 1 / Math.max(30, cfg.burn), e = 0.02;
    // 0.012, not 0.35. At the first value a particle crossed the frame in about a dozen
    // ticks, so almost every one was out of bounds and respawning every frame -- which is
    // precisely a field of random dots, and is what the first render showed.
    const spd = cuSpeed * 0.055;
    C.t = (C.t || 0) + dt * cuSpeed * 0.3;
    const life = Math.max(0.2, cuLife);
    // SUB-STEPS, PLOTTED. A divergence-free field never clumps -- that is the whole point of
    // it -- so the instantaneous positions are always an even scatter no matter how good the
    // flow is. The structure lives in the PATH, so each particle is advanced in several small
    // steps per tick and every one is stamped, which draws the streamline itself.
    // 8 sub-steps x 900 particles = 7200 stamps, just inside the 8192-point blit buffer.
    // Those two numbers are tied: raising either past that silently drops stamps.
    const SUB = 8;
    for (let i = 0; i < N; i++) {
      let x = P[i * 3], y = P[i * 3 + 1];
      let age = P[i * 3 + 2] - dt;
      for (let k = 0; k < SUB; k++) {
        // curl of a scalar noise field: (dN/dy, -dN/dx) -- divergence-free in 2D
        const nx1 = shVNoise(x * sc, (y + e) * sc + C.t), nx0 = shVNoise(x * sc, (y - e) * sc + C.t);
        const ny1 = shVNoise((x + e) * sc, y * sc + C.t), ny0 = shVNoise((x - e) * sc, y * sc + C.t);
        const vx = (nx1 - nx0) / (2 * e), vy = -(ny1 - ny0) / (2 * e);
        x += vx * spd * dt; y += vy * spd * dt;
        plot(xL + x * (xR - xL), yT + y * (yB - yT), POINT_HEAT);
      }
      if (age <= 0 || x < -0.1 || x > 1.1 || y < -0.1 || y > 1.1) {
        // respawn, so the field keeps being explored rather than settling into its attractors
        x = shHash21(i * 1.7 + C.t * 13, i * 3.1 + C.t * 7);
        y = shHash21(i * 9.4 + C.t * 5, i * 6.2 + C.t * 11);
        age = life * (0.4 + 0.6 * shHash21(i, C.t));
      }
      P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = age;
    }
  }
  // ---- Batch C mirrors: volume, scatter and landscape, all deliberately thinned ---------
  // A 48-step volume march with a 5-tap light march per step is ~240 noise evaluations per
  // PIXEL -- a shader's budget, not a JS loop's. These keep the shape (a lit cloud field, a
  // radial shaft, a lit horizon) at a fraction of the samples, and say so. Every one writes
  // every cell.
  function shVNoise3(x, y, z) {
    const iz = Math.floor(z), fz = z - iz, uz = fz * fz * (3 - 2 * fz);
    return shVNoise(x + iz * 37.1, y + iz * 17.3) * (1 - uz) + shVNoise(x + (iz + 1) * 37.1, y + (iz + 1) * 17.3) * uz;
  }
  let clCover = 0.55, clScale = 1.1, clOct = 4, clLight = 1, clSpeed = 1, clTime = 0;
  function cloudsSeed(dt) { clTime += dt * clSpeed; return { t: clTime, cover: clCover, scale: clScale, oct: clOct, light: clLight, zoom }; }
  function clouds(s) {
    const sc = Math.max(0.15, s.scale);
    let idx = 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      camPix(x, y);
      const ux = (camPX - 0.5 * fw) / fh / s.zoom, uy = (camPY - 0.5 * fh) / fh / s.zoom;
      const rl = Math.hypot(ux, uy, 1.2);
      const rx = ux / rl, ry = uy / rl, rz = 1.2 / rl;
      let t = 0.6, trans = 1, acc = 0;
      for (let i = 0; i < 14; i++) {          // 14 steps, not 48
        const px = rx * t, py = ry * t, pz = s.t * 0.35 + rz * t;
        const d = Math.max(0, Math.min(1, (shVNoise3(px * sc, py * sc, pz * sc + s.t * 0.12) - (1 - s.cover)) * 2.4));
        if (d > 0.01) { acc += d * trans * 0.5; trans *= Math.exp(-d * 0.6); if (trans < 0.02) break; }
        t += 0.42;
      }
      fire[idx++] = Math.max(0, Math.min(1, acc)) * 255;
    }
  }
  let grDecay = 0.96, grWeight = 1.1, grScale = 2.2, grSpread = 1, grSpeed = 1, grTime = 0;
  function godraySeed(dt) { grTime += dt * grSpeed; return { t: grTime, decay: grDecay, weight: grWeight, scale: grScale, spread: grSpread, zoom }; }
  function godray(s) {
    const asp = fw / fh, sc = Math.max(0.2, s.scale);
    const lx = Math.sin(s.t * 0.21) * 0.30, ly = Math.cos(s.t * 0.17) * 0.18;
    const dec = Math.max(0.8, Math.min(0.999, s.decay));
    let idx = 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      camPix(x, y);
      const ux = (camPX / fw - 0.5) * asp / s.zoom, uy = (camPY / fh - 0.5) / s.zoom;
      const sx = (ux - lx) * (Math.max(0.05, s.spread) / 12), sy = (uy - ly) * (Math.max(0.05, s.spread) / 12);
      let px = ux, py = uy, illum = 0, decay = 1;
      for (let i = 0; i < 12; i++) {          // 12 steps, not 40
        px -= sx; py -= sy;
        const f = shVNoise(px * sc + s.t * 0.06, py * sc + s.t * 0.03);
        illum += (1 - Math.max(0, Math.min(1, (f - 0.46) / 0.16))) * decay;
        decay *= dec;
      }
      const core = Math.exp(-Math.hypot(ux - lx, uy - ly) * 9);
      fire[idx++] = Math.max(0, Math.min(1, illum * s.weight / 12 + core)) * 255;
    }
  }
  let teHeight = 1.6, teScale = 0.55, teOct = 5, teFog = 1, teSpeed = 1, teTime = 0;
  function terrainSeed(dt) { teTime += dt * teSpeed; return { t: teTime, height: teHeight, scale: teScale, oct: teOct, fog: teFog, zoom }; }
  function terrain(s) {
    const sc = Math.max(0.05, s.scale), h = Math.max(0.05, s.height);
    const oy = h * 0.55 + 0.6, oz = s.t * 0.5;
    let idx = 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      camPix(x, y);
      const ux = (camPX - 0.5 * fw) / fh / s.zoom, uy = -(camPY - 0.5 * fh) / fh / s.zoom;
      const rl = Math.hypot(ux, uy, 1.3);
      const rx = ux / rl, ry = uy / rl, rz = 1.3 / rl;
      let t = 0.4, hit = -1;
      for (let i = 0; i < 26; i++) {          // 26 steps, not 90
        const py = oy + ry * t;
        const d = py - shVNoise(rx * t * sc, (oz + rz * t) * sc) * h;
        if (d < 0.02 * t) { hit = t; break; }
        t += Math.max(0.06, d * 0.6);
        if (t > 40) break;
      }
      let heat;
      if (hit < 0) heat = 0.06 + 0.16 * Math.max(0, Math.min(1, (0.4 - uy) / 0.5));
      else heat = Math.max(0, 0.18 + 0.6 * (1 - Math.min(1, hit * s.fog * 0.04)));
      fire[idx++] = Math.max(0, Math.min(1, heat)) * 255;
    }
  }
  // ---- Batch B: three fractal raymarchers, and their deliberately coarse mirrors --------
  // 90 march steps x a 12-iteration distance estimator is a shader's budget, not a JS loop's,
  // so each mirror marches far fewer steps at fewer iterations: the silhouette survives, the
  // filigree does not. Same trade the Ocean mirror documents. They still write EVERY cell.
  function bMarch(fw2, fh2, de, dist, lift, t, zoom2, steps) {
    const ro = [Math.sin(t) * dist, lift + Math.sin(t * 0.37) * dist * 0.25, Math.cos(t) * dist];
    const fl = Math.hypot(ro[0], ro[1], ro[2]) || 1;
    const f = [-ro[0] / fl, -ro[1] / fl, -ro[2] / fl];
    const rx = f[2], rz = -f[0], rl = Math.hypot(rx, rz) || 1;
    const r = [rx / rl, 0, rz / rl];
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    let idx = 0;
    for (let y = 0; y < fh2; y++) for (let x = 0; x < fw2; x++) {
      camPix(x, y);
      const ux = (camPX - 0.5 * fw2) / fh2 / zoom2, uy = (camPY - 0.5 * fh2) / fh2 / zoom2;
      let dx = r[0] * ux + u[0] * uy + f[0] * 1.4;
      let dy = r[1] * ux + u[1] * uy + f[1] * 1.4;
      let dz = r[2] * ux + u[2] * uy + f[2] * 1.4;
      const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      let tt = 0, hit = 0;
      for (let i = 0; i < steps; i++) {
        const d = de(ro[0] + dx * tt, ro[1] + dy * tt, ro[2] + dz * tt);
        if (d < 0.01) { hit = 1 - i / steps; break; }
        tt += d * 0.9;
        if (tt > 14) break;
      }
      fire[idx++] = Math.max(0, Math.min(1, hit)) * 255;
    }
  }
  let apScale = 1.15, apIter = 8, apGlow = 0.6, apThin = 1, apSpeed = 1, apTime = 0;
  function apolloSeed(dt) { apTime += dt * apSpeed; return { t: apTime, scale: apScale, iter: apIter, glow: apGlow, thin: apThin, zoom }; }
  function apollo(s) {
    const it = Math.max(3, Math.min(6, Math.round(s.iter)));
    bMarch(fw, fh, (x, y, z) => {
      let px = x, py = y, pz = z, sc = 1;
      for (let i = 0; i < it; i++) {
        px = -1 + 2 * (px * 0.5 + 0.5 - Math.floor(px * 0.5 + 0.5));
        py = -1 + 2 * (py * 0.5 + 0.5 - Math.floor(py * 0.5 + 0.5));
        pz = -1 + 2 * (pz * 0.5 + 0.5 - Math.floor(pz * 0.5 + 0.5));
        const f = s.scale / Math.max(px * px + py * py + pz * pz, 0.02);
        px *= f; py *= f; pz *= f; sc *= f;
      }
      return 0.35 * Math.abs(py) / sc;
    }, 2.4, 0.2, s.t * 0.2, s.zoom, 26);
  }
  let bxScale = -1.7, bxIter = 8, bxGlow = 0.5, bxFold = 1, bxSpeed = 1, bxTime = 0;
  function mboxSeedFn(dt) { bxTime += dt * bxSpeed; return { t: bxTime, scale: bxScale, iter: bxIter, glow: bxGlow, fold: bxFold, zoom }; }
  function mbox(s) {
    const it = Math.max(3, Math.min(6, Math.round(s.iter))), fo = Math.max(0.5, s.fold);
    bMarch(fw, fh, (X, Y, Z) => {
      let zx = X, zy = Y, zz = Z, dr = 1;
      for (let i = 0; i < it; i++) {
        zx = Math.min(Math.max(zx, -fo), fo) * 2 * fo - zx;
        zy = Math.min(Math.max(zy, -fo), fo) * 2 * fo - zy;
        zz = Math.min(Math.max(zz, -fo), fo) * 2 * fo - zz;
        const r2 = zx * zx + zy * zy + zz * zz;
        if (r2 < 0.25) { const g = 4; zx *= g; zy *= g; zz *= g; dr *= g; }
        else if (r2 < 1) { const g = 1 / r2; zx *= g; zy *= g; zz *= g; dr *= g; }
        zx = zx * s.scale + X; zy = zy * s.scale + Y; zz = zz * s.scale + Z;
        dr = dr * Math.abs(s.scale) + 1;
      }
      return Math.hypot(zx, zy, zz) / Math.abs(dr);
    }, 6.5, 0.6, s.t * 0.17, s.zoom, 26);
  }
  let gyFreq = 2.2, gyThick = 0.35, gyGlow = 0.5, gyWarp = 0.6, gySpeed = 1, gyTime = 0;
  function gyroidSeed(dt) { gyTime += dt * gySpeed; return { t: gyTime, freq: gyFreq, thick: gyThick, glow: gyGlow, warp: gyWarp, zoom }; }
  function gyroid(s) {
    const f = Math.max(0.4, s.freq);
    bMarch(fw, fh, (x, y, z) => {
      const qx = x * f + Math.sin(s.t * 0.3) * s.warp, qy = y * f + Math.cos(s.t * 0.23) * s.warp, qz = z * f;
      const g = Math.sin(qx) * Math.cos(qz) + Math.sin(qy) * Math.cos(qx) + Math.sin(qz) * Math.cos(qy);
      return Math.max((Math.abs(g) - s.thick) / (f * 1.7), Math.hypot(x, y, z) - 1.7);
    }, 4.6, 0, s.t * 0.15, s.zoom, 30);
  }
  // Smooth CSG: two clocks (animation, camera sway) and a HASHED CAST. csgBuild rolls the
  // scene from (Seed, Objects) once and caches it: kind, size, home, Lissajous path, spin
  // and tone per object, ~30% of them carvers parked on an adder's path so the cavity
  // wanders through a solid rather than through empty space. gbHashJS on the CPU, never a
  // GPU hash -- the scene must be the same on every frame and every driver build.
  let csgBlend = 0.35, csgSpeed = 1, csgOrbit = 1, csgShine = 1.25, csgWidth = 0.21, csgTime = 0, csgOrbT = 0;
  let csgSeedV = 1, csgCount = 5, csgKey = "";
  const csgObj = new Float32Array(32), csgPath = new Float32Array(32), csgSpin = new Float32Array(32), csgPhase = new Float32Array(32);
  function csgBuild() {
    const key = csgSeedV + "/" + csgCount;
    if (key === csgKey) return;
    csgKey = key;
    const H = (i, k) => gbHashJS(csgSeedV * 7.31 + i * 1.17 + k * 0.53);
    const n = csgCount, adders = [], home = [];
    for (let i = 0; i < n; i++) {
      home.push([(H(i, 4) - 0.5) * 4.4, (H(i, 5) - 0.5) * 2.0, (H(i, 6) - 0.5) * 1.6]);
      if (i === 0 || H(i, 2) >= 0.3) adders.push(i);
    }
    // centre the adders on the origin -- the camera's look-at -- so a cast never piles
    // up in one corner of the frame
    let mx = 0, my = 0;
    for (const i of adders) { mx += home[i][0]; my += home[i][1]; }
    mx /= adders.length; my /= adders.length;
    for (let i = 0; i < 8; i++) {
      const o = i * 4;
      if (i >= n) { csgObj.fill(0, o, o + 4); csgPath.fill(0, o, o + 4); csgSpin.fill(0, o, o + 4); csgPhase.fill(0, o, o + 4); continue; }
      const carve = !adders.includes(i);
      let kind = Math.floor(H(i, 1) * 4) % 4;
      let size = 0.3 + 0.45 * H(i, 3);
      let hx = home[i][0] - mx, hy = home[i][1] - my, hz = home[i][2];
      let ax = H(i, 7) * 0.9, ay = H(i, 8) * 0.7, az = H(i, 9) * 0.5, rate = 0.4 + 1.2 * H(i, 10);
      let px = H(i, 14) * 6.2832, py = H(i, 15) * 6.2832, pz = H(i, 16) * 6.2832;
      if (carve) {
        // ride an adder: its home, path and rate, offset so the cavity sits in its flank
        const j = adders[Math.floor(H(i, 18) * adders.length) % adders.length], jo = j * 4;
        const hs = csgObj[jo + 3];
        kind = H(i, 19) < 0.7 ? 0 : 1; size = hs * 0.55;
        hx = csgObj[jo] + (H(i, 20) - 0.5) * hs * 1.4; hy = csgObj[jo + 1] + (H(i, 21) - 0.5) * hs * 1.4; hz = csgObj[jo + 2] + hs * 0.5;
        ax = csgPath[jo]; ay = csgPath[jo + 1]; az = csgPath[jo + 2]; rate = csgPath[jo + 3];
        px = csgPhase[jo] + (H(i, 22) - 0.5) * 0.8; py = csgPhase[jo + 1] + (H(i, 23) - 0.5) * 0.8; pz = csgPhase[jo + 2];
        kind += 10;
      }
      csgObj.set([hx, hy, hz, size], o);
      csgPath.set([ax, ay, az, rate], o);
      csgSpin.set([(H(i, 11) - 0.5) * 60, (H(i, 12) - 0.5) * 60, (H(i, 13) - 0.5) * 60, kind], o);
      csgPhase.set([px, py, pz, 0.45 + 0.5 * H(i, 17)], o);
    }
  }
  function csgSeed(dt) {
    csgTime += dt * csgSpeed * 0.7; csgOrbT += dt * csgOrbit; csgBuild();
    return { t: csgTime, orbit: csgOrbT, blend: csgBlend, shine: csgShine, width: csgWidth, zoom,
             count: csgCount, obj: csgObj, path: csgPath, spin: csgSpin, phase: csgPhase };
  }
  // CPU mirror: the same cast on bMarch's lambert, unrotated -- the shape of the thing, not
  // a copy of it (the Ocean rule).
  function csgCPU(s) {
    const t = s.t, k = Math.max(1e-4, s.blend), n = s.count;
    const box = (x, y, z, b) => { const qx = Math.abs(x) - b, qy = Math.abs(y) - b, qz = Math.abs(z) - b;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0); };
    const sd = (x, y, z, kind, r) => kind === 0 ? Math.hypot(x, y, z) - r : kind === 1 ? box(x, y, z, r * 0.8)
      : kind === 2 ? Math.hypot(Math.hypot(x, z) - r, y) - r * 0.35 : Math.hypot(x, y - Math.max(-r * 0.8, Math.min(r * 0.8, y)), z) - r * 0.45;
    const cx = new Float32Array(8), cy = new Float32Array(8), cz = new Float32Array(8);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      cx[i] = s.obj[o] + s.path[o] * Math.sin(t * s.path[o + 3] + s.phase[o]);
      cy[i] = s.obj[o + 1] + s.path[o + 1] * Math.sin(t * s.path[o + 3] + s.phase[o + 1]);
      cz[i] = s.obj[o + 2] + s.path[o + 2] * Math.sin(t * s.path[o + 3] + s.phase[o + 2]);
    }
    bMarch(fw, fh, (x, y, z) => {
      x = -x; y = -y;   // the shader flips both uv axes; bMarch does not, so flip the world instead
      let a = 1e9;
      for (let i = 0; i < n; i++) {
        const kind = s.spin[i * 4 + 3]; if (kind >= 10) continue;
        const d = sd(x - cx[i], y - cy[i], z - cz[i], kind, s.obj[i * 4 + 3]);
        const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (d - a) / k));
        a = a + (d - a) * (1 - h) - k * h * (1 - h);
      }
      for (let i = 0; i < n; i++) {
        const kind = s.spin[i * 4 + 3]; if (kind < 10) continue;
        const d = sd(x - cx[i], y - cy[i], z - cz[i], kind - 10, s.obj[i * 4 + 3]), kk = k * 0.6;
        const h = Math.max(0, Math.min(1, 0.5 - 0.5 * (d + a) / kk));
        a = a + (-d - a) * h + kk * h * (1 - h);
      }
      return a;
    }, 6.2, 0.6, 0.55 * Math.sin(s.orbit * 0.25), s.zoom, 40);
  }
  // ---- Batch A: the three noise/pattern effects, and the CPU value-noise they share ----
  // The mirrors are honest but coarse: one octave where the shader runs up to eight, and no
  // domain warp at all in the warp mirror. That is the Ocean rule -- a fallback that keeps the
  // shape of the thing rather than pretending to be it -- and it is why they still write EVERY
  // cell, which the MAX-merge in the CPU path depends on.
  function shHash21(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123; return s - Math.floor(s); }
  function shVNoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = shHash21(ix, iy), b = shHash21(ix + 1, iy), c = shHash21(ix, iy + 1), d = shHash21(ix + 1, iy + 1);
    return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
  }
  let voCells = 6, voEdge = 0.6, voJit = 0.7, voSpeed = 0.5, voTime = 0;
  function voronoiSeed(dt) { voTime += dt * voSpeed; return { t: voTime, cells: voCells, edge: voEdge, jit: voJit, zoom }; }
  function voronoi(s) {
    const asp = fw / fh;
    let idx = 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      camPix(x, y);
      const px = (camPX / fw - 0.5) * asp / s.zoom * Math.max(1, s.cells);
      const py = (camPY / fh - 0.5) / s.zoom * Math.max(1, s.cells);
      const gx = Math.floor(px), gy = Math.floor(py), fx = px - gx, fy = py - gy;
      let f1 = 8, f2 = 8;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const sx = shHash21(gx + i, gy + j), sy = shHash21(gx + i + 37, gy + j + 17);
        const ox = i + 0.5 + Math.sin(s.t + sx * 6.2831) * 0.5 * s.jit;
        const oy = j + 0.5 + Math.sin(s.t + sy * 6.2831) * 0.5 * s.jit;
        const d = Math.hypot(ox - fx, oy - fy);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      const blob = 1 - Math.min(1, f1), crack = Math.min(1, (f2 - f1) * 1.6);
      fire[idx++] = (blob + (crack - blob) * Math.min(1, s.edge)) * 255;
    }
  }
  let wnScale = 3, wnWarp = 4, wnOct = 5, wnSpeed = 1, wnTime = 0;
  function warpnoiseSeed(dt) { wnTime += dt * wnSpeed; return { t: wnTime, scale: wnScale, warp: wnWarp, oct: wnOct, zoom }; }
  function warpnoise(s) {
    const asp = fw / fh;
    let idx = 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      camPix(x, y);
      const px = (camPX / fw - 0.5) * asp / s.zoom * Math.max(0.2, s.scale);
      const py = (camPY / fh - 0.5) / s.zoom * Math.max(0.2, s.scale);
      const qx = shVNoise(px, py + s.t * 0.15), qy = shVNoise(px + 5.2, py + 1.3);
      fire[idx++] = Math.max(0, Math.min(1, shVNoise(px + s.warp * qx, py + s.warp * qy) * 1.4)) * 255;
    }
  }
  let truCells = 6, truWidth = 0.35, truFlip = 0.5, truSpeed = 1, truTime = 0;
  function truchetSeed(dt) { truTime += dt * truSpeed; return { t: truTime, cells: truCells, width: truWidth, flip: truFlip, zoom }; }
  function truchet(s) {
    const asp = fw / fh, w = Math.max(0.01, s.width * 0.5);
    const thr = (s.t * 0.07 + s.flip) - Math.floor(s.t * 0.07 + s.flip);
    let idx = 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      camPix(x, y);
      const px = (camPX / fw - 0.5) * asp / s.zoom * Math.max(1, s.cells);
      const py = (camPY / fh - 0.5) / s.zoom * Math.max(1, s.cells);
      const gx = Math.floor(px), gy = Math.floor(py);
      let fx = px - gx - 0.5; const fy = py - gy - 0.5;
      if (shHash21(gx, gy) < thr) fx = -fx;
      const d = Math.min(Math.abs(Math.hypot(fx - 0.5, fy - 0.5) - 0.5),
                         Math.abs(Math.hypot(fx + 0.5, fy + 0.5) - 0.5));
      fire[idx++] = Math.max(0, Math.min(1, 1 - shStep(w * 0.5, w, d))) * 255;
    }
  }
  // Shape grid: a tiled lattice of circles↔squares, each cell pulsing out of phase.
  let sgCells = 9, sgDot = 0.3, sgSquare = 0, sgPulse = 0.35, sgSpeed = 1.2, sgTime = 0;
  function shapegridSeed(dt) { sgTime += dt * sgSpeed; return { t: sgTime, cells: sgCells, dot: sgDot, square: sgSquare, pulse: sgPulse, zoom }; }
  function shapegrid(s) {
    const asp = fw / fh, aa = 1.5 / fh * s.cells;
    let idx = 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      camPix(x, y);
      const gx = (camPX / fw - 0.5) * asp / s.zoom * s.cells, gy = (camPY / fh - 0.5) / s.zoom * s.cells;
      const cx = Math.floor(gx), cy = Math.floor(gy), fx = gx - cx - 0.5, fy = gy - cy - 0.5;
      const rad = s.dot * (1 + s.pulse * Math.sin(s.t + cx * 0.7 + cy * 1.3));
      const d = (1 - s.square) * Math.hypot(fx, fy) + s.square * Math.max(Math.abs(fx), Math.abs(fy));
      fire[idx++] = Math.max(0, Math.min(1, shStep(rad + aa, rad - aa, d))) * 255;
    }
  }
  // Concentric rings: nested N-gon contours marching outward.
  let coSides = 6, coCount = 6, coThick = 0.4, coSpeed = 0.6, coSpinSpeed = 0.1, coTime = 0, coSpin = 0;
  function concentricSeed(dt) { coTime += dt * coSpeed; coSpin += dt * coSpinSpeed; return { t: coTime, spin: coSpin, sides: coSides, count: coCount, thick: coThick, zoom }; }
  function concentric(s) {
    const seg = SH_TAU / s.sides, cs = Math.cos(seg * 0.5), asp = fw / fh, th = Math.max(0.02, Math.min(0.98, s.thick));
    let idx = 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      camPix(x, y);
      const px = (camPX / fw - 0.5) * asp / s.zoom, py = (camPY / fh - 0.5) / s.zoom;
      const a = Math.atan2(py, px) + s.spin, rp = Math.hypot(px, py) * Math.cos(shMod(a, seg) - seg * 0.5) / cs;
      const ph = rp * s.count - s.t, band = Math.abs((ph - Math.floor(ph)) - 0.5) * 2;
      fire[idx++] = Math.max(0, Math.min(1, shStep(1, 1 - th, band))) * 255;
    }
  }
  // Bouncing shapes: centres are a pure triangle-wave function of ONE clock (bnTime), so
  // the motion reflects off the walls yet stays phase-trackable (no mutable velocity state).
  const BN_MAX = 8;
  let bnMix = 7, bnSpin = 0.8, bnCount = 4, bnRad = 0.09, bnSquare = 0.6, bnSpeed = 1, bnTime = 0;
  const bnFreqX = [0.31, 0.44, 0.27, 0.52, 0.37, 0.48, 0.29, 0.41];
  const bnFreqY = [0.42, 0.29, 0.51, 0.34, 0.47, 0.26, 0.45, 0.33];
  const bnPhX = [0.0, 0.37, 0.72, 0.15, 0.58, 0.91, 0.24, 0.66];
  const bnPhY = [0.5, 0.12, 0.83, 0.41, 0.09, 0.74, 0.55, 0.28];
  const bnPos = new Float32Array(BN_MAX * 2);
  const shTri = u => { u = u - 2 * Math.floor(u / 2); return Math.abs(u - 1); };   // period-2 triangle, 0..1
  function bounceSeed(dt) {
    bnTime += dt * bnSpeed;
    const span = 1 - 2 * bnRad;
    for (let i = 0; i < BN_MAX; i++) {
      bnPos[i * 2] = bnRad + span * shTri(bnTime * bnFreqX[i] + bnPhX[i] * 2);
      bnPos[i * 2 + 1] = bnRad + span * shTri(bnTime * bnFreqY[i] + bnPhY[i] * 2);
    }
    return { pos: bnPos, count: Math.round(bnCount), rad: bnRad, square: bnSquare, zoom, mix: bnMix, t: bnTime, spin: bnSpin };
  }
  // The same seven kinds as FS_BOUNCE, and they have to STAY the same seven: the mirror is
  // what the Canvas2D fallback draws, and a kind that exists on one path and not the other
  // would make the fallback a different effect rather than a coarser one.
  function bnHashJS(i) { const v = Math.sin(i * 78.233 + 1.7) * 43758.5453123; return v - Math.floor(v); }
  function bnNgonJS(dx, dy, n) {
    const seg = 6.28318 / n, a = Math.atan2(dy, dx) + 1.5708;
    return Math.hypot(dx, dy) * Math.cos(shMod(a, seg) - seg * 0.5) / Math.cos(seg * 0.5);
  }
  function bnShapeJS(k, dx, dy, r, sq) {
    if (k === 1) return bnNgonJS(dx, dy, 3);
    if (k === 2) return bnNgonJS(dx, dy, 5);
    if (k === 3) return bnNgonJS(dx, dy, 6);
    if (k === 4) return Math.hypot(dx, dy) / (0.62 + 0.38 * Math.cos(5 * Math.atan2(dy, dx) + 1.5708));
    if (k === 5) return Math.abs(Math.hypot(dx, dy) - r * 0.68) * 2.6;
    if (k === 6) return Math.min(Math.max(Math.abs(dx), Math.abs(dy) * 2.8),
                                 Math.max(Math.abs(dx) * 2.8, Math.abs(dy)));
    return (1 - sq) * Math.hypot(dx, dy) + sq * Math.max(Math.abs(dx), Math.abs(dy));
  }
  function bounce(s) {
    const asp = fw / fh, aa = 2 / fh, n = s.count;
    const kinds = Math.max(1, Math.min(7, s.mix));
    // per-object kind and rotation, hoisted out of the pixel loop
    const kd = [], ca = [], sa = [];
    for (let i = 0; i < n; i++) {
      const h = bnHashJS(i);
      kd[i] = Math.floor(h * kinds);
      const ang = s.t * s.spin * (0.6 + h) * (h > 0.5 ? 1 : -1);
      ca[i] = Math.cos(ang); sa[i] = Math.sin(ang);
    }
    let idx = 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      camPix(x, y);
      const ux = (camPX / fw - 0.5) / s.zoom + 0.5, uy = (camPY / fh - 0.5) / s.zoom + 0.5;
      let heat = 0;
      for (let i = 0; i < n; i++) {
        const rx = (ux - s.pos[i * 2]) * asp, ry = uy - s.pos[i * 2 + 1];
        const dx = rx * ca[i] - ry * sa[i], dy = rx * sa[i] + ry * ca[i];
        const dist = bnShapeJS(kd[i], dx, dy, s.rad, s.square);
        const h = shStep(s.rad + aa, s.rad - aa, dist);
        if (h > heat) heat = h;
      }
      fire[idx++] = Math.max(0, Math.min(1, heat)) * 255;
    }
  }

  // ---- Strange attractors: de Jong map stamped into the fire heat grid (point effect) ----
  // The map itself is fully deterministic — same coefficients, same figure, every
  // frame. `atJit` scatters each stamped point by up to ±jit heat pixels, which
  // dithers the hard threads into something softer. It runs free on Math.random(),
  // deliberately clear of the chaos PRNG (like auto-morph) so it can never perturb
  // the other point effects' sequences. There is no fixed-seed variant: the heat
  // grid accumulates over many ticks, so a repeating scatter and a free one both
  // fill the same ±jit neighbourhood within a few frames and look identical once
  // glow and decay are over them. It was tried, and it was invisible.
  let atA = 1.4, atB = -2.3, atC = 2.4, atD = -2.1, atJit = 0.5;
  function attractorStamp(xL, xR, yT, yB, n) {
    const cx = (xL + xR) * 0.5, cy = (yT + yB) * 0.5;
    const sx = (xR - xL) * 0.22, sy = (yB - yT) * 0.22;   // map de Jong's ±2 range into the safe box
    const jit = atJit;
    let x = 0.1, y = 0.1;
    for (let i = 0; i < n; i++) {
      const nx = Math.sin(atA * y) - Math.cos(atB * x);
      const ny = Math.sin(atC * x) - Math.cos(atD * y);
      x = nx; y = ny;
      if (i <= 20) continue;                              // skip the transient, then plot the attractor
      let px = cx + x * sx, py = cy + y * sy;
      // Guarded so jit === 0 stays byte-identical to the un-jittered map.
      if (jit > 0) { px += (Math.random() - 0.5) * 2 * jit; py += (Math.random() - 0.5) * 2 * jit; }
      plot(px, py, POINT_HEAT);
    }
  }

  // ---- Particle galaxy: log-spiral arms (point effect) ----
  // A disc of stars whose density follows LOG SPIRALS, which is the shape real galaxies
  // make: an arm is a straight line in (log r, θ), so the winding tightens toward the core
  // on its own rather than being drawn tighter by hand.
  //
  // THE ARMS TRAIL. Going outward along an arm the angle DECREASES while the disc turns the
  // other way, so the tips lag behind the rotation — which is what every real spiral galaxy
  // does and the first version of this got exactly backwards (arms leading, so it read as
  // spinning the wrong way). The sign of the log term is the whole of it.
  //
  // The pattern turns RIGIDLY and the differential motion is a BOUNDED shear on top. A 1/r
  // rotation curve is what the stars really do and it runs straight into the real winding
  // problem: the inner disc laps the rim and the arms wind out of existence. Capping the
  // ratio at 2:1 was not enough — both terms still grew with t, so the absolute lead kept
  // accumulating and the arms wound up within a minute anyway, just more slowly. Nature
  // answers this with density waves: the PATTERN is what rotates, not the material. So does
  // this, with an oscillating shear for the life the differential term was there to give.
  //
  // Reseeds the chaos PRNG itself so the star field is the SAME set of stars every frame
  // and only the rotation moves them — the same bargain flamesStamp makes, and the reason
  // this needs no per-layer state beyond one clock. Its own salt, so it can never step on
  // another point effect's sequence.
  // Stamped ADDITIVELY (`stampAdd` on the descriptor), which is the whole reason the core
  // reads as a core: point effects are MAX-stamped by default, so a thousand stars in one
  // pixel are exactly as bright as one and the bulge came out no brighter than the arms.
  // Additive makes DENSITY the picture, as it is in the sky. GX_HEAT is per-STAR, so it has
  // to be small — around eight overlapping stars should reach white, not one.
  const GX_HEAT = 26;
  let gxArms = 2, gxTwist = 0.55, gxSpin = 0.5, gxCore = 0.35, gxScatter = 0.30, gxTime = 0;
  function galaxyStamp(xL, xR, yT, yB, n) {
    gxTime += gxSpin * 2 / cfg.burn;             // per TICK, like flPhase
    const cx = (xL + xR) * 0.5, cy = (yT + yB) * 0.5;
    const sx = (xR - xL) * 0.46, sy = (yB - yT) * 0.46;
    rngState = (SEED + 0x9e37) >>> 0;
    const arms = Math.max(1, Math.round(gxArms)), armStep = 6.2831853 / arms;
    const t = gxTime, tw = Math.max(0.05, gxTwist), sc = gxScatter;
    for (let i = 0; i < n; i++) {
      // Exponential disc: most stars near the centre, a thin population far out.
      let r = -Math.log(1 - rnd() * 0.99) * 0.26;
      if (r > 1) r = 1 - (r - 1) * 0.35;         // fold the tail back rather than clipping a hard rim
      if (r < 0.012) r = 0.012;
      // The arm: a log spiral, plus a scatter that widens outward so the core stays tight.
      const arm = Math.floor(rnd() * arms) * armStep;
      // NEGATED: θ falls as r rises, so the arm sweeps backwards against a forward-turning
      // disc. Flip this sign and the arms lead, which is the bug this effect shipped with.
      const spiral = -Math.log(r) / tw;
      const jitter = (rnd() + rnd() + rnd() - 1.5) * sc * (0.35 + r);
      // Rigid pattern rotation (+t) plus a bounded shear that varies with radius, so the
      // arms breathe and ripple without ever winding up.
      const shear = 0.55 * Math.sin(t * 0.27 + Math.log(r + 0.05) * 1.6);
      const th = arm + spiral + jitter + t + shear;
      const rr = r * (1 + (rnd() - 0.5) * 0.10);
      plot(cx + Math.cos(th) * rr * sx, cy + Math.sin(th) * rr * sy, GX_HEAT, true);
    }
    // The core: a separate tight bulge, otherwise the disc's own falloff leaves the middle
    // no brighter than the arms and the galaxy has no centre.
    const bulge = Math.round(n * gxCore * 0.5);
    for (let i = 0; i < bulge; i++) {
      const r = Math.pow(rnd(), 2.2) * 0.22, th = rnd() * 6.2831853;
      plot(cx + Math.cos(th) * r * sx, cy + Math.sin(th) * r * sy, GX_HEAT, true);
    }
  }

  // ---- Harmonograph: decaying pendulum ribbons (point effect) ----
  // The Victorian drawing machine: two pendulums per axis, each a damped sine, their sum
  // traced by a pen. x and y are therefore each a beat between two nearly-equal frequencies,
  // and the DETUNE between them is the whole trick — at exactly 0 the figure is a closed
  // Lissajous that retraces itself forever, and a hair off it the loop fails to close by a
  // little each lap and the curve precesses into a ribbon.
  //
  // The whole curve is redrawn every frame, like the chaos game: the point sequence is
  // deterministic, and only the slowly-drifting phases reshape it. hgPhase advances per TICK
  // (not per frame and not off the wall clock), so the morph tracks the sim speed like
  // flPhase and nodPhase.
  let hgRatio = 3, hgDetune = 0.012, hgDecay = 0.022, hgMorph = 0.35, hgPhase = 0;
  function harmonographStamp(xL, xR, yT, yB, n) {
    hgPhase += hgMorph * 2 / cfg.burn;
    const cx = (xL + xR) * 0.5, cy = (yT + yB) * 0.5;
    const sx = (xR - xL) * 0.34, sy = (yB - yT) * 0.34;
    const p = hgPhase;
    // Four pendulum phases, drifting apart at incommensurate rates so the figure never
    // returns to a pose it has held before.
    const p1 = p * 0.31, p2 = p * 0.23 + 1.9, p3 = p * 0.17 + 3.4, p4 = p * 0.41 + 5.1;
    const f1 = hgRatio, f2 = hgRatio + hgDetune, f3 = 1, f4 = 1 + hgDetune * 1.37;
    const d = hgDecay;
    // Run the pen until the swing has decayed to a few percent — past that it is all ink in
    // one pixel. Falls back to a fixed span when damping is off, or the loop never ends.
    const tMax = d > 1e-4 ? Math.min(200, 4.6 / d) : 200;
    // Sample by ARC LENGTH, not uniformly in t. The pen's speed falls off as exp(-d·t), so
    // even time steps put the samples furthest apart exactly where the swing is widest —
    // the outer loops came out as dotted lines while the dead centre got a solid blob.
    // Inverting the integral of exp(-d·t) spreads the ink evenly along the curve instead.
    const useArc = d > 1e-4;
    const span = useArc ? 1 - Math.exp(-d * tMax) : 0;
    const step = tMax / n;
    // UNEQUAL amplitudes, 0.6/0.4 rather than half each. Two equal pendulums drifting into
    // antiphase cancel to nothing, and the figure collapsed to a flat squashed ribbon at
    // whatever phase the drift happened to be passing through. Unequal ones can only ever
    // beat down to 0.2, so the figure breathes instead of dying.
    for (let i = 0; i < n; i++) {
      const t = useArc ? -Math.log(1 - (i / n) * span) / d : i * step;
      const e = Math.exp(-d * t);
      const x = (0.6 * Math.sin(f1 * t + p1) + 0.4 * Math.sin(f2 * t + p2)) * e;
      const y = (0.6 * Math.sin(f3 * t + p3) + 0.4 * Math.sin(f4 * t + p4)) * e;
      plot(cx + x * sx, cy + y * sy, POINT_HEAT);
    }
  }

  // ---- Polypinski: the chaos game between N corners on a sphere (point effect) ----
  // Sierpiński with the corner count set free. The corners are spread EVENLY over a unit sphere
  // (pyHomes: hashed start from Seed, then Coulomb repulsion relaxed on the sphere — the Thomson
  // problem), so 3 corners are the triangle, 4 the tetrahedron, 6 the octahedron and more keep
  // the pattern; Seed picks the orientation and, where several arrangements tie, which one.
  // Pure CPU arithmetic, so the same seed is the same picture on every machine. Each corner
  // then wanders about its home on three hashed sines and is pushed back onto the sphere.
  // THE JUMP FOLLOWS THE CORNERS. pyTouch is the largest copy scale r at which the shrunken copies
  // (1-r)·c_i + r·hull stay apart along the line joining their corners: min over pairs of
  // d/(d + w), w = the corners' width along that line. It is 0.5 for the triangle, tetrahedron and
  // octahedron and 0.382 for the icosahedron (the n-flake scales), so every count draws distinct
  // copies with holes. A fixed jump of 0.5 blurred anything past six corners into a solid ball.
  // Gap scales it: 0 touching, positive spreads the copies apart, negative overlaps them. The chaos PRNG is re-seeded per frame like every other point effect, so
  // only the moving corners reshape the picture. Heat shades by depth (Depth fade) so the ball reads as a
  // ball. Zoom, Size and Rotation are the shared ones (plot() zooms).
  let pyCorners = 6, pySeed = 1, pyWiggle = 0.1, pyWSpeed = 0.5, pyGap = 0, pyDepth = 0.45, pyPhase = 0;
  // Random seed (the `pyrand` Off/On slider). ON rolls a fresh Seed when the effect is entered (reload,
  // scene load, switching to it) and when the user flips it on. The roll is WRITTEN TO THE SEED SLIDER,
  // so the number behind a formation you like is right there, and turning Random off keeps it. Reads
  // the selected block's DOM: onEnter and the flip both act on the selected layer.
  // ponytail: only the SELECTED layer rolls; a second Polypinski layer keeps its seed until it is entered.
  function pyRollSeed() {
    const on = ctl("pyrand-lo"), seed = ctl("pyseed-lo");
    if (!on || !seed || Math.round(+on.value) !== 1) return;
    const cur = Math.round(+seed.value), mn = Math.ceil(+seed.min), mx = Math.floor(+seed.max);
    let v = cur;
    while (v === cur && mx > mn) v = mn + Math.floor(Math.random() * (mx - mn + 1));
    seed.value = String(v);
    seed.dispatchEvent(new Event("input", { bubbles: true }));   // mirrors the hidden thumb, readout, autosave
  }
  const PY_MAX = 24;
  const pyCx = new Float64Array(PY_MAX), pyCy = new Float64Array(PY_MAX), pyCz = new Float64Array(PY_MAX);
  const pyHx = new Float64Array(PY_MAX), pyHy = new Float64Array(PY_MAX), pyHz = new Float64Array(PY_MAX);
  // Cached per (seed, k): two layers on different seeds would otherwise each re-relax (~2 ms at
  // k = 24) on every tick. Bounded by what anyone can dial in one session.
  const pyHomeCache = new Map();
  let pyTouch = 0.5;
  function pyHomes(seed, k) {
    const key = seed + "/" + k, hit = pyHomeCache.get(key);
    if (hit) { for (let i = 0; i < k; i++) { pyHx[i] = hit[i * 3]; pyHy[i] = hit[i * 3 + 1]; pyHz[i] = hit[i * 3 + 2]; } pyTouch = hit[k * 3]; return; }
    for (let i = 0; i < k; i++) {
      const z = sdHash(seed, 0x5157, i * 8) * 2 - 1, a = sdHash(seed, 0x5157, i * 8 + 1) * 6.2831853, r = Math.sqrt(1 - z * z);
      pyHx[i] = r * Math.cos(a); pyHy[i] = r * Math.sin(a); pyHz[i] = z;
    }
    const fx = new Float64Array(k), fy = new Float64Array(k), fz = new Float64Array(k);
    for (let it = 0; it < 1000; it++) {             // 1000 × step 0.5/k: edge error < 1e-12 for k ≤ 24 (polyprobe)
      fx.fill(0); fy.fill(0); fz.fill(0);
      for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
        const dx = pyHx[i] - pyHx[j], dy = pyHy[i] - pyHy[j], dz = pyHz[i] - pyHz[j];
        const d2 = dx * dx + dy * dy + dz * dz + 1e-9, w = 1 / (d2 * Math.sqrt(d2));
        fx[i] += dx * w; fy[i] += dy * w; fz[i] += dz * w;
        fx[j] -= dx * w; fy[j] -= dy * w; fz[j] -= dz * w;
      }
      const a = 0.5 / k;
      for (let i = 0; i < k; i++) {
        let x = pyHx[i] + fx[i] * a, y = pyHy[i] + fy[i] * a, z = pyHz[i] + fz[i] * a;
        const inv = 1 / Math.hypot(x, y, z);
        pyHx[i] = x * inv; pyHy[i] = y * inv; pyHz[i] = z * inv;
      }
    }
    let r = 1;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      const ux = pyHx[i] - pyHx[j], uy = pyHy[i] - pyHy[j], uz = pyHz[i] - pyHz[j], d = Math.hypot(ux, uy, uz);
      let lo = Infinity, hi = -Infinity;
      for (let m = 0; m < k; m++) { const p = (pyHx[m] * ux + pyHy[m] * uy + pyHz[m] * uz) / d; if (p < lo) lo = p; if (p > hi) hi = p; }
      r = Math.min(r, d / (d + hi - lo));
    }
    pyTouch = r;
    const out = new Float64Array(k * 3 + 1);
    out[k * 3] = r;
    for (let i = 0; i < k; i++) { out[i * 3] = pyHx[i]; out[i * 3 + 1] = pyHy[i]; out[i * 3 + 2] = pyHz[i]; }
    pyHomeCache.set(key, out);
  }
  function polypinskiStamp(xL, xR, yT, yB, n) {
    pyPhase += pyWSpeed * 2 / cfg.burn;             // per TICK, like hgPhase
    const k = Math.max(3, Math.min(PY_MAX, Math.round(pyCorners))), ph = pyPhase, wg = pyWiggle;
    pyHomes(pySeed, k);
    // Whole-body tumble on the same clock: yaw from the Rotation slider plus a slow drift,
    // pitch a slow nod — a still ball of corners reads flat.
    const yaw = spinAngle + ph * 0.13, pitch = 0.5 * Math.sin(ph * 0.21);
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cpt = Math.cos(pitch), spt = Math.sin(pitch);
    for (let i = 0; i < k; i++) {
      const h = j => sdHash(pySeed, 0x5157, i * 8 + j);
      let x = pyHx[i] + wg * Math.sin(ph * (0.4 + h(2)) + h(3) * 6.2831853);
      let y = pyHy[i] + wg * Math.sin(ph * (0.4 + h(4)) + h(5) * 6.2831853);
      let z = pyHz[i] + wg * Math.sin(ph * (0.4 + h(6)) + h(7) * 6.2831853);
      const inv = 1 / Math.hypot(x, y, z);
      x *= inv; y *= inv; z *= inv;
      const rx = x * cyw + z * syw, rz = z * cyw - x * syw;   // yaw about Y, then pitch about X
      pyCx[i] = rx; pyCy[i] = y * cpt - rz * spt; pyCz[i] = y * spt + rz * cpt;
    }
    const cx = (xL + xR) * 0.5, cy = (yT + yB) * 0.5;
    // Pin-hole at z = F; the nearest possible corner (z = 1) must still land inside the box.
    const F = 3.2, sc = Math.min(xR - xL, yB - yT) * 0.5 * 1.0 * fractalSize * (F - 1) / F;
    // Depth fade: pz runs from -1 (far) to +1 (near). Positive dims the far side (1 = the back of the
    // ball vanishes), negative dims the near side instead. The nearest (or farthest) point keeps full heat.
    const jump = 1 - pyTouch * (1 - pyGap), df = pyDepth, dA = df >= 0 ? df * 0.5 : -df * 0.5;
    rngState = (SEED + 0x7a1b) >>> 0;
    let px = 0, py = 0, pz = 0;
    for (let i = 0; i < n + 16; i++) {
      const c = (rnd() * k) | 0;
      px += (pyCx[c] - px) * jump; py += (pyCy[c] - py) * jump; pz += (pyCz[c] - pz) * jump;
      if (i > 15) {
        const persp = F / (F - pz);
        plot(cx + px * persp * sc, cy - py * persp * sc, POINT_HEAT * (1 - dA * (df >= 0 ? 1 - pz : 1 + pz)));
      }
    }
  }

  // ---- Fractal flames: IFS chaos game with nonlinear variations (point effect) ----
  // Two affine transforms whose coefficients orbit slowly (flPhase), then one of six
  // classic flame variations applied after each affine step. Stamped ADDITIVELY
  // (`stampAdd` on the descriptor + plot's add mode): where the orbit lands often burns
  // brighter, which is the log-density look that makes flames flames — MAX stamping
  // flattens it to a silhouette. Uses the seeded chaos PRNG (rnd), so the point
  // sequence is per-frame deterministic like the other point effects.
  let flVar = 3, flMorph = 0.3, flGlow = 30, flPhase = 0;
  // Auto-exposure scratch: a coarse occupancy grid over the stamp box. Mid-morph the
  // attractor regularly spreads THIN — per-pixel hits drop tenfold and the additive
  // picture faded to near-black ("most of the time it just looks black"). Pass 1 runs
  // the orbit without stamping to measure hits-per-occupied-cell; thin phases get their
  // per-point heat boosted (up to 6×, capped at 220 so single hits stay colour, not
  // white speckle), dense phases keep the shipped look (gain 1). Pass 2 re-runs the
  // SAME seeded sequence and stamps — deterministic, no per-layer state.
  const FL_MW = 64, FL_MH = 36;
  const flMask = new Uint8Array(FL_MW * FL_MH);
  function flamesStamp(xL, xR, yT, yB, n) {
    flPhase += flMorph * 2 / cfg.burn;     // coefficient orbit advances per TICK, like nodPhase
    const cx = (xL + xR) * 0.5, cy = (yT + yB) * 0.5;
    const sx = (xR - xL) * 0.26, sy = (yB - yT) * 0.26;
    const p = flPhase, V = Math.round(flVar);
    // two affine maps, coefficients breathing about a good-coverage base
    const A = [0.62 + 0.20 * Math.sin(p * 0.71), -0.48 + 0.18 * Math.sin(p * 0.53 + 1.7), 0.30 + 0.12 * Math.sin(p * 0.37 + 4.1),
               0.48 + 0.18 * Math.cos(p * 0.61 + 0.6), 0.60 + 0.20 * Math.cos(p * 0.43 + 2.9), 0.20 + 0.14 * Math.sin(p * 0.29 + 5.3)];
    const B = [-0.55 + 0.20 * Math.sin(p * 0.47 + 3.3), 0.52 + 0.18 * Math.cos(p * 0.67 + 1.1), -0.25 + 0.12 * Math.sin(p * 0.31 + 2.2),
               -0.42 + 0.18 * Math.sin(p * 0.59 + 4.8), -0.58 + 0.20 * Math.cos(p * 0.41 + 0.3), -0.15 + 0.14 * Math.cos(p * 0.23 + 3.7)];
    // 2x the shared Points budget: density IS this effect's picture, and the other point
    // effects' costs are per-VERTEX where this is a bare orbit step — 2n is still cheap.
    const N = n * 2;
    const run = emit => {
      rngState = (SEED + 0x51ab) >>> 0;    // same seed each pass ⇒ identical point SEQUENCE
      let x = 0.1, y = 0.1;
      for (let i = 0; i < N; i++) {
        const T = rnd() < 0.5 ? A : B;
        const nx = T[0] * x + T[1] * y + T[2];
        const ny = T[3] * x + T[4] * y + T[5];
        const r2 = nx * nx + ny * ny;
        if (V === 1) {                                      // sinusoidal
          x = Math.sin(nx); y = Math.sin(ny);
        } else if (V === 2) {                               // spherical
          const k = 0.7 / (r2 + 0.05); x = nx * k; y = ny * k;
        } else if (V === 3) {                               // swirl
          const sr = Math.sin(r2), cr = Math.cos(r2);
          x = nx * sr - ny * cr; y = nx * cr + ny * sr;
        } else if (V === 4) {                               // horseshoe
          const r = Math.sqrt(r2) + 0.05;
          x = (nx - ny) * (nx + ny) / r * 0.7; y = 2 * nx * ny / r * 0.7;
        } else if (V === 5) {                               // polar
          x = Math.atan2(ny, nx) * 0.3183; y = Math.sqrt(r2) - 1;
        } else {                                            // disc
          const th = Math.atan2(ny, nx) * 0.3183, r = Math.sqrt(r2);
          x = th * Math.sin(3.14159 * r); y = th * Math.cos(3.14159 * r);
        }
        if (!(x * x + y * y < 16)) { x = 0.1; y = 0.1; continue; }   // catches NaN too
        if (i <= 20) continue;                              // skip the transient
        emit(cx + x * sx, cy + y * sy);
      }
    };
    flMask.fill(0);
    let landed = 0, occupied = 0;
    const mw = FL_MW / (xR - xL), mh = FL_MH / (yB - yT);
    run((px, py) => {                      // PASS 1 — measure the spread
      if (px < xL || px >= xR || py < yT || py >= yB) return;
      landed++;
      const ci = (((py - yT) * mh) | 0) * FL_MW + (((px - xL) * mw) | 0);
      if (!flMask[ci]) { flMask[ci] = 1; occupied++; }
    });
    const hitsPerCell = landed / Math.max(1, occupied);
    const gain = Math.max(1, Math.min(6, 30 / Math.max(1, hitsPerCell)));
    const inc = Math.min(220, flGlow * gain);
    run((px, py) => plot(px, py, inc, true));   // PASS 2 — ADD, density is the picture
  }

  // ---- Boids murmuration: a flock stamping heat (point effect) ----------------------
  // The flock lives ON THE LAYER (L.boids) exactly like L.solids — installBoids points the
  // global at this layer's birds before it draws, or two flocks would share one sky.
  // Hash-seeded start (no Math.random), no randomness in flight: per-frame deterministic.
  // Scatter is the value-is-trigger pattern again: a rising Scatter edge (a beat chip
  // snap, or a hand flick) blasts every bird away from the flock's centroid.
  let bdCount = 80, bdSpeedV = 1, bdCoh = 1, bdFearV = 0, bdPrev = 0;
  let bdFlock = null;
  const bdH = (i, s) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
  function ensureBoids(arr, n, salt) {
    while (arr.length < n) {
      const i = arr.length;
      arr.push({ x: 0.15 + 0.7 * bdH(i, salt + 1), y: 0.15 + 0.7 * bdH(i, salt + 2),
                 vx: (bdH(i, salt + 3) - 0.5) * 0.24, vy: (bdH(i, salt + 4) - 0.5) * 0.24 });
    }
    if (arr.length > n) arr.length = n;
  }
  function installBoids(L) {
    L.boids = L.boids || [];
    ensureBoids(L.boids, Math.max(2, Math.min(200, Math.round(bdCount))), layerSalt(L) + 1);
    bdFlock = L.boids;
  }
  function boidsStamp(xL, xR, yT, yB, n) {
    const B = bdFlock;
    if (!B) return;
    ensureBoids(B, Math.max(2, Math.min(200, Math.round(bdCount))), 1);
    const dt = 1 / Math.max(30, cfg.burn);
    const scatter = bdFearV > bdPrev + 0.2;   // rising edge = one blast, however long the decay
    bdPrev = bdFearV;
    const N = B.length, base = 0.16 * bdSpeedV;
    let mx = 0, my = 0;
    for (const b of B) { mx += b.x; my += b.y; }
    mx /= N; my /= N;
    // stride-sampled neighbours: every 3rd bird is plenty for flock shape at these counts
    for (let i = 0; i < N; i++) {
      const b = B[i];
      let ax = 0, ay = 0, cxs = 0, cys = 0, vxs = 0, vys = 0, near = 0;
      for (let j = i % 3; j < N; j += 3) {
        if (j === i) continue;
        const o = B[j];
        const dx = o.x - b.x, dy = o.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 > 0.045) continue;
        near++;
        cxs += o.x; cys += o.y; vxs += o.vx; vys += o.vy;
        if (d2 < 0.0016) { const k = 0.0016 / Math.max(d2, 1e-5); ax -= dx * k; ay -= dy * k; }   // separation
      }
      if (near > 0) {
        ax += ((cxs / near - b.x) * 1.4 * bdCoh + (vxs / near - b.vx) * 1.1);   // cohesion + alignment
        ay += ((cys / near - b.y) * 1.4 * bdCoh + (vys / near - b.vy) * 1.1);
      }
      ax += (0.5 - b.x) * 0.35; ay += (0.5 - b.y) * 0.35;                       // soft box pull
      if (scatter) { ax += (b.x - mx) * 60; ay += (b.y - my) * 60; }            // the blast
      b.vx += ax * dt; b.vy += ay * dt;
      const sp = Math.hypot(b.vx, b.vy) || 1e-5;
      const want = base * (1 + bdFearV * 1.5);                                  // fear also means haste
      const k = sp > want * 1.6 ? (want * 1.6) / sp : sp < want * 0.5 ? (want * 0.5) / sp : 1;
      b.vx *= k; b.vy *= k;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 0.02) { b.x = 0.02; b.vx = Math.abs(b.vx); }
      if (b.x > 0.98) { b.x = 0.98; b.vx = -Math.abs(b.vx); }
      if (b.y < 0.02) { b.y = 0.02; b.vy = Math.abs(b.vy); }
      if (b.y > 0.98) { b.y = 0.98; b.vy = -Math.abs(b.vy); }
    }
    // stamp: each bird is a short streak along its velocity — with the shipped Fade the
    // streaks become the murmuration's smoky trails
    const w = xR - xL, h = yB - yT;
    for (const b of B) {
      const sp = Math.hypot(b.vx, b.vy) || 1e-5;
      const tx = b.vx / sp, ty = b.vy / sp;
      for (let k = 0; k < 4; k++) {
        plot(xL + (b.x - tx * k * 0.006) * w, yT + (b.y - ty * k * 0.006) * h, POINT_HEAT * (1 - k * 0.16));
      }
    }
  }


  // ---- Trees: a swaying recursive fractal canopy (point effect) ----
  // A point effect rather than a shader on purpose. The whole appeal of a tree in wind is
  // the TRAIL the tips leave, and this family runs the fire sim and every feedback filter
  // for free: add Fade and the canopy smears the way branches do at a long exposure.
  //
  // BEAT REACTIVITY NEEDED NO CODE. "Sways in time" is what arming Sway's L/M/H chips
  // already does — the trigger machinery snaps that slider to its high thumb on a beat and
  // decays it over the pulse length, which is a gust. Writing a bespoke beat hook here
  // would have been a second, worse copy of `updateAnims`.
  //
  // Deterministic like every other point effect: branch jitter comes from `trHash`, never
  // from Math.random and never from the chaos PRNG (which the stamp loop re-seeds).
  let trCount = 3, trDepth = 8, trSplit = 2, trAngle = 28, trShrink = 0.72,
      trSway = 0.35, trSpeed = 1, trPhase = 0;
  // DECLARED AFTER the line above, not before it, and the reason is the probe: treeprobe
  // slices this file from that declaration to the end of treeStamp and EVALUATES the slice,
  // so anything treeStamp reads has to live inside the cut. Put these first and the probe
  // dies on an undefined; write the marker's text into a comment above it and the plain
  // indexOf finds the comment instead. Both were measured, in that order.
  let trWidth = 3, trTaper = 0.62, trCurve = 0.45;
  // A whole tree is redrawn every tick, so the segment count is the cost. It is
  // split^depth, which reaches 4^11 = four million at the slider extremes — the sliders
  // cannot be allowed to multiply into that, so the DEPTH is clamped to whatever keeps the
  // total under this. Clamping depth rather than split keeps the silhouette the user asked
  // for (a 4-way tree stays 4-way, just shallower).
  const TR_SEG_MAX = 12000;
  function trHash(i) {                     // deterministic per-branch jitter, [-1, 1]
    let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 2147483648 - 1;
  }
  function trMaxDepth(split, want) {       // deepest tree that still fits TR_SEG_MAX
    let total = 0, level = 1, d = 0;
    while (d < want) {
      const next = total + level;
      if (next > TR_SEG_MAX) break;
      total = next; level *= split; d++;
    }
    return Math.max(1, d);
  }
  function treeStamp(xL, xR, yT, yB, n) {
    trPhase += trSpeed * 2 / cfg.burn;     // per TICK, like gxTime and flPhase
    const w = xR - xL, h = yB - yT;
    const split = Math.max(2, Math.min(4, Math.round(trSplit)));
    const maxD = trMaxDepth(split, Math.max(1, Math.round(trDepth)));
    const shrink = trShrink, spread = trAngle * Math.PI / 180;
    const trees = Math.max(1, Math.min(5, Math.round(trCount)));
    // Points are shared out by LENGTH, so a long trunk is not drawn at the same density as
    // a twig. Total length is closed-form — sum over depth of split^d * L0 * shrink^d — so
    // the tree is walked once rather than measured and then drawn.
    // TRUNK LENGTH IS NORMALISED so the whole tree fits the box at every Taper. A fixed
    // trunk is the obvious version and it does not work: the straight-chain height is
    // L0·(1 − shrink^depth)/(1 − shrink), which runs from 1.7·L0 at taper 0.45 to 5.4·L0
    // at 0.85 — so a wispy tree grew to 290px in a 178px frame and you saw trunk and
    // nothing else (measured: 40% of the canopy stamped off-grid, where plot() drops it
    // silently and it just reads as a smaller tree). Solving for L0 instead makes Taper a
    // control over the tree's PROPORTIONS — stubby against wispy — rather than over
    // whether it is on screen, which is what the slider is for. The default lands at
    // 0.271·h, near enough the old fixed 0.30 that the shipped tree is unchanged.
    let chain = 0;
    for (let d = 0, len = 1; d < maxD; d++) { chain += len; len *= shrink; }
    // 0.82, not 0.9: the straight chain is the tallest path, but the fan puts branches
    // slightly above it, and at 0.9 the crowns were clipped by the top of the frame.
    const L0 = h * 0.82 / Math.max(1, chain);
    let totalLen = 0;
    for (let d = 0, lev = 1, len = L0; d < maxD; d++) { totalLen += lev * len; lev *= split; len *= shrink; }
    totalLen *= trees;
    const perUnit = totalLen > 0 ? n / totalLen : 0;
    // One live level of branches at a time: [x, y, angle, length, depth] flattened. A tree
    // this size is a few thousand entries, and two flat arrays beat allocating an object
    // per branch every tick.
    let cur = [], nxt = [];
    for (let t = 0; t < trees; t++) {
      const fx = trees === 1 ? 0.5 : 0.14 + 0.72 * (t / (trees - 1));
      cur.push(xL + w * fx, yB, 0, L0 * (0.85 + 0.3 * Math.abs(trHash(t * 7 + 1))), 0);
    }
    let branchId = 0;
    for (let d = 0; d < maxD; d++) {
      nxt.length = 0;
      // WIND. The sway is added to each branch's angle as it is built, so it ACCUMULATES
      // down the chain from trunk to twig — which is what makes it read as a tree bending
      // rather than as a rigid pinwheel turning. Amplitude grows with depth for the same
      // reason: a trunk barely moves and the tips whip.
      const grow = (d + 1) / maxD;
      const bend = trSway * grow * grow;
      const heat = POINT_HEAT * (0.55 + 0.45 * (1 - d / maxD));
      for (let i = 0; i < cur.length; i += 5) {
        const bx = cur[i], by = cur[i + 1], ba = cur[i + 2], bl = cur[i + 3];
        const id = ++branchId;
        // Two clocks per branch: the slow body of the gust, and a faster flutter phased by
        // the branch's own hash so no two twigs move together.
        const sway = bend * (Math.sin(trPhase + d * 0.55 + trHash(id) * 3.1)
                           + 0.45 * Math.sin(trPhase * 2.7 + trHash(id + 9973) * 6.2));
        const a = ba + sway;
        const ex = bx + Math.sin(a) * bl, ey = by - Math.cos(a) * bl;   // row 0 is the TOP, so up is -y
        // WIDTH, TAPER AND BEND -- the three things that turn a wireframe into a tree.
        //
        // The branch was already a continuous LINE (the descriptor's own note says 30000
        // points is about one per pixel); what it was not was THICK. Each sample now stamps a
        // perpendicular span, tapering generation by generation so the trunk is solid and the
        // twigs stay fine. A constant width looks like pipe cleaners, which is most of why an
        // untapered tree never reads as one.
        //
        // BEND is the spline question, answered. Sway is added to each branch's ANGLE as it is
        // built, so a branch is a rigid stick pivoted at its joint and the whole bend lives in
        // the joints -- fine at Depth 8 where they are dense, visibly polygonal at low Depth.
        // A quadratic Bezier with one control point pushed perpendicular by the local sway
        // makes the bough itself flex, which is both what a real branch does and what fixes
        // the low-Depth case. Two lines of maths, no allocation, and Bend 0 is the old
        // straight stick exactly. (buildSeedSpline is NOT reused: it is a closed periodic
        // Catmull-Rom with an arc-length LUT, the wrong shape for an open two-point branch.)
        const wid = Math.max(0, trWidth) * Math.pow(Math.max(0.05, trTaper), d);
        const half = Math.max(0, wid * 0.5);
        const px = -(ey - by), py = ex - bx;                 // perpendicular to the branch
        const pl = Math.hypot(px, py) || 1;
        const nx = px / pl, ny = py / pl;
        // control point for the bow: the midpoint pushed sideways by this branch's own sway
        const cxb = (bx + ex) * 0.5 + nx * sway * bl * trCurve;
        const cyb = (by + ey) * 0.5 + ny * sway * bl * trCurve;
        const pts = Math.max(1, Math.round(bl * perUnit));
        const span = Math.max(0, Math.round(half));
        for (let k = 0; k <= pts; k++) {
          const f = k / pts, g = 1 - f;
          // quadratic Bezier; at trCurve 0 the control point IS the midpoint, so this
          // reduces to the straight interpolation it replaces.
          const sx2 = g * g * bx + 2 * g * f * cxb + f * f * ex;
          const sy2 = g * g * by + 2 * g * f * cyb + f * f * ey;
          plot(sx2, sy2, heat);
          for (let w = 1; w <= span; w++) {
            plot(sx2 + nx * w, sy2 + ny * w, heat);
            plot(sx2 - nx * w, sy2 - ny * w, heat);
          }
        }
        if (d + 1 >= maxD) continue;
        const childLen = bl * shrink;
        for (let c = 0; c < split; c++) {
          // Fan the children about the parent, with a per-child jitter so the tree is not
          // a perfectly symmetric diagram of itself.
          const off = split === 1 ? 0 : (c / (split - 1) - 0.5) * 2 * spread;
          nxt.push(ex, ey, a + off + trHash(id * 31 + c) * spread * 0.22, childLen, d + 1);
        }
      }
      const swap = cur; cur = nxt; nxt = swap;
    }
  }

  // ---- Flying ribbons ----------------------------------------------------------------
  // Long bands writhing through space, drawn as ACTUAL SURFACES: a triangle strip per band,
  // rasterised with a depth buffer so one band hides another it passes behind.
  //
  // It began as a point-accumulation effect, stamping samples of the band through plot(),
  // and that was the wrong shape for it. A filled surface costs one stamp per COVERED PIXEL
  // -- measured at 279k for the shipped settings against a 95k budget, so it was a third
  // covered and read as a stipple -- and no budget makes a point cloud occlude anything.
  // Rasterising is both the right answer and the cheaper one: the GPU interpolates between
  // samples, so a couple of hundred cross-sections per band describe the curve completely
  // and the fill is free. The whole effect is now ~1500 triangles a frame.
  //
  // Deterministic, like the point effects it sits beside: variation is rbHash, never
  // Math.random.
  let rbCount = 4, rbLen = 1.6, rbWidth = 0.38, rbTwist = 2.5, rbSpeed = 1, rbWave = 0.55, rbTime = 0;
  // How far a band runs, set by the builder and read by rbPath -- the path is evaluated a few
  // hundred times a frame, so it takes what it can from the closure.
  let rbSpan = 1.5;
  function rbHash(i) {                     // deterministic per-ribbon variation, [-1, 1]
    let h = Math.imul(i ^ 0x27d4eb2f, 0x165667b1);
    h ^= h >>> 15; h = Math.imul(h, 0x9e3779b1); h ^= h >>> 13;
    return (h >>> 0) / 2147483648 - 1;
  }
  // Cross-sections per band. A rasterised surface needs only enough to follow the CURVE and
  // the twist -- the triangle between two of them is filled exactly, however far apart they
  // are. This is where the point version needed one sample per 1.4 pixels and still combed.
  const RB_SEGS = 220;
  const RB_ZC = 3.1;                       // the loop's centre depth, in front of the eye
  const RB_NEAR = 0.25, RB_FAR = 7.5;      // the depth range mapped onto the depth buffer
  // The curve, and the ONE place it is written.
  //
  // Each band SWEEPS ACROSS the frame on its own heading rather than looping around the
  // origin. Closed Lissajous knots were the first version: every ribbon enclosed the centre,
  // so they piled into one tangle in the middle of the screen with dead space around it and
  // nothing read as flying. Running each band past the frame edge gives them somewhere to
  // come from and somewhere to go, and hides the two raw ends off-screen for free.
  //
  // The motion is a wave TRAVELLING down the band (the '- tt' term), not the band itself
  // moving. A ribbon that translates has to be recycled when it leaves; one that undulates
  // never leaves, and a travelling ripple reads as flight far more strongly anyway.
  function rbPath(k, s, tt, wave, out) {
    const u = s * 2 - 1;                          // -1 .. 1 along the band
    // Headings spread by the golden angle, so no two bands run parallel and the set never
    // settles into a pattern however many are on screen.
    const dirA = k * 2.39996 + rbHash(k * 5 + 1) * 0.9;
    const ca = Math.cos(dirA), sa = Math.sin(dirA);
    const p1 = rbHash(k * 5 + 2) * Math.PI * 2, p2 = rbHash(k * 5 + 3) * Math.PI * 2;
    const ox = rbHash(k * 5 + 4) * 1.1, oy = rbHash(k * 5 + 5) * 0.8;   // spread: the bands are short enough to sit inside the frame now
    const amp = 0.30 + 0.55 * wave;
    const f1 = 2.4 + 0.7 * rbHash(k * 5 + 6), f2 = 1.6 + 0.5 * rbHash(k * 5 + 7);
    // Wave and twist are PER UNIT LENGTH (rbSpan / 2.4, so a 1.6x band is unchanged): a
    // fixed number of cycles per band packed a short band into a corkscrew that cut through
    // itself, and the depth test drew the self-intersections as sawtooth tears.
    const ul = u * rbSpan / 2.4;
    const lat = amp * Math.sin(ul * Math.PI * f1 - tt * 2 + p1);   // sideways swing
    out[0] = ox + u * rbSpan * ca - lat * sa;
    out[1] = oy + u * rbSpan * sa + lat * ca;
    // Depth swings hard on purpose: a band that stays at one depth is a flat squiggle, and it
    // is parts of it rushing near while others hang back that makes the frame feel deep.
    out[2] = RB_ZC + amp * 1.5 * Math.sin(ul * Math.PI * f2 + tt * 1.6 + p2);
  }
  const rbP = [0, 0, 0];
  // One cross-section's two corners, staged before they become triangles: screen x/y, depth
  // and heat for each edge, plus whether the pair has a screen position at all.
  const rbEdge = new Float64Array(8);
  let rbOK = false;
  // Build cross-section i of ribbon k into rbEdge.
  function rbSection(k, si, tt, wave, half, twist, cx, cy, scale) {
    const a = si;
    rbPath(k, a, tt, wave, rbP);
    const px = rbP[0], py = rbP[1], pz = rbP[2];
    // Tangent from a neighbour a hair along the curve. Cheaper and steadier than
    // differentiating by hand, and the curve gains a term whenever Waviness is turned up
    // which a hand derivative would have to gain too.
    const h2 = 1 / (RB_SEGS * 4);
    rbPath(k, a + (a > 0.5 ? -h2 : h2), tt, wave, rbP);
    let tx = rbP[0] - px, ty = rbP[1] - py, tz = rbP[2] - pz;
    if (a > 0.5) { tx = -tx; ty = -ty; tz = -tz; }
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    // A frame around the tangent. The reference axis BLENDS from +y toward +z as the tangent
    // nears vertical, because the cross product degenerates there. It used to SWAP at 0.9,
    // and a band whose heading sits near vertical crossed that line every few sections as
    // the swing took it back and forth -- each crossing flipped the face over in one section,
    // which is exactly the tear this was written to prevent. A blend turns continuously.
    const wz = Math.min(1, Math.max(0, (Math.abs(ty) - 0.6) / 0.35));
    const wzs = wz * wz * (3 - 2 * wz);
    const ul = Math.hypot(1 - wzs, wzs) || 1;
    const ux = 0, uy = (1 - wzs) / ul, uz = wzs / ul;
    let ax = ty * uz - tz * uy, ay = tz * ux - tx * uz, az = tx * uy - ty * ux;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const bx = ty * az - tz * ay, by = tz * ax - tx * az, bz = tx * ay - ty * ax;
    const th = twist * a * (rbSpan / 2.4) * Math.PI * 2 + tt * 0.5;
    const cth = Math.cos(th), sth = Math.sin(th);
    // The width direction: the band lies in the plane of the tangent and this.
    const nx = ax * cth + bx * sth, ny = ay * cth + by * sth, nz = az * cth + bz * sth;
    // THE SURFACE NORMAL, and it is what makes this look like a surface rather than a
    // coloured shape. It is perpendicular to both the tangent and the width direction, so a
    // band turned face-on to the eye is bright and one turned edge-on goes dark -- and since
    // the twist rolls the band continuously, that becomes bands of light sweeping along its
    // length. The point version had to fake this from how wide the projection came out.
    const sx2 = ty * nz - tz * ny, sy2 = tz * nx - tx * nz, sz2 = tx * ny - ty * nx;
    const sl = Math.hypot(sx2, sy2, sz2) || 1;
    // View direction: the eye is at the origin looking down +z, so it is just the point.
    const vl = Math.hypot(px, py, pz) || 1;
    const face = Math.abs((sx2 * px + sy2 * py + sz2 * pz) / (sl * vl));
    // Two edges, projected INDEPENDENTLY, so the perspective foreshortening across the band
    // is real rather than a width scaled by depth.
    const e1z = Math.max(RB_NEAR, pz + nz * half), e2z = Math.max(RB_NEAR, pz - nz * half);
    const dep = Math.min(1, Math.max(0.3, RB_ZC / Math.max(RB_NEAR, pz)));
    // The ends fade out over the last ~12% of the band: at the shipped Length they sit on
    // screen, and a hard-cut end reads as a tear rather than as a ribbon's tip.
    const tip = Math.min(1, (1 - Math.abs(a * 2 - 1)) / 0.12);
    const heat = POINT_HEAT * Math.min(1, (0.20 + 0.80 * face) * dep) * tip * (2 - tip);
    rbOK = camMapXY(cx + ((px + nx * half) / e1z) * scale, cy + ((py + ny * half) / e1z) * scale);
    if (!rbOK) return;
    rbEdge[0] = camMX; rbEdge[1] = camMY;
    rbEdge[2] = Math.min(1, Math.max(0, (e1z - RB_NEAR) / (RB_FAR - RB_NEAR))); rbEdge[3] = heat;
    rbOK = camMapXY(cx + ((px - nx * half) / e2z) * scale, cy + ((py - ny * half) / e2z) * scale);
    if (!rbOK) return;
    rbEdge[4] = camMX; rbEdge[5] = camMY;
    rbEdge[6] = Math.min(1, Math.max(0, (e2z - RB_NEAR) / (RB_FAR - RB_NEAR))); rbEdge[7] = heat;
  }
  function rbVert(x, y, z, h) {
    const i = glRibCount * 4;
    if (i + 4 > glRib.length) { const n2 = new Float32Array(glRib.length * 2); n2.set(glRib); glRib = n2; }
    glRib[i] = x; glRib[i + 1] = y; glRib[i + 2] = z; glRib[i + 3] = h; glRibCount++;
  }
  // Advance the clock and fill glRib with the whole scene's triangles.
  function ribbonBuild(dt) {
    // Per second, matching what the per-tick version accumulated at any burn rate.
    rbTime += rbSpeed * 0.6 * dt;
    glRibCount = 0;
    const cx = fw * 0.5, cy = fh * 0.5;
    // Focal length folded into one number. The curve reaches about 1.2 units off axis at a
    // depth of 3.1, so projecting against a bare half-extent puts the whole thing in the
    // middle ninth of the frame -- which is exactly what the first version drew.
    const scale = Math.min(fw, fh) * 1.05;
    const count = Math.max(1, Math.min(8, Math.round(rbCount)));
    const half = Math.max(0, rbWidth) * 0.5;
    const twist = rbTwist, wave = rbWave, tt = rbTime;
    rbSpan = 1.5 * Math.max(0.25, rbLen);
    // Previous cross-section, kept so each pair becomes a quad.
    let ax0 = 0, ay0 = 0, az0 = 0, ah0 = 0, bx0 = 0, by0 = 0, bz0 = 0, bh0 = 0, have = false;
    for (let k = 0; k < count; k++) {
      have = false;
      for (let i = 0; i <= RB_SEGS; i++) {
        rbSection(k, i / RB_SEGS, tt, wave, half, twist, cx, cy, scale);
        if (!rbOK) { have = false; continue; }   // no screen position: break the strip here
        const x1 = rbEdge[0], y1 = rbEdge[1], z1 = rbEdge[2], h1 = rbEdge[3];
        const x2 = rbEdge[4], y2 = rbEdge[5], z2 = rbEdge[6], h2v = rbEdge[7];
        if (have) {
          rbVert(ax0, ay0, az0, ah0); rbVert(bx0, by0, bz0, bh0); rbVert(x1, y1, z1, h1);
          rbVert(bx0, by0, bz0, bh0); rbVert(x2, y2, z2, h2v);    rbVert(x1, y1, z1, h1);
        }
        ax0 = x1; ay0 = y1; az0 = z1; ah0 = h1;
        bx0 = x2; by0 = y2; bz0 = z2; bh0 = h2v;
        have = true;
      }
    }
  }
  // CPU MIRROR, and it is DELIBERATELY DEGRADED, like Ocean's flat plane. It fills the same
  // triangles into the heat grid with a scanline, but MAX-blends them instead of depth
  // testing: a per-pixel z buffer in JS is a shader's job, and the fallback renders one
  // layer on a machine with no WebGL2 at all. Near parts of a band are brighter, so MAX
  // resolves most crossings the same way a depth test would -- most, not all.
  function rbTri(x1, y1, h1, x2, y2, h2, x3, y3, h3) {
    const yTop = Math.max(0, Math.floor(Math.min(y1, y2, y3)));
    const yBot = Math.min(fh - 1, Math.ceil(Math.max(y1, y2, y3)));
    if (yBot < yTop) return;
    const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
    if (Math.abs(d) < 1e-9) return;
    const xMin = Math.max(0, Math.floor(Math.min(x1, x2, x3)));
    const xMax = Math.min(fw - 1, Math.ceil(Math.max(x1, x2, x3)));
    if (xMax < xMin) return;
    for (let y = yTop; y <= yBot; y++) {
      const row = y * fw;
      for (let x = xMin; x <= xMax; x++) {
        // Barycentric, so the heat interpolates across the face exactly as the GPU does.
        const l1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / d;
        const l2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / d;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const v = l1 * h1 + l2 * h2 + l3 * h3;
        if (v > fire[row + x]) fire[row + x] = v;
      }
    }
  }
  function ribbonCPU(dt) {
    // EVERY CPU MIRROR WRITES EVERY CELL -- the fallback MAX-merges into a buffer nothing else
    // clears on the shader path, so a mirror that touches only the pixels it covers leaves the
    // rest holding the previous frame. rbTri fills triangles, so without this the bands MAX onto
    // their own history and within seconds the frame is a saturated smear of every position a
    // ribbon has ever occupied.
    fire.fill(0);
    ribbonBuild(dt);
    for (let i = 0; i + 3 <= glRibCount; i += 3) {
      const a = i * 4, b = (i + 1) * 4, c = (i + 2) * 4;
      rbTri(glRib[a], glRib[a + 1], glRib[a + 3],
            glRib[b], glRib[b + 1], glRib[b + 3],
            glRib[c], glRib[c + 1], glRib[c + 3]);
    }
  }
  function ribbonDraw(dt) {
    if (useGL) { ribbonBuild(dt); glRibbonDraw(); }
    else ribbonCPU(dt);
  }
