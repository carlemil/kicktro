  // ---- First-run tutorial -------------------------------------------------------------
  // An eight-step tour of what the app is, shown ONCE ever and then living in the ☰ menu
  // so it can be re-read. It exists because #help is a REFERENCE — a per-effect blurb list
  // keyed off helpTags — and never opens by itself, so a first-time visitor met a running
  // four-layer scene, a dense panel, and thirty seconds later a popup asking to capture
  // their screen. This runs first and explains what they are looking at.
  //
  // Three things make it behave rather than just appear:
  //   * It waits out the CREDITS (rendered time, see credits.js) so the opening frame is
  //     clean — a modal backdrop over the burn-in is a poor first impression.
  //   * It HOLDS the "Sync with your music" nudge while it is up (syncResetDelay below and
  //     the tutorialOpen() guards in the sync block), so the two can never stack. dlgModal
  //     deliberately releases any existing trap, so a nudge opening over this would steal
  //     the keyboard and leave the tutorial visible but dead.
  //   * Its "seen" flag is its OWN localStorage key, not scene data — the same treatment
  //     the credits and scene-banner preferences get. It is a property of this browser,
  //     not of a scene, and must not ride in a share link or a backup.
  const TUT_KEY = "burnTheWeb.tutorial.v1";   // FROZEN PREFIX: the old app name. Renaming the key orphans existing data.
  // Wall-clock backstop for the credits gate, in seconds of VISIBLE time. `?credits=600`
  // parks the credits deliberately and a paused scene stops the rendered clock dead, so
  // without this the tutorial could simply never arrive.
  const TUT_MAX_WAIT = 20;

  // Schematic line art, one per step. Inline SVG strings on currentColor in the style of
  // EYE_OPEN/EYE_SHUT (boot-globals.js) — a few strokes each, not illustrations: they are
  // there to give the eye something to land on while reading, and to make eight steps of
  // prose feel like eight different things.
  const TUT_ART = {
    // No outer frame on this one: the art stage in the dialog is already a bordered box, and
    // a rect inside it read as a box in a box.
    canvas:
      '<svg viewBox="0 0 200 86" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">'
      + '<path d="M100 82c-19 0-33-13-33-29 0-18 17-25 17-41 0 8 7 12 12 18 7-8 4-17 4-17 14 10 33 23 33 40 0 16-14 29-33 29z"/>'
      + '<path d="M100 82c-9 0-16-7-16-15 0-9 11-13 11-24 6 7 21 15 21 24 0 8-7 15-16 15z" opacity=".55"/>'
      + '</svg>',
    menus:
      '<svg viewBox="0 0 200 86" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">'
      + '<rect x="10" y="8" width="58" height="70" rx="6"/>'
      + '<path d="M20 24h38M20 36h38M20 48h26M20 60h32" opacity=".55"/>'
      + '<rect x="160" y="8" width="30" height="24" rx="6"/>'
      + '<path d="M167 16h16M167 20h16M167 24h16"/>'
      + '<rect x="120" y="40" width="70" height="38" rx="6" opacity=".55"/>'
      + '<path d="M130 52h50M130 62h34" opacity=".45"/>'
      + '</svg>',
    scenes:
      '<svg viewBox="0 0 200 86" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">'
      + '<rect x="24" y="10" width="152" height="18" rx="5" opacity=".45"/>'
      + '<rect x="24" y="34" width="152" height="18" rx="5"/>'
      + '<rect x="24" y="58" width="152" height="18" rx="5" opacity=".45"/>'
      + '<path d="M34 43l6 6 12-13"/>'
      + '<path d="M40 19h64M62 43h64M40 67h64" opacity=".4"/>'
      + '</svg>',
    layers:
      '<svg viewBox="0 0 200 86" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">'
      + '<rect x="52" y="50" width="112" height="26" rx="6" opacity=".4"/>'
      + '<rect x="42" y="34" width="112" height="26" rx="6" opacity=".65"/>'
      + '<rect x="32" y="18" width="112" height="26" rx="6"/>'
      + '</svg>',
    slider:
      '<svg viewBox="0 0 200 86" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">'
      + '<path d="M20 40h160" opacity=".35"/>'
      + '<path d="M64 40h72"/>'
      + '<circle cx="64" cy="40" r="8"/><circle cx="136" cy="40" r="8"/>'
      + '<rect x="88" y="56" width="24" height="20" rx="5" opacity=".5"/>'
      + '<path d="M94 66h12M100 60v12" opacity=".8"/>'
      + '</svg>',
    filters:
      '<svg viewBox="0 0 200 86" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">'
      + '<rect x="44" y="6" width="112" height="16" rx="5"/>'
      + '<rect x="44" y="26" width="112" height="16" rx="5"/>'
      + '<path d="M24 50h152" stroke-dasharray="5 5" opacity=".7"/>'
      + '<rect x="44" y="58" width="112" height="16" rx="5" opacity=".6"/>'
      + '</svg>',
    music:
      '<svg viewBox="0 0 200 86" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">'
      + '<path d="M14 43h12l6-16 8 34 8-26 7 14 6-6h14" opacity=".7"/>'
      + '<rect x="96" y="28" width="26" height="30" rx="6"/>'
      + '<rect x="128" y="28" width="26" height="30" rx="6" opacity=".7"/>'
      + '<rect x="160" y="28" width="26" height="30" rx="6" opacity=".45"/>'
      // Empty boxes read as nothing; the letters are what make them the L/M/H chips the
      // step is talking about. fill/stroke reversed — the root sets stroke-only.
      + '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="15" text-anchor="middle">'
      + '<text x="109" y="49">L</text><text x="141" y="49" opacity=".7">M</text>'
      + '<text x="173" y="49" opacity=".45">H</text></g>'
      + '</svg>',
    share:
      '<svg viewBox="0 0 200 86" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M50 58a17 17 0 0 1 2-34 25 25 0 0 1 46 6 15 15 0 0 1-3 28z" opacity=".6"/>'
      + '<path d="M74 76V34M74 34l-9 9M74 34l9 9"/>'
      // Two offset capsules read as a chain link at this size; a proper interlocking glyph
      // turns to mush below about 40px.
      + '<rect x="126" y="34" width="34" height="16" rx="8" opacity=".5"/>'
      + '<rect x="146" y="50" width="34" height="16" rx="8" opacity=".5"/>'
      + '</svg>',
  };

  // The tour. `head` is the step's own title (an <h3> — the <h2> stays constant so the
  // sticky header never reflows), `body` is HTML.
  const TUT_STEPS = [
    { head: "A visual that runs in your browser", art: TUT_ART.canvas,
      // The count is real and worth keeping real — it is the one number here that dates the
      // tour. `node -e` over the EFFECTS literal in the built file gives it.
      body: "Kicktro is a demoscene visual — fifty-odd effects (fractals, plasmas, tunnels, "
        + "raymarched solids, flocking birds, slime moulds) all sharing one palette, glow and "
        + "beat-reactive pipeline. Nothing is installed and nothing is uploaded; the whole thing is "
        + "this one page. <b>Click the picture to pause it</b>, and click again to carry on." },
    // SECOND, not last. This is the headline feature and the one people never find on their
    // own, so it comes before the furniture — the tour is not a manual read in order, it is
    // a chance to say the important thing while anyone is still reading. It forward-refers to
    // sliders and their chips, which is why it says so; the slider step then lands as the
    // answer to a question already asked. The audio nudge follows ~30s later as the actual
    // call to action, so this step deliberately explains rather than asks.
    { head: "It reacts to your music", art: TUT_ART.music,
      body: "The thing to know first: Kicktro <b>pulses in time with whatever you are listening "
        + "to</b>. Turn on an audio source from <b>☰ → Audio</b> — <b>Capture</b> shares the sound of a "
        + "tab (Spotify, YouTube), or use the <b>microphone</b> — and it is split into low, mid and high "
        + "beats. Any slider can then be armed with its <b>L / M / H</b> chips (a couple of steps from "
        + "now): it stops drifting, rests at its low end and snaps to its high end on every beat in that "
        + "band. It also <b>follows the tempo</b>, so a slider can be set to rise <i>into</i> the next "
        + "beat and peak on it rather than only react once it has passed. The audio is analysed in "
        + "your browser only; nothing is recorded or sent anywhere."
        // The mic is armed by default (see restore()), so the click that closes this tour is
        // the one the browser prompts on. Saying so here is the difference between "of course"
        // and an unexplained permission box a second after a tutorial ended. At the front door
        // nothing is armed: the audio dialog follows this tour instead (openRequiredAudio).
        + (frontDoorOn()
          ? "<br><br>So that it just works: <b>after this tour Kicktro asks for an audio source</b> — "
            + "Capture or Mic. Pick one and the music drives the visual; you can switch any time from ☰ → Audio."
          : "<br><br>So that it just works: <b>your first click after this tour will ask to use the "
            + "microphone</b>. Allow it and the room drives the visual; refuse, and it is never asked "
            + "again — you can still start either source yourself from ☰ → Audio.") },
    { head: "Two menus", art: TUT_ART.menus,
      body: "<span class=\"tut-keys\">M</span> opens the <b>scene editor</b> down the left — everything "
        + "that is part of what you are looking at. While it is open the scenes stop auto-cycling, so "
        + "nothing changes under you while you work. The <b>☰</b> top-right is everything else: audio, render resolution, "
        + "fullscreen, your cloud profile, other people's scenes, the help reference — and this tutorial. "
        + "<span class=\"tut-keys\">M</span> hides it again, <span class=\"tut-keys\">F</span> "
        + "goes fullscreen and <span class=\"tut-keys\">H</span> strips every last bit of chrome." },
    { head: "Scenes", art: TUT_ART.scenes,
      body: "A <b>scene</b> is a complete snapshot — the effects, the colours, the filters, every slider. "
        + "Pick one from the list and it loads; from then on <b>every change you make is saved straight "
        + "back into it</b>, with no Save button. Press <b>New</b> first if you would rather work on a "
        + "copy. <b>Auto-cycle</b> drifts through the scenes you have ticked, so you can leave it "
        + "running — one scene <b>blends into the next</b> rather than cutting, and the "
        + "<b>Transition</b> slider sets how long that takes (pinch it to zero for a hard cut)." },
    { head: "Layers", art: TUT_ART.layers,
      body: "A scene can stack up to <b>four effects</b> into one picture. Each layer keeps its own "
        + "effect, palette, camera and filters, and they are blended together in perceptual colour "
        + "space — so a plasma can wash under a fractal and the two really do mix. The <b>+</b> on a "
        + "layer's row opens its controls as a box you can <b>drag anywhere</b> — it snaps to a grid, "
        + "and its colour matches the layer it belongs to — split into three tabs: <b>Effect</b>, "
        + "<b>Filters</b> and <b>Palette</b>. The eye mutes a layer, and the handle drags it up or down "
        + "the stack.<br><br>Some of the 3D effects can also <b>share one world</b>: tick "
        + "<b>Share one 3D world</b> on each and they are traced together, so a glass ball genuinely "
        + "reflects the ocean it is floating over, and hides what is behind it." },
    { head: "Sliders drift", art: TUT_ART.slider,
      body: "Most sliders have <b>two thumbs</b>: they are a low and a high bound, and the live value "
        + "wanders erratically between them. That drift is where a lot of the movement comes from — "
        + "<b>pinch the thumbs together</b> to hold a constant instead. The <b>+</b> beside a slider's "
        + "name breaks it out into its own box, which lands next to the layer it came from. That box "
        + "is where the rest of a slider lives: the <b>range</b> its thumbs may cover, the "
        + "<b>L / M / H</b> chips that arm it to the beat, the <b>shape</b> of the pulse each beat "
        + "makes — plotted, so you can see what it will do — how <b>long</b> that pulse lasts, and its "
        + "own detector <b>tuning</b>, so one slider can be twitchier than the next." },
    { head: "Filters", art: TUT_ART.filters,
      body: "Each layer carries a chain of <b>filters</b> — nearly forty of them — listed in the order they run; drag to "
        + "reorder. Where one sits matters: above the line it shapes the heat <i>before</i> the effect "
        + "draws (Fire, trails, feedback warps build up over frames), below it repaints the finished "
        + "picture (pixelate, mirror, bloom). <b>+ Add filter</b> opens the full catalogue." },
    { head: "Keeping and sharing", art: TUT_ART.share,
      body: "Your scenes live in this browser. <b>Cloud profile</b> keeps the whole library against a "
        + "Google account. Every scene you make is also in the <b>Gallery</b>, an hour after your last "
        + "change to it, so polish it first: there everyone's scenes play as you hover them and "
        + "<b>❤️</b> sorts the best to the top. "
        + "<b>Share</b> copies a link to the one scene you "
        + "have open.<br><br>That is the tour. <b>☰ → Help</b> explains every single control, and "
        + "<b>☰ → Tutorial</b> brings this back whenever you want it." },
  ];

  const tutDlg = el("tutdlg");
  const tutBox = tutDlg && tutDlg.querySelector(".tut-box");
  let tutStep = 0, tutTimer = 0, tutWaited = 0;

  function tutSeen() {
    try { return !!JSON.parse(localStorage.getItem(TUT_KEY) || "null"); } catch (e) { return false; }
  }
  function tutMarkSeen() {
    try { localStorage.setItem(TUT_KEY, JSON.stringify({ seen: true, v: CONFIG.version })); } catch (e) {}
  }

  // A FUNCTION DECLARATION on purpose: three earlier slices call this — the sync-nudge
  // interval, showSyncPopup, and armAudioResume's document-level capture listener.
  // Declarations hoist to the top of the one IIFE, so this is in scope there; a
  // `const tutorialOpen = () => …` would be in the TDZ for all of them (same rule as blendOk).
  //
  // It looks the node up rather than closing over `tutDlg`, so hoisting alone is enough: a
  // closure over the const below would still throw if anything above ever managed to call
  // this before this slice ran. Nothing does today — every caller is a timer or a gesture,
  // both of which land after startup — but the whole point of a hoisted guard is that it is
  // safe to call from anywhere.
  // Not yet shown. The front door's audio question waits on this as well as on tutorialOpen,
  // or the two would race for the same moment after the credits. A declaration, for the same
  // reason as tutorialOpen; tutSeen only reads storage.
  function tutorialPending() { return !!document.getElementById("tutdlg") && !tutSeen(); }
  function tutorialOpen() {
    const d = document.getElementById("tutdlg");
    return !!d && !d.classList.contains("hidden");
  }

  // Paint one step. Only the body changes — the header, the dots row and the buttons are
  // permanent nodes updated in place, so the sticky title never reflows mid-tour and the
  // focus the modal trap handed out survives a Next.
  function tutGo(n) {
    tutStep = Math.max(0, Math.min(TUT_STEPS.length - 1, n | 0));
    const s = TUT_STEPS[tutStep], last = tutStep === TUT_STEPS.length - 1;
    el("tut-count").textContent = (tutStep + 1) + " / " + TUT_STEPS.length;
    el("tut-art").innerHTML = s.art;
    el("tut-head").textContent = s.head;
    el("tut-body").innerHTML = s.body;
    el("tut-dots").innerHTML = TUT_STEPS
      .map((_, i) => '<span class="tut-dot' + (i <= tutStep ? " on" : "") + '"></span>').join("");
    // setOff, not a bare class: `.off` dims but leaves the tab stop and the Enter key live
    // (see boot-globals). Back on step 1 has to be genuinely dead, not just grey.
    // MOVE FOCUS BEFORE disabling or hiding whatever holds it. Back going dead on step 1 and
    // Skip disappearing on the last step both dropped document.activeElement to <body> when the
    // key that triggered them was pressed on that very button — the modal's Tab handler pulls it
    // back on the next Tab, so it self-heals, but the control vanishes from under your finger.
    // Next is the safe target: it exists on every step and is never disabled.
    const losing = (tutStep === 0 && document.activeElement === el("tut-back")) ||
                   (last && document.activeElement === el("tut-skip"));
    if (losing) el("tut-next").focus();
    setOff(el("tut-back"), tutStep === 0);
    el("tut-next").textContent = last ? "Done" : "Next →";
    el("tut-skip").hidden = last;              // nothing left to skip on the last step
    track("tutorial_step", { step: tutStep + 1 });
  }

  function openTutorial(auto) {
    if (!tutDlg) return;
    clearInterval(tutTimer); tutTimer = 0;     // whichever route got here, stop waiting
    tutMarkSeen();                             // shown once is shown, even if it is dismissed
    tutDlg.classList.remove("hidden");
    tutGo(0);
    dlgModal(tutBox);
    track("tutorial_shown", { auto: auto ? 1 : 0 });
  }
  function closeTutorial() {
    if (!tutDlg) return;
    const wasOpen = tutorialOpen();
    tutDlg.classList.add("hidden");
    dlgRelease(tutBox);
    // Reading the tutorial must not eat into the audio nudge's first delay — hand back a
    // full thirty seconds of scene, so the nudge lands on someone who has been watching it
    // rather than immediately on top of the dialog they just closed.
    if (wasOpen) syncResetDelay();
  }
  function tutFinish() {
    const last = tutStep === TUT_STEPS.length - 1;
    track(last ? "tutorial_done" : "tutorial_skip", { step: tutStep + 1 });
    closeTutorial();
  }

  if (tutDlg) {
    el("tut-close").addEventListener("click", tutFinish);
    el("tut-skip").addEventListener("click", tutFinish);
    el("tut-back").addEventListener("click", () => tutGo(tutStep - 1));
    el("tut-next").addEventListener("click", () => {
      if (tutStep === TUT_STEPS.length - 1) tutFinish(); else tutGo(tutStep + 1);
    });
    // Click the backdrop to leave, like every other modal here.
    tutDlg.addEventListener("click", e => { if (e.target === tutDlg) tutFinish(); });
    // ◂ / ▸ page the tour. Enter is left to the focused button — the modal trap parks focus
    // on the × and then wherever you tab to, and hijacking Enter would fire Next while you
    // were pressing Skip. Escape is handled by the global key branch (ui-diagnostics.js).
    tutDlg.addEventListener("keydown", e => {
      if (e.key === "ArrowRight") { e.preventDefault(); tutGo(tutStep + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); tutGo(tutStep - 1); }
    });

    // The auto-open gate. `creditLeft` counts RENDERED time in the frame loop, so this
    // waits for the credits to actually finish burning rather than for a wall clock that
    // keeps running in a backgrounded tab. TUT_MAX_WAIT is the backstop for the two cases
    // where that clock never reaches zero: ?credits=<big>, and a scene paused on arrival.
    if (!tutSeen()) {
      tutTimer = setInterval(() => {
        if (document.hidden) return;
        tutWaited += 0.25;
        if (creditLeft > 0 && tutWaited < TUT_MAX_WAIT) return;
        if (frontModalUp()) return;             // not over the gallery the front door opens on
        openTutorial(true);
      }, 250);
    }
  }
