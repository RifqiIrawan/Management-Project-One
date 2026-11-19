# Management-Project-One

> Aplikasi manajemen proyek & tugas untuk tim (terinspirasi Jira / ClickUp).
> Dokumen ini adalah **spesifikasi teknis MVP**: struktur proyek, fitur detail, database, API, autentikasi JWT, dan panduan UI/UX.

---

## Daftar Isi

1. [Ringkasan Proyek](#1-ringkasan-proyek)
2. [Tech Stack](#2-tech-stack)
3. [Arsitektur Sistem](#3-arsitektur-sistem)
4. [Struktur Folder](#4-struktur-folder)
5. [Fitur MVP (Detail)](#5-fitur-mvp-detail)
6. [Database PostgreSQL](#6-database-postgresql)
7. [Autentikasi JWT](#7-autentikasi-jwt)
8. [API Endpoint](#8-api-endpoint)
9. [Panduan UI/UX](#9-panduan-uiux)
10. [Halaman & Komponen Frontend](#10-halaman--komponen-frontend)
11. [Keamanan](#11-keamanan)
12. [Konfigurasi & Environment](#12-konfigurasi--environment)
13. [Menjalankan Proyek (Docker)](#13-menjalankan-proyek-docker)
14. [Konvensi Kode & Git](#14-konvensi-kode--git)
15. [Testing](#15-testing)
16. [Roadmap Pengerjaan](#16-roadmap-pengerjaan)
17. [Fitur Setelah MVP](#17-fitur-setelah-mvp)

---

## 1. Ringkasan Proyek

| Item | Keterangan |
|---|---|
| Nama | **Management-Project-One** |
| Jenis | Web app manajemen proyek & tugas tim |
| Target pengguna | Tim kecil–menengah (2–50 orang) |
| Masalah yang diselesaikan | Tugas tercecer di chat, tidak jelas siapa mengerjakan apa, progres sulit dipantau |
| Alur utama | Buat proyek → undang tim → buat & bagi tugas → pantau di Kanban → diskusi di komentar → selesai |

### Tujuan MVP
- Tim bisa **mengelola tugas harian** sepenuhnya di aplikasi ini.
- Setiap anggota tahu **tugasnya sendiri** dan **status pekerjaan tim**.
- Tampilan **modern, cepat, responsif** (desktop & mobile), mendukung **dark mode**.

---

## 2. Tech Stack

### Backend
| Kebutuhan | Teknologi |
|---|---|
| Bahasa | **Go** 1.22+ (disarankan versi stabil terbaru) |
| Web framework | **Gin** (`github.com/gin-gonic/gin`) |
| Database | **PostgreSQL** 16+ |
| ORM | **GORM** + driver `gorm.io/driver/postgres` |
| Migrasi | **golang-migrate** (file SQL di folder `migrations/`) |
| Autentikasi | **JWT** (`github.com/golang-jwt/jwt/v5`) — access + refresh token |
| Hash password | **bcrypt** (`golang.org/x/crypto/bcrypt`) |
| Validasi | `go-playground/validator` (bawaan Gin binding) |
| Konfigurasi | `.env` via `github.com/joho/godotenv` |
| Logging | `log/slog` (bawaan Go) |
| CORS | `github.com/gin-contrib/cors` |
| Rate limit | `golang.org/x/time/rate` |
| Dokumentasi API | **Swagger** (`swaggo/swag` + `gin-swagger`) |
| Hot reload (dev) | **Air** (`github.com/air-verse/air`) |

### Frontend
| Kebutuhan | Teknologi |
|---|---|
| Library UI | **React** + **TypeScript** |
| Build tool | **Vite** |
| CSS framework | **Bootstrap 5.3** + **React-Bootstrap** |
| Ikon | **Bootstrap Icons** (`bootstrap-icons`) |
| Routing | **React Router** |
| Data fetching / cache | **TanStack Query** (React Query) |
| HTTP client | **Axios** (dengan interceptor untuk JWT) |
| State global ringan | **Zustand** (auth, tema, UI) |
| Form & validasi | **React Hook Form** + **Zod** |
| Drag & drop Kanban | **dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`) |
| Tanggal | **Day.js** (locale `id`) |
| Notifikasi toast | **react-hot-toast** atau Toast React-Bootstrap |
| Styling tambahan | **SCSS** (override variabel Bootstrap) |
| Lint & format | ESLint + Prettier |

### Infrastruktur
| Kebutuhan | Teknologi |
|---|---|
| Container | Docker + Docker Compose |
| Reverse proxy (produksi) | Nginx / Caddy |
| Version control | Git + GitHub |

---

## 3. Arsitektur Sistem

```
┌──────────────────────┐   HTTPS / JSON   ┌───────────────────────────┐   SQL   ┌──────────────┐
│  React + TS (Vite)   │ ───────────────► │  Go + Gin REST API        │ ──────► │  PostgreSQL  │
│  Bootstrap 5         │ ◄─────────────── │  /api/v1/...              │ ◄────── │              │
│                      │   Bearer JWT     │                           │         │              │
└──────────────────────┘                  └───────────────────────────┘         └──────────────┘
```

### Arsitektur Backend (Clean / Layered)

```
Request → Router → Middleware (CORS, Logger, Auth JWT, RBAC)
        → Handler   (parsing request, validasi, response JSON)
        → Service   (logika bisnis & aturan hak akses)
        → Repository(query database via GORM)
        → PostgreSQL
```

| Layer | Tanggung jawab | Tidak boleh |
|---|---|---|
| **Handler** | Bind & validasi input, panggil service, kirim response | Query database langsung |
| **Service** | Aturan bisnis, cek hak akses, transaksi | Tahu soal HTTP / Gin |
| **Repository** | CRUD & query database | Berisi logika bisnis |
| **Model** | Struct tabel database | — |
| **DTO** | Struct request & response API | Diekspos sebagai model DB |

---

## 4. Struktur Folder

### Root
```
Management-Project-One/
├── backend/
├── frontend/
├── docker-compose.yml
├── .gitignore
└── README.md
```

### Backend (Go + Gin)
```
backend/
├── cmd/
│   └── api/
│       └── main.go                 # entry point: load config, DB, router, jalankan server
├── internal/
│   ├── config/
│   │   └── config.go               # baca .env ke struct Config
│   ├── database/
│   │   └── postgres.go             # koneksi GORM ke PostgreSQL + connection pool
│   ├── model/                      # struct tabel database
│   │   ├── user.go
│   │   ├── refresh_token.go
│   │   ├── project.go
│   │   ├── project_member.go
│   │   ├── task.go
│   │   ├── comment.go
│   │   └── activity.go
│   ├── dto/                        # struct request/response API
│   │   ├── auth_dto.go
│   │   ├── user_dto.go
│   │   ├── project_dto.go
│   │   ├── task_dto.go
│   │   ├── comment_dto.go
│   │   └── pagination.go
│   ├── repository/
│   │   ├── user_repository.go
│   │   ├── token_repository.go
│   │   ├── project_repository.go
│   │   ├── member_repository.go
│   │   ├── task_repository.go
│   │   ├── comment_repository.go
│   │   └── activity_repository.go
│   ├── service/
│   │   ├── auth_service.go
│   │   ├── user_service.go
│   │   ├── project_service.go
│   │   ├── member_service.go
│   │   ├── task_service.go
│   │   ├── comment_service.go
│   │   └── dashboard_service.go
│   ├── handler/
│   │   ├── auth_handler.go
│   │   ├── user_handler.go
│   │   ├── project_handler.go
│   │   ├── member_handler.go
│   │   ├── task_handler.go
│   │   ├── comment_handler.go
│   │   └── dashboard_handler.go
│   ├── middleware/
│   │   ├── auth.go                 # verifikasi access token JWT
│   │   ├── project_access.go       # cek user anggota proyek / role owner
│   │   ├── cors.go
│   │   ├── logger.go
│   │   ├── rate_limit.go
│   │   └── recovery.go
│   ├── router/
│   │   └── router.go               # daftar semua route /api/v1
│   └── pkg/
│       ├── jwt/
│       │   └── jwt.go              # generate & parse access/refresh token
│       ├── hash/
│       │   └── password.go         # bcrypt hash & compare
│       ├── response/
│       │   └── response.go         # format JSON sukses & error seragam
│       ├── apperror/
│       │   └── errors.go           # ErrNotFound, ErrForbidden, dll.
│       └── validator/
│           └── validator.go        # pesan validasi bahasa Indonesia
├── migrations/
│   ├── 000001_create_users.up.sql
│   ├── 000001_create_users.down.sql
│   ├── 000002_create_refresh_tokens.up.sql
│   ├── 000002_create_refresh_tokens.down.sql
│   ├── 000003_create_projects.up.sql
│   ├── 000003_create_projects.down.sql
│   ├── 000004_create_project_members.up.sql
│   ├── 000004_create_project_members.down.sql
│   ├── 000005_create_tasks.up.sql
│   ├── 000005_create_tasks.down.sql
│   ├── 000006_create_comments.up.sql
│   ├── 000006_create_comments.down.sql
│   ├── 000007_create_activities.up.sql
│   └── 000007_create_activities.down.sql
├── docs/                           # hasil generate Swagger
├── tests/
├── .env.example
├── .air.toml
├── Dockerfile
├── Makefile
├── go.mod
└── go.sum
```

### Frontend (React + TypeScript + Bootstrap)
```
frontend/
├── public/
│   └── favicon.svg
├── src/
│   ├── main.tsx                    # entry point, provider (QueryClient, Router, Theme)
│   ├── App.tsx
│   ├── api/                        # pemanggilan API per modul
│   │   ├── axios.ts                # instance Axios + interceptor JWT & refresh token
│   │   ├── auth.api.ts
│   │   ├── user.api.ts
│   │   ├── project.api.ts
│   │   ├── member.api.ts
│   │   ├── task.api.ts
│   │   ├── comment.api.ts
│   │   └── dashboard.api.ts
│   ├── hooks/                      # custom hook TanStack Query
│   │   ├── useAuth.ts
│   │   ├── useProjects.ts
│   │   ├── useTasks.ts
│   │   ├── useComments.ts
│   │   ├── useDebounce.ts
│   │   └── useKeyboardShortcut.ts
│   ├── store/                      # Zustand
│   │   ├── authStore.ts            # user aktif & access token (di memori)
│   │   ├── themeStore.ts           # light / dark / system
│   │   └── uiStore.ts              # sidebar collapse, modal aktif
│   ├── types/                      # tipe TypeScript
│   │   ├── user.ts
│   │   ├── project.ts
│   │   ├── task.ts
│   │   ├── comment.ts
│   │   └── api.ts                  # ApiResponse<T>, Paginated<T>, ApiError
│   ├── schemas/                    # skema validasi Zod
│   │   ├── auth.schema.ts
│   │   ├── project.schema.ts
│   │   └── task.schema.ts
│   ├── layouts/
│   │   ├── AuthLayout.tsx          # layout halaman login/register (split screen)
│   │   └── AppLayout.tsx           # sidebar + topbar + konten
│   ├── routes/
│   │   ├── index.tsx               # definisi route
│   │   ├── ProtectedRoute.tsx      # wajib login
│   │   └── GuestRoute.tsx          # hanya untuk yang belum login
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── LoginPage.tsx
│   │   │   └── RegisterPage.tsx
│   │   ├── dashboard/
│   │   │   └── DashboardPage.tsx
│   │   ├── my-tasks/
│   │   │   └── MyTasksPage.tsx
│   │   ├── projects/
│   │   │   ├── ProjectListPage.tsx
│   │   │   ├── ProjectBoardPage.tsx    # tampilan Kanban
│   │   │   ├── ProjectListViewPage.tsx # tampilan tabel
│   │   │   └── ProjectSettingsPage.tsx
│   │   ├── profile/
│   │   │   └── ProfilePage.tsx
│   │   └── NotFoundPage.tsx
│   ├── components/
│   │   ├── common/                 # komponen umum reusable
│   │   │   ├── Avatar.tsx
│   │   │   ├── AvatarGroup.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── PriorityBadge.tsx
│   │   │   ├── DueDateLabel.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── SkeletonCard.tsx
│   │   │   ├── ConfirmDialog.tsx
│   │   │   ├── SearchInput.tsx
│   │   │   ├── ThemeToggle.tsx
│   │   │   └── Spinner.tsx
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Topbar.tsx
│   │   │   ├── UserMenu.tsx
│   │   │   └── Breadcrumbs.tsx
│   │   ├── project/
│   │   │   ├── ProjectCard.tsx
│   │   │   ├── ProjectFormModal.tsx
│   │   │   ├── ProjectHeader.tsx       # nama proyek + tab Board/List + tombol aksi
│   │   │   ├── MemberList.tsx
│   │   │   └── InviteMemberModal.tsx
│   │   ├── task/
│   │   │   ├── KanbanBoard.tsx
│   │   │   ├── KanbanColumn.tsx
│   │   │   ├── TaskCard.tsx
│   │   │   ├── QuickAddTask.tsx        # input cepat di bawah kolom
│   │   │   ├── TaskTable.tsx
│   │   │   ├── TaskFilterBar.tsx
│   │   │   ├── TaskFormModal.tsx
│   │   │   └── TaskDetailOffcanvas.tsx # panel detail dari kanan
│   │   └── comment/
│   │       ├── CommentList.tsx
│   │       ├── CommentItem.tsx
│   │       └── CommentForm.tsx
│   ├── styles/
│   │   ├── _variables.scss         # override warna, radius, font Bootstrap
│   │   ├── _dark.scss              # penyesuaian dark mode
│   │   ├── _kanban.scss
│   │   └── main.scss               # import bootstrap + custom
│   ├── utils/
│   │   ├── format.ts               # format tanggal, inisial nama
│   │   ├── constants.ts            # STATUS, PRIORITY, label & warna
│   │   └── storage.ts
│   └── vite-env.d.ts
├── .env.example
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── eslint.config.js
├── .prettierrc
└── Dockerfile
```

---

## 5. Fitur MVP (Detail)

Setiap fitur memiliki **user story** dan **kriteria selesai (acceptance criteria)**.

### 5.1 Autentikasi & Akun

**User story:** Sebagai pengguna, saya ingin membuat akun dan login agar data proyek saya aman.

| Fitur | Detail |
|---|---|
| Register | Nama, email, password, konfirmasi password |
| Login | Email + password → mendapat access token & refresh token |
| Tetap login | Refresh token otomatis memperbarui access token |
| Logout | Refresh token dicabut di server |
| Logout semua perangkat | Cabut semua refresh token milik user |
| Profil | Lihat & ubah nama, warna avatar |
| Ganti password | Wajib masukkan password lama |

**Kriteria selesai:**
- [ ] Email unik, format valid, otomatis lowercase.
- [ ] Password minimal 8 karakter, mengandung huruf & angka.
- [ ] Password disimpan sebagai hash bcrypt (cost 12).
- [ ] Pesan error login **umum** ("Email atau password salah") — tidak membocorkan email terdaftar atau tidak.
- [ ] Login dibatasi 5 percobaan / menit per IP.
- [ ] Saat access token kedaluwarsa, frontend otomatis refresh tanpa user sadar.
- [ ] Setelah ganti password, semua sesi lain otomatis logout.

### 5.2 Dashboard

**User story:** Sebagai anggota tim, saya ingin melihat ringkasan pekerjaan saya begitu login.

| Komponen | Isi |
|---|---|
| Sapaan | "Selamat pagi, Budi 👋" (sesuai jam lokal) |
| Kartu statistik | Total tugas saya, sedang dikerjakan, jatuh tempo minggu ini, terlambat |
| Tugas jatuh tempo | 5 tugas terdekat deadline-nya |
| Proyek terbaru | 4–6 kartu proyek + progress bar |
| Aktivitas terbaru | 10 aktivitas terakhir dari proyek yang diikuti |

**Kriteria selesai:**
- [ ] Data dashboard diambil dalam **satu** endpoint (`GET /dashboard`).
- [ ] Tampil skeleton loading saat memuat.
- [ ] Tugas terlambat ditandai merah.

### 5.3 Proyek

**User story:** Sebagai owner, saya ingin membuat proyek dan mengelola anggotanya.

| Fitur | Detail |
|---|---|
| Buat proyek | Nama (wajib), deskripsi, **key** (kode 2–5 huruf, mis. `MPO`), warna, ikon/emoji |
| Daftar proyek | Grid kartu: nama, warna, jumlah tugas, progress %, avatar anggota |
| Cari proyek | Berdasarkan nama |
| Edit proyek | Nama, deskripsi, warna, ikon (owner) |
| Arsipkan proyek | Proyek disembunyikan, tidak dihapus (owner) |
| Hapus proyek | Wajib ketik nama proyek untuk konfirmasi (owner) |
| Favorit | Pin proyek ke atas sidebar (per user) |

**Kriteria selesai:**
- [ ] Pembuat proyek otomatis menjadi anggota dengan role `owner`.
- [ ] `key` unik dan dipakai untuk kode tugas: `MPO-1`, `MPO-2`, dst.
- [ ] Progress = tugas `done` / total tugas × 100%.
- [ ] User non-anggota mendapat **404** (bukan 403) agar keberadaan proyek tidak bocor.

### 5.4 Anggota Proyek

| Fitur | Detail |
|---|---|
| Undang anggota | Cari user berdasarkan email (user sudah terdaftar) |
| Daftar anggota | Avatar, nama, email, role, tanggal bergabung |
| Ubah role | `owner` ↔ `member` (owner) |
| Keluarkan anggota | Owner |
| Keluar dari proyek | Member bisa keluar sendiri |

**Hak akses:**
| Aksi | Owner | Member |
|---|:---:|:---:|
| Lihat proyek & tugas | ✅ | ✅ |
| Buat / edit / pindah tugas | ✅ | ✅ |
| Hapus tugas | ✅ | ✅ (hanya buatannya sendiri) |
| Edit pengaturan proyek | ✅ | ❌ |
| Undang / keluarkan anggota | ✅ | ❌ |
| Hapus / arsipkan proyek | ✅ | ❌ |

**Kriteria selesai:**
- [ ] Proyek minimal punya 1 owner (owner terakhir tidak bisa turun role / keluar).
- [ ] Saat anggota dikeluarkan, tugasnya menjadi *unassigned*.

### 5.5 Tugas (Inti Aplikasi)

**User story:** Sebagai anggota tim, saya ingin membuat, membagi, dan memantau tugas.

| Field | Tipe | Keterangan |
|---|---|---|
| Kode | otomatis | `MPO-12` |
| Judul | wajib | maks. 200 karakter |
| Deskripsi | opsional | teks panjang (mendukung Markdown sederhana) |
| Status | wajib | `todo` · `in_progress` · `in_review` · `done` |
| Prioritas | wajib | `low` · `medium` · `high` · `urgent` |
| Assignee | opsional | harus anggota proyek |
| Tanggal mulai | opsional | |
| Deadline | opsional | tidak boleh sebelum tanggal mulai |
| Label | opsional | teks bebas, maks. 5 (disimpan sebagai array) |
| Pembuat | otomatis | |
| Posisi | otomatis | urutan kartu dalam kolom Kanban |

| Fitur | Detail |
|---|---|
| Buat tugas cepat | Ketik judul di bawah kolom Kanban → Enter |
| Buat tugas lengkap | Modal dengan semua field |
| Detail tugas | Panel samping (offcanvas) — edit langsung di tempat (*inline edit*) |
| Pindah status | Drag & drop antar kolom, atau dropdown di detail |
| Ubah urutan | Drag & drop dalam satu kolom |
| Assign | Pilih anggota dari dropdown dengan avatar |
| Hapus | Dengan dialog konfirmasi |
| Salin link tugas | Tombol "Copy link" |

**Kriteria selesai:**
- [ ] Drag & drop memakai **optimistic update** (UI langsung berubah, rollback bila API gagal).
- [ ] Tugas baru otomatis berstatus `todo` dan berada di posisi paling atas kolom.
- [ ] Saat status jadi `done`, field `completed_at` terisi otomatis.
- [ ] Setiap perubahan penting tercatat di tabel `activities`.

### 5.6 Tampilan Kanban Board

- 4 kolom: **To Do**, **In Progress**, **In Review**, **Done**.
- Header kolom: nama, jumlah tugas, tombol `+`.
- Kartu tugas menampilkan: kode, judul, badge prioritas, label, deadline, avatar assignee, jumlah komentar.
- Kolom bisa di-scroll vertikal; board bisa di-scroll horizontal di mobile.
- Kartu yang sedang di-drag terlihat terangkat (shadow + sedikit miring).

### 5.7 Tampilan List (Tabel)

- Kolom: Kode, Judul, Status, Prioritas, Assignee, Deadline, Dibuat.
- Sort dengan klik header kolom.
- Pagination (20 per halaman) atau *infinite scroll*.
- Klik baris → membuka panel detail tugas.

### 5.8 Filter & Pencarian

| Filter | Pilihan |
|---|---|
| Kata kunci | Cari di judul & kode (debounce 300 ms) |
| Status | Multi-pilih |
| Prioritas | Multi-pilih |
| Assignee | Multi-pilih, termasuk "Belum di-assign" |
| Deadline | Terlambat · Hari ini · Minggu ini · Tanpa deadline |
| Cepat | Toggle "Hanya tugas saya" |

**Kriteria selesai:**
- [ ] Filter tersimpan di **URL query string** (bisa dibagikan & tidak hilang saat refresh).
- [ ] Tombol "Reset filter" muncul bila ada filter aktif.
- [ ] Filter berlaku untuk tampilan Board maupun List.

### 5.9 Halaman "Tugas Saya"

- Semua tugas yang di-assign ke saya, lintas proyek.
- Dikelompokkan: **Terlambat**, **Hari ini**, **Minggu ini**, **Nanti**, **Tanpa deadline**.
- Checkbox cepat untuk menandai selesai.

### 5.10 Komentar

| Fitur | Detail |
|---|---|
| Tulis komentar | Textarea yang membesar otomatis, kirim dengan `Ctrl + Enter` |
| Daftar komentar | Avatar, nama, waktu relatif ("5 menit lalu") |
| Edit komentar | Hanya penulis, tampil label "(diedit)" |
| Hapus komentar | Penulis atau owner proyek |

### 5.11 Riwayat Aktivitas

Dicatat otomatis oleh backend, tampil di panel detail tugas dan dashboard:
- "**Budi** membuat tugas MPO-12"
- "**Sari** memindahkan MPO-12 dari *To Do* ke *In Progress*"
- "**Budi** meng-assign MPO-12 ke **Andi**"
- "**Andi** mengomentari MPO-12"

### 5.12 Preferensi Tampilan

- **Dark mode / Light mode / Ikuti sistem** (disimpan di `localStorage`).
- Sidebar bisa diciutkan (*collapse*).
- Bahasa antarmuka: **Indonesia**.

---

## 6. Database PostgreSQL

### 6.1 Diagram Relasi (ERD)

```
users ─────┬──────< refresh_tokens
           │
           ├──────< project_members >────── projects
           │                                   │
           ├── (assignee_id / created_by) ──< tasks ──< comments
           │                                   │
           └──────────────────────────────< activities
```

### 6.2 Skema SQL

```sql
-- Ekstensi untuk UUID & pencarian teks
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =========================================================
-- 1. USERS
-- =========================================================
CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           VARCHAR(100) NOT NULL,
    email          VARCHAR(150) NOT NULL UNIQUE,
    password_hash  TEXT         NOT NULL,
    avatar_color   VARCHAR(7)   NOT NULL DEFAULT '#6366F1',
    token_version  INT          NOT NULL DEFAULT 0,   -- naik saat ganti password → token lama tidak berlaku
    last_login_at  TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- =========================================================
-- 2. REFRESH TOKENS
-- =========================================================
CREATE TABLE refresh_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT        NOT NULL UNIQUE,          -- SHA-256 dari token, bukan token asli
    user_agent   TEXT,
    ip_address   VARCHAR(45),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- =========================================================
-- 3. PROJECTS
-- =========================================================
CREATE TABLE projects (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(150) NOT NULL,
    key          VARCHAR(5)   NOT NULL UNIQUE,         -- contoh: MPO
    description  TEXT,
    color        VARCHAR(7)   NOT NULL DEFAULT '#6366F1',
    icon         VARCHAR(10),                          -- emoji
    owner_id     UUID         NOT NULL REFERENCES users(id),
    task_counter INT          NOT NULL DEFAULT 0,      -- untuk nomor MPO-1, MPO-2, ...
    archived_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- =========================================================
-- 4. PROJECT MEMBERS
-- =========================================================
CREATE TABLE project_members (
    project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    role        VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    is_favorite BOOLEAN     NOT NULL DEFAULT false,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX idx_members_user ON project_members(user_id);

-- =========================================================
-- 5. TASKS
-- =========================================================
CREATE TABLE tasks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    number        INT          NOT NULL,               -- 12 → tampil MPO-12
    title         VARCHAR(200) NOT NULL,
    description   TEXT,
    status        VARCHAR(15)  NOT NULL DEFAULT 'todo'
                  CHECK (status IN ('todo', 'in_progress', 'in_review', 'done')),
    priority      VARCHAR(10)  NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    labels        TEXT[]       NOT NULL DEFAULT '{}',
    position      DOUBLE PRECISION NOT NULL DEFAULT 0, -- urutan di kolom (fractional indexing)
    assignee_id   UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_by    UUID         NOT NULL REFERENCES users(id),
    start_date    DATE,
    due_date      DATE,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (project_id, number),
    CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date)
);
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status, position);
CREATE INDEX idx_tasks_assignee       ON tasks(assignee_id);
CREATE INDEX idx_tasks_due_date       ON tasks(due_date);
CREATE INDEX idx_tasks_title_trgm     ON tasks USING gin (title gin_trgm_ops);  -- pencarian cepat

-- =========================================================
-- 6. COMMENTS
-- =========================================================
CREATE TABLE comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id),
    body        TEXT        NOT NULL CHECK (length(trim(body)) > 0),
    edited_at   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_task ON comments(task_id, created_at);

-- =========================================================
-- 7. ACTIVITIES (riwayat)
-- =========================================================
CREATE TABLE activities (
    id          BIGSERIAL PRIMARY KEY,
    project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id     UUID        REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id),
    action      VARCHAR(30) NOT NULL,   -- task.created, task.status_changed, task.assigned, comment.created, ...
    metadata    JSONB       NOT NULL DEFAULT '{}',  -- contoh: {"from":"todo","to":"in_progress"}
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activities_project ON activities(project_id, created_at DESC);
CREATE INDEX idx_activities_task    ON activities(task_id, created_at DESC);
```

### 6.3 Catatan Desain
- **UUID** sebagai primary key → ID tidak bisa ditebak (`/tasks/1`, `/tasks/2`).
- **Nomor tugas** (`MPO-12`) dibuat dalam **transaksi**: `UPDATE projects SET task_counter = task_counter + 1 ... RETURNING task_counter`.
- **`position` bertipe desimal** → saat kartu dipindah di antara posisi 1.0 dan 2.0, cukup beri nilai 1.5 (tidak perlu update semua kartu).
- **`pg_trgm`** mempercepat pencarian `ILIKE '%kata%'` pada judul tugas.
- Semua waktu disimpan dalam **UTC** (`TIMESTAMPTZ`), frontend mengubah ke WIB.

---

## 7. Autentikasi JWT

### 7.1 Strategi Token

| Token | Masa berlaku | Disimpan di (frontend) | Isi |
|---|---|---|---|
| **Access token** (JWT) | 15 menit | **Memori** (Zustand) — tidak di localStorage | `sub` (user_id), `ver` (token_version), `exp`, `iat`, `jti` |
| **Refresh token** | 7 hari | **Cookie HttpOnly, Secure, SameSite=Strict** | String acak 32 byte (hash-nya disimpan di DB) |

**Kenapa begini?**
- Access token di memori → tidak bisa dicuri lewat XSS yang membaca `localStorage`.
- Refresh token di cookie HttpOnly → JavaScript tidak bisa membacanya.
- Refresh token disimpan **hash**-nya di DB → bisa dicabut (logout) kapan saja.

### 7.2 Alur Login

```
Frontend                                  Backend                         PostgreSQL
   │ POST /auth/login {email, password}      │                                 │
   │────────────────────────────────────────►│ cari user by email              │
   │                                         │────────────────────────────────►│
   │                                         │ bcrypt.Compare(password)        │
   │                                         │ buat access token (JWT, 15 m)   │
   │                                         │ buat refresh token (acak, 7 h)  │
   │                                         │ simpan hash refresh token ─────►│
   │◄────────────────────────────────────────│                                 │
   │  body: { access_token, user }           │                                 │
   │  Set-Cookie: refresh_token=...; HttpOnly│                                 │
```

### 7.3 Alur Refresh Token (dengan Rotasi)

1. Request API mendapat **401** karena access token kedaluwarsa.
2. Interceptor Axios memanggil `POST /auth/refresh` (cookie terkirim otomatis).
3. Backend:
   - Cek hash token ada di DB, belum dicabut, belum kedaluwarsa.
   - **Cabut token lama**, buat refresh token baru (**rotasi**).
   - Kirim access token baru + cookie refresh token baru.
4. Interceptor mengulang request yang tadi gagal.
5. **Deteksi pencurian:** jika refresh token yang **sudah dicabut** dipakai lagi → cabut **semua** token user tersebut (paksa login ulang).

### 7.4 Contoh Kode Backend

**Generate access token** — `internal/pkg/jwt/jwt.go`
```go
package jwt

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Claims struct {
	TokenVersion int `json:"ver"`
	jwt.RegisteredClaims
}

type Manager struct {
	secret    []byte
	accessTTL time.Duration
	issuer    string
}

func NewManager(secret string, accessTTL time.Duration, issuer string) *Manager {
	return &Manager{secret: []byte(secret), accessTTL: accessTTL, issuer: issuer}
}

func (m *Manager) GenerateAccessToken(userID string, tokenVersion int) (string, error) {
	now := time.Now()
	claims := Claims{
		TokenVersion: tokenVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			Issuer:    m.issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.accessTTL)),
			ID:        uuid.NewString(),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
}

func (m *Manager) ParseAccessToken(tokenStr string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims,
		func(t *jwt.Token) (any, error) { return m.secret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), // tolak alg lain / "none"
		jwt.WithIssuer(m.issuer),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return nil, err
	}
	return claims, nil
}
```

**Middleware auth** — `internal/middleware/auth.go`
```go
package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"management-project-one/internal/pkg/jwt"
)

const ContextUserID = "userID"

func Auth(jm *jwt.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		tokenStr, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || tokenStr == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized,
				gin.H{"success": false, "error": gin.H{"code": "UNAUTHORIZED", "message": "Silakan login terlebih dahulu"}})
			return
		}

		claims, err := jm.ParseAccessToken(tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized,
				gin.H{"success": false, "error": gin.H{"code": "TOKEN_EXPIRED", "message": "Sesi berakhir"}})
			return
		}

		// (Opsional) cek claims.TokenVersion == users.token_version di DB / cache
		c.Set(ContextUserID, claims.Subject)
		c.Next()
	}
}
```

**Set cookie refresh token** — di `auth_handler.go`
```go
c.SetSameSite(http.SameSiteStrictMode)
c.SetCookie(
	"refresh_token",          // nama
	refreshToken,             // nilai
	7*24*60*60,               // max age (detik)
	"/api/v1/auth",           // path: hanya terkirim ke endpoint auth
	"",                       // domain
	cfg.CookieSecure,         // Secure (true di produksi / HTTPS)
	true,                     // HttpOnly
)
```

### 7.5 Contoh Kode Frontend (Interceptor Axios)

`src/api/axios.ts`
```ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // kirim cookie refresh token
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const isAuthCall = original?.url?.includes('/auth/');

    if (error.response?.status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        // Satu refresh untuk banyak request yang gagal bersamaan
        refreshPromise ??= api
          .post<{ data: { access_token: string } }>('/auth/refresh')
          .then((r) => r.data.data.access_token)
          .finally(() => (refreshPromise = null));

        const newToken = await refreshPromise;
        useAuthStore.getState().setAccessToken(newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
```

Saat aplikasi pertama dibuka (refresh halaman), frontend memanggil `POST /auth/refresh` untuk mendapatkan access token baru dari cookie, lalu `GET /me`.

---

## 8. API Endpoint

**Base URL:** `/api/v1`
🔒 = wajib header `Authorization: Bearer <access_token>`

### 8.1 Format Response Standar

**Sukses**
```json
{
  "success": true,
  "data": { },
  "meta": { "page": 1, "per_page": 20, "total": 57, "total_pages": 3 }
}
```

**Error**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Data yang dikirim tidak valid",
    "details": { "title": "Judul wajib diisi" }
  }
}
```

| HTTP | Kode error | Arti |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Input tidak valid |
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` | Belum login / token habis |
| 403 | `FORBIDDEN` | Tidak punya izin (misal member mengubah pengaturan) |
| 404 | `NOT_FOUND` | Data tidak ada / bukan anggota proyek |
| 409 | `CONFLICT` | Email / key proyek sudah dipakai |
| 429 | `TOO_MANY_REQUESTS` | Terlalu banyak percobaan |
| 500 | `INTERNAL_ERROR` | Kesalahan server |

### 8.2 Auth
| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/auth/register` | Daftar akun |
| POST | `/auth/login` | Login → access token + cookie refresh |
| POST | `/auth/refresh` | Perbarui access token (rotasi refresh token) |
| POST | `/auth/logout` | Cabut refresh token perangkat ini |
| POST | `/auth/logout-all` 🔒 | Cabut semua sesi |

### 8.3 User & Profil
| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/me` 🔒 | Profil saya |
| PATCH | `/me` 🔒 | Ubah nama / warna avatar |
| PATCH | `/me/password` 🔒 | Ganti password |
| GET | `/me/tasks` 🔒 | Tugas saya lintas proyek (`?group=due`) |
| GET | `/dashboard` 🔒 | Data ringkasan dashboard |
| GET | `/users/search?email=` 🔒 | Cari user untuk diundang |

### 8.4 Projects
| Method | Endpoint | Fungsi | Akses |
|---|---|---|---|
| GET | `/projects` 🔒 | Daftar proyek saya (`?q=&archived=false`) | Semua |
| POST | `/projects` 🔒 | Buat proyek | Semua |
| GET | `/projects/:projectId` 🔒 | Detail + statistik | Anggota |
| PATCH | `/projects/:projectId` 🔒 | Edit proyek | Owner |
| POST | `/projects/:projectId/archive` 🔒 | Arsipkan / pulihkan | Owner |
| DELETE | `/projects/:projectId` 🔒 | Hapus permanen | Owner |
| POST | `/projects/:projectId/favorite` 🔒 | Toggle favorit | Anggota |
| GET | `/projects/:projectId/activities` 🔒 | Riwayat aktivitas | Anggota |

### 8.5 Members
| Method | Endpoint | Fungsi | Akses |
|---|---|---|---|
| GET | `/projects/:projectId/members` 🔒 | Daftar anggota | Anggota |
| POST | `/projects/:projectId/members` 🔒 | Tambah anggota `{ email, role }` | Owner |
| PATCH | `/projects/:projectId/members/:userId` 🔒 | Ubah role | Owner |
| DELETE | `/projects/:projectId/members/:userId` 🔒 | Keluarkan / keluar sendiri | Owner / diri sendiri |

### 8.6 Tasks
| Method | Endpoint | Fungsi | Akses |
|---|---|---|---|
| GET | `/projects/:projectId/tasks` 🔒 | Daftar tugas + filter | Anggota |
| POST | `/projects/:projectId/tasks` 🔒 | Buat tugas | Anggota |
| GET | `/tasks/:taskId` 🔒 | Detail tugas | Anggota |
| PATCH | `/tasks/:taskId` 🔒 | Edit sebagian field | Anggota |
| PATCH | `/tasks/:taskId/move` 🔒 | Pindah kolom / urutan `{ status, position }` | Anggota |
| DELETE | `/tasks/:taskId` 🔒 | Hapus tugas | Pembuat / Owner |
| GET | `/tasks/:taskId/activities` 🔒 | Riwayat tugas | Anggota |

**Query filter `GET /projects/:projectId/tasks`:**
| Parameter | Contoh | Keterangan |
|---|---|---|
| `q` | `login` | Cari judul / kode |
| `status` | `todo,in_progress` | Multi nilai, pisah koma |
| `priority` | `high,urgent` | |
| `assignee` | `uuid` atau `none` atau `me` | |
| `due` | `overdue` · `today` · `week` · `none` | |
| `sort` | `due_date` · `-created_at` · `priority` | `-` = descending |
| `page`, `per_page` | `1`, `20` | Untuk tampilan List |
| `view` | `board` | Kembalikan semua tugas dikelompokkan per status |

### 8.7 Comments
| Method | Endpoint | Fungsi | Akses |
|---|---|---|---|
| GET | `/tasks/:taskId/comments` 🔒 | Daftar komentar | Anggota |
| POST | `/tasks/:taskId/comments` 🔒 | Tulis komentar | Anggota |
| PATCH | `/comments/:commentId` 🔒 | Edit | Penulis |
| DELETE | `/comments/:commentId` 🔒 | Hapus | Penulis / Owner |

### 8.8 Contoh Request & Response

**POST `/auth/login`**
```json
// Request
{ "email": "budi@mail.com", "password": "Rahasia123" }

// Response 200  (+ Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict)
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 900,
    "user": { "id": "4f1c...", "name": "Budi", "email": "budi@mail.com", "avatar_color": "#6366F1" }
  }
}
```

**POST `/projects/:projectId/tasks`**
```json
// Request
{
  "title": "Desain halaman login",
  "description": "Gunakan layout split-screen, ada toggle dark mode.",
  "priority": "high",
  "assignee_id": "9a2e...",
  "due_date": "2026-12-01",
  "labels": ["design", "frontend"]
}

// Response 201
{
  "success": true,
  "data": {
    "id": "c81d...",
    "code": "MPO-12",
    "title": "Desain halaman login",
    "status": "todo",
    "priority": "high",
    "labels": ["design", "frontend"],
    "assignee": { "id": "9a2e...", "name": "Sari", "avatar_color": "#EC4899" },
    "created_by": { "id": "4f1c...", "name": "Budi" },
    "due_date": "2026-12-01",
    "comment_count": 0,
    "created_at": "2026-11-19T15:00:00Z"
  }
}
```

**PATCH `/tasks/:taskId/move`**
```json
{ "status": "in_progress", "position": 1.5 }
```

---

## 9. Panduan UI/UX

### 9.1 Prinsip Desain
1. **Bersih & lega** — banyak ruang kosong, sedikit garis, hierarki jelas.
2. **Cepat** — skeleton loading, optimistic update, tanpa reload halaman.
3. **Sedikit klik** — inline edit, quick add, keyboard shortcut.
4. **Konsisten** — warna status & prioritas sama di semua halaman.
5. **Aksesibel** — kontras cukup, bisa dipakai dengan keyboard, label untuk screen reader.
6. **Mobile-friendly** — semua fitur bisa dipakai di HP.

### 9.2 Gaya Visual (Modern 2025–2026)
- **Tampilan flat & lembut**: kartu dengan border tipis + shadow halus, bukan shadow tebal.
- **Sudut membulat**: radius 10–12 px untuk kartu, 8 px untuk tombol & input.
- **Warna netral** (abu-abu kebiruan) + **satu warna aksen** (indigo).
- **Tipografi** jelas dengan font **Inter** atau **Plus Jakarta Sans**.
- **Mikro-animasi** 150–200 ms: hover kartu terangkat sedikit, transisi panel, drag terasa "hidup".
- **Glassmorphism ringan** hanya di topbar (efek `backdrop-filter: blur`) — opsional.
- **Dark mode** setara kualitasnya dengan light mode, bukan sekadar dibalik.

### 9.3 Design Tokens

**Warna utama**
| Token | Light | Dark | Kegunaan |
|---|---|---|---|
| `primary` | `#6366F1` (Indigo) | `#818CF8` | Tombol utama, link, fokus |
| `body-bg` | `#F8FAFC` | `#0B1120` | Latar halaman |
| `surface` | `#FFFFFF` | `#111827` | Kartu, modal, sidebar |
| `surface-2` | `#F1F5F9` | `#1F2937` | Kolom Kanban, hover |
| `border` | `#E2E8F0` | `#273244` | Garis pemisah |
| `text` | `#0F172A` | `#E5E7EB` | Teks utama |
| `text-muted` | `#64748B` | `#94A3B8` | Teks sekunder |

**Warna status**
| Status | Warna | Ikon Bootstrap |
|---|---|---|
| To Do | Slate `#64748B` | `bi-circle` |
| In Progress | Blue `#3B82F6` | `bi-circle-half` |
| In Review | Amber `#F59E0B` | `bi-eye` |
| Done | Green `#10B981` | `bi-check-circle-fill` |

**Warna prioritas**
| Prioritas | Warna | Ikon |
|---|---|---|
| Low | Gray `#94A3B8` | `bi-arrow-down` |
| Medium | Blue `#3B82F6` | `bi-dash` |
| High | Orange `#F97316` | `bi-arrow-up` |
| Urgent | Red `#EF4444` | `bi-exclamation-triangle-fill` |

**Tipografi**
| Elemen | Ukuran | Berat |
|---|---|---|
| Judul halaman (h1) | 24 px | 700 |
| Judul bagian (h2) | 18 px | 600 |
| Judul kartu | 14–15 px | 500 |
| Teks isi | 14 px | 400 |
| Teks kecil / meta | 12 px | 400–500 |

**Jarak (spacing):** kelipatan 4 px → 4, 8, 12, 16, 24, 32, 48.

### 9.4 Override Bootstrap (SCSS)

`src/styles/_variables.scss`
```scss
// Font
$font-family-sans-serif: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
$font-size-base: 0.875rem; // 14px

// Warna
$primary:   #6366F1;
$secondary: #64748B;
$success:   #10B981;
$warning:   #F59E0B;
$danger:    #EF4444;
$info:      #3B82F6;

$body-bg:    #F8FAFC;
$body-color: #0F172A;

// Bentuk
$border-radius:    0.5rem;   // 8px
$border-radius-lg: 0.75rem;  // 12px
$border-color:     #E2E8F0;

$card-border-color: #E2E8F0;
$card-box-shadow:   0 1px 2px rgba(15, 23, 42, 0.06);

$btn-font-weight: 500;
$input-focus-box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);

$enable-shadows: true;
$enable-dark-mode: true;
```

`src/styles/main.scss`
```scss
@import 'variables';
@import 'bootstrap/scss/bootstrap';
@import 'dark';
@import 'kanban';

.card { transition: transform .15s ease, box-shadow .15s ease; }
.task-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(15, 23, 42, .08); }
.task-card.is-dragging { transform: rotate(2deg) scale(1.02); box-shadow: 0 12px 28px rgba(15, 23, 42, .18); }
```

**Dark mode:** gunakan fitur bawaan Bootstrap 5.3 → atribut `data-bs-theme="dark"` pada `<html>`, diatur oleh `themeStore`.

### 9.5 Layout Aplikasi

```
┌───────────────┬─────────────────────────────────────────────────────────┐
│  🟣 MPO        │  🔍 Cari... (Ctrl+K)            🌙   🔔   (B) Budi ▾    │ ← Topbar
│               ├─────────────────────────────────────────────────────────┤
│  🏠 Dashboard  │  Proyek / Website Kantor                                │ ← Breadcrumb
│  ✅ Tugas Saya │  🌐 Website Kantor          [Board] [List]   + Tugas    │ ← Header proyek
│  📁 Proyek     │  🔍 Filter  Status ▾  Prioritas ▾  Assignee ▾  Reset   │ ← Filter bar
│               │                                                         │
│  ⭐ FAVORIT     │  To Do (4)    In Progress (2)  In Review (1)  Done (6)  │
│  🌐 Website    │  ┌────────┐   ┌────────┐       ┌────────┐     ┌──────┐  │
│  📱 Aplikasi   │  │MPO-12  │   │MPO-9   │       │MPO-7   │     │ ...  │  │
│               │  │Desain  │   │API auth│       │Landing │     │      │  │
│  ＋ Proyek baru │  │🔴 High │   │🟠 High │       │🔵 Med  │     │      │  │
│               │  │📅 1 Des │   │📅 28 Nov│       │       │     │      │  │
│  ◀ Ciutkan     │  │💬 3 (S)│   │   (A) │       │   (B) │     │      │  │
│               │  └────────┘   └────────┘       └────────┘     └──────┘  │
│               │  + Tambah tugas                                         │
└───────────────┴─────────────────────────────────────────────────────────┘
   Sidebar 260px (collapse 72px)              Konten utama
```

- **Desktop (≥ 992 px):** sidebar tetap di kiri.
- **Tablet / Mobile (< 992 px):** sidebar menjadi **Offcanvas** (tombol hamburger), Kanban di-scroll horizontal dengan *snap* per kolom.
- **Detail tugas:** **Offcanvas dari kanan** (lebar 520–640 px) di desktop, **full screen** di mobile — board tetap terlihat di belakang.

### 9.6 Pola UX Wajib

| Situasi | Perilaku |
|---|---|
| Memuat data | **Skeleton** (bukan spinner kosong) sesuai bentuk konten |
| Data kosong | **Empty state**: ilustrasi/ikon + kalimat ramah + tombol aksi ("Belum ada tugas. Buat tugas pertama →") |
| Berhasil simpan | Toast kecil di pojok kanan bawah, hilang sendiri 3 detik |
| Hapus | Dialog konfirmasi; untuk tugas, toast dengan tombol **"Batalkan"** (*undo* 5 detik) |
| Error API | Toast merah dengan pesan dari server; form menandai field yang salah |
| Form | Validasi real-time (Zod), tombol submit disabled + spinner saat proses |
| Drag & drop | Optimistic update, placeholder di posisi tujuan |
| Tanggal | Relatif & ramah: "Hari ini", "Besok", "3 hari lagi", "Terlambat 2 hari" |
| Avatar | Inisial nama di lingkaran berwarna (tanpa upload foto di MVP) |

### 9.7 Keyboard Shortcut
| Tombol | Aksi |
|---|---|
| `Ctrl/⌘ + K` | Pencarian cepat (tugas & proyek) |
| `C` | Buat tugas baru |
| `B` / `L` | Pindah ke tampilan Board / List |
| `/` | Fokus ke kolom filter |
| `Esc` | Tutup modal / panel |
| `Ctrl/⌘ + Enter` | Kirim komentar / simpan form |

### 9.8 Aksesibilitas
- Kontras teks minimal **4.5 : 1** (WCAG AA) di light & dark mode.
- Semua tombol ikon punya `aria-label`.
- Status tidak hanya dibedakan warna — selalu ada **ikon + teks**.
- Fokus keyboard terlihat jelas (ring indigo).
- Drag & drop juga bisa dengan keyboard (dukungan bawaan dnd-kit) atau dropdown status.

---

## 10. Halaman & Komponen Frontend

### 10.1 Daftar Route

| Path | Halaman | Akses |
|---|---|---|
| `/login` | LoginPage | Tamu |
| `/register` | RegisterPage | Tamu |
| `/` | DashboardPage | Login |
| `/my-tasks` | MyTasksPage | Login |
| `/projects` | ProjectListPage | Login |
| `/projects/:projectId/board` | ProjectBoardPage | Anggota |
| `/projects/:projectId/list` | ProjectListViewPage | Anggota |
| `/projects/:projectId/settings` | ProjectSettingsPage | Owner (member: lihat saja) |
| `/projects/:projectId/board?task=:taskId` | Board + panel detail terbuka | Anggota |
| `/profile` | ProfilePage | Login |
| `*` | NotFoundPage | — |

> Detail tugas dibuka lewat query `?task=` → link tugas bisa dibagikan dan tombol *Back* browser menutup panel.

### 10.2 Detail per Halaman

**Login / Register**
- Layout **split screen**: kiri ilustrasi + tagline produk, kanan form (di mobile hanya form).
- Input dengan ikon, tombol tampil/sembunyi password, indikator kekuatan password (register).
- Tombol "Masuk" lebar penuh, link ke Register / Login.

**Dashboard**
- 4 kartu statistik berwarna lembut dengan ikon.
- Dua kolom: "Jatuh tempo segera" & "Aktivitas terbaru".
- Grid "Proyek saya" dengan progress bar.

**Daftar Proyek**
- Toggle tampilan **Grid / List**, pencarian, tab **Aktif / Diarsipkan**.
- Kartu: ikon/emoji berwarna, nama, deskripsi singkat (2 baris), progress bar, `AvatarGroup` (maks. 4 + "+3").

**Board (Kanban)**
- `ProjectHeader` + `TaskFilterBar` + `KanbanBoard`.
- Header kolom sticky saat scroll.
- `QuickAddTask` di bawah tiap kolom.

**List**
- `TaskTable` dengan header sticky, baris bisa diklik, badge status & prioritas.

**Panel Detail Tugas**
- Atas: kode tugas, tombol salin link, menu (hapus), tombol tutup.
- Judul dapat diedit langsung (klik → input).
- Grid properti: Status, Prioritas, Assignee, Tanggal mulai, Deadline, Label.
- Deskripsi (klik untuk edit).
- Tab: **Komentar** | **Aktivitas**.

**Pengaturan Proyek**
- Tab **Umum** (nama, key, deskripsi, warna, ikon), **Anggota**, **Zona Bahaya** (arsip & hapus, border merah).

### 10.3 Tipe TypeScript Inti

`src/types/task.ts`
```ts
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface UserSummary {
  id: string;
  name: string;
  avatar_color: string;
}

export interface Task {
  id: string;
  code: string;            // "MPO-12"
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  labels: string[];
  position: number;
  assignee: UserSummary | null;
  created_by: UserSummary;
  start_date: string | null; // "YYYY-MM-DD"
  due_date: string | null;
  completed_at: string | null;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

export interface TaskFilters {
  q?: string;
  status?: TaskStatus[];
  priority?: TaskPriority[];
  assignee?: string[];      // uuid | 'none' | 'me'
  due?: 'overdue' | 'today' | 'week' | 'none';
  sort?: string;
}
```

`src/utils/constants.ts`
```ts
import type { TaskPriority, TaskStatus } from '@/types/task';

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: string }> = {
  todo:        { label: 'To Do',       color: '#64748B', icon: 'bi-circle' },
  in_progress: { label: 'In Progress', color: '#3B82F6', icon: 'bi-circle-half' },
  in_review:   { label: 'In Review',   color: '#F59E0B', icon: 'bi-eye' },
  done:        { label: 'Done',        color: '#10B981', icon: 'bi-check-circle-fill' },
};

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; icon: string }> = {
  low:    { label: 'Low',    color: '#94A3B8', icon: 'bi-arrow-down' },
  medium: { label: 'Medium', color: '#3B82F6', icon: 'bi-dash' },
  high:   { label: 'High',   color: '#F97316', icon: 'bi-arrow-up' },
  urgent: { label: 'Urgent', color: '#EF4444', icon: 'bi-exclamation-triangle-fill' },
};
```

---

## 11. Keamanan

| Area | Penerapan |
|---|---|
| Password | bcrypt cost 12, tidak pernah dikirim di response |
| JWT | HS256 dengan secret ≥ 32 karakter acak; validasi `alg`, `exp`, `iss` |
| Refresh token | Cookie HttpOnly + Secure + SameSite=Strict, disimpan hash SHA-256, rotasi setiap dipakai |
| Hak akses | Setiap endpoint proyek/tugas mengecek keanggotaan di **service layer** |
| SQL injection | Selalu parameter query (GORM), tidak pernah menyambung string SQL |
| XSS | React escape otomatis; deskripsi Markdown di-render dengan sanitasi |
| CORS | Hanya izinkan origin frontend (`FRONTEND_URL`), `AllowCredentials: true` |
| Rate limit | Login & register: 5 req/menit/IP; API umum: 100 req/menit/user |
| Header keamanan | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` |
| Ukuran request | Batasi body maks. 1 MB |
| Error | Jangan tampilkan detail error internal ke client; log di server |
| Rahasia | `.env` tidak di-commit; sediakan `.env.example` |
| HTTPS | Wajib di produksi (cookie `Secure`) |

---

## 12. Konfigurasi & Environment

**`backend/.env.example`**
```env
APP_ENV=development
APP_PORT=6990
FRONTEND_URL=http://localhost:6969

DB_HOST=localhost
DB_PORT=5432
DB_USER=mpo_user
DB_PASSWORD=mpo_password
DB_NAME=management_project_one
DB_SSLMODE=disable

JWT_SECRET=ganti_dengan_string_acak_minimal_32_karakter
JWT_ISSUER=management-project-one
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=168h

COOKIE_SECURE=false
BCRYPT_COST=12
```

**`frontend/.env.example`**
```env
VITE_API_URL=http://localhost:6990/api/v1
VITE_APP_NAME=Management-Project-One
```

---

## 13. Menjalankan Proyek (Docker)

**`docker-compose.yml`**
```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: mpo_user
      POSTGRES_PASSWORD: mpo_password
      POSTGRES_DB: management_project_one
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mpo_user -d management_project_one"]
      interval: 5s
      retries: 5

  backend:
    build: ./backend
    env_file: ./backend/.env
    environment:
      DB_HOST: db
    ports:
      - "6990:6990"
    depends_on:
      db:
        condition: service_healthy

  frontend:
    build: ./frontend
    ports:
      - "6969:80"
    depends_on:
      - backend

volumes:
  pgdata:
```

**`backend/Makefile`**
```makefile
run:
	air

build:
	go build -o bin/api ./cmd/api

migrate-up:
	migrate -path migrations -database "$$DATABASE_URL" up

migrate-down:
	migrate -path migrations -database "$$DATABASE_URL" down 1

migrate-new:
	migrate create -ext sql -dir migrations -seq $(name)

swag:
	swag init -g cmd/api/main.go -o docs

test:
	go test ./... -cover

lint:
	go vet ./...
```

**Langkah menjalankan (development):**
```bash
# 1. Jalankan database
docker compose up -d db

# 2. Backend
cd backend
cp .env.example .env
go mod tidy
make migrate-up DATABASE_URL="postgres://mpo_user:mpo_password@localhost:5432/management_project_one?sslmode=disable"
make run                     # http://localhost:6990

# 3. Frontend
cd ../frontend
cp .env.example .env
npm install
npm run dev                  # http://localhost:6969 (atur server.port: 6969 di vite.config.ts)
```

**Inisialisasi proyek dari nol:**
```bash
# Backend
mkdir -p backend && cd backend
go mod init management-project-one
go get github.com/gin-gonic/gin gorm.io/gorm gorm.io/driver/postgres \
       github.com/golang-jwt/jwt/v5 golang.org/x/crypto github.com/joho/godotenv \
       github.com/gin-contrib/cors github.com/google/uuid

# Frontend
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install bootstrap react-bootstrap bootstrap-icons react-router-dom \
            @tanstack/react-query axios zustand react-hook-form zod @hookform/resolvers \
            @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities dayjs react-hot-toast
npm install -D sass
```

---

## 14. Konvensi Kode & Git

### Backend (Go)
- Format otomatis dengan `gofmt` / `goimports`.
- Nama file `snake_case.go`, nama exported `PascalCase`, private `camelCase`.
- Error selalu ditangani; bungkus dengan konteks: `fmt.Errorf("create task: %w", err)`.
- Handler tipis — logika di service.
- Gunakan `context.Context` dari request sampai repository.

### Frontend (React + TS)
- Komponen `PascalCase.tsx`, hook `useSesuatu.ts`.
- `strict: true` di `tsconfig.json`, hindari `any`.
- Satu komponen satu tanggung jawab; komponen > 200 baris dipecah.
- Import alias `@/` → `src/`.
- Semua pemanggilan API lewat hook TanStack Query (bukan `useEffect` + `fetch`).

### Git
- Branch: `main` (stabil), `develop`, `feature/nama-fitur`, `fix/nama-bug`.
- Pesan commit (Conventional Commits):
  - `feat(task): tambah drag and drop kanban`
  - `fix(auth): refresh token tidak tersimpan`
  - `refactor(api): pisahkan service project`
  - `docs: update README`

---

## 15. Testing

| Jenis | Alat | Target |
|---|---|---|
| Unit test backend | `testing` + `testify` | Service (aturan bisnis & hak akses) |
| Integration test API | `httptest` + database test (Docker) | Endpoint auth, project, task |
| Unit test frontend | **Vitest** + **React Testing Library** | Komponen & hook penting |
| End-to-end | **Playwright** (setelah MVP) | Alur login → buat proyek → buat tugas → pindah status |

**Skenario wajib diuji:**
- [ ] Register email duplikat → 409.
- [ ] Login password salah → 401 dengan pesan umum.
- [ ] Refresh token yang sudah dipakai ulang → semua sesi dicabut.
- [ ] Member mencoba edit pengaturan proyek → 403.
- [ ] Non-anggota mengakses tugas → 404.
- [ ] Assign tugas ke non-anggota → 400.
- [ ] Owner terakhir mencoba keluar → 400.

---

## 16. Roadmap Pengerjaan

> Estimasi untuk **pemula Go**, 1–2 jam per hari.

| Fase | Durasi | Fokus | Hasil |
|---|---|---|---|
| **0. Belajar dasar** | 3–4 minggu | Go dasar, SQL dasar, React + TS dasar | Bisa membuat CLI Go & komponen React sederhana |
| **1. Setup** | 1 minggu | Struktur folder, Docker Postgres, Gin "hello", Vite + Bootstrap, tema & layout | Kerangka backend & frontend berjalan |
| **2. Auth** | 2 minggu | Register, login, JWT access + refresh, middleware, halaman login/register | Bisa login & tetap login |
| **3. Proyek & anggota** | 2 minggu | CRUD proyek, anggota, hak akses, halaman daftar & pengaturan proyek | Bisa membuat proyek & mengundang tim |
| **4. Tugas & Kanban** | 3 minggu | CRUD tugas, nomor `MPO-x`, Kanban drag & drop, panel detail | Inti aplikasi jalan |
| **5. List, filter, Tugas Saya** | 1–2 minggu | Tabel, filter di URL, pencarian, halaman Tugas Saya | Tugas mudah dicari |
| **6. Komentar & aktivitas** | 1 minggu | Komentar, riwayat aktivitas | Tim bisa berdiskusi |
| **7. Dashboard & polish** | 1–2 minggu | Dashboard, dark mode, empty state, skeleton, shortcut, responsif | UI/UX matang |
| **8. Testing & deploy** | 1–2 minggu | Test, Swagger, Docker produksi, deploy ke VPS + HTTPS | **MVP live** 🚀 |

**Total ± 4–5 bulan.**

### Checklist Rilis MVP
- [ ] Semua fitur di Bagian 5 lolos kriteria selesai
- [ ] Tampil baik di Chrome, Firefox, Safari, dan HP
- [ ] Dark mode tanpa teks yang sulit dibaca
- [ ] Tidak ada error di console browser
- [ ] `.env` produksi aman, `COOKIE_SECURE=true`, HTTPS aktif
- [ ] Backup database otomatis harian

---

## 17. Fitur Setelah MVP

| Versi | Fitur |
|---|---|
| **v1.1** | Notifikasi dalam aplikasi, subtask & checklist, lampiran file, lupa password via email |
| **v1.2** | Kanban real-time (WebSocket), mention `@nama` di komentar, label berwarna terkelola |
| **v1.3** | Kolom/status kustom per proyek, tampilan Kalender, upload foto profil |
| **v2.0** | Sprint & backlog, Gantt/Timeline, laporan & grafik (burndown, beban kerja) |
| **v2.1** | Otomasi ("jika… maka…"), time tracking, template proyek |
| **v3.0** | Workspace/organisasi multi-tim, integrasi (GitHub, Slack, WhatsApp), aplikasi mobile, fitur AI |

---

*Management-Project-One — Spesifikasi MVP v1.0*
