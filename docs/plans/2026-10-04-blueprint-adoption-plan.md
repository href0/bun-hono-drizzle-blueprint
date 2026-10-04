# Rencana Adopsi Blueprint → Boilerplate Bun + Hono + Drizzle

> **Status**: DRAFT — menunggu review keputusan (Step 0.2)
> **Dibuat**: 2026-10-04
> **Sumber**: [`ARCHITECTURE_BLUEPRINT_FROM_NESTJS.md`](../../ARCHITECTURE_BLUEPRINT_FROM_NESTJS.md) (NestJS, proyek pemerintahan)
> **Target**: boilerplate umum Bun + Hono + Drizzle yang siap dipakai via `clone` → `/init-project <nama>`

---

## 0. Cara Memakai Dokumen Ini

1. **Satu step = satu unit review.** Setiap step dikerjakan di branch `<type>/<slug>` (mis. `feat/request-context`), menghasilkan satu commit/PR yang bisa direview dan di-revert mandiri.
2. **AI agent mengerjakan tepat satu step, lalu berhenti.** Laporan akhir step berisi: ringkasan, daftar file berubah, hasil verifikasi, dan keputusan baru yang muncul. Step berikutnya baru dimulai setelah step sebelumnya di-approve.
3. **Status** diperbarui di [§6 Progress](#6-progress) pada commit step tersebut.
4. **Keputusan baru atau perubahan keputusan** dicatat di [§4 Decision Log](#4-decision-log) — jangan diam-diam menyimpang dari rencana.
5. **Urutan bisa diubah** selama kolom _Bergantung pada_ tetap terpenuhi.

### 0.1 Definition of Done (berlaku untuk SETIAP step)

- [ ] `bun run validate:full` hijau (typecheck, lint, ls-lint, prettier, depcruise, deps, branch, test + coverage).
- [ ] `bun run build` sukses.
- [ ] Test baru menutup perilaku baru (unit; e2e bila menyentuh HTTP).
- [ ] Aturan baru **ditegakkan mesin** bila memungkinkan (ESLint / depcruise / ls-lint / test), bukan hanya ditulis di dokumen.
- [ ] Dokumen yang terdampak ikut diperbarui di commit yang sama: `.agents/AGENTS.md`, `.agents/skills/**`, `CONTRIBUTING.md`, `README.md`, `.env.example`.
- [ ] Bila menambah nilai yang membawa nama proyek → didaftarkan di `IDENTITY_RULES` (`scripts/setup.ts`).
- [ ] Bila menambah env var → divalidasi Zod di `src/config/` + ditambahkan ke `.env.example`.
- [ ] Tidak ada perintah yang dieksekusi ke database oleh AI agent; migrasi di-generate, eksekusi oleh developer.
- [ ] Pesan commit lewat skill `generate-commit-text` (Conventional Commits).

### 0.2 Template Laporan Review per Step

```
Step     : <id> — <judul>
Branch   : <type>/<slug>
Ringkas  : <2–4 kalimat>
File     : <daftar file utama>
Verifikasi: validate:full ✅/❌ · build ✅/❌ · coverage <angka>
Keputusan baru: <none | Dxx>
Catatan review: <hal yang perlu perhatian reviewer>
```

---

## 1. Tujuan & Non-Tujuan

### Tujuan

- Mengadopsi pilar arsitektur blueprint ke Bun + Hono: kontrak API seragam, isolasi layer, transaksi deklaratif, data layer teraudit, zero-trust access & config, platform resilien & observable, quality gate yang ditegakkan mesin, AI agent governance.
- **Generik**: tanpa istilah/prefix instansi (K/L, INSW, BEA_CUKAI, LNSW, dsb.).
- **Auth JWT stateless**: access token + refresh token di cookie `HttpOnly` + `Secure`.
- **Siap clone**: proyek baru cukup `/init-project <nama>`.

### Non-Tujuan (lihat [§9 Backlog](#9-backlog))

SSO/OIDC eksternal, MFA, reset password via email, ACL berbasis permission granular, circuit breaker, partisi fisik `record_changes`, SonarQube, OpenTelemetry tracing, job queue.

---

## 2. Baseline (per 2026-10-04)

**Sudah ada & hijau**: Hono app factory, `ApiResponse` (snake_case output), `asyncHandler`, `validate()` Zod, hierarki `ApiError`, `TransactionHost` + `@Transactional()` (AsyncLocalStorage), Pino + redaksi, `CacheService` fail-open, `HttpClientService` (axios keep-alive), `src/integrations/<vendor>`, health/liveness/readiness, modul `users` referensi, depcruise 20+ rule, ESLint strictTypeChecked + AST rules, ls-lint, commitlint, husky, `init-project`. Semua gate lulus, 74 test pass.

**Gap & defect yang ditemukan** (dirujuk oleh step di §7):

| ID  | Temuan                                                                                                                        | Ditangani |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| G1  | Rate limiter memakai `X-Forwarded-For` mentah (bisa dipalsukan) dan store in-memory (tidak berlaku lintas instance)           | 1.7       |
| G2  | `X-Request-ID` diterima tanpa validasi (log injection); request ID tidak otomatis ada di setiap log                           | 1.2       |
| G3  | `HttpClientService` meneruskan body respons vendor ke `details` dan status vendor ke client (kebocoran + semantik salah)     | 4.1       |
| G4  | Redis `retryStrategy` berhenti setelah 3 percobaan → tidak pernah reconnect sampai restart                                    | 1.6       |
| G5  | Kontrak asimetris: request camelCase (`fullName`), response snake_case                                                        | 1.5       |
| G6  | Envelope error memuat `data: null`, error code ad hoc (`ERR_EXT_*` dibangun dinamis), pesan tidak dwibahasa                  | 1.3, 1.4  |
| G7  | Tidak ada batas ukuran body                                                                                                   | 1.7       |
| G8  | Schema referensi `ref_schema` ikut dibuat oleh migrasi `0000`; tabel domain di `public`                                      | 2.2       |
| G9  | Coverage ikut menghitung file test (98.46% menggelembung); tanpa ambang per file; pre-push hanya cek nama branch; belum ada CI | 0.3       |
| G10 | Belum ada auth, actor, audit, soft delete                                                                                     | F2, F3    |
| G11 | List `users` tanpa urutan deterministik (pagination tidak stabil)                                                             | 2.8       |
| G12 | Belum ada dokumentasi OpenAPI                                                                                                 | 1.9       |
| G13 | Health hanya `ready/not_ready`; belum `UP/DEGRADED/DOWN`                                                                      | 1.8       |

---

## 3. Pemetaan NestJS → Bun + Hono

| Blueprint (NestJS)                                    | Target (Bun + Hono)                                                                                  |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `configureApp()` di `app.setup.ts`                    | `createApp()` di `src/app.ts` (sudah ada) — dipakai `index.ts` dan e2e (`app.request()`)             |
| Module + DI container                                 | File per layer + singleton dengan default constructor param (tetap, lihat D20)                       |
| `APP_GUARD` `AuthGuard` + `@Public()`                 | Middleware global `authenticate()` default-deny + registry `PUBLIC_ROUTES` + test enumerasi route    |
| `@AdminOnly()` / `@RequireAcl()`                      | Middleware `requireRole(...)` per route                                                              |
| `PartnerGuard` + `@PartnerAuth()`                     | Middleware `partnerAuth()` yang di-mount pada prefix `${API_PREFIX}/partner`                         |
| CLS (`nestjs-cls`)                                    | `AsyncLocalStorage` → `RequestContext { requestId, actor, locale, clientIp }`                        |
| `TransformInterceptor`                                | `ApiResponse.toJSON()` + `asyncHandler` (sudah ada)                                                  |
| `HttpExceptionFilter`                                 | `app.onError(globalErrorHandler)` (sudah ada)                                                        |
| `SnakeToCamelPipe` → `ZodValidationPipe`              | `validate()` middleware: konversi snake→camel + tolak key non-snake, lalu Zod                        |
| `createZodDto` + `@Body()`                            | Zod schema di `*.dto.ts` + `getValidatedBody/Query/Params()` (sudah ada)                             |
| `PartnerAuditInterceptor`                             | Bagian dari `partnerAuth()` (log event setelah `await next()`)                                       |
| `@Transactional()` + `TransactionHost`                | Sama (sudah ada, berbasis AsyncLocalStorage)                                                         |
| `nestjs-pino` + `@InjectPinoLogger`                   | `logger` Pino + `mixin` yang menyuntikkan `requestId`/`actor` dari context                           |
| `@nestjs/axios` `HttpClientService`                   | `HttpClientService` axios (sudah ada) — diperkeras di 4.1                                            |
| Swagger `@ApiStandardResponse`                        | OpenAPI via `@hono/zod-openapi` + Scalar (D17)                                                       |
| `helmet()` / body limit / `trust proxy`               | `secureHeaders()` / `bodyLimit()` / util `getClientIp()` dengan `TRUST_PROXY_HOPS`                   |
| Jest + coverage SSOT                                  | `bun:test` + `scripts/check-coverage.ts`                                                             |
| knip                                                  | knip (menggantikan depcheck, D19)                                                                    |
| `external-<vendor>` (`external-insw`)                 | `src/integrations/<vendor>/` (sudah ada)                                                             |
| `partner-credential` (K/L)                            | `src/modules/partner-credentials/` (generik)                                                         |
| SSO INSW (token opaque + introspeksi) + ACL INSW      | JWT stateless (access) + refresh token rotasi (cookie HttpOnly) + RBAC sederhana                     |

---

## 4. Decision Log

Status: **PROPOSED** = usulan, perlu konfirmasi di Step 0.2 · **ACCEPTED** · **REJECTED** · **SUPERSEDED**.

| ID  | Keputusan (usulan)                                                                                                                                                                                                                   | Alternatif & alasan                                                                                                                         | Status   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| D0  | Baseline di-commit ke `main`; setiap step di branch `<type>/<slug>` → merge ke `main` setelah review                                                                                                                                 | Alur `development → staging → prod` dipakai proyek turunan, bukan repo boilerplate                                                          | PROPOSED |
| D1  | Refresh token **opaque acak**, disimpan **hash SHA-256** di tabel `auth_refresh_tokens` (DB), **rotasi setiap refresh** + **deteksi reuse** per `family_id` (token lama dipakai lagi → seluruh family dicabut)                         | JWT refresh murni stateless: tidak bisa logout/cabut. Redis-only: Redis kita fail-open → state auth tidak boleh hilang                       | PROPOSED |
| D2  | Access token **JWT HS256** via `hono/jwt` (tanpa dependency baru), TTL 15 menit, claims `sub, role, jti, iat, exp, iss, aud`; dikirim `Authorization: Bearer`; diverifikasi tanpa DB (stateless)                                     | RS256/EdDSA + JWKS untuk verifikasi lintas service → backlog, desain config disiapkan                                                       | PROPOSED |
| D3  | Cookie refresh: `refresh_token`, `HttpOnly; Secure; SameSite=Strict; Path=${API_PREFIX}/auth; Max-Age=<refresh TTL, default 7 hari>`. Refresh token **tidak pernah** ada di body respons. `SameSite` dapat dikonfigurasi (`Lax`/`None`) | `Secure` tetap jalan di `http://localhost` (secure context browser)                                                                         | PROPOSED |
| D4  | Proteksi CSRF untuk endpoint ber-cookie (`/auth/refresh`, `/auth/logout`): `SameSite` + cek header `Origin` terhadap allowlist CORS (Origin ada & tidak terdaftar → 403)                                                             | Double-submit token: lebih rumit untuk FE, tidak perlu selama SameSite + Origin check                                                       | PROPOSED |
| D5  | Login email + password (`Bun.password`, argon2id). Endpoint register publik **mati secara default** (`AUTH_REGISTRATION_ENABLED=false`); user dibuat admin                                                                           | —                                                                                                                                           | PROPOSED |
| D6  | Otorisasi **RBAC sederhana**: kolom `role` di `users` dari konstanta `ROLES` (`admin`, `user`), middleware `requireRole()`. Menggantikan ACL INSW + `ADMIN_GROUPS`                                                                  | Permission granular → backlog                                                                                                               | PROPOSED |
| D7  | **Default-deny**: `authenticate()` global pada `${API_PREFIX}/*`; route publik dideklarasikan eksplisit di satu registry `PUBLIC_ROUTES`; e2e test mengenumerasi `app.routes` dan gagal bila ada route tak terlindungi & tak terdaftar | `authenticate()` per route: mudah lupa → tidak aman                                                                                         | PROPOSED |
| D8  | Request context via `AsyncLocalStorage`: `{ requestId, actor, locale, clientIp }`. Actor: `user:<id>` · `partner:<code>` · `system`                                                                                                  | Oper `c` ke service: melanggar Rule 4 (service tanpa Context)                                                                               | PROPOSED |
| D9  | `X-Request-ID` diterima bila cocok `^[A-Za-z0-9._:-]{1,128}$`, selain itu UUID v7 baru (`Bun.randomUUIDv7()`)                                                                                                                         | —                                                                                                                                           | PROPOSED |
| D10 | Kontrak **snake_case dua arah**: request dengan key non-snake_case → 400 `VALIDATION_ERROR`; field kamus bebas memakai opsi `preserveKeys`                                                                                            | —                                                                                                                                           | PROPOSED |
| D11 | **i18n `id` + `en`** via `Accept-Language`, default `DEFAULT_LOCALE=id`; pesan sukses & error berupa `{ id, en }` dari registry `I18N_MESSAGES`                                                                                       | Hanya `en`: lebih ramping, tetapi kehilangan pilar blueprint                                                                                | PROPOSED |
| D12 | HTTP 409 memakai `error.type = "CONFLICT"` (bukan dipetakan ke `BAD_REQUEST` seperti blueprint)                                                                                                                                      | Blueprint memetakan 409 → `BAD_REQUEST` karena kebutuhan FE proyek lama; untuk boilerplate umum `CONFLICT` lebih standar                    | PROPOSED |
| D13 | Waktu: `temporal-polyfill` untuk logika, runtime & sesi DB `UTC`; tiga jenis waktu (instant `*_at` / tanggal `*_date` / jadwal lokal + `*_timezone`); `new Date(string)` & getter waktu lokal dilarang ESLint                         | Tetap `Date`: rawan bug zona waktu                                                                                                           | PROPOSED |
| D14 | Tabel domain di **satu `pgSchema` bernama proyek** (snake_case), dideklarasikan hanya di `schema/schemas.ts` dan **didaftarkan di `IDENTITY_RULES`**; `drizzle.config.ts` `schemaFilter` dari konstanta itu. Schema referensi = `.view().existing()` read-only, tidak dimigrasi. Migrasi `0000` di-generate ulang (belum ada deployment) | Tetap `public`: tidak ada isolasi; mudah bentrok bila DB dipakai bersama                                                                   | PROPOSED |
| D15 | PK domain **UUID v7** (`Bun.randomUUIDv7()` via `$defaultFn`); tabel pencatatan `bigint identity`                                                                                                                                     | `gen_random_uuid()` (v4): index B-tree terfragmentasi                                                                                        | PROPOSED |
| D16 | Audit generik `record_changes` (partition-ready) ditulis base repository **dalam transaksi yang sama**                                                                                                                                | —                                                                                                                                           | PROPOSED |
| D17 | OpenAPI via `@hono/zod-openapi` + `@scalar/hono-api-reference` (non-production), schema ditampilkan snake_case. **Dievaluasi di Step 1.9** — kemungkinan butuh upgrade Zod v3 → v4                                                    | `hono-openapi` (middleware-style) bila migrasi `createRoute` terlalu invasif                                                                | PROPOSED |
| D18 | Rate limit global berbasis Redis (`increment` atomik, fixed window), **fail-open**, kunci = IP klien tepercaya (`TRUST_PROXY_HOPS`). `hono-rate-limiter` dihapus                                                                     | Store in-memory: tidak berlaku multi-instance                                                                                               | PROPOSED |
| D19 | Quality gate: **knip** menggantikan depcheck; coverage **mengecualikan file test**, global lines & functions ≥ 95, per file lines ≥ 90; pre-push: depcruise + knip + unit test; **CI GitHub Actions** (template GitLab di backlog)   | Bun coverage belum melaporkan branch coverage → ambang branch tidak dipakai                                                                 | PROPOSED |
| D20 | DI tetap **singleton + default constructor param** (tanpa container)                                                                                                                                                                 | Container (tsyringe/inversify): menambah kompleksitas tanpa manfaat berarti di Hono                                                         | PROPOSED |
| D21 | Gateway partner generik `partner-credentials` (HMAC-SHA256 signing v1), endpoint partner di prefix `${API_PREFIX}/partner/*`, terpisah dari JWT                                                                                      | Penanda per route: rawan tercampur dengan route JWT                                                                                        | PROPOSED |
| D22 | Redis: reconnect tanpa batas (backoff maks. 30 dtk), offline queue mati, `commandTimeout`, prefix otomatis `<APP_NAME>:<NODE_ENV>:` (bisa di-override), `FLUSHALL`/`FLUSHDB`/`KEYS` diblokir                                         | Prefix kosong (saat ini): bentrok bila Redis dipakai bersama                                                                                | PROPOSED |

---

## 5. Arsitektur Target (ringkas)

```
src/
├── app.ts                         # createApp(): pipeline middleware + mount routes
├── index.ts                       # bootstrap Bun.serve + graceful shutdown
├── config/                        # app, database, redis, auth, partner, http (*.config.ts) + parse-env.ts
├── core/                          # building block lintas domain (tanpa database/modules)
│   ├── cache/                     # CacheService, CACHE_KEYS/PREFIX/TTL, redis.client
│   ├── context/                   # RequestContext (AsyncLocalStorage)
│   ├── errors/                    # ApiError*, APP_ERROR_CODES
│   ├── http/                      # HttpClientService (hanya untuk integrations/)
│   ├── i18n/                      # I18N_MESSAGES, resolver Accept-Language
│   ├── logger/
│   ├── middlewares/               # request-context, authenticate, require-role, rate-limit, client-ip, validate, …
│   ├── openapi/
│   ├── response/                  # ApiResponse
│   └── security/                  # JWT sign/verify, token hashing (murni, tanpa DB)
├── database/
│   ├── audited.repository.ts      # lock baris + record_changes
│   ├── base.repository.ts         # tabel mandiri/header (soft delete)
│   ├── child.repository.ts        # tabel detail (hard delete + snapshot)
│   ├── connection.ts · transaction-host.ts · transactional.decorator.ts · health-probe.ts
│   ├── schema/  schemas.ts · columns.ts · domain/ · reference/ · system/
│   └── seeds/
├── integrations/<vendor>/         # klien outbound
├── modules/
│   ├── auth/                      # login, refresh, logout, me
│   ├── users/
│   ├── partner-credentials/       # admin kredensial + partnerAuth middleware
│   └── health/
└── utils/                         # murni: datetime, crypto, partner-signature, record-diff, ip-cidr, case-converter
```

---

## 6. Progress

Legenda: ⬜ belum · 🔄 dikerjakan · 👀 menunggu review · ✅ selesai

| Step | Judul                                                    | Status | Bergantung pada |
| ---- | -------------------------------------------------------- | ------ | --------------- |
| 0.1  | Baseline commit                                          | ⬜     | —               |
| 0.2  | Review rencana & keputusan                               | ⬜     | 0.1             |
| 0.3  | Paritas quality gate (coverage, knip, hooks, CI)         | ⬜     | 0.2             |
| 1.1  | Konfigurasi per grup + `parseEnv`                        | ⬜     | 0.3             |
| 1.2  | Request context, request ID, logger mixin                | ⬜     | 1.1             |
| 1.3  | Kontrak error + registry `APP_ERROR_CODES`               | ⬜     | 1.2             |
| 1.4  | i18n `id`/`en`                                           | ⬜     | 1.3             |
| 1.5  | Kontrak request snake_case                               | ⬜     | 1.3             |
| 1.6  | Ketahanan Redis & `CacheService` lanjutan                | ⬜     | 1.1             |
| 1.7  | Hardening platform (IP klien, body limit, CORS, rate limit) | ⬜  | 1.2, 1.6        |
| 1.8  | Health `UP`/`DEGRADED`/`DOWN`                            | ⬜     | 1.6             |
| 1.9  | Dokumentasi OpenAPI                                      | ⬜     | 1.5             |
| 2.1  | Standar tanggal & waktu (Temporal)                       | ⬜     | 0.3             |
| 2.2  | Schema proyek, column helpers, UUID v7, schema referensi | ⬜     | 2.1             |
| 2.3  | Test helper data layer                                   | ⬜     | 2.2             |
| 2.4  | `record_changes` + `AuditedRepository`                   | ⬜     | 1.2, 2.3        |
| 2.5  | `BaseRepository` + `ChildRepository`                     | ⬜     | 2.4             |
| 2.6  | Penegakan aturan data layer (ESLint/depcruise)           | ⬜     | 2.5             |
| 2.7  | Test konvensi schema                                     | ⬜     | 2.5             |
| 2.8  | Migrasi modul `users` + template scaffold                | ⬜     | 2.6, 2.7        |
| 3.1  | Primitif keamanan & config auth                          | ⬜     | 1.1             |
| 3.2  | Schema auth (`role`, `auth_refresh_tokens`)              | ⬜     | 2.8             |
| 3.3  | Modul `auth` (login, refresh, logout, me)                | ⬜     | 3.1, 3.2, 1.7   |
| 3.4  | `authenticate()` default-deny + `requireRole()`          | ⬜     | 3.3             |
| 3.5  | Proteksi modul `users`, seed admin, panduan FE           | ⬜     | 3.4             |
| 4.1  | Hardening `HttpClientService`                            | ⬜     | 1.3             |
| 4.2  | Template integrasi & cache token vendor                  | ⬜     | 4.1             |
| 5.1  | Utilitas kripto & signing partner                        | ⬜     | 0.3             |
| 5.2  | Kredensial partner (schema + admin API)                  | ⬜     | 5.1, 2.8, 3.4   |
| 5.3  | Middleware `partnerAuth()`                               | ⬜     | 5.2, 1.6        |
| 5.4  | Panduan integrasi partner                                | ⬜     | 5.3             |
| 6.1  | Integration test (Postgres + Redis asli)                 | ⬜     | 3.5, 5.3        |
| 7.1  | `ARCHITECTURE.md` generik + sinkronisasi docs            | ⬜     | 6.1             |
| 7.2  | Finalisasi skills AI                                     | ⬜     | 7.1             |
| 7.3  | Release check boilerplate v1.0.0                         | ⬜     | 7.2             |

---

## 7. Detail Step

### Fase 0 — Fondasi Kerja

#### Step 0.1 — Baseline commit

- **Tujuan**: titik awal yang bisa di-diff untuk semua step berikutnya.
- **Lingkup**: rename branch `master` → `main`; commit seluruh file yang sudah di-stage + `.claude/`, `CLAUDE.md`, skill `init-project`, dokumen rencana ini.
- **Kriteria terima**: `git log` berisi 1 commit baseline; `validate:full` hijau di commit itu; `.env` tidak ter-commit.
- **Verifikasi**: `git show --stat HEAD`, `git check-ignore .env`.

#### Step 0.2 — Review rencana & keputusan

- **Tujuan**: semua keputusan D0–D22 berstatus ACCEPTED/REJECTED sebelum kode ditulis.
- **Lingkup**: perbarui §4 sesuai jawaban reviewer; sesuaikan step yang terdampak; ubah status dokumen menjadi `APPROVED`.
- **Kriteria terima**: tidak ada keputusan `PROPOSED` yang memblokir Fase 0–1.

#### Step 0.3 — Paritas quality gate

- **Tujuan**: gate ditegakkan sebelum perubahan besar (G9).
- **Lingkup**:
  - `scripts/check-coverage.ts`: abaikan `*.test.ts` & `test/**`; ambang global lines ≥ 95 dan functions ≥ 95; per file lines ≥ 90; tampilkan file yang gagal.
  - Ganti `depcheck` → `knip` (`knip.json`, script `lint:deps`), hapus `.depcheckrc.json`.
  - `.husky/pre-push`: `lint:branch` → `lint:arch` → `lint:deps` → `bun test`.
  - CI `.github/workflows/ci.yml`: install (frozen lockfile) → `validate` → `test:cov` → `build`; cache Bun.
  - Tambah `.editorconfig` (LF, UTF-8).
- **Kriteria terima**: coverage nyata dilaporkan (tanpa file test) dan masih ≥ ambang (tambah test bila perlu); knip tanpa temuan; CI hijau.
- **Docs**: `CONTRIBUTING.md` §1, `project-standards` §6, `AGENTS.md` bagian quality gate.

---

### Fase 1 — Platform & Kontrak HTTP

#### Step 1.1 — Konfigurasi per grup + `parseEnv`

- **Tujuan**: setiap fase berikutnya menambah env var di tempat yang jelas.
- **Lingkup**: pecah `env.config.ts` → `app.config.ts`, `database.config.ts`, `redis.config.ts`, `http.config.ts` (auth & partner menyusul di fasenya); util `parseEnv(schema, source)` dengan pesan error per variabel; `index.ts` re-export. `process.env` tetap hanya di `src/config/`.
- **Kriteria terima**: aplikasi gagal start dengan pesan jelas bila env salah (diuji); tidak ada perubahan perilaku lain.
- **Docs**: `references/bootstrap.md`, `CONTRIBUTING` §6, `.env.example` dikelompokkan.

#### Step 1.2 — Request context, request ID, logger mixin

- **Tujuan**: pengganti CLS (D8, D9, G2).
- **Lingkup**: `core/context/request-context.ts` (AsyncLocalStorage, `getRequestContext()`, `runWithContext()`, `setActor()`); middleware `requestContext()` menggantikan `requestIdMiddleware` (validasi format, UUID v7, header respons); Pino `mixin` menambahkan `requestId` + `actor` ke setiap log; `loggerMiddleware` & `globalErrorHandler` membaca dari context; default actor `system` di luar request.
- **Kriteria terima**: request ID tidak valid diganti; dua request paralel tidak saling bocor context (test); log dalam service memuat `requestId` tanpa dioper manual.
- **Docs**: `references/logging.md`.

#### Step 1.3 — Kontrak error + registry `APP_ERROR_CODES`

- **Tujuan**: envelope error sesuai blueprint (G6, D12).
- **Lingkup**: `core/errors/error-codes.ts` (`APP_ERROR_CODES`, nilai `ERR_*`); tambah `TooManyRequestsError` (429), `ServiceUnavailableError` (503); `ExternalServiceError` memakai code tetap dari registry; `error.type` lengkap (`VALIDATION_ERROR`, `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_REQUESTS`, `SERVICE_UNAVAILABLE`, `EXTERNAL_SERVICE_ERROR`, `INTERNAL_SERVER_ERROR`); hapus `data: null` dari envelope error; `details[].field` snake_case tanpa prefix internal; `origin` (`APP` atau kode integrasi) + `institution` opsional dari registry integrasi; `notFoundHandler` & error 500 memakai kontrak yang sama.
- **Penegakan**: ESLint melarang literal `'ERR_*'` di luar `error-codes.ts`; melarang `throw new Error(` di `src/modules/**`.
- **Kriteria terima**: snapshot test envelope untuk setiap tipe error.
- **Docs**: `project-standards` §5, `CONTRIBUTING` §3.

#### Step 1.4 — i18n `id`/`en`

- **Tujuan**: pesan dwibahasa (D11).
- **Lingkup**: `core/i18n/` (`I18N_MESSAGES`, `resolveLocale(acceptLanguage)`, `translate()`); locale disimpan di request context; `ApiResponse` & `ApiError` menerima `LocalizedMessage` (`{ id, en }`) atau key registry; `globalErrorHandler` menerjemahkan; pesan validasi Zod generik dwibahasa.
- **Penegakan**: ESLint melarang string literal sebagai argumen message `ApiResponse`/`*Error` di `src/modules/**`.
- **Kriteria terima**: `Accept-Language: en` → pesan en; default → `DEFAULT_LOCALE`.

#### Step 1.5 — Kontrak request snake_case

- **Tujuan**: kontrak simetris (G5, D10).
- **Lingkup**: `validate()` mengonversi key body & query snake→camel sebelum Zod; key non-snake_case → 400 dengan detail per field; opsi `preserveKeys: ['metadata']`; util di `utils/case-converter.util.ts` diperluas + diuji (naikkan coverage file ini dari 85.71%).
- **Kriteria terima**: `{ "full_name": … }` diterima; `{ "fullName": … }` ditolak 400; e2e `users` diperbarui.

#### Step 1.6 — Ketahanan Redis & `CacheService` lanjutan

- **Tujuan**: blueprint §6 (G4, D22).
- **Lingkup**: `redis.client.ts` reconnect tanpa batas (backoff ≤ 30 dtk), `enableOfflineQueue: false`, `commandTimeout` (`REDIS_COMMAND_TIMEOUT_MS`), prefix otomatis; blokir `flushall`/`flushdb`/`keys`; `CacheService`: `getOrSet(..., { negativeTtl })`, `setIfAbsent` (SET NX EX, untuk nonce), `increment(key, ttl)` atomik (Lua) — semua fail-open; `CACHE_KEYS` tetap SSOT.
- **Kriteria terima**: test fail-open untuk setiap method; perintah terblokir melempar error.
- **Docs**: `references/redis-cache.md`.

#### Step 1.7 — Hardening platform

- **Tujuan**: G1, G7, D18.
- **Lingkup**: `getClientIp(c)` memakai `getConnInfo` (`hono/bun`) + `TRUST_PROXY_HOPS` (tidak memercayai `X-Forwarded-For` mentah); `bodyLimit()` (`HTTP_BODY_LIMIT`, 413 dengan envelope standar); CORS allowlist `CORS_ORIGINS` (kosong = mati; `*` ditolak di production) dengan `credentials: true` untuk cookie; middleware `rateLimit()` berbasis `CacheService.increment` (header `RateLimit-*`, 429 + `Retry-After`); hapus `hono-rate-limiter`.
- **Kriteria terima**: spoof `X-Forwarded-For` tidak mengubah kunci rate limit saat `TRUST_PROXY_HOPS=0`; body besar → 413; Redis mati → request tetap lolos.

#### Step 1.8 — Health `UP`/`DEGRADED`/`DOWN`

- **Tujuan**: G13.
- **Lingkup**: `GET /health` selalu 200 dengan status `UP`/`DEGRADED` (Redis down)/`DOWN` (DB down); `/health/readiness` 503 hanya bila DB down; `/health/liveness` selalu 200; route health tanpa versi (`/api/health`) — sesuaikan `API_PREFIX`.
- **Kriteria terima**: tiga skenario diuji.

#### Step 1.9 — Dokumentasi OpenAPI

- **Tujuan**: G12, D17.
- **Lingkup**: spike singkat (dicatat di Decision Log): `@hono/zod-openapi` vs `hono-openapi`, dampak ke Zod v3; implementasi pilihan; dokumen ditampilkan snake_case; envelope sukses/error sebagai komponen bersama; UI Scalar hanya non-production; modul `users` & `health` terdokumentasi.
- **Kriteria terima**: `/api/docs` menampilkan semua route; test memastikan spec valid dan setiap route terdokumentasi.
- **Docs**: `scaffold-module` (pola route terdokumentasi).

---

### Fase 2 — Data Layer

#### Step 2.1 — Standar tanggal & waktu

- **Lingkup**: `temporal-polyfill`; `utils/datetime.util.ts` (`nowInstant`, `toIsoUtc`, `parseInstant` wajib offset, `parseCalendarDate`, `dayRangeInZone`, `wallTimeToInstant` — DST ambigu ditolak); Dockerfile & compose `TZ=UTC`; koneksi DB `timezone=UTC`; field Zod `instantField`/`calendarDateField`/`timeZoneField` di `core/dto/`.
- **Penegakan**: ESLint melarang `new Date(<string>)`, `Date.parse`, getter lokal (`getHours`, `toLocaleString`, …).
- **Kriteria terima**: test DST & batas hari per zona.

#### Step 2.2 — Schema proyek, column helpers, UUID v7, schema referensi

- **Lingkup**: `schema/schemas.ts` satu-satunya `pgSchema` (domain bernama proyek, D14) → daftarkan di `IDENTITY_RULES` + `drizzle.config.ts`; `schema/columns.ts`: `uuidPrimaryKey` (v7, D15), `sequentialPrimaryKey`, `timestamps`, `auditColumns` (`created_by`, `updated_by`), `softDelete`, `parentReference` (+ index), `instant`, `calendarDate`, `timeZoneColumn`, `activeUniqueIndex`; schema referensi contoh sebagai `.view().existing()`; generate ulang migrasi `0000` (G8). Developer menjalankan migrasi.
- **Penegakan**: ESLint melarang `pgSchema(` di luar `schemas.ts` dan kolom waktu mentah (`timestamp(`) di luar `columns.ts`.
- **Kriteria terima**: `drizzle-kit generate` tidak menyentuh schema referensi; `init-project` mengganti nama schema (diuji di salinan repo).

#### Step 2.3 — Test helper data layer

- **Lingkup**: `test/helpers/` — `createDrizzleChainMock`, `createTxHostMock`, `renderWhere` (me-render SQL asli dari kondisi Drizzle untuk assertion).
- **Kriteria terima**: dipakai ulang oleh test repository `users`.

#### Step 2.4 — `record_changes` + `AuditedRepository`

- **Lingkup**: tabel `system.record_changes` (id `bigserial`, PK `(id, changed_at)`, tanpa FK; `table_name`, `record_id`, `action` UPDATE/SOFT_DELETE/RESTORE/DELETE, `changes` jsonb (kolom berubah saja / snapshot), `actor`, `request_id`, `changed_at`); `utils/record-diff.util.ts` (diff + opsi `redact`); `database/audited.repository.ts`: `SELECT … FOR UPDATE` → tulis → catat, dalam transaksi yang sama; actor & request ID dari context.
- **Kriteria terima**: rollback membatalkan audit; kolom redact tercatat sebagai `[REDACTED]`.
- **Docs**: `references/database.md`, `references/transactions.md`.

#### Step 2.5 — `BaseRepository` + `ChildRepository`

- **Lingkup**: `BaseRepository` (query ter-scope `deleted_at IS NULL`, isi `created_by`/`updated_by` dari actor, `updateById`, `softDeleteById`, `restoreById`, tanpa hard delete, pagination dengan urutan deterministik); `ChildRepository` (semua method menerima `parentId` → cegah IDOR, kunci header aktif dulu, hard delete + snapshot, `syncForParent`, menyentuh `updated_at` header).
- **Kriteria terima**: perilaku generik diuji sekali di `src/database/`.

#### Step 2.6 — Penegakan aturan data layer

- **Lingkup** (ESLint + depcruise): `.update(`/`.delete(` dilarang di repository modul (wajib lewat base class); penulisan DB dilarang di luar `*.repository.ts`; raw SQL `UPDATE`/`DELETE FROM` dilarang; `recordChanges` tidak boleh ditulis langsung; `@Transactional()` hanya di `*.service.ts`; `TransactionHost` hanya di `*.repository.ts`; `sql.raw(` dengan input dilarang; raw query hanya di `*.queries.ts` (ls-lint allowlist). Seeder dikecualikan.
- **Kriteria terima**: "chaos test" — contoh pelanggaran per aturan didokumentasikan dan terbukti gagal lint.
- **Docs**: `CONTRIBUTING` _Aturan yang Ditegakkan Mesin_, `references/raw-queries.md`.

#### Step 2.7 — Test konvensi schema

- **Lingkup**: `schema-conventions.test.ts` — setiap FK punya index, setiap tabel domain memakai helper wajib, `record_changes` tetap partition-ready, view referensi tidak bisa ditulis (cek tipe).

#### Step 2.8 — Migrasi modul `users` + template scaffold

- **Lingkup**: `users` memakai `BaseRepository` + kolom audit + soft delete + UUID v7 + urutan deterministik (G11); endpoint update & soft delete; template `scaffold-module` diperbarui untuk tabel **mandiri**, **header + detail**, dan **pencatatan**.
- **Kriteria terima**: scaffold contoh header/detail lolos semua gate tanpa edit manual (diuji lalu dibuang).

---

### Fase 3 — Auth JWT

#### Step 3.1 — Primitif keamanan & config auth

- **Lingkup**: `config/auth.config.ts` (`JWT_SECRET` ≥ 32 karakter, `JWT_ISSUER`, `JWT_AUDIENCE`, `ACCESS_TOKEN_TTL` default 15m, `REFRESH_TOKEN_TTL` default 7d, `AUTH_COOKIE_SAMESITE`, `AUTH_REGISTRATION_ENABLED`); `core/security/jwt.ts` (`signAccessToken`, `verifyAccessToken` via `hono/jwt`, validasi `iss`/`aud`/`exp`, clock skew kecil); `utils/crypto.util.ts` (`generateOpaqueToken` 256-bit, `sha256Hex`, `timingSafeEqual`).
- **Kriteria terima**: token kedaluwarsa / salah `aud` / salah signature ditolak (test).

#### Step 3.2 — Schema auth

- **Lingkup**: `users.role` (default `user`), konstanta `ROLES`; tabel `auth_refresh_tokens` (`id` v7, `user_id` + index, `family_id` + index, `token_hash` unik, `expires_at`, `revoked_at`, `replaced_by_id`, `user_agent`, `ip`, timestamps); migrasi di-generate.

#### Step 3.3 — Modul `auth`

- **Endpoint** (`${API_PREFIX}/auth`):

  | Method & path       | Auth           | Perilaku                                                                                                                     |
  | ------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
  | `POST /login`       | publik         | verifikasi password (dummy hash bila user tidak ada → waktu konstan); kembalikan `access_token` + `expires_in` di body; set cookie refresh |
  | `POST /refresh`     | cookie         | cek Origin (D4); cari hash; **revoked → cabut seluruh family (reuse) → 401**; kedaluwarsa → 401; rotasi: cabut lama, terbitkan baru (family sama) |
  | `POST /logout`      | cookie         | cabut token saat ini, hapus cookie; idempoten                                                                                |
  | `POST /logout-all`  | access token   | cabut semua family milik user                                                                                                |
  | `GET /me`           | access token   | profil user dari DB                                                                                                          |
  | `POST /register`    | publik, toggle | hanya bila `AUTH_REGISTRATION_ENABLED=true`                                                                                  |

- **Keamanan**: rate limit login per (email, IP) via `increment` (fail-open, D18); user nonaktif → 401 generik; ganti password / nonaktifkan user → cabut semua family; refresh token tidak pernah di-log (tambah ke redaksi).
- **Kriteria terima**: e2e alur lengkap login → refresh (rotasi) → reuse token lama (family dicabut) → logout; atribut cookie diverifikasi persis.

#### Step 3.4 — `authenticate()` default-deny + `requireRole()`

- **Lingkup**: `core/middlewares/authenticate.ts` (Bearer → verifikasi JWT → actor `user:<id>` + role di context; 401 `UNAUTHORIZED` dengan code dari registry); registry `PUBLIC_ROUTES` (method + pola path) — health, docs, `auth/login`, `auth/refresh`, `auth/logout`, `auth/register`; `requireRole(...roles)` → 403; prefix partner dikecualikan (ditangani Fase 5).
- **Kriteria terima**: test enumerasi `app.routes` — setiap route harus terdaftar publik atau ditolak 401 tanpa token (D7).
- **Docs**: `AGENTS.md` invariant baru (default-deny), `project-standards`.

#### Step 3.5 — Proteksi `users`, seed admin, panduan FE

- **Lingkup**: `POST/PATCH/DELETE /users` → `requireRole('admin')`; `scripts/seed-admin.ts` (dev, dijalankan developer; password dari argumen/prompt, tidak di-hardcode); `docs/auth-guide.md` untuk FE (alur token, `credentials: 'include'`, auto-refresh saat 401, CORS).

---

### Fase 4 — Integrasi Outbound (generik)

#### Step 4.1 — Hardening `HttpClientService`

- **Lingkup** (G3): body & status vendor **tidak** diteruskan ke client — dicatat di log (tanpa header), client menerima 502 (error vendor) / 504 (timeout); `X-Request-ID` diteruskan ke vendor; registry `INTEGRATION_REGISTRY` (`code` → `institution` nama tampilan, generik, diisi per proyek); timeout wajib (tanpa default diam-diam).
- **Penegakan**: ESLint melarang `fetch(` dan import `axios` di luar `src/core/http/`.

#### Step 4.2 — Template integrasi & cache token vendor

- **Lingkup**: pola vendor dengan login (token jangka pendek di-cache, refresh sebelum kedaluwarsa, single-flight); `references/integrations.md`; contoh `jsonplaceholder` disesuaikan; config per vendor `config/<vendor>.config.ts`.

---

### Fase 5 — Gateway Partner Inbound (generik)

#### Step 5.1 — Utilitas kripto & signing

- **Lingkup** (murni, di `utils/`): AES-256-GCM dengan keyring (`v1.<keyId>.<iv>.<tag>.<ciphertext>`, rotasi tanpa putus); canonical string signing v1 `v1\n<timestamp>\n<nonce>\n<METHOD>\n<path>\n<canonicalQuery>\n<sha256(rawBody)>`; HMAC-SHA256 hex; pencocokan IP/CIDR (IPv4 & IPv6).

#### Step 5.2 — Kredensial partner

- **Lingkup**: `config/partner.config.ts` (`PARTNER_HMAC_TOLERANCE_MS`, `PARTNER_SECRET_KEYS`, `PARTNER_SECRET_ACTIVE_KEY_ID`); tabel `partner_credentials` (sesuai blueprint §9.2, `partner_code` unik permanen); admin API `${API_PREFIX}/partner-credentials` (`requireRole('admin')`): create, list, detail, update, rotate, deactivate, soft delete; API key & secret plaintext hanya tampil sekali; hash & ciphertext di-redact di `record_changes`.

#### Step 5.3 — Middleware `partnerAuth()`

- **Lingkup**: di-mount di `${API_PREFIX}/partner/*`; alur blueprint §9.1 (header wajib → drift timestamp → lookup by hash (cache) → IP whitelist → route ACL → signature timing-safe atas raw body → nonce `setIfAbsent` → rate limit per partner → actor `partner:<code>`); satu log audit per request (`ALLOWED`/`REJECTED`/`ERROR`, request ID, durasi, status); contoh endpoint partner `GET /partner/ping`.
- **Kriteria terima**: test per cabang penolakan; replay nonce ditolak; Redis mati → nonce & rate limit fail-open (didokumentasikan sebagai trade-off).

#### Step 5.4 — Panduan integrasi partner

- **Lingkup**: `docs/partner-integration-guide.md` (generik: header, canonical string, contoh curl & TypeScript, kode error); `scripts/partner-sign.ts` untuk uji manual.

---

### Fase 6 — Integration Test

#### Step 6.1 — Postgres + Redis asli

- **Lingkup**: `docker-compose.test.yml`; `test/integration/*.int.test.ts` + script `test:int` (terpisah dari unit); skenario: audit & rollback, soft delete/restore, sync detail, rotasi & reuse refresh token, nonce partner, fail-open saat Redis dimatikan; job CI dengan service container.
- **Catatan**: migrasi pada DB test dijalankan oleh script test (DB sekali pakai), bukan oleh AI agent pada DB developer.

---

### Fase 7 — Dokumentasi, Skills, Release

#### Step 7.1 — `ARCHITECTURE.md` generik + sinkronisasi docs

- **Lingkup**: tulis `ARCHITECTURE.md` (struktur seperti blueprint, isi Bun/Hono, generik); `ARCHITECTURE_BLUEPRINT_FROM_NESTJS.md` dipindah ke `docs/archive/` (atau dihapus — keputusan reviewer); sinkronkan `README.md` & `CONTRIBUTING.md`.

#### Step 7.2 — Finalisasi skills AI

- **Lingkup**: skill baru `review-code` (gate review sebelum step dinyatakan selesai, memakai §0.1); evaluasi pemisahan `references/database.md` menjadi skill `database-standards`; perbarui `scaffold-module`, `init-project`, `project-standards`; wrapper `.claude/skills/` untuk skill baru; `CLAUDE.md` tetap hanya import.

#### Step 7.3 — Release check boilerplate v1.0.0

- **Lingkup**: clone bersih → `/init-project demo-backend` → `docker compose up -d` → migrasi → `bun run dev` → smoke test (health, login, refresh, partner ping) → `bun run build` → `docker build`; `CHANGELOG.md`; tag `v1.0.0`.

---

## 8. Risiko & Mitigasi

| Risiko                                                                 | Dampak                         | Mitigasi                                                                         |
| ---------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| `@hono/zod-openapi` versi terbaru mensyaratkan Zod v4                  | Perubahan API Zod di semua DTO | Spike di 1.9; bila invasif pakai `hono-openapi` (D17)                            |
| Bun coverage tidak melaporkan branch coverage                          | Ambang branch blueprint hilang | Ambang functions + per file (D19); tinjau ulang saat Bun mendukung               |
| Decorator `@Transactional()` bergantung `experimentalDecorators`       | Breaking saat migrasi TC39     | Tetap sediakan `runInTransaction()` sebagai jalur eksplisit                      |
| Body request dibaca dua kali (signature partner + JSON)                | Body kosong di handler         | Baca `arrayBuffer` sekali di `partnerAuth`, parse dari buffer; diuji di 5.3      |
| Enumerasi `app.routes` berubah antar versi Hono                        | Test default-deny rapuh        | Kunci versi minor Hono; test memverifikasi lewat request nyata, bukan struktur   |
| Fail-open Redis melemahkan nonce/rate limit saat Redis mati            | Replay window terbuka          | Toleransi timestamp sempit (5 menit); log `WARN` + status `DEGRADED`             |

---

## 9. Backlog

- JWT RS256/EdDSA + endpoint JWKS (verifikasi lintas service)
- MFA, reset password via email, verifikasi email
- ACL berbasis permission granular
- Retry dengan backoff & circuit breaker untuk integrasi
- Partisi bulanan `record_changes` + runbook retensi
- SonarQube & template CI GitLab
- OpenTelemetry tracing
- Job queue / scheduler dengan actor `system`
