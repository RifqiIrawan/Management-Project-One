# 06 – Komentar & Riwayat Aktivitas

**Status:** ✅  `e2e_comments.ps1` 83/83; regresi `e2e_task_filters` 97, `e2e_tasks` 89, `e2e_projects` 68, `e2e_auth` 40, `e2e_race_owner` lulus  
**Tanggal selesai:** 2026-11-19  
**Spesifikasi:** Bagian 5.10, 5.11, 6.2 (comments), 8.4/8.6/8.7

## Tujuan
Tim bisa berdiskusi di setiap tugas, dan semua perubahan penting terbaca sebagai riwayat ("Budi memindahkan MPO-12 dari To Do ke In Progress") di panel tugas maupun proyek.

## Yang dibuat
| Lapisan | File |
|---|---|
| Migrasi | `000007_create_comments` |
| Repository | `repository/comment_repository.go`, `repository/activity_repository.go` (pembacaan riwayat + helper `logActivity` bersama) |
| Service | `service/comment_service.go`, `service/activity_service.go`, `service/activity_message.go` (penyusun kalimat) |
| Handler / DTO | `handler/comment_handler.go`, `handler/activity_handler.go`, `dto/comment_dto.go` |
| Perubahan fitur lain | respons tugas kini memuat **`comment_count`** (daftar, board, detail, Tugas Saya); `parsePaging` dipakai bersama |

## Endpoint
Semua butuh `Authorization: Bearer <access_token>` dan keanggotaan proyek (non-anggota → **404**).

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/v1/tasks/:taskId/comments` | anggota | Terlama dulu, berpaginasi (`page`, `per_page`; default 50, maks. 100) + `meta` |
| POST | `/api/v1/tasks/:taskId/comments` | anggota | `{body}` → 201 |
| PATCH | `/api/v1/comments/:commentId` | **penulis** | `{body}`; anggota lain 403 |
| DELETE | `/api/v1/comments/:commentId` | penulis atau owner | Owner boleh memoderasi |
| GET | `/api/v1/tasks/:taskId/activities` | anggota | Riwayat satu tugas, terbaru dulu, berpaginasi (default 20) |
| GET | `/api/v1/projects/:projectId/activities` | anggota | Riwayat seluruh proyek, terbaru dulu, berpaginasi |

### Respons komentar
```json
{ "id": "…", "task_id": "…", "body": "Halo **tim**", "author": {"id":"…","name":"Budi","avatar_color":"#6366F1"},
  "edited_at": null, "created_at": "…", "can_edit": true, "can_delete": true }
```
`can_edit` (hanya penulis) dan `can_delete` (penulis atau owner) dihitung server untuk pemanggil, sehingga UI tidak perlu menebak hak akses.

### Respons riwayat
```json
{ "id": 42, "action": "task.status_changed", "message": "Sari memindahkan MPO-12 dari To Do ke In Progress",
  "user": {"id":"…","name":"Sari","avatar_color":"#EC4899"}, "task_id": "…", "code": "MPO-12",
  "metadata": {"code":"MPO-12","from":"todo","to":"in_progress"}, "created_at": "…" }
```
`message` disusun server (bahasa Indonesia) agar panel tugas dan dashboard konsisten; `metadata` tetap tersedia bila UI ingin menyusun sendiri.

| `action` | Contoh `message` |
|---|---|
| `task.created` | Budi membuat tugas MPO-12 |
| `task.status_changed` | Sari memindahkan MPO-12 dari To Do ke In Progress |
| `task.assigned` | Budi meng-assign MPO-12 ke Andi · Budi melepas assignee dari MPO-12 |
| `task.updated` | Budi mengubah MPO-12 (judul, deadline, label) |
| `task.deleted` | Budi menghapus tugas MPO-12 (`task_id` = null) |
| `comment.created` | Andi mengomentari MPO-12 |

Nama assignee diambil lewat join saat dibaca (bukan disalin ke metadata), jadi selalu mengikuti nama terkini.

## Aturan bisnis
- Isi komentar di-trim, tidak boleh kosong, **maks. 5000 karakter** (dihitung per karakter, bukan byte); baris baru, Markdown, dan emoji dipertahankan. Karakter NUL → 400. Constraint DB juga menolak isi kosong.
- **Edit**: hanya penulis. Isi yang sama persis (setelah trim) tidak mengubah `edited_at`; selain itu `edited_at` terisi ("(diedit)").
- **Hapus**: penulis atau owner proyek. Menghapus komentar juga menghapus catatan riwayat `comment.created`-nya, agar riwayat tidak menampilkan komentar yang sudah tidak ada.
- Menulis komentar dan mencatat riwayatnya terjadi dalam **satu transaksi**.
- **Proyek terarsip = komentar read-only** (tulis/edit/hapus → 400, baca tetap boleh), konsisten dengan tugas.
- Mantan anggota tidak bisa lagi membaca/mengedit komentarnya (404), tetapi komentarnya tetap tampil bagi anggota lain lengkap dengan nama penulis.
- Hapus tugas/proyek → komentar dan riwayatnya ikut terhapus (FK cascade). Yang tersisa dari tugas yang dihapus hanya catatan `task.deleted` di riwayat proyek.
- Memindahkan kartu hanya di dalam satu kolom tidak dicatat di riwayat.

## Konvensi query (GORM vs `Raw()`)
Semua query komentar dan riwayat memakai **`Raw()`** (join penulis/pelaku, join nama assignee dengan `CASE` agar cast uuid hanya dievaluasi untuk baris `task.assigned`, hitung komentar, hapus riwayat berdasarkan `metadata->>'comment_id'`). Semua nilai dipasang sebagai parameter.

## Cara mencoba
```bash
cd backend && go run ./cmd/api                          # http://localhost:6990
powershell -File backend/tests/e2e_comments.ps1         # 83 skenario (bagian DB butuh psql)
```
```bash
curl -X POST localhost:6990/api/v1/tasks/<taskId>/comments -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"body":"Siap dikerjakan"}'
curl localhost:6990/api/v1/tasks/<taskId>/activities -H "Authorization: Bearer <token>"
```

## Testing
- **Unit**: `activityMessage` (14 kasus: semua aksi, assign tanpa nama, metadata rusak/kosong, aksi & status tak dikenal), `cleanBody` (trim, batas 5000 per rune, emoji), hak `can_edit`/`can_delete` (penulis/owner/member), `parsePaging`.
- **E2E `e2e_comments.ps1`**: tulis/validasi (kosong, spasi, 5001, tepat 5000, NUL, bukan string, JSON rusak), non-anggota 404 di semua endpoint, hak edit (penulis saja) dan hapus (penulis/owner), `edited_at` tidak berubah bila isi sama, `comment_count` di detail/daftar/board/Tugas Saya dan turun saat dihapus, pagination stabil, **riwayat tugas urutan lengkap dengan kalimat Indonesia**, riwayat ikut hilang saat komentar dihapus, riwayat proyek (termasuk tugas terhapus), proyek terarsip, anggota dikeluarkan, dan cek DB (constraint, cascade).
- Regresi: `e2e_task_filters`, `e2e_tasks`, `e2e_projects`, `e2e_auth`, `e2e_race_owner` tetap lulus.

## Performa (diukur)
Data sintetis dalam transaksi yang di-rollback (tidak ada data sisa):
| Skenario | Hasil |
|---|---|
| Daftar 100 tugas + `comment_count` (30.000 tugas, 90.000 komentar) | 9,8 ms; subquery hanya untuk 100 baris yang tampil, memakai `idx_comments_task` |
| Daftar komentar 1 tugas | 0,1 ms |
| Riwayat proyek, 200.000 catatan: halaman 1 / OFFSET 5000 | 0,16 ms / ±2 ms (indeks `idx_activities_project` sudah cukup) |

Dugaan awal bahwa riwayat butuh indeks `(project_id, created_at, id)` **tidak terbukti** pada data dengan timestamp realistis, jadi tidak ada migrasi indeks tambahan. (Pemindaian penuh hanya terjadi bila ribuan catatan punya `created_at` identik, mis. data uji satu transaksi.)

## Batasan & utang
- **Rate limit umum "100 req/menit/user"** dari bagian Keamanan spesifikasi belum diimplementasikan (baru login/register 5/menit dan pencarian user 30/menit). Dijadwalkan di fase rilis (fitur 08).
- Isi komentar disimpan apa adanya; **sanitasi Markdown dilakukan frontend saat render** (sesuai spesifikasi). Backend tidak merender HTML.
- Riwayat belum mencatat perubahan keanggotaan (undang/keluarkan/ubah role) dan pengarsipan proyek.
- Mention `@nama` di komentar dijadwalkan v1.2.
- ~~Riwayat lintas proyek untuk dashboard~~ → selesai di [fitur 07](07-dashboard.md).
