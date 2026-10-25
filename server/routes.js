"use strict";
// Every endpoint. The caps here are the ones firestore.rules used to enforce (that file was the
// whole authorization boundary on Firebase); this file is now. Keep them in step with the
// client's own checks in src/cloud-profile.js and CONFIG.cloud.maxPayload.
const fs = require("node:fs");
const path = require("node:path");
const { HttpError, readJson, sendJson } = require("./http");
const { tx } = require("./db");
const { newId, secretEqual, AuthError } = require("./auth");

const CAP = {
  profileName: 40,
  profilePayload: 300000,   // exclusive, as in firestore.rules
  profileCount: 500,
  sceneName: 60,
  scenePayload: 200000,     // exclusive: share links AND gallery scenes
  sharesPerUser: 1000,
  galleryPerUser: 200,
  favsPerUser: 5000,
  poster: 1 << 20,          // 1 MB
  clip: 6 << 20,            // 6 MB
};
const BODY = {
  small: 16 << 10,
  profile: 400 << 10,
  scene: 300 << 10,
  thumbs: 12 << 20,
  import: 32 << 20,
};
const LIMIT = {   // [max, windowMs]
  ip: [600, 60000],
  auth: [30, 600000],
  write: [60, 60000],
  share: [30, 3600000],
  publish: [20, 86400000],
  fav: [300, 3600000],
};

const ID_RE = /^[A-Za-z0-9]{10,40}$/;
const UID_RE = /^[A-Za-z0-9_-]{6,128}$/;
const B64_RE = /^[A-Za-z0-9_\-+/]+={0,2}$/;
const BUILTIN_RE = /^builtin:[a-z0-9-]{1,40}$/;
const THUMB_RE = /^([A-Za-z0-9]{10,40})-(\d{1,9})\.(webp|mp4)$/;

// ---- validation --------------------------------------------------------------------------
const clean = s => s.replace(/[\u0000-\u001f\u007f]/g, "");
function vName(v, max, field) {
  if (typeof v !== "string") throw new HttpError(400, field + " must be a string");
  const s = clean(v);
  if (s.length > max) throw new HttpError(400, field + " is longer than " + max + " characters");
  return s;
}
function vPayload(v, max) {
  if (typeof v !== "string" || !v.length) throw new HttpError(400, "payload must be a non-empty string");
  if (v.length >= max) throw new HttpError(400, "payload is too large (limit " + max + " characters)");
  if (!B64_RE.test(v)) throw new HttpError(400, "payload must be base64");
  return v;
}
// The Firestore rules' hasOnly(): a body may carry the known fields and nothing else.
function onlyKeys(body, keys) {
  for (const k of Object.keys(body)) {
    if (!keys.includes(k)) throw new HttpError(400, "unknown field: " + k);
  }
}
function vInt(v, lo, hi, field) {
  if (!Number.isInteger(v) || v < lo || v > hi) throw new HttpError(400, field + " must be an integer " + lo + "-" + hi);
  return v;
}
// A time from an import: milliseconds, or an ISO string (Firestore timestamps arrive as ISO).
function vTime(v) {
  const t = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(t) && t > 0 ? Math.round(t) : Date.now();
}

function thumbUrls(id, ver) {
  return ver > 0 ? { poster: "/thumbs/" + id + "-" + ver + ".webp", clip: "/thumbs/" + id + "-" + ver + ".mp4" }
    : { poster: null, clip: null };
}

function makeRoutes(ctx) {
  const { db, cfg, verifyGoogle, sessions, limiter } = ctx;
  const q = sql => db.prepare(sql);

  // ---- prepared statements -------------------------------------------------------------
  const S = {
    userBySub: q("select * from users where google_sub = ?"),
    userByUid: q("select * from users where uid = ?"),
    userByAny: q("select * from users where uid = ? or firebase_uid = ?"),
    userByFb: q("select * from users where firebase_uid = ?"),
    userIns: q("insert into users (uid, google_sub, firebase_uid, name, created) values (?, ?, ?, ?, ?)"),
    userName: q("update users set name = ? where uid = ?"),
    userBump: q("update users set token_ver = token_ver + 1 where uid = ?"),
    userDel: q("delete from users where uid = ?"),
    userLinkFb: q("update users set firebase_uid = ? where uid = ? and firebase_uid is null"),

    profGet: q("select * from profiles where uid = ?"),
    profPut: q("insert into profiles (uid, name, payload, count, pub, updated) values (?, ?, ?, ?, ?, ?) "
      + "on conflict(uid) do update set name = excluded.name, payload = excluded.payload, "
      + "count = excluded.count, pub = excluded.pub, updated = excluded.updated"),
    // The import's write: a newer copy replaces an older one, never the other way round, so a
    // second export (taken after the first) refreshes what changed and leaves a library the
    // user has since saved through the API alone (its `updated` is later than any Firestore one).
    profImp: q("insert into profiles (uid, name, payload, count, pub, updated) values (?, ?, ?, ?, ?, ?) "
      + "on conflict(uid) do update set name = excluded.name, payload = excluded.payload, "
      + "count = excluded.count, pub = excluded.pub, updated = excluded.updated "
      + "where excluded.updated > profiles.updated"),
    profDel: q("delete from profiles where uid = ?"),
    profPubList: q("select uid, name, count, updated from profiles where pub = 1 order by updated desc limit 500"),

    shareIns: q("insert into shares (id, owner, name, payload, created) values (?, ?, ?, ?, ?)"),
    shareInsIgnore: q("insert or ignore into shares (id, owner, name, payload, created) values (?, ?, ?, ?, ?)"),
    shareGet: q("select * from shares where id = ?"),
    shareDel: q("delete from shares where id = ?"),
    shareCount: q("select count(*) n from shares where owner = ?"),
    shareMine: q("select id, name, created from shares where owner = ? order by created desc"),

    galIns: q("insert into gallery (id, owner, name, payload, created) values (?, ?, ?, ?, ?)"),
    galGet: q("select g.*, u.name author, (select count(*) from favs f where f.scene_id = g.id) favs "
      + "from gallery g join users u on u.uid = g.owner where g.id = ?"),
    galRow: q("select id, owner, thumb_ver from gallery where id = ?"),
    galDel: q("delete from gallery where id = ?"),
    galCount: q("select count(*) n from gallery where owner = ?"),
    galOwnedIds: q("select id, thumb_ver from gallery where owner = ?"),
    galTodo: q("select id, name, payload, thumb_ver from gallery where thumb_ver = 0 order by created"),
    galAll: q("select id, name, payload, thumb_ver from gallery order by created"),
    galThumb: q("update gallery set thumb_ver = ? where id = ?"),
    galBuiltinFavs: q("select scene_id, count(*) n from favs where scene_id like 'builtin:%' group by scene_id"),

    favIns: q("insert or ignore into favs (uid, scene_id, created) values (?, ?, ?)"),
    favDel: q("delete from favs where uid = ? and scene_id = ?"),
    favCount: q("select count(*) n from favs where scene_id = ?"),
    favMine: q("select scene_id from favs where uid = ? order by created desc"),
    favMineCount: q("select count(*) n from favs where uid = ?"),
    favDelScene: q("delete from favs where scene_id = ?"),
    favDelOwnedScenes: q("delete from favs where scene_id in (select id from gallery where owner = ?)"),
  };

  // ---- helpers -------------------------------------------------------------------------
  function limit(key, which) {
    const [max, win] = LIMIT[which];
    if (!limiter.hit(which + ":" + key, max, win)) throw new HttpError(429, "too many requests, try again later");
  }
  // The signed-in user, or a 401. A token whose token_ver no longer matches was revoked.
  function user(r) {
    const h = r.req.headers.authorization || "";
    const m = /^Bearer (\S+)$/.exec(h);
    const c = m && sessions.read(m[1]);
    const u = c && S.userByUid.get(c.u);
    if (!u || u.token_ver !== c.v) throw new HttpError(401, "sign in required");
    return u;
  }
  function maybeUser(r) {
    try { return r.req.headers.authorization ? user(r) : null; } catch (e) { return null; }
  }
  function admin(r) {
    const m = /^Bearer (\S+)$/.exec(r.req.headers.authorization || "");
    if (!cfg.adminToken) throw new HttpError(404, "not found");
    if (!m || !secretEqual(m[1], cfg.adminToken)) throw new HttpError(401, "admin token required");
  }
  function removeThumbs(id, ver) {
    if (!cfg.thumbDir || !(ver > 0)) return;
    for (const ext of ["webp", "mp4"]) {
      fs.rm(path.join(cfg.thumbDir, id + "-" + ver + "." + ext), { force: true }, () => {});
    }
  }
  const sessionOut = u => ({ ...sessions.issue(u.uid, u.token_ver), uid: u.uid, name: u.name });

  // ---- handlers ------------------------------------------------------------------------
  const routes = [];
  const on = (method, pattern, fn) => routes.push({ method, re: new RegExp("^" + pattern + "$"), fn });

  on("GET", "/api/health", r => {
    q("select 1").get();
    sendJson(r.res, 200, { ok: true, rev: cfg.rev, schema: require("./db").SCHEMA_VERSION });
  });

  // -- auth
  on("POST", "/api/auth/google", async r => {
    limit(r.ip, "auth");
    const body = await readJson(r.req, BODY.small);
    let claims;
    try {
      claims = await verifyGoogle(body.idToken);
    } catch (e) {
      if (e instanceof AuthError) throw new HttpError(401, "Google sign-in was not accepted: " + e.message);
      throw e;
    }
    let created = false;
    const u = tx(db, () => {
      let row = S.userBySub.get(claims.sub);
      if (!row) {
        S.userIns.run(newId(), claims.sub, null, "", Date.now());
        row = S.userBySub.get(claims.sub);
        created = true;
      }
      return row;
    });
    sendJson(r.res, 200, { ...sessionOut(u), created, hasProfile: !!S.profGet.get(u.uid) });
  });
  on("POST", "/api/auth/refresh", r => {
    const u = user(r);
    sendJson(r.res, 200, sessionOut(u));
  });
  on("POST", "/api/auth/signout-all", r => {
    const u = user(r);
    S.userBump.run(u.uid);
    sendJson(r.res, 200, { ok: true });
  });

  // -- me
  on("GET", "/api/me", r => {
    const u = user(r);
    sendJson(r.res, 200, { uid: u.uid, name: u.name, migrated: !!u.firebase_uid });
  });
  on("PATCH", "/api/me", async r => {
    const u = user(r);
    limit(u.uid, "write");
    const body = await readJson(r.req, BODY.small);
    onlyKeys(body, ["name"]);
    const name = vName(body.name, CAP.profileName, "name");
    S.userName.run(name, u.uid);
    sendJson(r.res, 200, { uid: u.uid, name });
  });
  // Everything the account owns goes: profile, share links, gallery scenes (and the favourites
  // others gave them), their own favourites, thumbnails. The cascade does most of it.
  on("DELETE", "/api/me", r => {
    const u = user(r);
    const owned = S.galOwnedIds.all(u.uid);
    tx(db, () => {
      S.favDelOwnedScenes.run(u.uid);
      S.userDel.run(u.uid);
    });
    for (const g of owned) removeThumbs(g.id, g.thumb_ver);
    sendJson(r.res, 200, { ok: true });
  });
  on("GET", "/api/me/scenes", r => {
    const u = user(r);
    sendJson(r.res, 200, { items: S.shareMine.all(u.uid) });
  });
  on("GET", "/api/me/favs", r => {
    const u = user(r);
    sendJson(r.res, 200, { ids: S.favMine.all(u.uid).map(x => x.scene_id) });
  });

  // -- own profile
  on("GET", "/api/profile", r => {
    const u = user(r);
    const p = S.profGet.get(u.uid);
    if (!p) throw new HttpError(404, "no profile yet");
    // ?meta=1 leaves the library out: the page reads name/count/pub/version at every startup
    // and after a stale save, and neither needs up to 300 KB of payload.
    const meta = r.url.searchParams.get("meta") === "1";
    sendJson(r.res, 200, { name: p.name, ...(meta ? {} : { payload: p.payload }), count: p.count, pub: !!p.pub,
      updated: p.updated }, { ETag: '"' + p.updated + '"' });
  });
  // If-Match: "none" = create only; "<updated>" = only over exactly that version; absent =
  // unguarded. This is Firestore's currentDocument precondition, which cloudSave relies on to
  // stop a stale machine overwriting a newer library.
  on("PUT", "/api/profile", async r => {
    const u = user(r);
    limit(u.uid, "write");
    const body = await readJson(r.req, BODY.profile);
    onlyKeys(body, ["name", "payload", "count", "pub"]);
    const name = vName(body.name, CAP.profileName, "name");
    const payload = vPayload(body.payload, CAP.profilePayload);
    const count = vInt(body.count, 0, CAP.profileCount, "count");
    if (typeof body.pub !== "boolean") throw new HttpError(400, "pub must be true or false");
    const im = r.req.headers["if-match"];
    const want = im == null ? null : String(im).replace(/"/g, "").trim();
    const updated = tx(db, () => {
      const cur = S.profGet.get(u.uid);
      if (want === "none" && cur) throw new HttpError(412, "a profile already exists");
      if (want != null && want !== "none" && (!cur || String(cur.updated) !== want)) {
        throw new HttpError(412, "the profile changed since it was read");
      }
      const t = Math.max(Date.now(), cur ? cur.updated + 1 : 0);
      S.profPut.run(u.uid, name, payload, count, body.pub ? 1 : 0, t);
      S.userName.run(name, u.uid);
      return t;
    });
    sendJson(r.res, 200, { updated }, { ETag: '"' + updated + '"' });
  });
  on("DELETE", "/api/profile", r => {
    const u = user(r);
    S.profDel.run(u.uid);
    sendJson(r.res, 200, { ok: true });
  });

  // -- public profiles (the collections gallery the client has today; also what a stored
  //    collection follow resolves against, by our uid OR the account's old Firebase uid)
  on("GET", "/api/profiles", r => {
    sendJson(r.res, 200, { items: S.profPubList.all() }, { "Cache-Control": "public, max-age=60" });
  });
  on("GET", "/api/profiles/([^/]+)", r => {
    const id = decodeURIComponent(r.m[1]);
    if (!UID_RE.test(id)) throw new HttpError(404, "no such profile");
    const owner = S.userByAny.get(id, id);
    const p = owner && S.profGet.get(owner.uid);
    const me = maybeUser(r);
    if (!p || !(p.pub || (me && me.uid === owner.uid))) throw new HttpError(404, "no such profile");
    sendJson(r.res, 200, { uid: owner.uid, name: p.name, payload: p.payload, count: p.count, updated: p.updated });
  });

  // -- share links (#c=)
  on("POST", "/api/scenes", async r => {
    const u = user(r);
    limit(u.uid, "share");
    const body = await readJson(r.req, BODY.scene);
    onlyKeys(body, ["name", "payload"]);
    const name = vName(body.name == null ? "" : body.name, CAP.sceneName, "name");
    const payload = vPayload(body.payload, CAP.scenePayload);
    const id = tx(db, () => {
      if (S.shareCount.get(u.uid).n >= CAP.sharesPerUser) {
        throw new HttpError(409, "you have " + CAP.sharesPerUser + " shared links; delete some first");
      }
      const nid = newId();
      S.shareIns.run(nid, u.uid, name, payload, Date.now());
      return nid;
    });
    sendJson(r.res, 200, { id });
  });
  // Anyone may open a link by id. There is deliberately NO listing endpoint: links stay unlisted.
  on("GET", "/api/scenes/([^/]+)", r => {
    const id = decodeURIComponent(r.m[1]);
    const s = ID_RE.test(id) && S.shareGet.get(id);
    if (!s) throw new HttpError(404, "no such scene");
    sendJson(r.res, 200, { id: s.id, name: s.name, payload: s.payload, created: s.created },
      { "Cache-Control": "public, max-age=300" });
  });
  on("DELETE", "/api/scenes/([^/]+)", r => {
    const u = user(r);
    const id = decodeURIComponent(r.m[1]);
    const s = ID_RE.test(id) && S.shareGet.get(id);
    if (!s) throw new HttpError(404, "no such scene");
    if (s.owner !== u.uid) throw new HttpError(403, "not your link");
    S.shareDel.run(id);
    sendJson(r.res, 200, { ok: true });
  });

  // -- gallery of scenes
  on("GET", "/api/gallery", r => {
    const sp = r.url.searchParams;
    // sort=name is the gallery's All tab, A to Z. An older client never sends it.
    const sort = sp.get("sort") === "new" ? "new" : sp.get("sort") === "name" ? "name" : "favs";
    const lim = Math.max(1, Math.min(100, parseInt(sp.get("limit"), 10) || 48));
    const off = Math.max(0, parseInt(sp.get("offset"), 10) || 0);
    const needle = (sp.get("q") || "").slice(0, 60).trim();
    const like = "%" + needle.replace(/[\\%_]/g, c => "\\" + c) + "%";
    // ?mine=favs narrows to the caller's own favourites (the gallery's My favourites tab), so
    // that list pages and filters exactly like the others. It needs a session; the rest does not.
    const favOf = sp.get("mine") === "favs" ? user(r).uid : "";
    const where = "where (? = '' or g.name like ? escape '\\' or u.name like ? escape '\\') "
      + "and (? = '' or g.id in (select scene_id from favs where uid = ?))";
    const order = sort === "new" ? "order by g.created desc, g.id"
      : sort === "name" ? "order by g.name collate nocase, g.id"
      : "order by favs desc, g.created desc, g.id";
    const rows = q("select g.id, g.name, g.owner, g.created, g.thumb_ver, u.name author, "
      + "(select count(*) from favs f where f.scene_id = g.id) favs "
      + "from gallery g join users u on u.uid = g.owner " + where + " " + order + " limit ? offset ?")
      .all(needle, like, like, favOf, favOf, lim, off);
    const total = q("select count(*) n from gallery g join users u on u.uid = g.owner " + where)
      .get(needle, like, like, favOf, favOf).n;
    const builtin = {};
    for (const b of S.galBuiltinFavs.all()) builtin[b.scene_id] = b.n;
    sendJson(r.res, 200, {
      total, offset: off, sort, builtin,
      items: rows.map(g => ({ id: g.id, name: g.name, author: g.author, owner: g.owner, created: g.created,
        favs: g.favs, ...thumbUrls(g.id, g.thumb_ver) })),
    }, { "Cache-Control": favOf ? "private, no-store" : "public, max-age=30" });
  });
  on("GET", "/api/gallery/([^/]+)", r => {
    const id = decodeURIComponent(r.m[1]);
    const g = ID_RE.test(id) && S.galGet.get(id);
    if (!g) throw new HttpError(404, "no such scene");
    sendJson(r.res, 200, { id: g.id, name: g.name, author: g.author, owner: g.owner, payload: g.payload,
      created: g.created, favs: g.favs, ...thumbUrls(g.id, g.thumb_ver) });
  });
  on("POST", "/api/gallery", async r => {
    const u = user(r);
    limit(u.uid, "publish");
    const body = await readJson(r.req, BODY.scene);
    onlyKeys(body, ["name", "payload"]);
    const name = vName(body.name, CAP.sceneName, "name");
    if (!name.trim()) throw new HttpError(400, "a published scene needs a name");
    const payload = vPayload(body.payload, CAP.scenePayload);
    const id = tx(db, () => {
      if (S.galCount.get(u.uid).n >= CAP.galleryPerUser) {
        throw new HttpError(409, "you have " + CAP.galleryPerUser + " published scenes; remove some first");
      }
      const nid = newId();
      S.galIns.run(nid, u.uid, name, payload, Date.now());
      return nid;
    });
    sendJson(r.res, 200, { id });
  });
  on("DELETE", "/api/gallery/([^/]+)", r => {
    const u = user(r);
    const id = decodeURIComponent(r.m[1]);
    const g = ID_RE.test(id) && S.galRow.get(id);
    if (!g) throw new HttpError(404, "no such scene");
    if (g.owner !== u.uid) throw new HttpError(403, "not your scene");
    tx(db, () => { S.favDelScene.run(id); S.galDel.run(id); });
    removeThumbs(id, g.thumb_ver);
    sendJson(r.res, 200, { ok: true });
  });
  // Favourite / un-favourite. Idempotent both ways; the reply carries the fresh count.
  function favTarget(raw) {
    const id = decodeURIComponent(raw);
    if (BUILTIN_RE.test(id)) return id;
    if (ID_RE.test(id) && S.galRow.get(id)) return id;
    throw new HttpError(404, "no such scene");
  }
  on("PUT", "/api/gallery/([^/]+)/fav", r => {
    const u = user(r);
    limit(u.uid, "fav");
    const id = favTarget(r.m[1]);
    tx(db, () => {
      if (S.favMineCount.get(u.uid).n >= CAP.favsPerUser) throw new HttpError(409, "too many favourites");
      S.favIns.run(u.uid, id, Date.now());
    });
    sendJson(r.res, 200, { id, mine: true, favs: S.favCount.get(id).n });
  });
  on("DELETE", "/api/gallery/([^/]+)/fav", r => {
    const u = user(r);
    limit(u.uid, "fav");
    const id = favTarget(r.m[1]);
    S.favDel.run(u.uid, id);
    sendJson(r.res, 200, { id, mine: false, favs: S.favCount.get(id).n });
  });

  // -- admin: thumbnails (tools/thumbs.js) and the one-time Firebase import
  on("GET", "/api/admin/thumbs/todo", r => {
    admin(r);
    const rows = r.url.searchParams.get("all") ? S.galAll.all() : S.galTodo.all();
    sendJson(r.res, 200, { items: rows });
  });
  on("PUT", "/api/admin/thumbs/([^/]+)", async r => {
    admin(r);
    const id = decodeURIComponent(r.m[1]);
    const g = ID_RE.test(id) && S.galRow.get(id);
    if (!g) throw new HttpError(404, "no such scene");
    if (!cfg.thumbDir) throw new HttpError(503, "thumbnail storage is not configured");
    const body = await readJson(r.req, BODY.thumbs);
    onlyKeys(body, ["poster", "clip"]);
    const poster = Buffer.from(String(body.poster || ""), "base64");
    const clip = Buffer.from(String(body.clip || ""), "base64");
    const isWebp = b => b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP";
    const isMp4 = b => b.length > 12 && b.toString("latin1", 4, 8) === "ftyp";
    if (!isWebp(poster) || poster.length > CAP.poster) throw new HttpError(400, "poster must be a WebP of at most 1 MB");
    if (!isMp4(clip) || clip.length > CAP.clip) throw new HttpError(400, "clip must be an MP4 of at most 6 MB");
    const ver = g.thumb_ver + 1;
    fs.mkdirSync(cfg.thumbDir, { recursive: true });
    for (const [buf, ext] of [[poster, "webp"], [clip, "mp4"]]) {
      const file = path.join(cfg.thumbDir, id + "-" + ver + "." + ext);
      fs.writeFileSync(file + ".tmp", buf);
      fs.renameSync(file + ".tmp", file);
    }
    S.galThumb.run(ver, id);
    removeThumbs(id, g.thumb_ver);
    sendJson(r.res, 200, { id, thumb_ver: ver, ...thumbUrls(id, ver) });
  });
  // Idempotent: re-running the export adds what is missing and refreshes a profile only from a
  // NEWER copy; users and shares are never overwritten. Bad rows are reported, not fatal, so
  // one odd document cannot block the whole migration.
  on("POST", "/api/admin/import", async r => {
    admin(r);
    const body = await readJson(r.req, BODY.import);
    const out = { users: { added: 0, linked: 0, skipped: 0 }, profiles: { added: 0, updated: 0, skipped: 0 },
      shares: { added: 0, skipped: 0 }, errors: [] };
    const bad = (kind, i, e) => out.errors.push(kind + "[" + i + "]: " + e.message);
    tx(db, () => {
      (Array.isArray(body.users) ? body.users : []).forEach((x, i) => {
        try {
          if (!x || typeof x.google_sub !== "string" || !x.google_sub) throw new Error("google_sub missing");
          if (typeof x.firebase_uid !== "string" || !UID_RE.test(x.firebase_uid)) throw new Error("bad firebase_uid");
          const name = vName(x.name == null ? "" : x.name, CAP.profileName, "name");
          const bySub = S.userBySub.get(x.google_sub);
          if (bySub) {
            if (!bySub.firebase_uid && !S.userByFb.get(x.firebase_uid)) {
              S.userLinkFb.run(x.firebase_uid, bySub.uid);
              out.users.linked++;
            } else out.users.skipped++;
            return;
          }
          if (S.userByFb.get(x.firebase_uid)) { out.users.skipped++; return; }
          S.userIns.run(newId(), x.google_sub, x.firebase_uid, name, Date.now());
          out.users.added++;
        } catch (e) { bad("users", i, e); }
      });
      (Array.isArray(body.profiles) ? body.profiles : []).forEach((x, i) => {
        try {
          const owner = x && typeof x.firebase_uid === "string" && S.userByFb.get(x.firebase_uid);
          if (!owner) throw new Error("no imported user for firebase_uid " + (x && x.firebase_uid));
          const name = vName(x.name == null ? "" : x.name, CAP.profileName, "name");
          const payload = vPayload(x.payload, CAP.profilePayload);
          const count = vInt(x.count, 0, CAP.profileCount, "count");
          const had = !!S.profGet.get(owner.uid);
          const res = S.profImp.run(owner.uid, name, payload, count, x.pub ? 1 : 0, vTime(x.updated));
          if (!res.changes) out.profiles.skipped++;
          else if (had) out.profiles.updated++;
          else out.profiles.added++;
          if (res.changes && !owner.name && name) S.userName.run(name, owner.uid);
        } catch (e) { bad("profiles", i, e); }
      });
      (Array.isArray(body.shares) ? body.shares : []).forEach((x, i) => {
        try {
          if (!x || !ID_RE.test(x.id)) throw new Error("bad id");
          const owner = typeof x.owner_firebase_uid === "string" ? S.userByFb.get(x.owner_firebase_uid) : null;
          const name = vName(x.name == null ? "" : x.name, CAP.sceneName, "name");
          const payload = vPayload(x.payload, CAP.scenePayload);
          const res = S.shareInsIgnore.run(x.id, owner ? owner.uid : null, name, payload, vTime(x.created));
          if (res.changes) out.shares.added++; else out.shares.skipped++;
        } catch (e) { bad("shares", i, e); }
      });
    });
    sendJson(r.res, 200, out);
  });

  // -- thumbnails, static. Names are versioned, so they are cached forever. Range support is
  //    not optional: Safari will not play a <video> whose server ignores Range.
  on("GET", "/thumbs/([^/]+)", r => {
    const m = THUMB_RE.exec(r.m[1]);
    if (!m || !cfg.thumbDir) throw new HttpError(404, "not found");
    const file = path.join(cfg.thumbDir, m[0]);
    let st;
    try { st = fs.statSync(file); } catch (e) { throw new HttpError(404, "not found"); }
    const headers = {
      "Content-Type": m[3] === "mp4" ? "video/mp4" : "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
    };
    const range = /^bytes=(\d*)-(\d*)$/.exec(r.req.headers.range || "");
    if (range && (range[1] || range[2])) {
      let start, end;
      if (range[1]) { start = +range[1]; end = range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1; }
      else { start = Math.max(0, st.size - +range[2]); end = st.size - 1; }
      if (start > end || start >= st.size) {
        r.res.writeHead(416, { ...headers, "Content-Range": "bytes */" + st.size });
        return r.res.end();
      }
      r.res.writeHead(206, { ...headers, "Content-Range": "bytes " + start + "-" + end + "/" + st.size,
        "Content-Length": end - start + 1 });
      if (r.req.method === "HEAD") return r.res.end();
      return fs.createReadStream(file, { start, end }).pipe(r.res);
    }
    r.res.writeHead(200, { ...headers, "Content-Length": st.size });
    if (r.req.method === "HEAD") return r.res.end();
    fs.createReadStream(file).pipe(r.res);
  });

  return routes;
}

module.exports = { makeRoutes, CAP, LIMIT };
