  function render() {
    if (heatBoost > 0) {                       // Heat boost: remap the heat index toward the bright end
      const g = 1 / (1 + heatBoost);
      for (let x = 0; x < 256; x++) heatLut[x] = (Math.pow(x / 255, g) * 255 + 0.5) | 0;
      for (let i = 0, len = fire.length; i < len; i++) buf32[i] = palette[heatLut[fire[i]]];
    } else {
      for (let i = 0, len = fire.length; i < len; i++) buf32[i] = palette[fire[i]];   // 0 = identity (byte-for-byte)
    }
    offCtx.putImageData(img, 0, 0);

    // Julia & Plasma zoom inside their own shaders, so only the fire modes
    // scale the rendered image here. Scale about the canvas centre; clear first
    // when zoomed out so no smeared border remains.
    // CPU mirror of the transition pass — same modes, canvas ops instead of a shader.
    if (transActive() && transOff) {
      const t = Math.max(0, Math.min(1, trans.t)), k = 1 - Math.abs(2 * t - 1), m = trans.mode;
      const g = offCtx, W = off.width, H = off.height;
      g.save();
      if (m === 0) {                                   // crossfade
        g.globalAlpha = 1 - t; g.drawImage(transOff, 0, 0);
      } else if (m === 3 || m === 4) {                 // pixelate / blur through
        if (t < 0.5) { g.globalAlpha = 1; g.drawImage(transOff, 0, 0); }
        if (m === 3) {                                  // down- then up-sample
          const bs = Math.max(1, Math.round(1 + 46 * k * k));
          const sw = Math.max(1, Math.round(W / bs)), sh = Math.max(1, Math.round(H / bs));
          if (bs > 1 && !transTmp) transTmp = document.createElement("canvas");
          if (bs > 1) {
            transTmp.width = sw; transTmp.height = sh;
            const tg = transTmp.getContext("2d");
            tg.imageSmoothingEnabled = true; tg.drawImage(off, 0, 0, sw, sh);
            g.imageSmoothingEnabled = false; g.clearRect(0, 0, W, H);
            g.drawImage(transTmp, 0, 0, sw, sh, 0, 0, W, H);
            g.imageSmoothingEnabled = true;
          }
        } else if (k > 0.02) { g.filter = "blur(" + (7 * k * k).toFixed(1) + "px)"; g.drawImage(off, 0, 0); g.filter = "none"; }
      } else if (m === 10) {                           // slide: a push, so translate both frames
        const dx = Math.round(W * t);
        g.clearRect(0, 0, W, H);
        g.drawImage(off, W - dx, 0);                   // the incoming scene, entering from the right
        g.drawImage(transOff, -dx, 0);                 // the outgoing one, leaving to the left
      } else if (m === 5 || m === 6 || (m >= 7 && m <= 11)) {
        // Every reveal mode is the same two steps: paint a WHITE MASK of the parts that have
        // already changed (destination-in keeps the new scene only there), then put the old
        // frame back underneath. wipe/iris were always this; the staggered family just draws
        // a different mask. Modes 12/13 (dissolve, ripple) are per-pixel and fall through to
        // the crossfade below — mirroring them with canvas ops would cost more than the
        // Canvas2D fallback is worth, and a crossfade is a truthful stand-in for both.
        g.globalCompositeOperation = "destination-in";
        g.fillStyle = "#fff";
        if (m === 5) g.fillRect(0, 0, W * Math.min(1, t * 1.28), H);
        else if (m === 6) { g.beginPath(); g.arc(W / 2, H / 2, Math.hypot(W, H) * t * 0.72, 0, Math.PI * 2); g.fill(); }
        else if (m === 7) {                            // checkerboard
          const cx = 14, cy = 9, cw = W / cx, ch = H / cy;
          for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
            const d = ((i + j) % 2) * 0.34;
            if (t * 1.5 >= d + 0.25) g.fillRect(i * cw, j * ch, cw + 1, ch + 1);
          }
        } else if (m === 8) {                          // bars, alternate ones rising
          const n = 15, bw = W / n, h = Math.min(1, t * 1.24) * H;
          for (let i = 0; i < n; i++)
            g.fillRect(i * bw, i % 2 ? 0 : H - h, bw + 1, h);
        } else if (m === 9) {                          // shutter, slats opening from their centres
          const n = 11, sh = H / n, o2 = Math.min(1, t * 1.36) * sh / 2;
          for (let i = 0; i < n; i++) g.fillRect(0, (i + 0.5) * sh - o2, W, o2 * 2);
        } else {                                       // clock wipe
          g.beginPath(); g.moveTo(W / 2, H / 2);
          g.arc(W / 2, H / 2, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, t * 1.08));
          g.closePath(); g.fill();
        }
        g.globalCompositeOperation = "destination-over";
        g.drawImage(transOff, 0, 0);
      } else if (m === 12 || m === 13) {               // dissolve / ripple ⇒ crossfade on CPU
        g.globalAlpha = 1 - t; g.drawImage(transOff, 0, 0);
      } else {                                         // dip / flash: hold the old half, then veil
        g.globalAlpha = 1;
        if (t < 0.5) g.drawImage(transOff, 0, 0);
        g.globalCompositeOperation = m === 2 ? "lighter" : "source-atop";
        g.globalAlpha = m === 2 ? k * k : k;
        g.fillStyle = m === 2 ? "#fff" : "#000";
        g.fillRect(0, 0, W, H);
      }
      g.restore();
    }
    const z = stackZoom();
    ctx.save();
    if (z !== 1) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(z, z);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
    }
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);

    // subtle glow: an additive, blurred copy blooms the brightest pixels —
    // which are the white-hot triangle points — into a soft halo.
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = bloomAmt;
    ctx.filter = "blur(4px)";
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  let last = 0, acc = 0, paused = false;
  const framesEl = document.getElementById("frames");
  let frameCount = 0, fps = 0;
  const fpsWin = [];                          // timestamps of recently rendered frames
  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    let dt = (now - last) / 1000;
    last = now;

    // When paused we still re-present the last GPU frame (WebGL clears the
    // drawing buffer after compositing, so a skipped frame would flash black);
    // the Canvas2D path retains its pixels, so it just freezes.
    // The Orbit editor is a TOOL, not part of the frozen picture: it draws on its own canvas
    // and has to answer a click while the scene is paused. cardDrawPaused spends one draw and
    // only when something actually changed (cardDirty) — without it, switching path mode or
    // drawing a freehand loop with the canvas paused left the editor showing the old orbit,
    // which reads as every button in it being broken.
    if (paused) { if (useGL && glReady) glRender(); cardDrawPaused(); return; }

    if (useGL && !glReady) return;    // context lost / not yet restored

    if (dt > 0.25) dt = 0.25;         // clamp after tab switches
    acc += dt;

    cyclePresets(now);                // auto-switch presets on the Preset TTL timer
    // Beats are detected off-thread of the render loop (audioTick, every HOP_MS);
    // here we only consume the latch and refresh the audio UI at frame rate.
    // audioLive(), not audio.on: while muted the meter and chips are already zeroed and
    // audioTick refills nothing, so refreshing them every frame would only redraw the same
    // empty bars — and there is no latch left to clear.
    if (audioLive()) { updateMeter(); flashChips(); }
    beatBpmTick();
    if (THUMB && THUMB.beat) thumbBeat();   // a thumbnail render's synthetic beat, latched
    updateAnims(now, dt);             // drive the ranged sliders' erratic values
    // ...and the OUTGOING scene, if one is still blending out. After the live pass: each
    // fresh drift segment draws twice from Math.random, so this order leaves the live
    // scene's sequence exactly as it was.
    if (prevStack) updateAnims(now, dt, prevStack);
    if (audioLive()) clearBeats();
    if (dbg.on) dbgDraw();

    postTime += dt;                         // clock for the self-animating post/screen passes
    if (creditLeft > 0) creditLeft -= dt;   // credits run on rendered time (see startCredits)
    // The scene title queues BEHIND the credits and shares their canvas: holding its
    // countdown here is the whole mechanism, so a scene applied during the opening credits
    // (the first visit applies one) starts its title the moment they finish rather than
    // being drawn over or silently expiring underneath them.
    else if (titleLeft > 0) titleLeft -= dt;
    // UNCONDITIONAL, not inside the branch above. Two ways that bit: the tick that takes
    // titleLeft to 0 must still run to hide the banner, and startup arms a scene title
    // BEFORE startCredits() sets the credit clock — so a tick that only runs while the title
    // is counting would show the banner over the credits and never get a chance to correct
    // itself. Cheap: a class check, and one opacity write only while it is up.
    sceneBannerTick();
    transStep(dt);                          // ...and so does the preset transition

    // WHICH LAYER THE RENDER FOLLOWS. `activeIds`, the palette globals and `zoom` are the
    // SELECTED layer's live store (the "DOM is the store for the selected item" rule), but
    // selecting a layer is an EDITING action and must never change the picture. With 3 of 4
    // layers muted, selecting one of the muted ones used to render the visible layer through
    // the selected layer's filter set — a Tetrafyer losing `fire` shows no flame at all, which
    // reads as "the layer reverted to defaults" — and through its palette and its zoom.
    // So resolve all three from the DRAWING layer: the bottom-most LIVE item, which is
    // selection-independent by construction. When they are the same item (every single-layer
    // scene, and any scene where you are editing the visible layer) nothing changes at all.
    const live = stack.filter(L => !L.mute);
    const ptItems = live.filter(L => !EFFECTS[L.fx].draw);
    const shItems = live.filter(L => EFFECTS[L.fx].draw);
    const renderL = live[0] || stack[stackSel];
    // Only the paths that colour through the ONE global palette need the override: the
    // multi-layer GL path already resolves palette AND filters per layer (renderStackColor).
    const onePal = !useGL || live.length <= 1;
    const renderOther = onePal && renderL !== stack[stackSel];
    renderFilters = renderOther ? layerFilterSet(renderL) : null;
    // The bypass set of the layer being drawn, alongside its filter set and for the same
    // reason: filterOn() (and so hasFeedback(), and so whether the heat buffer clears) must
    // answer for THAT layer, not for whichever one is selected in the panel. Unlike
    // renderFilters this is set even when the drawing layer IS the selected one — fxBypassed
    // falls back to the selected layer anyway, so the two agree either way.
    renderFxOff = renderL ? fxOffOf(renderL) : null;
    const retain = hasFeedback();     // ...so this reads the DRAWING layer's feedback filters
    // Install the drawing layer BEFORE the morph/palette work below: banding (band/bandsize/
    // banddim) and the palette cycle (palcycle/palhold) are per-layer keys now, and morphStep /
    // composePalette read them out of the globals. This is also why morphStep moved down here
    // from above cyclePresets — it must see this frame's values for the layer being drawn, not
    // last frame's for whichever layer happens to be selected.
    installStackItem(renderL);
    if (morphing || morphOnce) morphStep(now);   // auto-morph, or a one-shot preset-switch morph

    // Palette: normally the selected layer's morphing ramp (composePalette's own defaults, so
    // this stays byte-identical whenever the drawing layer IS the selected one) — and banding
    // strength is set by its ranged slider each frame, so when not morphing (which already
    // rebakes) refresh the ramp while it is live, letting the stripes appear/shimmer/vanish as
    // the value wanders. Otherwise colour through the DRAWING layer's palette, advanced on its
    // own clock by stepLayerPal — the same per-layer machinery renderStackColor uses.
    if (renderOther) {
      const slot = stack.indexOf(renderL);
      composePalette(now, stepLayerPal(slot, layerPalIndex(renderL), now, renderL), layerPalRev(renderL), layerPalBg(renderL));
      bandLive = bandLevel > 0.001;
    } else if (!morphing && (bandLevel > 0.001 || bandLive)) {
      composePalette(now);
      bandLive = bandLevel > 0.001;
    }
    if (useGL) uploadPalette();       // push the (possibly morphed) palette

    // The sim accumulator is drained EVERY frame, not only in the fire branch —
    // otherwise a shader effect silently banks time and bursts the full 4 catch-up
    // ticks the moment you switch back to (or enable) fire. setEffect zeroes it too.
    // Keep the repeated-subtraction form, not `acc -= ticks*step`: 1/60 and 1/120
    // aren't exact binary fractions, and the two round differently enough to gain
    // or lose a tick over a few seconds — which shifts the fire's phase.
    const step = 1 / cfg.burn;
    let ticks = 0;
    while (acc >= step && ticks < 4) { acc -= step; ticks++; }
    // DROP THE UNDRAINABLE DEBT. dt is clamped to 0.25s and added unconditionally, but at most
    // four ticks ever come back out -- so whenever dt*cfg.burn > 4 (a 30fps frame at the Fire
    // filter's shipped burn of 165 banks 5.5) the accumulator grows without bound. Once it has
    // banked a few seconds the loop stays pinned at 4 ticks long AFTER the frame rate recovers,
    // and the fire runs at its catch-up rate indefinitely: "the flames are permanently too fast
    // after the tab was busy". Only setEffect ever cleared it.
    if (acc > step * 4) acc = step * 4;
    // The Canvas2D fallback renders ONE item: every CPU mirror writes every cell with a
    // plain assignment, so a second mirror would simply erase the first, and each extra
    // mirror is a full per-pixel JS loop — an N× multiplier on the dominant cost of the
    // frame, on exactly the machines that have no GPU.
    // THE OUTGOING SCENE, rendered for real into glTex.prev, before the live one. It has to
    // come first: it borrows the same colour accumulator, and by the time the live pass
    // wants it the outgoing frame has already been copied out. It tramples the render
    // globals (camera, zoom, filter params) exactly as any layer's turn does, and every
    // branch below re-installs before it draws, so nothing downstream notices.
    if (useGL && prevStack && transActive()) renderPrevScene(dt, now, ticks);
    if (!useGL) {
      const L = live[0] || stack[0];
      installStackItem(L);
      const fx = EFFECTS[L.fx];
      if (fx.draw) {
        // The mirror writes every cell unconditionally, so with retention on we hand it
        // the *other* buffer (a pointer swap, not a per-frame memcpy) and MAX-merge after.
        if (retain) {
          for (let i = 0; i < ticks; i++) heatFeedbackTick();
          const keep = fireKeep; fireKeep = fire; fire = keep;
        }
        fx.draw(dt);
        if (retain)
          for (let i = 0; i < fire.length; i++) if (fireKeep[i] > fire[i]) fire[i] = fireKeep[i];
      } else {
        for (let i = 0; i < ticks; i++) simulate(now);
      }
    } else if (live.length > 1) {
      // MULTI-LAYER: colour each layer with its OWN palette and blend in OKLab, so a
      // stack of effects keeps its distinct colours instead of sharing one palette.
      renderStackColor(live, dt, now, ticks);
    } else {
      glColorTex = null;               // one live layer ⇒ the classic single-palette path
      // Filter params are per-layer keys now, applied by installStackItem rather than in
      // updateAnims — but the feedback filters below (beginHeatTick / heatFeedbackTick)
      // read cfg.decay, fadeKeep, echoDist, … BEFORE any per-item install runs. So apply
      // the sole live layer's values up front. Same values updateAnims used to apply
      // directly, so a one-layer scene stays byte-identical.
      if (live[0]) installStackItem(live[0]);
      // POINT items own the tick loop, because propagation and stamping must interleave:
      // propagate, stamp, propagate, stamp. Hoisting the propagation out to once per
      // frame would visibly change every point effect whenever ticks > 1 — which is the
      // normal case at the shipped burn rate.
      if (ptItems.length) {
        for (let t = 0; t < ticks; t++) {
          beginHeatTick();                       // one propagation per tick, shared
          for (const L of ptItems) {
            installStackItem(L);
            installPhase(L);                     // this item's own drift/spin clocks
            glPtCount = 0;                       // a fresh point list per item...
            stampTick(L, now);
            capturePhase(L);
            // a stampAdd effect (Fractal flames) accumulates density whatever the layer blend
            glBlitPoints(EFFECTS[L.fx].stampAdd ? "add" : L.blend, L.gain);   // ...so each blits with its own blend/gain
          }
          curHeat = pendingDst;                  // close the tick once, after every item
        }
      } else if (retain) {
        for (let i = 0; i < ticks; i++) heatFeedbackTick();
      } else {
        // Nothing advanced or cleared the buffer this frame, and the shader items below
        // now composite INTO it rather than overwriting it — so without this they would
        // MAX against last frame's image and the scene would never fade.
        glClearHeatCurrent();
      }
      // SHADER items draw once per frame, each into the scratch buffer, then composite.
      for (const L of shItems) {
        installStackItem(L);
        installPhase(L);
        EFFECTS[L.fx].draw(dt);                  // *Seed(dt) advances this item's clocks
        capturePhase(L);
        glMergeLayer(L.blend, L.gain);
      }
    }
    // Epilogue install, part 1 — THE RENDER. glRender/render() read these globals (notably
    // `zoom`, via stackZoom) outside any item's turn, so install the DRAWING layer rather
    // than whatever the last item in the loop happened to set. Using the selected item here
    // is what let picking a muted layer re-zoom and re-filter the visible scene; renderL is
    // the same object whenever you are editing the visible layer, so nothing changes then.
    installStackItem(renderL);
    installPhase(renderL);
    if (useGL) glRender();
    else render();
    renderFilters = null;              // back to activeIds for every UI caller of filterOn
    renderFxOff = null;                // ...and back to the SELECTED layer's bypass set
    // Epilogue install, part 2 — THE EDITOR OVERLAYS. cardDraw must track the layer you are
    // EDITING, which is the original reason this epilogue exists: without it the Orbit editor
    // silently follows whichever item drew last.
    installStackItem(stack[stackSel]);
    installPhase(stack[stackSel]);
    // juliaPower is set ONLY by Multibrot's draw, so a multi-layer scene leaves the LAST
    // Multibrot layer's power in this global — but the Orbit editor / cardLocus track the
    // SELECTED layer. Re-derive it for that layer, same reason the two installs above run
    // (installStackItem has just set mbPower to the selected layer's animated Power); gated
    // on the editor being open so it never perturbs the render path otherwise. Julia /
    // Burning Ship are d=2.
    if (card && card.on) juliaPower = EFFECTS[stack[stackSel].fx].id === "multibrot" ? mbPower : 2;
    creditDraw();                      // above the finished image — effects and filters both
    if (card && card.on) cardDraw();   // Cardioid debug view follows the live seed

    // Count only rendered frames (paused frames returned early above). FPS is a
    // sliding average over the last 3s: frames span (n-1) intervals across the
    // window, so fps = (n-1) / windowSeconds.
    frameCount++;
    fpsWin.push(now);
    while (fpsWin.length && now - fpsWin[0] > 3000) fpsWin.shift();
    if (fpsWin.length > 1) fps = (fpsWin.length - 1) * 1000 / (now - fpsWin[0]);
    framesEl.textContent = frameCount + " · " + Math.round(fps) + " fps";
  }
  requestAnimationFrame(frame);

