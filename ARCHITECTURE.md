# Architecture — Backend Bun + Hono + Drizzle

> **Jenis dokumen**: Technical Architecture Document (TAD)
> **Pembaca**: arsitek, tech lead, backend engineer, AI coding agent
> **Lingkup**: arsitektur boilerplate ini dan setiap proyek yang dibuat darinya (`bun run setup <nama>`). Generik — tidak ada nama proyek, organisasi, atau vendor sungguhan.

Dokumen ini menjelaskan **apa dan mengapa** setiap keputusan arsitektur. Kode lengkap, contoh, dan langkah kerja ada di sumbernya masing-masing — dokumen ini tidak menyalinnya agar tidak basi:

| Topik | Sumber detail |
|---|---|
| Pohon direktori kanonik, perintah, contoh kode, aturan per bagian | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Aturan untuk AI agent + standar implementasi per subsistem | [`.agents/AGENTS.md`](.agents/AGENTS.md), skill `project-standards` (+ `references/*.md`) |
| Template modul / integrasi (terverifikasi `bun run verify:scaffold`) | skill `scaffold-module` |
| Integrasi frontend (token, refresh, cookie, CSRF) | [`docs/auth-guide.md`](docs/auth-guide.md) |
| Kontrak partner (signing v1, vektor uji, error) | [`docs/partner-integration-guide.md`](docs/partner-integration-guide.md) |
| Rencana adopsi & log keputusan (D0–D31) | [`docs/plans/2026-10-04-blueprint-adoption-plan.md`](docs/plans/2026-10-04-blueprint-adoption-plan.md) |
| Blueprint NestJS asal (arsip, tidak dipelihara) | [`docs/archive/ARCHITECTURE_BLUEPRINT_FROM_NESTJS.md`](docs/archive/ARCHITECTURE_BLUEPRINT_FROM_NESTJS.md) |

Setiap aturan di dokumen ini merujuk ke [§12 Indeks Aturan & Penegak](#12-indeks-aturan--penegak) (`R01`, `R02`, …), yang menyebut **mesin mana yang menolak pelanggarannya**.

---

## 1. Ringkasan

### 1.1 Pilar Arsitektur

```
├── [1] Pure Controllers & Kontrak Seragam → return ApiResponse; envelope, snake_case 2 arah & i18n otomatis
├── [2] Strict Layer Isolation              → Routes → Controller → Service → Repository (dependency-cruiser)
├── [3] Declarative ACID Transactions       → @Transactional() di service + TransactionHost (AsyncLocalStorage)
├── [4] Audited Data Layer                  → 4 base repository; setiap UPDATE/DELETE tercatat di record_changes
├── [5] Default-Deny Access                 → JWT + refresh cookie (user), HMAC v1 (partner), verifier per vendor (webhook)
├── [6] Zero-Trust Configuration            → process.env hanya di satu file; setiap grup divalidasi Zod saat start
├── [7] Resilient & Observable Platform     → Redis fail-open, Pino + request ID, health UP/DEGRADED/DOWN
└── [8] Machine-Enforced Quality Gates      → tsc, ESLint AST, ls-lint, depcruise, knip, test penjaga, coverage, CI
```

Prinsip di balik semuanya: **aturan yang hanya tertulis akan dilanggar** — oleh manusia yang terburu-buru maupun oleh AI agent. Karena itu hampir setiap aturan ditegakkan mesin (§12); sisanya ditandai `[review-only]` beserta alasannya.

### 1.2 Tech Stack

| Lapisan | Teknologi | Ketentuan |
|---|---|---|
| Runtime | Bun ≥ 1.3 | `TZ=UTC` dipaksa saat start; `Bun.password` (argon2id), `Bun.randomUUIDv7()` |
| HTTP | Hono 4 | `createApp()` dipakai server **dan** test (`app.request()`) |
| Bahasa | TypeScript 5 strict | `noImplicitAny`, `strictNullChecks`, `noUnused*`, `noImplicitReturns` |
| ORM | Drizzle ORM + driver `postgres` | Code-first, migrasi `drizzle-kit`, sesi DB `timezone=UTC` |
| Database | PostgreSQL ≥ 16 | Tabel di `public`; view referensi read-only opsional |
| Waktu | `temporal-polyfill` | Instant / tanggal kalender / jadwal lokal, tidak dicampur |
| Cache & lock | Redis ≥ 2.6 (`ioredis`) | Fail-open, prefix otomatis, perintah berbahaya diblokir |
| Validasi | Zod 3 | Satu schema = validasi + dokumentasi OpenAPI |
| Dokumentasi API | OpenAPI 3.1 (`hono-openapi`) + Scalar | Dihasilkan dari kode, diuji |
| Log | Pino | JSON, redaksi data sensitif, `requestId` + `actor` otomatis |
| HTTP keluar | `HttpClientService` (Axios) | Hanya di `src/integrations/`, timeout wajib, error vendor di-mask |
| Quality gate | ESLint 9, ls-lint, dependency-cruiser, knip, Prettier, `bun test`, Husky, GitHub Actions | §10 |

---

## 2. Struktur & Batas Lapisan

### 2.1 Struktur Direktori (ringkas)

Pohon lengkap dan kanonik: [CONTRIBUTING §2.1](CONTRIBUTING.md#21-anatomi-direktori-standar) (dijaga `test/docs-sync.test.ts`).

```
src/
├── config/        # Satu grup Zod per file; env-source.ts = satu-satunya pembaca process.env
├── core/          # Lintas domain, tanpa domain & database: cache, context, dto, errors, http, i18n,
│                  #   logger, middlewares, openapi, response, security
├── database/      # Koneksi, TransactionHost, 4 base repository + AuditedRepository, schema/, seeds/, maintenance/
├── integrations/  # Adapter vendor (registry.ts + <vendor>/): outbound service, verifier webhook — tanpa route
├── modules/       # Modul domain (routes → controller → service → repository) per kanal inbound
├── utils/         # Fungsi murni (datetime, crypto, case converter, signature partner, …)
├── app.ts         # createApp(): pipeline middleware, router versi, WEBHOOK_VENDORS
└── index.ts       # Bun.serve + graceful shutdown
test/              # E2E (createApp().request), test penjaga kontrak, helpers, preload hermetik, integration/
scripts/           # setup, scaffold verification, coverage gate, test:int runner, seed, partner:sign, …
```

### 2.2 Arah Dependensi

```
modules ──► integrations ──► core ──► config
   │             │             └────► utils (daun murni)
   ├──► core     └──► config, utils
   └──► database (TransactionHost, base repository, schema — tidak pernah connection.ts)
database ──► core (request context, errors), utils, config
database/schema ──► utils saja
config ──► library saja (akar graf)
```

Mengapa: domain (`modules`) boleh bergantung pada infrastruktur, tidak sebaliknya — `core` dan `database` dipakai ulang oleh setiap modul, jadi tidak boleh tahu modul mana pun (R02). Modul tidak saling impor (R03): kebutuhan lintas modul diinjeksi lewat parameter konstruktor (contoh: `partnerAuth()` menerima lookup kredensial dari modul `partner-credentials` di `app.ts`).

Di dalam modul alirannya satu arah (R01):

```
Routes ──► Controller ──► Service ──► Repository ──► PostgreSQL (TransactionHost)
               │             ├──► Integrations (adapter vendor)
               ▼             ▼
          Transformer    Core / Utils
```

Matriks lengkap (siapa boleh mengimpor apa): [CONTRIBUTING §2.2](CONTRIBUTING.md#22-boundary-isolation-matrix-enforced-by-dependency-cruiser).

### 2.3 Penamaan

Nama file adalah **penanda yang dibaca mesin**: ESLint dan dependency-cruiser memilih aturan dari akhiran (`*.controller.ts`, `*.repository.ts`, `*.partner.routes.ts`). Nama yang "nyaris benar" (`x.partner-routes.ts`) akan lolos dari semua aturan, karena itu polanya diuji (R05, R06):

- Modul: `<modul>[-<kualifier>][.partner|.webhook].<peran>[.test].ts`, `<peran>` ∈ `routes`, `controller`, `service`, `repository`, `queries`, `dto`, `transformer`, `messages`, `util`.
- Integrasi: `src/integrations/<vendor>/<vendor>.<peran>.ts` (`service`, `dto`, `webhook`, `webhook.dto`) atau `index.ts`.
- Modul dinamai menurut **domain** (`messaging`), bukan vendor — ganti vendor = adapter baru, modul tetap (D26).
- Kode TypeScript camelCase / PascalCase; `snake_case` hanya untuk nama SQL dan wire HTTP (R07).

---

## 3. HTTP Layer & Kontrak API

### 3.1 Pipeline `createApp()`

Satu factory dipakai `src/index.ts` dan setiap test e2e, sehingga test menguji pipeline yang sama dengan produksi. Urutan (detail: `references/bootstrap.md`, plan L10):

```
 1. requestContext()      request ID, locale, IP klien tepercaya, actor = anonymous (AsyncLocalStorage)
 2. loggerMiddleware()    log request masuk/keluar
 3. secureHeaders()       security headers
 4. cors()                hanya bila CORS_ORIGINS terisi (kosong = tanpa header CORS)
 5. bodySizeLimit()       413 dalam envelope standar
 6. rateLimit()           global per IP (Redis, fail-open) — kecuali health, partner, webhook;
    rejectionLimit()      di prefix partner & webhook: per IP hanya jawaban 401/403 yang dihitung
 7. health, docs          publik, di luar /v1
 8. webhookAuth(vendor)   per WEBHOOK_VENDORS, lalu requireVerifiedWebhook() → fail-closed
 9. partnerAuth()         <base>/v1/partner/* (signing v1)
10. authenticate()        <base>/v1/* default-deny, kecuali PUBLIC_ROUTES & partner terverifikasi
11. v1 router             modul (requireRole per route); mountApiDocs() (mati di production)
12. onError / notFound    globalErrorHandler, notFoundHandler (envelope error)
```

### 3.2 Pure Controller

Controller hanya: ambil input tervalidasi (`getValidatedBody/Query/Params`) → panggil service → bentuk data lewat transformer → `return new ApiResponse(data, message, status, meta)`. Handler berupa field `name = asyncHandler(async (c) => …)` (R10, R11).

Mengapa: bila controller menulis response sendiri (`c.json()`), envelope, konversi snake_case, terjemahan pesan, dan format waktu bisa terlewat satu per satu. Dengan return-based controller, semua itu terjadi di satu tempat (`ApiResponse.toJSON()`), dan controller mudah diuji tanpa HTTP.

### 3.3 Kontrak snake_case Dua Arah

- Response selalu `snake_case` (`ApiResponse`, `globalErrorHandler`).
- Request body & query wajib `snake_case`; key lain ditolak 400 `ERR_NON_SNAKE_CASE_KEY` (setiap key persis seperti dikirim), lalu dikonversi ke DTO camelCase. Kamus bebas: `preserveKeys`. Payload webhook vendor: `bodyKeys: 'verbatim'` (R12, R46).
- Data keluar lewat transformer yang bertipe schema response — entity database tidak pernah dikirim mentah (R13).

Mengapa dua arah dan strict: kontrak simetris (FE mengirim nama yang sama dengan yang diterima), dan `details[].field` pada error validasi selalu nama yang dikirim FE sehingga bisa dipetakan langsung ke form (D10).

### 3.4 Envelope & Error

Sukses: `{ success, status_code, message, data, meta? }` — `meta` hanya untuk list terpaginasi. Error: `{ success: false, status_code, message, error: { type, code, origin, institution?, details? }, request_id, timestamp }`. Contoh lengkap: [CONTRIBUTING §3](CONTRIBUTING.md#3-standar-http-response--error-envelopes).

- Error domain = subclass `ApiError` (`ValidationError`, `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError` (409, tipe `CONFLICT`), `PayloadTooLargeError`, `TooManyRequestsError`, `ServiceUnavailableError`, `ExternalServiceError`, `InternalServerError`) (R14).
- `error.code` hanya dari registry `APP_ERROR_CODES` — kode adalah kontrak dengan FE, jadi satu daftar, tanpa literal tersebar (R15).
- 500 tidak pernah membocorkan pesan / detail internal (R18); kegagalan vendor tidak meneruskan status maupun body vendor (R52).

### 3.5 Pesan Dwibahasa

Pesan ke client berupa `LocalizedMessage` `{ id, en }` — tipe memaksa setiap bahasa terisi. Bahasa dari `Accept-Language` (fallback `DEFAULT_LOCALE`, default `id`), diumumkan lewat `Content-Language`. `Error.message` tetap bahasa Inggris untuk log (R16).

### 3.6 Route, Versi & Dokumentasi

- Noun jamak kebab-case, maksimal dua level; level kedua hanya untuk detail milik header (`/<headers>/:id/<details>`).
- Versi adalah kode, bukan env: `<API_BASE_PATH>/v1`; breaking change = router baru `v2` (R19).
- Setiap route punya `describeEndpoint()` (summary, envelope sukses, error domain). Body, parameter, 400/413 didokumentasikan `validate()` dari schema yang sama; 429/500 dan header umum ditambahkan builder — dokumentasi tidak bisa menyimpang dari validasi (R17). Tersaji di `<API_BASE_PATH>/docs` kecuali production.

### 3.7 Tanggal & Waktu

Tiga jenis, tidak dicampur: **instant** (`*_at`, `timestamptz`, ISO 8601 UTC; request wajib ber-offset), **tanggal kalender** (`*_date`, `date`, `YYYY-MM-DD`), **jadwal lokal** (instant + zona IANA `*_timezone`; jam yang dilompati / terulang DST ditolak). Parsing dan konversi hanya di `src/utils/datetime.util.ts`; runtime dan sesi DB di UTC (R20–R22). Mengapa: bug zona waktu muncul diam-diam saat server, DB, dan klien berada di zona berbeda — satu jalur konversi membuatnya tidak mungkin. Panduan: `references/datetime.md`.

---

## 4. Autentikasi & Kanal Inbound

### 4.1 Tiga Kanal, Tiga Pemilik Kontrak

| Pemanggil | File | Prefix | Autentikasi | Actor |
|---|---|---|---|---|
| User (FE, mobile) | `<modul>.<peran>.ts` | `<base>/v1/<modul>` | `authenticate()` — JWT Bearer | `user:<id>` |
| Sistem partner | `<modul>.partner.<peran>.ts` | `<base>/v1/partner/...` | `partnerAuth()` — signing HMAC v1 | `partner:<kode>` |
| Webhook vendor | `<modul>.webhook.<peran>.ts` | `<base>/webhooks/<vendor>` (di luar `/v1`) | `webhookAuth()` — verifier per vendor | `webhook:<vendor>` |
| Tanpa request (job, seed) | — | — | — | `system` |

Mengapa dipisah (D23): kontrak partner milik kita (signing v1), kontrak webhook milik vendor (skema signature mereka). Melonggarkan `partnerAuth()` demi satu vendor akan melemahkan semua partner. Helper tiap kanal hanya boleh dipakai di file kanalnya (R43), dan router kanal hanya dipasang di prefix-nya (R44).

### 4.2 User: JWT + Refresh Cookie

- Login → access token JWT HS256 (TTL default 15 menit) di body; refresh token **opaque** di cookie `HttpOnly; Secure; SameSite=Strict`, hanya hash SHA-256 yang disimpan (`auth_refresh_tokens`) (D1–D3).
- Setiap refresh merotasi token; token lama yang dipakai ulang mencabut seluruh *family* (deteksi pencurian). Endpoint ber-cookie memakai `csrfProtection()` (`Origin` ∈ `CORS_ORIGINS`) (R40, R41).
- **Default-deny** (D7): `authenticate()` dipasang sekali untuk semua `<base>/v1/*`; pengecualian hanya daftar pendek `PUBLIC_ROUTES` (login, refresh, logout, register). Lupa memasang auth bukan lagi celah, karena tidak ada yang perlu dipasang (R38).
- Otorisasi RBAC: `requireRole(...)` / `requireSelfOrRole(...)` per route → 403 `ERR_ROLE_FORBIDDEN` (R39).
- Access token tidak dicek ulang ke DB: perubahan role / nonaktif / ganti password berlaku penuh setelah token habis; refresh berikutnya sudah ditolak.

Panduan FE: [`docs/auth-guide.md`](docs/auth-guide.md).

### 4.3 Partner: Signing v1

`partnerAuth()` memeriksa berurutan: header lengkap → jendela timestamp → API key aktif (lookup by hash, di-cache) → IP whitelist → `allowed_routes` → signature HMAC-SHA256 atas `v1\n<timestamp>\n<nonce>\n<METHOD>\n<path>\n<query kanonik>\n<sha256(body)>` → nonce sekali pakai → rate limit per partner. API key disimpan sebagai hash, secret HMAC terenkripsi AES-256-GCM dengan keyring yang bisa dirotasi; keduanya hanya ditampilkan sekali (R42).

Nonce dan rate limit memakai Redis yang fail-open: saat Redis mati, perlindungan tersisa adalah jendela timestamp — pilihan sadar demi ketersediaan gateway. Karena itu **penulisan oleh partner wajib idempoten** per `(partner_code, partner_reference)` (D28, R47). Endpoint untuk satu partner saja menambah `requirePartner('<kode>')`, agar salah konfigurasi `allowed_routes` tidak membukanya ke partner lain (D27). Spesifikasi untuk partner: [`docs/partner-integration-guide.md`](docs/partner-integration-guide.md).

### 4.4 Webhook Vendor

Verifier (`src/integrations/<vendor>/<vendor>.webhook.ts`) mengikuti skema signature vendor dan didaftarkan hanya di `WEBHOOK_VENDORS` (`app.ts`). Prefix `<base>/webhooks/*` **fail-closed**: request yang tidak diterima verifier mana pun → 401. Event disimpan di `webhook_events` (unik `(vendor, event_id)`) dan diproses dalam transaksi yang sama, sehingga retry vendor dijawab 200 tanpa diproses dua kali (R45, R47).

---

## 5. Data Layer

Panduan lengkap: `references/database.md`; tabel aturan: [CONTRIBUTING §5.3](CONTRIBUTING.md#53-aturan-data-layer-yang-ditegakkan-mesin).

### 5.1 Tabel & Kolom

- Proyek memiliki database sendiri: semua tabel di `public` lewat `appTable(...)` (D14). Data milik sistem lain dibaca lewat view `referenceSchema.view(...).existing()` — tidak dimigrasi, dan `insert` gagal saat kompilasi (R23).
- Kolom hanya lewat helper (`uuidPrimaryKey`, `timestamps`, `instant`, `calendarDate`, `auditColumns`, `softDelete`, `parentReference`, `activeUniqueIndex`) (R24). Primary key UUID v7 (dibuat aplikasi, index B-tree tetap berurutan); `bigint` identity hanya untuk tabel pencatatan di `APPEND_ONLY_TABLES` (D15).
- Konvensi diuji pada setiap tabel yang diekspor: FK ter-index, unique di tabel soft delete memakai `activeUniqueIndex()`, `record_changes` siap partisi (R25).

### 5.2 Jenis Tabel & Base Repository

| Jenis | Ciri | Repository |
|---|---|---|
| Mandiri / header | Berdiri sendiri, soft delete, `created_by` / `updated_by` dari actor | `BaseRepository` |
| Detail | Hanya bermakna di bawah satu header, hard delete + snapshot | `ChildRepository` (selalu lewat header hidup → anti IDOR, `syncForParent`) |
| Pencatatan | Append-only, volume besar | `AppendOnlyRepository` |
| Referensi | Milik sistem lain, read-only | `ReadOnlyRepository` |

Setiap repository modul meng-extend salah satunya (R26). Satu-satunya pengecualian yang disetujui: repository refresh token (rotasi bervolume tinggi; jejaknya `revoked_at` + `replaced_by_id`) (R27).

### 5.3 Transaksi

```
Service @Transactional()  ──►  Repository (this.txHost.tx)  ──►  PostgreSQL
  commit / rollback otomatis     ikut transaksi aktif (AsyncLocalStorage) atau pool
```

`@Transactional()` hanya di service, `TransactionHost` hanya di repository / `*.queries.ts`, transaksi tidak pernah disimpan di variabel (aturan tulis mengenali `tx` dari namanya) (R30–R32). Mengapa AsyncLocalStorage: atomisitas tanpa mengoper `tx` ke setiap fungsi, dan service tetap bebas dari Hono `Context` (D8).

### 5.4 Audit Perubahan (`record_changes`)

Update (kolom yang berubah saja), soft delete, restore, dan delete detail (snapshot) **mengunci baris lalu menulis `record_changes` dalam transaksi yang sama**, dengan actor dan request ID; kolom sensitif → `redact`. INSERT tidak dicatat (baris membawa `created_*`). Jalan pintasnya ditutup: tanpa `tx.update` / `tx.delete` di repository modul, tanpa penulisan di luar repository, tanpa raw `UPDATE` / `DELETE`, tanpa menulis `recordChanges` langsung (R27–R29, R33, R35). Konflik unik selalu 409, bukan 500 (R36).

### 5.5 Raw SQL

Query builder dulu. Raw SQL hanya untuk yang tidak bisa diekspresikan (window function, recursive CTE): template `` sql`…` `` (parameterized; `sql.raw` dilarang), di fungsi murni `<modul>.queries.ts`, baca saja, dan wajib menulis filter `deleted_at IS NULL` sendiri (R29, R37). Panduan: `references/raw-queries.md`.

---

## 6. Cache (Redis Fail-Open)

1. Redis hanya lewat `CacheService` (R54); key dari `CACHE_KEYS`, TTL dari `CACHE_TTL` (R56).
2. **Fail-open**: Redis mati / lambat (> `REDIS_COMMAND_TIMEOUT_MS`) → fetcher DB tetap dipanggil; request tidak gagal karena cache, health melaporkan `DEGRADED` (R55).
3. Prefix `<APP_NAME>:<NODE_ENV>:` otomatis — banyak proyek dan environment bisa berbagi satu Redis; `FLUSHALL` / `FLUSHDB` / `KEYS` diblokir (D22).
4. Reconnect tanpa batas (backoff ≤ 30 dtk), offline queue mati (command gagal cepat, tidak menumpuk).
5. Primitif: `getOrSet(…, { negativeTtl })` untuk lookup dari input tak tepercaya, `setIfAbsent` (nonce / idempotensi), `increment` atomik (rate limit).

Mengapa fail-open, dan konsekuensinya: cache adalah optimasi, bukan sumber kebenaran — state yang tidak boleh hilang (refresh token, idempotensi) disimpan di PostgreSQL (D1, D28). Panduan: `references/redis-cache.md`.

---

## 7. Observability, Konfigurasi & Platform

### 7.1 Logging

`console.*` dilarang; logger Pino singleton dengan format `logger.info({ field }, 'pesan statis')`. `requestId` dan `actor` ditambahkan otomatis dari request context. Redaksi otomatis untuk key sensitif (password, token, secret, API key, header `authorization` / `cookie`, …) (R59).

### 7.2 Request ID & Konteks

`X-Request-ID` dari gateway diterima bila formatnya aman (`^[A-Za-z0-9._:-]{1,128}$`, mencegah log injection), selain itu UUID v7 baru (D9). Dipakai di log, envelope error, `record_changes`, dan diteruskan ke vendor. Konteks request (`requestId`, `actor`, `locale`, `clientIp`) di AsyncLocalStorage (R60).

### 7.3 Konfigurasi

`process.env` hanya dibaca `src/config/env-source.ts` (R57). Satu grup per file (`<group>.config.ts`), divalidasi Zod saat di-import: aplikasi berhenti dengan daftar variabel yang salah (nama + aturan, tanpa nilai). Nama variabel lama yang masih diset ditolak (`RENAMED_ENV_VARS`), agar penggantian nama tidak mematikan fitur diam-diam (R58). Registry lengkap: plan L1 + `.env.example`.

### 7.4 Keamanan Platform

Security headers; CORS allowlist (kosong = mati); IP klien = `TRUST_PROXY_HOPS` (bukan `X-Forwarded-For` mentah); batas body (413); rate limit global per IP via Redis (berlaku lintas instance) — prefix partner & webhook memakai limit sendiri (D29). File `.env` aktif tidak pernah dibaca AI agent (R70).

### 7.5 Health

| Endpoint | Untuk | Perilaku |
|---|---|---|
| `GET <base>/health` | Dashboard | Selalu 200; `UP` / `DEGRADED` (Redis mati) / `DOWN` (DB mati) |
| `GET <base>/health/readiness` | Load balancer / orkestrator | 503 hanya bila database mati |
| `GET <base>/health/liveness` | Orkestrator | Proses hidup, tanpa cek dependency |

Probe database dibatasi 2 detik (R62).

### 7.6 Container & Identitas Proyek

`Dockerfile` multi-stage Bun Alpine, user non-root, `TZ=UTC`; `docker-compose.yml` untuk PostgreSQL 16 + Redis 7 lokal (opsional — layanan native juga didukung). Nilai yang membawa nama proyek (nama package, `APP_NAME`, database, container, judul README) terdaftar di `IDENTITY_RULES` (`scripts/setup.ts`), sehingga `bun run setup <nama>` mengganti semuanya dan gagal bila satu aturan tidak lagi cocok (R61).

---

## 8. Integrasi Outbound

- Adapter vendor hanya di `src/integrations/<vendor>/`: tanpa route / controller, tidak bergantung pada modul, database, atau vendor lain (R51). Modul domain memakai service adapter; controller tidak (R49).
- Semua panggilan lewat `HttpClientService`: keep-alive pool, **timeout wajib**, `X-Request-ID` diteruskan, body vendor divalidasi (`parse()`); `fetch` / `axios` langsung ditolak (R49, R50, R52).
- Kegagalan vendor → `ExternalServiceError` (504 timeout, 502 lainnya) dengan `error.origin` (kode) + `error.institution` (nama) dari `INTEGRATION_REGISTRY`; status dan body vendor **tidak** diteruskan ke client, body hanya di log dengan redaksi (R52, R53).
- Vendor berbasis login: `AccessTokenCache` (token dipakai ulang sampai hampir habis, satu login bersama untuk request paralel, login ulang sekali saat vendor menjawab 401).
- Backlog: retry + circuit breaker, cache token bersama antar instance (plan L12).

Panduan: `references/integrations.md`; template: `scaffold-module` → `references/integration.md`.

---

## 9. Testing

| Lapisan | Lokasi | Infrastruktur |
|---|---|---|
| Unit | `src/**/*.test.ts` (co-located) | Dependensi diinjeksi lewat default parameter; perekam SQL (`test/helpers/sql-recorder.ts`) me-render SQL asli |
| E2E / kontrak | `test/*.e2e.test.ts` | `createApp().request(...)`, tanpa layanan asli |
| Penjaga | `test/*.test.ts` | Struktur, default-deny, OpenAPI, sinkron dokumen, migrasi, skill agent |
| Integration | `test/integration/*.int.ts` | PostgreSQL + Redis asli, database sekali pakai per run (`bun run test:int`, job CI `integration`) |

- **Hermetik**: `bun test` tidak pernah menyentuh database / Redis pengembang (preload `test/setup/hermetic-env.ts`); `mock.module()` dilarang karena bocor ke file test lain (R64).
- **Coverage gate**: ambang hanya di `scripts/check-coverage.ts` (global lines & functions 95, per file lines 90), dihitung dari file sumber saja, dan setiap file `src/` wajib dimuat test. Bun belum melaporkan branch coverage, jadi setiap cabang logika diberi test eksplisit (R63).
- **Integration suite** untuk yang tidak bisa dibuktikan dengan mock: lock baris, rollback, unique index, Lua Redis, race. Wajib dijalankan saat mengubah repository, transaksi, migrasi, auth, partner gateway, atau cache (R65).
- Perilaku generik (soft delete, audit, sync detail) diuji sekali di `src/database/`; test modul hanya menguji logikanya sendiri.

Panduan: `references/testing.md`.

---

## 10. Quality Gates

```
pre-commit   lint-staged (ESLint --fix, Prettier) · tsc --noEmit · ls-lint
commit-msg   commitlint (Conventional Commits)
pre-push     validate:full = typecheck → lint → ls-lint → format:check → depcruise → knip
             → lint:setup → lint:branch → test + coverage gate
CI           job verify: nama branch + commitlint (PR) → semua gate di atas → build → verify:scaffold
             job integration: bun run test:int (PostgreSQL + Redis sebagai service container)
```

Hook lokal bisa dilewati (`--no-verify`); CI menjalankan ulang semuanya. Template `scaffold-module` diverifikasi dengan men-generate setiap varian dan menjalankan semua gate (`verify:scaffold`), sehingga template tidak bisa tertinggal dari kode (R67). Perintah lengkap: [CONTRIBUTING §1](CONTRIBUTING.md#1-quality-gates--automated-enforcement).

---

## 11. AI Agent Governance

Aturan untuk AI coding agent adalah bagian dari arsitektur, bukan dokumentasi tambahan — agent menghasilkan kode lebih cepat daripada manusia bisa me-review, jadi gate yang sama berlaku untuk keduanya:

| Komponen | Peran |
|---|---|
| `.agents/AGENTS.md` (diimpor `CLAUDE.md`) | Aturan MANDATORY: invariant arsitektur, proteksi `.env`, alur kerja per step |
| `skills/project-standards` (+ `references/`) | Standar kode per subsistem; wajib dibaca sebelum menulis kode |
| `skills/scaffold-module` | Template modul / integrasi yang lolos semua gate tanpa edit manual |
| `skills/init-project`, `generate-commit-text`, `update-version`, `generate-logbook`, `env-protection` | Alur kerja proyek |
| `.claude/` | Wrapper skill untuk Claude Code (dijaga `test/agent-skills.test.ts`); `permissions.deny` + hook memblokir pembacaan `.env` aktif |

Agent hanya menjalankan perintah ke database **lokal** developer dengan izin eksplisit; tidak pernah ke database bersama / production. Agent tidak melakukan commit / merge tanpa permintaan user.

---

## 12. Indeks Aturan & Penegak

Label penegak (dicek `test/docs-sync.test.ts`: setiap baris punya label, setiap label menunjuk sesuatu yang ada):

| Label | Artinya |
|---|---|
| `[tsc]` | Ditolak compiler TypeScript (`bun run typecheck`) |
| `[eslint:<nama>]` | Rule atau grup rule di `eslint.config.mjs` (`bun run lint`) |
| `[depcruise:<nama>]` | Rule di `.dependency-cruiser.cjs` (`bun run lint:arch`) |
| `[ls-lint]` | `.ls-lint.yml` (`bun run lint:ls`) |
| `[test:<nama>]` | File test `<nama>.test.ts` / `<nama>.int.ts` yang gagal saat aturan dilanggar |
| `[script:<nama>]` | Script `package.json` yang gagal saat aturan dilanggar |
| `[ci:<job>]` | Job di `.github/workflows/ci.yml` |
| `[hook:<file>]` | Hook Git (Husky) atau hook Claude Code yang menolak tindakan |
| `[review-only]` | Belum bisa dicek mesin — reviewer yang memeriksa (alasan di kolom aturan) |

### Struktur & Lapisan

| ID | Aturan | Penegak |
|---|---|---|
| R01 | Alur modul satu arah Routes → Controller → Service → Repository; transformer murni | [depcruise:routes-no-service-or-repo] [depcruise:controller-no-repository] [depcruise:service-no-controller-or-routes] [depcruise:service-no-transformer] [depcruise:repository-no-service-or-controller] [depcruise:transformer-pure] |
| R02 | Batas lapisan teratas: config akar, utils murni, core tanpa domain / database / integrasi, database tanpa modul, schema hanya utils | [depcruise:strict-config-isolation] [depcruise:strict-utils-isolation] [depcruise:strict-core-isolation] [depcruise:strict-database-isolation] [depcruise:strict-schema-isolation] |
| R03 | Modul tidak saling impor | [depcruise:no-cross-module-deps] |
| R04 | Tanpa dependensi melingkar, file yatim, import tak ter-resolve atau tak terdaftar, kode sumber yang mengimpor test; tanpa file / export / dependency tak terpakai | [depcruise:no-circular] [depcruise:no-orphans] [depcruise:not-to-unresolvable] [depcruise:not-to-unlisted-dep] [depcruise:no-test-in-src] [script:lint:deps] |
| R05 | Nama folder dan setiap segmen titik nama file kebab-case | [ls-lint] [test:structure] |
| R06 | Pola nama file modul & integrasi; modul tidak dinamai vendor; `*.int.ts` hanya di `test/integration/` | [test:structure] |
| R07 | Identifier TypeScript camelCase / PascalCase / UPPER_CASE (snake_case hanya nama SQL) | [eslint:@typescript-eslint/naming-convention] |
| R08 | TypeScript strict, tanpa `any` dan operasi tak aman | [tsc] [eslint:@typescript-eslint/no-explicit-any] [eslint:@typescript-eslint/no-unsafe-assignment] |
| R09 | Format kode Prettier (`*.ts`; Markdown ditulis tangan) | [script:format:check] |

### Kontrak HTTP

| ID | Aturan | Penegak |
|---|---|---|
| R10 | Controller me-return `ApiResponse`, setiap handler dibungkus `asyncHandler`, tanpa `c.json()` / `c.text()` / `c.body()` / `c.html()` | [eslint:CONTROLLER_SYNTAX_RULES] |
| R11 | Input hanya lewat `validate()` + `getValidated*()`; membaca `c.req` (kecuali header) di controller dilarang | [eslint:CONTROLLER_SYNTAX_RULES] [test:validate] |
| R12 | Wire `snake_case` dua arah; key request lain → 400 `ERR_NON_SNAKE_CASE_KEY` | [test:snake-case-contract] [test:api-response] [test:openapi.e2e] |
| R13 | Data keluar lewat transformer, bukan entity mentah — transformer bertipe schema response, tetapi entity berkolom lebih tetap lolos kompilasi | [review-only] |
| R14 | Error domain = subclass `ApiError`; `throw new Error` di modul dilarang | [eslint:MODULE_ERROR_RULES] |
| R15 | `error.code` hanya dari `APP_ERROR_CODES` (tanpa literal `'ERR_*'` atau kode yang dirakit) | [eslint:ERROR_CODE_SYNTAX_RULES] |
| R16 | Pesan ke client = `LocalizedMessage` `{ id, en }`; string literal sebagai pesan di modul dilarang | [eslint:MODULE_ERROR_RULES] [tsc] [test:translate] |
| R17 | Setiap route punya `describeEndpoint()` (summary + 2xx), properti snake_case, header umum | [test:openapi.e2e] |
| R18 | Error 500 tidak membocorkan pesan / detail internal | [test:error-handler] |
| R19 | Versi API adalah router di kode (`/v1`, `/v2`), bukan env; breaking change = versi baru — keputusan desain API, tidak bisa dideteksi mesin | [review-only] |

### Tanggal & Waktu

| ID | Aturan | Penegak |
|---|---|---|
| R20 | `new Date(...)` (termasuk "sekarang"), `Temporal.Now`, `Date.parse`, getter / formatter waktu lokal hanya di `datetime.util.ts` | [eslint:DATETIME_SYNTAX_RULES] |
| R21 | Field waktu request dari `datetime.dto.ts`; instant tanpa offset dan jam DST yang ambigu ditolak | [test:datetime.dto] [test:datetime.util] |
| R22 | Proses (`TZ=UTC`, diset `env-source.ts`) dan sesi DB (`timezone=UTC`, `connection.ts`) di UTC — sesi DB tidak diuji | [test:hermetic-env] [review-only] |

### Data Layer

| ID | Aturan | Penegak |
|---|---|---|
| R23 | `pgTable(` / `pgSchema(` hanya di `schemas.ts`; tabel lewat `appTable` | [eslint:SCHEMA_DECLARATION_RULES] [test:schemas] |
| R24 | Kolom lewat helper (`timestamp(` / `date(` / `serial(` / `.defaultRandom()` dilarang di file schema) | [eslint:SCHEMA_FILE_RULES] [test:columns] |
| R25 | Konvensi schema: FK ter-index, id dari helper, bigint hanya `APPEND_ONLY_TABLES`, unique di tabel soft delete = `activeUniqueIndex()`, `record_changes` siap partisi | [test:schema-conventions] |
| R26 | Repository modul meng-extend satu base (`BaseRepository` / `ChildRepository` / `AppendOnlyRepository` / `ReadOnlyRepository`) | [eslint:REPOSITORY_SYNTAX_RULES] |
| R27 | `tx.update` / `tx.delete` dilarang di repository modul (pengecualian tunggal: repository refresh token boleh update `auth_refresh_tokens`) | [eslint:REPOSITORY_SYNTAX_RULES] [eslint:AUTH_TOKEN_REPOSITORY_RULES] |
| R28 | Penulisan DB hanya di repository | [eslint:TX_WRITE_RULES] |
| R29 | Raw `UPDATE` / `DELETE` dilarang; `tx.execute` hanya di `*.queries.ts`; `sql.raw` dilarang | [eslint:RAW_WRITE_SQL_RULES] [eslint:RAW_QUERY_RULES] [eslint:SQL_RAW_RULES] |
| R30 | Transaksi tidak disimpan di variabel atau di-destructure | [eslint:TX_ALIAS_RULES] |
| R31 | `@Transactional()` hanya di service | [eslint:TRANSACTIONAL_RULES] |
| R32 | `TransactionHost` hanya di repository / `*.queries.ts` | [eslint:TX_HOST_IMPORT_PATTERN] [depcruise:transaction-host-only-in-repositories] |
| R33 | `recordChanges` hanya di `src/database/` | [eslint:MODULE_IMPORT_PATTERNS] [depcruise:record-changes-only-in-database] |
| R34 | Modul tidak menyentuh koneksi DB (`db`, `sqlClient`, `connection.ts`) | [eslint:MODULE_SYNTAX_RULES] [eslint:MODULE_IMPORT_PATTERNS] [depcruise:no-module-direct-db-connection] |
| R35 | Update / soft delete / restore / delete detail mengunci baris dan menulis `record_changes` dalam transaksi yang sama | [test:audited.repository] [test:base.repository] [test:child.repository] [test:data-layer] |
| R36 | Konflik unik → 409 (`isUniqueViolation()`), bukan 500 | [test:unique-violation] [test:data-layer] |
| R37 | Query baca kustom mulai dari `this.scoped(...)`; raw query menulis `deleted_at IS NULL` sendiri — bentuk query bebas, tidak bisa dicek AST | [review-only] |

### Autentikasi & Kanal Inbound

| ID | Aturan | Penegak |
|---|---|---|
| R38 | Default-deny `<base>/v1/*`; publik hanya `PUBLIC_ROUTES` | [test:default-deny.e2e] [test:public-routes] [test:authenticate] |
| R39 | Otorisasi per route `requireRole` / `requireSelfOrRole` → 403 `ERR_ROLE_FORBIDDEN`, terdokumentasi di OpenAPI | [test:require-role] [test:openapi.e2e] |
| R40 | Refresh token hanya di cookie HttpOnly, dirotasi; reuse mencabut seluruh family | [test:auth.service] [test:auth.e2e] [test:auth] |
| R41 | Endpoint ber-cookie memakai `csrfProtection()` | [test:csrf] [test:auth.e2e] |
| R42 | Route partner hanya lewat `partnerAuth()` (signing v1, IP, `allowed_routes`, nonce, rate limit), juga bila membawa bearer token | [test:partner-auth] [test:default-deny.e2e] [test:partner] |
| R43 | Helper per kanal: `currentPartner` / `requirePartner` hanya di `*.partner.*`, `requireRole` / `requireSelfOrRole` / `currentUser` tidak di sana, keduanya tidak di `*.webhook.*` | [eslint:local/inbound-channel] |
| R44 | Router kanal hanya di prefix-nya (`*.partner.routes.ts` di `/v1/partner`, `*.webhook.routes.ts` di `/webhooks`) | [test:structure] |
| R45 | Verifier webhook hanya diimpor `app.ts`; prefix webhook fail-closed (tanpa signature sah → 401) | [depcruise:webhook-verifier-only-in-app] [test:webhook-auth] [test:default-deny.e2e] |
| R46 | `bodyKeys: 'verbatim'` (casing vendor) hanya di file `*.webhook.*` | [eslint:local/inbound-channel] [test:validate] |
| R47 | Inbound idempoten: `webhook_events` unik `(vendor, event_id)`; penulisan partner unik `(partner_code, partner_reference)` — template `partner.md` / `webhook.md` membawanya, tetapi modul tulisan tangan tidak dicek | [script:verify:scaffold] [review-only] |
| R48 | Panduan partner (vektor signing, header, kode error) sama dengan kode | [test:partner-guide] |

### Integrasi Outbound

| ID | Aturan | Penegak |
|---|---|---|
| R49 | `HttpClientService` / `src/core/http` hanya di `src/integrations/`; controller tidak mengimpor integrasi | [depcruise:http-client-only-in-integrations] [depcruise:controller-no-integrations] [eslint:MODULE_SYNTAX_RULES] [eslint:MODULE_IMPORT_PATTERNS] |
| R50 | `fetch(`, `axios`, `node:http(s)` dan klien HTTP lain dilarang di `src/` kecuali `src/core/http/` | [eslint:OUTBOUND_HTTP_SYNTAX_RULES] [eslint:OUTBOUND_HTTP_IMPORT_PATTERN] |
| R51 | Integrasi tanpa route / controller, tidak bergantung pada modul, database, atau vendor lain | [depcruise:strict-integrations-isolation] [depcruise:no-cross-integration-deps] [depcruise:integrations-no-presentation] |
| R52 | Timeout wajib; kegagalan vendor di-mask (`ExternalServiceError`), status & body vendor tidak diteruskan, body hanya di log teredaksi | [tsc] [test:http-client.service] [test:vendor-body] |
| R53 | Satu entri `INTEGRATION_REGISTRY` per vendor (`error.origin` / `error.institution`) | [test:registry] |

### Cache

| ID | Aturan | Penegak |
|---|---|---|
| R54 | Redis hanya lewat `CacheService` (`redis.client` / `ioredis` dilarang di modul & integrasi) | [eslint:CACHE_CLIENT_IMPORT_PATTERN] [depcruise:redis-client-only-in-cache] |
| R55 | Fail-open, prefix otomatis, `FLUSHALL` / `FLUSHDB` / `KEYS` diblokir, `increment` / `setIfAbsent` atomik | [test:cache.service] [test:redis.client] [test:redis] |
| R56 | Key dari `CACHE_KEYS` — string key tidak bisa dibedakan dari string lain oleh AST | [review-only] |

### Konfigurasi & Platform

| ID | Aturan | Penegak |
|---|---|---|
| R57 | `process.env` di `src/` hanya `env-source.ts` | [eslint:no-process-env] |
| R58 | Setiap grup config divalidasi Zod saat start (gagal = nama variabel, tanpa nilai); nama lama di `RENAMED_ENV_VARS` ditolak | [test:config] [test:parse-env] |
| R59 | `console.*` dilarang; log terstruktur dengan redaksi | [eslint:no-console] [test:logger] |
| R60 | `X-Request-ID` diterima hanya dengan format aman; request context per request | [test:request-id.util] [test:request-context] |
| R61 | Nilai yang membawa nama proyek terdaftar di `IDENTITY_RULES`; registrasi contoh di `EXAMPLE_MODULES` | [script:lint:setup] |
| R62 | Health `UP` / `DEGRADED` / `DOWN`; readiness 503 hanya bila DB mati | [test:health.e2e] [test:health.service] |

### Testing, Gate & Alur Kerja

| ID | Aturan | Penegak |
|---|---|---|
| R63 | Coverage di atas `THRESHOLDS`; setiap file `src/` dimuat test; pengecualian hanya `COVERAGE_EXCLUSIONS` beralasan | [script:test:cov] |
| R64 | Test hermetik (tanpa DB / Redis asli); `mock.module()` dilarang | [test:hermetic-env] [eslint:TEST_SYNTAX_RULES] |
| R65 | Suite integrasi: tanpa `.rejects` / `.resolves` / `spyOn` / `mock`; jalan di CI | [eslint:INTEGRATION_TEST_RULES] [ci:integration] |
| R66 | `eslint-disable` sempit dan beralasan (`-- <alasan>`) | [eslint:@eslint-community/eslint-comments/require-description] [eslint:@eslint-community/eslint-comments/no-unused-disable] |
| R67 | Setiap varian template `scaffold-module` lolos semua gate | [script:verify:scaffold] [ci:verify] |
| R68 | CONTRIBUTING menyebut setiap script, folder test, helper, modul, dan perintah; label di dokumen ini valid | [test:docs-sync] |
| R69 | Setiap skill `.agents` punya wrapper `.claude` dengan name + description yang sama | [test:agent-skills] |
| R70 | File `.env` aktif tidak dibaca AI agent (kecuali `.env.example`) | [hook:.claude/hooks/protect-env.mjs] |
| R71 | Pesan commit Conventional Commits; nama branch `<type>/<slug>` | [hook:.husky/commit-msg] [script:lint:branch] [ci:verify] |
| R72 | Migrasi hasil generate tetap sesuai penjaga SQL | [test:migrations] |

---

## 13. Manifest Konfigurasi

Konfigurasi tooling **tidak disalin** ke dokumen ini; sumber kebenarannya file di root repo:

| File | Menegakkan | Dijalankan oleh |
|---|---|---|
| `tsconfig.json` | TypeScript strict | `bun run typecheck`, pre-commit |
| `eslint.config.mjs` | Grup `no-restricted-syntax` / `no-restricted-imports` per area (komposisi grup di bagian atas file), `local/inbound-channel`, naming, `eslint-comments` | `bun run lint`, lint-staged |
| `.dependency-cruiser.cjs` | Batas lapisan & aliran modul | `bun run lint:arch` |
| `.ls-lint.yml` | Nama folder & file satu titik | `bun run lint:ls`, pre-commit |
| `knip.json` | File, export, dependency tak terpakai | `bun run lint:deps` |
| `scripts/check-coverage.ts` | Ambang coverage (`THRESHOLDS`) | `bun run test:cov` |
| `bunfig.toml` | Preload test hermetik | `bun test` |
| `scripts/setup.ts` | `IDENTITY_RULES`, `EXAMPLE_MODULES` | `bun run setup`, `bun run lint:setup` |
| `.husky/*` | pre-commit, commit-msg, pre-push | Git |
| `commitlint.config.ts` | Conventional Commits (type, panjang header) | commit-msg, CI |
| `.validate-branch-namerc.json` | `<type>/<slug>` + branch environment | `bun run lint:branch`, CI |
| `.prettierrc`, `.prettierignore` | Format `*.ts` (Markdown dikecualikan) | `bun run format:check` |
| `.github/workflows/ci.yml` | Job `verify` + `integration` | GitHub Actions |
| `drizzle.config.ts` | Migrasi dari schema `public` | `bun run db:generate` |
| `.claude/settings.json`, `.claude/hooks/protect-env.mjs` | Proteksi `.env` untuk Claude Code | Claude Code |

Contoh pelanggaran per aturan dan cara memperbaikinya: [CONTRIBUTING.md](CONTRIBUTING.md).
