# Deploy ke VPS (tanpa Docker)

Panduan memasang backend di satu server Linux: **biner Go statis + PostgreSQL + reverse proxy (Caddy atau Nginx) dengan HTTPS**,
dijalankan oleh systemd. Backup harian memakai skrip di `scripts/`.

> **Status verifikasi.** Yang **sudah diuji** di repo ini: build biner Linux statis, konfigurasi production (HSTS, cookie `Secure`,
> log JSON, Swagger mati, bind localhost), `TRUSTED_PROXIES`, backup + restore + retensi. Yang **belum diuji** karena
> butuh VPS sungguhan: file systemd, Caddy/Nginx, sertifikat TLS, cron, dan firewall di bawah. Anggap sebagai titik
> awal, lalu verifikasi dengan [checklist](#checklist-rilis) di akhir.

## Arsitektur

```
Internet --HTTPS--> Caddy/Nginx (:443) --HTTP--> API Go (127.0.0.1:6990) --> PostgreSQL (localhost:5432)
                      │ TLS, X-Forwarded-For            │ migrasi otomatis saat start
                      └ (frontend statis dilayani di sini nanti)
```

- API **hanya** bind ke `127.0.0.1` di production (`HOST` default), jadi tidak bisa dijangkau tanpa reverse proxy.
- Rekomendasi: layani frontend dan API pada **satu domain** (mis. `https://app.example.com/` statis dan `/api` diteruskan ke backend).
  Cookie refresh token memakai `SameSite=Strict`, sehingga tidak terkirim bila frontend dan API berbeda situs (*cross-site*),
  dan dengan satu domain CORS tidak diperlukan.

## 1. Server & PostgreSQL

Contoh Ubuntu/Debian (sesuaikan):

```bash
sudo apt update && sudo apt install -y postgresql caddy        # atau nginx + certbot
sudo -u postgres psql <<'SQL'
CREATE ROLE mpo LOGIN PASSWORD 'PASSWORD_DB_KUAT';
CREATE DATABASE management_project_one OWNER mpo;
SQL
```

- Migrasi membuat ekstensi `pgcrypto` dan `pg_trgm`. Keduanya *trusted extension* (PostgreSQL 13+), jadi pemilik database
  (`mpo`) cukup; tidak perlu superuser. Role aplikasi **tidak** perlu hak `CREATEDB`/superuser.
- Database di server yang sama: biarkan `DB_SSLMODE=disable`. Bila database di host lain, pakai `require` atau `verify-full`.
- Jangan buka port 5432 ke internet.

## 2. Pengguna sistem & direktori

```bash
sudo useradd --system --home /opt/mpo --shell /usr/sbin/nologin mpo
sudo mkdir -p /opt/mpo /etc/mpo
sudo chown mpo:mpo /opt/mpo
```

## 3. Bangun & kirim biner

Di mesin pengembangan (folder `backend/`):

```bash
make build-linux                      # = CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build ... -> bin/api-linux-amd64
scp bin/api-linux-amd64 server:/tmp/api
```

Satu file ±36 MB; **migrasi SQL, `openapi.yaml`, dan Swagger UI sudah tertanam** di dalamnya.

```bash
sudo install -o mpo -g mpo -m 0755 /tmp/api /opt/mpo/api
```

Salin juga skrip backup/restore (dipakai di langkah 8 dan 9). Pastikan `pg_dump` dan `pg_restore` ada di server (paket `postgresql-client`):

```bash
scp -r scripts server:/tmp/mpo-scripts
sudo install -d -o mpo -g mpo /opt/mpo/scripts
sudo install -o mpo -g mpo -m 0755 /tmp/mpo-scripts/*.sh /opt/mpo/scripts/
```

## 4. Konfigurasi production

Buat `/etc/mpo/backend.env` (izin `0600`, pemilik `root`; dibaca systemd, tidak pernah di-commit):

```bash
sudo install -m 0600 -o root -g root /dev/null /etc/mpo/backend.env
sudoedit /etc/mpo/backend.env
```

```ini
APP_ENV=production
PORT=6990
# HOST tidak diisi: production otomatis bind 127.0.0.1

DB_HOST=localhost
DB_PORT=5432
DB_USER=mpo
DB_PASSWORD=<password database>
DB_NAME=management_project_one
DB_SSLMODE=disable

JWT_SECRET=<hasil: openssl rand -hex 32>
COOKIE_SECURE=true                  # WAJIB true di production (server menolak start bila false)
CORS_ORIGINS=https://app.example.com
TRUSTED_PROXIES=127.0.0.1           # IP reverse proxy; tanpa ini semua klien terlihat sebagai 127.0.0.1
# API_SIGNATURE tidak diisi: production otomatis ENFORCE (tiap request terautentikasi wajib bertanda tangan HMAC).
# Jam server harus akurat (NTP: timedatectl set-ntp true); toleransi API_SIGNATURE_SKEW default 5 menit.
APP_TIMEZONE=Asia/Jakarta
API_RATE_LIMIT_PER_MIN=100
# SWAGGER_ENABLED=true              # hanya bila ingin dokumentasi API terbuka di production
```

Server **menolak start** bila `DB_PASSWORD`/`JWT_SECRET` masih nilai contoh atau lemah, `COOKIE_SECURE=false` di production,
`TRUSTED_PROXIES`/`APP_TIMEZONE` tidak valid, dan seterusnya, jadi kesalahan konfigurasi tertangkap saat start.

## 5. systemd

`/etc/systemd/system/mpo-api.service`:

```ini
[Unit]
Description=Management-Project-One API
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
User=mpo
Group=mpo
WorkingDirectory=/opt/mpo
EnvironmentFile=/etc/mpo/backend.env
ExecStart=/opt/mpo/api
Restart=on-failure
RestartSec=3
TimeoutStopSec=20          # graceful shutdown maks. 10 dtk
LimitNOFILE=65536
# pengerasan
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectControlGroups=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mpo-api
curl -s http://127.0.0.1:6990/api/v1/health            # {"success":true,"data":{"status":"ok",...}}
journalctl -u mpo-api -f                               # log JSON, satu baris per request
```

Migrasi database dijalankan otomatis oleh API saat start (idempoten).

## 6. Reverse proxy + HTTPS

**Caddy** (sertifikat Let's Encrypt otomatis). `/etc/caddy/Caddyfile`:

```caddyfile
app.example.com {
    encode zstd gzip
    handle /api/* {
        reverse_proxy 127.0.0.1:6990
    }
    handle {
        root * /var/www/mpo          # build frontend (nanti)
        try_files {path} /index.html
        file_server
    }
}
```

Caddy mengganti `X-Forwarded-For` dengan IP klien sebenarnya, cocok dengan `TRUSTED_PROXIES=127.0.0.1`.

**Nginx** (bila lebih suka; sertifikat via `certbot --nginx`):

```nginx
server {
    server_name app.example.com;
    client_max_body_size 1m;                       # API menolak body > 1 MB

    location /api/ {
        proxy_pass http://127.0.0.1:6990;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;   # TIMPA (bukan $proxy_add_x_forwarded_for) agar tidak bisa di-spoof klien
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
    location / { root /var/www/mpo; try_files $uri /index.html; }
}
```

Aplikasi sudah menambah header keamanan (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, dan HSTS di production).
Untuk `X-Forwarded-For` yang tidak bisa dipalsukan, proxy **harus** menimpa header itu (dua contoh di atas melakukannya).

## 7. Firewall

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

Port 6990 dan 5432 **tidak** dibuka (API sudah hanya bind ke localhost; ini lapisan kedua).

## 8. Backup harian

```bash
sudo mkdir -p /var/backups/mpo && sudo chown mpo:mpo /var/backups/mpo
# crontab pengguna mpo (sudo -u mpo crontab -e):
0 2 * * * BACKUP_DIR=/var/backups/mpo RETENTION_DAYS=14 ENV_FILE=/etc/mpo/backend.env /opt/mpo/scripts/backup-db.sh >> /var/log/mpo-backup.log 2>&1
```

Skrip: `pg_dump` format custom, **diverifikasi** (isi dump dicek memuat semua tabel inti) sebelum diganti nama, izin file `600`,
backup yang gagal tidak merusak backup lama, dan retensi baru berjalan setelah backup baru terverifikasi.
`ENV_FILE` harus bisa dibaca pengguna yang menjalankan cron (mis. `chgrp mpo` + `0640` untuk file env, atau isi `DB_PASSWORD` lewat environment).

**Uji restore berkala (restore drill)** (backup yang tidak pernah diuji bukan backup):

```bash
scripts/restore-db.sh /var/backups/mpo/management_project_one-AAAAMMDD-HHMMSS.dump mpo_restore_check
# bandingkan jumlah baris yang dicetak, lalu: DROP DATABASE mpo_restore_check;
```

Restore menolak menimpa database yang sudah berisi tabel (kecuali `FORCE_OVERWRITE=1`). Untuk memulihkan produksi:
hentikan API, `DROP`/`CREATE` database kosong, restore, lalu start API.
**Salin backup ke luar server** (objek storage, server lain). Backup di disk yang sama tidak melindungi dari kegagalan disk.

Pada pengujian di repo ini, hasil restore terbukti identik dengan sumbernya (checksum md5 isi 8 tabel sama persis).

## 9. Update & rollback

```bash
make build-linux && scp bin/api-linux-amd64 server:/tmp/api
ssh server 'sudo systemctl stop mpo-api && /opt/mpo/scripts/backup-db.sh && sudo install -o mpo -g mpo -m 0755 /tmp/api /opt/mpo/api && sudo systemctl start mpo-api'
```

- Selalu **backup sebelum update**: migrasi baru berjalan otomatis saat start dan tidak otomatis bisa dibatalkan.
- Rollback aplikasi: kembalikan biner lama (simpan `/opt/mpo/api.prev` sebelum menimpa). Bila migrasi baru sudah berjalan dan ikut perlu dibatalkan,
  pulihkan dari backup yang diambil sebelum update (file `*.down.sql` hanya untuk pengembangan).
- Pembersihan refresh token kedaluwarsa berjalan otomatis tiap jam (`TOKEN_CLEANUP_INTERVAL`).

## 10. Pemantauan

- `GET /api/v1/health` → 200 bila API dan database sehat (503 bila database tak terjangkau). Cocok untuk uptime monitor.
- Log (journald, JSON di production): satu baris per request berisi `request_id`, `method`, `route` (pola, bukan URL asli),
  `status`, `latency_ms`, `ip`, `user_id`. **Query string, body, token, dan password tidak dicatat.** Setiap respons membawa `X-Request-ID`
  yang sama dengan log, jadi laporan masalah dari pengguna bisa dilacak: `journalctl -u mpo-api | grep <request_id>`.
- Status 5xx dicatat sebagai `ERROR`, 4xx `WARN`.

## Batasan yang perlu diketahui

- **Batas laju di memori (per proses)**: cukup untuk satu instance. Menjalankan beberapa instance di belakang load balancer butuh penyimpanan
  bersama (mis. Redis), karena tiap instance menghitung sendiri.
- Belum ada metrik (Prometheus) dan pelacakan error eksternal (Sentry); hanya log + `/health`.
- Belum ada fitur lupa password via email (v1.1 pada spesifikasi).
- Frontend belum ada: bagian "layani frontend" di Caddy/Nginx adalah rencana.

## Checklist rilis

Dari spesifikasi bagian 16, dengan status nyata:

- [x] Semua fitur backend (bagian 5) lolos kriteria selesai: lihat [`PROGRESS.md`](PROGRESS.md) (tes e2e + kontrak)
- [ ] Tampil baik di Chrome, Firefox, Safari, dan HP: **frontend belum dikerjakan**
- [ ] Dark mode tanpa teks yang sulit dibaca: **frontend belum dikerjakan**
- [ ] Tidak ada error di console browser: **frontend belum dikerjakan**
- [x] `.env` produksi aman: server menolak secret contoh/lemah dan `COOKIE_SECURE=false`; `.env` di-ignore git
- [ ] `COOKIE_SECURE=true` dan **HTTPS aktif** di server nyata: konfigurasi disiapkan di atas, **perlu diverifikasi di VPS**
- [x] Backup database otomatis harian: skrip + restore **diuji**; [ ] **penjadwalan cron dan salinan di luar server perlu dipasang di VPS**
- [ ] Uji akhir di VPS: `curl https://app.example.com/api/v1/health`, login, buat proyek/tugas, cek `X-Request-ID` ada di log, cek `Strict-Transport-Security` ada, cek port 6990/5432 tertutup dari luar
