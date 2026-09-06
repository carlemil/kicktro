  // ---- Plasma: old-school sin/cos interference field ----
  // A sum of phase-animated sinusoids (plus a domain warp) over aspect-corrected,
  // zoomed coords, written as heat every frame — same direct-heat model as Julia,
  // so it rides the shared palette/banding/glow pipeline. Live-tunable via sliders.
  // NB: start the phase at 0, not the unix-time T0 — a ~1.7e9 value passed to the
  // shader's float32 uTime collapses sin() precision and flattens the field.
  let plasmaSpeed = 1, plasmaScale = 1, plasmaWarp = 0.5, plasmaTime = 0;
  function plasmaSeed(dt) {
    plasmaTime += dt * plasmaSpeed;      // phase advances at the live Speed
    return { t: plasmaTime, scale: plasmaScale, warp: plasmaWarp, zoom };
  }
  function plasma(dt) {                   // CPU fallback — mirrors FS_PLASMA
    const s = plasmaSeed(dt);
    const ar = fw / fh, k = s.scale / s.zoom * 6.2831853, t = s.t, warp = s.warp;
    let idx = 0;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        camPix(x, y);
        const yy = (camPY / fh - 0.5) * k;
        const xx = (camPX / fw - 0.5) * ar * k;
        const wx = xx + warp * Math.sin(yy * 0.5 + t * 0.7);
        const wy = yy + warp * Math.cos(xx * 0.5 + t * 0.9);
        const v = Math.sin(wx + t)
                + Math.sin(wy * 1.3 - t * 0.8)
                + Math.sin((wx + wy) * 0.7 + t * 1.1)
                + Math.sin(Math.hypot(wx, wy) * 0.9 - t * 1.3);
        fire[idx++] = (0.5 + 0.5 * Math.sin(v * 1.6)) * 255;   // full-range plasma cycling
      }
    }
  }

  // ---- Tunnel: polar-mapped demoscene flythrough (shader effect) ----
  let tunSpeed = 1, tunTwist = 0.3, tunRings = 10, tunTime = 0, tunTwistPhase = 0;
  function tunnelSeed(dt) {
    tunTime += dt * tunSpeed;             // fly forward down the pipe
    tunTwistPhase += dt * tunTwist;       // rotate the pipe
    return { t: tunTime, twist: tunTwistPhase, rings: tunRings, zoom };
  }
  function tunnel(dt) {                    // CPU fallback — mirrors FS_TUNNEL
    const s = tunnelSeed(dt), ar = fw / fh, TAU = 6.2831853;
    let idx = 0;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        camPix(x, y);
        const py = (camPY / fh - 0.5) / s.zoom;
        const px = (camPX / fw - 0.5) * ar / s.zoom;
        const r = Math.hypot(px, py) + 1e-4;
        const a = Math.atan2(py, px) + s.twist * TAU;
        const v = 1 / r + s.t;
        const ang = 0.5 + 0.5 * Math.sin(a * 6);
        const dep = 0.5 + 0.5 * Math.sin(v * s.rings * TAU);
        const heat = dep * (0.55 + 0.45 * ang) * Math.min(1, r / 0.5);
        fire[idx++] = Math.max(0, Math.min(1, heat)) * 255;
      }
    }
  }

  // ---- Metaballs: summed radial fields, soft-saturated (shader effect) ----
  let mbCount = 4, mbRadius = 0.12, mbSpeed = 1, mbGain = 1, mbTime = 0;
  function metaSeed(dt) {
    mbTime += dt * mbSpeed;
    return { t: mbTime, count: mbCount, radius: mbRadius, gain: mbGain, zoom };
  }
  function metaCenter(i, t) {              // shared by shader/CPU: Lissajous path
    return [0.32 * Math.sin(t * (0.5 + i * 0.17) + i * 2.1), 0.32 * Math.cos(t * (0.4 + i * 0.23) + i * 1.3)];
  }
  function metaballs(dt) {                 // CPU fallback — mirrors FS_METABALL
    const s = metaSeed(dt), ar = fw / fh, n = Math.round(s.count), rr = s.radius * s.radius, g = s.gain;
    const cs = []; for (let i = 0; i < n; i++) cs.push(metaCenter(i, s.t));
    let idx = 0;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        camPix(x, y);
        const py = (camPY / fh - 0.5) / s.zoom;
        const px = (camPX / fw - 0.5) * ar / s.zoom;
        let field = 0;
        for (let i = 0; i < n; i++) { const dx = px - cs[i][0], dy = py - cs[i][1]; field += Math.exp(-(dx * dx + dy * dy) / rr); }
        const heat = 1 - Math.exp(-field * g);
        fire[idx++] = Math.max(0, Math.min(1, heat)) * 255;
      }
    }
  }

  // ---- Kaleidoscope: fold into mirror wedges, sample a plasma-like field (shader) ----
  let kSeg = 6, kRotSpeed = 0.2, kNoiseSpeed = 1, kRotPhase = 0, kNoiseTime = 0;
  function kaleidoSeed(dt) {
    kRotPhase += dt * kRotSpeed;
    kNoiseTime += dt * kNoiseSpeed;
    return { seg: kSeg, rot: kRotPhase, t: kNoiseTime, zoom };
  }
  function kaleidoscope(dt) {              // CPU fallback — mirrors FS_KALEIDO
    const s = kaleidoSeed(dt), ar = fw / fh, wedge = Math.PI * 2 / Math.round(s.seg), t = s.t;
    let idx = 0;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        camPix(x, y);
        const py = (camPY / fh - 0.5) / s.zoom;
        const px = (camPX / fw - 0.5) * ar / s.zoom;
        const r = Math.hypot(px, py);
        let a = Math.atan2(py, px) + s.rot;
        a = Math.abs(((a % wedge) + wedge) % wedge - wedge * 0.5);   // fold + mirror into a wedge
        const qx = Math.cos(a) * r * 3, qy = Math.sin(a) * r * 3;
        const v = Math.sin(qx + t) + Math.sin(qy * 1.3 - t * 0.8) + Math.sin((qx + qy) * 0.7 + t * 1.1) + Math.sin(Math.hypot(qx, qy) * 1.5 - t);
        fire[idx++] = (0.5 + 0.5 * Math.sin(v * 1.3)) * 255;
      }
    }
  }

  // ---- Rotozoomer: rotate + pulse-zoom a tiled grid texture (shader effect) ----
  let rzRot = 0.4, rzZoomAmt = 0.5, rzTile = 4, rzAngle = 0, rzTime = 0;
  function rotozoomSeed(dt) {
    rzAngle += dt * rzRot;
    rzTime += dt;
    return { angle: rzAngle, scale: Math.exp(rzZoomAmt * Math.sin(rzTime * 0.7)), tile: rzTile, zoom };
  }
  function rotozoom(dt) {                  // CPU fallback — mirrors FS_ROTOZOOM
    const s = rotozoomSeed(dt), ar = fw / fh, c = Math.cos(s.angle), sn = Math.sin(s.angle), k = s.tile * Math.PI;
    let idx = 0;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        camPix(x, y);
        const py = (camPY / fh - 0.5) / s.zoom;
        const px = (camPX / fw - 0.5) * ar / s.zoom;
        const ux = (c * px - sn * py) * s.scale, uy = (sn * px + c * py) * s.scale;
        fire[idx++] = (0.5 + 0.5 * Math.sin(ux * k) * Math.sin(uy * k)) * 255;
      }
    }
  }

  // ---- Munching squares: heat = ((x^y)+t) & mask — pure XOR pattern (shader effect) ----
  let xorSpeed = 20, xorScale = 0.4, xorMask = 255, xorTime = 0;
  function munchSeed(dt) {
    xorTime += dt * xorSpeed;
    return { t: xorTime, scale: xorScale, mask: Math.round(xorMask), zoom };
  }
  function munch(dt) {                     // CPU fallback — mirrors FS_MUNCH
    const s = munchSeed(dt), ti = Math.floor(s.t), m = s.mask, inv = 1 / m;
    let idx = 0;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        camPix(x, y);
        const yi = Math.floor(camPY / s.zoom * s.scale);
        const xi = Math.floor(camPX / s.zoom * s.scale);
        fire[idx++] = (((xi ^ yi) + ti) & m) * inv * 255;
      }
    }
  }

  // ---- Moiré: two drifting concentric-ring sets, added/multiplied (shader effect) ----
  let moFreq = 10, moDrift = 1, moMix = 0.3, moTime = 0;
  function moireSeed(dt) {
    moTime += dt * moDrift;
    return { t: moTime, freq: moFreq, mix: moMix, zoom };
  }
  function moire(dt) {                     // CPU fallback — mirrors FS_MOIRE
    const s = moireSeed(dt), ar = fw / fh, t = s.t, TAU = 6.2831853;
    const c1x = 0.3 * Math.sin(t * 0.6), c1y = 0.3 * Math.cos(t * 0.5);
    const c2x = 0.3 * Math.cos(t * 0.4), c2y = 0.3 * Math.sin(t * 0.7);
    let idx = 0;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        camPix(x, y);
        const py = (camPY / fh - 0.5) / s.zoom;
        const px = (camPX / fw - 0.5) * ar / s.zoom;
        const a = 0.5 + 0.5 * Math.sin(Math.hypot(px - c1x, py - c1y) * s.freq * TAU);
        const b = 0.5 + 0.5 * Math.sin(Math.hypot(px - c2x, py - c2y) * s.freq * TAU);
        const heat = a * b * (1 - s.mix) + 0.5 * (a + b) * s.mix;
        fire[idx++] = heat * 255;
      }
    }
  }

  // ---- Newton fractal: basins of z³−1 under Newton's method (shader effect) ----
  let nwSpin = 0.15, nwRelax = 1, nwPhase = 0;
  function newtonSeed(dt) {
    nwPhase += dt * nwSpin;
    return { spin: nwPhase, relax: nwRelax, zoom };
  }
  function newton(dt) {                    // CPU fallback — mirrors FS_NEWTON
    const s = newtonSeed(dt), ar = fw / fh, c = Math.cos(s.spin), sn = Math.sin(s.spin), TAU = 6.2831853;
    let idx = 0;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        camPix(x, y);
        const py0 = (camPY / fh - 0.5) * 3 / s.zoom;
        const px0 = (camPX / fw - 0.5) * ar * 3 / s.zoom;
        let zx = c * px0 - sn * py0, zy = sn * px0 + c * py0, iter = 0;
        for (let k = 0; k < 40; k++) {
          const zx2 = zx * zx - zy * zy, zy2 = 2 * zx * zy;          // z²
          const fx = zx2 * zx - zy2 * zy - 1, fy = zx2 * zy + zy2 * zx;   // z³ − 1
          if (fx * fx + fy * fy < 1e-6) break;
          const dpx = 3 * zx2, dpy = 3 * zy2, dd = dpx * dpx + dpy * dpy + 1e-9;   // f' = 3z²
          zx -= s.relax * (fx * dpx + fy * dpy) / dd;
          zy -= s.relax * (fy * dpx - fx * dpy) / dd;
          iter++;
        }
        const root = Math.floor((Math.atan2(zy, zx) / TAU * 3 + 3) % 3);
        fire[idx++] = Math.max(0, Math.min(1, (root + 1 - iter / 40) / 3)) * 255;
      }
    }
  }

  // ---- Multibrot: Julia-orbit z^d + c with an animatable exponent (shader effect) ----
  let mbPower = 2.5;
  function multibrot(seed) {                // CPU fallback — mirrors FS_MULTIBROT
    const cx = seed.cx, cy = seed.cy, spanX = seed.spanX, spanY = seed.spanY, d = mbPower;
    const maxIter = JULIA_MAX_ITER, invLn2 = JULIA_INV_LN2;
    let idx = 0;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        camPix(x, y);
        let zx = (camPX / fw - 0.5) * spanX, zy = (camPY / fh - 0.5) * spanY, i = 0, mag2 = zx * zx + zy * zy;
        while (mag2 <= 4 && i < maxIter) {
          const r = Math.pow(Math.sqrt(mag2), d), th = Math.atan2(zy, zx) * d;
          zx = r * Math.cos(th) + cx; zy = r * Math.sin(th) + cy;
          mag2 = zx * zx + zy * zy; i++;
        }
        let v;
        if (i >= maxIter) v = 255;
        else { const nu = Math.log(0.5 * Math.log(mag2) * invLn2) / Math.log(d); const f = (i + 1 - nu) / maxIter; v = f <= 0 ? 0 : 255 * Math.sqrt(f); }  // outer base = degree d, not 2 (see FS_MULTIBROT)
        fire[idx++] = v;
      }
    }
  }

  // ---- Copper bars: horizontal gradient bars sliding on sine motion (shader effect) ----
  let cbCount = 5, cbSpeed = 1, cbWidth = 0.12, cbTime = 0;
  function copperSeed(dt) {
    cbTime += dt * cbSpeed;
    return { t: cbTime, count: cbCount, width: cbWidth, zoom };
  }
  function copperbars(dt) {                // CPU fallback — mirrors FS_COPPER
    const s = copperSeed(dt), n = Math.round(s.count), w = s.width, bys = [];
    for (let i = 0; i < n; i++) bys.push(0.5 + 0.4 * Math.sin(s.t * (0.6 + i * 0.13) + i * 1.7));
    const barAt = yy => {
      let heat = 0;
      for (let i = 0; i < n; i++) { const bar = Math.max(0, 1 - Math.abs(yy - bys[i]) / w); if (bar * bar > heat) heat = bar * bar; }
      return heat * 255;
    };
    for (let y = 0; y < fh; y++) {
      const row = y * fw;
      if (!camOn()) {                                  // upright: bars are constant across a row
        const v = barAt((y / fh - 0.5) / s.zoom + 0.5);
        for (let x = 0; x < fw; x++) fire[row + x] = v;
      } else {                                         // rotated: yy varies with x, so go per pixel
        for (let x = 0; x < fw; x++) {
          camPix(x, y);
          fire[row + x] = barAt((camPY / fh - 0.5) / s.zoom + 0.5);
        }
      }
    }
  }

  // ---- Starfield / hyperspace (shader effect) ----
  let stDensity = 1.2, stSpeed = 1, stWarp = 0, stTwinkle = 0.8, stTime = 0;
  function starsSeed(dt) {
    stTime += dt * stSpeed;
    return { t: stTime, density: stDensity, warp: stWarp, twinkle: stTwinkle, zoom };
  }
  const stH21 = (x, y) => { const px = x * 123.34 % 1, py = y * 456.21 % 1, s = (px < 0 ? px + 1 : px) + (py < 0 ? py + 1 : py); const v = (s + 45.32) * s * 43.7; return v - Math.floor(v); };
  function starsField(qx, qy, t, dens, tw) {
    let heat = 0;
    for (let i = 0; i < 6; i++) {
      const fi = i / 6;
      const d = (t * 0.15 + fi) % 1;
      const sc = (11 + (1.2 - 11) * d) * dens;
      const px = qx * sc, py = qy * sc;
      const cx = Math.floor(px), cy = Math.floor(py);
      if (stH21(cx + fi * 31.7, cy + fi * 31.7) < 0.78) continue;
      const ox = stH21(cx + fi * 77, cy + fi * 77) - 0.5, oy = stH21(cx + fi * 77 + 9.1, cy + fi * 77 + 9.1) - 0.5;
      const fx = px - cx - 0.5 - ox * 0.8, fy = py - cy - 0.5 - oy * 0.8;
      const dist = Math.hypot(fx, fy);
      const size = 0.04 + 0.12 * d;
      if (dist > size) continue;
      const blink = 1 - tw * 0.5 * (0.5 + 0.5 * Math.sin(t * (3 + 5 * stH21(cx + 2.2, cy + 2.2)) + stH21(cx + 5.5, cy + 5.5) * 6.2832));
      const fade = Math.min(1, d / 0.2) * (d > 0.85 ? (1 - d) / 0.15 : 1);
      const v = blink * fade * (1 - dist / size) * (0.45 + 0.55 * d);
      if (v > heat) heat = v;
    }
    return heat;
  }
  function stars(dt) {                    // CPU fallback — mirrors FS_STARS (base field; one streak tap)
    const s = starsSeed(dt), ar = fw / fh;
    let idx = 0;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        camPix(x, y);
        const qx = (camPX / fw - 0.5) * ar / s.zoom;
        const qy = (camPY / fh - 0.5) / s.zoom;
        let heat = starsField(qx, qy, s.t, s.density, s.twinkle);
        if (s.warp > 0.01) {
          const k = 1 - s.warp * 0.09;
          const v = starsField(qx * k, qy * k, s.t, s.density, s.twinkle) * 0.78;
          if (v > heat) heat = v;
        }
        fire[idx++] = Math.min(1, heat) * 255;
      }
    }
  }

  // ---- Aurora borealis (shader effect) ----
  let auCurtains = 3, auSway = 0.5, auSpeed = 1, auShim = 1, auTime = 0;
  function auroraSeed(dt) {
    auTime += dt * auSpeed;
    return { t: auTime, curtains: auCurtains, sway: auSway, shim: auShim, zoom };
  }
  const auH1 = x => { const v = Math.sin(x * 127.1) * 43758.5453; return v - Math.floor(v); };
  function aurora(dt) {                   // CPU fallback — mirrors FS_AURORA
    const s = auroraSeed(dt), ar = fw / fh, t = s.t, n = Math.round(s.curtains);
    const ph = [], cx = [], w = [], rf = [];
    for (let i = 0; i < n; i++) {
      ph.push(auH1(i * 17.3) * 6.2832);
      cx.push(0.75 * Math.sin(t * (0.11 + 0.045 * i) + ph[i]));
      w.push(0.10 + 0.08 * auH1(i + 3.3));
      rf.push(1.3 + 0.8 * auH1(i + 8.8));
    }
    let idx = 0;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        camPix(x, y);
        const qx = (camPX / fw - 0.5) * ar / s.zoom;
        const qy = (0.5 - camPY / fh) / s.zoom;   // Y-flip: +y = screen UP, matching FS_AURORA
        const xx = qx + s.sway * (0.22 * Math.sin(qy * 2.1 + t * 0.5) + 0.13 * Math.sin(qy * 5.3 - t * 0.31));
        let band = 0;
        for (let i = 0; i < n; i++) {
          const d = (xx - cx[i]) / w[i];
          const rip = 0.65 + 0.35 * Math.sin(t * rf[i] * s.shim + qy * 7 + ph[i]);
          const v = Math.exp(-d * d) * rip;
          if (v > band) band = v;
        }
        const top = Math.max(0, Math.min(1, (qy + 0.55) / 0.5));
        const hang = 0.35 + 0.65 * Math.max(0, Math.min(1, (qy + 0.2) / 0.65));
        const hz = qy + 0.42;
        fire[idx++] = Math.min(1, band * top * hang * 1.4 + 0.06 * Math.exp(-(hz * hz) / 0.0144)) * 255;
      }
    }
  }

  // ---- Menger sponge flythrough (shader effect) ----
  // The camera DRIVES THE STREET GRID: the lattice's corridors (x or z ≡ 1.5 mod 3 in the
  // y = 1.5 plane) form an infinite city grid, and the camera runs hash-picked segments,
  // turning at intersections through rounded (quadratic-Bezier) corners — and hash-picked
  // segments DIVE THROUGH THE SPONGES: the carve leaves straight tunnels along the
  // (±1, ±1) edge lines of every cube row, where the level-1 carve term of the DE is
  // exactly (2−1)/3 = 1/3 for the whole infinite line at EVERY Detail level (deeper
  // carves only ever raise the DE — d = max(d, c)). A dive swoops half a unit sideways
  // and down while crossing the open gap slab between cube rows (base clearance there is
  // max(|q|)−1.05 ≥ ~0.28 along the whole swoop), threads the tunnel through 1–3 cubes,
  // and swoops back to the street before the segment's end corner. Everything is a pure
  // function of (segment hash, distance), so lookahead still works and no new state is
  // needed. The bob fades out (×(1−g)) inside dives — 1/3 clearance leaves less headroom
  // than the street's 0.45. Safety scan-verified: min DE ≥ 0.20 over thousands of
  // segments at max sliders. All state is scalar so two Menger layers wander
  // independently via PHASE_VARS.
  let mgDive = 0.5, mgRot = 0.3, mgIter = 4, mgGlow = 0.5, mgSpin = 0;
  let mgS = 1, mgSeg = 1, mgCx = 1.5, mgCz = 1.5, mgDirI = 2, mgPrevI = 2;
  const MG_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];        // ±x, ±z street directions
  const MG_R = 0.9;                                          // corner-rounding radius
  const MG_DIVE_P = 0.72;                 // chance a segment dives (probe pages patch this)
  const mgH = n => { const v = Math.sin(n * 127.1) * 43758.5453; return v - Math.floor(v); };
  const mgDiveOn = seg => mgH(seg * 13.7) < MG_DIVE_P;
  // dive segments are long (4–7 cells, weighted toward the top) so most dives reach the
  // inner corridor and stay there for several cubes — the flight lives INSIDE the objects
  const mgLen = seg => {
    const u = mgH(seg * 3.7);
    return (mgDiveOn(seg) ? (u < 0.2 ? 4 : u < 0.45 ? 5 : u < 0.75 ? 6 : 7)
                          : 2 + Math.floor(u * 3)) * 3;
  };
  function mgNextDir(seg, dirI) {
    const r = mgH(seg * 7.13);
    if (r < 0.42) return dirI;                               // carry straight through
    const opts = dirI < 2 ? [2, 3] : [0, 1];                 // else turn onto the cross street
    return opts[r < 0.71 ? 0 : 1];
  }
  // SMOOTHERSTEP, not smoothstep: 6t⁵−15t⁴+10t³ is C2, so the path has continuous
  // curvature and the camera's tilt RATE ramps instead of kinking at each blend end (the
  // C1 smoothstep's second-derivative jump read as a subtle jerk every swoop). Its error
  // near the ends is cubic rather than quadratic, which also tightens the swoop-end
  // clearance analysis.
  const mgSS = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10);
  // A dive is a LADDER of lane levels, one step per gap crossing between cube rows:
  // level 0 = the street, level 1 = the edge tunnel (±1, ±1 — carve DE exactly 1/3),
  // level 2 = the INNER tunnel through the sponge body (±1/3, ±1/3 — carve DE exactly
  // 1/9). Adjacent lanes cannot be cut between mid-cube (the diagonal between them
  // pinches to zero clearance), so each swoop happens inside the open gap slab and the
  // level steps by at most ±1 per crossing — which the pyramid min(r, C−1−r, 2) gives
  // for free. 5-cell dives reach the deep level; 3–4-cell ones thread the edge tunnel.
  const MG_OFF = [0, 0.5, 7 / 6];         // lateral lane offsets from the street, per level
  const mgOffAt = lv => lv <= 1 ? lv * MG_OFF[1] : MG_OFF[1] + (lv - 1) * (MG_OFF[2] - MG_OFF[1]);
  function mgLvlAt(seg, s, L) {           // continuous lane level along the segment
    if (!mgDiveOn(seg)) return 0;
    const C = L / 3;
    const lvl = r => (r < 1 || r > C - 2) ? 0 : Math.min(r, C - 1 - r, 2);
    // Swoop window ±0.42 of the 0.45 gap half-width: wider is smoother (lower peak
    // lateral speed), and the smootherstep cubic error keeps the swoop-end clearance
    // above ~0.10 even 0.03 from the slab edge.
    const r = Math.floor(s / 3);          // run r spans [3r, 3r+3); crossings at 3r, 3(r+1)
    const a = mgSS((s - (3 * r - 0.42)) / 0.84);
    const b = mgSS((s - (3 * (r + 1) - 0.42)) / 0.84);
    return lvl(r - 1) + (lvl(r) - lvl(r - 1)) * a + (lvl(r + 1) - lvl(r)) * b;
  }
  const mgDiveOff = seg =>                // which quadrant of tunnel lanes to ladder into
    [mgH(seg * 17.3) < 0.5 ? -1 : 1, mgH(seg * 23.9) < 0.5 ? -1 : 1];
  // Position ds units ahead along the wander → [x, y, z, diveBlend]. Lookahead is safe
  // because everything ahead is hash-determined. Corners are a smootherstep blend
  // BETWEEN THE TWO STREET LINES (p = lerp(lineA(σ), lineB(σ), SS5) over σ ∈ [−R, R]
  // around the corner): with the swoops on the same C2 easing, the WHOLE path has
  // continuous curvature — spline-smooth — while every piece still holds its proven
  // corridor (a free waypoint spline would bow off the lane inside a 1/9-clearance
  // tunnel). The blend also hugs the intersection tighter than the old quadratic Bezier
  // (peak street-line offset ~0.065 vs R/4), so corner clearance IMPROVED to ~0.385.
  function mgCorner(cxx, czz, dA, dB, sig) {
    const w = mgSS(0.5 + sig / (2 * MG_R));
    const ax = cxx + MG_DIRS[dA][0] * sig, az = czz + MG_DIRS[dA][1] * sig;
    const bx = cxx + MG_DIRS[dB][0] * sig, bz = czz + MG_DIRS[dB][1] * sig;
    return [ax + (bx - ax) * w, 1.5, az + (bz - az) * w, 0];
  }
  function mgEval(ds) {
    let s = mgS + ds, seg = mgSeg, cx = mgCx, cz = mgCz, di = mgDirI, pi = mgPrevI;
    let L = mgLen(seg);
    while (s >= L) {
      s -= L; cx += MG_DIRS[di][0] * L; cz += MG_DIRS[di][1] * L;
      pi = di; di = mgNextDir(++seg, di);
      L = mgLen(seg);
    }
    if (s < MG_R && seg > 1 && pi !== di)                    // second half of a corner blend
      return mgCorner(cx, cz, pi, di, s);
    if (s > L - MG_R) {                                      // first half of the NEXT corner
      const nd = mgNextDir(seg + 1, di);
      if (nd !== di)
        return mgCorner(cx + MG_DIRS[di][0] * L, cz + MG_DIRS[di][1] * L, di, nd, s - L);
    }
    let x = cx + MG_DIRS[di][0] * s, z = cz + MG_DIRS[di][1] * s, y = 1.5;
    const lv = mgLvlAt(seg, s, L);
    if (lv > 0) {                                            // swoop down the lane ladder
      const off = mgDiveOff(seg), m = mgOffAt(lv);
      if (di < 2) z += off[0] * m; else x += off[0] * m;
      y += off[1] * m;
    }
    return [x, y, z, Math.min(lv, 1)];
  }
  function mengerSeed(dt) {
    mgSpin += dt * mgRot * 0.4;           // slow screen roll (and the bob's clock)
    mgS += dt * mgDive * 2.4;             // drive forward
    let L = mgLen(mgSeg);
    while (mgS >= L) {                    // commit intersection crossings into the state
      mgS -= L; mgCx += MG_DIRS[mgDirI][0] * L; mgCz += MG_DIRS[mgDirI][1] * L;
      mgPrevI = mgDirI; mgDirI = mgNextDir(++mgSeg, mgDirI);
      L = mgLen(mgSeg);
    }
    const p = mgEval(0), ahead = mgEval(1.6);                // aim a little down the road
    // NO mgSeg in the bob's phase — it increments at segment crossings, and a phase that
    // jumps is a camera that jumps (the "hitches every few seconds" bug). mgSpin alone
    // still decorrelates layers: it is a PHASE_VARS clock, per layer by construction.
    const bob = 0.12 * Math.sin(mgSpin * 1.7) * (1 - p[3]);
    let fx = ahead[0] - p[0], fy = ahead[1] - p[1], fz = ahead[2] - p[2];
    const fl = Math.hypot(fx, fy, fz) || 1;
    return { px: p[0], py: p[1] + bob, pz: p[2], fx: fx / fl, fy: fy / fl, fz: fz / fl,
             roll: mgSpin, iter: mgIter, glow: mgGlow, zoom };
  }
  function mengerDEc(px, py, pz, it) {
    let qx = ((px + 1.5) % 3 + 3) % 3 - 1.5, qy = ((py + 1.5) % 3 + 3) % 3 - 1.5, qz = ((pz + 1.5) % 3 + 3) % 3 - 1.5;
    let d = Math.max(Math.abs(qx), Math.abs(qy), Math.abs(qz)) - 1.05;
    let s = 1;
    for (let i = 0; i < it; i++) {
      const ax = Math.abs(((qx * s + 1) % 2 + 2) % 2 - 1), ay = Math.abs(((qy * s + 1) % 2 + 2) % 2 - 1), az = Math.abs(((qz * s + 1) % 2 + 2) % 2 - 1);
      s *= 3;
      const rx = Math.abs(1 - 3 * ax), ry = Math.abs(1 - 3 * ay), rz = Math.abs(1 - 3 * az);
      const c = (Math.min(Math.max(rx, ry), Math.max(ry, rz), Math.max(rz, rx)) - 1) / s;
      if (c > d) d = c;
    }
    return d;
  }
  function menger(dt) {                   // CPU fallback — coarse like the bulb mirror (3x3 blocks)
    const s = mengerSeed(dt), ar = fw / fh, it = Math.min(3, Math.round(s.iter));
    const cr = Math.cos(s.roll), sr = Math.sin(s.roll);
    // view basis from the heading, exactly as FS_MENGER builds it. fwd tilts during dive
    // swoops but never goes vertical, so right = normalize(up0 × fwd) is always sound.
    const fh2 = Math.hypot(s.fx, s.fz) || 1;
    const rgx = s.fz / fh2, rgz = -s.fx / fh2;           // right = up0 × fwd, normalised
    const upx = -s.fx * s.fy / fh2, upy = fh2, upz = -s.fy * s.fz / fh2;   // up = fwd × right
    for (let y = 0; y < fh; y += 3) {
      for (let x = 0; x < fw; x += 3) {
        camPix(x, y);
        let ux = (camPX / fw - 0.5) * ar * 2 / s.zoom;
        let uy = (camPY / fh - 0.5) * 2 / s.zoom;
        const tu = ux * cr - uy * sr; uy = ux * sr + uy * cr; ux = tu;   // screen roll
        const rl = Math.hypot(ux, uy, 1.4);
        ux /= rl; uy /= rl;
        const fl = 1.4 / rl;
        const rdx = rgx * ux + upx * uy + s.fx * fl;
        const rdy = upy * uy + s.fy * fl;
        const rdz = rgz * ux + upz * uy + s.fz * fl;
        const rox = s.px, roy = s.py, roz = s.pz;        // the street drive — see mengerSeed
        let t = 0, halo = 9, heat = 0;
        for (let i = 0; i < 20; i++) {
          const d = mengerDEc(rox + rdx * t, roy + rdy * t, roz + rdz * t, it);
          if (d / Math.max(t, 0.25) < halo) halo = d / Math.max(t, 0.25);
          if (d < 0.004 * Math.max(t, 0.3)) {
            heat = (0.5 + s.glow * 0.3) * Math.max(0, 1 - t / 8);   // flat shade on the fallback
            break;
          }
          t += d;
          if (t > 9) break;
        }
        if (heat === 0) heat = s.glow * 0.30 * Math.exp(-halo * 40);
        const v = Math.min(1, heat) * 255;
        for (let by = y; by < Math.min(y + 3, fh); by++)
          for (let bx = x; bx < Math.min(x + 3, fw); bx++) fire[by * fw + bx] = v;
      }
    }
  }

  // ---- Reaction–diffusion (Gray–Scott) — CPU sim mirror -----------------------------
  // The GL state lives in glTex.rd (see glRDTick); this is the fallback's own dish: two
  // Float32 pairs at grid size, stepped a capped number of times per frame (the full K
  // would eat the frame budget in JS). Look-equivalent: slower evolution, same regimes.
  // Defaults F 0.030 / k 0.062: measured ALIVE in this exact discretization — V-mass grows
  // steadily for thousands of steps (spots multiplying and spreading). NB the textbook
  // (F, k) map does NOT transfer here: the canonical "mitosis" (.037/.065) and "coral"
  // (.0545/.062) pairs both die to black within ~500 steps under these laplacian weights
  // and dt — measured offline in rd-dynamics scans, not guessed. Many slider positions
  // kill the dish too; that is real Gray–Scott, and the auto-reseed (see glRDTick and the
  // mirror below) is what makes it safe to explore.
  let rdFeed = 0.03, rdKill = 0.062, rdSpeedV = 8, rdGain = 1;
  let rdCpuU = null, rdCpuV = null, rdCpuU2 = null, rdCpuV2 = null, rdCpuSeed = true;
  function rdSeedFn(dt) {
    // Steps scale with dt (targeting `Sim speed` steps per 60Hz frame), so the culture
    // evolves in REAL time whatever the frame rate. This matters beyond fairness: headless
    // virtual-time runs render very few frames with large clamped dt — a fixed per-frame
    // step count made the dish look frozen there while time-driven effects sailed on.
    return { steps: Math.max(1, Math.min(24, Math.round(rdSpeedV * dt * 60))),
             feed: rdFeed, kill: rdKill, gain: rdGain, zoom };
  }
  function rdCPU(s) {
    const N = fw * fh;
    if (!rdCpuU || rdCpuU.length !== N) { rdCpuU = new Float32Array(N); rdCpuV = new Float32Array(N); rdCpuU2 = new Float32Array(N); rdCpuV2 = new Float32Array(N); rdCpuSeed = true; }
    if (rdCpuSeed) {
      rdCpuSeed = false;
      rdCpuU.fill(1); rdCpuV.fill(0);
      for (let i = 0; i < N; i++) {
        const x = (i % fw) / fw, y = ((i / fw) | 0) / fh;
        const cx = Math.floor(x * 14), cy = Math.floor(y * 14);
        if (sunH21(cx + rdSalt, cy + rdSalt) > 0.82) {
          const fx = x * 14 - cx - 0.5, fy = y * 14 - cy - 0.5;
          if (Math.hypot(fx, fy) < 0.2) { rdCpuU[i] = 0.5; rdCpuV[i] = 0.25; }   // canonical gentle seed — see FS_RDSEED
        }
      }
    }
    const steps = Math.min(3, s.steps);   // JS budget cap — evolution is slower, not different
    for (let k = 0; k < steps; k++) {
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
          const i = y * fw + x;
          const xm = x > 0 ? i - 1 : i, xp = x < fw - 1 ? i + 1 : i;
          const ym = y > 0 ? i - fw : i, yp = y < fh - 1 ? i + fw : i;
          const u = rdCpuU[i], v = rdCpuV[i];
          const lu = 0.2 * (rdCpuU[xm] + rdCpuU[xp] + rdCpuU[ym] + rdCpuU[yp]) - 0.8 * u;
          const lv = 0.2 * (rdCpuV[xm] + rdCpuV[xp] + rdCpuV[ym] + rdCpuV[yp]) - 0.8 * v;
          const uvv = u * v * v;
          rdCpuU2[i] = Math.max(0, Math.min(1, u + lu - uvv + s.feed * (1 - u)));
          rdCpuV2[i] = Math.max(0, Math.min(1, v + 0.5 * lv + uvv - (s.kill + s.feed) * v));
        }
      }
      let t;
      t = rdCpuU; rdCpuU = rdCpuU2; rdCpuU2 = t;
      t = rdCpuV; rdCpuV = rdCpuV2; rdCpuV2 = t;
    }
    // the CPU half of the death check (see glRDTick): scan a stride of the dish, and if
    // nothing lives anywhere, re-seed — a dead dish can never regrow on its own
    let alive = false;
    for (let i = 0; i < N; i += 97) if (rdCpuV[i] > 0.004) { alive = true; break; }
    if (!alive) rdCpuSeed = true;
    // display: heat from V, EVERY cell written (zoom/camera skipped on the fallback dish —
    // the sim grid IS the picture, exactly like the fire sim itself)
    for (let i = 0; i < fw * fh; i++) fire[i] = Math.min(1, rdCpuV[i] * s.gain * 2.6) * 255;
  }

  // ---- Cellular automata (Life-like B/S rules) -- CPU sim mirror --------------------
  // Bitmask per rule: bit n set = that neighbour count births (b) / survives (s).
  // Names live in the Rule control's fmt (controls-schema loads first; a TDZ otherwise).
  const CA_RULES = [
    { b: 8, s: 12 },      // Life        B3 / S23
    { b: 72, s: 12 },     // HighLife    B36 / S23
    { b: 456, s: 472 },   // Day & Night B3678 / S34678
    { b: 4, s: 0 },       // Seeds       B2 / S
    { b: 8, s: 62 },      // Maze        B3 / S12345
    { b: 8, s: 496 },     // Coral       B3 / S45678
  ];
  let caRuleI = 0, caCols = 120, caSpeedV = 12, caRain = 0.002, caTrail = 12, caGain = 1;
  let caAcc = 0, caCpuA = null, caCpuB = null, caCpuAge = null, caCpuW = 0, caCpuH = 0, caCpuSeed = true, caCpuRule = -1;
  function caSeedFn(dt) {
    // generations per SECOND, accumulated from dt (real-time whatever the frame rate),
    // capped per frame with a bounded backlog so a backgrounded tab does not run 1000 steps
    caAcc = Math.min(caAcc + caSpeedV * dt, 16);
    const steps = Math.min(8, Math.floor(caAcc)); caAcc -= steps;
    const r = CA_RULES[caRuleI] || CA_RULES[0];
    return { steps, cols: caCols, birth: r.b, survive: r.s, rain: caRain, fade: 1 / Math.max(1, caTrail), rule: caRuleI, gain: caGain, zoom };
  }
  function caCPU(s) {
    const w = s.cols, h = Math.max(4, Math.round(s.cols * fh / fw)), N = w * h;
    if (w !== caCpuW || h !== caCpuH) { caCpuW = w; caCpuH = h; caCpuA = new Uint8Array(N); caCpuB = new Uint8Array(N); caCpuAge = new Float32Array(N); caCpuSeed = true; }
    if (s.rule !== caCpuRule) { caCpuRule = s.rule; caCpuSeed = true; }
    if (caCpuSeed) {
      caCpuSeed = false; caSalt = (caSalt + 1) % 65536;
      for (let i = 0; i < N; i++) { caCpuA[i] = sunH21(i % w + caSalt, (i / w | 0) + caSalt) > 0.7 ? 1 : 0; caCpuAge[i] = caCpuA[i]; }
    }
    for (let k = 0; k < s.steps; k++) {
      caSalt = (caSalt + 1) % 65536;
      for (let y = 0; y < h; y++) {
        const ym = ((y + h - 1) % h) * w, y0 = y * w, yp = ((y + 1) % h) * w;
        for (let x = 0; x < w; x++) {
          const xm = (x + w - 1) % w, xp = (x + 1) % w;
          const n = caCpuA[ym + xm] + caCpuA[ym + x] + caCpuA[ym + xp] + caCpuA[y0 + xm] + caCpuA[y0 + xp] + caCpuA[yp + xm] + caCpuA[yp + x] + caCpuA[yp + xp];
          const i = y0 + x;
          let next = ((caCpuA[i] ? s.survive : s.birth) >> n) & 1;
          if (!next && sunH21(x + caSalt * 0.37, y + caSalt * 0.61) < s.rain) next = 1;
          caCpuB[i] = next;
          caCpuAge[i] = next ? 1 : Math.max(0, caCpuAge[i] - s.fade);
        }
      }
      const t = caCpuA; caCpuA = caCpuB; caCpuB = t;
    }
    // display: nearest cell per fire pixel, every cell written (zoom/camera skipped, like rdCPU)
    for (let y = 0; y < fh; y++) {
      const cy = Math.min(h - 1, (y * h / fh) | 0) * w;
      for (let x = 0; x < fw; x++) {
        const i = cy + Math.min(w - 1, (x * w / fw) | 0);
        fire[y * fw + x] = Math.min(1, Math.max(caCpuA[i] * 0.85, caCpuAge[i] * 0.7) * s.gain) * 255;
      }
    }
  }

  // ---- Sun surface: boiling solar granulation via animated Voronoi (shader effect) ----
  // Clock starts at 0, not unix time (float32 uTime — same trap plasmaTime documents).
  // The mirror is look-equivalent, not bit-identical: sites are cached per frame per CELL
  // (a site depends only on its cell id + t), so the trig runs ~once per cell instead of
  // 9x per pixel — that is what keeps this at Metaballs-mirror cost on the CPU path. The
  // loop compares squared distances and square-roots only the two winners (monotonic, so
  // the ordering is identical to the shader's distance()).
  let sunDensity = 14, sunSpeed = 1, sunLaneW = 0.35, sunGlow = 1, sunSpotAmt = 0, sunTime = 0;
  function sunSeed(dt) {
    sunTime += dt * sunSpeed;             // one clock; the sunspot shimmer rides it too
    return { t: sunTime, density: sunDensity, lane: sunLaneW, glow: sunGlow, spot: sunSpotAmt, zoom };
  }
  const sunFract = v => v - Math.floor(v);
  function sunH21(x, y) {                 // port of the shader's h21 (same constants)
    const px = sunFract(x * 123.34), py = sunFract(y * 456.21);
    const s = px * (px + 45.32) + py * (py + 45.32);
    return sunFract((px + s) * (py + s));
  }
  const sunSites = new Map();             // persistent, cleared per frame — no per-frame allocation
  function sun(dt) {                      // CPU fallback — mirrors FS_SUN
    const s = sunSeed(dt), ar = fw / fh, t = s.t, dens = s.density, laneW = s.lane, TAU = 6.2831853;
    const spot = s.spot, ru = spot * 0.22;
    sunSites.clear();
    const siteOf = (ci, cj) => {
      const k = ci * 8192 + cj;           // cell coords are tiny (|c| ~ density) — never collides
      let v = sunSites.get(k);
      if (!v) {
        const hx = sunH21(ci, cj);        // = h22(cell): second hash re-feeds the first
        const hy = sunH21(ci + hx + 17.17, cj + hx + 17.17);
        v = [ci + 0.5 + 0.38 * Math.sin(t * (0.18 + 0.14 * hx) + hx * TAU),
             cj + 0.5 + 0.38 * Math.cos(t * (0.15 + 0.13 * hy) + hy * TAU),
             sunH21(ci + 7.7, cj + 7.7)]; // per-cell brightness hash, cached with the site
        sunSites.set(k, v);
      }
      return v;
    };
    const sstep = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
    let idx = 0;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        camPix(x, y);
        const qy = (camPY / fh - 0.5) / s.zoom;
        const qx = (camPX / fw - 0.5) * ar / s.zoom;
        const px = qx * dens, py = qy * dens;
        const gx = Math.floor(px), gy = Math.floor(py);
        let f1 = 4096, f2 = 4096, hb = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const st = siteOf(gx + i, gy + j);
          const dx = px - st[0], dy = py - st[1], d2 = dx * dx + dy * dy;
          if (d2 < f1) { f2 = f1; f1 = d2; hb = st[2]; } else if (d2 < f2) f2 = d2;
        }
        const F1 = Math.sqrt(f1);
        const lane = sstep((Math.sqrt(f2) - F1) / laneW);
        const osc = 0.5 + 0.5 * Math.sin(t * (0.20 + 0.20 * hb) + hb * TAU);
        const fall = 1 - 0.30 * sstep(F1 / 0.8);
        const ls = 0.94 + 0.06 * Math.sin(px * 0.33 + t * 0.05) * Math.sin(py * 0.29 - t * 0.04);
        let heat = (0.16 + ((0.58 + 0.27 * osc) * fall - 0.16) * lane) * ls;
        const lgx = Math.floor(px * 3), lgy = Math.floor(py * 3);
        const hp = sunH21(lgx + 3.3, lgy + 3.3);
        if (hp >= 0.93) {                 // bright lane point (the shader's step())
          const ox = sunH21(lgx + 9.9, lgy + 9.9);
          const oy = sunH21(lgx + 9.9 + ox + 17.17, lgy + 9.9 + ox + 17.17);
          const fx = sunFract(px * 3) - (0.25 + 0.5 * ox), fy = sunFract(py * 3) - (0.25 + 0.5 * oy);
          const blink = 0.5 + 0.5 * Math.sin(t * (0.3 + 0.5 * hp) + hp * TAU);
          const pts = (1 - lane) * blink * (1 - sstep(Math.hypot(fx, fy) / 0.11));
          if (pts > heat) heat = pts;
        }
        if (spot > 0.001) {
          const d = Math.hypot(qx, qy), ang = Math.atan2(qy, qx + 1e-5);
          const fil = 0.5 + 0.5 * Math.sin(ang * 44 + 2.5 * Math.sin(ang * 9 + t * 0.07) + d * dens * 0.9);
          const pen = 1 - sstep((d - ru * 1.05) / (ru * 1.55));      // = 1 - smoothstep(1.05ru, 2.6ru, d)
          heat += (0.18 + 0.42 * fil - heat) * pen * 0.9;
          heat *= sstep((d - ru * 0.55) / (ru * 0.45));              // = smoothstep(0.55ru, ru, d)
        }
        fire[idx++] = Math.max(0, Math.min(1, heat * s.glow)) * 255; // EVERY cell written — MAX-merge needs it
      }
    }
  }

  // ---- Kefrens bars: per-scanline weaving ribbons (shader effect) ----
  // The mirror caches every bar's x per ROW once per frame (bar x depends only on y),
  // so the per-pixel loop is just distance tests; a rotated camera reads the nearest
  // cached row, which is visually identical at grid resolution.
  let kfBars = 6, kfSway = 0.25, kfSpeed = 1, kfWidth = 0.045, kfTime = 0;
  function kefrensSeed(dt) {
    kfTime += dt * kfSpeed;
    return { t: kfTime, bars: kfBars, sway: kfSway, width: kfWidth, zoom };
  }
  let kfRow = null;
  function kefrens(dt) {                  // CPU fallback — mirrors FS_KEFRENS
    const s = kefrensSeed(dt), t = s.t, n = Math.round(s.bars), w = s.width;
    if (!kfRow || kfRow.length < fh * 12) kfRow = new Float32Array(fh * 12);
    for (let r = 0; r < fh; r++) {
      const y = (r / fh - 0.5) / s.zoom + 0.5;
      for (let b = 0; b < n; b++) {
        kfRow[r * 12 + b] = 0.5 + s.sway * (0.62 * Math.sin(t * (0.90 + 0.13 * b) + y * 4.6 + b * 2.39)
                                          + 0.38 * Math.sin(t * (0.53 + 0.07 * b) - y * 7.7 + b * 1.17));
      }
    }
    let idx = 0;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        camPix(x, y);
        const qx = (camPX / fw - 0.5) / s.zoom + 0.5;
        const qy = (camPY / fh - 0.5) / s.zoom + 0.5;
        // the cache is indexed by SCREEN row; camPY is exactly that (camPix is screen-space)
        const r = Math.max(0, Math.min(fh - 1, Math.round(camPY)));
        let heat = 0;
        for (let b = 0; b < n; b++) {
          const bar = Math.max(0, 1 - Math.abs(qx - kfRow[r * 12 + b]) / w);
          if (bar > 0) {
            const sh = 0.55 + 0.45 * Math.sin(qy * 40 + b * 1.7 + t * 2);
            const v = bar * bar * (0.45 + 0.55 * sh);
            if (v > heat) heat = v;
          }
        }
        fire[idx++] = Math.min(1, heat * 0.92) * 255;
      }
    }
  }

  // ---- Twister: the classic twisting column (shader effect) ----
  let twCols = 1, twWidth = 0.22, twTwist = 2, twSpeed = 1, twTime = 0;
  function twisterSeed(dt) {
    twTime += dt * twSpeed;
    return { t: twTime, cols: twCols, width: twWidth, twist: twTwist, zoom };
  }
  function twister(dt) {                  // CPU fallback — mirrors FS_TWISTER
    const s = twisterSeed(dt), ar = fw / fh, n = Math.round(s.cols), W = s.width;
    let idx = 0;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        camPix(x, y);
        const qx = (camPX / fw - 0.5) * ar / s.zoom;
        const qy = (camPY / fh - 0.5) / s.zoom;
        let heat = 0;
        for (let c = 0; c < n; c++) {
          const cx = (c - (n - 1) * 0.5) * W * 2.9;
          const a = s.t * (1 + 0.13 * c) + qy * s.twist + 0.35 * Math.sin(s.t * 0.42 + qy * 2.2 + c * 2.1);
          for (let i = 0; i < 4; i++) {
            const x0 = cx + W * Math.cos(a + i * 1.5708);
            const x1 = cx + W * Math.cos(a + (i + 1) * 1.5708);
            if (x1 > x0 && qx >= x0 && qx <= x1) {
              const sh = 0.25 + 0.75 * Math.abs(Math.sin(a + i * 1.5708 + 0.7854));
              const u = (qx - x0) / Math.max(x1 - x0, 1e-4);
              const v = sh + 0.18 * Math.pow(Math.abs(u * 2 - 1), 6);
              if (v > heat) heat = v;
            }
          }
        }
        fire[idx++] = Math.min(1, heat) * 255;
      }
    }
  }

  // ---- Cymatics: Chladni-plate standing waves (shader effect) ----
  let cyModeV = 3, cyOff = 1, cySharp = 5, cyShim = 0.4, cyTime = 0;
  function cymaticsSeed(dt) {
    cyTime += dt;                          // shimmer clock; mode animation is the slider's drift
    return { t: cyTime, n: cyModeV, m: cyModeV + cyOff, sharp: cySharp, shim: cyShim, zoom };
  }
  function cymatics(dt) {                 // CPU fallback — mirrors FS_CYMATICS
    const s = cymaticsSeed(dt), ar = fw / fh, k = 1.5707963;
    let idx = 0;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        camPix(x, y);
        const qx = (camPX / fw - 0.5) * ar * 2 / s.zoom;
        const qy = (camPY / fh - 0.5) * 2 / s.zoom;
        const xx = qx + s.shim * 0.05 * Math.sin(s.t * 0.8 + qy * 5);
        const yy = qy + s.shim * 0.05 * Math.cos(s.t * 0.7 + qx * 4);
        const ch = Math.cos(s.n * k * xx) * Math.cos(s.m * k * yy) + Math.cos(s.m * k * xx) * Math.cos(s.n * k * yy);
        const a = Math.abs(ch) * 0.5;
        const lines = Math.pow(Math.max(0, 1 - a), s.sharp);
        fire[idx++] = Math.min(1, lines + 0.10 * a * a) * 255;
      }
    }
  }

  // ---- Lightning storm: beat-fired bolts (shader effect) ----
  // Shockwave's value-is-progress trick, applied to strikes: a beat snaps the Strike
  // slider to 1 (a fresh bolt at full brightness) and the pulse decays it to afterglow
  // over the Trigger duration. `stormSeed` merges that with the auto Rate clock and
  // advances the bolt seed on every NEW strike — a rising Strike edge, or the auto
  // clock wrapping — so each flash draws a different bolt.
  // Each bolt is an L-system-style fractal (see FS_STORM): four octaves of LINEAR value
  // noise for the kinked main channel plus 2–4 hash-grown branch channels, every
  // parameter re-rolled per strike. `ltFront` is the strike front — a fresh bolt lights
  // top-to-bottom at Strike speed (screen-heights/s) with a hot tip; both it and
  // `ltSeedPrev` (the fresh-bolt detector) ride PHASE_VARS so two storm layers strike
  // independently.
  let ltStrikeV = 0, ltRateV = 0.5, ltSpdV = 12, ltBoltsV = 2, ltGlowV = 0.5;
  let ltTime = 0, ltSeed = 0, ltPrev = 0, ltFront = 9, ltSeedPrev = -1;
  function stormSeed(dt) {
    ltTime += dt * ltRateV;                          // auto clock, in strikes
    if (ltStrikeV > ltPrev + 0.25) ltSeed++;         // a beat (or hand) fired a fresh bolt
    ltPrev = ltStrikeV;
    const seed = Math.floor(ltTime) * 7.31 + ltSeed * 13.7;
    if (seed !== ltSeedPrev) { ltSeedPrev = seed; ltFront = 0; }   // fresh bolt: race down again
    ltFront = Math.min(9, ltFront + dt * ltSpdV);
    const auto = ltRateV > 0 ? Math.pow(1 - (ltTime - Math.floor(ltTime)), 3) : 0;
    return { env: Math.max(auto, ltStrikeV), seed, front: ltFront,
             bolts: ltBoltsV, glow: ltGlowV, zoom };
  }
  const ltH1 = x => { const v = Math.sin(x * 127.1) * 43758.5453; return v - Math.floor(v); };
  const ltVnl = (t, sd) => {              // LINEAR value noise — the kinks are the look
    const i = Math.floor(t), f = t - i;
    return ltH1(i + sd) * (1 - f) + ltH1(i + 1 + sd) * f;
  };
  function ltChanX(y, sk, ar) {
    const rough = 0.8 + 0.5 * ltH1(sk + 51);
    return (ltH1(sk) * 0.9 - 0.45) * ar
      + rough * (0.42 * (ltVnl(y * 3, sk + 7) - 0.5)
               + 0.22 * (ltVnl(y * 9, sk + 17) - 0.5)
               + 0.11 * (ltVnl(y * 27, sk + 29) - 0.5)
               + 0.05 * (ltVnl(y * 81, sk + 43) - 0.5));
  }
  let ltRow = null, ltRowB = null;
  function storm(dt) {                    // CPU fallback — mirrors FS_STORM
    const s = stormSeed(dt), ar = fw / fh, n = Math.round(s.bolts);
    // channel x per ROW per bolt (and per branch), cached once per frame
    if (!ltRow || ltRow.length < fh * 5) { ltRow = new Float32Array(fh * 5); ltRowB = new Float32Array(fh * 20); }
    const bright = [], tipx = [], nbs = [], bfade = [];
    for (let k = 0; k < n; k++) {
      const sk = s.seed + k * 271.13;
      bright.push(s.env * (0.72 + 0.28 * Math.sin(s.env * 40 + sk * 9)) * (0.7 + 0.3 * ltH1(sk + 3.3)));
      tipx.push(ltChanX(s.front, sk, ar));
      const nb = 2 + Math.floor(ltH1(sk + 41) * 2.99);
      nbs.push(nb);
      for (let r = 0; r < fh; r++) {
        const yt = (r / fh - 0.5) / s.zoom + 0.5;   // 0 at SCREEN top (buffer row 0 = top)
        ltRow[r * 5 + k] = ltChanX(yt, sk, ar);
        for (let j = 0; j < 4; j++) {
          const bi = (r * 5 + k) * 4 + j;
          if (j >= nb) { ltRowB[bi] = 1e9; continue; }
          const sj = sk + j * 17.71 + 5;
          const yf = 0.12 + 0.62 * ltH1(sj);
          const len = 0.15 + 0.30 * ltH1(sj + 2);
          const t = (yt - yf) / len;
          if (t < 0 || t > 1) { ltRowB[bi] = 1e9; continue; }
          const slope = (ltH1(sj + 4) - 0.5) * 1.6;
          ltRowB[bi] = ltChanX(yf, sk, ar) + slope * (yt - yf)
            + 0.12 * t * (ltVnl(yt * 13, sj + 6) - 0.5)
            + 0.05 * (ltVnl(yt * 41, sj + 8) - 0.5);
          bfade[bi] = 0.55 * (1 - 0.6 * t);
        }
      }
    }
    let idx = 0;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        camPix(x, y);
        const qx = (camPX / fw - 0.5) * ar / s.zoom;
        const qy = (camPY / fh - 0.5) / s.zoom;
        const r = Math.max(0, Math.min(fh - 1, Math.round(camPY)));   // cache is by screen row
        const yt = qy + 0.5;                                          // matches FS_STORM's flip
        const lf = (yt - (s.front - 0.05)) / 0.06;
        const lit = lf <= 0 ? 1 : lf >= 1 ? 0 : 1 - lf * lf * (3 - 2 * lf);
        let heat = 0;
        for (let k = 0; k < n; k++) {
          const d = Math.abs(qx - ltRow[r * 5 + k]);
          let v = bright[k] * lit * (Math.exp(-d * 90) + 0.30 * Math.exp(-d * 14));
          if (v > heat) heat = v;
          if (s.front < 1.05) {
            const dx = qx - tipx[k], dy = yt - s.front;
            v = bright[k] * 1.5 * Math.exp(-Math.hypot(dx, dy) * 40);
            if (v > heat) heat = v;
          }
          for (let j = 0; j < nbs[k]; j++) {
            const bi = (r * 5 + k) * 4 + j;
            const bx = ltRowB[bi];
            if (bx > 1e8) continue;
            const dj = Math.abs(qx - bx);
            v = bright[k] * lit * bfade[bi] * Math.exp(-dj * 110);
            if (v > heat) heat = v;
          }
        }
        heat += s.env * s.glow * 0.22 * (0.4 + 0.6 * (1 - yt)) + s.glow * 0.05;
        fire[idx++] = Math.min(1, heat) * 255;
      }
    }
  }

  // ---- Vector balls: Amiga bobs in formation (shader effect) ----
  // Same per-pixel z-test as FS_VBALLS, every 2nd pixel into a 2x2 block. The formation is
  // recomputed per pixel in the shader (it is free there); on the CPU that would be 48
  // trig-heavy calls per pixel, so the rotated centres are hoisted OUT of the pixel loop —
  // they do not depend on the pixel, and this is the whole reason the mirror is affordable.
  const VB_MAX = 48;
  let vbCount = 24, vbShape = 1, vbRad = 0.30, vbSpin = 0.5, vbGlow = 0.5, vbPhase = 0;
  function vballsSeed(dt) {
    vbPhase += dt * vbSpin;
    return { phase: vbPhase, count: vbCount, shape: vbShape, rad: vbRad, glow: vbGlow, zoom };
  }
  function vbForm(fi, fn, shape, out) {
    if (shape === 0) {
      const side = Math.ceil(Math.pow(fn, 1 / 3));
      const ix = fi % side, iy = Math.floor(fi / side) % side, iz = Math.floor(fi / (side * side));
      const k = 2.4 / Math.max(1, side - 1), c = (side - 1) * 0.5;
      out[0] = (ix - c) * k; out[1] = (iy - c) * k; out[2] = (iz - c) * k;
    } else if (shape === 1) {
      const k = (fi + 0.5) / fn;
      const ph = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * k))), th = 2.399963 * fi;
      out[0] = Math.sin(ph) * Math.cos(th) * 1.45;
      out[1] = Math.sin(ph) * Math.sin(th) * 1.45;
      out[2] = Math.cos(ph) * 1.45;
    } else if (shape === 2) {
      const a = fi / fn * 6.2831853;
      out[0] = Math.cos(a) * 1.5; out[1] = Math.sin(a * 2) * 0.45; out[2] = Math.sin(a) * 1.5;
    } else {
      const u = fi / fn, a = u * 12 + (fi % 2 < 0.5 ? 0 : Math.PI);
      out[0] = Math.cos(a) * 0.95; out[1] = (u - 0.5) * 3; out[2] = Math.sin(a) * 0.95;
    }
  }
  const vbCx = new Float64Array(VB_MAX), vbCy = new Float64Array(VB_MAX), vbCz = new Float64Array(VB_MAX);
  const vbTmp = [0, 0, 0];
  function vballsCPU(s) {                 // CPU fallback — mirrors FS_VBALLS
    const ar = fw / fh, focal = 2.6, camZ = 6.5;
    const n = Math.min(VB_MAX, Math.round(s.count)), shape = Math.round(s.shape);
    const ay = s.phase, ax = s.phase * 0.63;
    const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
    for (let i = 0; i < n; i++) {
      vbForm(i, s.count, shape, vbTmp);
      const x = vbTmp[0], y = vbTmp[1], z = vbTmp[2];
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      vbCx[i] = x1; vbCy[i] = y * cx - z1 * sx; vbCz[i] = y * sx + z1 * cx;
    }
    for (let py = 0; py < fh; py += 2) {
      for (let px = 0; px < fw; px += 2) {
        camPix(px, py);
        const ux = (camPX / fw - 0.5) * ar * 2 / s.zoom;
        const uy = (camPY / fh - 0.5) * 2 / s.zoom;
        let bestZ = 1e9, heat = 0;
        for (let i = 0; i < n; i++) {
          const zc = vbCz[i] + camZ;
          if (zc < 0.35) continue;
          const k = focal / zc;
          const dx = ux - vbCx[i] * k, dy = uy - vbCy[i] * k;
          const rad = s.rad * k, rr = rad * rad, r2 = dx * dx + dy * dy;
          if (r2 >= rr) continue;
          const zz = Math.sqrt(rr - r2), depth = zc - zz / k;
          if (depth >= bestZ) continue;
          bestZ = depth;
          const nx = dx / rad, ny = dy / rad, nz = -zz / rad;
          const dif = Math.max(0, nx * 0.45 + ny * 0.6 + nz * -0.66);
          const rim = Math.pow(1 - Math.abs(nz), 3);
          const dep = 1 + (0.36 - 1) * Math.max(0, Math.min(1, (zc - 4.6) / 4.2));
          heat = (0.14 + 0.78 * dif + s.glow * 0.7 * rim) * dep;
        }
        const v = Math.max(0, Math.min(1, heat)) * 255;
        for (let by = py; by < Math.min(py + 2, fh); by++)
          for (let bx = px; bx < Math.min(px + 2, fw); bx++) fire[by * fw + bx] = v;
      }
    }
  }

  // ---- Gerstner ocean: rolling sea heightfield (shader effect) ----
  // Closed form per pixel, so the mirror is nearly the real thing: every 2nd pixel into a
  // 2x2 block and four octaves instead of six.
  let goSwell = 1, goChop = 2.5, goSpeed = 1, goFoam = 0.45, goWind = 0, goTime = 0, goSurf = 0;
  let goHeight = 0.7, goReflect = 0.6;
  function oceanSeed(dt) {
    goTime += dt * goSpeed;
    return { t: goTime, swell: goSwell, chop: goChop, foam: goFoam, wind: goWind,
             height: goHeight, reflect: goReflect, surf: Math.max(0, Math.min(3, Math.round(goSurf))), zoom };
  }
  // CPU fallback. It keeps the ORIGINAL flat-plane intersection rather than mirroring the
  // march, and that is a deliberate simplification, not an oversight: 32 steps x 3 wave
  // octaves is ~100 sin/cos per pixel, which is a shader's budget and not a JS loop's. The
  // fallback therefore shows a displaced-normal sea with no self-occlusion and no
  // reflection — the fallback path renders one layer, so there is nothing beneath it to
  // reflect in the first place.
  // ponytail: flat-plane fallback; march it if anyone ever runs this without WebGL2 and minds.
  function oceanCPU(s) {                  // CPU fallback — a simplified FS_OCEAN
    const ar = fw / fh, camH = 3.4;
    const wr = s.wind * Math.PI / 180;
    const ss = t => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
    for (let y = 0; y < fh; y += 2) {
      for (let x = 0; x < fw; x += 2) {
        camPix(x, y);
        const qx = (camPX / fw - 0.5) * ar * 2 / s.zoom;
        const qy = (0.5 - camPY / fh) * 2 / s.zoom;      // screen-UP, as in the shader
        let rx = qx, ry = qy - 0.30, rz = 1.35;
        const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
        let heat;
        if (ry > -0.004) {
          heat = 0.10 * Math.exp(-Math.max(0, ry) * 9);
        } else {
          const t = camH / -ry, px = rx * t, pz = rz * t;
          const fade = 1 / (1 + t * t * 0.0016);
          let dx = Math.cos(wr), dz = Math.sin(wr);
          let h = 0, dhx = 0, dhz = 0, amp = 1, frq = 0.40, spd = 1, norm = 0;
          for (let i = 0; i < 4; i++) {
            const ph = (px * dx + pz * dz) * frq + s.t * spd;
            const sv = Math.sin(ph) * 0.5 + 0.5;
            h += amp * Math.pow(sv, s.chop);
            norm += amp;
            const dw = amp * s.chop * Math.pow(Math.max(sv, 1e-4), s.chop - 1) * 0.5 * Math.cos(ph) * frq;
            dhx += dw * dx; dhz += dw * dz;
            amp *= 0.62; frq *= 1.87; spd *= 1.21;
            const nx = dx * 0.62 - dz * 0.78, nz = dx * 0.78 + dz * 0.62;
            const nl = Math.hypot(nx, nz) || 1; dx = nx / nl; dz = nz / nl;
          }
          h /= norm;
          const nx = -dhx * s.swell, nz = -dhz * s.swell;
          const nl = Math.hypot(nx, 1, nz) || 1;
          const gl2 = Math.max(0, (nx / nl) * 0.35 + (1 / nl) * 0.55 + (nz / nl) * -0.75);
          const glint = Math.pow(gl2, 22);
          const slope = 1 - Math.exp(-Math.hypot(dhx, dhz) * s.swell * 1.2); // ponytail: CPU mirror keeps the flat-plane gradient, so no coarse pass here
          const foam = ss((h * 0.65 + slope * 0.55 - s.foam) / Math.max(0.02, Math.min(0.995, s.foam + 0.38) - s.foam));
          heat = (0.10 + 0.48 * h * h + 0.45 * glint + 0.55 * foam) * fade;
          heat += 0.16 * Math.exp(-Math.abs(ry + 0.004) * 260);
        }
        const v = Math.max(0, Math.min(1, heat)) * 255;
        for (let by = y; by < Math.min(y + 2, fh); by++)
          for (let bx = x; bx < Math.min(x + 2, fw); bx++) fire[by * fw + bx] = v;
      }
    }
  }

  // ---- Black hole: lensed accretion disk (shader effect) ----
  // Photon integration, not a raymarch — see FS_BHOLE for the physics. The mirror keeps the
  // deflection (without it the picture is just an ellipse and the effect is pointless) and
  // gives up everything else: every 4th pixel into a 4x4 block, 56 steps instead of 160,
  // one noise octave.
  let bhOrbSpd = 0.08, bhTilt = 12, bhOuter = 8, bhBeam = 0.8, bhSpin = 1;
  let bhTime = 0, bhOrbit = 0;
  function bholeSeed(dt) {
    bhTime += dt * bhSpin;
    bhOrbit += dt * bhOrbSpd;
    return { t: bhTime, orbit: bhOrbit, tilt: bhTilt * Math.PI / 180, outer: bhOuter, beam: bhBeam, zoom };
  }
  const bhHash = (x, y) => { const v = Math.sin(x + y * 57) * 43758.5453; return v - Math.floor(v); };
  function bhNoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = bhHash(ix, iy), b = bhHash(ix + 1, iy), c = bhHash(ix, iy + 1), d = bhHash(ix + 1, iy + 1);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  }
  // Takes the seed the descriptor already advanced this frame — it must NOT call
  // bholeSeed() itself, or the Canvas2D path runs the disk and the camera at double speed
  // (the same trap the cardioid mirrors carry a comment about).
  function bholeCPU(s) {                  // CPU fallback — mirrors FS_BHOLE, coarsely
    const ar = fw / fh;
    const ca = Math.cos(s.orbit), sa = Math.sin(s.orbit);
    const ct = Math.cos(s.tilt), st = Math.sin(s.tilt);
    const rox = sa * 22 * ct, roy = 22 * st, roz = -ca * 22 * ct;
    const fl = Math.hypot(rox, roy, roz);
    const fx = -rox / fl, fy = -roy / fl, fz = -roz / fl;
    // right = normalize(cross(up, fwd)) with up = (0,1,0)
    let rx = 1 * fz - 0 * fy, ry = 0 * fx - 0 * fz, rz = 0 * fy - 1 * fx;
    const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
    const ux = fy * rz - fz * ry, uy = fz * rx - fx * rz, uz = fx * ry - fy * rx;
    const rIn = 2.3, rOut = Math.max(rIn + 1.2, s.outer);
    for (let y = 0; y < fh; y += 4) {
      for (let x = 0; x < fw; x += 4) {
        camPix(x, y);
        const vx = (camPX / fw - 0.5) * ar * 2 / s.zoom;
        const vy = (camPY / fh - 0.5) * 2 / s.zoom;
        let dx = fx * 1.9 + rx * vx + ux * vy;
        let dy = fy * 1.9 + ry * vx + uy * vy;
        let dz = fz * 1.9 + rz * vx + uz * vy;
        const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
        // h = |p x d|, conserved
        const hx = roy * dz - roz * dy, hy = roz * dx - rox * dz, hz = rox * dy - roy * dx;
        const h2 = hx * hx + hy * hy + hz * hz;
        let px = rox, py = roy, pz = roz, prevY = py, heat = 0;
        for (let i = 0; i < 56; i++) {
          const r = Math.hypot(px, py, pz);
          if (r < 1) break;               // keep what was collected — see FS_BHOLE
          if (r > 26 && px * dx + py * dy + pz * dz > 0) break;
          const dtS = 0.10 + 0.055 * r;
          const nx = px + dx * dtS, ny = py + dy * dtS, nz = pz + dz * dtS;
          if (prevY * ny < 0) {
            const k = prevY / (prevY - ny);
            const qx = px + (nx - px) * k, qz = pz + (nz - pz) * k;
            const rr = Math.hypot(qx, qz);
            if (rr > rIn && rr < rOut) {
              const ang = Math.atan2(qz, qx);
              const kep = s.t * 6 / Math.pow(rr, 1.5);
              const n = 0.55 + 0.45 * bhNoise(ang * 2.6 / 6.2831853 * 14 + kep, rr * 1.7);
              const ss = t => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
              const e1 = 1 - ss((rr - rOut * 0.55) / (rOut - rOut * 0.55));   // mirrors the shader's inverted ramp
              const e2 = ss((rr - rIn) / (rIn * 0.30));
              const vl = 1 / Math.sqrt(rr), vlen = Math.hypot(-qz, qx) || 1;
              const dop = Math.max(0.05, Math.min(3.2,
                1 + s.beam * 3 * ((-qz / vlen) * -dx + (qx / vlen) * -dz) * vl));
              heat += e1 * e2 * n * dop * (5.5 / rr);
            }
          }
          const p2 = px * px + py * py + pz * pz, k2 = -1.5 * h2 / Math.pow(p2, 2.5) * dtS;
          dx += px * k2; dy += py * k2; dz += pz * k2;
          const nl = Math.hypot(dx, dy, dz) || 1; dx /= nl; dy /= nl; dz /= nl;
          prevY = ny; px = nx; py = ny; pz = nz;
        }
        const bx = roy * dz - roz * dy, by = roz * dx - rox * dz, bz = rox * dy - roy * dx;
        const bb = Math.hypot(bx, by, bz);
        heat += 0.55 * Math.exp(-Math.pow((bb - 2.6) / 0.16, 2));
        const v = Math.min(1, heat) * 255;
        for (let by2 = y; by2 < Math.min(y + 4, fh); by2++)
          for (let bx2 = x; bx2 < Math.min(x + 4, fw); bx2++) fire[by2 * fw + bx2] = v;
      }
    }
  }

  // ---- Quaternion Julia: raymarched 4D Julia slice (shader effect) ----
  // Same coarse-mirror bargain as the Mandelbulb below: every 3rd pixel into a 3x3 block,
  // a third of the shader's steps, iterations capped, flat shading. The seed `c` is handed
  // in by the descriptor (juliaSeed) exactly like the other cardioid effects — this must
  // NOT advance the orbit itself, or the Canvas2D path runs it at double speed.
  let qjSlice = 0, qjCut = 0, qjDetail = 8, qjSpin = 0.3, qjGlow = 0.5, qjPhase = 0;
  // ORIENTATION. Standalone, the effect orbits its camera (qjPhase drives the yaw, with a
  // built-in nod); in the shared 3D world the camera belongs to every layer, so the same
  // rotation moves the OBJECT instead -- and with the camera fixed there was no way to turn
  // the solid at all. These three angles plus the per-axis tumble rates are that control.
  // They apply in BOTH modes, to the same thing (the object's frame relative to the viewer),
  // so a scene set up standalone looks the same after joining. qjTum* accumulate per frame
  // like qjPhase and ride PHASE_VARS with it.
  let qjPitch = 0, qjYaw = 0, qjRoll = 0, qjTumX = 0, qjTumY = 0, qjTumZ = 0;
  let qjTx = 0, qjTy = 0, qjTz = 0;
  function qjuliaSeed(dt) {
    qjPhase += dt * qjSpin;
    qjTx += dt * qjTumX; qjTy += dt * qjTumY; qjTz += dt * qjTumZ;
    // qjCut is stored in DEGREES (it is an angle the user sets); the shader and the mirror
    // both want radians, and converting once here keeps the two from disagreeing.
    const D = Math.PI / 180;
    return { phase: qjPhase, slice: qjSlice, cut: qjCut * D, iter: qjDetail, glow: qjGlow, zoom,
             rx: qjPitch * D + qjTx, ry: qjYaw * D + qjTy, rz: qjRoll * D + qjTz };
  }
  // iq's quaternion-Julia distance estimate. md2 tracks |dz|^2, which is exact for z^2+c
  // because the derivative is 2z and only its magnitude matters.
  function qjDE(zx, zy, zz, zw, cx, cy, cz, cw, it) {
    let md2 = 1, mz2 = zx * zx + zy * zy + zz * zz + zw * zw;
    for (let i = 0; i < it; i++) {
      md2 *= 4 * mz2;
      const nx = zx * zx - (zy * zy + zz * zz + zw * zw), s = 2 * zx;
      const ny = s * zy, nz = s * zz, nw = s * zw;
      zx = nx + cx; zy = ny + cy; zz = nz + cz; zw = nw + cw;
      mz2 = zx * zx + zy * zy + zz * zz + zw * zw;
      if (mz2 > 16) break;
    }
    return 0.25 * Math.sqrt(mz2 / md2) * Math.log(Math.max(mz2, 1e-12));
  }
  function qjulia(seed, s) {              // CPU fallback — mirrors FS_QJULIA, coarsely
    const ar = fw / fh, it = Math.min(6, Math.round(s.iter));
    const cx = seed.cx, cy = seed.cy, cz = 0, cw = 0;     // c is purely complex — see FS_QJULIA
    const kc = Math.cos(s.cut), ks = Math.sin(s.cut);     // the rotated cutting hyperplane
    const ca = Math.cos(s.phase), sa = Math.sin(s.phase);
    const tilt = 0.32 * Math.sin(s.phase * 0.6), ct = Math.cos(tilt), st = Math.sin(tilt);
    for (let y = 0; y < fh; y += 3) {
      for (let x = 0; x < fw; x += 3) {
        camPix(x, y);
        const ux = (camPX / fw - 0.5) * ar * 2 / s.zoom;
        const uy = (camPY / fh - 0.5) * 2 / s.zoom;
        let rox = 0, roy = 0, roz = -2.9;
        const rl = Math.hypot(ux, uy, 1.7);
        let rdx = ux / rl, rdy = uy / rl, rdz = 1.7 / rl;
        let tx = rox * ca + roz * sa; roz = -rox * sa + roz * ca; rox = tx;
        tx = rdx * ca + rdz * sa; rdz = -rdx * sa + rdz * ca; rdx = tx;
        let ty = roy * ct - roz * st; roz = roy * st + roz * ct; roy = ty;
        ty = rdy * ct - rdz * st; rdz = rdy * st + rdz * ct; rdy = ty;
        let heat = 0, halo = 9;
        const b = rox * rdx + roy * rdy + roz * rdz;
        const disc = b * b - (rox * rox + roy * roy + roz * roz - 4);
        if (disc > 0) {
          const sd = Math.sqrt(disc);
          let t = Math.max(0, -b - sd);
          const tMax = -b + sd;
          for (let i = 0; i < 32 && t <= tMax; i++) {
            let px = rox + rdx * t, py = roy + rdy * t, pz = roz + rdz * t;
            // the object's orientation, same three rotations in the same order as qjOrient
            { let c = Math.cos(s.rx), sn = Math.sin(s.rx), q = py * c - pz * sn; pz = py * sn + pz * c; py = q; }
            { let c = Math.cos(s.ry), sn = Math.sin(s.ry), q = px * c + pz * sn; pz = -px * sn + pz * c; px = q; }
            { let c = Math.cos(s.rz), sn = Math.sin(s.rz), q = px * c - py * sn; py = px * sn + py * c; px = q; }
            const d = qjDE(px * kc - s.slice * ks, py, pz, px * ks + s.slice * kc, cx, cy, cz, cw, it);
            if (d / Math.max(t, 0.3) < halo) halo = d / Math.max(t, 0.3);
            if (d < 0.003 * Math.max(t, 0.5)) {
              heat = (0.45 + s.glow * 0.3) * Math.max(0, 1 - (t - 1.6) / 3.4);   // flat — no normals here
              break;
            }
            t += d;
          }
        }
        if (heat === 0) heat = s.glow * 0.35 * Math.exp(-halo * 55);
        const v = Math.min(1, heat) * 255;
        for (let by = y; by < Math.min(y + 3, fh); by++)
          for (let bx = x; bx < Math.min(x + 3, fw); bx++) fire[by * fw + bx] = v;
      }
    }
  }

  // ---- Mandelbulb: raymarched power-N fractal (shader effect) ----
  // THE CAMERA LIVES INSIDE THE BULB, and that is why the flight path is here rather than
  // in the shader: staying in free space means evaluating the DE AROUND the camera, and a
  // fragment shader only ever knows about its own ray.
  //
  // The path is a helix winding about the bulb's polar axis, through the shell where all
  // the structure is — and it is CORRECTED, not planned: each frame the camera is pushed
  // out of anything solid along the DE gradient, which is the direction of the nearest
  // free space (in a canyon that is sideways, so it threads the crevice instead of being
  // shoved out through the roof).
  //
  // **The correction is warm-started from the last frame, and that is what makes it
  // smooth.** Solved fresh from the helix each frame it is a discontinuous function of
  // the phase — the escape route flips to a different pocket and the camera teleports
  // (measured: 65 units per radian at the worst phase, against a mean of 3). Carrying the
  // offset over means the solver starts where it already was, so it re-converges on the
  // same pocket and the escape only has to track the drift. `bpOff*` therefore rides
  // PHASE_VARS like every other accumulator: two Mandelbulb layers must not share one
  // camera. The offset also decays back toward the helix, so a detour ends when the wall
  // that caused it does, and the escape is RATE-LIMITED (and scaled by the orbit speed —
  // a faster flight needs a faster dodge) so a newly-blocked spot is a swerve, not a jump.
  //
  // The mirror marches every 3rd pixel and fills 3x3 blocks — a raymarch with a
  // transcendental DE is orders beyond the other mirrors, so this trades sharpness
  // for a fallback that still moves. Steps 24 vs the shader's 80, iterations capped 6
  // (the CAMERA still solves at the shader's iteration count — a camera that disagrees
  // with the surface it is flying past ends up embedded in it).
  let bpPower = 8, bpDetail = 7, bpSpin = 0.35, bpGlow = 0.5, bpPhase = 0;
  let bpOffX = 0, bpOffY = 0, bpOffZ = 0;     // the escape offset — PHASE_VARS, per layer
  let bpDist = 1, bpLift = 0;             // orbit radius and height (see bulbBase)
  const BULB_CLEAR = 0.12;                    // free space the camera keeps around itself
  // How close to the centre Distance is allowed to park, as a fraction of the shell. The
  // bulb's size tracks Power, so this has to be relative -- see the note in bulbBase.
  const BULB_MINR = 0.78;
  const BULB_RELAX = 0.5;                     // 1/s the offset decays back toward the helix
  const BULB_OFFMAX = 0.9;                    // how far the escape may ever carry it off
  const bpBase = [0, 0, 0], bpNext = [0, 0, 0];
  // Where the free space IS. Below the shell the bulb is SOLID — swept at clearance 0.12,
  // not one direction is free under r 1.16 at power 8 — so "inside" means inside the shell
  // of lobes and canyons, not inside the ball. The radius that opens up moves with the
  // power (0.68 at 2, 1.16 at 8, 1.20 at 12), and a helix pinned at one radius is either
  // buried at high powers or orbiting empty space at low ones: 1.30 - 1.2/P tracks it.
  const bulbShell = P => Math.max(0.6, Math.min(1.3, 1.3 - 1.2 / Math.max(1, P)));
  function bulbBase(ph, P, out) {             // the uncorrected orbit — pure, and smooth
    // AN ORBIT AROUND THE SOLID, not a flight through it. It used to ride bulbShell(P) plus a
    // margin, i.e. it skimmed the outer surface, which framed a wall rather than a fractal.
    // The bulb is centred on the origin and at power 8 its surface stays inside r ~ 1.2, so
    // Distance 2.5 frames the whole thing; 2.0 is close, and below ~1.2 the camera is inside
    // the solid -- where the iteration never escapes, the DE goes FLAT and there is nothing to
    // draw. That is why "put the camera in the middle looking out" has no answer: a Mandelbulb
    // has no hollow middle, it is densest at the centre.
    //
    // NOTE the up axis here is Z (see FS_BULB's basis), so out[2] is the height.
    // Distance is ABSOLUTE and its scale is the one v1.50.0 shipped -- a saved scene stores
    // this number, so reinterpreting it as a multiple of the shell would silently re-frame
    // every Mandelbulb scene already out there. The power-dependence goes in the FLOOR
    // instead, where it costs nobody anything: the bulb is fatter at low Power, so a radius
    // that sits in open space at power 8 is buried in the solid at power 4 (the probe caught
    // exactly that -- 2.56% of frames embedded). BULB_MINR keeps the camera clear at every
    // power, and every value v1.50.0 could store is far above it, so old scenes are untouched.
    //
    // The floor is also why the slider can reach 0 without rendering black. There is no
    // hollow middle to fly into: the centre of a Mandelbulb is the DENSEST part of the set,
    // the iteration never escapes and the distance estimate goes flat, so a camera actually
    // at the origin sees nothing at all. Winding Distance to 0 parks you as deep as there is
    // anything to see from, which is the useful reading of "all the way in".
    const rad = Math.max(bpDist, BULB_MINR * bulbShell(P));
    out[0] = rad * Math.cos(ph);
    out[1] = rad * Math.sin(ph);
    out[2] = bpLift + 0.10 * rad * Math.sin(ph * 0.23);
    return out;
  }
  function bulbSeed(dt) {
    bpPhase += dt * bpSpin;
    // Match the SHADER's iteration count exactly (int(uIter) truncates, and its loop caps
    // at 12), so the surface the camera dodges is the surface that gets drawn.
    const P = bpPower, it = Math.max(1, Math.min(12, Math.floor(bpDetail)));
    const b = bulbBase(bpPhase, P, bpBase);
    const dec = Math.exp(-dt * BULB_RELAX);
    bpOffX *= dec; bpOffY *= dec; bpOffZ *= dec;
    let x = b[0] + bpOffX, y = b[1] + bpOffY, z = b[2] + bpOffZ;
    let moved = 0;
    const cap = (2 + 6 * bpSpin) * dt;        // escape budget for this frame, in units
    for (let k = 0; k < 8; k++) {
      const d = bulbDE(x, y, z, P, it);
      if (d >= BULB_CLEAR) break;
      const e = 0.004;
      const gx = bulbDE(x + e, y, z, P, it) - bulbDE(x - e, y, z, P, it);
      const gy = bulbDE(x, y + e, z, P, it) - bulbDE(x, y - e, z, P, it);
      const gz = bulbDE(x, y, z + e, P, it) - bulbDE(x, y, z - e, P, it);
      const gn = Math.hypot(gx, gy, gz), rn = Math.hypot(x, y, z) || 1;
      let took = 0;
      // TWO candidate directions, in order: the DE gradient, then straight out from the
      // origin. The gradient is the nearest way out and is what threads a crevice, but it
      // is not always a way out at all — deep in the solid the iteration never escapes, dr
      // runs away and the DE goes FLAT (every sample equal, gradient zero), and in a
      // dead-end pocket it points along the valley rather than up it. Radially out is
      // always a way out of a fractal centred on the origin, so it is the fallback and not
      // the first choice: taken first it would shove the camera off every canyon wall.
      for (let c = 0; c < 2 && !took; c++) {
        const dx = c === 0 && gn > 1e-5 ? gx / gn : x / rn;
        const dy = c === 0 && gn > 1e-5 ? gy / gn : y / rn;
        const dz = c === 0 && gn > 1e-5 ? gz / gn : z / rn;
        let s = (BULB_CLEAR - d) * 1.1;       // |grad| of a distance field is 1
        if (moved + s > cap) s = cap - moved;
        if (s <= 0) break;
        // ACCEPT ONLY WHAT IMPROVES THE CLEARANCE. In a canyon narrower than 2·CLEAR no
        // point has the clearance being asked for, and a solver that keeps stepping walks
        // out of one wall straight into the far one and oscillates between them — which is
        // how the camera ended up INSIDE the surface on 4 frames in 100. Halving a rejected
        // step turns "unreachable" into "as free as this crevice gets".
        for (let h = 0; h < 3 && s > 1e-4; h++) {
          const nx = x + dx * s, ny = y + dy * s, nz = z + dz * s;
          if (bulbDE(nx, ny, nz, P, it) > d) { x = nx; y = ny; z = nz; took = s; break; }
          s *= 0.5;
        }
      }
      if (!took) break;
      moved += took;
    }
    bpOffX = x - b[0]; bpOffY = y - b[1]; bpOffZ = z - b[2];
    const on = Math.hypot(bpOffX, bpOffY, bpOffZ);
    if (on > BULB_OFFMAX) {                   // never let a detour become the path
      const f = BULB_OFFMAX / on;
      bpOffX *= f; bpOffY *= f; bpOffZ *= f;
      x = b[0] + bpOffX; y = b[1] + bpOffY; z = b[2] + bpOffZ;
    }
    // Heading: the HELIX's tangent (smooth by construction — the corrected path is not,
    // and a heading that jitters is worse than a camera that does), leaned toward the
    // core so the walls fill the frame instead of sliding past the edge — measured: the
    // fractal covers 51% of the screen leaning 0.75, 63% leaning 1.8, and past ~2.2 it is
    // all wall and the travel stops reading. The lean breathes, between looking down the
    // canyon and looking into it.
    // LOOK AT THE ORIGIN. The old heading was the helix tangent leaned toward the core, which
    // is what a canyon flight wants; an orbit that frames the solid simply aims at it.
    let fx = -x, fy = -y, fz = -z;
    let fl = Math.hypot(fx, fy, fz) || 1;
    return { px: x, py: y, pz: z, fx: fx / fl, fy: fy / fl, fz: fz / fl,
             power: bpPower, iter: bpDetail, glow: bpGlow, zoom };
  }
  function bulbDE(px, py, pz, P, it) {
    let zx = px, zy = py, zz = pz, dr = 1, r = 0;
    for (let i = 0; i < it; i++) {
      r = Math.sqrt(zx * zx + zy * zy + zz * zz);
      if (r > 2) break;
      const th = Math.acos(Math.max(-1, Math.min(1, zz / Math.max(r, 1e-6)))) * P;
      const ph = Math.atan2(zy, zx) * P;
      dr = Math.pow(r, P - 1) * P * dr + 1;
      const zr = Math.pow(r, P), st = Math.sin(th);
      zx = zr * st * Math.cos(ph) + px;
      zy = zr * st * Math.sin(ph) + py;
      zz = zr * Math.cos(th) + pz;
    }
    return 0.5 * Math.log(Math.max(r, 1e-6)) * r / dr;
  }
  function bulb(dt) {                     // CPU fallback — mirrors FS_BULB, coarsely
    const s = bulbSeed(dt), ar = fw / fh;
    const it = Math.min(6, Math.round(s.iter)), P = s.power;
    // Same view basis the shader builds: world up is the bulb's polar axis unless the
    // heading is near it, right = up x fwd, screen up = fwd x right.
    const fx = s.fx, fy = s.fy, fz = s.fz;
    const vert = Math.abs(fz) > 0.9, wx = 0, wy = vert ? 1 : 0, wz = vert ? 0 : 1;
    let rx = wy * fz - wz * fy, ry = wz * fx - wx * fz, rz = wx * fy - wy * fx;
    const rn = Math.hypot(rx, ry, rz) || 1; rx /= rn; ry /= rn; rz /= rn;
    const ux = fy * rz - fz * ry, uy = fz * rx - fx * rz, uz = fx * ry - fy * rx;
    for (let y = 0; y < fh; y += 3) {
      for (let x = 0; x < fw; x += 3) {
        camPix(x, y);
        const sx = (camPX / fw - 0.5) * ar * 2 / s.zoom;
        const sy = (camPY / fh - 0.5) * 2 / s.zoom;
        let rdx = rx * sx + ux * sy + fx * 1.73;
        let rdy = ry * sx + uy * sy + fy * 1.73;
        let rdz = rz * sx + uz * sy + fz * 1.73;
        const rl = Math.hypot(rdx, rdy, rdz) || 1; rdx /= rl; rdy /= rl; rdz /= rl;
        let t = 0, halo = 9, heat = 0;
        for (let i = 0; i < 24; i++) {
          const d = bulbDE(s.px + rdx * t, s.py + rdy * t, s.pz + rdz * t, P, it);
          if (d / Math.max(t, 0.25) < halo) halo = d / Math.max(t, 0.25);
          if (d < 0.003 * Math.max(t, 0.3)) {
            heat = (0.42 + s.glow * 0.3) * (0.30 + 0.70 * Math.exp(-t * 0.85));   // flat shade — no normals on the fallback
            break;
          }
          t += d;
          if (t > 3.2) break;
        }
        if (heat === 0) heat = s.glow * 0.35 * Math.exp(-halo * 55);
        const v = Math.min(1, heat) * 255;
        for (let by = y; by < Math.min(y + 3, fh); by++)           // fill the 3x3 block
          for (let bx = x; bx < Math.min(x + 3, fw); bx++) fire[by * fw + bx] = v;
      }
    }
  }

  // ---- Glass ball: raytraced spheres over the layers beneath (shader effect) ----
  // No per-frame state but the clock: the balls' positions are a closed-form function of it
  // (ballAt in FS_GLASS), so nothing has to be carried between frames and nothing can drift
  // apart between the shader and its mirror.
  let gbCount = 3, gbRad = 0.62, gbMat = 1, gbIor = 1.45, gbGlow = 0.5, gbPhase = 0, gbSalt = 0;
  // ---- THE PER-LAYER SALT, and the switch that once turned it off ------------------------
  // A ghost was reported the day the salt landed: a second copy of the balls, the same
  // animation but far behind, the original vanishing whenever the ghost showed. This switch
  // was shipped OFF in v1.55.3 so the reporter could answer on the only machine that showed
  // it -- and the ghost survived the switch, so the salt is CLEARED. It is back on.
  //
  // Kept as a switch rather than deleted, because it was cheap and the question may come
  // back: with it off, two glass layers draw the same balls in the same places, and
  // glassprobe reports the state either way so it cannot be left off by accident.
  const GB_SALT_ON = true;
  // Matches the GLSL hash in ballAt exactly -- both paths must place the balls identically.
  function gbHashJS(x) { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  // WHERE ONE BALL IS, and the JS twin of ballAt() in FS_GLASS and FS_WORLD. Named rather
  // than inlined so the two salt terms have one place to be read and checked: h1 shifts where
  // a layer's balls START, and h2 detunes their RATE -- which is the half that matters,
  // because two orbits at the same speed with different offsets stay a fixed distance apart
  // forever and can still line up. Writes gbBall rather than allocating; this runs per ball
  // per frame.
  const gbBall = [0, 0, 0];
  function gbBallAt(i, t, salt) {
    const h1 = gbHashJS(salt + 1.7), h2 = gbHashJS(salt + 9.3);
    const a = t * (0.60 + 0.13 * i + 0.09 * h2) + i * 2.39996 + h1 * 6.2831853;
    const b = t * (0.41 + 0.09 * i + 0.07 * h1) + i * 1.11700 + h2 * 6.2831853;
    gbBall[0] = 1.25 * Math.sin(a) + 0.35 * Math.sin(b * 1.7);
    gbBall[1] = 0.85 * Math.sin(b) + 0.25 * Math.cos(a * 1.3);
    gbBall[2] = 0.60 * Math.cos(a * 0.8 + i);
    return gbBall;
  }
  function glassSeed(dt) {
    gbPhase += dt * 0.5;
    return { t: gbPhase, count: Math.round(gbCount), rad: gbRad, mat: Math.round(gbMat),
             ior: gbIor, glow: gbGlow, zoom,
             // ONE place, so the standalone draw and the shared world are switched together.
             salt: GB_SALT_ON ? gbSalt : 0,
             // The two hash values the shader used to compute itself, computed HERE instead.
             // Math.sin is deterministic; the GPU's was not -- see the note in FS_GLASS.
             h1: gbHashJS((GB_SALT_ON ? gbSalt : 0) + 1.7),
             h2: gbHashJS((GB_SALT_ON ? gbSalt : 0) + 9.3) };
  }
  // CPU fallback. Spheres and a headlamp -- no reflection, no refraction, and no layer
  // underneath to sample: the fallback path renders ONE item, so "the layers beneath" does
  // not exist there at all. Shading them as plain lit balls is the honest version; faking a
  // reflection of nothing would just be noise.
  function glassCPU(dt) {
    // 3 == the Balls slider max, same bound the three GLSL loops carry (glassprobe pins them).
    const s = glassSeed(dt), ar = fw / fh, R = s.rad, n = Math.max(1, Math.min(3, s.count));
    const cx = [], cy = [], cz = [];
    for (let i = 0; i < n; i++) {
      gbBallAt(i, s.t, s.salt);
      cx.push(gbBall[0]); cy.push(gbBall[1]); cz.push(gbBall[2]);
    }
    for (let y = 0; y < fh; y += 2) {
      for (let x = 0; x < fw; x += 2) {
        camPix(x, y);
        const sx = (camPX / fw - 0.5) * ar * 2 / s.zoom;
        const sy = (camPY / fh - 0.5) * 2 / s.zoom;
        const rl = Math.hypot(sx, sy, 1.55);
        const rdx = sx / rl, rdy = sy / rl, rdz = 1.55 / rl;
        let best = 1e9, bi = -1;
        for (let i = 0; i < n; i++) {
          const ox = -cx[i], oy = -cy[i], oz = -3.2 - cz[i];
          const bq = ox * rdx + oy * rdy + oz * rdz;
          const h = bq * bq - (ox * ox + oy * oy + oz * oz - R * R);
          if (h < 0) continue;
          const sq = Math.sqrt(h);
          let t = -bq - sq;
          if (t < 0) t = -bq + sq;
          if (t > 0 && t < best) { best = t; bi = i; }
        }
        let heat = 0;
        if (bi >= 0) {
          const px = rdx * best - cx[bi], py = rdy * best - cy[bi], pz = -3.2 + rdz * best - cz[bi];
          const nx = px / R, ny = py / R, nz = pz / R;
          const dif = Math.max(0, -(nx * rdx + ny * rdy + nz * rdz));
          const rim = Math.pow(1 - dif, 2);          // the same wide grazing term the shader uses
          heat = Math.max(0.004, 0.12 + 0.55 * dif + (0.10 + s.glow * 0.7) * rim);
        }
        const v = Math.min(0.92, heat) * 255;
        for (let by = y; by < Math.min(y + 2, fh); by++)
          for (let bx = x; bx < Math.min(x + 2, fw); bx++) fire[by * fw + bx] = v;
      }
    }
  }
  // ---- Doughnut: the inside of a torus, flown along the tube (shader effect) ----
  // The Mandelbulb's interior camera needed a DE-escape solver because the free space in a
  // fractal is not knowable in closed form. Here it IS: the tube's centre circle is free by
  // construction, so the path is just that circle plus a wobble, and the only thing to get
  // right is keeping the wobble inside the narrowest wall.
  //
  // THE WALL IS SCALLOPED, so "narrowest" is not uTube. FS_TORUS carves
  //   wall = tube·(1 − 0.18·cos(flute·ang)) − 0.06·tube·cos(24·arc)
  // whose minimum is 0.76·tube. DN_WOB is 0.30, and the radial term is scaled by tube, so
  // the camera sits at most 0.30·tube out against a 0.76·tube floor at every slider setting
  // — no per-frame clearance check, no state, and nothing to go wrong at 4 fps.
  let dnRing = 3, dnTube = 0.8, dnSpeed = 1, dnTwist = 1, dnFlute = 6, dnGlow = 0.5, dnPhase = 0;
  const DN_WOB = 0.30;                    // wobble as a fraction of the tube radius
  const dnAt = (ph, out) => {             // the path — pure, so the heading can sample it twice
    // Two clocks on the cross-section offset, at an irrational-ish ratio, so the camera
    // never retraces the same helix and the flutes arrive at a different angle each lap.
    const w = DN_WOB * dnTube * (0.55 + 0.45 * Math.sin(ph * 0.23));
    const a = ph * 0.61;
    const rr = dnRing + w * Math.cos(a);
    out[0] = rr * Math.cos(ph); out[1] = rr * Math.sin(ph); out[2] = w * Math.sin(a);
    return out;
  };
  const dnP = [0, 0, 0];
  function torusSeed(dt) {
    dnPhase += dt * dnSpeed * 0.55;       // radians of arc per second at speed 1
    const p = dnAt(dnPhase, dnP);
    // Heading is the CENTRE CIRCLE's tangent, not the wobbling path's. The path tangent is
    // the obvious choice and it is wrong here: the wobble tilts it a few degrees, which
    // swings the vanishing point off the frame and reads as the camera drifting rather than
    // as the tunnel bending. Aiming down the pipe keeps the far end roughly centred and
    // turns the wobble into parallax against the near wall, which is what sells the flight.
    // Sign follows the direction of travel, so Speed can run negative.
    const dir = dnSpeed < 0 ? -1 : 1;
    let fx = -Math.sin(dnPhase) * dir, fy = Math.cos(dnPhase) * dir, fz = 0;
    const fl = Math.hypot(fx, fy, fz) || 1;
    return { px: p[0], py: p[1], pz: p[2], fx: fx / fl, fy: fy / fl, fz: fz / fl,
             ring: dnRing, tube: dnTube, twist: dnTwist, flute: Math.round(dnFlute),
             glow: dnGlow, zoom };
  }
  function torusDECPU(x, y, z, ring, tube, twist, flute) {
    const q = Math.hypot(x, y) - ring, arc = Math.atan2(y, x);
    const rad = Math.hypot(q, z), ang0 = Math.atan2(z, q);
    const su = Math.max(0, Math.min(1, arc - 2.1415927)), s = su * su * (3 - 2 * su);   // seam closure, as FS_TORUS
    const k = twist * flute, dlt = ((k + 0.5) - Math.floor(k + 0.5) - 0.5) / Math.max(flute, 1);
    const ang = ang0 + twist * arc - 6.2831853 * dlt * s;
    const angC = ang0 + twist * (arc - 6.2831853 * s);
    const wall = tube * (1 - 0.18 * Math.cos(flute * ang))
               - tube * (0.055 * Math.cos(arc * 24) + 0.022 * Math.cos(arc * 97 + angC * 3));
    return wall - rad;
  }
  function torusCPU(dt) {                 // CPU fallback — mirrors FS_TORUS, coarsely
    const s = torusSeed(dt), ar = fw / fh;
    const fx = s.fx, fy = s.fy, fz = s.fz;
    const vert = Math.abs(fz) > 0.9, wx = 0, wy = vert ? 1 : 0, wz = vert ? 0 : 1;
    let rx = wy * fz - wz * fy, ry = wz * fx - wx * fz, rz = wx * fy - wy * fx;
    const rn = Math.hypot(rx, ry, rz) || 1; rx /= rn; ry /= rn; rz /= rn;
    const ux = fy * rz - fz * ry, uy = fz * rx - fx * rz, uz = fx * ry - fy * rx;
    for (let y = 0; y < fh; y += 3) {
      for (let x = 0; x < fw; x += 3) {
        camPix(x, y);
        const sx = (camPX / fw - 0.5) * ar * 2 / s.zoom;
        const sy = (camPY / fh - 0.5) * 2 / s.zoom;
        let rdx = rx * sx + ux * sy + fx * 1.25;
        let rdy = ry * sx + uy * sy + fy * 1.25;
        let rdz = rz * sx + uz * sy + fz * 1.25;
        const rl = Math.hypot(rdx, rdy, rdz) || 1; rdx /= rl; rdy /= rl; rdz /= rl;
        let t = 0, halo = 9, heat = 0;
        for (let i = 0; i < 26; i++) {
          const d = torusDECPU(s.px + rdx * t, s.py + rdy * t, s.pz + rdz * t,
                               s.ring, s.tube, s.twist, s.flute);
          if (d / Math.max(t, 0.25) < halo) halo = d / Math.max(t, 0.25);
          if (d < 0.004 * Math.max(t, 0.5)) {
            heat = Math.min(0.82, (0.10 + (0.95 + s.glow * 0.6) / (1 + t * 0.42)) * 0.9);   // flat shade, same headlamp falloff
            break;
          }
          t += d * 0.62;
          if (t > 26) break;
        }
        if (heat === 0) heat = s.glow * 0.22 * Math.exp(-halo * 40);
        const v = Math.min(1, heat) * 255;
        for (let by = y; by < Math.min(y + 3, fh); by++)           // fill the 3x3 block
          for (let bx = x; bx < Math.min(x + 3, fw); bx++) fire[by * fw + bx] = v;
      }
    }
  }

