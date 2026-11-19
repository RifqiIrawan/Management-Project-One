# 07 – Dashboard

**Status:** ✅  `e2e_dashboard.ps1` 41/41; regresi `e2e_comments` 83, `e2e_task_filters` 97, `e2e_tasks` 89, `e2e_projects` 68, `e2e_auth` 40, `e2e_race_owner` lulus  
**Tanggal selesai:** 2026-11-19  
**Spesifikasi:** Bagian 5.2, 8.3 (`GET /dashboard`), 10.2 (halaman Dashboard)

## Tujuan
Begitu login, anggota tim langsung melihat ringkasan pekerjaannya, dari **satu endpoint** (`GET /api/v1/dashboard`):
angka statistik, 5 tugas terdekat deadline-nya, kartu proyek dengan progress, dan 10 aktivitas terbaru.

## Yang dibuat
| Lapisan | File |
|---|---|
| DTO | `dto/dashboard_dto.go` (`DashboardResponse`, `DashboardStats`, `DashboardTask`) |
| Repository | `TaskRepository.StatsForUser`, `ActivityRepository.ListForUser`, `ProjectRepository.ListRecentForUser`, `TaskFilter.HasDue` |
| Service | `service/dashboard_service.go`; `ProjectService.ListRecent` + `withPreviews` (dibagi dengan daftar proyek); `toActivityResponse` (dibagi dengan riwayat tugas/proyek) |
| Handler | `handler/dashboard_handler.go` |

## Endpoint
| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/v1/dashboard` | 🔒 Semua data dashboard milik pemanggil dalam satu respons |

```json
{ "success": true, "data": {
  "user": { "id": "…", "name": "Budi", "avatar_color": "#6366F1" },
  "today": "2026-11-19", "week_end": "2026-11-22",
  "stats": { "total_tasks": 9, "open_tasks": 8, "completed_tasks": 1, "in_progress": 3, "due_this_week": 2, "overdue": 2 },
  "upcoming_tasks":    [ { "...tugas lengkap...", "is_overdue": true } ],
  "recent_projects":   [ { "...proyek + progress + members_preview..." } ],
  "recent_activities": [ { "message": "Sari memindahkan MPO-12 dari To Do ke In Progress", "project": {"key":"MPO","name":"…"}, "…": "…" } ] } }
```
Semua daftar selalu berupa `[]` (bukan `null`), termasuk untuk user baru. Sapaan ("Selamat pagi, Budi") disusun frontend menurut jam lokal browser; backend menyediakan `user.name`.

## Definisi angka
Cakupan semua statistik = tugas yang **di-assign ke saya**, di proyek **tidak terarsip** tempat saya masih anggota (sama persis dengan halaman Tugas Saya).

| Field | Arti |
|---|---|
| `total_tasks` | semua tugas saya, termasuk yang selesai |
| `open_tasks` | belum `done` |
| `completed_tasks` | `done` |
| `in_progress` | status `in_progress` (tidak termasuk `in_review`) |
| `due_this_week` | belum done, deadline hari ini s/d Minggu |
| `overdue` | belum done, deadline sebelum hari ini |

"Hari ini" / "Minggu" mengikuti `APP_TIMEZONE` (default `Asia/Jakarta`); `today` dan `week_end` dikembalikan agar frontend memakai acuan yang sama.

**Konsistensi dengan Tugas Saya (diuji di e2e):** `open_tasks` = `meta.total` dari `/me/tasks`; `overdue` = isi kelompok `overdue`; `due_this_week` = `today` + `this_week`; `completed_tasks` dan `in_progress` = `/me/tasks?status=…`.

## Komponen
- **`upcoming_tasks`**: maks. 5 tugas milik saya, belum done, punya deadline, urut deadline terdekat (lalu prioritas tertinggi). Yang sudah lewat otomatis di depan, ditandai **`is_overdue: true`** (dihitung server menurut zona waktu aplikasi, sehingga UI cukup mewarnai merah).
- **`recent_projects`**: maks. 6 proyek aktif (tidak terarsip), favorit dulu lalu terbaru; memuat `progress`, `task_count`, `done_count`, `member_count`, `my_role`, dan `members_preview` (avatar). Angkanya sama dengan detail proyek.
- **`recent_activities`**: 10 aktivitas terbaru dari proyek aktif yang saya ikuti, terbaru dulu, dengan kalimat Indonesia dan `project {id,name,key}`. Keluar dari proyek atau mengarsipkannya langsung menghilangkan aktivitasnya dari dashboard.

## Konvensi query (GORM vs `Raw()`)
Semua query dashboard memakai **`Raw()`**: agregat `COUNT(*) FILTER (...)` untuk semua angka statistik dalam **satu** query, join pencarian tugas yang dipakai bersama `/me/tasks`, dan `CROSS JOIN LATERAL` untuk aktivitas lintas proyek. Semua nilai dipasang sebagai parameter.

## Performa (diukur)
Data sintetis dalam transaksi yang di-rollback (tidak ada data sisa), pada **akun ekstrem**: 1 user di 20 proyek dengan **66.660 tugas** di-assign dan **200.000 aktivitas**.

| Bagian | Waktu |
|---|---|
| Statistik (satu agregat) | 40 ms (linear terhadap jumlah tugas milik user; memakai `idx_tasks_assignee`) |
| 5 tugas jatuh tempo | 12,7 ms (`idx_tasks_due_date`) |
| 10 aktivitas lintas proyek (**LATERAL**) | **0,43 ms** (membaca ±11 baris per proyek lewat `idx_activities_project`) |
| Pembanding: versi naif tanpa LATERAL | 67,7 ms (seq scan 200.000 baris), ±160× lebih lambat dan tumbuh bersama total riwayat |

Untuk user dengan puluhan sampai ratusan tugas, seluruh dashboard berada jauh di bawah 1 ms di sisi database.

## Cara mencoba
```bash
cd backend && go run ./cmd/api                      # http://localhost:6990
powershell -File backend/tests/e2e_dashboard.ps1    # 41 skenario
```
```bash
curl localhost:6990/api/v1/dashboard -H "Authorization: Bearer <token>"
```

## Testing
- **Unit**: bentuk JSON `DashboardTask` (rata, memuat `is_overdue`), daftar kosong berupa `[]`, info proyek pada aktivitas hanya bila ada.
- **E2E `e2e_dashboard.ps1`** (41): user tanpa data (semua nol, `[]`, tanggal WIB), statistik (total, open, selesai, in_progress, overdue, due_this_week) dengan data campuran termasuk **milik user lain, tanpa assignee, proyek terarsip, proyek yang sudah ditinggalkan**, **konsistensi silang dengan `/me/tasks`** (5 invarian), isi dan urutan `upcoming_tasks` + `is_overdue`, `recent_projects` (hanya aktif, urutan, favorit naik, batas 6, progress sama dengan detail proyek), `recent_activities` (tepat 10, urutan, kalimat Indonesia, tanpa proyek lain/arsip, hilang saat keluar proyek), dan perubahan data yang tercermin (tandai selesai, lepas assignee, hapus tugas, arsipkan/pulihkan).
- **Uji mutasi**: dengan filter proyek terarsip sengaja dicopot dari query statistik dan aktivitas, e2e langsung gagal di **11** pengecekan (termasuk konsistensi silang), sehingga terbukti tes ini peka terhadap bug tersebut. Kode sudah dikembalikan.
- Regresi: seluruh e2e fitur sebelumnya tetap lulus.

## Batasan
- Jumlah item tetap (5 / 6 / 10) sesuai spesifikasi; belum bisa diatur lewat query string.
- Aktivitas perubahan keanggotaan dan pengarsipan proyek belum dicatat, jadi belum muncul di dashboard.
- Tidak ada cache; setiap pemanggilan menjalankan 5 query ringan. Cukup untuk skala MVP.
