#!/usr/bin/env bash
# Backup database PostgreSQL Management-Project-One (format custom pg_dump, terkompresi).
#
# Cara pakai:   scripts/backup-db.sh
# Terjadwal:    lihat docs/DEPLOY.md (cron harian). Kredensial dibaca dari environment atau backend/.env.
#
# Variabel (semua opsional kecuali DB_PASSWORD):
#   DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME   koneksi (default: localhost 5432 mpo - management_project_one)
#   ENV_FILE         file .env sumber kredensial (default: backend/.env)
#   BACKUP_DIR       folder hasil (default: ./backups, izin 700)
#   RETENTION_DAYS   backup lebih tua dari ini dihapus (default: 14)
#
# Jaminan: backup ditulis ke file sementara, DIVERIFIKASI (pg_restore --list memuat tabel inti), baru
# diganti namanya. Backup yang gagal/korup tidak pernah menimpa atau menghapus backup yang baik,
# dan pembersihan backup lama hanya berjalan setelah backup baru terverifikasi.
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../backend/.env}"

# Ambil satu variabel dari .env tanpa mengeksekusi file (aman terhadap isi sembarang).
load_env() {
  local key="$1" line
  if [ -z "${!key:-}" ] && [ -f "$ENV_FILE" ]; then
    line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 || true)"
    if [ -n "$line" ]; then export "$key=${line#*=}"; fi
  fi
}
for k in DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME; do load_env "$k"; done

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-mpo}"
DB_NAME="${DB_NAME:-management_project_one}"
: "${DB_PASSWORD:?DB_PASSWORD tidak ditemukan (isi environment atau $ENV_FILE)}"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/../backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

case "$RETENTION_DAYS" in ''|*[!0-9]*) echo "RETENTION_DAYS harus angka" >&2; exit 2 ;; esac
command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump tidak ditemukan di PATH" >&2; exit 2; }
command -v pg_restore >/dev/null 2>&1 || { echo "pg_restore tidak ditemukan di PATH" >&2; exit 2; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

stamp="$(date +%Y%m%d-%H%M%S)"
final="$BACKUP_DIR/${DB_NAME}-${stamp}.dump"
tmp="${final}.partial"
trap 'rm -f "$tmp" "$tmp.list"' EXIT

export PGPASSWORD="$DB_PASSWORD"   # lewat environment, tidak pernah di baris perintah / log
echo "[$(date '+%F %T')] backup ${DB_NAME}@${DB_HOST}:${DB_PORT} sebagai ${DB_USER}"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --format=custom --no-owner --no-privileges --file="$tmp"

# Verifikasi: dump bisa dibaca dan memuat tabel inti aplikasi.
pg_restore --list "$tmp" > "$tmp.list"
missing=""
for t in users refresh_tokens projects project_members tasks comments activities schema_migrations; do
  grep -Eq "TABLE public ${t} " "$tmp.list" || missing="$missing $t"
done
if [ -n "$missing" ]; then
  echo "GAGAL: dump tidak memuat tabel:$missing (backup dibuang)" >&2
  exit 1
fi

mv "$tmp" "$final"
chmod 600 "$final" 2>/dev/null || true
size="$(wc -c < "$final" | tr -d ' ')"
echo "OK: $final (${size} byte, terverifikasi)"

# Hapus backup lama (hanya setelah backup baru terverifikasi).
deleted="$(find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}-*.dump" -type f -mtime +"$RETENTION_DAYS" -print -delete | wc -l | tr -d ' ')"
echo "Retensi ${RETENTION_DAYS} hari: ${deleted} backup lama dihapus."
