# Bun Hono Drizzle Blueprint

Blueprint backend siap produksi berbasis **Bun**, **Hono**, **Drizzle ORM**, dan **PostgreSQL**, dengan fail-open Redis caching, structured logging (Pino), async Zod validation, declarative ACID transactions, dan multi-tier quality gates.

Arsitektur & alasannya (indeks aturan beserta penegaknya): [ARCHITECTURE.md](ARCHITECTURE.md) · cara bekerja & daftar standar: [CONTRIBUTING.md](CONTRIBUTING.md) · standar kode (satu sumber per topik, bahasa Inggris): [docs/standards/](docs/standards/).

---

## 1. Isi Boilerplate

- **Kontrak HTTP seragam** — controller me-return `ApiResponse`, envelope sukses/error, wire `snake_case` dua arah, pesan `id`/`en`.
- **Lapisan ketat** — `Routes → Controller → Service → Repository`, diverifikasi dependency-cruiser dan ESLint.
- **Data layer teraudit** — transaksi deklaratif, lima base repository (termasuk parent-child), setiap UPDATE/DELETE tercatat di `record_changes`.
- **Auth default-deny** — JWT + refresh token di cookie `HttpOnly` (rotasi, deteksi reuse), role per route.
- **Kanal inbound** — partner dengan request bertanda tangan HMAC, webhook vendor fail-closed dan idempoten.
- **Platform** — konfigurasi Zod fail-fast, Redis fail-open, rate limit, health `UP`/`DEGRADED`/`DOWN`, OpenAPI + Scalar, waktu UTC (Temporal).
- **Quality gates** — tsc, ESLint, ls-lint, Prettier, depcruise, knip, coverage, test penjaga, integration test, Husky, CI.

---

## 2. Quick Start

### Prasyarat
- [Bun](https://bun.sh/) >= 1.3
- PostgreSQL 16+ dan Redis (≥ 2.6, disarankan 7) — terpasang langsung di mesin **atau** lewat Docker Compose (opsional)

### Setup & Jalankan
```bash
# 1. Clone repository & inisialisasi project
git clone <repo_url> my-backend
cd my-backend
bun install
bun run setup my-backend --description "Deskripsi singkat" # --dry-run untuk preview
#    modul contoh orders (header + detail), projects (parent + dependent tasks /
#    budgets) dan contoh webhook vendor (demo-pay +
#    payment-notifications) dihapus & migrasi dibuat ulang dari awal;
#    tambahkan --keep-examples untuk mempertahankannya sebagai referensi
# atau via AI agent (Claude Code): /init-project my-backend
#    riwayat git baru (opsional): hapus .git → git init -b main → bun run prepare (wajib:
#    memasang hook Husky; setup memberi peringatan bila hook belum aktif)

# 2. Pastikan PostgreSQL & Redis berjalan, lalu sesuaikan DATABASE_URL / REDIS_* di file env
#    (opsional, bila tidak memasang layanan secara langsung: docker compose up -d)

# 3. Jalankan migrasi database, buat admin pertama & start dev server
bun run db:migrate
bun run seed:admin --email admin@example.com   # password ditanyakan (tidak terlihat)
bun run dev
```

Server berjalan secara default di `http://localhost:3000` (URL juga dicatat di log startup):

- Dokumentasi API (Scalar): `http://localhost:3000/api/docs` · JSON: `/api/docs/openapi.json`
- Portal dokumentasi web: `cd docs-site && bun install` sekali, lalu `bun run docs:dev` → `http://localhost:4321`
- Health: `http://localhost:3000/api/health` (`UP` / `DEGRADED` / `DOWN`)
- Login: `POST http://localhost:3000/api/v1/auth/login` dengan akun admin tadi; endpoint lain di `/api/v1/*` wajib `Authorization: Bearer <access_token>`. Panduan integrasi frontend: [docs/auth-guide.md](docs/auth-guide.md)
- Partner (server-to-server): kredensial dibuat admin di `/api/v1/partner-credentials`, request ke `/api/v1/partner/*` ditandatangani HMAC — panduan: [docs/partner-integration-guide.md](docs/partner-integration-guide.md)

#### Alternatif: Full Containerized Development (Zero Host Install)
```bash
docker compose -f docker-compose.dev.yml up --build
```
Aplikasi berjalan di dalam container dengan live hot-reload (`bun --watch`).

---

## 3. Langkah Berikutnya

| Ingin | Baca |
|---|---|
| Membuat modul / endpoint / webhook / adapter vendor | `bun run scaffold module <nama-jamak>` (`--dry-run` untuk melihat rencana) — [docs/standards/new-module.md](docs/standards/new-module.md); lewat AI agent: "scaffold module <nama>" |
| Mengubah kontrak API (route, DTO) | `bun run openapi:check` menampilkan perubahan (BREAKING / safe / docs) → review → `bun run openapi:update` — [docs/standards/openapi.md](docs/standards/openapi.md) §6 |
| Menjalankan quality gates (`bun run validate:full`) dan perintah lain | [docs/standards/quality-gates.md](docs/standards/quality-gates.md) |
| Melihat struktur direktori | [docs/standards/structure.md](docs/standards/structure.md) |
| Memahami keputusan arsitektur | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Aturan untuk AI agent | [.agents/AGENTS.md](.agents/AGENTS.md) |
| Rencana adopsi & log keputusan | [docs/plans/](docs/plans/) |
