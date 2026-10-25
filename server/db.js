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

module.exports = { openDb, tx, SCHEMA_VERSION: MIGRATIONS.length };
