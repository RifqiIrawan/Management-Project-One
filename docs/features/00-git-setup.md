# 00 – Koneksi Git & GitHub

**Status:** ✅  
**Tanggal selesai:** 2026-11-19

## Tujuan
Project terhubung ke repo GitHub sebelum ada kode, agar semua pekerjaan ter-versi.

## Yang dibuat
- `git init` dengan branch `main`, remote `origin` → https://github.com/RifqiIrawan/Management-Project-One.git
- Riwayat remote (commit "Initial commit" berisi `README.md`) disatukan tanpa menimpa.
- `.gitignore`: `.env` dan semua variasinya **tidak ikut commit** (kecuali `.env.example`), plus artefak Go, Node, Docker, OS/editor.
- Identitas commit diset **lokal di repo ini saja** (bukan global): email noreply GitHub.

## Cara mencoba
```bash
git remote -v
git check-ignore -v backend/.env   # harus menunjukkan aturan .gitignore
```

## Catatan & keputusan
- Konvensi branch/commit mengikuti Bagian 14 spesifikasi (`main`, `develop`, `feature/*`, Conventional Commits).
- Repo bersifat **public**: jangan pernah commit secret. Hanya `.env.example` yang boleh.
