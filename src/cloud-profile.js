  // ---- cloud profiles: the Kicktro API (server/ in this repo, at api.kicktro.com) ---------
  // Keep your preset library against a Google or Apple account so it follows you between
  // machines.
  //
  // NO SDK. Everything here is fetch() against our own small JSON API, so the page stays a
  // single self-contained file with no bundled dependency. The remote scripts are the two
  // sign-in buttons' — Google Identity Services and Apple's appleid.auth.js (the latter only
  // while signed out) — the same class of thing initAnalytics() already loads (gtag.js). Each
  // hands back an ID token, which the API verifies and trades for its own session token.
  //
  // The whole feature is gated on CONFIG.cloud.apiBase: empty ⇒ no script, no request, and
  // the Cloud row stays hidden. Identical kill switch to CONFIG.analyticsId.
  //
  // **The security boundary is server/routes.js, not this file.** Anything this file declines
  // to do can still be attempted by hand against the API. Client-side checks here are for the
  // user's benefit — clear errors, no pointless round trips — never for security.
  //
  // Moved off Firebase in card 825 (M2); the last Firestore read (a #c= fallback) went with
  // card 831. Nothing in this file talks to Firebase any more.
  const CLOUD = CONFIG.cloud;
  // ?api=<origin> points a LOCAL page (file://, localhost) at a dev server, node server/main.js.
  // Ignored on any other host, so a crafted link can never send someone's session elsewhere.
  const API = (function () {
    if (THUMB) return "";        // a thumbnail render talks to nobody
    try {
      const q = new URLSearchParams(location.search).get("api");
      const local = location.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
      if (q && local && /^https?:\/\/[^/?#]+$/.test(q)) return q;
    } catch (e) { /* no location: the configured base */ }
    return String((CLOUD && CLOUD.apiBase) || "").replace(/\/+$/, "");
  })();
  const cloudOn = () => !!API;
  // v2: an API session. v1 held a FIREBASE session (refresh token and all), which the API
  // cannot use, so it is dropped on load and the user signs in once more — landing on the
  // profile the migration imported under the same Google account.
  const CLOUD_KEY = "burnTheWeb.cloud.v2";     // its own localStorage key, NOT part of the scene blob
  const CLOUD_KEY_FIREBASE = "burnTheWeb.cloud.v1";
  const GIS_SRC = "https://accounts.google.com/gsi/client";
  const APPLE_SRC = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

  // Session: our uid + the API's bearer token + when it expires. The token lives in
  // localStorage, which any XSS on the page could read — standard for a static app, and the
  // blast radius is one user's presets, but it is a real trade and worth knowing. "Sign out
  // everywhere" on the server (token_ver) is what kills a leaked one.
  let cloudSess = null;
  function cloudLoadSess() {
    try { localStorage.removeItem(CLOUD_KEY_FIREBASE); } catch (e) { /* private mode */ }
    try { cloudSess = JSON.parse(localStorage.getItem(CLOUD_KEY) || "null"); }
    catch (e) { cloudSess = null; }
    if (cloudSess && (typeof cloudSess.token !== "string" || !(cloudSess.expires > Date.now()))) {
      cloudSess = null;
      cloudSaveSess();
    }
  }
  function cloudSaveSess() {
    try {
      if (cloudSess) localStorage.setItem(CLOUD_KEY, JSON.stringify(cloudSess));
      else localStorage.removeItem(CLOUD_KEY);
    } catch (e) { /* private mode — session just won't survive the reload */ }
  }

  // ---- tokens ----
  // An API session lasts SESSION_DAYS (60). It is renewed once it is inside its last week, so
  // a regular visitor never meets the sign-in button again; one away longer than that does.
  const CLOUD_RENEW_MS = 7 * 86400000;
  let cloudRenewing = null;
  function cloudFresh() {
    if (!cloudSess) return Promise.reject(new Error("not signed in"));
    if (Date.now() >= (cloudSess.expires || 0)) {
      cloudSignOut();
      return Promise.reject(new Error("your session ended — sign in again"));
    }
    if (Date.now() < cloudSess.expires - CLOUD_RENEW_MS) return Promise.resolve(cloudSess.token);
    if (!cloudRenewing) {
      cloudRenewing = fetch(API + "/api/auth/refresh", {
        method: "POST", headers: { Authorization: "Bearer " + cloudSess.token },
      }).then(r => {
        if (r.status === 401) { cloudSignOut(); return; }       // revoked: sign out cleanly
        if (!r.ok) return;                                       // try again on the next call
        return r.json().then(j => {
          if (!cloudSess || typeof j.token !== "string") return;
          cloudSess.token = j.token;
          cloudSess.expires = +j.expires || cloudSess.expires;
          cloudSaveSess();
        });
      }).catch(() => { /* offline: the current token is still good for days */ })
        .then(() => { cloudRenewing = null; });
    }
    return cloudRenewing.then(() => (cloudSess ? cloudSess.token : Promise.reject(new Error("not signed in"))));
  }
  // One authorised API call. A 401 means the session is over (expired, or revoked by "sign
  // out everywhere"): there is no refresh token to retry with, so it signs out and the caller
  // reports the error. `p` is a path under API.
  function apiFetch(p, opts) {
    return cloudFresh().then(tok => fetch(API + p, {
      ...opts,
      headers: { ...(opts && opts.headers), "Content-Type": "application/json", Authorization: "Bearer " + tok },
    })).then(r => {
      if (r.status === 401 && cloudSess) cloudSignOut();
      return r;
    });
  }
  // A public read: no token, so a signed-out visitor can browse the gallery and open a link.
  function apiGet(p) {
    return fetch(API + p);
  }

  // ---- sign in / out ----
  // One exchange for both providers: `path` is /api/auth/google or /api/auth/apple, `body` the
  // provider's token (Apple's carries the nonce too). `nameHint` is the name Apple hands over on
  // the FIRST authorisation only, never in the token — it prefills the name step.
  function cloudSignIn(path, body, nameHint) {
    return fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // This browser's anonymous session, if it has one: its cards become the account's.
      body: JSON.stringify({ ...body, anon: anonLive(anonRead()) ? anonRead().token : undefined }),
    }).then(r => (r.ok ? r.json() : r.text().then(t => Promise.reject(new Error(cloudErr(t, r.status))))))
      .then(j => {
        cloudSess = { uid: j.uid, token: j.token, expires: +j.expires };
        cloudSaveSess();
        gsyncOwn();
        if (j.claimed) galBust();
        gsyncSoon();
        track("cloud_sign_in", {});
        cloudSyncUI();
        const mine = galMineFetch();      // votes, and whether this is a moderator (Error reports)
        if (signInOpen()) {
          closeSignIn();
          if (!el("galdlg").classList.contains("hidden")) mine.then(galReset);
        }
        // An account with no name and no profile to carry one is new here: ask once. (A profile
        // brings its name in through cloudFetchProfileMeta below, so that one is never asked.)
        if (!j.name && !j.hasProfile) nameAsk(nameHint || myProfileName());
        // ...and, if this account has no profile yet, put this machine's library into it.
        cloudFetchProfileMeta(true);      // pick up the profile name, if there is one already
        cloudLinksFetch();
      });
  }
  function cloudSignOut() {
    cloudSess = null;
    cloudLinks = [];
    gal.admin = false;                     // the next account proves it again (galMineFetch)
    cloudSaveSess();
    cloudSyncUI();
  }

  // ---- the payload ----
  // Exactly the blob a preset-bundle link carries (libraryUrl), through exactly the same
  // codec — so one encoder and one decoder serve both, and a cloud profile and a #zp= link
  // are the same bytes. That is what keeps this feature small and what makes the existing
  // decode path (openSharedLibrary) able to consume a downloaded profile unchanged.
  // YOUR SCENES ONLY — with one deliberate exception. A collection you loaded from the
  // gallery is somebody else's work that you are holding locally; uploading it would put a
  // second copy in your document, count it on your gallery card, and hand it on again to
  // anyone who loads you — three wrongs from one line. `collection` is the "not mine" marker
  // (a scene of your own never carries one), so that field drives the filter.
  //
  // The exception is "Shared with you": a scene someone handed you as a one-off link
  // (adoptSharedScene). It has NO source profile to re-fetch from, so dropping it here would
  // simply destroy it on the next cross-machine load — and the sharer sent it to you
  // deliberately. It rides in the upload like your own work, still wearing its label.
  //
  // What rides for the real collections is the fact that you added them: `collections` is the
  // follow-list, names and source uids, no scenes. A borrowed collection with NO follow entry
  // (loaded before the follow-list existed) is noted here, uid-less, before its scenes are
  // dropped — refollowCollections resolves a uid-less entry by NAME against the public
  // gallery, so the set comes back wherever its owner is still published, and lands in the
  // load's `missed` report where they are not. Never clobbers an entry that has a uid.
  //
  // curPreset is an INDEX INTO THE ARRAY BEING SENT, so it is remapped rather than copied —
  // and it falls back to 0 when the scene you are sitting on is one of the dropped ones,
  // which would otherwise point past the end or at a stranger's scene.
  function cloudBlob() {
    autosavePreset();                     // fold pending edits into the selected preset first
    const snap = fullSnapshot();
    const mine = [];
    let cur = -1, noted = false;
    (snap.presets || []).forEach((p, i) => {
      const coll = collectionOf(p);
      if (coll && coll !== SHARED_COLLECTION) {
        if (!collectionsHeld.some(c => c.key === coll)) { noteCollection(coll, ""); noted = true; }
        return;
      }
      if (i === snap.curPreset) cur = mine.length;
      mine.push(p);
    });
    if (noted) persist();                 // the legacy note above grew the follow-list — keep it
    const blob = { presets: mine, cycle: snap.cycle,
                   collections: collectionsHeld.map(c => ({ key: c.key, uid: c.uid })) };
    if (mine.length) blob.curPreset = cur >= 0 ? cur : 0;
    const wire = serializeBlob(blob);
    // The custom ramps these scenes name, so a profile someone else loads brings its own
    // colours. Without it a published scene built on a custom palette arrived with an id that
    // resolved to nothing and quietly fell back to a built-in.
    const pal = palettesUsedBy(wire);
    if (pal) wire.palettes = pal;
    return wire;
  }

  // ---- save / load / delete ----
  // THE SAVE IS GUARDED BY A SERVER PRECONDITION, because it is a full replace: two signed-in
  // devices are otherwise silent last-write-wins, and the sharpest case is not even a Save
  // button — the Publish checkbox routes through cloudSave(), so ticking it on a fresh machine
  // would overwrite a real library with the shipped default scenes. cloudSess.docTime tracks
  // the profile's `updated` version as this browser last saw it ("none" = known to not exist,
  // absent = never seen, which saves unguarded). It travels as If-Match; the API answers 412
  // when it no longer matches. Every read/write that learns the version records it here.
  function cloudNoteDocTime(t) {
    if (!cloudSess) return;
    cloudSess.docTime = t == null ? null : String(t);
    cloudSaveSess();
  }
  // The profile's metadata alone — used to re-arm docTime after a precondition failure, so the
  // user's next Save carries the NEW version and succeeds as a deliberate overwrite.
  function cloudRearmDocTime() {
    if (!cloudSess) return Promise.resolve();
    return apiFetch("/api/profile?meta=1", { method: "GET" })
      .then(r => (r.ok ? r.json().then(d => cloudNoteDocTime(d.updated))
        : (r.status === 404 ? cloudNoteDocTime("none") : null)))
      .catch(() => { /* next save just goes unguarded */ });
  }
  const cloudIfMatch = t => (t === "none" ? { "If-Match": "none" } : t ? { "If-Match": '"' + t + '"' } : {});
  // ---- AUTOMATIC CLOUD SAVE ----------------------------------------------------------
  // Three rules, and they are the user's: save only when something actually changed, wait
  // two hours after the LAST change (each new change restarts that), and at most once a day.
  //
  // The whole schedule is three timestamps in localStorage and a one-minute tick that
  // recomputes from them. NOT a setTimeout armed on each edit: a reload would lose it, and
  // "two hours after the last change" has to survive the tab being closed and reopened, so
  // the decision has to be derivable from stored state alone.
  //
  // `saved` is written by EVERY successful save, manual ones included -- which is the
  // behaviour you want: if you pressed Save an hour ago, the daily automatic one has nothing
  // left to do.
  function autoSaveRead() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || "null"); } catch (e) {}
    if (!s || typeof s !== "object") s = {};
    return { changed: +s.changed || 0, saved: +s.saved || 0, tried: +s.tried || 0,
             on: s.on !== false };
  }
  function autoSaveWrite(s) {
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  // Called from persist(), which is the app's single edit choke point and already
  // early-returns until persistReady -- so loading a scene at startup is not a "change",
  // and there is no second notion of dirty anywhere.
  function autoSaveNoteChange() {
    const s = autoSaveRead();
    s.changed = Date.now();
    autoSaveWrite(s);
  }
  // Called from cloudSave's success branch, for manual and automatic saves alike.
  function autoSaveNoteSaved() {
    const s = autoSaveRead();
    s.saved = Date.now();
    autoSaveWrite(s);
  }
  function autoSaveEnabled() { return autoSaveRead().on; }
  function autoSaveSetEnabled(on) {
    const s = autoSaveRead();
    s.on = !!on;
    autoSaveWrite(s);
  }
  // Pure, so the probe can ask it about any clock without running a timer.
  function autoSaveDue(s, now, signedIn) {
    if (!s.on || !signedIn) return false;
    if (!s.changed) return false;                        // nothing has ever changed
    if (s.saved >= s.changed) return false;              // already saved since the last change
    if (now - s.changed < AUTOSAVE_DELAY_MS) return false;   // still inside the quiet time
    if (s.saved && now - s.saved < AUTOSAVE_GAP_MS) return false;   // one a day
    if (s.tried && now - s.tried < AUTOSAVE_RETRY_MS) return false; // do not hammer a failure
    return true;
  }
  // WHEN THE NEXT AUTOMATIC SAVE CAN HAPPEN, as a timestamp. Pure, like autoSaveDue, and it
  // is the same three limits read the other way round: the quiet time after the last change,
  // the once-a-day gap, and the back-off after a failed attempt. The LATEST of the three wins,
  // because all three have to be satisfied at once.
  function autoSaveNextAt(s) {
    if (!s.changed || s.saved >= s.changed) return 0;      // nothing to save
    let at = s.changed + AUTOSAVE_DELAY_MS;
    if (s.saved) at = Math.max(at, s.saved + AUTOSAVE_GAP_MS);
    if (s.tried) at = Math.max(at, s.tried + AUTOSAVE_RETRY_MS);
    return at;
  }
  // "2 hours", "35 minutes", "just now" -- whole units only. A schedule measured in hours does
  // not need seconds, and a ticking readout invites watching it.
  function autoSaveSpan(ms) {
    const m = Math.round(ms / 60000);
    if (m < 1) return "less than a minute";
    if (m < 60) return m + " minute" + (m === 1 ? "" : "s");
    const h = Math.floor(m / 60), r = m % 60;
    return h + " hour" + (h === 1 ? "" : "s") + (r ? " " + r + " min" : "");
  }
  // The two sentences the cloud box shows. Split from the DOM write so the probe can read the
  // wording for any clock without a browser.
  function autoSaveText(s, now, signedIn) {
    const last = s.saved
      ? "Last saved to cloud " + autoSaveSpan(now - s.saved) + " ago."
      : "Not saved to your profile yet.";
    if (!s.on) return last + " Automatic saving is off.";
    if (!signedIn) return last + " Sign in to save automatically.";
    const at = autoSaveNextAt(s);
    if (!at) return last + " Nothing has changed since then.";
    if (at <= now) return last + " Next save is due now.";
    return last + " Earliest next save in " + autoSaveSpan(at - now) + ".";
  }
  function autoSaveSyncInfo() {
    const n = el("cloud-autoinfo");
    if (n) n.textContent = autoSaveText(autoSaveRead(), Date.now(), !!cloudSess);
  }
  function autoSaveTick() {
    autoSaveSyncInfo();                    // once a minute is plenty for an hours-long schedule
    const s = autoSaveRead();
    if (!autoSaveDue(s, Date.now(), !!cloudSess)) return;
    s.tried = Date.now();          // stamped BEFORE the attempt: a save that throws, hangs or
    autoSaveWrite(s);              // is refused must not come straight back a minute later
    cloudSave();
  }
  setInterval(autoSaveTick, AUTOSAVE_TICK_MS);

  const CLOUD_STALE_MSG = "your cloud copy changed since this browser last saw it "
    + "(another device or tab saved). Load to keep that version, or Save again to overwrite it.";
  function cloudSave() {
    if (!cloudSess) return;
    const blob = cloudBlob();
    const n = (blob.presets || []).length;
    const nc = (blob.collections || []).length;
    // A library can hold no scenes of your own and STILL have something to store: the
    // follow-list. A collections-only user syncing machines is exactly who needs it saved —
    // refusing here would mean their follows could never reach the cloud at all. Only a
    // truly empty profile (no scenes, no follows) has nothing to say. The API allows
    // count 0, so an empty presets array is a legal profile.
    if (!n && !nc) { cloudMsg("Nothing to save — you have no scenes yet.", true); return; }
    // The API caps count at 500; say so here rather than surfacing its 400 as the reason.
    if (n > 500) {
      cloudMsg("Your library has " + n + " scenes — the cloud cap is 500. Delete some and save again.", true);
      return;
    }
    cloudMsg("Saving…");
    zipToB64(JSON.stringify(blob)).then(payload => {
      if (payload == null) throw new Error("this browser cannot compress the payload");
      if (payload.length >= CLOUD.maxPayload) {
        throw new Error("library too big to store (" + Math.round(payload.length / 1024) + " KB)");
      }
      // The whole profile, every field: a PUT is a full replace, and the API refuses a body
      // with a field it does not know (its version of the old rules' hasOnly()).
      const body = {
        name: myProfileName() || DEFAULT_PROFILE_NAME,   // same default the list heading shows
        payload,
        count: n,
        pub: !!(cloudSess && cloudSess.pub),
      };
      // The precondition: replace only the version this browser last saw. "none" asserts the
      // profile does not exist yet (a first save that races another device's first save still
      // loses cleanly); absent docTime sends no guard, which a stale-failure re-arm below
      // upgrades on first contact.
      return apiFetch("/api/profile", { method: "PUT", headers: cloudIfMatch(cloudSess.docTime), body: JSON.stringify(body) });
    }).then(r => {
      if (!r.ok) return r.text().then(txt => {
        if (r.status === 412) {
          // Learn the current version so a DELIBERATE second Save overwrites — the user has
          // read the warning by then; what must never happen is the silent first-click loss.
          return cloudRearmDocTime().then(() => Promise.reject(new Error(CLOUD_STALE_MSG)));
        }
        return Promise.reject(new Error(cloudErr(txt, r.status)));
      });
      return r.json().then(res => {
        cloudNoteDocTime(res.updated);
        // Manual saves count too: having just saved by hand, the daily automatic one has
        // nothing left to do.
        autoSaveNoteSaved();
        autoSaveSyncInfo();               // a manual save resets the clock this line reports
        // Name both halves of what was stored — "Saved 9 scenes" reads as data loss to someone
        // who is looking at 19 in the panel, so say where the other ten live.
        cloudMsg(n
          ? "Saved " + n + " scene" + (n === 1 ? "" : "s")
            + (nc ? " and " + nc + " followed collection" + (nc === 1 ? "" : "s") : "")
            + " to your profile."
          : "Saved your " + nc + " followed collection" + (nc === 1 ? "" : "s")
            + " — no scenes of your own yet.");
        track("cloud_save", { count: n });
      });
    }).catch(e => cloudMsg("Could not save: " + e.message, true));
  }

  // THE ONE PLACE A STORED PAYLOAD BECOMES A LIBRARY. `cloudLoad` is the only caller today —
  // the history restore that was the second one is gone — and the seam is kept anyway, which
  // is the point of it: the NEXT transport that needs to turn a stored payload into a library
  // has to come through here rather than growing a private decoder. That is the whole reason a
  // cloud payload is the same bytes as a #zp= bundle. cloudprobe asserts this structurally.
  function cloudApplyPayload(payload) {
    return unzipFromB64(payload).then(json => {
      if (json == null) throw new Error("could not read the stored payload");
      let raw;
      try { raw = JSON.parse(json); } catch (e) { throw new Error("stored payload is corrupt"); }
      // Put the collections you follow back before anything is applied — see below for why
      // here and not after the reload.
      return refollowCollections(raw);
    }).then(res => {
      // A source that went away is worth saying out loud, and it must survive the clear —
      // the Restore dialog is cancellable, so this is not always a message nobody reads.
      cloudMsg(res.missed.length ? "Could not fetch " + res.missed.join(", ") + " — the rest loaded." : "",
               res.missed.length > 0);
      // Straight into the existing shared-library path: validation, the merge-vs-replace
      // Restore dialog, and landing on the stored selected preset all come for free.
      //
      // The flag marks the next decode as YOUR OWN profile — the one case where the bundle's
      // `collections` may replace your follow-list. Out-of-band (a module let, not a blob
      // field) because a #zp= link is attacker-authored JSON: an in-band marker would let any
      // crafted bundle claim to be your profile and overwrite what you follow.
      cloudOwnLoad = true;
      openSharedLibrary(res.raw);
    });
  }
  // Re-follow the collections this profile records. A profile stores WHO you added, never
  // their scenes (see cloudBlob), so without this a load on a second machine arrives with your
  // own scenes and a follow-list that renders as nothing at all.
  //
  // Fetched HERE, and appended to the SAME preset array, so the whole load is still ONE
  // applyRestore and ONE reload. The obvious alternative — re-adding them after the reload —
  // cannot work as cheaply: the install path (applySharedLibrary → applyRestore) ends in
  // location.reload(), so N collections would be N reloads.
  //
  // APPENDED, never prepended: `curPreset` indexes this array, and anything inserted ahead of
  // it would silently slide the sender's selection onto a different scene.
  //
  // A source that has been deleted, unpublished, emptied or corrupted is SKIPPED and named in
  // the message. Someone else's profile going away must never fail the load of your own
  // scenes — and the record survives, so it comes back if they do.
  //
  // Sequential rather than parallel: the list is short (collectionsOk caps it at 40), and one
  // request at a time keeps a slow or failing source from being blamed on the others.
  function refollowCollections(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.presets)) return Promise.resolve({ raw, missed: [] });
    const want = collectionsOk(raw.collections);
    // Anything already present in the payload is left alone. Nothing writes a collection into
    // a profile today, but an older blob (saved before cloudBlob started filtering) carries
    // them, and re-fetching those would duplicate the set rather than refresh it.
    const have = new Set(raw.presets.map(p => (p && p.collection) || "").filter(Boolean));
    // EVERY absent collection is attempted — a uid-less entry included. Filtering those out
    // up front (`c.uid &&`) made them doubly invisible: never fetched AND never in `missed`,
    // so a follow that arrived without a uid simply vanished with no trace.
    const todo = want.filter(c => !have.has(c.key));
    if (!todo.length) return Promise.resolve({ raw, missed: [] });
    cloudMsg("Fetching " + todo.length + " collection" + (todo.length === 1 ? "" : "s") + "…");
    const missed = [];
    // A uid-less entry (recorded by cloudBlob for a collection that predates the follow-list)
    // is resolved by NAME against the public gallery: the collection key IS the source
    // profile's name — galLoad keys it so — and the listing is the only place that mapping
    // exists. One galList() covers every such entry; still unresolved ⇒ fetched as uid-less
    // below, which lands it in `missed` by name instead of dropping it silently.
    const resolve = todo.some(c => !c.uid)
      ? galList().then(items => todo.map(c => {
          if (c.uid) return c;
          const hit = (items || []).find(i => i.name === c.key);
          return hit ? { key: c.key, uid: String(hit.uid || "") } : c;
        })).catch(() => todo)
      : Promise.resolve(todo);
    return resolve.then(list => {
      // Write the healed uids back into the payload the restore will store, so a name
      // resolution only has to succeed once — the next save carries the real uid.
      raw.collections = want.map(w => list.find(c => c.key === w.key) || w);
      return list.reduce((chain, c) => chain.then(() => {
        if (!c.uid) { missed.push(c.key); return; }
        return galFetchLibrary(c.uid).then(lib => {
          const arr = (lib && Array.isArray(lib.presets)) ? lib.presets : [];
          // Stamped with the label YOU follow them under, exactly as the gallery install does —
          // their own borrowed scenes (an older profile could carry some) must not come through
          // wearing a third party's name.
          for (const p of arr) if (p && typeof p === "object") raw.presets.push({ ...p, collection: c.key });
        }).catch(() => { missed.push(c.key); });
      }), Promise.resolve());
    }).then(() => ({ raw, missed }));
  }

  function cloudLoad() {
    if (!cloudSess) return;
    cloudMsg("Loading…");
    apiFetch("/api/profile", { method: "GET" }).then(r => {
      if (r.status === 404) {
        cloudNoteDocTime("none");
        return Promise.reject(new Error("you have not saved a profile yet"));
      }
      if (!r.ok) return r.text().then(t => Promise.reject(new Error(cloudErr(t, r.status))));
      return r.json();
    }).then(d => {
      // Loading IS seeing the current version — the save precondition compares against this.
      cloudNoteDocTime(d.updated);
      if (!d.payload) throw new Error("that profile is empty");
      return cloudApplyPayload(d.payload);
    }).then(() => {
      track("cloud_load", {});
    }).catch(e => cloudMsg("Could not load: " + e.message, true));
  }

  function cloudDelete() {
    if (!cloudSess) return;
    if (!confirm("Delete your cloud profile permanently? Your scenes in this browser are not touched.")) return;
    cloudMsg("Deleting…");
    // The share links you minted are part of "everything in it", and they go FIRST: if the
    // sweep fails there is still a profile to point the user at. The server lists them
    // (/api/me/scenes), so links made on another machine go too.
    shareLinksDeleteAll()
      .then(() => apiFetch("/api/profile", { method: "DELETE" }))
      .then(r => {
        if (!r.ok && r.status !== 404) return r.text().then(t => Promise.reject(new Error(cloudErr(t, r.status))));
        cloudNoteDocTime("none");
        cloudMsg("Profile deleted.");
        track("cloud_delete", {});
      }).catch(e => cloudMsg("Could not delete: " + e.message, true));
  }

  // Read just the metadata after signing in, so the name field shows what is already stored
  // rather than starting blank and overwriting it on the next save.
  // `seedIfMissing` is passed ONLY by the sign-in path, and the distinction is the whole
  // safety of the seeding below: this also runs at startup for an existing session, and an
  // unconditional seed would silently re-upload the local library every time someone who had
  // deliberately DELETED their cloud profile opened the page.
  function cloudFetchProfileMeta(seedIfMissing) {
    if (!cloudSess) return;
    apiFetch("/api/profile?meta=1", { method: "GET" }).then(r => {
      // 404 = no profile yet, and that is worth REMEMBERING: the save precondition asserts
      // If-Match: none from it, so two fresh machines racing their first save still lose cleanly.
      if (r.status === 404) {
        cloudNoteDocTime("none");
        // A BRAND-NEW ACCOUNT STARTS WITH WHAT IS ALREADY ON THIS MACHINE. Signing in used
        // to leave the profile empty until you found the Save button, so the scenes you had
        // been working on -- or the shipped library you had just been shown -- existed only
        // in this browser and the account looked broken. cloudSave's precondition asserts
        // "none" from the docTime just recorded, so this can only ever CREATE: it cannot
        // overwrite a profile, and two fresh machines racing still lose cleanly.
        if (seedIfMissing) { track("cloud_seed", {}); cloudSave(); }
        return null;
      }
      return r.ok ? r.json() : null;
    }).then(d => {
      if (!d) return;
      cloudNoteDocTime(d.updated);
      // Through setProfileName, so the cache and the scene-list heading follow. This is the
      // async arrival the cache exists to pre-empt — on a first-ever sign-in it is the only
      // thing that puts your name on the list, and it must not wait for a rebuild.
      if (d.name) { setProfileName(d.name); cloudNameShow(); }
      if (cloudSess) { cloudSess.pub = !!d.pub; cloudSaveSess(); }
      if (el("cloud-pub")) el("cloud-pub").checked = !!d.pub;
      if (d.count != null) cloudMsg("Profile has " + d.count + " scene" + (d.count === 1 ? "" : "s") + " stored.");
    }).catch(() => { /* no profile yet — nothing to show */ });
  }

  // The API answers errors as {error: "..."}; surface that rather than a bare status.
  function cloudErr(text, status) {
    try {
      const j = JSON.parse(text);
      if (j && typeof j.error === "string") return j.error;
    } catch (e) { /* not JSON */ }
    return "HTTP " + status;
  }

  // ---- EVERY SCENE OF YOURS IS IN THE GALLERY ---------------------------------------------
  // There is no private and no Publish button. Each change goes up within seconds -- the whole
  // set of your own scenes, PUT /api/me/gallery -- carrying the time of the edit (`edited`,
  // stamped by autosavePreset), and the SERVER keeps a changed scene out of sight until that
  // edit is an hour old; every further change restarts the hour (server/gallery-sync.js). So
  // the wait is on the SHOWING, not the sending: GSYNC_SOON only folds the hundred edits of one
  // slider drag into one upload. Others keep seeing the last public version meanwhile.
  // Not uploaded as yours: a scene with a `collection` (someone else's), and the server also
  // skips an untouched copy of a scene the app shipped.
  // Signed in, cards are credited to your profile name. Signed out, the browser gets an
  // anonymous account (POST /api/auth/anon, its own localStorage key) whose cards read
  // Anonymous until a Google sign-in on this browser claims them. A browser that has been
  // signed in never uploads anonymously again (`owned`): signing out must not post your
  // scenes a second time under Anonymous.
  // Only on a real site or a ?api= dev server: every headless tool loads file:// with the
  // production API configured, and must not publish its test scenes.
  const GSYNC_ANON_KEY = "kt.anon.v1";
  const GSYNC_SOON = 4000;             // one drag = one upload
  const GSYNC_RETRY = 60000;           // after a failure (offline, rate limit)
  const GSYNC_RENEW = 30 * 86400000;   // an anonymous session renews inside its last 30 days
  // `var` with no initialiser: persist() (five slices up) calls gsyncSoon, and until this
  // slice has run there is nothing to send with.
  var gsyncReady, gsyncT, gsyncBusy, gsyncAgain, gsyncLast, gsyncWho;
  const gsyncOn = () => cloudOn() && (/^https?:$/.test(location.protocol) || /[?&]api=/.test(location.search));
  function anonRead() {
    try {
      const a = JSON.parse(localStorage.getItem(GSYNC_ANON_KEY) || "null");
      return a && typeof a === "object" ? a : null;
    } catch (e) { return null; }
  }
  function anonWrite(a) {
    try {
      if (a) localStorage.setItem(GSYNC_ANON_KEY, JSON.stringify(a));
      else localStorage.removeItem(GSYNC_ANON_KEY);
    } catch (e) { /* private mode: a new anonymous account next visit */ }
  }
  const anonLive = a => !!(a && typeof a.token === "string" && a.expires > Date.now());
  // An anonymous account is minted only for a library with something of YOUR OWN in it: a
  // scene edited since uploads began, or one not named like anything the app ships. A first
  // visit holds only stock scenes, and must not make an account for nothing.
  function gsyncWorthAnon() {
    const stock = new Set(DEFAULT_LIBRARY.map(p => p.name).concat(EFFECTS.map(e => e.name), ["Blank canvas"]));
    return presets.some(p => !collectionOf(p) && (p.edited || !stock.has(p.name)));
  }
  // The bearer to upload with: the Google session, else this browser's anonymous one (renewed,
  // or minted), else null = nothing to upload as.
  function gsyncToken() {
    if (cloudSess) return cloudFresh();
    const a = anonRead();
    if (a && a.owned) return Promise.resolve(null);
    if (anonLive(a) && Date.now() < a.expires - GSYNC_RENEW) return Promise.resolve(a.token);
    if (anonLive(a)) {
      return fetch(API + "/api/auth/refresh", { method: "POST", headers: { Authorization: "Bearer " + a.token } })
        .then(r => (r.ok ? r.json() : null))
        .then(j => {
          if (j && typeof j.token === "string") { a.token = j.token; a.expires = +j.expires || a.expires; anonWrite(a); }
          return a.token;
        }, () => a.token);
    }
    if (!gsyncWorthAnon()) return Promise.resolve(null);
    return fetch(API + "/api/auth/anon", { method: "POST" })
      .then(r => (r.ok ? r.json() : r.text().then(t => Promise.reject(new Error(cloudErr(t, r.status))))))
      .then(j => { anonWrite({ uid: j.uid, token: j.token, expires: +j.expires }); return j.token; });
  }
  // Your own scenes as one library blob (the profile's codec), each with a sid: one is given
  // here to a scene that has none, or that shares one with an earlier scene (a merged copy).
  function gsyncBlob() {
    autosavePreset();
    const own = [], seen = new Set();
    let gave = false;
    for (const p of presets) {
      if (collectionOf(p)) continue;
      if (!sidOk(p.sid) || seen.has(p.sid)) { p.sid = newSid(); gave = true; }
      seen.add(p.sid);
      own.push(p);
    }
    if (gave) persist();
    const wire = serializeBlob({ presets: own, curPreset: 0, cycle: false });
    const pal = palettesUsedBy(wire);
    if (pal) wire.palettes = pal;
    return wire;
  }
  function gsyncSoon() {
    if (!gsyncReady || gsyncT || !gsyncOn()) return;
    gsyncT = setTimeout(gsyncPush, GSYNC_SOON);
  }
  function gsyncPush() {
    gsyncT = 0;
    if (!gsyncOn()) return;
    if (gsyncBusy) { gsyncAgain = true; return; }
    const json = JSON.stringify(gsyncBlob());
    const who = cloudSess ? cloudSess.uid : "anon";
    if (json === gsyncLast && who === gsyncWho) return;          // nothing new since the last upload
    gsyncBusy = true;
    let payload = null;
    zipToB64(json).then(b => {
      if (b == null) return null;
      if (b.length >= CLOUD.maxPayload) throw new Error("library too big to upload");
      payload = b;
      return gsyncToken();
    }).then(tok => {
      if (!tok) return null;
      const body = { payload };
      const name = cloudSess && myProfileName();
      if (name) body.name = name;
      return fetch(API + "/api/me/gallery", {
        method: "PUT", body: JSON.stringify(body),
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
      });
    }).then(r => {
      if (r && r.status === 401) {                               // that session is over
        if (who !== "anon") cloudSignOut(); else anonWrite(null);
        throw new Error("signed out");
      }
      if (r && !r.ok) throw new Error("HTTP " + r.status);
      gsyncLast = json; gsyncWho = who;
      if (r) galBust();                                          // My scenes must show it
    }).catch(() => { if (!gsyncT) gsyncT = setTimeout(gsyncPush, GSYNC_RETRY); })
      .then(() => {
        gsyncBusy = false;
        if (gsyncAgain) { gsyncAgain = false; gsyncSoon(); }
      });
  }
  // Signed in on this browser: its scenes are that account's from now on.
  function gsyncOwn() {
    const a = anonRead();
    if (!(a && a.owned)) anonWrite({ owned: true });
    gsyncLast = null;
  }
  // ---- publish your whole profile (the Collections tab) ----
  // Toggling this re-saves the WHOLE profile rather than patching `pub` alone: the API's PUT
  // takes name/payload/count/pub together, so a pub-only write to a profile that does not
  // exist yet has nothing to be. Going through cloudSave() always produces a whole profile.
  // That routing is also what makes the tick SAFE on a stale machine: the save precondition
  // fails instead of silently replacing a newer cloud library with this browser's, and the
  // kept cloudSess.pub means the intent still lands with the user's deliberate re-save.
  function cloudPublish(on) {
    if (!cloudSess) return;
    cloudSess.pub = !!on;
    cloudSaveSess();
    track("cloud_publish", { on: !!on });
    cloudSave();
    galBust();                          // this profile just entered or left the listing
  }

  // ---- gallery ----
  // ONE PUBLISHED SCENE PER CARD (card 825, M3): a poster, the clip while hovered or focused,
  // the author, and the VOTE: a three-way switch, ❤️ love / the score / 💔 dislike, one vote
  // per person (score = loves minus dislikes). Readable signed out. Six tabs:
  //   Most loved / All / Newest   GET /api/gallery?sort=favs|name|new, paged as you scroll;
  //                               Most loved (by score) is the one the dialog opens on
  //   My favourites         the same with mine=favs (needs a session)
  //   My scenes             mine=own, newest first: what you published, each with its ✕
  //                         (needs a session; built-ins are nobody's, so none of them)
  //   Collections           the older per-profile listing (GET /api/profiles), which is also
  //                         what refollowCollections resolves a uid-less follow against
  // The built-in AI-Generated scenes are cards too (BUILTIN_SCENES, 'builtin:<slug>'): they
  // ship with the app, thumbnails included, and are MERGED into the server's order by the
  // same key, so a loved built-in sits where its score puts it. Their counts ride on every
  // listing response (`builtin` loves, `builtinHates` dislikes).
  // NOTHING LOADS UP FRONT: a tab asks for one page (galleryPage) and the next only when the
  // end of the grid scrolls near; a poster is fetched only when its card scrolls near
  // (galLazy); a clip only while hovered (preload none).
  // The listing is not billed per read any more, so the old once-a-day limit is gone: answers
  // are kept in memory for galleryTtlMs (10 minutes) and a vote patches them in place.
  try {                                 // the Firestore-era caches, a day long each
    localStorage.removeItem("burnTheWeb.gallery.v1");
    localStorage.removeItem("burnTheWeb.gallery.v2");
  } catch (e) { /* private mode */ }
  const GAL_TTL = () => CLOUD.galleryTtlMs || 600000;
  const galMem = {};                    // request path -> { t, j }
  function galBust() { for (const k in galMem) delete galMem[k]; }
  function galJson(p, authed) {
    const hit = galMem[p];
    if (hit && Date.now() - hit.t < GAL_TTL()) return Promise.resolve(hit.j);
    return (authed ? galAuthFetch(p) : apiGet(p))
      .then(r => (r.ok ? r.json() : r.text().then(t => Promise.reject(new Error(cloudErr(t, r.status))))))
      .then(j => { if (!authed) galMem[p] = { t: Date.now(), j }; return j; });
  }
  // My scenes is this browser's anonymous account's when it is signed out; My favourites needs
  // Google (an anonymous account cannot vote).
  const galMe = () => (cloudSess ? cloudSess.uid : anonLive(anonRead()) ? anonRead().uid : "");
  function galAuthFetch(p, opts) {
    opts = opts || { method: "GET" };
    if (cloudSess) return apiFetch(p, opts);
    const a = anonRead();
    return fetch(API + p, { ...opts, headers: anonLive(a) ? { Authorization: "Bearer " + a.token } : {} });
  }
  // Public profiles. Uncached on purpose: refollowCollections calls it once per cloud load.
  function galList() {
    return apiGet("/api/profiles").then(r => (r.ok ? r.json()
      : r.text().then(t => Promise.reject(new Error(cloudErr(t, r.status)))))).then(j =>
      ((j && j.items) || []).map(p => ({
        uid: String(p.uid), name: p.name || "Untitled", count: p.count || 0,
        updated: p.updated ? new Date(+p.updated).toISOString() : "" })));
  }
  // A thumbnail path from the API is server-relative ("/thumbs/..."); a built-in's is relative
  // to the page ("thumbs/..."), shipped beside index.html by pages.yml.
  const galUrl = u => (!u ? "" : u.charAt(0) === "/" ? API + u : u);
  const galBuiltinCards = () => BUILTIN_SCENES.map(b => {
    const slug = b.id.slice(8), v = b.thumb ? "?" + b.thumb : "";
    return { id: b.id, name: b.name, author: BUILTIN_GALLERY[0].name, owner: "",
      created: Date.parse(BUILTIN_GALLERY[0].updated) || 0, favs: 0, hates: 0, at: b.at,
      poster: b.thumb ? "thumbs/" + slug + ".webp" + v : null, clip: b.thumb ? "thumbs/" + slug + ".mp4" + v : null,
      ...(b.cost != null ? { cost: b.cost } : {}) };
  });
  // How HEAVY a scene is: CONFIG.cloud.galleryWeights, lightest first, against a card's `cost`
  // (ms a frame on the PC that rendered its thumbnail; absent = not measured yet). The Weight
  // slider keeps cards up to a step; its last stop keeps every card. An unmeasured card is
  // always kept: nothing says it is heavy, and the server answers the same way.
  const GAL_W = CLOUD.galleryWeights || [];
  const GAL_W_KEY = "kt.galWeight";
  const galWeightOf = cost => { let i = 0; while (i < GAL_W.length - 1 && cost > GAL_W[i].max) i++; return i; };
  const galMaxCost = () => (gal.weight < GAL_W.length - 1 ? GAL_W[gal.weight].max : -1);
  const galFits = c => c.cost == null || galMaxCost() < 0 || c.cost <= galMaxCost();
  function galWeightStored() {
    let v = NaN;
    try { const s = localStorage.getItem(GAL_W_KEY); if (s) v = +s; } catch (e) {}   // +null is 0: Light
    return Number.isInteger(v) && v >= 0 && v < GAL_W.length ? v : GAL_W.length - 1;
  }
  function galWeightText(i) {
    return i >= GAL_W.length - 1 ? "Any" : i === 0 ? GAL_W[0].name : "Up to " + GAL_W[i].name.toLowerCase();
  }
  function galSyncWeight() {
    const r = el("gal-weight");
    if (!r) return;
    r.max = String(GAL_W.length);
    r.value = String(gal.weight + 1);
    el("gal-wval").textContent = galWeightText(gal.weight);
    setOff(r, gal.tab === "people");     // Collections lists profiles, which carry no weight
  }
  function galSetWeight(v) {
    const i = Math.max(0, Math.min(GAL_W.length - 1, Math.round(v) - 1));
    if (i === gal.weight) return;
    gal.weight = i;
    try { localStorage.setItem(GAL_W_KEY, String(i)); } catch (e) {}
    galSyncWeight();
    galReset();
  }

  // What the dialog shows. `pend` holds the built-in cards not yet placed; `seq` drops the
  // answer to a request a newer tab or filter has overtaken. `mine` / `hate`: the scenes you
  // gave a ❤️ / a 💔. `ownNames`: the names of the My scenes cards listed so far, so the
  // scenes of yours with NO card can follow them as local cards (galLocalCards).
  const gal = { tab: "favs", order: "favs", q: "", offset: 0, total: 0, done: true, busy: false, pend: [], mine: new Set(),
    hate: new Set(), shown: new Set(), seq: 0, note: "", admin: false, weight: 0, ownNames: new Set() };
  const galSort = () => (gal.tab === "new" || gal.tab === "own" ? "new" : gal.tab === "all" ? "name" : "favs");
  const galAuthed = () => gal.tab === "mine" || gal.tab === "own";   // the tabs that need a session
  // `note` is what a failed #g= link has to say: it stands in for an EMPTY hint until the
  // dialog closes, so the listing's own "Loading…" passes through and then gives way to it.
  const galHint = t => { const h = el("gal-hint"); if (h) h.textContent = t || gal.note; };
  const galMatch = c => !gal.q || (c.name + "\n" + c.author).toLowerCase().indexOf(gal.q.toLowerCase()) >= 0;
  // The order both lists are already in: score (loves minus dislikes), then loves, then
  // newest; newest alone; or by name (SQLite's NOCASE: ASCII folded, then code order).
  // `order` is the one the SERVER answered with, so an API that does not know sort=name yet
  // still gets its built-ins placed right -- and one from before dislikes sends no `hates`,
  // so every score is its loves and the two orders still agree.
  const galKey = c => c.name.toLowerCase();
  const galScore = c => (c.favs || 0) - (c.hates || 0);
  const galBefore = (a, b) => (gal.order === "new" ? a.created > b.created
    : gal.order === "name" ? galKey(a) < galKey(b) || (galKey(a) === galKey(b) && a.id < b.id)
    : galScore(a) > galScore(b) || (galScore(a) === galScore(b)
      && (a.favs > b.favs || (a.favs === b.favs && a.created > b.created))));
  function galSyncMore() {
    const b = el("gal-more");
    if (b) b.style.display = gal.done || gal.tab === "people" ? "none" : "";
    if (b) setOff(b, gal.busy);
  }
  function galReset() {
    gal.seq++;
    gal.offset = 0; gal.total = 0; gal.busy = false; gal.shown = new Set(); gal.ownNames = new Set(); gal.order = galSort();
    if (galImgObs) galImgObs.disconnect();
    el("gal-list").textContent = "";
    el("gal-list").className = gal.tab === "people" ? "gal-rows" : "gal-grid";
    for (const t of document.querySelectorAll("#galdlg .gal-tab")) {
      t.setAttribute("aria-selected", String(t.dataset.tab === gal.tab));
    }
    galSyncWeight();
    if (gal.tab === "people") { gal.done = true; galSyncMore(); galPeople(); return; }
    if (galAuthed() && !galMe() || gal.tab === "mine" && !cloudSess) {
      gal.done = true; gal.pend = []; galSyncMore();
      galHint(gal.tab === "own"
        ? "Every scene you make shows up here, and in the gallery an hour after your last change to it."
        : "Favourites belong to an account — sign in under the profile button, then press ❤️ on any scene.");
      if (gal.tab === "own") galCards(galLocalCards());   // no account yet: your scenes are all local
      return;
    }
    gal.pend = gal.tab === "own" ? []
      : galBuiltinCards().filter(c => galMatch(c) && galFits(c) && (gal.tab !== "mine" || gal.mine.has(c.id)));
    gal.done = false;
    galHint("Loading…");
    galMore();
  }
  function galMore() {
    if (gal.done || gal.busy || gal.tab === "people") return;
    gal.busy = true; galSyncMore();
    const seq = gal.seq, n = CLOUD.galleryPage || 24;
    const sp = new URLSearchParams({ sort: galSort(), limit: String(n), offset: String(gal.offset) });
    if (gal.q) sp.set("q", gal.q);
    if (gal.tab === "mine") sp.set("mine", "favs");
    if (gal.tab === "own") sp.set("mine", "own");
    if (galMaxCost() >= 0) sp.set("maxcost", String(galMaxCost()));
    galJson("/api/gallery?" + sp, galAuthed()).then(j => {
      if (seq !== gal.seq) return;
      let rows = (j && Array.isArray(j.items)) ? j.items : [];
      // An API from before mine=own ignores it and lists EVERYONE's: keep only yours, so the
      // tab can never show you someone else's scene with a ✕ you cannot use.
      if (gal.tab === "own") rows = rows.filter(r => r.owner === galMe());
      if (gal.tab === "own") for (const r of rows) gal.ownNames.add(r.name);   // before the weight cut
      if (gal.offset === 0 && j && j.builtin) {
        if (j.sort === "new" || j.sort === "name" || j.sort === "favs") gal.order = j.sort;
        for (const c of gal.pend) {
          c.favs = +j.builtin[c.id] || 0;
          c.hates = +(j.builtinHates || {})[c.id] || 0;
        }
        gal.pend.sort((a, b) => (galBefore(a, b) ? -1 : galBefore(b, a) ? 1 : 0));
      }
      gal.offset += rows.length;
      gal.total = +j.total || 0;
      gal.done = !rows.length || gal.offset >= gal.total;
      // An API from before maxcost lists every weight: page by what it sent, show what fits.
      rows = rows.filter(galFits);
      const out = [];
      for (const r of rows) {
        while (gal.pend.length && galBefore(gal.pend[0], r)) out.push(gal.pend.shift());
        out.push(r);
      }
      if (gal.done) out.push(...gal.pend.splice(0));
      if (gal.done && gal.tab === "own") out.push(...galLocalCards());
      galCards(out);
      gal.busy = false; galSyncMore(); galEmpty();
      galWatchMore();
    }).catch(e => {
      if (seq !== gal.seq) return;
      // The built-ins need no network, so an unreachable API still leaves something to show.
      gal.busy = false; gal.done = true;
      galCards(gal.pend.splice(0));
      if (gal.tab === "own") galCards(galLocalCards());   // yours are here whatever the network says
      galSyncMore();
      galHint("Could not reach the gallery: " + e.message);
    });
  }
  function galEmpty() {
    const list = el("gal-list"), local = list.querySelector(".gal-local");
    if (list.children.length && !(gal.tab === "own" && local && !list.querySelector(".gal-card:not(.gal-local)"))) { galHint(""); return; }
    // My scenes with only local cards: none of yours is in the gallery yet.
    galHint(local ? "No scenes of yours yet in the gallery — the ones here are only in your scenes. Press New in the Scene box, change it, and it shows up in the gallery an hour later."
      : gal.q ? "Nothing matches “" + gal.q + "”."
      + (galMaxCost() >= 0 ? " Heavier scenes are left out: slide Weight to the right to see them." : "")
      : gal.tab === "mine" ? "No favourites yet — press ❤️ on a scene you like."
      : gal.tab === "own" ? "No scenes of yours yet — press New in the Scene box, change it, and it shows up here."
      : galMaxCost() >= 0 ? "Nothing this light here — slide Weight to the right to see heavier scenes."
      : "No scenes here yet. Every scene you make shows up, an hour after your last change to it.");
  }
  // Keep paging while the end of the list is in view: the grid scrolls inside .gal-box, so
  // that is the observer's root. The Load more button is the same call, for anything else.
  let galObs = null;
  function galWatchMore() {
    const b = el("gal-more");
    if (!b || !window.IntersectionObserver) return;
    if (!galObs) galObs = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) galMore(); },
      { root: document.querySelector("#galdlg .gal-box"), rootMargin: "240px" });
    galObs.disconnect();
    if (!gal.done) galObs.observe(b);
  }
  // A poster is fetched when its card comes within a screen of view, not when the card is
  // added: the grid scrolls inside .gal-box, and the browser's own loading=lazy measures from
  // the WINDOW, which fetches every poster of a page the dialog has not scrolled to.
  // The img stays hidden (.lz) until its poster has loaded: an img with no src yet draws a
  // light frame and a broken-image icon, and every card is rebuilt when the gallery opens,
  // so the whole grid flashed white. A poster that fails to load leaves the black thumb.
  let galImgObs = null;
  function galLazy(img, src) {
    img.classList.add("lz");
    img.addEventListener("load", () => img.classList.remove("lz"), { once: true });
    if (!window.IntersectionObserver) { img.src = src; return; }
    img.dataset.src = src;
    galImgObserver().observe(img);
  }
  // A placeholder in view asks for a render (galRenderWant, gallery-thumbs.js); a poster loads.
  function galImgObserver() {
    if (!galImgObs) galImgObs = new IntersectionObserver(es => {
      for (const x of es) {
        if (!x.isIntersecting) continue;
        galImgObs.unobserve(x.target);
        if (x.target.__card) galRenderWant(x.target); else x.target.src = x.target.dataset.src;
      }
    }, { root: document.querySelector("#galdlg .gal-box"), rootMargin: "100% 0px" });
    return galImgObs;
  }
  // A placeholder until a thumbnail is rendered: a gradient keyed on the id, never random,
  // so a card looks the same every time it is listed.
  function galHue(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h % 360;
  }
  function galCards(list) {
    const host = el("gal-list");
    for (const c of list) {
      if (gal.shown.has(c.id)) continue;           // a row can repeat across pages if favs move
      gal.shown.add(c.id);
      host.appendChild(galCard(c));
    }
  }
  function galCard(c) {
    const card = document.createElement("div");
    card.className = "gal-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.dataset.id = c.id;
    card.setAttribute("aria-label", c.local ? "Switch to " + c.name : "Load " + c.name + " by " + (c.author || "someone"));
    card.__card = c;
    const th = document.createElement("div");
    th.className = "gal-thumb";
    if (c.poster) {
      const img = document.createElement("img");
      img.alt = ""; img.decoding = "async";
      galLazy(img, galUrl(c.poster));
      th.appendChild(img);
    } else {
      const h = galHue(c.id);
      th.classList.add("gal-ph");
      th.style.background = "linear-gradient(135deg, hsl(" + h + " 70% 22%), hsl(" + ((h + 60) % 360) + " 80% 45%))";
      const t = document.createElement("span");
      t.textContent = c.name;
      th.appendChild(t);
      if (c.at == null && !c.local && window.IntersectionObserver) { th.__card = c; galImgObserver().observe(th); }
    }
    const cap = document.createElement("div");
    cap.className = "gal-cap";
    const nm = document.createElement("div");
    nm.className = "gal-cname"; nm.textContent = c.name; nm.title = c.name;
    const by = document.createElement("div");
    by.className = "gal-by"; by.textContent = c.author || "";
    // A LOCAL card (My scenes: a scene of yours with no card -- a starter scene, or one not
    // uploaded yet) is nothing the gallery knows: no vote, no link, no ✕, no render.
    if (c.local) {
      card.classList.add("gal-local");
      const w = document.createElement("div");
      w.className = "gal-wait"; w.textContent = "Only in your scenes, not in the gallery";
      w.title = "A starter scene you have not changed, or one not uploaded yet — change it and it goes up by itself.";
      cap.append(nm, by, w);
      card.append(th, cap);
    } else galCardCap(c, card, th, cap, nm, by);
    // ↻ In auto-cycle (card 832): on every card that stands for a scene of your library, over
    // the thumbnail's top-right corner. It writes `rotate` (setInRotation) and never loads.
    if (galHeld(c).length) {
      const cy = document.createElement("button");
      cy.type = "button"; cy.className = "gal-cyc";
      cy.addEventListener("click", e => {
        e.stopPropagation();
        const held = galHeld(c), on = held.length > 0 && held.every(i => inRotation(presets[i]));
        setInRotation(held, !on);
        galPaintCycAll();
        track("gallery_cycle", { on: !on });
      });
      galPaintCyc(cy, c);
      card.appendChild(cy);
    }
    if (!c.local) galCardWeight(c, card);
    galCardEvents(c, card);
    return card;
  }
  // Which scenes of YOUR LIBRARY a card stands for -- what its ↻ toggle writes. The listing
  // carries no sid, so by NAME: your own card (or a local one) is your own scene of that name;
  // anyone else's, or a built-in, is the copy a click installed into "Shared with you", or the
  // one a followed collection named after its author brought.
  function galHeld(c) {
    const own = !!c.local || (!!c.owner && c.owner === galMe()), out = [];
    for (let i = 0; i < presets.length; i++) {
      const p = presets[i], k = collectionOf(p);
      if (p.name !== c.name) continue;
      if (own ? !k : k === SHARED_COLLECTION || (!!c.author && k === c.author)) out.push(i);
    }
    return out;
  }
  function galPaintCyc(b, c) {
    const held = galHeld(c), on = held.length > 0 && held.every(i => inRotation(presets[i]));
    b.hidden = !held.length;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", "In auto-cycle: " + c.name);
    b.textContent = on ? "↻ In auto-cycle" : "↻ Left out";
    b.title = on ? "In the auto-cycle show — click to leave it out" : "Left out of the auto-cycle show — click to put it back";
  }
  function galPaintCycAll() {
    for (const n of document.querySelectorAll("#gal-list .gal-card")) {
      const b = n.querySelector(".gal-cyc");
      if (b) galPaintCyc(b, n.__card);
    }
  }
  // My scenes: each scene of your own the listing has no card for, after the cards it has.
  function galLocalCards() {
    const out = [];
    for (const p of presets) {
      if (collectionOf(p) || gal.ownNames.has(p.name)) continue;
      const c = { id: "local:" + p.name, name: p.name, author: myProfileName(), local: true };
      if (galMatch(c)) out.push(c);
    }
    return out;
  }
  function galCardCap(c, card, th, cap, nm, by) {
    // THE VOTE, a three-way switch: ❤️ love, the score in the middle (neutral -- click it to
    // take your vote back), 💔 dislike. Clicking the lit end again returns to neutral too.
    const vote = document.createElement("span");
    vote.className = "gal-vote"; vote.setAttribute("role", "radiogroup");
    vote.setAttribute("aria-label", "Your vote on " + c.name);
    for (const [cls, v] of [["gal-heart", 1], ["gal-score", 0], ["gal-hate", -1]]) {
      const b = document.createElement("button");
      b.type = "button"; b.className = cls; b.setAttribute("role", "radio");
      b.addEventListener("click", e => { e.stopPropagation(); galVote(c, v && galVoteOf(c) === v ? 0 : v); });
      vote.appendChild(b);
    }
    galPaintVote(vote, c);
    const share = document.createElement("button");
    share.type = "button"; share.className = "gal-share"; share.textContent = "🔗";
    share.title = "Copy a link to this scene";
    share.setAttribute("aria-label", "Copy a link to " + c.name);
    share.addEventListener("click", e => { e.stopPropagation(); galCopyLink(c, share); });
    cap.append(nm, share, vote, by);
    // My scenes: one still inside its hour says when it goes public (the hour restarts on
    // every change, so this is the earliest, not a promise).
    if (c.pending || c.live === false) {
      const w = document.createElement("div");
      w.className = "gal-wait";
      const m = c.pending ? Math.max(1, Math.ceil((c.pending - Date.now()) / 60000)) : 0;
      w.textContent = !c.pending ? "Not public yet" : c.live ? "Your change shows in " + m + " min"
        : "Public in " + m + " min";
      w.title = "A change goes public an hour after you last touch the scene — keep polishing until then.";
      cap.appendChild(w);
    }
    // ✕ on every card of yours, in every tab (signed out: this browser's anonymous account's).
    // It deletes the scene for everyone AND from your own list (galRemove). An admin gets it
    // on every published card too (never a built-in: those live in this build, not the API).
    const own = !!c.owner && c.owner === galMe();
    if (own || gal.admin && c.at == null && c.id) {
      const rm = document.createElement("button");
      rm.type = "button"; rm.className = "gal-rm"; rm.textContent = "✕";
      rm.title = own ? "Delete this scene, for you and for everyone" : "Delete this scene from the gallery, for everyone (admin)";
      rm.setAttribute("aria-label", "Delete " + c.name);
      rm.addEventListener("click", e => { e.stopPropagation(); galRemove(c, card); });
      cap.appendChild(rm);
    }
    card.append(th, cap);
  }
  function galCardWeight(c, card) {
    // Its weight, as bars over the thumbnail's corner: one per step up to the card's own.
    if (c.cost != null && GAL_W.length) {
      const w = galWeightOf(c.cost), wt = document.createElement("span");
      wt.className = "gal-wt";
      wt.title = GAL_W[w].name + " to run — " + c.cost.toFixed(1) + " ms a frame on a fast PC";
      wt.setAttribute("aria-label", GAL_W[w].name + " to run");
      for (let i = 0; i < GAL_W.length; i++) {
        const b = document.createElement("i");
        if (i <= w) b.className = "on";
        wt.appendChild(b);
      }
      wt.dataset.w = String(w);
      card.appendChild(wt);
    }
  }
  function galCardEvents(c, card) {
    // The clip plays while the card is hovered (mouse, pen) or focused (keyboard). On touch
    // there is no hover, so the FIRST tap plays it and the second loads the scene. A tap
    // focuses the card before its click arrives, so focus must not start the preview then, or
    // the click would find it already playing and load on the first tap.
    let touch = false;
    card.addEventListener("pointerdown", e => { touch = e.pointerType === "touch"; });
    card.addEventListener("keydown", () => { touch = false; }, true);
    card.addEventListener("pointerenter", e => { if (e.pointerType !== "touch") galPreview(card, true); });
    card.addEventListener("pointerleave", e => { if (e.pointerType !== "touch") galPreview(card, false); });
    card.addEventListener("focus", () => { if (!touch) galPreview(card, true); });
    card.addEventListener("blur", () => galPreview(card, false));
    card.addEventListener("click", () => {
      if (touch && c.clip && !card.classList.contains("previewing")) { galPreview(card, true); return; }
      galLoadCard(c);
    });
    card.addEventListener("keydown", e => {
      if (e.target === card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); galLoadCard(c); }
    });
  }
  function galPreview(card, on) {
    const c = card.__card;
    if (!c.clip) return;
    const th = card.querySelector(".gal-thumb");
    let v = th.querySelector("video");
    if (on) {
      card.classList.add("previewing");
      if (!v) {
        v = document.createElement("video");
        v.muted = true; v.setAttribute("muted", "");
        v.loop = true; v.playsInline = true; v.setAttribute("playsinline", "");
        v.preload = "none";
        // Shown only once frames arrive, so the poster stays up while the clip loads.
        v.addEventListener("playing", () => { if (card.classList.contains("previewing")) card.classList.add("playing"); });
        v.src = galUrl(c.clip);
        th.appendChild(v);
      }
      const pr = v.play();
      if (pr && pr.catch) pr.catch(() => { /* interrupted by leaving, or autoplay refused: the poster stays */ });
    } else {
      card.classList.remove("previewing", "playing");
      if (v) { v.pause(); try { v.currentTime = 0; } catch (e) { /* not loaded yet */ } }
    }
  }
  const galVoteOf = c => (gal.mine.has(c.id) ? 1 : gal.hate.has(c.id) ? -1 : 0);
  function galPaintVote(vote, c) {
    const v = galVoteOf(c), s = galScore(c), f = c.favs || 0, h = c.hates || 0;
    const [heart, score, hate] = vote.children;
    for (const [b, on] of [[heart, v === 1], [score, v === 0], [hate, v === -1]]) {
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    }
    // ONE emoji pair (the platform's own ❤️ and 💔 are drawn as a set): the glyph never changes,
    // the lit one is coloured and the others greyed by the CSS.
    heart.textContent = "❤️";
    score.textContent = String(s);
    score.classList.toggle("neg", s < 0);
    hate.textContent = "💔";
    const counts = f + (f === 1 ? " love" : " loves") + " · " + h + (h === 1 ? " dislike" : " dislikes");
    if (!cloudSess) heart.title = score.title = hate.title = "Sign in to vote · " + counts;
    else {
      heart.title = (v === 1 ? "Take back your ❤️" : "Love it") + " · " + counts;
      score.title = (v ? "Take back your vote" : "You have not voted") + " · " + counts;
      hate.title = (v === -1 ? "Take back your 💔" : "Not for me — counts against it in Most loved") + " · " + counts;
    }
    heart.setAttribute("aria-label", "Love " + c.name + ", " + counts);
    score.setAttribute("aria-label", "No vote, score " + s);
    hate.setAttribute("aria-label", "Dislike " + c.name);
  }
  // OPTIMISTIC: the switch moves at once and the server's counts settle it; a failure moves it
  // back. Every cached listing is patched too, so switching tabs does not show the old count.
  // ONE vote per person: ❤️ and 💔 each clear the other, as the server does in one transaction.
  function galVote(c, want) {
    if (!cloudSess) {
      galHint("Votes belong to an account — sign in under the profile button.");
      signInAsk("Voting ❤️ / 💔 is for signed-in users only.");
      return;
    }
    const cur = galVoteOf(c);
    if (want === cur) return;
    const before = { v: cur, favs: c.favs || 0, hates: c.hates || 0 };
    const set = (v, favs, hates) => {
      gal.mine.delete(c.id); gal.hate.delete(c.id);
      if (v === 1) gal.mine.add(c.id); else if (v === -1) gal.hate.add(c.id);
      c.favs = favs; c.hates = hates;
      galPatchFavs(c.id, favs, hates);
      for (const n of document.querySelectorAll("#gal-list .gal-card")) {
        if (n.dataset.id === c.id) galPaintVote(n.querySelector(".gal-vote"), n.__card);
      }
    };
    set(want, Math.max(0, before.favs + (want === 1) - (cur === 1)),
      Math.max(0, before.hates + (want === -1) - (cur === -1)));
    // Neutral takes back whichever vote there was; ❤️ or 💔 sets one (the server clears the other).
    const kind = (want || cur) === 1 ? "fav" : "hate";
    apiFetch("/api/gallery/" + encodeURIComponent(c.id) + "/" + kind, { method: want ? "PUT" : "DELETE" })
      .then(r => (r.ok ? r.json() : r.text().then(t => Promise.reject(new Error(cloudErr(t, r.status))))))
      .then(j => {
        // An API from before dislikes answers mine/favs only: keep the dislike count we have.
        const v = j.mine ? 1 : j.hate ? -1 : 0;
        set(v, +j.favs || 0, j.hates === undefined ? c.hates || 0 : +j.hates || 0);
        track("gallery_vote", { vote: v });
      })
      .catch(e => { set(before.v, before.favs, before.hates); galHint("Could not save that vote: " + e.message); });
  }
  function galPatchFavs(id, favs, hates) {
    for (const k in galMem) {
      const j = galMem[k].j;
      if (!j) continue;
      if (j.builtin && id.indexOf("builtin:") === 0) {
        j.builtin[id] = favs;
        (j.builtinHates = j.builtinHates || {})[id] = hates;
      }
      for (const r of (j.items || [])) if (r.id === id) { r.favs = favs; r.hates = hates; }
    }
    for (const c of gal.pend) if (c.id === id) { c.favs = favs; c.hates = hates; }
  }
  function galMineFetch() {
    if (!cloudSess) { gal.mine = new Set(); gal.hate = new Set(); gal.admin = false; errLinkSync(); return Promise.resolve(); }
    return apiFetch("/api/me/favs", { method: "GET" })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (!j || !Array.isArray(j.ids)) return;
        gal.mine = new Set(j.ids);
        gal.hate = new Set(Array.isArray(j.hates) ? j.hates : []);
        gal.admin = j.admin === true;          // a moderator (the API's ADMIN_UIDS): ✕ on every card
        errLinkSync();                         // ...and the profile popover's Error reports
      })
      .catch(() => { /* offline: votes just show unmarked */ });
  }
  // The server deletes the card for good (a later upload of the scene, from another device,
  // makes nothing) and names the scene it followed, which leaves your own list here too.
  // An admin removing someone else's card is asked with the author named, and nothing leaves
  // the admin's own list (the server names no scene for that either).
  function galRemove(c, card) {
    const own = !!c.owner && c.owner === galMe();
    if (!confirm(own ? "Delete “" + c.name + "”?\n\nIt goes from the gallery for everyone, with its votes, and from your own scenes. This cannot be undone."
      : "Delete “" + c.name + "” by " + (c.author || "Anonymous") + " from the gallery?\n\nIt goes for everyone, with its votes, and its author cannot publish it again. This cannot be undone.")) return;
    galAuthFetch("/api/gallery/" + encodeURIComponent(c.id), { method: "DELETE" })
      .then(r => {
        if (!r.ok && r.status !== 404) return r.text().then(t => Promise.reject(new Error(cloudErr(t, r.status))));
        return r.status === 404 ? null : r.json().catch(() => null);
      }).then(j => {
        if (own && j && (j.sid || j.name)) dropOwnScene(typeof j.sid === "string" ? j.sid : "", String(j.name || ""));
        card.remove();
        galBust();
        galEmpty();
        track("gallery_remove", {});
      }).catch(e => galHint("Could not remove it: " + e.message));
  }
  // Your own scene (never a borrowed one) by its card id, or by name for a card the backfill
  // made before scenes had ids. Like Delete in the scene list, removing the selected scene
  // APPLIES its neighbour, and removing the last re-seeds the shipped library.
  function dropOwnScene(sid, name) {
    const at = presets.findIndex(p => !collectionOf(p) && (sid ? p.sid === sid : p.name === name));
    if (at < 0) return;
    const was = curPreset;
    presets.splice(at, 1);
    if (at < was) curPreset = was - 1;
    ensureSelection();
    if (at === was) { curPreset = Math.min(at, presets.length - 1); applyPreset(curPreset); }
    rebuildPresetOptions();
    persist();
  }
  // One card as a one-scene library blob plus who made it. A built-in is cut out of the
  // shipped collection (no request); anyone else's is fetched by id, and the ANSWER names it,
  // so a #g= link that knows nothing but the id still credits the author.
  function galSceneOf(c) {
    if (c.at != null) return galFetchLibrary(BUILTIN_GALLERY[0].uid).then(lib => {
      const p = lib && Array.isArray(lib.presets) && lib.presets[c.at];
      if (!p) throw new Error("that scene is missing from this build");
      return { blob: { presets: [p], curPreset: 0, cycle: false, palettes: lib.palettes }, name: c.name, author: c.author };
    });
    return apiGet("/api/gallery/" + encodeURIComponent(c.id)).then(r => {
      if (r.status === 404) throw new Error("it has been taken out of the gallery");
      if (!r.ok) return r.text().then(t => Promise.reject(new Error(cloudErr(t, r.status))));
      return r.json();
    }).then(d => unzipFromB64(d.payload).then(json => {
      if (json == null) throw new Error("could not read that scene");
      let blob;
      try { blob = JSON.parse(json); } catch (e) { throw new Error("that scene is corrupt"); }
      return { blob, name: String(d.name || c.name || "Scene"), author: d.author || c.author };
    }));
  }
  function galLoadCard(c) {
    // A local card is already in your scenes: switch to it in place, as the cycler would.
    if (c.local) {
      const i = galHeld(c)[0];
      if (i == null) { galHint("“" + c.name + "” is no longer in your scenes."); return; }
      galOpen(false);
      autosavePreset();                        // fold pending live edits into the scene you leave
      stopCycling();                           // ...and the one you picked stays on screen
      applyPreset(i);
      track("gallery_local", {});
      return;
    }
    galHint("Fetching “" + c.name + "”…");
    galSceneOf(c).then(got => {
      galOpen(false);
      applyGalleryScene(got.blob, got.author);
      track("gallery_load", { builtin: c.at != null });
    }).catch(e => galHint("Could not load: " + e.message));
  }
  // A card's link: #g=<card id>, a built-in's "builtin:<slug>" included. The id is the whole
  // link -- nothing is minted, so copying is synchronous and works signed out. A FRAGMENT, like
  // #c=, so the page is served from cache and the id never reaches the static host.
  const galLinkOf = c => location.href.split(/[?#]/)[0].replace(/[^/]*$/, "") + "#g=" + c.id;
  // #gallery opens the gallery itself: the address bar carries it while the dialog is open,
  // and Copy link in the dialog copies it. Not one of the reload-on-hashchange fragments --
  // it installs nothing, so an open tab just opens the dialog.
  const GAL_HASH = "#gallery";
  const galHome = () => location.href.split(/[?#]/)[0].replace(/[^/]*$/, "") + GAL_HASH;
  function galMarkUrl(on) {
    const want = on ? GAL_HASH : "";
    if (on ? location.hash === GAL_HASH : location.hash !== GAL_HASH) return;
    try { history.replaceState(null, "", location.pathname + location.search + want); } catch (e) {}
  }
  function galCopyLink(c, btn) {
    const url = c ? galLinkOf(c) : galHome();
    const idle = btn.textContent;
    const done = ok => {
      if (!ok) return;
      btn.textContent = c ? "✓" : "✓ Copied"; btn.classList.add("copied");
      setTimeout(() => { btn.textContent = idle; btn.classList.remove("copied"); }, 1600);
    };
    const ask = () => { prompt("Copy this link:", url); done(false); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => done(true), ask);
    } else ask();
    track("gallery_share", c ? { builtin: c.at != null } : { gallery: true });
  }
  // #g=<id> at startup (applyShared defers to here once every slice has run). Same install as
  // a click on the card; a link to a scene that is gone, or a built-in this build does not
  // ship, opens the gallery instead and says so there.
  function galOpenLink(id) {
    id = String(id || "");
    const b = id.indexOf("builtin:") === 0 ? galBuiltinCards().find(x => x.id === id) : null;
    const c = b || { id, name: "", author: "" };
    const fail = msg => { gal.note = "That shared scene could not be opened: " + msg + "."; galOpen(true); };
    if (!b && (id.indexOf("builtin:") === 0 || !cloudOn())) return fail("this version does not have it");
    galSceneOf(c).then(got => {
      applyGalleryScene(got.blob, got.author);
      track("gallery_link", { builtin: !!b });
    }).catch(e => fail(e.message));
  }

  // ---- the Collections tab: whole published profiles, as before M3 ----
  function galPeople() {
    galHint("Loading…");
    const seq = gal.seq;
    const builtin = BUILTIN_GALLERY.map(b => ({ uid: b.uid, name: b.name, count: b.count, updated: b.updated }));
    const show = items => {
      if (seq !== gal.seq) return;
      const host = el("gal-list");
      host.textContent = "";
      const all = builtin.concat(items);
      // A collection you hold that is no longer listed (unpublished, renamed, a uid-less
      // follow) still gets a row, so it can still be unfollowed.
      for (const h of galHeldCollections()) {
        if (all.some(p => galFollows(p, h))) continue;
        all.push({ uid: h.uid, name: h.key, count: presets.filter(p => collectionOf(p) === h.key).length, updated: "", gone: true });
      }
      const rows = all.filter(p => !gal.q || String(p.name).toLowerCase().indexOf(gal.q.toLowerCase()) >= 0);
      for (const p of rows) host.appendChild(galPersonRow(p));
      galHint(rows.length ? "" : "No one matches “" + gal.q + "”.");
    };
    const hit = galMem.profiles;
    if (hit && Date.now() - hit.t < GAL_TTL()) return show(hit.j);
    galList().then(items => { galMem.profiles = { t: Date.now(), j: items }; show(items); })
      .catch(e => { show([]); galHint("Could not load the collections: " + e.message); });
  }
  function galPersonRow(p) {
    const row = document.createElement("div");
    row.className = "gal-row";
    const nm = document.createElement("div");
    nm.className = "gal-name";
    nm.textContent = p.name;
    const meta = document.createElement("div");
    meta.className = "gal-meta";
    const held = galHeldCollections().find(h => galFollows(p, h));
    meta.textContent = p.count + " scene" + (p.count === 1 ? "" : "s")
      + (p.updated ? " · " + String(p.updated).slice(0, 10) : "")
      + (p.gone ? " · no longer listed" : held ? " · following" : "");
    // Load: someone else's scenes are installed as their own collection under their name, so
    // they cannot overwrite yours and re-loading simply refreshes their set. Unfollow (card
    // 832), on a collection you hold: its scenes leave yours and the follow goes.
    const btns = document.createElement("div");
    btns.className = "gal-btns";
    if (!p.gone) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "audbtn"; b.textContent = held ? "Reload scenes" : "Load scenes";
      b.title = held ? "Fetch “" + p.name + "” again — its newest scenes replace the ones you have"
        : "Add these as a “" + p.name + "” collection in your scenes — your own scenes are untouched";
      b.addEventListener("click", () => galLoad(p));
      btns.appendChild(b);
    }
    if (held) {
      const u = document.createElement("button");
      u.type = "button"; u.className = "audbtn gal-unfollow"; u.textContent = "Unfollow";
      u.title = "Stop following “" + held.key + "” — its scenes leave your scenes; your own are untouched";
      u.addEventListener("click", () => {
        if (!unfollowCollection(held.key)) return;
        if (p.gone) row.remove(); else row.replaceWith(galPersonRow(p));
        track("gallery_unfollow", {});
      });
      btns.appendChild(u);
    }
    row.append(nm, meta, btns);
    return row;
  }
  // The collections you HOLD: every follow (collectionsHeld), plus any label your scenes carry
  // without one (a library from before follows were noted). "Shared with you" is a folder.
  function galHeldCollections() {
    const out = collectionsHeld.map(h => ({ key: h.key, uid: h.uid }));
    for (const p of presets) {
      const k = collectionOf(p);
      if (k && k !== SHARED_COLLECTION && !out.some(h => h.key === k)) out.push({ key: k, uid: "" });
    }
    return out;
  }
  const galFollows = (p, h) => (!!h.uid && h.uid === p.uid) || h.key === p.name;
  // One public profile, fetched and decoded into its blob. Split out of galLoad because
  // refollowCollections needs exactly the same three steps (fetch → payload → unzip → parse)
  // and a second copy is how the two would drift. Rejects with a readable message at each
  // step; every caller turns that into a line of UI rather than a console trace.
  // A follow stored before the move names the source by its old FIREBASE uid; the API
  // resolves that as well as its own, so old follow-lists keep working unchanged.
  function galFetchLibrary(uid) {
    const builtin = BUILTIN_GALLERY.find(b => b.uid === uid);   // shipped in the app: no request
    const payload = builtin ? Promise.resolve(builtin.payload)
      : apiGet("/api/profiles/" + encodeURIComponent(uid)).then(r => {
        if (!r.ok) return r.text().then(t => Promise.reject(new Error(cloudErr(t, r.status))));
        return r.json();
      }).then(d => {
        if (!d.payload) throw new Error("that profile is empty");
        return d.payload;
      });
    return payload.then(unzipFromB64).then(json => {
      if (json == null) throw new Error("could not read that profile");
      try { return JSON.parse(json); } catch (e) { throw new Error("that profile is corrupt"); }
    });
  }
  function galLoad(p) {
    galHint("Fetching “" + p.name + "”…");
    galFetchLibrary(p.uid).then(raw => {
      galOpen(false);
      // Straight in, no Restore dialog: the scenes go into their own collection rather than
      // over yours. Same validation and the same write/reload underneath (applySharedLibrary
      // drives applyRestore). The uid rides along so the follow is noted INSIDE
      // applySharedLibrary, after validation — noting it here first left a phantom follow
      // whenever every scene failed validation.
      applySharedLibrary(raw, false, p.name, p.uid);
      track("cloud_gallery_load", { collection: p.name });
    }).catch(e => galHint("Could not load: " + e.message));
  }

  // A declaration: frame() (an earlier slice) asks it every frame.
  function galHolds() { const d = el("galdlg"); return !!d && !d.classList.contains("hidden"); }
  function galOpen(show) {
    const dlg = el("galdlg");
    if (!dlg) return;
    dlg.classList.toggle("hidden", !show);
    const box = dlg.querySelector(".gal-box");
    if (!show) {
      gal.seq++;                          // an answer still on its way lands nowhere
      for (const v of dlg.querySelectorAll("video")) v.pause();
      if (galObs) galObs.disconnect();
      if (galImgObs) galImgObs.disconnect();
      if (gal.note) { gal.note = ""; galHint(""); }
      galMarkUrl(false);
      dlgRelease(box);
      return;
    }
    galMarkUrl(true);
    dlgModal(box);
    if (box) box.scrollTop = 0;           // open at the top, header and help in view
    const fi = el("gal-filter");
    if (fi) fi.value = gal.q;
    // Hearts first, so the first paint already shows which ones are yours.
    galMineFetch().then(() => { if (!dlg.classList.contains("hidden")) galReset(); });
  }
  let galFilterT = 0;
  function galSetFilter(v) {
    clearTimeout(galFilterT);
    galFilterT = setTimeout(() => { gal.q = String(v || "").trim().slice(0, 60); galReset(); }, 250);
  }
  function galSetTab(t) {
    if (t === gal.tab) return;
    gal.tab = t;
    galReset();
    if (t === "mine" && !cloudSess) signInAsk("My favourites is for signed-in users only.");
  }

  // ---- the sign-in dialog ----------------------------------------------------------------
  // A signed-out press on something that needs an account opens THIS, over the gallery, rather
  // than only pointing at the profile popover (which sits UNDER the gallery: z 12 against 20).
  // Google draws a second button into #signin-gsi (renderButton may draw any number); the
  // sign-in itself is the one callback cloudInit registered, and landing closes this.
  function signInOpen() { const d = el("signindlg"); return !!d && !d.classList.contains("hidden"); }
  function signInAsk(why) {
    const d = el("signindlg");
    if (!d || !cloudOn() || cloudSess) return;
    nameStep(false);
    el("signin-why").textContent = why;
    signInMsg("");
    d.classList.remove("hidden");
    dlgModal(d.querySelector(".sign-box"));      // takes the trap from the gallery's box
    signInRender();
    track("sign_in_ask", { why: why.split(" ")[0] });
  }
  // A declaration: the Escape branch (ui-diagnostics) calls it.
  function closeSignIn() {
    const d = el("signindlg");
    if (!d || d.classList.contains("hidden")) return;
    d.classList.add("hidden");
    dlgRelease(d.querySelector(".sign-box"));
    nameStep(false);                         // the next open is a sign-in again
    // ...and hand the keyboard back to the gallery, if that is what it was opened over
    const g = el("galdlg");
    if (g && !g.classList.contains("hidden")) dlgModal(g.querySelector(".gal-box"));
  }
  function signInMsg(s, bad) {
    const m = el("signin-msg");
    if (!m) return;
    m.textContent = s || "";
    m.style.color = bad ? "#ff8b6a" : "";
  }
  function signInRender() {
    const host = el("signin-gsi");
    if (!host || !signInOpen()) return;
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      signInMsg(CLOUD.clientId ? "Loading Google sign-in…" : "Sign-in is not configured for this build.", !CLOUD.clientId);
      return;                                   // cloudInit's onload draws it once GIS is in
    }
    if (host.children.length) return;
    try {
      window.google.accounts.id.renderButton(host, {
        theme: "filled_black", shape: "pill", size: "large",
        text: "signin_with", logo_alignment: "left", width: 260,
      });
      signInMsg("");
    } catch (e) { signInMsg("Google sign-in is unavailable right now.", true); }
  }

  // The dialog's SECOND STEP: a profile name, asked once, right after a sign-in that brought
  // none (a new account, Apple's in particular — we store neither its email nor its name, and
  // the name Apple sends on the first authorisation only prefills this). Later just closes;
  // the popover's name label stays the way to set it afterwards.
  function nameStep(on) {
    el("signin-step").hidden = on;
    el("signin-namestep").hidden = !on;
    el("signin-title").textContent = on ? "Choose a profile name" : "Sign in";
  }
  function nameAsk(prefill) {
    const d = el("signindlg"), inp = el("signin-name");
    if (!d || !inp || !cloudSess) return;
    nameStep(true);
    inp.value = String(prefill || "").trim().slice(0, 40);
    signInMsg("");
    d.classList.remove("hidden");
    dlgModal(d.querySelector(".sign-box"));
    inp.focus();
    inp.select();
    track("name_ask", {});
  }
  function nameSave() {
    const inp = el("signin-name"), btn = el("signin-namesave");
    const v = (inp.value || "").trim().slice(0, 40);
    if (!v) { signInMsg("Type a name, or choose Later.", true); return; }
    if (!cloudSess) { closeSignIn(); return; }
    setProfileName(v);                   // the field, the cache, your collection's label
    cloudNameShow();
    btn.disabled = true;
    signInMsg("Saving…");
    apiFetch("/api/me", { method: "PATCH", body: JSON.stringify({ name: v }) })
      .then(r => (r.ok ? null : r.text().then(t => Promise.reject(new Error(cloudErr(t, r.status))))))
      .then(() => {
        closeSignIn();
        // The profile carries the name too. A first sign-in seeded it a moment ago with the
        // default, so write it again now rather than a day from now.
        if (cloudSess && cloudSess.docTime) cloudSave(); else autoSaveNoteChange();
        gsyncSoon();
      })
      .catch(e => signInMsg("Could not save the name: " + e.message, true))
      .then(() => { btn.disabled = false; });
  }

  // ---- Sign in with Apple ----------------------------------------------------------------
  // Apple's popup flow: appleid.auth.js opens appleid.apple.com, the person signs in there, and
  // signIn() resolves with an ID token whose audience is the Services ID and whose `nonce` is
  // the one we passed — the API checks both (POST /api/auth/apple). redirectURI must be one the
  // Services ID lists (https://kicktro.com/), so this only works on the live site; nothing is
  // ever posted to it in popup mode. The script loads only while signed out, and only when
  // CONFIG.cloud.appleClientId is set. signIn() must run inside the click, hence the preload.
  let appleState = 0;                   // 0 not asked for, 1 loading, 2 ready, -1 failed
  function appleLoad() {
    if (!CLOUD.appleClientId || cloudSess || appleState) return;
    appleState = 1;
    const s = document.createElement("script");
    s.src = APPLE_SRC; s.async = true;
    s.onload = () => { appleState = window.AppleID && window.AppleID.auth ? 2 : -1; };
    s.onerror = () => { appleState = -1; };
    document.head.appendChild(s);
  }
  function appleNonce() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
  }
  function appleSignIn() {
    const say = (s, bad) => { cloudMsg(s, bad); signInMsg(s, bad); };
    if (appleState !== 2) {
      say(appleState === -1 ? "Could not reach Apple sign-in." : "Loading Apple sign-in… press it again in a moment.", appleState === -1);
      appleLoad();
      return;
    }
    const nonce = appleNonce(), state = appleNonce();
    try {
      window.AppleID.auth.init({
        clientId: CLOUD.appleClientId, scope: "name", redirectURI: CLOUD.appleRedirect,
        usePopup: true, nonce, state,
      });
    } catch (e) { say("Apple sign-in is unavailable right now.", true); return; }
    window.AppleID.auth.signIn().then(res => {
      const a = res && res.authorization;
      if (!a || typeof a.id_token !== "string" || (a.state && a.state !== state)) throw new Error("Apple sent no sign-in back");
      const n = res.user && res.user.name;
      const hint = n ? [n.firstName, n.lastName].filter(x => typeof x === "string" && x).join(" ") : "";
      say("Signing in…");
      return cloudSignIn("/api/auth/apple", { idToken: a.id_token, nonce }, hint);
    }).catch(e => {
      const code = String((e && (e.error || e.message)) || e || "");
      if (/popup_closed_by_user|user_cancelled_authorize/.test(code)) { say(""); return; }
      say("Sign-in failed: " + code, true);
    });
  }

  // ---- share the running scene through the API ---------------------------------------
  // Signed in, "Share this scene" stores the scene as one immutable record (POST /api/scenes)
  // and hands back a ~30-character link. Signed out (or if the write fails for any reason) it
  // falls back to the self-contained ?z= link, so sharing never stops working and never
  // requires an account — the cloud route is an optimisation, not a gate.
  //
  // A share is deliberately NOT a profile: a link pointing into a profile would only open
  // while that profile was published to the gallery, so sharing one scene would drag the
  // sharer's entire library public with it. These stay independent decisions.
  //
  // The payload is `sceneBlob()` — the exact blob the ?z= link carries, through the exact
  // same codec — so both transports describe a shared scene identically and the recipient
  // path is the one that already exists (installShared).
  function cloudShareScene() {
    const dir = location.origin + location.pathname.replace(/[^/]*$/, "");
    if (!cloudOn() || !cloudSess) return shareUrl();          // signed out ⇒ the classic link
    // BELOW the guard: sceneBlob() is not free -- it runs saveLiveMaps and stackOut, which does a
    // full freeze/thaw round-trip on the selected layer -- and on the signed-out path the result
    // was built and thrown away.
    const json = JSON.stringify(sceneBlob());
    return zipToB64(json).then(payload => {
      if (payload == null || payload.length >= 200000) return shareUrl();
      const sceneName = (presetSel && presetSel.selectedIndex >= 0 && curPreset >= 0 && presets[curPreset]
        ? String(presets[curPreset].name) : "Shared scene").slice(0, 60);
      // The SERVER mints the id: inventing one here would risk colliding with someone else's.
      return apiFetch("/api/scenes", { method: "POST", body: JSON.stringify({ name: sceneName, payload }) })
        .then(r => (r.ok ? r.json() : r.text().then(t => Promise.reject(new Error(cloudErr(t, r.status))))))
        .then(res => {
          const id = String((res && res.id) || "");
          if (!id) throw new Error("no id returned");
          cloudLinks.unshift({ id, name: sceneName, created: Date.now() });
          cloudLinksRender();
          track("share_scene_cloud", {});
          return dir + "#c=" + id;
        })
        .catch(() => shareUrl());       // rate limit, offline — the link still works
    });
  }

  // ---- my shared links: the retraction list ------------------------------------------
  // Share links are immutable and deliberately UNLISTED to everyone else (a link meant for one
  // person must not be enumerable into a public directory) — but the server lists YOUR OWN
  // (/api/me/scenes), so this list covers every machine you shared from, and the links the
  // Firebase import carried over. It used to be a local note taken at mint time
  // (burnTheWeb.sharelinks.v1), which only ever knew this browser's links; that note is gone.
  try { localStorage.removeItem("burnTheWeb.sharelinks.v1"); } catch (e) { /* private mode */ }
  let cloudLinks = [];
  function cloudLinksFetch() {
    if (!cloudSess) return Promise.resolve();
    return apiFetch("/api/me/scenes", { method: "GET" })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (j && Array.isArray(j.items)) { cloudLinks = j.items; cloudLinksRender(); } })
      .catch(() => { /* offline: the list just stays as it was */ });
  }
  // Deleting the record is the retraction: the link stops opening for everyone holding it.
  // 404 counts as done — already deleted from another device, or by Delete profile's sweep.
  function cloudLinkDelete(id) {
    return apiFetch("/api/scenes/" + encodeURIComponent(id), { method: "DELETE" })
      .then(r => {
        if (r.ok || r.status === 404) {
          cloudLinks = cloudLinks.filter(x => x.id !== id);
          cloudLinksRender();
          return;
        }
        return r.text().then(t => Promise.reject(new Error(cloudErr(t, r.status))));
      });
  }
  // Best-effort sweep for Delete profile: "delete my cloud profile and everything in it"
  // takes your share links with it. Re-listed first, so a link made elsewhere since this page
  // loaded goes too; a failure never blocks the profile delete itself.
  function shareLinksDeleteAll() {
    if (!cloudSess) return Promise.resolve();
    return cloudLinksFetch()
      .then(() => Promise.all(cloudLinks.map(x => cloudLinkDelete(x.id).catch(() => {}))));
  }
  function cloudLinksRender() {
    const box = el("cloud-links"), list = el("cloud-linklist");
    if (!box || !list) return;
    const mine = cloudSess ? cloudLinks : [];
    box.style.display = mine.length ? "" : "none";
    list.textContent = "";
    const dir = location.origin + location.pathname.replace(/[^/]*$/, "");
    mine.forEach(x => {                           // newest first, as the server lists them
      const row = document.createElement("div");
      row.className = "cl-row";
      const name = document.createElement("span");
      name.className = "cl-name";
      name.textContent = x.name || "Shared scene";
      name.title = new Date(x.created || 0).toLocaleDateString();
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "cl-btn";
      copy.textContent = "Copy";
      copy.title = "Copy the share link again";
      copy.onclick = () => {
        const u = dir + "#c=" + x.id;
        (navigator.clipboard && navigator.clipboard.writeText
          ? navigator.clipboard.writeText(u) : Promise.reject())
          .then(() => cloudMsg("Link copied."), () => prompt("Share link:", u));
      };
      const del = document.createElement("button");
      del.type = "button";
      del.className = "cl-btn";
      del.textContent = "✕";
      del.title = "Delete this shared scene from the cloud — the link stops opening for everyone";
      del.onclick = () => {
        if (!confirm('Delete the shared link for "' + (x.name || "Shared scene")
          + '"? Anyone holding it will no longer be able to open it.')) return;
        cloudLinkDelete(x.id).then(
          () => cloudMsg("Shared link deleted."),
          e => cloudMsg("Could not delete the link: " + e.message, true));
      };
      row.append(name, copy, del);
      list.appendChild(row);
    });
  }
  // Recipient side of #c=<id>. Called (deferred) from applyShared: the fetch is anonymous,
  // because a share link must open for someone with no account.
  //
  // Returns {json, name}, not the bare payload: the record carries the sender's own name for
  // the scene, and a shared scene is now KEPT as a real scene in the recipient's library, so it
  // needs something to be called. ?z=/?s= have no equivalent — sceneBlob() has no name field —
  // so this is the only path that can supply one.
  //
  // API only: every #c= id ever minted, the Firebase-era ones included (the import kept each id
  // verbatim), is answered by GET /api/scenes/<id>. Nothing else is asked.
  function cloudFetchScene(id) {
    if (!cloudOn()) return Promise.resolve(null);
    return apiGet("/api/scenes/" + encodeURIComponent(id))
      .then(r => (r.ok ? r.json() : null), () => null)
      .then(d => (d && d.payload
        ? unzipFromB64(d.payload).then(json => (json ? { json, name: d.name || "" } : null))
        : null))
      .catch(() => null);
  }

  // ---- profile name: text, not a permanently open input ----
  // Signed in, the name is a label you click to edit. `#cloud-name` remains the VALUE STORE
  // (cloudSave and cloudFetchProfileMeta both read/write it, unchanged) — this only governs
  // which of the two is on screen, the same arrangement `#palette` has behind the swatches.
  const NAME_EMPTY = "Set a profile name…";
  function cloudNameShow() {
    const view = el("cloud-nameview"), inp = el("cloud-name");
    if (!view || !inp) return;
    const v = (inp.value || "").trim();
    view.textContent = v || NAME_EMPTY;
    view.classList.toggle("empty", !v);
    view.style.display = "";
    inp.style.display = "none";
  }
  function cloudNameEdit() {
    const view = el("cloud-nameview"), inp = el("cloud-name");
    if (!view || !inp) return;
    view.style.display = "none";
    inp.style.display = "";
    inp.focus();
    inp.select();
  }
  function cloudNameCommit() {
    const inp = el("cloud-name");
    setProfileName(inp ? inp.value : "");   // trims, caches, and relabels your collection
    cloudNameShow();
  }

  // ---- UI ----
  function cloudMsg(s, bad) {
    const m = el("cloud-msg");
    if (!m) return;
    m.textContent = s || "";
    m.style.color = bad ? "#ff8b6a" : "";
  }
  function cloudSyncUI() {
    if (!cloudOn()) return;
    const inS = !!cloudSess;
    const authed = el("cloud-authed"), signin = el("cloud-signin"), who = el("cloud-who");
    if (authed) authed.style.display = inS ? "" : "none";
    // Signed in, the sign-in box is hidden AND EMPTIED. Hiding alone left an empty bordered
    // box on screen for at least one real user — Google's button is an iframe in markup that
    // is theirs, not ours, so what survives a `display:none` on the container is not something
    // to reason about from here. Removing the children removes the question, and also stops a
    // third-party iframe sitting in the page for a signed-in session that has no use for it.
    // The `.signed-in` class is what actually hides it, so no inline style (ours or Google's)
    // can win; gsiWidth resets so sign-out re-renders it at the right width.
    const row = el("cloudrow");
    if (row) row.classList.toggle("signed-in", inS);
    if (signin) {
      signin.style.display = inS ? "none" : "";
      if (inS && signin.children.length) { signin.textContent = ""; gsiWidth = 0; }
      // Signed out, draw the button back straight away. Leaving this to the ResizeObserver
      // looked equivalent and was not: it left an empty bordered box after sign-out — the
      // mirror image of the bug being fixed. gsiRender self-guards on GIS being loaded and on
      // the box having a width, so calling it here is safe even during startup.
      if (!inS) gsiRender();
    }
    if (!inS) appleLoad();               // ready before the click: signIn() needs the gesture
    // Its own line now, not a suffix to a "Cloud profile" label — the box title says that.
    // So it has to state both halves rather than only marking the signed-in one.
    if (who) who.textContent = inS
      ? "Signed in — your scenes can be saved here and picked up on another machine."
      : "Sign in to keep your scenes online and pick them up on another machine.";
    const pubBox = el("cloud-pub");
    if (pubBox) pubBox.checked = !!(cloudSess && cloudSess.pub);
    cloudNameShow();                     // signing in/out always lands back on the label
    cloudLinksRender();                  // the list only shows YOUR links, so it follows the session
    errLinkSync();                       // moderators' Error reports: off the moment you sign out
    if (!inS) cloudMsg("");
  }

  // Render (or re-render) Google's button at the width its box actually has.
  //
  // Google draws this button itself and its internals cannot be styled — the theme/shape/size
  // options are the whole supported surface — so the ONLY way to stop it overflowing the
  // 250px panel is to tell it the width. And that width can only be measured while the panel
  // is open: closed, clientWidth is 0, which is why this re-runs from a ResizeObserver rather
  // than once at startup. Google clamps `width` to 200–400, so the container's padding is kept
  // small enough that its content box stays above 200 inside a 250px panel.
  let gsiWidth = 0;
  function gsiRender() {
    const host = el("cloud-signin");
    if (!host || !window.google || !window.google.accounts || !window.google.accounts.id) return;
    const avail = Math.round(host.clientWidth);
    if (avail <= 0) return;                     // panel closed — wait for the observer
    const w = Math.max(200, Math.min(400, avail));
    if (w === gsiWidth) return;                 // already drawn at this width
    gsiWidth = w;
    host.textContent = "";                      // renderButton appends; clear the old one first
    try {
      window.google.accounts.id.renderButton(host, {
        theme: "filled_black", shape: "pill", size: "large",
        text: "signin_with", logo_alignment: "left", width: w,
      });
    } catch (e) { /* GIS unavailable — the message line already says so */ }
  }

  // Google Identity Services renders the sign-in button and hands back a Google ID token,
  // which cloudSignIn trades for an API session. Loaded lazily and ONLY when configured,
  // so an unconfigured build makes no third-party request at all.
  function cloudInit() {
    if (!cloudOn()) return;              // feature off ⇒ the row stays hidden, nothing loads
    const row = el("cloudrow");
    if (row) row.classList.remove("hidden");
    cloudLoadSess();
    // Seed the field from the cached name BEFORE any request, so the box shows who you are
    // straight away.
    const cached = storedProfileName();
    if (cached && el("cloud-name") && !el("cloud-name").value) el("cloud-name").value = cached;
    cloudNameShow();
    cloudSyncUI();
    if (cloudSess) cloudFetchProfileMeta();
    if (cloudSess) cloudLinksFetch();
    if (cloudSess) gsyncOwn();            // signed in before uploads began: never anonymous here
    if (cloudSess) galMineFetch();        // votes, and whether this is a moderator (Error reports)
    sceneMark(true);                     // the startup scene as loaded, unless a load already marked it
    gsyncReady = true;
    if (gsyncOn()) setTimeout(gsyncSoon, 6000);   // whatever changed while uploads were off
    document.querySelectorAll(".apple-host").forEach(h => { h.hidden = !CLOUD.appleClientId; });
    if (!CLOUD.clientId) { cloudMsg("Sign-in is not configured for this build.", true); return; }
    const s = document.createElement("script");
    s.src = GIS_SRC; s.async = true; s.defer = true;
    s.onload = () => {
      try {
        window.google.accounts.id.initialize({
          client_id: CLOUD.clientId,
          callback: res => {
            if (!res || !res.credential) return;
            cloudMsg("Signing in…"); signInMsg("Signing in…");
            cloudSignIn("/api/auth/google", { idToken: res.credential }).catch(e => {
              cloudMsg("Sign-in failed: " + e.message, true);
              signInMsg("Sign-in failed: " + e.message, true);
            });
          },
        });
        // Google renders this button itself, under its branding rules — its internals cannot
        // be restyled (it is their markup, and the shape/colour options are the supported
        // surface). So: pick the variant that sits closest to this panel — black fill, pill,
        // to match the rounded amber buttons — and size it to the panel width so it does not
        // read as a foreign object dropped in. The surrounding padding/centreing is CSS on
        // #cloud-signin, which IS ours.
        gsiRender();
        // The width can only be measured while the panel is OPEN — closed, clientWidth is 0
        // and any guess bakes in the wrong number. So render (or re-render) whenever the box
        // actually has a width: on open, and on any panel/window resize.
        if (window.ResizeObserver) new ResizeObserver(gsiRender).observe(el("cloud-signin"));
        signInRender();                  // a sign-in dialog opened while GIS was loading
      } catch (e) { cloudMsg("Sign-in unavailable: " + e.message, true); }
    };
    s.onerror = () => cloudMsg("Could not reach Google sign-in.", true);
    document.head.appendChild(s);
  }

  // Save to cloud / Load from cloud and the Collections + Save automatically ticks are GONE from
  // the profile popover (by request). Automatic save is now the only way the profile is
  // written, so a stored "off" from the old tick — which nothing can switch back — is undone.
  if (el("cloud-delete")) el("cloud-delete").addEventListener("click", cloudDelete);
  if (el("cloud-signout")) el("cloud-signout").addEventListener("click", cloudSignOut);
  if (!autoSaveEnabled()) autoSaveSetEnabled(true);
  autoSaveSyncInfo();
  if (el("cloud-nameview")) {
    el("cloud-nameview").addEventListener("click", cloudNameEdit);
    // Keyboard parity: the label is focusable, so Enter/Space must open it too.
    el("cloud-nameview").addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cloudNameEdit(); }
    });
  }
  if (el("cloud-name")) {
    el("cloud-name").addEventListener("blur", cloudNameCommit);
    el("cloud-name").addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); cloudNameCommit(); }
      else if (e.key === "Escape") { e.preventDefault(); cloudNameCommit(); }
    });
  }
  if (el("gal-close")) el("gal-close").addEventListener("click", () => galOpen(false));
  if (el("signin-close")) el("signin-close").addEventListener("click", closeSignIn);
  // Delegated: the popover ADOPTS the profile row's nodes, so bind where they always are.
  document.addEventListener("click", e => {
    if (e.target.closest && e.target.closest("[data-apple-signin]")) appleSignIn();
  });
  if (el("signin-namesave")) el("signin-namesave").addEventListener("click", nameSave);
  if (el("signin-nameskip")) el("signin-nameskip").addEventListener("click", closeSignIn);
  if (el("signin-name")) el("signin-name").addEventListener("keydown", e => {
    e.stopPropagation();                  // the window's single-key shortcuts must not fire here
    if (e.key === "Enter") { e.preventDefault(); nameSave(); }
    else if (e.key === "Escape") { e.preventDefault(); closeSignIn(); }
  });
  if (el("signindlg")) el("signindlg").addEventListener("click", e => { if (e.target === el("signindlg")) closeSignIn(); });
  if (el("gal-filter")) el("gal-filter").addEventListener("input", e => galSetFilter(e.target.value));
  if (el("gal-more")) el("gal-more").addEventListener("click", galMore);
  gal.weight = galWeightStored();
  if (el("gal-weight")) el("gal-weight").addEventListener("input", e => galSetWeight(+e.target.value));
  galSyncWeight();
  if (el("gal-link")) el("gal-link").addEventListener("click", e => galCopyLink(null, e.currentTarget));
  // The profile button is gated like ▦: with no API there is nothing to sign in to.
  if (el("profbtn")) el("profbtn").classList.toggle("hidden", !cloudOn());
  if (el("galbtn")) {
    el("galbtn").classList.toggle("hidden", !cloudOn());
    el("galbtn").addEventListener("click", () => galOpen(el("galdlg").classList.contains("hidden")));
  }
  // A #gallery link: at startup, and pasted into a tab that is already open.
  // ...and the FRONT DOOR: a visit to the bare address opens on the gallery, except on the
  // reload that lands a scene just picked from it (scenePicked).
  if (cloudOn() && (location.hash === GAL_HASH || (frontDoorOn() && frontDoorUrl() && !scenePicked)))
    Promise.resolve().then(() => galOpen(true));
  window.addEventListener("hashchange", () => {
    if (cloudOn() && location.hash === GAL_HASH && el("galdlg").classList.contains("hidden")) galOpen(true);
  });
  for (const t of document.querySelectorAll("#galdlg .gal-tab")) t.addEventListener("click", () => galSetTab(t.dataset.tab));
  if (el("galdlg")) el("galdlg").addEventListener("click", e => { if (e.target === el("galdlg")) galOpen(false); });
  cloudInit();
