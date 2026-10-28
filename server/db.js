"use strict";
// The API's storage: ONE SQLite file through Node's built-in node:sqlite (no npm package).
//
// MIGRATIONS IS APPEND-ONLY. A released entry never changes: a server that already ran it
// would never see the edit. Change the schema by appending a new entry; `pragma user_version`
// records how many have run, and each runs inside its own transaction with the version bump.
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

const MIGRATIONS = [
  // 1 -- the initial schema (card 825, M1).
  `
  -- One row per Google account. uid is OURS (20 chars, the same shape as a Firestore id);
  -- google_sub is the stable Google subject; firebase_uid is the uid the account had on
  -- Firebase, kept so a migrated profile, a stored collection follow and an old link that
  -- names it keep resolving. name is the PUBLIC profile name, never the Google name.
  create table users (
    uid          text primary key,
    google_sub   text not null unique,
    firebase_uid text unique,
    name         text not null default '',
    token_ver    integer not null default 0,
    created      integer not null
  );

  -- A user's whole scene library: the same deflated blob cloudBlob() builds. updated is
  -- milliseconds and strictly increases; it is the version a save's If-Match names.
  create table profiles (
    uid     text primary key references users(uid) on delete cascade,
    name    text not null,
    payload text not null,
    count   integer not null,
    pub     integer not null,
    updated integer not null
  );
  create index profiles_pub on profiles(pub, updated);

  -- The #c= share links. Immutable; ids imported from Firestore keep their exact value.
  -- owner is null for an imported share whose Firebase account could not be mapped.
  create table shares (
    id      text primary key,
    owner   text references users(uid) on delete cascade,
    name    text not null,
    payload text not null,
    created integer not null
  );
  create index shares_owner on shares(owner, created);

  -- One published scene per row. thumb_ver 0 = no thumbnail yet; each upload bumps it and
  -- names the files (<id>-<ver>.webp/.mp4), so a thumbnail URL is immutable.
  create table gallery (
    id        text primary key,
    owner     text not null references users(uid) on delete cascade,
    name      text not null,
    payload   text not null,
    created   integer not null,
    thumb_ver integer not null default 0
  );
  create index gallery_owner on gallery(owner, created);
  create index gallery_created on gallery(created);

  -- Favourites. scene_id is a gallery id OR a built-in id ('builtin:<slug>'), so there is no
  -- foreign key to gallery: deleting a gallery row deletes its favs in the same transaction.
  -- Counts are always COUNTED, never a stored counter, so they cannot drift.
  create table favs (
    uid      text not null references users(uid) on delete cascade,
    scene_id text not null,
    created  integer not null,
    primary key (uid, scene_id)
  );
  create index favs_scene on favs(scene_id);
  `,

  // 2 -- dislikes, the gallery's broken heart. Their own table rather than a sign on favs, so
  // favs keeps meaning "loves" for every reader that already counts it (an older client's
  // heart, My favourites). One vote per person per scene: a route writing one deletes the
  // other in the same transaction. Most loved orders by loves minus dislikes.
  `
  create table hates (
    uid      text not null references users(uid) on delete cascade,
    scene_id text not null,
    created  integer not null,
    primary key (uid, scene_id)
  );
  create index hates_scene on hates(scene_id);
  `,

  // 3 -- every scene of your own is a card (gallery-sync.js), signed in or not. skey is the
  // scene's key inside its owner's library ('s:<sid>' from a client, 'n:<name>' from a
  // backfilled profile); null = a card published by hand before this (kept as it is).
  // An edit is not public for an hour: it waits in pend/pend_name/pend_hash with `edited`
  // the time of the edit, and is promoted over payload once edited is that old. payload ''
  // = never public yet (it is NOT NULL from migration 1). gone = the scene left its owner's
  // library: hidden, votes kept, back if the scene comes back. pub_at = when payload last
  // changed, thumb_at = when the thumbnail was rendered, so a promoted edit re-renders.
  // users.anon = an account with no Google sign-in: one browser's signed-out scenes.
  `
  alter table gallery add column skey text;
  alter table gallery add column pend text;
  alter table gallery add column pend_name text;
  alter table gallery add column pend_hash text;
  alter table gallery add column pub_hash text;
  alter table gallery add column edited integer not null default 0;
  alter table gallery add column gone integer not null default 0;
  alter table gallery add column pub_at integer not null default 0;
  alter table gallery add column thumb_at integer not null default 0;
  create unique index gallery_skey on gallery(owner, skey) where skey is not null;
  create index gallery_pend on gallery(edited) where pend is not null;
  alter table users add column anon integer not null default 0;
  `,
  // thumb_clip 0 = the thumbnail is a POSTER ONLY, rendered by the first visitor's browser
  // (PUT /api/gallery/:id/thumb, no clip); tools/thumbs.js --server replaces it with a real
  // render, which is also what undoes a bad upload.
  `
  alter table gallery add column thumb_clip integer not null default 1;
  `,
  // 5 -- a card its owner DELETED (the gallery's ✕ on one of your scenes): deleted for
  // everyone, votes and thumbnail with it, and never made again from that scene. The page
  // drops the scene from its library too, but another device (or an upload already in
  // flight) can still push it: sync skips a key listed here, and an n: key's name.
  `
  create table gallery_dead (
    owner text not null references users(uid) on delete cascade,
    skey  text not null,
    name  text not null,
    at    integer not null,
    primary key (owner, skey)
  );
  `,
  // 6 -- crash reports (POST /api/errors): what a visitor's page threw, so it can be fixed.
  // One row per KIND of error: fp hashes the kind, the message with its numbers blurred and
  // the function at the top of the stack -- not its line, which moves with every release.
  // The rest is the LATEST sample. count = reports, stalled = reports whose page stopped
  // rendering after it (the banner showed), first/last = when. No uid, no IP: the page sends
  // none, and the route stores what the body carries plus the User-Agent.
  `
  create table errors (
    fp      text primary key,
    kind    text not null,
    msg     text not null,
    src     text not null,
    stack   text not null,
    ctx     text not null,
    version text not null,
    path    text not null,
    ua      text not null,
    count   integer not null,
    stalled integer not null,
    first   integer not null,
    last    integer not null
  );
  create index errors_last on errors(last);
  `,
  // 7 -- how HEAVY a card is to run: GPU-or-CPU ms per frame (whichever is larger) at 1920x1080
  // on the machine tools/thumbs.js runs on, measured with every full render. NULL = not
  // measured yet (the todo lists it). Only comparable with itself: a slower device takes longer
  // for all of them alike, which is what the gallery's weight slider relies on.
  `
  alter table gallery add column cost real;
  `,
];

function openDb(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000; pragma synchronous = normal;");
  const have = db.prepare("pragma user_version").get().user_version;
  if (have > MIGRATIONS.length) {
    throw new Error("database schema v" + have + " is newer than this server (v" + MIGRATIONS.length + ")");
  }
  for (let i = have; i < MIGRATIONS.length; i++) {
    db.exec("begin immediate");
    try {
      db.exec(MIGRATIONS[i]);
      db.exec("pragma user_version = " + (i + 1));
      db.exec("commit");
    } catch (e) {
      db.exec("rollback");
      throw e;
    }
  }
  return db;
}

// Run fn inside one write transaction. `begin immediate` takes the write lock up front, so
// two requests cannot both read-then-write the same row (the profile precondition relies on it).
function tx(db, fn) {
  db.exec("begin immediate");
  try {
    const r = fn();
    db.exec("commit");
    return r;
  } catch (e) {
    db.exec("rollback");
    throw e;
  }
}

module.exports = { openDb, tx, SCHEMA_VERSION: MIGRATIONS.length, MIGRATIONS };
