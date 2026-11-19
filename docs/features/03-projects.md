# 03 – Proyek, Anggota & Hak Akses

**Status:** ✅  `e2e_projects.ps1` 68/68, `e2e_auth.ps1` 40/40 (regresi di port 6990), uji race lulus  
**Tanggal selesai:** 2026-11-19  
**Spesifikasi:** Bagian 5.3, 5.4, 6.2, 8.3 (`/users/search`), 8.4, 8.5

## Tujuan
Pengguna bisa membuat proyek, mengundang tim, dan mengatur siapa boleh melakukan apa (RBAC owner / member).

## Yang dibuat
| Lapisan | File |
|---|---|
| Migrasi | `000003_create_projects`, `000004_create_project_members` (otomatis saat start) |
| Model | `model/project.go` (`Project`, `ProjectMember`, konstanta role) |
| DTO | `dto/project_dto.go` |
| Repository | `repository/project_repository.go`, `member_repository.go`, `helpers.go` |
| Service | `service/access.go`, `project_service.go`, `member_service.go` (+ `Search` di `user_service.go`) |
| Handler | `handler/project_handler.go`, `member_handler.go`, `helpers.go` (validasi UUID) |

## Endpoint API
Semua butuh `Authorization: Bearer <access_token>`.

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/v1/projects?q=&archived=false` | semua | Daftar proyek saya; favorit di atas, lalu terbaru. Memuat `member_count`, `members_preview` (maks. 4) |
| POST | `/api/v1/projects` | semua | Buat proyek `{name, key, description?, color?, icon?}`; pembuat otomatis owner |
| GET | `/api/v1/projects/:projectId` | anggota | Detail + `my_role`, `is_favorite`, `member_count` |
| PATCH | `/api/v1/projects/:projectId` | owner | Ubah `name`, `description`, `color`, `icon` (`key` tidak bisa diubah) |
| POST | `/api/v1/projects/:projectId/archive` | owner | `{archived: true/false}` arsipkan / pulihkan |
| DELETE | `/api/v1/projects/:projectId` | owner | Hapus permanen; body `{confirm_name}` harus sama persis dengan nama proyek |
| POST | `/api/v1/projects/:projectId/favorite` | anggota | Toggle favorit (per user) |
| GET | `/api/v1/projects/:projectId/members` | anggota | Daftar anggota (owner dulu) |
| POST | `/api/v1/projects/:projectId/members` | owner | `{email, role?}` undang user terdaftar (default `member`) |
| PATCH | `/api/v1/projects/:projectId/members/:userId` | owner | `{role}` ubah role |
| DELETE | `/api/v1/projects/:projectId/members/:userId` | owner / diri sendiri | Keluarkan anggota / keluar sendiri |
| GET | `/api/v1/users/search?email=` | login | Cari user untuk diundang (awalan email, min. 3 karakter, maks. 5 hasil, tanpa diri sendiri, 30/menit/IP) |

## Aturan bisnis
- `key`: 2–5 huruf, otomatis huruf besar, unik (dijaga constraint DB `^[A-Z]{2,5}$` + `UNIQUE`). Tidak bisa diubah setelah dibuat karena akan menjadi kode tugas (`MPO-1`).
- **Non-anggota selalu 404** (bukan 403), termasuk untuk ID yang tidak ada atau bukan UUID, sehingga keberadaan proyek tidak bocor. Anggota biasa yang melakukan aksi owner mendapat **403**.
- **Minimal 1 owner**: owner terakhir tidak bisa diturunkan atau keluar (400). Pengecekan memakai transaksi + `SELECT ... FOR UPDATE` pada baris owner, jadi dua owner yang saling menurunkan bersamaan tidak bisa membuat proyek tanpa owner.
- Banyak owner diperbolehkan. Anggota yang keluar/dikeluarkan kehilangan akses (404).
- Deskripsi/ikon kosong disimpan sebagai `NULL`. Karakter `%` dan `_` pada pencarian nama dianggap literal.
- Proyek terarsip disembunyikan dari daftar default (`?archived=true` untuk melihatnya).

## Konvensi query (GORM vs `Raw()`)
- **GORM**: create/update/delete proyek & anggota, cari user.
- **`Raw()`**: daftar & detail proyek (join anggota + hitung `member_count` + filter), `members_preview` (window function `ROW_NUMBER`), daftar anggota (join users), toggle favorit atomik (`UPDATE ... RETURNING`), dan `LockOwners` (`FOR UPDATE`).
- Semua parameter memakai placeholder `?`, tidak ada string SQL yang disambung dengan input user.

## Cara mencoba
```bash
cd backend && go run ./cmd/api          # http://localhost:6990
powershell -File backend/tests/e2e_projects.ps1      # 68 skenario
powershell -File backend/tests/e2e_race_owner.ps1    # uji race condition (butuh psql)
```

## Testing
- Unit: `isLastOwner` (6 kasus), `escapeLike`, `IsUUID`.
- E2E `e2e_projects.ps1`: buat proyek (key uppercase, duplikat 409, validasi 400, emoji utuh), daftar/cari/favorit, **non-anggota 404 di semua endpoint**, **member 403** pada edit/arsip/hapus/undang/ubah role/keluarkan, edit & arsip, promosi/demosi, owner terakhir (400), keluar sendiri, hapus dengan konfirmasi nama, pencarian user.
- E2E `e2e_race_owner.ps1`: transaksi psql menahan kunci agar dua request saling-menurunkan benar-benar tumpang-tindih. Hasil dengan `FOR UPDATE`: selalu `200,400`, owner tersisa 1. **Uji mutasi**: dengan `FOR UPDATE` sengaja dicopot, 3 dari 3 ronde menghasilkan proyek tanpa owner (`200,200`), sehingga terbukti kunci inilah yang mencegah bug dan tes ini peka terhadapnya.

## Belum dikerjakan (bergantung fitur lain)
- **Statistik tugas & progress %** (jumlah tugas, done/total) di kartu/detail proyek: butuh tabel `tasks` → fitur 04.
- **Tugas milik anggota yang dikeluarkan menjadi unassigned**: ada `TODO(fitur 04)` di `MemberService.Remove`, harus dijalankan di transaksi yang sama.
- **Riwayat aktivitas** (`GET /projects/:id/activities`) → fitur 06.
- Proyek terarsip masih bisa diedit/diubah anggotanya (belum dikunci read-only).

## Catatan
- Port: backend `6990`, frontend `6969`.
- Rate limit pencarian user di memori (per proses), sama seperti auth.
