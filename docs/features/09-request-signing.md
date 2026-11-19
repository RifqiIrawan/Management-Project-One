# 09 – Tanda Tangan Request (HMAC)

**Status:** ✅  `run_all.ps1` 14/14 langkah lulus (unit 11 paket, kontrak 35 operasi pada server enforce, e2e dashboard 41, komentar 83, filter 97, tugas 89, proyek 68, auth 40, race, signature 49, ops 49)  
**Tanggal selesai:** 2026-11-20  
**Permintaan:** "pakai API signature"; pengaturan lewat env.

## Tujuan
Tiap request terautentikasi membawa tanda tangan HMAC, sehingga access token yang bocor (log, proxy, riwayat) **saja tidak cukup** untuk membuat request,
dan request yang tertangkap **tidak bisa diubah atau diputar ulang**.

> **Catatan keamanan yang jujur.** Kunci tanda tangan berada di memori browser (sama seperti access token), jadi fitur ini **tidak melindungi dari XSS**
> (skrip jahat di halaman yang sama bisa memakai kunci itu). Nilainya: token curian tanpa kunci tidak berguna, pemalsuan/replay di jalur jaringan ditolak,
> dan tidak ada secret global yang tertanam di bundle JavaScript.

## Rancangan
- **Kunci tidak statis.** Server menurunkan kunci per access token: `HMAC(HMAC(JWT_SECRET, "mpo-request-signing-v1"), jti)`. Tidak ada state di server;
  kunci dikirim ke klien bersama token (`signing_key`) saat login, refresh, dan ganti password, lalu berganti tiap token baru.
- **Header:** `X-Timestamp` (detik unix), `X-Nonce` (16-64 karakter `A-Za-z0-9_-`), `X-Signature` (hex HMAC-SHA256).
- **String yang ditandatangani:** `mpo1`, `METHOD`, `PATH` (ter-escape), `QUERY_KANONIK`, `SHA256_HEX(body)`, `TIMESTAMP`, `NONCE` dipisah baris baru.
  Query dikanonikalisasi (RFC 3986, pasangan diurutkan) sehingga urutan parameter dan `+` vs `%20` tidak berpengaruh.
- **Verifikasi** (`middleware/signature.go`, urutan: format, tanda tangan, selisih waktu, nonce): kesalahan dilaporkan sebagai 401 dengan kode
  `SIGNATURE_REQUIRED`, `SIGNATURE_INVALID`, `SIGNATURE_EXPIRED` (toleransi `API_SIGNATURE_SKEW`, default 5 menit), `SIGNATURE_REPLAY`.
  Selisih waktu dan nonce baru diperiksa **setelah** tanda tangan valid, sehingga penyerang tanpa kunci tidak bisa membakar nonce milik klien sah.
- **Urutan middleware:** Auth, tanda tangan, rate limit per user. Request bertanda tangan salah (mis. pemegang token curian) **tidak menghabiskan kuota** pemilik token.
- **Endpoint publik** (health, register, login, refresh, logout, dokumentasi) tidak ditandatangani karena belum ada kunci.

## Pengaturan (env)
| Variabel | Default | Arti |
|---|---|---|
| `API_SIGNATURE` | `enforce` di production, `optional` di development | `off` (tidak diverifikasi), `optional` (diverifikasi bila ada; yang salah tetap ditolak), `enforce` (wajib) |
| `API_SIGNATURE_SKEW` | `5m` | Toleransi selisih jam klien-server (0 < nilai <= 1h) |

Mode `optional` di development membuat Swagger UI dan skrip lama tetap bisa dipakai. Untuk produksi, biarkan `enforce`.

## CORS
Browser hanya boleh mengirim header kustom bila server mengizinkannya: `X-Signature`, `X-Timestamp`, `X-Nonce`, `X-Request-ID` ditambahkan ke `Access-Control-Allow-Headers`,
dan `Date`, `X-Request-ID`, `Retry-After`, `X-RateLimit-Limit` diekspos (frontend memakai `Date` untuk menyinkronkan jam bila menerima `SIGNATURE_EXPIRED`).

## Pengujian
- **Tiga implementasi independen sepakat:** Go (`internal/pkg/sign`), PowerShell (`tests/lib/Signing.ps1`), dan Node `crypto` (penghasil vektor). 9 vektor di `internal/pkg/sign/testdata/vectors.json`
  (query tak berurutan/duplikat, spasi/plus/unicode, parameter tanpa nilai, body emoji UTF-8, path ber-escape, dll.) cocok di Go dan PowerShell.
  Implementasi TypeScript frontend wajib memakai file vektor yang sama.
- **Unit Go:** kanonikalisasi, penurunan kunci (deterministik, terpisah per jti/rahasia, bukan HMAC langsung dari rahasia), deteksi pemalsuan untuk tiap bagian
  (method, path, query, body, waktu, nonce), cache nonce, dan middleware: semua mode, format salah, kedaluwarsa (dua arah), replay, nonce tidak terbakar oleh tanda tangan salah,
  nonce terpisah per token, body tetap terbaca handler, body > 1 MB, dan tanda tangan salah tidak mengonsumsi rate limit.
- **Tes kontrak OpenAPI** kini menandatangani semua request pada server `enforce` (35 operasi) dan memvalidasi respons error `SIGNATURE_*` terhadap spesifikasi.
- **E2E `e2e_signature.ps1` (49):** request sah (GET/POST/DELETE, body unicode, query khusus), wajib bertanda tangan, pemalsuan body/path/query/method (**efeknya tidak terjadi**),
  kunci terikat pada token, kedaluwarsa dua arah, replay (**aksi pengubah data tidak dieksekusi dua kali**), kunci berganti saat refresh dan ganti password,
  kuota rate limit tidak terpakai oleh request tak bertanda tangan, CORS preflight dan header terekspos, serta mode `optional`.
- **Uji mutasi:** mematikan perbandingan tanda tangan dan pencegahan replay membuat 14 pengecekan gagal; kode sudah dikembalikan.
- `e2e_ops` memverifikasi bahwa production default `enforce`.

## Batasan
- Tidak melindungi dari XSS (lihat catatan di atas).
- Cache nonce di memori per proses (satu instance); beberapa instance butuh penyimpanan bersama.
- Swagger UI tidak dapat menghitung tanda tangan: "Try it out" hanya bekerja pada mode `optional`/`off`.
- **Implementasi TypeScript di frontend belum dibuat** (frontend belum dimulai); kontrak dan vektornya sudah siap.
