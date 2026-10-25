  // ---- ☰ fold-out menubar ------------------------------------------------------------
  // A traditional multi-level menu: the ☰ opens a root list, items with a ▸ open a submenu
  // beside it, and those can nest again (Audio ▸ Capture). It holds what used to be
  // the panel's Audio, Resolution, Cloud profile and Credits boxes, plus the Controls panel toggle —
  // the ☰ no longer toggles the panel itself, so this is where that lives (the "m" key still
  // does it directly, which is the fast route).
  //
  // THE LEAF PANELS ADOPT THE EXISTING NODES rather than rebuilding them. `#audiobox`,
  // `#resbox`, `#cloudbox` and `#creditbox` are authored in the panel markup and moved in here,
  // which is the same trick buildFilterUI uses to pull `#ctl-<key>` into a filter body. That
  // is not laziness — it is what keeps every listener, every `el(id)` lookup and every sync
  // path (setAudioUI, cloudSync, the Google sign-in button rendered into #cloud-signin)
  // working with no changes at all. Rebuilding this markup here would mean re-wiring the
  // whole cloud module.
  //
  // Runs LAST in the manifest: by the time it moves anything, every other slice has already
  // found its elements and attached its listeners. Moving a node never detaches a listener,
  // so the order only matters for code that looks nodes up at startup.

  const menubar = el("menubar");

  // One open path, from the root down: menuPath[0] is the root panel, [1] its open submenu,
  // and so on. Opening an item at depth d closes everything at depth > d, which is what
  // makes hovering across siblings behave like a real menu.
  let menuPath = [];

  function menubarOpen() { return !menubar.classList.contains("hidden"); }

  // Put every adopted block back where it came from before its panel is destroyed.
  // WITHOUT THIS, closing the menu deletes the real audio buttons, the resolution select,
  // #cloudrow and the credits list from the document — they are MOVED here, not copied, so
  // discarding the panel discards them and nothing that looks them up by id works again.
  // (Caught by the probe reopening the menu and finding an empty panel.)
  function returnAdopted(root) {
    for (const box of root.querySelectorAll(".mb-adopt")) {
      const home = el(box.dataset.adopt);
      if (!home) continue;
      while (box.firstChild) home.appendChild(box.firstChild);
      home.hidden = true;
    }
  }

  function menuCloseFrom(depth) {
    while (menuPath.length > depth) {
      const p = menuPath.pop();
      returnAdopted(p.el);
      p.el.remove();
      if (p.owner) p.owner.classList.remove("open");
    }
  }

  function menubarClose() {
    // Where focus is has to be read BEFORE the panels are torn out from under it, or the
    // node it is on is already detached and document.activeElement has fallen back to <body>.
    const hadFocus = menubar.contains(document.activeElement);
    menuCloseFrom(0);
    menubar.classList.add("hidden");
    returnAdopted(menubar);        // belt and braces: nothing should be left, but if a panel
    menubar.textContent = "";      // ever escapes menuPath this stops it taking the DOM with it
    el("toggle").setAttribute("aria-expanded", "false");
    el("toggle").setAttribute("aria-label", "Open the menu");
    if (hadFocus) el("toggle").focus();     // ...back to the button that opened it
  }

  // Build one panel of items and place it. `anchor` is the element it hangs off: the ☰ for
  // the root, the parent item for a submenu.
  function menuPanel(items, anchor, depth) {
    menuCloseFrom(depth);
    const p = document.createElement("div");
    p.className = "mb-panel";
    // GROUP, not a nested menu. role="menu" permits only menuitem/group/separator children,
    // and these panels host adopted blocks -- the audio buttons, the resolution <select>, the
    // whole cloud form -- which are none of those. Declaring "menu" made the tree invalid and
    // told assistive tech to expect items it would never find. A group carries the same
    // labelling and imposes no such contract.
    p.setAttribute("role", "group");
    items.forEach(it => p.appendChild(menuItem(it, p, depth)));
    menubar.appendChild(p);

    // Position: the root drops below the ☰, a submenu opens to the right of its parent item.
    // Measured after insertion, then flipped/clamped so a deep submenu cannot run off screen.
    const a = anchor.getBoundingClientRect();
    const w = p.offsetWidth, h = p.offsetHeight;
    let left = depth === 0 ? a.left : a.right - 4;
    let top = depth === 0 ? a.bottom + 6 : a.top;
    if (left + w > innerWidth - 8) left = depth === 0 ? Math.max(8, innerWidth - w - 8) : Math.max(8, a.left - w + 4);
    if (top + h > innerHeight - 8) top = Math.max(8, innerHeight - h - 8);
    p.style.left = left + "px";
    p.style.top = top + "px";

    menuPath.push({ el: p, owner: depth === 0 ? null : anchor });
    return p;
  }

  // An item is one of:
  //   {label, sub: [...]}        — opens a submenu
  //   {label, run: fn}           — an action; closes the menu unless `keep` is set
  //   {label, check: () => bool, run: fn}  — a tick that stays open
  //   {adopt: "elementId"}       — moves that element's CHILDREN in as the panel body
  //   {sep: true}                — a rule
  function menuItem(it, panel, depth) {
    if (it.sep) {
      const s = document.createElement("div");
      s.className = "mb-sep";
      return s;
    }
    if (it.adopt) {
      // The adopted block is menu CONTENT, not a menu item: it keeps its own controls and
      // its own event handling, so clicks inside must not close the menu or open a sibling.
      const box = document.createElement("div");
      box.className = "mb-adopt";
      box.dataset.adopt = it.adopt;          // returnAdopted needs to know where home is
      const src = el(it.adopt);
      if (src) { src.hidden = false; while (src.firstChild) box.appendChild(src.firstChild); }
      // Building this panel IS the moment it is opened, so it is where anything time-dependent
      // inside it gets refreshed -- the cloud box reports how long ago the last save was, and
      // a minute-old number is exactly what you would be reading.
      if (it.adopt === "cloudbox" && typeof autoSaveSyncInfo === "function") autoSaveSyncInfo();
      box.addEventListener("click", e => e.stopPropagation());
      return box;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mb-item" + (it.sub ? " mb-sub" : "");
    // menuitemCHECKBOX for the ones that toggle, plain menuitem for the ones that act.
    // A tick drawn as a text span is visible but says nothing to a screen reader -- the state
    // has to be aria-checked on a role that admits it, and role="menuitem" does not.
    b.setAttribute("role", it.check ? "menuitemcheckbox" : "menuitem");
    if (it.check) b.setAttribute("aria-checked", it.check() ? "true" : "false");
    if (it.title) b.title = it.title;
    const lab = document.createElement("span");
    lab.className = "mb-lab";
    lab.textContent = it.label;
    b.appendChild(lab);
    if (it.check) {
      const t = document.createElement("span");
      t.className = "mb-tick";
      t.textContent = it.check() ? "✓" : "";
      b.setAttribute("aria-checked", it.check() ? "true" : "false");
      b.appendChild(t);
    }
    if (it.sub) {
      const c = document.createElement("span");
      c.className = "mb-chev";
      c.textContent = "▸";
      b.appendChild(c);
      // Open on hover as well as click — the hover is what makes it feel like a menubar,
      // and the click is what makes it work on a touchscreen.
      // `focusFirst` separates the two: a hover must NOT move focus (the pointer is doing the
      // navigating), while a click or an Enter/▸ press must, or a keyboard user opens a
      // submenu and is left standing outside it. It is applied whether or not the panel was
      // already open, so ▸ on an open submenu still steps into it.
      const open = focusFirst => {
        if (!b.classList.contains("open")) {
          [...panel.querySelectorAll(".mb-item.open")].forEach(o => o.classList.remove("open"));
          b.classList.add("open");
          menuPanel(typeof it.sub === "function" ? it.sub() : it.sub, b, depth + 1);
        }
        if (!focusFirst) return;
        // A panel built at depth d lives at menuPath[d] — menuPanel closes back to d, then
        // pushes. The first focusable is a menu item, or the first control of an adopted
        // block for a leaf like Audio.
        const p = menuPath[depth + 1];
        const first = p && p.el.querySelector('.mb-item, button, select, input, [tabindex]:not([tabindex="-1"])');
        if (first) first.focus();
      };
      b.addEventListener("mouseenter", () => open(false));
      b.addEventListener("click", e => { e.stopPropagation(); open(true); });
    } else {
      // A leaf closes everything deeper on hover, so moving from an open submenu onto a
      // plain sibling collapses it rather than leaving two panels open at once.
      b.addEventListener("mouseenter", () => {
        [...panel.querySelectorAll(".mb-item.open")].forEach(o => o.classList.remove("open"));
        menuCloseFrom(depth + 1);
      });
      b.addEventListener("click", e => {
        e.stopPropagation();
        if (it.run) it.run();
        if (it.check) {
          const on = it.check();
          b.querySelector(".mb-tick").textContent = on ? "✓" : "";
          b.setAttribute("aria-checked", on ? "true" : "false");   // the tick alone is mute
        }
        else if (!it.keep) menubarClose();
      });
    }
    return b;
  }

  // The menu itself. `sub` may be a function so a submenu is built fresh each time it opens
  // — the cloud entries in particular depend on whether you are signed in right now.
  function menuModel() {
    return [
      { label: "Controls panel", title: "Show or hide the sliders (also the M key)",
        check: () => !panel.classList.contains("hidden"),
        run: () => setPanel(!panel.classList.contains("hidden")) },
      { label: "Fullscreen", title: "Toggle fullscreen (also the F key)",
        check: () => !!document.fullscreenElement, run: () => toggleFullscreen() },
      // Through setUiHidden, not a bare classList.add: that route also raises the "press H to
      // bring the UI back" hint, and this menu item is the one place you can strip the chrome
      // without already knowing the key — the menu is the first thing to disappear.
      { label: "Hide all UI", title: "Strip every button and the menu for a clean capture (also the H key)",
        run: () => setUiHidden(true) },
      { sep: true },
      // Audio and Resolution are ROOT items. They were under a "System" parent, which bought
      // one more hover to reach the two settings anyone actually opens this menu for, and
      // grouped them under a word that describes neither. Each still needs its own adopt host
      // (#audiobox, #resbox) — that never depended on the parent.
      { label: "Audio", sub: [{ adopt: "audiobox" }] },
      { label: "Resolution", sub: [{ adopt: "resbox" }] },
      { label: "Cloud profile", sub: [{ adopt: "cloudbox" }] },
      // A ROOT item, not a row inside Cloud profile: the gallery is readable signed out
      // (GET /api/profiles needs no account), so filing it under a sign-in box implied an
      // account was needed. Gated on cloudOn() for the same reason #cloudrow is — with no
      // apiBase there is nothing to browse. Calls galOpen directly; the app is one
      // IIFE and this slice runs last, so the function is simply in scope.
      ...(cloudOn() ? [{ label: "Public scenes", title: "Browse the scenes other people have published, and load them",
        run: () => galOpen(true) }] : []),
      { label: "Credits", sub: [{ adopt: "creditbox" }] },
      { sep: true },
      // Above Help deliberately: the tour is the thing you want when you do not yet know
      // what to look up, and Help is the reference you reach for once you do.
      //
      // Opened in a MICROTASK, not inline. A leaf's click handler runs `run()` and *then*
      // menubarClose(), which destroys the panel this button lives in — so opening a modal
      // inline has dlgModal record a menu item that is detached a moment later as the place
      // to put focus back. dlgRelease skips a disconnected node, and Escape then leaves
      // focus nowhere. Deferring lets the menu tear down first, so focus is already back on
      // the ☰ when the trap arms and Escape returns it there.
      { label: "Tutorial", title: "The eight-step tour of what everything here does",
        run: () => Promise.resolve().then(() => openTutorial(false)) },
      { label: "Help", title: "What the controls do — the full help panel", run: () => openHelp() },
    ];
  }

  function menubarToggle() {
    if (menubarOpen()) { menubarClose(); return; }
    menubar.classList.remove("hidden");
    menubar.textContent = "";
    menuPath = [];
    const root = menuPanel(menuModel(), el("toggle"), 0);
    el("toggle").setAttribute("aria-expanded", "true");
    el("toggle").setAttribute("aria-label", "Close the menu");
    // Step into the menu. Without this the ☰ is openable from the keyboard but its contents
    // are not reachable without tabbing past everything behind it.
    const first = root.querySelector(".mb-item");
    if (first) first.focus();
  }

  // Arrow-key navigation. The root declares role="menu" and its items menuitem /
  // menuitemcheckbox, so it has to
  // behave like one — announcing a menu widget that only responds to the mouse is worse than
  // not announcing it at all. Delegated on #menubar, because the panels are created and
  // destroyed as you move between levels.
  //
  // Items are left in the natural tab order rather than given a roving tabindex: the leaf
  // panels here are not menu items at all but whole adopted control blocks (the audio
  // buttons, the resolution select, the cloud sign-in form), and those have to stay tabbable.
  // Arrow keys are an addition to Tab here, not a replacement for it.
  menubar.addEventListener("keydown", e => {
    if (!e.target.closest) return;
    const item = e.target.closest(".mb-item");
    if (!item || !menubar.contains(item)) {
      // Focus is inside an adopted block — the audio buttons, the resolution select, the
      // cloud form. Those are ordinary controls and the arrow keys belong to THEM: ◂ and ▸
      // move a select's option and a range's value, so hijacking them here would break the
      // resolution picker. The one exception is ◂ off a plain button, which is the only way
      // back up a level; Escape otherwise closes the whole menu and loses your place.
      if (e.key !== "ArrowLeft") return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      const host = e.target.closest(".mb-panel");
      const hd = menuPath.findIndex(p => p.el === host);
      if (hd <= 0) return;
      e.preventDefault();
      const back = menuPath[hd].owner;
      menuCloseFrom(hd);
      if (back) back.focus();
      return;
    }
    const panelEl = item.parentElement;
    const items = [...panelEl.querySelectorAll(":scope > .mb-item")];
    const i = items.indexOf(item);
    const go = j => { const t = items[(j + items.length) % items.length]; if (t) t.focus(); };
    if (e.key === "ArrowDown") { e.preventDefault(); go(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); go(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(items.length - 1); }
    else if (e.key === "ArrowRight") {
      if (!item.classList.contains("mb-sub")) return;
      e.preventDefault();
      item.click();                                  // the same open(true) the mouse uses
    } else if (e.key === "ArrowLeft") {
      const d = menuPath.findIndex(p => p.el === panelEl);
      if (d <= 0) return;                            // already at the root: nothing to go back to
      e.preventDefault();
      const owner = menuPath[d].owner;
      menuCloseFrom(d);
      if (owner) owner.focus();
    }
  });

  // #menubar is a full-screen overlay that CATCHES clicks while open, so clicking away
  // closes the menu instead of falling through to the canvas and pausing the animation.
  // Panels stopPropagation, so a click on an item never reaches this.
  menubar.addEventListener("click", () => menubarClose());
  window.addEventListener("keydown", e => {
    if (e.key === "Escape" && menubarOpen()) menubarClose();
  });
