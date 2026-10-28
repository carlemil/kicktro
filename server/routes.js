"use strict";
// Every endpoint. The caps here are the ones firestore.rules used to enforce (that file was the
// whole authorization boundary on Firebase); this file is now. Keep them in step with the
// client's own checks in src/cloud-profile.js and CONFIG.cloud.maxPayload.
const fs = require("node:fs");
const path = require("node:path");
const { HttpError, readJson, sendJson } = require("./http");
const { tx } = require("./db");
const { newId, secretEqual, AuthError } = require("./auth");
const { makeSync } = require("./gallery-sync");

const CAP = {
  profileName: 40,
  profilePayload: 300000,   // exclusive, as in firestore.rules
  profileCount: 500,
  sceneName: 60,
  scenePayload: 200000,     // exclusive: share links AND gallery scenes
  sharesPerUser: 1000,
  galleryPerUser: 500,      // = profileCount: every scene of a full library is a card
  favsPerUser: 5000,
  hatesPerUser: 5000,
  poster: 1 << 20,          // 1 MB
  viewerPoster: 256 << 10,  // a visitor's browser render: 480x270 WebP, ~20-60 KB in practice
  clip: 6 << 20,            // 6 MB
};
const BODY = {
  small: 16 << 10,
  profile: 400 << 10,
  scene: 300 << 10,
  thumbs: 12 << 20,
  poster: 360 << 10,        // viewerPoster as base64, plus room
  import: 32 << 20,
};
const LIMIT = {   // [max, windowMs]
  ip: [600, 60000],
  auth: [30, 600000],
  write: [60, 60000],
  share: [30, 3600000],
  publish: [20, 86400000],
  fav: [300, 3600000],
  anon: [5, 86400000],      // anonymous accounts minted per IP per day
  sync: [600, 3600000],     // library pushes per account per hour (the page sends each edit within seconds)
  thumb: [30, 3600000],     // visitor-rendered posters per IP per hour
};

const ID_RE = /^[A-Za-z0-9]{10,40}$/;
const UID_RE = /^[A-Za-z0-9_-]{6,128}$/;
const B64_RE = /^[A-Za-z0-9_\-+/]+={0,2}$/;
const BUILTIN_RE = /^builtin:[a-z0-9-]{1,40}$/;
const THUMB_RE = /^([A-Za-z0-9]{10,40})-(\d{1,9})\.(webp|mp4)$/;

// ---- validation --------------------------------------------------------------------------
const isWebp = b => b.length > 30 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP";
// A WebP's canvas size from its first chunk: VP8 (lossy), VP8L (lossless) or VP8X (extended,
// which is what an encoder writes when the picture has alpha). null = not one of those.
function webpSize(b) {
  const kind = b.toString("latin1", 12, 16);
  if (kind === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
    return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  if (kind === "VP8L" && b[20] === 0x2f) {
    const v = b.readUInt32LE(21);
    return { w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1 };
  }
  if (kind === "VP8X") return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  return null;
}
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

// clip 0 = a visitor's poster with no clip (thumb_clip).
function thumbUrls(id, ver, clip) {
  return ver > 0 ? { poster: "/thumbs/" + id + "-" + ver + ".webp", clip: clip === 0 ? null : "/thumbs/" + id + "-" + ver + ".mp4" }
    : { poster: null, clip: null };
}

// A card's author: the account's public name, else Anonymous (a signed-out browser's
// account, or a signed-in one that never named itself) -- in the SQL, so every client
// version shows the same word.
const AUTHOR = "case when u.name = '' then 'Anonymous' else u.name end author";

function makeRoutes(ctx) {
  const { db, cfg, verifyGoogle, sessions, limiter } = ctx;
  const q = sql => db.prepare(sql);
  const gsync = makeSync({ db, cfg, CAP, newId, clean });

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
    galGet: q("select g.*, " + AUTHOR + ", (select count(*) from favs f where f.scene_id = g.id) favs, "
      + "(select count(*) from hates h where h.scene_id = g.id) hates "
      + "from gallery g join users u on u.uid = g.owner where g.id = ?"),
    galRow: q("select id, owner, name, thumb_ver, thumb_at, pub_at, skey, payload, gone from gallery where id = ?"),
    galOwnedBy: q("select id, skey, name, thumb_ver from gallery where owner = ?"),
    galMove: q("update gallery set owner = ? where id = ?"),
    deadIns: q("insert or replace into gallery_dead (owner, skey, name, at) values (?, ?, ?, ?)"),
    deadMove: q("update or ignore gallery_dead set owner = ? where owner = ?"),
    userInsAnon: q("insert into users (uid, google_sub, firebase_uid, name, created, anon) values (?, ?, null, '', ?, 1)"),
    profAll: q("select p.uid, p.payload, u.name from profiles p join users u on u.uid = p.uid order by p.updated"),
    galDel: q("delete from gallery where id = ?"),
    galCount: q("select count(*) n from gallery where owner = ?"),
    galOwnedIds: q("select id, thumb_ver from gallery where owner = ?"),
    // To render: a public card with no thumbnail, or whose public version changed since its
    // thumbnail was made (a promoted edit), or whose thumbnail is a visitor's poster.
    galTodo: q("select id, name, payload, thumb_ver from gallery where payload != '' "
      + "and (thumb_ver = 0 or thumb_at < pub_at or thumb_clip = 0) order by created"),
    galAll: q("select id, name, payload, thumb_ver from gallery where payload != '' order by created"),
    galThumb: q("update gallery set thumb_ver = ?, thumb_at = ?, thumb_clip = ? where id = ?"),
    galBuiltinFavs: q("select scene_id, count(*) n from favs where scene_id like 'builtin:%' group by scene_id"),
    galBuiltinHates: q("select scene_id, count(*) n from hates where scene_id like 'builtin:%' group by scene_id"),

    favIns: q("insert or ignore into favs (uid, scene_id, created) values (?, ?, ?)"),
    favDel: q("delete from favs where uid = ? and scene_id = ?"),
    favCount: q("select count(*) n from favs where scene_id = ?"),
    favMine: q("select scene_id from favs where uid = ? order by created desc"),
    favMineCount: q("select count(*) n from favs where uid = ?"),
    favDelScene: q("delete from favs where scene_id = ?"),
    favDelOwnedScenes: q("delete from favs where scene_id in (select id from gallery where owner = ?)"),

    favHas: q("select 1 from favs where uid = ? and scene_id = ?"),
    hateHas: q("select 1 from hates where uid = ? and scene_id = ?"),
    hateIns: q("insert or ignore into hates (uid, scene_id, created) values (?, ?, ?)"),
    hateDel: q("delete from hates where uid = ? and scene_id = ?"),
    hateCount: q("select count(*) n from hates where scene_id = ?"),
    hateMine: q("select scene_id from hates where uid = ? order by created desc"),
    hateMineCount: q("select count(*) n from hates where uid = ?"),
    hateDelScene: q("delete from hates where scene_id = ?"),
    hateDelOwnedScenes: q("delete from hates where scene_id in (select id from gallery where owner = ?)"),
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
  // A Google-signed-in account. An anonymous one (a signed-out browser, POST /api/auth/anon)
  // may push its scenes and read its own cards, nothing else: no profile, no links, no votes
  // -- minting accounts must not be a way to stuff the score.
  function account(r) {
    const u = user(r);
    if (u.anon) throw new HttpError(403, "sign in with Google for this");
    return u;
  }
  function admin(r) {
    const m = /^Bearer (\S+)$/.exec(r.req.headers.authorization || "");
    if (!cfg.adminToken) throw new HttpError(404, "not found");
    if (!m || !secretEqual(m[1], cfg.adminToken)) throw new HttpError(401, "admin token required");
  }
  // A moderator (cfg.admins): never an anonymous account, whatever its uid.
  const isAdmin = u => !u.anon && (cfg.admins || []).includes(u.uid);
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
    let created = false, claimed = 0;
    const u = tx(db, () => {
      let row = S.userBySub.get(claims.sub);
      if (!row) {
        S.userIns.run(newId(), claims.sub, null, "", Date.now());
        row = S.userBySub.get(claims.sub);
        created = true;
      }
      claimed = claimAnon(row, body.anon);
      return row;
    });
    sendJson(r.res, 200, { ...sessionOut(u), created, claimed, hasProfile: !!S.profGet.get(u.uid) });
  });
  // Signing in from a browser that was anonymous: its cards become the account's (votes and
  // thumbnails kept), except where the account already has a card for the same scene; the
  // anonymous account then goes. Only with that account's own live session, so nobody can
  // claim another browser's scenes.
  function claimAnon(u, tok) {
    if (typeof tok !== "string" || !tok) return 0;
    const c = sessions.read(tok);
    const a = c && S.userByUid.get(c.u);
    if (!a || !a.anon || a.token_ver !== c.v || a.uid === u.uid) return 0;
    const mine = new Set(S.galOwnedBy.all(u.uid).map(g => g.skey || "\u0000" + g.name));
    let n = 0;
    for (const g of S.galOwnedBy.all(a.uid)) {
      if (mine.has(g.skey || "\u0000" + g.name)) {
        S.favDelScene.run(g.id); S.hateDelScene.run(g.id); S.galDel.run(g.id);
        removeThumbs(g.id, g.thumb_ver);
      } else { S.galMove.run(u.uid, g.id); n++; }
    }
    S.deadMove.run(u.uid, a.uid);    // what that browser deleted stays deleted
    S.userDel.run(a.uid);
    return n;
  }
  // A signed-out browser's account: no Google, no name (its cards read Anonymous). The page
  // keeps the session and pushes its scenes with it.
  on("POST", "/api/auth/anon", r => {
    limit(r.ip, "anon");
    const uid = newId();
    S.userInsAnon.run(uid, "anon:" + newId(), Date.now());
    sendJson(r.res, 200, { ...sessionOut(S.userByUid.get(uid)), anon: true });
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
    const u = account(r);
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
      S.hateDelOwnedScenes.run(u.uid);
      S.userDel.run(u.uid);
    });
    for (const g of owned) removeThumbs(g.id, g.thumb_ver);
    sendJson(r.res, 200, { ok: true });
  });
  on("GET", "/api/me/scenes", r => {
    const u = account(r);
    sendJson(r.res, 200, { items: S.shareMine.all(u.uid) });
  });
  on("GET", "/api/me/favs", r => {
    const u = user(r);
    sendJson(r.res, 200, { ids: S.favMine.all(u.uid).map(x => x.scene_id),
      hates: S.hateMine.all(u.uid).map(x => x.scene_id), ...(isAdmin(u) ? { admin: true } : {}) });
  });

  // -- own profile
  on("GET", "/api/profile", r => {
    const u = account(r);
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
    const u = account(r);
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
    const u = account(r);
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
    const u = account(r);
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
    gsync.promote();
    const sp = r.url.searchParams;
    // sort=name is the gallery's All tab, A to Z. An older client never sends it.
    const sort = sp.get("sort") === "new" ? "new" : sp.get("sort") === "name" ? "name" : "favs";
    const lim = Math.max(1, Math.min(100, parseInt(sp.get("limit"), 10) || 48));
    const off = Math.max(0, parseInt(sp.get("offset"), 10) || 0);
    const needle = (sp.get("q") || "").slice(0, 60).trim();
    const like = "%" + needle.replace(/[\\%_]/g, c => "\\" + c) + "%";
    // ?mine=favs narrows to the caller's own favourites (the gallery's My favourites tab) and
    // ?mine=own to the caller's own cards (My scenes), so those lists page and filter exactly
    // like the others. Both need a session; the rest does not. Everyone else sees only what is
    // PUBLIC (payload, never a pending edit); My scenes also lists a scene still inside its first
    // hour, with `pending` = when the waiting edit goes public.
    const mine = sp.get("mine");
    const favOf = mine === "favs" ? user(r).uid : "";
    const ownOf = mine === "own" ? user(r).uid : "";
    const where = "where (? = '' or g.name like ? escape '\\' or u.name like ? escape '\\') "
      + "and (? = '' or g.id in (select scene_id from favs where uid = ?)) "
      + "and (? = '' or g.owner = ?) and g.gone = 0 and (g.payload != '' or g.owner = ?)";
    const order = sort === "new" ? "order by g.created desc, g.id"
      : sort === "name" ? "order by g.name collate nocase, g.id"
      : "order by favs - hates desc, favs desc, g.created desc, g.id";   // Most loved: the SCORE
    const rows = q("select g.id, g.name, g.pend_name, g.owner, g.created, g.thumb_ver, g.thumb_clip, g.edited, g.skey, "
      + "g.payload != '' and g.thumb_ver > 0 and g.thumb_at < g.pub_at stale, "
      + "g.pend is not null pending, g.payload != '' live, " + AUTHOR + ", "
      + "(select count(*) from favs f where f.scene_id = g.id) favs, "
      + "(select count(*) from hates h where h.scene_id = g.id) hates "
      + "from gallery g join users u on u.uid = g.owner " + where + " " + order + " limit ? offset ?")
      .all(needle, like, like, favOf, favOf, ownOf, ownOf, ownOf, lim, off);
    const total = q("select count(*) n from gallery g join users u on u.uid = g.owner " + where)
      .get(needle, like, like, favOf, favOf, ownOf, ownOf, ownOf).n;
    const builtin = {};
    for (const b of S.galBuiltinFavs.all()) builtin[b.scene_id] = b.n;
    // builtin stays LOVES ONLY (an older client reads it as its heart count); dislikes ride beside.
    const builtinHates = {};
    for (const b of S.galBuiltinHates.all()) builtinHates[b.scene_id] = b.n;
    sendJson(r.res, 200, {
      total, offset: off, sort, builtin, builtinHates,
      items: rows.map(g => ({ id: g.id, name: ownOf && g.pend_name ? g.pend_name : g.name, author: g.author,
        owner: g.owner, created: g.created, favs: g.favs, hates: g.hates, ...thumbUrls(g.id, g.thumb_ver, g.thumb_clip),
        ...(g.stale ? { stale: true } : {}),   // the thumbnail shows an older public version
        ...(g.skey ? { synced: true } : {}),   // follows a scene in its owner's library
        ...(ownOf ? { live: !!g.live, ...(g.pending ? { pending: g.edited + cfg.pendingMs } : {}) } : {}) })),
    }, { "Cache-Control": favOf || ownOf ? "private, no-store" : "public, max-age=30" });
  });
  // Others get the PUBLIC version, and nothing for a card that is not public (yet, or any
  // more); the owner gets the newest, pending edit included.
  on("GET", "/api/gallery/([^/]+)", r => {
    gsync.promote();
    const id = decodeURIComponent(r.m[1]);
    const g = ID_RE.test(id) && S.galGet.get(id);
    const me = g && (g.payload === "" || g.gone || g.pend) ? maybeUser(r) : null;
    const own = !!(me && g && me.uid === g.owner);
    if (!g || (!own && (g.payload === "" || g.gone))) throw new HttpError(404, "no such scene");
    sendJson(r.res, 200, { id: g.id, name: own && g.pend_name ? g.pend_name : g.name, author: g.author, owner: g.owner,
      payload: own && g.pend ? g.pend : g.payload,
      created: g.created, favs: g.favs, hates: g.hates, ...thumbUrls(g.id, g.thumb_ver, g.thumb_clip) });
  });
  on("POST", "/api/gallery", async r => {
    const u = account(r);
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
    const own = g.owner === u.uid;
    if (!own && !isAdmin(u)) throw new HttpError(403, "not your scene");
    // A card that follows a scene in your library (every one since auto-publish) is deleted
    // for good: the scene's key is tombstoned so no later push makes it again, and the answer
    // names the scene (sid / name) so the page drops it from your library as well. An ADMIN
    // deleting someone else's card tombstones it under its OWNER (their pushes skip it) and
    // gets no sid/name back -- that would drop a same-named scene from the admin's library.
    tx(db, () => {
      if (g.skey) S.deadIns.run(g.owner, g.skey, g.name, Date.now());
      S.favDelScene.run(id); S.hateDelScene.run(id); S.galDel.run(id);
    });
    removeThumbs(id, g.thumb_ver);
    const sid = g.skey && g.skey.startsWith("s:") ? g.skey.slice(2) : null;
    sendJson(r.res, 200, own ? { ok: true, ...(sid ? { sid } : {}), ...(g.skey ? { name: g.name } : {}) } : { ok: true });
  });
  // The page's library, pushed whole: every scene of your own becomes / updates its card
  // (gallery-sync.js -- an edit waits an hour, a scene gone from the library hides its card).
  // Signed in or anonymous. `name` (signed in only) is the profile name cards are credited to.
  on("PUT", "/api/me/gallery", async r => {
    const u = user(r);
    limit(u.uid, "sync");
    const body = await readJson(r.req, BODY.profile);
    onlyKeys(body, ["payload", "name"]);
    const lib = gsync.inflate(vPayload(body.payload, CAP.profilePayload));
    if (lib.presets.length > CAP.profileCount) throw new HttpError(400, "more than " + CAP.profileCount + " scenes");
    const name = body.name == null || u.anon ? null : vName(body.name, CAP.profileName, "name");
    const out = tx(db, () => {
      if (name !== null && name !== u.name) S.userName.run(name, u.uid);
      return gsync.sync(u.uid, lib, { hide: true });
    });
    delete out.names;
    sendJson(r.res, 200, out);
  });
  // Favourite / un-favourite, and the same for a dislike (the broken heart). Idempotent both
  // ways; ONE vote per person, so setting either clears the other in the same transaction.
  // The reply carries both fresh counts and both of the caller's flags; mine/favs keep the
  // shape an older client reads.
  function favTarget(raw) {
    const id = decodeURIComponent(raw);
    if (BUILTIN_RE.test(id)) return id;
    if (ID_RE.test(id) && S.galRow.get(id)) return id;
    throw new HttpError(404, "no such scene");
  }
  on("PUT", "/api/gallery/([^/]+)/fav", r => {
    const u = account(r);
    limit(u.uid, "fav");
    const id = favTarget(r.m[1]);
    tx(db, () => {
      if (S.favMineCount.get(u.uid).n >= CAP.favsPerUser) throw new HttpError(409, "too many favourites");
      S.hateDel.run(u.uid, id);
      S.favIns.run(u.uid, id, Date.now());
    });
    sendJson(r.res, 200, voteReply(u.uid, id));
  });
  on("DELETE", "/api/gallery/([^/]+)/fav", r => {
    const u = account(r);
    limit(u.uid, "fav");
    const id = favTarget(r.m[1]);
    S.favDel.run(u.uid, id);
    sendJson(r.res, 200, voteReply(u.uid, id));
  });
  on("PUT", "/api/gallery/([^/]+)/hate", r => {
    const u = account(r);
    limit(u.uid, "fav");
    const id = favTarget(r.m[1]);
    tx(db, () => {
      if (S.hateMineCount.get(u.uid).n >= CAP.hatesPerUser) throw new HttpError(409, "too many dislikes");
      S.favDel.run(u.uid, id);
      S.hateIns.run(u.uid, id, Date.now());
    });
    sendJson(r.res, 200, voteReply(u.uid, id));
  });
  on("DELETE", "/api/gallery/([^/]+)/hate", r => {
    const u = account(r);
    limit(u.uid, "fav");
    const id = favTarget(r.m[1]);
    S.hateDel.run(u.uid, id);
    sendJson(r.res, 200, voteReply(u.uid, id));
  });
  function voteReply(uid, id) {
    const mine = !!S.favHas.get(uid, id);
    const hate = !!S.hateHas.get(uid, id);
    return { id, mine, hate, favs: S.favCount.get(id).n, hates: S.hateCount.get(id).n };
  }

  // A card's thumbnail as rendered by the FIRST VISITOR who opens the gallery while it has none
  // (the page renders it in a hidden copy of itself; there is no GPU on the server). Anyone may
  // send one, so it is accepted only while the card needs one -- none yet, or one of an older
  // public version -- and only as a 480x270 WebP; the first wins (409 after). It is a POSTER
  // ONLY (thumb_clip 0), and tools/thumbs.js --server re-renders every such card for real,
  // which is also what replaces a bad one.
  on("PUT", "/api/gallery/([^/]+)/thumb", async r => {
    limit(r.ip, "thumb");
    const id = decodeURIComponent(r.m[1]);
    if (!cfg.thumbDir) throw new HttpError(503, "thumbnail storage is not configured");
    const body = await readJson(r.req, BODY.poster);
    onlyKeys(body, ["poster"]);
    const poster = Buffer.from(String(body.poster || ""), "base64");
    if (!isWebp(poster) || poster.length > CAP.viewerPoster) throw new HttpError(400, "poster must be a WebP of at most 256 KB");
    const dim = webpSize(poster);
    if (!dim || dim.w !== 480 || dim.h !== 270) throw new HttpError(400, "poster must be 480x270");
    // Checked AFTER the body is read: two visitors racing both pass a check made before it.
    gsync.promote();
    const g = ID_RE.test(id) && S.galRow.get(id);
    if (!g || g.payload === "" || g.gone) throw new HttpError(404, "no such scene");
    if (g.thumb_ver > 0 && g.thumb_at >= g.pub_at) throw new HttpError(409, "this scene has a thumbnail");
    const ver = g.thumb_ver + 1;
    fs.mkdirSync(cfg.thumbDir, { recursive: true });
    const file = path.join(cfg.thumbDir, id + "-" + ver + ".webp");
    fs.writeFileSync(file + ".tmp", poster);
    fs.renameSync(file + ".tmp", file);
    S.galThumb.run(ver, Date.now(), 0, id);
    removeThumbs(id, g.thumb_ver);
    sendJson(r.res, 200, { id, thumb_ver: ver, ...thumbUrls(id, ver, 0) });
  });
  // -- admin: thumbnails (tools/thumbs.js) and the one-time Firebase import
  on("GET", "/api/admin/thumbs/todo", r => {
    admin(r);
    gsync.promote();
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
    S.galThumb.run(ver, Date.now(), 1, id);
    removeThumbs(id, g.thumb_ver);
    sendJson(r.res, 200, { id, thumb_ver: ver, ...thumbUrls(id, ver) });
  });
  // Every stored profile's scenes become cards (the switch to "everything is public", run
  // once): insert-only and never hiding -- a profile can be older than what the page pushed
  // since -- and public at once (the scenes carry no edit time). ?dry=1 reports what it WOULD
  // do, per account, inside a transaction that is rolled back.
  on("POST", "/api/admin/backfill", r => {
    admin(r);
    const dry = r.url.searchParams.get("dry") === "1";
    const rep = { dry, accounts: [], errors: [] };
    const ROLLBACK = {};
    try {
      tx(db, () => {
        for (const p of S.profAll.all()) {
          try {
            const o = gsync.sync(p.uid, gsync.inflate(p.payload), { insertOnly: true });
            rep.accounts.push({ uid: p.uid, name: p.name, ...o });
          } catch (e) { rep.errors.push(p.uid + ": " + e.message); }
        }
        if (dry) throw ROLLBACK;
      });
    } catch (e) { if (e !== ROLLBACK) throw e; }
    const sum = k => rep.accounts.reduce((a, x) => a + x[k], 0);
    rep.total = { added: sum("added"), stock: sum("stock"), theirs: sum("theirs"), existing: sum("same"), skipped: sum("skipped") };
    sendJson(r.res, 200, rep);
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
