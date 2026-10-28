#!/usr/bin/env node
"use strict";
// Gallery THUMBNAILS: a still poster and a short looping clip of a scene, rendered on this PC.
//
//   node tools/thumbs.js --builtin [--force] [--only slug,slug]
//       the AI-generated scenes shipped in the app: writes thumbs/<slug>.webp + .mp4 for every
//       one that has none yet, then re-runs 'node tools/ai-scenes.js --emit' and the build so
//       BUILTIN_SCENES carries the new hashes. Commit thumbs/ with them; pages.yml ships it.
//       Each also gets its COST measured into thumbs/costs.json (any built-in missing one is
//       measured too, render or not); --emit writes it into BUILTIN_SCENES.
//   node tools/thumbs.js --server [--all] [--api <base>] [--ssh <user@host>]
//       published gallery scenes with no thumbnail yet (--all: every one): fetched from
//       /api/admin/thumbs/todo, rendered, measured, uploaded with PUT /api/admin/thumbs/:id.
//       A card whose thumbnail is current but has no cost (render 0) is only measured.
//   node tools/thumbs.js --cost <slug,slug|all> [--size WxH]
//       measures built-ins and prints them, writing nothing.
//
// COST = how heavy a scene is to run: the larger of the median GPU time (a timer query around
// each frame) and the median CPU time of 180 frames, in ms, at 1920x1080 (COST_SIZE) on THIS
// machine, in its own Edge run with a cold shader cache. It only compares scenes with each
// other; the gallery's Weight slider (CONFIG.cloud.galleryWeights) cuts it into steps.
//   node tools/thumbs.js --check <slug>
//       renders one built-in TWICE and compares the frames: the harness must be deterministic,
//       or a re-render would change every thumbnail for nothing.
//
// Options: --page <file> (dev-index.html), --work <dir> (temp folder), --keep (keep it).
// The admin token comes from KICKTRO_ADMIN_TOKEN, else from /srv/kicktro/.env over ssh; it is
// never printed. No npm packages: headless Edge on the REAL GPU and the local ffmpeg.
//
// The harness is abshot's, kept in the app (src/gallery-thumbs.js): the page owns its rAF queue with a fixed 1/60 step and a stubbed
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
let COST_SIZE = "1920,1080";

const args = { only: null };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (["--builtin", "--server", "--all", "--force", "--keep", "--help"].includes(a)) args[a.slice(2)] = true;
  else if (["--check", "--cost", "--size", "--page", "--work", "--api", "--ssh", "--only"].includes(a) && i + 1 < process.argv.length) args[a.slice(2)] = process.argv[++i];
  else die("unexpected argument " + a);
}
if (args.size) COST_SIZE = args.size.replace("x", ",");
if (args.help || !(args.builtin || args.server || args.check || args.cost)) {
  console.log(fs.readFileSync(__filename, "utf8").split(NL).slice(2, 20).map(l => l.replace(/^\/\/ ?/, "")).join(NL));
  process.exit(args.help ? 0 : 2);
}
const PAGE = path.resolve(args.page || path.join(ROOT, "dev-index.html"));
const WORK = path.resolve(args.work || path.join(os.tmpdir(), "kicktro-thumbs"));
const API = (args.api || "https://api.kicktro.com").replace(/\/+$/, "");
const SSH = args.ssh || "deploy@136.148.210.49";
function die(msg) { console.error("thumbs: " + msg); process.exit(1); }

// ---- the page ----------------------------------------------------------------------------
// The harness lives IN THE APP (src/gallery-thumbs.js), because the gallery runs the same one in
// a visitor's browser: thumbPrelude(cfg) runs before the app (in-memory storage seeded with the
// scene, the owned rAF queue, the stubbed Math.random), the app reads it as THUMB (the synthetic
// beat, no cloud, no front door) and thumbRun plays the frames out through cfg.sink. Here the
// sink is the console. The prelude is sliced out of the built page by its marker lines, which
// must match exactly once, so a renamed marker fails loudly instead of rendering nothing.
const PRE_A = "  function thumbPrelude(cfg) {", PRE_B = "  // end thumbPrelude";
function pageFor(app, blob, beat, opt) {
  if (app.split(PRE_A).length !== 2 || app.split(PRE_B).length !== 2) die("thumbPrelude markers not found exactly once in the page");
  const pre = app.slice(app.indexOf(PRE_A), app.indexOf(PRE_B)).trim();
  const cfg = { blob, sink: "console", type: "image/png", clip: !(opt && opt.cost), cost: !!(opt && opt.cost), beat: beat !== false };
  const head = "(" + pre + ")(" + JSON.stringify(cfg).replace(/</g, "\\u003c") + ");";
  const at = app.indexOf("<head>");
  return app.slice(0, at + 6) + NL + "<script>" + head + "<" + "/script>" + app.slice(at + 6);
}

// ---- one render: Edge in REAL time (a shared world's async link needs it), killed on 'done'
// Edge 156 sends nothing to a redirected stderr and its launcher process exits while the browser
// keeps running, so the console is read from --log-file (polled, whole lines only) and the
// browser is found and killed by its user-data-dir, never by the launcher's pid.
function edgeKill(ud) {
  // every process of this render names its folder; the BROWSER (no --type=) goes first, or it
  // respawns the children killed before it, and the sweep repeats until nothing is left.
  // -EncodedCommand so no quote survives Windows argument quoting by accident
  const dir = path.dirname(ud).replace(/'/g, "''");
  const ps = "for ($i = 0; $i -lt 10; $i++) { "
    + "$p = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('" + dir + "') }); "
    + "if (-not $p.Count) { break }; "
    + "$p | Sort-Object { $_.CommandLine.Contains('--type=') } | "
    + "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 300 }";
  spawnSync("powershell", ["-NoProfile", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")], { stdio: "ignore" });
}
function edgeRun(htmlFile, ud, size) {
  const url = "file:///" + htmlFile.split(path.sep).join("/") + "?hideui&credits=0";
  const log = path.join(path.dirname(ud), "console.log");
  const argv = ["--headless=new", "--disable-extensions", "--enable-logging", "--log-file=" + log, "--v=0",
    "--window-size=" + (size || (W * 2) + "," + (H * 2)), "--no-first-run", "--user-data-dir=" + ud, url];
  return new Promise((resolve, reject) => {
    spawn(EDGE, argv, { stdio: "ignore" });
    const out = { scene: "", poster: null, frames: [], done: null };
    let pos = 0, finished = false;
    const timer = setTimeout(() => finish(new Error("timed out after 300 s")), 300000);
    const poll = setInterval(read, 250);
    function finish(err) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearInterval(poll);
      edgeKill(ud);
      if (err) reject(err); else resolve(out);
    }
    function read() {
      let fd, text;
      try { fd = fs.openSync(log, "r"); } catch (e) { return; }
      try {
        const size = fs.fstatSync(fd).size;
        if (size <= pos) return;
        const chunk = Buffer.alloc(size - pos);
        fs.readSync(fd, chunk, 0, chunk.length, pos);
        // up to the last whole line only: a half-written line (or UTF-8 character) waits a poll
        const end = chunk.lastIndexOf(10);
        if (end < 0) return;
        pos += end + 1;
        text = chunk.subarray(0, end).toString("utf8");
      } finally { fs.closeSync(fd); }
      for (const line of text.split(NL)) {
        const m = /"THUMB\|([^"]*)"/.exec(line);
        if (!m) continue;
        const f = m[1].split("|");
        if (f[0] === "scene") out.scene = f.slice(1).join("|");
        else if (f[0] === "poster") out.poster = b64(f[1]);
        else if (f[0] === "f") out.frames[+f[1]] = b64(f[2]);
        else if (f[0] === "cost") out.cost = { gpu: +f[1], cpu: +f[2], size: f[3] };
        else if (f[0] === "done") { out.done = { errs: +f[1], gl: f[2] }; finish(); return; }
      }
    }
  });
}

const b64 = u => Buffer.from(u.slice(u.indexOf(",") + 1), "base64");
function ffmpeg(argv) {
  const r = spawnSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", ...argv], { encoding: "utf8" });
  if (r.status !== 0) die("ffmpeg failed: " + (r.stderr || r.error));
}
const sha = b => crypto.createHash("sha1").update(b).digest("hex");
const kb = b => Math.round(b.length / 1024) + " KB";

async function render(blob, tag, beat) {
  const dir = path.join(WORK, tag.replace(/[^A-Za-z0-9_-]+/g, "_"));
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
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
  if (!args.keep) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  return res;
}

// How heavy a scene is: its own run at COST_SIZE (no clip), ms per frame on THIS machine.
async function measure(blob, tag) {
  const dir = path.join(WORK, tag.replace(/[^A-Za-z0-9_-]+/g, "_") + "-cost");
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  fs.mkdirSync(dir, { recursive: true });
  const html = path.join(dir, "page.html");
  fs.writeFileSync(html, pageFor(fs.readFileSync(PAGE, "utf8"), blob, true, { cost: true }));
  const r = await edgeRun(html, path.join(dir, "ud"), COST_SIZE);
  if (!r.cost) die(tag + ": the render reported no cost");
  if (!args.keep) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  return r.cost;
}
const costOf = c => Math.round(Math.max(c.gpu, c.cpu) * 1000) / 1000;

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
    // reached a trigger (thumbBeat no longer reaching the triggers).
    const off = await render(b.blob, b.slug + "-nobeat", false);
    const moved = off.framesHash !== a.framesHash;
    console.log((moved ? "PASS" : "FAIL") + "  the synthetic beat " + (moved ? "changes" : "does NOT change") + " the frames");
    process.exit(same && moved ? 0 : 1);
  }
  if (args.cost) {
    const want = args.cost === "all" ? null : new Set(args.cost.split(",").map(s => s.trim().replace(/^builtin:/, "")));
    for (const b of builtins()) {
      if (want && !want.has(b.slug)) continue;
      const c = await measure(b.blob, b.slug);
      console.log("  " + b.slug.padEnd(24) + " gpu " + c.gpu.toFixed(3).padStart(8) + " ms  cpu " + c.cpu.toFixed(3).padStart(8) + " ms  " + c.size);
    }
  }
  if (args.builtin) {
    const only = args.only ? new Set(args.only.split(",").map(s => s.trim().replace(/^builtin:/, ""))) : null;
    const dir = path.join(ROOT, "thumbs");
    fs.mkdirSync(dir, { recursive: true });
    const costFile = path.join(dir, "costs.json");
    const costs = fs.existsSync(costFile) ? JSON.parse(fs.readFileSync(costFile, "utf8")) : {};
    let made = 0, measured = 0;
    const list = builtins();
    for (const b of list) {
      if (only && !only.has(b.slug)) continue;
      const files = ["webp", "mp4"].map(x => path.join(dir, b.slug + "." + x));
      const draw = args.force || !files.every(f => fs.existsSync(f));
      if (draw) {
        const r = await render(b.blob, b.slug);
        fs.writeFileSync(files[0], r.poster);
        fs.writeFileSync(files[1], r.clip);
        made++;
      }
      if (draw || costs[b.slug] == null) {
        costs[b.slug] = costOf(await measure(b.blob, b.slug));
        console.log("    cost " + b.slug + " " + costs[b.slug] + " ms");
        measured++;
      }
    }
    // Only the scenes that still exist, in BUILTIN_SCENES order, so a diff reads as a list.
    const keep = {};
    for (const b of list) if (costs[b.slug] != null) keep[b.slug] = costs[b.slug];
    fs.writeFileSync(costFile, JSON.stringify(keep, null, 2) + "\n");
    console.log(made + " built-in thumbnail(s) rendered, " + measured + " measured");
    if (made || measured) {
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
    console.log(items.length + " gallery scene(s) to render or measure");
    let bad = 0;
    for (const it of items) {
      let blob;
      try { blob = JSON.parse(zlib.inflateRawSync(Buffer.from(it.payload, "base64url")).toString("utf8")); }
      catch (e) { console.log("  ! " + it.id + ": payload does not decode, skipped"); bad++; continue; }
      // render 0 = the thumbnail is current, only its cost is missing (an API from before
      // costs sends no flag: render it)
      const draw = it.render !== 0;
      const res = draw ? await render(blob, it.id) : null;
      const cost = costOf(await measure(blob, it.id));
      const put = await fetch(API + "/api/admin/thumbs/" + encodeURIComponent(it.id), {
        method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, hdr),
        body: JSON.stringify(draw ? { poster: res.poster.toString("base64"), clip: res.clip.toString("base64"), cost } : { cost }) });
      if (!put.ok) { console.log("  ! " + it.id + ": PUT -> " + put.status + " " + (await put.text()).slice(0, 200)); bad++; continue; }
      console.log("    " + (draw ? "uploaded " : "measured ") + it.id + " v" + (await put.json()).thumb_ver + ", " + cost + " ms");
    }
    if (bad) die(bad + " scene(s) failed");
  }
})().catch(e => die(e.stack || e.message));
