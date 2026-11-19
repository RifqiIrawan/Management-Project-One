# 08 – Rilis: Hardening, Dokumentasi API, Backup & Deploy

**Status:** ✅  `run_all.ps1` 13/13 langkah lulus: unit (10 paket), kontrak 35 operasi, e2e dashboard 41, komentar 83, filter 97, tugas 89, proyek 68, auth 40, race, operasional 47  
**Tanggal selesai:** 2026-11-19  
**Spesifikasi:** Bagian 8 (Swagger), 11 (Keamanan), 14, 15, 16, 13 (tanpa Docker atas permintaan)

## Tujuan
Backend siap dirilis: tahan penyalahgunaan, mudah dioperasikan dan dilacak, API terdokumentasi dengan dokumen yang terbukti sesuai
perilaku nyata, data bisa dibackup *dan dipulihkan*, dan semua tes bisa dijalankan dengan satu perintah.

> **Docker dilewati** atas permintaan. Deploy memakai biner statis + systemd + reverse proxy ([`DEPLOY.md`](../DEPLOY.md)).
> `docker-compose` produksi dan `Dockerfile` dari spesifikasi sengaja tidak dibuat.

## 1. Hardening operasional

| Fitur | Perilaku | File |
|---|---|---|
| **Batas laju umum** | `API_RATE_LIMIT_PER_MIN` (default **100**/menit/**user**, `0` = mati). Token bucket per user id, dipasang setelah autentikasi, jadi request tanpa login tetap 401 (bukan 429) dan user lain tidak terpengaruh. Respons 429 membawa `Retry-After` (detik) dan `X-RateLimit-Limit`. Melunasi utang dari fitur 06. | `middleware/rate_limit.go` |
| **`TRUSTED_PROXIES`** | Daftar IP/CIDR reverse proxy. Kosong = `X-Forwarded-For` **diabaikan** (tidak bisa di-spoof untuk menghindari batas laju). Di belakang Nginx/Caddy isi `127.0.0.1`. Nilai bukan IP/CIDR membuat server menolak start. | `config`, `router` |
| **`HOST`** | Alamat bind. **Production default `127.0.0.1`** (API hanya lewat reverse proxy; sebelumnya mendengarkan semua antarmuka). Development default semua antarmuka. | `config`, `cmd/api` |
| **Request ID + log terstruktur** | Tiap request punya `X-Request-ID` (dari client hanya bila formatnya aman, selain itu dibuat server) yang sama dengan di log. Satu baris `slog` per request: `request_id`, `method`, **`route` (pola, bukan URL asli)**, `status`, `latency_ms`, `ip`, `user_id`. Level: 2xx/3xx INFO, 4xx WARN, 5xx ERROR. JSON di production. **Query string, body, token, password, dan email tidak pernah dicatat.** | `middleware/access_log.go`, `cmd/api` |
| **HSTS** | `Strict-Transport-Security` hanya di production. | `middleware/security.go` |
| **Pembersihan refresh token** | Job latar menghapus token yang kedaluwarsa > 1 hari (aktif maupun dicabut) saat start lalu tiap `TOKEN_CLEANUP_INTERVAL` (default 1 jam, `0` = mati). Token yang sudah dicabut tetap disimpan sampai kedaluwarsa agar deteksi pencurian (pemakaian ulang) tetap bekerja. | `jobs/token_cleanup.go` |

Variabel baru: `API_RATE_LIMIT_PER_MIN`, `TRUSTED_PROXIES`, `HOST`, `SWAGGER_ENABLED`, `TOKEN_CLEANUP_INTERVAL` (tabel lengkap di [README](../../README.md)).

## 2. Dokumentasi API (OpenAPI + Swagger UI)

- **[`backend/docs/openapi.yaml`](../../backend/docs/openapi.yaml)**: OpenAPI 3.0.3, **35 operasi di 24 path, 55 skema**, semua respons error terdokumentasi. Ditulis tangan,
  ikut ter-embed ke biner (`docs/embed.go`).
- **Swagger UI** di `/api/docs`, spesifikasi di `/api/openapi.yaml`. Aktif di development, **nonaktif di production** kecuali `SWAGGER_ENABLED=true`.
  Aset UI tertanam di biner (tanpa CDN) dan validator online dimatikan (`validatorUrl: null`), jadi spesifikasi tidak dikirim ke luar.
- Alasan tidak memakai anotasi `swag init`: dokumen tulisan tangan + tes di bawah memberi jaminan yang lebih kuat bahwa dokumen sesuai perilaku nyata.

### Cara dokumen dijaga tetap benar
1. **Tes kecocokan route** (`internal/router/openapi_test.go`): dokumen valid; **setiap route** terdokumentasi dan **setiap operasi** di dokumen punya route nyata;
   `operationId` unik; setiap operasi punya tag, ringkasan, dan respons 2xx.
2. **Tes kontrak** (`tests/contract/contract_test.go`): menjalankan alur nyata terhadap server hidup dan memvalidasi **setiap respons** (body, status, header) terhadap skemanya,
   memvalidasi juga request yang dikirim, **memastikan status yang dikembalikan memang terdokumentasi**, dan **gagal bila ada operasi di dokumen yang tidak dijalankan**
   (35/35 operasi tervalidasi).
3. **Uji mutasi** membuktikan kedua tes ini peka: mengubah nama path, mengubah tipe `progress`, menghapus dokumentasi status 403, membuat `description` tidak boleh null,
   dan mengganti nama `is_overdue` semuanya tertangkap dengan pesan yang jelas.

## 3. Backup & restore database

- [`scripts/backup-db.sh`](../../scripts/backup-db.sh): `pg_dump` format custom, ditulis ke file sementara lalu **diverifikasi** (dump harus memuat 8 tabel inti) sebelum diberi nama final;
  izin `600`/`700`; kata sandi lewat environment (tidak di baris perintah); retensi (`RETENTION_DAYS`, default 14) hanya berjalan setelah backup baru terverifikasi.
- [`scripts/restore-db.sh`](../../scripts/restore-db.sh): menolak menimpa database yang sudah berisi tabel (kecuali `FORCE_OVERWRITE=1`), menolak dump korup tanpa membuat database,
  menolak nama database tidak aman, dan mencetak jumlah baris hasil restore.
- **Diuji nyata:** backup → retensi (file 20 hari dihapus, file 1 hari tetap) → **backup gagal (password salah) tidak merusak backup lama dan tidak meninggalkan file sementara**
  → restore ke database sementara → **checksum md5 isi 8 tabel identik dengan sumber** → restore ke database berisi ditolak → `FORCE_OVERWRITE` menimpa → dump korup ditolak → database uji dibersihkan.
  (Restore uji membutuhkan hak `CREATEDB`, sehingga memakai akun admin PostgreSQL lokal; tidak ada data aplikasi yang diubah.)

## 4. Build, runner tes, dan dokumentasi

- `backend/Makefile`: `run`, `build`, **`build-linux`** (biner statis linux/amd64 ±36 MB; migrasi, OpenAPI, Swagger UI tertanam; **ELF terverifikasi**), `check`, `contract`, `e2e`, `backup`.
- **[`backend/tests/run_all.ps1`](../../backend/tests/run_all.ps1)**: satu perintah menjalankan gofmt → vet → unit → build → tes kontrak → e2e fitur 2-7 → uji race → e2e operasional dan mencetak ringkasan
  (`-Quick` melewati e2e). Tiap suite fungsional memakai server baru dengan `API_RATE_LIMIT_PER_MIN=0`.
- [`README.md`](../../README.md) (root): cara menjalankan tanpa Docker, tabel konfigurasi, pengujian. [`docs/DEPLOY.md`](../DEPLOY.md): deploy VPS, backup terjadwal, update/rollback, pemantauan, **checklist rilis dengan status jujur**.

## Pengujian fitur ini

- **Unit**: pembatas laju (burst, `Retry-After`, penolakan berulang tidak memperpanjang tunggu, per user, batas 0 tidak panik), log akses (ID aman/tidak aman termasuk injeksi CRLF, **route bukan URL asli, tanpa query**, level, `user_id`),
  HSTS, konfigurasi (default, override, validasi, `HOST`), router (**`X-Forwarded-For` diabaikan tanpa trusted proxy dan dihormati dari proxy tepercaya**, proxy tidak valid ditolak, header di semua respons),
  OpenAPI (valid, cocok dengan route, lengkap, Swagger on/off).
- **Kontrak** (`tests/contract`): 35 operasi divalidasi terhadap `openapi.yaml`.
- **E2E operasional `e2e_ops.ps1`** (menjalankan 4 server di port 6991-6994 dengan konfigurasi berbeda): rate limit per user + `Retry-After` + pemulihan setelah menunggu, user lain tak terpengaruh, tanpa login tetap 401,
  `/health` tak dibatasi, request ID, header keamanan, Swagger on (dev) / 404 (production), **`X-Forwarded-For` diabaikan / dihormati**, **pembersihan refresh token** (kedaluwarsa dihapus; masa tenggang, aktif, dan dicabut-belum-kedaluwarsa tetap),
  **log tidak membocorkan email/query/token/password dan memakai pola route**, production: HSTS, cookie `Secure`, log JSON lengkap, batas umum dimatikan; **production hanya bind localhost** (dengan pengecekan kontrol agar tidak lolos sia-sia),
  server menolak start dengan `TRUSTED_PROXIES` tidak valid.
- **Uji mutasi** pada kode produksi: mencopot batas per user, mematikan HSTS, mematikan job pembersihan, mencatat URL lengkap di log, dan mengembalikan bind production ke semua antarmuka, **semuanya tertangkap** oleh tes yang relevan.

## Temuan saat pengerjaan
- Server mendengarkan semua antarmuka (`:PORT`) sehingga di balik proxy API tetap terbuka langsung. Diperbaiki dengan `HOST` (default `127.0.0.1` di production).
- Spesifikasi menyebut rate limit "100 req/menit/user" tetapi belum ada sejak awal. Kini ada (di atas).
- Dugaan keliru yang dibuktikan salah lewat pengukuran: indeks tambahan untuk riwayat tidak diperlukan (fitur 06).
- Beberapa tes saya sendiri sempat lolos/gagal karena kesalahan skrip (variabel PowerShell yang tidak peka huruf besar/kecil, harness mutasi yang merusak file). Semuanya diperbaiki dan hasil yang terdampak diulang, bukan dipercaya.

## Batasan
- Batas laju di memori per proses (satu instance). Beberapa instance butuh penyimpanan bersama (mis. Redis).
- Belum ada metrik Prometheus / pelacakan error eksternal; hanya log terstruktur + `/health`.
- File systemd, Caddy/Nginx, TLS, firewall, dan cron di `DEPLOY.md` **belum diuji di VPS**.
- Skrip e2e memakai PowerShell; di Linux butuh `pwsh`. Go test (unit + kontrak) tidak bergantung pada PowerShell.
- `go test -race` belum bisa dijalankan di mesin pengembangan ini (tanpa compiler C/cgo).
- Frontend belum dikerjakan, sehingga checklist rilis bagian tampilan (browser, dark mode, console) masih terbuka.
