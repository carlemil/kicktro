  // ---- gallery THUMBNAILS rendered in a browser ------------------------------------------------
  // One harness, two hosts. tools/thumbs.js renders a scene in headless Edge; the gallery renders
  // a card that has NO thumbnail yet in a hidden, sandboxed copy of this very page, on the
  // visitor's GPU (there is none on the server). Both build the same page: this page's HTML with
  // thumbPrelude(cfg) run before the app, which
  //   - swaps localStorage/sessionStorage for in-memory ones seeded with the scene (a Restore's
  //     one-shot apply), so a render can never touch the visitor's library or session,
  //   - owns the rAF queue with a fixed 1/60 step and a xorshift Math.random, so frame N is the
  //     same picture on every run,
  //   - sets window.__ktThumb = cfg, which the app reads as THUMB (boot-globals.js): no cloud,
  //     no analytics, no front door, and a synthetic 120 BPM beat latched into every armed
  //     trigger (thumbBeat, from frame()), so a scene built around the music moves in it too.
  // thumbRun then plays frame 300 (the poster) and, for thumbs.js, frames 300..598 every other
  // frame (the clip), handing each out through cfg.sink: "console" (THUMB|kind|data lines on
  // stderr) or "parent" (postMessage). Frames are read IN THE SAME TASK as the draw; a WebGL
  // canvas cannot be read later. thumbPrelude must stay SELF-CONTAINED: it is shipped as its
  // own source text (thumbs.js slices it out of the built page by these two marker lines).
  function thumbPrelude(cfg) {
    var blob = cfg.blob;
    delete cfg.blob;
    function mem(seed) {
      var d = Object.create(null);
      for (var k in seed) d[k] = String(seed[k]);
      return {
        getItem: function (k) { k = String(k); return k in d ? d[k] : null; },
        setItem: function (k, v) { d[String(k)] = String(v); },
        removeItem: function (k) { delete d[String(k)]; },
        clear: function () { d = Object.create(null); },
        key: function (i) { return Object.keys(d)[i] || null; },
        get length() { return Object.keys(d).length; },
      };
    }
    var seed = Object.assign({}, blob, { curPreset: 0, cycle: false, tdur: [0, 0], panelOpen: false, audio: "off" });
    Object.defineProperty(window, "localStorage", { configurable: true, value: mem({
      "burnTheWeb.v1": JSON.stringify(seed),
      "burnTheWeb.tutorial.v1": "true",
      "burnTheWeb.credits.v1": "off",
      "burnTheWeb.sync.v1": JSON.stringify({ shows: 3, sinceLast: 0, used: true }),
    }) });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: mem({ "btw.applyPreset": "0" }) });
    cfg.errs = 0;
    addEventListener("error", function () { cfg.errs++; });
    var ce = console.error;
    console.error = function () { cfg.errs++; ce.apply(console, arguments); };
    var gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t) {
      var c = gc.apply(this, arguments);
      if (t === "webgl2" && c) cfg.gl = c;
      return c;
    };
    var st = 0x9E3779B9;
    Math.random = function () { st ^= st << 13; st ^= st >>> 17; st ^= st << 5; return ((st >>> 0) % 1000000) / 1000000; };
    var q = [], t = 1000;
    cfg.fno = 0;
    window.requestAnimationFrame = function (cb) { q.push(cb); return q.length; };
    window.cancelAnimationFrame = function () {};
    cfg.pump = function (n) {
      for (var i = 0; i < n; i++) { var cur = q; q = []; t += 1000 / 60; cfg.fno++; for (var j = 0; j < cur.length; j++) cur[j](t); }
    };
    cfg.out = cfg.sink === "parent"
      ? function (kind, data) { parent.postMessage({ kt: "thumb", kind: kind, data: data }, "*"); }
      : function (kind, data) { console.log("THUMB|" + kind + "|" + data); };
    window.__ktThumb = cfg;
  }
  // end thumbPrelude

  // The synthetic beat: low on the beat, mid on the backbeat, high on the eighths.
  function thumbBeat() {
    const n = THUMB.fno, hit = [n % 30 === 0, n % 60 === 30, n % 15 === 0];
    if (trigDirty) rebuildTriggers();
    for (let b = 0; b < 3; b++) {
      if (!hit[b]) continue;
      audio.beatNow[b] = true; audio.pulse[b] = 1;
      for (const tr of trigList) { tr.st.now[b] = true; tr.st.pulse[b] = 1; }
    }
  }
  // A shared world links asynchronously; it is waited for in REAL time before frames are
  // counted, or the frame the picture comes right on would depend on the driver's speed.
  function thumbWorldPending() {
    if (!worldProgs || !gl) return false;
    for (const k in worldProgs) {
      const e = worldProgs[k];
      if (e && e.pending && worldPar && !gl.getProgramParameter(e.p, worldPar.COMPLETION_STATUS_KHR)) return true;
    }
    return false;
  }
  const THUMB_W = 480, THUMB_H = 270, THUMB_POSTER = 300, THUMB_END = 600, THUMB_STEP = 2;
  function thumbRun() {
    const T = THUMB;
    const c2 = document.createElement("canvas");
    c2.width = THUMB_W; c2.height = THUMB_H;
    const g2 = c2.getContext("2d");
    g2.imageSmoothingQuality = "high";
    const shot = (type, q) => { g2.clearRect(0, 0, THUMB_W, THUMB_H); g2.drawImage(canvas, 0, 0, THUMB_W, THUMB_H); return c2.toDataURL(type, q); };
    const to = f => { if (T.fno < f) T.pump(f - T.fno); };
    document.body.classList.add("ui-hidden");
    T.pump(2);
    const t0 = Date.now();
    (function wait() {
      if (thumbWorldPending() && Date.now() - t0 < 240000) { setTimeout(wait, 200); return; }
      T.out("scene", ((el("scenenow") || {}).textContent || "").trim());
      let f = 0;
      (function warm() {
        f = Math.min(f + 30, THUMB_POSTER); to(f);
        if (f < THUMB_POSTER) { setTimeout(warm, 0); return; }
        T.out("poster", shot(T.type || "image/png", T.q));
        let i = 0;
        (function clip() {
          for (let k = 0; T.clip && k < 15 && THUMB_POSTER + i * THUMB_STEP < THUMB_END; k++, i++) {
            to(THUMB_POSTER + i * THUMB_STEP);
            T.out("f", i + "|" + shot("image/jpeg", 0.93));
          }
          if (T.clip && THUMB_POSTER + i * THUMB_STEP < THUMB_END) { setTimeout(clip, 0); return; }
          const done = () => T.out("done", T.errs + "|" + (T.gl ? T.gl.getError() : "nogl"));
          if (T.cost) thumbCost(done); else done();
        })();
      })();
    })();
  }
  // HOW HEAVY the scene is (cfg.cost, tools/thumbs.js only): THUMB_COST_N more frames, each
  // timed on the GPU (EXT_disjoint_timer_query_webgl2 around the whole frame) and on the CPU
  // (the point effects stamp there, and a GPU-only number calls them free). Out goes
  // "cost|<gpu ms>|<cpu ms>|<canvas WxH>", medians, gpu -1 without the timer. A DISJOINT
  // (the GPU was interrupted) spoils that frame's sample, which is dropped.
  const THUMB_COST_N = 180;
  function thumbCost(done) {
    const T = THUMB, g = T.gl, ext = g && g.getExtension("EXT_disjoint_timer_query_webgl2");
    const cpu = [], gpu = [], open = [];
    const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : -1; };
    let i = 0;
    (function run() {
      for (let k = 0; k < 10 && i < THUMB_COST_N; k++, i++) {
        const q = ext ? g.createQuery() : null;
        if (q) g.beginQuery(ext.TIME_ELAPSED_EXT, q);
        const t = performance.now();
        T.pump(1);
        cpu.push(performance.now() - t);
        if (q) { g.endQuery(ext.TIME_ELAPSED_EXT); open.push(q); }
      }
      if (i < THUMB_COST_N) { setTimeout(run, 0); return; }
      const t0 = Date.now();
      (function drain() {
        const dis = ext && g.getParameter(ext.GPU_DISJOINT_EXT);
        for (let j = open.length - 1; j >= 0; j--) {
          if (!g.getQueryParameter(open[j], g.QUERY_RESULT_AVAILABLE)) continue;
          if (!dis) gpu.push(g.getQueryParameter(open[j], g.QUERY_RESULT) / 1e6);
          g.deleteQuery(open[j]);
          open.splice(j, 1);
        }
        if (open.length && Date.now() - t0 < 10000) { setTimeout(drain, 20); return; }
        const r = x => Math.round(x * 1000) / 1000;
        T.out("cost", r(med(gpu)) + "|" + r(med(cpu)) + "|" + canvas.width + "x" + canvas.height);
        done();
      })();
    })();
  }
  if (THUMB) {
    if (window.__appReady) setTimeout(thumbRun, 0); else addEventListener("app:ready", thumbRun, { once: true });
  }

  // ---- the first visitor to scroll to a card with no thumbnail renders it ----------------------
  // Cards published since tools/thumbs.js --server last ran have none. Such a card's placeholder
  // queues a render when it comes into view (galImgObs): this page's HTML in a SANDBOXED srcdoc
  // iframe (scripts only, an opaque origin: it cannot reach this page, its storage or the API),
  // one at a time, at most GAL_RENDER_MAX per visit. The poster goes on the card at once and to
  // PUT /api/gallery/:id/thumb, so everyone after gets it. It is a poster only -- the server
  // keeps the card on the admin list and thumbs.js --server replaces it with a full render.
  // Not on a phone (a second copy of the app is a lot of memory there), not without WebGL2,
  // and never from inside such a copy.
  const GAL_RENDER_MAX = 6, GAL_RENDER_MS = 90000;
  const galRender = { q: [], busy: false, asked: new Set(), n: 0, html: null };
  function galRenderOk() {
    let touch = false;
    try { touch = matchMedia("(pointer: coarse)").matches; } catch (e) {}
    return !THUMB && useGL && !touch && cloudOn();
  }
  function galRenderWant(th) {
    const c = th.__card;
    if (!c || c.poster || c.at != null || c.live === false || galRender.asked.has(c.id)) return;
    if (!galRenderOk() || galRender.asked.size >= GAL_RENDER_MAX) return;
    galRender.asked.add(c.id);
    th.classList.add("gal-rendering");
    galRender.q.push(th);
    galRenderNext();
  }
  function galRenderNext() {
    if (galRender.busy || !galRender.q.length) return;
    const th = galRender.q.shift(), c = th.__card;
    galRender.busy = true;
    galRenderOne(c).then(url => {
      th.classList.remove("gal-rendering", "gal-ph");
      th.style.background = "";
      th.textContent = "";
      const img = document.createElement("img");
      img.alt = ""; img.src = url;
      th.appendChild(img);
      track("gallery_thumb_render", {});
      return galThumbUpload(c, url);
    }).catch(() => { th.classList.remove("gal-rendering"); }).then(() => {
      galRender.busy = false;
      galRenderNext();
    });
  }
  function galPageHtml() {
    if (!galRender.html) {
      galRender.html = fetch(location.pathname, { cache: "force-cache" })
        .then(r => r.ok ? r.text() : Promise.reject(new Error("page " + r.status)));
      galRender.html.catch(() => { galRender.html = null; });
    }
    return galRender.html;
  }
  // Resolves with the poster as a data: URL; rejects on a console error, a GL error or a timeout.
  function galRenderOne(c) {
    return Promise.all([galSceneOf(c), galPageHtml()]).then(([got, html]) => new Promise((res, rej) => {
      const cfg = { blob: got.blob, sink: "parent", type: "image/webp", q: 0.82, clip: false, beat: true };
      const pre = "<scr" + "ipt>(" + thumbPrelude + ")(" + JSON.stringify(cfg).replace(/</g, "\\u003c") + ");</scr" + "ipt>";
      // Split, not a literal: every browser check splits the built page on that tag.
      const tag = "<" + "head>", at = html.indexOf(tag);
      if (at < 0) { rej(new Error("no head tag")); return; }
      const fr = document.createElement("iframe");
      fr.setAttribute("sandbox", "allow-scripts");
      fr.setAttribute("aria-hidden", "true");
      fr.tabIndex = -1;
      fr.className = "thumb-frame";
      let poster = null;
      const end = (err) => {
        clearTimeout(timer);
        removeEventListener("message", onMsg);
        fr.remove();
        if (err) rej(err); else res(poster);
      };
      const timer = setTimeout(() => end(new Error("timed out")), GAL_RENDER_MS);
      function onMsg(e) {
        if (e.source !== fr.contentWindow || !e.data || e.data.kt !== "thumb") return;
        const d = e.data;
        if (d.kind === "poster" && typeof d.data === "string" && /^data:image\//.test(d.data)) poster = d.data;
        if (d.kind === "done") end(poster && d.data === "0|0" ? null : new Error("render failed: " + d.data));
      }
      addEventListener("message", onMsg);
      fr.srcdoc = html.slice(0, at + tag.length) + pre + html.slice(at + tag.length);
      document.body.appendChild(fr);
    }));
  }
  // A browser that cannot encode WebP (Safari) shows its render here and sends nothing.
  function galThumbUpload(c, url) {
    const m = /^data:image\/webp;base64,(.+)$/.exec(url);
    if (!m) return null;
    return fetch(API + "/api/gallery/" + encodeURIComponent(c.id) + "/thumb", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ poster: m[1] }),
    }).then(r => r.ok ? r.json() : null).then(d => {
      if (d && d.poster) { c.poster = d.poster; c.clip = null; }
    }).catch(() => {});
  }
