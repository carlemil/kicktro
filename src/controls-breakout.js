  // ---- Break-out boxes -------------------------------------------------------
  // Every poppable slider shows in the menu as just a name + a +/- button (a
  // .ctl-row launcher). Its full control block (slider, value readout, beat chips,
  // pulse-shape picker) lives in the pop-out column (#breakout) and is only shown
  // while popped — so the menu stays a compact index and the sliders never crowd
  // each other. `popped` is a global set of control keys — a control is one
  // singleton reused across effects, so a pop applies wherever that slider appears;
  // refreshBreakout filters both the rows and the boxes to the current effect's
  // params. Transient (not persisted). The moved node keeps working: element refs
  // (anims/loadState) are location-independent, its styling is scoped to #breakout
  // too (CSS), and onEdit + the range editor scan #breakout as well (see below).
  const breakout = el("breakout");
  // Keyed "<slot>/<key>", not by key alone, so layer 1's Speed box and layer 3's Speed box
  // are two different things and can be open at the same time. A SCENE control has one box
  // for the whole page and is keyed "s/<key>".
  const popped = new Set();
  const popKey = (slot, key) => (slot < 0 ? "s" : slot) + "/" + key;
  const isPopped = (slot, key) => popped.has(popKey(slot, key));
  const rows = {};                   // key -> menu row element (name + +/- button)
  const POPPABLE = CONTROLS.filter(c => c.type === "dual" || c.type === "plain").map(c => c.key);
  // A scene control has ONE box for the whole page, so its popped-state is keyed "s/<key>"
  // whichever block's launcher row you clicked. The sweeps below loop over the four blocks
  // and would otherwise ask about "2/bloom", which is nobody's key — so fold those keys to
  // the scene slot up front, in the one place that reads a slot back out of the set.
  const SCENE_POP_KEYS = new Set(POPPABLE.filter(k => {
    const c = CONTROLS.find(x => x.key === k);
    return !!c && isSceneCtl(c);
  }));
  const popSlot = (slot, key) => (SCENE_POP_KEYS.has(key) ? -1 : slot);
  const ctlLabel = key => { const c = CONTROLS.find(x => x.key === key); return c ? c.label : key; };
  function makePopBtn(slot, key) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "ctl-pop";
    b.addEventListener("click", () => togglePop(slot, key));
    return b;
  }
  // ---- per-slider range editor (lives at the foot of the slider's pop-out box) --
  // Sliders ship their min/max/step as HTML attributes; these fields retune the
  // bounds of *this* slider live, against the running visual. It replaced the one
  // shared "Slider ranges" list that used to sit in Diagnostics — the bounds belong
  // next to the slider they bound, and only a popped-out slider is being tuned.
  // Retuned bounds persist (localStorage), ride the ?s= share URL and go into
  // backups (see collectRanges/applyRanges); ↺ restores the shipped ones. The
  // fields don't persist themselves — rngApply dispatches `input` on the real
  // slider, and the delegated onEdit turns that into a persist + autosave.
  function ctlRangeInputs(key) { return ctlRangeInputsIn(stackSel, key); }
  function ctlRangeInputsIn(slot, key) {   // a dual's two thumbs share one set of bounds
    const g = k => ctlIn(slot, k) || el(k);      // el() covers the scene controls, which have ids
    const lo = g(key + "-lo"), hi = g(key + "-hi");
    if (lo && hi) return [lo, hi];
    const p = g(key);
    return p && p.type === "range" ? [p] : [];
  }
  // A slider's `step` attribute as a NUMBER for the editor field: "any" (continuous) and
  // any non-numeric read back as 0, so the field's "0 = continuous" convention is total.
  const stepFieldVal = s => { const n = +s; return isFinite(n) && n > 0 ? String(n) : "0"; };
  function rngApply(els, which, v, key) {
    if (!isFinite(v)) return;
    // A single control has no step row at all, and its bounds stay whole — a fractional min
    // typed into the field would put the whole grid off the integers.
    if (key !== undefined && SINGLE_KEYS.has(key)) { if (which === "step") return; v = Math.round(v); }
    for (const inp of els) {
      if (which === "step") {
        // 0 (or empty/negative) ⇒ continuous, i.e. step="any"; otherwise snap to v.
        inp.step = v > 0 ? String(v) : "any";
      } else {
        inp[which] = String(v);
        // A value outside the new bounds would otherwise be clamped by the browser
        // only on the next drag — clamp now and re-apply, so the visual, the readout
        // and the fill all agree immediately (and the change persists).
        const c = Math.min(+inp.max, Math.max(+inp.min, +inp.value));
        if (c !== +inp.value) inp.value = String(c);
      }
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  // External ▲/▼ steppers for a number field, SIDE BY SIDE after it — the native in-field
  // spinner arrows are a few pixels wide and nearly impossible to aim at, which is the
  // problem the blend row's steppers already solved, so this copies that pattern. The
  // field keeps keyboard entry (.no-spin only hides the native arrows); the buttons step
  // by `getStep()` (default: the field's own step attribute, else 1), clamp to the
  // field's min/max where set, and dispatch bubbling input+change so every existing
  // listener — including the delegated onEdit — fires exactly as if the value was typed.
  function addNumArrows(f, getStep) {
    f.classList.add("no-spin");
    const wrap = document.createElement("span");
    wrap.className = "num-arrows";
    const mk = (glyph, dir) => {
      const b = document.createElement("b");
      b.className = "num-arrow"; b.textContent = glyph;
      b.title = (dir > 0 ? "Increase " : "Decrease ") + (f.title || "value");
      b.setAttribute("aria-label", b.title);
      b.addEventListener("click", e => {
        e.preventDefault(); e.stopPropagation();
        const st = getStep ? getStep() : (+f.step > 0 ? +f.step : 1);
        let v = Math.round(((+f.value || 0) + dir * st) * 1e6) / 1e6;
        if (f.min !== "" && v < +f.min) v = +f.min;
        if (f.max !== "" && v > +f.max) v = +f.max;
        f.value = String(v);
        f.dispatchEvent(new Event("input", { bubbles: true }));
        f.dispatchEvent(new Event("change", { bubbles: true }));
      });
      wrap.appendChild(b);
    };
    mk("▲", 1); mk("▼", -1);
    f.after(wrap);
    return wrap;
  }
  function makeRangeEditor(slot, key) {
    const els = ctlRangeInputsIn(slot, key);
    if (!els.length) return null;
    const box = document.createElement("div");
    box.className = "rng-edit";
    // ONE ROW PER FIELD, each starting with its title: label · field · ▲/▼, and a fourth
    // "Reset" row for ↺. Three side-by-side columns could not hold a field plus its
    // stepper pair — max spilled out of the box.
    const fields = {};
    // A SINGLE control gets min and max only. Its step is not the user's to edit — the field's
    // own "0 = continuous" convention would otherwise be a one-keystroke way to un-quantise a
    // control whose entire point is whole numbers.
    const single = SINGLE_KEYS.has(key);
    for (const which of (single ? ["min", "max"] : ["min", "max", "step"])) {
      const cell = document.createElement("label");
      cell.className = "rng-cell";
      const lbl = document.createElement("span");
      lbl.className = "rng-lbl"; lbl.textContent = which;
      cell.appendChild(lbl);
      const f = document.createElement("input");
      f.type = "number"; f.step = single ? "1" : "any";
      f.value = which === "step" ? stepFieldVal(els[0].step) : els[0][which];
      // "step" 0 leaves the slider continuous; any positive value snaps its thumbs to
      // that increment. It only affects manual dragging — the animation drives the value
      // as a free float regardless — so it is a drag-resolution knob, not a quantiser.
      f.title = which === "step"
        ? ctlLabel(key) + " step (0 = continuous)"
        : ctlLabel(key) + " " + which;
      f.addEventListener("input", () => rngApply(els, which, +f.value, key));
      const line = document.createElement("span");
      line.className = "num-line";
      line.appendChild(f);
      cell.appendChild(line);
      // nudge by the slider's LIVE step (the step field edits it), else 1
      addNumArrows(f, () => +els[0].step > 0 ? +els[0].step : 1);
      box.appendChild(cell);
      fields[which] = f;
    }
    // Writes only what changed: rngSyncAll runs every editor in the page on every scene load.
    const sync = () => {
      for (const w in fields) {
        const v = w === "step" ? stepFieldVal(els[0].step) : els[0][w];
        if (fields[w].value !== String(v)) fields[w].value = v;
      }
    };
    rngSyncs.push(sync);
    const rst = document.createElement("button");
    rst.type = "button"; rst.className = "rng-rst"; rst.textContent = "↺";
    rst.title = "Reset this slider — value, range, beat chips and pulse — to this effect's defaults";
    rst.setAttribute("aria-label", ctlLabel(key) + ": reset to defaults");
    rst.addEventListener("click", e => { e.preventDefault(); resetControl(key); sync(); });
    // The Reset row is NOT part of the Value range section: it resets the whole control
    // (value, range, chips, pulse), so it lives at the FOOT of the box, under the trigger
    // section, behind its own divider — dressBox places it.
    const rcell = document.createElement("div");   // a div, not a label — a label would
    rcell.className = "rng-cell ctl-reset";        // re-trigger the button on text clicks
    const rlbl = document.createElement("span");
    // "reset slider" (lowercase like the other row labels) — the layer block's big
    // "Reset this effect" button uses the same word for a much bigger scope.
    rlbl.className = "rng-lbl"; rlbl.textContent = "reset slider";
    rcell.appendChild(rlbl);
    rcell.appendChild(rst);
    // The bounds fold into a COLLAPSIBLE "Value range" section, closed by default
    // (bounds are set-once knobs). Its own ? explains min/max/step — that blurb no longer
    // rides every control's main ? (openRangeHelp vs openCtlHelp).
    const sec = document.createElement("details");
    sec.className = "rng-sec";
    const sum = document.createElement("summary");
    sum.textContent = "Value range";
    const hq = document.createElement("button");
    hq.type = "button"; hq.className = "ctl-help"; hq.textContent = "?";
    hq.title = "What min / max / step do";
    hq.setAttribute("aria-label", "Value range — help");
    hq.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); openRangeHelp(); });
    sum.appendChild(hq);
    sec.appendChild(sum);
    sec.appendChild(box);
    return { sec, reset: rcell };
  }

  // Who a control belongs to, for the box title. CTL_GROUPS already carries the human
  // name of every family — effects ("Plasma", "Cardioid seed"), the shared ones
  // ("Camera", "Shape & motion") and the filters. Filters get an explicit prefix so
  // "Fire" the filter can't be read as Fire the effect family.
  // ...and WHICH LAYER'S, since two layers running the same effect would otherwise give two
  // boxes with identical titles sitting side by side in the column.
  const CTL_BY_KEY = new Map(CONTROLS.map(c => [c.key, c]));
  function ctlOwner(slot, key) {
    const c = CTL_BY_KEY.get(key);
    const g = c && c.group;
    const own = (!g || !CTL_GROUPS[g]) ? "" : (g.startsWith("f_") ? "Filter · " : "") + CTL_GROUPS[g];
    // SCENE, spelled out. These controls are one value for the WHOLE picture -- change Bloom
    // from layer 1's box and layer 4 changes with it -- so they have no owning layer to name
    // or to take a colour from. Saying "Scene" is the honest version of the blank that used
    // to be there, which read as a box that had simply failed to pick up its layer's tint.
    return slot < 0 ? "Scene" + (own ? " · " + own : "") : "L" + (slot + 1) + (own ? " · " + own : "");
  }
  // The layer number is the one part of a box title that changes while the box is open — a
  // reorder moves the layer it belongs to — so it is re-stamped rather than baked in.
  function syncPopOwners() {
    for (let slot = 0; slot < STACK_MAX; slot++) {
      // The layer's colour, alongside its number, and for the same reason: both are facts
      // about WHICH layer this box belongs to, and both go stale when the stack is reordered.
      // Stamped here rather than in refreshBreakout so the two can never disagree.
      const col = stack[slot] ? layerTint(stack[slot], slot) : "";
      for (const key of POPPABLE) {
        const box = ctlIn(slot, "ctl-" + key);
        if (!box) continue;
        // Stamped on every scene switch for every box of every slot: touch only what changed.
        if (col && box.__tint !== col) { setTintVars(box, col); box.__tint = col; }
        if (box.__ownTxt === undefined) box.__ownTxt = box.querySelector(".ctl-owner .own-txt");
        const t = box.__ownTxt, txt = t && ctlOwner(slot, key);
        if (t && t.textContent !== txt) t.textContent = txt;
      }
    }
  }
  // The box's own furniture — owner line, bounds editor, dock button. Split out because the
  // SCENE pass below dresses one box for the whole page rather than one per block.
  // ---- ONE DRAG ENGINE, ONE GRID -------------------------------------------------
  // Break-out slider boxes and every floating tool panel (Orbit editor, Palette editor,
  // Palette inspector, the three pickers, and the modal dialogs) are dragged by their
  // title bar onto the same grid. They used to be three different positioning schemes —
  // a flex column, a fixed corner, and a margin-docked box inside a full-screen shell —
  // and unifying the DRAG rather than the CSS is what keeps that from becoming a fourth.
  //
  // THE GRID IS THE EDITOR'S GRID. Its origin is the panel's own right edge and top, and
  // its column is exactly one box plus its gap, so column 0 sits flush beside the menu and
  // a snapped box lines up with the panel rather than with an arbitrary twelfth of the
  // window. The rows divide the panel's HEIGHT, so they line up with it too. Everything is
  // measured from the live bounding rect — the panel's width is a CSS number that has
  // changed before, and hard-coding 298 here is how the two drift apart.
  //
  // EDGE AFFINITY is the point of the snap: a box whose centre is in the left half anchors
  // its LEFT edge to a grid line and grows right; past the middle it anchors its RIGHT edge
  // and grows left, and the same vertically. So dragging across the middle re-aligns it to
  // the near edge and it grows inward, and a corner box stays in its corner however tall
  // its content becomes.
  //
  // Transient, like `popped` itself: nothing here is in fullSnapshot(), so no position ever
  // rides a scene, a link or a backup.
  const BRK_W = 244, BRK_GAP = 10, BRK_ROWS = 8, BRK_EDGE = 14;
  const brkPos = new Map();                 // "<slot>/<key>" | "dlg:<id>" -> { gx, gy, right, bottom }
  // Below this the CSS puts the boxes back in flow as a bottom sheet and re-docks the
  // dialogs (see the 760px block in styles.css); dragging there would fight it.
  const brkFree = () => window.innerWidth > 760;
  function brkGrid() {
    const r = panel.getBoundingClientRect();
    return {
      x0: Math.max(0, Math.round(r.right) + BRK_GAP),
      y0: Math.max(0, Math.round(r.top)),
      cw: BRK_W + BRK_GAP,                  // one box per column, its gap included
      ch: Math.max(48, r.height / BRK_ROWS),
    };
  }
  // The rects the overlap checks run against: every directly-placed visible box in the
  // grid (slider boxes, scene boxes, layer boxes). Direct children only — the never-popped
  // .ctl check rows nested inside a layer block are not placed boxes.
  // The placed boxes are #breakout's own CHILDREN: walk those, never query the subtree — it
  // holds every control of every layer block (thousands of nodes), and that search was the
  // largest single line of a scene switch.
  function brkBoxes() {
    const out = [];
    for (const n of breakout.children) if (n.classList.contains("ctl") && n.classList.contains("poppable")) out.push(n);
    return out;
  }
  function brkRects(except) {
    return brkBoxes()
      .filter(n => n !== except && n.style.display !== "none")
      .map(n => n.getBoundingClientRect());
  }
  // Half a pixel of slack: grid maths and measured rects disagree by subpixels, and two
  // boxes sharing an edge exactly must count as clear, not overlapping.
  const rectClear = (x, y, w, h, taken) =>
    taken.every(t => x + w <= t.left + 0.5 || x >= t.right - 0.5 || y + h <= t.top + 0.5 || y >= t.bottom - 0.5);
  // A box's height rounded UP to the quarter-cell grid, gap included — the height layout
  // gives it (min-height, border-box), so boxes anchored on grid lines leave a uniform
  // BRK_GAP between rows instead of a different remainder per box.
  function brkH(box, g) {
    const q = g.ch / BRK_SUB, h = box ? (box.offsetHeight || 120) : 120;
    const r = Math.ceil((h + BRK_GAP) / q) * q - BRK_GAP;
    // ...BUT NEVER PAST THE BOX'S OWN max-height. This rounding is applied as a min-height,
    // and in CSS **min-height beats max-height** — so rounding up blindly made every layer
    // box 434px tall against its 410px cap, which is exactly enough to stop two of them
    // stacking and cost layers 3 and 4 their corners. Grid-alignment is a nicety; fitting
    // on the screen is not, so the cap wins and this box simply stays off the grid.
    if (box) {
      const mh = parseFloat(getComputedStyle(box).maxHeight);
      if (isFinite(mh) && r > mh) return h;
    }
    return r;
  }
  // Same for width: a slider box is already exactly one column (244 + 10 = 4 quarters),
  // but the wider layer box (300px) is not, and un-rounded it pushes its neighbours off
  // the gap rhythm — min-width wins over the CSS width, so this widens it onto the grid.
  function brkW(box, g) {
    const q = g.cw / BRK_SUB, w = box ? (box.offsetWidth || BRK_W) : BRK_W;
    return Math.ceil((w + BRK_GAP) / q) * q - BRK_GAP;
  }
  // A BOX MUST NEVER BE PLACED PARTLY OFF SCREEN, and this is the one place to enforce it:
  // every path that positions a box -- a drop, the default column, a window resize, a
  // reorder -- ends up here, so a guard here covers all of them and a guard in any one
  // caller covers only that one.
  //
  // The old `Math.max(0, ...)` pair was NOT that guard, and the difference is the whole bug.
  // Those clamp the OFFSET, which stops a box escaping past the edge it is anchored to --
  // the bottom for a bottom anchor, the right for a right anchor. They say nothing about
  // the box's other edge, so a bottom-anchored box tall enough to reach past the top of the
  // viewport was placed exactly there and most of it was simply gone. (Reported after a
  // drop onto the lower edge of layer 1's box; see the note in dragEnd for how it got the
  // bottom anchor in the first place.)
  //
  // So clamp the RECT, both edges, in whichever frame the anchor is expressed. `x`/`y` are
  // the box's left/top for a near anchor and its right/bottom for a far one.
  function brkPlace(node, p) {
    const g = brkGrid();
    let x = g.x0 + p.gx * g.cw / BRK_SUB, y = g.y0 + p.gy * g.ch / BRK_SUB;
    const r = node.getBoundingClientRect();
    const w = r.width, h = r.height;
    const vw = window.innerWidth, vh = window.innerHeight;
    // The grid starts at the panel's right edge, so a box is never placed under the menu.
    // When a box is bigger than the room available the clamp would invert; pin it to the
    // near edge instead, which keeps its title and controls reachable. brkOffscreen already
    // refuses to OPEN a box that cannot fit, so this is the resize case.
    if (w > 0 && g.x0 + w <= vw) x = p.right ? Math.min(vw, Math.max(g.x0 + w, x))
                                             : Math.max(g.x0, Math.min(vw - w, x));
    else x = p.right ? g.x0 + w : g.x0;
    if (h > 0 && g.y0 + h <= vh) y = p.bottom ? Math.min(vh, Math.max(g.y0 + h, y))
                                              : Math.max(g.y0, Math.min(vh - h, y));
    else y = p.bottom ? g.y0 + h : g.y0;
    if (p.right) { node.style.right = Math.max(0, vw - x) + "px"; node.style.left = "auto"; }
    else { node.style.left = Math.max(0, x) + "px"; node.style.right = "auto"; }
    if (p.bottom) { node.style.bottom = Math.max(0, vh - y) + "px"; node.style.top = "auto"; }
    else { node.style.top = Math.max(0, y) + "px"; node.style.bottom = "auto"; }
  }
  // THE SNAP IS FOUR TIMES FINER THAN THE GRID YOU SEE MOST. gx/gy are in quarter-cells:
  // a box can land on any of the fine lines, and the whole-cell lines -- the ones that put a
  // box flush beside the panel, or exactly one box-width from its neighbour -- are drawn
  // stronger so the "best" alignments read as such while you drag. Placement maths divides
  // by BRK_SUB, so a stored position on a coarse line is an exact multiple and unchanged.
  const BRK_SUB = 4;
  function brkSnap(node) {
    const g = brkGrid(), r = node.getBoundingClientRect();
    const right = r.left + r.width / 2 > window.innerWidth / 2;
    const bottom = r.top + r.height / 2 > window.innerHeight / 2;
    return {
      right: right, bottom: bottom,
      gx: Math.round(((right ? r.right : r.left) - g.x0) / g.cw * BRK_SUB),
      gy: Math.round(((bottom ? r.bottom : r.top) - g.y0) / g.ch * BRK_SUB),
    };
  }
  // The grid, made visible while something is being dragged — a snap you cannot see is a
  // box that jumps somewhere you did not ask for. Two repeating gradients on one element,
  // sized and placed from brkGrid(), so the drawing and the maths cannot disagree.
  function brkGridPaint() {
    const el2 = el("brkgrid");
    if (!el2) return;
    const g = brkGrid();
    el2.style.left = g.x0 + "px";
    el2.style.top = g.y0 + "px";
    el2.style.width = Math.max(0, window.innerWidth - g.x0) + "px";
    el2.style.height = Math.max(0, window.innerHeight - g.y0) + "px";
    // Two grids on one element: the fine quarter-cell mesh first (drawn on top), the
    // whole-cell lines behind it, stronger. Sizes from the same g as the snap, so the
    // drawing and the maths cannot disagree.
    const fw2 = g.cw / BRK_SUB, fh2 = g.ch / BRK_SUB;
    el2.style.backgroundSize = fw2 + "px " + fh2 + "px, " + fw2 + "px " + fh2 + "px, "
                             + g.cw + "px " + g.ch + "px, " + g.cw + "px " + g.ch + "px";
  }
  // Lay out every visible break-out box: stored anchors where there are any, the default
  // column for the rest. Called from refreshBreakout (which knows what is visible), from
  // the end of a drag, and on resize.
  function layoutBreakout() {
    const boxes = brkBoxes();
    if (!brkFree()) {                       // bottom sheet: hand the boxes back to the CSS
      for (const box of boxes)
        box.style.left = box.style.right = box.style.top = box.style.bottom =
          box.style.minHeight = box.style.minWidth = "";
      return;
    }
    const vis = boxes.filter(b => b.style.display !== "none");
    // Nothing to place: skip the measuring, which forces a whole layout right after a scene
    // switch's DOM writes (most of the cost of a switch with no box out).
    if (!vis.length && !brkFloats.some(f => brkPos.has(f.key))) return;
    const g = brkGrid();
    // Size every visible box to the grid first: clear the previous stretch (content may
    // have shrunk), measure, round up to the quarter cell. Placement below then reads the
    // rounded heights, so the spacing between stacked boxes is a uniform BRK_GAP.
    for (const box of vis) {
      box.style.minHeight = box.style.minWidth = "";
      const hh = brkH(box, g), ww = brkW(box, g);
      if (hh > box.offsetHeight) box.style.minHeight = hh + "px";
      if (ww > box.offsetWidth) box.style.minWidth = ww + "px";
    }
    // Anchored boxes first, so the flow column can steer around them instead of stacking
    // straight through — the overlap check the free grid was missing.
    const placed = [], flow = [];
    for (const box of vis) {
      const p = brkPos.get(box.dataset.brk || "");
      if (p) { brkPlace(box, p); placed.push(box.getBoundingClientRect()); }
      else flow.push(box);
    }
    let x = g.x0, y = g.y0;
    for (const box of flow) {
      const h = box.offsetHeight || 120;
      for (let guard = 0; guard < 64; guard++) {
        if (y + h > window.innerHeight - BRK_EDGE && y > g.y0) { y = g.y0; x += g.cw; continue; }
        const hit = placed.find(t => !rectClear(x, y, BRK_W, h, [t]));
        if (!hit) break;
        y = hit.bottom + BRK_GAP;
      }
      box.style.left = x + "px"; box.style.top = y + "px";
      box.style.right = box.style.bottom = "auto";
      placed.push(box.getBoundingClientRect());
      y += h + BRK_GAP;
    }
    // Floating panels keep their placement across a resize; the ones never dragged are
    // left entirely to the CSS.
    for (const f of brkFloats) { const p = brkPos.get(f.key); if (p) brkPlace(f.node, p); }
  }
  const brkFloats = [];
  // ---- the engine ----
  let dragNode = null, dragHandle = null, dragKey = "";
  let dragSX = 0, dragSY = 0, dragOX = 0, dragOY = 0;
  function dragBegin(node, handle, key, e) {
    if (!brkFree() || e.button || !node || !key) return;
    // Never start a drag from a control inside the title bar — the close X, the step
    // counter's buttons, anything focusable.
    if (e.target.closest && e.target.closest("button, input, select, textarea, a")) return;
    const r = node.getBoundingClientRect();
    dragNode = node; dragHandle = handle; dragKey = key;
    dragSX = e.clientX; dragSY = e.clientY; dragOX = r.left; dragOY = r.top;
    // A floating panel is `relative` inside a full-screen `inset: 0` shell, or `fixed` in
    // its own right (the Orbit editor). Only the relative ones need converting, and the
    // shell being inset:0 is what makes viewport coordinates and absolute ones the same
    // number — which is why one rect-based engine drives both.
    if (getComputedStyle(node).position !== "fixed") node.style.position = "absolute";
    node.style.margin = "0";
    node.style.left = dragOX + "px"; node.style.top = dragOY + "px";
    node.style.right = node.style.bottom = "auto";
    node.classList.add("dragging");
    document.body.classList.add("brk-gridding");
    brkGridPaint();
    try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  }
  function dragMove(e) {
    if (!dragNode) return;
    dragNode.style.left = (dragOX + e.clientX - dragSX) + "px";
    dragNode.style.top = (dragOY + e.clientY - dragSY) + "px";
  }
  function dragEnd(e) {
    if (!dragNode) return;
    const node = dragNode, handle = dragHandle, key = dragKey;
    dragNode = dragHandle = null;
    node.classList.remove("dragging");
    document.body.classList.remove("brk-gridding");
    try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
    let p = brkSnap(node);
    // A DROP MAY NOT BURY ANOTHER BOX, AND MAY NOT LEAVE THE SCREEN. This used to nudge a
    // quarter-cell at a time in ONE direction -- up for a bottom-anchored box, down
    // otherwise -- which is where the reported bug came from. Dropping a slider box onto the
    // lower edge of layer 1's box put the box's centre just past the vertical middle, so it
    // took a BOTTOM anchor, so the nudge walked its bottom edge UPWARD looking for clear
    // space. Layer 1's box lives at the top of the screen, so the first clear spot was the
    // one with the slider box's bottom against the layer box's top -- and the rest of it
    // above the viewport. It searched exactly one of the four directions it needed.
    //
    // nearestFree already does the whole job and is what the automatic placement uses: it
    // enumerates only positions that fit ON SCREEN, skips anything that would overlap a
    // visible box, and returns the one closest to a point. Handing it the point the box was
    // actually dropped at gives "as close as possible to where you let go, fully on screen,
    // touching nothing" -- in every direction, not just the one.
    //
    // A drop into space that is already free returns that same quarter-cell, so an ordinary
    // drop still lands exactly where the grid says and nothing moves.
    if (node.classList.contains("poppable")) {
      const g = brkGrid(), r0 = node.getBoundingClientRect();
      const spot = nearestFree(r0.left + r0.width / 2, r0.top + r0.height / 2,
                               brkW(node, g), brkH(node, g), g, brkRects(node));
      // No free spot anywhere: keep the drop and let brkPlace clamp it on screen. Overlapping
      // is recoverable with one more drag; disappearing is not.
      if (spot) p = brkAnchor(spot.x, spot.y, r0.width, r0.height, g);
    }
    brkPos.set(key, p);
    brkPlace(node, p);
    layoutBreakout();                       // the column closes the gap a box left behind
  }
  // Document-level, once: a delegated pointerdown can start a drag on a node that did not
  // exist at startup (the Help dialog builds its whole box on open), and the move/up pair
  // has to survive the pointer leaving the handle.
  document.addEventListener("pointermove", dragMove, true);
  document.addEventListener("pointerup", dragEnd, true);
  document.addEventListener("pointercancel", dragEnd, true);
  // Double-click a title bar to give the placement back — the way out of a drop you did not
  // mean, without hunting for where it came from.
  function dragReset(node, key) {
    brkPos.delete(key);
    node.style.left = node.style.top = node.style.right = node.style.bottom = "";
    node.style.margin = node.style.position = "";
    layoutBreakout();
  }
  function makeBoxGrab(box, handle) {
    handle.addEventListener("pointerdown", e => dragBegin(box, handle, box.dataset.brk, e));
    handle.addEventListener("dblclick", e => { e.preventDefault(); dragReset(box, box.dataset.brk); });
  }
  // ---- the floating panels ------------------------------------------------------
  // Every dialog in the app follows the same shape — a close button then an <h2>, inside a
  // box inside a host — so one delegated handler covers all of them, including the ones
  // built on open. The MOVABLE node is not always the h2's parent: #carddlg's .card-box is
  // deliberately `position: static` and the host is what carries the placement, so walk up
  // to the first ancestor that is positioned at all and move that.
  const DRAG_HOSTS = "#carddlg,#paledlg,#paldlg,#fltdlg,#palpickdlg,#transpickdlg,"
                   + "#galdlg,#restoredlg,#syncpop,#help";
  function dragTargetFor(h2) {
    let n = h2.parentElement;
    while (n && n !== document.body && getComputedStyle(n).position === "static") n = n.parentElement;
    return n && n !== document.body ? n : null;
  }
  function dragKeyFor(node) {
    const idOwner = node.closest("[id]");
    return idOwner ? "dlg:" + idOwner.id : "";
  }
  document.addEventListener("pointerdown", e => {
    if (!e.target.closest) return;
    const h2 = e.target.closest("h2");
    if (!h2 || !h2.closest(DRAG_HOSTS)) return;
    const node = dragTargetFor(h2);
    if (!node) return;
    const key = dragKeyFor(node);
    if (!key) return;
    if (!brkFloats.some(f => f.key === key)) brkFloats.push({ node: node, key: key });
    dragBegin(node, h2, key, e);
  }, true);
  document.addEventListener("dblclick", e => {
    if (!e.target.closest) return;
    const h2 = e.target.closest("h2");
    if (!h2 || !h2.closest(DRAG_HOSTS)) return;
    const node = dragTargetFor(h2);
    if (node) { e.preventDefault(); dragReset(node, dragKeyFor(node)); }
  }, true);
  window.addEventListener("resize", () => { layoutBreakout(); brkGridPaint(); });
  function dressBox(slot, key, box) {
    box.classList.add("poppable");
    // Title line, first child so it sits above the label. Only ever visible in
    // #breakout: the menu slot shows the .ctl-row launcher, never the .ctl itself.
    // Always built (even with no owner group) so it can carry the per-box help ?.
    const own = ctlOwner(slot, key);
    const t = document.createElement("div");
    t.className = "ctl-owner";
    const ownTxt = document.createElement("span");
    ownTxt.className = "own-txt"; ownTxt.textContent = own;
    t.appendChild(ownTxt);
    const hb = document.createElement("button");
    hb.type = "button"; hb.className = "ctl-help"; hb.textContent = "?";
    hb.title = "What " + ctlLabel(key) + " does";
    hb.setAttribute("aria-label", ctlLabel(key) + " — help");
    hb.addEventListener("click", e => { e.stopPropagation(); openCtlHelp(key); });
    t.appendChild(hb);
    box.insertBefore(t, box.firstChild);
    // The box's grid identity, and its drag handle. Same key shape as `popped`, so a layer
    // reorder can remap both together.
    box.dataset.brk = popKey(slot, key);
    makeBoxGrab(box, ownTxt);
    // Bounds editor goes directly UNDER THE SLIDER, not at the foot of the box: min/max/step
    // describe that slider, so they belong with it rather than below the beat controls, which
    // are a different subject. A divider closes the block off from the Triggers section.
    //
    // Inserted rather than appended, because makeChips (run earlier, from bindRange) has
    // already appended the trigger block — so the anchor is the first thing it added, and
    // everything lands in front of that. `.trig-t` is that anchor; with no chips (a `plain`
    // control that can't be beat-armed) there is nothing to insert before and appending is
    // right, which insertBefore(…, null) does for free.
    const rngEd = makeRangeEditor(slot, key);
    if (rngEd) {
      const anchor = box.querySelector(".trig-t");
      box.insertBefore(rngEd.sec, anchor);
      if (anchor) {
        const hr = document.createElement("div");
        hr.className = "ctl-div";
        box.insertBefore(hr, anchor);
      }
      // Reset closes the box: below the trigger section, behind its own divider.
      const hr2 = document.createElement("div");
      hr2.className = "ctl-div";
      box.appendChild(hr2);
      box.appendChild(rngEd.reset);
    }
    box.appendChild(makePopBtn(slot, key));      // the box's own dock button (left gutter in #breakout)
  }
  // The launcher that stays in the menu slot: the control's name, its beat dots and the
  // +/- button. `slot` is the POP slot — -1 for a scene control, which has no wiring
  // record in W and therefore no chips to mirror. (None of the scene controls declares
  // `beat`, so no dots are lost; arm one and it would need a home for a second `w.dots`.)
  function makeLauncherRow(slot, key) {
    const row = document.createElement("div");
    row.className = "ctl-row";
    const name = document.createElement("span");
    name.className = "ctl-row-name"; name.textContent = ctlLabel(key);
    row.appendChild(name);
    // Beat dots, left of the +/- button. Only for sliders that have chips at all —
    // `plain` controls are poppable but never armed, so they get no dots.
    const w = W[slot] && W[slot][key];
    if (w && w.chips) {
      const dots = document.createElement("span");
      dots.className = "ctl-dots";
      const dm = w.dots = {};
      for (const b of ["low", "mid", "high"]) {
        const d = document.createElement("i");
        d.className = "ctl-dot d-" + b;
        d.title = b + " beat";
        dots.appendChild(d);
        dm[b] = d;
      }
      row.appendChild(dots);
    }
    row.appendChild(makePopBtn(slot, key));      // +/- button, right of the name
    return row;
  }
  // Once PER BLOCK. Each block's .ctl boxes get their own owner line, bounds editor, pop
  // button and launcher row, and each is exported into the one #breakout column;
  // refreshBreakout is what keeps only the selected layer's boxes visible.
  for (let slot = 0; slot < STACK_MAX; slot++) POPPABLE.forEach(key => {
    const box = ctlIn(slot, "ctl-" + key);
    if (!box) return;                            // a scene control is not in any block's map
    box.dataset.slot = String(slot);
    dressBox(slot, key, box);
    const row = makeLauncherRow(slot, key);
    box.parentNode.insertBefore(row, box);       // row takes the control's menu slot
    breakout.appendChild(box);                   // full control lives in the column (hidden until popped)
    const w = W[slot] && W[slot][key];
    if (w) w.row = row;
    ctlReg(slot, "row-" + key, row);
  });
  // ---- the SCENE filter params: one box, N rows ---------------------------------
  // A scene control carries an `id` rather than `data-k` and is generated in slot 0 only,
  // so `ctlIn` — a map lookup over the [data-k] nodes — never finds it and the pass above
  // skipped every one. That left Bloom, Barrel, Scanlines, Vignette and Film grain with no
  // slider anywhere: buildFilterUI could not adopt them into their <details> either (same
  // lookup), so they stayed behind in #filterctl, which buildFilterUI then hides. Expanding
  // Bloom showed an empty body and Strength was unreachable. Fire lost `Burn rate` the same
  // way and kept only `Rise`.
  //
  // The rest of this module already anticipates the shape of the fix — popKey's "s/" prefix,
  // refreshBreakout's scene loop, syncPopBtns' "one box, N rows", remapPopped's `s === "s"`
  // skip, ctlOwner dropping the "L2 ·" prefix at slot < 0. Only the construction was missing.
  // So: ONE box in the column, popped as "s/<key>", and one launcher row in EVERY block's
  // copy of that filter's section, because the section is per block and the value is not.
  //
  // Driven off FILTERS rather than POPPABLE so the rows land in the order the filter
  // declares its params (Fire: Rise, then Burn rate). Only filter params are done here:
  // ttl/tdur are scene controls too, but they have one home in the Scene box and already
  // render there in full, so they need no launcher.
  FILTERS.forEach(f => (f.params || []).forEach(key => {
    const c = CONTROLS.find(x => x.key === key);
    if (!c || !isSceneCtl(c) || !POPPABLE.includes(key)) return;
    const box = el("ctl-" + key);
    if (!box) return;
    dressBox(-1, key, box);                      // no data-slot: this box belongs to no layer
    breakout.appendChild(box);
    // One row per block. `secs` is keyed by slot, but a plain query keeps this independent
    // of that map and returns the bodies in block order, which is what the rows want.
    document.querySelectorAll('.filter-sec[data-fid="' + f.id + '"] > .filter-body')
      .forEach((body, slot) => {
        const row = makeLauncherRow(-1, key);
        body.appendChild(row);
        if (slot === 0) rows[key] = row;         // a scene control has no wiring record to hang it on
        ctlReg(slot, "row-" + key, row);
      });
  }));
  // ---- per-tab Random / Reset ----------------------------------------------------
  // ⚄ rolls every slider the tab currently shows for this layer to a fresh uniform value
  // anywhere in its range — not a nudge around where it was (the browser snaps each write
  // to the slider's own step, so a `single` control still lands on whole numbers) — and
  // SOMETIMES arms one beat trigger on a random armable slider, which arrives with the
  // freshly-rolled thumbs as its values. ↺ runs resetControl over the same keys: value,
  // range, chips, pulse — the whole tab back to the effect's defaults. The buttons live
  // inside the layer box, so the capture-phase pointerdown on #breakout has already
  // selected the layer by the time the click runs — the block is live, which is what the
  // chip handlers and resetControl require.
  function tabKeys(pane) {
    return [...pane.querySelectorAll(".ctl-row")]
      .filter(r => r.offsetParent !== null && r.dataset.k && r.dataset.k.indexOf("row-") === 0)
      .map(r => r.dataset.k.slice(4));
  }
  function jiggleTab(slot, pane, t) {
    // The Filters tab's Random also GROWS the chain: a coin flip to add one random
    // not-yet-added filter, repeated until a flip says stop or the layer holds 5 —
    // enough to get somewhere interesting without burying the effect. Added first, so
    // the value pass below rolls the newcomers' params along with everything else.
    if (t === "flt") {
      let grew = false;
      while (activeFilterIds().length < 5 && Math.random() < 0.5) {
        const have = new Set(activeFilterIds());
        const pool = FILTERS.map(f => f.id).filter(id => !have.has(id));
        if (!pool.length) break;
        setFilterOn(pool[(Math.random() * pool.length) | 0], true);
        grew = true;
      }
      // setFilterOn persists but, unlike a picker click, never passes through the
      // delegated onEdit — fold the new chain into the selected preset by hand,
      // exactly as chipEdited does for the chips.
      if (grew && persistReady && !applyingPreset) { autosavePreset(); persist(); }
    }
    // The Palette tab's Random also rolls the PALETTE itself — a fresh pick from the
    // in-use set, through the same value-store-plus-bubbling-change path a swatch click
    // takes — and flips Reverse colours about a third of the time. The cycle, hold,
    // heat-boost and banding sliders are pane sliders, so the value pass below covers them.
    if (t === "pal") {
      const cur = +paletteSel.value, pool = [];
      for (let i = 0; i < PALETTES.length; i++) if (palInUse(i) && i !== cur) pool.push(i);
      if (pool.length) {
        paletteSel.value = String(pool[(Math.random() * pool.length) | 0]);
        paletteSel.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const rev = ctlIn(slot, "palrev");
      if (rev && Math.random() < 0.35) {
        rev.checked = !rev.checked;
        rev.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    const armable = [];
    for (const key of tabKeys(pane)) {
      // RANDOM LEAVES THE CAMERA AND THE SHARED WORLD ALONE. Both are on the Effect tab, and
      // both are the wrong kind of thing for this button: the camera is where you have put
      // yourself in the scene and the world group is where this layer sits in a shared one,
      // so rolling them does not vary the effect, it throws away a placement you chose by
      // hand. CAM_KEYS is the app's own answer to "what is the camera" (zoom included), so
      // this reads it rather than keeping a second list that could drift from it.
      //
      // The `continue` is before the armable push as well, so Random cannot arm a beat
      // trigger on them either -- a camera that lurches on every kick is the same problem
      // arriving by a different route.
      if (RND_KEEP.has(key)) continue;
      const els = ctlRangeInputsIn(slot, key);
      // A single control keeps lo === hi through the mirror on the FIRST thumb's input —
      // nudging both with different deltas would fight it.
      // THE EFFECT TAB ROLLS AROUND THE DEFAULT; the other two roll flat across the range.
      // A flat roll suits filters and palettes, where any value is a plausible look, but an
      // effect's sliders are a shape: roll all of them flat and you mostly get the same
      // formless mush, because the interesting settings are a small neighbourhood and the
      // extremes all look alike. So the effect tab keeps its default as the centre and draws
      // its DISTANCE from a heavy-tailed curve. Measured in the running UI over 640 rolls of the
      // sliders Random actually touches: 61% land within a tenth of the range, 31% within a
      // third, and 8% swing further than that. u^4 gave 47/44/9, which read as "always a bit
      // off" rather than "usually close".
      // Occasional divergence is the point; constant divergence is noise.
      const dflt = t === "fx" ? (presetState(effect) || {})[key] : undefined;
      const pool = SINGLE_KEYS.has(key) ? els.slice(0, 1) : els;
      for (let ei = 0; ei < pool.length; ei++) {
        const inp = pool[ei];
        const mn = +inp.min, mx = +inp.max;
        if (!isFinite(mn) || !isFinite(mx) || mx <= mn) continue;
        let v;
        const d0 = Array.isArray(dflt) ? dflt[Math.min(ei, dflt.length - 1)] : dflt;
        if (isFinite(d0)) {
          const u = Math.random();
          const spread = u * u * u * u * u * u;               // heavy tail: mostly small
          v = d0 + (Math.random() * 2 - 1) * spread * (mx - mn);
        } else {
          v = mn + Math.random() * (mx - mn);                 // no default to centre on
        }
        inp.value = String(Math.min(mx, Math.max(mn, v)));
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const w = W[slot] && W[slot][key];
      if (w && w.chips && !SINGLE_KEYS.has(key)) armable.push(w.chips);
    }
    if (armable.length && Math.random() < 0.35) {
      const chips = armable[(Math.random() * armable.length) | 0];
      const off = ["low", "mid", "high"].filter(b => chips[b] && !chips[b].classList.contains("on"));
      if (off.length) chips[off[(Math.random() * off.length) | 0]].click();
    }
  }
  // What Random must not touch: the camera (CAM_KEYS, which includes zoom) and the shared
  // 3D world placement. Built from CAM_KEYS rather than spelled out again, so adding a
  // camera control cannot quietly become a thing Random rolls.
  const RND_KEEP = new Set(CAM_KEYS.concat(["world", "wldx", "wldy", "wldz", "wldscale"]));
  function resetTab(pane, t) {
    // The Filters tab's chain first: back to this effect's default list (usually empty),
    // so Reset undoes what Random added as well as what it retuned. Removing a filter
    // hides its rows, so this runs before tabKeys reads what the pane still shows.
    if (t === "flt") {
      const want = new Set(presetFilters(effect));
      let changed = false;
      for (const id of activeFilterIds()) if (!want.has(id)) { setFilterOn(id, false); changed = true; }
      for (const id of want) if (!activeFilterIds().includes(id)) { setFilterOn(id, true); changed = true; }
      if (changed && persistReady && !applyingPreset) { autosavePreset(); persist(); }
    }
    for (const key of tabKeys(pane)) resetControl(key);
    rngSyncAll();               // the in-box min/max fields follow the restored bounds
  }
  for (let slot = 0; slot < STACK_MAX; slot++) for (const t of ["fx", "flt", "pal"]) {
    const pane = ctlIn(slot, "tab-" + t);
    const rnd = ctlIn(slot, "rnd-" + t), rst = ctlIn(slot, "rst-" + t);
    if (!pane || !rnd || !rst) continue;
    rnd.addEventListener("click", e => { e.stopPropagation(); jiggleTab(slot, pane, t); });
    rst.addEventListener("click", e => { e.stopPropagation(); resetTab(pane, t); });
  }

  // The launcher rows and beat dots are the last per-block pieces to exist, so install
  // slot 0 into the singleton maps now that its record is complete.
  pointMaps(0);
  for (let slot = 0; slot < STACK_MAX; slot++) POPPABLE.forEach(k => syncPopBtns(slot, k));

  function syncPopBtns(slot, key) {   // keep both the menu-row and the box's button in sync
    slot = popSlot(slot, key);
    const docked = !isPopped(slot, key);
    const hosts = slot < 0
      ? ctlEach("row-" + key).concat([rows[key], el("ctl-" + key)])   // a scene control: one box, N rows
      : [ctlIn(slot, "row-" + key), ctlIn(slot, "ctl-" + key)];
    for (const host of hosts) {
      if (!host) continue;
      const b = host.querySelector(".ctl-pop");
      if (!b) continue;
      b.textContent = docked ? "+" : "−";
      b.title = docked ? "Pop out into its own box" : "Return to the menu";
      b.setAttribute("aria-label", ctlLabel(key) + ": " + b.title);
    }
  }
  // A box must never sit partly OFF the screen. Anchored placements are bounds-checked at
  // choice time; this is the after-the-fact check for everything else (the flow column with
  // no room left, a box taller than the viewport).
  function brkOffscreen(box) {
    const r = box.getBoundingClientRect();
    return r.left < -0.5 || r.top < -0.5
      || r.right > window.innerWidth + 0.5 || r.bottom > window.innerHeight + 0.5;
  }
  function popCtl(slot, key) {
    if (isPopped(slot, key)) return;
    popped.add(popKey(slot, key));
    const b = slot < 0 ? el("ctl-" + key) : ctlIn(slot, "ctl-" + key);
    if (b) breakout.appendChild(b);              // append ⇒ boxes stack top→down in click order
    // SHOWN BEFORE IT IS PLACED. refreshBreakout is what normally un-hides it, and that runs
    // below — so placing first measured a display:none box, got 0, and reserved the 120px
    // fallback for what turned out to be a 513px-tall box. It then "did not overlap" anything
    // at 120px and buried its own layer box at full height.
    if (b) b.style.display = "";
    // Popped from an OPEN layer box ⇒ land beside it, not at the foot of the default
    // column. You opened the layer to work on it, so its sliders belong next to it.
    if (slot >= 0 && !brkPos.has(popKey(slot, key))) placeBeside(slot, popKey(slot, key), b);
    syncPopBtns(slot, key);
    refreshBreakout();
    // No on-screen home for it ⇒ it does not open at all: dock it straight back (the +
    // reverts, the box hides) rather than show it clipped by the viewport edge. The anchor
    // is dropped too, so a later attempt — after closing something — searches fresh.
    if (b && brkFree() && b.style.display !== "none" && brkOffscreen(b)) {
      brkPos.delete(popKey(slot, key));
      dockCtl(slot, key);
    }
  }
  // ---- where a NEW box lands -------------------------------------------------------
  // Two rules, and both are about the same thing: you should never have to move a box before
  // you can read it.
  //
  //   1. A LAYER box goes to ITS OWN CORNER, by slot: L1 top-left, L2 top-right,
  //      L3 bottom-left, L4 bottom-right. Fixed, not scored — the whole point of a corner
  //      per layer is that it is PREDICTABLE, so layer 3 is where layer 3 always is whatever
  //      else happens to be open.
  //   2. A SLIDER box lands in the nearest free spot to ITS layer's box, so a layer's
  //      controls gather around it, and never on top of anything already on screen.
  //
  // Both anchor with EDGE AFFINITY (see brkSnap): a box past the middle holds the near edge
  // and grows inward, so a corner box stays in its corner as its content grows and a resize
  // does not push it off screen.

  // The quarter-cell index that puts an edge at a given pixel, in the anchor frame brkPlace
  // reads: for a right/bottom anchor the stored coordinate IS the far edge.
  function brkAnchor(x, y, w, h, g) {
    // EDGE AFFINITY: hold the near edge and grow inward. Right for a DROP -- you put the box
    // where it is -- but a slider box has to INHERIT its layer box's anchor instead, so the
    // choosing half is split out.
    return brkAnchorAs(x, y, w, h, g,
      x + w / 2 > window.innerWidth / 2, y + h / 2 > window.innerHeight / 2);
  }
  function brkAnchorAs(x, y, w, h, g, right, bottom) {
    const qx = g.cw / BRK_SUB, qy = g.ch / BRK_SUB;
    return {
      right: !!right, bottom: !!bottom,
      gx: Math.round(((right ? x + w : x) - g.x0) / qx),
      gy: Math.round(((bottom ? y + h : y) - g.y0) / qy),
    };
  }
  // Every quarter-cell position a box of this size can occupy without leaving the screen,
  // nearest first to (cx, cy) and skipping anything that would overlap a visible box. The
  // grid starts at the panel's right edge, so nothing is ever offered underneath the menu.
  function nearestFree(cx, cy, w, h, g, taken) {
    const qx = g.cw / BRK_SUB, qy = g.ch / BRK_SUB;
    let best = null, bestD = Infinity;
    for (let gy = 0; g.y0 + gy * qy + h <= window.innerHeight - BRK_EDGE; gy++) {
      const y = g.y0 + gy * qy;
      for (let gx = 0; g.x0 + gx * qx + w <= window.innerWidth - BRK_EDGE; gx++) {
        const x = g.x0 + gx * qx;
        const d = Math.hypot(x + w / 2 - cx, y + h / 2 - cy);
        if (d >= bestD) continue;                     // cheaper than the overlap test, so first
        if (!rectClear(x, y, w, h, taken)) continue;
        bestD = d; best = { x: x, y: y };
      }
    }
    return best;
  }
  // WHICH WAY A LAYER'S SLIDER BOXES GROW. Toward the middle of the screen horizontally --
  // a layer box in the left half puts its sliders to its RIGHT, one in the right half puts
  // them to its LEFT -- and in the layer box's own vertical direction, so a top-anchored
  // layer's sliders hang down from its top edge and a bottom-anchored layer's stack up from
  // its bottom. The layer box's stored anchor is authoritative when it has one; a layer box
  // that has never been dragged is read from where it actually sits.
  function layerGrow(slot, r) {
    const p = brkPos.get(popKey(slot, "layer"));
    return {
      right: r.left + r.width / 2 > window.innerWidth / 2,     // which half it is in
      bottom: p ? !!p.bottom : r.top + r.height / 2 > window.innerHeight / 2,
    };
  }
  // The candidate positions for one layer's slider boxes, in the order they should be filled:
  // down (or up) the first column, then the next column further toward the middle. A column
  // ENDS when the next box would start past the vertical centre -- that is the user's rule --
  // or when it would leave the screen, whichever comes first.
  //
  // Note the two limits are both needed and neither implies the other: on a short viewport a
  // 500px box already reaches the centre from the top edge, so the centre rule alone would
  // put every box in a column of its own; on a tall one a column would happily run off the
  // bottom of the screen before it ever reached the middle.
  function columnSpot(slot, r, w, h, g, taken) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const midY = vh / 2;
    const dir = layerGrow(slot, r);
    const stepX = w + BRK_GAP, stepY = h + BRK_GAP;
    // Column 0 sits against the layer box's centre-facing edge.
    const x0 = dir.right ? r.left - BRK_GAP - w : r.right + BRK_GAP;
    for (let col = 0; col < 12; col++) {
      const x = dir.right ? x0 - col * stepX : x0 + col * stepX;
      if (x < g.x0 || x + w > vw - BRK_EDGE) break;      // out of room sideways
      // Start of the column: level with the layer box's own anchored edge.
      let y = dir.bottom ? r.bottom - h : r.top;
      for (let i = 0; i < 24; i++) {
        if (y < g.y0 || y + h > vh - BRK_EDGE) break;    // off the screen: next column
        if (dir.bottom ? y + h < midY : y > midY) break; // crossed the middle: next column
        if (rectClear(x, y, w, h, taken)) return { x: x, y: y, right: dir.right, bottom: dir.bottom };
        y += dir.bottom ? -stepY : stepY;
      }
    }
    return null;
  }
  function placeBeside(slot, key, box) {
    if (!brkFree()) return;
    const lb = breakout.querySelector('.lyr-box[data-slot="' + slot + '"]');
    const g = brkGrid();
    const w = brkW(box, g), h = brkH(box, g);
    const taken = brkRects(box);
    // With the layer's own box open, build its column beside it. With it closed there is
    // nothing to build against, so fall back to the nearest free spot to that layer's CORNER
    // -- its sliders still gather where that layer lives rather than piling up in one column.
    const r = (lb && lb.style.display !== "none") ? lb.getBoundingClientRect() : null;
    if (r) {
      const spot = columnSpot(slot, r, w, h, g, taken);
      // The anchor is the LAYER BOX'S, not this box's own position: that is what keeps a
      // bottom-anchored layer's sliders growing upward as their content changes height.
      if (spot) { brkPos.set(key, brkAnchorAs(spot.x, spot.y, w, h, g, spot.right, spot.bottom)); return; }
    }
    const c = r ? { cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 } : cornerCentre(slot, w, h, g);
    const spot2 = nearestFree(c.cx, c.cy, w, h, g, taken);
    if (spot2) brkPos.set(key, brkAnchor(spot2.x, spot2.y, w, h, g));
  }
  // The centre of the corner this slot owns, for a box of this size. LAYER_CORNERS is read
  // left-to-right, top-to-bottom, so the slot order IS the reading order: 1 2 / 3 4.
  // Read left-to-right, top-to-bottom, so the order IS the reading order: 1 2 / 3 4. It is
  // the order corners are HANDED OUT in, not a mapping from slot to corner -- see freeCorner.
  const LAYER_CORNERS = [[0, 0], [1, 0], [0, 1], [1, 1]];   // [rightHalf, bottomHalf]
  function cornerRect(slot, w, h, g) {
    const c = LAYER_CORNERS[slot % LAYER_CORNERS.length];
    const qx = g.cw / BRK_SUB, qy = g.ch / BRK_SUB;
    // Snapped to the quarter grid so a corner box lines up with everything else, and never
    // left of the grid origin (which is the panel's right edge).
    const xMax = window.innerWidth - BRK_EDGE - w, yMax = window.innerHeight - BRK_EDGE - h;
    const x = c[0] ? g.x0 + Math.floor((xMax - g.x0) / qx) * qx : g.x0;
    const y = c[1] ? g.y0 + Math.floor((yMax - g.y0) / qy) * qy : g.y0;
    return { x: Math.max(g.x0, x), y: Math.max(g.y0, y) };
  }
  function cornerCentre(slot, w, h, g) {
    const r = cornerRect(slot, w, h, g);
    return { cx: r.x + w / 2, cy: r.y + h / 2 };
  }
  // A LAYER box opening for the FIRST time takes its slot's corner. Reopening keeps wherever
  // you last put it: the anchor survives in brkPos, and remapPopped carries "<slot>/layer"
  // through a reorder, so the box follows its LAYER rather than the position.
  // The rects of every OTHER layer box currently on the grid. Layer boxes only: a slider box
  // sitting near a corner does not mean that corner belongs to a layer, and letting one block
  // a corner would push the next layer box somewhere arbitrary.
  function otherLayerRects(box) {
    return [...breakout.querySelectorAll(":scope > .ctl.lyr-box")]
      .filter(n => n !== box && n.style.display !== "none")
      .map(n => n.getBoundingClientRect());
  }
  // The first corner in LAYER_CORNERS order that no other open layer box is sitting in. That
  // is what makes the corners go in OPENING order: the first box to open finds corner 1 free
  // and takes it, whichever layer it belongs to, and a corner freed by closing a box is
  // available to the next one opened.
  function freeCorner(slot, w, h, g, box) {
    const others = otherLayerRects(box);
    for (let i = 0; i < LAYER_CORNERS.length; i++) {
      const r = cornerRect(i, w, h, g);
      if (rectClear(r.x, r.y, w, h, others)) return r;
    }
    return cornerRect(slot, w, h, g);      // every corner busy: fall back to this slot's own
  }
  function placeLayerBox(slot, box) {
    const key = slot + "/layer";
    if (!brkFree() || brkPos.has(key)) return;
    const g = brkGrid();
    const w = brkW(box, g), h = brkH(box, g);
    const taken = brkRects(box);
    const r = freeCorner(slot, w, h, g, box);
    // The corner is the ASK, so it wins even against an overlap the user can move; but if
    // something is genuinely there (a tall box in the corner above, on a short window) fall
    // back to the nearest clear spot to it rather than stacking two boxes on one another.
    const spot = rectClear(r.x, r.y, w, h, taken) ? r : (nearestFree(r.x + w / 2, r.y + h / 2, w, h, g, taken) || r);
    const p = brkAnchor(spot.x, spot.y, w, h, g);
    // Placed NOW, not at the next layout: a second layer box opening in the same refresh
    // pass measures this one's rect, which has to be at its anchor already.
    brkPos.set(key, p); brkPlace(box, p);
  }
  function dockCtl(slot, key) {
    if (!isPopped(slot, key)) return;
    popped.delete(popKey(slot, key));            // box stays a child of #breakout, just hidden below
    syncPopBtns(slot, key);
    refreshBreakout();
  }
  function togglePop(slot, key) { isPopped(slot, key) ? dockCtl(slot, key) : popCtl(slot, key); }
  // `popped` is keyed by SLOT, so a reorder has to move its entries the way moveOpen moves the
  // fold set — you popped a LAYER's slider, not a position's. Without this the open box stayed
  // where it was and silently started showing (and editing) whichever layer slid into that slot,
  // while its "L3" title stayed right for the slot and wrong for the layer.
  function remapPopped(fn) {
    // The grid positions are keyed the same way and move with their layer for the same
    // reason the popped set does: you placed layer 2's Size box, not slot 1's.
    const posWas = [...brkPos.entries()];
    brkPos.clear();
    for (const [pk, p] of posWas) {
      const i = pk.indexOf("/"), sPart = pk.slice(0, i), k2 = pk.slice(i + 1);
      if (sPart === "s") { brkPos.set(pk, p); continue; }
      // "<slot>/layer" is a LAYER box (its whole settings block); it remaps with the rest.
      const n2 = fn(+sPart);
      if (n2 >= 0) brkPos.set(popKey(n2, k2), p);
    }
    const was = [...popped];
    popped.clear();
    for (const pk of was) {
      const i = pk.indexOf("/"), s = pk.slice(0, i), key = pk.slice(i + 1);
      if (s === "s") { popped.add(pk); continue; }        // a scene control belongs to no layer
      const n = fn(+s);
      if (n >= 0) popped.add(popKey(n, key));
    }
    // Re-derive what is on screen. Remapping the SET is not enough on its own: which box is
    // visible is decided by refreshBreakout, and the +/- glyphs by syncPopBtns, so without
    // this the entries moved and the column did not — the box stayed on its old slot and
    // carried on showing whichever layer had just slid into it.
    for (let slot = 0; slot < STACK_MAX; slot++) for (const k of POPPABLE) syncPopBtns(slot, k);
    refreshBreakout();
  }
  function movePopped(from, to) {
    remapPopped(s => { if (s === from) return to; let n = s > from ? s - 1 : s; return n >= to ? n + 1 : n; });
  }
  function dropPopped(j) { remapPopped(s => (s === j ? -1 : s > j ? s - 1 : s)); }
  // Dock everything. NOTHING CALLS THIS AUTOMATICALLY any more, and that is the point of
  // per-slot boxes: setEffect, createPreset, Delete and the preset picker all used to empty
  // the column, which is exactly what would stop two layers' boxes sitting side by side —
  // the moment you clicked the other layer to compare, both would close. The column is
  // yours to curate now; a box whose control the layer no longer uses simply hides itself
  // (refreshBreakout), and re-appears if you come back to an effect that has it.
  // Kept because it is one line to call and the obvious thing to want from a keyboard.
  function dockAll() {
    if (!popped.size) return;
    for (const pk of [...popped]) {              // snapshot: dockCtl mutates the set
      const i = pk.indexOf("/");
      dockCtl(pk[0] === "s" ? -1 : +pk.slice(0, i), pk.slice(i + 1));
    }
  }
  // #breakout holds one .ctl per POPPABLE key PER BLOCK. A box shows when ITS OWN slot/key
  // has been popped and the layer that owns it still uses that control — so boxes from
  // different layers coexist, and one whose layer changed to an effect without that slider
  // hides itself rather than lying.
  // #breakout is outside #stacklist, so a box there gets no selection from its layer's row.
  // Each box is stamped with its slot; touching or focusing one selects that layer, exactly
  // as pressing anywhere in the row does. Capture phase, so it runs before the control acts
  // and a drag started in another layer's box applies to an already-selected layer.
  for (const ev of ["pointerdown", "focusin"]) breakout.addEventListener(ev, e => {
    const box = e.target.closest(".ctl[data-slot]");
    if (!box) return;                             // a scene control's box belongs to no layer
    const slot = +box.dataset.slot;
    if (slot !== stackSel && stack[slot]) selectStack(slot);
  }, true);
  // A sweep over every box of every slot (hundreds) runs on each scene switch, and nearly all
  // of them are hidden before and after: write `display` only when it changes.
  var brkLit;                                   // the boxes refreshBreakout showed last; var: no TDZ
  function brkShow(box, vis) {
    const want = vis ? "" : "none";
    if (box.style.display !== want) box.style.display = want;
  }
  function refreshBreakout() {
    if (applyingPreset) { refreshBreakout.later = true; return; }   // laid out once by presetUiCatchUp
    let anyVisible = false;
    // Un-hide the host BEFORE anything measures: placeLayerBox reads the freshly-shown
    // box's size mid-pass, and inside a display:none host every box measures 0×0 — which
    // sent the first layer box to a "fits anywhere" phantom anchor off the screen edge.
    // The real state is restored by the toggle at the end of this function.
    breakout.classList.remove("empty");
    // The LAYER boxes: a whole layer's settings block, open while its slot is in openSlots
    // (the same set the rows' +/- toggles). Shown here so they go through the one layout
    // pass with the slider boxes and snap on the same grid.
    for (const box of brkBoxes().filter(n => n.classList.contains("lyr-box"))) {
      const slot = +box.dataset.slot;
      const vis = !!stack[slot] && openSlots.has(slot);
      brkShow(box, vis);
      if (vis) { anyVisible = true; placeLayerBox(slot, box); }
    }
    // A box can only be visible if it is POPPED, so only popped boxes are looked at, plus
    // whatever this pass lit last time (a box docked since must go down). The first pass
    // sweeps every box of every slot (STACK_MAX × POPPABLE, hundreds): the DOM's own state.
    const lit = new Set(), shownBy = [];
    const shownIn = s => shownBy[s] || (shownBy[s] = shownKeysFor(s));
    let sceneShown = null;
    const look = (slot, key) => {
      const box = slot < 0 ? el("ctl-" + key) : ctlIn(slot, "ctl-" + key);
      if (!box) return;
      let vis = false;
      if (slot >= 0) {
        // ...AND the layer has to be open. Closing a layer with the row's − now takes its
        // slider boxes down with it, which is what "close this layer" plainly means when the
        // sliders are the layer's own controls sitting around its box. Nothing is forgotten:
        // `popped` still holds which ones were out and `brkPos` still holds where each one
        // was put, so the next + brings the whole arrangement back exactly as it was.
        vis = isPopped(slot, key) && !!stack[slot] && openSlots.has(slot) && shownIn(slot).has(key);
      } else if (isPopped(-1, key)) {
        // ...and the scene controls, which have one box outside every block. Gated on the
        // UNION of every live layer's shown keys, not the selected layer's: a scene-wide
        // filter param (Bloom, Scanlines…) belongs to the whole picture, so the Strength box
        // you popped from layer 2's section must not vanish because you clicked layer 1,
        // whose chain lacks Bloom — the filter is still rendering.
        if (!sceneShown) {
          sceneShown = new Set(shownIn(stackSel));
          for (let s = 0; s < STACK_MAX; s++)
            if (s !== stackSel && stack[s]) for (const k of shownIn(s)) sceneShown.add(k);
        }
        vis = sceneShown.has(key);
      }
      if (vis) {
        lit.add(box); brkShow(box, true); anyVisible = true;
        drawStalePlot(slot < 0 ? 0 : slot, key);   // a scene control is wired in slot 0 only
      } else brkShow(box, false);
    };
    if (!brkLit) {
      for (let slot = 0; slot < STACK_MAX; slot++) for (const key of POPPABLE) look(slot, key);
      for (const key of POPPABLE) look(-1, key);
    } else {
      for (const pk of popped) {
        const i = pk.indexOf("/");
        look(pk.slice(0, i) === "s" ? -1 : +pk.slice(0, i), pk.slice(i + 1));
      }
      for (const box of brkLit) if (!lit.has(box)) brkShow(box, false);
    }
    brkLit = lit;
    breakout.classList.toggle("empty", !anyVisible);
    // Position what is now visible. After the visibility pass: a box that was display:none
    // has no measurable height, so laying out before it would stack the column on zeros.
    layoutBreakout();
  }
  // Nothing to restore any more: a box belongs to its SLOT and stays open until you close
  // it, so switching layers no longer takes any boxes away and there is nothing to put back.
  // This used to exist because setEffect emptied the column on every switch, and it had to
  // be handed the layer's list explicitly, captured before setEffect ran — setEffect ends in
  // persist() → stackOut() → freezeItem(selected), which would re-capture L.popped from the
  // just-cleared live set and wipe the stored value before it could be read. Both the field
  // and that trap are gone with the auto-clear.
  function restoreLayerUi(L, pops) {
    if (!L) return;

  }

  // A preset is a named full scene (effect + all its settings). Auto-cycle holds
  // each for a random time drawn from the Preset TTL range, then applies a random
  // *different* saved preset.
  let nextSwitch = 0;
  cycleChk.addEventListener("change", () => { cycleOn = cycleChk.checked; nextSwitch = 0; syncSceneEnabled(); });
  // Stop the cycler dead. Called when the user has just deliberately put a specific
  // scene on screen — creating a preset, or restoring a backup. Without it the next
  // tick of the TTL would swap that scene straight back out, which reads as "my new
  // preset wasn't selected" when in fact it was selected and then cycled away from.
  function stopCycling() {
    if (!cycleOn && !nextSwitch) return;
    cycleOn = false; cycleChk.checked = false; nextSwitch = 0;
    syncSceneEnabled();
  }
  function ttlMs() {
    const a = Math.min(+el("ttl-lo").value, +el("ttl-hi").value);
    const b = Math.max(+el("ttl-lo").value, +el("ttl-hi").value);
    return (a + Math.random() * (b - a)) * 1000;
  }
  // The scenes the cycler is allowed to pick from: the ticked ones (see inRotation).
  // Rebuilt per tick rather than cached — the ticks, the library and the collections all
  // change under it, and a stale pool would cycle to a scene that no longer exists.
  function rotationPool() {
    const pool = [];
    for (let i = 0; i < presets.length; i++) if (inRotation(presets[i])) pool.push(i);
    return pool;
  }
  // Auto-cycle runs whether or not the editor is on screen. It WAS gated on the panel being
  // hidden (1.5x-1.72), and that gate was reverted by request in 1.73.0: a show that stops
  // the moment you open the panel reads as a broken checkbox.
  function cyclePresets(now) {
    const pool = rotationPool();
    // Something to switch TO: two or more ticked scenes, or exactly one that isn't the one
    // already on screen (having hand-picked an unticked scene, the cycle should still take
    // you back into the show). Untick everything and the cycler simply idles — it does not
    // fall back to the whole library, because "none in the rotation" is a real choice.
    const canSwitch = pool.length > 1 || (pool.length === 1 && pool[0] !== curPreset);
    if (!cycleOn || !canSwitch || Math.max(+el("ttl-lo").value, +el("ttl-hi").value) <= 0) { nextSwitch = 0; return; }
    if (!nextSwitch) { nextSwitch = now + ttlMs(); return; }
    if (now >= nextSwitch) {
      let n; do { n = pool[(Math.random() * pool.length) | 0]; } while (n === curPreset && pool.length > 1);
      applyPreset(n, true);
      nextSwitch = now + ttlMs();
    }
  }
  el("ttl-lo").addEventListener("input", () => nextSwitch = 0);   // reschedule on retune
  el("ttl-hi").addEventListener("input", () => nextSwitch = 0);
  // Switching effect is an EDIT TO THE SELECTED PRESET, not a reason to leave it.
  //
  // This has now been all three ways round, so the reasoning is worth keeping. It used
  // to deselect (drop to "— unsaved scene —"), because the delegated autosave folded the
  // switch into the selected preset and a preset carries its own effect: pick
  // "Sirpinfyer", switch to Tunnel, and that preset became a Tunnel scene under its old
  // name. Then it auto-selected a preset belonging to the new effect, which kept you on a
  // named scene but still moved you off *your* one.
  //
  // Both were solving for the wrong thing. A preset is "my scene", and changing its
  // effect is just another edit to it — the same as moving a slider. So: stay put, and
  // fold the new effect straight in. The consequence is real and intended, not a bug to
  // re-fix later: a preset named after the effect it started as will keep that name after
  // you change the effect.
  //
  // There is no scratch mode to fall back on: a scene is ALWAYS selected, so this write
  // always lands somewhere. Press New first if you want to keep the original.
  effectSel.addEventListener("change", () => {
    setEffect(+effectSel.value);
    autosavePreset();
    persist();
    nextSwitch = 0;
  });
  // A new layer starts on the same effect as the selected one — you almost always want
  // to pick its effect next anyway, and copying the selection is a less surprising
  // starting point than an arbitrary one. It ships max/gain 1 and unmuted: three
  // additive layers at full gain clip an R8 buffer to white everywhere, which reads as
  // "the palette broke" rather than "turn the gain down".
  el("addlayer").addEventListener("click", () => {
    addStackItem(effect);
    autosavePreset();
    persist();
  });
  paletteSel.addEventListener("change", () => {
    // A manual pick must land on the palette you chose. While cycling, blend TO it from
    // what's on screen (then the cycle carries on from there) — NOT startMorph(), which
    // heads to a random OTHER palette and made a click look like it selected at random.
    if (morphing) beginMorph(paletteBase.slice(), +paletteSel.value);
    else { morphOnce = false; setPalette(+paletteSel.value); }   // manual pick cancels a one-shot morph
    syncPalSwatches();                                           // keep the preview highlight in step
  });
  // Reverse the colour order for the selected layer. Re-bakes the LUT immediately (the
  // multi-layer path re-bakes per frame via bakeLayerBytes); onEdit persists + autosaves it.
  // Accessors over ctl(), not captured nodes: there is one of these per block and the live
  // value belongs to the selected layer. Reading and writing sites stay written as they were.
  const palrevChk = { get checked() { const n = ctl("palrev"); return !!n && n.checked; },
                      set checked(v) { for (const n of ctlEach("palrev")) n.checked = v; } };
  for (let slot = 0; slot < STACK_MAX; slot++) ctlIn(slot, "palrev").addEventListener("change", () => {
    paletteReverse = palrevChk.checked;
    composePalette(0);
    paletteDirty = true;
    captureLayerExtras(stack[stackSel]);   // so the selected layer owns the new value at once
  });
  // Background (heat 0): black / white / palette. Same re-bake + capture path as reverse.
  const palbgSel = { get value() { const n = ctl("palbg"); return n ? n.value : "palette"; },
                     set value(v) { for (const n of ctlEach("palbg")) n.value = v; } };
  for (let slot = 0; slot < STACK_MAX; slot++) ctlIn(slot, "palbg").addEventListener("change", () => {
    paletteBg = bgOk(palbgSel.value);
    composePalette(0);
    paletteDirty = true;
    captureLayerExtras(stack[stackSel]);
  });
  // The Palette cycle slider replaces the old auto-morph checkbox: any edit
  // re-derives `morphing` and (re)starts or pins the blend.
  function syncMorphFromSlider() {
    const on = palCycleOn();
    if (on === morphing) return;
    morphing = on;
    if (morphing) startMorph(+paletteSel.value);
    else { morphOnce = false; setPalette(+paletteSel.value); }   // pinned: settle on the shown palette
  }
  function setPalCycle(lo, hi) {
    const a = ctl("palcycle-lo"), b = ctl("palcycle-hi");
    if (!a || !b) return;
    a.value = lo; b.value = hi;
    a.dispatchEvent(new Event("input")); b.dispatchEvent(new Event("input"));
  }
  // Per block: palcycle is a layer control, so there is one pair of thumbs per stack slot.
  for (let slot = 0; slot < STACK_MAX; slot++)
    for (const id of ["palcycle-lo", "palcycle-hi"])
      ctlIn(slot, id).addEventListener("input", syncMorphFromSlider);
  // Persist any control change (slider drag, select, checkbox) — one delegated
  // listener over the whole panel covers them all. A scene is always selected, so the edit is
  // always auto-saved into one — there is no longer a mode where it goes nowhere.
  function onEdit(e) {
    // A dev tool must never be folded into a preset. This used to be a `#diag` check, but that
    // section is gone and its one surviving toggle (the beat trace) now sits INSIDE the Beat
    // tuning box — which deliberately does not escape this listener, because its sliders are
    // per-preset scene data and must autosave. So the opt-out is per-element and explicit,
    // which also means a future dev control can live anywhere and still opt out.
    if (e.target.closest("[data-nopersist]")) return;
    if (e.target.closest(".rng-edit")) return;   // bounds fields persist via the input they dispatch on the slider
    refreshBlocked();                        // a thumb move can neutralise (or free) a dependent control
    if (persistReady && !applyingPreset && e.target.id !== "preset") autosavePreset();
    persist();
  }
  // Click a greyed (blocked) control row → flash the setting that's neutralising it, so it's
  // obvious what to change first. The +/- button is pointer-events:none while blocked, so a
  // click here can only be on the row body.
  panel.addEventListener("click", e => {
    const row = e.target.closest(".ctl-row.ctl-blocked");
    if (row && row.dataset.blocker) flashCtl(row.dataset.blocker);
  });
  // Beat chips are <button>s, so they never fire input/change and the delegated
  // listener above can't see them. Same body, minus the target-based guards.
  function chipEdited() {
    trigDirty = true;                  // arming/disarming changes which triggers the detector runs
    if (persistReady && !applyingPreset) autosavePreset();
    persist();
  }
  panel.addEventListener("input", onEdit);
  panel.addEventListener("change", onEdit);
  breakout.addEventListener("input", onEdit);    // popped controls live outside #panel — persist their edits too
  breakout.addEventListener("change", onEdit);

  // The old bottom-of-tab "Reset this effect" button is gone — the per-tab ↺ Reset in the
  // tools row (resetTab, above) replaced it by request. resetControl covers what it did per
  // slider (value, range, chips, pulse); what it alone reached — extras (palette, morph,
  // show-box, TTL) and the beat-tuning map — is deliberately no longer one button away.

  // Beat chips dominate the share blob: every control × L/M/H for every effect,
  // almost all false — ~90% of the JSON, which pushed share URLs past 49k chars.
  // That's long enough that chat clients truncate the link (a truncated ?s= just
  // fails JSON.parse and silently opens the default scene) and TinyURL rejects it
  // outright. So send only the chips that DIFFER from the effect's own default
  // selection: applyBlob skips ids/bands a blob doesn't mention, leaving them at
  // the default the state was seeded with, so a diff decodes to the same thing.
  // Pruning is share-only — localStorage and Backup have no length limit and stay
  // verbose, and an older full blob still loads unchanged (a superset of a diff).
  function pruneBeats(all) {
    const out = {};
    for (const e in all) {
      const def = presetBeat(e), keep = {};
      for (const id in all[e]) {
        const cur = all[e][id], d = def[id], diff = {};
        for (const band of ["low", "mid", "high"]) if (!d || cur[band] !== d[band]) diff[band] = cur[band];
        if (Object.keys(diff).length) keep[id] = diff;
      }
      if (Object.keys(keep).length) out[e] = keep;
    }
    return out;
  }
  // Same idea for pulse shapes: keep only sliders whose shape differs from the
  // effect's default (almost always "snap"), so they cost nothing in the common case.
  function prunePulses(all) {
    const out = {};
    for (const e in all) {
      const def = presetPulse(e), keep = {};
      for (const id in all[e]) if (all[e][id] !== (def[id] || PULSE_DEFAULT)) keep[id] = all[e][id];
      if (Object.keys(keep).length) out[e] = keep;
    }
    return out;
  }
  // ...and for pulse lengths (almost always the default PULSE_DROP).
  function prunePlens(all) {
    const out = {};
    for (const e in all) {
      const def = presetPlen(e), keep = {};
      for (const id in all[e]) if (all[e][id] !== (def[id] || PULSE_DROP)) keep[id] = all[e][id];
      if (Object.keys(keep).length) out[e] = keep;
    }
    return out;
  }
  // ...and for the per-slider detector thresholds. The map is already sparse — only an
  // OVERRIDDEN slider has an entry at all — so this just drops the empty effects rather than
  // comparing against a default. Same job as the two above: keep the share URL short.
  function pruneBtunes(all) {
    const out = {};
    for (const e in all) if (all[e] && Object.keys(all[e]).length) out[e] = all[e];
    return out;
  }

