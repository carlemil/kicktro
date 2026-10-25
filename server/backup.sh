#!/usr/bin/env bash
# Nightly backup of the Kicktro database: a consistent SQLite copy (VACUUM INTO), gzipped,
# encrypted, into talebindery's private R2 bucket under kicktro/. Reuses talebindery's
# credentials file and its rclone "crypt" setup (MyStoryGenerator infra/backup.sh), so there
# is no unencrypted path and no second set of keys to look after.
# Thumbnails are not backed up: tools/thumbs.js re-renders them.
#
# cron, as the deploy user:
#   40 3 * * * bash /srv/kicktro/server/backup.sh >> $HOME/kicktro-backup.log 2>&1
#
# KICKTRO_BACKUP_PING_URL (optional, in the same credentials file) is a healthchecks.io check
# for THIS job; talebindery's BACKUP_PING_URL is left alone so the two never mask each other.
set -euo pipefail

CREDS=${BACKUP_ENV:-$HOME/.config/talebindery-backup.env}
RCLONE=rclone/rclone:1.75
NAME=kicktro-$(date +%F).db.gz
tmp=
ping=

finish() {
  rc=$?
  trap - EXIT
  [ -z "$tmp" ] || rm -rf "$tmp"
  docker exec kicktro-api node -e "require('fs').rmSync('/data/backup.db',{force:true})" >/dev/null 2>&1 || true
  if [ "$rc" -ne 0 ]; then
    echo "$(date '+%F %T') kicktro: NOT BACKED UP (exit $rc)" >&2
    [ -z "$ping" ] || curl -fsS -m 20 --retry 2 --data-raw "kicktro backup failed (exit $rc)" "$ping/fail" >/dev/null || true
  fi
  exit "$rc"
}
trap finish EXIT

[ -r "$CREDS" ] || { echo "kicktro: no credentials at $CREDS" >&2; exit 1; }
KICKTRO_BACKUP_PING_URL=
. "$CREDS"
ping=${KICKTRO_BACKUP_PING_URL%/}
for v in BACKUP_R2_ENDPOINT BACKUP_R2_ACCESS_KEY_ID BACKUP_R2_SECRET_ACCESS_KEY BACKUP_R2_BUCKET BACKUP_CRYPT_PASSWORD; do
  [ -n "${!v:-}" ] || { echo "kicktro: $v is not set in $CREDS" >&2; exit 1; }
done
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENDPOINT="$BACKUP_R2_ENDPOINT"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$BACKUP_R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
export RCLONE_CONFIG_R2CRYPT_TYPE=crypt
export RCLONE_CONFIG_R2CRYPT_REMOTE="r2:$BACKUP_R2_BUCKET/encrypted"
export RCLONE_CONFIG_R2CRYPT_PASSWORD="$BACKUP_CRYPT_PASSWORD"
export RCLONE_CONFIG_R2CRYPT_FILENAME_ENCRYPTION=off
export RCLONE_CONFIG_R2CRYPT_DIRECTORY_NAME_ENCRYPTION=false

# A consistent copy while the server keeps running (WAL mode): VACUUM INTO is one read
# transaction. /data is the volume; the container's root filesystem is read-only.
docker exec kicktro-api node --disable-warning=ExperimentalWarning -e "
  const fs = require('fs'); const { DatabaseSync } = require('node:sqlite');
  fs.rmSync('/data/backup.db', { force: true });
  const db = new DatabaseSync('/data/kicktro.db');
  db.exec(\"vacuum into '/data/backup.db'\");
  const n = new DatabaseSync('/data/backup.db').prepare('select count(*) n from users').get().n;
  console.log('kicktro: snapshot has ' + n + ' users');"

tmp=$(mktemp -d "${TMPDIR:-/tmp}/kicktro-backup.XXXXXX")
docker cp -q kicktro-api:/data/backup.db "$tmp/kicktro.db"
gzip -9 "$tmp/kicktro.db"

docker run --rm -v "$tmp:/in:ro" \
  -e RCLONE_CONFIG_R2_TYPE -e RCLONE_CONFIG_R2_PROVIDER -e RCLONE_CONFIG_R2_ENDPOINT \
  -e RCLONE_CONFIG_R2_ACCESS_KEY_ID -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY \
  -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET \
  -e RCLONE_CONFIG_R2CRYPT_TYPE -e RCLONE_CONFIG_R2CRYPT_REMOTE \
  -e RCLONE_CONFIG_R2CRYPT_PASSWORD -e RCLONE_CONFIG_R2CRYPT_FILENAME_ENCRYPTION \
  -e RCLONE_CONFIG_R2CRYPT_DIRECTORY_NAME_ENCRYPTION \
  "$RCLONE" -q copyto /in/kicktro.db.gz "r2crypt:kicktro/$NAME"

echo "$(date '+%F %T') kicktro: backed up $NAME ($(stat -c %s "$tmp/kicktro.db.gz") bytes)"
[ -z "$ping" ] || curl -fsS -m 20 --retry 2 --data-raw "kicktro backup ok: $NAME" "$ping" >/dev/null || true
