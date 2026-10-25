  // ---- cloud profiles: the Kicktro API (server/ in this repo, at api.kicktro.com) ---------
  // Keep your preset library against a Google account so it follows you between machines.
  //
  // NO SDK. Everything here is fetch() against our own small JSON API, so the page stays a
  // single self-contained file with no bundled dependency. The one remote script is Google
  // Identity Services, for the sign-in button — the same class of thing initAnalytics()
  // already loads (gtag.js), not a new one. It hands back a Google ID token, which the API
  // verifies and trades for its own session token.
  //
  // The whole feature is gated on CONFIG.cloud.apiBase: empty ⇒ no script, no request, and
  // the Cloud row stays hidden. Identical kill switch to CONFIG.analyticsId.
  //
  // **The security boundary is server/routes.js, not this file.** Anything this file declines
  // to do can still be attempted by hand against the API. Client-side checks here are for the
  // user's benefit — clear errors, no pointless round trips — never for security.
  //
  // Moved off Firebase in card 825 (M2). Firestore is still READ for one thing, a #c= link the
  // import did not carry (cloudFetchScene), and that fallback goes once the import is confirmed.
  const CLOUD = CONFIG.cloud;
  // ?api=<origin> points a LOCAL page (file://, localhost) at a dev server, node server/main.js.
  // Ignored on any other host, so a crafted link can never send someone's session elsewhere.
  const API = (function () {
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
  function cloudSignIn(googleIdToken) {
    return fetch(API + "/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: googleIdToken }),
    }).then(r => (r.ok ? r.json() : r.text().then(t => Promise.reject(new Error(cloudErr(t, r.status))))))
      .then(j => {
        cloudSess = { uid: j.uid, token: j.token, expires: +j.expires };
        cloudSaveSess();
        track("cloud_sign_in", {});
        cloudSyncUI();
        // ...and, if this account has no profile yet, put this machine's library into it.
        cloudFetchProfileMeta(true);      // pick up the profile name, if there is one already
        cloudLinksFetch();
      });
  }
  function cloudSignOut() {
    cloudSess = null;
    cloudLinks = [];
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

  // ---- publish ----
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
  // Public profiles, readable WITHOUT signing in (GET /api/profiles), so any visitor can browse.
  // v2: the listing moved off Firestore and its rows carry the API's uids. A cached v1 listing
  // would still open (the API resolves an old Firebase uid too), but it is dropped so the next
  // open shows the migrated list.
  const GAL_KEY = "burnTheWeb.gallery.v2";
  try { localStorage.removeItem("burnTheWeb.gallery.v1"); } catch (e) { /* private mode */ }
  // ONE request for the whole listing; filter, pages and the shuffle are all client-side.
  function galList() {
    return apiGet("/api/profiles").then(r => (r.ok ? r.json()
      : r.text().then(t => Promise.reject(new Error(cloudErr(t, r.status)))))).then(j =>
      ((j && j.items) || []).map(p => ({
        uid: String(p.uid), name: p.name || "Untitled", count: p.count || 0,
        updated: p.updated ? new Date(+p.updated).toISOString() : "" })));
  }
  // Cache the listing for a DAY: one query per browser per day however often the dialog
  // opens. Filter, pages and the shuffle all work on this array and cost nothing.
  const GAL_TTL = () => CLOUD.galleryTtlMs || 86400000;
  function galCached() {
    try {
      const c = JSON.parse(localStorage.getItem(GAL_KEY) || "null");
      if (c && Date.now() - c.t < GAL_TTL()) return c.items;
    } catch (e) { /* fall through to a live fetch */ }
    return null;
  }
  function galStore(items) {
    try { localStorage.setItem(GAL_KEY, JSON.stringify({ t: Date.now(), items })); } catch (e) {}
  }
  function galBust() { try { localStorage.removeItem(GAL_KEY); } catch (e) {} }
  // WHEN THE LISTING MAY BE FETCHED AGAIN. The cached entry carries the time it was fetched,
  // so this needs no second timestamp -- and using the same number for both means the Refresh
  // button cannot undercut the cache, which is what would make "at most once a day" untrue
  // while still reading as true.
  function galNextReloadAt() {
    try {
      const c = JSON.parse(localStorage.getItem(GAL_KEY) || "null");
      if (c && c.t) return c.t + GAL_TTL();
    } catch (e) { /* no cache, no limit */ }
    return 0;
  }
  // Whole units, like the cloud box's automatic-save line.
  function galSpan(ms) {
    const m = Math.ceil(ms / 60000);
    if (m < 1) return "less than a minute";
    if (m < 60) return m + " minute" + (m === 1 ? "" : "s");
    const h = Math.floor(m / 60), r = m % 60;
    return h + " hour" + (h === 1 ? "" : "s") + (r ? " " + r + " min" : "");
  }
  // Dim Refresh and say when it comes back. setOff, not a bare class: a dimmed button that
  // still answers Enter is a bug this codebase has already had once.
  function galSyncRefresh() {
    const b = el("gal-refresh");
    if (!b) return;
    const now = Date.now(), next = galNextReloadAt();
    const waiting = next > now;
    setOff(b, waiting);
    b.title = waiting
      ? "The list reloads at most once a day \u2014 next reload possible in " + galSpan(next - now)
      : "Fetch the list again";
    return waiting ? next : 0;
  }

  // The listing as shown: the cached array shuffled ONCE per open (Math.random -- this is
  // UI, not scene content), then a name filter and 20-a-page slices, all client-side.
  let galItems = [], galFilter = "", galPage = 0;
  function galShuffle(items) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function galMatches() {
    const f = galFilter.trim().toLowerCase();
    return f ? galItems.filter(p => String(p.name).toLowerCase().indexOf(f) >= 0) : galItems;
  }
  function galPaint() {
    const all = galMatches(), n = CLOUD.galleryPage || 20, pages = Math.max(1, Math.ceil(all.length / n));
    galPage = Math.max(0, Math.min(pages - 1, galPage));
    galRender(all.slice(galPage * n, galPage * n + n));
    if (galItems.length && !all.length) el("gal-hint").textContent = "No one matches “" + galFilter.trim() + "”.";
    const pager = el("gal-pager");
    if (pager) {
      pager.classList.toggle("hidden", pages <= 1);
      el("gal-page").textContent = (galPage + 1) + " / " + pages;
      setOff(el("gal-prev"), galPage <= 0);
      setOff(el("gal-next"), galPage >= pages - 1);
    }
  }
  // The built-in rows (gallery-builtin.js) lead, unshuffled and never cached: they ship with
  // the app, so they update with it rather than with the once-a-day listing.
  const galBuiltin = () => BUILTIN_GALLERY.map(b => ({ uid: b.uid, name: b.name, count: b.count, updated: b.updated }));
  function galShow(items) { galItems = galBuiltin().concat(galShuffle(items)); galPage = 0; galPaint(); }
  function galRender(items) {
    const host = el("gal-list");
    host.textContent = "";
    if (!items.length) {
      el("gal-hint").textContent = galItems.length ? "" : "No one has published any scenes yet. Tick “Publish to gallery” to be the first.";
      return;
    }
    el("gal-hint").textContent = "";
    items.forEach(p => {
      const row = document.createElement("div");
      row.className = "gal-row";
      const nm = document.createElement("div");
      nm.className = "gal-name";
      nm.textContent = p.name;
      const meta = document.createElement("div");
      meta.className = "gal-meta";
      meta.textContent = p.count + " scene" + (p.count === 1 ? "" : "s")
        + (p.updated ? " · " + String(p.updated).slice(0, 10) : "");
      // ONE button, because there is no longer a merge-vs-replace question to answer:
      // someone else's scenes are installed as their own collection under their name, so
      // they cannot overwrite yours and re-loading simply refreshes their set. That is also
      // what lets the whole row be one line — see the .gal-row grid.
      const btns = document.createElement("div");
      btns.className = "gal-btns";
      const b = document.createElement("button");
      b.type = "button"; b.className = "audbtn"; b.textContent = "Load scenes";
      b.title = "Add these as a “" + p.name + "” collection in your scene list — your own scenes are untouched";
      b.addEventListener("click", () => galLoad(p));
      btns.appendChild(b);
      row.appendChild(nm); row.appendChild(meta); row.appendChild(btns);
      host.appendChild(row);
    });
  }
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
    el("gal-hint").textContent = "Fetching “" + p.name + "”…";
    galFetchLibrary(p.uid).then(raw => {
      galOpen(false);
      // Straight in, no Restore dialog: there is nothing left to ask, since the scenes go
      // into their own collection rather than over yours. Same validation and the same
      // write/reload underneath (applySharedLibrary drives applyRestore), so nothing about
      // the load path itself changes — only where the scenes land. The uid rides along so
      // the follow is noted INSIDE applySharedLibrary, after validation — noting it here
      // first left a phantom follow whenever every scene failed validation.
      applySharedLibrary(raw, false, p.name, p.uid);
      track("cloud_gallery_load", { collection: p.name });
    }).catch(e => { el("gal-hint").textContent = "Could not load: " + e.message; });
  }
  function galOpen(show, force) {
    const dlg = el("galdlg");
    if (!dlg) return;
    dlg.classList.toggle("hidden", !show);
    const box = dlg.querySelector(".gal-box");
    if (!show) { dlgRelease(box); return; }
    dlgModal(box);
    // AT MOST ONE LIVE FETCH A DAY, Refresh included. A listing of published profiles does
    // not change minute to minute -- but the button existed to bypass
    // the cache entirely, so it could be held down. Inside the day it re-renders what is
    // already cached and says when a real reload becomes possible, rather than pretending.
    const now = Date.now(), next = galNextReloadAt();
    const fresh = galCached();
    const fi = el("gal-filter");
    if (fi && !force) { fi.value = ""; galFilter = ""; }
    if (fresh && (!force || next > now)) {
      galShow(fresh);
      if (force && next > now) {
        el("gal-hint").textContent =
          "This list reloads at most once a day. Next reload possible in " + galSpan(next - now) + ".";
      }
      galSyncRefresh();
      return;
    }
    el("gal-list").textContent = "";
    el("gal-hint").textContent = "Loading…";
    galList().then(items => { galStore(items); galShow(items); galSyncRefresh(); })
      .catch(e => { galShow([]); el("gal-hint").textContent = "Could not load the gallery: " + e.message; });
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
  // FIRESTORE FALLBACK, TEMPORARY: a link the API does not know is tried against the old public
  // /scenes document (CONFIG.cloud.apiKey/projectId), so a #c= minted in the last minutes before
  // the freeze still opens. Remove it, and the two config keys, once the import is confirmed.
  function cloudFetchScene(id) {
    if (!cloudOn()) return Promise.resolve(null);
    const unzip = (payload, name) => unzipFromB64(payload).then(json => (json ? { json, name: name || "" } : null));
    return apiGet("/api/scenes/" + encodeURIComponent(id))
      .then(r => (r.ok ? r.json() : null), () => null)
      .then(d => {
        if (d && d.payload) return unzip(d.payload, d.name);
        if (!CLOUD.apiKey || !CLOUD.projectId) return null;
        return fetch("https://firestore.googleapis.com/v1/projects/" + CLOUD.projectId
          + "/databases/(default)/documents/scenes/" + encodeURIComponent(id) + "?key=" + encodeURIComponent(CLOUD.apiKey))
          .then(r => (r.ok ? r.json() : null))
          .then(doc => {
            const f = (doc && doc.fields) || {};
            const payload = f.payload && f.payload.stringValue;
            return payload ? unzip(payload, f.name && f.name.stringValue) : null;
          });
      })
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
    setProfileName(inp ? inp.value : "");   // trims, caches, and relabels the scene list
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
    // Its own line now, not a suffix to a "Cloud profile" label — the box title says that.
    // So it has to state both halves rather than only marking the signed-in one.
    if (who) who.textContent = inS
      ? "Signed in — your scenes can be saved here and picked up on another machine."
      : "Sign in to keep your scenes online and pick them up on another machine.";
    const pubBox = el("cloud-pub");
    if (pubBox) pubBox.checked = !!(cloudSess && cloudSess.pub);
    cloudNameShow();                     // signing in/out always lands back on the label
    cloudLinksRender();                  // the list only shows YOUR links, so it follows the session
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
    // straight away and the scene list's heading (already reading the same cache) agrees.
    const cached = storedProfileName();
    if (cached && el("cloud-name") && !el("cloud-name").value) el("cloud-name").value = cached;
    cloudNameShow();
    cloudSyncUI();
    if (cloudSess) cloudFetchProfileMeta();
    if (cloudSess) cloudLinksFetch();
    if (!CLOUD.clientId) { cloudMsg("Sign-in is not configured for this build.", true); return; }
    const s = document.createElement("script");
    s.src = GIS_SRC; s.async = true; s.defer = true;
    s.onload = () => {
      try {
        window.google.accounts.id.initialize({
          client_id: CLOUD.clientId,
          callback: res => {
            if (!res || !res.credential) return;
            cloudMsg("Signing in…");
            cloudSignIn(res.credential).catch(e => cloudMsg("Sign-in failed: " + e.message, true));
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
      } catch (e) { cloudMsg("Sign-in unavailable: " + e.message, true); }
    };
    s.onerror = () => cloudMsg("Could not reach Google sign-in.", true);
    document.head.appendChild(s);
  }

  if (el("cloud-save")) el("cloud-save").addEventListener("click", cloudSave);
  if (el("cloud-load")) el("cloud-load").addEventListener("click", cloudLoad);
  if (el("cloud-delete")) el("cloud-delete").addEventListener("click", cloudDelete);
  if (el("cloud-signout")) el("cloud-signout").addEventListener("click", cloudSignOut);
  if (el("cloud-pub")) el("cloud-pub").addEventListener("change", e => cloudPublish(e.target.checked));
  // Automatic save: paint the stored preference, and write it back on every change. Its own
  // key (see AUTOSAVE_KEY), so it never rides a scene, a share link or a backup.
  if (el("cloud-auto")) {
    el("cloud-auto").checked = autoSaveEnabled();
    el("cloud-auto").addEventListener("change", e => { autoSaveSetEnabled(e.target.checked); autoSaveSyncInfo(); });
    autoSaveSyncInfo();
  }
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
  // No #cloud-browse listener: the gallery is opened from the ☰ root item "Public scenes",
  // which calls galOpen(true) directly (see ui-menubar.js).
  if (el("gal-close")) el("gal-close").addEventListener("click", () => galOpen(false));
  if (el("gal-refresh")) el("gal-refresh").addEventListener("click", () => galOpen(true, true));
  if (el("gal-filter")) el("gal-filter").addEventListener("input", e => { galFilter = e.target.value; galPage = 0; galPaint(); });
  if (el("gal-prev")) el("gal-prev").addEventListener("click", () => { galPage--; galPaint(); });
  if (el("gal-next")) el("gal-next").addEventListener("click", () => { galPage++; galPaint(); });
  if (el("galdlg")) el("galdlg").addEventListener("click", e => { if (e.target === el("galdlg")) galOpen(false); });
  cloudInit();
