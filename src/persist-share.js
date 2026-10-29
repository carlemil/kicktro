  // ---- share payload codec ------------------------------------------------------
  // The JSON is hugely repetitive (the same slider keys for every effect), so raw
  // deflate takes it down ~85% — measured 9400 → 1368 chars, which is what makes the
  // Short link work again. Emitted as `?z=` in base64url; `+` and `/` would each cost
  // three characters once percent-encoded, and `=` padding is pointless in a URL.
  // `?s=` (uncompressed) is still both emitted as a fallback and decoded forever, so
  // every link ever generated keeps working.
  // Function declarations, not consts: applyShared() runs during startup, far above
  // this block, and a const would still be in its temporal dead zone when the decode
  // reached for it — which the catch below would then report as a corrupt payload.
  function b64urlOut(b) { return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function b64urlIn(s) {             // atob rejects -/_ and needs the padding back
    let b = s.replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    return b;
  }
  function canZip() { return typeof CompressionStream === "function" && typeof Response === "function"; }
  async function zipToB64(str) {
    if (!canZip()) return null;
    try {
      const body = new Blob([new TextEncoder().encode(str)]).stream()
        .pipeThrough(new CompressionStream("deflate-raw"));
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return b64urlOut(btoa(bin));
    } catch (e) { return null; }
  }
  // Every deflated payload the app ever ingests (?z=, #zp=, cloud profile, #c= scene)
  // decompresses HERE, and deflate expands up to ~1032:1 — so an attacker-authored
  // payload that fits the server's payload size cap could still balloon to hundreds
  // of MB in this tab before validatePresetList ever sees it. Read the stream with a
  // byte budget instead of Response.arrayBuffer() (which has none); over budget ⇒
  // cancel and return null, the same answer as a corrupt payload.
  const UNZIP_MAX = CONFIG.maxUnzipBytes;
  async function unzipFromB64(str) {
    if (typeof DecompressionStream !== "function") return null;
    try {
      const bin = atob(b64urlIn(str));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const body = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      const reader = body.getReader();
      const chunks = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > UNZIP_MAX) { reader.cancel(); return null; }
        chunks.push(value);
      }
      const all = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { all.set(c, off); off += c.byteLength; }
      return new TextDecoder().decode(all);
    } catch (e) { return null; }
  }

  // Round every shared value to the granularity its own control declares. The DOM
  // sliders are step="any", so a dragged thumb carries a full-precision double like
  // 0.8234567901234568 — that more than doubles the payload (measured: 9.4k → 21.9k
  // chars) for precision no one can see, since every readout goes through sig3().
  // CONTROLS still carries a semantic `step` per key, which is range-aware in a way
  // a blanket "N significant digits" is not.
  const CTL_STEP = {};
  CONTROLS.forEach(c => { if (c.step) CTL_STEP[c.key] = c.step; });
  function roundShared(id, n) {
    const step = CTL_STEP[id] || 0.001;
    const dec = Math.max(0, Math.ceil(-Math.log10(step)));
    let r = +(+n).toFixed(dec);
    // Clamp to the LIVE bounds, not RNG_ORIG: custom ranges ride in the same blob
    // and applyBlob applies them first, so these are the bounds it will validate
    // against — and its ok() is a hard reject, so an out-of-range value would be
    // silently dropped back to the seeded default (fade's max of 0.995 is the case).
    const ref = ctl(id + "-lo") || ctl(id);
    if (ref) {
      const mn = +ref.min, mx = +ref.max;
      if (isFinite(mn) && r < mn) r = mn;
      if (isFinite(mx) && r > mx) r = mx;
    }
    return r;
  }
  const roundMap = m => {            // {key: [lo,hi] | scalar} → the same, rounded
    const out = {};
    for (const id in m) {
      const v = m[id];
      out[id] = Array.isArray(v) ? v.map(n => roundShared(id, n)) : roundShared(id, v);
    }
    return out;
  };

  // Build the share URL for the current scene — and ONLY that scene: the effect on
  // screen, not every effect you have ever touched. ("Build the share URL for the
  // current scene" is a slice marker for tools/shareprobe.js — keep that line.)
  // "Here is the thing I made" should send that thing; shipping fourteen other effects'
  // settings along with it was noise the recipient never asked for, and it was most of
  // the payload: a Tunnel scene went from 6808 to 661 chars of JSON.
  //
  // The map SHAPE is unchanged — `{ [effectIndex]: … }`, just with one entry — which is
  // the whole trick: no decoder change, and every old link with all fifteen still
  // decodes exactly as before. applyBlob skips keys a blob omits, and installShared
  // re-seeds every map first, so the effects that are absent land on their defaults
  // rather than inheriting whatever the recipient had.
  //
  // beatTune rides along now that it is scene data. `cycle` and `ttl` deliberately do
  // NOT: they are the recipient's own auto-cycle preferences, and sharing a scene is no
  // reason to reach in and change them. Same for resolution, which was never sent.
  // The live scene as a serialized blob. Split out of shareUrl so the cloud scene-share
  // (which stores this same payload on the API instead of in a URL) cannot drift from it —
  // one definition of "what a shared scene is", two transports.
  function sceneBlob() {
    saveLiveMaps(effect);             // fold the live DOM/singletons into the current effect's maps
    const only = m => ({ [effect]: m[effect] });
    const blob = {
      states: { [effect]: roundMap(states[effect]) },
      beats: pruneBeats(only(beatStates)),
      pulses: prunePulses(only(pulseStates)),
      plens: prunePlens(only(plenStates)),
      btunes: pruneBtunes(only(btuneStates)),
      extras: only(extras),
      effect,
      // No `sceneFx` — retired; old links carrying one still decode (migrateSceneFx).
      beatTune: collectBeatTune(),
      ranges: sceneRanges(),
    };
    // A stacked scene sends its whole stack; a single-effect one sends nothing extra and
    // the payload is byte-identical to what it has always been. The per-effect maps above
    // still describe item 0, so an OLD client opening a stacked link renders that item
    // rather than failing — a graceful degrade, not an error.
    const st = stackOut();
    if (st) blob.layers = st;
    const out = serializeBlob(blob);  // effect stored as a stable id
    // Who made it: the scene's ORIGINAL author when it is itself a copy, else you. The recipient
    // files it under "Shared with you" with this as its `origin`, so the banner keeps naming
    // the person who actually made it. Signed out with no profile name ⇒ no field at all.
    const by = (curPreset >= 0 && presets[curPreset] && originOf(presets[curPreset])) || myProfileName();
    if (by) out.author = by;
    // ...and any custom ramp this scene names, so the link carries its own colours.
    const pal = palettesUsedBy(out);
    if (pal) out.palettes = pal;
    return out;
  }
  async function shareUrl() {
    const json = JSON.stringify(sceneBlob());
    // dir = the app's folder, e.g. https://kicktro.com/ — the link goes
    // straight to it and the scene rides in the ?z= (or legacy ?s=) param.
    const dir = location.origin + location.pathname.replace(/[^/]*$/, "");
    const z = await zipToB64(json);
    return z ? dir + "?z=" + z
             : dir + "?s=" + btoa(unescape(encodeURIComponent(json)));   // no CompressionStream
  }

  // Build a PRESET-BUNDLE link: a curated set of presets (NOT the live scene), so you can
  // hand someone "a list of cool presets" in one URL. Same codec as shareUrl — serializeBlob
  // (effect indices → ids, exactly as Backup writes each preset) then deflate.
  //
  // The payload rides in the URL **FRAGMENT** (#zp= deflated / #sp= uncompressed), NOT the
  // query, and this is load-bearing: a bundle of presets is several KB, and a multi-KB
  // ?query makes GitHub Pages / Fastly reject the link with **414 URI Too Long** before any
  // JS runs. The fragment is never sent to the server, so a bundle of any size loads. It is
  // also DISTINCT from the scene link's ?z=/?s= so the two decode paths never collide.
  // `chosen` is a list of in-memory preset objects; their `layers` already carry effect ids
  // (stackItemOut), and serializeBlob converts each preset's top-level `effect`. Recipient
  // side: applyShared routes #zp=/#sp= into the Restore dialog (merge/replace).
  async function libraryUrl(chosen) {
    // Alongside the presets, carry the auto-cycle toggle and which preset is selected, so the
    // receiver opens on the same scene and the same show plays. curPreset is the index WITHIN
    // `chosen` (curation reindexes), omitted when the selected preset isn't in the bundle.
    const blob = { presets: chosen, cycle: cycleChk.checked };
    const selIdx = curPreset >= 0 ? chosen.indexOf(presets[curPreset]) : -1;
    if (selIdx >= 0) blob.curPreset = selIdx;
    const wire = serializeBlob(blob);
    const pal = palettesUsedBy(wire);
    if (pal) wire.palettes = pal;     // the bundle's scenes carry their own custom ramps
    const json = JSON.stringify(wire);
    const dir = location.origin + location.pathname.replace(/[^/]*$/, "");
    const z = await zipToB64(json);
    return z ? dir + "#zp=" + z
             : dir + "#sp=" + btoa(unescape(encodeURIComponent(json)));
  }

  // Copy `text`, flashing the button's label. Clipboard API needs a secure
  // context, so keep the execCommand fallback for file:// and plain http.
  // `text` may be a string or a Promise of one. Clipboard writes are gesture-bound,
  // and the share URL is now produced asynchronously — ClipboardItem takes the promise
  // directly, which keeps the gesture; a plain writeText after an await is rejected by
  // Safari. Everything else falls back to the old paths.
  function copyText(text, btn, okMsg, restore) {
    const done = okState => { btn.textContent = okState ? okMsg : "Copy failed"; setTimeout(() => btn.textContent = restore, 1400); };
    const p = Promise.resolve(text);
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      navigator.clipboard
        .write([new ClipboardItem({ "text/plain": p.then(t => new Blob([t], { type: "text/plain" })) })])
        .then(() => done(true), () => p.then(t => copyTextSync(t, btn, okMsg, restore)));
      return;
    }
    p.then(t => copyTextSync(t, btn, okMsg, restore));
  }
  function copyTextSync(text, btn, okMsg, restore) {
    const done = okState => { btn.textContent = okState ? okMsg : "Copy failed"; setTimeout(() => btn.textContent = restore, 1400); };
    const fallback = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(ta); ta.select();
        const okc = document.execCommand("copy"); document.body.removeChild(ta); done(okc);
      } catch (e) { done(false); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true), fallback);
    else fallback();
  }

  // POST a (long) URL to TinyURL and resolve the short URL it returns — the preset-bundle
  // dialog's "Copy short link" uses it. TinyURL is the pick because it 301s to the target
  // byte-for-byte (no interstitial, no injected params), sends CORS headers, needs no API
  // key, and doesn't block github.io the way is.gd does. POST (not GET) so a big bundle can't
  // hit a query-length ceiling; the form-urlencoded body keeps it a simple request, so there's
  // no preflight. The API reports failure with a 200 + an error string, so the response SHAPE
  // is validated, not the status.
  function shortenUrl(url) {
    return fetch("https://tinyurl.com/api-create.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "url=" + encodeURIComponent(url),
    })
      .then(r => (r.ok ? r.text() : Promise.reject(new Error("HTTP " + r.status))))
      .then(t => {
        const short = t.trim();
        if (!/^https?:\/\/tinyurl\.com\/\S+$/.test(short)) throw new Error(short);
        return short;
      });
  }

