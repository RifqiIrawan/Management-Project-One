#!/usr/bin/env bash
# Pulihkan backup (hasil scripts/backup-db.sh) ke sebuah database.
#
# Cara pakai:   scripts/restore-db.sh <file.dump> <nama_database_tujuan>
#
# Keamanan: skrip ini TIDAK menimpa database yang sudah berisi tabel. Untuk memulihkan ke produksi,
# hentikan aplikasi lalu (DROP + CREATE) database tujuan secara sadar, atau set FORCE_OVERWRITE=1
# (memakai --clean --if-exists). Database tujuan dibuat bila belum ada (butuh hak CREATEDB).
#
# Kredensial: DB_HOST DB_PORT DB_USER DB_PASSWORD dari environment atau backend/.env (lihat backup-db.sh).
# Setelah restore, jumlah baris tabel inti dicetak agar mudah dibandingkan dengan sumbernya.
set -euo pipefail
umask 077

if [ "$#" -ne 2 ]; then
  echo "Pemakaian: $0 <file.dump> <nama_database_tujuan>" >&2
  exit 2
fi
DUMP="$1"
TARGET="$2"
[ -f "$DUMP" ] || { echo "File tidak ditemukan: $DUMP" >&2; exit 2; }
case "$TARGET" in *[!A-Za-z0-9_]*|'') echo "Nama database hanya boleh huruf, angka, underscore" >&2; exit 2 ;; esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../backend/.env}"
load_env() {
  local key="$1" line
  if [ -z "${!key:-}" ] && [ -f "$ENV_FILE" ]; then
    line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 || true)"
    if [ -n "$line" ]; then export "$key=${line#*=}"; fi
  fi
}
for k in DB_HOST DB_PORT DB_USER DB_PASSWORD; do load_env "$k"; done
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-mpo}"
: "${DB_PASSWORD:?DB_PASSWORD tidak ditemukan (isi environment atau $ENV_FILE)}"
export PGPASSWORD="$DB_PASSWORD"

psqlc() { psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -tA "$@"; }

pg_restore --list "$DUMP" >/dev/null || { echo "File dump tidak valid / korup" >&2; exit 1; }

exists="$(psqlc -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$TARGET'")"
if [ "$exists" != "1" ]; then
  echo "Membuat database $TARGET"
  createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TARGET"
else
  tables="$(psqlc -d "$TARGET" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")"
  if [ "$tables" != "0" ] && [ "${FORCE_OVERWRITE:-0}" != "1" ]; then
    echo "Database $TARGET sudah berisi $tables tabel; dibatalkan. (FORCE_OVERWRITE=1 untuk menimpa)" >&2
    exit 1
  fi
fi

clean=""
[ "${FORCE_OVERWRITE:-0}" = "1" ] && clean="--clean --if-exists"
echo "Memulihkan $DUMP -> $TARGET"
# shellcheck disable=SC2086
pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET" --no-owner --exit-on-error $clean "$DUMP"

echo "Selesai. Jumlah baris:"
psqlc -d "$TARGET" -c "SELECT 'users='||(SELECT COUNT(*) FROM users)||' projects='||(SELECT COUNT(*) FROM projects)||' tasks='||(SELECT COUNT(*) FROM tasks)||' comments='||(SELECT COUNT(*) FROM comments)||' activities='||(SELECT COUNT(*) FROM activities)||' refresh_tokens='||(SELECT COUNT(*) FROM refresh_tokens)"
