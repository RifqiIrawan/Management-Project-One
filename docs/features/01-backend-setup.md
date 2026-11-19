# 01 – Kerangka Backend

**Status:** ✅  `GET /api/v1/health` terverifikasi (200, database terhubung)  
**Branch:** `main`

## Tujuan
Backend Go + Gin yang bisa berjalan, terhubung ke PostgreSQL, dan punya endpoint health check.

## Struktur folder
`backend/` dan `frontend/` dipisah di root repo. Backend mengikuti arsitektur berlapis
(handler → service → repository) dari spesifikasi Bagian 3–4.

## Yang dibuat
- `backend/go.mod` (module `github.com/RifqiIrawan/Management-Project-One/backend`)
- `internal/config` – baca `.env`; `DB_PASSWORD` wajib diisi
- `internal/database` – koneksi GORM + connection pool + ping
- `internal/router` – Gin, CORS, logger/recovery, grup `/api/v1`
- `internal/pkg/response` & `apperror` – format JSON seragam dan error standar
- Database memakai **PostgreSQL lokal** (tanpa Docker untuk saat ini)
- Server HTTP dengan timeout (ReadHeaderTimeout dll.) dan **graceful shutdown** (Ctrl+C / SIGTERM)
- Respons JSON standar untuk 404, 405, dan panic (middleware/recovery.go)
- .env terbaca baik saat dijalankan dari ackend/ maupun dari root repo
- `backend/.env.example`

## Konvensi akses database
- **GORM** untuk CRUD biasa (create, find by id, update, delete, relasi sederhana).
- **`db.Raw()` / `db.Exec()`** untuk query kompleks: agregasi dashboard, filter + pencarian bertingkat, join berat.
- Selalu pakai parameter `?` pada `Raw()` (jangan menyambung string) untuk mencegah SQL injection.
- Semua query hanya di layer **repository**.

## Endpoint API
| Method | Path | Auth | Keterangan |
|---|---|---|---|
| GET | `/api/v1/health` | – | Status API + ping database |

## Cara mencoba
```bash
cp backend/.env.example backend/.env     # lalu isi DB_PASSWORD
# buat role & database di PostgreSQL lokal (sekali saja), sebagai superuser postgres:
psql -U postgres -c "CREATE ROLE mpo LOGIN PASSWORD 'isi_sama_dengan_env';"
psql -U postgres -c "CREATE DATABASE management_project_one OWNER mpo;"
cd backend && go run ./cmd/api      # atau dari root: go run ./backend/cmd/api
curl http://localhost:6990/api/v1/health
```

## Catatan
- `.env` tidak masuk git (lihat `.gitignore`); hanya `.env.example`.
- Migrasi (`golang-migrate`) dijalankan otomatis saat start; lihat fitur 02.`n- Server menolak start jika `DB_PASSWORD`/`JWT_SECRET` masih berisi nilai contoh `ganti_dengan_...`.`n- Port frontend (CORS): `http://localhost:6969`.

**Tanggal selesai:** 2026-11-19
