# Bun Hono Starter (Enterprise Bun + Hono + Drizzle + PostgreSQL)

Production-ready backend starter berbasis **Bun**, **Hono**, **Drizzle ORM**, dan **PostgreSQL**, dengan fail-open Redis caching, structured logging (Pino), async Zod validation, declarative ACID transactions, dan multi-tier quality gates.

---

## 1. Architecture Pillars

1. **Pure Controllers**: Controller adalah pure function yang mengembalikan `ApiResponse`. Response dibungkus otomatis oleh wrapper `asyncHandler` ke dalam envelope standar.
2. **Strict Layer Isolation**: Alur data satu arah: `Route` -> `Controller` -> `Service` -> `Repository` -> `Database`. Diverifikasi otomatis oleh `dependency-cruiser`.
3. **Declarative ACID Transactions**: Didukung oleh Bun native `AsyncLocalStorage`. Service menandai method dengan `@Transactional()`, dan Repository cukup memanggil `this.txHost.tx` tanpa perlu *parameter drilling* (`tx` tidak perlu dioper manual).
4. **Data Layer Teraudit**: Tabel di `public` lewat `appTable` + helper kolom (UUID v7, `timestamps()` Temporal, soft delete), dimigrasi `drizzle-kit`; data milik sistem lain dibaca lewat view referensi *read-only*. Setiap UPDATE/DELETE tercatat di `record_changes` dalam transaksi yang sama (`AuditedRepository`).
5. **Zero-Trust Configuration**: Konfigurasi divalidasi ketat dengan Zod saat aplikasi booting (`src/config/<group>.config.ts`, satu grup per file). Aplikasi *fail-fast* jika ada variabel wajib yang tidak valid. Dilarang mengakses `process.env` di luar direktori config.
6. **Resilient Infrastructure**:
   - **Redis Fail-Open Cache**: Jika Redis server offline atau bermasalah, aplikasi otomatis bypass ke database fetcher tanpa membuat request user gagal.
   - **Platform Hardening**: Rate limit global per IP klien tepercaya lewat Redis (berlaku lintas instance, fail-open), `TRUST_PROXY_HOPS` (`X-Forwarded-For` tidak dipercaya mentah), batas ukuran body (413), CORS allowlist (`CORS_ORIGINS`, kosong = mati), dan security headers.
   - **API Docs (OpenAPI 3.1)**: `GET /api/docs` (UI Scalar) dan `/api/docs/openapi.json`, dihasilkan dari schema Zod yang sama dengan validasi (snake_case, envelope standar). Aktif kecuali di production (`API_DOCS_ENABLED`).
   - **Standar Waktu (Temporal, UTC)**: instant (`*_at`, ISO 8601 UTC, request wajib ber-offset), tanggal kalender (`*_date`, `YYYY-MM-DD`), jadwal lokal (+ `*_timezone` IANA); runtime & sesi database UTC; jam yang dilompati/terulang oleh DST ditolak.
   - **Health Probes**: `GET /api/health` (selalu 200, `UP`/`DEGRADED`/`DOWN` + status komponen), `/api/health/readiness` (503 hanya bila database mati; Redis mati = `DEGRADED`), `/api/health/liveness` (tanpa cek dependency). Probe database dibatasi 2 detik.
   - **Connection-Pooled HTTP Client**: Pemanggilan API eksternal menggunakan `HttpClientService` dengan persistent Keep-Alive connection pool (`http.Agent` & `https.Agent`), mandatory timeout, `X-Request-ID` ke vendor, Pino logging (body vendor teredaksi, hanya di log), dan vendor error masking (`error.origin` + `error.institution` dari `INTEGRATION_REGISTRY`).
   - **Auth JWT + Refresh Token**: `POST /api/v1/auth/login` → access token JWT HS256 (15 menit) di body, refresh token opaque di cookie `HttpOnly; Secure; SameSite=Strict` (hanya hash SHA-256 yang disimpan). Setiap refresh merotasi token; token lama yang dipakai ulang mengakhiri seluruh sesi. Logout / logout semua perangkat, `GET /me`, batas percobaan login per (email, IP), proteksi CSRF (`Origin` ∈ `CORS_ORIGINS`). **Default-deny**: semua route `/api/v1/*` wajib `Authorization: Bearer` kecuali `PUBLIC_ROUTES` (login, refresh, logout, register); `requireRole('admin')` per route → 403. Ganti password (`POST /api/v1/auth/change-password`, reset admin `PUT /api/v1/users/:id/password`) mengakhiri sesi lama; `bun run auth:purge-tokens` membersihkan refresh token kedaluwarsa (jadwalkan harian).
   - **Kredensial Partner (inbound)**: admin API `/api/v1/partner-credentials` — API key (`pk_…`, hanya hash SHA-256 disimpan) dan secret HMAC (terenkripsi AES-256-GCM dengan keyring `PARTNER_SECRET_KEYS`, bisa dirotasi) ditampilkan sekali saat dibuat / dirotasi; IP whitelist (IPv4/IPv6/CIDR), daftar route, rate limit per partner. Kode partner permanen (actor audit `partner:<kode>`). Route `/api/v1/partner/*` diautentikasi request bertanda tangan HMAC-SHA256 (`partnerAuth()`: timestamp, nonce sekali pakai, signature atas method + path + query + body) — contoh `GET /api/v1/partner/ping` dan `POST /api/v1/partner/echo`.
   - **Pino Structured Logging**: Format JSON terstruktur dengan sanitasi otomatis untuk field sensitif (PII redaction).
7. **Pesan Dwibahasa (i18n)**: Pesan respons `id`/`en` dipilih dari header `Accept-Language` (default `DEFAULT_LOCALE=id`); string literal sebagai pesan di modul ditolak ESLint.
8. **Kontrak snake_case Dua Arah**: Request (body & query) wajib `snake_case` — key casing lain ditolak 400 `ERR_NON_SNAKE_CASE_KEY` — lalu dikonversi ke DTO camelCase; response selalu `snake_case`.
9. **Multi-Tier Quality Gates**: ESLint 9 Flat Config, `.ls-lint.yml` (kebab-case naming), Commitlint (Conventional Commits), dan `bun test`.

---

## 2. Struktur Direktori

Ringkasan per lapisan — pohon lengkap (versi kanonik) ada di [CONTRIBUTING.md §2.1](CONTRIBUTING.md#21-anatomi-direktori-standar), batas antar-lapisan di §2.2.

```
src/
├── config/        # Satu grup Zod per file (app, auth, database, redis, http, satu per vendor); env-source.ts = satu-satunya pembaca process.env
├── core/          # Lintas domain: cache, context, dto, errors, http (klien outbound), i18n, logger, middlewares, openapi, response, security
├── database/      # Koneksi, TransactionHost, repository base teraudit, schema, seeds/, maintenance/
├── integrations/  # Adapter vendor keluar (registry.ts + <vendor>/), tanpa route/controller
├── modules/       # Modul domain: auth, health, users (referensi tabel mandiri), partner-credentials
│   └── orders/    # Modul contoh header + detail (/api/v1/orders[/:id/items]) — dihapus `bun run setup` kecuali --keep-examples
├── utils/         # Fungsi murni (datetime, case converter, …)
├── app.ts         # createApp(): pipeline middleware & router versi
└── index.ts       # Bun.serve + graceful shutdown
test/              # E2E (createApp().request), guard kontrak, helpers (perekam SQL), preload hermetik
scripts/           # setup, check-coverage, verify-scaffold, seed-admin, purge-refresh-tokens
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
#    modul contoh orders (header + detail) dihapus & migrasi dibuat ulang dari awal;
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

#### Alternatif: Full Containerized Development (Zero Host Install)
Jika Anda tidak ingin menginstall Bun di host OS:
```bash
docker compose -f docker-compose.dev.yml up --build
```
Aplikasi akan berjalan di dalam Docker container dengan live hot-reload (`bun --watch`).

---

## 4. Pola Pengembangan Fitur Baru

Modul baru dibuat dari template skill `scaffold-module` — kodenya diverifikasi mesin (`bun run verify:scaffold` di CI men-generate setiap varian dan menjalankan semua gate), sehingga tidak bisa tertinggal dari kode. Pilih varian menurut jenis tabel:

| Jenis tabel | Template | Contoh nyata |
|---|---|---|
| Mandiri | `.agents/skills/scaffold-module/SKILL.md` | `src/modules/users` |
| Header + detail | `.agents/skills/scaffold-module/references/header-detail.md` | `src/modules/orders` (dihapus `bun run setup` kecuali `--keep-examples`) |
| Pencatatan (append-only) | `.agents/skills/scaffold-module/references/record.md` | `record_changes` |

Urutannya selalu: schema (`appTable` + helper kolom) → `bun run db:generate` → DTO (request & response, snake_case di wire) → pesan (`id`/`en`) → repository (extend base) → transformer → service → controller (`ApiResponse`) → routes (`describeEndpoint` + `validate`) → daftarkan di `src/app.ts` (`v1.route(...)`) → test → `bun run validate:full`. Lewat AI agent: minta "scaffold module <nama>" (skill `scaffold-module`). Panduan rinci: [CONTRIBUTING.md §10](CONTRIBUTING.md).

---

## 5. Menjalankan Quality Gates

Jalankan seluruh verifikasi statis, arsitektur, dan testing:

```bash
# Seluruh quality gates (juga dijalankan hook pre-push): typecheck, lint, ls-lint, prettier,
# dependency-cruiser, knip, lint:setup, lint:branch, test + coverage gate
bun run validate:full
bun run verify:scaffold   # template scaffold-module (modul + integrasi) lewat semua gate (CI)

# Validasi parsial:
bun run typecheck   # Typecheck tanpa emit
bun run lint        # ESLint flat config
bun run lint:ls     # Kebab-case naming check
bun run lint:arch   # Architectural boundary isolation check
bun test            # Unit & e2e test (hermetik: tanpa DB/Redis asli)
```
