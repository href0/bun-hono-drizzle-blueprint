# Architecture Blueprint — Pengangkut Udara Backend

> **Document Type**: Technical Architecture Document (TAD) / Software Architecture Document (SAD)
> **Target Audience**: Software Architects, Tech Leads, Backend Engineers, AI Coding Agents
> **Status**: APPROVED — PRODUCTION REFERENCE
> **Scope**: Arsitektur `pengangkut-udara-backend` (LNSW). Polanya dirancang reusable untuk backend NestJS / PostgreSQL / Redis lain; bagian yang spesifik LNSW (SSO INSW, K/L) ditandai jelas.

Dokumen ini menjelaskan **apa dan mengapa** setiap keputusan arsitektur. Detail implementasi, contoh kode lengkap, dan daftar aturan ada di sumbernya masing-masing — blueprint tidak menyalinnya agar tidak basi:

| Topik | Sumber detail |
|---|---|
| Aturan kode, contoh, aturan yang ditegakkan mesin | `CONTRIBUTING.md` |
| Standar database (jenis tabel, repository, audit) | `.agents/skills/database-standards/` (+ CONTRIBUTING _Database & Drizzle_) |
| Template modul | `.agents/skills/scaffold-module/SKILL.md` |
| Kontrak partner (signing v1) | `docs/partner-integration-guide.md` |
| Operasional tabel audit | `docs/runbooks/partition-record-changes.md` |
| Rencana & log keputusan | `docs/plans/2026-10-03-setup-hardening-plan.md` |

---

## 1. Executive Summary

### 1.1 PRD vs Architecture Blueprint

| Dimensi | Product Requirements Document (PRD) | Architecture Blueprint |
|---|---|---|
| **Fokus** | **WHAT** — apa yang dibangun untuk pengguna bisnis | **HOW** — bagaimana sistem dibangun secara teknis |
| **Konten** | User personas, user stories, acceptance criteria, wireframes | Layering, transaksi, kontrak API, keamanan, quality gates |
| **Pemilik** | Product Manager / Business Analyst | Lead Architect / Tech Lead |

### 1.2 Pilar Arsitektur

```
├── [1] Pure Controllers & Kontrak Seragam → data murni; envelope, snake_case 2 arah & i18n otomatis
├── [2] Strict Layer Isolation              → Controller → Service → Repository (dependency-cruiser)
├── [3] Declarative ACID Tx                 → @Transactional() di Service + TransactionHost di Repository
├── [4] Audited Multi-Schema Data Layer     → domain (CRUD) vs referensi (read-only); setiap perubahan tercatat
├── [5] Zero-Trust Access                   → SSO INSW (user) & HMAC v1 (partner K/L) di guard global
├── [6] Zero-Trust Configuration            → tanpa process.env; ConfigFactory tervalidasi Zod
├── [7] Resilient & Observable Platform     → Redis fail-open, Pino + request ID, health UP/DEGRADED/DOWN
└── [8] Machine-Enforced Quality Gates      → ESLint, ls-lint, depcruise, knip, coverage, Sonar, hooks, skills AI
```

### 1.3 Tech Stack Baseline

| Layer | Teknologi | Standar & Ketentuan |
|---|---|---|
| **Runtime** | Node.js >= 24 | TypeScript `nodenext` (import `.js`), output CommonJS |
| **Framework** | NestJS 11 | Modular monolith, Express adapter |
| **Language** | TypeScript 5 | `strict: true`, `noUnusedLocals`, `noImplicitReturns` |
| **ORM** | Drizzle ORM | Code-first schema, typed SQL |
| **Database** | PostgreSQL 16 | Multi-schema, driver `postgres`, sesi `timezone=UTC` |
| **Date & Time** | Temporal (`temporal-polyfill`) + runtime UTC | Instant `timestamptz` / ISO UTC, tanggal `date`, zona IANA |
| **Cache & Locks** | DragonFly (protokol Redis, standalone) | `ioredis`, fail-open, namespace otomatis |
| **Auth** | SSO INSW (token opaque, introspeksi) + HMAC v1 | Guard global; hasil introspeksi & ACL di-cache Redis |
| **Validation** | Zod + `nestjs-zod` | DTO class via `createZodDto` |
| **Logger** | `nestjs-pino` | JSON (Grafana Loki), redaksi data sensitif, request ID |
| **HTTP Client** | `@nestjs/axios` | `HttpClientService` terpusat, timeout wajib, error vendor di-mask |
| **Quality Gates** | ESLint 9, ls-lint, depcruise, knip, SonarQube | Coverage global 95 (branches 90), per file 90 (branches 80) |

---

## 2. Directory Anatomy & Layer Boundaries

### 2.1 Struktur Direktori

```
<project-root>/
├── .agents/                        # Aturan & skills AI agent (AGENTS.md, skills/*) — lihat §11
├── .claude/                        # Wrapper skills Claude Code + hook proteksi .env
├── docs/                           # Panduan partner, runbook, rencana & log keputusan
├── drizzle/                        # Artefak migrasi drizzle-kit (+ init-schemas.sql)
├── src/
│   ├── app.module.ts               # Root module: config, logger, CLS, guard global
│   ├── app.setup.ts                # configureApp(): pipeline HTTP bersama (main.ts & e2e) — §3.1
│   ├── main.ts
│   ├── modules/                    # Semua resource aplikasi
│   │   ├── <feature>/              # Modul domain: dto/, controller, service, repository, mapper, module
│   │   ├── auth/                   # AuthGuard global (SSO INSW + ACL) — §4
│   │   ├── external-<vendor>/      # Klien outbound K/L (external-insw: SSO & ACL) — §8
│   │   ├── partner-credential/     # Gateway inbound K/L: PartnerGuard, audit, kredensial — §9
│   │   └── health/                 # /api/health, readiness, liveness — §7.5
│   ├── common/                     # Building block lintas domain (tidak boleh impor modules/)
│   │   ├── cache/                  # CacheService, CACHE_KEYS/PREFIX/TTL, redis.provider
│   │   ├── constants/              # APP_ERROR_CODES, CLS_KEYS, token injeksi
│   │   ├── decorators/             # @ApiStandardResponse, @Public, @AdminOnly, @RequireAcl, @PartnerAuth,
│   │   │                           #   @CurrentUser, @CurrentPartner, @PreserveKeys, @ResponseMessage
│   │   ├── dto/                    # PaginationQueryDto, UuidParamDto, UuidChildParamDto, NumericIdParamDto,
│   │   │                           #   IdParamDto, datetime.dto (instantInput/Output, calendarDateField, …)
│   │   ├── exceptions/             # App*Exception, ExternalServiceException
│   │   ├── filters/                # HttpExceptionFilter (envelope error)
│   │   ├── guards/                 # Guard generik (AuthGuard & PartnerGuard ada di modulnya)
│   │   ├── http/                   # HttpClientService (Axios, timeout, masking error vendor)
│   │   ├── i18n/                   # I18N_MESSAGES {id, en} + resolver Accept-Language
│   │   ├── interceptors/           # TransformInterceptor (envelope sukses + snake_case)
│   │   ├── interfaces/             # AuthUser, PartnerIdentity, PaginatedResult
│   │   ├── logger/                 # Opsi Pino (redaksi, serializer)
│   │   ├── middleware/             # requestIdMiddleware
│   │   └── pipes/                  # SnakeToCamelPipe (kontrak request snake_case)
│   ├── config/                     # app, database, redis, insw, partner (*.config.ts, Zod)
│   ├── utils/                      # Fungsi murni: datetime, uuid, actor, crypto, partner-signature,
│   │                               #   record-diff, case-converter, parse-env, request-id, locale, …
│   └── database/
│       ├── audited.repository.ts   # Mesin bersama: lock baris + record_changes
│       ├── base.repository.ts      # BaseRepository: tabel mandiri/header (soft delete)
│       ├── child.repository.ts     # ChildRepository: tabel detail (hard delete + snapshot)
│       ├── database.module.ts / database.provider.ts
│       ├── schema/                 # schemas.ts, columns.ts, pengangkut-udara/, referensi/, access-tools/
│       └── seeds/
├── test/                           # E2E (*.e2e-spec.ts), helpers (drizzle-chain), setup
├── Dockerfile / docker-compose.yml # Container (TZ=UTC) & stack lokal (Postgres 16 + DragonFly)
└── eslint.config.mjs, .dependency-cruiser.cjs, .ls-lint.yml, knip.json, … — §10
```

### 2.2 Batas Lapisan (dependency-cruiser, `npm run lint:arch`)

| Aturan | Isi |
|---|---|
| `no-circular` | Tidak ada dependensi melingkar |
| `no-orphans` | Tidak ada file yatim (kode mati) |
| `strict-utils-isolation` | `src/utils/` tidak mengimpor `@nestjs/*`, `modules/`, `common/`, `database/` |
| `strict-common-isolation` | `src/common/` tidak mengimpor `modules/` |
| `strict-schema-isolation` | `database/schema/` tidak mengimpor `modules/`, `common/`, `config/` |
| `strict-constants-isolation` | `common/constants` & `common/i18n` hanya nilai murni (tanpa database/modules/Nest) |
| `controller-no-db` | Controller tidak mengimpor `src/database/**` atau `*.repository.ts` |
| `no-cross-module-repository` | Repository bersifat privat modul |
| `no-cross-module-internals` | Antar modul hanya lewat `*.module.ts` / `*.service.ts` / `*.decorator.ts` |
| `common-no-domain-schema` | `common/` tidak bergantung pada tabel domain |
| `partner-no-import-external` | Modul inbound partner tidak terikat ke modul outbound `external-*` |

### 2.3 Aturan Ekstensi Import (`moduleResolution: nodenext`)

1. File lokal **wajib** berekstensi `.js` (`import { X } from './x.service.js'`).
2. Paket npm **tanpa** ekstensi (`import { eq } from 'drizzle-orm'`).
3. JSON memakai `with { type: 'json' }`.

---

## 3. HTTP Layer & Kontrak API (Frontend-First)

### 3.1 Pipeline HTTP (`configureApp()` di `src/app.setup.ts`)

Satu fungsi dipakai `main.ts` **dan** test e2e, sehingga test menguji pipeline yang sama dengan produksi:

```
1. useLogger(PinoLogger)           7. CORS allowlist (CORS_ORIGINS; kosong = mati)
2. enableShutdownHooks()           8. setGlobalPrefix('api') + versioning URI (/api/v1/…)
3. trust proxy = TRUST_PROXY_HOPS  9. pipes: SnakeToCamelPipe → ZodValidationPipe
4. requestIdMiddleware            10. TransformInterceptor (envelope sukses)
5. helmet()                       11. HttpExceptionFilter (envelope error)
6. body JSON ≤ HTTP_BODY_LIMIT    12. Swagger (non-production), schema snake_case
   (lebih besar → 413)
```

Guard global (`AuthGuard`, `PartnerGuard`) dan `PartnerAuditInterceptor` didaftarkan lewat `APP_GUARD` / `APP_INTERCEPTOR` di modulnya.

### 3.2 Kontrak snake_case Dua Arah

- DTO ditulis **camelCase**; client mengirim dan menerima **snake_case**.
- `SnakeToCamelPipe` (sebelum Zod) mengonversi key body/query dan **menolak** key non-snake_case (camelCase, PascalCase, kebab-case) dengan 400 `VALIDATION_ERROR`. Field kamus bebas memakai `@PreserveKeys()`.
- `TransformInterceptor` mengonversi respons ke snake_case; Swagger ditampilkan dalam snake_case (`toSnakeCaseOpenApi()`).
- Konversi casing manual dilarang. Controller me-return **response DTO lewat mapper** — entity DB tidak pernah keluar dari service.

### 3.3 Envelope Sukses

```json
{
  "success": true,
  "status_code": 200,
  "message": "Data berhasil diambil",
  "data": { "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e", "flight_number": "GA-101" },
  "meta": { "current_page": 1, "per_page": 10, "total_items": 42, "total_pages": 5 }
}
```

`meta` hanya untuk list terpaginasi. Pesan dwibahasa lewat opsi `message` di `@ApiStandardResponse` / `@ApiStandardPaginatedResponse` (sekaligus deskripsi Swagger "id / en").

### 3.4 Envelope Error

```json
{
  "success": false,
  "status_code": 400,
  "message": "Validasi data gagal. Silakan periksa kembali input Anda",
  "error": {
    "type": "VALIDATION_ERROR",
    "code": "ERR_INVALID_INPUT",
    "origin": "APP",
    "details": [{ "field": "flight_number", "message": "Required" }]
  },
  "request_id": "0192f1d0-…",
  "timestamp": "2026-10-04T03:00:00.000Z"
}
```

- `error.type`: `VALIDATION_ERROR` · `BAD_REQUEST` · `UNAUTHORIZED` · `FORBIDDEN` · `NOT_FOUND` · `TOO_MANY_REQUESTS` · `SERVICE_UNAVAILABLE` · `EXTERNAL_SERVICE_ERROR` · `INTERNAL_SERVER_ERROR` (409 sengaja dipetakan ke `BAD_REQUEST`).
- `error.code` hanya dari `APP_ERROR_CODES` (literal `'ERR_*'` dilarang — ESLint).
- `origin`: `APP` atau K/L (`INSW`, `BEA_CUKAI`, `SINKARKES`, `DJPU`, `BARANTIN`, `IMIGRASI`); untuk K/L ditambah `institution` dari `EXTERNAL_SERVICE_REGISTRY`.
- `details[].field` dalam snake_case, prefix internal (`body.`, `query.`) dibuang.
- Pesan mengikuti `Accept-Language: id` (default) / `en`.

### 3.5 Exception Bertipe

Exception bawaan NestJS / `HttpException` dilarang di luar `common/exceptions` & `filters` (ESLint). Pesan wajib dwibahasa (`I18N_MESSAGES` / `{ id, en }`).

| Class | HTTP | `error.type` |
|---|---|---|
| `AppBadRequestException` | 400 | `BAD_REQUEST` |
| `AppUnauthorizedException` | 401 | `UNAUTHORIZED` |
| `AppForbiddenException` | 403 | `FORBIDDEN` |
| `AppNotFoundException` | 404 | `NOT_FOUND` |
| `AppConflictException` | 409 | `BAD_REQUEST` |
| `AppTooManyRequestsException` | 429 | `TOO_MANY_REQUESTS` |
| `AppServiceUnavailableException` | 503 | `SERVICE_UNAVAILABLE` |
| `ExternalServiceException` | 502/504 | `EXTERNAL_SERVICE_ERROR` |

### 3.6 Input DTO

- `@Body('x')` / `@Query('x')` / `@Param('x')` dilarang (ESLint); wajib class `createZodDto`.
- Param: `UuidParamDto` (`:id` UUID v7 — format salah → 400, bukan error SQL 500), `UuidChildParamDto` (`:id` + `:childId` untuk detail di bawah header), `NumericIdParamDto` (tabel log/history `bigint`), `IdParamDto` (kode string lain).
- Field waktu wajib dari `common/dto/datetime.dto.ts` (§3.8).

### 3.7 Route & Versioning

- URI versioning: `@Controller({ path: '<plural-kebab>', version: '1' })` → `/api/v1/<resources>`; health memakai `VERSION_NEUTRAL`.
- Noun jamak, kebab-case, tanpa kata kerja.
- Maksimal 2 level hirarki, dan level kedua **hanya** untuk detail milik header: `/<headers>/:id/<details>[/:childId]`. Lebih dalam → resource top-level baru.
- Breaking change pada endpoint aktif → versi baru (lihat CONTRIBUTING _Breaking Change Policy_).

### 3.8 Tanggal & Waktu

Tiga jenis, tidak dicampur: **instant** (`*_at`, `timestamptz`, API ISO 8601 UTC `Z`; request wajib ber-offset), **tanggal kalender** (`*_date`, `date`, `YYYY-MM-DD`), **jadwal lokal** (instant + zona IANA `*_timezone`). Runtime Node (`TZ=UTC`) & sesi DB di UTC; "per hari" selalu dengan zona eksplisit (`dayRangeInZone`); jam lokal → instant lewat `wallTimeToInstant` (DST ambigu ditolak). API waktu lokal `Date` dan `new Date('string')` dilarang (ESLint). Detail: CONTRIBUTING _Standar Tanggal & Waktu_.

---

## 4. Authentication & Access Control (spesifik LNSW)

Dua jenis pemanggil, dua guard global — controller tidak menulis boilerplate auth:

| Pemanggil | Guard | Mekanisme | Actor (CLS) |
|---|---|---|---|
| Pengguna (FE) | `AuthGuard` | Token SSO INSW **opaque** (bukan JWT) + ACL INSW | `user:<userId>` |
| Sistem K/L (inbound) | `PartnerGuard` | HMAC-SHA256 signing v1 (§9) | `partner:<code>` |
| Tanpa request (job) | — | — | `system` |

### 4.1 Alur `AuthGuard`

```
Request
 ├─ @Public()                → lolos (health, dsb.)
 ├─ @PartnerAuth()           → diserahkan ke PartnerGuard
 └─ lainnya:
     1. Header Authorization wajib                         (tidak ada → 401)
     2. Introspeksi token: GET {INSW_SSO_URL}/api/v1/auth/token
        - cache Redis key = SHA-256 token, TTL = min(5 menit, sisa umur token)
        - scope `ssm_pengangkut` wajib                      (tidak ada → 403)
        - SSO menolak → 401; SSO down/kontrak rusak → error origin INSW
     3. request.user = AuthUser; CLS actor = user:<userId>  (dipakai created_by / record_changes)
     4. @AdminOnly() → hanya grup admin (ADMIN_GROUPS)      (bukan admin → 403)
     5. ACL: GET {INSW_ACL_URL}/menu/v2/user/acl (cache 1 jam)
        - admin → akses penuh
        - @RequireAcl('/url') bila diset, selain itu baseline otomatis:
          /ssm-pengangkut, /data-set/keberangkatan, /data-set/kedatangan  (tidak cocok → 403)
```

Baseline ACL dicek di infrastruktur — `@RequireAcl()` tidak ditulis berulang untuk izin default. Pengujian tidak memanggil SSO asli: unit test me-mock `HttpClientService`; E2E (F6) men-stub HTTP SSO/ACL di batas jaringan.

---

## 5. Data Layer (Database Standards)

Sumber standar lengkap & template terverifikasi: skill **`database-standards`** (wajib dibaca AI agent sebelum pekerjaan database apa pun).

### 5.1 Multi-Schema

| Schema | Akses | Deklarasi | Migrasi |
|---|---|---|---|
| `pengangkut_udara` | CRUD lewat repository | `pengangkutUdara.table(...)` | drizzle-kit (`schemaFilter`) |
| `referensi`, `access_tools` | **Read-only** | `.view(...).existing()` → tulis = error `tsc` | Tidak |

`pgSchema` hanya di `schema/schemas.ts`; kolom hanya lewat helper `schema/columns.ts`.

### 5.2 Jenis Tabel

| Jenis | Ciri | Kolom kunci | Repository |
|---|---|---|---|
| Mandiri | Berdiri sendiri | `uuidPrimaryKey` (UUID v7) + `timestamps` + `auditColumns` + `softDelete` | `BaseRepository` |
| Header | Mandiri yang punya detail | sama | `BaseRepository` + `ChildRepository` di modul yang sama |
| Detail | Hanya bermakna di dalam satu header | `parentReference` **+ index**, tanpa `softDelete` | `ChildRepository` |
| Pencatatan | Log/history, append-only, volume besar | `sequentialPrimaryKey` (bigint identity) + `timestamps` | Repository biasa (insert + select) |
| Referensi | Milik sistem lain | view `.existing()` | Tanpa repository (read-only service) |

Kolom waktu lain hanya `instant()` / `calendarDate()` / `timeZoneColumn()`; nilai unik yang boleh dipakai ulang setelah dihapus → `activeUniqueIndex()`.

### 5.3 Repository & Transaksi

```
Service @Transactional()  ──►  Repository (TransactionHost.tx)  ──►  PostgreSQL
   commit / rollback otomatis       join tx aktif atau pool
```

- `@Transactional()` hanya di service; `TransactionHost` hanya di repository; `DRIZZLE_TOKEN` hanya di service read-only (ESLint).
- `BaseRepository`: baris soft-deleted tersembunyi (`scoped()`), `created_by` / `updated_by` dari actor CLS, `softDeleteById` / `restoreById`; tidak ada hard delete header.
- `ChildRepository`: setiap method menerima id header (cegah IDOR), mengunci header aktif dulu (urutan kunci konsisten → tanpa deadlock), hard delete + snapshot, `syncForParent` untuk menyimpan daftar lengkap dari form, memperbarui `updated_at` header.

### 5.4 Audit Perubahan (`record_changes`)

- Setiap UPDATE (kolom yang berubah saja) / SOFT_DELETE / RESTORE / DELETE (snapshot) ditulis base class **dalam transaksi yang sama** (`SELECT … FOR UPDATE` → tulis → catat), dengan actor & request ID. INSERT tidak dicatat (baris membawa `created_*`).
- Kolom sensitif → opsi `redact` (nilai `[REDACTED]`, fakta perubahan tetap tercatat).
- Satu tabel generik, **partition-ready** (PK `(id, changed_at)`, tanpa FK/unique lain, id `bigserial`) — konversi ke partisi bulanan & retensi: `docs/runbooks/partition-record-changes.md`. Masa retensi menunggu ketentuan LNSW.
- Tidak bisa dilewati (ESLint): `.update(` / `.delete(` di repository modul, penulisan DB di luar repository, raw SQL `UPDATE` / `DELETE FROM`, menulis `recordChanges` langsung. Seeder dikecualikan.

### 5.5 Raw SQL

Query builder dulu. Raw SQL hanya untuk yang tidak bisa diekspresikan (window function, recursive CTE, JOIN lintas schema kompleks), selalu lewat template `` sql`…` `` (parameterized; `sql.raw()` dengan input dilarang), di fungsi murni `[name].queries.ts`, **baca saja**, dan wajib menulis `deleted_at IS NULL` sendiri.

### 5.6 Konvensi Pengujian Schema

`schema-conventions.spec.ts` menjalankan aturan pada setiap tabel yang diekspor: setiap FK punya index, `record_changes` tetap partition-ready. `schemas.spec.ts` membuktikan view referensi tidak bisa ditulis.

---

## 6. Distributed Caching (Redis Fail-Open)

Infrastruktur di `src/common/cache/` (DragonFly standalone, protokol Redis).

1. Pakai `CacheService`, bukan `ioredis` / `REDIS_CLIENT` langsung (token tidak di-export).
2. Key hanya dari generator `CACHE_KEYS` dengan prefix terdaftar di `CACHE_PREFIX`; TTL di `CACHE_TTL`.
3. Prefix global `<REDIS_CLIENT_ID>:<NODE_ENV>:` otomatis — jangan menambah namespace manual.
4. **Fail-open**: Redis down/timeout → fetcher DB tetap dipanggil; request tidak boleh gagal karena cache. Readiness melaporkan `DEGRADED`, bukan unready.
5. Reconnect tanpa batas (backoff maks. 30 detik), offline queue mati, command > `REDIS_COMMAND_TIMEOUT_MS` dianggap gagal.
6. Negative caching untuk lookup dari input tak tepercaya (`getOrSet(..., { negativeTtl })`); penulisan `SET … EX` atomik; `increment` atomik (Lua) untuk rate limit.
7. `FLUSHALL`, `FLUSHDB`, `KEYS` diblokir di provider.

```typescript
return this.cache.getOrSet(CACHE_KEYS.userDetail(id), CACHE_TTL.USER_DETAIL, () =>
  this.repo.findById(id),
);
```

---

## 7. Observability, Konfigurasi & Platform

### 7.1 Logging (`nestjs-pino`)

- `console.*` dan `Logger` NestJS dilarang (ESLint); inject `@InjectPinoLogger(Class.name)`.
- Format `logger.info({ field }, 'pesan')` — objek dulu, pesan statis kedua.
- Redaksi otomatis (`LOG_REDACT_PATHS`): key sensitif (`password`, `token`, `apiKey`, `secret`, `nik`, …) di kedalaman 1–2, header `authorization`, `cookie`, `x-partner-key`, `x-partner-signature`. Serializer request hanya `id`, `method`, `url`.

### 7.2 Request ID & Konteks (CLS)

`requestIdMiddleware` menerima `X-Request-ID` dari gateway bila formatnya aman (`^[A-Za-z0-9._:-]{1,128}$`), selain itu UUID baru; dikembalikan di header respons dan dipakai log, CLS, envelope error, audit partner, `record_changes`, dan request outbound. Actor request (`user:` / `partner:` / `system`) disimpan di CLS oleh guard.

### 7.3 Konfigurasi (`src/config/`)

- `process.env` hanya di `src/config/*.config.ts` (+ bootstrap) — ESLint `no-process-env`.
- Satu file per grup, divalidasi Zod lewat `parseEnv` (aplikasi gagal start dengan pesan jelas bila salah):
  `app` (NODE_ENV, PORT, LOG_LEVEL, TRUST_PROXY_HOPS, CORS_ORIGINS, HTTP_BODY_LIMIT), `database` (DATABASE_URL, pool), `redis`, `insw` (SSO & ACL URL/timeout), `partner` (toleransi HMAC, keyring secret).
- Injeksi bertipe: `@Inject(appConfig.KEY) config: ConfigType<typeof appConfig>`.

### 7.4 Keamanan Platform

`helmet()`; CORS hanya untuk `CORS_ORIGINS` (kosong = mati); IP klien = `request.ip` dengan `TRUST_PROXY_HOPS` (bukan `X-Forwarded-For` mentah); batas body `HTTP_BODY_LIMIT` (413); file `.env` aktif tidak pernah dibaca AI agent (§11).

### 7.5 Health

| Endpoint | Untuk | Perilaku |
|---|---|---|
| `GET /api/health` | Dashboard | Selalu 200; status `UP` / `DEGRADED` (Redis down) / `DOWN` (DB down) |
| `GET /api/health/readiness` | Kubernetes readiness | 503 hanya bila database down |
| `GET /api/health/liveness` | Kubernetes liveness | Proses hidup |

### 7.6 Container

`Dockerfile` multi-stage Node 24, user non-root, `TZ=UTC`. `docker-compose.yml` untuk lokal: PostgreSQL 16 + DragonFly.

---

## 8. Outbound Integration (`src/modules/external-<vendor>/`)

- Klien SDK murni (egress) per K/L; tidak boleh di modul fitur, `auth/`, atau `common/`.
- Semua panggilan lewat `HttpClientService` (axios langsung & `fetch()` dilarang — ESLint): timeout wajib, request ID diteruskan, header tidak di-log.
- Error jaringan/timeout/4xx/5xx vendor → `ExternalServiceException` dengan `origin` K/L; status & body vendor **tidak** diteruskan ke client.
- Konfigurasi di `src/config/<vendor>.config.ts` (Zod).
- Bila vendor memakai login, token jangka pendek di-cache dan di-refresh sebelum kedaluwarsa.
- Contoh: `external-insw` (introspeksi SSO & ACL, dipakai `AuthGuard`).
- Retry & circuit breaker: **belum ada** — direncanakan di Fase 8.

---

## 9. Inbound Partner Gateway (`src/modules/partner-credential/`)

Endpoint yang dipanggil sistem K/L diberi `@PartnerAuth()`; `PartnerGuard` dan `PartnerAuditInterceptor` bersifat global. Spesifikasi untuk partner: `docs/partner-integration-guide.md`.

### 9.1 Alur `PartnerGuard` (signing v1)

```
1. Header wajib: x-partner-key, x-partner-timestamp, x-partner-nonce, x-partner-signature   → 401
2. Drift timestamp ≤ PARTNER_HMAC_TOLERANCE_MS (default 5 menit)                             → 401 REPLAY_REJECTED
3. Kredensial dicari by SHA-256(api key) (cache Redis), wajib aktif                           → 401
4. IP whitelist: request.ip (TRUST_PROXY_HOPS) vs IP/CIDR terdaftar (kosong = semua)          → 403 IP_FORBIDDEN
5. Route ACL: allowed_routes (tanpa `/*` = exact; `/x/*` = x dan turunannya)                   → 403 ROUTE_FORBIDDEN
6. Signature: HMAC-SHA256 (hex) atas
   v1\n<timestamp>\n<nonce>\n<METHOD>\n<path>\n<canonicalQuery>\n<sha256(rawBody)>, timing-safe → 401 SIGNATURE_INVALID
7. Nonce sekali pakai: Redis SET NX (fail-open)                                               → 401 REPLAY_REJECTED
8. Rate limit fixed window per menit: increment atomik (fail-open)                            → 429 + Retry-After
9. CLS actor = partner:<code>; PartnerAuditInterceptor mencatat satu event `audit: "partner"`
   (ALLOWED / REJECTED / ERROR) dengan request ID, durasi, status
```

Penegakan IP whitelist wajib di production: backlog.

### 9.2 Penyimpanan Kredensial

- API key disimpan sebagai hash SHA-256 (`api_key_hash`) + prefix tampilan (`api_key_prefix`).
- Secret HMAC dienkripsi AES-256-GCM (IV 12 byte acak) dengan keyring `PARTNER_SECRET_KEYS` + `PARTNER_SECRET_ACTIVE_KEY_ID`; format `v1.<keyId>.<iv>.<tag>.<ciphertext>`; key lama tetap bisa mendekripsi (rotasi tanpa putus).
- API key & secret plaintext hanya ditampilkan sekali (create/rotasi). Endpoint admin `@AdminOnly()`; respons lewat mapper (tidak pernah entity).
- Tabel `pengangkut_udara.partner_credentials`: `id` (UUID v7), `partner_code` (unik permanen, termasuk yang terhapus), `partner_name`, `api_key_hash`, `api_key_prefix`, `encrypted_secret`, `ip_whitelist`, `allowed_routes`, `rate_limit_rpm`, `is_active`, timestamps, `created_by` / `updated_by`, `deleted_at`. Perubahan tercatat di `record_changes` dengan hash & ciphertext di-redact.

---

## 10. Quality Gates & Testing

### 10.1 Lapisan Gate

```
pre-commit   lint-staged (ESLint --fix, Prettier) · tsc --noEmit · ls-lint
commit-msg   commitlint (Conventional Commits, scope kebab-case)
pre-push     validate-branch-name · depcruise · knip · unit test
CI (GitLab)  lint · typecheck · ls-lint · depcruise · knip · npm audit (produksi) ·
             unit + coverage (JUnit/Cobertura ke MR) · e2e · build
             SonarQube lewat pipeline template LNSW yang di-include (verifikasi: keputusan D12)
```

Sebelum pekerjaan dinyatakan selesai: `npm run validate:full` dan `npm run build`.

### 10.2 Ambang & Aturan

| Parameter | Ambang |
|---|---|
| Coverage (SSOT jest) | Global lines/functions/statements 95, branches 90; per file 90, branches 80 |
| Duplikasi (Sonar) | < 3% |
| Complexity | Cognitive & cyclomatic ≤ 15 |
| Secret hardcoded | 0 |

### 10.3 Strategi Test

| Layer | Lokasi | Infrastruktur | Status |
|---|---|---|---|
| Unit | `src/**/*.spec.ts` | Mock (`createDrizzleChainMock`, `createTxHostMock`, `renderWhere` me-render SQL asli) | Aktif |
| E2E | `test/*.e2e-spec.ts` | App lewat `configureApp`, infrastruktur di-override | Aktif |
| Integration | `test/integration/*.int-spec.ts` | PostgreSQL 16 + DragonFly sekali pakai (CI `services:` / Testcontainers), SSO di-stub | Fase 6 |

Perilaku generik (soft delete, audit, sync detail, konvensi schema) diuji sekali di `src/database/`; spec modul hanya menguji logikanya sendiri.

---

## 11. AI Agent Governance

Aturan untuk AI coding agent adalah bagian dari arsitektur, bukan dokumentasi tambahan:

| Komponen | Peran |
|---|---|
| `.agents/AGENTS.md` (diimpor `CLAUDE.md`) | Aturan MANDATORY: layering, database, tanggal, i18n, Swagger, proteksi `.env`, review gate |
| `skills/project-standards` | Standar umum (struktur, kontrak, logging, cache, datetime) |
| `skills/database-standards` | Satu-satunya sumber standar DB + template header/detail terverifikasi |
| `skills/scaffold-module` | Template modul baru (lolos semua gate tanpa edit manual) |
| `skills/review-code` | Gate review sebelum pekerjaan dinyatakan selesai |
| `.claude/` (`settings.json`, hook) | Wrapper skills untuk Claude Code; `permissions.deny` + hook memblokir pembacaan `.env` aktif |

Agent tidak menjalankan perintah yang mengeksekusi ke database; eksekusi DB dilakukan developer.

---

## 12. Checklist Proyek & Modul Baru

### 12.1 Proyek baru dari blueprint ini

1. Salin konfigurasi tooling di §13 apa adanya.
2. Siapkan `src/config/*` (Zod + `parseEnv`), `common/` (envelope, filter, i18n, error codes, exceptions, cache, request ID, pipes), `database/` (schemas, columns, base repositories, `record_changes`).
3. Pipeline HTTP lewat satu `configureApp()` (§3.1), dipakai `main.ts` dan e2e.
4. Guard global untuk setiap jenis pemanggil (§4, §9); actor ke CLS.
5. `.agents/` + skills (§11).

### 12.2 Modul fitur baru

Ikuti skill `scaffold-module` (dan `database-standards` untuk tabel): tentukan jenis tabel → schema + re-export → DTO Zod → repository (`BaseRepository` / `ChildRepository`) → mapper → service (`@Transactional()` pada mutasi) → controller (`version: '1'`, `@ApiStandardResponse`) → module → spec → `npm run validate:full` + `npm run build`. Migrasi (`npm run db:generate`) diserahkan ke DBA sesuai alur di README.

---

## 13. Quality Gate Configuration Manifests

Konfigurasi tooling **tidak disalin** ke dokumen ini. Sumber kebenaran adalah file di root repo; untuk proyek baru, salin apa adanya.

| File | Menegakkan | Dijalankan oleh |
|---|---|---|
| `eslint.config.mjs` | Grup rule `no-restricted-syntax`/`no-restricted-imports` per area (DTO, exception, i18n, tx, DB write, datetime, …), naming, complexity + `sonarjs`, `eslint-comments` | lint-staged, `npm run lint` (`--max-warnings 0`) |
| `.dependency-cruiser.cjs` | Batas lapisan (§2.2) | pre-push, `npm run lint:arch` |
| `.ls-lint.yml` | kebab-case + **allowlist suffix** per folder (suffix lain ditolak) | pre-commit, `npm run lint:ls` |
| `knip.json` | File, export, dan dependency tidak terpakai | pre-push, `npm run lint:deps` |
| `package.json` → `jest` | Ambang coverage (SSOT), reporter JUnit + Cobertura, transform `temporal-polyfill` | `npm run test:cov` / `test:ci` |
| `.husky/*` | pre-commit, commit-msg, pre-push (§10.1) | Git |
| `commitlint.config.cjs` | Conventional Commits, `scope-case` kebab-case, panjang header/body | commit-msg |
| `.validate-branch-namerc.json` | `<type>/<slug>`, `hotfix/vX.Y.Z`, branch environment | pre-push |
| `.prettierrc`, `.editorconfig` | Format & LF | lint-staged, `npm run format:check` |
| `tsconfig.json` | `strict`, `nodenext` (import `.js`), output CommonJS, decorator metadata | `npm run typecheck`, build |
| `sonar-project.properties` | Sources vs tests, exclusions coverage selaras jest | SonarQube di pipeline template LNSW (D12) |
| `.gitlab-ci.yml` | Job §10.1 | GitLab CI |
| `drizzle.config.ts` | `schemaFilter: ['pengangkut_udara']` — schema referensi tidak pernah masuk migrasi | `npm run db:generate` |

Daftar aturan beserta contoh pelanggaran: `CONTRIBUTING.md` — _Aturan yang Ditegakkan Mesin_ dan _Chaos Test_.
