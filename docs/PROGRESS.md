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
| 1 | Setup | Kerangka backend (config, DB, router, health check, PostgreSQL lokal) | ✅ | [01-backend-setup](features/01-backend-setup.md) |
| 2 | Auth | Register, login, JWT access + refresh, middleware, profil, ganti password | ✅ | [02-auth](features/02-auth.md) |
| 3 | Proyek | CRUD proyek, anggota, hak akses (RBAC) | ✅ | [03-projects](features/03-projects.md) |
| 4 | Tugas | CRUD tugas, nomor `MPO-x`, status Kanban, riwayat aktivitas (pencatatan) | ✅ | [04-tasks](features/04-tasks.md) |
| 5 | Pencarian | List, filter, pencarian, sort, pagination, Tugas Saya | ✅ | [05-search-filter](features/05-search-filter.md) |
| 6 | Kolaborasi | Komentar & riwayat aktivitas (pembacaan), `comment_count` | ✅ | [06-comments-activity](features/06-comments-activity.md) |
| 7 | Dashboard | Statistik, tugas jatuh tempo, proyek terbaru, aktivitas terbaru (`GET /dashboard`) | ✅ | [07-dashboard](features/07-dashboard.md) |
| 8 | Rilis | OpenAPI + Swagger UI, rate limit umum, hardening operasional, backup & restore, panduan deploy VPS (tanpa Docker), runner tes | ✅ | [08-release](features/08-release.md) |
| 9 | Keamanan | Tanda tangan HMAC tiap request (kunci per access token, anti-replay), diatur lewat env | ✅ | [09-request-signing](features/09-request-signing.md) |

## Frontend

🚧 **F1a selesai** (fondasi: Vite 8 + React 19 + TypeScript strict, port 6969, tipe API dihasilkan dari `openapi.yaml` lewat `npm run gen:api`,
penanda tangan request `src/utils/signature.ts` yang lulus 17 tes termasuk 9 vektor yang sama dengan Go dan PowerShell; `tsc` dan `vite build` bersih).
**F1b selesai** (Bootstrap SCSS + tema light/dark, klien API Axios dengan refresh token dan tanda tangan, login/register dengan validasi, route guard, kerangka aplikasi: sidebar, topbar, breadcrumb, 404).
60 tes lulus; tes live 6/6 lulus terhadap backend `API_SIGNATURE=enforce` (`LIVE_API_URL=http://localhost:6990/api/v1 npx vitest run src/api/live.test.ts`); `tsc` dan `vite build` bersih.
**F2 selesai** (dashboard: statistik, tugas jatuh tempo, aktivitas, proyek terbaru; daftar proyek dengan cari, arsip, favorit; buat proyek dengan saran kode; halaman proyek dengan tab Ringkasan/Anggota/Pengaturan; pengaturan owner: edit, arsip, hapus dengan ketik nama; anggota: undang dengan saran email, ubah peran, keluarkan, keluar sendiri; breadcrumb memakai nama proyek).
86 tes lulus (26 baru untuk F2); tes live F2 7/7 dan F1b 6/6 terhadap backend `API_SIGNATURE=enforce`; `tsc` dan `vite build` bersih.
Catatan: login/register dibatasi 5/menit/IP, jalankan dua file live berurutan (bukan paralel) agar tidak kena 429.
Berikutnya **F3**: Kanban (drag & drop), tabel tugas, filter, panel detail tugas, komentar & aktivitas. Halaman proyek sudah menyiapkan tempatnya (tab Ringkasan memuat catatan "hadir di F3").
Backend (fitur 0-9) sudah selesai dan kontrak API terkunci di `backend/docs/openapi.yaml`.

Rencana per tahap (tiap tahap diuji dan di-commit sendiri):

| Tahap | Isi |
|---|---|
| F1 | Fondasi (Vite, TypeScript, Bootstrap SCSS, tema light/dark, tipe API **dihasilkan dari `openapi.yaml`**), lapisan API dengan refresh token otomatis, **penanda tangan request TypeScript** (wajib lulus `backend/internal/pkg/sign/testdata/vectors.json`), login/register, route guard, kerangka aplikasi (sidebar, topbar, breadcrumb) |
| F2 | Dashboard, daftar proyek, pengaturan proyek, anggota |
| F3 | Kanban (drag & drop), tabel tugas, filter, panel detail tugas, komentar & aktivitas |
| F4 | Tugas Saya, profil, pencarian cepat (Ctrl+K), shortcut keyboard, empty state, skeleton, responsif |

Catatan teknis untuk frontend: kirim `X-Signature`, `X-Timestamp`, `X-Nonce` pada setiap request terautentikasi dengan `signing_key` dari login/refresh (disimpan di memori bersama access token);
saat menerima `SIGNATURE_EXPIRED`, sinkronkan jam dengan header `Date` respons lalu ulangi sekali. Gunakan `@noble/hashes` (HMAC/SHA-256 sinkron, jalan di HTTP non-secure) alih-alih WebCrypto.

## Aturan dokumentasi
1. Setiap fitur = satu file `docs/features/NN-nama-fitur.md` (pakai [`_template.md`](features/_template.md)).
2. Fitur dianggap selesai jika dokumennya terisi dan baris di tabel ini berstatus ✅.
3. Commit fitur memakai Conventional Commits, mis. `feat(auth): tambah login JWT`.
