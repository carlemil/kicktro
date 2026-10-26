  // ---- beat-detection tuning — per-preset scene data (localStorage, Backup, Share
  // and every preset). A snapshot of the live beatCfg, validated field by field.
  function collectBeatTune() {
    return { fluxK: beatCfg.fluxK.slice(), floor: beatCfg.floor,
             refract: beatCfg.refract.slice(), bands: beatCfg.bands.map(b => b.slice()) };
  }
  // REPLACE semantics, deliberately: build a fresh tuning from BEAT_DEFAULTS and overlay
  // only the fields the saved object actually supplies. The obvious alternative —
  // merging into the live beatCfg — leaks the previously selected preset's tuning into
  // any preset that omits a field, which for a preset saved before this feature is
  // every field. Mirrors mergeState/mergeBeat/mergePulse/mergePlen, which all start
  // from the descriptor's defaults for the same reason.
  function mergeBeatTune(saved) {
    const base = { fluxK: BEAT_DEFAULTS.fluxK.slice(), floor: BEAT_DEFAULTS.floor,
                   refract: BEAT_DEFAULTS.refract.slice(), bands: BEAT_DEFAULTS.bands.map(b => b.slice()),
                   lead: BEAT_DEFAULTS.lead, lock: BEAT_DEFAULTS.lock };
    if (!saved || typeof saved !== "object") return base;
    const nyq = 24000;   // half of a typical 48k rate; band edges must stay below it
    if (Array.isArray(saved.fluxK)) for (let b = 0; b < 3; b++)
      if (isFinite(+saved.fluxK[b]) && +saved.fluxK[b] > 0) base.fluxK[b] = +saved.fluxK[b];
    if (isFinite(+saved.floor) && +saved.floor >= 0 && +saved.floor <= 1) base.floor = +saved.floor;
    if (Array.isArray(saved.refract)) for (let b = 0; b < 3; b++)
      if (isFinite(+saved.refract[b]) && +saved.refract[b] >= 0) base.refract[b] = +saved.refract[b];
    if (Array.isArray(saved.bands)) for (let b = 0; b < 3; b++) {
      const e = saved.bands[b];
      if (!Array.isArray(e)) continue;        // a short/sparse array would throw on e[0]
      const lo = +e[0], hi = +e[1];
      if (isFinite(lo) && isFinite(hi) && lo >= 1 && hi > lo && hi <= nyq) base.bands[b] = [lo, hi];
    }
    // The tempo pair. Absent in every scene written before tempo tracking existed, which is
    // exactly why the base above is the neutral default rather than something inferred.
    if (isFinite(+saved.lead) && +saved.lead >= 0 && +saved.lead <= 400) base.lead = +saved.lead;
    if (typeof saved.lock === "boolean") base.lock = saved.lock;
    return base;
  }
  // Write a validated tuning into the live detector. beatCfg's FIELDS are replaced but
  // the object identity is kept — audioTick closes over it, and tools/beatprobe.js
  // slices it straight out of the constants block.
  function installBeatTune(t) {
    beatCfg.fluxK = t.fluxK.slice(); beatCfg.floor = t.floor;
    beatCfg.refract = t.refract.slice(); beatCfg.bands = t.bands.map(b => b.slice());
    beatCfg.lead = t.lead; beatCfg.lock = t.lock;
    if (beatUi && beatUi.wired) beatBuild();   // the sliders never refresh themselves
    if (audio.on) computeBins();               // computeBins throws before audio starts
  }
  function applyBeatTune(t) { if (t) installBeatTune(mergeBeatTune(t)); }

  const STORE_KEY = "burnTheWeb.v1";   // FROZEN PREFIX: the old app name. Renaming the key orphans existing data. See the note in config.js.
  // App version stamped into exported files (Backup) so you can tell which build wrote them.
  // Calendar-versioned (YYYY.MM.DD); bump it on a notable change or release. Distinct from the
  // per-file `version` field, which is the file-format schema version (still 1).
  const APP_VERSION = "2026.07.22";
  let persistReady = false, suppressPersist = false;
  // The single source of truth for "everything the user can change and we remember":
  // both localStorage (persist) and the Backup file are this exact object, so a new
  // saved setting can never end up in one but not the other. Anything NOT here is
  // deliberately transient (pause, fullscreen, the dev overlays) — see the Backup docs.
  // Which gallery collections you hold — `[{ key, uid }]`. FILLED by persist-presets.js
  // (noteCollection / forgetCollection / collectionsOk, all function declarations so they
  // hoist), DECLARED here because fullSnapshot and applyBlob are the readers and `restore()`
  // runs at the foot of this slice, three above that one — a `let` down there would be in the
  // TDZ on every reload that carried the field. Same split as cpuBlocked.
  let collectionsHeld = [];
  function fullSnapshot() {
    saveLiveMaps(effect);             // fold the live DOM/singletons into the current effect's maps (all of MAP_DEFS)
    return {
      states, beats: beatStates, pulses: pulseStates, plens: plenStates, btunes: btuneStates, extras, effect,
      layers: stackOut(),                            // the live stack (null ⇒ one item, omitted); each item carries its own `cam`
      // No `sceneFx` — retired; the decode (migrateSceneFx, in migrateBlob) runs forever.
      ranges: sceneRanges(),                       // custom slider min/max/step (only what differs)
      beatTune: collectBeatTune(),                   // live detector thresholds (localStorage + Backup only)
      palettes: customPalettes(),                    // user-authored ramps ({name, stops}); [] when there are none
      palUse: palUse ? [...palUse].sort((a, b) => a - b) : null,   // which ramps the strip shows / the cycle picks (null ⇒ all)
      palGone: [...palGone].sort((a, b) => a - b),   // soft-deleted shipped palettes (indices; [] = none)
      transUse: transUse ? [...transUse] : null,     // which transitions a scene change picks from (null ⇒ all)
      collections: collectionsHeld.map(c => ({ key: c.key, uid: c.uid })),   // gallery collections you have added (not their scenes — see cloudBlob)
      presets, curPreset,
      cycle: cycleChk.checked,                       // auto-cycle presets (global)
      ttl: [+el("ttl-lo").value, +el("ttl-hi").value],  // preset TTL (global, not per-effect)
      tdur: [+el("tdur-lo").value, +el("tdur-hi").value],   // transition length (ditto)
      scale: cfg.scale,                              // render resolution (global)
      panelOpen: !panel.classList.contains("hidden"),
      // Last live source, to re-arm on reload. THREE states, not two: a source name
      // re-arms that one, "off" means the user has settled the question (Stop, or a refused
      // permission prompt) and is left alone, and null/absent means never asked — which is
      // what restore() answers by arming the MIC. Older blobs carry null, so an existing
      // visitor who has never turned audio on is treated as never-asked, which is true.
      audio: audio.on ? audio.src : (audio.settled ? "off" : null),
    };
  }
  // The catch distinguishes the two failure classes on purpose. Storage full/disabled is a
  // fact of the environment and stays silent. Anything ELSE — a TypeError from fullSnapshot
  // reading a renamed DOM node, say — means persistence has silently STOPPED on every edit,
  // which is data loss wearing a green UI; log it once so a report can name it, then stay
  // quiet (the frame loop calls persist constantly and a broken snapshot would spam).
  let persistWarned = false;
  function persist() {
    if (!persistReady || suppressPersist) return;
    // The one edit choke point, so it is where automatic cloud save learns that something
    // changed. Deliberately AFTER the guard above: a scene being loaded at startup is not
    // an edit, and persistReady is exactly the flag that already says so.
    autoSaveNoteChange();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(serializeBlob(fullSnapshot()))); }
    catch (e) {
      const quota = e && (e.name === "QuotaExceededError" || e.name === "SecurityError");
      if (!quota && !persistWarned) {
        persistWarned = true;
        console.error("Kicktro: persist() is failing — edits are NOT being saved", e);
      }
    }
  }
  // Apply a settings blob (from localStorage or a shared URL). `sharing` skips the
  // browser-local bits (saved presets, panel state) so a shared link only carries
  // the settings themselves.
  function applyBlob(saved, sharing) {
    if (!saved) return;
    saved = deserializeBlob(saved);                // stable effect ids (or legacy numbers) → numeric indices
    migrateBlob(saved);                            // every legacy-shape fix, in one ordered funnel
    // Custom bounds FIRST, so the state validation below measures against them rather than
    // against the shipped ones. BOTH halves: the scene-wide sliders, and the per-layer ones,
    // which for a single-layer scene ride in this same map (sceneRanges folds them in when the
    // stack holds one item). A multi-layer blob carries its per-layer bounds on each item, so
    // layerRangesOf finds nothing here and setEffect applies the selected layer's instead.
    // Without the second half a widened slider came back shipped AND the value it allowed was
    // then rejected by the validator below and reset to its default.
    if (saved.ranges) { applyRanges(saved.ranges); applyLayerRanges(layerRangesOf(saved.ranges)); }
    if (saved.beatTune) applyBeatTune(saved.beatTune);   // detector thresholds (localStorage/Backup; absent in Share links)
    // Custom palettes BEFORE anything that reads a palette value. They are referenced by
    // index (PAL_BUILTIN and up), so a scene naming custom #21 needs #21 to exist by the time
    // its palette is validated — installing them later would silently reject every custom
    // reference and fall back to a built-in. `customPalettesOk` drops malformed entries
    // rather than letting a bad stop list reach grad(). A blob with no `palettes` key (every
    // scene saved before the editor existed) leaves the list untouched.
    if (saved.palettes !== undefined) {
      installCustomPalettes(customPalettesOk(saved.palettes));
      buildPalSwatches();                          // regenerate the swatch grid + <select> options
    }
    // ...and the in-use set AFTER them, since it validates indices against PALETTES.length.
    // Absent (every blob predating the picker) ⇒ null ⇒ all in use, so nothing changes.
    // Skipped while `sharing`: which ramps you keep in your strip is your own preference,
    // the same class as auto-cycle and the TTL, not part of the scene you were sent.
    if (!sharing && saved.palUse !== undefined) { palUse = palUseOk(saved.palUse); buildPalSwatches(); }
    // Soft-deleted shipped palettes — same preference class, same sharing skip. The
    // at-least-one-alive rule is enforced HERE (after customs installed, so the count is
    // real): a blob that would tombstone everything is ignored rather than half-applied.
    if (!sharing && saved.palGone !== undefined) {
      const g = palGoneOk(saved.palGone);
      if (PALETTES.length - g.size >= 1) { palGone = g; buildPalSwatches(); }
    }
    // Same class as palUse and auto-cycle: the recipient's own preference, so it is skipped
    // while `sharing`. Absent (every blob predating the picker) ⇒ null ⇒ all in use.
    if (!sharing && saved.transUse !== undefined) transUse = transUseOk(saved.transUse);
    // Which gallery collections you hold. Browser-local like the presets themselves, so it is
    // skipped while `sharing` — a scene link says nothing about whose sets the sender collects.
    if (!sharing && saved.collections !== undefined) collectionsHeld = collectionsOk(saved.collections);
    // Values validate against the LIVE bounds (custom ranges were applied above). The optional
    // third argument names the EFFECT a value belongs to: a per-effect shipped range (Fractal
    // flames' Points) belongs to an effect that is usually NOT the one on screen while this
    // runs, so widen by that effect's own bounds before testing — otherwise a flames scene
    // saved at 120k points is hard-rejected here and silently falls back to the default.
    const ok = (id, x, e) => {
      const n = ctl(id); if (!n) return false;
      let mn = +n.min, mx = +n.max;
      const r = e === undefined ? null : effectRange(id, e);
      if (r) { if (r.min !== undefined) mn = Math.min(mn, +r.min); if (r.max !== undefined) mx = Math.max(mx, +r.max); }
      return typeof x === "number" && x >= mn && x <= mx;
    };
    if (saved.states) {
      for (const k in states) {
        const ss = saved.states[k]; if (!ss) continue;
        for (const id in states[k]) {
          const v = ss[id]; if (v === undefined) continue;
          if (Array.isArray(states[k][id])) {                 // ranged: both thumbs in bounds
            // singlePair: this loop writes states[k][id] directly, bypassing mergeState, so a
            // blob saved before a control became single would land as a live spread.
            if (Array.isArray(v) && ok(id + "-lo", v[0], k) && ok(id + "-lo", v[1], k)) states[k][id] = singlePair(id, [v[0], v[1]]);
          } else if (ok(id, v, k)) states[k][id] = v;          // simple: in bounds
        }
      }
    }
    if (saved.beats) {
      for (const k in beatStates) {
        const bs = saved.beats[k]; if (!bs) continue;
        for (const id in beatStates[k]) {
          const b = bs[id]; if (!b) continue;
          for (const band of ["low", "mid", "high"]) if (typeof b[band] === "boolean") beatStates[k][id][band] = b[band];
        }
      }
    }
    if (saved.pulses) {                 // per-effect beat-pulse shapes (a blob may carry only non-default ids)
      for (const k in pulseStates) {
        const ps = saved.pulses[k]; if (!ps) continue;
        for (const id in pulseStates[k]) {
          const v = ps[id]; if (typeof v === "string" && PULSE_FN[v]) pulseStates[k][id] = v;
        }
      }
    }
    // Camera is per-layer state now: it rides in saved.states / saved.layers (applied above /
    // by installStack). A pre-per-layer scene's scene-wide `cam` was folded in by migrateCam.
    // There is no `sceneFx` apply either: migrateBlob consumed the field above (folding a
    // legacy one onto the layers and deleting it), and the whole-scene filter set is empty by
    // construction, so the old write-through here was a no-op running on nothing.
    if (saved.plens) {                  // ...and their lengths (absent in pre-feature blobs → PULSE_DROP)
      for (const k in plenStates) {
        const ps = saved.plens[k]; if (!ps) continue;
        for (const id in plenStates[k]) if (plenOk(ps[id])) plenStates[k][id] = ps[id];
      }
    }
    // ...and each slider's own detector thresholds. REPLACED per effect, not merged into the
    // existing map: an override is a thing you can also take AWAY, and merging would make a
    // cleared one immortal. Absent (every pre-feature blob) ⇒ the initBtuneStates() empties
    // stand and every slider inherits the global tuning.
    if (saved.btunes) {
      for (const k in btuneStates) if (saved.btunes[k]) btuneStates[k] = mergeBtune(saved.btunes[k]);
    }
    // Per-effect extras (palette / morph / show-box / TTL). Migrate a legacy blob
    // that stored these once at the root into every effect's extras.
    const legacy = saved.extras ? null : saved;
    const paletteOK = p => typeof p === "string" && paletteSel.querySelector('option[value="' + p + '"]');
    for (const k in extras) {
      const ex = saved.extras ? saved.extras[k] : legacy; if (!ex) continue;
      if (paletteOK(ex.palette)) extras[k].palette = ex.palette;
      const fok = filtersOk(ex.filters);          // absent in pre-filter blobs ⇒ keep the default
      if (fok) extras[k].filters = FILTERS.filter(f => fok.has(f.id)).map(f => f.id);
      if (typeof ex.morph === "boolean") extras[k].morph = ex.morph;
      if (typeof ex.showBox === "boolean") extras[k].showBox = ex.showBox;
      if (typeof ex.randSeed === "boolean") extras[k].randSeed = ex.randSeed;
    }
    if (typeof saved.cycle === "boolean") { cycleChk.checked = saved.cycle; cycleOn = saved.cycle; }
    // Preset TTL is a global setting (like auto-cycle), not per-effect. Migrate a legacy
    // per-effect ttl (once stored in extras) so old blobs still land on a sensible value.
    const savedTtl = saved.ttl
      || (saved.extras && saved.extras[saved.effect] && saved.extras[saved.effect].ttl)
      || (saved.extras && saved.extras["0"] && saved.extras["0"].ttl);
    if (Array.isArray(savedTtl) && ok("ttl-lo", savedTtl[0]) && ok("ttl-lo", savedTtl[1])) {
      el("ttl-lo").value = savedTtl[0]; el("ttl-hi").value = savedTtl[1];
      el("ttl-lo").dispatchEvent(new Event("input")); el("ttl-hi").dispatchEvent(new Event("input"));
    }
    // Transition length, same treatment: global, absent in pre-feature blobs ⇒ shipped.
    if (Array.isArray(saved.tdur) && ok("tdur-lo", saved.tdur[0]) && ok("tdur-lo", saved.tdur[1])) {
      el("tdur-lo").value = saved.tdur[0]; el("tdur-hi").value = saved.tdur[1];
      el("tdur-lo").dispatchEvent(new Event("input")); el("tdur-hi").dispatchEvent(new Event("input"));
    }
    if ([1, 1.5, 2, 3, 4].includes(saved.scale)) { cfg.scale = saved.scale; resSel.value = String(saved.scale); }
    if (Number.isInteger(saved.effect) && EFFECTS[saved.effect]) effectSel.value = saved.effect;
    // The stack, AFTER the states above: installStack thaws item 0 into states[...], so
    // running it earlier would have the per-effect restore overwrite the item's values.
    // A blob with no `layers` leaves the single default item alone — which is every blob
    // written before this feature, and every non-stacked one written after it.
    if (Array.isArray(saved.layers) && saved.layers.length) {
      installStack(mergeLayers(saved));
    } else {
      // NO `layers` ⇒ a single-layer scene — and it goes through THE SAME reader the
      // multi-layer case does, on a preset-shaped view of the runtime maps this function
      // just restored and validated. This branch used to hand-seed `stack[0].filters` and
      // `stack[0].ranges` instead, and both were bugs first: with one item nothing ever
      // read those fields back, so every reload silently unticked the filter chain, and a
      // widened slider came back shipped while the value it allowed was hard-rejected.
      // Hand-seeding fixed each in turn; routing through mergeLayers fixes the CLASS —
      // mergeLayers' fallback branch is already the one place "a single item described by
      // top-level fields" is turned into a stack item (applyPreset relies on it), so any
      // per-layer field added there is picked up here by construction.
      //
      // The maps are handed over rather than `saved`'s raw fields because the loop above
      // validated them (bounds-checked states, filtersOk'd extras); mergeLayers re-merging
      // them is idempotent, and installStack's thaw writes the same values straight back.
      const e = Number.isInteger(saved.effect) && EFFECTS[saved.effect] ? saved.effect : 0;
      installStack(mergeLayers({
        effect: e,
        state: states[e], beat: beatStates[e], pulse: pulseStates[e],
        plen: plenStates[e], btune: btuneStates[e],
        extra: extras[e],
        ranges: saved.ranges,          // one item ⇒ its bounds ride in the scene-wide map
      }));
    }
    effectSel.value = stack[0].fx;
    if (!sharing) {   // browser-local: saved presets + panel visibility
      if (Array.isArray(saved.presets)) presets = saved.presets.filter(p => p && EFFECTS[p.effect] && p.state && p.beat && p.extra);
      // Out of range (or a `-1` written before the scratch mode was removed) resolves to the
      // first scene rather than to "nothing selected" — ensureSelection() finishes the job once
      // the library is known to be non-empty. Old blobs and share links therefore keep loading;
      // they just land on a real scene.
      curPreset = (Number.isInteger(saved.curPreset) && saved.curPreset >= 0 && saved.curPreset < presets.length)
        ? saved.curPreset : (presets.length ? 0 : -1);
      if (typeof saved.panelOpen === "boolean") panel.classList.toggle("hidden", !saved.panelOpen);
      if (saved.audio === "capture" || saved.audio === "mic") armAudioResume(saved.audio);
      // "off" = the question is settled. This has to be READ BACK into the flag, not just
      // acted on: fullSnapshot rebuilds the field from `audio.settled`, so a session that
      // loaded "off" and never touched audio would write null on its very next edit and
      // re-arm the mic on the load after that — the decision would survive exactly one
      // reload.
      else if (saved.audio === "off") audio.settled = true;
    }
  }
  function restore() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { saved = null; }
    applyBlob(saved, false);
    // FIRST VISIT STARTS WITH THE PANEL HIDDEN, so a new visitor sees the show, not the
    // editor. Only when nothing was ever stored: a saved panelOpen of either value always
    // wins, so a returning user keeps their layout.
    if (!saved || typeof saved.panelOpen !== "boolean") panel.classList.add("hidden");
    // NO SOURCE EVER CHOSEN ⇒ arm the MIC. Reacting to music is the point of the app and
    // the thing nobody discovers on their own, so the default is on rather than off.
    // `armAudioResume` does not open anything by itself — it waits for the first user
    // gesture, because getUserMedia may only be called from one. Two consequences worth
    // knowing: the tutorial suppresses that gesture until the tour is done (so a first-time
    // visitor is told what the app does before the browser asks for their microphone), and
    // "off" is excluded here, which is the whole reason `audio.settled` exists.
    //
    // Here rather than in applyBlob, which also runs for an incoming SHARE blob: arming
    // twice would install two resume listeners and start two streams. restore() is the one
    // startup path and runs exactly once.
    const a = saved && saved.audio;
    // NOT AT THE FRONT DOOR, which asks instead (ui-help-misc): an armed mic there fires on the
    // click that picks a gallery card, and the permission prompt lands on the reload it starts.
    if (a !== "capture" && a !== "mic" && a !== "off" && !frontDoorOn()) armAudioResume("mic");
  }
  // Drop the payload from the address bar. Runs even when decode FAILS, so a
  // corrupt link doesn't stick around and get retried on every reload.
  function stripShareParam() {
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
  }
  // Install a decoded share blob. **Re-seeding first is load-bearing**: restore()
  // has already loaded the recipient's own scene into these maps, and applyBlob
  // SKIPS every key a blob omits — so without this, anything the sender left at a
  // default would silently inherit the recipient's value instead. The pruned
  // beats/pulses/plens maps omit defaults by design, so that bled through for
  // anyone who had used the app before (it looked perfect in a fresh browser).
  function installShared(d, name) {
    if (!d) return false;
    // ALL of them, via the table — the hand-written list this replaced was missing
    // initBtuneStates, so a recipient's own per-slider beat tuning (absent = "inherit",
    // and the pruned share blob omits untouched effects by design) silently bled into
    // every shared scene they opened. The table is how the next map cannot be missed.
    initAllMaps();
    sceneOn = new Set();     // same reason: a shared scene omitting sceneFx must not inherit the recipient's Scene filters
    // Same reason as the five above: a shared scene with no `layers` must land as ONE
    // item, not inherit whatever stack the recipient happened to have built.
    installStack([newStackItem(0)]);
    applyBlob(d, true);
    // A shared scene is KEPT: it becomes a real scene in a "Shared with you" collection rather
    // than an unsaved state you could edit and lose. Only the intent is recorded here — the
    // library write is adoptSharedScene(), three slices later, because the legacy ?s= path runs
    // this function synchronously while audio-tuning-data.js is still loading, before restore()
    // has populated `presets` at all. Pushing here would be thrown away by the load that
    // follows, quite apart from the TDZ on everything down there.
    pendingShared = { name: name || "", author: typeof d.author === "string" ? d.author : "" };
    return true;
  }
  // ?z= (deflated) or ?s= (legacy, uncompressed) — a single SCENE, never the presets.
  // #zp=/#sp= are the PRESET-BUNDLE links (a curated preset library), checked first and
  // mutually exclusive with the scene params. All are mutually exclusive by construction —
  // a share URL carries one.
  function applyShared() {
    const parse = json => { try { return JSON.parse(json); } catch (e) { return null; } };
    // Preset-bundle links → openSharedLibrary → the Restore dialog (merge/replace). That
    // function lives in a LATER slice (persist-backup-restore) and applyShared() runs during
    // THIS slice's load, before that one — so its state is still in the temporal dead zone.
    // The async unzip .then already lands after every slice has run; the sync #sp= path MUST
    // be deferred the same way (a microtask) or openSharedLibrary throws. Same trap as card/beatUi.
    //
    // The bundle rides in the FRAGMENT (location.hash), never the query: several KB of ?query
    // makes GitHub Pages / Fastly reject the link with 414 URI Too Long before any JS runs,
    // whereas the fragment is never sent to the server. Read the hash first, then the query
    // so the earlier ?zp=/?sp= links still decode.
    const bundle = re => (location.hash.match(re) || location.search.match(re));
    const zp = bundle(/[?&#]zp=([^?&#]+)/);
    const sp = zp ? null : bundle(/[?&#]sp=([^?&#]+)/);
    if (zp || sp) {
      try { history.replaceState(null, "", location.pathname); } catch (e) {}   // clear query AND fragment
      if (sp) { Promise.resolve().then(() => openSharedLibrary(parse(atobSafe(sp[1])))); return; }
      unzipFromB64(zp[1]).then(json => openSharedLibrary(parse(json)));
      return;
    }
    // #c=<id> — a scene stored by the API (see cloudShareScene). Same payload as ?z=, just
    // fetched instead of carried, so it lands through installShared exactly like one.
    // DEFERRED for the same reason #sp= is: cloudFetchScene lives in a much later slice whose
    // `CLOUD`/`API` consts are still in the temporal dead zone while this slice is loading. The fetch
    // is anonymous — a share link has to open for someone with no account.
    const c = (location.hash.match(/[?&#]c=([A-Za-z0-9_-]+)/) || location.search.match(/[?&]c=([A-Za-z0-9_-]+)/));
    if (c) {
      try { history.replaceState(null, "", location.pathname); } catch (e) {}
      Promise.resolve().then(() => cloudFetchScene(c[1])).then(got => {
        // The /scenes document carries the sender's own name for the scene; ?z= and ?s= have
        // nowhere to put one (sceneBlob has no name field), so only this path gets a real one.
        if (!got || !got.json || !installShared(parse(got.json), got.name)) return;
        resize();
        // The SAME stage/apply pair the ?z= branch below runs, and for the same reason: palette
        // and the filter chain are per-layer, held live in the paletteSel/activeIds singletons
        // for the SELECTED layer only. installStack writes L.palette/L.filters on the item
        // objects and never touches those globals, and loadExtra deliberately does not either --
        // so without these two calls the shared scene rendered in the RECIPIENT'S palette and
        // filters, and then setEffect's persist() -> captureLayerExtras wrote the recipient's
        // values back onto the shared layer, which adoptSharedScene saved. #c= is the link a
        // signed-in Share mints, so this was the default path.
        stageLayerExtras(stack[stackSel]);
        setEffect(+effectSel.value, false);
        applyLayerExtras(stack[stackSel]);
        adoptSharedScene();
      });
      return;
    }
    // #g=<card id> — a GALLERY card's link (galCopyLink): "builtin:<slug>" or a published scene's
    // id. It installs into "Shared with you" exactly as clicking the card does, through
    // applyRestore's write-and-reload. Deferred like #c=: galOpenLink is in a later slice.
    const g = location.hash.match(/[?&#]g=([A-Za-z0-9:_-]+)/);
    if (g) {
      // Only the fragment goes: a query (?api=, ?debug=1) is the page's own, read by later slices.
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      Promise.resolve().then(() => galOpenLink(g[1]));
      return;
    }
    const z = location.search.match(/[?&]z=([^&#]+)/);
    const m = z ? null : location.search.match(/[?&]s=([^&#]+)/);
    if (!z && !m) return;
    stripShareParam();
    // ?s= installs SYNCHRONOUSLY, mid-slice — no adoptSharedScene() call here on purpose. The
    // startup epilogue makes it, once restore() has built the library this scene has to join.
    if (m) { installShared(parse(atobSafe(m[1]))); return; }
    // The compressed path is async, so it lands after the startup below has already
    // run setEffect() on the recipient's own scene — re-activate once it arrives.
    unzipFromB64(z[1]).then(json => {
      if (!json || !installShared(parse(json))) return;
      resize();
      stageLayerExtras(stack[stackSel]);
      setEffect(+effectSel.value, false);
      applyLayerExtras(stack[stackSel]);   // the shared scene's selected-layer palette + filters
      adoptSharedScene();                  // ...and keep it, as a scene in its own collection
    });
  }
  function atobSafe(s) { try { return decodeURIComponent(escape(atob(s))); } catch (e) { return ""; } }
  // First-visit scene defaults from CONFIG (auto-cycle, Preset TTL, Transition). A saved scene
  // overrides these in restore() below — this only sets what a brand-new visitor sees. Dispatching
  // input mirrors restore()'s own ttl handling so the dual-slider fills follow; persist isn't armed
  // yet, so it's inert. (These are the DOM defaults that used to be hard-coded in the template.)
  el("cycle").checked = cycleOn;
  el("ttl-lo").value = CONFIG.scene.ttl[0]; el("ttl-hi").value = CONFIG.scene.ttl[1];
  el("tdur-lo").value = CONFIG.scene.transition[0]; el("tdur-hi").value = CONFIG.scene.transition[1];
  ["ttl-lo", "ttl-hi", "tdur-lo", "tdur-hi"].forEach(id => el(id).dispatchEvent(new Event("input")));
  restore();
  applyShared();
  // A link pasted into a tab that already shows the app changes only the FRAGMENT, and that
  // reloads nothing -- so every fragment link (#g=, #c=, #zp=, #sp=) was silently ignored in
  // an open tab. Reload, and it lands through applyShared exactly like a fresh open.
  window.addEventListener("hashchange", () => { if (/[?&#](g|c|zp|sp)=/.test(location.hash)) location.reload(); });
  resize();          // re-apply the restored render resolution (cfg.scale)

  // `enter` = this is a *fresh* entry into the effect (first load, an effect switch, a preset
  // apply) — run its onEnter (Julia re-rolls its random seed start) and drop banked sim
  // time. Merely RE-SELECTING an existing stack layer to edit it passes enter=false: the
  // layer keeps running exactly as it was, so selecting a layer never changes the render.
  function setEffect(i, save = true, enter = true) {
    if (save && i !== effect && states[effect]) saveLiveMaps(effect);   // remember the outgoing effect's whole map family
    const prevFx = stack[stackSel].fx;
    effect = i;
    // `effect` is the SELECTED stack item's effect — the one the menu edits. Every
    // editor-side use of it (shownKeys, refreshBreakout, resetControl, ctlOwner, the
    // cardioid button) keeps its exact meaning; only the render path reads
    // the stack. Assigned in this one place, so the two cannot drift apart.
    stack[stackSel].fx = i;
    applyEffectBlend(stack[stackSel], prevFx);   // an effect's shipped blend, unless you chose one
    effectSel.value = i;              // the chooser follows, so selecting a layer shows its effect
    syncStackUI();                    // the selected row's name follows the chooser
    const fx = EFFECTS[i];
    sub.textContent = fx.subtitle;
    juliaPower = 2;                   // Multibrot's draw overrides this every frame
    // show only the controls this effect declares (rendered from the CONTROLS schema)
    refreshControlVisibility();       // effect params + the ticked filters' params
    // The Orbit editor only means anything for a Mandelbrot-seeded (cardioid) effect. It is a
    // single, scene-wide sticky panel: `cardWanted` is the user's intent (button opens it, X /
    // Esc close it), and every setEffect shows it iff the selected effect is cardioid AND wanted.
    // So it stays open as you jump between cardioid layers (showing each layer's orbit) and
    // auto-hides on a non-cardioid layer, re-appearing when you return to a cardioid one.
    for (let s = 0; s < STACK_MAX; s++) {
      const b = ctlIn(s, "cardbtn"), L = stack[s];
      if (b) b.style.display = (s === stackSel ? fx.cardioid : L && EFFECTS[L.fx].cardioid) ? "" : "none";
    }
    cardOpen(!!fx.cardioid && cardWanted);
    applyLayerRanges(stack[stackSel].ranges);   // this layer's custom slider bounds — BEFORE loadState, so its values validate against them
    // Restore this effect's remembered sliders, beat toggles, pulse shapes + lengths, its
    // sliders' own detector thresholds, and palette/morph/show-box/random-seed — the whole
    // MAP_DEFS family, in table order (states first: loadState's synthetic inputs run
    // before the rest read the DOM).
    loadLiveMaps(i);
    if (enter && fx.onEnter) fx.onEnter();      // e.g. Julia re-rolls its start on entry — but NOT on a layer re-select
    if (enter) acc = 0;               // don't carry banked sim time across a switch (kept on a re-select)
    // The heat buffer is deliberately NOT cleared here. Leaving the outgoing effect's
    // heat in place lets it decay under the incoming scene instead of the screen
    // blinking to black — the switch becomes a dissolve, which matters most on
    // auto-cycle where it happens on its own every few seconds.
    //
    // It only *reads* as a fade when the incoming scene has a feedback filter (Fire or
    // Fade pixel) to decay it. With none, `applyFilters`/`glBeginHeat` rewrite the whole
    // buffer on the first frame anyway, so the old image is gone immediately — that is
    // the clean-slate contract those paths already have, not a regression here.
    persist();
  }

