# Progres Pengerjaan

> Satu-satunya tempat untuk melihat **project sudah sampai fitur mana**.
> Setiap fitur punya dokumen sendiri di [`docs/features/`](features/). Update file ini setiap fitur selesai.
> Spesifikasi lengkap: [`Management-Project-One.md`](../Management-Project-One.md).

Legenda: ✅ selesai · 🚧 sedang dikerjakan · ⏳ belum dimulai

**Terakhir diperbarui:** 2026-11-19

## Backend (dikerjakan lebih dulu)

| # | Fase | Fitur | Status | Dokumen |
|---|---|---|---|---|
| 0 | Setup | Koneksi Git & GitHub, `.gitignore` | ✅ | [00-git-setup](features/00-git-setup.md) |
| 1 | Setup | Kerangka backend (config, DB, router, health check, Docker Postgres) | 🚧 | [01-backend-setup](features/01-backend-setup.md) |
| 2 | Auth | Register, login, JWT access + refresh, middleware | ⏳ | — |
| 3 | Proyek | CRUD proyek, anggota, hak akses (RBAC) | ⏳ | — |
| 4 | Tugas | CRUD tugas, nomor `MPO-x`, status Kanban | ⏳ | — |
| 5 | Pencarian | List, filter, pencarian, Tugas Saya | ⏳ | — |
| 6 | Kolaborasi | Komentar & riwayat aktivitas | ⏳ | — |
| 7 | Dashboard | Statistik dashboard | ⏳ | — |
| 8 | Rilis | Swagger, testing, Docker produksi | ⏳ | — |

## Frontend

⏳ Dimulai setelah backend MVP selesai.

## Aturan dokumentasi
1. Setiap fitur = satu file `docs/features/NN-nama-fitur.md` (pakai [`_template.md`](features/_template.md)).
2. Fitur dianggap selesai jika dokumennya terisi dan baris di tabel ini berstatus ✅.
3. Commit fitur memakai Conventional Commits, mis. `feat(auth): tambah login JWT`.
