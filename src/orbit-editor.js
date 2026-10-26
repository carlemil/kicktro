  // ---- Orbit editor ----------------------------------------------------------
  // Julia, Burning Ship and Multibrot all take their seed c from a point tracing
  // a base curve over the Mandelbrot set (see juliaSeedAt), with a riding circle on top.
  // This popup both *shows* that orbit over the c-plane locus — the base curve, the path
  // the seed really traces (base + riding circle at the current ratio), the riding circle
  // and the live seed — and lets you *choose* the base curve: cardioid, circle, or a
  // freehand loop drawn on the canvas (which snaps to a closed spline the seed follows).
  // Descriptor-gated on `cardioid: true`.
  //
  // The chosen shape is scene data (per-effect extras — saved, shared, in presets). The
  // view samples juliaSeedAt() rather than juliaSeed(), so opening it never advances (or
  // perturbs) the animation.
  const CARD_X0 = -2.35, CARD_X1 = 0.95;      // the slice of the c-plane we draw
  // `var`, not `const`: setEffect() runs during startup, before this line is
  // evaluated, and calls cardOpen() — a const would still be in its temporal dead
  // zone and throw (same reason the old range editor's state was a `var`).
  var card = { on: false, cv: null, ctx: null, bg: null, bgPow: 0 };
  // "The editor needs a repaint." frame() draws it once per rendered frame, but a PAUSED
  // scene returns from frame() before it gets there — so with the canvas paused, switching
  // Cardioid/Circle/Freehand, editing, undoing or clearing all changed the state and left the
  // picture frozen, which reads as the whole editor being dead. Every interaction sets this,
  // and the paused branch of frame() spends exactly one draw on it. `var` for the same TDZ
  // reason as `card` itself.
  var cardDirty = false;
  function cardTouch() { cardDirty = true; }
  // The paused-frame entry point. It repeats the render epilogue's install (the editor draws
  // the SELECTED layer's orbit, and nothing else has installed it on a paused frame) and then
  // draws once. Cheap: the locus backdrop is cached, so this is the overlay only.
  function cardDrawPaused() {
    if (!card || !card.on || !cardDirty) return;
    installStackItem(stack[stackSel]);
    installPhase(stack[stackSel]);
    juliaPower = EFFECTS[stack[stackSel].fx].id === "multibrot" ? mbPower : 2;
    cardDraw();
  }
  var cardWanted = false;                      // the user's intent to have the Orbit editor open (see setEffect); var for the same TDZ reason as `card`
  var seedDrawing = null;                     // the in-progress freehand stroke (base-plane pts)
  var seedEdit = false;                        // freehand sub-mode: false = draw, true = drag points
  var seedDragIdx = -1;                        // control point being dragged (edit mode), -1 = none
  var seedHover = -1;                          // control point under the cursor (edit mode)
  var seedHistory = [];                        // undo stack of seedPts snapshots (transient, per session)
  // The backdrop is the connectedness locus the seed is *actually* riding — the
  // Mandelbrot set at power 2, the degree-d Multibrot otherwise. Drawing the
  // Mandelbrot under a Multibrot orbit made the view lie: the seed looked safely
  // outside the set while really sitting deep inside the locus that governs it.
  //
  // BURNING SHIP IS A THIRD FAMILY, not a power of the first. It folds Re·Im to its absolute
  // value every step, so its locus is its own set: measured against the Mandelbrot set it
  // differs over ~6.8% of the scanned plane, reaches to x=+0.98 rather than +0.43, and — the
  // part that breaks every assumption below — is NOT symmetric about the real axis
  // (y ∈ [−1.53, +0.45]). On the shipped seed path at outrad 1.4, 17 of 72 sampled points are
  // inside one set and outside the other, which is exactly the "the view lies" failure above.
  // `locusShip()` picks the family off the SELECTED layer's effect descriptor (`locus: "ship"`).
  //
  // This is NOT the "Burning Ship rides the wrong cardioid deliberately" rule: that one is
  // about the seed PATH, which still rides the Mandelbrot main cardioid on purpose. Drawing
  // the right locus underneath it is what makes that choice legible instead of misleading.
  const locusShip = () => {
    const L = stack[stackSel], e = L && EFFECTS[L.fx];
    return !!(e && e.locus === "ship");
  };
  // The one escape test, shared by the framing scan and the render — two copies of this is how
  // the window ends up framing a different set from the one it draws.
  function locusEsc(cx, cy, d, ship, maxIter) {
    let zx = 0, zy = 0, zx2 = 0, zy2 = 0, i = 0, mag2 = 0;
    const sq = d === 2;
    for (; i < maxIter && mag2 <= 4; i++) {
      if (ship) {
        // (|Re z| + i|Im z|)^2 + c — the same recurrence FS_BURNING and burningShip() run,
        // started from z = 0. zx uses the PREVIOUS step's squares, exactly as they do.
        zy = 2 * Math.abs(zx * zy) + cy;
        zx = zx2 - zy2 + cx;
        zx2 = zx * zx; zy2 = zy * zy;
        mag2 = zx2 + zy2;
      } else if (sq) {
        const t = zx * zx - zy * zy + cx; zy = 2 * zx * zy + cy; zx = t;
        mag2 = zx * zx + zy * zy;
      } else {
        const r = Math.pow(Math.sqrt(mag2), d), a = Math.atan2(zy, zx) * d;
        zx = r * Math.cos(a) + cx; zy = r * Math.sin(a) + cy;
        mag2 = zx * zx + zy * zy;
      }
    }
    return { i, inside: mag2 <= 4 };
  }
  //
  // Power drifts continuously, so this is quantised to CARD_POW_Q and cached in an offscreen
  // canvas. A repaint every frame at 120 iterations is far too slow for an overlay; the
  // resolution it is cached AT now depends on the power (see cardDraw) — full at d=2, half
  // where each pixel costs a pow/atan2 and the Power slider re-renders it as it drifts.
  const CARD_POW_Q = CONFIG.tuning.cardPowQ;   // = the Power slider's own step
  const cardPowQ = () => Math.round(juliaPower / CARD_POW_Q) * CARD_POW_Q;
  // Auto-frame the c-plane view per power: a cheap low-res scan finds the inside (black)
  // region's bounding box, then we centre the view on it and size it to fit — so the locus
  // blob is centred for every power/form instead of one fixed Mandelbrot-tuned window (the
  // set's centre drifts from ≈−0.5 at power 2 toward 0 at higher powers, and it grows).
  // The view is centred on the locus in BOTH axes. It used to track x only, on the grounds
  // that the locus is symmetric about the real axis — true of every Multibrot, false of
  // Burning Ship (y ∈ [−1.53, +0.45]), which would have sat visibly low in the frame with
  // half the view empty above it. `yc` is 0 for a symmetric locus, so the Multibrot framing
  // is unchanged to the last bit.
  // Cached per quantised power + canvas aspect + which family (all change rarely).
  const CARD_SCAN = { x0: -2.4, x1: 2.4, y0: -2.0, y1: 2.0 };   // generous, aspect-independent scan region
  let cardWin = { q: NaN, aspect: NaN, ship: false, x0: CARD_X0, x1: CARD_X1, yc: 0 };
  function cardWindow(d, aspect, ship) {
    if (cardWin.q === d && cardWin.aspect === aspect && cardWin.ship === ship) return cardWin;
    const W = 80, sx = CARD_SCAN.x1 - CARD_SCAN.x0, sy = CARD_SCAN.y1 - CARD_SCAN.y0;
    const H = Math.max(1, Math.round(W * sy / sx));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, any = false;
    for (let py = 0; py < H; py++) {
      const cy = CARD_SCAN.y0 + (py / H) * sy;
      for (let px = 0; px < W; px++) {
        const cx = CARD_SCAN.x0 + (px / W) * sx;
        if (!locusEsc(cx, cy, d, ship, 60).inside) continue;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        any = true;
      }
    }
    let x0, x1, yc = 0;
    if (!any) { x0 = CARD_X0; x1 = CARD_X1; }
    else {
      const xc = (minX + maxX) / 2;
      yc = (minY + maxY) / 2;
      // Snap to the axis. A y-symmetric locus lands a hair off zero (the scan grid does not
      // sample ±y at exactly matching rows), and 1e-16 of drift is not a decision — snapping
      // is what keeps the Multibrot framing EXACTLY what it always was rather than
      // almost-what-it-was.
      if (Math.abs(yc) < 1e-9) yc = 0;
      // Half-height measured about that centre, not (maxY−minY)/2: for a symmetric locus this
      // is max(|minY|, maxY) — the same `maxAY` this line used before — so the symmetric case
      // is bit-identical, while an off-axis locus gets the room its FAR side needs.
      const halfY = Math.max(maxY - yc, yc - minY);
      // half-width must contain the locus in x AND (spanY = spanX/aspect) in y; the 1.45 floor
      // keeps the seed path visible for small loci, then a small margin so it isn't edge-to-edge.
      const half = Math.max((maxX - minX) / 2, halfY * aspect, 1.45) * 1.15;
      x0 = xc - half; x1 = xc + half;
    }
    cardWin = { q: d, aspect, ship, x0, x1, yc };
    return cardWin;
  }
  // Vertical extent of a view. The single place the y mapping is defined, so cardLocus, the
  // overlay's Y() and cardEventToC cannot drift apart — they each used to spell out
  // `-spanY / 2` by hand, which silently assumed the locus was centred on the real axis.
  const cardSpanY = (win, w, h) => (win.x1 - win.x0) * (h / w);
  const cardY0 = (win, w, h) => (win.yc || 0) - cardSpanY(win, w, h) / 2;
  function cardLocus(w, h, d, win, ship) {
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const img = new ImageData(w, h), px32 = img.data;
    const spanX = win.x1 - win.x0, spanY = cardSpanY(win, w, h), y0 = cardY0(win, w, h);
    for (let py = 0; py < h; py++) {
      const cy = y0 + (py / h) * spanY;
      for (let px = 0; px < w; px++) {
        const cx = win.x0 + (px / w) * spanX;
        // Iterate the critical point z=0 — bounded ⇔ c is in the locus.
        const e = locusEsc(cx, cy, d, ship, 120);
        const o = (py * w + px) * 4;
        // inside = near-black, outside = a cool grey ramp, so the amber overlay pops
        const v = e.inside ? 10 : 24 + Math.round(Math.sqrt(e.i / 120) * 120);
        px32[o] = v * 0.78; px32[o + 1] = v * 0.85; px32[o + 2] = v; px32[o + 3] = 255;
      }
    }
    cv.getContext("2d").putImageData(img, 0, 0);
    return cv;
  }
  function cardDraw() {
    if (!card || !card.on || !card.ctx) return;
    cardDirty = false;                        // whoever asked for this repaint has had it
    const w = card.cv.width, h = card.cv.height, ctx = card.ctx, aspect = w / h;
    const pq = cardPowQ();
    const ship = locusShip();                 // Burning Ship draws its OWN locus, not z^d + c
    const win = cardWindow(pq, aspect, ship); // centre + size the view on the locus for this power
    // Backdrop resolution is set by what a pixel COSTS, not by one blanket halving. At d=2 the
    // inner loop is three multiplies (`sq`, the integer-2 fast path), so full resolution is
    // affordable and the locus edge is actually sharp — which is the whole point of drawing it.
    // Every other power goes through pow/atan2/cos/sin per iteration, ~10x dearer, AND the
    // Power slider re-renders on each CARD_POW_Q (0.05) step as it drifts, so a 2→8 sweep is
    // ~120 repaints: that path stays halved. Julia and Burning Ship are both d=2.
    const ss = pq === 2 ? 1 : 2;
    // `bgShip` is part of the key, not an afterthought: two layers can be open on the same
    // power (Julia and Burning Ship are both d=2), so without it selecting one would
    // keep showing the other's set.
    if (!card.bg || card.bgPow !== pq || card.bgAspect !== aspect || card.bgShip !== ship) {
      card.bg = cardLocus(Math.ceil(w / ss), Math.ceil(h / ss), pq, win, ship);
      card.bgPow = pq; card.bgAspect = aspect; card.bgShip = ship;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(card.bg, 0, 0, w, h);       // full-res at d=2, half-res (scaled up) otherwise
    const spanX = win.x1 - win.x0, spanY = cardSpanY(win, w, h), cy0 = cardY0(win, w, h);
    const X = cx => (cx - win.x0) / spanX * w;               // complex → canvas
    const Y = cy => (cy - cy0) / spanY * h;
    // the bare base path (the outer loop, before the riding circle) — cardioid, circle or the
    // freehand spline, whichever this effect's seedPathMode selects (via juliaSeedAt). Only ONE
    // shape is ever drawn, the selected one; freehand with nothing drawn shows no curve at all.
    const fhEmpty = seedPathMode === "freehand" && !seedSpline;
    if (!fhEmpty) {
      ctx.lineWidth = 1.25; ctx.strokeStyle = "#ff7a1a"; ctx.beginPath();
      for (let i = 0; i <= 360; i++) {
        const p = juliaSeedAt(juliaOuter + (i / 360) * Math.PI * 2, 0);
        i ? ctx.lineTo(X(p.bx), Y(p.by)) : ctx.moveTo(X(p.bx), Y(p.by));
      }
      ctx.stroke();
    }
    // freehand control points (the snap targets) — bigger and ringed in edit mode, with the
    // hovered/dragged one lit white, so you can see and grab them.
    if (seedPathMode === "freehand" && seedPts.length) {
      for (let i = 0; i < seedPts.length; i++) {
        const px = X(seedPts[i][0] + juliaOffX), py = Y(seedPts[i][1]);
        const hot = i === seedDragIdx || (seedDragIdx < 0 && i === seedHover);
        ctx.beginPath(); ctx.arc(px, py, seedEdit ? (hot ? 6 : 4.5) : 2, 0, Math.PI * 2);
        ctx.fillStyle = hot ? "#fff" : "rgba(255,207,135,0.9)"; ctx.fill();
        if (seedEdit) { ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,140,40,0.85)"; ctx.stroke(); }
      }
    }
    // the in-progress stroke while drawing
    if (seedDrawing && seedDrawing.length) {
      ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.beginPath();
      seedDrawing.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])));
      ctx.stroke();
    }
    const now = juliaSeedAt(juliaOuter, juliaInner);
    if (seedRideOn && juliaInnerR > 1e-6 && !fhEmpty) {
      // The riding circle keeps the seed within `inner r` of the base path at all times, so
      // the seed's reachable region is a tube of that radius around it. Draw the tube's inner
      // and outer bounds — the base path offset by ±inner-r along its local normal — rather
      // than the epicycle spiral, which animates and is hard to read while you draw/tune.
      const steps = 360, dth = Math.PI * 2 / steps, d = juliaInnerR;
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(90,209,255,0.75)";
      for (const side of [1, -1]) {
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const th = juliaOuter + i * dth;
          const a = juliaSeedAt(th + dth * 0.5, 0), b = juliaSeedAt(th - dth * 0.5, 0), p = juliaSeedAt(th, 0);
          let tx = a.bx - b.bx, ty = a.by - b.by; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
          const ox = p.bx + side * d * ty, oy = p.by - side * d * tx;   // normal = (ty, −tx)
          i ? ctx.lineTo(X(ox), Y(oy)) : ctx.moveTo(X(ox), Y(oy));
        }
        ctx.stroke();
      }
      // the riding circle where it is right now
      const rpx = juliaInnerR / spanX * w;
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(125,220,138,0.9)";
      ctx.beginPath(); ctx.arc(X(now.bx), Y(now.by), Math.max(1, rpx), 0, Math.PI * 2); ctx.stroke();
    }
    // the live seed c — a big white dot with a dark halo so it stays legible over any base
    ctx.beginPath(); ctx.arc(X(now.cx), Y(now.cy), 6, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.stroke();
    const mode = seedPathMode[0].toUpperCase() + seedPathMode.slice(1);
    el("cardNums").textContent =
      mode + (seedRideOn ? "" : " · bare") +
      " · c = " + now.cx.toFixed(4) + (now.cy < 0 ? " − " : " + ") + Math.abs(now.cy).toFixed(4) + "i" +
      " · outer ×" + juliaOuterR.toFixed(2) +
      (seedRideOn ? " · inner r " + juliaInnerR.toFixed(3) + " · ratio " + juliaRatio.toFixed(2) : "") +
      " · " + juliaBigRpm.toFixed(2) + " rpm" +
      (juliaPower === 2 ? "" : " · power " + juliaPower.toFixed(2));
  }
  // Reflect the live seed-path state onto the editor controls. Called by loadExtra (so a
  // scene/layer switch updates the buttons) and on open; safe before the DOM exists.
  function syncOrbitUI() {
    const ride = el("cardRide"); if (!ride) return;
    cardTouch();                              // mode / edit / history changed ⇒ repaint even if paused
    ride.checked = seedRideOn;
    document.querySelectorAll("#carddlg .cardmode[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === seedPathMode));
    const fh = seedPathMode === "freehand";
    setOff(el("cardClear"), !fh);
    const ed = el("cardEdit"); if (ed) { setOff(ed, !fh); ed.classList.toggle("on", fh && seedEdit); }
    setOff(el("cardUndo"), !fh || !seedHistory.length);
    const cv = el("cardcv"); if (cv) { cv.classList.toggle("draw", fh && !seedEdit); cv.classList.toggle("editpts", fh && seedEdit); }
    const hint = el("cardHint");
    if (hint) {
      hint.style.display = fh ? "" : "none";
      hint.textContent = seedEdit
        ? "Edit: drag the control points to reshape the loop. Undo steps back one change at a time."
        : "Draw: drag on the canvas to sketch a loop — it snaps to a smooth closed spline the seed then follows.";
    }
  }
  // Pause / resume the seed orbit. The button toggles between the pause and play glyphs;
  // closing the editor resumes (so the motion never stays frozen once the editor is gone).
  function setOrbitPaused(p) {
    orbitPaused = p;
    const b = el("cardPause"); if (!b) return;
    const t = p ? "Resume the seed motion" : "Pause the seed motion";
    b.textContent = p ? "▶" : "⏸";
    b.title = t; b.setAttribute("aria-label", t);
    b.classList.toggle("on", p);
  }
  function cardOpen(on) {
    if (!card) return;      // startup: setEffect runs before `var card` is initialized
    card.on = on;
    el("carddlg").classList.toggle("hidden", !on);
    if (!on) { setOrbitPaused(false); return; }   // closing resumes the motion
    cardTouch();                                  // opening onto a paused scene must still paint
    if (!card.ctx) { card.cv = el("cardcv"); card.ctx = card.cv.getContext("2d"); }
    syncOrbitUI();
    cardDraw();                    // paint immediately; frame() keeps it live after
  }
  // Credits toggle. Deliberately in its own localStorage key, not the scene blob:
  // it is a per-browser preference, not part of a shared/backed-up scene.
  const creditsChk = el("creditsOn");
  creditsChk.checked = creditsEnabled();
  creditsChk.addEventListener("change", () => {
    try { localStorage.setItem(CREDIT_KEY, creditsChk.checked ? "on" : "off"); } catch (e) {}
  });
  // Scene title ("Show author") — same deal, its own key (see sceneTitleEnabled). The
  // checkbox lives in the Scene box rather than beside this one; el() is location-independent,
  // so wiring it from here needs no change.
  // The author is the banner's own (sceneCredit). With nobody to credit the tick genuinely
  // cannot show anything -- so say that, rather than leaving it looking broken.
  function syncAuthorHint() {
    const h = el("sceneAuthorHint");
    if (!h) return;
    const p = presets[curPreset];
    const who = sceneCredit(p);
    const on = !!el("sceneTitleOn") && el("sceneTitleOn").checked;
    h.textContent = who
      ? (on ? "Credited to " + who.replace(/  ·  /g, ", via ") + "." : "")
      : p && collectionOf(p) === SHARED_COLLECTION
        ? "This scene was shared without an author's name."
        : "No author to show yet \u2014 name your cloud profile, or load someone's collection.";
    h.style.display = h.textContent ? "" : "none";
  }
  const titleChk = el("sceneTitleOn");
  if (titleChk) {
    titleChk.checked = sceneTitleEnabled();
    titleChk.addEventListener("change", () => {
      try { localStorage.setItem(TITLE_KEY, titleChk.checked ? "on" : "off"); } catch (e) {}
      // Show the banner again right now, so the tick demonstrates itself. It is otherwise
      // armed only when a scene is SELECTED, so this used to change nothing you could see
      // until the next time you picked one -- which is most of why it read as doing nothing.
      sceneTitleFor(curPreset);
      syncAuthorHint();
    });
    syncAuthorHint();
  }

  for (let slot = 0; slot < STACK_MAX; slot++) ctlIn(slot, "cardbtn").addEventListener("click", () => {
    if (slot !== stackSel && stack[slot]) selectStack(slot);
    cardWanted = true; cardOpen(true);
  });
  el("card-close").addEventListener("click", () => { cardWanted = false; cardOpen(false); });
  el("cardPause").addEventListener("click", () => setOrbitPaused(!orbitPaused));

  // ---- Orbit editor interaction ----
  // Canvas pixel → c-plane coordinate (accounts for the canvas being CSS-scaled to fit).
  // MUST invert the SAME window cardDraw renders through — the locus-centred `cardWin`
  // (set by cardWindow every frame the editor is open), NOT the fixed CARD_X0/CARD_X1.
  // Using the fixed bounds offsets (and rescales) the stroke by exactly the amount
  // cardWindow shifts to centre the locus, so the drawn line lands away from the mouse.
  function cardEventToC(e) {
    const cv = card.cv || el("cardcv"), r = cv.getBoundingClientRect();
    const w = cv.width, h = cv.height;
    const win = cardWin || { x0: CARD_X0, x1: CARD_X1, yc: 0 };
    const spanX = win.x1 - win.x0, spanY = cardSpanY(win, w, h);
    const px = (e.clientX - r.left) * (w / r.width), py = (e.clientY - r.top) * (h / r.height);
    return [win.x0 + (px / w) * spanX, cardY0(win, w, h) + (py / h) * spanY];
  }
  // c-units per the current view width — so grab radius / point spacing stay a constant
  // on-screen size as cardWindow zooms per power (fixed CARD span would drift with it).
  const cardSpanX = () => cardWin ? cardWin.x1 - cardWin.x0 : CARD_X1 - CARD_X0;
  // Commit a seed-path edit: mirror the live globals into the selected effect's extras and
  // fold it into the scene, exactly like a slider — the seed-path is per-effect scene data.
  function commitSeedPath() { cardTouch(); captureSeed(stack[stackSel]); saveExtra(effect); persist(); autosavePreset(); }
  // Resample a raw stroke to N evenly (arc-length) spaced control points, so the spline snaps
  // to a clean loop regardless of how fast the pointer moved. buildSeedSpline then closes it.
  function resampleClosed(stroke) {
    const seg = [];
    let total = 0;
    for (let i = 1; i < stroke.length; i++) { const d = Math.hypot(stroke[i][0] - stroke[i - 1][0], stroke[i][1] - stroke[i - 1][1]); seg.push(d); total += d; }
    if (total < 1e-6) return [];
    const N = Math.max(6, Math.min(48, Math.round(total / (cardSpanX() * 0.03))));
    const step = total / N, out = [];
    for (let k = 0; k < N; k++) {
      const target = k * step;
      let cum = 0, idx = 1;
      for (; idx < stroke.length; idx++) { if (cum + seg[idx - 1] >= target) break; cum += seg[idx - 1]; }
      if (idx >= stroke.length) idx = stroke.length - 1;
      const t = (target - cum) / (seg[idx - 1] || 1), a = stroke[idx - 1], b = stroke[idx];
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return out;
  }
  // Snapshot the current control points onto the undo stack, BEFORE a mutation. Undo pops
  // one snapshot at a time. Transient per session; cleared on scene/layer switch (loadExtra).
  function pushSeedHistory() {
    seedHistory.push(seedPts.map(p => p.slice()));
    if (seedHistory.length > 50) seedHistory.shift();
    syncOrbitUI();
  }
  document.querySelectorAll("#carddlg .cardmode[data-mode]").forEach(b =>
    b.addEventListener("click", () => { seedPathMode = seedModeOk(b.dataset.mode); seedHover = -1; syncOrbitUI(); commitSeedPath(); }));
  el("cardRide").addEventListener("change", () => { seedRideOn = el("cardRide").checked; commitSeedPath(); });
  el("cardEdit").addEventListener("click", () => { seedEdit = !seedEdit; seedHover = -1; syncOrbitUI(); });
  el("cardUndo").addEventListener("click", () => {
    if (!seedHistory.length) return;
    seedPts = seedHistory.pop();
    seedSpline = buildSeedSpline(seedPts);
    commitSeedPath(); syncOrbitUI();
  });
  el("cardClear").addEventListener("click", () => {
    if (!seedPts.length && !seedSpline) return;
    pushSeedHistory(); seedPts = []; seedSpline = null; seedDrawing = null; commitSeedPath();
  });
  // Freehand canvas interaction. DRAW mode: drag to sketch a loop (points thinned by a min
  // spacing, resampled + fitted to a closed spline on release). EDIT mode: drag an existing
  // control point to reshape the loop live. Points are stored in BASE coords (offX subtracted)
  // so they land exactly where you put them regardless of the X-offset slider.
  {
    const cv = el("cardcv");
    const HIT = () => cardSpanX() * 0.028;      // grab radius in c-units (~12px)
    const nearestPt = c => {
      let bi = -1, bd = HIT();
      for (let i = 0; i < seedPts.length; i++) {
        const d = Math.hypot(c[0] - (seedPts[i][0] + juliaOffX), c[1] - seedPts[i][1]);
        if (d < bd) { bd = d; bi = i; }
      }
      return bi;
    };
    cv.addEventListener("pointerdown", e => {
      if (seedPathMode !== "freehand") return;
      // Left button only: a right-click used to start a stroke AND suppress the context menu.
      if (e.button !== 0) return;
      e.preventDefault();
      // try/catch like the app's other two capture sites -- a synthetic probe event carries no
      // live pointer and setPointerCapture throws, which used to abort this handler BEFORE
      // seedDrawing was set and silently swallow the whole gesture.
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      cardTouch();
      if (seedEdit) {
        const idx = nearestPt(cardEventToC(e));
        if (idx >= 0) { pushSeedHistory(); seedDragIdx = idx; }
      } else {
        seedDrawing = [cardEventToC(e)];
      }
    });
    cv.addEventListener("pointermove", e => {
      const c = cardEventToC(e);
      // Drawing and dragging are LIVE — the stroke has to follow the pointer while the scene
      // is paused, which is exactly when you would sit down to draw one carefully.
      if (seedDragIdx >= 0 || seedDrawing || seedEdit) cardTouch();
      if (seedDragIdx >= 0) {
        // New array (not in-place) so the per-layer spline cache invalidates; capture into
        // the layer each move so the render loop's installSeedPath can't clobber the drag.
        seedPts = seedPts.map((p, i) => i === seedDragIdx ? [c[0] - juliaOffX, c[1]] : p);
        seedSpline = buildSeedSpline(seedPts);           // live reshape
        captureSeed(stack[stackSel]);
      } else if (seedDrawing) {
        const last = seedDrawing[seedDrawing.length - 1];
        if (Math.hypot(c[0] - last[0], c[1] - last[1]) > cardSpanX() * 0.006) seedDrawing.push(c);
      } else if (seedEdit) {
        seedHover = nearestPt(c);                        // hover highlight
      }
    });
    const finish = () => {
      if (seedDragIdx >= 0) { seedDragIdx = -1; commitSeedPath(); return; }   // history pushed on grab
      if (!seedDrawing) return;
      const stroke = seedDrawing; seedDrawing = null;
      if (stroke.length >= 4) {
        pushSeedHistory();
        seedPts = resampleClosed(stroke).map(p => [p[0] - juliaOffX, p[1]]);
        seedSpline = buildSeedSpline(seedPts);
        commitSeedPath();
      }
    };
    cv.addEventListener("pointerup", finish);
    cv.addEventListener("pointercancel", () => { seedDrawing = null; seedDragIdx = -1; });
  }
  // No backdrop click-to-close: it's a floating panel, not a modal — clicking it
  // (or anything behind it) must keep working while the view stays up.

