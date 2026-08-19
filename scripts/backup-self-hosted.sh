#!/usr/bin/env bash
# ShopTalk — back up a self-hosted deployment (PLN-260820 W4).
#
#   bash scripts/backup-self-hosted.sh [destination-dir]
#
# TWO archives, because the data lives in two places:
#   db.sql.gz       conversations, customers, settings
#   uploads.tar.gz  chat attachments and the widget logo
#
# A database-only backup restores a system where every conversation still
# mentions a photo that no longer exists. That is the failure this script exists
# to prevent, so it refuses to finish if it only managed one of them.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="${1:-$REPO_ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-shoptalk_mysql}"
API_CONTAINER="${API_CONTAINER:-shoptalk_api}"

mkdir -p "$DEST"
echo "==> Backing up to $DEST"

# --single-transaction takes a consistent snapshot without locking the tables,
# so a backup does not stop customers from chatting while it runs.
echo "    database ..."
docker exec "$MYSQL_CONTAINER" sh -lc \
  'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
  2>/dev/null | gzip > "$DEST/db.sql.gz"

echo "    uploads ..."
docker exec "$API_CONTAINER" sh -lc 'cd /data/uploads && tar czf - .' > "$DEST/uploads.tar.gz"

# What the pair must agree about: every attachment row should have a file.
rows="$(docker exec "$MYSQL_CONTAINER" sh -lc \
  'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM message_attachments"' \
  2>/dev/null | tr -d '[:space:]')"
files="$(docker exec "$API_CONTAINER" sh -lc 'find /data/uploads -type f | wc -l' | tr -d '[:space:]')"

cat > "$DEST/manifest.txt" <<MANIFEST
taken_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
commit=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)
attachment_rows=$rows
upload_files=$files
db_bytes=$(wc -c < "$DEST/db.sql.gz")
uploads_bytes=$(wc -c < "$DEST/uploads.tar.gz")
MANIFEST

echo
echo "    attachment rows : $rows"
echo "    files on disk   : $files   (thumbnails make this larger than the row count)"
cat "$DEST/manifest.txt"

for f in db.sql.gz uploads.tar.gz; do
  if [[ ! -s "$DEST/$f" ]]; then
    echo "FAIL — $f is empty. This backup cannot restore a working system." >&2
    exit 1
  fi
done

echo
echo "OK — both archives written."
echo "    Copy $DEST somewhere that does not share a failure domain with this host."
