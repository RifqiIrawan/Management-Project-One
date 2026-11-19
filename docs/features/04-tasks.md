# 04 – Tugas & Kanban

**Status:** ✅  `e2e_tasks.ps1` 89/89; regresi `e2e_auth` 40/40, `e2e_projects` 68/68, `e2e_race_owner` lulus  
**Tanggal selesai:** 2026-11-19  
**Spesifikasi:** Bagian 5.5, 5.6, 6.2 (tasks, activities), 6.3, 8.6

## Tujuan
Anggota proyek bisa membuat, mengedit, memindahkan (Kanban), meng-assign, dan menghapus tugas dengan nomor otomatis `MPO-12`.
Backend siap dipakai board drag & drop (posisi desimal), dan setiap perubahan penting tercatat di riwayat.

## Yang dibuat
| Lapisan | File |
|---|---|
| Migrasi | `000005_create_tasks`, `000006_create_activities` |
| Model | `model/task.go` (`Task`, konstanta status, `StringArray` untuk `TEXT[]`) |
| DTO | `dto/task_dto.go`, `dto/optional.go` (`Optional[T]`: beda "tidak dikirim" vs `null`) |
| Repository | `repository/task_repository.go` |
| Service | `service/task_service.go` |
| Handler | `handler/task_handler.go` |
| Perubahan fitur lain | `ProjectRow`/respons proyek + `task_count`, `done_count`, `progress`; `MemberService.Remove` meng-unassign tugas; `response.Err` memetakan karakter NUL ke 400 |

## Endpoint API
Semua butuh `Authorization: Bearer <access_token>` dan keanggotaan proyek (non-anggota → **404**).

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/v1/projects/:projectId/tasks` | Daftar tugas proyek. `?view=board` → `{todo, in_progress, in_review, done}` urut Kanban (kolom kosong = `[]`). Filter, pencarian, sort, dan pagination: lihat [fitur 05](05-search-filter.md) |
| POST | `/api/v1/projects/:projectId/tasks` | Buat tugas. Hanya `title` yang wajib |
| GET | `/api/v1/tasks/:taskId` | Detail tugas |
| PATCH | `/api/v1/tasks/:taskId` | Edit sebagian field; `null` mengosongkan `description`, `assignee_id`, `start_date`, `due_date` |
| PATCH | `/api/v1/tasks/:taskId/move` | `{status, position?}` pindah kolom / urutan (drag & drop) |
| DELETE | `/api/v1/tasks/:taskId` | Hapus: pembuat tugas atau owner proyek (selain itu 403) |

Field tugas: `title` (maks. 200), `description` (maks. 20.000), `status` (`todo` · `in_progress` · `in_review` · `done`), `priority` (`low` · `medium` · `high` · `urgent`), `assignee_id`, `start_date`/`due_date` (`YYYY-MM-DD`), `labels` (maks. 5, masing-masing maks. 30 karakter).
Respons memuat `code` (`MPO-12`), `assignee {id,name,avatar_color}`, `created_by`, `position`, `completed_at`.

## Aturan bisnis
- **Nomor tugas** dibuat dalam transaksi: `UPDATE projects SET task_counter = task_counter + 1 ... RETURNING`. Baris proyek terkunci sampai transaksi selesai, sehingga pembuatan paralel tidak pernah bentrok.
- **Posisi desimal** (`DOUBLE PRECISION`): tugas baru / pindah tanpa `position` masuk **paling atas** kolom (`MIN(position) - 1024`; kolom kosong = `0`). Frontend menghitung posisi di antara dua tetangga (mis. `1.5`) sehingga tidak perlu menulis ulang kartu lain.
- **`completed_at`** terisi otomatis saat status menjadi `done` dan dikosongkan saat keluar dari `done` (lewat PATCH maupun move).
- **Assignee harus anggota proyek** (400 bila bukan). Anggota yang dikeluarkan / keluar: semua tugasnya menjadi *unassigned* di transaksi yang sama.
- **Deadline tidak boleh sebelum tanggal mulai** (dicek di service dan constraint DB).
- Label: di-trim, duplikat (tanpa beda huruf besar/kecil) dihapus, kosong ditolak.
- **PATCH tanpa perubahan nyata** → 200 tanpa menulis ke database. Body kosong → 400.
- **Proyek terarsip = tugas read-only**: buat/edit/pindah/hapus ditolak (400), baca tetap boleh.
- Karakter NUL (`\u0000`) pada teks → 400, bukan 500.

## Riwayat aktivitas
Tabel `activities` ditulis di transaksi yang sama dengan perubahannya:
`task.created`, `task.updated {fields}`, `task.status_changed {from,to}`, `task.assigned {from,to}`, `task.deleted`. Semuanya memuat `code` tugas.
- Memindahkan kartu hanya di dalam kolom yang sama (reorder) **tidak** dicatat (terlalu berisik).
- Karena `activities.task_id` memakai `ON DELETE CASCADE` (sesuai spesifikasi), riwayat sebuah tugas ikut terhapus saat tugasnya dihapus. Yang tersisa hanya catatan `task.deleted` (disimpan dengan `task_id = NULL`).
- Endpoint pembacaan riwayat: lihat [fitur 06](06-comments-activity.md).

## Konvensi query (GORM vs `Raw()`)
- **GORM**: update & delete tugas.
- **`Raw()`**: pembacaan tugas (join users/projects/member + `to_json(labels)` + `to_char(date)`), nomor tugas atomik, posisi teratas, insert (`RETURNING id`), pencatatan aktivitas (`?::jsonb`).
- `labels` (`TEXT[]`) ditulis lewat `StringArray.Value()` (literal array Postgres yang di-escape) dan dibaca sebagai JSON, aman untuk koma, kutip, `\`, `{}`, emoji.

## Cara mencoba
```bash
cd backend && go run ./cmd/api                      # http://localhost:6990
powershell -File backend/tests/e2e_tasks.ps1        # 89 skenario (butuh psql untuk bagian activities)
```
```bash
curl -X POST localhost:6990/api/v1/projects/<id>/tasks -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"title":"Desain halaman login","priority":"high","labels":["design"],"due_date":"2026-12-10"}'
curl -X PATCH localhost:6990/api/v1/tasks/<taskId>/move -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"status":"in_progress","position":1.5}'
```

## Testing
- Unit: `normalizeLabels`, `parseDate`, `dueBeforeStart`, `progressPercent`, `equalPtr`/`ptrValue`, `Optional[T]` (3 keadaan JSON), `StringArray` Value/Scan (koma, kutip, backslash, emoji, `{}`).
- E2E `e2e_tasks.ps1`: buat/validasi (judul, prioritas, status, label, tanggal, assignee, NUL, JSON rusak, emoji), **non-anggota 404 di semua endpoint**, daftar & board, PATCH (null, no-op, status→`completed_at`), move (desimal, reorder, tanpa posisi, batas), hapus pembuat/owner/403, **16 pembuatan paralel → nomor unik & berurutan**, statistik progress, **anggota dikeluarkan → tugas unassigned**, proyek terarsip read-only, isi tabel `activities`, cascade hapus proyek.
- Constraint DB diuji langsung (key huruf kecil, role, status, prioritas, deadline < mulai, 6 label, nomor ganda) dan migrasi up → down → up.

## Batasan & rencana
- ~~Filter, pencarian, sort, pagination~~ → selesai di [fitur 05](05-search-filter.md).
- ~~`comment_count` pada kartu~~ → selesai di [fitur 06](06-comments-activity.md).
- Posisi desimal bisa kehabisan presisi setelah ±50 penyisipan berturut-turut di antara dua kartu yang sama; belum ada rebalancing otomatis (aman untuk pemakaian wajar).
