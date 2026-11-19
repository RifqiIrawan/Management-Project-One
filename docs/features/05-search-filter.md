# 05 – Daftar Tugas: Filter, Pencarian, Sort, Pagination & "Tugas Saya"

**Status:** ✅  `e2e_task_filters.ps1` 97/97; regresi `e2e_tasks` 89/89, `e2e_projects` 68/68, `e2e_auth` 40/40, `e2e_race_owner` lulus  
**Tanggal selesai:** 2026-11-19  
**Spesifikasi:** Bagian 5.7, 5.8, 5.9, 8.1 (`meta`), 8.3 (`/me/tasks`), 8.6 (query filter)

## Tujuan
Tampilan **List** (tabel) dan **Board** bisa difilter, dicari, diurutkan, dan dipaginasi dari satu endpoint;
halaman **Tugas Saya** menampilkan semua tugas yang di-assign ke saya lintas proyek, dikelompokkan menurut deadline.

## Yang dibuat
| Lapisan | File |
|---|---|
| Repository | `repository/task_filter.go`: `TaskFilter`, `Search`, `Count`, daftar putih sort |
| Service | `service/task_query.go`: validasi query string, jendela tanggal, kelompok deadline, meta halaman; `TaskService.List` / `MyTasks` / `page` |
| Handler | `handler/task_handler.go`: `List`, `MyTasks`, `listParams`, `respondList` |
| DTO / response | `dto.TaskListParams`, `PageMeta`, `MyTasksGrouped`, `ProjectRef`; `response.OKMeta` |
| Konfigurasi | `APP_TIMEZONE` (default `Asia/Jakarta`), zona waktu tertanam via `time/tzdata` |

Perubahan pada fitur sebelumnya: respons tugas kini memuat `project {id,name,key,color}` (dibutuhkan Tugas Saya lintas proyek);
**daftar tugas proyek sekarang berpaginasi** dan default-nya terbaru dulu (sebelumnya semua tugas urut Kanban; urutan Kanban kini lewat `view=board`).

## Endpoint
| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/v1/projects/:projectId/tasks` | Daftar tugas proyek (anggota). Mendukung semua parameter di bawah |
| GET | `/api/v1/me/tasks` | Tugas yang di-assign ke saya, lintas proyek |

### Parameter query
| Parameter | Contoh | Keterangan |
|---|---|---|
| `q` | `login` · `MPO-12` | Cari di **judul**. Bila memuat `-` (mis. `MPO-12`) juga mencocokkan **kode tugas**. Tanpa beda huruf besar/kecil; `%` dan `_` dianggap literal. Maks. 100 karakter |
| `status` | `todo,in_progress` | Multi nilai, dipisah koma |
| `priority` | `high,urgent` | Multi nilai |
| `assignee` | `me` · `none` · `<uuid>` · `me,none` | Multi nilai. `me` = pemanggil, `none` = belum di-assign |
| `due` | `overdue,today,week,none` | Multi nilai (digabung **OR**). Lihat definisi di bawah |
| `sort` | `due_date` · `-created_at` · `priority,-due_date` | Maks. 3 kolom, awalan `-` = menurun. Kolom: `created_at`, `updated_at`, `due_date`, `start_date`, `title`, `priority`, `status`, `code` |
| `page`, `per_page` | `2`, `50` | Default 1 dan 20; `per_page` maks. 100 |
| `view` | `board` | Hanya proyek: semua tugas yang cocok per kolom `{todo,in_progress,in_review,done}`, urut Kanban, tanpa pagination |
| `group` | `due` | Hanya `/me/tasks`: kelompokkan menurut deadline |
| `include_done` | `true` | Hanya `/me/tasks`: sertakan tugas `done` |

Filter yang berbeda digabung dengan **AND**; nilai di dalam satu filter dengan **OR**.
Nilai tidak valid → **400** dan **semua** kesalahan dilaporkan sekaligus di `error.details` (mis. `status`, `page`, `sort`).

Respons daftar:
```json
{ "success": true, "data": [ ... ],
  "meta": { "page": 1, "per_page": 20, "total": 57, "total_pages": 3 } }
```
`total_pages` = 0 bila tidak ada hasil. Halaman di luar jangkauan → `data: []` dengan `meta` tetap benar.

### Definisi filter deadline (`due`) & zona waktu
"Hari ini" dan "minggu ini" dihitung menurut **`APP_TIMEZONE`** (default `Asia/Jakarta`), bukan jam database/UTC (tugas dengan deadline hari ini tidak dianggap terlambat pukul 00:30 WIB).
Minggu berakhir hari **Minggu**.

| Nilai | Arti |
|---|---|
| `overdue` | deadline sebelum hari ini **dan status bukan `done`** |
| `today` | deadline = hari ini |
| `week` | deadline dari hari ini sampai Minggu (mencakup hari ini) |
| `none` | tanpa deadline |

### Sort
- Tugas **tanpa deadline selalu di akhir** untuk `due_date` / `start_date`, baik menaik maupun menurun.
- `priority` menaik = `low → urgent`; `-priority` = `urgent → low`. `status` mengikuti urutan kolom Kanban. `code` = kunci proyek lalu nomor tugas.
- Urutan selalu **stabil** (pembeda tetap `created_at DESC, id`), jadi tidak ada baris ganda/hilang antar halaman.
- Default daftar: `-created_at`. Default `/me/tasks`: deadline terdekat dulu, lalu prioritas tertinggi.
- Nama kolom hanya diterima dari daftar putih; nilai lain 400. Teks `ORDER BY` tidak pernah dibangun dari input user.

## `GET /me/tasks` (Tugas Saya)
- Hanya tugas **yang di-assign ke saya**, dari proyek tempat saya masih anggota; **proyek terarsip** dan tugas **`done`** dikecualikan (`include_done=true` menyertakan done; filter `status` eksplisit juga mengesampingkan pengecualian done).
- Parameter `assignee` diabaikan (selalu milik saya). Filter `q`, `status`, `priority`, `due`, `sort`, `page`, `per_page` berlaku.
- Tanpa `group`: daftar berpaginasi + `meta`.
- `group=due`: tanpa pagination, objek dengan kelompok yang **saling lepas**:
  `overdue` (sebelum hari ini) · `today` · `this_week` (besok s/d Minggu) · `later` · `no_deadline`. Kelompok kosong = `[]`.
  Bila hari ini Minggu, `this_week` selalu kosong (besok sudah `later`).
- Checkbox "tandai selesai" memakai `PATCH /tasks/:id {"status":"done"}` yang sudah ada; tugasnya langsung hilang dari daftar.

## Konvensi query (GORM vs `Raw()`)
Seluruh pencarian memakai **`Raw()`** karena join + filter dinamis + agregasi. `TaskFilter.where()` menyusun kondisi dari potongan SQL **konstan**; semua nilai dari user dipasang sebagai parameter `?`
(termasuk `IN ?` untuk daftar). Unit test memastikan input jahat tidak pernah muncul di teks SQL.

## Performa (diukur)
Diukur di PostgreSQL lokal dengan data sintetis (dalam transaksi yang di-rollback, tidak ada data sisa):

| Skenario | Hasil |
|---|---|
| Cari judul, 100.000 tugas dalam 1 proyek | **2,6 ms**, memakai indeks `idx_tasks_title_trgm` (bitmap scan) |
| Bentuk lama (judul **OR** kode), data yang sama | 149 ms, seq scan (indeks trigram tidak bisa dipakai karena kode bukan kolom terindeks) |
| Filter status + prioritas + deadline (30.000 tugas/proyek) | 5,5 ms |
| Tugas Saya lintas proyek (60.000 tugas) | 9 ms |

Karena itu pencarian kode hanya aktif bila kata kunci memuat `-`.

## Cacat yang ditemukan & diperbaiki saat pengerjaan
- Versi awal mencocokkan kata kunci ke **judul OR kode**: mencari `mp` di proyek berkey `MPO` cocok dengan **semua** tugas (karena `MPO-12` mengandung "mp") dan memaksa seq scan. Kini kode hanya dicocokkan bila ada `-` (ada tes regresi).

## Cara mencoba
```bash
cd backend && go run ./cmd/api                               # http://localhost:6990
powershell -File backend/tests/e2e_task_filters.ps1         # 97 skenario
```
```bash
curl "localhost:6990/api/v1/projects/<id>/tasks?status=todo,in_progress&assignee=me&due=overdue,today&sort=priority,-due_date&per_page=20" -H "Authorization: Bearer <token>"
curl "localhost:6990/api/v1/me/tasks?group=due" -H "Authorization: Bearer <token>"
```

## Testing
- **Unit**: `parseTaskQuery` (default, semua filter, `me`→id, dedupe, batas, semua jenis nilai tidak valid, percobaan injection pada `sort`), `dateWindow` (Senin/Kamis/Minggu, **lintas zona waktu 17:30 UTC = 00:30 WIB**, lintas tahun), `dueGroup`, `pageMeta`, pembangun `WHERE` (input jahat tak pernah masuk SQL, jumlah placeholder = argumen, kombinasi assignee, overdue mengecualikan done, kode hanya dengan `-`) dan `ORDER BY` (daftar putih, stabil, `NULLS LAST`).
- **E2E `e2e_task_filters.ps1`**: pencarian (judul, kode, `%` `_` literal, SQL injection, tabel tetap utuh), filter status/prioritas/assignee/deadline dan kombinasinya, **semua jenis sort** (termasuk `NULLS LAST` menaik dan menurun, majemuk, injection), pagination (meta, halaman terakhir, di luar batas, **stabil di 5 jenis sort → 7 id unik**), board + filter, hak akses (non-anggota 404), dan seluruh perilaku **Tugas Saya** (lintas proyek, pengelompokan, include_done, tandai selesai, arsip, anggota dikeluarkan).
- Regresi: `e2e_tasks`, `e2e_projects`, `e2e_auth`, `e2e_race_owner` tetap lulus.

## Batasan
- Tidak ada batas laju khusus pencarian; yang berlaku adalah batas umum 100 req/menit/user dari [fitur 08](08-release.md), ditambah batas body dan panjang `q`. Pencarian dilindungi autentikasi dan keanggotaan.
- `group=due` mengembalikan semua tugas terbuka milik user tanpa pagination (wajar untuk tugas pribadi).
- Pencarian belum mencakup deskripsi tugas dan belum memakai peringkat relevansi (hanya `ILIKE`).
