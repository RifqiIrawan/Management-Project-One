# 01 â€“ Kerangka Backend

**Status:** ðŸš§ (build & vet lolos; koneksi DB + health check belum diuji karena Docker Desktop belum berjalan)  
**Branch:** `main`

## Tujuan
Backend Go + Gin yang bisa berjalan, terhubung ke PostgreSQL, dan punya endpoint health check.

## Struktur folder
`backend/` dan `frontend/` dipisah di root repo. Backend mengikuti arsitektur berlapis
(handler â†’ service â†’ repository) dari spesifikasi Bagian 3â€“4.

## Yang dibuat
- `backend/go.mod` (module `github.com/RifqiIrawan/Management-Project-One/backend`)
- `internal/config` â€“ baca `.env`; `DB_PASSWORD` wajib diisi
- `internal/database` â€“ koneksi GORM + connection pool + ping
- `internal/router` â€“ Gin, CORS, logger/recovery, grup `/api/v1`
- `internal/pkg/response` & `apperror` â€“ format JSON seragam dan error standar
- `docker-compose.yml` â€“ PostgreSQL 16 (password dari `.env` root)
- `backend/.env.example`

## Konvensi akses database
- **GORM** untuk CRUD biasa (create, find by id, update, delete, relasi sederhana).
- **`db.Raw()` / `db.Exec()`** untuk query kompleks: agregasi dashboard, filter + pencarian bertingkat, join berat.
- Selalu pakai parameter `?` pada `Raw()` (jangan menyambung string) untuk mencegah SQL injection.
- Semua query hanya di layer **repository**.

## Endpoint API
| Method | Path | Auth | Keterangan |
|---|---|---|---|
| GET | `/api/v1/health` | â€“ | Status API + ping database |

## Cara mencoba
```bash
cp backend/.env.example backend/.env     # lalu isi DB_PASSWORD
echo DB_PASSWORD=isi_sama > .env         # untuk docker compose (root)
docker compose up -d
cd backend && go run ./cmd/api
curl http://localhost:8080/api/v1/health
```

## Catatan
- `.env` tidak masuk git (lihat `.gitignore`); hanya `.env.example`.
- Migrasi (`golang-migrate`) ditambahkan bersamaan fitur Auth (tabel `users`).

