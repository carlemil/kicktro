  // ---- Credits ---------------------------------------------------------------
  // On startup the two credit lines are burned INTO the heat grid rather than drawn
  // over the canvas: the glyphs are rasterised once to an offscreen 2D canvas, and
  // their pixels are stamped through the same plot() the effects use. So the text
  // catches the effect's own palette, glow and (if Fire is on) rises and burns away
  // by itself — it is the effect, not a layer on top of it. Nothing to undraw.
  // One source for both the panel's Credits box and the burn-in, so they can't drift.
  const CREDITS = [
    { role: "The Rastermancer", name: "Carl-Emil Kjellstrand", handle: "Erbsman" },
    { role: "Warden of Waveforms", name: "Kristian Saether", handle: "The Dyze" },
  ];
  const CREDIT_AKA = " aka ";
  // The overlay follows the panel's layout — ROLE on its own line above the name,
  // "aka <handle>" trailing it — and these are the panel's own opacities, straight from
  // #panel .credit-name (.8) and .credit-aka (.45), with role and handle at full.
  const CR_ROLE = 1, CR_NAME = .8, CR_AKA = .45;
  // Build the panel's Credits box from the same array.
  (function buildCreditList() {
    const host = el("creditlist");
    if (!host) return;
    for (const cr of CREDITS) {
      const wrap = document.createElement("div");
      wrap.className = "credit";
      const role = document.createElement("div");
      role.className = "credit-role"; role.textContent = cr.role;
      const name = document.createElement("div");
      name.className = "credit-name"; name.textContent = cr.name + " ";
      // "aka <handle>" is one nowrap span so a long name wraps as name / alias
      // instead of stranding the "aka" at the end of a line.
      const alias = document.createElement("span");
      alias.className = "credit-alias";
      const aka = document.createElement("span");
      aka.className = "credit-aka"; aka.textContent = "aka";
      const handle = document.createElement("span");
      handle.className = "credit-handle"; handle.textContent = cr.handle;
      alias.append(aka, " ", handle);
      name.appendChild(alias);
      wrap.append(role, name);
      host.appendChild(wrap);
    }
  })();
  // Counted down in RENDERED time (dt from the frame loop), not wall clock: if the
  // tab is backgrounded rAF stops, and a wall-clock timer would burn the credits
  // away unseen. It also makes the duration testable on a driven clock.
  const CREDIT_HOLD = CONFIG.credits.hold;   // seconds at full brightness
  const CREDIT_FADE = CONFIG.credits.fade;   // ...then this long ramping down to nothing
  const CREDIT_S = CREDIT_HOLD + CREDIT_FADE;
  const CREDIT_KEY = "burnTheWeb.credits.v1";   // FROZEN PREFIX: the old app name. Renaming the key orphans existing data.
  // The scene title shares this canvas, this countdown style and this drawing treatment —
  // it IS the credits' typography, saying the name of the scene you just switched to and
  // who made it. Its own hold/fade because it fires on every scene change (see CONFIG).
  const TITLE_HOLD = CONFIG.credits.titleHold;
  const TITLE_FADE = CONFIG.credits.titleFade;
  const TITLE_KEY = "burnTheWeb.scenetitle.v1";   // FROZEN PREFIX: the old app name. Renaming the key orphans existing data.
  let creditLeft = 0, creditCv = null, creditCtx = null, creditPainted = false;
  let titleLeft = 0, titleName = "", titleAuthor = "";
  // The credits render on their OWN canvas above the effect, not stamped into the heat
  // grid. They used to be stamped — which gave them the palette and let them burn away
  // with the fire, but also fed them through the post-filter chain, so Pixelate blocked
  // them up, Mirror doubled them and Edge reduced them to outlines. Chrome you cannot
  // read is not chrome. Drawing them on top costs the palette tie-in and buys legibility
  // under every effect and every filter, plus immunity to the camera and to zoom for
  // free (an overlay is not in the buffer those transform).
  //
  // Being a real 2D layer also means the panel's actual colours instead of a
  // one-channel brightness stand-in — role amber, name white, "aka" dim, handle bright
  // — matching #panel .credit-role / -name / -aka / -handle directly.
  const CR_COL = { role: "#ffb15a", name: "rgba(255,255,255,", aka: "rgba(255,255,255,", handle: "#ffcf87" };
  function creditLayer() {
    if (!creditCv) { creditCv = el("creditcv"); creditCtx = creditCv.getContext("2d"); }
    return creditCtx;
  }
  // Paint the overlay at the current fade. Called from frame() AFTER the render, so it
  // lands over the finished image — filters included.
  //
  // ONE canvas, two tenants, and they never overlap: the credits own it until they expire,
  // then the scene title does. That ordering is not a rule enforced here — frame() simply
  // does not decrement titleLeft while credits are up (see the tick), so a scene applied
  // during the credits waits its turn instead of fighting them.
  function creditDraw() {
    const g = creditLayer();
    if (!g) return;
    // The scene title is NOT drawn here any more — it is a DOM element in the top button row
    // (#scenebanner, see sceneBannerTick). It is chrome, so it belongs with the chrome: immune
    // to the filters and the camera without having to be an overlay canvas, crisp at any
    // render resolution, and free of the frame entirely. This canvas is the credits' alone.
    //
    // THE EARLY-OUT COMES FIRST, before the innerWidth read and the clearRect. It used to sit
    // below them, so an expired overlay still resized and cleared a full-screen canvas on every
    // frame for the life of the session — and worse, reading `window.innerWidth` FLUSHES the
    // layout that the frame counter's textContent write has just dirtied, which made this a
    // forced synchronous layout once per frame on a canvas that is display:none.
    if (creditLeft <= 0) {                     // done: clear once, then get out of the way
      if (creditPainted) {
        const w0 = creditCv.width, h0 = creditCv.height;
        g.clearRect(0, 0, w0, h0);
        creditCv.style.display = "none"; creditPainted = false;
      }
      return;
    }
    const w = window.innerWidth, h = window.innerHeight;
    if (creditCv.width !== w || creditCv.height !== h) { creditCv.width = w; creditCv.height = h; }
    g.clearRect(0, 0, w, h);
    if (!creditPainted) { creditCv.style.display = "block"; creditPainted = true; }
    drawCredits(g, w, h, creditAlpha());
  }
  function drawCredits(g, w, h, a) {
    g.textAlign = "left"; g.textBaseline = "middle";
    const MONO = "px ui-monospace, Consolas, monospace";
    const roleSize = q => Math.max(9, Math.round(q * 0.8));   // panel: 10px role vs 11px name
    const spacing = q => Math.max(1, Math.round(q * 0.12));    // panel: letter-spacing .12em
    // Laid out left-to-right by hand rather than with textAlign:center, because a name
    // line is three runs in three fonts and only their *total* is centred.
    const segsOf = cr => [[cr.name, CR_COL.name + (CR_NAME * a) + ")", false],
                          [CREDIT_AKA, CR_COL.aka + (CR_AKA * a) + ")", false],
                          [cr.handle, CR_COL.handle, true]];
    const nameW = (cr, q) => segsOf(cr).reduce((acc, sg) => {
      g.font = (sg[2] ? "bold " : "") + q + MONO;
      return acc + g.measureText(sg[0]).width;
    }, 0);
    const roleW = (cr, q) => {                 // measured *with* the letter-spacing on
      g.letterSpacing = spacing(q) + "px";
      g.font = "bold " + roleSize(q) + MONO;
      const wd = g.measureText(cr.role.toUpperCase()).width;
      g.letterSpacing = "0px";
      return wd;
    };
    let px = Math.max(11, Math.floor(w / 34));
    for (let i = 0; i < 60 && px > 10; i++) {
      const widest = Math.max(...CREDITS.map(cr => Math.max(nameW(cr, px), roleW(cr, px))));
      if (widest <= w * 0.88) break;
      px--;
    }
    const rpx = roleSize(px), roleLh = rpx * 1.9, nameLh = px * 1.5, gap = px * 1.2;
    const blockH = CREDITS.length * (roleLh + nameLh) + (CREDITS.length - 1) * gap;
    let y = h * 0.5 - blockH / 2 + roleLh / 2;
    // A soft dark halo under the text so it stays readable over a bright frame, then
    // the warm glow that keeps it looking like part of the demo rather than a caption.
    for (const cr of CREDITS) {
      const t = cr.role.toUpperCase();
      g.letterSpacing = spacing(px) + "px";
      g.font = "bold " + rpx + MONO;
      g.shadowColor = "rgba(0,0,0," + (0.85 * a) + ")"; g.shadowBlur = Math.round(px * 0.7);
      g.fillStyle = CR_COL.role; g.globalAlpha = CR_ROLE * a;
      g.fillText(t, (w - g.measureText(t).width) / 2, y);
      g.shadowColor = "rgba(255,140,40," + (0.75 * a) + ")"; g.shadowBlur = Math.round(px * 0.5);
      g.fillText(t, (w - g.measureText(t).width) / 2, y);
      g.globalAlpha = 1;
      g.letterSpacing = "0px";
      y += roleLh / 2 + nameLh / 2;
      let x = (w - nameW(cr, px)) / 2;         // sets g.font as it measures — reset below
      for (const [txt, col, bold] of segsOf(cr)) {
        g.font = (bold ? "bold " : "") + px + MONO;
        g.shadowColor = "rgba(0,0,0," + (0.85 * a) + ")"; g.shadowBlur = Math.round(px * 0.7);
        g.fillStyle = col; g.globalAlpha = bold ? a : 1;   // bold handle carries its alpha here
        g.fillText(txt, x, y);
        g.shadowColor = "rgba(255,180,90," + (0.6 * a) + ")"; g.shadowBlur = Math.round(px * 0.45);
        g.fillText(txt, x, y);
        g.globalAlpha = 1;
        x += g.measureText(txt).width;
      }
      g.shadowBlur = 0; g.shadowColor = "transparent";
      y += nameLh / 2 + gap + roleLh / 2;
    }
  }
  // The last CREDIT_FADE seconds ramp the whole layer down to nothing rather than
  // cutting out.
  function creditAlpha() {
    return creditLeft >= CREDIT_FADE ? 1 : Math.max(0, creditLeft / CREDIT_FADE);
  }
  function titleAlpha() {
    return titleLeft >= TITLE_FADE ? 1 : Math.max(0, titleLeft / TITLE_FADE);
  }
  function sceneTitleEnabled() {
    // Its own key, like the credits': a per-browser preference, never part of a scene blob.
    try { const v = localStorage.getItem(TITLE_KEY); return v === null ? CONFIG.credits.titleOn : v !== "off"; }
    catch (e) { return CONFIG.credits.titleOn; }
  }
  // Arm the title. Called on every scene change (applyPreset → sceneTitleFor), so it must be
  // cheap and must simply RESTART when it is already up — switching twice quickly shows the
  // second name, not a queue of them. It does not wait for the credits here; frame() holds
  // the countdown instead, which is what makes "after the credits" free.
  function showSceneTitle(name, author) {
    name = (name || "").trim();
    if (!name) { titleLeft = 0; sceneBannerTick(); return; }
    titleName = name;
    // THE TICK IS ABOUT THE AUTHOR, which is what it has always said. It used to gate the
    // whole banner, so with no profile name and no collection -- the common case -- there was
    // no author to append, the scene name went with it, and the control read as doing nothing
    // whichever way you set it. The banner is the scene name; this decides what follows it.
    titleAuthor = sceneTitleEnabled() ? (author || "").trim() : "";
    titleLeft = TITLE_HOLD + TITLE_FADE;
    const b = el("scenebanner");
    if (b) {
      b.textContent = titleAuthor ? titleName + "  ·  " + titleAuthor : titleName;
      b.title = titleAuthor ? titleName + " — by " + titleAuthor : titleName;
    }
    sceneBannerTick();
  }
  // Push titleLeft onto the DOM banner. Called every frame from the loop, so it inherits the
  // rendered-time countdown (and therefore the wait-for-the-credits behaviour) that the
  // canvas version had — the element is just a different way of showing the same clock.
  // `.hidden` rather than a style wipe, so nothing is laid out while it is away.
  let bannerShown = false;
  function sceneBannerTick() {
    const b = el("scenebanner");
    if (!b) return;
    // `creditLeft <= 0` is what keeps the banner QUEUED BEHIND the opening credits. The
    // canvas version got that free — creditDraw simply drew the credits instead — but a DOM
    // element shows the moment it is armed, and the first visit arms one during the credits.
    // Without this the banner sits in the corner while the credits are still running.
    const on = titleLeft > 0 && creditLeft <= 0;
    if (on !== bannerShown) { b.classList.toggle("hidden", !on); bannerShown = on; }
    if (on) b.style.opacity = titleAlpha();
  }
  function creditsEnabled() {
    // Per-browser preference in its own key; the DEFAULT (no key stored yet) is CONFIG.credits.on.
    try { const v = localStorage.getItem(CREDIT_KEY); return v === null ? CONFIG.credits.on : v !== "off"; }
    catch (e) { return CONFIG.credits.on; }
  }
  // When the credits last ran (epoch ms). They open the FIRST visit and then once every
  // CONFIG.credits.every days, not every page load: a reload replayed the same eight seconds
  // of names every time, which is an intro the first time and a wait after that.
  const CREDIT_SEEN_KEY = "kt.credits.seen";
  function creditsDue(now) {
    let last = 0;
    try { last = +localStorage.getItem(CREDIT_SEEN_KEY) || 0; } catch (e) {}
    // A stamp in the FUTURE (a clock set back) counts as never seen rather than as a gag
    // that lasts until the clock catches up.
    return !(last > 0 && last <= now && now - last < CONFIG.credits.every * 864e5);
  }
  function startCredits() {
    if (!creditsEnabled()) return;
    // ?credits=<seconds> overrides the **hold**; the fade is always added on top, so
    // ?credits=600 parks them on screen and still fades out the same way. Same spirit
    // as ?debug=1 / ?beat=1 — mostly for looking at the burn-in without racing it.
    const m = location.search.match(/[?&]credits=([\d.]+)/);
    // The dev hook always shows them and stamps nothing; otherwise only when they are due.
    if (!m) {
      const now = Date.now();
      if (!creditsDue(now)) return;
      try { localStorage.setItem(CREDIT_SEEN_KEY, String(now)); } catch (e) {}
    }
    const secs = m ? +m[1] : CREDIT_HOLD;
    creditLeft = (isFinite(secs) && secs > 0 ? secs : CREDIT_HOLD) + CREDIT_FADE;
  }

