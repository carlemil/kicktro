  // ---- stack item lifecycle --------------------------------------------------
  // Freezing copies the DOM (and the singleton chip/pulse/plen maps, and the live
  // animation phase) into the item's own record; thawing does the reverse and NULLS the
  // record, so exactly one of "selected" / "holds numbers" is true for an item. Any path
  // that reads a frozen record without freezing first silently loses the user's last
  // edit — the failure class the chipEdited() history in CLAUDE.md documents.
  function freezeItem(L) {
    const st = states[L.fx] || {};
    L.state = {}; L.beat = {}; L.pulse = {}; L.plen = {}; L.btune = {};
    for (const id in st) {
      if (SCENE_FILTER_KEYS.includes(id)) continue;   // scene-filter values are global, not per-layer
      L.state[id] = Array.isArray(st[id])
        ? [+ctl(id + "-lo").value, +ctl(id + "-hi").value]
        : +ctl(id).value;
    }
    for (const id in beatReact) L.beat[id] = Object.assign({}, beatReact[id]);
    for (const id in pulseShape) L.pulse[id] = pulseShape[id];
    for (const id in pulseLen) L.plen[id] = pulseLen[id];
    // Deep-copied: the arrays are handed to the detector every tick, so a shared reference
    // would let one layer's ↺ retune another's triggers.
    for (const id in beatTune) { const t = btuneOk(beatTune[id]); if (t) L.btune[id] = t; }
    L.anim = {};
    for (const id in animPhase) L.anim[id] = Object.assign({}, animPhase[id]);
    capturePhase(L);
    captureLayerExtras(L);            // this layer's palette + filters, from the live globals
    L.ranges = collectLayerRanges();  // this layer's custom slider bounds (applied by setEffect on select)
  }
  function thawItem(L) {
    if (L.state) states[L.fx] = mergeState(L.fx, L.state);
    if (L.beat) beatStates[L.fx] = mergeBeat(L.fx, L.beat);
    if (L.pulse) pulseStates[L.fx] = mergePulse(L.fx, L.pulse);
    if (L.plen) plenStates[L.fx] = mergePlen(L.fx, L.plen);
    if (L.btune) btuneStates[L.fx] = mergeBtune(L.btune);
    // The selected item's phase records ARE the singletons from here on.
    for (const id in L.anim) if (animPhase[id]) Object.assign(animPhase[id], L.anim[id]);
    installPhase(L);
    L.state = L.beat = L.pulse = L.plen = L.btune = null;
    L.anim = {};
  }
  // The ORDER here is load-bearing and any other one loses the user's last edit in silence:
  // freezeItem reads the OUTGOING block, so it must run while the maps still point at it;
  // pointMaps then installs the incoming block, so the loadState inside setEffect writes
  // there. freeze -> stackSel -> pointMaps -> everything else.
  // Paint a NON-selected block from its layer's frozen record. The selected block is skipped
  // because it IS the store — overwriting it would throw away whatever is being edited.
  //
  // It sets values and calls that slider's own ui() DIRECTLY; it must never dispatch `input`.
  // A dispatch would reach the delegated onEdit, which persists and autosaves the live scene,
  // so painting three blocks would write the scene three times per selection for no reason.
  function paintBlock(slot, L, force) {
    if (!L || slot === stackSel || !W[slot]) return;
    if (!force && blockUnseen(slot)) { markBlockStale(slot); return; }   // painted when it is next seen
    if (blockStale) blockStale.delete(slot);
    // Bounds BEFORE values: paint a value into a slider still carrying the shipped bounds and
    // the browser silently clamps it, and the next freezeItem writes the clamped number back.
    applyLayerRangesTo(slot, L.ranges);
    const st = L.state || {};
    for (const id in W[slot]) {
      // A SHARED key belongs to the whole scene, and its node is a SINGLETON: W[0] carries
      // the seven scene keys (wireRange registers them and ctlIn falls through to
      // getElementById), so painting a non-selected block from its own frozen record used to
      // retune the entire picture's Burn/Bloom/Barrel/Scanlines/Vignette/Grain — an editing
      // action changing the render, which is the one thing selection must never do.
      if (SHARED_FILTER_KEYS.has(id)) continue;
      // singlePair here as well as in mergeState: this is the one site that writes slider
      // values WITHOUT dispatching `input`, so wireRange's mirror listener never runs.
      const w = W[slot][id], v = singlePair(id, st[id]);
      if (Array.isArray(v)) { w.lo.value = String(v[0]); w.hi.value = String(v[1]); }
      else if (v !== undefined && v !== null) { w.lo.value = String(v); w.hi.value = String(v); }
      w.ui();
      // The beat wiring: which bands arm it, the fall curve, how long the fall takes.
      const b = L.beat && L.beat[id];
      if (w.chips) for (const k in w.chips) w.chips[k].classList.toggle("on", !!(b && b[k]));
      if (w.dots) for (const k in w.dots) w.dots[k].classList.toggle("armed", !!(b && b[k]));
      if (w.psel) w.psel.value = (L.pulse && L.pulse[id]) || PULSE_DEFAULT;
      if (w.plen) {
        const p = (L.plen && L.plen[id]) != null ? L.plen[id] : PULSE_DROP;
        w.plen.inp.value = String(p);
        w.plen.out.textContent = plenFmt(+p);
      }
    }
    // The non-slider per-layer controls.
    const lv = st.layers;
    if (ctlIn(slot, "layers") && lv != null) {
      ctlIn(slot, "layers").value = String(lv);
      ctlIn(slot, "vLayers").textContent = Math.max(1, Math.min(LAYER_MAX, (lv | 0) || 1));
    }
    const px = presetExtra(L.fx);
    if (ctlIn(slot, "palrev")) ctlIn(slot, "palrev").checked = !!(L.paletteRev != null ? L.paletteRev : px.paletteRev);
    if (ctlIn(slot, "palbg")) ctlIn(slot, "palbg").value = bgOk(L.paletteBg != null ? L.paletteBg : px.paletteBg);
    if (ctlIn(slot, "showbox")) ctlIn(slot, "showbox").checked = !!(L.showBox != null ? L.showBox : px.showBox);
    if (ctlIn(slot, "world")) ctlIn(slot, "world").checked = !!(L.world != null ? L.world : px.world);
    if (ctlIn(slot, "cardbtn")) ctlIn(slot, "cardbtn").style.display = EFFECTS[L.fx].cardioid ? "" : "none";
    // This layer's filter chain — membership, order and the stage divider.
    const own = new Set(filtersOk(L.filters) || presetFilters(L.fx));
    FILTERS.forEach(f => { const cb = ctlIn(slot, "flt-" + f.id); if (cb) cb.checked = own.has(f.id); });
    renderFilterListsFor(slot);
    refreshBlockVisibility(slot, true);   // ...against ITS effect and ITS filters
  }
  // A CLOSED LAYER'S BLOCK IS NOT PAINTED. Its controls are on screen only while its layer box
  // is open (refreshBreakout shows the box and, through it, any slider popped out of it), yet a
  // scene switch painted all four blocks and ran their visibility passes: up to 20 ms of a
  // 16-49 ms freeze in applyPreset, for nothing anybody could see. Such a block is only MARKED;
  // flushBlock paints it from its frozen record when it can next be seen (refreshBreakout, for
  // every open slot) or used (selectStack, before it becomes the store). Slot 0 is never
  // deferred: its visibility pass also shows and hides the SCENE controls, which live outside
  // every block.
  var blockStale, openSet;              // var: refreshBlockVisibility runs from an earlier slice
  function blockUnseen(slot) { return !!openSet && slot !== 0 && slot !== stackSel && !openSet.has(slot); }
  function markBlockStale(slot) { (blockStale || (blockStale = new Set())).add(slot); }
  function flushBlock(slot) {
    if (!blockStale || !blockStale.has(slot)) return;
    blockStale.delete(slot);
    if (stack[slot] && slot !== stackSel) paintBlock(slot, stack[slot], true);
    else refreshBlockVisibility(slot, true);
    // Its pulse plots were drawn from whatever the block held before: draw them as they show.
    for (const id in W[slot] || {}) if (W[slot][id].pplot) W[slot][id].pplotStale = true;
  }
  function flushOpenBlocks() { if (blockStale && openSet) for (const s of openSet) flushBlock(s); }
  // A reorder, an add, a remove and a scene load all change WHICH LAYER a slot holds, so
  // every block has to be repainted. Missing one is silent: the records are still right, so
  // the render is still right and only the panel lies.
  function repaintAllBlocks() { stack.forEach((L, s) => paintBlock(s, L)); }
  function selectStack(j) {
    if (j === stackSel || !stack[j]) return;
    flushBlock(j);                   // a closed layer's block, painted while it is still not the store
    const prev = stackSel;
    freezeItem(stack[stackSel]);
    stackSel = j;
    trigDirty = true;                // the triggers are keyed by slot, and the slots just moved
    pointMaps(j);
    thawItem(stack[j]);
    stageLayerExtras(stack[j]);      // live palette/filters = this layer's, before setEffect's persist
    setEffect(stack[j].fx, false, false);   // reloads the maps for editing; enter=false ⇒ no reseed, the layer keeps running
    applyLayerExtras(stack[j]);      // ...and the full palette + filter UI/morph
    restoreLayerUi(stack[j]);
    paintBlock(prev, stack[prev]);   // the block that just lost selection, from its frozen record
    syncStackUI();
  }
  function addStackItem(fx) {
    if (stack.length >= STACK_MAX) return;
    freezeItem(stack[stackSel]);
    const L = newStackItem(fx === undefined ? effect : fx);
    applyEffectBlend(L);              // the effect's shipped blend (Glass ball: over)
    // A concrete tint from birth, so it survives every later reorder and delete. It takes a
    // colour no live layer is using -- including one freed by a layer that has been removed,
    // which is why this asks the CURRENT stack rather than counting layers ever created.
    // Same first-free rule for the salt: unique among the LIVE layers, so a salt released by
    // a deleted layer comes back into circulation rather than being burned for the session.
    L.salt = freeSalt(stack, L);
    // A fresh item is seeded from its effect's shipped defaults, not from the item that
    // happened to be selected — mergeState against its OWN effect, or every key that
    // effect declares would be dropped.
    L.state = mergeState(L.fx, presetState(L.fx));
    L.beat = mergeBeat(L.fx, presetBeat(L.fx));
    L.pulse = mergePulse(L.fx, presetPulse(L.fx));
    L.plen = mergePlen(L.fx, presetPlen(L.fx));
    L.btune = {};                            // a fresh layer inherits every threshold
    // CONCRETE FROM BIRTH, for the same reason installStack resolves it: a null here would follow
    // extras[L.fx] at render time and re-tint whenever another same-effect layer was edited.
    // The DESCRIPTOR default, not the runtime extras -- a new layer opens on its effect's shipped
    // look. (There used to be a second, earlier block resolving these from `extras[L.fx] ||
    // presetExtra(L.fx)`, which these three lines then silently overwrote three statements later.
    // Two answers to one question; this is the one that was actually winning.)
    { const px = presetExtra(L.fx);
      L.palette = px.palette == null ? null : String(px.palette);
      L.paletteRev = !!px.paletteRev;
      L.paletteBg = bgOk(px.paletteBg); }
    { const px = presetExtra(L.fx); L.seedPath = px.seedPath; L.seedRide = px.seedRide; L.seedPts = px.seedPts; }
    L.filters = presetFilters(L.fx);
    stack.push(L);
    stackSel = stack.length - 1;
    pointMaps(stackSel);
    thawItem(L);
    stageLayerExtras(L);
    setEffect(L.fx, false);
    applyLayerExtras(L);
    restoreLayerUi(L, null);         // a fresh layer has no pop-out boxes ⇒ clean editing surface
    repaintAllBlocks();
    syncStackUI();
  }
  function removeStackItem(j) {
    if (stack.length <= 1 || !stack[j]) return;
    stack.splice(j, 1);
    dropOpen(j);                     // the fold state follows the surviving layers, not the slots
    dropSlotState(j);                // ...and so do the survivors' retained heat and palette clocks
    dropPopped(j);                   // ...and so do the open pop-out boxes
    if (stackSel >= stack.length) stackSel = stack.length - 1;
    else if (j < stackSel) stackSel--;
    pointMaps(stackSel);
    thawItem(stack[stackSel]);
    stageLayerExtras(stack[stackSel]);
    setEffect(stack[stackSel].fx, false, false);   // re-selecting a surviving layer ⇒ no reseed
    applyLayerExtras(stack[stackSel]);   // the newly-selected layer's palette + filters
    restoreLayerUi(stack[stackSel]);
    repaintAllBlocks();              // the splice moved every later layer down a slot
    syncStackUI();
  }
  // ---- the layer list ----
  // One row per stack item: reorder, name, mute, blend, gain, remove. Blend/gain/mute
  // are deliberately NOT CONTROLS entries — that registry is per-key singletons and
  // these are per item — so they are plain DOM whose change bubbles to the delegated
  // onEdit for persist + autosave, the same route the palette <select> takes. They are
  // also deliberately not animatable or beat-armable.
  // The selected layer's controls (#lyrctl — effect sliders, filters, palette) live INSIDE
  // that layer's row, so a layer reads as one complete unit: header, then what it draws,
  // then what filters it, then how it is coloured. There is only ever one copy of those
  // controls (the DOM is the store for the selected layer), so the block is MOVED rather
  // than rebuilt, exactly like the ☰ menubar adopting #sysbox.
  //
  // Which layers are UNFOLDED, by slot index. A Set of open slots rather than a single
  // "is the open one folded" flag, because any number of layers can be open at once now.
  // It starts EMPTY — every layer loads folded and you unfold the ones you want to work
  // on; they stay unfolded as you move between them, since selecting is no longer what
  // opens a layer. An open-set rather than a folded-set so the default needs no seeding
  // and adding a layer can't accidentally open it. Transient and per-session, like the
  // panel's own box folds — deliberately not persisted and not part of a scene, and
  // deliberately not a field on the stack item, which would risk reaching stackItemOut.
  const openSlots = new Set();
  openSet = openSlots;                 // blockUnseen's handle, safe to read from any slice
  // Keep the open set pointing at the same ITEMS when the array is spliced.
  function dropOpen(j) {                       // ...after removeStackItem's splice(j, 1)
    const o = [...openSlots];
    openSlots.clear();
    for (const s of o) { if (s !== j) openSlots.add(s > j ? s - 1 : s); }
  }
  function moveOpen(from, to) {                // ...mirroring splice(to, 0, splice(from, 1)[0])
    const o = [...openSlots];
    openSlots.clear();
    for (const s of o) {
      // IN PLACE, not appended at the end. The set's ORDER is the order boxes were opened,
      // and dragging a row in the layer list is not opening anything -- appending the moved
      // one would tell everything downstream it was the most recently opened box.
      if (s === from) { openSlots.add(to); continue; }
      let n = s > from ? s - 1 : s;
      if (n >= to) n++;
      openSlots.add(n);
    }
  }
  // There is no parkLayerCtl any more, and its absence is the point. syncStackUI used to
  // wipe #stacklist on every call, so the one control block had to be rescued to #fxbox first
  // or it was DELETED from the document along with the rows. Nothing is wiped now, so there
  // is nothing to rescue — and the hazard it guarded cannot recur, because both the rows and
  // the blocks outlive every call. Each block belongs to its own row permanently; this only
  // has to install it the first time.
  // The block no longer lives in its row: it lives in a BOX IN THE GRID, like a popped
  // slider, so a layer's whole settings panel can be dragged anywhere on screen and snapped.
  // The wrapper is a `.ctl` with `data-slot`, which is all the break-out engine needs --
  // selection on press (the capture-phase handler on #breakout), the owner line as a drag
  // handle, layout and snap -- so the engine does not know it is holding a layer. Built
  // once per slot, permanent, like the rows.
  const lyrBoxes = [];
  function adoptLayerCtl(slot, row) {
    const block = blocks[slot];
    if (!block) return;
    let box = lyrBoxes[slot];
    if (!box) {
      box = document.createElement("div");
      box.className = "ctl poppable lyr-box";
      box.dataset.slot = String(slot);
      box.dataset.brk = slot + "/layer";           // the grid key, same shape as a slider's
      const t = document.createElement("div");
      t.className = "ctl-owner";
      const ownTxt = document.createElement("span");
      ownTxt.className = "own-txt";
      t.appendChild(ownTxt);
      // The same close/dock button a slider box carries, closing the layer from the box end.
      const close = document.createElement("button");
      close.type = "button"; close.className = "ctl-pop";
      close.textContent = "−";
      close.title = "Close this layer's settings";
      close.setAttribute("aria-label", close.title);
      close.addEventListener("click", e => { e.stopPropagation(); openSlots.delete(slot); syncStackUI(); });
      t.appendChild(close);
      box.appendChild(t);
      box.appendChild(block);
      makeBoxGrab(box, ownTxt);
      breakout.appendChild(box);
      lyrBoxes[slot] = box;
    }
    // The owner line names the layer and its effect; re-stamped every paint because both
    // change under a reorder or an effect switch.
    const L = stack[slot];
    box.querySelector(".own-txt").textContent = "L" + (slot + 1) + (L ? " · " + EFFECTS[L.fx].name : "");
  }
  // The rows are a FIXED POOL of STACK_MAX, keyed by slot, built exactly once and never
  // destroyed — `lyrRows[slot] = {row, …}` holding each row's own widgets. syncStackUI
  // used to wipe #stacklist and rebuild every row on every call (a selection, a mute, a
  // gain drag, a blend pick), which is why parkLayerCtl had to rescue the control block
  // first. Rebuilding is no longer survivable at all: once each row owns its layer's
  // controls, a wipe deletes them from the document, and — sooner — it destroys the very
  // node the user has a pointer down on, killing any drag that started inside a row.
  //
  // Keyed by SLOT, not by item identity: installStack replaces the whole array with fresh
  // objects on every scene load, i.e. every auto-cycle tick, so an identity key would
  // rebuild every row every few seconds. The cost of a slot key is that a reorder changes
  // which item a row shows, so syncStackUI must repaint all of them — which it does.
  //
  // Every handler closes over `slot` and reads stack[slot] LIVE. Closing over the item
  // would strand each row on whatever occupied its slot when the pool was built.
  const lyrRows = [];
  function buildStackRows() {
    const host = el("stacklist");
    if (!host || lyrRows.length) return;
    for (let slot = 0; slot < STACK_MAX; slot++) {
      const row = document.createElement("div");
      row.className = "lyr";
      row.title = "Click to edit this layer";
      const j = slot;
      // Selecting is what every slider in the box below follows, so pressing ANYWHERE in the
      // row selects it — including on the mute dot, the gain slider, the blend dropdown and
      // the effect chooser. Those all stopPropagation on `click` (so their own action doesn't
      // double-fire), which is why this listens for `pointerdown` in the CAPTURE phase: it
      // runs before any child handler can stop it, and before the control acts, so a gain drag
      // or a blend pick applies to a layer that is already selected rather than selecting
      // afterwards off a stale index.
      //
      // The grab handle is excluded HERE only: dragging is not selecting, and the handle
      // still selects on pointerUP (see its onUp). It used to be excluded for a mechanical
      // reason too — syncStackUI rebuilt every row, so selecting mid-drag detached the
      // handle holding the pointer capture and Chromium drops capture on reparent. The row
      // pool means nothing is rebuilt any more, so only the taste reason is left.
      row.addEventListener("pointerdown", e => {
        if (!e.target.closest(".lyr-grab")) selectStack(j);
      }, true);
      // ...and the same on FOCUS, which covers what a pointer cannot: tab into another
      // layer's slider and press an arrow key and `input` fires with no pointerdown at all.
      // The value would land on a node that is not in `anims`, so nothing would render, the
      // edit would persist against the wrong layer, and the next paintBlock would quietly
      // revert it — a slider that "won't stick". Also what makes the panel work with
      // assistive tech, where every edit arrives this way.
      row.addEventListener("focusin", e => {
        if (!e.target.closest(".lyr-grab")) selectStack(j);
      }, true);
      // Kept as well: a synthetic click (tests, assistive tech) never emits pointerdown, and
      // selectStack early-returns when the row is already selected, so this cannot double-work.
      row.addEventListener("click", () => selectStack(j));

      // Grab handle → drag to reorder. It captures the pointer and live-moves this row
      // among its siblings. The dragged row is NEVER re-parented mid-drag — it only rides
      // the pointer via `transform: translateY` (which doesn't change layout, so the other
      // rows stay put and their midpoints stay valid) while a drop-marker line shows where
      // it will land. Moving the row's DOM node would detach the handle that holds the
      // pointer capture, and Chromium drops capture on reparent — which killed the drag
      // after the first pixel. The actual reorder happens once, on release. Selection is
      // left untouched — you drag to reorder, click the row body to select.
      //
      // `from` is the row's SLOT, and a row's slot never changes — the pool is slot-keyed
      // and a reorder moves the items under it, not the rows. So this is a live index into
      // `stack`, not a snapshot that a rebuild could stale.
      const from = j;
      // THE REORDER COMMIT, shared by the pointer drag and the keyboard. It was inline in the
      // drag's pointerup, which is why reordering was mouse-only: there was no way to reach it
      // without a pointer. Every caller must pass `to` as an index into the array WITH the
      // dragged item already removed -- splice-out then splice-in at `to` directly.
      function reorderStack(from, to) {
        // The SELECTED layer, held by identity. `stackSel` is a slot index, and a reorder moves
        // layers between slots — so unless it is remapped to follow the item, the very next
        // freezeItem(stack[stackSel]) writes the selected layer's live DOM into whichever layer
        // slid into that slot, destroying one layer's settings and leaving two identical.
        // Dragging a layer past the selected one was enough to do it.
        const sel = stack[stackSel];
        freezeItem(sel);         // its live block into its record, while the maps still point there
        stack.splice(to, 0, stack.splice(from, 1)[0]);
        moveOpen(from, to);      // the fold state belongs to the LAYER, not to the slot
        moveSlotState(from, to);  // ...and so do its retained heat and palette clock
        movePopped(from, to);    // ...and so do its open pop-out boxes
        stackSel = stack.indexOf(sel);
        pointMaps(stackSel);     // the wiring follows it to its new block
        thawItem(sel);
        loadState(sel.fx); loadBeat(sel.fx); loadPulse(sel.fx); loadPlen(sel.fx); loadBtune(sel.fx);   // ...and that block's DOM
        repaintAllBlocks();      // every other slot holds a different layer now
        syncPopOwners();
      }
      // A BUTTON, not a div. Reordering was the one layer operation with no keyboard path at
      // all: mute, delete, blend and tint became buttons earlier, but this stayed a div whose
      // only route in was a pointer drag. As a button it takes a tab stop, and setOff's real
      // `disabled` finally bites here too (it was a no-op on a div, which is why the one-layer
      // case relied on the pointerdown guard alone).
      const grab = document.createElement("button");
      grab.type = "button";
      grab.className = "lyr-grab";
      grab.textContent = "⠿";
      grab.title = "Drag, or focus and use \u2191\u2193, to reorder — layers higher in the list draw first (underneath)";
      grab.setAttribute("aria-label", "Reorder layer: drag, or press up and down arrows");
      grab.addEventListener("click", e => e.stopPropagation());
      // ARROWS MOVE THE LAYER. `from` is a live index into `stack` (see the note above), and
      // `to` is passed the way reorderStack wants it: an index into the array with this item
      // already removed. Moving UP by one is therefore from-1, and moving DOWN by one is
      // from+1 -- which after the removal already means "one place later".
      grab.addEventListener("keydown", e => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (stack.length < 2) return;
        const to = e.key === "ArrowUp" ? from - 1 : from + 1;
        if (to < 0 || to >= stack.length) return;
        e.preventDefault();        // or the panel scrolls under the moving row
        reorderStack(from, to);
        persist(); autosavePreset();
        syncStackUI();
        // The rows are a fixed pool keyed by SLOT, so the button under the finger now belongs
        // to a different layer -- follow the layer to its new row or the next arrow press moves
        // the wrong one.
        const moved = lyrRows[to] && lyrRows[to].grab;
        if (moved) moved.focus();
      });
      grab.addEventListener("pointerdown", e => {
        if (stack.length < 2) return;
        e.preventDefault(); e.stopPropagation();
        grab.setPointerCapture(e.pointerId);
        const startY = e.clientY;
        row.classList.add("dragging");
        const marker = document.createElement("div");
        marker.className = "lyr-drop";
        let to = from;                       // insertion index within the list MINUS the row
        const onMove = ev => {
          row.style.transform = "translateY(" + (ev.clientY - startY) + "px)";
          // Scan only the other rows: their rects are stable (untransformed), whereas the
          // dragged row's rect rides the pointer. `to` = how many of them sit above it.
          // ...and only the rows actually in use: the pool keeps STACK_MAX rows in the DOM
          // and hides the spares, which would otherwise count as drop targets below the list.
          const others = [...host.querySelectorAll(".lyr")].filter(r => r !== row && !r.hidden);
          to = 0;
          for (const r of others) {
            const b = r.getBoundingClientRect();     // DOMRect: .height, NOT .offsetHeight
            if (ev.clientY < b.top + b.height / 2) break;
            to++;
          }
          host.insertBefore(marker, others[to] || null);   // a sibling move; the row stays put
        };
        const onUp = () => {
          grab.releasePointerCapture(e.pointerId);
          grab.removeEventListener("pointermove", onMove);
          grab.removeEventListener("pointerup", onUp);
          grab.removeEventListener("pointercancel", onUp);
          marker.remove();
          row.style.transform = "";
          row.classList.remove("dragging");
          // Using the handle selects that layer too — but ON RELEASE, never on press, so the
          // selection can't run under a pointer that is still down.
          //
          // Held by IDENTITY, not by index: a reorder moves it, so `from` no longer names it.
          const dragged = stack[from];
          const moved = to !== from;
          if (moved) reorderStack(from, to);
          const at = stack.indexOf(dragged);
          if (at >= 0 && at !== stackSel) selectStack(at);   // ...which re-runs syncStackUI
          else syncStackUI();                                // a plain click on the selected row
          if (moved) { persist(); autosavePreset(); }
        };
        grab.addEventListener("pointermove", onMove);
        grab.addEventListener("pointerup", onUp);
        grab.addEventListener("pointercancel", onUp);
      });
      row.appendChild(grab);

      // The effect chooser sits ON the row, not only in the Layer effect & filters box below —
      // re-pointing a layer is the single most common thing you do to one, and it used to
      // mean select the row, scroll down, then use the other chooser. Both drive the same
      // path: changing a row that is NOT selected selects it FIRST, because setEffect edits
      // whatever `stackSel` names, and routing through selectStack is what keeps the
      // freeze/stageLayerExtras ordering honest (writing L.fx directly here would strand the
      // layer's palette + filters on the outgoing effect — the load-order trap in CLAUDE.md).
      // `fx` is still read off the <select> BEFORE either call. The row survives them now,
      // so `nm` is no longer detached by the time they return — but both re-run syncStackUI,
      // which repaints `nm.value` from stack[slot], so reading after would see the new value
      // rather than the pick that caused it.
      const nm = document.createElement("select");
      nm.className = "lyr-name";
      fillEffectSelect(nm, true);           // grouped, like #effect; the value is still the index
      nm.addEventListener("click", e => e.stopPropagation());   // picking ≠ selecting the row
      nm.addEventListener("change", e => {
        e.stopPropagation();
        const fx = +nm.value;
        if (j !== stackSel) selectStack(j);
        setEffect(fx);          // ...which re-runs syncStackUI, so the row redraws itself
        autosavePreset();
        persist();
        nextSwitch = 0;         // a manual pick restarts the auto-cycle clock, as in the box below
      });
      row.appendChild(nm);

      const lyrctl = document.createElement("div");
      lyrctl.className = "lyr-ctl";
      row.appendChild(lyrctl);

      // The tint swatch. INSIDE .lyr-ctl, not a direct child of the row: the row is a
      // 3-column grid where every child is explicitly placed, and appending an unplaced one
      // lets auto-flow take a cell, which narrows the effect chooser and wraps the control
      // rows into column 2 — that is how the panel grew a horizontal scrollbar once before.
      const tint = document.createElement("button");
      tint.type = "button";
      tint.className = "lyr-b lyr-tint";
      tint.addEventListener("click", e => {
        e.stopPropagation();
        const L = stack[j]; if (!L) return;
        // Cycle, like the blend steppers, but SKIP whatever the other layers are already
        // showing: the point of the colour is telling two layers apart, so handing this one
        // its neighbour's colour defeats the feature. Starts from what is showing, so the
        // first click on an auto-coloured layer moves it off its slot colour, not onto it.
        // Falls back to the plain next colour when every one is taken (4 tints, 4 slots).
        // The cycle runs through the fixed colours and then back to AUTO -- null, meaning
        // "whatever this layer's palette says". Without that last step a layer given an
        // explicit colour once could never be handed back to its palette again.
        const taken = new Set(stack.map((o, i) => i === j ? -1 : layerTintIdx(o, i)));
        const cur = tintOk(L.tint);
        if (cur === LYR_TINT.length - 1) { L.tint = null; syncStackUI(); persist(); autosavePreset(); return; }
        const from = cur == null ? -1 : cur;
        let next = (from + 1) % LYR_TINT.length;
        for (let n = 0; n < LYR_TINT.length && taken.has(next); n++) next = (next + 1) % LYR_TINT.length;
        L.tint = next;
        syncStackUI(); persist(); autosavePreset();
      });
      lyrctl.appendChild(tint);

      const mute = document.createElement("button");
      mute.type = "button";
      mute.className = "lyr-b lyr-eye";
      mute.setAttribute("aria-label", "Layer visibility");
      mute.addEventListener("click", e => {
        e.stopPropagation();
        const L = stack[j]; if (!L) return;
        L.mute = !L.mute;
        syncStackUI(); persist(); autosavePreset();
      });
      lyrctl.appendChild(mute);

      const gn = document.createElement("input");
      gn.type = "range"; gn.min = 0; gn.max = 1; gn.step = 0.01;
      gn.title = "Layer strength";
      gn.addEventListener("click", e => e.stopPropagation());
      gn.addEventListener("input", e => { e.stopPropagation(); const L = stack[j]; if (L) L.gain = gainOk(+gn.value); });
      gn.addEventListener("change", () => { persist(); autosavePreset(); });
      lyrctl.appendChild(gn);

      const rm = document.createElement("button");
      rm.type = "button"; rm.className = "lyr-b";
      rm.textContent = "✕"; rm.title = "Remove this layer";
      rm.addEventListener("click", e => {
        e.stopPropagation();
        const L = stack[j]; if (!L) return;
        // The SAME guard removeStackItem applies, checked BEFORE the confirm rather than
        // after it. A scene always keeps one layer, so on a single-layer scene the old order
        // asked "Remove the Plasma layer?", took your OK, and then silently did nothing.
        if (stack.length <= 1) return;
        // Removing a layer throws away its effect, sliders, palette and filter chain in
        // one click (and autosaves over the scene) — same guard as the scene Delete.
        const nm = EFFECTS[L.fx] ? EFFECTS[L.fx].name : "this layer";
        if (!confirm("Remove the " + nm + " layer? Its settings, palette and filters go with it.")) return;
        removeStackItem(j); persist(); autosavePreset();
      });
      lyrctl.appendChild(rm);

      // Blend mode on its own row: a <select> (with the mode's tip as its title) flanked by
      // ▲/▼ steppers that cycle through BLEND_MODES, so you can either pick directly or nudge.
      const blendRow = document.createElement("div");
      blendRow.className = "lyr-blend";
      const blbl = document.createElement("span");
      blbl.className = "lyr-blend-lbl"; blbl.textContent = "Blend";
      blendRow.appendChild(blbl);
      const bcur = () => BLEND_BY_ID[stack[j] && stack[j].blend] || BLEND_MODES[0];
      const sel = document.createElement("select");
      BLEND_MODES.forEach(m => { const o = document.createElement("option"); o.value = m.id; o.textContent = m.label; o.title = m.tip; sel.appendChild(o); });
      sel.addEventListener("click", e => e.stopPropagation());
      sel.addEventListener("change", e => {
        e.stopPropagation();
        const L = stack[j]; if (!L) return;
        L.blend = blendOk(sel.value); syncStackUI(); persist(); autosavePreset();
      });
      blendRow.appendChild(sel);
      const cycleBlend = dir => {
        const L = stack[j]; if (!L) return;
        const i = BLEND_MODES.indexOf(bcur());
        L.blend = BLEND_MODES[(i + dir + BLEND_MODES.length) % BLEND_MODES.length].id;
        syncStackUI(); persist(); autosavePreset();
      };
      const up = document.createElement("button");
      up.type = "button";
      up.className = "lyr-b lyr-arrow"; up.textContent = "▲"; up.title = "Previous blend mode";
      up.addEventListener("click", e => { e.stopPropagation(); cycleBlend(-1); });
      const dn = document.createElement("button");
      dn.type = "button";
      dn.className = "lyr-b lyr-arrow"; dn.textContent = "▼"; dn.title = "Next blend mode";
      dn.addEventListener("click", e => { e.stopPropagation(); cycleBlend(1); });
      blendRow.appendChild(up); blendRow.appendChild(dn);
      row.appendChild(blendRow);

      // EVERY row gets a chevron, not just the open one — the same control opens a collapsed
      // layer and closes the open one, so there is one obvious way to fold and unfold rather
      // than a control that only appears once you are already there.
      //
      // It is the ONLY thing that unfolds: selecting a layer no longer opens it, because any
      // number can be open at once and a click meant to reach one layer's controls should not
      // rearrange the others. Unfolding does still select, so the layer you just opened to
      // look at is the one you are editing.
      // THE SAME +/- A SLIDER ROW CARRIES, on the right, and it does the same thing: opens
      // this layer's settings as a box in the grid. It is the ONLY thing that opens a layer:
      // selecting one does not, because any number can be open at once and a click meant to
      // reach one layer's controls should not rearrange the others. Opening does still
      // select, so the layer you just opened is the one you are editing.
      const chev = document.createElement("button");
      chev.type = "button";
      chev.className = "ctl-pop lyr-pop";
      // stopPropagation on pointerdown, or the row's capture-phase handler would select first
      // and re-run syncStackUI underneath this click.
      chev.addEventListener("pointerdown", e => e.stopPropagation());
      chev.addEventListener("click", e => {
        e.stopPropagation();
        if (!stack[j]) return;
        if (openSlots.has(j)) { openSlots.delete(j); syncStackUI(); }
        else {
          openSlots.add(j); selectStack(j); syncStackUI();   // selectStack no-ops if already selected
          // Same rule as popCtl: a layer box with no fully-on-screen home does not open.
          // The chevron reverts to + (syncStackUI) and the anchor is dropped so the next
          // attempt — after closing something — searches fresh. brkOffscreen hoists across
          // the slices (function declaration in controls-breakout.js).
          const bx = lyrBoxes[j];
          if (bx && bx.style.display !== "none" && brkFree() && brkOffscreen(bx)) {
            openSlots.delete(j);
            brkPos.delete(j + "/layer");
            syncStackUI();
          }
        }
      });
      // A grid child, EXPLICITLY PLACED (last column, row 1 -- see .lyr-pop). Appended without
      // placement it takes the next auto cell and shifts the chooser, the mute row and the
      // blend row each one along, which visibly collapses the row.
      row.appendChild(chev);

      lyrRows[slot] = { row, grab, nm, mute, gn, rm, sel, chev, tint };
      host.appendChild(row);
    }
  }
  // Paint the pool. Creates nothing, moves nothing out, destroys nothing — so a pointer held
  // down inside a row survives every call, and (from M4a) each row can own its layer's
  // controls without them being swept away by a mute or a blend pick.
  function syncStackUI() {
    const host = el("stacklist");
    if (!host) return;
    if (applyingPreset) { syncStackUI.later = true; return; }   // painted once by presetUiCatchUp
    // The single choke point for a STRUCTURAL stack change — add, remove, reorder, mute — and
    // triggers are keyed by slot, so any of those repoints them. Cheaper to invalidate here
    // than to remember it at four call sites.
    trigDirty = true;
    buildStackRows();
    for (let slot = 0; slot < STACK_MAX; slot++) {
      const r = lyrRows[slot], L = stack[slot];
      if (!r) continue;
      if (!L) { r.row.hidden = true; continue; }   // a spare row: kept in the DOM, hidden
      r.row.hidden = false;
      const open = openSlots.has(slot);
      r.row.classList.toggle("sel", slot === stackSel);
      r.row.classList.toggle("muted", !!L.mute);
      r.row.classList.toggle("open", open);
      setOff(r.grab, stack.length < 2);
      r.nm.value = String(L.fx);
      r.nm.title = "This layer's effect — " + EFFECTS[L.fx].subtitle;
      // THE TINT, PUSHED AS A CSS CUSTOM PROPERTY rather than as per-element styles: one
      // write per node and the whole look lives in the stylesheet. It goes on the row and on
      // the layer's own box; syncPopOwners does the popped slider boxes, because it already
      // walks slot x key re-stamping owner text after a reorder and would otherwise be the
      // one place the colour rotted.
      const tintCol = layerTint(L, slot);
      setTintVars(r.row, tintCol);
      if (r.tint) {
        setTintVars(r.tint, tintCol);
        r.tint.title = "This layer's colour — click to change it";
        r.tint.setAttribute("aria-label", r.tint.title);
      }
      setTintVars(lyrBoxes[slot], tintCol);
      r.mute.innerHTML = L.mute ? EYE_SHUT : EYE_OPEN;
      r.mute.title = L.mute ? "Muted — click to show" : "Showing — click to mute";
      r.mute.setAttribute("aria-pressed", L.mute ? "true" : "false");
      r.gn.value = L.gain;
      setOff(r.rm, stack.length <= 1);
      const bm = BLEND_BY_ID[L.blend] || BLEND_MODES[0];
      r.sel.value = bm.id; r.sel.title = bm.tip;
      r.chev.textContent = open ? "−" : "+";   // the same glyph pair a slider row shows
      r.chev.title = open ? "Close this layer's settings" : "Open this layer's settings in the grid";
      r.chev.setAttribute("aria-label", r.chev.title);
      r.chev.setAttribute("aria-expanded", String(open));
      // Each layer's row carries ITS OWN controls, so a row reads as one complete object:
      // header (effect, mute, gain, blend), then what it draws, then what filters it, then how
      // it is coloured. The block lives here permanently.
      adoptLayerCtl(slot, r.row);
    }
    setOff(el("addlayer"), stack.length >= STACK_MAX);
    // The popped slider boxes carry their layer's NUMBER and its COLOUR, both of which go
    // stale whenever a slot changes hands. The drag handler called this itself; adding,
    // removing and loading a scene change the mapping just as much, and syncStackUI is the
    // one function all of them go through.
    syncPopOwners();
    refreshBreakout();                 // the layer boxes show/hide with openSlots
    // The old box is empty now — hide the chrome rather than showing a stray heading over
    // nothing. Kept in the DOM: it is where #lyrctl is authored, and where it sits until the
    // first syncStackUI moves it into a row.
    const fxbox = el("fxbox");
    if (fxbox) fxbox.classList.toggle("hidden", !!blocks[0] && blocks[0].parentNode !== fxbox);
  }

  // Per-effect beat-toggle state, parallel to `states`. beatStates[effect][id] =
  // {low,mid,high}; the live `beatReact` reflects the current effect and drives
  // updateAnims. Switching saves/loads it just like the slider values.
  const beatStates = {};
  function presetBeat(e) {            // a fresh copy of effect e's default chip selection (descriptor `beat`)
    const bt = {};
    for (const id in beatReact) bt[id] = { low: false, mid: false, high: false };
    const bp = EFFECTS[e].beat;
    if (bp) for (const id in bp) if (bt[id]) for (const band of bp[id]) bt[id][band] = true;
    return bt;
  }
  function initBeatStates() { EFFECTS.forEach((_, k) => beatStates[k] = presetBeat(k)); }
  initBeatStates();
  function saveBeat(e) { for (const id in beatReact) beatStates[e][id] = { ...beatReact[id] }; }
  // A missing id must land as all-false, not `{}`: an undefined band would reach
  // classList.toggle below, where "force not supplied" means *flip*, not clear.
  function loadBeat(e) { for (const id in beatReact) beatReact[id] = { low: false, mid: false, high: false, ...beatStates[e][id] }; syncChips(); }
  function syncChips() {
    // !! is load-bearing — see loadBeat. toggle(cls, undefined) toggles.
    for (const id in chipEls) for (const k in chipEls[id]) {
      const on = !!(beatReact[id] && beatReact[id][k]);
      chipEls[id][k].classList.toggle("on", on);
      chipEls[id][k].setAttribute("aria-pressed", on ? "true" : "false");   // armed state, not colour alone
    }
    syncDots();
    syncTrigTune();
  }
  // The per-box TUNING rows (see makeChips): Sensitivity and Refractory per ARMED band, Floor
  // once, the whole block hidden with nothing armed. Each row shows this slider's own value if
  // it has one and the inherited global otherwise, with the "global" tag saying which. A
  // focused field is never overwritten mid-edit.
  //
  // The try/catch is a TDZ guard, not error hiding: syncChips and pointMaps run during startup,
  // one slice before `const beatCfg` initialises — the same split collectionsHeld documents —
  // and in that window there is nothing to show.
  function paintTuneRows(id) {
    const r = refEls[id]; if (!r) return;
    const B = { low: 0, mid: 1, high: 2 };
    const armed = beatReact[id] || {};
    const own = beatTune[id] || {};
    const eff = tuneEff(own);            // the ONE resolver — what the detector will actually use
    let any = false;
    const put = (rowKey, v, fmt, isOwn, show) => {
      const row = r.rows[rowKey]; if (!row) return;
      // Every row of every box runs through here on each scene switch: touch only what changed.
      // The last value written is kept on the node (only this function writes these rows) —
      // even READING style.display on thousands of rows was a measurable share of a switch.
      const disp = show ? "" : "none";
      if (row.__disp !== disp) { row.style.display = disp; row.__disp = disp; }
      if (!show) return;
      const f = r.fields[rowKey];
      if (document.activeElement !== f && f.value !== String(v)) f.value = String(v);
      const txt = fmt(v);
      if (r.vals[rowKey] && r.vals[rowKey].textContent !== txt) r.vals[rowKey].textContent = txt;
      // FOLLOWING THE DEFAULT = DIMMED, overridden = full brightness. A class on the ROW,
      // not the disabled/.off path: this control is entirely live and keyboard-reachable,
      // and setOff() exists to switch a control OFF. Conflating "dimmed" with "disabled"
      // has cost this codebase real bugs (see the note on setOff), so they stay apart.
      row.classList.toggle("is-default", !isOwn);
      // The tooltip still says it in words the first time -- dimming is a reminder, not an
      // explanation.
      if (r.tips[rowKey]) f.title = isOwn ? "" : r.tips[rowKey];
    };
    for (const k in B) {
      const on = !!armed[k]; if (on) any = true;
      const b = B[k];
      put("sen-" + k, eff.fluxK[b], v => (+v).toFixed(1) + "×", Array.isArray(own.fluxK), on);
      put(k, eff.refract[b], v => v + "ms", Array.isArray(own.refract), on);
    }
    put("floor", eff.floor, v => (+v).toFixed(2), typeof own.floor === "number", any);
    // Lead is not per band -- there is one tempo grid, so one anticipation.
    put("lead", eff.lead, v => (+v) ? (+v) + "ms" : "off", typeof own.lead === "number", any);
    // Something armed AND not folded away by hand. The fold is the second condition and
    // it wins: an armed slider you have finished tuning should still be able to give the
    // box back (see trigFolded).
    const show = any && !trigFolded.has(id), disp = show ? "" : "none";
    if (r.wrap.__disp !== disp) { r.wrap.style.display = disp; r.wrap.__disp = disp; }
    // The whole trigger body — Shape, Duration and Tuning — folds as ONE element.
    if (r.body && r.body.__disp !== disp) { r.body.style.display = disp; r.body.__disp = disp; }
  }
  function syncTrigTune() {
    try { for (const id in refEls) paintTuneRows(id); } catch (e) {}
  }
  // A tuning row was moved: fold it into the scene like any other edit. The rows are plain
  // DOM nodes inside #breakout, so the delegated onEdit would fire for them too — but it
  // persists the SLIDER's value, not this map, so the write has to be explicit. Guarded
  // exactly as chipEdited is.
  function tuneEdited() {
    if (persistReady && !applyingPreset) autosavePreset();
    persist();
  }
  // The menu row's dots mirror the armed chips, so the overview survives every path
  // that changes them (loadBeat, Reset, a chip click) without a second sync to forget.
  function syncDots() {
    for (const id in dotEls) for (const k in dotEls[id])
      dotEls[id][k].classList.toggle("armed", !!(beatReact[id] && beatReact[id][k]));
  }

  // Per-effect beat-pulse SHAPE, parallel to beatStates. pulseStates[effect][id] =
  // a PULSE_SHAPES key; the live `pulseShape` reflects the current effect and is
  // read by updateAnims. Seeded to the descriptor's optional `pulse` map, else snap.
  const pulseStates = {};
  function presetPulse(e) {
    const pt = {};
    for (const id in pulseShape) pt[id] = PULSE_DEFAULT;
    const pp = EFFECTS[e].pulse;
    if (pp) for (const id in pp) if (id in pt && PULSE_FN[pp[id]]) pt[id] = pp[id];
    return pt;
  }
  function initPulseStates() { EFFECTS.forEach((_, k) => pulseStates[k] = presetPulse(k)); }
  initPulseStates();
  function savePulse(e) { for (const id in pulseShape) pulseStates[e][id] = pulseShape[id]; }
  function loadPulse(e) { for (const id in pulseShape) pulseShape[id] = PULSE_FN[pulseStates[e][id]] ? pulseStates[e][id] : PULSE_DEFAULT; syncPulse(); }
  function syncPulse() { for (const id in pulseEls) { pulseEls[id].value = pulseShape[id]; drawPulsePlots(id); } }

  // Per-effect beat-pulse LENGTH, exactly parallel to pulseStates above. Seeded to
  // the descriptor's optional `plen` map, else PULSE_DROP (the old hardcoded value).
  const plenStates = {};
  // Against PLEN_HARD_MAX, not PLEN_MAX: the Trigger-duration max row can raise the
  // slider past the shipped bound, and the stored value must survive a reload.
  const plenOk = v => typeof v === "number" && isFinite(v) && v >= PLEN_MIN && v <= PLEN_HARD_MAX;
  function presetPlen(e) {
    const pt = {};
    for (const id in pulseLen) pt[id] = PULSE_DROP;
    const pp = EFFECTS[e].plen;
    if (pp) for (const id in pp) if (id in pt && plenOk(pp[id])) pt[id] = pp[id];
    return pt;
  }
  function initPlenStates() { EFFECTS.forEach((_, k) => plenStates[k] = presetPlen(k)); }
  initPlenStates();
  function savePlen(e) { for (const id in pulseLen) plenStates[e][id] = pulseLen[id]; }
  function loadPlen(e) { for (const id in pulseLen) pulseLen[id] = plenOk(plenStates[e][id]) ? plenStates[e][id] : PULSE_DROP; syncPlen(); }
  function syncPlen() {
    for (const id in plenEls) {
      // Every key on every scene switch: write the field only when the duration moved.
      const e = plenEls[id], v = String(pulseLen[id]);
      if (e.inp.value !== v) e.inp.value = v;
      const txt = plenFmt(pulseLen[id]);
      if (e.out.textContent !== txt) e.out.textContent = txt;
      drawPulsePlots(id);
    }
  }

  // Per-effect DETECTOR TUNING per slider, exactly parallel to plenStates above. Seeded EMPTY
  // — an absent entry, and an absent field within one, both mean "inherit the global Beat
  // tuning". That is what keeps every scene written before this feature rendering identically,
  // and it is why there is no descriptor default to seed from.
  const btuneStates = {};
  const BTUNE_LIMITS = { fluxK: [0.5, 6], floor: [0, 1], refract: [20, 500], lead: [0, 400] };
  const inRange = (v, r) => typeof v === "number" && isFinite(v) && v >= r[0] && v <= r[1];
  const triadOk = (v, r) => Array.isArray(v) && v.length === 3 && v.every(x => inRange(x, r));
  // Validate field by field and DROP anything unrecognised, so a hand-edited or malformed
  // blob degrades to inheritance rather than feeding NaN into the detector's comparisons
  // (where every test would silently go false and the slider would simply stop beating).
  function btuneOk(t) {
    if (!t || typeof t !== "object" || Array.isArray(t)) return null;
    const out = {};
    if (triadOk(t.fluxK, BTUNE_LIMITS.fluxK)) out.fluxK = t.fluxK.slice();
    if (inRange(t.floor, BTUNE_LIMITS.floor)) out.floor = t.floor;
    if (triadOk(t.refract, BTUNE_LIMITS.refract)) out.refract = t.refract.slice();
    // The tempo pair. `lock` is stored only when TRUE: false is the shipped default, and an
    // explicit false in every entry would bloat every scene to say nothing.
    if (inRange(t.lead, BTUNE_LIMITS.lead)) out.lead = t.lead;
    if (t.lock === true) out.lock = true;
    return Object.keys(out).length ? out : null;      // nothing valid ⇒ inherit
  }
  function presetBtune() { return {}; }               // shipped state is "everything inherits"
  function initBtuneStates() { EFFECTS.forEach((_, k) => btuneStates[k] = presetBtune()); }
  initBtuneStates();
  function saveBtune(e) {
    const out = {};
    for (const id in beatTune) { const t = btuneOk(beatTune[id]); if (t) out[id] = t; }
    btuneStates[e] = out;                             // rebuilt, not merged: a cleared ↺ must not linger
  }
  function loadBtune(e) {
    for (const id in beatTune) delete beatTune[id];
    const st = btuneStates[e] || {};
    for (const id in st) { const t = btuneOk(st[id]); if (t) beatTune[id] = t; }
    trigDirty = true;                                 // the detector's armed-trigger list is stale
    syncBtune();
  }
  function syncBtune() { for (const id in tuneEls) paintTuneRows(id); }

  // Per-effect "extras": palette, auto-morph, show-box and Effect TTL are also
  // remembered per effect, so each effect is a fully independent scene.
  const extras = {};
  function presetExtra(e) {
    const x = EFFECTS[e].extras;
    return { palette: x.palette, paletteRev: !!x.paletteRev, paletteBg: bgOk(x.paletteBg), morph: x.morph, showBox: x.showBox, world: x.world === true, randSeed: x.randSeed, filters: presetFilters(e),
      seedPath: seedModeOk(x.seedPath), seedRide: x.seedRide !== false, seedPts: seedPtsOk(x.seedPts) };
  }
  // Freehand control points are free-form scene data (they ride in localStorage, presets,
  // backups and share links), so validate on the way in: finite [x,y] pairs, capped so a
  // pathological blob can't bloat a link. 200 points is far more than a hand-drawn loop.
  function seedPtsOk(a) {
    if (!Array.isArray(a)) return [];
    const out = [];
    for (const p of a) {
      if (Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1])) { out.push([+p[0], +p[1]]); if (out.length >= 200) break; }
    }
    return out;
  }
  // Preset extras are copied verbatim by applyPreset, so a preset saved before
  // filters existed has no `filters` key — default it from the descriptor rather
  // than leaving the scene with no filters at all (which would kill fire and glow).
  function mergeExtra(e, saved) {
    const base = presetExtra(e);
    if (saved) for (const k in base) if (saved[k] !== undefined) base[k] = saved[k];
    // orderFilters, NOT FILTERS.filter: the stored list is the user's drag order and this
    // is the gate every loaded scene passes through, so re-sorting to registry order here
    // would throw the chain away on load and leave the reorder feature working only until
    // you reloaded. It still normalizes by stage and drops unknown/duplicate ids.
    const ok = filtersOk(saved && saved.filters);
    base.filters = ok ? orderFilters(ok).map(f => f.id) : presetFilters(e);
    base.seedPath = seedModeOk(base.seedPath);       // sanitize the seed-path fields a
    base.seedRide = base.seedRide !== false;          // preset/blob may or may not carry
    base.seedPts = seedPtsOk(base.seedPts);
    base.paletteRev = !!base.paletteRev;
    base.paletteBg = bgOk(base.paletteBg);
    return base;
  }
  function initExtras() { EFFECTS.forEach((_, k) => extras[k] = presetExtra(k)); }
  initExtras();
  function saveExtra(e) {
    extras[e] = { palette: paletteSel.value, paletteRev: paletteReverse, paletteBg: paletteBg, morph: palCycleOn(), showBox: showBoxChk.checked, world: worldChk.checked, randSeed: randSeedChk.checked,
      filters: activeFilterIds(),        // the user's drag order, not registry order
      // Seed-path config for the selected effect. Points are rounded to trim share links.
      seedPath: seedPathMode, seedRide: seedRideOn, seedPts: seedPts.map(p => [+p[0].toFixed(4), +p[1].toFixed(4)]) };
  }
  // The per-EFFECT half of a scene's extras: show-box and the random-seed toggle stay
  // keyed by effect. Palette and the filter stack are per-LAYER now — see applyLayerExtras.
  function loadExtra(e) {
    const x = extras[e];
    suppressPersist = true;
    // NOT showBox: it is per-LAYER now (stageLayerExtras / applyLayerExtras install it from the
    // layer), for the same reason the seed path is. Setting it here made the box follow the
    // SELECTED layer's EFFECT — and since Tetrafyer ships showBox:false while every other effect
    // ships true, the box appeared whenever you edited another layer and vanished the instant you
    // selected the Tetrafyer one. extras[e].showBox survives as the per-effect fallback.
    randSeed = x.randSeed !== false;  // default on for presets/blobs saved before this existed
    randSeedChk.checked = randSeed;
    // The seed PATH is per-LAYER now (stageLayerExtras / applyLayerExtras install it from the
    // layer), NOT here — loadExtra must not touch it, or setEffect's persist-freeze would
    // capture the effect default over the staged layer path (the load-order trap).
    // Migration: scenes saved before the Palette cycle slider carry only the old `morph`
    // boolean. loadState has already applied any stored palcycle, so pin the cycle when
    // the old flag says off. palcycle is per-effect state, so this stays here.
    if (x.morph === false && palCycleOn()) setPalCycle(0, 0);
    suppressPersist = false;
  }
  // Capture the live palette + filter stack into a layer, so its look is remembered
  // independently of any other layer that happens to run the same effect.
  function captureLayerExtras(L) {
    L.palette = paletteSel.value;
    L.paletteRev = paletteReverse;
    L.paletteBg = paletteBg;
    captureSeed(L);                   // the layer's orbit path (mode / ride / freehand points)
    L.showBox = showBoxChk.checked;   // the wireframe box is per-layer, not per-effect
    // NOT L.world: the world tick's single writer is its own change handler, which sets
    // stack[stackSel].world directly. Capturing it from the checkbox here is the bug class
    // this line used to be -- applyLayerExtras repaints EVERY block's checkbox from the
    // incoming layer (the shared setter), so with two layers of the same effect a freeze
    // could read back a value another layer's selection had just painted over, and a tick
    // silently unticked itself. showBox tolerates the round trip because nothing else
    // repaints it mid-flow; the world tick did not.
    L.filters = activeFilterIds();    // the user's drag order, not registry order
  }
  // Put a layer's palette + filter SET onto the live globals — just the two values
  // captureLayerExtras reads back — WITHOUT the UI/morph work. This must run before
  // setEffect when switching layers, because setEffect ends in persist(), which snapshots
  // the stack by freezing the selected layer; without this it would capture the OUTGOING
  // layer's palette/filters onto the incoming one, collapsing both to the same look.
  function stageLayerExtras(L) {
    const fx = extras[L.fx] || presetExtra(L.fx);
    activeIds = filtersOk(L.filters) || new Set(presetFilters(L.fx));   // per-layer, then descriptor default — never runtime extras[L.fx] (see layerFeedbackChain)
    paletteSel.value = L.palette != null ? L.palette : fx.palette;
    paletteReverse = L.paletteRev != null ? !!L.paletteRev : !!fx.paletteRev;
    paletteBg = L.paletteBg != null ? bgOk(L.paletteBg) : bgOk(fx.paletteBg);
    // The box, before setEffect's persist-freeze can capture the effect default over it —
    // the same load-order trap the seed path documents below.
    showBox = L.showBox != null ? !!L.showBox : fx.showBox !== false;
    showBoxChk.checked = showBox;
    worldChk.checked = L.world != null ? !!L.world : fx.world === true;
    installSeedPath(L);              // seed globals = this layer's orbit path, before the persist-freeze
  }
  // Push a layer's palette + filters onto the live globals. Called after setEffect for
  // whichever layer is now selected — selecting a layer, adding one, applying a preset,
  // startup. A null field (a fresh layer, or a scene saved before per-layer extras) falls
  // back to the effect's stored/default extras, which is what preserves how old scenes
  // looked (every same-effect layer shared one palette). The fallback is then captured,
  // so from that point the layer owns concrete values that serialize.
  function applyLayerExtras(L) {
    suppressPersist = true;
    const fx = extras[L.fx] || presetExtra(L.fx);
    // Keep a stored list intact even for filters this device can't run — filterOn() masks
    // them (cpuBlocked), so they stay ticked-but-greyed and survive a round trip.
    activeIds = filtersOk(L.filters) || new Set(presetFilters(L.fx));   // per-layer, then descriptor default — never runtime extras[L.fx] (see layerFeedbackChain)
    syncFilterUI();
    bloomRaw = +el("bloom-lo").value; bloomAmt = filterOn("bloom") ? bloomRaw : 0;   // bloom follows this layer's filters
    refreshControlVisibility();       // filter param rows follow the active list
    nextSwitch = 0;                   // restart the auto-cycle countdown on a scene switch
    morphOnce = false;                // cancel a pending one-shot morph from a prior switch
    paletteSel.value = L.palette != null ? L.palette : fx.palette;
    paletteReverse = L.paletteRev != null ? !!L.paletteRev : !!fx.paletteRev;
    paletteBg = L.paletteBg != null ? bgOk(L.paletteBg) : bgOk(fx.paletteBg);
    palrevChk.checked = paletteReverse;
    palbgSel.value = paletteBg;
    showBox = L.showBox != null ? !!L.showBox : fx.showBox !== false;   // per-layer, not per-effect
    showBoxChk.checked = showBox;
    worldChk.checked = L.world != null ? !!L.world : fx.world === true;
    installSeedPath(L);              // seed globals = this layer's orbit path
    seedHistory = []; seedDragIdx = -1; seedHover = -1;   // fresh editing session per layer
    syncOrbitUI();                   // reflect this layer's mode / ride / points in the editor
    morphing = palCycleOn();
    if (morphing) startMorph(+paletteSel.value); else setPalette(+paletteSel.value);
    syncPalSwatches();                // highlight this layer's palette in the preview picker
    captureLayerExtras(L);            // concrete from here, so it serializes and stops falling back
    suppressPersist = false;
  }

