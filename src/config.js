  // ---- LAST-RESORT ERROR REPORTING -------------------------------------------
  // FIRST THING IN THE FIRST SLICE, deliberately: the app is one IIFE built from every file in
  // the manifest, so a TDZ violation or a throw ANYWHERE aborts the whole program, and everything
  // after that point simply never runs. That failure mode is all over CLAUDE.md -- "blank page",
  // "fails silently", "black canvas", "a page that fails early looks exactly like a fast one to a
  // wall-clock gate" -- and until now a visitor who hit it got a black screen with no explanation
  // and nobody ever found out. Armed here, it survives a crash in any later slice.
  //
  // (A PARSE error is not catchable from inside; `node tools/build.js` gates that one instead.)
  //
  // It reports and gets out of the way: one line, dismissable, shown once. `track` is a hoisted
  // function declaration in a much later slice, which is exactly why it can be called from here.
  (function armCrashReport() {
    let shown = false;
    function report(what, err) {
      try { if (typeof track === "function") track("js_error", { what: what, msg: String((err && err.message) || err).slice(0, 120) }); } catch (e) {}
      if (shown || !document.body) return;
      shown = true;
      const d = document.createElement("div");
      d.setAttribute("role", "alert");
      d.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:99999;padding:10px 14px;" +
        "background:rgba(60,10,0,.94);color:#ffdcb0;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;" +
        "border-bottom:1px solid rgba(255,140,40,.5)";
      d.textContent = "Kicktro hit an error and may not be running. Reloading usually fixes it. ";
      const b = document.createElement("button");
      b.type = "button"; b.textContent = "Dismiss";
      b.style.cssText = "margin-left:8px;background:transparent;color:inherit;border:1px solid currentColor;" +
        "border-radius:4px;padding:1px 8px;cursor:pointer;font:inherit";
      b.addEventListener("click", () => d.remove());
      d.appendChild(b);
      document.body.appendChild(d);
    }
    addEventListener("error", e => report("error", e && (e.error || e.message)));
    addEventListener("unhandledrejection", e => report("rejection", e && e.reason));
  })();

  // ============================================================================
  // CONFIG — every DEFAULT that is not part of a preset, in one place.
  //
  // A preset (snapshotScene) carries a whole scene you hand to someone else. These
  // are the app/build-level defaults OUTSIDE that: stack limits, the initial fire
  // state, credits, palette timing, the beat detector's shipped tuning, the "sync
  // your music" nudge, analytics, and the effect/physics tuning constants.
  //
  // Each value below is sourced by exactly one `const NAME = CONFIG.path` at its
  // original site (so hoisting/order is unchanged) — change it HERE, nowhere else.
  // Loaded first (manifest position 1), so every later slice can read it. Some
  // `tuning.*` values are load-bearing maths (see CLAUDE.md) — change with care.
  // ============================================================================
  const CONFIG = {
    // --- release identity ---
    // THE single source of truth for the app version. The menu's footer link reads it, and
    // the /deploy skill bumps it here and writes the matching CHANGELOG.md section — so a
    // released build always names the version whose notes describe it. Semver: patch for
    // fixes, minor for a new effect/filter/control, major for a breaking scene format.
    version: "1.79.0",
    changelogUrl: "https://github.com/carlemil/kicktro/blob/main/CHANGELOG.md",

    // --- effect stack / fractal layering ---
    stackMax: 4,          // max effects composited into one scene        (STACK_MAX)
    layerMax: 6,          // max progressively-smaller fractal copies      (LAYER_MAX)

    // --- initial live fire state (cfg). scale is the DEFAULT resolution: 1 Full … 4 Potato ---
    fire: { points: 1500, speed: 0.92, decay: 129, scale: 1, burn: 120 },

    // --- scene knobs that are global, NOT per-preset (auto-cycle, TTL, transition) ---
    scene: { autoCycle: true, ttl: [8, 16], transition: [0.45, 0.9] },   // ttl/transition in seconds [min,max]

    // --- the colour that says WHICH LAYER a box belongs to ---
    // With several layer boxes and their sliders scattered over the grid, "L2 · Plasma" in
    // 9px uppercase is the only thing tying a box to its layer. A colour reads at a glance
    // and from the corner of the eye, which the label does not.
    //
    // One per stack slot, assigned by position on creation and overridable per layer. Picked
    // to stay legible against the app's amber-on-near-black and to be distinguishable from
    // each other at a 1px border width — amber is deliberately NOT among them, or the tint
    // would disappear into the untinted chrome. Order matters: slot 0 takes the first.
    layerTint: ["#5ac8ff", "#7fe08a", "#ff7ad4", "#ffd24a"],

    // --- startup credits overlay, and the per-scene title that follows it ---
    // The scene title rides the SAME canvas and the same rendered-time countdown, so it is
    // configured here beside them. Shorter than the credits on purpose: it fires on every
    // scene change, including each auto-cycle tick, so it has to read and get out of the way.
    credits: { hold: 5, fade: 3, on: true,          // seconds at full / fade seconds / shown on first visit
               titleHold: 2.5, titleFade: 1.5, titleOn: true },   // ...same three for the scene title

    // --- palette ---
    paletteMorphMs: 8000, // fallback auto-morph duration; live value comes from the slider (MORPH_MS)
    bandCount: 18,        // posterized flat colours across a banded ramp   (BAND_COUNT)

    // --- beat-driven slider pulse ---
    pulse: { drop: 0.2, min: 0.02, max: 1 },   // default fall time (s); per-slider length slider bounds (s) = 20–1000 ms

    // --- audio beat detector: the SHIPPED tuning (a preset's beatTune overrides per-scene) ---
    // The mid band starts at 250, not 150, which leaves 150–250 Hz in NEITHER band on
    // purpose. That octave is bass-guitar and low-synth territory — sustained pitched
    // material that is not a kick and not a snare, so feeding it to either band only
    // dilutes that band's flux with notes. Low keeps 30–150 (the kick fundamental) and mid
    // starts above the muddle. Bands never had to be contiguous; they are narrow by design
    // (see the detector notes in CLAUDE.md), and the gap is the same idea taken one step.
    // Per-SCENE data, so this is the default a scene starts from: a preset that stored its
    // own `bands` keeps them, and only one saved without them picks this up.
    // `lead` and `lock` are the TEMPO half, and both ship neutral on purpose. lead 0 / lock
    // false makes the predictive firing path in audioTick unreachable, so every scene saved
    // before tempo tracking existed detects beats exactly as it always did. Turning either on
    // is a deliberate act. lead is ms EARLY, so the visual peaks on the beat rather than
    // behind it; lock fills beats the onset detector missed and rejects ones off the grid.
    beatDefaults: { fluxK: [2.0, 2.0, 2.0], floor: 0.10,                  // flux threshold per band; global floor
      refract: [110, 100, 70], bands: [[30, 150], [250, 2500], [2500, 12000]],  // refractory ms / Hz edges per band
      lead: 0, lock: false },                                             // predictive firing: ms early / snap to the grid

    // --- incoming payload codec safety ---
    // Budget for DECOMPRESSING any incoming deflated payload (?z= links, #zp= bundles,
    // cloud profiles, #c= scenes). Deflate expands up to ~1032:1, so a payload that
    // passes the rules' 300k-char cap could still balloon to ~300 MB in THIS tab
    // before any validator runs — a zip bomb from any published profile or link.
    // 10 MB is ~30× the largest legitimate library measured; unzipFromB64 aborts past it.
    maxUnzipBytes: 10000000,                      // (UNZIP_MAX)

    // --- "Sync with your music" nudge + analytics ---
    sync: { delays: [30000, 300000, 3600000] },   // active-tab ms before each of the (max 3) nudges (SYNC_DELAYS)
    analyticsId: "G-7CMDJP72N7",                  // GA4 Measurement id; "" makes analytics completely inert

    // --- cloud profiles (Firebase Auth + Firestore, over REST; no SDK) ---
    // apiKey "" makes the WHOLE feature inert: no Google script is loaded, no request is
    // made, and the Cloud row is hidden from the menu — the same kill switch analyticsId
    // above has. Fill both in from the Firebase console (Project settings → Web app) to
    // turn it on.
    //
    // ┌─ THE apiKey BELOW IS NOT A SECRET, AND SECRET SCANNERS WILL FLAG IT ANYWAY ─────┐
    // A Firebase *web* API key is a project IDENTIFIER, not a credential: it selects which
    // project a request is for, and grants nothing on its own. It has to reach the browser
    // for the app to work, so it is in this file, in dev-index.html, and in index.html —
    // there is nowhere to hide it and nothing is gained by trying. Rotating it changes the
    // string and nothing else, since the replacement is equally public.
    //
    // What actually protects the data:
    //   1. firestore.rules (repo root) — the authorization boundary. Verified live: an
    //      unauthenticated read of a private profile, an unauthenticated write, and an
    //      unfiltered listing are all denied.
    //   2. Only Google sign-in is enabled, so the key cannot be used to mint accounts
    //      (accounts:signUp returns ADMIN_ONLY_OPERATION). Do NOT enable Anonymous or
    //      Email/Password sign-in without re-checking that — those turn this key into a
    //      way for anyone to create users on the project.
    //   3. The key is restricted in Google Cloud Console (Credentials → this key) by HTTP
    //      referrer to the site's own origins, and to only the APIs used: Identity Toolkit,
    //      Token Service, Cloud Firestore. That is what limits quota abuse from elsewhere.
    // Dispositioned as intentional on exactly this basis by BOTH scanners watching this repo:
    // GitHub secret-scanning alert #1, and a GitGuardian incident on 2026-08-26.
    //
    // EXPECT IT TO KEEP COMING BACK, and do not read a repeat as a new exposure. Every release
    // rewrites dev-index.html and index.html, the key is in both, and a scanner re-reports the
    // string it finds — the 2026-08-26 incident was five releases in one day, not a new leak.
    // Before dismissing the next one, re-check the two things above that live in a console and
    // can therefore drift silently: that ONLY Google sign-in is enabled (2), and that the key's
    // referrer and API restrictions are still in place (3). Those are the claims worth
    // re-verifying; the key being public is not.
    // └────────────────────────────────────────────────────────────────────────────────┘
    cloud: {
      apiKey: "AIzaSyB_VfQ6W0ui79rMzHrYvbe8f_1OkSSymRM",   // public identifier, see above ⇒ "" = feature off
      projectId: "burntheweb-3cd05",              // Firebase project id
      // NOT renamed with the app, and it never can be: this is the real Firebase project id.
      // Changing the string points the app at a project that does not exist and every cloud
      // feature 404s. Same for apiKey and clientId above/below — they name the Google project,
      // not the product.
      //
      // MOVING DOMAIN NEEDS THREE ALLOWLISTS UPDATED. Miss any one and the failure is an opaque
      // console error with nothing on the page to explain it:
      //
      //   1. Firebase console -> Authentication -> Settings -> Authorized domains
      //      add kicktro.com.  Gates sign-in; cloudSignIn sends requestUri: location.origin.
      //   2. Google Cloud console -> APIs & Services -> Credentials -> the OAuth 2.0 client id
      //      below -> Authorized JavaScript origins: add https://kicktro.com.  Google Identity
      //      Services checks the PAGE ORIGIN before it will render the sign-in button at all.
      //   3. Google Cloud console -> APIs & Services -> Credentials -> the API KEY above ->
      //      Application restrictions -> HTTP referrers: add https://kicktro.com/*
      //      THIS ONE IS THE EASY ONE TO MISS and it is the widest: the key is referrer-locked,
      //      so from an un-listed host EVERY keyed call 403s with API_KEY_HTTP_REFERRER_BLOCKED
      //      -- not just sign-in, but the gallery browse and every #c= share-link fetch too.
      //
      // Leave carlemil.github.io in all three while that host still serves the page.
      //
      // AND NOTE: all of this needs HTTPS anyway. Google Identity Services refuses to run in a
      // non-secure context, the same rule that hides the audio buttons -- so none of it can be
      // tested until the custom domain's certificate is issued.
      clientId: "180474887753-jf22fn1kgkecamc2inr2eoomh0e1e0j4.apps.googleusercontent.com",
      // ONE number, and it is both the cache lifetime and the reload limit -- see galOpen.
      // Two separate intervals would let the Refresh button undercut the cache and make
      // "reloads once an hour" quietly untrue.
      galleryTtlMs: 86400000,                     // cache the gallery listing, and reload at most, 24h
      // ONE query brings the WHOLE listing (pages are cut client-side); a read is billed
      // per document returned, so a day costs as many reads as there are published profiles.
      galleryLimit: 200,
      galleryPage: 20,                            // profiles per gallery page
      maxPayload: 300000,                         // must match the cap in firestore.rules
    },

    // --- effect / physics tuning (implementation constants; several are load-bearing) ---
    tuning: {
      hopMs: 10,          // beat-analysis tick, ms — 100Hz, framerate-independent   (HOP_MS)
      // --- TEMPO TRACKER (see the detector notes in CLAUDE.md) ---
      // The onset detector is reactive by construction: it confirms a beat one hop AFTER it
      // happened. These drive the separate tracker that says when the NEXT one lands, which
      // is what an anticipatory pulse shape needs.
      // NOT decimated. At 50Hz the lag grid was 20ms apart, so a 140 BPM period (429ms)
      // fell between two lags and correlated BETTER at its double, which happened to land
      // near a whole lag -- the tracker locked to 861ms. The full rate costs ~39k
      // multiply-adds 4 times a second, which is nothing; the coarse grid cost accuracy.
      tempoHz: 100,       // envelope rate fed to the autocorrelation                 (TEMPO_HZ)
      tempoWin: 600,      // envelope samples correlated = 6s at 100Hz                (TEMPO_WIN)
      tempoEvery: 25,     // ticks between autocorrelations — 4/s, NOT per tick       (TEMPO_EVERY)
      tempoMinBpm: 60,    // slowest tempo tracked (longest lag)                      (TEMPO_MIN_BPM)
      tempoMaxBpm: 200,   // fastest tempo tracked (shortest lag)                     (TEMPO_MAX_BPM)
      tempoPrefBpm: 120,  // octave-error bias centre: log-Gaussian preference        (TEMPO_PREF_BPM)
      tempoPrefW: 2.2,    // width of that preference in octaves -- WIDE: a tie-breaker,
                          // never an override. At 0.9 it dragged a real 176 BPM to 88.
      tempoSmooth: 5,     // onset-envelope smoothing taps before correlation (50ms at 100Hz).
                          // A real tempo does not land on the sample grid, and an onset only
                          // one sample wide then correlates with NOTHING at its own period
                          // while aligning perfectly at its double -- a guaranteed octave
                          // error for any period ending in half a sample.        (TEMPO_SMOOTH)
      tempoOctSub: 0.75,  // a sub-multiple lag wins if it scores this fraction of the peak;
                          // finds the FUNDAMENTAL, since every multiple of a period also
                          // correlates and 'tallest peak' picks one at random   (OCT_SUB)
      tempoConfR0: 0.18,  // normalised autocorrelation that reads as no tempo    (CONF_R0)
      tempoConfR1: 0.45,  // ...and as a certain one                              (CONF_R1)
      tempoPllA: 0.20,    // PLL phase correction per onset                           (PLL_A)
      tempoPllB: 0.02,    // PLL period correction per onset                          (PLL_B)
      tempoConfMin: 0.35, // below this the tracker publishes nothing usable          (CONF_MIN)
      tempoLockTol: 0.25, // 'lock' rejects an onset further than this × period off    (LOCK_TOL)
      nodRate: 0.12,      // Tetrafyer's slow idle nod rate                          (NOD_RATE)
      cardPowQ: 0.05,     // Multibrot locus quantisation = the Power slider's step  (CARD_POW_Q)
      juliaMargin: 0.06,  // push the seed's big loop this far outside the cardioid  (JULIA_MARGIN)
      // Extra outward push at FRACTIONAL Multibrot powers, peaking at half-integers and
      // exactly 0 at whole numbers (windowed by 4·f·(1−f)). The true fractional locus is
      // lopsided (principal branch) and bulges past the blended integer cardioids the seed
      // rides; 0.3 measured all fractional powers into the same ~15–22%-inside band as the
      // integers (0 gave 22–59%), while 0.4 overshot into thin, dusty Julia sets.
      juliaFracBoost: 0.3,   //                                            (JULIA_FRAC_BOOST)
      juliaEaseA: 0.5,    // cardioid lap-speed easing amplitude; EASE_K is derived  (JULIA_EASE_A)
      // Heat every chaos-game / attractor point stamps, 0..255.                    (POINT_HEAT)
      // NOT 255, and that is the whole point. Measured over the catalog: 14 of 19 palettes
      // are near-white at index 255 (Fire, Grayscale, C64, CGA and Chrome are literally
      // [255,255,255]) — the hot core a fire ramp is meant to have. Every point stamped at
      // exactly 255 therefore drew the fractal in that white whatever palette was selected,
      // and since point effects now ship with NO filters, the raw stamps ARE the picture:
      // the palette looked like it did nothing at all.
      //
      // 209 (0.82) sits below the white tip and inside the saturated band — 17 of 19 palettes
      // now draw in colour (Matrix green, Ice cyan, Copper copper). The two that don't are
      // Fire and Grayscale, which are achromatic at the top BY DESIGN and stay white/grey at
      // any value down to ~150; lowering further would only dim the rest for no gain. With
      // the Fire filter ticked on, the flame runs the ramp downward from here exactly as
      // before, just starting a hair lower.
      pointHeat: 209,
      // Ceiling on the zoom density compensation (see zoomPoints). Zooming the point
      // GEOMETRY rather than the picture spreads the stamps over zoom² the area, so the
      // count follows zoom² to hold stamps-per-screen-area steady — but that is unbounded,
      // and the slider's max is only a default the per-slider range editor can raise.
      //
      // 8, not the 16 that zoom 4 would ask for, and the reason is measured rather than
      // cautious. zoom² is the AREA rule, but a Sierpiński triangle has dimension ~1.585,
      // so it over-fills by zoom^0.415 — at full compensation zoom 4 came out at 41% of
      // the frame lit against 11.7% at zoom 1, i.e. 3.5× denser than the thing it was
      // meant to match. Halving it still lands comfortably above zoom 1 (measured 25%),
      // so nothing thins out, and it halves the worst case: the chaos game stays on the
      // CPU even on the GPU path, and at 1920×1080 one default Sierpiński layer costs
      // 0.2 ms/frame at zoom 1, 4.4 ms at zoom 4 uncapped — which four stacked point
      // layers at max Points would have turned into a dropped frame all on its own.
      zoomPointCap: 8,
      // ABSOLUTE ceiling on stamps per tick, applied at stampTick's single choke point. This is
      // a SAFETY bound on a loop counter, not a tuning knob -- the largest `points` max any
      // effect declares is 60000, and zoomPointCap multiplies that to 480k, so nothing shipped
      // and nothing a user can reach through the range editor comes near it.
      //
      // It exists because `points` arrives from ATTACKER-AUTHORED JSON. mergeState does no
      // bounds check (the DOM clamp in loadState is the net) and bandOf reads L.state directly
      // for every NON-selected layer, so a share link, a gallery scene or a cloud profile
      // carrying state:{points:[2e9,2e9]} on layer 2 reached this loop bound untouched and wedged
      // the tab on the first rendered frame. Worse for the routes that persist before reloading:
      // applyRestore had already written localStorage, so it re-hung on every later visit and the
      // only way out was clearing site data.
      pointCapHard: 1000000,
    },
  };
  // ==== end CONFIG ==== (probes slice `const CONFIG =` … this line; keep it)


