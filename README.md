# Management-Project-One

Aplikasi manajemen proyek & tugas untuk tim (terinspirasi Jira / ClickUp): proyek, anggota dengan hak akses,
papan Kanban, daftar tugas dengan filter, komentar, riwayat aktivitas, dan dashboard.

> **Status: backend MVP selesai (fitur 0-8). Frontend belum dimulai.**
> Progres per fitur: [`docs/PROGRESS.md`](docs/PROGRESS.md) · Spesifikasi lengkap: [`Management-Project-One.md`](Management-Project-One.md)

## Isi repo

| Folder | Isi |
|---|---|
| [`backend/`](backend/) | API REST: Go, Gin, GORM, PostgreSQL, JWT |
| [`frontend/`](frontend/) | Placeholder (React + TypeScript + Bootstrap, dikerjakan setelah backend) |
| [`docs/`](docs/) | [Progres](docs/PROGRESS.md), [dokumen per fitur](docs/features/), [panduan deploy](docs/DEPLOY.md) |
| [`scripts/`](scripts/) | Backup & restore database |

## Menjalankan backend (tanpa Docker)

Prasyarat: **Go 1.26+** (sesuai `go.mod`) dan **PostgreSQL 16+** yang berjalan (spesifikasi menargetkan 16+; diuji di 18).

```bash
# 1. buat role & database sekali saja (sebagai superuser PostgreSQL)
psql -U postgres -c "CREATE ROLE mpo LOGIN PASSWORD 'GANTI_PASSWORD';"
psql -U postgres -c "CREATE DATABASE management_project_one OWNER mpo;"

# 2. konfigurasi (file .env tidak ikut git)
cd backend
cp .env.example .env            # lalu isi DB_PASSWORD dan JWT_SECRET (openssl rand -hex 32)

# 3. jalankan; migrasi database berjalan otomatis
go run ./cmd/api                # http://localhost:6990
```

Server menolak start bila `DB_PASSWORD` / `JWT_SECRET` masih berisi nilai contoh atau terlalu lemah.

- **Cek kesehatan:** `GET http://localhost:6990/api/v1/health`
- **Dokumentasi API (Swagger UI):** http://localhost:6990/api/docs (aktif di development, nonaktif di production)
- **Spesifikasi OpenAPI:** [`backend/docs/openapi.yaml`](backend/docs/openapi.yaml)

## Konfigurasi (`backend/.env`)

| Variabel | Default | Keterangan |
|---|---|---|
| `APP_ENV` | `development` | `production` mewajibkan `COOKIE_SECURE=true`, log JSON, HSTS, Swagger mati |
| `PORT` | `6990` | Port API |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_NAME` `DB_SSLMODE` | `localhost` `5432` `mpo` `management_project_one` `disable` | Koneksi PostgreSQL |
| `DB_PASSWORD` | (wajib) | Password database |
| `JWT_SECRET` | (wajib) | Minimal 32 karakter acak |
| `JWT_ACCESS_TTL` `JWT_REFRESH_TTL` | `15m` `168h` | Masa berlaku token |
| `CORS_ORIGINS` | `http://localhost:6969` | Origin frontend (dipisah koma) |
| `COOKIE_SECURE` | `false` | `true` di produksi (HTTPS) |
| `BCRYPT_COST` | `12` | 10-14 |
| `APP_TIMEZONE` | `Asia/Jakarta` | Acuan "hari ini / minggu ini" untuk deadline |
| `API_RATE_LIMIT_PER_MIN` | `100` | Batas request per user per menit; `0` = nonaktif |
| `TRUSTED_PROXIES` | (kosong) | IP/CIDR reverse proxy (mis. `127.0.0.1`) agar IP klien benar |
| `SWAGGER_ENABLED` | aktif bila bukan production | Swagger UI di `/api/docs` |
| `TOKEN_CLEANUP_INTERVAL` | `1h` | Pembersihan refresh token kedaluwarsa (`0` = nonaktif) |

## Fitur backend

Auth (JWT access + refresh dengan rotasi dan deteksi pencurian) · proyek & anggota (owner/member) ·
tugas dengan nomor `MPO-12`, Kanban, posisi desimal · filter, pencarian, sort, pagination, "Tugas Saya" ·
komentar · riwayat aktivitas · dashboard satu endpoint. Detail dan keputusan desain tiap fitur ada di
[`docs/features/`](docs/features/).

## Pengujian

```bash
cd backend
go test ./...                                   # unit test (tanpa database)
powershell -File tests/run_all.ps1 -Quick       # + gofmt, vet, build, tes kontrak OpenAPI
powershell -File tests/run_all.ps1              # SEMUA: e2e fitur 2-7, uji race, uji operasional (±15 menit)
```

- **Tes kontrak** memvalidasi respons API sungguhan terhadap `openapi.yaml` (dokumen API ditulis tangan, jadi
  tes inilah yang menjaganya tetap benar). Tes lain mencocokkan seluruh route dengan dokumen.
- Skrip e2e memanggil API jauh lebih sering dari batas umum 100/menit/user, jadi dijalankan pada server dengan
  `API_RATE_LIMIT_PER_MIN=0` (dilakukan otomatis oleh `run_all.ps1`). Jika menjalankannya manual, nyalakan server
  dengan `API_RATE_LIMIT_PER_MIN=0`, dan pakai server baru untuk tiap suite (batas login/register 5/menit/IP).

## Backup & deploy

- Backup/restore database: [`scripts/backup-db.sh`](scripts/backup-db.sh), [`scripts/restore-db.sh`](scripts/restore-db.sh)
- Deploy ke VPS (systemd + Nginx/Caddy, tanpa Docker) dan checklist rilis: [`docs/DEPLOY.md`](docs/DEPLOY.md)

## Konvensi

Branch `main`; commit Conventional Commits (`feat(task): ...`, `fix(auth): ...`, `docs: ...`). Setiap fitur punya
dokumen di `docs/features/` dan baris di `docs/PROGRESS.md`. File `.env` dan backup database tidak pernah di-commit.
