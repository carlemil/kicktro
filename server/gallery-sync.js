"use strict";
// EVERY SCENE OF YOUR OWN IS A GALLERY CARD. There is no private: the page pushes its library
// (PUT /api/me/gallery, signed in or under an anonymous account) and this file turns it into
// one card per scene; the one-time backfill runs the same code over every stored profile.
//
// An edit is not public for an hour (cfg.pendingMs). A changed scene waits in `pend`, stamped
// with the time of the edit (the scene's own `edited`, set by the page when its content
// changes); every further edit moves the stamp, so the hour restarts. Others keep seeing the
// last public version meanwhile, and `promote` swaps the pending one in once it is an hour old
// -- lazily, at the top of every gallery read, so no timer is needed.
//
// Not a card: a scene from somebody else (`collection`: a followed collection or "Shared with
// you"), and an untouched copy of a scene the app SHIPPED (server/stock.js, every first-visit
// library there has been) -- every profile carries those, and they are nobody's own work.
const zlib = require("node:zlib");
const crypto = require("node:crypto");
const { HttpError } = require("./http");
const STOCK = require("./stock");

const SID_RE = /^[A-Za-z0-9]{8,32}$/;
const META = new Set(["sid", "edited", "rotate", "collection"]);   // yours, not the scene's
const UNZIP_MAX = 10000000;                                       // CONFIG.maxUnzipBytes

function inflate(b64) {
  let json;
  try {
    json = zlib.inflateRawSync(Buffer.from(b64, "base64url"), { maxOutputLength: UNZIP_MAX }).toString("utf8");
  } catch (e) { throw new HttpError(400, "payload is not a deflated library"); }
  let lib;
  try { lib = JSON.parse(json); } catch (e) { throw new HttpError(400, "payload is not JSON"); }
  if (!lib || typeof lib !== "object" || !Array.isArray(lib.presets)) throw new HttpError(400, "payload has no scenes");
  return lib;
}
const deflate = obj => zlib.deflateRawSync(Buffer.from(JSON.stringify(obj))).toString("base64url");

// Key order does not make two scenes different: sort before hashing.
function canon(v) {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).filter(k => v[k] !== undefined).sort()
      .map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  }
  return JSON.stringify(v === undefined ? null : v);
}
function bare(p) {
  const o = {};
  for (const k of Object.keys(p)) if (!META.has(k)) o[k] = p[k];
  return o;
}
const hashOf = p => crypto.createHash("sha256").update(canon(bare(p))).digest("base64url");

// ---- stock scenes -------------------------------------------------------------------------
const near = (a, b) => a === b || (typeof a === "number" && typeof b === "number"
  && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)));
function same(a, b) {
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (a && typeof a === "object") return !!b && typeof b === "object" && Object.keys(a).every(k => same(a[k], b[k]));
  return near(a, b);
}
// Only the keys the shipped scene had: a later version adds controls (with neutral defaults)
// to every scene it saves, which is not an edit.
const sameState = (s, st) => Object.keys(s).every(k => same(s[k], st && st[k]));
const opt = (s, v) => s === undefined || same(s, v);
function matchesStock(s, p) {
  const ex = p.extra && typeof p.extra === "object" ? p.extra : {};
  const L = Array.isArray(p.layers) ? p.layers : [];
  if (s.name !== p.name || s.effect !== p.effect || s.layers.length !== L.length) return false;
  if (!sameState(s.state, p.state) || !opt(s.palette, ex.palette) || !opt(s.filters, ex.filters)) return false;
  return s.layers.every((sl, i) => L[i] && sl.effect === L[i].effect && sameState(sl.state, L[i].state)
    && opt(sl.palette, L[i].palette) && opt(sl.filters, L[i].filters));
}
const noFilters = f => !Array.isArray(f) || !f.length;
function isStock(p) {
  if (STOCK.scenes.some(s => matchesStock(s, p))) return true;
  // The old one-neutral-scene-per-effect library (and Blank canvas): named after its effect,
  // one layer, no filters. Moving a slider in one of those without adding a filter or layer
  // is not told apart -- it is the neutral starter, and stays out.
  const L = Array.isArray(p.layers) ? p.layers : [];
  const ex = p.extra && typeof p.extra === "object" ? p.extra : {};
  return STOCK.effects[p.name] === p.effect && L.length <= 1 && noFilters(ex.filters)
    && L.every(l => l && l.effect === p.effect && noFilters(l.filters));
}

// The custom ramps a scene names: the library's `palettes` entries whose id it mentions
// (palettesUsedBy on the page; built-in ids never match an entry, so need no list here).
function rampsFor(p, palettes) {
  if (!Array.isArray(palettes) || !palettes.length) return null;
  const want = new Set();
  const note = v => { if (typeof v === "string") want.add(v); };
  const ex = x => { if (x && typeof x === "object") note(x.palette); };
  ex(p.extra);
  if (p.extras && typeof p.extras === "object") for (const k in p.extras) ex(p.extras[k]);
  if (Array.isArray(p.layers)) p.layers.forEach(L => { if (L) note(L.palette); });
  const out = palettes.filter(d => d && typeof d === "object" && want.has(d.id));
  return out.length ? out : null;
}
// The card's payload: a one-scene library, the shape "Publish to gallery" posted.
function sceneBlob(p, palettes) {
  const wire = { presets: [bare(p)], curPreset: 0, cycle: false };
  const pal = rampsFor(p, palettes);
  if (pal) wire.palettes = pal;
  return deflate(wire);
}

function makeSync({ db, cfg, CAP, newId, clean }) {
  const H = cfg.pendingMs;
  const q = sql => db.prepare(sql);
  const S = {
    byKey: q("select * from gallery where owner = ? and skey = ?"),
    byName: q("select * from gallery where owner = ? and skey is null and name = ? order by created limit 1"),
    byNameKey: q("select * from gallery where owner = ? and skey = ?"),
    anyName: q("select id from gallery where owner = ? and (name = ? or pend_name = ?) limit 1"),
    setKey: q("update gallery set skey = ? where id = ?"),
    count: q("select count(*) n from gallery where owner = ?"),
    ins: q("insert into gallery (id, owner, name, payload, created, skey, pend, pend_name, pend_hash, pub_hash, edited, pub_at) "
      + "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"),
    pub: q("update gallery set name = ?, payload = ?, pub_hash = ?, pub_at = ?, edited = ?, gone = 0, "
      + "created = case when payload = '' then ? else created end, pend = null, pend_name = null, pend_hash = null where id = ?"),
    pend: q("update gallery set pend = ?, pend_name = ?, pend_hash = ?, edited = ?, gone = 0 where id = ?"),
    unpend: q("update gallery set pend = null, pend_name = null, pend_hash = null, gone = 0 where id = ?"),
    ungone: q("update gallery set gone = 0 where id = ?"),
    keyed: q("select id, skey from gallery where owner = ? and skey is not null and gone = 0"),
    hide: q("update gallery set gone = 1 where id = ?"),
    promote: q("update gallery set payload = pend, name = pend_name, pub_hash = pend_hash, pub_at = ?, "
      + "created = case when payload = '' then ? else created end, pend = null, pend_name = null, pend_hash = null "
      + "where pend is not null and edited <= ?"),
  };

  // Pending edits an hour old become what everyone sees.
  function promote(now = Date.now()) { S.promote.run(now, now, now - H); }

  // lib = a decoded library. opts.insertOnly: add missing cards, leave existing ones (the
  // backfill -- a stored profile can be older than what the page pushed since). opts.hide:
  // a keyed card whose scene is not in lib is hidden (a push carries the whole library).
  // Runs inside the caller's transaction.
  function sync(uid, lib, opts = {}, now = Date.now()) {
    const out = { added: 0, updated: 0, pending: 0, same: 0, stock: 0, theirs: 0, skipped: 0, stale: 0, hidden: 0, names: [] };
    const palettes = lib.palettes;
    const seen = new Set();
    let have = S.count.get(uid).n;
    for (const p of lib.presets) {
      if (!p || typeof p !== "object" || typeof p.name !== "string") { out.skipped++; continue; }
      if (typeof p.collection === "string" && p.collection) { out.theirs++; continue; }
      if (isStock(p)) { out.stock++; continue; }
      const name = clean(p.name).trim().slice(0, CAP.sceneName) || "Untitled";
      let key = typeof p.sid === "string" && SID_RE.test(p.sid) ? "s:" + p.sid : "n:" + name;
      for (let i = 2; seen.has(key); i++) key = key.replace(/#\d+$/, "") + "#" + i;
      seen.add(key);
      const blob = sceneBlob(p, palettes);
      if (blob.length >= CAP.scenePayload) { out.skipped++; continue; }
      const hash = hashOf(p);
      const stamp = Number.isFinite(p.edited) && p.edited > 0 ? Math.min(Math.round(p.edited), now) : 0;
      let row = S.byKey.get(uid, key);
      // A scene that gets its id (the page's first push) adopts the card the backfill made
      // for it by name, or one published by hand -- keeping its votes and thumbnail.
      if (!row && key.startsWith("s:")) row = S.byNameKey.get(uid, "n:" + name) || null;
      // A stored profile (no ids) whose scenes the page has pushed since: those cards carry
      // the page's keys now, and are the same scenes.
      if (!row && key.startsWith("n:") && S.anyName.get(uid, name, name)) { out.same++; continue; }
      if (!row) row = S.byName.get(uid, name) || null;
      if (row && row.skey !== key) { S.setKey.run(key, row.id); row.skey = key; }
      if (!row) {
        if (have >= CAP.galleryPerUser) { out.skipped++; continue; }
        const live = now - stamp >= H;
        S.ins.run(newId(), uid, name, live ? blob : "", now, key, live ? null : blob, live ? null : name,
          live ? null : hash, live ? hash : null, stamp, live ? now : 0);
        have++;
        out[live ? "added" : "pending"]++;
        out.names.push(name);
        continue;
      }
      if (opts.insertOnly) { out.same++; continue; }
      if (hash === row.pend_hash || (hash === row.pub_hash && !row.pend)) {
        if (row.gone) S.ungone.run(row.id);
        out.same++;
        continue;
      }
      if (hash === row.pub_hash) { S.unpend.run(row.id); out.same++; continue; }   // edited back
      if (stamp && stamp < row.edited) { out.stale++; continue; }   // an older copy (another device)
      const at = stamp || now;
      if (now - at >= H) { S.pub.run(name, blob, hash, now, at, now, row.id); out.updated++; }
      else { S.pend.run(blob, name, hash, at, row.id); out.pending++; }
    }
    if (opts.hide) {
      for (const r of S.keyed.all(uid)) if (!seen.has(r.skey)) { S.hide.run(r.id); out.hidden++; }
    }
    return out;
  }
  return { sync, promote, inflate };
}

module.exports = { makeSync, isStock, inflate, hashOf, SID_RE };
