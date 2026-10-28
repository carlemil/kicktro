  // ---- Beat-trace toggle ----
  // Lives in the Beat tuning box now, next to the thresholds it exists to help you set. It
  // carries data-nopersist, because that box (unlike the old Diagnostics section) deliberately
  // does NOT escape onEdit — its sliders are per-preset scene data and must autosave, so a dev
  // tool sitting among them has to opt out by hand or it gets folded into the preset too.
  //
  // The frame + FPS counter has no toggle any more: H (hide all chrome) already governs it via
  // body.ui-hidden, and a second control for the same thing was only ever a way for the two to
  // disagree. `#frames.hidden` survives in the CSS as the mechanism ?hideui/H drive.
  el("diagTrace").checked = dbg.on;
  el("diagTrace").addEventListener("change", e => dbgToggle(e.target.checked));

  // Hide-all-UI mode: strip every button, the fps counter and every popover for a clean
  // capture — from ?hideui in the URL, or the "h" key. Transient (never persisted); the menu's
  // own open/closed state is untouched, so bringing the UI back restores it exactly.
  // `quiet` suppresses the way-back hint. Hiding the UI removes the panel footer that names
  // the H key, so an interactive hide has to say how to undo itself or it reads as a crash —
  // but ?hideui exists for headless screenshots, where anything drawn over the visual is the
  // bug. Hence: hint on H, silence on the URL.
  const uiHint = el("uihint");
  var uiHintTimer = 0;
  var uiHintBack = "";        // the shipped "Press H…" markup, captured on first use
  // With a `msg` this is a general one-line toast, and it is the only place in the app that
  // can report anything without a panel, a menu or a dialog being open — it is `position:
  // fixed`, aria-live, and exempt from `body.ui-hidden`. That makes it the right home for
  // feedback from a KEY, which can be pressed with the whole UI hidden (see toggleMute).
  //
  // A function DECLARATION looking its node up rather than closing over `uiHint`: earlier
  // slices call this, and only declarations hoist across the one IIFE. `uiHintBack` is a
  // `var` filled lazily for the same reason — a const captured at slice time would be in the
  // TDZ for any caller above. Same rule as tutorialOpen.
  // `sticky` leaves the message up until the caller takes it down with hideUiHint(). For a
  // wait whose LENGTH IS NOT KNOWN IN ADVANCE, the 2.2s timeout below is worse than nothing:
  // the shared-3D-world link takes 3.5s for two effects and up to a minute for five, so the
  // explanation vanished while the user was still staring at the thing it explained.
  function flashUiHint(msg, sticky) {
    const n = document.getElementById("uihint");
    if (!n) return;
    clearTimeout(uiHintTimer);
    if (!uiHintBack) uiHintBack = n.innerHTML;          // capture before the first overwrite
    n.innerHTML = msg === undefined ? uiHintBack : String(msg);
    n.classList.remove("hidden", "fading");
    if (sticky) return;                                  // the caller owns dismissal
    // Two stages: hold, then fade, then take it out of the layout entirely so it can never
    // catch a late screenshot.
    uiHintTimer = setTimeout(() => {
      n.classList.add("fading");
      uiHintTimer = setTimeout(() => n.classList.add("hidden"), 600);
    }, 2200);
  }
  function hideUiHint() {
    if (!uiHint) return;
    clearTimeout(uiHintTimer);
    uiHint.classList.add("hidden");
    uiHint.classList.remove("fading");
  }
  function setUiHidden(h, quiet) {
    // Hiding the chrome display:none's every dialog, INCLUDING the four modal ones -- but the
    // focus trap dlgModal installed is a document listener and knew nothing about it. With a trap
    // armed on an invisible box, dlgFocusable finds nothing (it filters on offsetWidth/Height,
    // both 0), takes its "no focusable children" branch and swallows every Tab: the keyboard went
    // dead page-wide with nothing on screen to explain it. Release the trap on the way down.
    if (h) dlgRelease();
    document.body.classList.toggle("ui-hidden", h);
    if (h && !quiet) flashUiHint(); else hideUiHint();
  }
  {
    const v = new URLSearchParams(location.search).get("hideui");
    if (v !== null && !/^(0|false|off|no)$/i.test(v)) setUiHidden(true, true);
  }

  window.addEventListener("keydown", e => {
    // A MODIFIED KEY IS A BROWSER SHORTCUT, NOT OURS. e.key is "f" for both f and Ctrl+F, so
    // without this Ctrl+F (find) threw the page into fullscreen and Ctrl+S (save) muted the beat
    // reaction while the save dialog opened. e.repeat likewise: holding a key toggled at the OS
    // repeat rate.
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    // ESCAPE IS HANDLED FIRST, ABOVE the typing guard below. That guard exists to stop m/f/s/h
    // eating characters in a field -- it has no business swallowing Escape, and it did: tab onto
    // any checkbox in the focus-trapped Restore dialog (six of them) and Escape stopped working,
    // leaving a modal you could only leave by finding the × with more Tab presses.
    // Keep this list complete — the gallery and the sync nudge were both missing from it for a
    // release, closable by mouse only, which is the same way the .pal-close and ui-hidden
    // selector lists have each rotted. tools/uiprobe.js asserts every dialog id turns up here.
    if (e.key === "Escape") {
      if (signInOpen()) { closeSignIn(); return; }   // over the gallery: only the top one goes
      closeHelp(); closeRestore(); closePalDetail(); closePalEditor(); closePalPick();
      closeFilterPicker(); closeTransPick(); closeSignIn(); closeErrors(); galOpen(false); dismissSyncIfOpen(); closeTutorial();
      cardWanted = false; cardOpen(false);
      return;
    }
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;   // don't eat typing in fields
    // The one menu (dev tools live inside it now). Hide the floating tool popups — the Orbit
    // editor and the Palette inspector — along with it, so M gives a clean view.
    if (e.key === "m" || e.key === "M") { cardWanted = false; cardOpen(false); closePalDetail(); closePalEditor(); closePalPick(); closeFilterPicker(); closeTransPick(); setPanel(!panel.classList.contains("hidden")); }
    else if (e.key === "f" || e.key === "F") toggleFullscreen();
    // S for sound — M would be the video-player convention, but it is the menu here.
    else if (e.key === "s" || e.key === "S") toggleMute();
    else if (e.key === "h" || e.key === "H") setUiHidden(!document.body.classList.contains("ui-hidden"));   // hide/show all chrome
  });

