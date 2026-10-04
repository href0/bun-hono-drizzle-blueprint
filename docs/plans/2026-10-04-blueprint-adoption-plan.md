# Implementation Plan — Adopsi Blueprint ke Boilerplate Bun + Hono + Drizzle

| Atribut     | Nilai                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status      | IN PROGRESS — F0: Step 0.1 & 0.2 selesai; berikutnya Step 0.3. Catatan progres di [Bagian 4.1](#41-log-keputusan--progres)                                     |
| Tanggal     | 2026-10-04                                                                                                                                                     |
| Basis kode  | branch `main` @ `e6fd8af`                                                                                                                                      |
| Sumber      | [`ARCHITECTURE_BLUEPRINT_FROM_NESTJS.md`](../../ARCHITECTURE_BLUEPRINT_FROM_NESTJS.md) (NestJS + Drizzle, proyek pemerintahan)                                 |
| Target      | Boilerplate umum Bun + Hono + Drizzle: `git clone` → `/init-project <nama>` → siap dikembangkan                                                                |
| Baseline    | Semua gate hijau: typecheck, lint, ls-lint, format, depcruise, depcheck, 74 test (unit + e2e). Coverage 98.46% — **menggelembung** (ikut menghitung file test) |
| Versi kunci | Bun 1.3.0 · Hono 4.13.9 · Zod 3.25.76 · drizzle-orm 0.40.1 · drizzle-kit 0.30.6 · ioredis 5.11.1 · pino 9.14.0 · axios 1.20.0 · TypeScript 5.9.3               |

---

## Daftar Isi

1. [Ringkasan & Prinsip](#1-ringkasan--prinsip)
2. [Baseline & Temuan Audit](#2-baseline--temuan-audit)
3. [Pemetaan NestJS → Bun + Hono](#3-pemetaan-nestjs--bun--hono)
4. [Keputusan](#4-keputusan)
5. [Roadmap & Progres](#5-roadmap--progres)
6. [Fase 0 — Fondasi Kerja & Quality Gate](#fase-0--fondasi-kerja--quality-gate)
7. [Fase 1 — Platform & Kontrak HTTP](#fase-1--platform--kontrak-http)
8. [Fase 2 — Data Layer](#fase-2--data-layer)
9. [Fase 3 — Auth JWT](#fase-3--auth-jwt)
10. [Fase 4 — Integrasi Outbound](#fase-4--integrasi-outbound)
11. [Fase 5 — Gateway Partner Inbound](#fase-5--gateway-partner-inbound)
12. [Fase 6 — Integration Test](#fase-6--integration-test)
13. [Fase 7 — Dokumentasi, Skills & Release](#fase-7--dokumentasi-skills--release)
14. [Definition of Done, Template Review & Risiko](#14-definition-of-done-template-review--risiko)
15. [Lampiran — Spesifikasi & Snippet Referensi](#15-lampiran--spesifikasi--snippet-referensi)

---

## 1. Ringkasan & Prinsip

### 1.1 Tujuan

1. Mengadopsi 8 pilar blueprint ke Bun + Hono: kontrak API seragam, isolasi layer, transaksi deklaratif, data layer teraudit, zero-trust access, zero-trust configuration, platform resilien & observable, quality gate yang ditegakkan mesin (+ AI agent governance).
2. **Generik** — tanpa istilah/prefix instansi (K/L, INSW, BEA_CUKAI, LNSW, SSO INSW, …).
3. **Auth JWT stateless** — access token (header `Authorization`) + refresh token di cookie `HttpOnly` + `Secure`, menggantikan SSO INSW (token opaque + introspeksi).
4. **Siap clone** — semua identitas proyek diganti oleh `/init-project <nama>` (`scripts/setup.ts`).

### 1.2 Prinsip eksekusi

| #   | Prinsip                                | Arti praktis                                                                                                                                                                                 |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Satu step, satu review**             | Setiap step = satu branch `<type>/<slug>` + satu commit/PR, dapat di-revert mandiri. AI agent berhenti setelah satu step dan melapor (§14.2); **commit & merge hanya setelah diminta user**. |
| P2  | **Enforce, don't document**            | Setiap aturan WAJIB punya penegak (tsc / ESLint / depcruise / ls-lint / test / CI). Aturan tanpa penegak ditandai eksplisit `[review-only]`.                                                 |
| P3  | **Compile-time > lint > review**       | Pilih penegakan paling awal (mis. schema referensi sebagai `.view().existing()` → mutasi gagal di `tsc`).                                                                                    |
| P4  | **Single Source of Truth**             | Satu angka/aturan hanya didefinisikan di satu tempat (`.agents/` untuk aturan agent, `IDENTITY_RULES` untuk identitas, `APP_ERROR_CODES` untuk kode error).                                  |
| P5  | **Gate hijau di setiap commit**        | `bun run validate:full` + `bun run build` lulus di setiap step; dokumen yang disentuh ikut diperbarui di commit yang sama.                                                                   |
| P6  | **Belum ada konsumen**                 | Perubahan breaking (casing request, envelope error, migrasi `0000`) dilakukan sekarang selagi belum ada FE/partner/deployment.                                                               |
| P7  | **Catat, jangan diam-diam menyimpang** | Setiap penyimpangan, temuan baru, atau penundaan dicatat di [Log Keputusan & Progres](#41-log-keputusan--progres) dengan tanggal.                                                            |

### 1.3 Non-tujuan (lihat [Backlog](#1512-l12--backlog))

SSO/OIDC eksternal, MFA, reset password via email, ACL permission granular, retry & circuit breaker outbound, partisi fisik `record_changes`, SonarQube, OpenTelemetry, job queue.

---

## 2. Baseline & Temuan Audit

**Sudah ada & berfungsi**: `createApp()` Hono, `ApiResponse` (output snake_case), `asyncHandler`, `validate()` Zod + getter, hierarki `ApiError`, `TransactionHost` + `@Transactional()` (AsyncLocalStorage), Pino + redaksi, `CacheService` fail-open, `HttpClientService` (axios keep-alive), `src/integrations/<vendor>`, health/liveness/readiness, modul `users` referensi, depcruise 20+ rule, ESLint strictTypeChecked + AST rule, ls-lint, commitlint, husky, `init-project`.

**Temuan** (dirujuk oleh step di fase terkait):

| ID  | Temuan                                                                                                                                                                                 | Bukti                                                                 | Step     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------- |
| G1  | Rate limiter memakai `X-Forwarded-For` mentah (bisa dipalsukan) dan store in-memory (tidak berlaku lintas instance)                                                                    | `src/app.ts` `keyGenerator`                                           | 1.7      |
| G2  | `X-Request-ID` diterima tanpa validasi (log injection); request ID tidak otomatis ada di log service                                                                                   | `core/middlewares/request-id.ts`                                      | 1.2      |
| G3  | `HttpClientService` meneruskan body respons vendor ke `details` dan status vendor (mis. 401) ke client                                                                                 | `core/http/http-client.service.ts` interceptor error                  | 4.1      |
| G4  | Redis `retryStrategy` mengembalikan `null` setelah 3 percobaan → tidak pernah reconnect sampai restart                                                                                 | `core/cache/redis.client.ts`                                          | 1.6      |
| G5  | Kontrak asimetris: request camelCase (`fullName`), response snake_case                                                                                                                 | `modules/users/users.dto.ts`                                          | 1.5      |
| G6  | Envelope error memuat `data: null`; code dibangun dinamis (`ERR_EXT_${origin}`); pesan satu bahasa                                                                                     | `core/middlewares/error-handler.ts`, `core/errors/external.error.ts`  | 1.3, 1.4 |
| G7  | Tidak ada batas ukuran body                                                                                                                                                            | `src/app.ts`                                                          | 1.7      |
| G8  | Schema referensi `ref_schema` ikut dibuat migrasi `0000`; tabel domain di `public`; `schemaFilter` dari env `DB_SCHEMA`                                                                | `drizzle/0000_quick_leader.sql`, `drizzle.config.ts`                  | 2.2      |
| G9  | Coverage ikut menghitung `*.test.ts`; tanpa ambang functions & per file; pre-push hanya `lint:branch`; belum ada CI                                                                    | `scripts/check-coverage.ts`, `.husky/pre-push`                        | 0.3      |
| G10 | Belum ada auth, actor, audit perubahan, soft delete                                                                                                                                    | —                                                                     | F2, F3   |
| G11 | List `users` tanpa `ORDER BY` → pagination tidak stabil                                                                                                                                | `users.repository.ts` `findAll`                                       | 2.8      |
| G12 | Belum ada dokumentasi OpenAPI                                                                                                                                                          | —                                                                     | 1.9      |
| G13 | Health hanya `ready`/`not_ready`, versi ter-prefix `/api/v1/health`                                                                                                                    | `modules/health/health.service.ts`                                    | 1.8      |
| G14 | **Larangan `c.json()` di controller tidak aktif**: override ESLint `src/modules/**/*.ts` (lebih akhir) mengganti seluruh array `no-restricted-syntax` milik override `*.controller.ts` | `eslint --print-config users.controller.ts` hanya memuat rule modules | 0.3      |
| G15 | Drift identitas: `package.json` `bun-hono-starter` vs `bun.lock` `backend-boilerplate`                                                                                                 | ditangani `IDENTITY_RULES` saat init                                  | ✅ setup |
| G16 | `case-converter.util.ts` coverage lines 85.71% (di bawah ambang per file yang direncanakan)                                                                                            | laporan `test:cov`                                                    | 0.3      |

---

## 3. Pemetaan NestJS → Bun + Hono

| Blueprint (NestJS)                           | Target (Bun + Hono)                                                                                                                            | Step     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `configureApp()` di `app.setup.ts`           | `createApp()` di `src/app.ts` — dipakai `index.ts` dan e2e (`app.request()`); urutan middleware di [L10](#1510-l10--urutan-pipeline-createapp) | 1.x      |
| Module + DI container                        | File per layer + singleton dengan default constructor param (D20)                                                                              | —        |
| `APP_GUARD AuthGuard` + `@Public()`          | Middleware global `authenticate()` default-deny + registry `PUBLIC_ROUTES` + test enumerasi route (D7)                                         | 3.4      |
| `@AdminOnly()` / `@RequireAcl()`             | Middleware `requireRole(...)` per route (D6)                                                                                                   | 3.4      |
| `PartnerGuard` + `@PartnerAuth()`            | Middleware `partnerAuth()` di prefix `/api/v1/partner/*` (D21)                                                                                 | 5.3      |
| `PartnerAuditInterceptor`                    | Bagian dari `partnerAuth()` (log setelah `await next()`, `try/finally`)                                                                        | 5.3      |
| CLS (`nestjs-cls`)                           | `AsyncLocalStorage` → `RequestContext { requestId, actor, locale, clientIp }` (D8)                                                             | 1.2      |
| `TransformInterceptor`                       | `ApiResponse.toJSON()` + `asyncHandler` (sudah ada)                                                                                            | —        |
| `HttpExceptionFilter`                        | `app.onError(globalErrorHandler)` + `app.notFound()` (sudah ada, diperkeras)                                                                   | 1.3      |
| `SnakeToCamelPipe` → `ZodValidationPipe`     | `validate()`: snake→camel + tolak key non-snake, lalu Zod (D10)                                                                                | 1.5      |
| `createZodDto` + `UuidParamDto` dst.         | Schema Zod bersama di `src/core/dto/` (`uuidParamSchema`, `paginationQuerySchema`, field waktu)                                                | 1.5, 2.1 |
| `@Transactional()` + `TransactionHost`       | Sama (sudah ada)                                                                                                                               | —        |
| `nestjs-pino` + `@InjectPinoLogger`          | `logger` Pino + `mixin` dari request context                                                                                                   | 1.2      |
| `I18N_MESSAGES` + resolver `Accept-Language` | `src/core/i18n/` (D11)                                                                                                                         | 1.4      |
| Swagger `@ApiStandardResponse`               | OpenAPI (D17, dipilih setelah spike)                                                                                                           | 1.9      |
| `helmet()` / body limit / `trust proxy`      | `secureHeaders()` / `bodyLimit()` / `getClientIp()` + `TRUST_PROXY_HOPS`                                                                       | 1.7      |
| Jest coverage SSOT                           | `bun:test` + `scripts/check-coverage.ts` ([L9](#159-l9--knip--check-coverage))                                                                 | 0.3      |
| depcheck / knip                              | knip (D19)                                                                                                                                     | 0.3      |
| `external-<vendor>` (`external-insw`)        | `src/integrations/<vendor>/`                                                                                                                   | 4.x      |
| `partner-credential` (K/L)                   | `src/modules/partner-credentials/` (generik)                                                                                                   | 5.x      |
| SSO INSW + ACL INSW + `ADMIN_GROUPS`         | JWT (access) + refresh token rotasi (cookie) + RBAC `ROLES` ([L3](#153-l3--spesifikasi-auth))                                                  | 3.x      |
| CSRF (tidak ada; SSO header-only)            | `hono/csrf` (Origin + `Sec-Fetch-Site`) pada endpoint ber-cookie (D4)                                                                          | 3.3      |

---

## 4. Keputusan

Semua keputusan **ACCEPTED** pada 2026-10-04 (Step 0.2). Perubahan berikutnya dicatat di [4.1](#41-log-keputusan--progres), bukan dengan mengedit tabel ini diam-diam.

| ID  | Keputusan                    | Opsi                                                               | Dipilih                                                                                                                                                        | Alasan / Dampak                                                                  | Step     |
| --- | ---------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| D0  | Alur branch repo boilerplate | (a) `main` + branch per step · (b) `development → staging → prod`  | **(a)**                                                                                                                                                        | Alur (b) untuk proyek turunan, bukan repo boilerplate                            | semua    |
| D1  | Model refresh token          | (a) JWT refresh stateless · (b) opaque di Redis · (c) opaque di DB | **(c)** hash SHA-256 di `auth_refresh_tokens`, rotasi tiap refresh, deteksi reuse per `family_id`                                                              | (a) tidak bisa dicabut; (b) Redis kita fail-open → state auth tidak boleh hilang | 3.2, 3.3 |
| D2  | Access token                 | HS256 · RS256/EdDSA + JWKS                                         | **HS256** via `hono/jwt`, TTL 15 menit, claims di [L3](#153-l3--spesifikasi-auth)                                                                              | Tanpa dependency baru; JWKS → backlog                                            | 3.1      |
| D3  | Cookie refresh               | —                                                                  | `refresh_token`; `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`; `Max-Age` = TTL refresh; tidak pernah di body                                         | `Secure` tetap berfungsi di `http://localhost` (secure context)                  | 3.3      |
| D4  | CSRF endpoint ber-cookie     | double-submit token · SameSite + Origin check                      | **SameSite + `hono/csrf`** (Origin allowlist = `CORS_ORIGINS`, `Sec-Fetch-Site`)                                                                               | FE tidak perlu mengelola token CSRF                                              | 3.3      |
| D5  | Identitas login              | —                                                                  | Email + password (`Bun.password`, argon2id); register publik mati (`AUTH_REGISTRATION_ENABLED=false`)                                                          | User dibuat admin                                                                | 3.3      |
| D6  | Otorisasi                    | RBAC sederhana · permission granular                               | **RBAC**: `users.role` ∈ `ROLES` (`admin`, `user`) + `requireRole()`                                                                                           | Granular → backlog                                                               | 3.4      |
| D7  | Model proteksi route         | per route · global default-deny                                    | **Default-deny** + `PUBLIC_ROUTES` + test enumerasi `app.routes`                                                                                               | Lupa memasang auth = celah                                                       | 3.4      |
| D8  | Request context              | oper `c` ke service · AsyncLocalStorage                            | **AsyncLocalStorage** `{ requestId, actor, locale, clientIp }`                                                                                                 | Service tetap tanpa Hono `Context` (Rule 4)                                      | 1.2      |
| D9  | Request ID                   | —                                                                  | Terima `X-Request-ID` bila `^[A-Za-z0-9._:-]{1,128}$`, selain itu `Bun.randomUUIDv7()`                                                                         | Cegah log injection                                                              | 1.2      |
| D10 | Casing request               | camelCase masuk · snake_case dua arah                              | **snake_case dua arah, strict** (key non-snake → 400); opt-out `preserveKeys`                                                                                  | Kontrak simetris; `details[].field` = nama yang dikirim FE                       | 1.5      |
| D11 | i18n                         | hanya `en` · `id` + `en`                                           | **`id` + `en`**, default `DEFAULT_LOCALE=id`, via `Accept-Language`                                                                                            | Pilar blueprint dipertahankan                                                    | 1.4      |
| D12 | Tipe error HTTP 409          | `BAD_REQUEST` (blueprint) · `CONFLICT`                             | **`CONFLICT`**                                                                                                                                                 | Lebih standar untuk boilerplate umum                                             | 1.3      |
| D13 | Tanggal & waktu              | `Date` · Temporal                                                  | **`temporal-polyfill`**, runtime & sesi DB UTC, 3 jenis waktu                                                                                                  | Cegah bug zona waktu                                                             | 2.1      |
| D14 | Schema Postgres              | `public` · schema bernama proyek                                   | **Satu `pgSchema` bernama proyek** di `schemas.ts`, terdaftar di `IDENTITY_RULES`; referensi = `.view().existing()`; migrasi `0000` di-generate ulang          | Isolasi & aman saat DB dipakai bersama                                           | 2.2      |
| D15 | Primary key                  | UUID v4 · UUID v7 · serial                                         | **UUID v7** aplikasi (`Bun.randomUUIDv7()`); tabel pencatatan `bigint identity`                                                                                | Index B-tree tidak terfragmentasi                                                | 2.2      |
| D16 | Audit perubahan              | —                                                                  | `record_changes` generik, partition-ready, ditulis base repository dalam transaksi yang sama                                                                   | Jejak UPDATE/DELETE tidak bisa dilewati                                          | 2.4      |
| D17 | OpenAPI                      | `@hono/zod-openapi` · `hono-openapi`                               | **`@hono/zod-openapi` + Scalar**, final setelah spike di Step 1.9                                                                                              | Kemungkinan perlu Zod v4                                                         | 1.9      |
| D18 | Rate limit                   | in-memory (`hono-rate-limiter`) · Redis                            | **Redis** `increment` atomik, fixed window, fail-open, kunci IP tepercaya                                                                                      | Berlaku multi-instance                                                           | 1.7      |
| D19 | Quality gate                 | —                                                                  | knip ganti depcheck; coverage tanpa file test, global lines & functions ≥ 95, per file lines ≥ 90; pre-push depcruise + knip + test; **CI GitHub Actions**     | Bun belum melaporkan branch coverage                                             | 0.3      |
| D20 | DI                           | container · singleton default param                                | **Singleton + default constructor param**                                                                                                                      | Sederhana, mudah di-mock                                                         | —        |
| D21 | Gateway partner              | penanda per route · prefix terpisah                                | **Prefix `/api/v1/partner/*`** + `partnerAuth()`, modul `partner-credentials`                                                                                  | Tidak tercampur dengan route JWT                                                 | 5.x      |
| D22 | Redis                        | —                                                                  | Reconnect tanpa batas (backoff ≤ 30 dtk), offline queue mati, `commandTimeout`, prefix otomatis `<APP_NAME>:<NODE_ENV>:`, `FLUSHALL`/`FLUSHDB`/`KEYS` diblokir | Resilien & aman dipakai bersama                                                  | 1.6      |

### 4.1 Log Keputusan & Progres

Catatan kronologis: keputusan, temuan, penyimpangan dari rencana, penundaan, dan step yang selesai. **Tambahkan baris baru di bawah; jangan mengubah baris lama.**

| Tanggal    | ID / Step | Catatan                                                                                                                                                                 | Detail                                                                                                                                         |
| ---------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-04 | Setup     | `.agents/` = satu-satunya sumber aturan & skill; `CLAUDE.md` hanya `@.agents/AGENTS.md`; `.claude/skills/<name>/SKILL.md` = wrapper penunjuk                            | Symlink tidak dipakai: `core.symlinks=false` (Windows) membuat symlink ter-checkout sebagai file teks                                          |
| 2026-10-04 | Setup     | Proteksi `.env` ditegakkan mesin: `.claude/settings.json` (`permissions.deny`) + hook `PreToolUse` `.claude/hooks/protect-env.mjs`                                      | 13 kasus uji (termasuk path Windows) lulus                                                                                                     |
| 2026-10-04 | Setup     | Ditemukan & diperbaiki: hook awalnya memeriksa **isi** file yang ditulis → kode yang menyebut string env diblokir                                                       | Kini hanya field `file_path`, `path`, `pattern`, `glob`, `notebook_path`, `command`                                                            |
| 2026-10-04 | Setup     | Link absolut `file:///d:/…` di `project-standards/SKILL.md` dan `CONTRIBUTING.md` → relatif                                                                             | Tidak portabel antar mesin                                                                                                                     |
| 2026-10-04 | Setup     | Skill `init-project` + `scripts/setup.ts` dengan registry `IDENTITY_RULES` (drift guard: rule tanpa match → abort tanpa menulis apa pun), `--dry-run`, `--description`  | Diuji di salinan repo: rename, rename ulang, nama invalid, drift                                                                               |
| 2026-10-04 | Setup     | Ditemukan & diperbaiki saat uji: `parseArgs` mengabaikan argumen pertama bila `--description` tidak diberikan                                                           | —                                                                                                                                              |
| 2026-10-04 | Setup     | Dokumen `.agents/` dibuat agnostik nama proyek; `AGENTS.md` invariant #10 (Single-Source Project Identity)                                                              | Mengurangi jumlah `IDENTITY_RULES`                                                                                                             |
| 2026-10-04 | 0.1       | ✅ Baseline commit `df3c0da`; branch `master` → `main`                                                                                                                  | 127 file; `.env` & `coverage/` diverifikasi tidak ter-commit; pre-commit hook hijau                                                            |
| 2026-10-04 | 0.2       | ✅ D0–D22 ACCEPTED sesuai rekomendasi (`e6fd8af`)                                                                                                                       | D17 final setelah spike Step 1.9                                                                                                               |
| 2026-10-04 | Plan      | Plan ditulis ulang lebih detail mengikuti format `docs/plans/from-nestjs-plan.md` (log progres, masalah → solusi → langkah → acceptance criteria, lampiran spesifikasi) | Atas permintaan user                                                                                                                           |
| 2026-10-04 | Plan      | Temuan verifikasi API: Hono 4.13 menyediakan `hono/csrf` (Origin + `Sec-Fetch-Site`), `hono/jwt` `verify` dengan opsi `iss`/`aud`, `hono/conninfo`, `hono/body-limit`   | D4 memakai `hono/csrf` (bukan middleware buatan sendiri)                                                                                       |
| 2026-10-04 | G14       | Ditemukan: larangan `c.json()` di controller tidak aktif (override ESLint saling menimpa)                                                                               | Perbaikan dijadwalkan di Step 0.3 (komposisi grup rule, [L7](#157-l7--snippet-eslint))                                                         |
| 2026-10-04 | Desain    | **Perlu konfirmasi di Step 3.2**: `auth_refresh_tokens` dikecualikan dari aturan "update hanya lewat base repository + `record_changes`"                                | Rotasi token = state keamanan bervolume tinggi; jejaknya sudah ada di `revoked_at`/`replaced_by_id`. Pengecualian eksplisit di ESLint + alasan |
| 2026-10-04 | Desain    | Actor default di request yang belum terautentikasi = `anonymous`; di luar request = `system`                                                                            | Melengkapi D8                                                                                                                                  |
| 2026-10-04 | Desain    | `record_changes` disimpan di schema proyek (D14), bukan schema `system` terpisah                                                                                        | Satu schema dimigrasi; selaras blueprint                                                                                                       |
| 2026-10-04 | Catatan   | `docs/plans/from-nestjs-plan.md` (referensi format) belum di-commit                                                                                                     | Menunggu keputusan user: commit ke `docs/archive/` bersama blueprint (Step 7.1) atau tetap lokal                                               |
| 2026-10-04 | Desain    | ✅ Dikonfirmasi user: `auth_refresh_tokens` dikecualikan dari aturan audit base repository (baris "Perlu konfirmasi di Step 3.2" di atas)                               | Diterapkan di Step 3.2 lewat override ESLint satu file + komentar alasan                                                                       |
| 2026-10-04 | Catatan   | `docs/plans/from-nestjs-plan.md` **tidak** di-commit dan tidak diarsipkan                                                                                               | Keputusan user: file akan dihapus sendiri oleh user                                                                                            |
| 2026-10-04 | Proses    | **AI agent tidak pernah commit atau merge sebelum diminta user.** Step diakhiri dengan perubahan di working tree + usulan pesan commit                                  | Keputusan user (semua perubahan direview dulu); berlaku juga di `AGENTS.md`. P1 & §14 disesuaikan                                              |
| 2026-10-04 | Plan      | Merge `0882a83` (plan detail) ke `main` disetujui user, tetapi merge oleh agent diblokir permission tool                                                                | Merge dijalankan user: `git switch main && git merge --ff-only docs/detailed-adoption-plan`                                                    |

---

## 5. Roadmap & Progres

```
F0 Fondasi ──► F1 Platform & Kontrak ──► F2 Data Layer ──► F3 Auth JWT ──► F5 Partner ──► F6 Integration ──► F7 Docs & Release
                     │                                         ▲
                     └──► F4 Outbound (boleh paralel setelah 1.3) ┘
```

| Fase | Fokus                        | Branch (contoh)              | Bergantung pada | Ukuran |
| ---- | ---------------------------- | ---------------------------- | --------------- | ------ |
| F0   | Fondasi kerja & quality gate | `chore/quality-gate-parity`  | —               | M      |
| F1   | Platform & kontrak HTTP      | `feat/<step-slug>` per step  | F0              | L      |
| F2   | Data layer                   | `feat/<step-slug>` per step  | F0, 1.2         | L      |
| F3   | Auth JWT                     | `feat/<step-slug>` per step  | F1, F2          | L      |
| F4   | Integrasi outbound           | `feat/http-client-hardening` | 1.3             | S      |
| F5   | Gateway partner              | `feat/<step-slug>` per step  | F2, F3          | M      |
| F6   | Integration test             | `test/integration-suite`     | F3, F5          | M      |
| F7   | Dokumentasi, skills, release | `docs/<slug>`                | F0–F6           | M      |

Legenda status: ⬜ belum · 🔄 dikerjakan · 👀 menunggu review · ✅ selesai · ⏸ ditunda

| Step | Judul                                                       | Status | Bergantung pada | Commit    |
| ---- | ----------------------------------------------------------- | ------ | --------------- | --------- |
| 0.1  | Baseline commit                                             | ✅     | —               | `df3c0da` |
| 0.2  | Review rencana & keputusan                                  | ✅     | 0.1             | `e6fd8af` |
| 0.3  | Paritas quality gate (ESLint, coverage, knip, hooks, CI)    | ⬜     | 0.2             |           |
| 1.1  | Konfigurasi per grup + `parseEnv`                           | ⬜     | 0.3             |           |
| 1.2  | Request context, request ID, logger mixin                   | ⬜     | 1.1             |           |
| 1.3  | Kontrak error + registry `APP_ERROR_CODES`                  | ⬜     | 1.2             |           |
| 1.4  | i18n `id`/`en`                                              | ⬜     | 1.3             |           |
| 1.5  | Kontrak request snake_case + DTO bersama                    | ⬜     | 1.3             |           |
| 1.6  | Ketahanan Redis & `CacheService` lanjutan                   | ⬜     | 1.1             |           |
| 1.7  | Hardening platform (IP klien, body limit, CORS, rate limit) | ⬜     | 1.2, 1.6        |           |
| 1.8  | Health `UP`/`DEGRADED`/`DOWN` + base path                   | ⬜     | 1.6             |           |
| 1.9  | Dokumentasi OpenAPI                                         | ⬜     | 1.5             |           |
| 2.1  | Standar tanggal & waktu (Temporal)                          | ⬜     | 0.3             |           |
| 2.2  | Schema proyek, column helpers, UUID v7, schema referensi    | ⬜     | 2.1             |           |
| 2.3  | Test helper data layer                                      | ⬜     | 2.2             |           |
| 2.4  | `record_changes` + `AuditedRepository`                      | ⬜     | 1.2, 2.3        |           |
| 2.5  | `BaseRepository` + `ChildRepository`                        | ⬜     | 2.4             |           |
| 2.6  | Penegakan aturan data layer                                 | ⬜     | 2.5             |           |
| 2.7  | Test konvensi schema                                        | ⬜     | 2.5             |           |
| 2.8  | Migrasi modul `users` + template scaffold                   | ⬜     | 2.6, 2.7        |           |
| 3.1  | Primitif keamanan & config auth                             | ⬜     | 1.1             |           |
| 3.2  | Schema auth (`role`, `auth_refresh_tokens`)                 | ⬜     | 2.8             |           |
| 3.3  | Modul `auth` (login, refresh, logout, me)                   | ⬜     | 3.1, 3.2, 1.7   |           |
| 3.4  | `authenticate()` default-deny + `requireRole()`             | ⬜     | 3.3             |           |
| 3.5  | Proteksi `users`, seed admin, panduan FE                    | ⬜     | 3.4             |           |
| 4.1  | Hardening `HttpClientService`                               | ⬜     | 1.3             |           |
| 4.2  | Template integrasi & cache token vendor                     | ⬜     | 4.1             |           |
| 5.1  | Utilitas kripto & signing partner                           | ⬜     | 0.3             |           |
| 5.2  | Kredensial partner (schema + admin API)                     | ⬜     | 5.1, 2.8, 3.4   |           |
| 5.3  | Middleware `partnerAuth()`                                  | ⬜     | 5.2, 1.6        |           |
| 5.4  | Panduan integrasi partner                                   | ⬜     | 5.3             |           |
| 6.1  | Integration test (Postgres + Redis asli)                    | ⬜     | 3.5, 5.3        |           |
| 7.1  | `ARCHITECTURE.md` generik + sinkronisasi docs               | ⬜     | 6.1             |           |
| 7.2  | Finalisasi skills AI                                        | ⬜     | 7.1             |           |
| 7.3  | Release check boilerplate v1.0.0                            | ⬜     | 7.2             |           |

---

## Fase 0 — Fondasi Kerja & Quality Gate

### Step 0.1 — Baseline commit ✅

- **Hasil**: `df3c0da chore: initial boilerplate baseline`, branch `main`.
- [x] `git log` berisi satu commit baseline.
- [x] `.env` dan `coverage/` tidak ter-commit (diverifikasi dari daftar file staged).
- [x] Pre-commit hook hijau (eslint, prettier, tsc, ls-lint, depcruise).

### Step 0.2 — Review rencana & keputusan ✅

- **Hasil**: `e6fd8af docs(plans): approve blueprint adoption decisions d0-d22`.
- [x] D0–D22 berstatus ACCEPTED.

### Step 0.3 — Paritas quality gate

**Tujuan**: semua aturan yang diklaim "ditegakkan" benar-benar ditegakkan, sebelum perubahan besar dimulai (G9, G14, G16).

| Masalah                                                                                | Solusi                                                                                                                |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Override ESLint `no-restricted-syntax` saling menimpa → larangan `c.json()` mati (G14) | Grup rule sebagai konstanta, dikomposisikan per area ([L7](#157-l7--snippet-eslint))                                  |
| Coverage menghitung file test; tanpa ambang functions & per file (G9)                  | `check-coverage.ts` baru ([L9](#159-l9--knip--check-coverage))                                                        |
| `case-converter.util.ts` 85.71% (G16)                                                  | Tambah test cabang yang belum tercakup                                                                                |
| depcheck hanya mendeteksi dependency                                                   | knip: dependency + file + export tak terpakai                                                                         |
| `pre-push` hanya `lint:branch`; `lint:arch` justru di pre-commit (lambat)              | pre-commit: lint-staged → tsc → ls-lint · pre-push: lint:branch → lint:arch → lint:deps → `bun test`                  |
| Tanpa CI                                                                               | `.github/workflows/ci.yml` ([L8](#158-l8--ci-github-actions))                                                         |
| `eslint-disable` bisa dipakai tanpa alasan                                             | `@eslint-community/eslint-plugin-eslint-comments`: `require-description`, `no-unlimited-disable`, `no-unused-disable` |

**Langkah**

1. `eslint.config.mjs`: definisikan `CONTROLLER_RULES`, `MODULE_IMPORT_RULES` (selector `db`/`sqlClient`/`HttpClientService`), lalu override `*.controller.ts` = `[...MODULE_IMPORT_RULES, ...CONTROLLER_RULES]`. Override lain yang memakai `no-restricted-syntax` mengikuti pola yang sama.
2. Tambah plugin `eslint-comments` (devDependency) dengan tiga rule di atas; script `lint` → `eslint src test scripts --max-warnings 0`.
3. Tulis ulang `scripts/check-coverage.ts` sesuai L9; tambah test untuk `case-converter.util.ts` hingga ≥ 90% lines.
4. Pasang `knip` (devDependency), buat `knip.json` (L9), ganti script `lint:deps` → `knip`, hapus `depcheck` + `.depcheckrc.json`; bereskan temuan knip (hapus export mati, bukan meng-ignore).
5. `.husky/pre-commit` dan `.husky/pre-push` sesuai tabel di atas.
6. Tambah `.github/workflows/ci.yml` (L8) dan `.editorconfig` (`root = true`, `end_of_line = lf`, `charset = utf-8`, `indent_size = 2`, `insert_final_newline = true`).
7. Perbarui `CONTRIBUTING.md` §1, `project-standards` §6, bagian quality gate di `AGENTS.md` (depcheck → knip, ambang coverage baru).

**Acceptance criteria (chaos test — setiap pelanggaran dibuat sementara, dibuktikan gagal, lalu dihapus)**

- [ ] `return c.json({})` di `*.controller.ts` → error ESLint.
- [ ] `import { db } from '../../database/connection'` di `*.controller.ts` → error ESLint **dan** depcruise.
- [ ] `// eslint-disable-next-line` tanpa `-- <alasan>` → error ESLint.
- [ ] File sumber baru tanpa test → `test:cov` gagal (ambang per file) dan menyebut nama filenya.
- [ ] Export yang tidak dipakai di mana pun → `knip` gagal.
- [ ] `bun run validate:full` hijau; coverage nyata (tanpa file test) dilaporkan dan ≥ ambang.
- [ ] Workflow CI hijau pada PR pertama.

---

## Fase 1 — Platform & Kontrak HTTP

### Step 1.1 — Konfigurasi per grup + `parseEnv`

**Tujuan**: setiap fase berikutnya menambah env var di tempat yang jelas, tervalidasi, dan teruji.

**Langkah**

1. `src/config/parse-env.ts`: `parseEnv<T extends z.ZodTypeAny>(schema: T, source: Record<string, string | undefined>): z.infer<T>` — `safeParse`, lempar `Error` berisi daftar `VAR: pesan` per baris (tanpa mencetak nilai).
2. Pecah `env.config.ts`:
   - `app.config.ts`: `NODE_ENV`, `PORT`, `APP_NAME`, `API_BASE_PATH`, `LOG_LEVEL`
   - `database.config.ts`: `DATABASE_URL`, `DB_MAX_CONNECTIONS`, `DB_IDLE_TIMEOUT_SECONDS`
   - `redis.config.ts`: `REDIS_*`
   - `http.config.ts`: `CORS_*`, `RATE_LIMIT_*` (nilai baru menyusul di 1.7)
   - `integrations.config.ts`: `JSONPLACEHOLDER_*`
3. `src/config/index.ts` me-re-export `appConfig`, `databaseConfig`, … ; `env.config.ts` dihapus, semua import diperbarui.
4. Pengetatan: `PORT` `int().positive()`, URL `z.string().url()`, enum log level.
5. Perbarui `IDENTITY_RULES` (default `APP_NAME` pindah ke `app.config.ts`) — dry-run `bun run setup demo --dry-run` harus tetap lulus.
6. Kelompokkan `.env.example` per file config, beri komentar.

**Acceptance criteria**

- [ ] Test: env invalid → error menyebut semua variabel yang salah, tanpa nilainya.
- [ ] `process.env` hanya muncul di `src/config/**` (ESLint `no-process-env`, sudah ada).
- [ ] `bun run setup demo --dry-run` lulus (drift guard).

### Step 1.2 — Request context, request ID, logger mixin

**Tujuan**: pengganti CLS (D8, D9, G2).

**Langkah**

1. `src/core/context/request-context.ts`:
   ```ts
   export interface RequestContext {
     requestId: string;
     actor: Actor;
     locale: Locale;
     clientIp?: string;
   }
   export type Actor = `user:${string}` | `partner:${string}` | 'system' | 'anonymous';
   export const getRequestContext = (): RequestContext | undefined => storage.getStore();
   export const getActor = (): Actor => storage.getStore()?.actor ?? 'system';
   export const runWithRequestContext = <T>(
     ctx: RequestContext,
     fn: () => Promise<T>,
   ): Promise<T> => storage.run(ctx, fn);
   export const setActor = (actor: Actor): void => {
     /* mutasi store aktif; no-op di luar request */
   };
   ```
2. `src/utils/request-id.util.ts` (murni): `resolveRequestId(header?: string): string` sesuai D9.
3. Middleware `requestContext()` menggantikan `requestIdMiddleware`: resolve ID, set header respons `X-Request-ID`, jalankan `next()` di dalam `runWithRequestContext` (actor awal `anonymous`, locale default).
4. Pino `mixin()` → `{ requestId, actor }` dari context; hapus pengambilan manual `c.get('requestId')` di `loggerMiddleware` & `globalErrorHandler`.
5. `TransactionHost` dan context memakai instance `AsyncLocalStorage` terpisah — test memastikan keduanya bersarang dengan benar.

**Acceptance criteria**

- [ ] `X-Request-ID: "evil\nline"` → diganti UUID v7; header respons berisi ID final.
- [ ] Dua request paralel (`Promise.all`) tidak saling bocor context.
- [ ] Log dari dalam service memuat `requestId` tanpa dioper manual (test dengan destination pino in-memory).
- [ ] Di luar request (`bootstrap`), `getActor()` = `system`.

### Step 1.3 — Kontrak error + registry `APP_ERROR_CODES`

**Tujuan**: envelope error sesuai blueprint (G6, D12); daftar kode di [L2](#152-l2--error-types--app_error_codes).

| Masalah                                | Solusi                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `data: null` di envelope error         | Dihapus; envelope error = `success, status_code, message, error, request_id, timestamp` |
| Code dinamis `ERR_EXT_${origin}`       | Code tetap dari registry; vendor diidentifikasi lewat `error.origin`                    |
| Tidak ada 413 / 429 / 503              | `PayloadTooLargeError`, `TooManyRequestsError`, `ServiceUnavailableError`               |
| 409 tanpa tipe sendiri                 | `ConflictError` → `error.type = "CONFLICT"` (D12)                                       |
| `details[].field` bisa `body.fullName` | Diubah ke snake_case, prefix internal dibuang                                           |

**Langkah**

1. `src/core/errors/error-codes.ts`: `APP_ERROR_CODES` + `ERROR_TYPES` (`as const`), tipe turunan `AppErrorCode`, `ErrorType`.
2. `ApiError`: `errorCode: AppErrorCode`, `errorType: ErrorType` (bukan `string`).
3. Tambah tiga class error di atas; `ExternalServiceError(kind: 'TIMEOUT' | 'UNREACHABLE' | 'ERROR', origin)` → status 504/502/502.
4. `globalErrorHandler` & `notFoundHandler`: satu fungsi `buildErrorBody()` dipakai keduanya; 500 tidak pernah membocorkan pesan internal.
5. ESLint ([L7](#157-l7--snippet-eslint)): literal `/^ERR_/` dilarang di luar `error-codes.ts`; `throw new Error(` dilarang di `src/modules/**` (wajib `ApiError`).

**Acceptance criteria**

- [ ] Snapshot test envelope untuk setiap `error.type` (termasuk 404 route & 500).
- [ ] `throw new Error('x')` di service → error ESLint.
- [ ] `'ERR_X'` di file modul → error ESLint.

### Step 1.4 — i18n `id`/`en`

**Tujuan**: pesan dwibahasa (D11).

**Langkah**

1. `src/core/i18n/messages.ts`: `I18N_MESSAGES = { USER_CREATED: { id: 'Pengguna berhasil dibuat', en: 'User created successfully' }, … } as const`; tipe `LocalizedMessage = { id: string; en: string }`.
2. `src/utils/locale.util.ts` (murni): `resolveLocale(acceptLanguage, supported, fallback)` sesuai RFC 9110 (urut q-value; `"id, en;q=0.1"` → `id`).
3. `requestContext()` mengisi `locale` (memakai `resolveLocale`, default `DEFAULT_LOCALE`).
4. `ApiResponse` & `ApiError` menerima `LocalizedMessage`; diterjemahkan saat serialisasi (`toJSON()` / `globalErrorHandler`) berdasarkan locale context.
5. Pesan validasi generik dwibahasa (`VALIDATION_FAILED`); pesan per field dari Zod tetap apa adanya (dicatat sebagai keterbatasan).
6. ESLint: argumen pesan berupa string literal untuk `new ApiResponse(` / `new *Error(` di `src/modules/**` dilarang.

**Acceptance criteria**

- [ ] `Accept-Language: en` → pesan en; tanpa header → `DEFAULT_LOCALE`; locale tak didukung → fallback.
- [ ] `new ApiResponse(data, 'ok')` di controller → error ESLint.

### Step 1.5 — Kontrak request snake_case + DTO bersama

**Tujuan**: kontrak simetris (G5, D10).

**Langkah**

1. `case-converter.util.ts`: `snakeToCamelCase(value)` rekursif + `isSnakeCaseKey(key)`; implementasi linear (hindari regex ReDoS — temuan proyek lama).
2. `validate()` untuk `body` & `query`: kumpulkan key non-snake_case (rekursif, path lengkap) → `ValidationError` 400 berisi `details` per key; lalu konversi → Zod. `params` tidak dikonversi.
3. Opsi `validate({ body, preserveKeys: ['metadata'] })` — subtree key tersebut tidak dicek & tidak dikonversi (hanya top-level, didokumentasikan).
4. `src/core/dto/common.dto.ts`: `uuidParamSchema`, `uuidChildParamSchema` (`id` + `childId`), `numericIdParamSchema`, `paginationQuerySchema` (`page`, `per_page` ≤ 100).
5. DTO `users` & e2e diperbarui ke snake_case.

**Acceptance criteria**

- [ ] `{ "full_name": "A" }` diterima; `{ "fullName": "A" }` → 400 dengan `field: "fullName"`.
- [ ] Error validasi field bertingkat → `field: "address.postal_code"` (snake_case, tanpa prefix `body.`).
- [ ] Test regresi waktu: key 100k karakter diproses < 50 ms.

### Step 1.6 — Ketahanan Redis & `CacheService` lanjutan

**Tujuan**: blueprint §6 (G4, D22).

| Masalah                                     | Solusi                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Berhenti reconnect setelah 3x               | `retryStrategy: (n) => Math.min(n * 500, 30_000)` (tanpa batas)                                              |
| Command menggantung saat Redis lambat       | `commandTimeout = REDIS_COMMAND_TIMEOUT_MS` (default 1000), `enableOfflineQueue: false`                      |
| Prefix opsional (default kosong)            | Default `<APP_NAME>:<NODE_ENV>:`; override via `REDIS_KEY_PREFIX`                                            |
| Perintah berbahaya bisa dipanggil           | Wrapper menolak `flushall`, `flushdb`, `keys` (lempar error)                                                 |
| Tidak ada primitif untuk rate limit & nonce | `increment(key, ttlSeconds)` (Lua `INCR` + `EXPIRE NX`), `setIfAbsent(key, value, ttlSeconds)` (`SET NX EX`) |
| Lookup input tak tepercaya selalu ke DB     | `getOrSet(key, ttl, fetcher, { negativeTtl })` — sentinel `{"__nil":1}`                                      |

**Langkah**: implementasi tabel di atas di `redis.client.ts` & `cache.service.ts`; semua method baru fail-open (Redis gagal → `increment` mengembalikan `null`, `setIfAbsent` mengembalikan `true`, dicatat `warn`); `CACHE_KEYS` tetap SSOT; `references/redis-cache.md` diperbarui.

**Acceptance criteria**

- [ ] Test fail-open untuk setiap method (client di-mock melempar / status bukan `ready`).
- [ ] `getOrSet` tidak meng-cache saat fetcher melempar error.
- [ ] Pemanggilan `flushall` → error.

### Step 1.7 — Hardening platform

**Tujuan**: G1, G7, D18.

**Langkah**

1. `src/core/middlewares/client-ip.ts`: `getClientIp(c)` — `getConnInfo(c)` (`hono/bun`) sebagai alamat socket; bila `TRUST_PROXY_HOPS = n > 0`, ambil entri ke-`n` dari kanan `X-Forwarded-For`; normalisasi `::ffff:`. Disimpan di request context.
2. `bodyLimit({ maxSize: HTTP_BODY_LIMIT_BYTES, onError })` → `PayloadTooLargeError` (413, envelope standar).
3. CORS: `CORS_ORIGINS` (CSV URL; kosong = CORS mati; `*` ditolak Zod saat `NODE_ENV=production`), `credentials: true`, `exposeHeaders: ['X-Request-ID', 'Retry-After', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset']`, `allowMethods` + `PATCH`.
4. `src/core/middlewares/rate-limit.ts`: `rateLimit({ windowSeconds, max, keyPrefix })` memakai `cacheService.increment`; header `RateLimit-*`; lewat batas → `TooManyRequestsError` + `Retry-After`; Redis gagal → lolos.
5. Hapus dependency `hono-rate-limiter`; daftarkan middleware sesuai urutan [L10](#1510-l10--urutan-pipeline-createapp).

**Acceptance criteria**

- [ ] `TRUST_PROXY_HOPS=0` + `X-Forwarded-For` palsu → kunci rate limit tetap IP socket.
- [ ] `TRUST_PROXY_HOPS=1` → IP diambil dari entri paling kanan.
- [ ] Body > limit → 413 `ERR_PAYLOAD_TOO_LARGE`.
- [ ] Request ke-(max+1) → 429 + `Retry-After`; Redis mati → 200.
- [ ] Preflight dari origin tak terdaftar → tanpa header `Access-Control-Allow-Origin`.

### Step 1.8 — Health `UP`/`DEGRADED`/`DOWN` + base path

**Tujuan**: G13.

**Langkah**

1. Ganti `API_PREFIX=/api/v1` → `API_BASE_PATH=/api`; route ber-versi di-mount sebagai `app.route('/api/v1', v1Router)` (versi adalah kode, bukan env).
2. Health tanpa versi: `GET /api/health` (selalu 200, `status: UP | DEGRADED | DOWN`, detail komponen `database`, `redis`), `GET /api/health/readiness` (503 `SERVICE_UNAVAILABLE` hanya bila DB down), `GET /api/health/liveness` (selalu 200, tanpa dependency).
3. Perbarui e2e, README, `.env.example`.

**Acceptance criteria**

- [ ] DB up + Redis up → `UP`; Redis down → `DEGRADED` (readiness 200); DB down → `DOWN` (readiness 503).

### Step 1.9 — Dokumentasi OpenAPI

**Tujuan**: G12, D17.

**Langkah**

1. **Spike (time-box, hasil dicatat di 4.1)**: pasang `@hono/zod-openapi` di branch spike, ukur dampak — versi Zod yang disyaratkan, perubahan pola route (`createRoute` + `app.openapi`), kompatibilitas dengan `validate()` (snake_case strict) dan `asyncHandler`. Bandingkan dengan `hono-openapi` (`describeRoute` + validator middleware).
2. Implementasi pilihan: komponen bersama `SuccessEnvelope<T>`, `PaginatedEnvelope<T>`, `ErrorEnvelope`; schema ditampilkan snake_case (post-processor `toSnakeCaseOpenApi()` di `src/utils/`); security scheme `bearerAuth` (dipakai Fase 3) dan header partner (Fase 5).
3. `GET /api/docs/openapi.json` + UI Scalar `GET /api/docs`, hanya bila `API_DOCS_ENABLED` (default `true` kecuali production).
4. Modul `users` & `health` terdokumentasi; template `scaffold-module` diperbarui.

**Acceptance criteria**

- [ ] Test: setiap route di `app.routes` (kecuali docs) ada di spec.
- [ ] Semua properti schema di spec snake_case.
- [ ] Production → `/api/docs` 404.

---

## Fase 2 — Data Layer

### Step 2.1 — Standar tanggal & waktu

**Tujuan**: D13. Tiga jenis waktu, tidak dicampur:

| Jenis            | Nama field             | Kolom DB                      | Format API                                 |
| ---------------- | ---------------------- | ----------------------------- | ------------------------------------------ |
| Instant          | `*_at`                 | `timestamptz`                 | ISO 8601 UTC `Z`; request wajib ber-offset |
| Tanggal kalender | `*_date`               | `date`                        | `YYYY-MM-DD`                               |
| Jadwal lokal     | instant + `*_timezone` | `timestamptz` + `text` (IANA) | instant + zona IANA                        |

**Langkah**

1. Dependency `temporal-polyfill`; `src/utils/datetime.util.ts`: `nowInstant()`, `toIsoUtc(instant)`, `parseInstant(str)` (tolak tanpa offset), `parseCalendarDate(str)`, `dayRangeInZone(date, zone)` → `{ start, end }`, `wallTimeToInstant(date, time, zone)` (DST ambigu/gap → error), konversi `Date ⇄ Temporal.Instant` untuk boundary driver.
2. `src/core/dto/datetime.dto.ts`: `instantField`, `calendarDateField`, `timeZoneField` (validasi IANA).
3. `Dockerfile`, `docker-compose*.yml`: `TZ=UTC`; `connection.ts`: `connection: { TimeZone: 'UTC' }`; script test `TZ=UTC`.
4. ESLint ([L7](#157-l7--snippet-eslint)): `new Date(<arg>)`, `Date.parse`, getter/formatter waktu lokal dilarang di luar `datetime.util.ts`.

**Acceptance criteria**

- [ ] Test DST (mis. `America/New_York` 2026-03-08 02:30 → ditolak), batas hari `Asia/Jayapura` vs UTC.
- [ ] `new Date('2026-01-01')` di modul → error ESLint.

### Step 2.2 — Schema proyek, column helpers, UUID v7, schema referensi

**Tujuan**: D14, D15, G8.

**Langkah**

1. `src/database/schema/schemas.ts` — satu-satunya tempat `pgSchema`:
   ```ts
   export const APP_SCHEMA_NAME = 'bun_hono_starter'; // diganti init-project (IDENTITY_RULES)
   export const appSchema = pgSchema(APP_SCHEMA_NAME);
   export const referenceSchema = pgSchema('reference'); // contoh; hanya untuk view .existing()
   ```
2. `IDENTITY_RULES`: tambah rule `APP_SCHEMA_NAME` (nilai `<snake_name>`); `drizzle.config.ts` `schemaFilter: [APP_SCHEMA_NAME]` (import konstanta); hapus env `DB_SCHEMA`.
3. `src/database/schema/columns.ts`: `uuidPrimaryKey()` (`uuid().primaryKey().$defaultFn(() => Bun.randomUUIDv7())`), `sequentialPrimaryKey()` (`bigint identity`), `timestamps`, `auditColumns` (`created_by`, `updated_by` `varchar(150)`), `softDelete` (`deleted_at`), `parentReference(table)` (FK + wajib index), `instant(name)`, `calendarDate(name)`, `timeZoneColumn(name)`, `activeUniqueIndex(name, cols)` (`WHERE deleted_at IS NULL`).
4. Contoh referensi: `refRoles` → `referenceSchema.view('ref_roles', {...}).existing()`.
5. Hapus `drizzle/0000_*` + `meta/`, generate ulang (`bun run db:generate`) — **developer** menjalankan migrasi ke DB lokal.
6. ESLint: `pgSchema(` dilarang di luar `schemas.ts`; `timestamp(`, `serial(`, `pgTable(` dilarang di `schema/**` selain `columns.ts`/`schemas.ts`.

**Acceptance criteria**

- [ ] Migrasi `0000` baru hanya berisi `CREATE SCHEMA "<app_schema>"` + tabel domain (tanpa `reference`).
- [ ] `db.insert(refRoles)` → error `tsc` (test `@ts-expect-error`).
- [ ] `bun run setup demo-app --dry-run` mendaftar perubahan `APP_SCHEMA_NAME`; diuji di salinan repo.

### Step 2.3 — Test helper data layer

**Langkah**: `test/helpers/drizzle-mock.ts` — `createDrizzleChainMock(result)` (chain `select/from/where/limit/for/insert/values/returning/update/set` yang bisa di-assert), `createTxHostMock(chain)`, `renderWhere(condition)` (me-render SQL + params via `PgDialect`, untuk assertion kondisi persis, mis. `deleted_at is null`). Ls-lint mengizinkan `test/helpers/`.

**Acceptance criteria**

- [ ] `users.repository.test.ts` memakai helper (tanpa mock chain manual).

### Step 2.4 — `record_changes` + `AuditedRepository`

**Tujuan**: D16. DDL di [L6](#156-l6--ddl-record_changes).

**Langkah**

1. `schema/domain/record-changes.schema.ts` (di `appSchema`).
2. `src/utils/record-diff.util.ts` (murni): `diffRecords(before, after, { redact, ignore: ['updatedAt'] })` → hanya kolom berubah, nilai kolom `redact` → `'[REDACTED]'`; `snapshot(record, { redact })`.
3. `src/database/audited.repository.ts` (abstract): `protected async lockById(id)` (`SELECT … FOR UPDATE` via `.for('update')`), `protected async writeChange(action, recordId, changes)` (actor & request ID dari context). Semua lewat `this.txHost.tx`; method publik turunan wajib berjalan di transaksi (`runInTransaction` internal bila belum ada).

**Acceptance criteria**

- [ ] UPDATE yang tidak mengubah apa pun → tidak menulis `record_changes`.
- [ ] Error setelah update (dalam transaksi) → audit ikut rollback (test dengan txHost mock; diuji nyata di 6.1).
- [ ] Kolom `redact` tercatat `[REDACTED]`.

### Step 2.5 — `BaseRepository` + `ChildRepository`

**Jenis tabel** (panduan masuk `references/database.md`):

| Jenis      | Ciri                                | Kolom kunci                                                     | Repository                                        |
| ---------- | ----------------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| Mandiri    | Berdiri sendiri                     | `uuidPrimaryKey` + `timestamps` + `auditColumns` + `softDelete` | `BaseRepository`                                  |
| Header     | Mandiri yang punya detail           | sama                                                            | `BaseRepository` + `ChildRepository` (modul sama) |
| Detail     | Hanya bermakna di dalam satu header | `parentReference` (+ index), tanpa `softDelete`                 | `ChildRepository`                                 |
| Pencatatan | Log/history, append-only            | `sequentialPrimaryKey` + `timestamps`                           | Repository biasa (insert + select)                |
| Referensi  | Milik sistem lain                   | view `.existing()`                                              | Tanpa repository                                  |

**Langkah**

1. `BaseRepository<TTable>`: `findById`, `findPage({ page, perPage, orderBy })` (default `ORDER BY created_at DESC, id DESC`), `count`, `create` (isi `createdBy`/`updatedBy` dari actor), `updateById(id, patch)` (lock → diff → update → audit), `softDeleteById`, `restoreById`; semua query ter-scope `deleted_at IS NULL` lewat `scoped()`; tanpa hard delete.
2. `ChildRepository<TChild, TParent>`: setiap method menerima `parentId` (cegah IDOR); kunci header aktif dulu (urutan kunci konsisten), `createForParent`, `updateForParent`, `deleteForParent` (hard delete + snapshot), `syncForParent(parentId, items)` (insert/update/delete dalam satu transaksi), menyentuh `updated_at` header.

**Acceptance criteria**

- [ ] Perilaku generik diuji sekali di `src/database/*.test.ts` (scope soft delete, audit, IDOR ditolak, sync).
- [ ] Header soft-deleted → operasi detail → `NotFoundError`.

### Step 2.6 — Penegakan aturan data layer

**Langkah** (ESLint + depcruise; selector di [L7](#157-l7--snippet-eslint)):

| Aturan                                                                               | Penegak                  |
| ------------------------------------------------------------------------------------ | ------------------------ |
| `.update(` / `.delete(` dilarang di `src/modules/**/*.repository.ts`                 | ESLint                   |
| Penulisan DB (`.insert(`, `.update(`, `.delete(`) dilarang di luar `*.repository.ts` | ESLint                   |
| Raw SQL `UPDATE` / `DELETE FROM` dalam `` sql`…` `` dilarang                         | ESLint (TemplateLiteral) |
| `recordChanges` tidak boleh di-import di modul                                       | depcruise                |
| `@Transactional()` hanya di `*.service.ts`                                           | ESLint                   |
| `TransactionHost` hanya di `*.repository.ts` & `src/database/**`                     | ESLint + depcruise       |
| `sql.raw(` dilarang (kecuali `eslint-disable` + alasan)                              | ESLint                   |
| Raw query hanya di `*.queries.ts` (fungsi murni, baca saja)                          | ls-lint + ESLint         |
| Seeder (`src/database/seeds/**`) dikecualikan                                        | override                 |

**Acceptance criteria**: chaos test per baris tabel — pelanggaran dibuat sementara, terbukti gagal, didokumentasikan di `CONTRIBUTING.md` _Aturan yang Ditegakkan Mesin_.

### Step 2.7 — Test konvensi schema

**Langkah**: `src/database/schema/schema-conventions.test.ts` mengiterasi semua tabel yang diekspor (`getTableConfig`): setiap FK punya index dengan kolom awal yang sama; tabel di `appSchema` memakai `id` dari helper; tabel ber-`deleted_at` tidak punya `unique()` biasa (wajib `activeUniqueIndex`); `record_changes` PK `(id, changed_at)` tanpa FK/unique lain.

**Acceptance criteria**

- [ ] Menambah FK tanpa index → test gagal dengan nama tabel & kolom.

### Step 2.8 — Migrasi modul `users` + template scaffold

**Langkah**

1. `users.schema.ts` memakai helper (`uuidPrimaryKey`, `timestamps`, `auditColumns`, `softDelete`, `activeUniqueIndex` email).
2. `UsersRepository extends BaseRepository`; endpoint baru `PATCH /users/:id`, `DELETE /users/:id` (soft delete), `POST /users/:id/restore`; urutan list deterministik (G11).
3. Template `scaffold-module` untuk **mandiri**, **header + detail** (route `/headers/:id/details[/:childId]`, maks 2 level), **pencatatan**.
4. Migrasi di-generate; developer menjalankan.

**Acceptance criteria**

- [ ] Modul contoh header/detail dibuat dari template → lolos `validate:full` tanpa edit manual → dihapus (dicatat di 4.1).

---

## Fase 3 — Auth JWT

Spesifikasi lengkap di [L3](#153-l3--spesifikasi-auth) dan [L4](#154-l4--public_routes--test-default-deny).

### Step 3.1 — Primitif keamanan & config auth

**Langkah**

1. `src/config/auth.config.ts` — variabel di [L1](#151-l1--registry-env-var) (`JWT_SECRET` wajib ≥ 32 karakter di luar test).
2. `src/core/security/jwt.ts`: `signAccessToken({ userId, role })` → `{ token, expiresIn }`; `verifyAccessToken(token)` → `{ userId, role, jti }` memakai `verify(token, secret, { alg: 'HS256', iss, aud })` dari `hono/jwt`; error dipetakan ke `UnauthorizedError` (`ERR_AUTH_TOKEN_EXPIRED` / `ERR_AUTH_TOKEN_INVALID`).
3. `src/utils/crypto.util.ts` (murni): `generateOpaqueToken()` (32 byte acak → base64url), `sha256Hex(value)`, `timingSafeEqualHex(a, b)`.
4. Redaksi logger: tambah `refreshToken`, `*.refreshToken`, `accessToken`, `*.accessToken`, `cookie`, `req.headers.cookie`.

**Acceptance criteria**

- [ ] Token kedaluwarsa / `aud` salah / `iss` salah / signature salah / `alg: none` → ditolak (test per kasus).

### Step 3.2 — Schema auth

**Langkah**

1. `users.role` (`varchar(20)`, default `'user'`), konstanta `ROLES` di `src/core/security/roles.ts`.
2. `auth_refresh_tokens` (kolom di [L3](#153-l3--spesifikasi-auth)).
3. **Pengecualian disetujui user** (lihat 4.1): repository token dikecualikan dari aturan 2.6 lewat override ESLint satu file dengan komentar alasan.
4. Generate migrasi.

**Acceptance criteria**

- [ ] `schema-conventions.test.ts` lulus (index FK `user_id`, `family_id`).

### Step 3.3 — Modul `auth`

**Langkah**

1. `src/modules/auth/` — `auth.routes.ts`, `auth.controller.ts`, `auth.service.ts`, `auth.repository.ts` (refresh token), `auth.dto.ts`, `auth.transformer.ts`, `auth-cookie.ts` (set/clear cookie sesuai D3 via `hono/cookie`).
2. Endpoint & algoritma rotasi sesuai L3; endpoint ber-cookie memakai `csrf({ origin: CORS_ORIGINS })` dari `hono/csrf` (D4).
3. Login: dummy hash saat user tidak ada (waktu konstan); pesan gagal generik; brute-force limit per `(sha256(email), ip)` via `increment` (fail-open) → 429.
4. Ganti password / nonaktifkan user (method service `users`) → cabut semua family user (dipanggil lewat service auth yang di-export, bukan repository lintas modul).

**Acceptance criteria**

- [ ] e2e: login → refresh (token berganti, cookie baru) → pakai token lama lagi → 401 `ERR_AUTH_REFRESH_REUSED` dan token terbaru ikut tercabut → logout idempoten.
- [ ] Atribut `Set-Cookie` diverifikasi persis (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth`, `Max-Age`).
- [ ] `POST /auth/refresh` dengan `Origin` tak terdaftar → 403.
- [ ] Respons login/refresh tidak pernah memuat refresh token di body.
- [ ] Login gagal ke-(max+1) → 429.

### Step 3.4 — `authenticate()` default-deny + `requireRole()`

**Langkah**

1. `src/core/middlewares/authenticate.ts`: lewati bila route cocok `PUBLIC_ROUTES` atau di bawah `/api/v1/partner/*`; selain itu wajib `Authorization: Bearer <jwt>` → `verifyAccessToken` → `setActor('user:<id>')` + simpan `role` di context; gagal → 401.
2. `src/core/security/public-routes.ts`: registry `PUBLIC_ROUTES` + matcher murni `matchRoutePattern` di `src/utils/` (L4).
3. `src/core/middlewares/require-role.ts`: `requireRole(...roles)` → 403 `ERR_ROLE_FORBIDDEN`.
4. Dipasang di `createApp()` sesuai L10.
5. `AGENTS.md`: invariant baru _Default-Deny Authentication_.

**Acceptance criteria**

- [ ] Test enumerasi `app.routes` (L4) hijau; menambah route baru tanpa terdaftar publik → route itu 401 tanpa token.
- [ ] Role `user` ke endpoint `requireRole('admin')` → 403.

### Step 3.5 — Proteksi `users`, seed admin, panduan FE

**Langkah**

1. `POST/PATCH/DELETE /users*` → `requireRole('admin')`; `GET /users/:id` → admin atau pemilik.
2. `scripts/seed-admin.ts --email <email>` (password dibaca dari prompt/stdin, tidak dari argumen/env; dijalankan developer).
3. `docs/auth-guide.md` untuk FE: alur token, simpan access token di memori (bukan `localStorage`), `credentials: 'include'`, auto-refresh saat 401 dengan **single-flight** (hindari false-positive reuse detection antar tab), logout.

**Acceptance criteria**

- [ ] Non-admin tidak bisa membuat user; pemilik bisa melihat profilnya sendiri.

---

## Fase 4 — Integrasi Outbound

### Step 4.1 — Hardening `HttpClientService`

**Tujuan**: G3.

| Kondisi                              | HTTP ke client                                  | `error.code`          | `error.origin` |
| ------------------------------------ | ----------------------------------------------- | --------------------- | -------------- |
| Timeout (`ECONNABORTED`/`ETIMEDOUT`) | 504                                             | `ERR_EXT_TIMEOUT`     | kode integrasi |
| Network error / DNS / reset          | 502                                             | `ERR_EXT_UNREACHABLE` | kode integrasi |
| Vendor 4xx/5xx                       | **502** (tidak pernah meneruskan status vendor) | `ERR_EXT_ERROR`       | kode integrasi |

**Langkah**

1. Pemetaan tabel di atas; body vendor hanya di-log (terpotong 2 KB, lewat redaksi), header tidak di-log; `details` ke client = pesan generik dwibahasa.
2. Interceptor request menambahkan `X-Request-ID` dari context.
3. `timeoutMs` wajib di `HttpClientOptions` (tanpa default diam-diam).
4. `src/integrations/registry.ts`: `INTEGRATION_REGISTRY = { JSONPLACEHOLDER: { institution: 'JSONPlaceholder' } }` → `error.institution` pada envelope.
5. ESLint: `fetch(` dan import `axios` dilarang di luar `src/core/http/**`.

**Acceptance criteria**

- [ ] Vendor 401 → client 502, body vendor tidak muncul di respons.
- [ ] Request outbound membawa `X-Request-ID` yang sama dengan request masuk.

### Step 4.2 — Template integrasi & cache token vendor

**Langkah**: pola vendor berbasis login (`getAccessToken()` di-cache sampai `expires_in − 60 dtk`, single-flight agar request paralel tidak login berulang); `config/<vendor>.config.ts`; hapus env contoh `EXTERNAL_VENDOR_*` yang tak terpakai; `references/integrations.md` + bagian di `scaffold-module`.

**Acceptance criteria**

- [ ] 10 request paralel saat token kosong → 1 kali login (test).

---

## Fase 5 — Gateway Partner Inbound

Spesifikasi signing di [L5](#155-l5--signing-partner-v1).

### Step 5.1 — Utilitas kripto & signing

**Langkah** (murni, di `src/utils/`): `secret-cipher.util.ts` (AES-256-GCM, IV 12 byte acak, format `v1.<keyId>.<iv>.<tag>.<ciphertext>` base64url, keyring untuk rotasi); `partner-signature.util.ts` (`buildCanonicalString`, `canonicalQuery`, `signV1`, `verifyV1` timing-safe); `ip-match.util.ts` (IPv4/IPv6/CIDR, normalisasi `::ffff:`); `route-match.util.ts` (tanpa `*` = exact; `/x/*` = `x` dan turunannya, batas segmen; tolak `..`).

**Acceptance criteria**

- [ ] Vektor uji signing tetap (fixture) lulus; ciphertext key lama tetap bisa didekripsi setelah rotasi active key.

### Step 5.2 — Kredensial partner

**Langkah**

1. `config/partner.config.ts` (L1).
2. Tabel `partner_credentials` (mandiri): `partner_code` (unik permanen, termasuk yang terhapus), `partner_name`, `api_key_hash`, `api_key_prefix`, `encrypted_secret`, `ip_whitelist` (`text[]`), `allowed_routes` (`text[]`), `rate_limit_rpm`, `is_active`, timestamps, audit, `deleted_at`; `redact: ['apiKeyHash', 'encryptedSecret']`.
3. Admin API `/api/v1/partner-credentials` (`requireRole('admin')`): create, list, detail, update, `POST /:id/secret-rotations`, `POST /:id/api-key-rotations`, deactivate, soft delete. API key & secret plaintext hanya di respons create/rotasi.

**Acceptance criteria**

- [ ] Respons list/detail tidak memuat `api_key_hash`, `encrypted_secret`.
- [ ] Non-admin → 403.

### Step 5.3 — Middleware `partnerAuth()`

**Langkah**: di-mount `app.use('/api/v1/partner/*', partnerAuth())`; urutan: header wajib → drift timestamp (`PARTNER_HMAC_TOLERANCE_MS`) → lookup by `sha256(api key)` (cache + negative cache) → aktif → IP whitelist (kosong = semua) → route ACL → baca raw body **sekali** (`arrayBuffer`, disimpan untuk handler) → signature → nonce `setIfAbsent` → rate limit per partner (`increment`) → `setActor('partner:<code>')`; log audit tunggal `{ audit: 'partner', outcome, reason, partnerCode, method, path, clientIp, statusCode, durationMs }` di `finally`. Contoh `GET /api/v1/partner/ping`.

**Acceptance criteria**

- [ ] Test per cabang penolakan dengan code di L2; replay (nonce sama) → 401 `ERR_PARTNER_REPLAY_REJECTED`; query diubah → 401 signature.
- [ ] Handler tetap bisa membaca body JSON setelah verifikasi signature.
- [ ] Redis mati → nonce & rate limit fail-open + log `warn` (trade-off didokumentasikan).

### Step 5.4 — Panduan integrasi partner

**Langkah**: `docs/partner-integration-guide.md` (generik: header, canonical string, contoh curl + TypeScript, daftar error code, rotasi kredensial); `scripts/partner-sign.ts` untuk uji manual.

---

## Fase 6 — Integration Test

### Step 6.1 — Postgres + Redis asli

**Langkah**

1. `docker-compose.test.yml` (Postgres 16 + Redis, port terpisah, tmpfs).
2. `test/integration/setup.ts`: DB sekali pakai — migrasi dijalankan oleh setup test (bukan oleh AI agent ke DB developer); script `test:int` terpisah dari `test`.
3. Skenario: audit & rollback nyata, soft delete/restore, `syncForParent`, `activeUniqueIndex`, rotasi & reuse refresh token, nonce partner, `increment` atomik paralel, fail-open saat container Redis dihentikan.
4. Job CI `integration` dengan service container.

**Acceptance criteria**

- [ ] `bun run test:int` hijau lokal dan di CI.

---

## Fase 7 — Dokumentasi, Skills & Release

### Step 7.1 — `ARCHITECTURE.md` generik + sinkronisasi docs

**Langkah**: tulis `ARCHITECTURE.md` (struktur seperti blueprint: apa & mengapa + rujukan ke sumber detail, isi Bun/Hono, generik); pindahkan `ARCHITECTURE_BLUEPRINT_FROM_NESTJS.md` ke `docs/archive/`; sinkronkan `README.md` (quickstart ≤ 150 baris) & `CONTRIBUTING.md`; setiap aturan diberi label penegak `[tsc]`, `[eslint:<rule>]`, `[depcruise:<rule>]`, `[ls-lint]`, `[test]`, `[ci]`, `[review-only]`.

### Step 7.2 — Finalisasi skills AI

**Langkah**: skill baru `review-code` (gate review memakai §14.1, dipanggil sebelum step dinyatakan selesai); evaluasi pemisahan skill `database-standards` dari `project-standards/references`; perbarui `scaffold-module`, `init-project`, `project-standards`, `generate-commit-text` (scope baru: `auth`, `partner-credentials`, …); wrapper `.claude/skills/` untuk skill baru; `CLAUDE.md` tetap hanya import.

### Step 7.3 — Release check boilerplate v1.0.0

**Langkah**: clone bersih → `/init-project demo-backend` → `docker compose up -d` → migrasi → `bun run seed:admin` → `bun run dev` → smoke test (health, login, refresh, `/users`, partner ping) → `bun run build` → `docker build` + container `healthy` → `CHANGELOG.md` → tag `v1.0.0`.

**Acceptance criteria**

- [ ] Seluruh alur di atas berjalan tanpa edit manual selain `.env` lokal.

---

## 14. Definition of Done, Template Review & Risiko

### 14.1 Definition of Done (setiap step)

- [ ] `bun run validate:full` hijau dan `bun run build` sukses.
- [ ] Test baru menutup perilaku baru (unit; e2e bila menyentuh HTTP).
- [ ] Aturan baru ditegakkan mesin (atau ditandai `[review-only]` dengan alasan).
- [ ] Dokumen terdampak diperbarui di commit yang sama: `.agents/AGENTS.md`, `.agents/skills/**`, `CONTRIBUTING.md`, `README.md`, `.env.example`.
- [ ] Nilai yang membawa nama proyek → `IDENTITY_RULES`; `bun run setup demo --dry-run` lulus.
- [ ] Env var baru → Zod di `src/config/` + `.env.example` + [L1](#151-l1--registry-env-var).
- [ ] AI agent tidak mengeksekusi perintah ke database (migrasi di-generate; dijalankan developer).
- [ ] Tabel Progres (§5) dan Log (§4.1) diperbarui di commit step tersebut.
- [ ] Perubahan dibiarkan di working tree + usulan pesan commit (skill `generate-commit-text`); commit & merge hanya setelah diminta user.

### 14.2 Template laporan review

```
Step      : <id> — <judul>
Branch    : <type>/<slug>
Ringkas   : <2–4 kalimat>
File      : <file utama>
Verifikasi: validate:full ✅/❌ · build ✅/❌ · coverage lines <x>% / functions <y>%
Chaos test: <daftar pelanggaran yang dibuktikan gagal>
Log baru  : <baris yang ditambahkan ke §4.1 | none>
Usulan commit: <type(scope): subject> (belum di-commit, menunggu permintaan user)
Catatan   : <hal yang perlu perhatian reviewer>
```

### 14.3 Risiko & mitigasi

| Risiko                                                          | Dampak                               | Mitigasi                                                                          |
| --------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| `@hono/zod-openapi` mensyaratkan Zod v4                         | Perubahan API Zod di semua DTO       | Spike time-box di 1.9; alternatif `hono-openapi` (D17)                            |
| Bun coverage tanpa branch coverage                              | Ambang branch blueprint hilang       | Ambang functions + per file (D19); tinjau saat Bun mendukung                      |
| `@Transactional()` bergantung `experimentalDecorators`          | Breaking saat migrasi decorator TC39 | `runInTransaction()` tetap tersedia sebagai jalur eksplisit                       |
| Body dibaca dua kali (signature + JSON)                         | Body kosong di handler               | Baca `arrayBuffer` sekali di `partnerAuth`; acceptance criteria 5.3               |
| Refresh paralel antar tab memicu reuse detection                | User ter-logout                      | FE single-flight refresh (`docs/auth-guide.md`); evaluasi grace window bila perlu |
| Enumerasi `app.routes` berubah antar versi Hono                 | Test default-deny rapuh              | Test memverifikasi lewat request nyata (401), bukan struktur internal             |
| Fail-open Redis melemahkan nonce, rate limit, brute-force limit | Jendela replay / brute force         | Toleransi timestamp sempit; log `warn`; health `DEGRADED` memicu alert            |
| Rule ESLint baru memunculkan pelanggaran di kode lama           | Step tidak bisa hijau                | Step yang menambah rule sekaligus memperbaiki pelanggarannya                      |

---

## 15. Lampiran — Spesifikasi & Snippet Referensi

### 15.1 L1 — Registry env var

| Variabel                                  | Step | Default                        | Validasi / catatan                                        |
| ----------------------------------------- | ---- | ------------------------------ | --------------------------------------------------------- |
| `NODE_ENV`                                | ada  | `development`                  | `development \| production \| test`                       |
| `PORT`                                    | ada  | `3000`                         | `int().positive()` (1.1)                                  |
| `APP_NAME`                                | ada  | nama proyek                    | `IDENTITY_RULES`                                          |
| `API_PREFIX` → `API_BASE_PATH`            | 1.8  | `/api`                         | versi di kode (`/v1`)                                     |
| `LOG_LEVEL`                               | ada  | `info`                         | enum pino                                                 |
| `DATABASE_URL`                            | ada  | —                              | wajib di luar test                                        |
| `DB_MAX_CONNECTIONS`                      | ada  | `20`                           |                                                           |
| `DB_IDLE_TIMEOUT_SECONDS`                 | ada  | `30`                           |                                                           |
| `DB_SCHEMA`                               | 2.2  | —                              | **dihapus** (diganti konstanta `APP_SCHEMA_NAME`)         |
| `REDIS_HOST` / `PORT` / `PASSWORD` / `DB` | ada  | `localhost` / `6379` / — / `0` |                                                           |
| `REDIS_KEY_PREFIX`                        | 1.6  | `<APP_NAME>:<NODE_ENV>`        | override                                                  |
| `REDIS_COMMAND_TIMEOUT_MS`                | 1.6  | `1000`                         |                                                           |
| `CORS_ORIGIN` → `CORS_ORIGINS`            | 1.7  | kosong (CORS mati)             | CSV URL; `*` ditolak di production                        |
| `TRUST_PROXY_HOPS`                        | 1.7  | `0`                            | `int().min(0)`                                            |
| `HTTP_BODY_LIMIT_BYTES`                   | 1.7  | `1048576`                      |                                                           |
| `RATE_LIMIT_WINDOW_SECONDS`               | 1.7  | `900`                          | menggantikan `RATE_LIMIT_WINDOW_MS`                       |
| `RATE_LIMIT_MAX`                          | ada  | `100`                          |                                                           |
| `DEFAULT_LOCALE`                          | 1.4  | `id`                           | `id \| en`                                                |
| `API_DOCS_ENABLED`                        | 1.9  | `true` kecuali production      |                                                           |
| `JWT_SECRET`                              | 3.1  | — (test: nilai dummy)          | `min(32)`                                                 |
| `JWT_ISSUER` / `JWT_AUDIENCE`             | 3.1  | `APP_NAME`                     |                                                           |
| `ACCESS_TOKEN_TTL_SECONDS`                | 3.1  | `900`                          |                                                           |
| `REFRESH_TOKEN_TTL_SECONDS`               | 3.1  | `604800` (7 hari)              | sliding per rotasi                                        |
| `REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS`      | 3.1  | `2592000` (30 hari)            | batas umur satu family                                    |
| `AUTH_COOKIE_SAMESITE`                    | 3.1  | `Strict`                       | `Strict \| Lax \| None` (`None` wajib HTTPS lintas situs) |
| `AUTH_REGISTRATION_ENABLED`               | 3.1  | `false`                        |                                                           |
| `AUTH_LOGIN_MAX_ATTEMPTS`                 | 3.1  | `5`                            | per `(email, ip)`                                         |
| `AUTH_LOGIN_LOCK_SECONDS`                 | 3.1  | `900`                          |                                                           |
| `PARTNER_HMAC_TOLERANCE_MS`               | 5.2  | `300000`                       |                                                           |
| `PARTNER_SECRET_KEYS`                     | 5.2  | —                              | `k1:<64hex>[,k0:<64hex>]`                                 |
| `PARTNER_SECRET_ACTIVE_KEY_ID`            | 5.2  | —                              | harus ada di keyring                                      |
| `JSONPLACEHOLDER_BASE_URL` / `TIMEOUT_MS` | ada  | contoh                         | contoh integrasi                                          |
| `EXTERNAL_VENDOR_*`                       | 4.2  | —                              | **dihapus** (tidak terpakai)                              |

### 15.2 L2 — Error types & `APP_ERROR_CODES`

| `error.type`             | HTTP    | Contoh code                                                                                                                                                                                                                                                                             |
| ------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`       | 400     | `ERR_INVALID_INPUT`, `ERR_INVALID_JSON`, `ERR_NON_SNAKE_CASE_KEY`                                                                                                                                                                                                                       |
| `BAD_REQUEST`            | 400     | `ERR_BAD_REQUEST`                                                                                                                                                                                                                                                                       |
| `UNAUTHORIZED`           | 401     | `ERR_UNAUTHORIZED`, `ERR_AUTH_INVALID_CREDENTIALS`, `ERR_AUTH_TOKEN_EXPIRED`, `ERR_AUTH_TOKEN_INVALID`, `ERR_AUTH_REFRESH_INVALID`, `ERR_AUTH_REFRESH_REUSED`, `ERR_PARTNER_HEADERS_MISSING`, `ERR_PARTNER_INVALID_KEY`, `ERR_PARTNER_REPLAY_REJECTED`, `ERR_PARTNER_SIGNATURE_INVALID` |
| `FORBIDDEN`              | 403     | `ERR_FORBIDDEN`, `ERR_ROLE_FORBIDDEN`, `ERR_CSRF_ORIGIN_FORBIDDEN`, `ERR_PARTNER_IP_FORBIDDEN`, `ERR_PARTNER_ROUTE_FORBIDDEN`                                                                                                                                                           |
| `NOT_FOUND`              | 404     | `ERR_NOT_FOUND`, `ERR_ROUTE_NOT_FOUND`                                                                                                                                                                                                                                                  |
| `CONFLICT`               | 409     | `ERR_CONFLICT`                                                                                                                                                                                                                                                                          |
| `PAYLOAD_TOO_LARGE`      | 413     | `ERR_PAYLOAD_TOO_LARGE`                                                                                                                                                                                                                                                                 |
| `TOO_MANY_REQUESTS`      | 429     | `ERR_RATE_LIMITED`, `ERR_AUTH_LOGIN_LOCKED`                                                                                                                                                                                                                                             |
| `SERVICE_UNAVAILABLE`    | 503     | `ERR_SERVICE_UNAVAILABLE`                                                                                                                                                                                                                                                               |
| `EXTERNAL_SERVICE_ERROR` | 502/504 | `ERR_EXT_ERROR`, `ERR_EXT_UNREACHABLE`, `ERR_EXT_TIMEOUT`                                                                                                                                                                                                                               |
| `INTERNAL_SERVER_ERROR`  | 500     | `ERR_INTERNAL`                                                                                                                                                                                                                                                                          |

Envelope error (contoh):

```json
{
  "success": false,
  "status_code": 400,
  "message": "Validasi data gagal. Silakan periksa kembali input Anda",
  "error": {
    "type": "VALIDATION_ERROR",
    "code": "ERR_INVALID_INPUT",
    "origin": "APP",
    "details": [{ "field": "full_name", "message": "Required" }]
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-10-04T03:00:00.000Z"
}
```

### 15.3 L3 — Spesifikasi auth

**Access token (JWT HS256)**

```json
{
  "sub": "<user uuid>",
  "role": "admin",
  "jti": "<uuid v7>",
  "iat": 1791082800,
  "exp": 1791083700,
  "iss": "<JWT_ISSUER>",
  "aud": "<JWT_AUDIENCE>"
}
```

**Tabel `auth_refresh_tokens`**

| Kolom               | Tipe         | Catatan                                            |
| ------------------- | ------------ | -------------------------------------------------- |
| `id`                | uuid v7 PK   |                                                    |
| `user_id`           | uuid FK      | index                                              |
| `family_id`         | uuid         | index; sama untuk satu rantai rotasi               |
| `token_hash`        | char(64)     | unique, `sha256(token)` hex                        |
| `expires_at`        | timestamptz  | `min(now + TTL, family_started_at + ABSOLUTE_TTL)` |
| `family_started_at` | timestamptz  |                                                    |
| `revoked_at`        | timestamptz  | null = aktif                                       |
| `replaced_by_id`    | uuid         | token pengganti                                    |
| `user_agent`        | varchar(255) |                                                    |
| `ip`                | varchar(45)  |                                                    |
| `created_at`        | timestamptz  |                                                    |

**Endpoint** (`/api/v1/auth`)

| Endpoint           | Auth           | Request                                | Response `data`                                                                   |
| ------------------ | -------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| `POST /login`      | publik         | `{ "email", "password" }`              | `{ "access_token", "token_type": "Bearer", "expires_in", "user" }` + `Set-Cookie` |
| `POST /refresh`    | cookie + csrf  | —                                      | `{ "access_token", "token_type", "expires_in" }` + `Set-Cookie` baru              |
| `POST /logout`     | cookie + csrf  | —                                      | `null` + cookie dihapus (idempoten)                                               |
| `POST /logout-all` | access token   | —                                      | `null`                                                                            |
| `GET /me`          | access token   | —                                      | profil user                                                                       |
| `POST /register`   | publik, toggle | `{ "email", "full_name", "password" }` | 404 bila `AUTH_REGISTRATION_ENABLED=false`                                        |

**Cookie**: `Set-Cookie: refresh_token=<opaque>; Path=/api/v1/auth; Max-Age=<detik>; HttpOnly; Secure; SameSite=Strict`

**Algoritma refresh**

```
token  = cookie refresh_token            (tidak ada → 401 ERR_AUTH_REFRESH_INVALID)
hash   = sha256(token)
BEGIN
  row = SELECT … WHERE token_hash = hash FOR UPDATE      (tidak ada → 401 INVALID, hapus cookie)
  IF row.revoked_at IS NOT NULL:                          -- reuse
     UPDATE … SET revoked_at = now() WHERE family_id = row.family_id AND revoked_at IS NULL
     COMMIT; log warn {userId, familyId}; 401 ERR_AUTH_REFRESH_REUSED (hapus cookie)
  IF row.expires_at <= now(): 401 INVALID (hapus cookie)
  user = users.findActive(row.user_id)                    (nonaktif → cabut family → 401)
  new  = INSERT { family_id: row.family_id, family_started_at: row.family_started_at,
                  token_hash: sha256(newToken), expires_at: min(now+TTL, started+ABS_TTL) }
  UPDATE row SET revoked_at = now(), replaced_by_id = new.id
COMMIT
→ access token baru + Set-Cookie newToken
```

### 15.4 L4 — `PUBLIC_ROUTES` & test default-deny

```ts
// src/core/security/public-routes.ts
export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { method: 'GET', path: '/api/health' },
  { method: 'GET', path: '/api/health/readiness' },
  { method: 'GET', path: '/api/health/liveness' },
  { method: 'GET', path: '/api/docs' },
  { method: 'GET', path: '/api/docs/openapi.json' },
  { method: 'POST', path: '/api/v1/auth/login' },
  { method: 'POST', path: '/api/v1/auth/refresh' },
  { method: 'POST', path: '/api/v1/auth/logout' },
  { method: 'POST', path: '/api/v1/auth/register' },
] as const;
```

```ts
// test/default-deny.e2e.test.ts (sketsa)
for (const route of app.routes.filter((r) => r.method !== 'ALL')) {
  const path = route.path.replace(/:([A-Za-z]+)/g, '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e');
  if (isPublic(route.method, route.path) || path.startsWith('/api/v1/partner/')) continue;
  const res = await app.request(path, { method: route.method });
  expect(res.status).toBe(401); // route baru tanpa proteksi akan gagal di sini
}
```

### 15.5 L5 — Signing partner v1

| Header                | Isi                                    |
| --------------------- | -------------------------------------- |
| `x-partner-key`       | API key (plaintext dari partner)       |
| `x-partner-timestamp` | Unix epoch **milidetik**               |
| `x-partner-nonce`     | `^[A-Za-z0-9_-]{16,64}$`, sekali pakai |
| `x-partner-signature` | HMAC-SHA256 hex lowercase              |

```
canonical = "v1" + "\n" + timestamp + "\n" + nonce + "\n" + METHOD + "\n" + path + "\n" + canonicalQuery + "\n" + sha256hex(rawBody)
signature = hex(HMAC_SHA256(secret, canonical))
```

- `path`: path URL persis seperti dikirim (tanpa query), tanpa normalisasi trailing slash.
- `canonicalQuery`: pasangan `key=value` di-encode RFC 3986, diurutkan berdasarkan key lalu value, digabung `&`; tanpa query → string kosong.
- Body kosong → `sha256hex("")`.

### 15.6 L6 — DDL `record_changes`

```sql
CREATE TABLE "<app_schema>"."record_changes" (
  "id"         bigserial   NOT NULL,
  "changed_at" timestamptz NOT NULL DEFAULT now(),
  "table_name" text        NOT NULL,
  "record_id"  text        NOT NULL,
  "action"     text        NOT NULL CHECK ("action" IN ('UPDATE', 'SOFT_DELETE', 'RESTORE', 'DELETE')),
  "changes"    jsonb       NOT NULL,   -- UPDATE: {"col": {"from": x, "to": y}} · DELETE: snapshot
  "actor"      text        NOT NULL,   -- user:<id> | partner:<code> | system
  "request_id" text,
  PRIMARY KEY ("id", "changed_at")     -- partition-ready: tanpa FK & unique lain
);
CREATE INDEX "record_changes_lookup_idx" ON "<app_schema>"."record_changes" ("table_name", "record_id", "changed_at" DESC);
```

### 15.7 L7 — Snippet ESLint

Komposisi grup rule (perbaikan G14):

```js
const MODULE_IMPORT_RULES = [
  { selector: 'ImportDeclaration[source.value=/.*database.*/] ImportSpecifier[imported.name=/^(db|sqlClient)$/]', message: '…' },
  { selector: 'ImportDeclaration[source.value=/.*core\\/http.*/] ImportSpecifier[imported.name="HttpClientService"]', message: '…' },
];
const CONTROLLER_RULES = [
  { selector: 'MemberExpression[object.name="c"][property.name="json"]', message: 'Return ApiResponse, jangan c.json().' },
];
// …
{ files: ['src/modules/**/*.ts'], rules: { 'no-restricted-syntax': ['error', ...MODULE_IMPORT_RULES] } },
{ files: ['src/modules/**/*.controller.ts'], rules: { 'no-restricted-syntax': ['error', ...MODULE_IMPORT_RULES, ...CONTROLLER_RULES] } },
```

Selector yang direncanakan:

| Step | Larangan                              | Selector                                                                                                                                                                             |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.3  | Literal error code di luar registry   | `Literal[value=/^ERR_/]`                                                                                                                                                             |
| 1.3  | `throw new Error` di modul            | `ThrowStatement > NewExpression[callee.name="Error"]`                                                                                                                                |
| 1.4  | Pesan literal                         | `NewExpression[callee.name=/^(ApiResponse\|\w+Error)$/] > Literal.arguments` (diverifikasi chaos test)                                                                               |
| 2.1  | `new Date(arg)` / `Date.parse`        | `NewExpression[callee.name="Date"][arguments.length>0]`, `MemberExpression[object.name="Date"][property.name="parse"]`                                                               |
| 2.1  | Getter/formatter waktu lokal          | `CallExpression[callee.property.name=/^(getHours\|getMinutes\|getDate\|getDay\|getMonth\|getFullYear\|getTimezoneOffset\|toLocaleString\|toLocaleDateString\|toLocaleTimeString)$/]` |
| 2.6  | Tulis DB langsung di repository modul | `CallExpression[callee.property.name=/^(update\|delete)$/][callee.object.property.name="tx"]`                                                                                        |
| 2.6  | Raw SQL tulis                         | `TaggedTemplateExpression[tag.name="sql"] TemplateElement[value.raw=/\b(update\|delete\s+from)\b/i]`                                                                                 |
| 2.6  | `sql.raw`                             | `CallExpression[callee.object.name="sql"][callee.property.name="raw"]`                                                                                                               |
| 4.1  | `fetch(` di luar `core/http`          | `CallExpression[callee.name="fetch"]`                                                                                                                                                |

### 15.8 L8 — CI GitHub Actions

```yaml
# .github/workflows/ci.yml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  verify:
    runs-on: ubuntu-latest
    env:
      NODE_ENV: test
      TZ: UTC
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.0
      - run: bun install --frozen-lockfile
      - name: branch name
        if: github.event_name == 'pull_request'
        run: bunx validate-branch-name -t "${{ github.head_ref }}"
      - name: commitlint
        if: github.event_name == 'pull_request'
        run: bunx commitlint --from ${{ github.event.pull_request.base.sha }} --to HEAD
      - run: bun run typecheck
      - run: bun run lint
      - run: bun run lint:ls
      - run: bun run format:check
      - run: bun run lint:arch
      - run: bun run lint:deps
      - run: bun run test:cov
      - run: bun run build
```

`lint:branch` lokal membaca branch git aktif; di CI (checkout detached) nama branch diberikan eksplisit lewat `-t`.

### 15.9 L9 — knip & check-coverage

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": ["src/index.ts", "scripts/*.ts", "drizzle.config.ts", "commitlint.config.ts"],
  "project": ["src/**/*.ts", "scripts/**/*.ts", "test/**/*.ts"],
  "ignoreDependencies": ["pino-pretty"],
  "ignoreExportsUsedInFile": true
}
```

`scripts/check-coverage.ts` (spesifikasi):

1. Parse `coverage/lcov.info` per record `SF:` → `LF/LH` (lines), `FNF/FNH` (functions).
2. Abaikan `SF` yang cocok `\.test\.ts$` atau berada di `test/`.
3. Global: lines ≥ 95 **dan** functions ≥ 95.
4. Per file (dengan `LF > 0`): lines ≥ 90.
5. Cetak tabel file yang gagal (path, lines %, functions %), exit 1 bila ada pelanggaran.
6. Ambang didefinisikan sekali sebagai konstanta di script (SSOT); dokumen merujuk ke sini.

### 15.10 L10 — Urutan pipeline `createApp()`

```
 1. requestContext()        request ID (D9), locale, clientIp, actor = anonymous
 2. loggerMiddleware()      log masuk/keluar (requestId dari mixin)
 3. secureHeaders()
 4. cors()                  allowlist CORS_ORIGINS, credentials
 5. bodyLimit()             413
 6. rateLimit()             global per IP (fail-open)
 7. /api/health/*, /api/docs*                      publik
 8. app.use('/api/v1/partner/*', partnerAuth())    HMAC (Fase 5)
 9. app.use('/api/v1/*', authenticate())           default-deny, kecuali PUBLIC_ROUTES & partner
10. app.route('/api/v1', v1Router)                 modul (requireRole per route)
11. app.onError(globalErrorHandler) · app.notFound(notFoundHandler)
```

### 15.11 L11 — Struktur target

```
src/
├── app.ts · index.ts
├── config/        app, database, redis, http, auth, partner, integrations (*.config.ts) + parse-env.ts
├── core/
│   ├── cache/     CacheService, CACHE_KEYS/PREFIX/TTL, redis.client
│   ├── context/   RequestContext (AsyncLocalStorage)
│   ├── dto/       common.dto.ts, datetime.dto.ts
│   ├── errors/    ApiError*, error-codes.ts
│   ├── http/      HttpClientService (hanya untuk integrations/)
│   ├── i18n/      messages.ts
│   ├── logger/
│   ├── middlewares/ request-context, client-ip, rate-limit, authenticate, require-role, validate, …
│   ├── response/  ApiResponse
│   └── security/  jwt.ts, roles.ts, public-routes.ts
├── database/
│   ├── audited.repository.ts · base.repository.ts · child.repository.ts
│   ├── connection.ts · transaction-host.ts · transactional.decorator.ts · health-probe.ts
│   ├── schema/    schemas.ts · columns.ts · domain/ · reference/
│   └── seeds/
├── integrations/  registry.ts · <vendor>/
├── modules/       auth/ · users/ · partner-credentials/ · health/
└── utils/         datetime, crypto, secret-cipher, partner-signature, ip-match, route-match, record-diff, request-id, locale, case-converter
```

### 15.12 L12 — Backlog

- JWT RS256/EdDSA + endpoint JWKS (verifikasi lintas service)
- MFA, reset password via email, verifikasi email
- ACL berbasis permission granular
- Retry dengan backoff & circuit breaker integrasi outbound
- Partisi bulanan `record_changes` + runbook retensi
- SonarQube & template CI GitLab
- OpenTelemetry tracing + metrics `/metrics`
- Job queue / scheduler dengan actor `system`
- Validasi production: partner wajib `ip_whitelist` (setelah `TRUST_PROXY_HOPS` diukur per environment)
