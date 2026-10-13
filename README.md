# Bun Hono Starter (Enterprise Bun + Hono + Drizzle + PostgreSQL)

Production-ready backend starter berbasis **Bun**, **Hono**, **Drizzle ORM**, dan **PostgreSQL**, dengan fail-open Redis caching, structured logging (Pino), async Zod validation, declarative ACID transactions, dan multi-tier quality gates.

Arsitektur (apa & mengapa, indeks aturan beserta penegaknya): [ARCHITECTURE.md](ARCHITECTURE.md) · standar kode & alur kerja: [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 1. Fitur Utama

- **Pure controllers & kontrak seragam** — controller me-return `ApiResponse`; envelope sukses/error, wire `snake_case` dua arah (key lain ditolak 400), pesan dwibahasa `id`/`en` dari `Accept-Language`.
- **Lapisan ketat** — `Routes → Controller → Service → Repository`, diverifikasi `dependency-cruiser` dan aturan AST ESLint.
- **Transaksi deklaratif** — `@Transactional()` di service, repository memakai `this.txHost.tx` (AsyncLocalStorage, tanpa mengoper `tx`).
- **Data layer teraudit** — tabel `appTable` + helper kolom (UUID v7, Temporal, soft delete), empat base repository; setiap UPDATE/DELETE tercatat di `record_changes` dalam transaksi yang sama.
- **Auth default-deny** — JWT HS256 (15 menit) + refresh token opaque di cookie `HttpOnly` dengan rotasi & deteksi reuse; semua `/api/v1/*` wajib Bearer kecuali `PUBLIC_ROUTES`; `requireRole()` per route.
- **Kanal inbound** — partner server-to-server dengan request bertanda tangan HMAC (`/api/v1/partner/*`, kredensial dikelola admin) dan webhook vendor fail-closed dengan verifier per vendor (`/api/webhooks/<vendor>`, event idempoten).
- **Integrasi outbound** — `HttpClientService` (keep-alive, timeout wajib, `X-Request-ID`, error vendor di-mask) hanya di `src/integrations/<vendor>/`.
- **Platform** — konfigurasi Zod fail-fast, Redis fail-open dengan prefix otomatis, rate limit per IP lintas instance, CORS allowlist, batas body, health `UP`/`DEGRADED`/`DOWN`, OpenAPI 3.1 + Scalar dari schema yang sama dengan validasi, waktu UTC (Temporal).
- **Quality gates** — tsc, ESLint, ls-lint, Prettier, dependency-cruiser, knip, coverage gate, test penjaga kontrak, integration test ke layanan asli, hook Husky, dan CI GitHub Actions.

---

## 2. Struktur Direktori

Ringkasan per lapisan — pohon lengkap (versi kanonik) ada di [CONTRIBUTING.md §2.1](CONTRIBUTING.md#21-anatomi-direktori-standar), batas antar-lapisan di §2.2.

```
src/
├── config/        # Satu grup Zod per file (app, auth, database, redis, http, satu per vendor); env-source.ts = satu-satunya pembaca process.env
├── core/          # Lintas domain: cache, context, dto, errors, http (klien outbound), i18n, logger, middlewares, openapi, response, security
├── database/      # Koneksi, TransactionHost, repository base teraudit, schema, seeds/, maintenance/
├── integrations/  # Adapter vendor (registry.ts + <vendor>/): outbound service, verifier webhook — tanpa route/controller
├── modules/       # Modul domain: auth, health, users (referensi tabel mandiri), partner-credentials, partner-gateway
│   └── orders/    # Modul contoh header + detail (/api/v1/orders[/:id/items]) — dihapus `bun run setup` kecuali --keep-examples
├── utils/         # Fungsi murni (datetime, case converter, …)
├── app.ts         # createApp(): pipeline middleware & router versi
└── index.ts       # Bun.serve + graceful shutdown
test/              # E2E (createApp().request), test penjaga kontrak, helpers, preload hermetik, integration/ (bun run test:int)
scripts/           # setup, check-coverage, verify-scaffold, test-integration, seed-admin, partner-sign, purge-refresh-tokens
docs/              # Panduan auth (FE) & partner, rencana adopsi, archive/ (blueprint asal)
```

---

## 3. Quick Start

### Prasyarat
- [Bun](https://bun.sh/) >= 1.3
- PostgreSQL 16+ dan Redis (≥ 2.6, disarankan 7) — terpasang langsung di mesin **atau** lewat Docker Compose (opsional)

### Setup & Jalankan (3 Langkah Cepat)
```bash
# 1. Clone repository & inisialisasi project
git clone <repo_url> my-backend
cd my-backend
bun install
bun run setup my-backend --description "Deskripsi singkat" # --dry-run untuk preview
#    modul contoh orders (header + detail) dan contoh webhook vendor (demo-pay +
#    payment-notifications) dihapus & migrasi dibuat ulang dari awal;
#    tambahkan --keep-examples untuk mempertahankannya sebagai referensi
# atau via AI agent (Claude Code): /init-project my-backend

# 2. Pastikan PostgreSQL & Redis berjalan, lalu sesuaikan DATABASE_URL / REDIS_* di file env
#    (opsional, bila tidak memasang layanan secara langsung: docker compose up -d)

# 3. Jalankan migrasi database, buat admin pertama & start dev server
bun run db:migrate
bun run seed:admin --email admin@example.com   # password ditanyakan (tidak terlihat)
bun run dev
```

Server berjalan secara default di `http://localhost:3000` (URL juga dicatat di log startup):

- Dokumentasi API (Scalar): `http://localhost:3000/api/docs` · JSON: `/api/docs/openapi.json`
- Health: `http://localhost:3000/api/health` (`UP` / `DEGRADED` / `DOWN`)
- Login: `POST http://localhost:3000/api/v1/auth/login` dengan akun admin tadi; endpoint lain di `/api/v1/*` wajib `Authorization: Bearer <access_token>`. Panduan integrasi frontend (token, refresh, cookie, CSRF, domain): [docs/auth-guide.md](docs/auth-guide.md)
- Partner (server-to-server): kredensial dibuat admin di `/api/v1/partner-credentials`, request ke `/api/v1/partner/*` ditandatangani HMAC — panduan: [docs/partner-integration-guide.md](docs/partner-integration-guide.md); uji manual: `bun run partner:sign --key <pk_…> --url http://localhost:3000/api/v1/partner/ping --send`
- Bersihkan refresh token kedaluwarsa: `bun run auth:purge-tokens` (jadwalkan harian)

#### Alternatif: Full Containerized Development (Zero Host Install)
Jika Anda tidak ingin menginstall Bun di host OS:
```bash
docker compose -f docker-compose.dev.yml up --build
```
Aplikasi akan berjalan di dalam Docker container dengan live hot-reload (`bun --watch`).

---

## 4. Pola Pengembangan Fitur Baru

Modul baru dibuat dari template skill `scaffold-module` — kodenya diverifikasi mesin (`bun run verify:scaffold` di CI men-generate setiap varian dan menjalankan semua gate), sehingga tidak bisa tertinggal dari kode. Pilih varian menurut jenis tabel / kanal:

| Jenis tabel | Template | Contoh nyata |
|---|---|---|
| Mandiri | `.agents/skills/scaffold-module/SKILL.md` | `src/modules/users` |
| Header + detail | `.agents/skills/scaffold-module/references/header-detail.md` | `src/modules/orders` (dihapus `bun run setup` kecuali `--keep-examples`) |
| Pencatatan (append-only) | `.agents/skills/scaffold-module/references/record.md` | `record_changes` |
| Endpoint partner (request bertanda tangan) | `.agents/skills/scaffold-module/references/partner.md` | `src/modules/partner-gateway` |
| Webhook vendor (kontrak milik vendor) | `.agents/skills/scaffold-module/references/webhook.md` | `src/modules/payment-notifications` + `src/integrations/demo-pay` (dihapus `bun run setup` kecuali `--keep-examples`) |
| Adapter vendor outbound (bukan modul) | `.agents/skills/scaffold-module/references/integration.md` | `src/integrations/jsonplaceholder` |

Urutannya selalu: schema (`appTable` + helper kolom) → `bun run db:generate` → DTO (request & response, snake_case di wire) → pesan (`id`/`en`) → repository (extend base) → transformer → service → controller (`ApiResponse`) → routes (`describeEndpoint` + `validate`) → daftarkan di `src/app.ts` (`v1.route(...)`) → test → `bun run validate:full`. Lewat AI agent: minta "scaffold module <nama>" (skill `scaffold-module`). Panduan rinci: [CONTRIBUTING.md §10](CONTRIBUTING.md#10-panduan-scaffolding-modul-fitur-baru).

---

## 5. Menjalankan Quality Gates

```bash
# Seluruh quality gates (juga dijalankan hook pre-push): typecheck, lint, ls-lint, prettier,
# dependency-cruiser, knip, lint:setup, lint:branch, test + coverage gate
bun run validate:full
bun run verify:scaffold   # template scaffold-module (modul + integrasi) lewat semua gate (CI)
bun run test:int          # integration test ke PostgreSQL + Redis asli (database sekali pakai; CI)

# Validasi parsial:
bun run typecheck   # Typecheck tanpa emit
bun run lint        # ESLint flat config
bun run lint:ls     # Kebab-case naming check
bun run lint:arch   # Architectural boundary isolation check
bun test            # Unit & e2e test (hermetik: tanpa DB/Redis asli)
```

Daftar lengkap perintah: [CONTRIBUTING.md §1](CONTRIBUTING.md#perintah-validasi-lokal).

---

## 6. Dokumentasi

| Dokumen | Isi |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Pilar, keputusan & alasannya, indeks aturan beserta penegaknya |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Pohon kanonik, perintah, contoh kode, aturan per bagian, konvensi commit |
| [docs/auth-guide.md](docs/auth-guide.md) | Integrasi frontend: token, refresh, cookie, CSRF, domain |
| [docs/partner-integration-guide.md](docs/partner-integration-guide.md) | Untuk partner: signing v1, contoh kode, vektor uji, error, rotasi |
| [.agents/AGENTS.md](.agents/AGENTS.md) | Aturan AI agent (diimpor `CLAUDE.md`) + skills di `.agents/skills/` |
| [docs/plans/](docs/plans/) | Rencana adopsi & log keputusan |
| [docs/archive/](docs/archive/) | Blueprint NestJS asal (arsip, tidak dipelihara) |
