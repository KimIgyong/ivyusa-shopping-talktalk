#!/usr/bin/env bash
# ShopTalk — restore a self-hosted deployment (PLN-260820 W4).
#
#   bash scripts/restore-self-hosted.sh <backup-dir>
#
# Restores BOTH archives and then checks they agree: an attachment row whose
# file is missing is a half-restored system, and it looks fine until someone
# opens a conversation from last month.
set -euo pipefail

SRC="${1:-}"
[[ -n "$SRC" && -d "$SRC" ]] || { echo "usage: $0 <backup-dir>" >&2; exit 2; }
MYSQL_CONTAINER="${MYSQL_CONTAINER:-shoptalk_mysql}"
API_CONTAINER="${API_CONTAINER:-shoptalk_api}"

for f in db.sql.gz uploads.tar.gz; do
  [[ -s "$SRC/$f" ]] || { echo "ERROR: $SRC/$f is missing or empty" >&2; exit 1; }
done

cat <<WARN
About to overwrite the database and the uploads volume of:
  mysql : $MYSQL_CONTAINER
  api   : $API_CONTAINER
from $SRC

This replaces live data. The API is stopped for the duration so nothing is
written while the two halves are out of step, and started again at the end.
WARN
read -r -p "Type RESTORE to continue: " confirm
[[ "$confirm" == "RESTORE" ]] || { echo "aborted"; exit 1; }

# Telling the operator to stop the API was not enough: a conversation or an
# upload landing mid-restore leaves rows and files from different moments, which
# is exactly the inconsistency this script checks for at the end.
api_was_running=false
if docker ps --format '{{.Names}}' | grep -qx "$API_CONTAINER"; then
  api_was_running=true
  echo "==> Stopping $API_CONTAINER for the restore ..."
  docker stop "$API_CONTAINER" >/dev/null
fi
restart_api() {
  if [[ "$api_was_running" == true ]]; then
    echo "==> Starting $API_CONTAINER ..."
    docker start "$API_CONTAINER" >/dev/null
  fi
}
trap restart_api EXIT

echo "==> Restoring the database ..."
gunzip -c "$SRC/db.sql.gz" | docker exec -i "$MYSQL_CONTAINER" sh -lc \
  'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' 2>/dev/null

echo "==> Restoring uploads ..."
# A throwaway container mounted on the same volume, so the API can stay stopped.
# Cleared first: leaving the previous files behind would hide a backup that is
# actually missing them.
UPLOADS_VOLUME="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data/uploads"}}{{.Name}}{{end}}{{end}}' "$API_CONTAINER")"
[[ -n "$UPLOADS_VOLUME" ]] || { echo "ERROR: could not find the uploads volume on $API_CONTAINER" >&2; exit 1; }
docker run --rm -i -v "$UPLOADS_VOLUME":/data/uploads alpine:3 sh -lc \
  'rm -rf /data/uploads/* /data/uploads/.[!.]* 2>/dev/null; cd /data/uploads && tar xzf -' < "$SRC/uploads.tar.gz"

echo "==> Checking the two halves agree ..."
missing="$(docker exec "$MYSQL_CONTAINER" sh -lc \
  'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B "$MYSQL_DATABASE" -e "SELECT storage_path FROM message_attachments"' \
  2>/dev/null | tr -d '\r' | while read -r p; do
    [[ -z "$p" ]] && continue
    docker run --rm -v "$UPLOADS_VOLUME":/data/uploads alpine:3 sh -lc "test -f '/data/uploads/$p'" || echo "$p"
  done | wc -l | tr -d '[:space:]')"

rows="$(docker exec "$MYSQL_CONTAINER" sh -lc \
  'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM message_attachments"' \
  2>/dev/null | tr -d '[:space:]')"

echo "    attachment rows      : $rows"
echo "    rows with no file    : $missing"

if [[ "$missing" != "0" ]]; then
  echo
  echo "FAIL — $missing attachment(s) have no file on disk. The uploads archive does" >&2
  echo "       not match this database dump; they were probably taken at different times." >&2
  exit 1
fi

echo
echo "OK — database and uploads restored and consistent."
echo "    The API is being started again now."
