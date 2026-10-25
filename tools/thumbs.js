#!/usr/bin/env node
"use strict";
// Gallery THUMBNAILS: a still poster and a short looping clip of a scene, rendered on this PC.
//
//   node tools/thumbs.js --builtin [--force] [--only slug,slug]
//       the AI-generated scenes shipped in the app: writes thumbs/<slug>.webp + .mp4 for every
//       one that has none yet, then re-runs 'node tools/ai-scenes.js --emit' and the build so
//       BUILTIN_SCENES carries the new hashes. Commit thumbs/ with them; pages.yml ships it.
//   node tools/thumbs.js --server [--all] [--api <base>] [--ssh <user@host>]
//       published gallery scenes with no thumbnail yet (--all: every one): fetched from
//       /api/admin/thumbs/todo, rendered, uploaded with PUT /api/admin/thumbs/:id.
//   node tools/thumbs.js --check <slug>
//       renders one built-in TWICE and compares the frames: the harness must be deterministic,
//       or a re-render would change every thumbnail for nothing.
//
// Options: --page <file> (dev-index.html), --work <dir> (temp folder), --keep (keep it).
// The admin token comes from KICKTRO_ADMIN_TOKEN, else from /srv/kicktro/.env over ssh; it is
// never printed. No npm packages: headless Edge on the REAL GPU and the local ffmpeg.
//
// The harness is abshot's: the page owns its rAF queue with a fixed 1/60 step and a stubbed
// Math.random, so frame N is the same picture on every run. Poster = frame 300 (5 s in); clip =
// frames 300..598 every other frame, i.e. 5 s at 30 fps. A synthetic 120 BPM beat (low on the
// beat, mid on the backbeat, high on the eighths) is latched into every armed trigger, so a
// scene built around the music moves in its thumbnail too. Frames leave the page as base64 on
// the console, captured IN THE SAME TASK as the draw (a WebGL canvas cannot be read later).
// No backtick anywhere in the injected source; arrays are joined by an explicit newline.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const NL = String.fromCharCode(10);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const FFMPEG = process.env.FFMPEG || "C:/Program Files/ImageMagick-7.1.0-Q16-HDRI/ffmpeg.exe";
const W = 480, H = 270, POSTER = 300, CLIP_END = 600, STEP = 2;

const args = { only: null };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (["--builtin", "--server", "--all", "--force", "--keep", "--help"].includes(a)) args[a.slice(2)] = true;
  else if (["--check", "--page", "--work", "--api", "--ssh", "--only"].includes(a) && i + 1 < process.argv.length) args[a.slice(2)] = process.argv[++i];
  else die("unexpected argument " + a);
}
if (args.help || !(args.builtin || args.server || args.check)) {
  console.log(fs.readFileSync(__filename, "utf8").split(NL).slice(2, 20).map(l => l.replace(/^\/\/ ?/, "")).join(NL));
  process.exit(args.help ? 0 : 2);
}
const PAGE = path.resolve(args.page || path.join(ROOT, "dev-index.html"));
const WORK = path.resolve(args.work || path.join(os.tmpdir(), "kicktro-thumbs"));
const API = (args.api || "https://api.kicktro.com").replace(/\/+$/, "");
const SSH = args.ssh || "deploy@136.148.210.49";
function die(msg) { console.error("thumbs: " + msg); process.exit(1); }

// ---- the page --------------------------------------------------------------------------
// Three one-line splices, each asserted to match exactly once so a renamed line fails loudly
// instead of silently rendering a scene with no beat.
const SPLICES = [
  // armed sliders react only while audio reaches the visual; the synthetic beat stands in
  ["  const audioLive = () => audio.on && !audio.muted;",
   "  const audioLive = () => !!window.__beatOn || (audio.on && !audio.muted);"],
  // latch this frame's beats into every armed trigger, just before updateAnims reads them
  ["    updateAnims(now, dt);             // drive the ranged sliders' erratic values",
   "    if (window.__beatFn) window.__beatFn(audio, function(){ if (trigDirty) rebuildTriggers(); return trigList; });" + NL
   + "    updateAnims(now, dt);             // drive the ranged sliders' erratic values"],
  // a shared world links asynchronously; wait for it in REAL time before frames are counted,
  // or the frame the picture comes right on would depend on the driver's speed
  ["  function closeFilterPicker() {",
   "  window.__worldPending = function(){ if (!worldProgs || !gl) return false; for (var k in worldProgs) { var e = worldProgs[k];"
   + " if (e && e.pending && worldPar && !gl.getProgramParameter(e.p, worldPar.COMPLETION_STATUS_KHR)) return true; } return false; };" + NL
   + "  function closeFilterPicker() {"],
];

function pageFor(app, blob, beat) {
  // The scene arrives the way a Restore does: the library in burnTheWeb.v1 and the one-shot
  // index that makes startup APPLY it (curPreset alone only selects).
  const seed = Object.assign({}, blob, { curPreset: 0, cycle: false, tdur: [0, 0], panelOpen: false, audio: "off" });
  const head = [
    "(function(){",
    "  try {",
    "    localStorage.clear();",
    "    localStorage.setItem('burnTheWeb.v1', " + JSON.stringify(JSON.stringify(seed)) + ");",
    "    localStorage.setItem('burnTheWeb.tutorial.v1', 'true');",
    "    localStorage.setItem('burnTheWeb.credits.v1', 'off');",
    "    localStorage.setItem('burnTheWeb.sync.v1', JSON.stringify({ shows: 3, sinceLast: 0, used: true }));",
    "    sessionStorage.setItem('btw.applyPreset', '0');",
    "  } catch (e) {}",
    "  window.__errs = 0;",
    "  addEventListener('error', function(){ window.__errs++; });",
    "  var ce = console.error; console.error = function(){ window.__errs++; ce.apply(console, arguments); };",
    "  var gc = HTMLCanvasElement.prototype.getContext;",
    "  HTMLCanvasElement.prototype.getContext = function(t){ var c = gc.apply(this, arguments); if (t === 'webgl2' && c) window.__gl = c; return c; };",
    "  var st = 0x9E3779B9;",
    "  Math.random = function(){ st ^= st << 13; st ^= st >>> 17; st ^= st << 5; return ((st >>> 0) % 1000000) / 1000000; };",
    "  var q = [], t = 1000;",
    "  window.__fno = 0;",
    "  window.requestAnimationFrame = function(cb){ q.push(cb); return q.length; };",
    "  window.cancelAnimationFrame = function(){};",
    "  window.__pump = function(n){",
    "    for (var i = 0; i < n; i++){ var cur = q; q = []; t += 1000 / 60; window.__fno++; for (var j = 0; j < cur.length; j++) cur[j](t); }",
    "  };",
    "  window.__beatOn = " + (beat !== false) + ";",
    "  window.__beatFn = !window.__beatOn ? null : function(audio, list){",
    "    var n = window.__fno, hit = [n % 30 === 0, n % 60 === 30, n % 15 === 0];",
    "    var ts = list();",
    "    for (var b = 0; b < 3; b++){ if (!hit[b]) continue; audio.beatNow[b] = true; audio.pulse[b] = 1;",
    "      for (var i = 0; i < ts.length; i++){ ts[i].st.now[b] = true; ts[i].st.pulse[b] = 1; } }",
    "  };",
    "})();",
  ].join(NL);
  const body = [
    "(function(){",
    "  var W = " + W + ", H = " + H + ";",
    "  function log(s){ console.log('THUMB|' + s); }",
    "  var c2 = document.createElement('canvas'); c2.width = W; c2.height = H;",
    "  var g2 = c2.getContext('2d'); g2.imageSmoothingQuality = 'high';",
    "  function shot(type, q){ g2.clearRect(0, 0, W, H); g2.drawImage(document.getElementById('fire'), 0, 0, W, H); return c2.toDataURL(type, q).split(',')[1]; }",
    "  function to(f){ if (window.__fno < f) window.__pump(f - window.__fno); }",
    "  function go(){",
    "    document.body.classList.add('ui-hidden');",
    "    window.__pump(2);",
    "    var t0 = Date.now();",
    "    (function wait(){",
    "      if (window.__worldPending() && Date.now() - t0 < 240000){ setTimeout(wait, 200); return; }",
    "      log('scene|' + ((document.getElementById('scenenow') || {}).textContent || '').trim());",
    "      var f = 0;",
    "      (function warm(){",
    "        f = Math.min(f + 30, " + POSTER + "); to(f);",
    "        if (f < " + POSTER + "){ setTimeout(warm, 0); return; }",
    "        log('poster|' + shot('image/png'));",
    "        var i = 0;",
    "        (function clip(){",
    "          for (var k = 0; k < 15 && " + POSTER + " + i * " + STEP + " < " + CLIP_END + "; k++, i++){",
    "            to(" + POSTER + " + i * " + STEP + ");",
    "            log('f|' + i + '|' + shot('image/jpeg', 0.93));",
    "          }",
    "          if (" + POSTER + " + i * " + STEP + " < " + CLIP_END + "){ setTimeout(clip, 0); return; }",
    "          log('done|' + window.__errs + '|' + (window.__gl ? window.__gl.getError() : 'nogl'));",
    "        })();",
    "      })();",
    "    })();",
    "  }",
    "  if (window.__appReady) go(); else addEventListener('app:ready', go, { once: true });",
    "})();",
  ].join(NL);
  let s = app;
  for (const [from, to] of SPLICES) {
    if (s.split(from).length - 1 !== 1) die("splice did not match exactly once: " + from.trim());
    s = s.split(from).join(to);
  }
  s = s.split("<head>").join("<head>" + NL + "<script>" + head + "<" + "/script>");
  s = s.split("</body>").join("<script>" + body + "<" + "/script>" + NL + "</body>");
  return s;
}

// ---- one render: Edge in REAL time (a shared world's async link needs it), killed on 'done'
function edgeRun(htmlFile, ud) {
  const url = "file:///" + htmlFile.split(path.sep).join("/") + "?hideui&credits=0";
  const argv = ["--headless=new", "--disable-extensions", "--enable-logging=stderr", "--v=0",
    "--window-size=" + (W * 2) + "," + (H * 2), "--no-first-run", "--user-data-dir=" + ud, url];
  return new Promise((resolve, reject) => {
    const p = spawn(EDGE, argv, { stdio: ["ignore", "ignore", "pipe"] });
    const out = { scene: "", poster: null, frames: [], done: null };
    let buf = "", finished = false;
    const kill = () => { spawnSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], { stdio: "ignore" }); };
    const timer = setTimeout(() => finish(new Error("timed out after 300 s")), 300000);
    function finish(err) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      kill();
      if (err) reject(err); else resolve(out);
    }
    p.stderr.on("data", d => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        const m = /"THUMB\|([^"]*)"/.exec(line);
        if (!m) continue;
        const f = m[1].split("|");
        if (f[0] === "scene") out.scene = f.slice(1).join("|");
        else if (f[0] === "poster") out.poster = Buffer.from(f[1], "base64");
        else if (f[0] === "f") out.frames[+f[1]] = Buffer.from(f[2], "base64");
        else if (f[0] === "done") { out.done = { errs: +f[1], gl: f[2] }; finish(); }
      }
    });
    p.on("exit", () => finish(new Error("Edge exited before the render finished")));
  });
}

function ffmpeg(argv) {
  const r = spawnSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", ...argv], { encoding: "utf8" });
  if (r.status !== 0) die("ffmpeg failed: " + (r.stderr || r.error));
}
const sha = b => crypto.createHash("sha1").update(b).digest("hex");
const kb = b => Math.round(b.length / 1024) + " KB";

async function render(blob, tag, beat) {
  const dir = path.join(WORK, tag.replace(/[^A-Za-z0-9_-]+/g, "_"));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "frames"), { recursive: true });
  const html = path.join(dir, "page.html");
  fs.writeFileSync(html, pageFor(fs.readFileSync(PAGE, "utf8"), blob, beat));
  const t0 = Date.now();
  const r = await edgeRun(html, path.join(dir, "ud"));
  const want = (CLIP_END - POSTER) / STEP, got = r.frames.filter(Boolean).length;
  if (!r.poster || got !== want) die(tag + ": got " + got + " of " + want + " frames");
  if (r.done.errs) console.log("  ! " + tag + ": " + r.done.errs + " console error(s) during the render");
  if (r.done.gl !== "0") console.log("  ! " + tag + ": gl.getError() = " + r.done.gl);
  fs.writeFileSync(path.join(dir, "poster.png"), r.poster);
  r.frames.forEach((b, i) => fs.writeFileSync(path.join(dir, "frames", "f" + String(i).padStart(3, "0") + ".jpg"), b));
  ffmpeg(["-i", path.join(dir, "poster.png"), "-c:v", "libwebp", "-quality", "82", "-compression_level", "6",
    path.join(dir, "poster.webp")]);
  ffmpeg(["-framerate", "30", "-i", path.join(dir, "frames", "f%03d.jpg"), "-c:v", "libx264", "-preset", "slow",
    // CRF for the calm scenes, a bitrate CAP for the noisy ones (glitch, contour, truchet ran
    // past 1 MB at CRF alone): 640 kbit/s keeps a 5 s clip under ~400 KB.
    "-crf", "26", "-maxrate", "640k", "-bufsize", "1280k",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", path.join(dir, "clip.mp4")]);
  const res = {
    scene: r.scene,
    poster: fs.readFileSync(path.join(dir, "poster.webp")),
    clip: fs.readFileSync(path.join(dir, "clip.mp4")),
    posterHash: sha(r.poster), framesHash: sha(Buffer.concat(r.frames)),
  };
  console.log("  " + tag + "  (" + r.scene + ")  poster " + kb(res.poster) + ", clip " + kb(res.clip)
    + ", " + ((Date.now() - t0) / 1000).toFixed(1) + " s");
  if (!args.keep) fs.rmSync(dir, { recursive: true, force: true });
  return res;
}

// ---- the built-in scenes: read from the generated source, the same blob the app ships ----
function builtins() {
  const src = fs.readFileSync(path.join(ROOT, "src", "gallery-builtin.js"), "utf8");
  const payload = /payload: "([^"]+)"/.exec(src);
  if (!payload) die("no payload in src/gallery-builtin.js");
  const lib = JSON.parse(zlib.inflateRawSync(Buffer.from(payload[1], "base64url")).toString("utf8"));
  const out = [];
  for (const m of src.matchAll(/\{ id: "builtin:([^"]+)", name: ("[^"]*"), at: (\d+)/g)) {
    const at = +m[3];
    out.push({ slug: m[1], name: JSON.parse(m[2]),
      blob: { presets: [lib.presets[at]], palettes: lib.palettes || [], curPreset: 0, cycle: false } });
  }
  if (!out.length) die("no BUILTIN_SCENES in src/gallery-builtin.js");
  return out;
}

function adminToken() {
  if (process.env.KICKTRO_ADMIN_TOKEN) return process.env.KICKTRO_ADMIN_TOKEN.trim();
  const r = spawnSync("ssh", [SSH, "sed -n 's/^ADMIN_TOKEN=//p' /srv/kicktro/.env"], { encoding: "utf8" });
  const t = (r.stdout || "").trim();
  if (r.status !== 0 || t.length < 24) die("could not read ADMIN_TOKEN over ssh from " + SSH + " (set KICKTRO_ADMIN_TOKEN instead)");
  return t;
}

(async () => {
  if (!fs.existsSync(EDGE)) die("Edge not found at " + EDGE);
  if (!fs.existsSync(FFMPEG)) die("ffmpeg not found at " + FFMPEG + " (set FFMPEG)");
  fs.mkdirSync(WORK, { recursive: true });
  if (args.check) {
    const b = builtins().find(x => x.slug === args.check.replace(/^builtin:/, ""));
    if (!b) die("no built-in scene " + args.check);
    const a = await render(b.blob, b.slug + "-a"), c = await render(b.blob, b.slug + "-b");
    const same = a.posterHash === c.posterHash && a.framesHash === c.framesHash;
    console.log((same ? "PASS" : "FAIL") + "  two renders of " + b.slug + " are " + (same ? "identical" : "DIFFERENT")
      + "  (poster " + (a.posterHash === c.posterHash ? "same" : "differs")
      + ", frames " + (a.framesHash === c.framesHash ? "same" : "differ") + ")");
    // The negative control: with the synthetic beat off, a scene with armed sliders must come
    // out different. Every AI scene arms some, so identical frames here mean the beat never
    // reached a trigger (a splice that matched but stopped doing anything).
    const off = await render(b.blob, b.slug + "-nobeat", false);
    const moved = off.framesHash !== a.framesHash;
    console.log((moved ? "PASS" : "FAIL") + "  the synthetic beat " + (moved ? "changes" : "does NOT change") + " the frames");
    process.exit(same && moved ? 0 : 1);
  }
  if (args.builtin) {
    const only = args.only ? new Set(args.only.split(",").map(s => s.trim().replace(/^builtin:/, ""))) : null;
    const dir = path.join(ROOT, "thumbs");
    fs.mkdirSync(dir, { recursive: true });
    let made = 0;
    for (const b of builtins()) {
      if (only && !only.has(b.slug)) continue;
      const files = ["webp", "mp4"].map(x => path.join(dir, b.slug + "." + x));
      if (!args.force && files.every(f => fs.existsSync(f))) continue;
      const r = await render(b.blob, b.slug);
      fs.writeFileSync(files[0], r.poster);
      fs.writeFileSync(files[1], r.clip);
      made++;
    }
    console.log(made + " built-in thumbnail(s) rendered");
    if (made) {
      for (const a of [["tools/ai-scenes.js", "--emit"], ["tools/build.js"]]) {
        const r = spawnSync(process.execPath, a, { cwd: ROOT, stdio: "inherit" });
        if (r.status !== 0) die(a.join(" ") + " failed");
      }
    }
  }
  if (args.server) {
    const hdr = { Authorization: "Bearer " + adminToken() };
    const r = await fetch(API + "/api/admin/thumbs/todo" + (args.all ? "?all=1" : ""), { headers: hdr });
    if (!r.ok) die("GET todo -> " + r.status + " " + (await r.text()).slice(0, 200));
    const { items } = await r.json();
    console.log(items.length + " gallery scene(s) to render");
    let bad = 0;
    for (const it of items) {
      let blob;
      try { blob = JSON.parse(zlib.inflateRawSync(Buffer.from(it.payload, "base64url")).toString("utf8")); }
      catch (e) { console.log("  ! " + it.id + ": payload does not decode, skipped"); bad++; continue; }
      const res = await render(blob, it.id);
      const put = await fetch(API + "/api/admin/thumbs/" + encodeURIComponent(it.id), {
        method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, hdr),
        body: JSON.stringify({ poster: res.poster.toString("base64"), clip: res.clip.toString("base64") }) });
      if (!put.ok) { console.log("  ! " + it.id + ": PUT -> " + put.status + " " + (await put.text()).slice(0, 200)); bad++; continue; }
      console.log("    uploaded " + it.id + " v" + (await put.json()).thumb_ver);
    }
    if (bad) die(bad + " scene(s) failed");
  }
})().catch(e => die(e.stack || e.message));
