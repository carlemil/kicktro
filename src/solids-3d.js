  // ---- Bouncing solids: rigid bodies raymarched as SDFs ---------------------
  // The 3D member of the shape family (Polygon / Shape grid / Concentric / Bouncing
  // shapes are its 2D siblings). A handful of primitives — sphere, box, doughnut,
  // capsule, octahedron, cylinder — tumble and ricochet inside an invisible room and
  // are drawn by ONE raymarching fragment shader (FS_SOLIDS), shaded into heat by
  // surface normal + depth so the palette and glow treat it like every other effect.
  //
  // Split of responsibilities, and it matters: the PHYSICS runs here on the CPU once
  // per frame for a handful of bodies (cheap, and the only way the GL path and the
  // Canvas2D mirror can agree on where anything is), and the shader is handed nothing
  // but the resulting pose — centre+radius in uPos, orientation in uQuat, which
  // primitive in uShape. So `solids()` (the CPU mirror) and the shader raymarch the
  // *same* scene; only the marcher differs, and only in step count.
  //
  // Orientation is a QUATERNION, not the tetrahedron's rotated-vertex list: these are
  // implicit surfaces with no vertices to carry the rotation, so the shader has to undo
  // it per sample (rotate the sample point into body space by the conjugate). A
  // quaternion is 4 floats per body to upload and cannot shear or drift out of shape
  // the way an accumulated 3x3 basis does — it just needs renormalising, which is one
  // divide per body per frame.
  const SOLID_SHAPES = 6;               // sphere, box, torus, capsule, octahedron, cylinder
  const SOLID_BOX = [1.0, 0.72, 0.55];  // container half-extents; x is retuned to the frame aspect
  const SOLID_SPIN_KICK = 1.35;         // how hard a wall impact converts slide into roll
  let sdCount = 5, sdSize = 0.26, sdSpeed = 1, sdSpin = 1, sdMix = 6, sdRim = 0.55;
  // The live body list belongs to the LAYER (L.solids), exactly like the tetrahedron's
  // L.tetras — two Bouncing solids layers must tumble independently, not in lockstep.
  // installStackItem points this at the drawing layer's list before its draw hook runs.
  let sdBodies = [];
  // Uniform staging buffers, allocated once. SD_MAX must match the array sizes declared
  // in FS_SOLIDS — the shader cannot size an array from a uniform.
  const SD_MAX = 8;
  const sdPos = new Float32Array(SD_MAX * 4);    // xyz = centre, w = radius
  const sdQuat = new Float32Array(SD_MAX * 4);   // orientation (x,y,z,w), unit
  const sdShape = new Float32Array(SD_MAX);      // which primitive
  // Deterministic start state: body k of layer `salt` opens the same way every reload, with
  // no Math.random on this path at all (the chaos PRNG stays untouched — see Determinism).
  //
  // A hash, not a row of hand-tuned sines. The first version WAS sines — and shipped a bug
  // worth remembering: the x term was `0.55·sin(k·3.1)`, and 3.1 is π to within 1.3%, so
  // sin(k·3.1) is near zero for every small k and all five bodies started stacked in a
  // column at x≈0. They spread out once they had bounced a few times, so it looked like a
  // slow start rather than a distribution bug, and only a screenshot of the opening frames
  // showed it. Three independent hashed values per vector cannot develop that kind of
  // correlation between bodies.
  function sdHash(k, salt, i) {
    let x = (k * 374761393 + salt * 668265263 + i * 2246822519 + 0x9E3779B1) | 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }
  function makeSolid(k, salt, rad) {
    const r = i => sdHash(k, salt, i) * 2 - 1;              // hashed, in [-1, 1)
    // Spread across whatever room is actually AVAILABLE — the wall limit is
    // `SOLID_BOX[ax] − radius`, not the wall itself, and it differs per axis (x follows the
    // frame aspect, z is the shallowest). Hardcoded ranges here put a body outside the z
    // and y limits at the shipped size, so it opened the scene half-buried in a wall and
    // rendered as a flat clipped face until the first push-out moved it. The 0.92 keeps a
    // little clearance so nothing starts exactly touching.
    const rr = rad === undefined ? sdSize : rad;
    const room = ax => Math.max(0, SOLID_BOX[ax] - rr) * 0.92;
    const P = [r(1) * room(0), r(2) * room(1), r(3) * room(2)];
    const V = [r(4) * 0.62, r(5) * 0.55, r(6) * 0.42];
    const W = [r(7) * 1.8, r(8) * 1.8, r(9) * 1.8];
    return { P, V, W, Q: [0, 0, 0, 1], k,
             E0: 0.5 * v3.dot(V, V) };   // translational energy only: the spin is renormalised with it
  }
  function ensureSolids(arr, count, salt) {
    while (arr.length < count) arr.push(makeSolid(arr.length, salt, sdSize));
    if (arr.length > count) arr.length = count;
  }
  // Point the globals at THIS layer's bodies (creating them on first draw). Called from
  // installStackItem for `solids` effects, the same hook installSeedPath uses.
  function installSolids(L) {
    L.solids = L.solids || [];
    ensureSolids(L.solids, Math.max(1, Math.min(SD_MAX, Math.round(sdCount))), layerSalt(L));
    sdBodies = L.solids;
  }
  // Keep them lively forever. The walls are near-elastic but not perfectly so, and the
  // spin kick adds energy, so both ends drift; nudge the speed back toward its start
  // value whenever it leaves a sane band. Same idea (and the same reason) as tetraRenorm.
  function solidRenorm(S) {
    const KE = 0.5 * v3.dot(S.V, S.V);
    if (S.E0 > 0 && KE > 1e-6 && (KE < 0.45 * S.E0 || KE > 2.2 * S.E0)) {
      const f = Math.sqrt(S.E0 / KE);
      S.V = v3.scale(S.V, f);
    }
    const wl = Math.hypot(S.W[0], S.W[1], S.W[2]);   // and cap the tumble, or a corner hit can spin it into a blur
    if (wl > 4.5) S.W = v3.scale(S.W, 4.5 / wl);
  }
  // Advance one body. Bounding-SPHERE walls: every primitive is authored to fit inside
  // radius r (see the SDFs in FS_SOLIDS), so one radius drives every contact test and a
  // doughnut bounces off the same wall a sphere would. Resolving the true SDF contact
  // would need a per-shape support function for a difference nobody can see at this size.
  function solidStep(S, dt, r) {
    S.P = v3.add(S.P, v3.scale(S.V, dt));
    for (let ax = 0; ax < 3; ax++) {
      const lim = SOLID_BOX[ax] - r;
      if (lim <= 0) continue;                         // body bigger than the room ⇒ leave it be
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        const beyond = sgn > 0 ? S.P[ax] - lim : -lim - S.P[ax];
        if (beyond <= 0) continue;
        const n = [0, 0, 0]; n[ax] = -sgn;            // inward wall normal
        if (v3.dot(S.V, n) < 0) {
          S.V[ax] = -S.V[ax] * 0.985;                 // reflect, near-elastic
          // Slide becomes roll: ω += k·(n × v_tangential)/r is the contact a real solid
          // would make, so clipping a wall at an angle visibly kicks it into a tumble
          // instead of sliding along unchanged. This is the whole reason the bounce
          // reads as physical rather than as a DVD logo.
          const vt = [S.V[0], S.V[1], S.V[2]]; vt[ax] = 0;
          const kick = v3.scale(v3.cross(n, vt), SOLID_SPIN_KICK / Math.max(0.05, r));
          S.W = v3.add(S.W, kick);
        }
        S.P[ax] += n[ax] * beyond;                    // positional push-out, no penetration
      }
    }
    // Integrate the orientation: dq/dt = ½·ω⊗q, then renormalise. Written out rather than
    // via a quat-multiply helper because ω's scalar part is 0, which kills half the terms.
    const wx = S.W[0] * sdSpin, wy = S.W[1] * sdSpin, wz = S.W[2] * sdSpin;
    const q = S.Q, h = 0.5 * dt;
    const dx = h * (wx * q[3] + wy * q[2] - wz * q[1]);
    const dy = h * (-wx * q[2] + wy * q[3] + wz * q[0]);
    const dz = h * (wx * q[1] - wy * q[0] + wz * q[3]);
    const dw = h * (-wx * q[0] - wy * q[1] - wz * q[2]);
    q[0] += dx; q[1] += dy; q[2] += dz; q[3] += dw;
    const ql = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    q[0] /= ql; q[1] /= ql; q[2] /= ql; q[3] /= ql;
    solidRenorm(S);
  }
  // Step the sim and stage the uniforms. Called once per frame per layer from the
  // descriptor's draw hook, GL and CPU alike, so both paths see the identical pose.
  function solidsSeed(dt) {
    SOLID_BOX[0] = SOLID_BOX[1] * (fw / fh);          // the room follows the frame aspect
    const n = Math.max(1, Math.min(SD_MAX, Math.round(sdCount)));
    ensureSolids(sdBodies, n, 0);
    // Clamp the step: a backgrounded tab hands back one enormous dt, and a body that
    // travels further than the room in a single step tunnels straight through a wall.
    const step = Math.min(0.05, dt) * sdSpeed;
    const mix = Math.max(1, Math.min(SOLID_SHAPES, Math.round(sdMix)));
    for (let i = 0; i < n; i++) {
      const S = sdBodies[i];
      solidStep(S, step, sdSize);
      sdPos[i * 4] = S.P[0]; sdPos[i * 4 + 1] = S.P[1]; sdPos[i * 4 + 2] = S.P[2]; sdPos[i * 4 + 3] = sdSize;
      sdQuat[i * 4] = S.Q[0]; sdQuat[i * 4 + 1] = S.Q[1]; sdQuat[i * 4 + 2] = S.Q[2]; sdQuat[i * 4 + 3] = S.Q[3];
      sdShape[i] = S.k % mix;                         // Shape mix = how many primitives are in play
    }
    return { pos: sdPos, quat: sdQuat, shape: sdShape, count: n, rim: sdRim, zoom };
  }

  // ---- Metaball goo: the solids' physics, spheres joined by a smooth-min ----------------
  // Same rigid bodies, same walls, same hashed start (makeSolid / solidStep); only the radius,
  // count and speed are the goo's own, and the orientation is carried but never drawn. Bodies
  // do not collide with each other -- they never did -- so blobs sail through one another and
  // the smooth union (FS_GOO, gooMap) is what makes them merge and pinch apart. The list lives
  // on the layer (L.goo) for the same reason L.solids does.
  let guCount = 6, guSize = 0.22, guSpeed = 0.6, guMerge = 1.2, guRim = 0.35;
  let guBodies = [];
  const guPos = new Float32Array(SD_MAX * 4);
  function installGoo(L) {
    L.goo = L.goo || [];
    const n = Math.max(1, Math.min(SD_MAX, Math.round(guCount))), salt = layerSalt(L) + 0x6007;
    while (L.goo.length < n) L.goo.push(makeSolid(L.goo.length, salt, guSize));
    guBodies = L.goo;
  }
  function gooSeed(dt) {
    SOLID_BOX[0] = SOLID_BOX[1] * (fw / fh);
    const n = Math.max(1, Math.min(SD_MAX, Math.round(guCount)));
    while (guBodies.length < n) guBodies.push(makeSolid(guBodies.length, 0x6007, guSize));
    const step = Math.min(0.05, dt) * guSpeed;
    for (let i = 0; i < n; i++) {
      const S = guBodies[i];
      solidStep(S, step, guSize);
      guPos[i * 4] = S.P[0]; guPos[i * 4 + 1] = S.P[1]; guPos[i * 4 + 2] = S.P[2]; guPos[i * 4 + 3] = guSize;
    }
    return { pos: guPos, count: n, rim: guRim, k: guMerge * guSize, zoom };
  }
  function gooMap(s, x, y, z) {
    let d = 1e9;
    const k = s.k;
    for (let i = 0; i < s.count; i++) {
      const b = Math.hypot(x - s.pos[i * 4], y - s.pos[i * 4 + 1], z - s.pos[i * 4 + 2]) - s.pos[i * 4 + 3];
      const h = Math.max(k - Math.abs(d - b), 0) / Math.max(k, 1e-4);
      d = Math.min(d, b) - h * h * k * 0.25;
    }
    return d;
  }

  // ---- CPU mirror of FS_SOLIDS ---------------------------------------------
  // Same scene, same marcher, fewer steps: this only runs on the Canvas2D fallback (no
  // WebGL2 at all), where every other shader effect is likewise a full per-pixel JS loop.
  // A raymarch is the most expensive of them by some way, so the step count is halved and
  // the hit epsilon loosened — softer edges, same solids in the same places.
  const SD_CPU_STEPS = 32, SD_CPU_EPS = 0.006;
  // Rotate v into body space: v' = conj(q) · v · q, via the standard
  // v + 2u×(u×v + w·v) with u = −q.xyz. Writes the scratch triple (no allocation per sample).
  let sdQX = 0, sdQY = 0, sdQZ = 0;
  function sdBody(qx, qy, qz, qw, vx, vy, vz) {
    const ux = -qx, uy = -qy, uz = -qz;
    let tx = uy * vz - uz * vy + qw * vx;     // u×v + w·v
    let ty = uz * vx - ux * vz + qw * vy;
    let tz = ux * vy - uy * vx + qw * vz;
    sdQX = vx + 2 * (uy * tz - uz * ty);
    sdQY = vy + 2 * (uz * tx - ux * tz);
    sdQZ = vz + 2 * (ux * ty - uy * tx);
  }
  function sdShapeDist(s, x, y, z, r) {
    if (s === 0) return Math.hypot(x, y, z) - r;                                    // sphere
    if (s === 1) {                                                                  // box
      const e = r * 0.55, ax = Math.abs(x) - e, ay = Math.abs(y) - e, az = Math.abs(z) - e;
      const ox = Math.max(ax, 0), oy = Math.max(ay, 0), oz = Math.max(az, 0);
      return Math.hypot(ox, oy, oz) + Math.min(Math.max(ax, ay, az), 0);
    }
    if (s === 2) {                                                                  // torus (the doughnut)
      const q = Math.hypot(x, z) - r * 0.70;
      return Math.hypot(q, y) - r * 0.30;
    }
    if (s === 3) {                                                                  // capsule
      const hy = y - Math.max(-r * 0.60, Math.min(r * 0.60, y));
      return Math.hypot(x, hy, z) - r * 0.40;
    }
    if (s === 4) return (Math.abs(x) + Math.abs(y) + Math.abs(z) - r) * 0.5773;      // octahedron
    const dx = Math.hypot(x, z) - r * 0.60, dy = Math.abs(y) - r * 0.60;             // cylinder
    return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  }
  function sdMap(s, x, y, z) {
    let d = 1e9;
    for (let i = 0; i < s.count; i++) {
      sdBody(s.quat[i * 4], s.quat[i * 4 + 1], s.quat[i * 4 + 2], s.quat[i * 4 + 3],
             x - s.pos[i * 4], y - s.pos[i * 4 + 1], z - s.pos[i * 4 + 2]);
      const dd = sdShapeDist(s.shape[i] | 0, sdQX, sdQY, sdQZ, s.pos[i * 4 + 3]);
      if (dd < d) d = dd;
    }
    return d;
  }
  // `map` lets Metaball goo reuse this marcher with its smooth union (gooMap).
  function solids(s, map) {
    if (!map) map = sdMap;
    const asp = fw / fh, ro = -3.2, foc = 1.4;
    // Light direction, normalised once — the same vector FS_SOLIDS hardcodes.
    const lx = -0.4557, ly = 0.7295, lz = -0.5104;
    let idx = 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      camPix(x, y);
      const ux = (camPX / fw - 0.5) * asp / s.zoom, uy = (camPY / fh - 0.5) / s.zoom;
      const rl = Math.hypot(ux, uy, foc), rx = ux / rl, ry = uy / rl, rz = foc / rl;
      let t = 0, heat = 0;
      for (let i = 0; i < SD_CPU_STEPS; i++) {
        const px = rx * t, py = ry * t, pz = ro + rz * t;
        const d = map(s, px, py, pz);
        if (d < SD_CPU_EPS) {
          const e = 0.0015;                                   // central-difference normal
          const nx = map(s, px + e, py, pz) - map(s, px - e, py, pz);
          const ny = map(s, px, py + e, pz) - map(s, px, py - e, pz);
          const nz = map(s, px, py, pz + e) - map(s, px, py, pz - e);
          const nl = Math.hypot(nx, ny, nz) || 1;
          const dif = Math.max(0, (nx * lx + ny * ly + nz * lz) / nl);
          const fac = Math.max(0, 1 + (nx * rx + ny * ry + nz * rz) / nl);   // 1 − n·(−rd)
          heat = (0.18 + 0.72 * dif + s.rim * fac * fac * Math.sqrt(fac))    // fac^2.5 = rim light
               * Math.max(0, Math.min(1, (7 - t) / 5.5));                    // depth fade
          break;
        }
        t += d;
        if (t > 7) break;
      }
      fire[idx++] = Math.max(0, Math.min(1, heat)) * 255;
    }
  }

