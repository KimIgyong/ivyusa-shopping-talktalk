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

This replaces live data. Stop the API first if customers are connected.
WARN
read -r -p "Type RESTORE to continue: " confirm
[[ "$confirm" == "RESTORE" ]] || { echo "aborted"; exit 1; }

echo "==> Restoring the database ..."
gunzip -c "$SRC/db.sql.gz" | docker exec -i "$MYSQL_CONTAINER" sh -lc \
  'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' 2>/dev/null

echo "==> Restoring uploads ..."
# Cleared first: leaving the previous files behind would hide a backup that is
# actually missing them.
docker exec "$API_CONTAINER" sh -lc 'rm -rf /data/uploads/* /data/uploads/.[!.]* 2>/dev/null || true'
docker exec -i "$API_CONTAINER" sh -lc 'cd /data/uploads && tar xzf -' < "$SRC/uploads.tar.gz"

echo "==> Checking the two halves agree ..."
missing="$(docker exec "$MYSQL_CONTAINER" sh -lc \
  'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B "$MYSQL_DATABASE" -e "SELECT storage_path FROM message_attachments"' \
  2>/dev/null | tr -d '\r' | while read -r p; do
    [[ -z "$p" ]] && continue
    docker exec "$API_CONTAINER" sh -lc "test -f '/data/uploads/$p'" || echo "$p"
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
echo "    Restart the API so it picks up the restored state:  docker restart $API_CONTAINER"
