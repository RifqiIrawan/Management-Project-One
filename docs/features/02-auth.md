# 02 – Autentikasi (Auth)

**Status:** ✅  
**Tanggal selesai:** 2026-11-19  
**Spesifikasi:** Bagian 5.1, 7, 8.2, 8.3, 11

## Tujuan
Pengguna bisa mendaftar, login, tetap login lewat refresh token, logout, melihat/mengubah profil,
dan mengganti password. Endpoint lain nanti dilindungi middleware `Auth`.

## Yang dibuat
| Lapisan | File |
|---|---|
| Migrasi | `migrations/000001_create_users`, `000002_create_refresh_tokens` (otomatis dijalankan saat server start via `golang-migrate`, SQL ikut ter-embed ke binary) |
| Model | `model/user.go`, `model/refresh_token.go` |
| DTO | `dto/auth_dto.go` |
| Repository | `repository/user_repository.go`, `token_repository.go` (GORM; belum perlu `Raw()`) |
| Service | `service/auth_service.go`, `user_service.go` |
| Handler | `handler/auth_handler.go`, `user_handler.go` |
| Middleware | `middleware/auth.go`, `rate_limit.go`, `security.go` |
| Util | `pkg/jwt`, `pkg/hash` (bcrypt), `pkg/validator` (pesan Indonesia), `pkg/apperror`, `pkg/response` |

## Endpoint API
| Method | Path | Auth | Keterangan |
|---|---|---|---|
| POST | `/api/v1/auth/register` | – | Daftar. Rate limit 5/menit/IP. 201 / 400 / 409 |
| POST | `/api/v1/auth/login` | – | Login → `access_token` di body + cookie `refresh_token`. Rate limit 5/menit/IP |
| POST | `/api/v1/auth/refresh` | cookie | Rotasi refresh token, access token baru |
| POST | `/api/v1/auth/logout` | cookie | Cabut refresh token perangkat ini |
| POST | `/api/v1/auth/logout-all` | 🔒 | Cabut semua sesi + matikan semua access token |
| GET | `/api/v1/me` | 🔒 | Profil saya |
| PATCH | `/api/v1/me` | 🔒 | Ubah `name` / `avatar_color` |
| PATCH | `/api/v1/me/password` | 🔒 | Ganti password (butuh password lama) |

Format response & kode error mengikuti Bagian 8.1 spesifikasi (`VALIDATION_ERROR`, `UNAUTHORIZED`, `TOKEN_EXPIRED`, `CONFLICT`, `TOO_MANY_REQUESTS`, `INTERNAL_ERROR`).

## Aturan bisnis
- Email unik, otomatis lowercase & di-trim. Password min 8 karakter, wajib huruf **dan** angka, maks 72 byte (batas bcrypt).
- Password di-hash bcrypt (cost dari `BCRYPT_COST`, default 12). Hash tidak pernah ada di response.
- Pesan login salah **sama** untuk email tak terdaftar maupun password salah ("Email atau password salah"); untuk email tak terdaftar tetap dilakukan perbandingan bcrypt tiruan agar waktu respons tidak membocorkan.
- **Access token**: JWT HS256, 15 menit, claim `sub`, `ver`, `iss`, `iat`, `exp`, `jti`. Algoritma, issuer, dan expiry divalidasi (token `alg:none` ditolak). Disimpan frontend di memori.
- **Refresh token**: 32 byte acak, 7 hari, dikirim sebagai cookie `HttpOnly`, `SameSite=Strict`, `Secure` sesuai `COOKIE_SECURE`, path `/api/v1/auth`. Di database hanya **hash SHA-256**-nya.
- **Rotasi + deteksi pencurian**: tiap refresh mencabut token lama. Jika token yang sudah dicabut dipakai lagi, **semua** sesi user dicabut. Pencabutan memakai `UPDATE ... WHERE revoked_at IS NULL` sehingga aman untuk request bersamaan.
- **`token_version`**: `Auth` middleware membandingkan claim `ver` dengan database. Ganti password & logout-all menaikkan versi sehingga access token lama langsung mati (tanpa menunggu 15 menit).
- Ganti password: cabut semua sesi lalu otomatis buat sesi baru untuk perangkat yang sedang dipakai.
- Header keamanan (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) dan batas body 1 MB. `ClientIP` memakai alamat koneksi asli (proxy tidak dipercaya) agar rate limit tidak bisa di-spoof lewat `X-Forwarded-For`.

## Konfigurasi baru (`backend/.env`)
`JWT_SECRET` (**wajib**, ≥ 32 karakter), `JWT_ISSUER`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `COOKIE_SECURE`, `BCRYPT_COST`.
Buat secret: `openssl rand -hex 32`. CORS frontend default `http://localhost:6969`.

## Cara mencoba
```bash
cd backend && go run ./cmd/api           # migrasi berjalan otomatis
curl -i -X POST localhost:8080/api/v1/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Budi","email":"budi@example.com","password":"Passw0rd1","confirm_password":"Passw0rd1"}'
curl -i -c jar.txt -X POST localhost:8080/api/v1/auth/login -H "Content-Type: application/json" \
  -d '{"email":"budi@example.com","password":"Passw0rd1"}'
curl -b jar.txt -X POST localhost:8080/api/v1/auth/refresh
curl localhost:8080/api/v1/me -H "Authorization: Bearer <access_token>"
```

## Testing
- Unit: `go test ./...` → `pkg/jwt` (round-trip, expired, secret/issuer salah, `alg:none`, refresh hash) dan `pkg/validator` (aturan password).
- End-to-end terhadap server + PostgreSQL asli (32 skenario): register (201, email lowercase, duplikat 409, validasi 400, tanpa `password_hash`), login (cookie HttpOnly + SameSite=Strict, pesan error sama untuk email tak terdaftar), `/me` tanpa/palsu/valid token, ubah profil, refresh + rotasi, **token lama dipakai ulang → semua sesi dicabut**, logout, ganti password (token & sesi lama mati, sesi perangkat ini tetap hidup), logout-all, dan rate limit login → 429.
- Pelajaran: cek 401 pada refresh harus memverifikasi pesan error ("Sesi tidak valid"), bukan hanya status, agar tidak lolos karena alasan yang salah.

## Catatan & keputusan
- Rate limit di memori (per proses); cukup untuk satu instance. Perlu Redis bila di-scale horizontal.
- Rate limit 5/menit dipasang terpisah untuk `/register` dan `/login`.
- Belum ada: lupa password via email (v1.1), unit test service dengan mock repository (dijadwalkan di fase testing).
