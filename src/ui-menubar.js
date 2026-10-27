  // ---- top-row popovers -------------------------------------------------------------
  // The ☰ fold-out menubar is GONE (by request): every item it held is a button in #toprow.
  // Three of those open a POPOVER from here — ♪ the Audio box, the profile button the Cloud
  // profile box, © the credits — and two act directly (Tutorial, Help). Resolution, Controls
  // panel, Fullscreen and Hide all UI went with the menu: ⚙ and ⛶ were already buttons, and
  // M / F / H still work.
  //
  // A POPOVER ADOPTS THE EXISTING NODES rather than rebuilding them. `#audiobox`, `#cloudbox`
  // and `#creditbox` are authored in the panel markup and moved in here, which is the same
  // trick buildFilterUI uses to pull `#ctl-<key>` into a filter body. That is not laziness —
  // it is what keeps every listener, every `el(id)` lookup and every sync path (setAudioUI,
  // cloudSync, the Google sign-in button rendered into #cloud-signin) working with no
  // changes at all. Rebuilding this markup here would mean re-wiring the whole cloud module.
  //
  // Runs LAST in the manifest: by the time it moves anything, every other slice has already
  // found its elements and attached its listeners. Moving a node never detaches a listener,
  // so the order only matters for code that looks nodes up at startup.

  // #menubar keeps its id although it holds no menu any more: every rule that styles an
  // adopted block names it ("#panel …, #breakout …, #menubar …").
  const menubar = el("menubar");
  let pop = null;                     // {el, btn} while a popover is open

  // Put the adopted block back where it came from before its popover is destroyed.
  // WITHOUT THIS, closing deletes the real audio buttons, #cloudrow and the credits list
  // from the document — they are MOVED here, not copied, so discarding the popover discards
  // them and nothing that looks them up by id works again.
  function returnAdopted(root) {
    for (const box of root.querySelectorAll(".mb-adopt")) {
      const home = el(box.dataset.adopt);
      if (!home) continue;
      while (box.firstChild) home.appendChild(box.firstChild);
      home.hidden = true;
    }
  }

  function popClose() {
    if (!pop) return null;
    // Where focus is has to be read BEFORE the popover is torn out from under it, or the
    // node it is on is already detached and document.activeElement has fallen back to <body>.
    const hadFocus = menubar.contains(document.activeElement);
    const { el: p, btn } = pop;
    pop = null;
    returnAdopted(p);
    p.remove();
    menubar.classList.add("hidden");
    menubar.textContent = "";
    btn.setAttribute("aria-expanded", "false");
    if (hadFocus) btn.focus();          // ...back to the button that opened it
    return btn;
  }

  // Open `adopt`'s block under `btn`; a second press on the same button closes it.
  function popOpen(btn, adopt, label) {
    if (popClose() === btn) return;
    menubar.classList.remove("hidden");
    const p = document.createElement("div");
    p.className = "mb-panel";
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-label", label);
    const box = document.createElement("div");
    box.className = "mb-adopt";
    box.dataset.adopt = adopt;          // returnAdopted needs to know where home is
    const src = el(adopt);
    if (src) { src.hidden = false; while (src.firstChild) box.appendChild(src.firstChild); }
    // Opening IS the moment anything time-dependent inside gets refreshed — the cloud box
    // reports how long ago the last save was, and a minute-old number is what you would read.
    if (adopt === "cloudbox" && typeof autoSaveSyncInfo === "function") autoSaveSyncInfo();
    p.appendChild(box);
    // Clicks inside are the block's own business: they must not reach the closer below.
    p.addEventListener("click", e => e.stopPropagation());
    menubar.appendChild(p);
    // Under the button, clamped so it never runs off screen.
    const a = btn.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
    p.style.left = Math.max(8, Math.min(a.left, innerWidth - w - 8)) + "px";
    p.style.top = Math.max(8, Math.min(a.bottom + 6, innerHeight - h - 8)) + "px";
    pop = { el: p, btn };
    btn.setAttribute("aria-expanded", "true");
    // Step in, or a keyboard user opens the box and is left standing outside it.
    const first = box.querySelector('button:not([disabled]), select, input:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (first) first.focus({ preventScroll: true });
  }

  el("mute").addEventListener("click", () => popOpen(el("mute"), "audiobox", "Audio"));
  el("profbtn").addEventListener("click", () => popOpen(el("profbtn"), "cloudbox", "Cloud profile"));
  el("credbtn").addEventListener("click", () => popOpen(el("credbtn"), "creditbox", "Credits"));
  el("tourbtn").addEventListener("click", () => openTutorial(false));
  el("helpbtn").addEventListener("click", () => openHelp());

  // #menubar is a full-screen overlay that CATCHES clicks while open, so clicking away
  // closes the popover instead of falling through to the canvas and pausing the animation.
  // It also covers the top row (z 12 against 10), so a press on ANOTHER top-row button is
  // handed on to it: one click moves from ♪ to ©. The button that opened this one is not —
  // pressing it again only closes.
  menubar.addEventListener("click", e => {
    const was = popClose();
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const b = under && under.closest ? under.closest("#toprow > button") : null;
    if (b && b !== was) b.click();
  });
  window.addEventListener("keydown", e => {
    if (e.key === "Escape" && pop) popClose();
  });
