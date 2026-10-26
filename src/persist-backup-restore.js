  // ---- Backup: ONE FILE PER PRESET, so a single scene can be sent to someone ----
  // The backup used to be one big .json holding everything. That is a fine backup and a
  // terrible way to hand someone a scene: they would have to import the lot and hunt for
  // it. Now each preset is its own self-contained file named after itself, plus one
  // _settings.json for everything that is not a preset (per-effect settings, resolution,
  // auto-cycle, the custom scene's beat tuning) so Backup is still a *complete* backup.

  function downloadText(name, text) {   // Blob → objectURL → synthetic anchor click
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  // Preset names are free text and end up as filenames. Strip what no filesystem
  // accepts, plus Windows' reserved device names (a preset called "CON" is unwritable).
  const WIN_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
  function safeFileName(name) {
    let s = String(name == null ? "" : name)
      .replace(/[\/\\:*?"<>|]/g, "-")     // path separators + Windows-illegal
      .replace(/[\x00-\x1f]/g, "")        // control chars
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/, "");             // Windows silently drops trailing dots/spaces
    if (!s) s = "Scene";
    if (WIN_RESERVED.test(s)) s = "_" + s;
    return s.slice(0, 80);
  }
  function stampNow() {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
           "_" + p(d.getHours()) + p(d.getMinutes());
  }
  // The files a backup consists of: [{ name, text }]. Preset files are self-describing
  // and self-contained — `kind` lets Restore tell them from a settings file or from any
  // of the older whole-library shapes without guessing.
  function backupFiles() {
    autosavePreset();                   // fold pending edits into the selected preset
    const snap = fullSnapshot();
    const files = [], used = new Set();
    for (const p of snap.presets) {
      let base = safeFileName(p.name), n = 2;
      while (used.has(base.toLowerCase())) base = safeFileName(p.name) + " (" + n++ + ")";
      used.add(base.toLowerCase());
      const one = serializeBlob({ presets: [p] }).presets[0];   // effect → stable id
      files.push({ name: base + ".json",
                   text: JSON.stringify({ app: "kicktro", kind: "preset", version: 1, appVersion: APP_VERSION, preset: one }, null, 2) });
    }
    // Everything that is not a preset. curPreset is deliberately left out: it is an index
    // into a list that no longer travels as a list, so it could only ever point at the
    // wrong scene once the files are re-selected in a different order.
    const settings = serializeBlob(snap);
    delete settings.presets; delete settings.curPreset;
    files.push({ name: "_settings.json",
                 text: JSON.stringify({ app: "kicktro", kind: "settings", version: 1, appVersion: APP_VERSION, settings }, null, 2) });
    return files;
  }
  // ---- remembering the backup folder ----------------------------------------
  // A browser cannot write to Downloads unprompted; real folders need a directory
  // handle the user picked. But a handle is structured-cloneable, so it can be kept
  // in IndexedDB and reused — the picker then appears once, ever, instead of on every
  // backup. (localStorage is no good here: it only stores strings.)
  const BK_DB = "burnTheWeb.fs", BK_STORE = "handles", BK_KEY = "backupRoot";   // FROZEN PREFIX: the old app name. Renaming the key orphans existing data.
  function bkStore(mode, fn) {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return res(null);
      const rq = indexedDB.open(BK_DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(BK_STORE);
      rq.onerror = () => res(null);                 // private mode etc — just re-pick
      rq.onsuccess = () => {
        const db = rq.result;
        let t, out;
        // Every step here can throw, and a throw inside an IDB event handler would
        // leave this promise pending forever — which would hang Backup, not just skip
        // the cache. put() in particular throws DataCloneError wherever directory
        // handles aren't structured-cloneable. Always resolve; the caller re-picks.
        try {
          t = db.transaction(BK_STORE, mode);
          out = fn(t.objectStore(BK_STORE));
        } catch (e) { db.close(); return res(null); }
        t.oncomplete = () => { db.close(); res(out && out.result !== undefined ? out.result : null); };
        t.onerror = t.onabort = () => { db.close(); res(null); };
      };
    });
  }
  const bkGet = () => bkStore("readonly", s => s.get(BK_KEY));
  const bkPut = h => bkStore("readwrite", s => s.put(h, BK_KEY));
  const bkClear = () => bkStore("readwrite", s => s.delete(BK_KEY));
  // A stored handle can go stale (folder deleted) or lose its grant. queryPermission
  // is silent when still granted; requestPermission is a one-click chip, not a folder
  // browser. Anything else ⇒ fall through to a fresh pick.
  async function bkUsable(h) {
    if (!h || !h.queryPermission) return false;
    try {
      const opt = { mode: "readwrite" };
      if (await h.queryPermission(opt) === "granted") return true;
      return await h.requestPermission(opt) === "granted";
    } catch (e) { return false; }
  }
  async function backupRoot(forcePick) {
    if (!forcePick) {
      const saved = await bkGet();
      if (await bkUsable(saved)) return saved;
    }
    const root = await window.showDirectoryPicker({ mode: "readwrite", id: "btwBackup" });
    await bkPut(root);
    return root;
  }
  // Chromium can write a real folder; everything else gets flat files with the stamp in
  // the name. Nesting via `a.download` is not an option for the fallback — the HTML spec
  // has user agents sanitize path components out of the filename, so "backup-x/y.json"
  // arrives as one mangled file rather than a folder.
  async function runBackup(btn, forcePick) {
    const files = backupFiles(), stamp = stampNow();
    const say = (msg, ms) => { btn.textContent = msg; setTimeout(() => btn.textContent = "Backup", ms || 2200); };
    if (window.showDirectoryPicker) {
      let root;
      try { root = await backupRoot(forcePick); }
      catch (e) { btn.textContent = "Backup"; return; }        // user cancelled the picker
      try {
        // Kicktro / <date-time>. No per-scene folder in between: a backup is *every*
        // preset, so naming it after whichever one happened to be selected described the
        // wrong thing and split one backup's history across as many folders as you had
        // presets. One dated folder per backup, all of them siblings.
        let dir = await root.getDirectoryHandle("Kicktro", { create: true });
        dir = await dir.getDirectoryHandle(stamp, { create: true });
        for (const f of files) {
          const fh = await dir.getFileHandle(f.name, { create: true });
          const w = await fh.createWritable();
          await w.write(f.text);
          await w.close();
        }
        say("Saved " + files.length + " files");
        track("backup_folder", { files: files.length });
      } catch (e) {
        // A remembered folder that has been deleted or revoked lands here. Drop it so
        // the next click picks afresh rather than failing forever.
        await bkClear();
        say("Backup failed — click again");
      }
      return;
    }
    // One download per file, spaced out: fired back-to-back, browsers drop all but the
    // first few. The stamp goes in the name since there is no folder to put it in.
    files.forEach((f, i) => setTimeout(() => downloadText("backup-" + stamp + " - " + f.name, f.text), i * 150));
    say("Saving " + files.length + " files…", 400 + files.length * 150);
    track("backup_files", { files: files.length });
  }
  // NB `backupFiles`/`runBackup`/`safeFileName`/`bkStore` above are no longer reachable from
  // the UI — the Backup button is gone and moving scenes around is a cloud-profile job now.
  // They are kept rather than deleted for two reasons: they are pure data/IO helpers with no
  // DOM dependency (so they cost nothing sitting here), and `presetprobe` pins safeFileName's
  // Windows filename traps, which are exactly the kind of thing that is painful to re-derive
  // if a local export ever comes back. Same treatment `shareUrl` already gets.
  //
  // Fold every shape we have ever written into the one the restore path understands:
  // a single-preset file, a _settings.json, a whole-library snapshot (the old Backup),
  // a legacy { presets, ranges }, or the oldest bare array. Run BEFORE deserializeBlob,
  // so its `effect` id → index mapping does the work in exactly one place.
  function normalizeBackup(raw) {
    if (Array.isArray(raw)) return { presets: raw };                        // oldest
    if (!raw || typeof raw !== "object") return null;
    if (raw.kind === "preset" && raw.preset) return { presets: [raw.preset] };
    if (raw.kind === "settings" && raw.settings) return raw.settings;
    return raw;                                                             // snapshot / legacy
  }
  // Validate + normalize a DESERIALIZED preset array (numeric effect indices) into the shape
  // the Restore dialog / applyRestore expect. Shared by file import and preset-bundle links.
  // beatTune must be carried through verbatim: the detector thresholds live nowhere else, so
  // dropping them hands the imported preset whatever tuning the recipient sat at. `cam` is
  // carried too, but ONLY as the legacy migration source: a backup written before the camera
  // went per-layer stored one root `cam`, and migrateCam folds it into the states / layers on
  // load. New backups omit it — the camera rides inline in `state` and each layer's `cam`.
  function validatePresetList(arr) {
    return (Array.isArray(arr) ? arr : [])
      .filter(p => p && EFFECTS[p.effect] && p.state && p.beat && p.extra)
      // `collection` (which published profile a scene came from) and `rotate` (whether it is
      // in the auto-cycle rotation) ride beside `name`. Both MUST be listed here explicitly —
      // this mapping rebuilds each preset from a literal, so a field left out of it is
      // silently dropped on every cloud load and gallery install (the trap presetprobe pins
      // for the scene fields). `rotate` is only ever `false` or absent, and absent means in.
      .map(p => ({ name: String(p.name || "Scene"), collection: p.collection,
                   rotate: p.rotate === false ? false : undefined, origin: originOk(p.origin), effect: p.effect,
                   state: mergeState(p.effect, p.state), beat: p.beat, pulse: mergePulse(p.effect, p.pulse), plen: mergePlen(p.effect, p.plen),
                   btune: mergeBtune(p.btune),
                   cam: p.cam, sceneFx: p.sceneFx, beatTune: mergeBeatTune(p.beatTune), ranges: p.ranges, extra: p.extra,
                   layers: Array.isArray(p.layers) ? p.layers : undefined }));
  }
  // `validatePresetList` and `normalizeBackup` above are very much still live: the cloud
  // load path and the gallery both run a fetched profile through them before it reaches the
  // Restore dialog. Only the FILE import that used to call them here is gone.

  // ---- Restore dialog: choose which parts to bring back, and merge vs replace ----
  let pendingRestore = null;
  function openRestore(parsed, valid, fileName) {
    const hasSettings = !Array.isArray(parsed) && !!parsed.states;
    const hasRanges = !Array.isArray(parsed) && parsed.ranges && typeof parsed.ranges === "object";
    const hasBeat = !Array.isArray(parsed) && parsed.beatTune && typeof parsed.beatTune === "object";
    pendingRestore = { parsed, valid, hasSettings, hasRanges, hasBeat };
    const bits = [];
    if (valid.length) bits.push(valid.length + " scene" + (valid.length === 1 ? "" : "s"));
    if (hasSettings) bits.push("settings"); if (hasRanges) bits.push("ranges"); if (hasBeat) bits.push("beat tuning");
    el("rst-sub").textContent = (fileName || "backup") + " — " + (bits.join(", ") || "nothing usable");
    el("rst-presets-n").textContent = "(" + valid.length + ")";
    // Enable only the parts the selection actually contains; check the available ones.
    const opt = (wrapId, cbId, avail) => {
      const cb = el(cbId); cb.checked = avail; cb.disabled = !avail;
      el(wrapId).classList.toggle("disabled", !avail);
    };
    // Selecting only _settings.json is legitimate, so Presets is no longer always on.
    opt("rst-opt-presets", "rst-presets", valid.length > 0);
    opt("rst-opt-settings", "rst-settings", hasSettings);
    opt("rst-opt-ranges", "rst-ranges", hasRanges);
    opt("rst-opt-beat", "rst-beat", hasBeat);
    el("rst-merge").checked = true;
    el("rst-mode").classList.toggle("disabled", !valid.length);
    el("restoredlg").classList.remove("hidden");
    dlgModal(el("restoredlg").querySelector(".rst-box"));
  }
  function closeRestore() {
    const box = el("restoredlg").querySelector(".rst-box");
    el("restoredlg").classList.add("hidden");
    pendingRestore = null;
    dlgRelease(box);
  }
  function applyRestore() {
    const p = pendingRestore; if (!p) return;
    autosavePreset();                          // fold pending live edits before snapshotting
    const out = fullSnapshot();                // current everything is the base; override chosen parts
    if (el("rst-presets").checked) {
      const coll = p.collection || "";
      // CUSTOM PALETTES FIRST, and before `lib` is built: the presets below are pushed by
      // reference, so their palette indices have to be correct by the time they land.
      // A payload predating this carries no list at all and skips the lot, which is why every
      // older backup, bundle and profile restores exactly as it did.
      const inPal = (p.parsed && !Array.isArray(p.parsed) && Array.isArray(p.parsed.palettes))
        ? p.parsed.palettes : null;
      if (inPal) {
        if (!coll && el("rst-replace").checked) {
          out.palettes = inPal;          // wholesale: their library, their ramps, positions intact
        } else {
          // Merge and collection installs both KEEP your library, so they keep your ramps too
          // and append theirs -- then the incoming scenes are remapped onto the merged
          // positions. Replacing here would delete every custom palette you have authored.
          const m = palMergeCustoms(out.palettes, inPal);
          out.palettes = m.list;
          palRemapIncoming(p.valid, m.map);
        }
      }
      let lib;
      if (coll) {
        // COLLECTION install (a gallery load). Someone else's scenes are kept as their own
        // set under their name rather than merged into yours: your library is untouched,
        // their "Sunset" and your "Sunset" are not a collision, and loading the same
        // profile again replaces just their set instead of piling up duplicates.
        // `keep` (one scene from the gallery, into "Shared with you") keeps the rest of that
        // collection and replaces only a same-named scene in it: loading a second card must
        // not throw away the first.
        lib = p.keep ? out.presets.slice() : out.presets.filter(x => (x.collection || "") !== coll);
        for (const q of p.valid) {
          const item = { ...q, collection: coll };
          const at = p.keep ? lib.findIndex(x => x.name === item.name && (x.collection || "") === coll) : -1;
          if (at >= 0) lib[at] = item; else lib.push(item);
        }
      } else if (el("rst-replace").checked) {
        lib = p.valid.slice();                 // Replace: only the backup's presets
      } else {                                 // Merge: overwrite same-named, keep the rest, append new
        // Matched on NAME **AND** COLLECTION, not name alone. Collections exist precisely so
        // that their "Sunset" and your "Sunset" are not a collision (see the branch above), and
        // an incoming list can now carry both — a profile load brings your own scenes and the
        // collections you follow in one array. Name alone would let a borrowed scene overwrite
        // your own. Identical for anything with no collections at all: every key is "".
        lib = out.presets.slice();
        const same = (x, q) => x.name === q.name && (x.collection || "") === (q.collection || "");
        for (const q of p.valid) { const at = lib.findIndex(x => same(x, q)); if (at >= 0) lib[at] = q; else lib.push(q); }
      }
      out.presets = lib;
      // The follow-list travels ONLY on a load of YOUR OWN profile — `__ownCloud`, which
      // comes from the out-of-band flag beside sharedLibrary, never from the payload, so a
      // stranger's #zp= bundle cannot claim it. (A gallery install has `coll` set and skips
      // this anyway; whose sets THEY follow is not a statement about whose you do.)
      //
      // Merge mode UNIONS, mirroring the scene merge above: a follow added locally since the
      // last save must survive loading that older copy, or its scenes vanish from the next
      // save with nothing recording them. Same key ⇒ keep the local entry unless the incoming
      // one carries a uid the local lacks (refollow heals uid-less entries by name, and a
      // healed uid should win over a blank). Replace keeps replace semantics.
      if (!coll && !Array.isArray(p.parsed) && p.parsed.__ownCloud && p.parsed.collections !== undefined) {
        const incoming = collectionsOk(p.parsed.collections);
        if (el("rst-replace").checked) out.collections = incoming;
        else {
          const merged = (out.collections || []).slice();
          for (const c of incoming) {
            const at = merged.findIndex(x => x.key === c.key);
            if (at < 0) merged.push(c);
            else if (c.uid && !merged[at].uid) merged[at] = c;
          }
          out.collections = merged;
        }
      }
      const sel = (!Array.isArray(p.parsed) && p.parsed.curPreset >= 0 && p.parsed.presets && p.parsed.presets[p.parsed.curPreset])
        ? p.parsed.presets[p.parsed.curPreset].name : null;
      // Match the sender's selection INSIDE the collection it was installed into — by name
      // alone it could land on a same-named scene of your own, which is exactly the
      // collision collections exist to stop.
      // No match (or nothing recorded) lands on the first scene rather than on nothing —
      // ensureSelection clamps it at startup either way.
      const found = sel ? lib.findIndex(x => x.name === sel && (x.collection || "") === coll) : -1;
      out.curPreset = found >= 0 ? found : 0;
      // A shared bundle records which preset the sender had open; land the receiver on it
      // (its scene, not just the dropdown) after the reload — a one-shot marker the startup
      // reads. Cleared on use, so ordinary reloads keep the persisted scene. Backups don't
      // carry curPreset, so this only fires for shared links.
      // Gated on `found`, NOT on out.curPreset: that is always >= 0 now, so testing it would
      // fire this one-shot for ordinary file restores too and yank them onto scene 0.
      try {
        if (found >= 0) sessionStorage.setItem("btw.applyPreset", String(found));
        else sessionStorage.removeItem("btw.applyPreset");
      } catch (e) {}
    }
    if (p.hasSettings && el("rst-settings").checked) {
      const s = p.parsed;
      out.states = s.states; out.beats = s.beats; out.extras = s.extras;
      if (s.pulses) out.pulses = s.pulses;         // per-effect beat-pulse shapes (absent in pre-feature backups)
      if (s.plens) out.plens = s.plens;            // ...and their lengths
      if (s.btunes) out.btunes = s.btunes;         // ...and each slider's own detector thresholds
      if (s.cam) out.cam = s.cam;                  // the global camera
      if (Number.isInteger(s.effect)) out.effect = s.effect;
      if (typeof s.cycle === "boolean") out.cycle = s.cycle;
      if (Array.isArray(s.ttl)) out.ttl = s.ttl;   // global preset TTL
      if (s.scale) out.scale = s.scale;
      if (typeof s.panelOpen === "boolean") out.panelOpen = s.panelOpen;
      // Settings-only restore: the live values came from the FILE, so they are not scene 0's.
      // Selecting scene 0 without applying it would let the next edit autosave the file's
      // values over it. Land on it AND apply it, so selection and picture agree — the rule the
      // whole no-scratch-mode change rests on.
      if (!el("rst-presets").checked) {
        out.curPreset = 0;
        try { sessionStorage.setItem("btw.applyPreset", "0"); } catch (e) {}
      }
    }
    if (p.hasRanges && el("rst-ranges").checked) out.ranges = p.parsed.ranges;
    if (p.hasBeat && el("rst-beat").checked) out.beatTune = p.parsed.beatTune;
    // Auto-cycle. A FILE restore forces it off, so the cycler doesn't move off what you just
    // restored (written into the blob rather than via stopCycling(), because applyRestore
    // reloads and a live toggle would be lost). A shared LINK, however, carries the sender's
    // auto-cycle toggle on purpose — "share the show" — so honour it: the receiver lands on
    // the selected preset (above) and then cycles the same way the sender's did.
    out.cycle = (!Array.isArray(p.parsed) && p.parsed.__link && typeof p.parsed.cycle === "boolean") ? p.parsed.cycle : false;
    // Write and reload, so the proven load path (restore → applyBlob → setEffect → resize) reapplies it all.
    // GUARDED, unlike every other storage write in the app, which this one was not. setItem throws
    // QuotaExceededError when storage is full or disabled (Safari private mode, enterprise policy),
    // and this is the last statement before the reload -- so a throw aborted the restore in silence:
    // the dialog just sat there. Worse, the btw.applyPreset one-shot above had already been written,
    // so the NEXT ordinary reload jumped to an index into the OLD library. Unlike persist()'s
    // deliberate silence this is data loss, so say so rather than swallow it.
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(serializeBlob(out)));   // effect identity stored as stable ids
    } catch (e) {
      try { sessionStorage.removeItem("btw.applyPreset"); } catch (e2) {}    // don't strand the one-shot
      const msg = el("rst-msg");
      if (msg) msg.textContent = "Couldn't save — browser storage is full or blocked. Nothing was changed.";
      return;
    }
    try { sessionStorage.setItem("kt.picked", "1"); } catch (e) {}   // land on it, not on the gallery (scenePicked)
    location.reload();
  }
  el("rst-go").addEventListener("click", applyRestore);
  el("rst-cancel").addEventListener("click", closeRestore);
  el("rst-close").addEventListener("click", closeRestore);
  el("restoredlg").addEventListener("click", e => { if (e.target === el("restoredlg")) closeRestore(); });   // backdrop
  // Merge/Replace only matters when Presets is being restored — dim it otherwise.
  el("rst-presets").addEventListener("change", () => el("rst-mode").classList.toggle("disabled", !el("rst-presets").checked));

  // ---- Sending is mostly gone; RECEIVING is not -----------------------------------
  // The old "Share this scene" and "Share presets…" buttons, and the curation dialog behind
  // the second one, were removed when sharing became a cloud-profile job. Nothing that
  // DECODES was touched, which is the standing rule — every `?z=`, `#zp=`/`#sp=` and `#c=`
  // link ever generated still opens, and still lands in the Restore dialog below.
  //
  // Since then ONE sender came back by request: the Scene box's Share button
  // (#sharepreset, wired in persist-presets.js) calls `cloudShareScene` — the short
  // Firestore `#c=` link, ?z= fallback. `libraryUrl` and `shortenUrl` remain unreachable
  // from the UI, kept as pure probe-pinned builders.
  //
  // Recipient side of a preset-bundle link (#zp=/#sp=), called (deferred) from applyShared:
  // decode → validate → the Restore dialog. `parsed` carries only presets (no states/ranges/
  // beatTune), so openRestore lights up just the Presets option with merge/replace.
  function openSharedLibrary(raw) {
    const parsed = sharedLibrary(raw);
    if (!parsed) return;
    openRestore(parsed.parsed, parsed.valid, "shared link");
  }
  // Set by cloudApplyPayload for the ONE call where the incoming bundle is your own stored
  // profile, consumed (and reset) by the very next sharedLibrary() whatever its outcome.
  // OUT-OF-BAND on purpose: a #zp= link is attacker-authored JSON, and "this is your own
  // profile" is exactly the claim it must not be able to make — it is what lets `collections`
  // replace your follow-list in applyRestore. A field on the blob would be forgeable.
  let cloudOwnLoad = false;
  // Decode + validate a shared/fetched library into the pair openRestore takes. Shared by the
  // dialog route above and the dialogless one below, so both see identical validation.
  // Carries the sender's auto-cycle toggle + selected-scene index; __link marks it a shared
  // bundle (backups force cycle off, links honour it).
  function sharedLibrary(raw) {
    const own = cloudOwnLoad; cloudOwnLoad = false;   // consume: one decode, whatever happens
    const norm = normalizeBackup(raw);
    // SAY SO. Every decoder on the way here is deliberately forgiving — atobSafe, parse and
    // normalizeBackup each answer null rather than throwing — so a truncated or mangled link
    // used to arrive here as a plain null and the app simply booted as if you had followed no
    // link at all. That is indistinguishable from "the link worked and your scenes were
    // already there", and it left the one shape of failure a user can actually fix (a link
    // that got cut in half by a chat client) as the only one that said nothing. The
    // no-usable-scenes case below has always spoken up; this is the same class of problem.
    if (!norm) { alert("Nothing could be read from this link — it may have been truncated or damaged."); return null; }
    const parts = deserializeBlob(norm);
    const arr = Array.isArray(parts) ? parts : ((parts && parts.presets) || []);
    const valid = validatePresetList(arr);
    if (!valid.length) { alert("This link has no usable scenes."); return null; }
    // `collections` — who the sender follows — rides through so a profile load can restore the
    // follow-list along with the scenes. applyRestore acts on it only when __ownCloud is set,
    // i.e. only for your own profile: a stranger's bundle saying "you follow these" is not
    // their call to make, and __ownCloud comes from the flag above, never from the payload.
    // `palettes` (the blob's own custom ramps) rides OUTSIDE `parsed`, for applyGalleryScene
    // alone: inside it, applyRestore's Replace branch would swap your whole custom library for
    // the sender's on every #zp= bundle.
    return { parsed: { presets: arr, curPreset: parts.curPreset, cycle: parts.cycle,
                       collections: parts.collections, __ownCloud: own, __link: true }, valid,
             palettes: parts.palettes };
  }
  // Apply a shared library with NO dialog, for the gallery — whose per-row "Load and merge" /
  // "Load and replace" buttons have already asked the only question the dialog asks, so
  // opening it would be a second prompt for an answer it already has.
  //
  // It stages the SAME pendingRestore + checkbox state the dialog would have produced and
  // then calls applyRestore, rather than reimplementing the merge / curPreset / write /
  // reload sequence — one copy of that logic is the point. The checkboxes are ordinary DOM
  // nodes whether or not #restoredlg is visible, so this needs no special case in there.
  // `collection` set ⇒ install as that profile's own set (the gallery path) and merge/replace
  // no longer applies; unset ⇒ the old merge-vs-replace over your own library.
  function applySharedLibrary(raw, replace, collection, collectionUid) {
    const parsed = sharedLibrary(raw);
    if (!parsed) return;
    const coll = (collection || "").trim();
    // Record the follow HERE, after validation has passed — not in galLoad before the call.
    // A source whose scenes ALL fail validatePresetList installs nothing, and a follow noted
    // for it would be a phantom: uploaded with every save, "Fetching…" on every load, and —
    // because dropCollection is only reachable from a collection group that exists in the
    // scene list — impossible to remove from the UI. Still BEFORE applyRestore, whose
    // fullSnapshot() is what carries collectionsHeld into the blob it writes and reloads on.
    if (coll) noteCollection(coll, collectionUid);
    pendingRestore = { parsed: parsed.parsed, valid: parsed.valid, hasSettings: false, hasRanges: false, hasBeat: false,
      collection: coll };
    el("rst-presets").checked = true;                 // a bundle carries scenes and nothing else
    el("rst-merge").checked = !replace;
    el("rst-replace").checked = !!replace;
    applyRestore();                                   // writes localStorage + reloads
  }

  // ONE published scene from the gallery (card 825, M3). It lands in "Shared with you" -- the
  // home a one-off scene from someone else already has -- not in a collection named after its
  // author: a collection is something you FOLLOW (cloudBlob uploads the follow instead of the
  // scenes and re-fetches the author's whole profile on the next load), and one card is not a
  // follow. "Shared with you" travels with your profile like your own scenes, and `origin`
  // keeps the banner crediting the author. Same validation as every other install
  // (sharedLibrary), but IN PLACE, not through applyRestore's write-and-reload: a reload per
  // card recompiled every shader behind the boot veil and replayed the credits, for a change
  // that is one scene added to the library -- which is all adoptSharedScene does for a #c=
  // link. applyPreset then blends to it with a transition like any other scene change.
  // Merge semantics are applyRestore's `keep` branch: replace a same-named scene IN
  // "Shared with you", keep the rest (loading a second card must not drop the first).
  function applyGalleryScene(raw, author) {
    const parsed = sharedLibrary(raw);
    if (!parsed) return;
    const by = originOk(author);
    if (by) for (const q of parsed.valid) if (!originOk(q.origin)) q.origin = by;
    autosavePreset();                          // fold pending live edits into the scene you leave
    // The card's custom ramps join yours (yours keep their places) and its scenes are remapped
    // onto where they landed -- applyRestore's merge, done on the live PALETTES.
    if (Array.isArray(parsed.palettes) && parsed.palettes.length) {
      const m = palMergeCustoms(customPalettes(), parsed.palettes);
      installCustomPalettes(m.list);
      palRemapIncoming(parsed.valid, m.map);
      buildPalSwatches();
    }
    const at = [];
    for (const q of parsed.valid) {
      const item = { ...q, collection: SHARED_COLLECTION };
      const i = presets.findIndex(x => x.name === item.name && collectionOf(x) === SHARED_COLLECTION);
      if (i >= 0) presets[i] = item; else presets.push(item);
      at.push(i >= 0 ? i : presets.length - 1);
    }
    // Land on the scene the blob had selected (a card carries one), else its first.
    const src = parsed.parsed.presets, sel = src && src[parsed.parsed.curPreset];
    const hit = sel ? at.find(i => presets[i].name === sel.name) : undefined;
    curPreset = hit !== undefined ? hit : at[0];
    openCollections.add(SHARED_COLLECTION);    // opened, or the scene you just picked is hidden
    stopCycling();                             // ...and it stays on screen
    applyPreset(curPreset);
    rebuildPresetOptions();
    persist();
  }

  // Initial paint: setEffect loads the restored effect's per-effect extras (show-box,
  // random-seed), then applyLayerExtras puts the selected layer's palette + filters live.
  setEffect(+effectSel.value, false);
  applyLayerExtras(stack[stackSel]);
  // ?stack=plasma,sirpinfyer[,…] builds a stack at startup, by effect id. A dev hook in
  // the spirit of ?debug=1 — it exists so the render path can be driven before the layer
  // list UI lands, and it stays useful for reproducing a stack from a bug report.
  // Never persisted: it seeds the live stack and nothing writes it back out.
  {
    const m = location.search.match(/[?&]stack=([^&]+)/);
    if (m) {
      const ids = decodeURIComponent(m[1]).split(",").map(s => s.trim()).filter(Boolean);
      for (let k = 1; k < ids.length && stack.length < STACK_MAX; k++) {
        const fx = effectIndexFromId(ids[k]);
        if (fx >= 0) addStackItem(fx);
      }
      const first = effectIndexFromId(ids[0]);
      if (first >= 0) { selectStack(0); setEffect(first); applyLayerExtras(stack[0]); }
    }
  }
  syncStackUI();                      // draw the layer rows for the restored stack
  let freshVisit = false;
  if (presets.length === 0) {         // first visit: seed the preset library
    presets = defaultPresets();       // the shipped starter library (never empty — see defaultPresets)
    applyPreset(0);                   // open on the first of them; installs its stack, curPreset = 0
    freshVisit = true;
  }
  // The invariant, established before anything can paint or autosave: a real scene is selected.
  // Covers a library that arrived empty, a stored curPreset that no longer resolves, and the
  // `-1` written by every version before the scratch mode was removed.
  ensureSelection();
  // A shared link parked its scene during applyShared; adopt it now that the library it joins
  // exists. This is the call that covers the synchronous ?s= path — the ?z= and #c= handlers
  // land later and make their own call, and adoptSharedScene is idempotent so both are safe.
  adoptSharedScene();
  rebuildPresetOptions();
  syncTtlEnabled();                   // match the Preset TTL enabled-state to the restored cycle toggle
  startCredits();                     // burn the credits into the opening frames
  persistReady = true;
  // Save the opening scene once, so a reload keeps it instead of re-applying (and
  // re-morphing the palette) on every visit until the first edit.
  if (freshVisit) persist();
  // A one-shot from applyRestore of a shared bundle: land on the preset the sender had open
  // (its scene, not just the dropdown selection). Cleared on use, so ordinary reloads keep
  // the persisted scene rather than re-applying + re-morphing every time.
  try {
    const pend = sessionStorage.getItem("btw.applyPreset");
    if (pend != null) { sessionStorage.removeItem("btw.applyPreset"); const i = +pend; if (presets[i]) applyPreset(i); }
  } catch (e) {}

  function setPanel(hidden) {
    panel.classList.toggle("hidden", hidden);
    syncPanelBtn();
    persist();                          // remember panel open/closed across reloads
  }
  // The ⚙ top button reflects the panel whichever route toggled it (M key, menu, itself).
  function syncPanelBtn() {
    const b = el("panelbtn");
    if (!b) return;
    const open = !panel.classList.contains("hidden");
    b.classList.toggle("on", open);
    b.setAttribute("aria-pressed", open ? "true" : "false");
  }
  if (el("panelbtn")) el("panelbtn").addEventListener("click", () => setPanel(!panel.classList.contains("hidden")));
  syncPanelBtn();                       // restore() ran two slices ago; paint the stored state
  // The ☰ hamburger opens the fold-out MENUBAR (ui-menubar.js), not the controls panel —
  // it is the app's application menu now, holding System / Cloud profile / Credits and a
  // Controls panel toggle. The "m" key still toggles the panel directly, so the fastest
  // route to the sliders is unchanged. `menubarToggle` is a function declaration in a later
  // slice, hence safe to reference here (it only runs on click).
  toggle.addEventListener("click", e => { e.stopPropagation(); menubarToggle(); });
  // Fullscreen toggle (works on mobile too, where F11 doesn't exist; also the "f" key).
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen();
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  }
  el("fs").addEventListener("click", toggleFullscreen);
  // Same treatment the ♪ gets (setAudioUI): a toggle has to SAY which state it is in, and the
  // glyph alone does not — ⛶ looks identical either way. Driven off `fullscreenchange` rather
  // than off the click, so it also tracks F11, the Esc that leaves fullscreen, and a request
  // the browser refuses; the request is async, so reading it back after the click would lie.
  function syncFsUI() {
    const on = !!document.fullscreenElement;
    const b = el("fs"); if (!b) return;
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.setAttribute("aria-label", on ? "Exit fullscreen (F)" : "Enter fullscreen (F)");
    b.title = on ? "Leave fullscreen (F)" : "Fill the screen (F)";
  }
  document.addEventListener("fullscreenchange", syncFsUI);
  syncFsUI();
  const pausedEl = el("paused");
  function setPaused(p) { paused = p; pausedEl.classList.toggle("hidden", !paused); }
  canvas.addEventListener("click", () => setPaused(!paused));
  // Respect reduced-motion: render a frame or two, then freeze so motion is
  // opt-in (click the canvas to animate).
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches)
      requestAnimationFrame(() => requestAnimationFrame(() => setPaused(true)));
  } catch (e) {}
