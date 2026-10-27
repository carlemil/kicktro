  // ---- controls ----
  const panel = document.getElementById("panel");
  const el = id => document.getElementById(id);

  // ---- music beat reactivity ----
  // Onset detection per low/mid/high band; sliders opt in (via their L/M/H chips)
  // to a kick on each beat.
  //
  // The detector is *spectral flux*, not band energy: each tick it sums the
  // positive frame-to-frame increases of every FFT bin in the band. Flux fires on
  // an *attack*; energy merely tracks loudness, so with an energy detector a
  // sustained bass line keeps its own baseline high and masks the kick sitting on
  // top of it. Three further points matter:
  //   · magnitudes come from getFloatFrequencyData and are converted dB → linear.
  //     The byte spectrum is dB-compressed, so a "1.4× the average" test there is
  //     a ratio in log space — a real 6dB hit barely moves the number.
  //   · the analyser's own smoothingTimeConstant is 0: it is a low-pass across
  //     frames and smears the very transients we want (and adds ~2 frames of lag).
  //   · a beat is a *local maximum* of flux above an adaptive threshold (median of
  //     the last ~1s × FLUX_K), not the first frame over a line — so it lands on
  //     the hit rather than somewhere up its rising edge, and the threshold
  //     follows the mix instead of being an absolute level.
  //
  // Analysis runs on a fixed HOP_MS timer, NOT on requestAnimationFrame: beat
  // timing then no longer jitters with framerate (a 30fps frame is 33ms of slop,
  // and two beats inside one frame would collapse into one). Beats found between
  // frames are latched into `beatNow` and cleared by frame() once updateAnims()
  // has consumed them, so none are ever dropped.
  const HOP_MS = CONFIG.tuning.hopMs;   // ms between analysis ticks (100Hz, framerate-independent — see CLAUDE.md)
  const FLUX_HIST = 100;      // flux values kept per band (~1s) for the adaptive threshold
  const PEAK_DECAY = 0.996;   // per tick; recent-peak half-life ≈ 1.7s (tracks volume changes)
  const SILENCE = 2e-4;       // mean band magnitude below this ⇒ silence, never a beat
  const WARMUP = 30;          // ticks before the first beat (let the flux history fill)
  const AVG_ALPHA = 0.2;      // EMA speed of the displayed band level (meter only)
  const PULSE_TAU = 0.12;     // s; beat-pulse decay (drives the level meter + chip glow)
  // ---- TEMPO TRACKER constants (see CONFIG.tuning) ---------------------------------------
  const TEMPO_HZ = CONFIG.tuning.tempoHz, TEMPO_WIN = CONFIG.tuning.tempoWin;
  const TEMPO_EVERY = CONFIG.tuning.tempoEvery;
  const TEMPO_MIN_BPM = CONFIG.tuning.tempoMinBpm, TEMPO_MAX_BPM = CONFIG.tuning.tempoMaxBpm;
  const TEMPO_PREF_BPM = CONFIG.tuning.tempoPrefBpm, TEMPO_PREF_W = CONFIG.tuning.tempoPrefW;
  const PLL_A = CONFIG.tuning.tempoPllA, PLL_B = CONFIG.tuning.tempoPllB;
  const CONF_MIN = CONFIG.tuning.tempoConfMin, LOCK_TOL = CONFIG.tuning.tempoLockTol;
  const TEMPO_SMOOTH = CONFIG.tuning.tempoSmooth;
  const OCT_SUB = CONFIG.tuning.tempoOctSub;                       // sub-multiple must score this fraction to win
  const CONF_R0 = CONFIG.tuning.tempoConfR0, CONF_R1 = CONFIG.tuning.tempoConfR1;   // r -> confidence ramp
  // Lag bounds in DECIMATED samples. Longest lag = slowest tempo, so MIN_BPM gives LAG_MAX.
  const LAG_MIN = Math.floor(60 * TEMPO_HZ / TEMPO_MAX_BPM);
  const LAG_MAX = Math.ceil(60 * TEMPO_HZ / TEMPO_MIN_BPM);
  const TEMPO_DECIM = Math.max(1, Math.round(1000 / (CONFIG.tuning.hopMs * TEMPO_HZ)));
  // Live-tunable detector thresholds (the "b" dev overlay edits these; audioTick +
  // computeBins read them). Defaults equal the old FLUX_K / FLUX_FLOOR / BEAT_REFRACT
  // consts and band edges, so out-of-the-box detection is unchanged. Persisted to
  // localStorage + Backup (never Share/scenes) — see collectBeatTune/applyBeatTune.
  const BEAT_DEFAULTS = CONFIG.beatDefaults;   // shipped detector tuning (fluxK/floor/refract/bands) — see config.js
  const beatCfg = { lead: BEAT_DEFAULTS.lead, lock: BEAT_DEFAULTS.lock,
    fluxK: BEAT_DEFAULTS.fluxK.slice(), floor: BEAT_DEFAULTS.floor,
    refract: BEAT_DEFAULTS.refract.slice(), bands: BEAT_DEFAULTS.bands.map(b => b.slice()) };
  const audio = {
    ctx: null, analyser: null, db: null, mag: null, prev: null, stream: null,
    on: false, src: "off", timer: 0, tPrev: 0, warm: 0,
    // Muted: the stream and the analyser stay exactly as they are and we simply stop
    // looking at them (see setMuted for why this is not stopAudio). TRANSIENT — the same
    // class as pause and fullscreen, deliberately absent from fullSnapshot: a reload that
    // silently came back muted would read as "the beat detection is broken".
    muted: false,
    // Has the user SETTLED the audio question? With no stored source the app now arms the
    // mic by default (see restore()), and "nothing stored" has to mean "never chose" rather
    // than "chose not to" — pressing Stop, or refusing the browser's permission prompt, both
    // leave `on` false and `src` "off", so without this they read as never-chosen and the
    // next load re-arms the mic over the top of the decision. Persisted as the string "off"
    // in the `audio` field, which older blobs simply never carry.
    settled: false,
    bins: [[1, 7], [7, 116], [116, 557]],   // [start,end] FFT bin per band; set from sampleRate
    energy: [0, 0, 0], pulse: [0, 0, 0],
    flux: [0, 0, 0], thr: [0, 0, 0], peak: [0, 0, 0],
    f1: [0, 0, 0], f2: [0, 0, 0],           // flux at t-1 / t-2, for local-max peak picking
    hist: [null, null, null], hi: 0,        // ring buffer of flux per band
    beatNow: [false, false, false], lastBeat: [0, 0, 0], bpm: [0, 0, 0],
    // The tuning-free INGREDIENTS of a beat, published per tick so each armed trigger can
    // apply its OWN thresholds to them. `cand` is the whole peak-picking test that carries no
    // tuning (warm, local max, not silent); `med` is the adaptive median. Everything above
    // stays exactly as it was and still drives the meter, the trace and the chip glow.
    cand: [false, false, false], med: [0, 0, 0], candFlux: [0, 0, 0],
    // ---- TEMPO: where the NEXT beat is, as opposed to where the last one was ------------
    // The detector above is reactive by construction -- it peak-picks the previous hop, so a
    // beat is known 10ms after it happened. Nothing built on it can rise INTO a beat. This is
    // the separate, continuously-maintained grid that can: `period` ms between beats, `anchor`
    // the ms timestamp of the most recent grid beat, `conf` how much to believe it.
    //
    // TRANSIENT, like `muted` -- never in fullSnapshot. A tempo is a property of whatever is
    // playing right now, not of the scene.
    tempo: { period: 0, bpm: 0, anchor: 0, conf: 0 },
    env: null, envI: 0, envN: 0, envAcc: 0, envAccN: 0, envTick: 0,
    envSm: null, envSmI: 0, envSmSum: 0,      // moving-average window on the way in
  };
  // ---- per-trigger beats -------------------------------------------------------------
  // A TRIGGER is one (layer slot, control key) pair — not just a key, because beatOf() is
  // per layer, so two layers can arm the same slider with different tuning. Each keeps its own
  // refractory clock and its own latch, so one slider's Refractory can no longer reach across
  // and retune every other armed slider (which is exactly what the shared beatCfg.refract did).
  //
  // The expensive half of detection — the bin loop, the flux, the median — is computed ONCE
  // per band in audioTick and shared. This is only the three comparisons that read tuning.
  const trigState = {};          // "<slot>/<key>" -> { lastBeat:[3], now:[3], pulse:[3] }
  let trigList = [];             // the armed triggers, rebuilt when arming or tuning changes
  var trigDirty = true;          // var: loadBtune runs from restore(), slices before this one
  const trigKey = (slot, id) => slot + "/" + id;
  function trigFor(slot, id) {
    const k = trigKey(slot, id);
    return trigState[k] || (trigState[k] = { lastBeat: [0, 0, 0], now: [false, false, false], pulse: [0, 0, 0] });
  }
  // Rebuilt lazily rather than scanned every 10ms tick: `stack × anims` is ~240 pairs and
  // almost none of them are armed.
  function rebuildTriggers() {
    trigDirty = false;
    trigList = [];
    for (let s = 0; s < stack.length; s++) {
      const L = stack[s];
      if (!L) continue;
      for (const id in anims) {
        const br = beatOf(L, id);
        if (!br || !(br.low || br.mid || br.high)) continue;
        trigList.push({ st: trigFor(s, id), br, tune: tuneEff(tuneOf(L, id)) });
      }
    }
  }
  // Consumed by stepAnim exactly like audio.beatNow used to be, but per trigger.
  function trigBeat(slot, id, band) { const t = trigState[trigKey(slot, id)]; return !!(t && t.now[band]); }
  function trigPulse(slot, id, band) { const t = trigState[trigKey(slot, id)]; return t ? t.pulse[band] : 0; }
  // "A source is running AND it is reaching the visual" — the predicate every REACTION site
  // wants, as opposed to `audio.on`, which means only "a stream is open". The two differ
  // exactly while muted. Kept separate rather than clearing `audio.on`, because `audio.on`
  // is what the Capture/Mic buttons, the resume-on-gesture path and fullSnapshot's
  // last-live-source all read, and none of those should think the source went away.
  // A thumbnail render has no audio: its synthetic beat (thumbBeat) stands in.
  const audioLive = () => THUMB ? !!THUMB.beat : audio.on && !audio.muted;
  const meterBars = panel.querySelectorAll(".meter i");
  function computeBins() {
    const hz = audio.ctx.sampleRate / audio.analyser.fftSize;   // Hz per bin
    const N = audio.db.length - 1;
    const R = (f0, f1) => [Math.max(1, Math.round(f0 / hz)), Math.min(N, Math.round(f1 / hz))];
    // Narrower than "everything": the kick lives at 30–150Hz, so widening low to
    // 250Hz just dilutes it with bass notes; and 2k–16k averaged over ~680 mostly
    // empty bins is so quiet it could never clear the old absolute floor. The edges
    // are live-tunable (beatCfg.bands, the "b" overlay); these are the defaults.
    audio.bins = beatCfg.bands.map(b => R(b[0], b[1]));          // low / mid / high
  }
  // Median of a band's flux history — robust to the beats inside the window
  // (they're sparse), so it estimates the band's noise floor, not its loudness.
  const medBuf = new Float32Array(FLUX_HIST);
  function median(a) { medBuf.set(a); medBuf.sort(); return medBuf[FLUX_HIST >> 1]; }
  function audioMsg(m) {
    const e = el("audMsg"); e.textContent = m || ""; e.style.display = m ? "block" : "none";
    // ...and in the Capture / Mic dialog while it is up: it may be the only thing on screen,
    // and a refused or audio-less share has to say why the dialog did not close.
    const p = document.getElementById("syncpop"), w = document.getElementById("sync-why");
    if (m && p && w && !p.classList.contains("hidden")) { w.textContent = m; w.hidden = false; }
  }
  function setAudioUI() {
    el("vAudio").textContent = audio.on ? (audio.muted ? audio.src + " · muted" : audio.src) : "off";
    // Capture/Mic stay LIT while muted — the source really is still running, and dimming
    // them would invite a click that tears the stream down and re-opens the picker.
    el("audCapture").classList.toggle("on", audio.on && audio.src === "capture");
    el("audMic").classList.toggle("on", audio.on && audio.src === "mic");
    // The chips dim on audioLive(), not audio.on: while muted they genuinely cannot fire,
    // so showing them armed-and-ready would be a lie.
    panel.classList.toggle("audio-off", !audioLive());
    el("breakout").classList.toggle("audio-off", !audioLive());   // dim popped-out chips too
    const mb = el("mute");
    if (mb) {
      mb.classList.toggle("muted", audio.muted);
      mb.classList.toggle("off", !audio.on);          // nothing to mute
      mb.setAttribute("aria-label", audio.muted ? "Audio — the reaction is paused" : "Audio");
      mb.title = !audio.on ? "Audio — start Capture or Mic"
        : audio.muted ? "Audio — the reaction is paused (S resumes it)"
        : "Audio — " + audio.src;
    }
    // The mute that used to be the ♪ itself: a tick in the Audio box, live only with a source.
    const pz = el("audPause");
    if (pz) { pz.checked = audio.muted; pz.disabled = !audio.on; }
  }
  // Mute WITHOUT touching the stream. stopAudio() would be wrong here: a browser cannot
  // silently re-grab tab/screen audio, so coming back would cost a fresh picker dialog —
  // that is a Stop button, not a mute button. Everything downstream reads audioLive(), so
  // muting looks exactly like "audio off" to the visual: armed sliders resume their free
  // drift between the thumbs rather than freezing at the low one, which is what merely
  // starving them of beats would have looked like.
  function setMuted(m) {
    audio.muted = !!m;
    if (audio.muted) {
      // Zero what the visual is still holding. audioTick early-returns from here on, so
      // nothing refills these; flashChips() once on the way down clears the inline lit
      // styles back to the CSS default, exactly as stopAudio does.
      for (let b = 0; b < 3; b++) { audio.pulse[b] = 0; audio.energy[b] = 0; audio.beatNow[b] = false; }
      // Same reason as stopAudio: audioTick early-returns while muted, so the envelope stops
      // being fed and the grid goes stale. Unmuting onto a stale grid would fire every
      // tempo-locked trigger at once.
      tempoReset();
      clearTrigState();
      updateMeter(); flashChips();
    }
    setAudioUI();
  }
  function toggleMute() {
    if (!audio.on) {
      audioMsg("Nothing to mute yet — start Capture or Mic above.");
      // No source yet, so there is nothing to mute: offer the source picker instead (the
      // same Capture / Mic dialog the startup nudge shows). Not with the UI hidden, though:
      // body.ui-hidden display:nones #syncpop, and an invisible modal still traps focus.
      // There, and when the tutorial refuses it, the toast still says where to go — it
      // works with the panel closed and the UI hidden, which is exactly when the S key
      // gets pressed.
      if (document.body.classList.contains("ui-hidden") || !openAudioDialog("Nothing to mute yet — pick an audio source and the visual starts reacting."))
        flashUiHint("No audio yet — <b>♪</b> to start Capture or Mic");
      return;
    }
    setMuted(!audio.muted);
    audioMsg("");
    // Mirror the state change for the same reason: with the UI hidden the ♪ glyph and its
    // strike-through are not on screen to read.
    flashUiHint(audio.muted ? "Audio muted — <b>S</b> to unmute" : "Audio unmuted");
  }
  function stopStream() { if (audio.stream) { audio.stream.getTracks().forEach(t => t.stop()); audio.stream = null; } }
  function stopAudio() {
    stopStream();
    if (audio.timer) { clearInterval(audio.timer); audio.timer = 0; }
    audio.on = false; audio.src = "off";
    audio.settled = true;         // a deliberate Stop — don't re-arm the mic on the next load
    audio.muted = false;          // don't leave the next Capture/Mic silently muted
    for (let b = 0; b < 3; b++) {
      audio.pulse[b] = 0; audio.energy[b] = 0; audio.beatNow[b] = false;
      audio.flux[b] = audio.thr[b] = audio.peak[b] = audio.f1[b] = audio.f2[b] = audio.bpm[b] = 0;
      audio.cand[b] = false; audio.med[b] = audio.candFlux[b] = 0;
    }
    tempoReset();          // a stale grid surviving a Stop would fire the instant audio returns
    clearTrigState();
    updateMeter(); flashChips(); setAudioUI(); persist();
  }
  async function startAudio(kind) {
    try {
      audioMsg("");
      if (!audio.ctx) audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
      await audio.ctx.resume();                          // must be inside the click gesture
      const stream = kind === "capture"
        ? await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
        : await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stream.getAudioTracks().length === 0) {        // shared a tab/screen without audio
        stream.getTracks().forEach(t => t.stop());
        // Firefox (esp. on Windows) can't share screen/tab audio via
        // getDisplayMedia and shows no "Share audio" checkbox at all.
        audioMsg(/firefox/i.test(navigator.userAgent)
          ? "Firefox can't share screen/tab audio — use the Mic button, or open this in Chrome/Edge."
          : "No audio came through — pick a screen or tab and tick “Share audio” in the picker.");
        return;
      }
      stopStream();                                      // replace any prior stream
      audio.stream = stream;
      const node = audio.ctx.createMediaStreamSource(stream);
      audio.analyser = audio.ctx.createAnalyser();
      audio.analyser.fftSize = 2048;                     // 21–23Hz/bin: enough resolution to isolate the kick
      audio.analyser.smoothingTimeConstant = 0;          // never smooth — it blurs the transients we detect
      audio.analyser.minDecibels = -95;
      audio.analyser.maxDecibels = -10;
      node.connect(audio.analyser);                      // NOT connected to destination — no echo
      audio.db = new Float32Array(audio.analyser.frequencyBinCount);
      audio.mag = new Float32Array(audio.db.length);
      audio.prev = new Float32Array(audio.db.length);
      for (let b = 0; b < 3; b++) {
        audio.hist[b] = new Float32Array(FLUX_HIST);
        audio.peak[b] = audio.f1[b] = audio.f2[b] = audio.energy[b] = 0;
        audio.lastBeat[b] = 0; audio.bpm[b] = 0;
      }
      audio.hi = 0; audio.warm = 0; audio.tPrev = 0;
      tempoReset();
      computeBins();
      audio.on = true; audio.src = kind;
      if (audio.timer) clearInterval(audio.timer);
      audio.timer = setInterval(audioTick, HOP_MS);      // analysis is NOT tied to the render loop
      stream.getAudioTracks()[0].onended = stopAudio;    // user revokes the share
      setAudioUI(); persist();
      track("audio_started", { source: kind });          // conversion: a source is live
      markAudioUsed();                                   // satisfy the sync nudge for good
    } catch (err) {
      // A refusal is an answer too. Without this the default mic arm would fire again on
      // every single load, and a blocked site answers the prompt instantly and invisibly —
      // so it would be a silent failed request forever, with the error line to match.
      // ONLY A REFUSAL SETTLES IT. `settled` persists as audio:"off" and restore() then never
      // re-arms the mic on ANY future visit, so it has to mean "the user answered the question".
      // A refusal is an answer; a device being busy is not. NotReadableError (the mic held by
      // Teams/Discord -- routine on Windows) and NotFoundError (no capture device attached yet)
      // used to settle it too, so opening the page during a call permanently switched off the
      // default arm for the feature nobody finds unaided.
      const refused = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
      if (refused) audio.settled = true;
      audioMsg(refused ? "Permission denied." : "Couldn’t start audio.");
      if (refused) audioRefused(kind);
      persist();
    }
  }
  // One analysis tick (every HOP_MS, off the render loop). Beats are *latched*
  // into beatNow[] — frame() consumes and clears them via clearBeats().
  // `t` is only passed by the headless tests, which drive the detector with
  // synthetic spectra on a fake clock; the live timer calls audioTick() bare.
  function audioTick(t) {
    // Muted: stop analysing entirely rather than analysing and discarding. The interval
    // keeps running so unmuting is instant, and `tPrev` is deliberately left stale — the
    // next live tick sees one long dt, which only widens that tick's flux window; the
    // adaptive median re-settles within its own ~1s history either way.
    if (audio.muted) return;
    const now = t === undefined ? performance.now() : t;
    const dt = audio.tPrev ? (now - audio.tPrev) / 1000 : HOP_MS / 1000;
    audio.tPrev = now;
    audio.analyser.getFloatFrequencyData(audio.db);

    const db = audio.db, mag = audio.mag, prev = audio.prev;
    const minDb = audio.analyser.minDecibels, span = audio.analyser.maxDecibels - minDb;
    for (let i = 0; i < mag.length; i++) {
      const d = db[i];
      mag[i] = d <= minDb ? 0 : Math.pow(10, d / 20);    // dB → linear amplitude
    }

    if (audio.warm < WARMUP) audio.warm++;               // don't fire until the history is real
    // The tempo tracker is fed from this loop's flux and its onsets. `onsetTick` is set only
    // where a beat FIRES this tick -- audio.beatNow is a latch that frame() drains, so it can
    // still read true from an earlier tick and would nudge the PLL repeatedly for one beat.
    let fluxSum = 0, onsetTick = false;
    for (let b = 0; b < 3; b++) {
      const i0 = audio.bins[b][0], i1 = audio.bins[b][1], n = i1 - i0 + 1;
      let sum = 0, lvl = 0, flux = 0;
      for (let i = i0; i <= i1; i++) {
        sum += mag[i];
        lvl += Math.max(0, Math.min(1, (db[i] - minDb) / span));   // 0..1, for the meter only
        const d = mag[i] - prev[i];
        if (d > 0) flux += d;                            // half-wave rectified: rises only
      }
      sum /= n; lvl /= n; flux /= n;                     // per-bin means: bands stay comparable
      audio.energy[b] += (lvl - audio.energy[b]) * AVG_ALPHA;
      audio.peak[b] = Math.max(flux, audio.peak[b] * PEAK_DECAY);
      // The adaptive median is the expensive shared ingredient — computed ONCE and handed to
      // both the scene-wide test below and every per-trigger test after it.
      const med = median(audio.hist[b]);
      const thr = med * beatCfg.fluxK[b];
      audio.thr[b] = thr;

      // Peak-pick the *previous* tick: it's a beat if it was a local maximum of
      // flux, cleared the adaptive threshold and the relative floor, the band
      // isn't silent, and we're past its refractory period. Costs one tick (10ms)
      // of latency — far less than the ~2 frames the old analyser smoothing added.
      const f2 = audio.f2[b], f1 = audio.f1[b];
      // Publish the tuning-free half of that test for the per-trigger pass below. Split out
      // rather than duplicated: the candidate, the median and the peak are what every trigger
      // shares, and computing them twice is how the two would drift apart.
      const cand = audio.warm >= WARMUP && f1 >= flux && f1 > f2 && sum > SILENCE;
      audio.cand[b] = cand; audio.med[b] = med; audio.candFlux[b] = f1;
      if (cand && f1 > thr &&
          f1 > audio.peak[b] * beatCfg.floor &&
          now - audio.lastBeat[b] > beatCfg.refract[b]) {
        if (audio.lastBeat[b]) {
          const ibi = now - audio.lastBeat[b];           // inter-beat interval → rough BPM (debug readout)
          if (ibi < 2000) audio.bpm[b] += (60000 / ibi - audio.bpm[b]) * 0.2;
        }
        audio.beatNow[b] = true; audio.pulse[b] = 1; audio.lastBeat[b] = now;
        onsetTick = true;
      }
      audio.f2[b] = f1; audio.f1[b] = flux;
      audio.flux[b] = flux;
      audio.hist[b][audio.hi] = flux;
      audio.pulse[b] *= Math.exp(-dt / PULSE_TAU);
      fluxSum += flux;
    }
    // Tempo, from what the loop above already computed. Push first, then correct the phase:
    // an estimate arriving this tick should have the onset applied to it, not to the old one.
    tempoPush(fluxSum, now);
    if (onsetTick) tempoOnset(now);
    // ---- the same test again, once per armed trigger, with ITS thresholds ----------
    // Has to run here and not at frame time: the candidate exists for exactly one 10ms tick,
    // so a 60Hz consumer would miss beats between frames. That is why beats are latched at
    // all, and per-trigger beats need latching for the same reason.
    //
    // With no overrides this reproduces the scene-wide result exactly — same candidate, same
    // median, same thresholds — and each trigger's own lastBeat tracks the global one because
    // they fire together. That equivalence is the whole safety property, and beatprobe asserts
    // it tick by tick rather than by counting.
    if (trigDirty) rebuildTriggers();
    for (let i = 0; i < trigList.length; i++) {
      const T = trigList[i], st = T.st, tu = T.tune;
      // PREDICTIVE FIRING is opt-in per trigger and OFF in the shipped defaults, which is what
      // makes the whole tracker additive: with lead 0 and lock false this branch cannot be
      // taken, so the onset test below is reached on every tick exactly as it always was and a
      // scene saved before tempo tracking existed detects beats identically. tempoprobe
      // asserts that tick for tick.
      //
      // When it IS on, the grid REPLACES the onset rather than adding to it -- 'fire early
      // instead of on the onset' is the whole point, and running both would double every beat.
      // Lead and lock are one mechanism: firing from the grid is fill, doing it early is lead.
      const pre = (tu.lead > 0 || tu.lock) && tempoLocked();
      for (let b = 0; b < 3; b++) {
        if (!(b === 0 ? T.br.low : b === 1 ? T.br.mid : T.br.high)) continue;
        if (pre) {
          // FIRE OFF THE COUNTDOWN, NOT OFF A GRID INDEX. The obvious implementation -- number
          // the beats from `anchor` and fire when the number changes -- does not work, because
          // the PLL moves `anchor` onto every onset it sees. Relative to a moving origin the
          // index oscillates between two values across a single beat and fires on both
          // transitions: measured at 79 fires where the scene had 48 beats, landing at two
          // interleaved offsets that drifted apart. Time-to-next-beat carries no such state.
          //
          // The window is at least one hop wide so that lead 0 -- plain 'lock' -- fires ON the
          // beat instead of never: the countdown is only ever sampled every HOP_MS and would
          // otherwise step straight over zero.
          const TP = audio.tempo, eta = beatEta(now);
          if (eta >= 0 && eta <= Math.max(tu.lead, HOP_MS) && now - st.lastBeat[b] > TP.period * 0.5) {
            st.now[b] = true; st.pulse[b] = 1; st.lastBeat[b] = now;
          }
        } else if (audio.cand[b] && audio.candFlux[b] > audio.med[b] * tu.fluxK[b] &&
            audio.candFlux[b] > audio.peak[b] * tu.floor &&
            now - st.lastBeat[b] > tu.refract[b]) {
          st.now[b] = true; st.pulse[b] = 1; st.lastBeat[b] = now;
        }
        st.pulse[b] *= Math.exp(-dt / PULSE_TAU);
      }
    }
    audio.hi = (audio.hi + 1) % FLUX_HIST;
    prev.set(mag);
    if (dbg.on) dbgPush(now);
  }
  // Called by frame() *after* updateAnims() has read them, so a beat detected
  // between two frames still drives its sliders exactly once.
  function clearBeats() {
    audio.beatNow[0] = audio.beatNow[1] = audio.beatNow[2] = false;
    // Every per-trigger latch too, and for the same reason: frame() has just read them, so a
    // beat drives its slider exactly once. Missing this would leave a trigger stuck "beating"
    // and its slider pinned at the high thumb.
    for (const k in trigState) { const t = trigState[k]; t.now[0] = t.now[1] = t.now[2] = false; }
  }
  // Zero the per-trigger clocks. Called wherever the scene-wide ones are zeroed (mute, stop):
  // leaving a stale lastBeat behind would swallow the first beat after audio comes back.
  function clearTrigState() {
    for (const k in trigState) {
      const t = trigState[k];
      t.now[0] = t.now[1] = t.now[2] = false;
      t.pulse[0] = t.pulse[1] = t.pulse[2] = 0;
      t.lastBeat[0] = t.lastBeat[1] = t.lastBeat[2] = 0;
    }
  }
  // ================= TEMPO TRACKING =========================================================
  // Two halves, because they answer different questions at different rates.
  //
  // PERIOD comes from autocorrelating the onset envelope. That needs SECONDS of history and is
  // far too expensive to run per tick, so it runs 4 times a second over a decimated buffer.
  // PHASE comes from a PLL nudged by each confirmed onset -- cheap, per beat, and self-
  // correcting, which is what keeps the grid glued to the music between estimates.
  //
  // Everything here reads the flux the detector already computed. It adds no analysis of its
  // own to the hot path, and it is deliberately placed AFTER the per-band and per-trigger
  // loops so that not one line above it changes behaviour.

  // The envelope is the SUM of the three bands, not one of them. A tracker on the low band
  // alone follows the kick and loses tempo the moment a bar has no kick in it; broadband
  // onset strength is what tempo actually lives in.
  function tempoPush(env, now) {
    if (!audio.env) { audio.env = new Float32Array(TEMPO_WIN); audio.envN = 0; audio.envI = 0; }
    // Decimate by averaging rather than sampling: dropping 1 tick in 5 would alias a sharp
    // onset away entirely depending on where it fell.
    audio.envAcc += env; audio.envAccN++;
    if (audio.envAccN < TEMPO_DECIM) return;
    // SMOOTH ON THE WAY IN. Correlating a train of one-sample spikes is fragile: a period of
    // 45.5 samples aligns with nothing at lag 45 or 46 and perfectly at lag 91, so the tracker
    // locks an octave down for any tempo that lands between samples -- measured at 907.8ms for
    // a 455ms tempo. Spreading each onset over ~50ms costs nothing against periods of 300-1000ms
    // and makes neighbouring lags correlate the way a real onset envelope already would.
    if (!audio.envSm) { audio.envSm = new Float32Array(TEMPO_SMOOTH); audio.envSmI = 0; audio.envSmSum = 0; }
    const raw = audio.envAcc / audio.envAccN;
    audio.envSmSum += raw - audio.envSm[audio.envSmI];
    audio.envSm[audio.envSmI] = raw;
    audio.envSmI = (audio.envSmI + 1) % TEMPO_SMOOTH;
    audio.env[audio.envI] = audio.envSmSum / TEMPO_SMOOTH;
    audio.envAcc = 0; audio.envAccN = 0;
    audio.envI = (audio.envI + 1) % TEMPO_WIN;
    if (audio.envN < TEMPO_WIN) audio.envN++;
    if (++audio.envTick >= TEMPO_EVERY) { audio.envTick = 0; tempoEstimate(now); }
  }
  // Autocorrelation over the tempo lag range, NORMALISED, with the octave guard.
  function tempoEstimate(now) {
    const N = audio.envN;
    if (N < LAG_MAX * 2) return;                 // not enough history to see two periods
    const e = audio.env, W = TEMPO_WIN, i0 = audio.envI;
    const at = k => e[(i0 - 1 - k + W * 2) % W]; // k = 0 is the newest sample, walking back
    let mean = 0;
    for (let k = 0; k < N; k++) mean += at(k);
    mean /= N;
    // Variance, so the correlation can be normalised to r in [-1,1]. THAT normalisation is
    // what makes confidence meaningful: a raw covariance says nothing on its own, because its
    // size depends on how loud the music is. Compared against the average lag instead, noise
    // scored 0.71 and free-tempo onsets 0.90 -- both read as a solid tempo.
    let var0 = 0;
    for (let k = 0; k < N; k++) { const d = at(k) - mean; var0 += d * d; }
    var0 /= N;
    if (var0 < 1e-14) { audio.tempo.conf *= 0.5; return; }
    const r = new Float64Array(LAG_MAX + 1);
    let best = -1, bestLag = 0;
    for (let lag = LAG_MIN; lag <= LAG_MAX; lag++) {
      let s = 0;
      const n = N - lag;
      for (let k = 0; k < n; k++) s += (at(k) - mean) * (at(k + lag) - mean);
      r[lag] = s / (n * var0);                   // true normalised autocorrelation
      // A mild preference for ordinary tempi, as a TIE-BREAKER only. It used to be strong
      // enough (0.9 octaves) to drag a genuine 176 BPM down to 88 -- the bias has to lose to
      // real evidence, so it is wide and the octave rule below does the actual work.
      const bpm = 60 * TEMPO_HZ / lag;
      const oct = Math.log2(bpm / TEMPO_PREF_BPM) / TEMPO_PREF_W;
      const biased = r[lag] * Math.exp(-0.5 * oct * oct);
      if (biased > best) { best = biased; bestLag = lag; }
    }
    if (!bestLag || r[bestLag] <= 0) { audio.tempo.conf *= 0.5; return; }
    // THE OCTAVE RULE: prefer the SHORTEST lag that correlates comparably.
    // A periodic signal correlates at its period AND at every multiple of it -- for a steady
    // kick, r(2P) is nearly as high as r(P) -- so "highest peak" picks a multiple as often as
    // the fundamental, and the visual pulses at half speed. The fundamental is the shortest
    // lag that still scores, so walk down the sub-multiples and take the shortest comparable
    // one. Cases where the half really is weaker (offbeat hats under a kick) fail the ratio
    // test and stay put, which is exactly the discrimination wanted.
    //
    // COMPARE INTERPOLATED PEAKS, NOT RAW BINS, or this rule inverts precisely when it matters
    // most. A period landing between two lags -- 455ms on a 10ms grid -- is split across both
    // and each reads LOW, while its double lands on a whole lag and reads high. Compared bin to
    // bin the double wins and the tracker locks an octave down: measured at 907.8ms for a
    // 455ms tempo, with every other assertion still green.
    let bestPeak = lagPeak(r, bestLag);
    for (let div = 2; div <= 4; div++) {
      const c = bestLag / div;
      if (c < LAG_MIN) break;
      const p = lagPeak(r, c);
      if (p.val >= bestPeak.val * OCT_SUB) { bestPeak = p; break; }
    }
    const lagF = bestPeak.lag;
    // Confidence from the UNBIASED correlation at the chosen lag. Noise and free tempo sit
    // near 0 here however sharp their tallest accidental peak looked.
    const conf = Math.max(0, Math.min(1, (bestPeak.val - CONF_R0) / (CONF_R1 - CONF_R0)));
    const period = lagF * 1000 / TEMPO_HZ;
    const T = audio.tempo;
    // Re-lock hard on a genuinely different tempo, ease otherwise: a period that jumps every
    // estimate is a grid nothing can anticipate against.
    if (!T.period || Math.abs(period - T.period) > T.period * 0.2) { T.period = period; T.anchor = now; }
    else T.period += (period - T.period) * 0.25;
    T.bpm = T.period > 0 ? 60000 / T.period : 0;
    T.conf += (conf - T.conf) * 0.35;
  }
  // The correlation peak NEAR a lag, refined to sub-lag precision. Returns both where the peak
  // is and how tall it is, because the octave rule needs to compare heights of peaks that do
  // not sit on whole lags. Parabolic interpolation through the three bins around the local
  // maximum -- the standard refinement, and two lines.
  function lagPeak(r, c) {
    let bi = -1, bv = -Infinity;
    const a = Math.max(LAG_MIN, Math.floor(c) - 1), z = Math.min(LAG_MAX, Math.ceil(c) + 1);
    for (let L = a; L <= z; L++) if (r[L] > bv) { bv = r[L]; bi = L; }
    if (bi <= LAG_MIN || bi >= LAG_MAX) return { lag: bi, val: bv };
    const y0 = r[bi - 1], y1 = r[bi], y2 = r[bi + 1], den = y0 - 2 * y1 + y2;
    if (Math.abs(den) < 1e-12) return { lag: bi, val: y1 };
    const d = Math.max(-0.5, Math.min(0.5, (y0 - y2) / (2 * den)));
    return { lag: bi + d, val: y1 - 0.25 * (y0 - y2) * d };
  }
  // The PLL. Called with the timestamp of a confirmed onset; pulls the grid onto it.
  function tempoOnset(now) {
    const T = audio.tempo;
    if (!T.period) return;
    let err = (now - T.anchor) % T.period;
    if (err > T.period / 2) err -= T.period;      // wrap to the NEAREST grid line, +/- half a period
    T.anchor = now - err + PLL_A * err;
    T.period += PLL_B * err;
    // A grid that is being corrected hard every beat is not tracking; let confidence say so.
    const rel = Math.abs(err) / T.period;
    T.conf += ((rel < 0.08 ? 1 : 0) - T.conf) * 0.05;
  }
  // ---- what everything downstream asks -----------------------------------------------------
  // Both return -1 rather than a number when there is no usable grid, so a caller that forgets
  // to check gets an obviously wrong value instead of a plausible invented beat.
  function tempoLocked() { return audio.tempo.conf >= CONF_MIN && audio.tempo.period > 0; }
  function beatEta(now) {
    if (!tempoLocked()) return -1;
    const T = audio.tempo, d = (now - T.anchor) % T.period;
    return d <= 0 ? -d : T.period - d;
  }
  // 0 just after a beat, rising to 1 AT the next one. This is the argument an anticipatory
  // pulse shape is a function of -- note it runs the OPPOSITE way to the decaying st.pulse
  // every existing shape takes.
  function beatPhaseAt(now) {
    if (!tempoLocked()) return -1;
    const T = audio.tempo;
    let d = (now - T.anchor) % T.period;
    if (d < 0) d += T.period;
    return d / T.period;
  }
  function tempoReset() {
    const T = audio.tempo;
    T.period = T.bpm = T.anchor = T.conf = 0;
    audio.envI = audio.envN = audio.envAcc = audio.envAccN = audio.envTick = 0;
    audio.envSmI = 0; audio.envSmSum = 0;
    if (audio.env) audio.env.fill(0);
    if (audio.envSm) audio.envSm.fill(0);
  }
  function updateMeter() {
    for (let b = 0; b < 3; b++) {
      meterBars[b].style.height = (2 + audio.energy[b] * 16).toFixed(1) + "px";
      meterBars[b].style.background = audio.pulse[b] > 0.4 ? "#ff7a1a" : "#ffcf87";
    }
  }
  // Light up each enabled L/M/H chip when its band beats — a glow that tracks
  // the band's decaying beat pulse (only chips actually triggered light up).
  const BANDIDX = { low: 0, mid: 1, high: 2 };
  const BANDCOLOR = { low: "#5a9cff", mid: "#45cf62", high: "#ff5f4d" };   // L blue · M green · H red
  function flashChips() {
    for (const id in chipEls) {
      for (const k in chipEls[id]) {
        const el = chipEls[id][k];
        // THIS slider's trigger pulse, not the band's. A slider given a long refractory of its
        // own ignores beats the band still reports, and a chip that kept flashing on them
        // would say the tuning had not taken. chipEls is the SELECTED layer's block, so the
        // trigger is filed under stackSel.
        const lit = audioLive() && beatReact[id][k] ? trigPulse(stackSel, id, BANDIDX[k]) : 0;
        if (lit > 0.05) {
          // punchy flash: a bright halo that snaps on the beat and a quick scale pop,
          // both riding the band's decaying pulse.
          const col = BANDCOLOR[k];
          el.style.boxShadow = "0 0 " + (5 + lit * 18).toFixed(1) + "px " + col +
                               ", 0 0 " + (lit * 7).toFixed(1) + "px " + col;
          el.style.transform = "scale(" + (1 + lit * 0.35).toFixed(3) + ")";
        } else {
          el.style.boxShadow = "";
          el.style.transform = "";
        }
        // ...and the menu row's dot for the same band: dim at rest, lit on the beat.
        // Same pulse, quieter treatment — it is an overview, not the control.
        const dot = dotEls[id] && dotEls[id][k];
        if (dot) {
          if (lit > 0.05) {
            dot.style.opacity = (0.75 + lit * 0.25).toFixed(3);   // idle figure = the .ctl-dot CSS
            dot.style.boxShadow = "0 0 " + (3 + lit * 11).toFixed(1) + "px " + BANDCOLOR[k];
          } else {
            dot.style.opacity = "";
            dot.style.boxShadow = "";
          }
        }
      }
    }
  }
  // ---- beat-detection debug overlay (Diagnostics ▸ "Beat-detection trace" checkbox, or ?debug=1) ----
  // A scrolling trace per band: spectral flux (bright), the adaptive threshold it
  // must beat (dim), and a tick wherever a beat fired. This is the only way to see
  // *why* a beat was missed — flux never rose, or it rose but stayed under the
  // threshold, or it was inside the refractory window. Purely a dev tool: it's off
  // unless asked for, and pushes/draws nothing while off.
  const DBG_W = 520, DBG_LANE = 62, DBG_GAP = 16, DBG_TOP = 18;
  const BANDLABEL = ["LOW", "MID", "HIGH"];
  const hzShort = hz => hz >= 1000 ? (hz / 1000).toFixed(hz % 1000 ? 1 : 0) + "k" : String(hz);
  const bandName = b => BANDLABEL[b] + " " + hzShort(beatCfg.bands[b][0]) + "–" + hzShort(beatCfg.bands[b][1]) + "Hz";
  const BANDHEX = ["#5a9cff", "#45cf62", "#ff5f4d"];
  const dbg = {
    on: false, cv: null, g: null, i: 0,
    flux: [new Float32Array(DBG_W), new Float32Array(DBG_W), new Float32Array(DBG_W)],
    thr: [new Float32Array(DBG_W), new Float32Array(DBG_W), new Float32Array(DBG_W)],
    beat: [new Uint8Array(DBG_W), new Uint8Array(DBG_W), new Uint8Array(DBG_W)],
  };
  function dbgInit() {
    const h = DBG_TOP + 3 * (DBG_LANE + DBG_GAP);
    const cv = dbg.cv = document.createElement("canvas");
    cv.width = DBG_W; cv.height = h;
    cv.style.cssText = "position:fixed;left:278px;bottom:12px;z-index:60;width:" + DBG_W + "px;height:" + h +
      "px;background:rgba(0,0,0,.72);border:1px solid #333;border-radius:6px;pointer-events:none";
    document.body.appendChild(cv);
    dbg.g = cv.getContext("2d");
  }
  function dbgToggle(on) {
    dbg.on = on === undefined ? !dbg.on : !!on;
    if (dbg.on && !dbg.cv) dbgInit();
    if (dbg.cv) dbg.cv.style.display = dbg.on ? "block" : "none";
  }
  function dbgPush(now) {                               // one column per audioTick
    const i = dbg.i;
    for (let b = 0; b < 3; b++) {
      dbg.flux[b][i] = audio.flux[b];
      dbg.thr[b][i] = audio.thr[b];
      // beatNow is cleared by frame(), so latch off lastBeat instead: this tick
      // fired a beat iff the band's last beat is younger than one hop.
      dbg.beat[b][i] = now - audio.lastBeat[b] < HOP_MS ? 1 : 0;
    }
    dbg.i = (i + 1) % DBG_W;
  }
  function dbgDraw() {
    const g = dbg.g; if (!g) return;
    g.clearRect(0, 0, dbg.cv.width, dbg.cv.height);
    g.font = "10px ui-monospace,Consolas,monospace";
    g.fillStyle = "#9aa";
    g.fillText(audio.on ? "beat debug · flux vs adaptive threshold · " + HOP_MS + "ms/px · " +
      (DBG_W * HOP_MS / 1000).toFixed(1) + "s" : "beat debug · no audio source", 8, 12);
    for (let b = 0; b < 3; b++) {
      const y0 = DBG_TOP + b * (DBG_LANE + DBG_GAP), y1 = y0 + DBG_LANE;
      const F = dbg.flux[b], T = dbg.thr[b], B = dbg.beat[b];
      let max = 1e-9;
      for (let x = 0; x < DBG_W; x++) { if (F[x] > max) max = F[x]; if (T[x] > max) max = T[x]; }
      const Y = v => y1 - Math.min(1, v / max) * (DBG_LANE - 2);
      // dbg.i is the next write slot ⇒ the oldest sample. Walk the ring from
      // there so x is simply age: the trace scrolls right-to-left with time.
      const K = x => (dbg.i + x) % DBG_W;
      g.strokeStyle = "#2a2a2a"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, y1 + .5); g.lineTo(DBG_W, y1 + .5); g.stroke();
      g.strokeStyle = "rgba(255,255,255,.22)";          // beats
      g.beginPath();
      for (let x = 0; x < DBG_W; x++) if (B[K(x)]) { g.moveTo(x + .5, y0); g.lineTo(x + .5, y1); }
      g.stroke();
      g.strokeStyle = "#8a7440";                        // adaptive threshold
      g.beginPath();
      for (let x = 0; x < DBG_W; x++) { const v = Y(T[K(x)]); x ? g.lineTo(x, v) : g.moveTo(x, v); }
      g.stroke();
      g.strokeStyle = BANDHEX[b];                       // flux
      g.beginPath();
      for (let x = 0; x < DBG_W; x++) { const v = Y(F[K(x)]); x ? g.lineTo(x, v) : g.moveTo(x, v); }
      g.stroke();
      g.fillStyle = BANDHEX[b];
      // The tracked tempo, not the old per-band EMA of the last gap: one number for the
      // music, with a confidence, rather than three that disagree and drift.
      const TT = audio.tempo, tag = TT.conf >= CONF_MIN ? "  " + Math.round(TT.bpm) + " bpm " + Math.round(TT.conf * 100) + "%" : "";
      g.fillText(bandName(b) + (b === 0 ? tag : ""), 6, y0 + 10);
    }
  }
  if (/[?&]debug=1/.test(location.search)) { dbgToggle(true); const t = el("diagTrace"); if (t) t.checked = true; }

  el("audCapture").addEventListener("click", () => { track("capture_click"); startAudio("capture"); });
  el("audMic").addEventListener("click", () => { track("mic_click"); startAudio("mic"); });
  // Screen/tab audio capture is desktop-only — hide it (and Mic too if there's no
  // media at all, e.g. insecure origin) rather than throwing a generic error.
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    el("audCapture").style.display = "none";
    audioMsg("Tab/screen audio isn't available on this device — use Mic.");
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) el("audMic").style.display = "none";

  // Browsers won't silently re-grab tab/screen (or mic) audio after a reload — it
  // needs a fresh user gesture. So remember the last live source and re-open it on
  // the very first interaction. Skip if that gesture lands on the audio buttons
  // themselves (their own handlers start it) so we don't double-open the picker.
  // `var` with no initialiser: set here, read by the front door's audio question in a later
  // slice -- a source already chosen on an earlier visit is an answer, resumed on the first gesture.
  var audioArmed;
  function armAudioResume(kind) {
    audioArmed = true;
    const cleanup = () => {
      document.removeEventListener("pointerdown", resume, true);
      document.removeEventListener("keydown", resume, true);
    };
    function resume(e) {
      // NOT while the tutorial has the screen. This fires on the first gesture ANYWHERE, and
      // on a fresh load the first thing anyone clicks is the tour's Next button — which threw
      // the browser's "Choose what to share" picker straight over it, from a click that had
      // nothing to do with audio. Return WITHOUT cleanup so the arm survives: the next real
      // gesture, once the tour is done, resumes the source as it always did.
      if (tutorialOpen()) return;
      if (e.target && e.target.closest && e.target.closest("#audCapture, #audMic")) { cleanup(); return; }
      cleanup();
      if (!audio.on) startAudio(kind);
    }
    document.addEventListener("pointerdown", resume, true);
    document.addEventListener("keydown", resume, true);
  }
  el("audStop").addEventListener("click", stopAudio);
  // The ♪ itself opens the Audio box (ui-menubar.js); the pause lives in there, beside the
  // state it owns. The S key in the keydown handler calls toggleMute, which flips the same.
  el("audPause").addEventListener("change", e => { if (audio.on) { setMuted(e.target.checked); audioMsg(""); } else setAudioUI(); });
  setAudioUI();                 // paint the button's initial (no source ⇒ inert) state
  setAudioUI();

