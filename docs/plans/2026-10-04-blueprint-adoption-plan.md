# Implementation Plan — Adopsi Blueprint ke Boilerplate Bun + Hono + Drizzle

| Atribut | Nilai |
|---|---|
| Status | IN PROGRESS — **Fase 0–6 + Review 11 + Step 7.1–7.3 selesai** (`main` @ `9558db5`); Step 7.3b (modul dependent, D33) menunggu review (branch `feat/dependent-modules`). Catatan progres di [Bagian 4.1](#41-log-keputusan--progres) |
| Tanggal | 2026-10-04 |
| Basis kode | branch `main` @ `9558db5` |
| Sumber | [`docs/archive/ARCHITECTURE_BLUEPRINT_FROM_NESTJS.md`](../archive/ARCHITECTURE_BLUEPRINT_FROM_NESTJS.md) (NestJS + Drizzle, proyek pemerintahan; dipindah ke arsip di Step 7.1) |
| Target | Boilerplate umum Bun + Hono + Drizzle: `git clone` → `/init-project <nama>` → siap dikembangkan |
| Baseline | Semua gate hijau: typecheck, lint, ls-lint, format, depcruise, depcheck, 74 test (unit + e2e). Coverage 98.46% — **menggelembung** (ikut menghitung file test) |
| Versi kunci | Bun 1.3.0 · Hono 4.13.9 · Zod 3.25.76 · drizzle-orm 0.40.1 · drizzle-kit 0.30.6 · ioredis 5.11.1 · pino 9.14.0 · axios 1.20.0 · TypeScript 5.9.3 · hono-openapi 1.3.3 · zod-openapi 4.2.4 · @scalar/hono-api-reference 0.12.9 |

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
11. [Fase 5 — Inbound: Partner & Webhook Vendor](#fase-5--inbound-partner--webhook-vendor)
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

| # | Prinsip | Arti praktis |
|---|---|---|
| P1 | **Satu step, satu review** | Setiap step = satu branch `<type>/<slug>` + satu commit/PR, dapat di-revert mandiri. AI agent berhenti setelah satu step dan melapor (§14.2); **commit & merge hanya setelah diminta user**. |
| P2 | **Enforce, don't document** | Setiap aturan WAJIB punya penegak (tsc / ESLint / depcruise / ls-lint / test / CI). Aturan tanpa penegak ditandai eksplisit `[review-only]`. |
| P3 | **Compile-time > lint > review** | Pilih penegakan paling awal (mis. schema referensi sebagai `.view().existing()` → mutasi gagal di `tsc`). |
| P4 | **Single Source of Truth** | Satu angka/aturan hanya didefinisikan di satu tempat (`.agents/` untuk aturan agent, `IDENTITY_RULES` untuk identitas, `APP_ERROR_CODES` untuk kode error). |
| P5 | **Gate hijau di setiap commit** | `bun run validate:full` + `bun run build` lulus di setiap step; dokumen yang disentuh ikut diperbarui di commit yang sama. |
| P6 | **Belum ada konsumen** | Perubahan breaking (casing request, envelope error, migrasi `0000`) dilakukan sekarang selagi belum ada FE/partner/deployment. |
| P7 | **Catat, jangan diam-diam menyimpang** | Setiap penyimpangan, temuan baru, atau penundaan dicatat di [Log Keputusan & Progres](#41-log-keputusan--progres) dengan tanggal. |

### 1.3 Non-tujuan (lihat [Backlog](#1512-l12--backlog))

SSO/OIDC eksternal, MFA, reset password via email, ACL permission granular, retry & circuit breaker outbound, partisi fisik `record_changes`, SonarQube, OpenTelemetry, job queue.

---

## 2. Baseline & Temuan Audit

**Sudah ada & berfungsi**: `createApp()` Hono, `ApiResponse` (output snake_case), `asyncHandler`, `validate()` Zod + getter, hierarki `ApiError`, `TransactionHost` + `@Transactional()` (AsyncLocalStorage), Pino + redaksi, `CacheService` fail-open, `HttpClientService` (axios keep-alive), `src/integrations/<vendor>`, health/liveness/readiness, modul `users` referensi, depcruise 20+ rule, ESLint strictTypeChecked + AST rule, ls-lint, commitlint, husky, `init-project`.

**Temuan** (dirujuk oleh step di fase terkait):

| ID | Temuan | Bukti | Step |
|---|---|---|---|
| G1 | Rate limiter memakai `X-Forwarded-For` mentah (bisa dipalsukan) dan store in-memory (tidak berlaku lintas instance) | `src/app.ts` `keyGenerator` | 1.7 |
| G2 | `X-Request-ID` diterima tanpa validasi (log injection); request ID tidak otomatis ada di log service | `core/middlewares/request-id.ts` | 1.2 |
| G3 | `HttpClientService` meneruskan body respons vendor ke `details` dan status vendor (mis. 401) ke client | `core/http/http-client.service.ts` interceptor error | 4.1 |
| G4 | Redis `retryStrategy` mengembalikan `null` setelah 3 percobaan → tidak pernah reconnect sampai restart | `core/cache/redis.client.ts` | 1.6 |
| G5 | Kontrak asimetris: request camelCase (`fullName`), response snake_case | `modules/users/users.dto.ts` | 1.5 |
| G6 | Envelope error memuat `data: null`; code dibangun dinamis (`ERR_EXT_${origin}`); pesan satu bahasa | `core/middlewares/error-handler.ts`, `core/errors/external.error.ts` | 1.3, 1.4 |
| G7 | Tidak ada batas ukuran body | `src/app.ts` | 1.7 |
| G8 | Schema referensi `ref_schema` ikut dibuat migrasi `0000`; tabel domain di `public`; `schemaFilter` dari env `DB_SCHEMA` | `drizzle/0000_quick_leader.sql`, `drizzle.config.ts` | 2.2 |
| G9 | Coverage ikut menghitung `*.test.ts`; tanpa ambang functions & per file; pre-push hanya `lint:branch`; belum ada CI | `scripts/check-coverage.ts`, `.husky/pre-push` | 0.3 |
| G10 | Belum ada auth, actor, audit perubahan, soft delete | — | F2, F3 |
| G11 | List `users` tanpa `ORDER BY` → pagination tidak stabil | `users.repository.ts` `findAll` | 2.8 |
| G12 | Belum ada dokumentasi OpenAPI | — | 1.9 |
| G13 | Health hanya `ready`/`not_ready`, versi ter-prefix `/api/v1/health` | `modules/health/health.service.ts` | 1.8 |
| G14 | **Larangan `c.json()` di controller tidak aktif**: override ESLint `src/modules/**/*.ts` (lebih akhir) mengganti seluruh array `no-restricted-syntax` milik override `*.controller.ts` | `eslint --print-config users.controller.ts` hanya memuat rule modules | 0.3 |
| G15 | Drift identitas: `package.json` `bun-hono-starter` vs `bun.lock` `backend-boilerplate` | ditangani `IDENTITY_RULES` saat init | ✅ setup |
| G16 | `case-converter.util.ts` coverage lines 85.71% (di bawah ambang per file yang direncanakan) | laporan `test:cov` | 0.3 |

---

## 3. Pemetaan NestJS → Bun + Hono

| Blueprint (NestJS) | Target (Bun + Hono) | Step |
|---|---|---|
| `configureApp()` di `app.setup.ts` | `createApp()` di `src/app.ts` — dipakai `index.ts` dan e2e (`app.request()`); urutan middleware di [L10](#1510-l10--urutan-pipeline-createapp) | 1.x |
| Module + DI container | File per layer + singleton dengan default constructor param (D20) | — |
| `APP_GUARD AuthGuard` + `@Public()` | Middleware global `authenticate()` default-deny + registry `PUBLIC_ROUTES` + test enumerasi route (D7) | 3.4 |
| `@AdminOnly()` / `@RequireAcl()` | Middleware `requireRole(...)` per route (D6) | 3.4 |
| `PartnerGuard` + `@PartnerAuth()` | Middleware `partnerAuth()` di prefix `/api/v1/partner/*` (D21) | 5.3 |
| `PartnerAuditInterceptor` | Bagian dari `partnerAuth()` (log setelah `await next()`, `try/finally`) | 5.3 |
| CLS (`nestjs-cls`) | `AsyncLocalStorage` → `RequestContext { requestId, actor, locale, clientIp }` (D8) | 1.2 |
| `TransformInterceptor` | `ApiResponse.toJSON()` + `asyncHandler` (sudah ada) | — |
| `HttpExceptionFilter` | `app.onError(globalErrorHandler)` + `app.notFound()` (sudah ada, diperkeras) | 1.3 |
| `SnakeToCamelPipe` → `ZodValidationPipe` | `validate()`: snake→camel + tolak key non-snake, lalu Zod (D10) | 1.5 |
| `createZodDto` + `UuidParamDto` dst. | Schema Zod bersama di `src/core/dto/` (`uuidParamSchema`, `paginationQuerySchema`, field waktu) | 1.5, 2.1 |
| `@Transactional()` + `TransactionHost` | Sama (sudah ada) | — |
| `nestjs-pino` + `@InjectPinoLogger` | `logger` Pino + `mixin` dari request context | 1.2 |
| `I18N_MESSAGES` + resolver `Accept-Language` | `src/core/i18n/` (D11) | 1.4 |
| Swagger `@ApiStandardResponse` | OpenAPI (D17, dipilih setelah spike) | 1.9 |
| `helmet()` / body limit / `trust proxy` | `secureHeaders()` / `bodyLimit()` / `getClientIp()` + `TRUST_PROXY_HOPS` | 1.7 |
| Jest coverage SSOT | `bun:test` + `scripts/check-coverage.ts` ([L9](#159-l9--knip--check-coverage)) | 0.3 |
| depcheck / knip | knip (D19) | 0.3 |
| `external-<vendor>` (`external-insw`) | `src/integrations/<vendor>/` | 4.x |
| `partner-credential` (K/L) | `src/modules/partner-credentials/` (generik) | 5.x |
| SSO INSW + ACL INSW + `ADMIN_GROUPS` | JWT (access) + refresh token rotasi (cookie) + RBAC `ROLES` ([L3](#153-l3--spesifikasi-auth)) | 3.x |
| CSRF (tidak ada; SSO header-only) | `hono/csrf` (Origin + `Sec-Fetch-Site`) pada endpoint ber-cookie (D4) | 3.3 |

---

## 4. Keputusan

Semua keputusan **ACCEPTED** pada 2026-10-04 (Step 0.2). Perubahan berikutnya dicatat di [4.1](#41-log-keputusan--progres), bukan dengan mengedit tabel ini diam-diam.

| ID | Keputusan | Opsi | Dipilih | Alasan / Dampak | Step |
|---|---|---|---|---|---|
| D0 | Alur branch repo boilerplate | (a) `main` + branch per step · (b) `development → staging → prod` | **(a)** | Alur (b) untuk proyek turunan, bukan repo boilerplate | semua |
| D1 | Model refresh token | (a) JWT refresh stateless · (b) opaque di Redis · (c) opaque di DB | **(c)** hash SHA-256 di `auth_refresh_tokens`, rotasi tiap refresh, deteksi reuse per `family_id` | (a) tidak bisa dicabut; (b) Redis kita fail-open → state auth tidak boleh hilang | 3.2, 3.3 |
| D2 | Access token | HS256 · RS256/EdDSA + JWKS | **HS256** via `hono/jwt`, TTL 15 menit, claims di [L3](#153-l3--spesifikasi-auth) | Tanpa dependency baru; JWKS → backlog | 3.1 |
| D3 | Cookie refresh | — | `refresh_token`; `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`; `Max-Age` = TTL refresh; tidak pernah di body | `Secure` tetap berfungsi di `http://localhost` (secure context) | 3.3 |
| D4 | CSRF endpoint ber-cookie | double-submit token · SameSite + Origin check | **SameSite + `hono/csrf`** (Origin allowlist = `CORS_ORIGINS`, `Sec-Fetch-Site`) | FE tidak perlu mengelola token CSRF | 3.3 |
| D5 | Identitas login | — | Email + password (`Bun.password`, argon2id); register publik mati (`AUTH_REGISTRATION_ENABLED=false`) | User dibuat admin | 3.3 |
| D6 | Otorisasi | RBAC sederhana · permission granular | **RBAC**: `users.role` ∈ `ROLES` (`admin`, `user`) + `requireRole()` | Granular → backlog | 3.4 |
| D7 | Model proteksi route | per route · global default-deny | **Default-deny** + `PUBLIC_ROUTES` + test enumerasi `app.routes` | Lupa memasang auth = celah | 3.4 |
| D8 | Request context | oper `c` ke service · AsyncLocalStorage | **AsyncLocalStorage** `{ requestId, actor, locale, clientIp }` | Service tetap tanpa Hono `Context` (Rule 4) | 1.2 |
| D9 | Request ID | — | Terima `X-Request-ID` bila `^[A-Za-z0-9._:-]{1,128}$`, selain itu `Bun.randomUUIDv7()` | Cegah log injection | 1.2 |
| D10 | Casing request | camelCase masuk · snake_case dua arah | **snake_case dua arah, strict** (key non-snake → 400); opt-out `preserveKeys` | Kontrak simetris; `details[].field` = nama yang dikirim FE | 1.5 |
| D11 | i18n | hanya `en` · `id` + `en` | **`id` + `en`**, default `DEFAULT_LOCALE=id`, via `Accept-Language` | Pilar blueprint dipertahankan | 1.4 |
| D12 | Tipe error HTTP 409 | `BAD_REQUEST` (blueprint) · `CONFLICT` | **`CONFLICT`** | Lebih standar untuk boilerplate umum | 1.3 |
| D13 | Tanggal & waktu | `Date` · Temporal | **`temporal-polyfill`**, runtime & sesi DB UTC, 3 jenis waktu | Cegah bug zona waktu | 2.1 |
| D14 | Schema Postgres | `public` · schema bernama proyek | ~~Satu `pgSchema` bernama proyek~~ → **diubah 2026-10-05 (lihat 4.1): tabel di `public` lewat `appTable`** (proyek memiliki database sendiri); referensi opsional = `.view().existing()`; migrasi `0000` di-generate ulang | Isolasi & aman saat DB dipakai bersama | 2.2 |
| D15 | Primary key | UUID v4 · UUID v7 · serial | **UUID v7 default** (`Bun.randomUUIDv7()`, dibuat aplikasi — PG 16 belum punya `uuidv7()`); `bigint GENERATED ALWAYS AS IDENTITY` (`mode: 'number'`) **hanya** untuk tabel pencatatan bervolume tinggi (log/history/`record_changes`) yang terdaftar di `APPEND_ONLY_TABLES`; ID berurutan tidak pernah menjadi ID resource publik | Index B-tree tidak terfragmentasi | 2.2 |
| D16 | Audit perubahan | — | `record_changes` generik, partition-ready, ditulis base repository dalam transaksi yang sama | Jejak UPDATE/DELETE tidak bisa dilewati | 2.4 |
| D17 | OpenAPI | `@hono/zod-openapi` · `hono-openapi` | **`@hono/zod-openapi` + Scalar**, final setelah spike di Step 1.9 | Kemungkinan perlu Zod v4 | 1.9 |
| D18 | Rate limit | in-memory (`hono-rate-limiter`) · Redis | **Redis** `increment` atomik, fixed window, fail-open, kunci IP tepercaya | Berlaku multi-instance | 1.7 |
| D19 | Quality gate | — | knip ganti depcheck; coverage tanpa file test, global lines & functions ≥ 95, per file lines ≥ 90; pre-push depcruise + knip + test; **CI GitHub Actions** | Bun belum melaporkan branch coverage | 0.3 |
| D20 | DI | container · singleton default param | **Singleton + default constructor param** | Sederhana, mudah di-mock | — |
| D21 | Gateway partner | penanda per route · prefix terpisah | **Prefix `/api/v1/partner/*`** + `partnerAuth()`, modul `partner-credentials` | Tidak tercampur dengan route JWT | 5.x |
| D22 | Redis | — | Reconnect tanpa batas (backoff ≤ 30 dtk), offline queue mati, `commandTimeout`, prefix otomatis `<APP_NAME>:<NODE_ENV>:`, `FLUSHALL`/`FLUSHDB`/`KEYS` diblokir | Resilien & aman dipakai bersama | 1.6 |
| D23 | Kanal inbound | satu jalur `/partner` · jalur terpisah per pemilik kontrak | **Dua kanal**: Partner API `<base>/v1/partner/*` (kontrak kita, `partnerAuth()`) dan webhook vendor `<base>/webhooks/<vendor>` (kontrak vendor, **di luar `/v1`**, verifier per vendor, fail-closed) | Vendor tidak akan mengikuti signing v1 kita; melonggarkan `partnerAuth()` melemahkan semua partner. Ditetapkan 2026-10-12 (diskusi 5.4) | 5.5, 5.6 |
| D24 | Penamaan file modul | prefix kanal di nama (`partner-*`) · subfolder per kanal · segmen tengah | **`<modul>[.<kanal>].<peran>[.test].ts`**, kanal `partner` / `webhook`, akhiran = peran | Aturan ESLint & depcruise membaca **akhiran** (`.routes.ts`, …): `x.partner-routes.ts` akan lolos dari semuanya. Ditegakkan ls-lint / test struktur | 5.5 |
| D25 | Penamaan integrasi | prefix `integration-*` · folder lapisan | **`src/integrations/<vendor>/<vendor>.<peran>.ts`** (`service`, `dto`, `webhook`, `webhook.dto`, `index.ts`) — folder lapisan sudah penandanya | Konsisten dengan `jsonplaceholder`; semua pengetahuan vendor (outbound, webhook, config, registry) di satu tempat | 5.5, 5.6 |
| D26 | Nama modul | nama vendor · nama domain | **Domain** (mis. `messaging`, bukan `wahref`); vendor hanya di `integrations/` | Ganti vendor = adapter baru, modul tetap. Ditegakkan test struktur | 5.5 |
| D27 | Endpoint khusus satu partner | hanya `allowed_routes` · + penjaga di kode | **`requirePartner(...codes)`** di route, selain `allowed_routes` | Salah konfigurasi `allowed_routes` oleh admin tidak membuka endpoint ke partner lain | 5.5 |
| D28 | Idempotensi inbound | opsional · wajib | **Wajib**: webhook → `webhook_events` unique (vendor, event ID); endpoint partner yang menulis → unique (`partner_code`, `partner_reference`) | Nonce partner dan Redis fail-open tidak menjamin "sekali proses"; vendor mengirim ulang event yang sama | 5.5, 5.6 |
| D29 | Rate limit kanal inbound | ikut limit global per IP · dikecualikan + limit penolakan per IP | **Prefix partner & webhook di luar limit global**; per IP hanya percobaan yang ditolak (401/403) yang dihitung (`rejectionLimit()`, `RATE_LIMIT_*` yang sama) | Limit global (default 1000/15 menit ≈ 66 rpm) diam-diam menjadi plafon `rate_limit_rpm` partner (sampai 100.000) dan menolak burst retry vendor; tebakan key/signature tetap kena 429 sebelum lookup kredensial | Review 10 |
| D30 | Contoh kanal inbound saat `bun run setup` | dipertahankan · dihapus semua · sebagian | **Contoh webhook (`demo-pay` + `payment-notifications`) dihapus** seperti `orders` (kecuali `--keep-examples`); `partner-gateway` (ping/echo) **tetap** | Proyek baru mulai tanpa vendor fiktif; ping/echo dipakai onboarding partner (panduan §9) | Review 10 |
| D31 | CLI scaffolder | hanya skill AI · CLI dari template yang sama | **`bun run scaffold <module\|partner\|webhook\|integration> <nama>`** membaca template `scaffold-module` (markdown = sumber tunggal) lewat library yang juga dipakai `verify:scaffold` | Konvensi tetap terjaga tanpa agent AI; agent cukup menjalankan CLI lalu menyesuaikan field domain (hemat token) | 7.3 |
| D32 | Sumber standar | CONTRIBUTING (ID) + skill & `references/` (EN) + `AGENTS.md` berdampingan · satu sumber | **`docs/standards/` (EN), satu file per topik = satu-satunya sumber**; `ARCHITECTURE.md` = mengapa + indeks aturan; CONTRIBUTING, `AGENTS.md`, skill = router; template kode tetap di skill `scaffold-module` | Standar yang ditulis 4–5 kali dalam dua bahasa selalu drift (Review 5–11); developer dan agent kini membaca file yang sama. Ditegakkan `test/docs-sync.test.ts` | 7.2 |
| D33 | Anak yang punya halaman / resource sendiri (parent-child) | hanya `header-detail` (bertingkat `/:id/<detail>`) · beberapa detail dalam satu modul · **modul dependent sendiri** dengan acuan parent | **Jenis tabel ke-6 "Dependent"**: modul sendiri (`bun run scaffold module <jamak> --parent=<parent-jamak>`) di ~~folder sejajar~~ → **subfolder parent `src/modules/<parent>/<anak>/`** (diubah 2026-10-13, lihat 4.1), route **shallow nesting** (koleksi di bawah parent `/<parent>/:<parent>Id/<jamak>`, baris datar `/<jamak>/:id`; parent dari path, tidak pernah dari body; tanpa list lintas parent), soft delete sendiri, `DependentRepository`: setiap read hanya melihat baris yang parent-nya hidup, setiap write mengunci parent lalu memastikan parent ada & hidup, referensi parent tidak bisa dipindah, audit dengan `parent_table` / `parent_id`. **Parent dihapus = anak dianggap terhapus** (disembunyikan, tanpa cascade; restore parent memunculkan kembali). Hook `assertParentWritable(parent)` (default: selalu boleh) di `ChildRepository` dan `DependentRepository` untuk mengunci anak menurut status parent; hook `parentScope()` (default: tanpa batasan) menambah kondisi kepemilikan parent ke setiap read & write anak — parent milik orang lain = 404. **`--one`** = section 1:1 (maksimal satu anak hidup per parent: `activeUniqueIndex` pada kolom parent, `GET` / `PUT /<parent>/:id/<section>` upsert). **Bertahap**: parent = modul standalone biasa yang sudah ada; anak 1:N atau 1:1 ditambah kapan saja tanpa mengubah modul parent | `header-detail` = komposisi (bagian form header); dependent = anak yang berdiri sendiri (halaman FE sendiri) tetapi tetap tunduk pada parent. Cek parent lewat tabel schema, bukan import modul; sebagai subfolder, parent dan anak dihitung satu modul oleh `no-cross-module-deps` (service parent boleh memakai repository anak, mis. cek kelengkapan; `no-circular` tetap berlaku). Anak baru = modul baru, header tidak diedit (selaras keputusan 7.3: tidak ada `scaffold detail`). Ditetapkan 2026-10-13 (diskusi sebelum 7.4) | 7.3b |

### 4.1 Log Keputusan & Progres

Catatan kronologis: keputusan, temuan, penyimpangan dari rencana, penundaan, dan step yang selesai. **Tambahkan baris baru di bawah; jangan mengubah baris lama.**

| Tanggal | ID / Step | Catatan | Detail |
|---|---|---|---|
| 2026-10-04 | Setup | `.agents/` = satu-satunya sumber aturan & skill; `CLAUDE.md` hanya `@.agents/AGENTS.md`; `.claude/skills/<name>/SKILL.md` = wrapper penunjuk | Symlink tidak dipakai: `core.symlinks=false` (Windows) membuat symlink ter-checkout sebagai file teks |
| 2026-10-04 | Setup | Proteksi `.env` ditegakkan mesin: `.claude/settings.json` (`permissions.deny`) + hook `PreToolUse` `.claude/hooks/protect-env.mjs` | 13 kasus uji (termasuk path Windows) lulus |
| 2026-10-04 | Setup | Ditemukan & diperbaiki: hook awalnya memeriksa **isi** file yang ditulis → kode yang menyebut string env diblokir | Kini hanya field `file_path`, `path`, `pattern`, `glob`, `notebook_path`, `command` |
| 2026-10-04 | Setup | Link absolut `file:///d:/…` di `project-standards/SKILL.md` dan `CONTRIBUTING.md` → relatif | Tidak portabel antar mesin |
| 2026-10-04 | Setup | Skill `init-project` + `scripts/setup.ts` dengan registry `IDENTITY_RULES` (drift guard: rule tanpa match → abort tanpa menulis apa pun), `--dry-run`, `--description` | Diuji di salinan repo: rename, rename ulang, nama invalid, drift |
| 2026-10-04 | Setup | Ditemukan & diperbaiki saat uji: `parseArgs` mengabaikan argumen pertama bila `--description` tidak diberikan | — |
| 2026-10-04 | Setup | Dokumen `.agents/` dibuat agnostik nama proyek; `AGENTS.md` invariant #10 (Single-Source Project Identity) | Mengurangi jumlah `IDENTITY_RULES` |
| 2026-10-04 | 0.1 | ✅ Baseline commit `df3c0da`; branch `master` → `main` | 127 file; `.env` & `coverage/` diverifikasi tidak ter-commit; pre-commit hook hijau |
| 2026-10-04 | 0.2 | ✅ D0–D22 ACCEPTED sesuai rekomendasi (`e6fd8af`) | D17 final setelah spike Step 1.9 |
| 2026-10-04 | Plan | Plan ditulis ulang lebih detail mengikuti format `docs/plans/from-nestjs-plan.md` (log progres, masalah → solusi → langkah → acceptance criteria, lampiran spesifikasi) | Atas permintaan user |
| 2026-10-04 | Plan | Temuan verifikasi API: Hono 4.13 menyediakan `hono/csrf` (Origin + `Sec-Fetch-Site`), `hono/jwt` `verify` dengan opsi `iss`/`aud`, `hono/conninfo`, `hono/body-limit` | D4 memakai `hono/csrf` (bukan middleware buatan sendiri) |
| 2026-10-04 | G14 | Ditemukan: larangan `c.json()` di controller tidak aktif (override ESLint saling menimpa) | Perbaikan dijadwalkan di Step 0.3 (komposisi grup rule, [L7](#157-l7--snippet-eslint)) |
| 2026-10-04 | Desain | **Perlu konfirmasi di Step 3.2**: `auth_refresh_tokens` dikecualikan dari aturan "update hanya lewat base repository + `record_changes`" | Rotasi token = state keamanan bervolume tinggi; jejaknya sudah ada di `revoked_at`/`replaced_by_id`. Pengecualian eksplisit di ESLint + alasan |
| 2026-10-04 | Desain | Actor default di request yang belum terautentikasi = `anonymous`; di luar request = `system` | Melengkapi D8 |
| 2026-10-04 | Desain | `record_changes` disimpan di schema proyek (D14), bukan schema `system` terpisah | Satu schema dimigrasi; selaras blueprint |
| 2026-10-04 | Catatan | `docs/plans/from-nestjs-plan.md` (referensi format) belum di-commit | Menunggu keputusan user: commit ke `docs/archive/` bersama blueprint (Step 7.1) atau tetap lokal |
| 2026-10-04 | Desain | ✅ Dikonfirmasi user: `auth_refresh_tokens` dikecualikan dari aturan audit base repository (baris "Perlu konfirmasi di Step 3.2" di atas) | Diterapkan di Step 3.2 lewat override ESLint satu file + komentar alasan |
| 2026-10-04 | Catatan | `docs/plans/from-nestjs-plan.md` **tidak** di-commit dan tidak diarsipkan | Keputusan user: file akan dihapus sendiri oleh user |
| 2026-10-04 | Proses | **AI agent tidak pernah commit atau merge sebelum diminta user.** Step diakhiri dengan perubahan di working tree + usulan pesan commit | Keputusan user (semua perubahan direview dulu); berlaku juga di `AGENTS.md`. P1 & §14 disesuaikan |
| 2026-10-04 | Plan | Merge `0882a83` (plan detail) ke `main` disetujui user, tetapi merge oleh agent diblokir permission tool | Merge dijalankan user: `git switch main && git merge --ff-only docs/detailed-adoption-plan` |
| 2026-10-04 | Plan | ✅ Plan detail + catatan review masuk `main` (`0882a83`, `fb843bb`), di-commit & di-merge oleh user | — |
| 2026-10-04 | 0.3 | Coverage nyata sebelum step ini (tanpa file test): lines 96.81%, functions **93.71%** (di bawah 95); 5 file di bawah 90% lines | Angka 98.46% di baseline menggelembung karena file test ikut dihitung (G9) |
| 2026-10-04 | 0.3 | Ditemukan: Bun hanya menginstrumentasi file yang di-import test → file tanpa test tidak muncul di lcov dan lolos diam-diam | Ditambahkan di luar rencana awal: `check-coverage.ts` membandingkan lcov dengan seluruh `src/**/*.ts`; barrel re-export murni dikecualikan otomatis |
| 2026-10-04 | 0.3 | `COVERAGE_EXCLUSIONS` (3, wajib alasan + step penghapus): `src/index.ts` (permanen, smoke test 7.3), `src/config/env.config.ts` (hapus di 1.1), `src/core/cache/redis.client.ts` (hapus di 1.6) | `redis.client` di-mock global oleh `users.e2e.test.ts` (`mock.module` berlaku lintas file) → test di tempat rapuh terhadap urutan file |
| 2026-10-04 | 0.3 | knip menemukan kode mati yang lolos depcheck → dihapus (bukan di-ignore): `src/config/index.ts`, `src/utils/index.ts`, re-export `DrizzleDatabase`, `JsonPlaceholderUser`, `updateUserSchema`/`UpdateUserDto`, alias `checkHealth` | `updateUserSchema` dibuat ulang bersama endpoint PATCH di Step 2.8 |
| 2026-10-04 | 0.3 | knip terpasang versi **6** (plan menulis v5); `entry` cukup `scripts/*.ts` (entry lain terdeteksi otomatis oleh plugin knip) | L9 diperbarui |
| 2026-10-04 | 0.3 | Selector larangan respons langsung di controller diperluas: `c.json` → `c.json`/`c.text`/`c.body`/`c.html` | Sesuai Rule 1 project-standards ("never `c.json()` or `c.text()`") |
| 2026-10-04 | 0.3 | `logger.ts` di-refactor: `buildLoggerOptions(config)` murni agar cabang development/production teruji (tanpa perubahan perilaku) | Diperlukan ambang per file; mixin request context menyusul di 1.2 |
| 2026-10-04 | 0.3 | Cakupan `lint` dan `format`/`format:check` diperluas ke `scripts/`; `depcruise` dipindah dari pre-commit ke pre-push | Pre-commit tetap cepat |
| 2026-10-04 | 0.3 | Acceptance "CI hijau pada PR pertama" **belum terverifikasi**: repo belum punya remote GitHub | Diverifikasi saat repo di-push pertama kali |
| 2026-10-04 | 0.3 | ✅ Di-commit atas permintaan user (`9e0b75a`) di `chore/quality-gate-parity`; commitlint menolak percobaan pertama (baris body > 100 karakter) → pesan dipendekkan | Merge ke `main` **belum** dilakukan (menunggu user); Step 1.1 dikerjakan di branch yang ditumpuk di atasnya |
| 2026-10-04 | 1.1 | Pola config: `build<Group>Config(source)` murni + instance `<group>Config`; `env-source.ts` satu-satunya pembaca `process.env` + guard `.env` hilang; barrel `src/config` | Semua cabang validasi teruji tanpa proses terpisah; pengecualian coverage `env.config.ts` dihapus |
| 2026-10-04 | 1.1 | Default khusus test (`DATABASE_URL`, `REDIS_HOST`) digabung ke source sebelum validasi, bukan schema berbeda per mode | Schema tetap statis → tipe ter-infer tanpa factory (ESLint `explicit-function-return-type`) |
| 2026-10-04 | 1.1 | Pesan error tidak pernah mencetak nilai: `invalid_type` / `invalid_enum_value` diformat ulang (pesan bawaan Zod menyertakan nilai yang diterima) | Env bisa berisi secret |
| 2026-10-04 | 1.1 | Keterbatasan: validasi berhenti di grup pertama yang gagal (setiap grup divalidasi saat modulnya di-import) — terbukti lewat smoke test proses terpisah | Dokumen dikoreksi menjadi "semua variabel dalam grup"; agregasi lintas grup tidak dikerjakan (tidak sepadan) |
| 2026-10-04 | 1.1 | `EXTERNAL_VENDOR_*` dihapus di 1.1 (tidak pernah dipakai kode), bukan di 4.2; `DB_SCHEMA` tetap sampai 2.2; `.env.example` dikelompokkan per file config | L1 diperbarui |
| 2026-10-04 | 1.1 | ✅ Di-commit (`159cae2`) dan di-merge ke `main` atas permintaan user, bersama Step 0.3 (`9e0b75a`) | Branch `chore/quality-gate-parity` & `feat/config-groups` sudah ter-merge (belum dihapus) |
| 2026-10-04 | 1.2 | `RequestContext` berisi `requestId` + `actor` saja; `locale` ditambahkan di 1.4 dan `clientIp` di 1.7, bersama logika yang mengisinya | Menghindari field yang diisi nilai sementara (hardcode) |
| 2026-10-04 | 1.2 | `setActor()` di luar request **melempar error** (plan: no-op) | Actor yang di-set di luar request akan hilang diam-diam → bug audit yang sulit dilacak |
| 2026-10-04 | 1.2 | Error handler & not-found tidak lagi fallback ke header `x-request-id` mentah; nilai dari context (terbukti: `onError`/`notFound` Hono berjalan di dalam context middleware) | Fallback header mentah adalah jalur log injection (G2) |
| 2026-10-04 | 1.2 | Test "context request bersarang dengan context transaksi" ditempatkan di `src/database/transaction-host.test.ts`, bukan di `src/core/` | depcruise `strict-core-isolation` menolak test di `core/` meng-import `database/`; aturan tidak dilonggarkan |
| 2026-10-04 | 1.2 | Barrel `src/core/context/index.ts` dihapus (knip: tidak terpakai); pemakai meng-import `request-context.ts` langsung | — |
| 2026-10-04 | 1.2 | ✅ Di-commit (`32d8661`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-04 | 1.3 | Konstruktor error diubah menjadi `new XError(message, { details?, origin?, code? })` (sebelumnya posisional); `errorCode` = override `code` atau default kelas | Bentuk opsi dibutuhkan juga oleh i18n (1.4); semua call site diperbarui |
| 2026-10-04 | 1.3 | Ditambahkan di luar rencana: `InternalServerError` (500, pesan & detail tidak pernah dikirim ke client) untuk invariant rusak — menggantikan `throw new Error` di `users.repository.ts` | Wajib agar larangan `throw new Error` di modul bisa hijau |
| 2026-10-04 | 1.3 | `TooManyRequestsError` membawa `retryAfterSeconds` → header `Retry-After` dipasang oleh error handler | Dipakai rate limit 1.7 dan brute-force limit 3.3 |
| 2026-10-04 | 1.3 | Dikerjakan lebih awal dari 4.1: `HttpClientService` mengklasifikasi kegagalan (`TIMEOUT`/`UNREACHABLE`/`ERROR`) → status vendor tidak lagi diteruskan ke client | Konsekuensi konstruktor `ExternalServiceError(kind, …)`; sisa 4.1 (masking body vendor, propagasi request ID, registry integrasi, timeout wajib) tetap |
| 2026-10-04 | 1.3 | Rule `no-restricted-syntax` dimatikan untuk file test (assert literal kontrak `ERR_*`, fixture `throw new Error`), kecuali test modul tetap kena larangan import `db`/`HttpClientService` | Mengikuti pola komposisi grup rule (Step 0.3) |
| 2026-10-04 | 1.3 | Envelope error dibangun di satu tempat (`buildErrorBody`, `src/core/response/error-response.ts`), dipakai `globalErrorHandler` & `notFoundHandler` (`sendError`) | `error.origin` masih `string`; registry integrasi menyusul di 4.1 |
| 2026-10-04 | 1.3 | ✅ Di-commit (`bd6c74e`) atas permintaan user; merge ditunda sampai perbaikan hasil review selesai | — |
| 2026-10-04 | 1.1 | Penyimpangan yang terlambat dicatat: `API_PREFIX` dipertahankan di `app.config.ts` (plan 1.1 menulis `API_BASE_PATH`) | Penggantian ke `API_BASE_PATH` tetap di Step 1.8 bersama pemisahan route health tanpa versi |
| 2026-10-04 | Review | Review ulang 1.1–1.3 atas permintaan user: 12 temuan. Semua diperbaiki di branch `feat/error-contract` (baris di bawah) | Gate tetap hijau; setiap aturan baru dibuktikan dengan chaos test |
| 2026-10-04 | Review | `no-process-env` kini hanya dimatikan untuk `src/config/env-source.ts` + `drizzle.config.ts` (sebelumnya seluruh `src/config/**`, bertentangan dengan dokumen) | Chaos test: `process.env` di file config lain → error |
| 2026-10-04 | Review | Rule depcruise baru `strict-config-isolation`: `src/config/` hanya boleh memakai library (tidak boleh `core`/`database`/`modules`/`integrations`/`utils`) | Mencegah siklus config ↔ logger; chaos test lulus |
| 2026-10-04 | Review | Error handler memetakan `HTTPException` Hono (401/403/404/413/429/503; 4xx lain → 400; 5xx lain → 500) ke kontrak error — sebelumnya menjadi 500 | Wajib untuk `hono/csrf` (3.3) & `hono/body-limit` (1.7); respons kustom bawaan exception sengaja dibuang |
| 2026-10-04 | Review | Selector ESLint diperkuat: kode `ERR_*` dari template literal dan `throw Error(...)` tanpa `new` kini ditolak | L7 diperbarui |
| 2026-10-04 | Review | Ditemukan: template `scaffold-module` **sudah rusak sebelum 1.1** (import `domainTable` & `txHost` salah → tsc gagal) dan melanggar aturan baru (`throw new Error`, `UpdateDto` tak terpakai) | Diperbaiki & diverifikasi dengan men-generate modul `products` dari template: tsc, ESLint, depcruise, knip, ls-lint hijau + request nyata → 400 envelope standar; modul dihapus lagi |
| 2026-10-04 | Review | Skill `generate-commit-text` diselaraskan dengan commitlint: tanpa `style`, tambah `build`/`revert`, batas 100 karakter per baris body, scope baru (`config`, `core/context`, `core/response`, …) | Skill sebelumnya menyarankan tipe yang ditolak commitlint |
| 2026-10-04 | Review | Test `HttpClientService` per jenis kegagalan (refused → UNREACHABLE 502, vendor 401 → ERROR 502, timeout → TIMEOUT 504) | Sebelumnya hanya `instanceof` — cabang "tercakup" tanpa dites |
| 2026-10-04 | Review | Hook `.env` dipertahankan fail-closed: pola seperti regex `process\.env` tetap diblokir karena tidak bisa dibedakan dari path nyata (`C:\process\.env`); perilaku & workaround didokumentasikan di header hook dan `CLAUDE.md` | Keputusan keamanan, bukan bug |
| 2026-10-04 | Review | Dokumen disinkronkan: daftar aturan AST & layer di `AGENTS.md`, lapisan `config` di project-standards §3 & CONTRIBUTING §2.2, contoh `request_id` UUID v7, rute README memakai `appConfig.API_PREFIX`, DoD §14.1 & risiko §14.3 | — |
| 2026-10-04 | Review | Temuan tambahan saat sweep akhir: project-standards & `references/transactions.md` menyebut aturan ESLint yang **tidak ada** (`no-c-json-in-controllers`, `no-direct-db-in-repositories`) | Diganti dengan penegak sebenarnya (grup `no-restricted-syntax`/`no-restricted-imports`, depcruise `no-module-direct-db-connection`) |
| 2026-10-04 | Review | Contoh repository di `references/transactions.md` memakai import `txHost` yang tidak ada dan pola destructuring yang gagal lint — disamakan dengan pola terverifikasi template scaffold | Total temuan review: 14 (12 awal + 2 sweep akhir), semua ditutup |
| 2026-10-04 | Review | ✅ Perbaikan review di-commit (`dd2a7fd`); Step 1.3 + perbaikan di-merge ke `main` atas permintaan user | — |
| 2026-10-04 | 1.4 | `SUPPORTED_LOCALES`/`Locale`/`DEFAULT_LOCALE` didefinisikan di `app.config.ts` (bukan `core/i18n`) | `strict-config-isolation` melarang config meng-import `core`; arah dependensi `core → config` dipertahankan |
| 2026-10-04 | 1.4 | Penyimpangan: pesan domain berada di `src/modules/<name>/<name>.messages.ts`, bukan satu registry `I18N_MESSAGES` global | `core/` tidak memuat teks domain; `I18N_MESSAGES` hanya untuk pesan lintas modul. Pesan berparameter memakai fungsi (`userNotFoundMessage(id)`) |
| 2026-10-04 | 1.4 | `MessageInput = LocalizedMessage \| string`: string hanya untuk teks yang tak bisa dilokalkan di sini (pesan `HTTPException` pihak ketiga, pesan field Zod) | ESLint menolak string literal di modul, sehingga jalur string tidak dipakai untuk teks domain |
| 2026-10-04 | 1.4 | `ErrorDetail.message` juga bisa dilokalkan (detail domain diterjemahkan); `Error.message` selalu bahasa Inggris agar log seragam | Pesan per field Zod tetap tidak diterjemahkan (keterbatasan terdokumentasi) |
| 2026-10-04 | 1.4 | Respons membawa `Content-Language` + `Vary: Accept-Language` (tidak ada di rencana awal) | Cache/proxy tidak mencampur bahasa |
| 2026-10-04 | 1.4 | Template `scaffold-module` mendapat langkah baru "Create Messages" (Step 4; langkah berikutnya bergeser) — diverifikasi ulang dengan men-generate modul `products` | Tanpa ini modul hasil scaffold langsung gagal lint aturan baru |
| 2026-10-04 | 1.4 | Judul dokumen yang angkanya basi diperbaiki: "The 5 Core Architectural Rules" (project-standards, berisi 10 aturan) dan "The 7 Pillars" (README) | Ditemukan saat menambah Rule 10 / pilar i18n |
| 2026-10-04 | 1.4 | ✅ Di-commit (`0ab188e`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-04 | 1.5 | Ditemukan & diperbaiki: ReDoS di `toSnakeCase` — regex `([A-Z]+)([A-Z][a-z])` kuadratik (terukur 10k karakter = 100 ms, 20k = 424 ms → 100k ≈ 10 dtk event loop terblokir); menjadi terjangkau dari input client sejak key request/dictionary bisa sampai ke konversi | Diganti implementasi linear satu putaran; fuzz 5000 string membuktikan output identik dengan regex lama; test regresi waktu permanen |
| 2026-10-04 | 1.5 | `ErrorDetail.verbatimField`: key yang ditolak dilaporkan persis seperti dikirim (`fullName`), bukan dikonversi menjadi `full_name` oleh envelope | Tanpa ini FE akan melihat nama field yang justru benar sebagai "salah" |
| 2026-10-04 | 1.5 | Penyimpangan: `common.dto.ts` hanya berisi `uuidParamSchema` + `paginationQuerySchema`; `uuidChildParamSchema` & `numericIdParamSchema` ditunda ke Step 2.8 (route header/detail & tabel pencatatan) | knip menolak export tanpa pemakai — dibuat saat pertama dibutuhkan |
| 2026-10-04 | 1.5 | Kontrak paginasi `users` berubah: query `limit` → `per_page` (DTO `perPage`), selaras dengan `meta.per_page` yang sudah ada di respons | Belum ada konsumen; e2e & unit test diperbarui |
| 2026-10-04 | 1.5 | `preserveKeys` hanya untuk body (top-level); query & params tidak mendukungnya | Query selalu string datar; dictionary di query tidak didukung secara sengaja |
| 2026-10-04 | 1.5 | Template `scaffold-module`: DTO memakai `uuidParamSchema`/`paginationQuerySchema` bersama + penjelasan kontrak snake_case; diverifikasi ulang dengan men-generate modul `products` (gate hijau, body & query camelCase → 400) | — |
| 2026-10-04 | 1.5 | ✅ Di-commit (`240d8fe`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-04 | Review 2 | Review ulang 1.4–1.5 atas permintaan user: 9 temuan — 7 diperbaiki di branch `fix/review-1-4-1-5`, 2 dipindah ke step terjadwal (baris di bawah) | Gate tetap hijau; aturan yang diubah dibuktikan dengan chaos test |
| 2026-10-04 | Review 2 | Aturan ESLint i18n salah menolak `new ExternalServiceError('TIMEOUT', …)` (argumen pertama = jenis kegagalan). Kini `ExternalServiceError` hanya dicek pada argumen ke-2 (`:nth-child(2)`) | Chaos test: jenis literal lolos; pesan literal/template di argumen ke-2 tetap ditolak |
| 2026-10-04 | Review 2 | Detail error JSON rusak kini dilokalkan (`I18N_MESSAGES.INVALID_JSON_DETAIL`) | Sebelumnya hanya bahasa Inggris |
| 2026-10-04 | Review 2 | Keputusan user (rekomendasi): asimetri `preserveKeys` (request saja; response tetap mengonversi key dictionary) **didokumentasikan sebagai keterbatasan** + anjuran array `{ key, value }` | Opt-out sisi response baru dibuat bila ada kebutuhan nyata |
| 2026-10-04 | Review 2 | Penjaga baru `scripts/verify-scaffold.ts` (`bun run verify:scaffold`, langkah CI): men-generate modul `scaffold-probes` dari template, menjalankan prettier/tsc/ESLint/ls-lint/depcruise/knip + request nyata, lalu memulihkan semua file (juga saat gagal/Ctrl+C) | Template sudah tiga kali tertinggal dari kode; chaos test: template yang dirusak → gagal & bersih |
| 2026-10-04 | Review 2 | Dokumen disinkronkan: contoh envelope project-standards §5 (pesan default `id`, negosiasi bahasa, kode `ERR_INVALID_JSON`/`ERR_NON_SNAKE_CASE_KEY`), tabel kelas error CONTRIBUTING §3.3, scope commit `core/dto`, AGENTS.md & DoD §14.1 (`verify:scaffold`) | — |
| 2026-10-04 | Review 2 | Ditunda ke 1.6: `CACHE_KEYS.userList(page, limit)` tak dipakai kode produksi & nama basi. Ditunda ke 4.1: fallback detail `'Unknown external service error'` belum dilokalkan | Dicatat di langkah step terkait |
| 2026-10-04 | Review 2 | ✅ Di-commit (`5abde57`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-04 | 1.6 | `redis.client.ts`: `SafeRedis` (subclass ioredis) menolak `FLUSHALL`/`FLUSHDB`/`KEYS` di `sendCommand` — satu titik yang juga dilalui `call()`, pipeline dan `multi()`; `reconnectDelay` tanpa batas (500 ms × n, maks 30 dtk); `enableOfflineQueue: false`, `maxRetriesPerRequest: 0`, `commandTimeout` | Chaos test ke port mati: 5 percobaan reconnect dalam ~6 dtk (dulu berhenti setelah 3); command mentah ditolak dalam ±1,4 ms; cache fail-open ±0,5 ms |
| 2026-10-04 | 1.6 | `REDIS_KEY_PREFIX` kosong = `<APP_NAME>:<NODE_ENV>` (prefix selalu aktif, tidak bisa dimatikan); override divalidasi `segment(:segment)*` tanpa `:` di akhir. `buildRedisConfig(source, app)` menerima `APP_NAME`/`NODE_ENV` dari grup app. `REDIS_COMMAND_TIMEOUT_MS` (default 1000) | Prefix diturunkan dari `APP_NAME` → tidak perlu `IDENTITY_RULES` baru |
| 2026-10-04 | 1.6 | `CacheService` menerima client lewat constructor (`CacheClient` = `Pick<Redis, …>`); test memakai client palsu, bukan mutasi singleton. `isReady()` kini hanya `status === 'ready'` (dulu juga `connect`, yang tanpa offline queue tidak bisa melayani command) | — |
| 2026-10-04 | 1.6 | Deviasi: `increment` mengembalikan `{ count, ttlSeconds } \| null` (bukan angka) — `ttlSeconds` dibutuhkan 1.7 untuk `Retry-After`/`RateLimit-Reset`. Lua memakai `EXPIRE … NX` → **butuh Redis ≥ 7** (docker-compose: `redis:7-alpine`) | Dicatat di `references/redis-cache.md` |
| 2026-10-04 | 1.6 | Perubahan perilaku `getOrSet`: `null` dulu ikut di-cache dengan TTL penuh, kini hanya dengan `negativeTtl` (sentinel `{"__nil":1}`); `undefined` tidak pernah di-cache; entri rusak (JSON invalid) = miss; serialisasi gagal (BigInt/siklus) ikut fail-open | Test per kasus di `cache.service.test.ts` |
| 2026-10-04 | 1.6 | Exclusion coverage `redis.client.ts` dihapus: logika dipisah jadi fungsi murni + `redis.client.test.ts` (tanpa koneksi). Mock global `redis.client` di `users.e2e.test.ts` dihapus — client lazy tidak pernah konek saat di-import dan cache fail-open | Sumber kerapuhan urutan test (log 0.3) hilang |
| 2026-10-04 | 1.6 | `CACHE_KEYS.userList(page, limit)` dihapus (temuan review 1.4–1.5). Dokumen: `references/redis-cache.md` ditulis ulang (API, tabel ketahanan, catatan `Date` → string ISO saat di-cache), project-standards SKILL, CONTRIBUTING §9, `.env.example`, `references/bootstrap.md` §2 (disamakan dengan `src/index.ts`: Redis fail-open, bukan fail-fast) | — |
| 2026-10-04 | 1.6 | Temuan untuk 1.7: `references/bootstrap.md` §1/§3 (pipeline `createApp`, `errorHandler` → seharusnya `globalErrorHandler`) basi — ditulis ulang bersama urutan L10 di 1.7 | Belum diperbaiki di 1.6 (di luar lingkup) |
| 2026-10-04 | 1.6 | ✅ Di-commit (`89d2e65`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-04 | 1.7 | `client-ip.ts`: `selectClientIp(socket, xff, hops)` murni — `hops=0` abaikan `X-Forwarded-For`; `hops=n` entri ke-n dari kanan; rantai lebih pendek → entri paling kiri; entri bukan IP → alamat socket; `::ffff:` dinormalisasi. `getConnInfo` gagal (mis. `app.request()` di test) → `unknown`. IP disimpan di `RequestContext.clientIp` (`getClientIp()`) dan dicatat di log request | Test memakai socket nyata (`Bun.serve` port 0): XFF palsu tetap `127.0.0.1`/`::1`; `hops=1` → entri paling kanan |
| 2026-10-04 | 1.7 | `rateLimit({ windowSeconds, max, keyPrefix, skip?, cache? })` di atas `cacheService.increment` (`CACHE_KEYS.rateLimit(scope, subject)`); header `RateLimit-Limit/Remaining/Reset`; lewat batas → `TooManyRequestsError` + `Retry-After` (TTL jendela). `hono-rate-limiter` dihapus | Header `RateLimit-*` terbukti ikut terkirim pada respons 429 dari `globalErrorHandler` |
| 2026-10-04 | 1.7 | Deviasi: endpoint health **dikecualikan** dari rate limit global (`skip`) — probe k8s/LB tiap ~10 dtk dari satu IP node bisa menghabiskan 100 req/15 mnt. L10 menaruh health setelah rate limit; urutan tetap, hanya di-skip | Ditinjau ulang bersama base path di 1.8 |
| 2026-10-04 | 1.7 | CORS & body limit menjadi middleware inti (`corsMiddleware(origins)`, `bodySizeLimit(bytes)`) agar bisa dites tanpa singleton config. `CORS_ORIGINS` (CSV origin persis, tanpa path; `*` me-refleksikan origin pemanggil — bukan `*` literal karena `credentials: true`) ditolak saat production; kosong → middleware tidak dipasang. `buildHttpConfig(source, app)` menerima `NODE_ENV`. `requestContextMiddleware({ trustProxyHops })` dapat di-override | Chaos test proses: `NODE_ENV=production CORS_ORIGINS=*` → app menolak start |
| 2026-10-04 | 1.7 | Env baru/ganti: `CORS_ORIGIN` → `CORS_ORIGINS`, `RATE_LIMIT_WINDOW_MS` → `RATE_LIMIT_WINDOW_SECONDS`, baru `TRUST_PROXY_HOPS`, `HTTP_BODY_LIMIT_BYTES`. **Catatan upgrade**: nama lama diabaikan tanpa error (CORS jadi mati = gagal aman) — deployment wajib mengganti nama | Terbukti dengan chaos test; deteksi variabel usang belum ada (bisa jadi temuan review) |
| 2026-10-04 | 1.7 | Body limit terbukti untuk `Content-Length` dan body streaming/chunked tanpa `Content-Length` (2 MB lewat socket nyata → 413 `ERR_PAYLOAD_TOO_LARGE`). Urutan L10: CORS sebelum body limit & rate limit → respons 413/429 tetap membawa header CORS; preflight tidak dihitung rate limit | — |
| 2026-10-04 | 1.7 | Dokumen: `references/bootstrap.md` §1 (disamakan dengan `src/app.ts`) dan §3 (tabel pipeline L10 + catatan IP klien) — menutup temuan 1.6; `.env.example`, README (Platform Hardening), struktur folder di project-standards SKILL & CONTRIBUTING | — |
| 2026-10-04 | 1.7 | **Bug 1.6 ditemukan saat uji ke Redis lokal user (Redis 3.0.504, port Windows)**: skrip `increment` memakai `EXPIRE … NX` (Redis ≥ 7) → di server lama selalu error → fail-open → rate limit diam-diam tidak pernah berlaku (hanya log `warn`). Unit test tidak menangkapnya karena client palsu tidak menjalankan Lua. Skrip diganti `INCR` + `TTL` + `EXPIRE` bila TTL < 0 (atomik di Lua, semantik sama, Redis ≥ 2.6). Mengoreksi baris 1.6 "butuh Redis ≥ 7" | Diverifikasi ke Redis asli: hit ke-2 tidak memperpanjang jendela; key tanpa TTL mendapat TTL; `max: 3` → request ke-4 429 + `Retry-After: 30`; IP lain terpisah; `FLUSHDB` diblokir; prefix `<prefix>:` terpasang. Key uji dihapus satu per satu (tanpa FLUSH) |
| 2026-10-04 | 1.7 | Pelajaran: perilaku yang bergantung pada server (Lua, versi command) wajib diuji ke Redis sungguhan — masuk cakupan integration suite 6.1 (Redis nyata, bukan mock). Docker tidak wajib: PostgreSQL & Redis lokal cukup, `docker-compose.yml` hanya opsi | — |
| 2026-10-04 | 1.7 | Verifikasi tambahan 1.6 ke Redis asli: `getOrSet` + `negativeTtl` (fetcher sekali, sentinel TTL 15) dan `commandTimeout` (`DEBUG SLEEP 1.5`, timeout 1000 → request dilayani dari fetcher, client kembali `ready`). Latensi terburuk `getOrSet` saat Redis lambat = 2 × timeout (baca + tulis; terukur ~1,45 dtk) — didokumentasikan di `references/redis-cache.md` §4 | Opsi lanjutan bila perlu: tulis cache tanpa menunggu (fire-and-forget) |
| 2026-10-04 | 1.7 | ✅ Di-commit (`3028ac8`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-04 | Review 3 | Review ulang 1.6–1.7 atas permintaan user: 10 temuan + bookkeeping, semua diperbaiki di branch `fix/review-1-6-1-7` (baris di bawah) | Gate tetap hijau; aturan baru dibuktikan chaos test |
| 2026-10-04 | Review 3 | **`references/logging.md` rusak sejak Step 1.2**: `text.replace(from, to)` dengan `` {1,128}$` `` di `to` — `` $` `` adalah pola pengganti JS ("teks sebelum match") → ±50 baris awal file tersisip di tengah kalimat `requestId`. Lolos dari review 1 & 2. Dipulihkan + butir `locale`/`clientIp` yang belum terdokumentasi. Seluruh file ter-track dipindai: hanya file ini yang kena | Teknik edit diganti `split/join` (pola `$` tidak ditafsirkan) |
| 2026-10-04 | Review 3 | Regresi 1.6: `redisClient.quit()` ditolak saat Redis tidak `ready` (offline queue mati) → shutdown mencatat error & `Promise.all` gagal dini sebelum pool DB tertutup. `closeRedisClient()`: `quit()` bila `ready`, selain itu `disconnect()`; dipakai `src/index.ts` | Dibuktikan: `quit()` → "Stream isn't writeable…" pada status `connecting`/`reconnecting` |
| 2026-10-04 | Review 3 | Skip rate limit health memakai `startsWith` → `/api/v1/health-records`/`healthz` ikut lolos. Helper `isUnderPath(prefix)` (batas segmen) | Test: `/health`, `/health/readiness` di-skip; `/healthz`, `/health-records` tetap 429 |
| 2026-10-04 | Review 3 | Aturan "Redis hanya lewat `CacheService`" kini ditegakkan: ESLint `CACHE_CLIENT_IMPORT_PATTERN` (`redis.client`, `ioredis`) di modules & integrations + depcruise `redis-client-only-in-cache` (seluruh `src/` kecuali `core/cache/` & `src/index.ts`) | Chaos test: ESLint 3 error, depcruise 4 error (modules, integrations, utils) |
| 2026-10-04 | Review 3 | `RENAMED_ENV_VARS` + `assertNoRenamedVariables()` (dipanggil di `env-source.ts`): `CORS_ORIGIN`/`RATE_LIMIT_WINDOW_MS` yang masih diset → app menolak start dan menyebut penggantinya (nama saja, tanpa nilai). Konvensi baru di CONTRIBUTING §6 | Chaos test proses: kedua nama lama → error berisi pengganti. **File env lokal developer yang masih memakai nama lama wajib diganti** |
| 2026-10-04 | Review 3 | Step 6.1 tidak lagi mengandaikan Docker: layanan uji dari env (`TEST_DATABASE_URL`, `TEST_REDIS_*`), Docker opsional (wajib hanya di CI), skenario Lua pada Redis tertua yang didukung. README: Docker opsional, prasyarat PostgreSQL 16+ & Redis ≥ 2.6 (disarankan 7) | Mengikuti setup user (layanan native, Redis 3.0) |
| 2026-10-04 | Review 3 | Versi Bun diseragamkan ke 1.3: `Dockerfile`/`Dockerfile.dev` `oven/bun:1.3-alpine`, README `>= 1.3` (CI & SKILL sudah 1.3) | **Build image belum diverifikasi** (Docker tidak berjalan di mesin user) |
| 2026-10-04 | Review 3 | Panduan rate limit per route (keyPrefix sendiri, ditumpuk dengan limit global, `isUnderPath` untuk skip) di `references/bootstrap.md` §3; entri cache mati `CACHE_PREFIX.HEALTH` & `CACHE_TTL.SHORT` dihapus; salinan `src/app.ts`/`src/index.ts` di `bootstrap.md` disinkronkan ulang (identik, dicek skrip) | Salinan kode di dokumen rawan basi — kandidat penjaga otomatis |
| 2026-10-04 | Review 3 | ✅ Di-commit (`99acb2a`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-04 | Plan | Konfirmasi user soal primary key (UUID v7 default, bigint hanya untuk tabel pencatatan cepat): sudah ada di D15/2.2/2.5/2.7, dengan 4 celah yang kini ditutup di plan — (1) penjaga "bigint hanya tabel pencatatan": allowlist `APPEND_ONLY_TABLES` + test konvensi 2.7 (juga menolak entri basi); (2) `mode: 'number'` (bigint JS merusak `JSON.stringify`); (3) L6 `bigserial` → `bigint GENERATED ALWAYS AS IDENTITY` (konsisten D15 & larangan `serial(` 2.2); (4) UUID v7 dari aplikasi didokumentasikan (insert SQL mentah wajib mengisi `id`) | Implementasi tetap di Step 2.2 / 2.7 |
| 2026-10-04 | Proses | Markdown tidak lagi diformat Prettier (keluhan user: tabel log jadi 48% spasi, baris sampai 834 karakter). `.prettierignore` berisi `*.md`; aturan di `.agents/AGENTS.md`: tabel ringkas (`\| a \| b \|`) dan daftar rapat ditulis manual | Tabel lama di plan masih ber-padding sampai dirapatkan |
| 2026-10-04 | Plan | ✅ Pembaruan plan primary key + aturan md di-commit (`78033cc`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-04 | 1.8 | `API_PREFIX=/api/v1` → `API_BASE_PATH=/api` (regex: diawali `/`, tanpa `/` di akhir); versi di kode: `const v1 = new Hono(); v1.route('/users', …); app.route(`${base}/v1`, v1)`. `API_PREFIX` masuk `RENAMED_ENV_VARS` → app menolak start bila nama lama masih diset | Terbukti langsung: file env lokal user masih memuat `API_PREFIX` → test/dev berhenti dengan pesan pengganti. **User perlu mengganti `API_PREFIX=/api/v1` menjadi `API_BASE_PATH=/api`** |
| 2026-10-04 | 1.8 | Health tanpa versi di `<base>/health`: `GET /health` selalu 200 (`status` UP/DEGRADED/DOWN + `components.database`/`redis`), `/readiness` 200 atau 503 `SERVICE_UNAVAILABLE` (envelope error, `details[].field = database`) hanya bila DB mati, `/liveness` selalu 200 tanpa cek dependency (`uptime_seconds`). Path lama `/api/v1/health` → 404 | Readiness memakai envelope error standar (bukan `data` + 503) agar konsisten dengan kontrak error 1.3 |
| 2026-10-04 | 1.8 | Ditambahkan di luar rencana: `pingDatabase(timeoutMs = 2000)` — sebelumnya tanpa timeout, DB yang menggantung menahan probe sampai `connect_timeout` postgres.js (30 dtk) melebihi timeout probe LB/k8s | Uji nyata ke IP tak terjangkau: `false` tepat 2,00 dtk; health `DOWN` dalam 2,01 dtk |
| 2026-10-04 | 1.8 | `HealthService`/`HealthController` mengikuti D20 (class + default constructor param, probe di-inject) → `mock.module` global di `health.service.test.ts` dihapus; test controller untuk ketiga state + 503 | Uji nyata Redis lokal: terhubung → `UP`; koneksi putus (`end`) → `DEGRADED` |
| 2026-10-04 | 1.8 | Ditemukan & diperbaiki: `HEALTHCHECK` di `Dockerfile` menembak `/api/v1/health/liveness` → setelah 1.8 container akan selalu unhealthy; kini `/api/health/liveness` | Build image belum diverifikasi (Docker tidak berjalan) |
| 2026-10-04 | 1.8 | Tinjauan ulang deviasi 1.7 (health dikecualikan dari rate limit global): **dipertahankan** — probe tetap di `<base>/health` (path stabil lintas versi), skip via `isUnderPath(healthPath)` | — |
| 2026-10-04 | 1.8 | Dokumen: template `scaffold-module` (route prefix + registrasi `v1.route(...)`), `scripts/verify-scaffold.ts` (patch `v1.route`), README (Health Probes, struktur), CONTRIBUTING (struktur, langkah registrasi — sebelumnya masih `env.API_PREFIX`), `references/testing.md`, `references/bootstrap.md` (§1/§2 disinkronkan, baris pipeline 7–10), `.env.example` | `verify:scaffold` & `validate:full` menunggu file env lokal user diperbarui (lihat baris `API_PREFIX`) |
| 2026-10-04 | 1.8 | User mengganti `API_PREFIX` → `API_BASE_PATH=/api` di file env lokal; config terbaca, `validate:full` (coverage 99.87% / 98.83%) dan `verify:scaffold` hijau | — |
| 2026-10-04 | 1.8 | ✅ Di-commit (`0f2dae5`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-04 | 1.9 | **Hasil spike (D17)**: `@hono/zod-openapi` 1.6.3 mensyaratkan **Zod 4** (peer `zod ^4`, juga `@asteasolutions/zod-to-openapi` 9) dan pola `createRoute` + `app.openapi` dengan validator sendiri yang bertabrakan dengan `validate()` (kontrak snake_case + konversi camelCase). `hono-openapi` 1.3.3 berbasis Standard Schema, jalan di Zod 3.25 lewat `zod-openapi` v4 (peer `zod ^3.21.4`), dan membaca metadata dari properti `uniqueSymbol` di middleware route → `validate()` yang ada bisa mendokumentasikan dirinya sendiri | Prototipe: `describeRoute` + metadata `validate()` tergabung dalam satu operation; route tanpa metadata tidak masuk spec |
| 2026-10-04 | 1.9 | **Deviasi D17**: dipilih **`hono-openapi` + `zod-openapi` v4 + Scalar** (bukan `@hono/zod-openapi`). Tanpa migrasi Zod 4, tanpa mengubah pola route/controller, `validate()` tetap satu-satunya validator | Migrasi Zod 4 masuk backlog L12 (bila nanti dibutuhkan, `hono-openapi` mendukung Zod 4 tanpa perubahan pemakai) |
| 2026-10-04 | 1.9 | `src/core/openapi/`: `describeEndpoint({ tags, summary, response: { data \| paginatedItem }, errors })` (envelope standar, 429 & 500 otomatis, error memakai komponen `ErrorEnvelope`), skema envelope yang mencerminkan `ApiResponse.toJSON()` / `buildErrorBody()`, `isoDateTime()` / `isoDateTimeString()`, `buildOpenApiDocument()` (security scheme `bearerAuth` untuk Fase 3), `mountApiDocs()` (`<base>/docs` Scalar + `<base>/docs/openapi.json`, di-cache per app, tidak dipasang bila nonaktif). `validate()` menempelkan `describeRequest()` (body via resolver, query/path via `createSchema` sinkron) | Request tidak pernah ditulis dua kali: satu skema untuk validasi & dokumentasi |
| 2026-10-04 | 1.9 | `toSnakeCaseOpenApi()` di `src/utils/` (murni): nama properti schema, daftar `required`, nama parameter query → snake_case; nama komponen, `operationId`, dan parameter path (harus cocok dengan template route) dibiarkan | Hasil nyata: `full_name`, `per_page`, `created_at`, `status_code`, `request_id` |
| 2026-10-04 | 1.9 | Skema response di `<module>.dto.ts` (`userResponseSchema`, `healthReportSchema`, …) dan tipe transformer/`HealthReport` diturunkan dari skema (`z.infer`) → dokumentasi tidak bisa menyimpang dari tipe yang dikembalikan. Endpoint root `/` ikut terdokumentasi | — |
| 2026-10-04 | 1.9 | `API_DOCS_ENABLED` (`true \| false`, kosong = aktif kecuali production) | `.env.example` & L1 |
| 2026-10-04 | 1.9 | Penjaga di `test/openapi.e2e.test.ts`: setiap route `createApp()` (kecuali docs) ada di dokumen; semua properti & parameter query snake_case; setiap route yang memvalidasi input mencantumkan 400 | Chaos test: route tanpa `describeEndpoint` → gagal menyebut route; route `/:id` tanpa 400 → gagal menyebut route; dipulihkan |
| 2026-10-04 | 1.9 | Dokumen: template `scaffold-module` (skema response di DTO, transformer bertipe dari skema, `describeEndpoint` di routes), project-standards Rule 11 + tech stack + struktur, `AGENTS.md` invariant #12 (Documented Endpoints), CONTRIBUTING §10, README, `references/bootstrap.md` (§1 disinkronkan + baris `mountApiDocs`) | `verify:scaffold` hijau dengan template baru |
| 2026-10-04 | 1.9 | Catatan: bundle `bun build` naik 1,34 MB → 1,89 MB (`hono-openapi`, `zod-openapi`, `@scalar/hono-api-reference`); UI Scalar memuat aset dari CDN (jsDelivr) saat dibuka | Bila CSP diperketat nanti, izinkan CDN itu untuk `/api/docs` atau matikan docs |
| 2026-10-04 | 1.9 | User memilih tetap memakai Scalar (lebih mudah dipahami daripada Swagger UI) | — |
| 2026-10-04 | Review 4 | Review ulang 1.8–1.9 atas permintaan user (sebelum 1.9 di-commit): 9 temuan + 1 celah penjaga yang ditemukan saat chaos test; semua diperbaiki di branch `feat/openapi-docs` | Gate hijau; penjaga dibuktikan chaos test |
| 2026-10-04 | Review 4 | **Celah penjaga sendiri**: `validate()` juga menempelkan metadata, sehingga route ber-`validate()` tanpa `describeEndpoint()` tetap muncul di dokumen dan lolos test "setiap route terdokumentasi" (chaos test pertama hanya memakai route tanpa `validate()`). Kini setiap operation wajib punya `summary` + response 2xx (hanya dari `describeEndpoint()`), di e2e maupun `verify:scaffold` | Chaos test: route users `/chaos/:id` dengan `validate()` saja → gagal; template `/:id` tanpa `describeEndpoint` → `verify:scaffold` gagal |
| 2026-10-04 | Review 4 | 400 (dan 413 bila ada body) kini didokumentasikan otomatis oleh `validate()` (`errorResponse()` bersama) — penulis route cukup menulis error domain; `errors` di users & template dirampingkan | Terbukti: response dari dua sumber metadata tergabung dalam satu operation |
| 2026-10-04 | Review 4 | Header umum terdokumentasi lewat `addCommonHeaders()`: parameter `Accept-Language` & `X-Request-ID`; header respons `X-Request-ID`, `Content-Language`, `RateLimit-*`; `Retry-After` pada 429 (komponen `parameters`/`headers`) | Sebelumnya hanya disebut di teks deskripsi |
| 2026-10-04 | Review 4 | Bundle UI Scalar dikunci (`SCALAR_BUNDLE_URL` = `@scalar/api-reference@1.72.4`, build UMD) — sebelumnya `esm.js` tanpa versi = apa pun yang disajikan CDN hari itu; `info.description` dari `package.json` (dulu default library "Development documentation") | Test memastikan HTML memuat URL berversi |
| 2026-10-04 | Review 4 | `verify:scaffold`: live check memakai `API_BASE_PATH` dan memastikan modul hasil template ada di dokumen dengan summary + 2xx. Log startup mencatat URL health & docs; README Quick Start menyebut `/api/docs` & `/api/health` | — |
| 2026-10-04 | Review 4 | Dokumen: `references/openapi.md` baru (apa yang otomatis vs ditulis, `describeEndpoint`, skema response, tanggal, `API_DOCS_ENABLED`, penegakan, yang belum tercakup) + baris di tabel referensi project-standards; Rule 11, `AGENTS.md` invariant #12 + daftar API inti `verify:scaffold` (+`openapi`), CONTRIBUTING §10, scope commit `core/openapi`, `references/testing.md` (§4 penjaga kontrak), DoD §14.1 (+ endpoint baru wajib `describeEndpoint`), L10 & L11 | Nama komponen OpenAPI PascalCase: `naming-convention` dinonaktifkan berpasangan + alasan di `common-headers.ts` |
| 2026-10-04 | 1.9 | ✅ Step 1.9 + perbaikan Review 4 di-commit (`ce62029`) dan di-merge ke `main` atas permintaan user — **Fase 1 selesai** | — |
| 2026-10-05 | Review 5 | Review menyeluruh Fase 1 (1.1–1.9 + gate Fase 0) atas permintaan user: 6 temuan, semua diperbaiki di branch `fix/review-phase-1` | Gate hijau; aturan baru dibuktikan chaos test |
| 2026-10-05 | Review 5 | **Test tidak hermetik**: `bun test` memuat file env lokal developer → `DATABASE_URL` asli menimpa default test → health e2e & test `HealthService` menjalankan `SELECT 1` ke database pengembangan user di setiap run (probe: client postgres asli, `pingDatabase() = true`); hasil lokal juga bisa beda dengan CI. Perbaikan: `bunfig.toml` preload `test/setup/hermetic-env.ts` (DB & Redis → `127.0.0.1:1`, gagal ±19 ms — target tercepat dari tiga yang diukur) + `test/hermetic-env.test.ts` | Setelah perbaikan: `DATABASE_URL` test = target hermetik, probe DB `false` seketika |
| 2026-10-05 | Review 5 | `mock.module()` global atas `database/connection` (users e2e, `health-probe.test.ts`) terbukti bocor ke file test berikutnya — kelas masalah yang sama dengan mock Redis 1.6. Dihapus: users e2e tidak membutuhkannya (env hermetik, client lazy), `pingDatabase(timeoutMs, client)` menerima client. ESLint `TEST_SYNTAX_RULES` kini melarang `mock.module()` di semua test | Chaos test: `mock.module` di `test/` dan di test modul → ditolak ESLint |
| 2026-10-05 | Review 5 | Dokumen referensi basi sejak 1.1 (lolos review 1–4): `database.md` §1 (`sqlPool`, `env.*`) & §3 (drizzle config `process.env`, `schemaFilter: ['domain']`), `logging.md` §1 (`env.NODE_ENV` tidak ada, redaksi tidak lengkap, `mixin` tidak disebut). Ditulis ulang sebagai cuplikan pendek + rujukan file sumber (bukan salinan penuh); §2 `database.md` diberi catatan "keadaan sekarang vs target 2.2" | — |
| 2026-10-05 | Review 5 | Versi minimum `package.json` dinaikkan ke versi teruji: `hono ^4.13.9` (Scalar butuh ≥ 4.12.5), `zod ^3.25.76` (`hono-openapi` butuh ≥ 3.25), `zod-openapi ^4.2.4`; L8 (langkah `verify:scaffold`, argumen commitlint) & baris "Versi kunci" diperbarui; `errorHandler` → `globalErrorHandler` di struktur folder | Diverifikasi tanpa perubahan: L1 & L2 sinkron dengan kode; `.rejects` tanpa `await` tetap diperiksa Bun (dibuktikan dengan promise tertunda) |
| 2026-10-05 | Review 5 | ✅ Di-commit (`84cf28b`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-05 | 2.1 | `temporal-polyfill` 1.0.5 (Bun 1.3 belum punya `Temporal`). `src/utils/datetime.util.ts`: `nowInstant`, `nowIsoUtc`, `toIsoUtc` (selalu milidetik, bentuk sama dengan `Date#toISOString`), `parseInstant` (offset wajib → `MISSING_OFFSET`), `parseCalendarDate` (persis `YYYY-MM-DD`, tolak 2026-02-30), `isValidTimeZone` (IANA saja, offset `+07:00` ditolak), `dayRangeInZone` (`[start, end)`), `wallTimeToInstant` (jam DST yang dilompati → `NONEXISTENT_LOCAL_TIME`, terulang → `AMBIGUOUS_LOCAL_TIME`), `instantFromDate`/`instantToDate` | Error berupa `DateTimeError` (+`reason`) di `utils/`, bukan `ApiError` — `strict-utils-isolation` melarang `utils` meng-import `core` |
| 2026-10-05 | 2.1 | `src/core/dto/datetime.dto.ts`: `instantField` → `Temporal.Instant`, `calendarDateField` → `Temporal.PlainDate`, `timeZoneField`; pesan format tanpa menyalin input pengguna; terdokumentasi otomatis di OpenAPI (`format: date-time` / `date`) | — |
| 2026-10-05 | 2.1 | **Bug ditemukan & diperbaiki**: `camelToSnakeCase` (dan konverter lain) hanya mengecualikan `Date`/`RegExp` → objek Temporal (tanpa properti enumerable) menjadi `{}` di response secara diam-diam (terbukti: `{"created_at":{}}`). Kini hanya objek polos (`Object.prototype`/`null` prototype) yang ditelusuri; semua instance kelas adalah daun | Test regresi untuk keempat fungsi konverter |
| 2026-10-05 | 2.1 | UTC: runtime dipaksa di `env-source.ts` (`process.env.TZ = 'UTC'`, terbukti berlaku saat runtime di Bun; mesin user `Asia/Jakarta`), preload test, `Dockerfile` & kedua compose `TZ=UTC`; sesi DB `connection: { timezone: 'UTC' }` (huruf kecil — nama GUC PostgreSQL tidak peka huruf, lolos `naming-convention`). `new Date().toISOString()` diganti `nowIsoUtc()` (envelope error, health) | Sesi `timezone=UTC` terverifikasi sebagai parameter startup client; **belum diuji ke PostgreSQL asli** (integration 6.1) |
| 2026-10-05 | 2.1 | ESLint `DATETIME_SYNTAX_RULES` (dipisah dari grup kode error agar `datetime.util.ts` bisa dikecualikan): `new Date(<value>)`, `Date.parse`, getter/setter/formatter waktu lokal — selector L7 diperluas dengan setter, `getSeconds`/`getMilliseconds`/`getYear`, `toDateString`/`toTimeString`. `new Date()` untuk "sekarang" dan varian UTC tetap boleh. Catatan: `toLocaleString` pada angka ikut ditolak (pakai `Intl.NumberFormat`) | Chaos test: 6 pelanggaran di modul/`core`/`utils` ditolak; `new Date()` & `getUTCHours()` lolos |
| 2026-10-05 | 2.1 | Dokumen: `references/datetime.md` baru + baris tabel referensi, project-standards Rule 12 + tech stack, `AGENTS.md` invariant #13 + daftar aturan AST, CONTRIBUTING §10 (field waktu DTO), README, `openapi.md` | Kolom DB berbasis Temporal (helper `instant()`/`calendarDate()`) menyusul di 2.2; respons saat ini tetap `Date` dari driver |
| 2026-10-05 | 2.1 | **Diperketat atas permintaan user** (penyimpangan dari L7 yang hanya melarang `new Date(<arg>)`): `new Date()` untuk "sekarang" ikut dilarang di luar `datetime.util.ts` — satu cara mendapatkan nilai waktu. Helper baru `nowAsDate()` untuk kolom driver (`users.schema.ts` `$onUpdate(nowAsDate)`). `Date.now()`, varian UTC, `toISOString()` tetap boleh (bebas zona) | Chaos test: `new Date()` di modul & `core` → ditolak |
| 2026-10-05 | 2.1 | ✅ Di-commit (`d1aa11a`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-05 | 2.1+ | Atas permintaan user (tindak lanjut 2.1, branch `feat/dev-log-local-time`): log pretty development memakai jam dinding zona mesin + offset (`hostTimeZone` dibaca di `env-source.ts` sebelum `TZ=UTC`; `formatWallClock()`), mengikuti lokasi developer tanpa konfigurasi; runtime tetap UTC. Log non-development: `time` ISO 8601 UTC (`pino.stdTimeFunctions.isoTime`, sebelumnya epoch ms). Rekomendasi untuk VPS: UTC (pipeline log menampilkan sesuai zona pembaca; korelasi dengan sesi DB UTC & layanan lain) | Terlihat nyata: dev `[2026-10-05 11:30:22.877 +07:00]` dengan proses `UTC`; produksi `"time":"2026-10-05T04:30:23.989Z"` |
| 2026-10-05 | 2.1+ | ✅ Di-commit (`10a0d84`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-05 | 2.2 | `schemas.ts`: `APP_SCHEMA_NAME` (`bun_hono_starter`) + `appSchema`, `referenceSchema` (`reference`); `users` pindah ke `appSchema` dengan `uuidPrimaryKey()` + `timestamps()`; `ref_roles` menjadi `referenceSchema.view(...).existing()`; `domainTable` (public) dihapus; migrasi `0000` di-generate ulang (offline): hanya `CREATE SCHEMA "bun_hono_starter"` + tabel ber-schema, `id` tanpa default DB | **Developer**: hapus `DB_SCHEMA` dari file env lokal dan bersihkan sisa migrasi lama di DB lokal (lihat laporan step) |
| 2026-10-05 | 2.2 | Temuan: drizzle-kit membuat `CREATE SCHEMA` untuk **setiap** `pgSchema` yang di-export dari file schema, meskipun ada `schemaFilter` → `referenceSchema` sengaja tidak di-re-export dari `schema/index.ts` | Dijaga `test/migrations.test.ts` (hanya schema proyek yang dibuat, semua tabel ber-schema, tanpa `gen_random_uuid()`) |
| 2026-10-05 | 2.2 | `columns.ts`: `uuidPrimaryKey` (v7 dari aplikasi), `sequentialPrimaryKey` (identity, `mode: 'number'`), `instant`/`calendarDate` (customType ⇄ `Temporal.Instant`/`PlainDate` — driver Drizzle+postgres.js menyerahkan `timestamptz`/`date` sebagai **teks**; `parseInstant` membaca format PostgreSQL `2026-10-05 10:00:00.123456+07` dengan presisi mikrodetik; ditulis ISO UTC penuh), `timeZoneColumn`, `timestamps`, `auditColumns`, `softDelete`, `parentReference` (FK `restrict`), `activeUniqueIndex`. `append-only-tables.ts` (kosong; `record_changes` di 2.4) | Entitas kini membawa Temporal, bukan `Date` |
| 2026-10-05 | 2.2 | `activeUniqueIndex` memakai nama kolom tanpa kualifikasi: render bawaan menghasilkan `WHERE "schema"."tabel"."deleted_at" is null` di DDL; kini `WHERE "deleted_at" is null` (predikat indeks hanya boleh merujuk tabelnya sendiri) | Diperiksa lewat migrasi percobaan drizzle-kit (offline); **belum dijalankan ke PostgreSQL asli** (6.1) |
| 2026-10-05 | 2.2 | `IDENTITY_RULES`: `APP_SCHEMA_NAME` + aturan dinamis yang mengganti nama schema di semua file `drizzle/` (SQL & snapshot, termasuk kunci `"<schema>.<tabel>"`); drift guard bila tak ada migrasi yang memuat nama schema | Uji nyata di salinan repo: `bun run setup demo-app` → `APP_SCHEMA_NAME = 'demo_app'`, nama lama 0 kemunculan, `drizzle-kit generate` di salinan: "No schema changes" |
| 2026-10-05 | 2.2 | `DB_SCHEMA` dihapus (config, `.env.example`, `drizzle.config.ts` → `schemaFilter: [APP_SCHEMA_NAME]`) dan masuk `RENAMED_ENV_VARS` (pesan kini kalimat lengkap: "renamed to …" / "removed — …"). Preload hermetik juga membuang semua variabel lama, sehingga file env lokal yang basi tidak membuat test gagal; live check `verify:scaffold` kini memakai preload yang sama | Terbukti: file env lokal user masih memuat `DB_SCHEMA` → app menolak start, test & `verify:scaffold` tetap hijau |
| 2026-10-05 | 2.2 | ESLint `SCHEMA_DECLARATION_RULES` (`pgSchema(` hanya di `schemas.ts`) & `SCHEMA_FILE_RULES` (di file schema selain `columns.ts`/`schemas.ts`: `timestamp(`, `date(`, `serial(`/`smallserial(`/`bigserial(`, `pgTable(`, `.defaultRandom()`); `columns.ts` dibebaskan dari "return type eksplisit" (rantai builder Drizzle) lewat override config beralasan | Chaos test: 6 pelanggaran ditolak (5 di file schema, `pgSchema` di modul) |
| 2026-10-05 | 2.2 | OpenAPI: `isoInstant()` / `isoCalendarDate()` menggantikan `isoDateTime()` (dihapus — tidak ada lagi `Date` di entitas); `errorEnvelopeSchema.timestamp` kini `isoDateTimeString()` (nilai runtime memang string). Template `scaffold-module` (tabel `appSchema` + helper, `isoInstant`), README, `database.md` (§2–4 baru: schema, helper kolom, pemilihan PK, migrasi), CONTRIBUTING §5.1 (sebelumnya menyebut schema `app_domain` yang tidak pernah ada) & §10, project-standards & AGENTS.md (aturan AST) | `verify:scaffold` hijau dengan template baru |
| 2026-10-05 | D14 | **Keputusan diubah atas diskusi user**: multi-schema berasal dari proyek pemerintahan (satu DB dipakai bersama banyak sistem); boilerplate ini untuk proyek mandiri dengan database sendiri → tabel di `public`. Schema bernama proyek, `APP_SCHEMA_NAME`, aturan `IDENTITY_RULES` untuk schema & file migrasi dihapus; `appTable` (= `pgTable`) di `schemas.ts` menjadi satu-satunya pabrik tabel (ESLint melarang `pgTable(`/`pgSchema(` di tempat lain); `schemaFilter: ['public']`; view referensi tetap sebagai contoh opsional. Schema bernama dari env ditolak: nama schema tertulis permanen di migrasi saat generate, sehingga env yang berbeda membuat migrasi & aplikasi menunjuk schema berbeda | Baris 2.2 di atas tentang `APP_SCHEMA_NAME`/rename migrasi tidak berlaku lagi. Multi-tenant schema-per-tenant (SaaS) → backlog L12, opsional setelah semua fase |
| 2026-10-05 | 2.2 | Migrasi `0000` di-generate ulang (hanya `CREATE TABLE "users"` di `public`) dan **dijalankan ke database lokal user atas izin eksplisit user** (belum pernah ada migrasi sebelumnya). Verifikasi read-only di PostgreSQL 17.6: kolom & tipe sesuai, `id` tanpa default DB, 1 migrasi tercatat, **sesi `timezone` = UTC terbukti di server asli** | Aturan repo "agent tidak menjalankan perintah ke DB" tetap berlaku umum; izin ini khusus DB lokal user |
| 2026-10-05 | 2.2 | User menghapus `DB_SCHEMA` dari file env lokal; config terbaca. Uji server nyata (`src/index.ts`, port 3999) dengan DB & Redis lokal user: `GET /api/health` → `UP` (database `UP`, redis `UP`), readiness 200, `/api/docs/openapi.json` memuat semua route | Baca/tulis kolom Temporal lewat Drizzle ke DB asli belum diuji (butuh insert baris uji — menunggu izin user / Step 6.1) |
| 2026-10-05 | 2.2 | ✅ Di-commit (`208a8d8`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-08 | Proses | Tabel markdown lama dirapatkan (permintaan user: padding Prettier membuat perubahan beberapa baris tampak ratusan baris di diff): 520 baris tabel di plan, blueprint, `init-project` SKILL & `redis-cache.md` → `\| a \| b \|` dan `\|---\|`; plan 226 KB → 126 KB. Hanya baris tabel di luar blok kode; isi sel diverifikasi identik per baris (skrip) dan lewat `git diff -w` (hanya pemisah yang berubah) | `docs/plans/from-nestjs-plan.md` sengaja dilewati — lihat baris berikut |
| 2026-10-08 | Proses | **Kesalahan ditemukan**: `docs/plans/from-nestjs-plan.md` (referensi pribadi user, diputuskan tidak di-commit) ternyata ikut ter-commit di Step 1.3 (`bd6c74e`) karena `git add -A`. Menunggu keputusan user; ke depan agent memeriksa file untracked sebelum staging | Tidak dihapus/diubah tanpa keputusan user |
| 2026-10-08 | Proses | Keputusan user: `docs/plans/from-nestjs-plan.md` dibiarkan ter-track untuk sementara; dihapus di akhir setelah pengembangan selesai (Step 7.3) | — |
| 2026-10-08 | 2.3 | **Penyimpangan**: `createDrizzleChainMock`/`createTxHostMock`/`renderWhere` diganti perekam SQL `test/helpers/sql-recorder.ts` — Drizzle asli (driver `postgres-js` + schema produksi) di atas klien postgres.js palsu (`unsafe().values()`, `begin`, `savepoint`) yang merekam SQL + parameter dan mengembalikan baris antrean. Mock chain mengembalikan baris yang sama apa pun kondisinya: terbukti, `findByEmail` yang memfilter `id` lolos test lama. Driver `pg-proxy` dicoba lebih dulu: tidak mendukung transaksi | SQL tercatat utuh → `renderWhere` tidak diperlukan. Batas: membuktikan SQL yang dikirim, bukan perilaku PostgreSQL (constraint, partial index, lock → 6.1) |
| 2026-10-08 | 2.3 | `TransactionHost(root = db)` (D20) + `run(fn)` (buka transaksi di root, join bila sudah ada); `runInTransaction` = `defaultTxHost.run`. Test `transactional.decorator` tidak lagi menambal `db.transaction` global | Prasyarat test rollback audit 2.4; `@Transactional()` tetap memakai `defaultTxHost` |
| 2026-10-08 | 2.3 | Kolom Temporal teruji lewat jalur driver: teks `timestamptz` dari "DB" → `Temporal.Instant` (presisi mikrodetik) | `rowOf` memakai `mapToDriverValue` kolom |
| 2026-10-08 | 2.3 | Template `scaffold-module`: Step 11 baru (test repository memakai perekam), test lain jadi Step 12; `verify:scaffold` menjalankan test hasil generate (dulu hanya dikompilasi/di-lint). Drift ditemukan & diperbaiki: Step 1 template masih menyebut schema `domain` (basi sejak D14), deskripsi skill "Drizzle multi-schema" | Dokumen: `references/transactions.md` §1 & §4 (contoh mock chain diganti), `references/testing.md`, struktur `test/` di project-standards |
| 2026-10-08 | 2.3 | ✅ Di-commit (`137295e`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-08 | 2.4 | `record_changes` di `public` (`appTable`) sesuai L6: PK `(id, changed_at)`, index lookup, CHECK `action`, tanpa FK/unique lain. Helper baru `sequentialId()` (identity tanpa `PRIMARY KEY`; `sequentialPrimaryKey()` = `sequentialId().primaryKey()`) — PK komposit tidak bisa memakai `sequentialPrimaryKey()`. `APPEND_ONLY_TABLES` = `{ record_changes }`. Migrasi `0001` di-generate dan **dijalankan ke DB lokal user** (izin migrasi lokal); struktur diverifikasi read-only di PostgreSQL 17.6 (identity ALWAYS, PK, CHECK, index DESC) | Penjaga di `test/migrations.test.ts`: daftar CHECK = `RECORD_CHANGE_ACTIONS` (chaos test: aksi baru tanpa migrasi → gagal), PK `(id, changed_at)`, tanpa `REFERENCES`/`UNIQUE` |
| 2026-10-08 | 2.4 | `AuditedRepository<TTable>` (`src/database/audited.repository.ts`): `inTransaction` (= `txHost.run`), `lockById` (`FOR UPDATE`), `diff`, `snapshot`, `writeChange`. Ditambahkan di luar rencana: `lockById`/`writeChange` **melempar** di luar transaksi (audit yang tidak atomik = celah), `writeChange` dengan change set kosong tidak menulis apa pun | Komposisi update/soft delete/restore/delete menyusul di `BaseRepository` (2.5); test memakai subclass contoh di file test |
| 2026-10-08 | 2.4 | Keputusan desain: kunci `changes` = **nama kolom DB** (`full_name`), bukan properti TS — jejak audit dibaca lewat SQL dan tetap stabil saat properti TS diganti nama. `updated_by` ikut tidak di-diff (plan: hanya `updatedAt`) — kapan & siapa sudah tercatat di baris audit (`changed_at`, `actor`) | Nilai dibandingkan & disimpan dalam bentuk JSON (`Temporal` → ISO); objek `jsonb` dengan urutan key berbeda bukan perubahan. Nama fungsi `snapshotRecord` (plan: `snapshot`) |
| 2026-10-08 | 2.4 | Dokumen: `references/database.md` §5 baru (audit trail) + `sequentialId()` + penjaga migrasi; judul "Multi-Schema" yang basi sejak D14 diperbaiki di `database.md`, README & CONTRIBUTING; struktur folder (project-standards, README, CONTRIBUTING) | — |
| 2026-10-08 | 2.4 | **Celah ditemukan user saat review**: `record_changes` tidak punya kolom parent (juga tidak ada di L6 maupun blueprint) → audit baris detail (`ChildRepository`, 2.5) tidak bisa dikumpulkan per header, terutama detail yang sudah di-hard-delete (id-nya hanya tersisa di dalam `changes`, tanpa index). Ditambahkan `parent_table`/`parent_id` (nullable, tanpa FK), CHECK keduanya terisi atau keduanya null, partial index `record_changes_parent_idx … WHERE parent_id IS NOT NULL`; `writeChange(…, parent?)`. L6 & langkah 2.5 diperbarui | Migrasi `0002` (ALTER), karena `0001` sudah dijalankan ke DB lokal user; dijalankan & diverifikasi read-only. Penjaga migrasi: CHECK parent ada, tidak ada FK/UNIQUE yang ditambahkan lewat ALTER |
| 2026-10-08 | 2.4 | ✅ Di-commit (`f2b0582`) atas permintaan user; merge ditunda sampai perbaikan Review 6 selesai | — |
| 2026-10-08 | Review 6 | Review ulang 2.1–2.4 atas permintaan user: 13 temuan, semua diperbaiki di branch `fix/review-2-1-2-4` (baris di bawah) | Gate hijau; perilaku baru dibuktikan test + chaos test |
| 2026-10-08 | Review 6 | **Format waktu di response tidak konsisten**: entitas Temporal diserialisasi `toJSON()` → `…00Z` / `…00.123456Z` tergantung nilai, envelope `…00.000Z`, dokumen menjanjikan `.000Z`. `toWireTime()` (`datetime.util.ts`) dipakai `ApiResponse.toJSON()`: instant selalu milidetik UTC, tanggal `YYYY-MM-DD` | Chaos test: serializer dicabut → test `ApiResponse` gagal. Nilai dari cache tetap string `toJSON()` → didokumentasikan (cache hasil transformer) |
| 2026-10-08 | Review 6 | `Temporal.Now` kini dilarang di luar `datetime.util.ts` (`DATETIME_SYNTAX_RULES`) — aturan "satu cara mendapatkan waktu sekarang" dari 2.1 bisa dilewati. `nowAsDate()` dihapus (tak dipakai sejak kolom memakai `customType` teks); `instantFromDate`/`instantToDate` dipertahankan untuk library yang hanya mengenal `Date` | Chaos test: `Temporal.Now` di modul & `core` → ditolak; L7 diperbarui |
| 2026-10-08 | Review 6 | **Temuan saat memperbaiki jam `updated_at`**: `$onUpdate(() => NOW)` (NOW = `now()`) lolos `tsc`, tetapi drizzle-orm 0.40 membungkus hasil `$onUpdate` dengan `sql.param` saat UPDATE (`pg-core/dialect.js` `buildUpdateSet`) → parameter `"[object Object]"`, setiap UPDATE akan gagal di DB. Dibatalkan: `$onUpdate(nowInstant)` tetap sebagai fallback (jam aplikasi); jam DB untuk UPDATE dipindah ke `BaseRepository` (2.5: `updatedAt: NOW`). `NOW` di-export dari `columns.ts` (dipakai `timestamps()` & `record_changes.changed_at`) | Ditemukan lewat perekam SQL (2.3) sebelum sampai DB. Penjaga di `sql-recorder.test.ts`: `set({ updatedAt: NOW })` → `now()`, `$onUpdate` → parameter |
| 2026-10-08 | Review 6 | Dokumen: `datetime.md` (jalur driver teks, `toWireTime`, `Temporal.Now`, cache), graf layer project-standards §3 + CONTRIBUTING (`database → core/utils/config`, `schema → utils`), aturan perintah DB (`database.md` §4 & DoD §14.1: default developer; agent hanya DB lokal dengan izin), `isoDateTime()` basi (project-standards Rule 11/12, CONTRIBUTING), README pilar 4 (data layer teraudit), `raw-queries.md` (`domain.users`, contoh `sql.raw('domain')` → `sql.identifier`), Rule 3 `defaultTxHost`, scope commit `database` & `utils/<name>`, plan 2.5/2.7/L7, judul CONTRIBUTING §5.1, `redis-cache.md`, `AGENTS.md` | — |
| 2026-10-08 | Review 6 | ✅ Step 2.4 (`f2b0582`) + perbaikan Review 6 (`029fa98`) di-merge ke `main` atas permintaan user | — |
| 2026-10-08 | 2.5 | `BaseRepository<TTable>` (`src/database/base.repository.ts`): `findById`, `findPage` (default `created_at DESC, id DESC`), `count`, `create`, `updateById`, `softDeleteById`, `restoreById`; `scoped()`; tanpa hard delete. `updated_at = now()` + `updated_by = actor` ditulis eksplisit di setiap UPDATE (jam DB, lihat Review 6). Kolom terkelola (`createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `deletedAt`; `id` saat update) dibuang dari input pemanggil — juga saat DTO di-spread | `null` = tidak ada / sudah dihapus; baris tak berubah = tidak ada tulis & audit. Restore bisa bentrok `activeUniqueIndex` → service memetakan ke `ConflictError` (didokumentasikan) |
| 2026-10-08 | 2.5 | `ChildRepository<TChild, TParent>` (`src/database/child.repository.ts`): `findAllForParent`, `findByIdForParent`, `createForParent`, `updateForParent`, `deleteForParent`, `syncForParent`. Detail hanya lewat header-nya (id header lain → `null`/`false`), header hilang/soft-deleted → `NotFoundError`; tulis mengunci header lalu detail (urut id), audit dengan `parent_table`/`parent_id`, hard delete + snapshot, header di-touch bila ada perubahan; referensi header tidak bisa diubah lewat input. `syncForParent`: id asing → `NotFoundError`, id ganda → `BadRequestError` | Ditambahkan di luar rencana: `findAllForParent`/`findByIdForParent` (baca lewat header yang hidup) dan `AuditedRepository.lockWhere()` (`FOR UPDATE` berurutan id — urutan kunci tetap); tabel detail mewajibkan `timestamps` + `auditColumns` |
| 2026-10-08 | 2.5 | Dokumen: `references/database.md` §6 baru (jenis tabel, contoh, perilaku kedua repository), §5 (modul memakai Base/Child, bukan `AuditedRepository` langsung); struktur folder project-standards, README, CONTRIBUTING | Modul `users` & template scaffold pindah ke `BaseRepository` di 2.8 |
| 2026-10-08 | 2.5 | **Atas permintaan user**: setiap repository modul wajib memakai base — ditambahkan `AppendOnlyRepository` (tabel pencatatan: `append`, `findPage` default `id DESC`, `count`; tanpa update/delete/audit) dan `ReadOnlyRepository` (view referensi `.existing()`: `findPage` dengan `orderBy` wajib, `count`). Aturan "wajib extend salah satu dari 4 base" dijadwalkan di 2.6 (pengecualian `auth_refresh_tokens` lewat `eslint-disable` + alasan); query baca kustom di subclass `BaseRepository` wajib dari `this.scoped(...)` → `[review-only]` | Test daftar method membuktikan kedua base tidak punya method ubah/hapus |
| 2026-10-08 | Plan | **Atas permintaan user**: Step 2.9 baru — modul contoh `orders` + `order_lines` (header/detail) agar developer punya contoh nyata; `bun run setup` menghapus modul contoh secara default dan men-generate ulang migrasi dari awal (`--keep-examples` untuk mempertahankan) | Dipisah dari 2.8 agar setiap step tetap bisa direview mandiri |
| 2026-10-10 | 2.5 | ✅ Di-commit (`0454fa8`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-10 | 2.6 | Grup ESLint baru di `eslint.config.mjs`: `REPOSITORY_SYNTAX_RULES` (wajib extend 1 dari 4 base + larangan `tx.update`/`tx.delete`), `TX_WRITE_RULES`, `RAW_WRITE_SQL_RULES`, `RAW_QUERY_RULES`, `TRANSACTIONAL_RULES`, `SQL_RAW_RULES` (masuk `SOURCE_SYNTAX_RULES`), pola import `TX_HOST_IMPORT_PATTERN` & `recordChanges` (`importNames`). Blok modul dipecah per jenis file (default, `*.service.ts`, `*.repository.ts`, `*.queries.ts`, `*.controller.ts`), masing-masing menyusun semua grup yang berlaku. depcruise: `record-changes-only-in-database`, `transaction-host-only-in-repositories` | Chaos test: 16 error ESLint + 2 error depcruise; kasus sah (`*.queries.ts`, `@Transactional()` di service) lolos |
| 2026-10-10 | 2.6 | **Penyimpangan**: larangan import `recordChanges` & `TransactionHost` di modul utamanya lewat ESLint `no-restricted-imports` + `importNames` (plan: depcruise) — modul meng-import lewat barrel (`../../database`, `../../database/schema`) yang tidak bisa dibedakan depcruise per nama export; depcruise tetap dipasang untuk import jalur langsung. Larangan tulis "di luar `*.repository.ts`" dan raw query dibatasi pada objek `tx` (`this.txHost.tx`, variabel `tx`) agar `Map#delete` dll. tidak ikut tertangkap | Selector L7 diperbarui |
| 2026-10-10 | 2.6 | Pengecualian sementara sampai 2.8 (tabel `users` belum punya kolom audit & soft delete): `users.repository.ts` dan template `scaffold-module` memakai `eslint-disable-next-line no-restricted-syntax -- …step 2.8`. Test modul boleh memakai transaction host (simulasi transaksi di `users.service.test.ts`); larangan import koneksi DB tetap berlaku | 2.8 menghapus kedua `eslint-disable` |
| 2026-10-10 | 2.6 | Dokumen: CONTRIBUTING §5.3 baru (tabel aturan + pengecualian + `[review-only]`), `database.md` §6, `raw-queries.md` (`sql.raw`, `*.queries.ts` baca saja), `transactions.md` §3, project-standards Rule 3, `AGENTS.md` (daftar aturan AST) | — |
| 2026-10-10 | 2.6 | ✅ Di-commit (`7ba1de9`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-10 | 2.7 | `src/database/schema/schema-conventions.test.ts`: pemeriksaan murni (`tableViolations`, `staleAllowlistEntries`) dijalankan pada setiap tabel yang diekspor barrel schema — FK sebagai awalan index (index, kolom unique, atau PK), `id` dari helper (UUID v7 tanpa default DB, atau identity `ALWAYS` di PK), id berurutan hanya di `APPEND_ONLY_TABLES` + tanpa entri basi, tanpa `serial`, tabel ber-`deleted_at` tanpa unique biasa, `record_changes` siap partisi (PK, tanpa FK/unique, 2 CHECK). Pesan: `<tabel>.<kolom>: <aturan>` | Bagian kedua file membuktikan setiap pemeriksaan menyala pada tabel sintetis yang melanggar (chaos test permanen) |
| 2026-10-10 | 2.7 | Ditambahkan di luar rencana: FK juga dianggap ter-index bila menjadi awalan PK komposit atau kolom unique (PostgreSQL membuat index untuk keduanya); index yang **tidak diawali** FK tidak dihitung. Daftar tabel yang ditemukan dicek "minimal berisi `users` & `record_changes`", bukan daftar persis — menambah tabel tidak boleh memaksa mengubah test | Chaos test jalur nyata: tabel sementara diekspor dari barrel → 2 pelanggaran disebut dengan nama tabel & kolom; dipulihkan |
| 2026-10-10 | 2.7 | Dokumen: `database.md` (subbagian konvensi schema), CONTRIBUTING §5.3, `testing.md` §4 (penjaga kontrak + `migrations.test.ts`); rujukan "step 2.7" di `columns.ts` & `append-only-tables.ts` diganti nama file test | — |
| 2026-10-10 | 2.7 | ✅ Di-commit (`43bfe53`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-10 | Proses | Izin user diperluas: agent boleh menjalankan perintah apa pun ke DB **lokal** selama masa pengembangan (migrasi, baris uji, SQL destruktif); file env tetap tidak dibaca — koneksi lewat `src/database/connection.ts` | Aturan umum di plan (DoD §14.1) tetap: izin eksplisit, hanya DB lokal |
| 2026-10-10 | 2.8 | `users`: `uuidPrimaryKey` + `timestamps` + `auditColumns` + `softDelete`, `email` unik lewat `activeUniqueIndex` (`users_email_unique` dihapus); `UsersRepository extends BaseRepository` (`redact: ['passwordHash']`, `findByEmail` di atas `scoped()`); service: `updateUser` / `deleteUser` / `restoreUser`, evict cache detail setelah setiap tulis, email bentrok → `ConflictError` (cek + `isUniqueViolation()` untuk balapan); endpoint `PATCH /:id`, `DELETE /:id` (soft), `POST /:id/restore`; list via `findPage` (G11) | `updateUserSchema` tanpa password (ganti password = alur Fase 3) |
| 2026-10-10 | 2.8 | Ditambahkan di luar rencana: `isUniqueViolation(error)` (`src/database/unique-violation.ts`, SQLSTATE 23505, juga di `cause`) — bentrok `activeUniqueIndex` saat restore (atau dua create bersamaan) jadi 409, bukan 500; barrel `src/database` kini juga mengekspor keempat base repository | Terbukti di PostgreSQL asli: restore user yang email-nya sudah dipakai user hidup → 409 |
| 2026-10-10 | 2.8 | Migrasi `0003` (DROP unique lama, ADD `created_by`/`updated_by` NOT NULL, `deleted_at`, partial unique index) — tabel `users` lokal kosong (dicek dulu) lalu dijalankan. **Uji nyata ke DB lokal**: siklus lengkap lewat server sungguhan; `record_changes` benar (UPDATE, SOFT_DELETE, RESTORE; tanpa baris untuk patch kosong/restore gagal), `updated_at` = `changed_at` = `deleted_at` dalam satu transaksi (jam DB, Review 6), kolom Temporal terbaca/tertulis dengan presisi mikrodetik, partial index `WHERE (deleted_at IS NULL)` terpasang. 2 user + 4 baris audit uji dihapus setelahnya | Menutup 2 catatan lama: baca/tulis Temporal ke DB asli (2.2 → 6.1) dan predikat partial index di PostgreSQL asli (2.2) |
| 2026-10-10 | 2.8 | **Penyimpangan ruang lingkup**: varian template header + detail dan pencatatan dipindah ke 2.9 (bersama modul contoh `orders` — kode yang sama). Template mandiri ditulis ulang (`BaseRepository`, update / soft delete / restore, test repository baru); `verify:scaffold` memeriksa 6 operasi terdokumentasi dan menjalankan test konvensi schema terhadap tabel hasil template | Chaos test: `.unique()` biasa di template → `verify:scaffold` gagal dengan pesan konvensi |
| 2026-10-10 | 2.8 | ✅ Di-commit (`27d29dc`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-10 | 2.9 | Template varian di skill `scaffold-module`: `references/header-detail.md` (header `BaseRepository` + detail `ChildRepository`, rute `/<name>/:id/items[/:childId]`, `PUT …/items` = `syncForParent`) dan `references/record.md` (`AppendOnlyRepository`, list newest first + filter `kind`, wajib `APPEND_ONLY_TABLES`). `verify:scaffold` dibuat multi-varian: ketiga varian di-generate sekaligus (placeholder baru `<snake_singular>`), didaftarkan (barrel, `app.ts`, `APPEND_ONLY_TABLES`), lalu satu putaran gate + test hasil generate + konvensi schema + live request per varian (400 dari `validate()` & operasi terdokumentasi) | Chaos test: varian pencatatan tanpa `APPEND_ONLY_TABLES` → gagal; index detail di kolom lain (bukan FK) → `probe_order_items.probe_order_id: foreign key without an index…` |
| 2026-10-10 | 2.9 | **Penyimpangan penamaan**: detail diturunkan dari header dengan akhiran tetap `items` (`orders` → `order_items`, rute `/:id/items`) agar template cukup satu placeholder tambahan — modul contoh menjadi `orders` + `order_items` (plan: `order_lines`); developer mengganti `items` dengan kata benda sebenarnya setelah generate. `uuidChildParamSchema` (`{ id, childId }`, ditunda sejak 1.5) dibuat di `core/dto/common.dto.ts` + test unit `common.dto.test.ts` (sebelumnya belum ada) | Modul contoh = keluaran template (skrip generate + pesan Indonesia "Pesanan"), sehingga contoh & template tidak bisa menyimpang |
| 2026-10-10 | 2.9 | Migrasi `0004` (`orders`, `order_items`, FK `restrict`, index FK) dijalankan ke DB lokal; uji nyata pola header/detail lewat server sungguhan (IDOR, sync, sync id asing, header soft-deleted, restore) dan isi `record_changes` (DELETE snapshot & UPDATE detail dengan `parent_table`/`parent_id`; percobaan yang ditolak tidak meninggalkan jejak); 2 order, 2 item, 4 audit uji dihapus | — |
| 2026-10-10 | 2.9 | `scripts/setup.ts`: `EXAMPLE_MODULES` (file + baris registrasi, drift guard sebelum menulis apa pun; penghapusan baris mengikuti akhir baris file — `core.autocrlf` membuat CRLF), default menghapus contoh lalu `drizzle/` dikosongkan dan `drizzle-kit generate` membuat satu `0000`; `--keep-examples` mempertahankan semuanya | **Temuan uji salinan**: setelah contoh dihapus, knip gagal (`UuidChildParamDto` tak terpakai) → diperbaiki dengan test unit skema bersama. Migrasi hasil regenerasi dijalankan ke database sementara `bp_setup_probe` (lalu di-drop): tabel `record_changes`, `users` |
| 2026-10-10 | 2.9 | Hook proteksi env fail-closed memblokir perintah yang sekadar menyebut nama file env (untuk mengecualikannya saat menyalin repo) → logika penyalinan ditulis ke skrip lewat Write lalu dijalankan, sesuai header hook; skrip tidak membaca file env mana pun. Junction `node_modules` salinan dilepas dengan `rmdir` sebelum penghapusan (PowerShell 5.1 `Remove-Item -Recurse` bisa mengikuti junction) | `node_modules` repo diverifikasi utuh setelahnya |
| 2026-10-10 | 2.9 | Dokumen: skill `scaffold-module` (tabel pilihan varian + rujukan), skill `init-project` (nasib modul contoh, `--keep-examples`, verifikasi), README (Quick Start, struktur), CONTRIBUTING §10, `AGENTS.md` (`verify:scaffold` multi-varian), `database.md` §6 (contoh `orders`) — **Fase 2 selesai** setelah step ini di-merge | — |
| 2026-10-10 | 2.9 | ✅ Di-commit (`a29524f`) dan di-merge ke `main` atas permintaan user — **Fase 2 selesai** | — |
| 2026-10-10 | Review 7 | Review menyeluruh Fase 2 (2.1–2.9) atas permintaan user: 10 temuan, semua diperbaiki di branch `fix/review-phase-2` (baris di bawah) | Gate hijau; perilaku baru dibuktikan test + chaos test |
| 2026-10-10 | Review 7 | **Cache detail user**: entitas di-cache sebagai JSON → saat hit, `created_at` keluar `…24.434195Z` (miss: `…24.434Z`; `toWireTime` Review 6 terlewati), tipe `Temporal` ternyata `string`, dan **`passwordHash` tersimpan di Redis**. `CacheService.getOrSet(…, { revive })` (reviver yang melempar = miss, tidak dipanggil untuk `null`); `getUserById` meng-cache `PublicUser` (tanpa hash, tipe di `users.dto.ts`) dan menghidupkannya lagi lewat skema Zod `instantField` | Terbukti lewat probe `getOrSet` → `ApiResponse`; chaos test: reviver dicabut → 2 test gagal |
| 2026-10-10 | Review 7 | **Celah ESLint**: `const db = this.txHost.tx; db.delete(…)` lolos aturan tulis 2.6 (dikenali lewat nama `tx`). `TX_ALIAS_RULES` (masuk `MODULE_DATA_RULES`): `tx` tidak boleh disimpan di variabel, didestrukturisasi, atau di-assign di modul | Chaos test: 4 pelanggaran (variabel, destrukturisasi, `let` + assignment) ditolak |
| 2026-10-10 | Review 7 | Contoh repository basi di 4 dokumen (`transactions.md` §2, project-standards Rule 3, CONTRIBUTING §5.2, README §4) — tanpa base + `tx.insert`, gagal lint bila ditiru — diganti contoh `BaseRepository` + lookup `this.scoped()`. README §4 (tutorial `products` yang juga melanggar invariant 4 & 12) diganti tabel varian template yang diverifikasi mesin + urutan langkah; aturan `@Transactional()` di CONTRIBUTING diperbarui (base repository sudah transaksional) | — |
| 2026-10-10 | Review 7 | `AGENTS.md` invariant #14 _Audited Data Layer_; modul contoh `orders` mendapat `orders.controller.test.ts` & `orders.transformer.test.ts` (struktur wajib skill scaffold); `lint:setup` (`setup registry-check --dry-run`) di `validate` & CI — `IDENTITY_RULES`/`EXAMPLE_MODULES` yang basi gagal sekarang, bukan saat proyek baru diinisialisasi; baris `orders/` README ikut `EXAMPLE_MODULES` | Chaos test: baris README dihapus → `lint:setup` gagal menyebut barisnya |
| 2026-10-10 | Review 7 | Dokumen: pohon struktur (project-standards, CONTRIBUTING, README: `unique-violation.ts`, `orders/`, `test/helpers`), `testing.md` §5 baru (e2e modul dengan `spyOn`, `repository-fixtures.ts`), `redis-cache.md` & `datetime.md` (`revive`, jangan cache rahasia), L11, komentar `audited.repository.test.ts` | — |
| 2026-10-12 | Review 7 | ✅ Perbaikan Review 7 di-commit (`ed8bed5`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-12 | 3.1 | `src/config/auth.config.ts` (grup `auth`, variabel L1): `JWT_SECRET` min 32 karakter (nilai dummy hanya saat `NODE_ENV=test`), `JWT_ISSUER`/`JWT_AUDIENCE` kosong = `APP_NAME`, `AUTH_REGISTRATION_ENABLED` → boolean, `REFRESH_TOKEN_TTL_SECONDS` ≤ `REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS`; pesan error tidak pernah memuat nilai | `config.test.ts` (3 kasus baru) |
| 2026-10-12 | 3.1 | **Temuan `hono/jwt` 4.13.9**: `verify()` hanya memeriksa `exp`/`nbf`/`iat` bila claim-nya ada → token bertanda tangan sah **tanpa `exp` tidak pernah kedaluwarsa**; selain itu `exp` diperiksa **sebelum** signature (token palsu yang kedaluwarsa terbaca "expired"). `verifyAccessToken` (`src/core/security/jwt.ts`): hono memeriksa alg HS256/signature/`iss`/`aud` (cek waktu hono dimatikan) → skema Zod mewajibkan `sub` (uuid), `role`, `jti` (uuid), `iat`, `exp` → `exp` dibandingkan dengan `now` yang bisa diinjeksi. Hanya token asli yang bisa `ERR_AUTH_TOKEN_EXPIRED`; selain itu `ERR_AUTH_TOKEN_INVALID` tanpa alasan ke klien | Probe: token tanpa `exp` diterima `verify()` hono. Chaos test: skema claim dicabut, cek `exp` dicabut, `aud` tidak dicek, cek `exp` hono + pemetaan ke EXPIRED → masing-masing test gagal |
| 2026-10-12 | 3.1 | Penyimpangan: (1) `iat` di masa depan tidak ditolak — signature sah + `exp` sudah membatasi umur, dan menghindari penolakan palsu karena selisih jam antar instance; (2) `signAccessToken`/`verifyAccessToken` menerima `settings` & `now` opsional (default `authConfig`/`nowInstant()`) agar test tidak bergantung jam sistem; (3) barrel `src/core/security/index.ts` ditunda ke 3.4 (belum ada konsumen → knip); (4) kode error yang ditambah hanya `ERR_AUTH_TOKEN_EXPIRED`/`ERR_AUTH_TOKEN_INVALID` (+ pesan i18n) — kode L2 lain ditambah di step pemakainya | — |
| 2026-10-12 | 3.1 | `src/utils/crypto.util.ts` (murni): `generateOpaqueToken()` (32 byte → base64url 43 karakter), `sha256Hex()`, `timingSafeEqualHex()` — hex tidak valid / panjang berbeda → `false`, bukan throw (`Buffer.from(…, 'hex')` diam-diam membuang karakter invalid: `abzz` vs `abyy` akan dianggap sama). Redaksi logger + `accessToken`, `refreshToken` (± `*.`), `cookie`, `req.headers.cookie`; test redaksi memakai output pino sungguhan | Chaos test: validasi hex dicabut, path `req.headers.cookie` / `*.refreshToken` dihapus → test gagal |
| 2026-10-12 | 3.1 | Tambahan di luar langkah: `bun run setup` mengisi `JWT_SECRET` acak (48 byte base64url) bila `.env` belum punya atau nilainya kosong — nilai yang ada tidak pernah diganti atau dicetak; `.env.example` mendapat bagian `auth`. Dokumen: pohon struktur (project-standards, CONTRIBUTING, README — sekaligus memperbaiki README yang mencantumkan file middleware di bawah `openapi/`), `logging.md` (daftar redaksi) | Diuji di direktori sementara: file baru, dijalankan ulang (tidak berubah), baris tidak ada, nilai kosong, `--dry-run` (tidak menulis) |
| 2026-10-12 | 3.1 | ✅ Di-commit (`c49fe51`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-12 | 3.2 | `users.role` (`varchar(20)`, default `'user'`) + `ROLES`/`DEFAULT_ROLE` di `src/core/security/roles.ts`. Schema tidak boleh meng-import core (`strict-schema-isolation`), jadi `src/database/roles-column.test.ts` mencocokkan default & panjang kolom dengan `ROLES`. Tanpa CHECK constraint (menambah role = cukup edit `ROLES`, tanpa migrasi); validasi nilai di DTO (3.5) | Chaos test: default `'member'`, role > 20 karakter → test gagal |
| 2026-10-12 | 3.2 | `auth_refresh_tokens` (L3) di `domain/auth-refresh-tokens.schema.ts`: index `user_id` (FK `restrict`) & `family_id`, `token_hash char(64)` unik, tanpa kolom audit/soft delete. Penyimpangan: `replaced_by_id` sengaja **bukan** FK (family kedaluwarsa bisa dibersihkan dalam urutan apa pun; FK juga akan menuntut index). Test khusus di `schema-conventions.test.ts` (index `user_id`/`family_id`, `token_hash` unik, tidak ada kolom `token`). Migrasi `0005_rapid_lake.sql` di-generate dan diterapkan ke DB lokal (dicek read-only lewat `information_schema`) | Chaos test: index `family_id` / `user_id` dihapus, `token_hash` tidak unik → test gagal |
| 2026-10-12 | 3.2 | **Pengecualian data layer** (disetujui user 2026-10-04): override satu file `src/modules/auth/auth.repository.ts` di `eslint.config.mjs` (`AUTH_TOKEN_REPOSITORY_RULES`) — tanpa base, hanya `tx.update(authRefreshTokens)`; `tx.update` tabel lain & `tx.delete` tetap ditolak; aturan modul lain (raw `UPDATE`, alias `tx`, `tx.execute`, `@Transactional()`) tetap berlaku. Lebih sempit dari rencana awal (`eslint-disable` + alasan): pengecualian tidak bisa meluas ke tabel lain. Dokumen `database.md` §6 & CONTRIBUTING §5.3 diperbarui | Chaos test (file sementara, dihapus): kode yang diizinkan lolos; `update(users)`, `delete(authRefreshTokens)`, kode yang sama di `tokens.repository.ts` → ditolak |
| 2026-10-12 | 3.2 | Dampak ke `users`: `role` masuk respons user (`userResponseSchema`, transformer, OpenAPI) dan skema cache detail (entri cache lama tanpa `role` gagal di-revive → dianggap miss); fixture & snapshot SQL test diperbarui | Chaos test: `role` dihapus dari transformer → test transformer & e2e gagal |
| 2026-10-12 | 3.2 | ✅ Di-commit (`f50a2f8`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-12 | 3.3 | Modul `src/modules/auth/` (`POST /login`, `/refresh`, `/logout`, `/logout-all`, `GET /me`, `POST /register` hanya bila `AUTH_REGISTRATION_ENABLED`): access token di body, refresh token opaque hanya di cookie `refresh_token` (`HttpOnly; Secure; SameSite` dari config; `Path=<API_BASE_PATH>/v1/auth`; `Max-Age` = sisa umur token), hanya `sha256` yang disimpan. Rotasi dalam satu transaksi dengan baris token terkunci `FOR UPDATE`; `expires_at = min(now + TTL, family_started_at + ABSOLUTE_TTL)`; cabut = `revoked_at = now()` (jam DB) | e2e `test/auth.e2e.test.ts` lewat `createApp()` + fake in-memory (`test/helpers/auth-fakes.ts`, `spyOn` singleton); SQL repository dengan perekam SQL |
| 2026-10-12 | 3.3 | **Penyimpangan (algoritma L3)**: token yang dicabut **tanpa pengganti** (logout, logout-all, user nonaktif, family dicabut) yang dipakai lagi kini `ERR_AUTH_REFRESH_INVALID`, bukan reuse — hanya token yang sudah dirotasi (`replaced_by_id` terisi) yang memicu deteksi reuse + cabut family. Tanpa ini, refresh setelah logout menampilkan pesan "token lama dipakai ulang", dan token terbaru dari family yang dicabut juga disebut reuse | Chaos test: pembedaan dicabut → 4 test gagal |
| 2026-10-12 | 3.3 | **Penyimpangan (langkah 4)**: depcruise `no-cross-module-imports` melarang `users` → `auth` sama sekali. Pencabutan untuk user nonaktif/terhapus terjadi di jalur refresh (family dicabut, 401) dan `GET /me` (401); access token yang sudah terbit habis dalam `ACCESS_TOKEN_TTL_SECONDS` (15 menit). Endpoint ganti password belum ada — saat dibuat, di modul `auth` + `logoutAll`. Login/register memakai `AuthUsersRepository` milik modul auth (`extends BaseRepository<typeof users>`, `redact: passwordHash`) atas tabel `users` bersama | Chaos test: cek `isActive` di refresh dicabut → test gagal |
| 2026-10-12 | 3.3 | Login: setiap percobaan dihitung per `(sha256(email ternormalisasi), IP klien)` via `increment` (`CACHE_KEYS.loginAttempts`), login sukses mereset; lewat `AUTH_LOGIN_MAX_ATTEMPTS` → 429 `ERR_AUTH_LOGIN_LOCKED` + `Retry-After` **tanpa** memeriksa password; Redis mati → fail-open. Email tak dikenal diverifikasi terhadap hash dummy (waktu respons sama); email salah, password salah, akun nonaktif → 401 `ERR_AUTH_INVALID_CREDENTIALS` yang sama. Batas panjang password 1024 (hashing sengaja lambat → tuas DoS). `users.role` di luar `ROLES` → 500 (invariant rusak); claim `role` JWT kini `z.enum(ROLES)` | Chaos test: lock dicabut, cek akun nonaktif dicabut → test gagal |
| 2026-10-12 | 3.3 | **Temuan `hono/csrf`**: hanya memeriksa request yang content-type-nya mirip form (`Content-Type` kosong dianggap `text/plain` → ikut diperiksa); `application/json` tidak diperiksa — aman karena browser lintas situs butuh preflight CORS untuk itu. `csrfProtection(origins)` di core membungkusnya: origin yang diizinkan = `CORS_ORIGINS` (`*` = semua, hanya non-production) + origin API sendiri; penolakan → 403 `ERR_CSRF_ORIGIN_FORBIDDEN` (bawaan: `HTTPException` → `ERR_FORBIDDEN`). Dipasang di `/login`, `/refresh`, `/logout` | Klien non-browser (tanpa `Origin`) mengirim `Content-Type: application/json` — didokumentasikan di deskripsi endpoint & `.env.example` |
| 2026-10-12 | 3.3 | Ditarik lebih awal dari 3.4: `requireAuth()` per route (`src/core/middlewares/authenticate.ts`; `Bearer` → `verifyAccessToken` → `setAuthenticatedUser` = actor `user:<id>` + role di `RequestContext.user`), `currentUser()` (401 bila route lupa `requireAuth`), opsi `describeEndpoint({ auth: 'bearer' })` (`security: bearerAuth` + 401, dijaga `test/openapi.e2e.test.ts`). Step 3.4 tinggal menjadikannya global default-deny + `PUBLIC_ROUTES` + `requireRole()` | — |
| 2026-10-12 | 3.3 | **Uji nyata** (server sungguhan port 3999, PostgreSQL 17 + Redis 3.0 lokal, `JWT_SECRET` sementara lewat env proses — file env tidak dibaca): `Set-Cookie` persis D3; `/me` 200; rotasi → cookie baru; token lama → 401 `REUSED`; token terbaru → 401 `INVALID`; `Origin` asing → 403 `ERR_CSRF_ORIGIN_FORBIDDEN`; DB: 1 family, baris lama `revoked+rotated`, hash 64 karakter, plaintext tidak tersimpan, umur 7 hari; logout 200 dua kali → refresh 401; brute force `401×5 → 429` (`Retry-After: 899`, skrip Lua di Redis 3.0). User, token & audit uji dihapus (0 baris tersisa) | Satu-satunya baris `csrf.ts` tak tercakup = lempar ulang defensif untuk error non-403 (`hono/csrf` hanya melempar 403) |
| 2026-10-12 | 3.3 | Dokumen: `references/openapi.md` (`auth: 'bearer'`, §6), pohon struktur & daftar middleware (project-standards, CONTRIBUTING, README), README (fitur Auth), scope commit `auth`, `.env.example` (`CORS_ORIGINS` = allowlist CSRF); header status plan diperbarui (sebelumnya masih `a29524f` / Review 7). Panduan FE (`docs/auth-guide.md`) tetap di 3.5 | — |
| 2026-10-12 | 3.3 | ✅ Di-commit (`11087c7`) dan di-merge ke `main` atas permintaan user. Catatan diskusi user (CSRF masih perlu? `SameSite` vs subdomain) dijadwalkan masuk `docs/auth-guide.md` di 3.5 | — |
| 2026-10-12 | 3.4 | `authenticate({ basePath })` dipasang sekali di `createApp()` untuk `<API_BASE_PATH>/v1/*` (L10 langkah 9): selain `PUBLIC_ROUTES` wajib `Bearer` → `verifyAccessToken` → actor `user:<id>` + role. `requireAuth()` per route dari 3.3 dihapus (digantikan); `currentUser()` tetap. `requireRole(...roles)` → 403 `ERR_ROLE_FORBIDDEN` (tanpa user = 401, bukan lolos diam-diam) dan mendokumentasikan 403-nya sendiri di OpenAPI (`uniqueSymbol`, seperti `validate()`). `matchRoutePattern` murni di `src/utils/route-match.util.ts` (`:param`, `*` di akhir pada batas segmen, path ber-`.`/`..`/segmen kosong tidak pernah cocok) — dipakai lagi oleh ACL partner (5.1) | Chaos test: middleware tidak dipasang, wildcard publik lebar, cek metode diabaikan, `requireRole` meloloskan semua, matcher menerima `..`, prefix mount tidak dibuang → masing-masing test gagal |
| 2026-10-12 | 3.4 | **Penyimpangan (L4)**: `PUBLIC_ROUTES` relatif terhadap `<API_BASE_PATH>/v1` (base path bisa dikonfigurasi) dan hanya berisi `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/register`; health, docs dan `/` berada di luar `/v1` sehingga publik secara desain — daftar persisnya dijaga `test/default-deny.e2e.test.ts` (route baru di luar `/v1` membuat test gagal). Path `/v1` yang tidak ada → 401 sebelum routing (tidak membocorkan route mana yang ada); user terautentikasi tetap 404 | — |
| 2026-10-12 | 3.4 | **Penyimpangan (langkah 1)**: pengecualian `/api/v1/partner/*` **ditunda ke 5.3** bersama `partnerAuth()` — dipasang sekarang berarti setiap route `/partner/...` terbuka tanpa proteksi apa pun sampai Fase 5 | — |
| 2026-10-12 | 3.4 | Dokumen OpenAPI: `buildOpenApiDocument(app, info, requiresAuthentication)` menandai setiap operasi yang dilindungi `authenticate()` dengan `security: bearerAuth` + 401 dari aturan yang sama (`isPublicRoute`); opsi `describeEndpoint({ auth: 'bearer' })` dari 3.3 dihapus (tidak bisa lagi lupa/menyimpang). `test/openapi.e2e.test.ts` memeriksa **setiap** operasi: dilindungi ⇔ bertanda `bearerAuth` | Chaos test: penanda dimatikan → test gagal. Uji server nyata: `/api/v1/users` 401, `/api/v1/nope` 401, `/auth/login` publik (400 validasi), health & docs 200; dokumen: `users`/`me` ber-`bearerAuth`, `login` tidak |
| 2026-10-12 | 3.4 | Test: `test/default-deny.e2e.test.ts` (L4) mengenumerasi `app.routes` — setiap route `/v1` non-publik → 401 `ERR_UNAUTHORIZED`, route publik tidak pernah 401 karena token, route yang ditambahkan **setelah** `createApp()` otomatis terlindungi; helper `authorize(app, role)` (`test/helpers/authorized-app.ts`) untuk test kontrak modul (users, orders, validate, health); `verify:scaffold` kini memastikan route hasil template 401 tanpa token lalu 400 dengan token | — |
| 2026-10-12 | 3.4 | Dokumen: `AGENTS.md` invariant #15 _Default-Deny Authentication_, project-standards Rule 13 + daftar middleware, `bootstrap.md` (tabel pipeline langkah 9; salinan `app.ts` disinkronkan — **tertinggal sejak 3.3**, route `auth` belum tercantum), `openapi.md`, skill `scaffold-module` (route terlindungi, `requireRole`, `authorize()`), CONTRIBUTING, README | — |
| 2026-10-12 | 3.4 | ✅ Di-commit (`5491544`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-12 | 3.5 | `users`: create, **list**, update, delete, restore → `requireRole('admin')`; `GET /:id` dan `GET /:id/external-posts` → admin atau pemilik lewat `requireSelfOrRole('id', 'admin')` (core, generik: parameter route = id pemanggil, selain itu role harus cocok; 403 yang sama baik resource ada maupun tidak — tidak membocorkan user lain; 403 terdokumentasi otomatis). Penyimpangan: plan hanya menyebut POST/PATCH/DELETE — list semua user dan data eksternal per user juga dibatasi | Chaos test: `adminOnly` dicabut dari POST / list / PATCH, `GET /:id` dibuka untuk semua role, cek pemilik diabaikan → masing-masing test gagal |
| 2026-10-12 | 3.5 | DTO `users`: `role` opsional `z.enum(ROLES)` di create (default kolom `user`) dan update; respons tetap `role: string` (kolom `varchar`, transformer murni tidak boleh melempar/memaksa tipe). User biasa tidak bisa menaikkan role-nya sendiri (PATCH khusus admin) | e2e: role `root` → 400; admin membuat user ber-role `admin` → 201 |
| 2026-10-12 | 3.5 | Seed admin: logika di `src/database/seeds/seed-admin.ts` (lapisan database, teruji perekam SQL; tulis lewat `BaseRepository` → actor `system`, promosi teraudit), CLI `scripts/seed-admin.ts` (`bun run seed:admin --email <email> [--name] [--promote]`): password dari prompt tersembunyi (raw mode, diminta dua kali) atau baris pertama stdin bila di-pipe — tidak pernah dari argumen/env. Ditambahkan di luar rencana: idempoten (admin aktif = tidak berubah), user yang sudah ada **tidak** disentuh tanpa `--promote` (password tidak pernah ditimpa), `--promote` = jadikan admin aktif. Langkah `seed:admin` ditambahkan ke keluaran `bun run setup`, skill `init-project` dan README Quick Start | Prompt tersembunyi (TTY) **belum diuji** — shell agent bukan TTY; jalur stdin diuji ke DB lokal |
| 2026-10-12 | 3.5 | `docs/auth-guide.md` (FE, Bahasa Indonesia): endpoint & cookie, access token di memori (bukan `localStorage`) + refresh saat aplikasi dibuka, `credentials: 'include'`, refresh **single-flight di tab + Web Locks lintas tab** (dua refresh bersamaan dengan cookie sama = reuse → logout), contoh klien `fetch`, logout / logout-all, tabel kode error, serta hasil diskusi user: kenapa CSRF tetap perlu (cookie, bukan form), `SameSite` = site (eTLD+1) sehingga subdomain lain tidak tertahan dan hanya cek `Origin` yang menahan, pilihan penempatan FE/API, pengembangan lokal (`localhost` beda port = satu site), klien non-browser (`Content-Type: application/json`), risiko cookie tossing | — |
| 2026-10-12 | 3.5 | **Uji nyata** (PostgreSQL + Redis lokal, server port 3999): `seed:admin` via stdin → admin dibuat; dijalankan ulang → tidak berubah; password pendek / argumen salah → ditolak (exit 1). Admin login → list 200, buat user 201; user biasa → list 403, buat 403, PATCH role sendiri 403, lihat admin 403, lihat diri sendiri 200; `--promote` → user jadi admin (list 200), `record_changes`: `UPDATE role user→admin` oleh `system`; `created_by`: seed = `system`, user buatan admin = `user:<id admin>`. Semua data uji dihapus (0 tersisa) | **Fase 3 selesai** setelah step ini di-merge |
| 2026-10-12 | 3.5 | ✅ Di-commit (`17d8265`) dan di-merge ke `main` atas permintaan user — **Fase 3 selesai** | — |
| 2026-10-12 | Review 8 | Review menyeluruh Fase 3 (3.1–3.5) atas permintaan user: 15 temuan; user menyetujui semua rekomendasi, diperbaiki di branch `fix/review-phase-3` (baris di bawah) | Gate hijau; perilaku baru dibuktikan test + chaos test |
| 2026-10-12 | Review 8 | **Email peka huruf besar/kecil**: `Ada@x.com` dan `ada@x.com` bisa menjadi dua akun, login dengan huruf berbeda gagal (kunci brute-force sudah lowercase, pencarian user tidak). `emailField` bersama (`core/dto/common.dto.ts`: trim + lowercase sebelum validasi) dipakai create/update user, login, register; `seed:admin` ikut menormalkan. `newPasswordField` (8–1024) menyatukan aturan password | e2e: login `'  ADA@Example.com'` → 200; create user dengan email campuran → disimpan lowercase |
| 2026-10-12 | Review 8 | **Rate limit global**: default `RATE_LIMIT_MAX` 100 → **1000** per 15 menit per IP — 100 habis oleh satu SPA aktif, apalagi satu kantor di balik NAT. Opsi rate limit per user setelah login masuk backlog L12 | L1 diperbarui |
| 2026-10-12 | Review 8 | **Ganti password (tidak ada sebelumnya)**: `POST /auth/change-password` (password lama wajib, percobaan dihitung seperti login → 429, salah → 400 `current_password`; hash baru + `password_changed_at`, semua sesi dicabut, sesi baru untuk perangkat ini — atomik) dan reset admin `PUT /users/:id/password`. Kolom baru `users.password_changed_at` (migrasi `0006`): refresh menolak family yang dimulai **sebelum** password terakhir diganti — mekanisme yang juga berlaku untuk reset admin dari modul `users` tanpa import lintas modul (menutup penyimpangan langkah 4 di 3.3). `PublicUser` dan cache detail tidak memuat kolom ini | Chaos test (lihat bawah) |
| 2026-10-12 | Review 8 | `REFRESH_TOKEN_TTL_SECONDS` dibatasi ≤ 34.560.000 (400 hari): nilai lebih besar membuat **setiap login 500** — terbukti, Hono menolak cookie `Max-Age` > 400 hari | `config.test.ts` |
| 2026-10-12 | Review 8 | Pembersihan token: `purgeRefreshTokens(retentionDays = 7)` di `src/database/maintenance/` (lapisan database; hapus baris yang **kedaluwarsa** lebih dari N hari — token kedaluwarsa tidak bisa dipakai lagi dan token yang dirotasi selalu kedaluwarsa sebelum penggantinya) + `bun run auth:purge-tokens [--days N]` untuk dijadwalkan harian. depcruise: `src/database/maintenance/` dikecualikan dari `no-orphans` seperti `seeds/` | Diuji ke DB lokal (lihat bawah) |
| 2026-10-12 | Review 8 | Log keamanan (`emailHash` = sha256, email plaintext tidak pernah dicatat): `Login failed` (`reason`: `unknown_email` / `wrong_password` / `inactive`), `Login locked`, `Login succeeded`, `Logged out of every session`, `Password change refused`, `Password changed`, `Refresh refused` (`reason`: `inactive` / `password_changed`); sebelumnya hanya reuse yang tercatat | Test memastikan email tidak muncul di log |
| 2026-10-12 | Review 8 | Admin tidak bisa menghapus, menonaktifkan, atau mencabut role admin **akunnya sendiri** → 403 `ERR_SELF_LOCKOUT_FORBIDDEN` (admin lain bisa; pemulihan: `seed:admin --promote`). `seed:admin --promote` kini membuang cache detail user (`onUserChanged`) dan menutup koneksi Redis | — |
| 2026-10-12 | Review 8 | 401 dari `authenticate()` membawa `WWW-Authenticate: Bearer` / `Bearer error="invalid_token"` (RFC 6750 §3), diekspos lewat CORS. Hash dummy login dibuat saat modul dimuat (sebelumnya pada pemakaian pertama → login pertama dengan email tak dikenal sedikit lebih lambat). Komentar basi `requireAuth()` di `request-context.ts` diperbaiki | — |
| 2026-10-12 | Review 8 | Dokumen: CONTRIBUTING §4.3 baru _Autentikasi & Otorisasi_ (route publik, `requireRole`, `requireSelfOrRole`, `currentUser`, test, seed, password, purge, latensi role 15 menit, log keamanan) + tabel error §3.3 dilengkapi kode auth + `emailField`/`newPasswordField` di §4.2; `auth-guide.md` (change-password, reset admin, perubahan role, email tak peka huruf, `WWW-Authenticate`, kode error baru); project-standards Rule 13; README; `database.md`; `.env.example`; L1, L3, L4 | — |
| 2026-10-12 | Review 8 | **Chaos test** (11, semua tertangkap): email tidak di-lowercase, refresh mengabaikan `password_changed_at`, change-password tidak mencabut sesi lain / tidak dihitung sebagai percobaan, log memuat email plaintext, admin boleh menghapus diri sendiri, reset admin tanpa `password_changed_at`, tanpa `WWW-Authenticate`, TTL refresh tanpa batas, purge berdasarkan `created_at`, promosi seed tanpa membuang cache. **Uji nyata** (migrasi `0006` diterapkan ke DB lokal; server port 3999 + PostgreSQL + Redis): seed dengan email HURUF BESAR tersimpan lowercase; login dengan huruf campuran 200; duplikat beda huruf 409; change-password di perangkat B → perangkat A dan cookie lama B `ERR_AUTH_REFRESH_INVALID`, cookie baru B 200; password lama salah 400; reset admin → refresh perangkat lain ditolak, login dengan password baru 200; admin hapus / turunkan role diri sendiri → `ERR_SELF_LOCKOUT_FORBIDDEN`; `WWW-Authenticate` `Bearer` / `Bearer error="invalid_token"`; `auth:purge-tokens --days 7` menghapus 6 token yang dibuat kedaluwarsa 10 hari lalu. Semua data uji dihapus (0 tersisa) | Prompt TTY `seed:admin` masih belum teruji (shell agent bukan TTY) |
| 2026-10-12 | Review 8 | ✅ Di-commit (`5bbf5dc`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-12 | 4.1 | `ExternalServiceError(kind, message, { integration })`: opsi `origin` diganti `integration: IntegrationIdentity` (`{ code, institution }`) → `error.origin` = kode, **`error.institution`** = nama vendor (hanya pada `EXTERNAL_SERVICE_ERROR`; `ErrorEnvelope` OpenAPI: properti opsional). `src/integrations/registry.ts`: `INTEGRATION_REGISTRY` (key = kode, test: key = `code`, nama unik). `HttpClientOptions`: `originName` diganti `integration` (entri registry), **`timeoutMs` wajib** (default `10000` diam-diam dihapus; nilainya dari `integrationsConfig`) | `registry.test.ts`, `api-error.test.ts`, `error-handler.test.ts` |
| 2026-10-12 | 4.1 | Kegagalan outbound: `details` ke client = pesan generik dwibahasa per jenis (`EXTERNAL_TIMEOUT_DETAIL` / `EXTERNAL_UNREACHABLE_DETAIL` / `EXTERNAL_ERROR_DETAIL`) — body vendor dan fallback `'Unknown external service error'` hilang dari respons. Log `Outbound HTTP request failed`: `integration`, `kind`, `method`, `url` **tanpa query string**, `vendorStatus`, `vendorBody`, `err`; header tidak pernah di-log. `vendorBody` lewat `summarizeVendorBody()` (`core/http/vendor-body.ts`): kunci rahasia disensor **di kedalaman berapa pun** (fragmen `password`/`token`/`secret`/`apikey`/`authorization`/`cookie`/`creditcard`/`cardnumber`, kunci utuh `pin`/`otp`/`nik`/`cvv`/`cvc`; tidak peka huruf, `_`/`-` diabaikan), dipotong 2048 karakter, biner → ukurannya. Penyimpangan: redaksi sendiri, bukan `redact` Pino — path Pino hanya cocok satu tingkat dan nama kunci persis, sedangkan nama field vendor bebas (`access_token`, `X-Api-Key`) | `vendor-body.test.ts` |
| 2026-10-12 | 4.1 | Interceptor request mengirim `X-Request-ID` = request ID dari context (tidak menimpa header yang diisi pemanggil; di luar request — job/bootstrap — tanpa header) | Unit + `test/outbound.e2e.test.ts` |
| 2026-10-12 | 4.1 | ESLint (`OUTBOUND_HTTP_SYNTAX_RULES`, `OUTBOUND_HTTP_IMPORT_PATTERN`): `fetch(`, `globalThis`/`Bun`/`self`/`window.fetch(`, serta import `axios`, `node-fetch`, `undici`, `got`, `ky`, `superagent`, `(node:)http`/`https`/`http2` ditolak di seluruh `src/` kecuali `src/core/http/**`; file test boleh `fetch` ke server test lokal. Ditambahkan di luar rencana: larangan juga mencakup `node:http(s)` dan klien HTTP lain, bukan hanya `axios` | Chaos ESLint: probe berisi 4 import + 3 panggilan `fetch` di `modules` (biasa/service/repository), `integrations`, `core/cache`, `utils`, `database` → masing-masing 7 error; di `core/http` → 0 |
| 2026-10-12 | 4.1 | `test/outbound.e2e.test.ts`: panggilan HTTP nyata `GET /users/:id/external-posts` → adapter JSONPlaceholder → vendor palsu lokal yang menjawab 401 + body/header rahasia → client **502** `ERR_EXT_ERROR`, `origin` `JSONPLACEHOLDER`, `institution` `JSONPlaceholder`, tanpa body/header vendor; vendor menerima `X-Request-ID` yang sama dengan request masuk. Dokumen: project-standards Rule 4 + Rule 9, AGENTS.md (daftar ESLint), CONTRIBUTING §3.3 + §8 (registry, timeout wajib, body hanya di log, korelasi, larangan `fetch`) + struktur folder, README, L2 | **Chaos test** (9, semua tertangkap): tanpa `X-Request-ID`, header pemanggil ditimpa, body vendor ke `details`, tanpa redaksi, tanpa pemotongan, query string di-log, timeout diabaikan, `institution` hilang dari envelope, `institution` bukan dari registry. **Uji nyata** ke JSONPlaceholder publik: `GET /posts/1` sukses; path tak ada → vendor 404 → 502 `ERR_EXT_ERROR` + `institution`; `timeoutMs: 1` → 504 `ERR_EXT_TIMEOUT`; log tanpa header/query |
| 2026-10-12 | 4.1 | ✅ Di-commit (`b317346`) dan di-merge ke `main` atas permintaan user | — |
| 2026-10-12 | 4.2 | `AccessTokenCache` (`src/core/http/access-token-cache.ts`, bukan per vendor): `login()` dari adapter → token dipakai ulang sampai `expires_in − 60 dtk` (`refreshMarginSeconds`); token yang hidup kurang dari 2× margin dipakai setengah umurnya (tanpa ini token 30 dtk tidak pernah dipakai ulang); `expires_in` 0/negatif/NaN → dipakai sekali. **Single-flight**: pemanggil paralel berbagi satu promise login; login gagal tidak di-cache (semua penunggu menerima error, panggilan berikutnya mencoba lagi). Ditambahkan di luar rencana: `withToken()` login ulang + retry **sekali** saat vendor menjawab 401 (token dicabut/kedaluwarsa lebih awal), `invalidate(token)` tidak membuang token yang lebih baru. Untuk itu `ExternalServiceError.vendorStatus` (internal, tidak pernah diserialisasi) | `access-token-cache.test.ts`: 10 request paralel → 1 login ✅ |
| 2026-10-12 | 4.2 | Cache token **per proses** (N instance = N login/token). Vendor yang hanya mengizinkan satu token aktif butuh cache bersama (Redis + lock) → backlog L12 | — |
| 2026-10-12 | 4.2 | `HttpClientService.parse(schema, body)`: key body vendor → camelCase lalu Zod; tidak cocok → 502 `ERR_EXT_ERROR` + log `Outbound HTTP response rejected` (hanya path + kode issue, tanpa nilai). Ditambahkan di luar rencana — respons vendor (mis. `expires_in`) harus divalidasi sebelum dipakai | Unit test |
| 2026-10-12 | 4.2 | Config per vendor: `integrations.config.ts` → **`jsonplaceholder.config.ts`** (`jsonPlaceholderConfig`, grup `jsonplaceholder`); vendor baru = `src/config/<vendor>.config.ts` (kredensial wajib di luar test, `TEST_DEFAULTS` seperti `auth.config.ts`). Nama env var tidak berubah | `config.test.ts` |
| 2026-10-12 | 4.2 | Template `scaffold-module/references/integration.md` (vendor berbasis login: registry, config, DTO, adapter dengan `AccessTokenCache` + `parse()`, `index.ts`, test terhadap vendor palsu `Bun.serve`: 10 paralel → 1 login, 401 → login ulang, body salah → 502, singleton default → port tertutup `ERR_EXT_UNREACHABLE`, kredensial wajib di luar test). **`verify:scaffold` diperluas**: men-generate vendor `probe-vendor`, mendaftarkannya di registry + barrel config, lalu semua gate + test-nya (gate ini sempat menangkap 2 error lint dan 1 export tak terpakai di draf template). Panduan `project-standards/references/integrations.md`; project-standards Rule 9 + tabel referensi; scaffold-module (tabel varian, deskripsi pemicu + wrapper `.claude`); AGENTS.md; CONTRIBUTING §8; README; `.env.example` | **Chaos test** (12, semua tertangkap): tanpa single-flight, margin diabaikan, token pendek tidak dipakai ulang, promise login gagal tidak dilepas, `invalidate` membuang token baru, tanpa retry 401, retry untuk semua error, expiry tidak dijumlahkan, `vendorStatus` tidak diisi, `parse` tanpa camelCase, `parse` mencatat pesan/nilai issue (2). Cabang khusus `expires_in` tidak valid terbukti redundan oleh chaos test (perilaku sama tanpa cabang) → dihapus, test tetap |
| 2026-10-12 | 4.2 | ✅ Di-commit (`6ff27d1`) dan di-merge ke `main` atas permintaan user — **Fase 4 selesai** | — |
| 2026-10-12 | Review 9 | Review ulang Fase 4 + cek silang skills ↔ rules ↔ lint ↔ docs atas permintaan user: 13 temuan; user menyetujui semua rekomendasi, diperbaiki di branch `fix/review-phase-4` (baris di bawah). Konsisten tanpa perubahan: env var config ↔ `.env.example` ↔ L1, kode error di plan, pipeline `createApp()` ↔ `bootstrap.md`, nama rule depcruise yang dikutip dokumen | Gate hijau |
| 2026-10-12 | Review 9 | **Hook pre-push** = `bun run validate:full` (sebelumnya hanya `lint:branch`, `lint:arch`, `lint:deps`, `bun test`): coverage gate, `format:check`, `lint:setup` kini juga menahan push — penting karena CI belum pernah jalan (belum ada remote) | — |
| 2026-10-12 | Review 9 | **Aturan controller ditegakkan** (`CONTROLLER_SYNTAX_RULES`): membaca input dari `c.req` (`json`, `parseBody`, `formData`, `text`, `arrayBuffer`, `blob`, `query`, `queries`, `param`, `valid`; `c.req.header()` tetap boleh karena header tidak divalidasi `validate()`), dan method / field class yang bukan `asyncHandler(...)`. Pemakaian transformer ditandai `[review-only]` (Rule 5, invariant 4) | Chaos ESLint: probe controller dengan `c.req.json`, `c.req.query`, `c.req.param`, arrow tanpa `asyncHandler`, wrapper lain, method → 6 error; `c.req.header` + constructor lolos; modul nyata bersih |
| 2026-10-12 | Review 9 | `raw-queries.md`: contoh lama tidak lolos lint (tanpa return type, `this.txHost` di luar `*.queries.ts`) dan menghitung baris soft-deleted. Contoh baru: tabel/kolom diinterpolasi (`${users.deletedAt}`), `deleted_at IS NULL`, hasil `tx.execute` (bertipe `any`) ke `unknown` lalu divalidasi Zod | Dibuktikan sebagai file sementara: tsc + ESLint + Prettier lolos, SQL dirender lewat perekam SQL |
| 2026-10-12 | Review 9 | `testing.md`: contoh e2e modul memakai `authorize(createApp())` (sebelumnya `createApp()` saja → 401 sejak default-deny), guard `default-deny`, `hermetic-env`, `outbound` ditambahkan | — |
| 2026-10-12 | Review 9 | Rujukan ambigu "plan 4.1" (pengecualian repository auth) di `eslint.config.mjs`, `auth.repository.ts`, `auth-refresh-tokens.schema.ts` → "adoption plan §4.1 decision log" (Step 4.1 kini HttpClient) | — |
| 2026-10-12 | Review 9 | Pohon direktori: CONTRIBUTING §2.1 jadi versi kanonik (ditambah `core/http` isi, `health-probe.ts`, `seeds/`, `maintenance/`, `test/` lengkap, `scripts/`); README diringkas per lapisan + tautan; SKILL dibetulkan (`integrations/`, `scripts/`, `maintenance/`, daftar file `users/` diringkas). Ditemukan saat perbaikan: baris `orders/` di pohon CONTRIBUTING dan SKILL **tidak** dihapus `bun run setup` (basi setelah setup) → `EXAMPLE_MODULES` kini juga menghapusnya | `lint:setup` + `setup demo --dry-run` hijau |
| 2026-10-12 | Review 9 | Dokumen disamakan: diagram CI + pre-push (CONTRIBUTING §1), tabel perintah (`lint:setup`, cakupan `verify:scaffold`), urutan `validate:full` (project-standards §6), L8 (`lint:setup`), `ERR_ROUTE_NOT_FOUND` + bentuk `ExternalServiceError` (§3.3), daftar redaksi log (§7) + `logging.md` → `vendorBody`, §10 scaffolding (`requireRole`, default-deny, aturan controller, test lengkap), AGENTS.md (daftar ESLint: `c.body`/`c.html`, `c.req`, `asyncHandler`, alias `tx`, pengecualian repository auth; invariant 1 dan 4) | — |
| 2026-10-12 | Review 9 | Deskripsi frontmatter `.agents/skills/*` disamakan dengan wrapper `.claude` (teks pemicu). Ditambahkan di luar rekomendasi: `test/agent-skills.test.ts` menjaga setiap skill punya tepat satu wrapper dengan `name` + `description` sama dan menunjuk file sumbernya (dicatat di CLAUDE.md) | **Chaos test** (5, semua tertangkap): deskripsi sumber berbeda, wrapper tidak menunjuk sumber, `name` wrapper berbeda, skill sumber tanpa wrapper; baris `orders/` di pohon CONTRIBUTING berubah → `lint:setup` gagal |
| 2026-10-12 | Review 9 | `bun.lock`: nama root workspace `backend-boilerplate` → `bun-hono-starter` (= `package.json`; `IDENTITY_RULES` menimpa keduanya saat setup) | `bun install --frozen-lockfile` tanpa perubahan |
| 2026-10-12 | Review 9 | **Insiden saat review**: `grep -rn` rekursif di root repo ikut membaca file env lokal (gitignored) dan menampilkan 3 barisnya, termasuk password DB lokal — hook tidak menahan karena nama file tidak muncul di perintah. Dilaporkan ke user; pencarian berikutnya hanya lewat `git grep` (file ter-track) | User disarankan mengganti password DB lokal bila dipakai di tempat lain |
| 2026-10-12 | Review 9 | ✅ di-commit (`840e24b`) dan di-merge ke `main` | — |
| 2026-10-12 | 5.1 | `secret-cipher.util.ts`: `createSecretCipher({ activeKeyId, keys })` (hex 64 per key) → `encrypt` / `decrypt` / `needsReEncryption`; AES-256-GCM, IV 12 byte acak, tag 16 byte, format `v1.<keyId>.<iv>.<tag>.<ciphertext>` (base64url). **Tambahan di luar plan:** `v1.<keyId>` dipakai sebagai AAD (payload tidak bisa dilabel ulang ke key lain); base64url harus kanonik (Buffer diam-diam membuang karakter asing / bit padding); keyring tidak valid → `SecretCipherError` saat dibuat (fail fast), pesan tidak pernah memuat materi key. Config (5.2) tidak boleh mengimpor `utils` (`strict-config-isolation`) → parsing `PARTNER_SECRET_KEYS` tetap di `partner.config.ts`, util memvalidasi ulang | Vektor tetap: payload disegel `node:crypto` langsung dengan key lama `k0` tetap terbaca setelah active key → `k1`; tamper ciphertext/tag/IV/label key → gagal |
| 2026-10-12 | 5.1 | `partner-signature.util.ts`: `canonicalQuery`, `buildCanonicalString`, `signV1`, `verifyV1` (timing-safe via `timingSafeEqualHex`) sesuai L5. Keputusan yang melengkapi L5: query di-decode seperti router (`+` = spasi, `a` = `a=`, pasangan kosong dibuang), di-encode ulang RFC 3986 (hex kapital, `!'()*` ikut di-encode), urut key lalu value dalam urutan code unit; metode di-uppercase; huruf besar/kecil hex signature tidak signifikan. `sha256Hex` kini menerima `Uint8Array` (body mentah) | 3 vektor tetap dihitung **independen** dengan Python (`hmac`/`hashlib`/`urllib.parse`) — juga contoh untuk panduan partner (5.4) |
| 2026-10-12 | 5.1 | `ip-match.util.ts`: `isValidIpRule`, `matchesIpRule`, `matchesAnyIpRule` (IPv4/IPv6, CIDR, `::`, ekor IPv4). Alamat klien IPv4-mapped (`::ffff:a.b.c.d` / `::ffff:cb00:7107`) dibaca sebagai IPv4; aturan ditolak bila bit host di bawah prefix terisi (`10.0.0.5/24`), ditulis IPv4-mapped, atau ber-zone ID. `normalizeIp` **dipindah** dari `core/middlewares/client-ip.ts` ke util ini (core memakainya, tidak diduplikasi). `route-match.util.ts` sudah ada sejak 3.4 (tidak diubah) | **Chaos test** (13, semua tertangkap): query tidak diurutkan, `!'()*` tidak di-encode, metode tidak di-uppercase, `verifyV1` selalu benar, AAD dihapus (enkripsi / dekripsi), cek base64url kanonik dihapus, `needsReEncryption` selalu salah, active key tidak diwajibkan, bit host diterima, IPv4-mapped tidak di-unmap, keluarga IP dicampur, aturan IPv4-mapped diterima |
| 2026-10-12 | 5.1 | ✅ di-commit (`614e9d1`) dan di-merge ke `main` | — |
| 2026-10-12 | 5.2 | `partner.config.ts`: `PARTNER_SECRET_KEYS` di-parse jadi `{ <id>: <hex> }` (format `id:<64 hex>`, ID ganda / hex salah / entri tanpa ID ditolak per entri tanpa mencetak nilai), `PARTNER_SECRET_ACTIVE_KEY_ID` wajib ada di keyring, `PARTNER_HMAC_TOLERANCE_MS` default 300000. Wajib di luar test (default khusus test). `bun run setup` kini mengisi `PARTNER_SECRET_KEYS` (`k1:<random>`) + `PARTNER_SECRET_ACTIVE_KEY_ID=k1` di file env lokal seperti `JWT_SECRET` (`GENERATED_SECRETS`, nilai yang sudah ada tidak pernah diganti / dicetak). `.env.example` + L1 | Probe: tanpa keyring proses berhenti dengan `PARTNER_SECRET_KEYS: is required` (tanpa nilai); `setup demo --dry-run` → "Would generate PARTNER_SECRET_KEYS, PARTNER_SECRET_ACTIVE_KEY_ID" |
| 2026-10-12 | 5.2 | Tabel `partner_credentials` (migrasi `0007`), standalone + `BaseRepository` dengan `redact: ['apiKeyHash', 'encryptedSecret']`; `ip_whitelist` / `allowed_routes` = `text[]`. **Penyimpangan konvensi (disengaja, ditegakkan mesin):** `partner_code` unik permanen (juga terhadap baris terhapus, karena menjadi actor audit `partner:<code>`) = `uniqueIndex` biasa di tabel soft delete — konvensi 2.7 melarangnya, maka ditambah allowlist bernama `PERMANENT_UNIQUE_INDEXES` (`src/database/schema/permanent-unique-indexes.ts`, wajib alasan) + cek entri basi di `schema-conventions.test.ts`, mirip `APPEND_ONLY_TABLES`. `api_key_hash` tetap `activeUniqueIndex` | — |
| 2026-10-12 | 5.2 | Helper bersama di `src/core/security/partner-credentials.ts` (dipakai admin API sekarang dan `partnerAuth()` di 5.3 — core tidak boleh mengimpor modul): `issuePartnerApiKey()` (`pk_` + 32 byte acak; disimpan hanya `sha256` + prefix 11 karakter), `issuePartnerSecret()` (32 byte acak), `hashPartnerApiKey()`, instance `partnerSecretCipher` dari keyring config | — |
| 2026-10-12 | 5.2 | Modul `partner-credentials` (admin saja, `requireRole('admin')` di setiap route): create, list, detail, `PATCH` (nama, IP whitelist, route, rate limit; kode permanen), `POST /:id/activate` / `deactivate`, `POST /:id/secret-rotations`, `POST /:id/api-key-rotations`, `DELETE` (soft), `POST /:id/restore` (**tambahan**: pola standar template; aman karena kode tidak pernah dipakai ulang). API key / secret plaintext hanya di respons create / rotasi (201). Validasi: kode `^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$`; IP whitelist lewat `isValidIpRule` (trim + lowercase, duplikat dibuang, maks 100, kosong = semua); `allowed_routes` minimal 1, pola **relatif terhadap `<API_BASE_PATH>/v1/partner`** (`/orders`, `/orders/:id`, `/orders/*`, `/*`; tanpa query, `.`/`..`, segmen kosong, `*` di tengah); `rate_limit_rpm` 1–100000 (default 60). Kode yang sudah pernah dipakai (termasuk terhapus) → 409 lewat `isUniqueViolation` | **Chaos test** (11, semua tertangkap): `adminOnly` dihapus dari route rotasi, transformer membocorkan `apiKeyHash`, redaksi `record_changes` dihapus, entri allowlist unique permanen hilang, `partner_code` jadi `activeUniqueIndex` (entri basi), active key tidak dicek terhadap keyring, ID key ganda diterima, secret disimpan plaintext, validasi IP rule dimatikan, validasi pola route dilonggarkan, unique violation tidak dipetakan ke 409 |
| 2026-10-12 | 5.2 | Probe layanan asli (Postgres lokal, server port 3999, keyring `p1` lewat env proses): create 201 → DB berisi `sha256(api key)` dan secret terenkripsi `v1.p1.…` yang didekripsi independen (`node:crypto`) ke secret yang diterbitkan; list/detail tanpa hash/secret/key; non-admin 403; patch; rotasi secret & API key mengubah DB; deactivate/activate; delete → 404; kode credential terhapus dipakai ulang → 409 `ERR_CONFLICT`; restore; `record_changes` (5× UPDATE, SOFT_DELETE, RESTORE) tanpa materi key (`[REDACTED]`). Baris uji dihapus | 18/18 OK |
| 2026-10-12 | 5.2 | **Ditunda ke 5.3:** cache lookup partner + invalidasi saat update / rotasi / deactivate / delete; lookup `findByApiKeyHash` disuntikkan ke `partnerAuth()` dari modul (core tidak boleh mengimpor modul). **Backlog (L12):** re-enkripsi semua secret ke active key baru tanpa mengganti secret partner — sampai ada, rotasi keyring = tambah key baru + rotasi secret per partner sebelum key lama dibuang (`.env.example`) | — |
| 2026-10-12 | 5.2 | ✅ di-commit (`2ba2423`) dan di-merge ke `main` | — |
| 2026-10-12 | 5.3 | `partnerAuth({ basePath, lookup })` (`src/core/middlewares/partner-auth.ts`) di-mount di `<API_BASE_PATH>/v1/partner/*` sebelum `authenticate()` (L10 langkah 8). Urutan sesuai plan, dengan penegasan: header wajib (format dicek: timestamp `^\d{1,16}$`, nonce `^[A-Za-z0-9_-]{16,64}$`, signature 64 hex) → 401 `ERR_PARTNER_HEADERS_MISSING`; drift timestamp → 401 `ERR_PARTNER_REPLAY_REJECTED`; lookup `sha256(api key)` → 401 `ERR_PARTNER_INVALID_KEY` (**nonaktif = jawaban sama** dengan key tak dikenal); IP whitelist → 403 `ERR_PARTNER_IP_FORBIDDEN`; `allowed_routes` relatif terhadap mount → 403 `ERR_PARTNER_ROUTE_FORBIDDEN`; body mentah dibaca sekali lewat `c.req.arrayBuffer()` (cache Hono → `validate()` tetap bisa membaca JSON); signature atas path persis + query kanonik → 401 `ERR_PARTNER_SIGNATURE_INVALID`; nonce `setIfAbsent` **setelah** signature (request tak bertanda tangan tidak bisa menghabiskan nonce partner), TTL 2× toleransi; rate limit per partner (`increment`, jendela 60 s, header `RateLimit-*`) → 429; lalu `setAuthenticatedPartner` (actor `partner:<code>`, `currentPartner()` untuk handler). Secret yang tidak bisa didekripsi (key hilang dari keyring) = 500 `ERR_INTERNAL`, bukan penolakan partner. Satu log audit per request di `finally` (`info` allowed / `warn` rejected + `reason`), tanpa nilai key/nonce/signature. 6 kode `ERR_PARTNER_*` (L2) masuk `APP_ERROR_CODES` + pesan i18n | — |
| 2026-10-12 | 5.3 | `authenticate()` melewati `/partner/*` **hanya bila `partnerAuth()` sudah memverifikasi partner** (`getAuthenticatedPartner()`), bukan sekadar karena prefix — tanpa `partnerAuth()` route partner butuh bearer token (fail-closed). `PARTNER_ROUTE_PREFIX` + `isPartnerRoute()` di `public-routes.ts` (batas segmen: `/partnership` bukan route partner). OpenAPI: operasi partner diberi 4 security scheme header partner (`x-partner-*`, wajib bersama) + 401/403, bukan `bearerAuth`. `test/default-deny.e2e.test.ts`: setiap route partner → 401 `ERR_PARTNER_HEADERS_MISSING` tanpa header partner, juga dengan bearer token admin | — |
| 2026-10-12 | 5.3 | Lookup disuntikkan dari modul (`partnerCredentialsService.findForGateway`, core tidak boleh mengimpor modul): `getOrSet` di Redis (`CACHE_KEYS.partnerCredential(hash)`, TTL 60 s, miss 15 s via `negativeTtl`, entri di-*revive* dengan Zod — entri rusak = miss); **setiap** perubahan (create, update, activate/deactivate, rotasi secret, rotasi API key — hash lama **dan** baru, delete, restore) menghapus entri cache. `findByApiKeyHash` di repository (`this.scoped`, credential terhapus tidak pernah cocok). Modul contoh `partner-gateway`: `GET /partner/ping`, `POST /partner/echo` (untuk partner menguji implementasi signing-nya; dipertahankan oleh `setup`) | — |
| 2026-10-12 | 5.3 | **Ditemukan saat implementasi:** `bun test` ikut memuat file env lokal developer, sehingga keyring partner asli (setelah user menambahkannya) menimpa default test — test cipher gagal. Preload hermetik kini juga mengunci `PARTNER_SECRET_KEYS` / `PARTNER_SECRET_ACTIVE_KEY_ID` ke nilai test (`test/hermetic-env.test.ts` menjaganya): test tidak pernah memakai key yang mengenkripsi secret partner sungguhan | `hermetic-env.test.ts` hijau dengan keyring asli di file env lokal |
| 2026-10-12 | 5.3 | Trade-off Redis didokumentasikan (`redis-cache.md`, CONTRIBUTING §4.3): nonce dan rate limit partner **fail-open** — saat Redis mati, replay di dalam jendela timestamp dan kelebihan rate tidak tertahan (log `warn` dari CacheService), partner tidak pernah terkunci karena cache; lookup jatuh ke database. Operasi yang tidak boleh berjalan dua kali tetap butuh idempotency key di domain | Unit test: `CacheService` dengan client tidak siap → request yang sama 2× lolos + 2 `warn` (`setIfAbsent` / `increment` failing open) |
| 2026-10-12 | 5.3 | **Chaos test** (14, semua tertangkap): `authenticate()` melewati route partner tanpa partner terverifikasi, `partnerAuth()` tidak di-mount, jendela timestamp tidak dicek, partner nonaktif diterima, IP whitelist diabaikan, ACL route diabaikan, signature tidak ditegakkan, nonce tidak ditegakkan, rate limit tidak ditegakkan, body dibaca melewati cache Hono (`c.req.raw`), hash API key lama tetap di cache setelah rotasi, deaktivasi tidak menghapus cache, lookup melihat credential terhapus, OpenAPI tidak menandai route partner | — |
| 2026-10-12 | 5.3 | Probe layanan asli (Postgres + Redis lokal, server port 3999, keyring dari file env lokal user): credential dibuat lewat admin API; `GET /partner/ping` bertanda tangan → 200 sebagai partner + header `RateLimit-*`; `POST /partner/echo?x=1&a=2` dengan body → 200 (body dibaca handler); nonce sama → 401 replay (Redis asli); secret salah → 401 signature; header partner ke `/users` → 401 `ERR_UNAUTHORIZED`; lookup ter-cache di Redis; ubah `allowed_routes` → 403 seketika; rotasi API key → key lama 401 seketika, key baru 200; rate limit 6/menit → 429; deactivate → 401 seketika; 15 baris log audit tanpa key/secret. Baris DB + key Redis uji dibersihkan. **Tidak diuji asli:** Redis dimatikan (Redis lokal user tidak dihentikan; dicakup unit test) | 15/15 OK |
| 2026-10-12 | 5.3 | ✅ di-commit (`85e7c2a`) dan di-merge ke `main` | — |
| 2026-10-12 | 5.4 | `docs/partner-integration-guide.md` (bahasa Indonesia, pola `docs/auth-guide.md`): kredensial dari admin API (arti `partner_code`, `ip_whitelist`, `allowed_routes` relatif `/partner`, `rate_limit_rpm`, key/secret sekali tampil), header, canonical string + aturan rinci (path persis, query RFC 3986 terurut, hash byte body, secret UTF-8), contoh **TypeScript** (Node 18+/Bun, tanpa dependensi) dan **Python** (stdlib — tambahan di luar plan, untuk partner non-JS) dan curl via script, endpoint uji ping/echo, 3 vektor uji + canonical string lengkap, tabel kode error + tindakan partner (retry selalu dengan nonce & timestamp baru, idempotensi), rotasi (secret, API key, nonaktif, keyring server), catatan operasional (NTP, `TRUST_PROXY_HOPS` vs whitelist, Redis fail-open, log audit, cache), dan cara backend menambah endpoint partner | Blok kode TS & Python **diekstrak dari file `.md`** lalu dijalankan: cocok dengan 3 vektor; ke server lokal (port 3999, Postgres + Redis asli) `GET ping` ber-query + `POST echo` ber-body → 200 untuk keduanya |
| 2026-10-12 | 5.4 | `scripts/partner-sign.ts` (`bun run partner:sign --key --url [--method --body/--body-file] [--send]`): mencetak 4 header + perintah curl siap pakai (sekali pakai), atau mengirim langsung. Secret hanya dari prompt tersembunyi / baris pertama stdin (pola `seed-admin`): pembaca bersama dipindah ke `scripts/lib/read-secret.ts`, `seed-admin.ts` memakainya (tanpa duplikasi). Helper murni `partnerSignatureHeaders()` + konstanta `PARTNER_HEADERS` dipindah ke `partner-signature.util.ts` (dipakai script, test, dan `partnerAuth()`) | Probe: `--send` dengan secret di-pipe → `HTTP 200`; curl yang dicetak → 200 lalu `ERR_PARTNER_REPLAY_REJECTED` saat diulang; curl ber-body dengan tanda kutip tunggal → 200; secret tidak pernah tercetak. Prompt TTY (`readHidden`) tidak diuji otomatis (sama seperti `seed:admin`) |
| 2026-10-12 | 5.4 | **Penjaga dokumen** (tambahan): vektor signing dipindah ke `test/helpers/partner-signing-vectors.ts` (satu sumber untuk unit test dan panduan); `test/partner-guide.test.ts` menuntut panduan memuat vektor (secret, signature, nonce, canonical query, canonical string #3), satu baris tabel per header `x-partner-*`, setiap kode `ERR_PARTNER_*` dari registry, dan script `partner:sign` yang terdaftar | **Chaos test** (7, semua tertangkap): signature vektor #2 di panduan diubah, canonical query diubah, canonical string #3 diubah, kode `ERR_PARTNER_*` hilang dari panduan, nama header hilang dari tabel (awalnya **lolos** karena header juga disebut di ringkasan → cek diperketat ke baris tabel), script `partner:sign` tidak terdaftar, `partnerSignatureHeaders` mengabaikan query |
| 2026-10-12 | 5.4 | Panduan partner ditambah **§9 Checklist onboarding** (prasyarat production: keyring baru & dicadangkan, `TRUST_PROXY_HOPS`, Redis + NTP; 8 langkah per partner sampai go-live; sesudahnya); bagian developer menjadi §10 | `test/partner-guide.test.ts` tetap hijau |
| 2026-10-12 | 5.4 | **Keputusan baru D23–D28** (diskusi user saat review 5.4: partner khusus vs webhook vendor, penamaan, standar industri): dua kanal inbound terpisah (webhook vendor di luar `/v1`), penamaan `<modul>[.<kanal>].<peran>.ts` dan `<vendor>.<peran>.ts`, modul bernama domain, `requirePartner()`, idempotensi wajib. Syarat user: setiap keputusan **ditegakkan lint / dependency-cruiser / test** dan tertulis di skills & rules, agar tetap terjaga tanpa agent AI. Fase 5 diganti nama "Inbound: Partner & Webhook Vendor"; ditambah **Step 5.5** (konvensi kanal + penegakan) dan **Step 5.6** (webhook vendor); 6.1 kini bergantung pada 5.6 | — |
| 2026-10-12 | 5.4 | ✅ di-commit (`ed556d6`) dan di-merge ke `main` | — |
| 2026-10-12 | 5.5 | **Temuan: ls-lint tidak pernah memeriksa nama file bertitik ganda.** ls-lint menganggap ekstensi = semua setelah titik pertama (`users.controller.ts` → `.controller.ts`), sehingga aturan `.ts` (termasuk regex kebab-case yang sudah ada sejak awal) hanya berlaku untuk nama satu titik; `Users.Controller.ts` lolos. Dibuktikan dengan probe (`.controller.ts: regex:zzz` menolak semua controller, `.ts: regex:…` tidak menolak apa pun). **Penyimpangan langkah 1–2**: penamaan ditegakkan `test/structure.test.ts` (bukan ls-lint): setiap file di `src/`, `test/`, `scripts/` kebab-case per segmen titik; file modul `<modul>[-<kualifier>][.partner\|.webhook].<peran>[.test].ts` (`<modul>` = nama folder; peran `routes`, `controller`, `service`, `repository`, `queries`, `dto`, `transformer`, `messages`, `util`); file integrasi `<vendor>.<peran>[.test].ts` (`service`, `dto`, `webhook`, `webhook.dto`) atau `index.ts`. ls-lint tetap untuk nama folder & file satu titik; keterbatasannya dicatat di `.ls-lint.yml` | Probe ls-lint: `regex:${0}` (nama folder) didukung, tetapi tidak menolong untuk nama bertitik |
| 2026-10-12 | 5.5 | **Penyimpangan D24**: ditambah `[-<kualifier>]` (file kedua dengan peran sama: `auth-users.repository.ts`) dan peran `util` (helper lokal modul) agar kode yang ada lolos tanpa pengecualian. Rename: `auth-cookie.ts` → `auth-cookie.util.ts`; `partner-gateway.{routes,controller,controller.test}.ts` → `partner-gateway.partner.*` (controller-nya memakai `currentPartner` — langsung tertangkap aturan kanal) | Seluruh file yang ada lolos tanpa pengecualian |
| 2026-10-12 | 5.5 | Test struktur juga menegakkan D26 (folder `src/modules/<x>` ≠ `src/integrations/<x>`) dan pemasangan kanal: router yang di-export `*.partner.routes.ts` hanya muncul di bawah `<base>/v1/partner` dan setiap route di sana berasal dari file partner (dicocokkan lewat identitas handler di `createApp().routes`); sama untuk `*.webhook.routes.ts` ↔ `<base>/webhooks` (siap untuk 5.6). Bagian ketiga test membuktikan setiap pemeriksaan menyala pada contoh yang sengaja salah | — |
| 2026-10-12 | 5.5 | **Penyimpangan langkah 5**: helper per kanal ditegakkan rule ESLint lokal `local/inbound-channel` (didefinisikan di `eslint.config.mjs`), bukan `no-restricted-syntax` — grup `no-restricted-syntax` per peran (controller, service, …) saling menimpa sehingga kombinasi peran × kanal rapuh. Kanal dibaca dari nama file: `*.partner.*` hanya `currentPartner`/`requirePartner`; file biasa hanya `requireRole`/`requireSelfOrRole`/`currentUser`; `*.webhook.*` tidak satu pun; import ber-alias ikut tertangkap | — |
| 2026-10-12 | 5.5 | `requirePartner(...codes)` (`src/core/middlewares/require-partner.ts`) → 403 `ERR_PARTNER_ROUTE_FORBIDDEN` untuk partner lain, 401 tanpa partner terverifikasi, 403 terdokumentasi di OpenAPI lewat helper yang sama dengan `requireRole()` (`documentsForbidden`, di-export, tidak diduplikasi) | Unit test 4 kasus |
| 2026-10-12 | 5.5 | Varian template `scaffold-module/references/partner.md` (13 langkah): tabel `partner_code` + `partner_reference` dengan `activeUniqueIndex` (retry → 409), repository `findByPartnerReference` (dibatasi ke partner pemanggil), service `createForPartner`/`getForPartner`, `<name>.partner.controller.ts` (`currentPartner()`), `<name>.partner.routes.ts` (tanpa `requireRole`), registrasi `v1.route('/partner/<name>', …)`, test repository/service/transformer/controller. `verify:scaffold`: varian keempat `probe-submissions` (dipasang di `/v1/partner/probe-submissions`), **live check bertanda tangan** lewat `partnerAuth()` asli dengan credential probe (tanpa header → 401 `ERR_PARTNER_HEADERS_MISSING`, signature valid + body salah → 400), dan `test/structure.test.ts` ikut dijalankan atas file hasil generate | `verify:scaffold`: 4 varian modul + integrasi lolos semua gate |
| 2026-10-12 | 5.5 | Rules & skills: `AGENTS.md` invariant #16 _Inbound Channels & File Naming_ + daftar penegak (ESLint, ls-lint vs test struktur); project-standards Rule 14 (tabel kanal, pola nama, idempotensi, penegak) + `requirePartner` di Rule 13; tabel varian `scaffold-module`; CONTRIBUTING §11 (pola nama + subbagian kanal inbound), §4.3, pohon `test/`; `testing.md`; panduan partner §10 | **Chaos test** (14, semua tertangkap): akhiran nyaris benar `users.partner-routes.ts`, file ber-huruf besar di `core/`, file modul tanpa prefix modul, peran integrasi tak dikenal, modul bernama vendor, router partner dipasang di luar `/partner`, router user dipasang di bawah `/partner`, `currentUser()` di controller partner, `currentPartner()` di controller user, `requirePartner` ber-alias di route user, `requireRole()` di file webhook, `requirePartner()` meloloskan semua partner, template partner memakai `requireRole()` (`verify:scaffold` gagal), template partner dipasang di luar `/partner` (`verify:scaffold` gagal lewat test struktur) |
| 2026-10-12 | 5.5 | **Insiden saat probe ls-lint**: skrip probe sempat menghapus `src/modules/users/users.controller.ts` (file ter-track, belum diubah); dipulihkan dengan `git checkout` (isi identik dengan commit) sebelum test dijalankan | `git status` bersih untuk modul `users` |
| 2026-10-12 | 5.5 | ✅ di-commit (`bb29912`) dan di-merge ke `main` | — |
| 2026-10-12 | 5.6 | Core: `WebhookVendor` (`vendor`, `signatureHeader`, `verify({ body, header, nowMs })`) + `webhookAuth(vendor)` (body mentah dibaca sekali — `validate()` tetap bisa membaca; gagal → 401 `ERR_WEBHOOK_SIGNATURE_INVALID`; actor `webhook:<vendor>`, `currentWebhook()`; satu log audit `audit: 'webhook'` per request tanpa nilai signature) + `requireVerifiedWebhook()`: guard **fail-closed** untuk seluruh `<base>/webhooks/*` setelah verifier semua vendor — route yang vendornya tidak punya verifier, atau path vendor tak dikenal, → 401 (bukan publik, bukan 404). Tipe `Actor` + `RequestContext.webhook`. **Penyimpangan kecil langkah 1**: `webhookAuth(vendor)` menerima deskriptor vendor (bukan `{ vendor, verify }` terpisah) agar header signature ikut dipakai OpenAPI | Unit test 7 kasus |
| 2026-10-12 | 5.6 | `validate({ body, bodyKeys: 'verbatim' })` (**tambahan**): payload vendor dipertahankan apa adanya (tanpa cek snake_case, tanpa konversi) — tanpa ini vendor ber-camelCase selalu 400. Dibatasi ESLint `local/inbound-channel` hanya di file `*.webhook.*`; rule yang sama kini mengenal kanal webhook (`currentWebhook` hanya di file webhook) | — |
| 2026-10-12 | 5.6 | Tabel `webhook_events` (migrasi `0008`, `APPEND_ONLY_TABLES`): `vendor`, `event_id`, `event_type`, `payload` jsonb, timestamps; unique `(vendor, event_id)`. Penerima menyimpan dengan `INSERT … ON CONFLICT (vendor, event_id) DO NOTHING RETURNING` (`appendIfNew`, tidak melempar → transaksi tetap sehat) dan memproses dalam `@Transactional()` yang sama: gagal → tidak ada baris → retry vendor diproses ulang; duplikat → 200 `duplicate: true` | — |
| 2026-10-12 | 5.6 | Contoh: vendor `demo-pay` (`src/integrations/demo-pay/`: verifier gaya Stripe — `x-demo-pay-timestamp` detik + `v1=<HMAC-SHA256(secret, "<ts>.<body>")>`, toleransi, timing-safe; payload camelCase; config `DEMO_PAY_WEBHOOK_SECRET` — **kosong = webhook nonaktif, semua 401**, sehingga contoh tidak pernah membuka endpoint tanpa autentikasi; registry `DEMO_PAY`) + modul domain `payment-notifications` (D26; `*.webhook.routes.ts` di `<base>/webhooks/demo-pay`). `WEBHOOK_VENDORS` di `src/app.ts` = satu-satunya tempat verifier didaftarkan; dependency-cruiser `webhook-verifier-only-in-app` menolak impor `*.webhook.ts` integrasi dari tempat lain. OpenAPI: skema `<vendor>-webhook` (header signature vendor) + 401 per operasi webhook. Preload hermetik mengunci `DEMO_PAY_WEBHOOK_SECRET` ke nilai test | — |
| 2026-10-12 | 5.6 | Penjaga: `test/default-deny.e2e.test.ts` — route di luar `/v1` = platform publik **atau** webhook; setiap route webhook harus milik vendor di `WEBHOOK_VENDORS` dan menjawab 401 `ERR_WEBHOOK_SIGNATURE_INVALID` tanpa signature (juga dengan bearer token admin); path vendor tak dikenal 401. `test/openapi.e2e.test.ts` — operasi webhook bertanda skema vendornya. `test/vendor-webhooks.e2e.test.ts` — signed lewat `createApp()`. Test struktur (5.5) kini aktif untuk kanal webhook. Template `scaffold-module/references/webhook.md` (15 langkah: config, DTO payload, verifier + test vektor, `index.ts`, DTO/pesan/repository/service/controller/routes modul + test) dengan placeholder vendor baru; `verify:scaffold` varian kelima `probe-receipts` ← vendor `probe-hooks`, registrasi `WEBHOOK_VENDORS` + route, live check bertanda tangan (tanpa signature → 401, signature valid + payload salah → 400) | **Chaos test** (14, semua tertangkap): prefix webhook tanpa verifier & guard, guard dicabut + penerima dipasang untuk vendor tak terdaftar, vendor dihapus dari `WEBHOOK_VENDORS`, `webhookAuth` tidak mencatat vendor, toleransi timestamp diabaikan, signature apa pun diterima, secret kosong tidak fail-closed, insert inbox tanpa `ON CONFLICT DO NOTHING`, duplikat diproses ulang, `bodyKeys: 'verbatim'` di route user, `currentWebhook()` di controller partner, service modul mengimpor verifier, OpenAPI tidak menandai webhook, template controller mengimpor verifier (`verify:scaffold` gagal) |
| 2026-10-12 | 5.6 | Probe layanan asli (migrasi `0008` diterapkan ke DB lokal; server port 3999, secret demo lewat env proses): webhook bertanda tangan → 200; retry event sama → 200 `duplicate: true`; tepat satu baris `webhook_events` dengan payload ber-casing vendor; signature palsu → 401; timestamp 1 jam → 401; path vendor tak dikenal → 401 (fail-closed); signature valid + payload salah → 400 tanpa baris; log audit accepted/rejected (`no_verifier`) tanpa nilai signature, actor `webhook:demo-pay`. Baris uji dihapus | 9/9 OK |
| 2026-10-12 | 5.6 | Dokumen: `AGENTS.md` invariant #16 (bagian webhook), project-standards Rule 14 (tabel kanal + bullet webhook) & pohon, `integrations.md` §5 baru _Inbound webhooks_, `openapi.md`, `bootstrap.md` (langkah 7b), `testing.md`, tabel varian `scaffold-module`, CONTRIBUTING (pohon, tabel kanal, aturan webhook), README, `.env.example`, L1/L2/L10/L11 | — |
| 2026-10-12 | 5.6 | ✅ di-commit (`9e1e166`) dan di-merge ke `main` — **Fase 5 selesai** | — |
| 2026-10-13 | Review 10 | Review ulang Fase 5 (5.1–5.6) + cek silang skills ↔ rules ↔ lint ↔ docs ↔ plan atas permintaan user: 10 temuan, ditambah 1 temuan saat perbaikan. User menyetujui semua rekomendasi (keputusan C → D29, E → D30) dan usulan CLI scaffolder (D31, Fase 7 disusun ulang); diperbaiki di branch `fix/review-phase-5` | Baseline sebelum perbaikan: `validate:full` hijau, 795 test |
| 2026-10-13 | Review 10 | **D29 — rate limit kanal inbound.** Temuan: limiter global (`'*'`, hanya health yang dikecualikan) memotong trafik partner dan webhook — default 1000/900 detik ≈ 66 rpm per IP, sementara `rate_limit_rpm` partner boleh sampai 100.000, dan burst retry vendor bisa 429. Perbaikan: `isUnderPath(...prefixes)`; limiter global melewati `<base>/v1/partner` dan `<base>/webhooks`; `rejectionLimit()` baru (`src/core/middlewares/rate-limit.ts`) di kedua prefix menghitung **hanya** jawaban 401/403 per IP (`rate-limit:inbound-rejected:<ip>`, `RATE_LIMIT_*` yang sama, fail-open, tanpa header `RateLimit-*` agar kuota partner tetap pemiliknya); request yang diterima tidak pernah dihitung | Test unit `rejectionLimit` (4) + `isUnderPath` banyak prefix; `test/platform.e2e.test.ts` (spy `cacheService`): `/` → `global`, partner & webhook → `inbound-rejected` |
| 2026-10-13 | Review 10 | **Payload webhook utuh.** Temuan: Zod membuang field vendor yang tidak dikenal sebelum event disimpan, padahal komentar menyebut "payload as the vendor sent it" (dibuktikan: `createdAt` dan `data.extra` hilang). Perbaikan: `.passthrough()` di skema payload `demo-pay` (atas + `data`) dan template `webhook.md`; test controller dan template mengirim field tambahan | Rule 14 menyebut `.passthrough()` |
| 2026-10-13 | Review 10 | **D30 — contoh webhook dihapus `bun run setup`.** `EXAMPLE_MODULES` entri kedua: `src/integrations/demo-pay`, `src/modules/payment-notifications`, `src/config/demo-pay.config.ts` + test, `test/vendor-webhooks.e2e.test.ts`; baris di `app.ts`, `config/index.ts`, registry, `.env.example`, preload hermetik, pohon docs, `testing.md`. `lines` kini menerima blok beberapa baris dan `replaceWith` (`WEBHOOK_VENDORS = [demoPayWebhook]` → `[]`). Test config demo-pay dipindah ke `src/config/demo-pay.config.test.ts`. Test kanal menerima nol vendor: `default-deny`, `openapi` dan `structure` kini menuntut "ada route webhook ⇔ `WEBHOOK_VENDORS` tidak kosong". `app.ts`: route memakai `demoPayWebhook.vendor` (bukan string). `partner-gateway` tetap | — |
| 2026-10-13 | Review 10 | `verify-scaffold.ts`: anchor registrasi webhook tidak lagi bergantung pada contoh Demo Pay (`import userRoutes`, daftar `WEBHOOK_VENDORS` apa pun isinya, baris `requireVerifiedWebhook()`); `replaceAnchor()` gagal keras bila anchor hilang (sebelumnya `.replace()` berantai bisa diam-diam tidak mendaftarkan). Template `webhook.md` langkah 12 tanpa `demoPayWebhook` | `verify:scaffold` hijau di repo **dan** di proyek hasil setup |
| 2026-10-13 | Review 10 | **Temuan saat perbaikan (bug sejak 2.9):** setelah `bun run setup <nama>`, `lint:setup` (bagian `validate`, hook pre-push, CI) **gagal** di proyek baru karena contoh sudah terhapus (dibuktikan di salinan); dan menjalankan ulang setup akan men-generate ulang `drizzle/` milik proyek. Perbaikan: contoh yang seluruh file dan registrasinya sudah tidak ada dilewati ("already removed"); bila semua sudah terhapus, tidak ada yang disentuh (migrasi proyek aman); contoh yang tersisa sebagian tetap error drift. Setelah menghapus contoh, setup menambah `--keep-examples` ke script `lint:setup` proyek, sehingga modul proyek bernama sama dengan contoh (mis. `orders` sendiri) tidak dilaporkan sebagai drift | Setup ulang di salinan: "Example already removed" ×2, `drizzle/` tidak berubah |
| 2026-10-13 | Review 10 | **Temuan uji salinan:** tanpa vendor webhook, `src/core/openapi/api-docs.ts` jatuh ke 87.62% (< 90%) karena cabang skema webhook hanya teruji lewat demo-pay → test unit baru di `api-docs.test.ts` (vendor palsu: skema `<vendor>-webhook`, vendor tak terdaftar, partner 401/403, bearer, publik) | — |
| 2026-10-13 | Review 10 | Uji salinan repo (tanpa file env selain `.env.example`, git baru di `main`): `bun run setup demo-backend` → kedua contoh terhapus, `WEBHOOK_VENDORS = []`, `drizzle/` = satu `0000` (`auth_refresh_tokens`, `partner_credentials`, `record_changes`, `users`, `webhook_events`); `validate:full` hijau (770 test, termasuk `lint:setup` dan `lint:branch`), `verify:scaffold` hijau (8 gate), `build` hijau. Migrasi `0000` hasil regenerasi tidak diterapkan ke database (skema sama dengan migrasi 0000–0008 yang sudah terpasang di DB lokal) | Repo: `validate:full` 803 test, `verify:scaffold` hijau |
| 2026-10-13 | Review 10 | `.ls-lint.yml` disederhanakan menjadi 3 entri (`src`, `test`, `scripts`: `.dir` + `.ts: kebab-case`). Dibuktikan dengan probe: aturan direktori induk berlaku ke subdirektori, dan alternatif `regex:` lama tidak pernah dipakai (nama bertitik tidak dicek ls-lint). Chaos: `src/core/BadProbe.ts`, `scripts/BadProbe.ts`, `src/modules/Bad_Probe/`, `test/Bad_Probe/` tertangkap | — |
| 2026-10-13 | Review 10 | Docs basi diperbaiki: daftar varian `verify:scaffold` (AGENTS.md, SKILL `scaffold-module`, CONTRIBUTING) kini memuat partner + webhook; tabel varian README §4 + baris partner/webhook/adapter; `init-project` (nasib kedua contoh, isi `0000` yang benar, `partner-gateway` tetap) dan README Quick Start; snippet `bootstrap.md` (path, 7b webhook, limiter); `redis-cache.md`, Rule 13/14, panduan partner (429), CONTRIBUTING (429) untuk D29 | — |
| 2026-10-13 | Review 10 | **Penyimpangan 5.6 yang belum tercatat:** rencana menyebut kolom `received_at`, implementasi memakai `timestamps()` (`created_at` = saat diterima, + `updated_at`), sesuai konvensi tabel Record (`database.md` §6). Diterima apa adanya, tanpa migrasi | — |
| 2026-10-13 | Review 10 | Plan: 5.6 ✅ `9e1e166`; header; L4 (prefix webhook), L10 (langkah 6, D29), L11 (pohon); keputusan D29–D31. **Fase 7 disusun ulang (D31):** 7.2 baru = CLI scaffolder; "Finalisasi skills AI" → 7.3 (ditambah opsi riwayat git baru + `bun run prepare` di `init-project` / README); release check → 7.4 (ditambah smoke `bun run scaffold`). Rujukan "Step 7.3" pada baris log lama berarti 7.4; `COVERAGE_EXCLUSIONS` (`scripts/check-coverage.ts`) ikut diperbarui | Usulan user (prompt "Fase 7.2"), disetujui dengan penyesuaian: logika di satu library yang dipakai CLI dan `verify:scaffold`, flag `--singular`, anchor permanen, prettier hanya pada file baru |
| 2026-10-13 | Review 10 | **Chaos test** (7, semua tertangkap): `rejectionLimit` menghitung semua request; `rejectionLimit` tidak pernah memblokir; prefix partner kembali di bawah limit global; `rejectionLimit` tidak dipasang di prefix webhook; payload vendor kembali di-strip; vendor terdaftar tanpa route penerima; contoh tersisa sebagian (drift) → `lint:setup` gagal | Semua file dipulihkan, `git status` hanya berisi perubahan review |
| 2026-10-13 | Review 10 | Probe Redis asli (server port 3999, `RATE_LIMIT_MAX=3`, `RATE_LIMIT_WINDOW_SECONDS=8` lewat env proses): 3× `GET /partner/ping` tanpa tanda tangan → 401, ke-4 → 429; webhook dari IP yang sama → 429 (anggaran penolakan bersama); `/` tetap memakai limit global (`RateLimit-Limit: 3`); setelah jendela habis → 401 lagi. Kunci kedaluwarsa sendiri (TTL 8 detik) | OK |
| 2026-10-13 | Review 10 | ✅ di-commit (`f6f8ee4`) dan di-merge ke `main` | — |
| 2026-10-13 | 6.1 | Runner `scripts/test-integration.ts` (`bun run test:int [filter] [--keep-db]`): setiap run membuat database sekali pakai `<nama>_it_<run>` (diberi `COMMENT` penanda), menjalankan `bun test --preload test/integration/setup.ts <file>`, lalu `DROP DATABASE … WITH (FORCE)`; key Redis ber-prefix `<APP_NAME>:int-test:<run>` dihapus satu per satu (SCAN + DEL, tanpa `FLUSH*`). Database sisa run yang terputus (> 1 jam) dihapus run berikutnya, **hanya** yang membawa komentar penanda. **Penyimpangan langkah 1**: tanpa `TEST_*`, runner memakai `DATABASE_URL` / `REDIS_*` — hanya bila menunjuk mesin ini (localhost); server jauh ditolak, `NODE_ENV=production` ditolak. Database pengembangan tidak pernah ditulisi (hanya `CREATE`/`DROP DATABASE` dari koneksinya) | Tanpa duplikasi kredensial di file env lokal |
| 2026-10-13 | 6.1 | Preload `test/integration/setup.ts` (setelah preload hermetik): menolak database yang bukan `*_it_<run>`, mengarahkan `DATABASE_URL` / `REDIS_*` ke target run, menjalankan **migrasi asli** (`drizzle/`, migrator drizzle), membuat tabel fixture generik (`test_orders`, `test_order_lines`, `test_events` dari `test/helpers/repository-fixtures.ts`; DDL dari `drizzle-kit/api` = selisih schema → schema + fixture), menyambungkan Redis, dan menutup kedua koneksi lewat `afterAll` global (tanpa itu `bun test` tidak pernah keluar). File `*.int.ts` tidak cocok pola `bun test`, jadi tidak ikut unit suite maupun coverage gate; knip: `test/integration/*.ts` sebagai entry | — |
| 2026-10-13 | 6.1 | Skenario (22 test, 4 file): **data layer** — update + audit (actor, request ID, kolom redacted), rollback transaksi membatalkan update dan audit, soft delete/restore + audit, 4 update paralel pada satu baris berantai utuh (row lock), `syncForParent` (update/insert/delete, audit di bawah header, header tersentuh), rollback seluruh sync bila satu item asing, detail header terhapus tersembunyi, `activeUniqueIndex` (`users.email`: duplikat hidup → `isUniqueViolation`, boleh lagi setelah soft delete), append-only berurutan; **Redis** — versi ≥ 2.6 + prefix run, 50 `increment` paralel tepat 1..50 dengan satu TTL, jendela tidak diperpanjang, 20 `setIfAbsent` paralel tepat satu menang, `getOrSet` + negative cache, fail-open saat koneksi putus lalu pulih; **auth** lewat `createApp()` — login dengan hash tersimpan + `/auth/me`, lock setelah `AUTH_LOGIN_MAX_ATTEMPTS` (counter Redis), rotasi + reuse mencabut seluruh family (dicek di tabel), dua refresh bersamaan dengan token sama → tepat satu 200; **partner** lewat `createApp()` — signed ping 200, nonce sama → 401 replay, `rate_limit_rpm` sendiri → 429, deactivate / rotasi API key berlaku seketika (cache dibuang) | Lokal: PostgreSQL 17.6 + Redis 3.0 (tertua yang dipakai), 22/22, ±3 detik |
| 2026-10-13 | 6.1 | **Temuan (Bun 1.3.0):** `expect(promise).rejects` / `.resolves` menunggu promise dengan cara yang bisa menghentikan I/O socket — transaksi tertahan `idle in transaction` (dibuktikan lewat `pg_stat_activity`) dan test timeout, sedangkan `try/catch` biasa lancar. Helper `rejectionOf()` (`test/helpers/integration.ts`) dipakai di suite ini; aturan ditulis di `testing.md` §7 | Bukan bug aplikasi |
| 2026-10-13 | 6.1 | **Temuan (bug kecil):** tepat setelah koneksi Redis putus, `status` ioredis masih `ready` padahal socket sudah tidak bisa ditulis → `closeRedisClient()` melempar error dari `QUIT` (shutdown gagal). Perbaikan: `QUIT` yang ditolak jatuh ke `disconnect()` + log `warn`; test unit baru | — |
| 2026-10-13 | 6.1 | **Temuan saat membersihkan DB sisa:** pola `LIKE '%\_it\_%'` di skrip pembersih sementara ikut mencocokkan database lain di server lokal user; regex nama menahannya, **tidak ada yang tersentuh**. Pelajaran diterapkan di runner: pembersihan basi memilih lewat komentar penanda, bukan nama (`_` adalah wildcard `LIKE`, dan nama proyek bisa mirip). Dibuktikan: DB tiruan `<nama>_it_aaaaaaaa` tanpa penanda selamat, DB lama bertanda dihapus | — |
| 2026-10-13 | 6.1 | CI: job `integration` (service container PostgreSQL 16 + Redis 7, `TEST_DATABASE_URL` / `TEST_REDIS_*`) — **belum pernah jalan** (belum ada remote GitHub). Kombinasi versi: CI = terbaru, lokal = Redis 3.0 tertua. **Penyimpangan langkah 1**: `docker-compose.test.yml` (opsional) tidak dibuat — CI memakai service container, lokal memakai layanan native | — |
| 2026-10-13 | 6.1 | **Chaos test** (7, semua tertangkap): preload menolak database bukan `*_it_<run>`; preload menolak jalan di luar runner; runner menolak fallback `DATABASE_URL` jauh; runner menolak `NODE_ENV=production`; `FOR UPDATE` dihapus dari `lockWhere` → suite data layer gagal; nonce tidak pernah ditolak → suite partner gagal; `closeRedisClient` kembali melempar → test unit gagal | Semua file dipulihkan |
| 2026-10-13 | 6.1 | Dokumen: `testing.md` §7 baru (cara menjalankan, layanan, siklus database sekali pakai, preload, cara menulis test, larangan `.rejects`), project-standards §6 + pohon `scripts/`, `AGENTS.md` (hermetic tests + `test:int`), CONTRIBUTING (tabel perintah), README (quality gates), `.env.example` (blok `TEST_*` sebagai komentar), komentar preload hermetik | — |
| 2026-10-13 | 6.1 | **Pengetatan (diskusi user soal deploy ke VPS):** fallback ke `DATABASE_URL` / `REDIS_*` kini juga mensyaratkan `NODE_ENV` = `development` atau `test`. Sebelumnya hanya "host = localhost" — di VPS yang PostgreSQL-nya terpasang di mesin yang sama dan `NODE_ENV`-nya lupa diisi, runner akan membuat/menghapus database `*_it_*` di server production. Suite ini tidak pernah dijalankan di server; CI memakai `TEST_*` + service container | Chaos: `NODE_ENV` kosong dan `staging` → ditolak; `development` tetap jalan |
| 2026-10-13 | 6.1 | ✅ di-commit (`f77a229`) dan di-merge ke `main` — **Fase 6 selesai** | — |
| 2026-10-13 | Review 11 | Review ulang Fase 6 + cek silang skills ↔ rules ↔ docs ↔ ESLint ↔ dependency-cruiser ↔ test ↔ plan atas permintaan user (agar jalur agentic AI dan manual tertahan gate yang sama): 10 temuan, semua diperbaiki di branch `fix/review-phase-6`. Konsisten tanpa perubahan: setiap nama rule ESLint/depcruise yang dikutip docs ada; wiring `app.ts` ↔ `bootstrap.md`; wrapper skill `.claude`; hook husky ↔ diagram | — |
| 2026-10-13 | Review 11 | **Aturan suite integrasi ditegakkan** (sebelumnya hanya tertulis di `testing.md` §7): grup ESLint `INTEGRATION_TEST_RULES` untuk `test/integration/**` menolak `expect(promise).rejects` / `.resolves` (terbukti menahan transaksi di Bun 1.3.0) dan `spyOn` / `mock` (suite ini menguji jalur asli). `test/structure.test.ts`: `*.int.ts` hanya langsung di `test/integration/`, folder itu hanya berisi `<area>.int.ts` + `setup.ts` | Chaos: probe dengan `.resolves`, `.rejects`, `spyOn`, `mock` → 4 error ESLint; lihat baris chaos |
| 2026-10-13 | Review 11 | **Runner `test:int`**: Redis kini diambil utuh dari satu sisi — `TEST_REDIS_*` begitu `TEST_REDIS_HOST` diisi, selain itu `REDIS_*` (mesin developer, localhost). Sebelumnya port/password/DB bisa diambil dari `REDIS_*` lokal sementara host dari `TEST_REDIS_HOST`, sehingga password Redis lokal bisa terkirim ke server uji lain. Baru: `--dry-run` mencetak target (database + sumber, Redis host/port/db, password `set`/`empty`, prefix, file) tanpa menyentuh apa pun | Dibuktikan: `TEST_REDIS_HOST=10.9.9.9` → `from TEST_REDIS_*`, password `empty` (tidak mewarisi lokal) |
| 2026-10-13 | Review 11 | **Penjaga dokumen baru** `test/docs-sync.test.ts`: CONTRIBUTING.md (pohon kanonik + tabel perintah) wajib menyebut setiap file `scripts/*.ts` dan `scripts/lib/*`, setiap folder `test/`, setiap helper, setiap area integrasi, setiap file test di akar `test/` (e2e per nama), setiap folder `src/modules/*`, dan setiap script `package.json` (perintah persis, bukan prefix). Saat dipasang ia menemukan: `scripts/test-integration.ts`, `test/integration/` + area `data-layer`, helper `auth-fakes.ts` / `integration.ts` / `sql-recorder.test.ts`, `agent-skills.test.ts`, dan perintah `dev`, `start`, `build`, `format`, `format:check`, `validate`, `db:migrate`, `db:studio` — semuanya kini tercantum. Akar masalah drift yang muncul di Review 5, 7, 9, 10 | — |
| 2026-10-13 | Review 11 | Docs: diagram CI CONTRIBUTING §1 (job `integration`; `test:int` sengaja tidak di pre-push), kalimat basi "integration test memakai `TEST_*` sendiri", deskripsi `lint:setup` (`EXAMPLE_MODULES`, proyek pasca-setup), project-standards §6 (CI `integration`) + pohon `test/` + tabel referensi, `testing.md` (istilah e2e, kapan menambah `*.int.ts`, penegak, `--dry-run`, Redis satu sisi), skill `scaffold-module` Step 12 (kapan test integrasi), skill `generate-commit-text` (scope yang dipakai: `partner-credentials`, `partner`, `partner-auth`, `webhooks`, `conventions`, `scaffold`, `integration`, `review`), `AGENTS.md` (aturan kapan `test:int` wajib + penegak baru). Plan: DoD §14.1 (`test:int`), L1 (`TEST_*`), L8 (job `integration`) | Penegakan scope commit (`scope-enum`) tetap dijadwalkan di 7.3 |
| 2026-10-13 | Review 11 | **Chaos test** (8 + probe ESLint, semua tertangkap): `*.test.ts` di `test/integration/`; `*.int.ts` di luar `test/integration/`; script baru tanpa entri CONTRIBUTING; script `package.json` baru tanpa baris di tabel perintah; folder modul tidak di pohon; helper dihapus dari pohon; area integrasi hilang dari baris `integration/`; grup `INTEGRATION_TEST_RULES` dicabut (probe `.rejects` tidak lagi ditolak). **Temuan saat chaos:** pencocokan substring awal meloloskan helper `integration.ts` (cocok di dalam `test-integration.ts`) → penjaga kini mencocokkan nama utuh; area integrasi dicek pada baris `integration/` di pohon. Gate: `validate:full` 809 test, `test:int` 22/22, `verify:scaffold` 8/8, `build` | Semua file dipulihkan |
| 2026-10-13 | Review 11 | ✅ di-commit (`bbe36d9`) dan di-merge ke `main` | — |
| 2026-10-13 | 7.1 | `ARCHITECTURE.md` baru (generik, Bun/Hono): struktur mengikuti blueprint asal — apa & mengapa per area (pilar, stack, lapisan, pipeline `createApp()`, kontrak HTTP, waktu, tiga kanal inbound, data layer, cache, platform, outbound, testing, gate, governance AI) + rujukan ke sumber detail, tanpa salinan kode. Blueprint NestJS dipindah ke `docs/archive/ARCHITECTURE_BLUEPRINT_FROM_NESTJS.md` (`git mv`, isi tidak diubah) | — |
| 2026-10-13 | 7.1 | **Indeks aturan R01–R72** (`ARCHITECTURE.md` §12): setiap aturan satu baris dengan label penegaknya; teks bagian lain merujuk ID-nya. **Penyimpangan dari langkah**: label dibuat bernama agar bisa dicek mesin — `[test:<nama>]` (file `<nama>.test.ts` / `<nama>.int.ts`), `[ci:<job>]`, ditambah `[script:<nama>]` (script `package.json`: coverage gate, knip, `lint:setup`, `verify:scaffold`, …) dan `[hook:<file>]` (Husky / hook `.env` Claude Code); `[test]` / `[ci]` polos tidak dipakai. Aturan yang belum bisa dicek mesin ditandai `[review-only]` + alasannya (transformer, versi API, `this.scoped()`, key `CACHE_KEYS`, idempotensi modul tulisan tangan, sesi DB UTC) | — |
| 2026-10-13 | 7.1 | **Penjaga baru** di `test/docs-sync.test.ts`: (1) setiap label di `ARCHITECTURE.md`, CONTRIBUTING, `AGENTS.md`, skill `project-standards` menunjuk grup/rule ESLint, rule depcruise, file test, script, job CI, atau file hook yang ada; (2) ID R berurutan tanpa celah / duplikat; (3) setiap baris punya ≥ 1 label; (4) setiap ID yang dirujuk teks ada di indeks; (5) **setiap rule dependency-cruiser dan setiap grup ESLint (`*_RULES` / `*_PATTERN(S)`, kecuali grup komposit `SOURCE_SYNTAX_RULES` / `MODULE_DATA_RULES`) + `local/inbound-channel` punya baris** — aturan baru tanpa penjelasan gagal; (6) README ≤ 150 baris. Saat dipasang ia menemukan `no-test-in-src` belum terindeks → ditambahkan ke R04 | — |
| 2026-10-13 | 7.1 | Sinkronisasi docs: README ditulis ulang (137 baris: fitur ringkas, pohon, quickstart, pola modul, gate, indeks dokumen; baris `orders/` untuk `EXAMPLE_MODULES` tetap persis). CONTRIBUTING: rujukan ke indeks aturan, anchor daftar isi §8 rusak, pohon `core/` (`context/`, `i18n/`, isi `dto/` & `errors/`), kalimat `process.env` (di `src/` hanya `env-source.ts`; `drizzle.config.ts`, `scripts/`, test di luar aplikasi), varian scaffold partner/webhook di §10, contoh basi `domainSchema.table` → `appTable` (juga di skill `project-standards`), type commit `build` / `ci` / `revert` + aturan header & nama branch di §12, kolom penegak §5.3 memakai label, daftar dokumen root. `AGENTS.md` + skill `project-standards`: rujukan ke indeks dan kewajiban menambah baris untuk aturan baru | — |
| 2026-10-13 | 7.1 | **Temuan (bug kecil di skill `init-project` §6):** perintah cek sisa identitas mengecualikan `ARCHITECTURE_BLUEPRINT_FROM_NESTJS.md` (yang tidak berisi `bun-hono-starter` / `starter_db`), padahal hit yang selalu muncul berasal dari skill itu sendiri dan `docs/plans/` — perintah "expect no output" tidak pernah bisa kosong. Pathspec kini `':!.agents/skills/init-project/' ':!docs/'`; dibuktikan: sisa hit hanya file yang terdaftar di `IDENTITY_RULES` | — |
| 2026-10-13 | 7.1 | **Chaos test** (12, semua tertangkap): label grup ESLint yang tidak ada; label test yang tidak ada; typo job CI; file hook yang tidak ada; `[depcruise]` tanpa target; typo label di CONTRIBUTING; baris indeks dihapus (celah ID); baris tanpa penegak; teks merujuk `R99`; rule depcruise tidak terindeks; grup ESLint tidak terindeks; README > 150 baris | Semua file dipulihkan |
| 2026-10-13 | 7.1 | ✅ di-commit (`8c08e0a`) dan di-merge ke `main` | — |
| 2026-10-13 | 7.2 (baru) | **Keputusan D32 (diskusi user setelah 7.1):** CONTRIBUTING terlalu besar (712 baris) dan standar ditulis berulang di CONTRIBUTING (ID), skill `project-standards` + `references/` (EN), `AGENTS.md` (EN) dan `ARCHITECTURE.md` — contoh: default-deny tertulis 5 kali. Perubahan harus mengedit semuanya; drift ditemukan di Review 5, 7, 9, 10, 11. User: "tetap hanya bersumber dari 1 file terpercaya … manual code ataupun agentic skills/rules", bahasa Inggris tidak masalah. **Fase 7 disusun ulang**: step baru 7.2 Docs SSOT; CLI scaffolder → 7.3, skills → 7.4, release → 7.5 | Bahasa: semua dokumen standar EN; README, plan, panduan untuk pihak luar tetap ID |
| 2026-10-13 | 7.2 | `docs/standards/` = satu-satunya sumber standar, satu file per topik (19): `git mv` 10 file `project-standards/references/*.md` (riwayat terjaga; `redis-cache.md` → `cache.md`), ditambah `structure.md` (pohon kanonik + batas lapisan, dari CONTRIBUTING §2 + skill §2–3), `quality-gates.md` (diagram gate, coverage, `eslint-disable`, komposisi grup, tabel perintah), `http-contract.md` (CONTRIBUTING §3–4.2 + skill Rule 1/2/4/5/6/10 + §5), `auth-and-inbound.md` (CONTRIBUTING §4.3 + skill Rule 13–14 + bagian webhook dari `integrations.md`), `configuration.md`, `naming.md`, `git-workflow.md` (+ tabel type/scope dari skill `generate-commit-text`), `new-module.md` (pilihan varian + urutan kerja; template kode tetap di skill `scaffold-module`), `documentation.md` (aturan SSOT itu sendiri). Isi digabung, bukan ditulis ulang; bagian yang berbeda antar sumber diselaraskan ke kode | — |
| 2026-10-13 | 7.2 | Router: `CONTRIBUTING.md` (712 → 47 baris, EN: langkah awal, tabel topik, alur perubahan), `.agents/AGENTS.md` (81 → 42: bacaan wajib, rencana kerja, database lokal, kebijakan `.env` — kini sumber tunggalnya; 16 invariant dihapus karena = indeks `ARCHITECTURE.md` §12), skill `project-standards` (420 → 36: tabel "menyentuh apa → baca file apa"), `env-protection` (→ menunjuk `AGENTS.md`), `generate-commit-text` (langkah saja; format di `git-workflow.md` §2), prosa skill `scaffold-module` (aturan diganti rujukan; kode template tidak diubah — parser `verify:scaffold` hanya membaca heading `### Step N: … (\`src/…\`)` + blok kode). `ARCHITECTURE.md` diterjemahkan ke EN, rujukan ke `docs/standards/`, aturan baru **R73** (SSOT dokumen). README (137 → 72 baris): quickstart + tautan, tanpa pohon / tabel template / daftar gate | — |
| 2026-10-13 | 7.2 | **Temuan:** `bootstrap.md` menyalin `src/app.ts` dan `src/index.ts` hampir utuh (±180 baris kode) — salinan seperti itu pasti drift; kini ringkasan + "source of truth: `src/app.ts`", tabel urutan pipeline tetap. `openapi.md` §6 masih menyebut header partner "belum didukung (fase 5)" padahal sudah didokumentasikan sejak 5.3 → dihapus. Rujukan lama di kode diperbarui: pesan ESLint (`RAW_QUERY_RULES`, `REPOSITORY_SYNTAX_RULES`), komentar `access-token-cache.ts`, `base.repository.ts`, `columns.ts`, template `integration.md`. `EXAMPLE_MODULES` (`scripts/setup.ts`): baris pohon contoh kini di `structure.md` (README dan skill tidak lagi punya pohon) | — |
| 2026-10-13 | 7.2 | **Penjaga baru** (`test/docs-sync.test.ts`, 16 test): pohon & perintah dibaca dari `structure.md` / `quality-gates.md`; label penegak dicek di semua file `docs/standards/` juga; setiap tautan relatif **dan #anchor** (slug GitHub) di dokumen yang dipelihara (README, CONTRIBUTING, ARCHITECTURE, CLAUDE, `docs/*.md`, `docs/standards/`, `.agents/`, `.claude/`) resolve; setiap path `docs/standards/….md` / `.agents/….md` yang disebut ada; setiap file standar tercantum di CONTRIBUTING dan router skill; router tanpa blok kode dan dalam batas baris (AGENTS 60, CONTRIBUTING 70, `project-standards` 45, `env-protection` 15); `project-standards/references/` tidak boleh ada lagi; README ≤ 150 | Plan dan arsip tidak dicek (riwayat) |
| 2026-10-13 | 7.2 | ✅ di-commit (`0379e66`) dan di-merge ke `main` | — |
| 2026-10-13 | 7.3 | **CLI `bun run scaffold`** (D31): `module <jamak> [--variant=standalone\|header-detail\|record]`, `partner <jamak>`, `webhook <jamak> --vendor=<vendor>`, `integration <vendor>`; opsi `--singular`, `--institution`, `--dry-run`. Mesin di `scripts/lib/scaffold.ts` (murni: parser template `materialize`/`fill`/`replaceAnchor` dipindah dari `verify-scaffold.ts`, turunan nama, rencana file + edit + langkah berikutnya); `scripts/scaffold.ts` menerapkannya **all-or-nothing** (semua edit dihitung di memori dulu; anchor hilang / file sudah ada / modul bernama vendor (D26) → berhenti sebelum menulis), lalu prettier hanya pada file `.ts` yang dibuat/diubah, lalu mencetak langkah berikutnya (field domain, `bun run db:generate`, env var vendor, `allowed_routes`, alasan `APPEND_ONLY_TABLES`); tidak pernah menjalankan migrasi | Template tetap satu-satunya sumber kode: tidak ada string template di script |
| 2026-10-13 | 7.3 | **Anchor permanen**: tiga penanda komentar di `src/app.ts` (`// scaffold:imports`, `// scaffold:webhook-routes`, `// scaffold:v1-routes`) — baris baru masuk tepat di atasnya; `WEBHOOK_VENDORS` lewat deklarasinya (kosong atau berisi), registry & `APPEND_ONLY_TABLES` lewat deklarasinya, barrel config/schema ditambah di akhir. Sebelumnya `verify:scaffold` menempel ke baris `users` dan, untuk modul biasa, memakai `.replace()` yang diam-diam tidak berbuat apa-apa bila baris itu berubah. Bertahan setelah `bun run setup` (contoh dihapus, penanda tetap) | — |
| 2026-10-13 | 7.3 | **Penyimpangan / tambahan dari langkah**: (1) CLI juga menambah baris modul ke pohon kanonik `docs/standards/structure.md` (di atas entri `users/` yang permanen) — ditemukan saat uji pasca-setup: modul hasil CLI membuat `docs-sync` gagal sampai developer ingat menambah baris pohon; (2) env var vendor **dicetak** sebagai langkah berikutnya, `.env.example` tidak diedit (nilai dan komentar butuh keputusan manusia); (3) singular diturunkan dengan aturan sederhana (`ies→y`, `(ss\|x\|z\|ch\|sh\|us)es→…`, `s→`), nama yang tampak tunggal (`status`, `analysis`) ditolak dengan saran `--singular`; tebakan salah yang tak terdeteksi (`news` → `new`) terlihat karena label rencana mencetak singular-nya (`--dry-run`) | — |
| 2026-10-13 | 7.3 | **`verify:scaffold` memakai CLI**: menjalankan `bun scripts/scaffold.ts` untuk keenam varian (nama probe sama), lalu `prettier --check` (CLI harus sudah memformat), tsc, ESLint, ls-lint, depcruise, knip, test hasil generate + konvensi schema + `test/structure.test.ts` + **`test/docs-sync.test.ts`**, dan request nyata; daftar file yang dibersihkan diambil dari rencana library yang sama, file bersama (+ `structure.md`) dipulihkan byte demi byte. Unit test library `scripts/lib/scaffold.test.ts` (42 test: aturan singular, turunan nama, `fill` dengan `$`, `materialize` CRLF, anchor hilang, rencana tiap jenis terhadap template asli, parser argumen); label `[test:<nama>]` di `docs-sync` kini juga membaca `scripts/`. R67 diperluas (CLI + anchor) | — |
| 2026-10-13 | 7.3 | **Uji acceptance**: (a) repo: `bun run scaffold module news` → tsc, ESLint, test modul + konvensi + struktur hijau, dihapus → `git status` bersih; (b) salinan repo → `bun run setup demo-backend` (contoh terhapus) → `verify:scaffold` 14/14 PASS → `bun run scaffold module products` → tsc, ESLint, test modul + konvensi + struktur + docs-sync + default-deny + OpenAPI: 61/61 | Salinan dihapus (junction `node_modules` dilepas dulu) |
| 2026-10-13 | 7.3 | **Chaos test** (6, semua tertangkap, `git status` tidak berubah): penanda `scaffold:v1-routes` dihapus → CLI berhenti "anchor not found", tidak ada file ditulis; modul bernama vendor (`jsonplaceholder`) → ditolak (D26); modul yang sudah ada (`users`) → ditolak; template rusak (`BaseRepositoryy`) → `verify:scaffold` FAIL di tsc, semua dipulihkan; CLI tidak lagi mendaftarkan route → `verify:scaffold` gagal, dipulihkan; aturan singular rusak → unit test gagal | — |
| 2026-10-13 | 7.3 | **Diskusi user ("bagaimana jika `module product`?")**: nama tunggal ditolak sejak awal (template memakai bentuk jamak dan tunggal; keduanya sama = identifier bertabrakan). Pilihan user (c): tetap aturan akhiran sederhana, tanpa kamus / dependency, tetapi **pesan penolakan menjelaskan alasannya dan memberi perintah lengkap yang bisa disalin** (`"product" does not look plural … Did you mean "products"?  →  bun run scaffold module products`, kind dan `--variant` / `--vendor` dipertahankan; `pluralGuess()`); `--dry-run` kini juga mencetak langkah berikutnya; label singular dalam bentuk kebab. Dokumentasi `docs/standards/new-module.md` §2 diperluas: semua perintah + opsi, contoh output nyata, tabel nama → identifier, aturan singular + contoh salah tebak (`news`, `series`, `analyses`) dan perbaikannya, tabel penolakan → tindakan, cara membatalkan; setiap contoh dijalankan ulang untuk dibuktikan. 51 test library | — |
| 2026-10-13 | 7.3 | **Temuan user (`bun run scaffold module products` → `bun run test:cov` gagal)**: controller 39%, service 15%, transformer 25%, messages 86% < 90%. Akar masalah: (1) template standalone, header-detail dan record hanya berisi **test repository**; Step "Create Remaining Tests" hanya *menyuruh* menulis test service / transformer / controller tanpa kodenya (varian partner & webhook sudah lengkap) — selama template disalin manual celah ini tertutup oleh penulisnya, CLI memperlihatkannya; (2) `verify:scaffold` tidak menjalankan gate coverage, sehingga CI tidak pernah menangkapnya. **Koreksi laporan 7.3 sebelumnya**: klaim "kode hasil generate lolos semua gate" tidak benar untuk gate coverage | Temuan saat review user |
| 2026-10-13 | 7.3 | **Perbaikan**: ketiga template mendapat langkah test berkode — service (setiap cabang termasuk not-found, repository palsu), transformer (field = schema response), controller lewat routes-nya (Hono + request context + error handler, service di-*spy*: status, snake_case di wire, meta paginasi, 400 validasi, 404) — hasil generate 100% per file. `verify:scaffold` kini juga menjalankan **`bun run test:cov` penuh dengan modul hasil generate** (perintah yang dijalankan developer setelah scaffold): suite lengkap + gate coverage per file. Gate itu langsung menemukan **temuan kedua**: `columns.test.ts` mengunci `APPEND_ONLY_TABLES` = `[record_changes, webhook_events]`, jadi setiap proyek yang menambah tabel record mendapat test merah → kini `arrayContaining` (penjaga sebenarnya — entri = tabel ekspor ber-PK berurutan, tanpa entri basi — tetap di `schema-conventions.test.ts`). Docs: `new-module.md` §2.2 / §2.5, `quality-gates.md`, R67 | — |
| 2026-10-13 | 7.3 | **Chaos test** (2, tertangkap, `git status` tidak berubah): langkah test controller dihapus dari template standalone → `verify:scaffold` FAIL di `test:cov` (`scaffold-probes.controller.ts: lines 33.33% < 90%`); langkah test service dihapus dari template record → FAIL (`probe-events.service.ts: lines 28.57% < 90%`) | — |
| 2026-10-13 | 7.3 | **Diskusi user (header-detail dengan nama khusus)**: `--variant=header-detail` memakai nama header dari argumen, sedangkan detail selalu `<singular>_items` (kata `item` tertulis langsung di template); nama lain (`invoice_lines`, `class_members`) saat ini hanya bisa lewat rename manual setelah generate. Keputusan user: opsi `--detail=<jamak>` masuk plan → backlog L12 (tidak dikerjakan di 7.3) | — |
| 2026-10-13 | 7.3 | **Keputusan user: detail ditentukan sejak modul dibuat** — tidak ada `bun run scaffold detail <header> <nama>` (diusulkan: file terpisah `<modul>-<detail>.*.ts`). Alasan: header-detail adalah keputusan desain tabel; header yang sudah kompleks punya aturan bisnis (service, transaksi, cache, test) yang harus disatukan dengan detail, jadi dikerjakan manual atau lewat AI agent dengan template `header-detail.md` sebagai rujukan; satu pola, bukan dua. Diterapkan: `module <nama> --variant=header-detail` pada modul yang sudah ada ditolak dengan rujukan ke `docs/standards/new-module.md` §2.6 (langkah manual). Catatan diskusi git: file hasil CLI tidak pernah bentrok; baris registrasi di file bersama (`app.ts`, barrel, pohon `structure.md`) bentrok bila dua branch men-scaffold paralel (dibuktikan di repo uji; penyelesaian = ambil keduanya) — `merge=union` untuk barrel dan `structure.md` terbukti menggabungkan otomatis, tidak dipakai untuk `app.ts` / registry (kode); belum diterapkan | — |
| 2026-10-13 | 7.3 | **`--detail=<jamak>` dikerjakan di 7.3** (keputusan user, item dipindah dari backlog L12): `bun run scaffold module classes --variant=header-detail --detail=members` → tabel `class_members` (FK `class_id`, index `class_members_class_idx`), `ClassMember`, `ClassMembersRepository`, `addMember` … `syncMembers`, `MEMBER_CREATED`, route `/classes/:id/members[/:childId]`; `--detail-singular` untuk bentuk tak beraturan; tabel detail selalu `<header_singular>_<detail>`. Template: 255 kemunculan `item` di blok kode diganti 8 placeholder detail (route kebab, sufiks tabel snake, variabel camel, tipe/method Pascal, konstanta UPPER), key body sync tetap snake_case di wire. **Bukti kompatibilitas**: keluaran default (`items`) dibandingkan dengan snapshot sebelum perubahan untuk `orders`, `probe-orders`, `flight-schedules` — 36 file identik byte demi byte. `verify:scaffold` menjalankan header-detail dua kali (default + `--detail=line-members`, multi-kata) lewat semua gate termasuk coverage; live check memvalidasi body `line_members` (400). Test library 58 (turunan nama detail, rencana, tidak ada sisa kata `item`, penolakan dengan perintah lengkap, parser) | — |
| 2026-10-13 | 7.3 | ✅ Di-commit (`9558db5`) dan di-merge ke `main` | — |
| 2026-10-13 | 7.3b | **Diskusi user (sebelum 7.4): anak bertahap dengan halaman sendiri.** Kasus umum: parent dibuat lebih dulu, lalu beberapa jenis anak diisi bertahap, masing-masing punya halaman FE sendiri (list / get mandiri) tetapi selalu dicek terhadap parent: ada, valid, milik parent itu, belum dihapus. `header-detail` tidak cocok (hanya `/:id/<detail>`, satu detail, hard delete, bagian form header). Opsi folder yang dibahas: file berkualifier di folder header (folder membengkak), subfolder per detail (perlu ubah aturan struktur), modul sejajar (dipilih — aman karena cek parent lewat tabel schema, bukan import modul). Keputusan user: **D33** (varian `--parent`, parent dihapus = anak dianggap terhapus, opsi (a)); hook `assertParentWritable` masuk 7.3b; `header-detail` banyak detail (subfolder) dan nomor dokumen otomatis → backlog L12. Step baru **7.3b** disisipkan sebelum 7.4 | Penambahan scope |
| 2026-10-13 | 7.3b | **Keputusan user: section 1:1 masuk 7.3b** (`--parent=<parent> --one`): satu parent paling banyak satu anak hidup (contoh umum: pengajuan → satu data penanggung jawab; user → satu profil), dijaga `activeUniqueIndex` pada kolom parent, endpoint `GET` / `PUT /<parent>/:id/<section>` (upsert). Ditegaskan: relasi parent-child **bertahap** — parent dibuat dulu sebagai standalone, anak 1:1 / 1:N ditambah belakangan dengan perintah `scaffold` baru, modul parent tidak diedit. Batas: mengubah tabel standalone yang sudah ada menjadi anak (menambah `parent_id`) = migrasi manual, bukan CLI | — |
| 2026-10-13 | 7.3b | **Keputusan user (routing + keamanan)**: route dependent diganti **shallow nesting** — list / create di bawah parent (`/<parent>/:<parent>Id/<jamak>`), get / update / delete / restore datar (`/<jamak>/:id`); 1:1 = segmen tunggal di bawah parent (`GET` / `PUT` / `DELETE`) + get / restore datar. Parent selalu dari path (bukan body), list lintas parent tidak di-generate (rencana awal `?<parent>_id=` + id di body dibatalkan: dua jalur untuk hal yang sama, dan list global butuh filter kepemilikan). Hook baru `parentScope()` di `DependentRepository`: kondisi kepemilikan parent sekali per modul, berlaku di setiap read & write anak, parent di luar scope = 404. CLI menolak segmen yang bentrok dengan route parent. Probe Hono 4.13: parameter di path mount terbaca handler dan tercatat utuh di `app.routes` | — |
| 2026-10-13 | 7.3b | **`DependentRepository`** (`src/database/dependent.repository.ts`, diekspor barrel `src/database`): `findById`, `findPageForParent`, `countForParent`, `findOneForParent`, `createForParent`, `upsertForParent`, `updateById`, `softDeleteById`, `softDeleteForParent`, `restoreById`. Read lewat `scoped()` = `deleted_at IS NULL` + `EXISTS (parent hidup AND parentScope())` (subquery berkorelasi, dibuktikan lewat perekam SQL). Write: baca `parent_id` baris tanpa kunci (tidak pernah berubah) → kunci parent → `assertParentWritable(parent)` → kunci baris `FOR UPDATE`. **Keputusan implementasi**: parent dikunci `FOR SHARE` untuk write biasa (beberapa anak satu parent bisa ditulis paralel, tetapi soft delete parent menunggu) dan `FOR UPDATE` untuk `upsertForParent` (upsert 1:1 paralel mengantre → satu baris, berikutnya update); `updated_at` parent **tidak** disentuh (berbeda dari `ChildRepository`: anak dependent adalah resource sendiri). Parent tak terlihat = `NotFoundError` untuk method per parent, `null` untuk method per id. Create tidak diaudit (sama dengan `BaseRepository`) | — |
| 2026-10-13 | 7.3b | **Hook `assertParentWritable()` juga di `ChildRepository`** (keputusan user): penguncian header untuk write kini memilih seluruh baris header (sebelumnya hanya `id`) agar hook menerima header lengkap; read tetap `select "id"`. Test lama disesuaikan (`LOCKED_PARENT`) + test baru: hook menolak keempat write sebelum SQL detail, tidak dipanggil oleh read | — |
| 2026-10-13 | 7.3b | Test: `src/database/dependent.repository.test.ts` (27, perekam SQL + fixture baru `test_order_notes` 1:N dan `test_order_shipments` 1:1 di `test/helpers/repository-fixtures.ts`, ikut dibuat preload integrasi); `test/integration/data-layer.int.ts` +7 di PostgreSQL asli: parent dihapus menyembunyikan anak tanpa mengubah `deleted_at`-nya dan restore hanya memunculkan anak yang hidup; audit di bawah parent + re-parenting diabaikan; `parentScope()` → 404 untuk read & write; `assertParentWritable()` menolak tanpa jejak; 4 upsert 1:1 paralel → tepat satu baris hidup; setelah hapus boleh baris baru, restore yang lama → unique violation; tulis anak + hapus parent paralel tanpa deadlock | `test:int` 29/29 (PostgreSQL 17.6 + Redis 3.0 lokal) |
| 2026-10-13 | 7.3b | **CLI**: `bun run scaffold module <jamak> --parent=<parent> [--one] [--parent-singular=<nama>]`; template `references/dependent.md` (1:N) dan `references/dependent-one.md` (1:1, diputuskan dua file: route, controller, service dan test berbeda nyata); placeholder baru `<parent-name>`, `<parentCamelPlural>`, `<parent_snake_plural>`, `<parentCamelSingular>`, `<ParentPascalSingular>`, `<parent_snake_singular>`, `<name-singular>`. Registrasi: schema barrel, dua `v1.route(...)` di atas `// scaffold:v1-routes` (router bertingkat + router datar dari satu file `<name>.routes.ts`), pohon `structure.md` — **tidak ada file parent yang diedit**. Penolakan (`scripts/scaffold.ts`, dibaca dari file): parent tidak ada; tabel parent tidak diekspor dengan nama jamaknya; parent tanpa `softDelete()`; parent sendiri dependent (maks 2 level); segmen route sudah dipakai (`'/:id/<segmen>'` di routes parent atau mount yang sama di `app.ts`); `--one` tanpa `--parent`; `--parent` dengan `--variant`. Pesan penolakan nama parent menyebut `--parent-singular` (sekaligus: penolakan nama detail kini menyebut `--detail-singular`, sebelumnya `--singular`) | Penyimpangan kecil: pemeriksaan parent berbasis teks file (bukan AST) — cukup untuk file hasil template; parent tulisan tangan dengan bentuk berbeda bisa ditolak dengan pesan yang menjelaskan apa yang dicari |
| 2026-10-13 | 7.3b | **Penyimpangan template**: test repository di template hanya membuktikan wiring (SQL `EXISTS` ke tabel parent, kunci parent + rollback saat parent tidak ada) — template tidak mengenal kolom parent sehingga tidak bisa membuat baris parent lengkap untuk perekam SQL; perilaku generik diuji sekali di `dependent.repository.test.ts` dan suite integrasi. `PUT` 1:1 didokumentasikan dengan respons 200 (`describeEndpoint` satu status sukses; 201 disebut di summary). Tidak ada modul contoh (dibuktikan oleh `verify:scaffold`) | — |
| 2026-10-13 | 7.3b | **`verify:scaffold`**: varian `probe-notes --parent=scaffold-probes` (1:N) dan `probe-profiles --parent=scaffold-probes --one` (1:1) di-generate **setelah** modul standalone `scaffold-probes` di run yang sama (alur bertahap), lalu langkah baru "dependent modules leave their parent module untouched" (snapshot file parent sesudah dibuat vs sesudah semua CLI: identik byte demi byte), semua gate termasuk coverage, live check (401 tanpa token, 400 dengan token, 6 + 5 operasi terdokumentasi di path `{scaffoldProbeId}`). Unit test library 68 (+10: rencana 1:N / 1:1, placeholder habis, `fill` tanpa parent, penolakan nama parent, parser `--parent` / `--one` / `--parent-singular`) | `verify:scaffold` 19/19 PASS |
| 2026-10-13 | 7.3b | ESLint `REPOSITORY_SYNTAX_RULES` / `TX_WRITE_RULES`: `DependentRepository` = base kelima. Docs (D32): `database.md` §6 (jenis tabel Dependent, `DependentRepository`, hook kedua base, 1:1) + §7; `new-module.md` §1 (dua baris varian + "header-detail atau dependent?"), §2.1–2.4 (perintah, opsi, registrasi, nama, penolakan), §2.6, §2.7 baru (alur bertahap, route, kepemilikan, hapus, 2 level); `structure.md`, `transactions.md`, skill `scaffold-module`; `ARCHITECTURE.md` (lima base, R26, **R74** baru) | — |
| 2026-10-13 | 7.3b | **Chaos test** (9 + 1, semua tertangkap, `git status` tidak berubah): `EXISTS` parent dicabut dari `scoped()`; write per id tanpa mengunci / mengecek parent; `parentScope()` diabaikan; id parent dari input diterima (re-parenting); upsert mengunci parent `FOR SHARE`; `ChildRepository` tidak memanggil `assertParentWritable()` → unit test gagal; CLI menolak parent dependent, parent tanpa `softDelete()`, segmen route yang sudah dipakai (`orders/:id/items`); template dependent menulis file ke folder parent → `verify:scaffold` FAIL di "leave their parent module untouched". Gate: `validate:full` 917 test (lines 99.94%, functions 99.37%), `build`, `verify:scaffold`, `test:int` 29/29 | — |
| 2026-10-13 | 7.3b | **Keputusan user (review 7.3b, sebelum commit): child di subfolder parent**, bukan folder sejajar — `src/modules/<parent>/<anak>/<anak>.<peran>.ts`, agar relasi terlihat dari struktur dan satu fitur = satu folder. Ditegakkan `test/structure.test.ts`: tepat satu level, nama file = nama subfolder, subfolder hanya berisi modul `DependentRepository` (`moduleTreeViolations`), nama modul unik di seluruh `src/modules/` (nama tabel dan route datar `/<anak>/:id`), cek D26 mencakup modul bersarang. CLI: file anak ke subfolder (import relatif +1 level di template), import router `./modules/<parent>/<anak>/<anak>.routes`, baris pohon `structure.md` tepat di bawah parent (indentasi mengikuti `├──` / `└──` parent), parent bersarang ditolak ("is itself a dependent module"), nama modul yang sudah dipakai di mana pun ditolak. `verify:scaffold`: snapshot hanya file milik parent (subfolder anak memang bertambah). ESLint / dependency-cruiser tidak berubah (`src/modules/**`, `^src/modules/([^/]+)/`) | Mengubah D33 (folder sejajar) |
| 2026-10-13 | 7.3b | **Modul contoh `projects` + `tasks` (1:N) + `budgets` (1:1)** (permintaan user, seperti `orders`): dihasilkan dengan CLI (`module projects`, `module tasks --parent=projects`, `module budgets --parent=projects --one`) lalu kata benda Indonesia (Proyek, Tugas, Anggaran); `test/projects.e2e.test.ts` (kontrak lewat `createApp()`: parent dari path, route datar, 404 untuk parent lain, 400 untuk id parent tidak valid); migrasi `0009` (FK `restrict`, index FK, unique index parsial 1:1) di-generate dan **diterapkan ke DB lokal**. `EXAMPLE_MODULES` entri baru (folder, 3 schema, e2e, 3 export barrel, 6 baris `app.ts`, 3 baris pohon). **Uji nyata ke PostgreSQL lokal lewat `createApp()`**: create project / 2 task / budget (`PUT` 201 lalu 200 pada baris sama); hapus task; hapus project → task per id, list, `PUT` budget, `PATCH` task semuanya 404 dan `deleted_at` anak tidak berubah; restore project → task yang hidup kembali, task yang dihapus sendiri tetap terhapus, budget kembali; hapus budget → budget baru 201 → restore budget lama 409 `ERR_CONFLICT`; 3 baris audit di bawah `parent_table = projects` (create tidak diaudit, restore yang ditolak tidak meninggalkan jejak); semua baris uji dihapus | Ekspektasi probe "≥ 4 baris audit" salah tulis; jumlah benar 3 |
| 2026-10-13 | 7.3b | **Uji salinan repo** (tanpa file env selain `.env.example`, git baru di `main`): `bun run setup demo-backend` → `orders`, `projects` (beserta subfolder), schema & e2e contoh hilang, `app.ts` / pohon `structure.md` bersih, `drizzle/` = satu `0000` tanpa tabel contoh; `validate:full` 886 test, `verify:scaffold`, `build` hijau. Repo: `validate:full` 959 test (lines 99.94%, functions 99.43%), `build`, `verify:scaffold` 19/19, `test:int` 29/29 | — |

---

## 5. Roadmap & Progres

```
F0 Fondasi ──► F1 Platform & Kontrak ──► F2 Data Layer ──► F3 Auth JWT ──► F5 Inbound ──► F6 Integration ──► F7 Docs & Release
                     │                                         ▲
                     └──► F4 Outbound (boleh paralel setelah 1.3) ┘
```

| Fase | Fokus | Branch (contoh) | Bergantung pada | Ukuran |
|---|---|---|---|---|
| F0 | Fondasi kerja & quality gate | `chore/quality-gate-parity` | — | M |
| F1 | Platform & kontrak HTTP | `feat/<step-slug>` per step | F0 | L |
| F2 | Data layer | `feat/<step-slug>` per step | F0, 1.2 | L |
| F3 | Auth JWT | `feat/<step-slug>` per step | F1, F2 | L |
| F4 | Integrasi outbound | `feat/http-client-hardening` | 1.3 | S |
| F5 | Inbound: partner & webhook vendor | `feat/<step-slug>` per step | F2, F3, F4 (5.6) | L |
| F6 | Integration test | `test/integration-suite` | F3, F5 | M |
| F7 | Dokumentasi, skills, release | `docs/<slug>` | F0–F6 | M |

Legenda status: ⬜ belum · 🔄 dikerjakan · 👀 menunggu review · ✅ selesai · ⏸ ditunda

| Step | Judul | Status | Bergantung pada | Commit |
|---|---|---|---|---|
| 0.1 | Baseline commit | ✅ | — | `df3c0da` |
| 0.2 | Review rencana & keputusan | ✅ | 0.1 | `e6fd8af` |
| 0.3 | Paritas quality gate (ESLint, coverage, knip, hooks, CI) | ✅ | 0.2 | `9e0b75a` |
| 1.1 | Konfigurasi per grup + `parseEnv` | ✅ | 0.3 | `159cae2` |
| 1.2 | Request context, request ID, logger mixin | ✅ | 1.1 | `32d8661` |
| 1.3 | Kontrak error + registry `APP_ERROR_CODES` | ✅ | 1.2 | `bd6c74e`, `dd2a7fd` |
| 1.4 | i18n `id`/`en` | ✅ | 1.3 | `0ab188e` |
| 1.5 | Kontrak request snake_case + DTO bersama | ✅ | 1.3 | `240d8fe` |
| 1.6 | Ketahanan Redis & `CacheService` lanjutan | ✅ | 1.1 | `89d2e65` |
| 1.7 | Hardening platform (IP klien, body limit, CORS, rate limit) | ✅ | 1.2, 1.6 | `3028ac8` |
| 1.8 | Health `UP`/`DEGRADED`/`DOWN` + base path | ✅ | 1.6 | `0f2dae5` |
| 1.9 | Dokumentasi OpenAPI | ✅ | 1.5 | `ce62029` |
| 2.1 | Standar tanggal & waktu (Temporal) | ✅ | 0.3 | `d1aa11a` |
| 2.2 | Schema proyek, column helpers, UUID v7, schema referensi | ✅ | 2.1 | `208a8d8` |
| 2.3 | Test helper data layer | ✅ | 2.2 | `137295e` |
| 2.4 | `record_changes` + `AuditedRepository` | ✅ | 1.2, 2.3 | `f2b0582`, `029fa98` |
| 2.5 | `BaseRepository` + `ChildRepository` | ✅ | 2.4 | `0454fa8` |
| 2.6 | Penegakan aturan data layer | ✅ | 2.5 | `7ba1de9` |
| 2.7 | Test konvensi schema | ✅ | 2.5 | `43bfe53` |
| 2.8 | Migrasi modul `users` + template scaffold | ✅ | 2.6, 2.7 | `27d29dc` |
| 2.9 | Modul contoh header/detail + opsi hapus contoh di `init-project` | ✅ | 2.8 | `a29524f` |
| 3.1 | Primitif keamanan & config auth | ✅ | 1.1 | `c49fe51` |
| 3.2 | Schema auth (`role`, `auth_refresh_tokens`) | ✅ | 2.8 | `f50a2f8` |
| 3.3 | Modul `auth` (login, refresh, logout, me) | ✅ | 3.1, 3.2, 1.7 | `11087c7` |
| 3.4 | `authenticate()` default-deny + `requireRole()` | ✅ | 3.3 | `5491544` |
| 3.5 | Proteksi `users`, seed admin, panduan FE | ✅ | 3.4 | `17d8265` |
| 4.1 | Hardening `HttpClientService` | ✅ | 1.3 | `b317346` |
| 4.2 | Template integrasi & cache token vendor | ✅ | 4.1 | `6ff27d1` |
| 5.1 | Utilitas kripto & signing partner | ✅ | 0.3 | `614e9d1` |
| 5.2 | Kredensial partner (schema + admin API) | ✅ | 5.1, 2.8, 3.4 | `2ba2423` |
| 5.3 | Middleware `partnerAuth()` | ✅ | 5.2, 1.6 | `85e7c2a` |
| 5.4 | Panduan integrasi partner | ✅ | 5.3 | `ed556d6` |
| 5.5 | Konvensi kanal inbound & penegakannya (D23–D28) | ✅ | 5.4 | `bb29912` |
| 5.6 | Webhook vendor inbound | ✅ | 5.5, 4.2 | `9e1e166` |
| 6.1 | Integration test (Postgres + Redis asli) | ✅ | 3.5, 5.6 | `f77a229` |
| 7.1 | `ARCHITECTURE.md` generik + sinkronisasi docs | ✅ | 6.1 | `8c08e0a` |
| 7.2 | Docs SSOT: `docs/standards/` (D32) | ✅ | 7.1 | `0379e66` |
| 7.3 | CLI scaffolder `bun run scaffold` (D31) | ✅ | 7.2 | `9558db5` |
| 7.3b | Modul dependent: anak dengan acuan parent (D33) | 👀 | 7.3 |  |
| 7.4 | Finalisasi skills AI | ⬜ | 7.3b |  |
| 7.5 | Release check boilerplate v1.0.0 | ⬜ | 7.4 |  |

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

| Masalah | Solusi |
|---|---|
| Override ESLint `no-restricted-syntax` saling menimpa → larangan `c.json()` mati (G14) | Grup rule sebagai konstanta, dikomposisikan per area ([L7](#157-l7--snippet-eslint)) |
| Coverage menghitung file test; tanpa ambang functions & per file (G9) | `check-coverage.ts` baru ([L9](#159-l9--knip--check-coverage)) |
| `case-converter.util.ts` 85.71% (G16) | Tambah test cabang yang belum tercakup |
| depcheck hanya mendeteksi dependency | knip: dependency + file + export tak terpakai |
| `pre-push` hanya `lint:branch`; `lint:arch` justru di pre-commit (lambat) | pre-commit: lint-staged → tsc → ls-lint · pre-push: lint:branch → lint:arch → lint:deps → `bun test` |
| Tanpa CI | `.github/workflows/ci.yml` ([L8](#158-l8--ci-github-actions)) |
| `eslint-disable` bisa dipakai tanpa alasan | `@eslint-community/eslint-plugin-eslint-comments`: `require-description`, `no-unlimited-disable`, `no-unused-disable` |

**Langkah**

1. `eslint.config.mjs`: definisikan `CONTROLLER_RULES`, `MODULE_IMPORT_RULES` (selector `db`/`sqlClient`/`HttpClientService`), lalu override `*.controller.ts` = `[...MODULE_IMPORT_RULES, ...CONTROLLER_RULES]`. Override lain yang memakai `no-restricted-syntax` mengikuti pola yang sama.
2. Tambah plugin `eslint-comments` (devDependency) dengan tiga rule di atas; script `lint` → `eslint src test scripts --max-warnings 0`.
3. Tulis ulang `scripts/check-coverage.ts` sesuai L9; tambah test untuk `case-converter.util.ts` hingga ≥ 90% lines.
4. Pasang `knip` (devDependency), buat `knip.json` (L9), ganti script `lint:deps` → `knip`, hapus `depcheck` + `.depcheckrc.json`; bereskan temuan knip (hapus export mati, bukan meng-ignore).
5. `.husky/pre-commit` dan `.husky/pre-push` sesuai tabel di atas.
6. Tambah `.github/workflows/ci.yml` (L8) dan `.editorconfig` (`root = true`, `end_of_line = lf`, `charset = utf-8`, `indent_size = 2`, `insert_final_newline = true`).
7. Perbarui `CONTRIBUTING.md` §1, `project-standards` §6, bagian quality gate di `AGENTS.md` (depcheck → knip, ambang coverage baru).

**Acceptance criteria (chaos test — setiap pelanggaran dibuat sementara, dibuktikan gagal, lalu dihapus)**

- [x] `return c.json({})` di `*.controller.ts` → error ESLint (juga `c.text`).
- [x] `import { db } from '../../database/connection'` di `*.controller.ts` → error ESLint **dan** depcruise.
- [x] `// eslint-disable-next-line` tanpa `-- <alasan>` → error ESLint.
- [x] File sumber baru tanpa test → `test:cov` gagal dan menyebut nama filenya (`not loaded by any test`).
- [x] Export yang tidak dipakai di mana pun → `knip` gagal.
- [x] `bun run validate:full` hijau; coverage nyata (tanpa file test): lines 99.41%, functions 97.14%; `bun run build` sukses.
- [ ] Workflow CI hijau pada PR pertama. _(belum — repo belum punya remote, lihat log)_

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

- [x] Test: env invalid → error menyebut semua variabel yang salah dalam grupnya, tanpa nilainya (`parse-env.test.ts`, termasuk enum yang nilainya tidak boleh ikut tercetak).
- [x] `process.env` hanya dibaca di `src/config/env-source.ts` (ESLint `no-process-env` untuk sisa `src/`).
- [x] `bun run setup demo --dry-run` lulus (rule `APP_NAME` kini menunjuk `app.config.ts`).

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
     /* mutasi store aktif; melempar error di luar request (lihat log 1.2) */
   };
   ```
2. `src/utils/request-id.util.ts` (murni): `resolveRequestId(header?: string): string` sesuai D9.
3. Middleware `requestContext()` menggantikan `requestIdMiddleware`: resolve ID, set header respons `X-Request-ID`, jalankan `next()` di dalam `runWithRequestContext` (actor awal `anonymous`, locale default).
4. Pino `mixin()` → `{ requestId, actor }` dari context; hapus pengambilan manual `c.get('requestId')` di `loggerMiddleware` & `globalErrorHandler`.
5. `TransactionHost` dan context memakai instance `AsyncLocalStorage` terpisah — test memastikan keduanya bersarang dengan benar.

**Acceptance criteria**

- [x] `X-Request-ID` tidak aman (newline, spasi, kosong, > 128 karakter) → diganti UUID v7; header respons berisi ID final.
- [x] Request paralel (`Promise.all`, delay berbeda) tidak saling bocor context — di level unit maupun HTTP.
- [x] Log yang ditulis di dalam request memuat `requestId` + `actor` tanpa dioper manual (pino dengan destination in-memory); log di luar request tidak memuatnya.
- [x] Di luar request, `getActor()` = `system`; `setActor()` di luar request melempar error.

### Step 1.3 — Kontrak error + registry `APP_ERROR_CODES`

**Tujuan**: envelope error sesuai blueprint (G6, D12); daftar kode di [L2](#152-l2--error-types--app_error_codes).

| Masalah | Solusi |
|---|---|
| `data: null` di envelope error | Dihapus; envelope error = `success, status_code, message, error, request_id, timestamp` |
| Code dinamis `ERR_EXT_${origin}` | Code tetap dari registry; vendor diidentifikasi lewat `error.origin` |
| Tidak ada 413 / 429 / 503 | `PayloadTooLargeError`, `TooManyRequestsError`, `ServiceUnavailableError` |
| 409 tanpa tipe sendiri | `ConflictError` → `error.type = "CONFLICT"` (D12) |
| `details[].field` bisa `body.fullName` | Diubah ke snake_case, prefix internal dibuang |

**Langkah**

1. `src/core/errors/error-codes.ts`: `APP_ERROR_CODES` + `ERROR_TYPES` (`as const`), tipe turunan `AppErrorCode`, `ErrorType`.
2. `ApiError`: `errorCode: AppErrorCode`, `errorType: ErrorType` (bukan `string`).
3. Tambah tiga class error di atas; `ExternalServiceError(kind: 'TIMEOUT' | 'UNREACHABLE' | 'ERROR', origin)` → status 504/502/502.
4. `globalErrorHandler` & `notFoundHandler`: satu fungsi `buildErrorBody()` dipakai keduanya; 500 tidak pernah membocorkan pesan internal.
5. ESLint ([L7](#157-l7--snippet-eslint)): literal `/^ERR_/` dilarang di luar `error-codes.ts`; `throw new Error(` dilarang di `src/modules/**` (wajib `ApiError`).

**Acceptance criteria**

- [x] Test envelope untuk setiap `error.type` (10 tipe + 404 route + 500 internal/tak dikenal), termasuk tanpa field `data`, `details[].field` snake_case, dan `Retry-After`.
- [x] `throw new Error('x')` di service → error ESLint (chaos test).
- [x] `'ERR_X'` di file modul **dan** di `src/core/` → error ESLint; `error-codes.ts` dan file test dikecualikan (chaos test).

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

- [x] `Accept-Language: en` → pesan en (sukses, error, detail, 404 route); tanpa header → `DEFAULT_LOCALE`; locale tak didukung → fallback; header `Content-Language` + `Vary` (test HTTP + uji langsung `createApp`).
- [x] `new ApiResponse(data, 'ok')`, template literal, pesan error, dan `details[].message` literal di modul → error ESLint; `InternalServerError` & pesan terlokalisasi lolos (chaos test).

### Step 1.5 — Kontrak request snake_case + DTO bersama

**Tujuan**: kontrak simetris (G5, D10).

**Langkah**

1. `case-converter.util.ts`: `snakeToCamelCase(value)` rekursif + `isSnakeCaseKey(key)`; implementasi linear (hindari regex ReDoS — temuan proyek lama).
2. `validate()` untuk `body` & `query`: kumpulkan key non-snake_case (rekursif, path lengkap) → `ValidationError` 400 berisi `details` per key; lalu konversi → Zod. `params` tidak dikonversi.
3. Opsi `validate({ body, preserveKeys: ['metadata'] })` — subtree key tersebut tidak dicek & tidak dikonversi (hanya top-level, didokumentasikan).
4. `src/core/dto/common.dto.ts`: `uuidParamSchema`, `paginationQuerySchema` (`uuidChildParamSchema` & `numericIdParamSchema` menyusul di 2.8, lihat log) (`page`, `per_page` ≤ 100).
5. DTO `users` & e2e diperbarui ke snake_case.

**Acceptance criteria**

- [x] `{ "full_name": "A" }` diterima (DTO menerima `fullName`); `{ "fullName": "A" }` → 400 `ERR_NON_SNAKE_CASE_KEY` dengan `field: "fullName"` persis seperti dikirim (body & query; test HTTP + uji langsung modul hasil scaffold).
- [x] Error validasi field bertingkat → `field: "address.postal_code"` (snake_case, tanpa prefix `body.`); key camelCase bertingkat dilaporkan `address.postalCode` / `items.1.itemCode`.
- [x] Test regresi waktu: key 100k karakter (`toSnakeCase`, `isSnakeCaseKey`, `toCamelCase`) < 200 ms total; implementasi linear identik dengan regex lama (fuzz 5000 string).

### Step 1.6 — Ketahanan Redis & `CacheService` lanjutan

**Tujuan**: blueprint §6 (G4, D22).

| Masalah | Solusi |
|---|---|
| Berhenti reconnect setelah 3x | `retryStrategy: (n) => Math.min(n * 500, 30_000)` (tanpa batas) |
| Command menggantung saat Redis lambat | `commandTimeout = REDIS_COMMAND_TIMEOUT_MS` (default 1000), `enableOfflineQueue: false` |
| Prefix opsional (default kosong) | Default `<APP_NAME>:<NODE_ENV>:`; override via `REDIS_KEY_PREFIX` |
| Perintah berbahaya bisa dipanggil | Wrapper menolak `flushall`, `flushdb`, `keys` (lempar error) |
| Tidak ada primitif untuk rate limit & nonce | `increment(key, ttlSeconds)` (Lua `INCR` + `EXPIRE NX`), `setIfAbsent(key, value, ttlSeconds)` (`SET NX EX`) |
| Lookup input tak tepercaya selalu ke DB | `getOrSet(key, ttl, fetcher, { negativeTtl })` — sentinel `{"__nil":1}` |

**Langkah**: implementasi tabel di atas di `redis.client.ts` & `cache.service.ts`; semua method baru fail-open (Redis gagal → `increment` mengembalikan `null`, `setIfAbsent` mengembalikan `true`, dicatat `warn`); `CACHE_KEYS` tetap SSOT; `references/redis-cache.md` diperbarui. Bersihkan juga `CACHE_KEYS.userList(page, limit)` (tidak dipakai kode produksi; nama `limit` basi sejak 1.5) — temuan review 1.4–1.5.

**Acceptance criteria**

- [x] Test fail-open untuk setiap method (client di-mock melempar / status bukan `ready`).
- [x] `getOrSet` tidak meng-cache saat fetcher melempar error.
- [x] Pemanggilan `flushall` → error.

### Step 1.7 — Hardening platform

**Tujuan**: G1, G7, D18.

**Langkah**

1. `src/core/middlewares/client-ip.ts`: `getClientIp(c)` — `getConnInfo(c)` (`hono/bun`) sebagai alamat socket; bila `TRUST_PROXY_HOPS = n > 0`, ambil entri ke-`n` dari kanan `X-Forwarded-For`; normalisasi `::ffff:`. Disimpan di request context.
2. `bodyLimit({ maxSize: HTTP_BODY_LIMIT_BYTES, onError })` → `PayloadTooLargeError` (413, envelope standar).
3. CORS: `CORS_ORIGINS` (CSV URL; kosong = CORS mati; `*` ditolak Zod saat `NODE_ENV=production`), `credentials: true`, `exposeHeaders: ['X-Request-ID', 'Retry-After', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset']`, `allowMethods` + `PATCH`.
4. `src/core/middlewares/rate-limit.ts`: `rateLimit({ windowSeconds, max, keyPrefix })` memakai `cacheService.increment`; header `RateLimit-*`; lewat batas → `TooManyRequestsError` + `Retry-After`; Redis gagal → lolos.
5. Hapus dependency `hono-rate-limiter`; daftarkan middleware sesuai urutan [L10](#1510-l10--urutan-pipeline-createapp).

**Acceptance criteria**

- [x] `TRUST_PROXY_HOPS=0` + `X-Forwarded-For` palsu → kunci rate limit tetap IP socket.
- [x] `TRUST_PROXY_HOPS=1` → IP diambil dari entri paling kanan.
- [x] Body > limit → 413 `ERR_PAYLOAD_TOO_LARGE`.
- [x] Request ke-(max+1) → 429 + `Retry-After`; Redis mati → 200.
- [x] Preflight dari origin tak terdaftar → tanpa header `Access-Control-Allow-Origin`.

### Step 1.8 — Health `UP`/`DEGRADED`/`DOWN` + base path

**Tujuan**: G13.

**Langkah**

1. Ganti `API_PREFIX=/api/v1` → `API_BASE_PATH=/api`; route ber-versi di-mount sebagai `app.route('/api/v1', v1Router)` (versi adalah kode, bukan env).
2. Health tanpa versi: `GET /api/health` (selalu 200, `status: UP | DEGRADED | DOWN`, detail komponen `database`, `redis`), `GET /api/health/readiness` (503 `SERVICE_UNAVAILABLE` hanya bila DB down), `GET /api/health/liveness` (selalu 200, tanpa dependency).
3. Perbarui e2e, README, `.env.example`.

**Acceptance criteria**

- [x] DB up + Redis up → `UP`; Redis down → `DEGRADED` (readiness 200); DB down → `DOWN` (readiness 503).

### Step 1.9 — Dokumentasi OpenAPI

**Tujuan**: G12, D17.

**Langkah**

1. **Spike (time-box, hasil dicatat di 4.1)**: pasang `@hono/zod-openapi` di branch spike, ukur dampak — versi Zod yang disyaratkan, perubahan pola route (`createRoute` + `app.openapi`), kompatibilitas dengan `validate()` (snake_case strict) dan `asyncHandler`. Bandingkan dengan `hono-openapi` (`describeRoute` + validator middleware).
2. Implementasi pilihan: komponen bersama `SuccessEnvelope<T>`, `PaginatedEnvelope<T>`, `ErrorEnvelope`; schema ditampilkan snake_case (post-processor `toSnakeCaseOpenApi()` di `src/utils/`); security scheme `bearerAuth` (dipakai Fase 3) dan header partner (Fase 5).
3. `GET /api/docs/openapi.json` + UI Scalar `GET /api/docs`, hanya bila `API_DOCS_ENABLED` (default `true` kecuali production).
4. Modul `users` & `health` terdokumentasi; template `scaffold-module` diperbarui.

**Acceptance criteria**

- [x] Test: setiap route di `app.routes` (kecuali docs) ada di spec.
- [x] Semua properti schema di spec snake_case.
- [x] Production → `/api/docs` 404.

---

## Fase 2 — Data Layer

### Step 2.1 — Standar tanggal & waktu

**Tujuan**: D13. Tiga jenis waktu, tidak dicampur:

| Jenis | Nama field | Kolom DB | Format API |
|---|---|---|---|
| Instant | `*_at` | `timestamptz` | ISO 8601 UTC `Z`; request wajib ber-offset |
| Tanggal kalender | `*_date` | `date` | `YYYY-MM-DD` |
| Jadwal lokal | instant + `*_timezone` | `timestamptz` + `text` (IANA) | instant + zona IANA |

**Langkah**

1. Dependency `temporal-polyfill`; `src/utils/datetime.util.ts`: `nowInstant()`, `toIsoUtc(instant)`, `parseInstant(str)` (tolak tanpa offset), `parseCalendarDate(str)`, `dayRangeInZone(date, zone)` → `{ start, end }`, `wallTimeToInstant(date, time, zone)` (DST ambigu/gap → error), konversi `Date ⇄ Temporal.Instant` untuk boundary driver.
2. `src/core/dto/datetime.dto.ts`: `instantField`, `calendarDateField`, `timeZoneField` (validasi IANA).
3. `Dockerfile`, `docker-compose*.yml`: `TZ=UTC`; `connection.ts`: `connection: { TimeZone: 'UTC' }`; script test `TZ=UTC`.
4. ESLint ([L7](#157-l7--snippet-eslint)): `new Date(<arg>)`, `Date.parse`, getter/formatter waktu lokal dilarang di luar `datetime.util.ts`.

**Acceptance criteria**

- [x] Test DST (mis. `America/New_York` 2026-03-08 02:30 → ditolak), batas hari `Asia/Jayapura` vs UTC.
- [x] `new Date('2026-01-01')` di modul → error ESLint.

### Step 2.2 — Schema proyek, column helpers, UUID v7, schema referensi

**Tujuan**: D14, D15, G8.

**Langkah**

> **Diubah 2026-10-05 (D14, lihat 4.1)**: langkah 1–2 di bawah (schema bernama proyek, `APP_SCHEMA_NAME`, rule identitas) digantikan oleh tabel di `public` lewat `appTable` dari `schemas.ts`; `drizzle.config.ts` memakai `schemaFilter: ['public']`. Langkah 3–6 berlaku seperti tertulis.

1. `src/database/schema/schemas.ts` — satu-satunya tempat `pgSchema`:
   ```ts
   export const APP_SCHEMA_NAME = 'bun_hono_starter'; // diganti init-project (IDENTITY_RULES)
   export const appSchema = pgSchema(APP_SCHEMA_NAME);
   export const referenceSchema = pgSchema('reference'); // contoh; hanya untuk view .existing()
   ```
2. `IDENTITY_RULES`: tambah rule `APP_SCHEMA_NAME` (nilai `<snake_name>`); `drizzle.config.ts` `schemaFilter: [APP_SCHEMA_NAME]` (import konstanta); hapus env `DB_SCHEMA`.
3. `src/database/schema/columns.ts`: `uuidPrimaryKey()` (`uuid().primaryKey().$defaultFn(() => Bun.randomUUIDv7())`), `sequentialPrimaryKey()` (`bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity()` — `mode: 'number'` karena nilai `bigint` JS membuat `JSON.stringify` error; aman sampai 2⁵³), `timestamps`, `auditColumns` (`created_by`, `updated_by` `varchar(150)`), `softDelete` (`deleted_at`), `parentReference(table)` (FK + wajib index), `instant(name)`, `calendarDate(name)`, `timeZoneColumn(name)`, `activeUniqueIndex(name, cols)` (`WHERE deleted_at IS NULL`).
   - **Allowlist PK berurutan** — `src/database/schema/append-only-tables.ts`: `APPEND_ONLY_TABLES` — satu-satunya daftar tabel yang boleh memakai `sequentialPrimaryKey()`, tiap entri dengan alasan (`{ record_changes: 'audit trail, append-only, partition-ready' }`). Panduan pemilihan PK di `references/database.md`: default `uuidPrimaryKey()`; ID berurutan hanya untuk tabel pencatatan (insert cepat, tak pernah diekspos di URL — mencegah enumerasi); UUID v7 dibuat aplikasi, jadi insert lewat SQL mentah wajib mengisi `id` sendiri.
4. Contoh referensi: `refRoles` → `referenceSchema.view('ref_roles', {...}).existing()`.
5. Hapus `drizzle/0000_*` + `meta/`, generate ulang (`bun run db:generate`) — **developer** menjalankan migrasi ke DB lokal.
6. ESLint: `pgSchema(` dilarang di luar `schemas.ts`; `timestamp(`, `serial(`, `pgTable(` dilarang di `schema/**` selain `columns.ts`/`schemas.ts`.

**Acceptance criteria**

- [x] Migrasi `0000` baru hanya berisi tabel domain di `public` (tanpa `CREATE SCHEMA`, tanpa `reference`) — disesuaikan dengan perubahan D14.
- [x] `db.insert(refRoles)` → error `tsc` (test `@ts-expect-error`).
- [x] ~~`bun run setup demo-app --dry-run` mendaftar perubahan `APP_SCHEMA_NAME`~~ — gugur setelah perubahan D14 (tidak ada nama proyek di schema/migrasi); dry-run tetap lulus dengan 11 aturan.

### Step 2.3 — Test helper data layer

**Langkah**: `test/helpers/drizzle-mock.ts` — `createDrizzleChainMock(result)` (chain `select/from/where/limit/for/insert/values/returning/update/set` yang bisa di-assert), `createTxHostMock(chain)`, `renderWhere(condition)` (me-render SQL + params via `PgDialect`, untuk assertion kondisi persis, mis. `deleted_at is null`). Ls-lint mengizinkan `test/helpers/`.

> **Diubah 2026-10-08 (lihat 4.1)**: mock chain + `renderWhere` diganti **perekam SQL** `test/helpers/sql-recorder.ts` (`createSqlRecorder()` → `db`, `txHost`, `statements`, `respondWith`, `reset`; `rowOf(table, entity)`): Drizzle asli (driver `postgres-js` + schema produksi) di atas klien postgres.js palsu. `TransactionHost(root = db)` + `run(fn)`; `runInTransaction` = `defaultTxHost.run`.

**Acceptance criteria**

- [x] `users.repository.test.ts` memakai helper (tanpa mock chain manual) — SQL & parameter setiap method di-assert; chaos test: `findByEmail` memfilter `id` → test baru gagal (test lama tetap hijau).
- [x] Transaksi teruji tanpa menambal `db` global: BEGIN/COMMIT, ROLLBACK + rethrow, join transaksi aktif, savepoint.
- [x] Template `scaffold-module` punya test repository; `verify:scaffold` kini menjalankan test hasil generate (chaos test: SQL salah di template → gagal).

### Step 2.4 — `record_changes` + `AuditedRepository`

**Tujuan**: D16. DDL di [L6](#156-l6--ddl-record_changes).

**Langkah**

1. `schema/domain/record-changes.schema.ts` (di `public` lewat `appTable` — D14 diubah).
2. `src/utils/record-diff.util.ts` (murni): `diffRecords(before, after, { redact, ignore: ['updatedAt'] })` → hanya kolom berubah, nilai kolom `redact` → `'[REDACTED]'`; `snapshot(record, { redact })`.
3. `src/database/audited.repository.ts` (abstract): `protected async lockById(id)` (`SELECT … FOR UPDATE` via `.for('update')`), `protected async writeChange(action, recordId, changes)` (actor & request ID dari context). Semua lewat `this.txHost.tx`; method publik turunan wajib berjalan di transaksi (`runInTransaction` internal bila belum ada).

**Acceptance criteria**

- [x] UPDATE yang tidak mengubah apa pun → tidak menulis `record_changes` (statement terekam: BEGIN, SELECT … FOR UPDATE, COMMIT).
- [x] Error setelah update (dalam transaksi) → audit ikut rollback (perekam SQL: UPDATE + INSERT audit di antara BEGIN … ROLLBACK; diuji nyata di 6.1).
- [x] Kolom `redact` tercatat `[REDACTED]` (UPDATE & snapshot DELETE).

### Step 2.5 — `BaseRepository` + `ChildRepository`

**Jenis tabel** (panduan masuk `references/database.md`):

| Jenis | Ciri | Kolom kunci | Repository |
|---|---|---|---|
| Mandiri | Berdiri sendiri | `uuidPrimaryKey` + `timestamps` + `auditColumns` + `softDelete` | `BaseRepository` |
| Header | Mandiri yang punya detail | sama | `BaseRepository` + `ChildRepository` (modul sama) |
| Detail | Hanya bermakna di dalam satu header | `parentReference` (+ index), tanpa `softDelete` | `ChildRepository` |
| Pencatatan | Log/history, append-only | `sequentialPrimaryKey` + `timestamps` | `AppendOnlyRepository` (insert + select) |
| Referensi | Milik sistem lain | view `.existing()` | `ReadOnlyRepository` (select) |

**Langkah**

1. `BaseRepository<TTable>`: `findById`, `findPage({ page, perPage, orderBy })` (default `ORDER BY created_at DESC, id DESC`), `count`, `create` (isi `createdBy`/`updatedBy` dari actor), `updateById(id, patch)` (lock → diff → update dengan `updatedAt: NOW` (jam DB — `$onUpdate` drizzle 0.40 tidak bisa `now()`) → audit), `softDeleteById`, `restoreById`; semua query ter-scope `deleted_at IS NULL` lewat `scoped()`; tanpa hard delete.
2. `ChildRepository<TChild, TParent>`: setiap method menerima `parentId` (cegah IDOR); kunci header aktif dulu (urutan kunci konsisten), `createForParent`, `updateForParent`, `deleteForParent` (hard delete + snapshot), `syncForParent(parentId, items)` (insert/update/delete dalam satu transaksi), menyentuh `updated_at` header; setiap audit detail mencatat header di `parent_table`/`parent_id` (`writeChange(…, parent)`).
3. `AppendOnlyRepository<TTable>` (`append`, `findPage`, `count`; tanpa update/delete) dan `ReadOnlyRepository<TView>` (`findPage` dengan `orderBy` wajib, `count`) — ditambahkan 2026-10-08 atas permintaan user, agar **setiap** repository modul punya base (aturan di 2.6).

**Acceptance criteria**

- [x] Perilaku generik diuji sekali di `src/database/*.test.ts` (scope soft delete, audit, IDOR ditolak, sync) — `base.repository.test.ts` & `child.repository.test.ts` dengan perekam SQL dan tabel uji `test/helpers/repository-fixtures.ts`; chaos test: scope soft delete dicabut, filter header dicabut, `updatedAt: NOW` dicabut → masing-masing gagal.
- [x] Header soft-deleted → operasi detail → `NotFoundError` (baca & tulis; tulis di-rollback sebelum menyentuh detail).
- [x] `AppendOnlyRepository` / `ReadOnlyRepository`: SQL & mapping teruji; tidak punya method ubah/hapus (test daftar method).

### Step 2.6 — Penegakan aturan data layer

**Langkah** (ESLint + depcruise; selector di [L7](#157-l7--snippet-eslint)):

| Aturan | Penegak |
|---|---|
| Setiap class di `src/modules/**/*.repository.ts` wajib `extends` `BaseRepository` / `ChildRepository` / `AppendOnlyRepository` / `ReadOnlyRepository` (pengecualian: `eslint-disable` + alasan, mis. `auth_refresh_tokens`) | ESLint |
| `.update(` / `.delete(` dilarang di `src/modules/**/*.repository.ts` | ESLint |
| Penulisan DB (`.insert(`, `.update(`, `.delete(`) dilarang di luar `*.repository.ts` | ESLint |
| Raw SQL `UPDATE` / `DELETE FROM` dalam `` sql`…` `` dilarang | ESLint (TemplateLiteral) |
| `recordChanges` tidak boleh di-import di modul | depcruise |
| `@Transactional()` hanya di `*.service.ts` | ESLint |
| `TransactionHost` hanya di `*.repository.ts` & `src/database/**` | ESLint + depcruise |
| `sql.raw(` dilarang (kecuali `eslint-disable` + alasan) | ESLint |
| Raw query hanya di `*.queries.ts` (fungsi murni, baca saja) | ls-lint + ESLint |
| Seeder (`src/database/seeds/**`) dikecualikan | override |

**Acceptance criteria**

- [x] Chaos test per baris tabel — modul probe sementara: 16 pelanggaran ditolak ESLint (repository tanpa base, `tx.update`/`tx.delete` di repository, `@Transactional()` di repository, `tx.execute` di luar `*.queries.ts`, `tx.insert` di service, raw `UPDATE`/`DELETE FROM`, `TransactionHost`/`defaultTxHost`/`transactionStorage` & `recordChanges` lewat barrel maupun jalur langsung, `sql.raw` di `core`) + 2 import jalur langsung ditolak depcruise; `*.queries.ts` dengan `execute` + `TransactionHost` dan service dengan `@Transactional()` lolos; probe dihapus.
- [x] Didokumentasikan di `CONTRIBUTING.md` §5.3 _Aturan Data Layer yang Ditegakkan Mesin_.

### Step 2.7 — Test konvensi schema

**Langkah**: `src/database/schema/schema-conventions.test.ts` mengiterasi semua tabel yang diekspor (`getTableConfig`): setiap FK punya index dengan kolom awal yang sama; tabel domain memakai `id` dari helper; `id` berurutan (`bigint` identity) hanya pada tabel di `APPEND_ONLY_TABLES` dan setiap entri allowlist benar-benar memakainya (tidak ada entri basi); tidak ada kolom `serial`/`bigserial`; tabel ber-`deleted_at` tidak punya `unique()` biasa (wajib `activeUniqueIndex`); `record_changes` PK `(id, changed_at)` tanpa FK/unique lain dan CHECK pasangan `parent_table`/`parent_id`.

**Acceptance criteria**

- [x] Menambah FK tanpa index → test gagal dengan nama tabel & kolom (chaos test: tabel sementara diekspor dari barrel → `chaos_notes.author_id: foreign key without an index starting with it`).
- [x] Tabel domain biasa memakai `sequentialPrimaryKey()` tanpa terdaftar di `APPEND_ONLY_TABLES` → test gagal menyebut nama tabel (`chaos_logs: sequential id but not listed in APPEND_ONLY_TABLES`).
- [x] Setiap pemeriksaan juga dibuktikan permanen terhadap tabel sintetis yang sengaja melanggar (FK tanpa index / index yang tidak diawali FK, id bukan dari helper, `serial`, unique biasa di tabel soft delete, entri allowlist basi).

### Step 2.8 — Migrasi modul `users` + template scaffold

**Langkah**

1. `users.schema.ts` memakai helper (`uuidPrimaryKey`, `timestamps`, `auditColumns`, `softDelete`, `activeUniqueIndex` email).
2. `UsersRepository extends BaseRepository`; endpoint baru `PATCH /users/:id`, `DELETE /users/:id` (soft delete), `POST /users/:id/restore`; urutan list deterministik (G11).
3. Template `scaffold-module` untuk **mandiri**, **header + detail** (route `/headers/:id/details[/:childId]`, maks 2 level), **pencatatan**.
4. Migrasi di-generate; developer menjalankan.

> **Diubah 2026-10-10 (lihat 4.1)**: varian template **header + detail** dan **pencatatan** dipindah ke Step 2.9, bersama modul contoh `orders` — keduanya kode yang sama (modul contoh = keluaran template), dan `verify:scaffold` perlu diperluas untuk beberapa varian sekaligus. Step 2.8 = `users` + template **mandiri**.

**Acceptance criteria**

- [x] `users` memakai `BaseRepository` (+ `activeUniqueIndex` email, kolom audit & soft delete), endpoint `PATCH` / `DELETE` (soft) / `POST /:id/restore`, list berurutan `created_at DESC, id DESC` (G11); `eslint-disable` sementara dari 2.6 dihapus.
- [x] Migrasi `0003` di-generate dan dijalankan ke DB lokal; siklus create → duplikat 409 → patch → patch tanpa perubahan → delete → email dipakai ulang → restore 409 → restore 200 → list diuji lewat server nyata ke PostgreSQL & Redis lokal; `record_changes` berisi UPDATE / SOFT_DELETE / SOFT_DELETE / RESTORE (tanpa baris untuk patch kosong & restore gagal); baris uji dihapus lagi.
- [x] Template mandiri (`BaseRepository`, update / soft delete / restore) lolos `verify:scaffold`, yang kini juga menjalankan test konvensi schema terhadap tabel hasil template (chaos test: `.unique()` biasa di template → gagal).
- [ ] ~~Modul contoh header/detail dibuat dari template~~ → dipindah ke Step 2.9.

### Step 2.9 — Modul contoh header/detail + opsi hapus contoh di `init-project`

**Tujuan** (ditambahkan 2026-10-08 atas permintaan user): developer yang meng-clone repo punya contoh nyata pola header/detail (lock header, anti-IDOR, `sync`), tanpa terbawa ke proyek yang tidak membutuhkannya.

**Langkah**

1. Template `scaffold-module`: varian **header + detail** (route `/headers/:id/details[/:childId]`, maks 2 level) dan **pencatatan** (`AppendOnlyRepository`), diverifikasi `verify:scaffold` per varian (dipindah dari 2.8).
2. Modul `orders` (header, `BaseRepository`) + `order_items` (detail, `ChildRepository`; plan awal: `order_lines` — lihat 4.1) — keluaran varian header/detail template: CRUD header, soft delete/restore, CRUD detail di `/orders/:id/lines[/:lineId]`, `PUT /orders/:id/lines` (`syncForParent`); semua endpoint terdokumentasi (`describeEndpoint`); migrasi di-generate. Bersama `users` (mandiri) dan `record_changes` (pencatatan), setiap jenis tabel punya contoh.
3. `bun run setup <nama>`: secara default **menghapus modul contoh** (file modul, schema, registrasi route, pesan, test) lalu **men-generate ulang migrasi dari awal** (proyek baru belum punya database); `--keep-examples` mempertahankannya. Daftar file contoh di satu registry (`EXAMPLE_MODULES` di `scripts/setup.ts`) + drift guard (file terdaftar hilang → abort).
4. Skill `init-project` & README: apa yang dihapus, cara mempertahankannya.

**Acceptance criteria**

- [x] Varian template header + detail (`references/header-detail.md`) dan pencatatan (`references/record.md`) di-generate & diuji `verify:scaffold` bersama varian mandiri (chaos test: tabel pencatatan tanpa `APPEND_ONLY_TABLES` → gagal; FK detail tanpa index → gagal dengan nama tabel & kolom).
- [x] Modul contoh `orders` + `order_items` (dihasilkan dari template header/detail) lolos semua gate; e2e kontrak (IDOR → 404, sync, validasi); **uji nyata ke DB lokal**: IDOR → 404, sync (simpan / hapus / tambah), sync dengan id asing → 404, header soft-deleted → 404 untuk baca & tulis detail, restore → detail tampil lagi; audit detail membawa `parent_table`/`parent_id`; baris uji dihapus.
- [x] Uji di salinan repo (tanpa file env apa pun selain `.env.example`): `bun run setup demo-app` → modul contoh hilang, `drizzle/` = satu `0000` (users + record_changes) yang terbukti terpasang di database sementara; typecheck, lint, ls-lint, depcruise, knip, test:cov, verify:scaffold, build hijau. `--keep-examples` → modul & migrasi tetap, semua gate hijau.

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

- [x] Token kedaluwarsa / `aud` salah / `iss` salah / signature salah / `alg: none` → ditolak (test per kasus).

### Step 3.2 — Schema auth

**Langkah**

1. `users.role` (`varchar(20)`, default `'user'`), konstanta `ROLES` di `src/core/security/roles.ts`.
2. `auth_refresh_tokens` (kolom di [L3](#153-l3--spesifikasi-auth)).
3. **Pengecualian disetujui user** (lihat 4.1): repository token dikecualikan dari aturan 2.6 lewat override ESLint satu file dengan komentar alasan.
4. Generate migrasi.

**Acceptance criteria**

- [x] `schema-conventions.test.ts` lulus (index FK `user_id`, `family_id`).

### Step 3.3 — Modul `auth`

**Langkah**

1. `src/modules/auth/` — `auth.routes.ts`, `auth.controller.ts`, `auth.service.ts`, `auth.repository.ts` (refresh token), `auth.dto.ts`, `auth.transformer.ts`, `auth-cookie.ts` (set/clear cookie sesuai D3 via `hono/cookie`).
2. Endpoint & algoritma rotasi sesuai L3; endpoint ber-cookie memakai `csrf({ origin: CORS_ORIGINS })` dari `hono/csrf` (D4).
3. Login: dummy hash saat user tidak ada (waktu konstan); pesan gagal generik; brute-force limit per `(sha256(email), ip)` via `increment` (fail-open) → 429.
4. Ganti password / nonaktifkan user (method service `users`) → cabut semua family user (dipanggil lewat service auth yang di-export, bukan repository lintas modul).
   > **Diubah 2026-10-12 (lihat 4.1)**: depcruise melarang import lintas modul sama sekali. User nonaktif / terhapus ditolak saat refresh (family-nya dicabut) dan di `GET /me`; access token-nya habis dalam `ACCESS_TOKEN_TTL_SECONDS`. Ganti password belum ada endpoint-nya — saat dibuat, tempatnya di modul `auth` dan memanggil `logoutAll`.

**Acceptance criteria**

- [x] e2e: login → refresh (token berganti, cookie baru) → pakai token lama lagi → 401 `ERR_AUTH_REFRESH_REUSED` dan token terbaru ikut tercabut → logout idempoten.
- [x] Atribut `Set-Cookie` diverifikasi persis (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth`, `Max-Age`).
- [x] `POST /auth/refresh` dengan `Origin` tak terdaftar → 403.
- [x] Respons login/refresh tidak pernah memuat refresh token di body.
- [x] Login gagal ke-(max+1) → 429.

### Step 3.4 — `authenticate()` default-deny + `requireRole()`

**Langkah**

1. `src/core/middlewares/authenticate.ts`: lewati bila route cocok `PUBLIC_ROUTES` atau di bawah `/api/v1/partner/*` (**pengecualian partner ditunda ke 5.3**, lihat 4.1); selain itu wajib `Authorization: Bearer <jwt>` → `verifyAccessToken` → `setActor('user:<id>')` + simpan `role` di context; gagal → 401.
2. `src/core/security/public-routes.ts`: registry `PUBLIC_ROUTES` + matcher murni `matchRoutePattern` di `src/utils/` (L4).
3. `src/core/middlewares/require-role.ts`: `requireRole(...roles)` → 403 `ERR_ROLE_FORBIDDEN`.
4. Dipasang di `createApp()` sesuai L10.
5. `AGENTS.md`: invariant baru _Default-Deny Authentication_.

**Acceptance criteria**

- [x] Test enumerasi `app.routes` (L4) hijau; menambah route baru tanpa terdaftar publik → route itu 401 tanpa token.
- [x] Role `user` ke endpoint `requireRole('admin')` → 403.

### Step 3.5 — Proteksi `users`, seed admin, panduan FE

**Langkah**

1. `POST/PATCH/DELETE /users*` → `requireRole('admin')`; `GET /users/:id` → admin atau pemilik.
2. `scripts/seed-admin.ts --email <email>` (password dibaca dari prompt/stdin, tidak dari argumen/env; dijalankan developer).
3. `docs/auth-guide.md` untuk FE: alur token, simpan access token di memori (bukan `localStorage`), `credentials: 'include'`, auto-refresh saat 401 dengan **single-flight** (hindari false-positive reuse detection antar tab), logout.

**Acceptance criteria**

- [x] Non-admin tidak bisa membuat user; pemilik bisa melihat profilnya sendiri.

---

## Fase 4 — Integrasi Outbound

### Step 4.1 — Hardening `HttpClientService`

**Tujuan**: G3.

| Kondisi | HTTP ke client | `error.code` | `error.origin` |
|---|---|---|---|
| Timeout (`ECONNABORTED`/`ETIMEDOUT`) | 504 | `ERR_EXT_TIMEOUT` | kode integrasi |
| Network error / DNS / reset | 502 | `ERR_EXT_UNREACHABLE` | kode integrasi |
| Vendor 4xx/5xx | **502** (tidak pernah meneruskan status vendor) | `ERR_EXT_ERROR` | kode integrasi |

**Langkah**

1. Pemetaan tabel di atas; body vendor hanya di-log (terpotong 2 KB, lewat redaksi), header tidak di-log; `details` ke client = pesan generik dwibahasa. Fallback detail `'Unknown external service error'` ikut hilang/dilokalkan — temuan review 1.4–1.5.
2. Interceptor request menambahkan `X-Request-ID` dari context.
3. `timeoutMs` wajib di `HttpClientOptions` (tanpa default diam-diam).
4. `src/integrations/registry.ts`: `INTEGRATION_REGISTRY = { JSONPLACEHOLDER: { institution: 'JSONPlaceholder' } }` → `error.institution` pada envelope.
5. ESLint: `fetch(` dan import `axios` dilarang di luar `src/core/http/**`.

**Acceptance criteria**

- [x] Vendor 401 → client 502, body vendor tidak muncul di respons.
- [x] Request outbound membawa `X-Request-ID` yang sama dengan request masuk.

### Step 4.2 — Template integrasi & cache token vendor

**Langkah**: pola vendor berbasis login (`getAccessToken()` di-cache sampai `expires_in − 60 dtk`, single-flight agar request paralel tidak login berulang); `config/<vendor>.config.ts`; `references/integrations.md` + bagian di `scaffold-module`.

**Acceptance criteria**

- [x] 10 request paralel saat token kosong → 1 kali login (test).

---

## Fase 5 — Inbound: Partner & Webhook Vendor

Spesifikasi signing di [L5](#155-l5--signing-partner-v1). Dua kanal inbound (D23): Partner API (5.1–5.5) dan webhook vendor (5.6).

### Step 5.1 — Utilitas kripto & signing

**Langkah** (murni, di `src/utils/`): `secret-cipher.util.ts` (AES-256-GCM, IV 12 byte acak, format `v1.<keyId>.<iv>.<tag>.<ciphertext>` base64url, keyring untuk rotasi); `partner-signature.util.ts` (`buildCanonicalString`, `canonicalQuery`, `signV1`, `verifyV1` timing-safe); `ip-match.util.ts` (IPv4/IPv6/CIDR, normalisasi `::ffff:`); `route-match.util.ts` (tanpa `*` = exact; `/x/*` = `x` dan turunannya, batas segmen; tolak `..`).

**Acceptance criteria**

- [x] Vektor uji signing tetap (fixture) lulus; ciphertext key lama tetap bisa didekripsi setelah rotasi active key.

### Step 5.2 — Kredensial partner

**Langkah**

1. `config/partner.config.ts` (L1).
2. Tabel `partner_credentials` (mandiri): `partner_code` (unik permanen, termasuk yang terhapus), `partner_name`, `api_key_hash`, `api_key_prefix`, `encrypted_secret`, `ip_whitelist` (`text[]`), `allowed_routes` (`text[]`), `rate_limit_rpm`, `is_active`, timestamps, audit, `deleted_at`; `redact: ['apiKeyHash', 'encryptedSecret']`.
3. Admin API `/api/v1/partner-credentials` (`requireRole('admin')`): create, list, detail, update, `POST /:id/secret-rotations`, `POST /:id/api-key-rotations`, deactivate, soft delete. API key & secret plaintext hanya di respons create/rotasi.

**Acceptance criteria**

- [x] Respons list/detail tidak memuat `api_key_hash`, `encrypted_secret`.
- [x] Non-admin → 403.

### Step 5.3 — Middleware `partnerAuth()`

**Langkah**: di-mount `app.use('/api/v1/partner/*', partnerAuth())`; urutan: header wajib → drift timestamp (`PARTNER_HMAC_TOLERANCE_MS`) → lookup by `sha256(api key)` (cache + negative cache) → aktif → IP whitelist (kosong = semua) → route ACL → baca raw body **sekali** (`arrayBuffer`, disimpan untuk handler) → signature → nonce `setIfAbsent` → rate limit per partner (`increment`) → `setActor('partner:<code>')`; log audit tunggal `{ audit: 'partner', outcome, reason, partnerCode, method, path, clientIp, statusCode, durationMs }` di `finally`. Contoh `GET /api/v1/partner/ping`.

**Acceptance criteria**

- [x] Test per cabang penolakan dengan code di L2; replay (nonce sama) → 401 `ERR_PARTNER_REPLAY_REJECTED`; query diubah → 401 signature.
- [x] Handler tetap bisa membaca body JSON setelah verifikasi signature.
- [x] Redis mati → nonce & rate limit fail-open + log `warn` (trade-off didokumentasikan).

### Step 5.4 — Panduan integrasi partner

**Langkah**: `docs/partner-integration-guide.md` (generik: header, canonical string, contoh curl + TypeScript, daftar error code, rotasi kredensial); `scripts/partner-sign.ts` untuk uji manual.

### Step 5.5 — Konvensi kanal inbound & penegakannya

Keputusan D23–D28. Tujuan: konvensi kanal (biasa, partner, webhook) dan penamaan file **ditegakkan mesin**, sehingga tetap terjaga tanpa agent AI.

**Langkah**

1. Penamaan file modul (D24): `<modul>[.<kanal>].<peran>[.test].ts` — kanal `partner` | `webhook`, peran `routes` | `controller` | `service` | `repository` | `queries` | `dto` | `transformer` | `messages`, diawali nama folder modul. Ditegakkan **ls-lint** (regex per folder) dan bila ls-lint tidak bisa merujuk nama folder, oleh **test struktur** `test/structure.test.ts` yang membaca seluruh pohon `src/`; akhiran "nyaris benar" (`payments.partner-routes.ts`, yang lolos dari aturan arsitektur berbasis akhiran) ditolak.
2. Penamaan integrasi (D25): `src/integrations/<vendor>/<vendor>.<peran>.ts` — peran `service` | `dto` | `webhook` | `webhook.dto`, plus `index.ts`; ditegakkan dengan cara yang sama.
3. Modul dinamai domain, bukan vendor (D26): test struktur menolak folder `src/modules/<x>` yang sama dengan folder `src/integrations/<x>`.
4. Kanal terpasang di tempatnya: test struktur memastikan router dari `*.partner.routes.ts` hanya muncul di bawah `<API_BASE_PATH>/v1/partner`, router dari `*.webhook.routes.ts` hanya di `<API_BASE_PATH>/webhooks/<vendor>` (dipakai 5.6), dan route di bawah prefix itu tidak berasal dari file kanal lain.
5. ESLint per kanal (`no-restricted-syntax`, digabung ke grup aturan bersama): `*.partner.*` dilarang `requireRole` / `requireSelfOrRole` / `currentUser`; file non-partner dilarang `currentPartner` / `requirePartner`; `*.webhook.*` dilarang keduanya.
6. `requirePartner(...codes)` (D27): endpoint khusus satu partner → 403 `ERR_PARTNER_ROUTE_FORBIDDEN` untuk partner lain walau `allowed_routes` salah konfigurasi; terdokumentasi di OpenAPI seperti `requireRole()`.
7. Varian template `scaffold-module` "endpoint partner" (`<modul>.partner.routes.ts`, `currentPartner()`, kolom `partner_code` + `partner_reference` unik untuk idempotensi (D28), test kontrak bertanda tangan); ikut `bun run verify:scaffold`.
8. Rules & skills: invariant baru "Inbound Channels" di `.agents/AGENTS.md`, aturan + tabel penamaan di `project-standards` (SKILL + referensi), CONTRIBUTING (pohon, tabel penamaan, cara menambah endpoint partner), panduan partner §10.

**Acceptance criteria**

- [x] Setiap aturan di langkah 1–6 dibuktikan dengan chaos test (nama file salah, modul bernama vendor, router partner dipasang di luar `/partner`, `currentUser` di route partner, `currentPartner` di route biasa, `requirePartner` dilewati).
- [x] `bun run verify:scaffold` menghasilkan varian partner yang lolos semua gate.
- [x] Seluruh file yang ada sekarang lolos konvensi baru tanpa pengecualian (atau pengecualian tercatat dengan alasan).

### Step 5.6 — Webhook vendor inbound

Keputusan D23, D25, D28. Kontrak milik vendor; kita hanya memverifikasi dan menyimpan event secara idempoten.

**Langkah**

1. `webhookAuth({ vendor, verify })` di `src/core/middlewares/`: membaca body mentah sekali (cache Hono), memanggil `verify(rawBody, headers)` milik vendor (timing-safe), menolak 401 dengan kode `ERR_WEBHOOK_SIGNATURE_INVALID` (registry + i18n), satu log audit per request (`audit: 'webhook'`), actor `webhook:<vendor>` (tipe `Actor` diperluas).
2. Prefix **`<API_BASE_PATH>/webhooks/<vendor>`, di luar `/v1`** (D23): versi kontrak webhook milik vendor. Rute di luar `/v1` saat ini publik secara desain, maka prefix ini dijaga fail-closed: setiap route di bawah `/webhooks/*` wajib lewat `webhookAuth()`; `test/default-deny.e2e.test.ts` menuntut 401 tanpa signature valid, termasuk untuk route webhook yang lupa dipasang verifier.
3. Vendor contoh dummy di `src/integrations/<vendor>/`: `<vendor>.webhook.ts` (verifikasi HMAC-SHA256 atas body, header vendor), `<vendor>.webhook.dto.ts` (schema payload vendor, divalidasi Zod tanpa aturan snake_case request), `src/config/<vendor>.config.ts` (`<VENDOR>_WEBHOOK_SECRET`), entri `INTEGRATION_REGISTRY`. Wiring verifier di `createApp()` (seperti lookup partner); dependency-cruiser: `*.webhook.ts` integrasi tidak boleh diimpor controller/route modul.
4. Tabel `webhook_events` (append-only, `AppendOnlyRepository`): `vendor`, `event_id`, `event_type`, `payload` (jsonb), `received_at`; unique `(vendor, event_id)` → event yang dikirim ulang vendor dijawab 2xx tanpa duplikat (D28). Pemrosesan tetap sinkron (simpan → 200); job queue tetap di backlog.
5. Modul contoh bernama domain (D26), mis. `src/modules/<domain>/<domain>.webhook.routes.ts` + controller + service; test struktur (5.5) menjaga pemasangannya.
6. OpenAPI: operasi webhook ditandai tag "Webhooks" + skema keamanan signature vendor + 401; `test/openapi.e2e.test.ts` diperluas.
7. Varian template `scaffold-module` "webhook" + varian integrasi `<vendor>.webhook.ts`; ikut `verify:scaffold`. Dokumentasi: skill (`project-standards`, `integrations.md`), CONTRIBUTING, panduan menambah vendor webhook.

**Acceptance criteria**

- [x] Signature salah / header hilang → 401; event dengan `event_id` sama dua kali → dua-duanya 2xx, satu baris di `webhook_events`.
- [x] Route di bawah `/webhooks/*` tanpa `webhookAuth()` membuat test default-deny gagal (chaos test).
- [x] Probe asli (Postgres + Redis lokal): webhook vendor dummy diterima, duplikat diabaikan, signature salah ditolak.

---

## Fase 6 — Integration Test

### Step 6.1 — Postgres + Redis asli

**Langkah**

1. Layanan uji dari env (`TEST_DATABASE_URL`, `TEST_REDIS_HOST`/`TEST_REDIS_PORT`/`TEST_REDIS_DB`): PostgreSQL & Redis yang terpasang lokal **atau** `docker-compose.test.yml` (opsional — Postgres 16 + Redis, port terpisah, tmpfs). Database uji wajib terpisah dari database pengembangan; key Redis memakai prefix uji khusus dan dihapus per key (tanpa `FLUSH*`).
2. `test/integration/setup.ts`: DB sekali pakai — migrasi dijalankan oleh setup test (bukan oleh AI agent ke DB developer); script `test:int` terpisah dari `test`.
3. Skenario: audit & rollback nyata, soft delete/restore, `syncForParent`, `activeUniqueIndex`, rotasi & reuse refresh token, nonce partner, `increment` atomik paralel, skrip Lua jalan di versi Redis tertua yang didukung (≥ 2.6; lokal user 3.0), fail-open saat Redis dihentikan.
4. Job CI `integration` dengan service container (Docker hanya di CI; lokal boleh layanan native).

**Acceptance criteria**

- [x] `bun run test:int` hijau lokal (22 test, PostgreSQL 17.6 + Redis 3.0). Job CI `integration` (PostgreSQL 16 + Redis 7) ditulis, **belum pernah jalan** — belum ada remote GitHub.

---

## Fase 7 — Dokumentasi, Skills & Release

### Step 7.1 — `ARCHITECTURE.md` generik + sinkronisasi docs

**Langkah**: tulis `ARCHITECTURE.md` (struktur seperti blueprint: apa & mengapa + rujukan ke sumber detail, isi Bun/Hono, generik); pindahkan `ARCHITECTURE_BLUEPRINT_FROM_NESTJS.md` ke `docs/archive/`; sinkronkan `README.md` (quickstart ≤ 150 baris) & `CONTRIBUTING.md`; setiap aturan diberi label penegak `[tsc]`, `[eslint:<rule>]`, `[depcruise:<rule>]`, `[ls-lint]`, `[test]`, `[ci]`, `[review-only]`.

### Step 7.2 — Docs SSOT: `docs/standards/` (D32)

Tujuan: setiap standar ditulis **sekali**, di satu file per topik, dan dibaca developer maupun agent dari file yang sama; dokumen lain hanya merujuk.

**Langkah**: pindahkan `project-standards/references/*.md` ke `docs/standards/`; pecah CONTRIBUTING per topik ke sana (EN); gabungkan aturan dari skill `project-standards` dan `AGENTS.md`; CONTRIBUTING, `AGENTS.md`, skill `project-standards` / `env-protection` / `generate-commit-text` menjadi router; prosa skill `scaffold-module` merujuk; `ARCHITECTURE.md` EN; README hanya quickstart + tautan; `EXAMPLE_MODULES`, `docs-sync` dan rujukan di kode mengikuti; penjaga anti-duplikasi.

**Acceptance criteria**

- [x] Setiap standar punya tepat satu file di `docs/standards/`; router tidak berisi blok kode dan dalam batas barisnya (`test/docs-sync.test.ts`).
- [x] Setiap tautan relatif + anchor di dokumen yang dipelihara resolve; tidak ada rujukan ke `project-standards/references/`.
- [x] `bun run lint:setup`, `validate:full`, `build`, `verify:scaffold` hijau.

### Step 7.3 — CLI scaffolder `bun run scaffold` (D31)

Tujuan: modul baru bisa dibuat tanpa agent AI, dari template yang sama dengan skill `scaffold-module` (markdown tetap satu-satunya sumber; tidak ada string template di script).

**Langkah**

1. Library `scripts/lib/scaffold.ts`: parser template (dipindah dari `materialize` / `fill` di `verify-scaffold.ts`), turunan nama dari kebab-case (snake, Pascal, camel; jamak/tunggal dengan aturan sederhana + `--singular=<nama>` untuk bentuk tak beraturan), wiring dengan anchor permanen yang gagal keras (`replaceAnchor`, Review 10).
2. `scripts/scaffold.ts` + script `scaffold` di `package.json`: `module <nama> [--variant=standalone|header-detail|record]`, `partner <nama>`, `webhook <nama> --vendor=<vendor>`, `integration <vendor>`; validasi kebab-case, tolak modul bernama vendor (D26) dan file yang sudah ada, `--dry-run`; wiring (`app.ts`, barrel schema, `APPEND_ONLY_TABLES`, `WEBHOOK_VENDORS`, registry, barrel config); prettier hanya pada file yang dibuat/diubah; mencetak langkah berikutnya (`bun run db:generate`, isi field domain) tanpa menjalankan migrasi.
3. `verify:scaffold` memakai CLI (generate → semua gate → bersihkan), sehingga CLI ikut terverifikasi di CI.
4. Skill `scaffold-module`: jalankan CLI dulu, lalu sesuaikan field domain; `docs/standards/new-module.md` dan `quality-gates.md` (tabel perintah).

**Acceptance criteria**

- [x] `bun run scaffold module <probe>` → typecheck, lint, test modul hijau; setelah dihapus `git status` bersih.
- [x] Setiap varian lewat `verify:scaffold` memakai CLI; tidak ada string template di luar markdown skill.
- [x] Berfungsi juga di proyek hasil `bun run setup` (tanpa contoh).

### Step 7.3b — Modul dependent: anak dengan acuan parent (D33)

Tujuan: anak yang dibuat bertahap dan punya halaman sendiri (contoh umum: pengajuan → dokumen / pihak terkait; proyek → tugas; pelanggan → alamat) bisa di-scaffold sebagai modul sendiri, sementara aturan "parent ada, hidup, dan pemilik anak ini" dijaga oleh repository base, tidak ditulis ulang di setiap service.

| | `header-detail` (komposisi) | Dependent (D33) |
|---|---|---|
| Halaman FE | bagian form header | halaman sendiri |
| Route | `/<header>/:id/<detail>[/:childId]` | shallow nesting: `GET` / `POST /<parent>/:<parent>Id/<jamak>`; `GET` / `PATCH` / `DELETE /<jamak>/:id`, `POST /<jamak>/:id/restore` |
| Create | lewat header | `POST /<parent>/:<parent>Id/<jamak>` (parent dari path, body tanpa id parent) |
| List lintas parent | — | tidak di-generate (butuh filter kepemilikan; ditambah sadar oleh developer) |
| Hapus | hard delete + snapshot | soft delete + restore |
| Repository | `ChildRepository` | `DependentRepository` |
| Folder | modul header | modul sendiri di subfolder parent (`src/modules/<parent>/<anak>/`) |
| Kapan dibuat | bersama header (satu perintah) | kapan saja setelah parent ada; parent tidak diedit |

Varian 1:1 (`--one`, section): paling banyak satu anak hidup per parent (`activeUniqueIndex` pada kolom parent), route `GET /<parent>/:<parent>Id/<section-tunggal>` (404 bila belum ada), `PUT` (upsert: buat bila belum ada, ubah bila ada), `DELETE` (soft); per baris `GET /<jamak>/:id` dan `POST /<jamak>/:id/restore`. Repository yang sama ditambah `findOneForParent` / `upsertForParent`. Soft delete berlaku juga: setelah anak 1:1 dihapus, parent boleh mendapat anak 1:1 baru; restore anak lama selagi ada yang hidup → 409 (`isUniqueViolation`, pola restore `users`).

Pemasangan: `<jamak>.routes.ts` meng-export dua router (di bawah parent dan datar), didaftarkan CLI di `src/app.ts` lewat anchor; folder modul parent tidak disentuh. Parameter mount terbukti di Hono 4.13 (`v1.route('/applications/:applicationId/members', r)` → `c.req.param('applicationId')`, `app.routes` memuat path lengkap).

Hapus: anak selalu **soft delete** (1:N dan 1:1) dengan `deleted_at` sendiri, terpisah dari parent — parent dihapus tidak mengubah `deleted_at` anak (hanya menyembunyikan); restore parent memunculkan anak yang hidup, anak yang dihapus sendiri tetap terhapus; restore anak selagi parent terhapus → 404.

**Langkah**

1. `src/database/dependent.repository.ts` — `DependentRepository<TTable, TParent>`: bentuk `BaseRepository` (audited, soft delete, actor stamps) ditambah parent:
   - read (`findById`, `findPage`, `count`, filter per parent) lewat `scoped()` + `EXISTS` parent hidup → anak dari parent terhapus tidak terlihat (404 pada get), muncul lagi saat parent di-restore; tanpa cascade;
   - write (`create`, `updateById`, `softDeleteById`, `restoreById`) mengunci parent hidup lebih dulu (urutan kunci sama dengan `ChildRepository`: parent → anak), parent hilang / terhapus → `NotFoundError`;
   - kolom referensi parent tidak bisa diubah lewat input update; audit dengan `parent_table` / `parent_id`;
   - hook `protected parentScope(): SQL | undefined` (default `undefined`) digabung ke `EXISTS` read dan ke penguncian parent saat write: kepemilikan (mis. `owner_id` = user pemanggil) ditulis sekali per modul, parent di luar scope = 404 (tidak membocorkan keberadaan);
   - hook `protected assertParentWritable(parent)` (default tidak melakukan apa-apa) dipanggil di setiap write — juga ditambahkan ke `ChildRepository` — untuk mengunci anak menurut status parent (transisi status tetap urusan domain).
2. Unit test dengan SQL recorder + tabel uji (`test/helpers/repository-fixtures.ts`) dan integration test Postgres asli (`test/integration/data-layer.int.ts`): parent terhapus menyembunyikan anak; restore memunculkan kembali; write ke anak dari parent terhapus ditolak; referensi parent tidak bisa dipindah; hook memblokir write; `parentScope()` menyembunyikan parent orang lain di read & write (404); dua write paralel pada parent yang sama tidak deadlock.
3. Template `.agents/skills/scaffold-module/references/dependent.md` (schema dengan `parentReference` + index + `softDelete`, DTO tanpa id parent (dari path) + skema param `<parent>Id`, repository, service, transformer, controller, routes, test lengkap sampai coverage) dan CLI: `bun run scaffold module <jamak> --parent=<parent-jamak> [--one] [--parent-singular=<nama>]` (template 1:1 di file yang sama atau `references/dependent-one.md`, diputuskan saat implementasi). Parent wajib modul yang sudah ada dengan tabel standalone / header (punya `softDelete`); parent yang dependent ditolak (maksimal 2 level, rantai lebih dalam → backlog); `--parent` hanya untuk varian standalone; segmen yang bentrok dengan route parent yang sudah ada (mis. detail `header-detail` bernama sama) ditolak.
4. `verify:scaffold` menjalankan varian dependent 1:N dan 1:1 (parent = modul probe standalone yang di-generate lebih dulu di run yang sama — membuktikan alur bertahap) lewat semua gate termasuk coverage.
5. Docs (D32): `docs/standards/database.md` §6 (jenis tabel + repository), `docs/standards/new-module.md` §1–2 (varian, perintah, opsi, kapan `header-detail` vs dependent), `ARCHITECTURE.md` §12 (aturan baru + label penegak), skill `scaffold-module` (pemilihan varian), panduan FE bila kontrak list berubah.

**Acceptance criteria**

- [x] `bun run scaffold module <probe-anak> --parent=<probe-parent>` → semua gate hijau termasuk coverage; setelah dihapus `git status` bersih.
- [x] Anak dari parent yang di-soft-delete tidak muncul di list / get dan tidak bisa ditulis; muncul kembali setelah restore (unit + integration).
- [x] 1:1: anak kedua untuk parent yang sama ditolak oleh database (integration: `PUT` paralel tetap satu baris); `PUT` kedua mengubah baris yang ada.
- [x] Menambah anak ke modul standalone yang sudah ada tidak mengubah satu pun file modul parent (`git diff` hanya file anak + registrasi).
- [x] Parent di luar `parentScope()` → 404 untuk list, get, create, update, delete, restore anak (unit + integration).
- [x] Route anak terdaftar dengan bentuk shallow nesting, terlindungi `authenticate()` (test default-deny) dan terdokumentasi (test OpenAPI).
- [x] Chaos test: menghapus cek parent di read atau write → test gagal; `parentScope()` diabaikan → test gagal; parent dependent / varian lain dengan `--parent` → CLI menolak dengan pesan + perintah yang benar.
- [x] `bun run validate:full`, `build`, `verify:scaffold`, `test:int` hijau.

### Step 7.4 — Finalisasi skills AI

**Langkah**: skill baru `review-code` (gate review memakai §14.1, dipanggil sebelum step dinyatakan selesai); (pemisahan `database-standards` tidak perlu lagi: standar database ada di `docs/standards/database.md`, D32); perbarui `scaffold-module`, `init-project`, `project-standards`, `generate-commit-text` (scope baru: `auth`, `partner-credentials`, …); wrapper `.claude/skills/` untuk skill baru; `CLAUDE.md` tetap hanya import. `init-project` dan README: opsi riwayat git baru = hapus `.git` (konfirmasi eksplisit tepat sebelum menghapus) → `git init -b main` → `bun run prepare` (wajib: Husky menyimpan `core.hooksPath` di `.git/config`, tanpa ini hook mati diam-diam) → commit awal hanya atas persetujuan user (hook pre-commit ikut berjalan).

### Step 7.5 — Release check boilerplate v1.0.0

**Langkah**: hapus `docs/plans/from-nestjs-plan.md` (keputusan user 2026-10-08, lihat 4.1) → clone bersih → `/init-project demo-backend` → `docker compose up -d` → migrasi → `bun run seed:admin` → `bun run dev` → smoke test (health, login, refresh, `/users`, partner ping) → `bun run scaffold module <probe>` + gate → `bun run build` → `docker build` + container `healthy` → `CHANGELOG.md` → tag `v1.0.0`.

**Acceptance criteria**

- [ ] Seluruh alur di atas berjalan tanpa edit manual selain `.env` lokal.

---

## 14. Definition of Done, Template Review & Risiko

### 14.1 Definition of Done (setiap step)

- [ ] `bun run validate:full` hijau dan `bun run build` sukses.
- [ ] Test baru menutup perilaku baru (unit; e2e bila menyentuh HTTP). **Setiap cabang logika** (klasifikasi, pemetaan status, fallback) punya test eksplisit — coverage Bun hanya mengukur baris, bukan cabang.
- [ ] Aturan baru ditegakkan mesin (atau ditandai `[review-only]` dengan alasan).
- [ ] Dokumen terdampak diperbarui di commit yang sama: file topik di `docs/standards/` (satu-satunya sumber, D32) + baris aturan di `ARCHITECTURE.md` §12 bila aturan baru / penegaknya berubah; router (`CONTRIBUTING.md`, `.agents/AGENTS.md`, skill) hanya bila daftar topik berubah; `.env.example`. Bila API inti yang dipakai template berubah (errors, response, middlewares, dto, i18n, openapi, database) → `bun run verify:scaffold` hijau.
- [ ] Endpoint baru memakai `describeEndpoint()` dengan skema response di `<module>.dto.ts` (`test/openapi.e2e.test.ts` hijau).
- [ ] Nilai yang membawa nama proyek → `IDENTITY_RULES`; `bun run setup demo --dry-run` lulus.
- [ ] Env var baru → Zod di `src/config/` + `.env.example` + [L1](#151-l1--registry-env-var).
- [ ] Perintah ke database dijalankan developer; AI agent hanya ke DB **lokal** developer dengan izin eksplisit (migrasi, cek read-only), SQL destruktif / baris uji selalu ditanyakan dulu, tidak pernah DB bersama/production.
- [ ] Tabel Progres (§5) dan Log (§4.1) diperbarui di commit step tersebut.
- [ ] `bun run test:int` hijau bila step menyentuh repository / base repository, transaksi, migrasi, auth, partner gateway atau cache (tidak ada di pre-push; job CI `integration`).
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

| Risiko | Dampak | Mitigasi |
|---|---|---|
| `@hono/zod-openapi` mensyaratkan Zod v4 | Perubahan API Zod di semua DTO | Spike time-box di 1.9; alternatif `hono-openapi` (D17) |
| Bun coverage tanpa branch coverage | Ambang branch blueprint hilang; cabang bisa "100%" tanpa pernah dites | Ambang functions + per file (D19); DoD mewajibkan test per cabang (temuan review: klasifikasi `HttpClientService`); tinjau saat Bun mendukung |
| `@Transactional()` bergantung `experimentalDecorators` | Breaking saat migrasi decorator TC39 | `runInTransaction()` tetap tersedia sebagai jalur eksplisit |
| Body dibaca dua kali (signature + JSON) | Body kosong di handler | Baca `arrayBuffer` sekali di `partnerAuth`; acceptance criteria 5.3 |
| Refresh paralel antar tab memicu reuse detection | User ter-logout | FE single-flight refresh (`docs/auth-guide.md`); evaluasi grace window bila perlu |
| Enumerasi `app.routes` berubah antar versi Hono | Test default-deny rapuh | Test memverifikasi lewat request nyata (401), bukan struktur internal |
| Fail-open Redis melemahkan nonce, rate limit, brute-force limit | Jendela replay / brute force | Toleransi timestamp sempit; log `warn`; health `DEGRADED` memicu alert |
| Rule ESLint baru memunculkan pelanggaran di kode lama | Step tidak bisa hijau | Step yang menambah rule sekaligus memperbaiki pelanggarannya |

---

## 15. Lampiran — Spesifikasi & Snippet Referensi

### 15.1 L1 — Registry env var

| Variabel | Step | Default | Validasi / catatan |
|---|---|---|---|
| `NODE_ENV` | ada | `development` | `development \| production \| test` |
| `PORT` | ada | `3000` | `int().positive()` (1.1) |
| `APP_NAME` | ada | nama proyek | `IDENTITY_RULES` |
| `API_PREFIX` → `API_BASE_PATH` | 1.8 | `/api` | versi di kode (`/v1`) |
| `LOG_LEVEL` | ada | `info` | enum pino |
| `DATABASE_URL` | ada | — | wajib di luar test |
| `DB_MAX_CONNECTIONS` | ada | `20` |  |
| `DB_IDLE_TIMEOUT_SECONDS` | ada | `30` |  |
| `DB_SCHEMA` | 2.2 | — | **dihapus** (tabel selalu di `public`; masuk `RENAMED_ENV_VARS`) |
| `REDIS_HOST` / `PORT` / `PASSWORD` / `DB` | ada | `localhost` / `6379` / — / `0` |  |
| `REDIS_KEY_PREFIX` | 1.6 | `<APP_NAME>:<NODE_ENV>` | override |
| `REDIS_COMMAND_TIMEOUT_MS` | 1.6 | `1000` |  |
| `CORS_ORIGIN` → `CORS_ORIGINS` | 1.7 | kosong (CORS mati) | CSV URL; `*` ditolak di production |
| `TRUST_PROXY_HOPS` | 1.7 | `0` | `int().min(0)` |
| `HTTP_BODY_LIMIT_BYTES` | 1.7 | `1048576` |  |
| `RATE_LIMIT_WINDOW_SECONDS` | 1.7 | `900` | menggantikan `RATE_LIMIT_WINDOW_MS` |
| `RATE_LIMIT_MAX` | ada | `1000` (Review 8; sebelumnya `100`) | per IP per jendela |
| `DEFAULT_LOCALE` | 1.4 | `id` | `id \| en` |
| `API_DOCS_ENABLED` | 1.9 | `true` kecuali production |  |
| `JWT_SECRET` | 3.1 | — (test: nilai dummy) | `min(32)` |
| `JWT_ISSUER` / `JWT_AUDIENCE` | 3.1 | `APP_NAME` |  |
| `ACCESS_TOKEN_TTL_SECONDS` | 3.1 | `900` |  |
| `REFRESH_TOKEN_TTL_SECONDS` | 3.1 | `604800` (7 hari) | sliding per rotasi; maks `34560000` (400 hari, batas `Max-Age` cookie — Review 8) |
| `REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS` | 3.1 | `2592000` (30 hari) | batas umur satu family |
| `AUTH_COOKIE_SAMESITE` | 3.1 | `Strict` | `Strict \| Lax \| None` (`None` wajib HTTPS lintas situs) |
| `AUTH_REGISTRATION_ENABLED` | 3.1 | `false` |  |
| `AUTH_LOGIN_MAX_ATTEMPTS` | 3.1 | `5` | per `(email, ip)` |
| `AUTH_LOGIN_LOCK_SECONDS` | 3.1 | `900` |  |
| `PARTNER_HMAC_TOLERANCE_MS` | 5.2 | `300000` |  |
| `PARTNER_SECRET_KEYS` | 5.2 | — | `k1:<64hex>[,k0:<64hex>]`; diisi `bun run setup` di env lokal |
| `PARTNER_SECRET_ACTIVE_KEY_ID` | 5.2 | — | harus ada di keyring; diisi `bun run setup` (`k1`) |
| `JSONPLACEHOLDER_BASE_URL` / `TIMEOUT_MS` | ada | contoh | contoh integrasi |
| `DEMO_PAY_WEBHOOK_SECRET` | 5.6 | kosong | contoh webhook vendor; kosong = webhook Demo Pay nonaktif (semua 401) |
| `DEMO_PAY_WEBHOOK_TOLERANCE_SECONDS` | 5.6 | `300` | umur maksimum timestamp bertanda tangan |
| `EXTERNAL_VENDOR_*` | 1.1 | — | **dihapus** di 1.1 (tidak pernah dipakai kode) |
| `TEST_DATABASE_URL` | 6.1 | — | hanya `bun run test:int` (tidak dibaca aplikasi): database yang sudah ada di server uji, runner membuat/menghapus `<nama>_it_<run>` darinya; kosong = `DATABASE_URL` hanya bila `NODE_ENV` development/test dan localhost |
| `TEST_REDIS_HOST` / `PORT` / `PASSWORD` / `DB` | 6.1 | — / `6379` / — / `0` | hanya `bun run test:int`; diisi = seluruh setelan Redis dari `TEST_REDIS_*` (tidak dicampur `REDIS_*`) |

### 15.2 L2 — Error types & `APP_ERROR_CODES`

| `error.type` | HTTP | Contoh code |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `ERR_INVALID_INPUT`, `ERR_INVALID_JSON`, `ERR_NON_SNAKE_CASE_KEY` |
| `BAD_REQUEST` | 400 | `ERR_BAD_REQUEST` |
| `UNAUTHORIZED` | 401 | `ERR_UNAUTHORIZED`, `ERR_AUTH_INVALID_CREDENTIALS`, `ERR_AUTH_TOKEN_EXPIRED`, `ERR_AUTH_TOKEN_INVALID`, `ERR_AUTH_REFRESH_INVALID`, `ERR_AUTH_REFRESH_REUSED`, `ERR_PARTNER_HEADERS_MISSING`, `ERR_PARTNER_INVALID_KEY`, `ERR_PARTNER_REPLAY_REJECTED`, `ERR_PARTNER_SIGNATURE_INVALID`, `ERR_WEBHOOK_SIGNATURE_INVALID` |
| `FORBIDDEN` | 403 | `ERR_FORBIDDEN`, `ERR_ROLE_FORBIDDEN`, `ERR_CSRF_ORIGIN_FORBIDDEN`, `ERR_PARTNER_IP_FORBIDDEN`, `ERR_PARTNER_ROUTE_FORBIDDEN` |
| `NOT_FOUND` | 404 | `ERR_NOT_FOUND`, `ERR_ROUTE_NOT_FOUND` |
| `CONFLICT` | 409 | `ERR_CONFLICT` |
| `PAYLOAD_TOO_LARGE` | 413 | `ERR_PAYLOAD_TOO_LARGE` |
| `TOO_MANY_REQUESTS` | 429 | `ERR_RATE_LIMITED`, `ERR_AUTH_LOGIN_LOCKED` |
| `SERVICE_UNAVAILABLE` | 503 | `ERR_SERVICE_UNAVAILABLE` |
| `EXTERNAL_SERVICE_ERROR` | 502/504 | `ERR_EXT_ERROR`, `ERR_EXT_UNREACHABLE`, `ERR_EXT_TIMEOUT` |
| `INTERNAL_SERVER_ERROR` | 500 | `ERR_INTERNAL` |

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

`EXTERNAL_SERVICE_ERROR` menambahkan `error.institution` (nama vendor dari `INTEGRATION_REGISTRY`); `error.origin` = kode integrasi, `details` = pesan generik — body vendor hanya di log (Step 4.1).

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

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid v7 PK |  |
| `user_id` | uuid FK | index |
| `family_id` | uuid | index; sama untuk satu rantai rotasi |
| `token_hash` | char(64) | unique, `sha256(token)` hex |
| `expires_at` | timestamptz | `min(now + TTL, family_started_at + ABSOLUTE_TTL)` |
| `family_started_at` | timestamptz |  |
| `revoked_at` | timestamptz | null = aktif |
| `replaced_by_id` | uuid | token pengganti |
| `user_agent` | varchar(255) |  |
| `ip` | varchar(45) |  |
| `created_at` | timestamptz |  |

**Kolom `users.password_changed_at`** (Review 8, migrasi `0006`): diisi saat ganti password / reset admin; refresh menolak family dengan `family_started_at` < nilai ini.

**Endpoint** (`/api/v1/auth`)

| Endpoint | Auth | Request | Response `data` |
|---|---|---|---|
| `POST /login` | publik | `{ "email", "password" }` | `{ "access_token", "token_type": "Bearer", "expires_in", "user" }` + `Set-Cookie` |
| `POST /refresh` | cookie + csrf | — | `{ "access_token", "token_type", "expires_in" }` + `Set-Cookie` baru |
| `POST /logout` | cookie + csrf | — | `null` + cookie dihapus (idempoten) |
| `POST /logout-all` | access token | — | `null` |
| `GET /me` | access token | — | profil user |
| `POST /change-password` | access token | `{ "current_password", "new_password" }` | `{ "access_token", "token_type", "expires_in" }` + `Set-Cookie` baru; sesi lain dicabut (Review 8) |
| `POST /register` | publik, toggle | `{ "email", "full_name", "password" }` | 404 bila `AUTH_REGISTRATION_ENABLED=false` |

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

> **Diubah 2026-10-12 (lihat 4.1)**: `revoked_at IS NOT NULL` dibedakan — `replaced_by_id` terisi (token sudah dirotasi lalu dipakai lagi) = **reuse** (cabut family, `ERR_AUTH_REFRESH_REUSED`); tanpa pengganti (logout, logout-all, user nonaktif, family dicabut) = `ERR_AUTH_REFRESH_INVALID`.

### 15.4 L4 — `PUBLIC_ROUTES` & test default-deny

> **Diubah di Step 3.4 (lihat 4.1)**: `PUBLIC_ROUTES` relatif terhadap `<API_BASE_PATH>/v1` dan hanya berisi `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/register`; health, docs dan `/` publik karena berada di luar `/v1`. Pengecualian `/partner/*` ditambahkan di 5.3 — `authenticate()` melewatinya hanya setelah `partnerAuth()` memverifikasi partner (fail-closed); test default-deny menuntut 401 `ERR_PARTNER_HEADERS_MISSING` untuk route partner. Prefix `<API_BASE_PATH>/webhooks/*` (5.6) di luar `/v1` dan fail-closed: setiap route webhook harus milik vendor di `WEBHOOK_VENDORS` dan menjawab 401 `ERR_WEBHOOK_SIGNATURE_INVALID` tanpa signature. Implementasi: `src/core/security/public-routes.ts`, `test/default-deny.e2e.test.ts`. Snippet di bawah adalah rancangan awal.

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

| Header | Isi |
|---|---|
| `x-partner-key` | API key (plaintext dari partner) |
| `x-partner-timestamp` | Unix epoch **milidetik** |
| `x-partner-nonce` | `^[A-Za-z0-9_-]{16,64}$`, sekali pakai |
| `x-partner-signature` | HMAC-SHA256 hex lowercase |

```
canonical = "v1" + "\n" + timestamp + "\n" + nonce + "\n" + METHOD + "\n" + path + "\n" + canonicalQuery + "\n" + sha256hex(rawBody)
signature = hex(HMAC_SHA256(secret, canonical))
```

- `path`: path URL persis seperti dikirim (tanpa query), tanpa normalisasi trailing slash.
- `canonicalQuery`: pasangan `key=value` di-encode RFC 3986, diurutkan berdasarkan key lalu value, digabung `&`; tanpa query → string kosong.
- Body kosong → `sha256hex("")`.

### 15.6 L6 — DDL `record_changes`

```sql
CREATE TABLE "record_changes" (
  "id"         bigint      GENERATED ALWAYS AS IDENTITY,
  "changed_at" timestamptz NOT NULL DEFAULT now(),
  "table_name" text        NOT NULL,
  "record_id"  text        NOT NULL,
  "action"     text        NOT NULL CHECK ("action" IN ('UPDATE', 'SOFT_DELETE', 'RESTORE', 'DELETE')),
  "changes"    jsonb       NOT NULL,   -- UPDATE: {"col": {"from": x, "to": y}} · DELETE: snapshot
  "actor"      text        NOT NULL,   -- user:<id> | partner:<code> | system
  "request_id" text,
  "parent_table" text,                 -- header dari baris detail (ChildRepository); keduanya terisi atau keduanya null
  "parent_id"    text,
  PRIMARY KEY ("id", "changed_at"),    -- partition-ready: tanpa FK & unique lain
  CHECK (("parent_table" IS NULL) = ("parent_id" IS NULL))
);
CREATE INDEX "record_changes_lookup_idx" ON "record_changes" ("table_name", "record_id", "changed_at" DESC);
CREATE INDEX "record_changes_parent_idx" ON "record_changes" ("parent_table", "parent_id", "changed_at" DESC) WHERE "parent_id" IS NOT NULL;
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

| Step | Larangan | Selector |
|---|---|---|
| 1.3 | Literal error code di luar registry | `Literal[value=/^ERR_/]`, `TemplateElement[value.raw=/^ERR_/]` (kode yang dibangun dinamis) |
| 1.3 | `throw new Error` / `throw Error` di modul | `ThrowStatement > :matches(NewExpression, CallExpression)[callee.name="Error"]` |
| 1.4 | Pesan literal | `NewExpression[callee.name=/^(ApiResponse\|(?!InternalServerError$)[A-Za-z]+Error)$/] > :matches(Literal[raw=/^['"]/], TemplateLiteral)` + `Property[key.name="message"]` di dalam `new XError(...)` |
| 2.1 | `new Date(...)` (juga tanpa argumen — diperketat, lihat 4.1) / `Temporal.Now` / `Date.parse` | `NewExpression[callee.name="Date"]`, `MemberExpression[object.name="Temporal"][property.name="Now"]`, `MemberExpression[object.name="Date"][property.name="parse"]` |
| 2.1 | Getter/formatter waktu lokal | `CallExpression[callee.property.name=/^(getHours\|getMinutes\|getDate\|getDay\|getMonth\|getFullYear\|getTimezoneOffset\|toLocaleString\|toLocaleDateString\|toLocaleTimeString)$/]` |
| 2.6 | Tulis DB langsung di repository modul | `CallExpression[callee.property.name=/^(update\|delete)$/]` + objek `tx` (`this.txHost.tx` atau variabel `tx`) |
| 2.6 | Repository modul tanpa base | `ClassDeclaration:not([superClass.name=/^(BaseRepository\|ChildRepository\|AppendOnlyRepository\|ReadOnlyRepository)$/])` |
| 2.6 | `@Transactional()` di luar service | `Decorator[expression.callee.name="Transactional"]` |
| 2.6 | Raw query di luar `*.queries.ts` | `CallExpression[callee.property.name="execute"]` + objek `tx` |
| 2.6 | Raw SQL tulis | `TaggedTemplateExpression[tag.name="sql"] TemplateElement[value.raw=/\b(update\|delete\s+from)\b/i]` |
| 2.6 | `sql.raw` | `CallExpression[callee.object.name="sql"][callee.property.name="raw"]` |
| 4.1 | `fetch(` di luar `core/http` | `CallExpression[callee.name="fetch"]` |

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
        run: bunx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose
      - run: bun run typecheck
      - run: bun run lint
      - run: bun run lint:ls
      - run: bun run format:check
      - run: bun run lint:arch
      - run: bun run lint:deps
      - run: bun run lint:setup
      - run: bun run test:cov
      - run: bun run build
      - run: bun run verify:scaffold
  integration:            # Step 6.1: service container PostgreSQL 16 + Redis 7
    runs-on: ubuntu-latest
    services:             # postgres:16-alpine (POSTGRES_PASSWORD), redis:7-alpine, health checks
    env:
      NODE_ENV: test
      TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres
      TEST_REDIS_HOST: localhost
    steps:                # checkout, setup-bun 1.3.0, bun install --frozen-lockfile
      - run: bun run test:int
```

`lint:branch` lokal membaca branch git aktif; di CI (checkout detached) nama branch diberikan eksplisit lewat `-t`.

### 15.9 L9 — knip & check-coverage

```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": ["scripts/*.ts"],
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
5. Setiap `src/**/*.ts` (bukan test) wajib ada di lcov — Bun hanya menginstrumentasi file yang di-import test; barrel re-export murni dikecualikan otomatis.
6. Pengecualian hanya lewat `COVERAGE_EXCLUSIONS` (`path`, `reason`, `until`), dicetak di setiap run.
7. Cetak daftar pelanggaran (path + persentase / "not loaded by any test"), exit 1 bila ada.
8. Ambang didefinisikan sekali sebagai konstanta `THRESHOLDS` di script (SSOT); dokumen merujuk ke sini tanpa menyalin angka.

### 15.10 L10 — Urutan pipeline `createApp()`

```
 1. requestContext()        request ID (D9), locale, clientIp, actor = anonymous
 2. loggerMiddleware()      log masuk/keluar (requestId dari mixin)
 3. secureHeaders()
 4. cors()                  allowlist CORS_ORIGINS, credentials
 5. bodyLimit()             413
 6. rateLimit()             global per IP (fail-open), kecuali health, /v1/partner/*, /webhooks/*;
    rejectionLimit()        di dua prefix itu: per IP hanya jawaban 401/403 yang dihitung (D29)
 7. /api/health/*, /api/docs*                      publik
7b. app.use('/api/webhooks/<vendor>/*', webhookAuth(vendor)) per WEBHOOK_VENDORS,
    lalu app.use('/api/webhooks/*', requireVerifiedWebhook())   fail-closed (Fase 5.6)
 8. app.use('/api/v1/partner/*', partnerAuth())    HMAC (Fase 5)
 9. app.use('/api/v1/*', authenticate())           default-deny, kecuali PUBLIC_ROUTES & partner
10. app.route('/api/v1', v1Router)                 modul (requireRole per route)
    mountApiDocs()                                 /api/docs + /api/docs/openapi.json (terakhir; mati di production)
11. app.onError(globalErrorHandler) · app.notFound(notFoundHandler)
```

### 15.11 L11 — Struktur target

```
src/
├── app.ts · index.ts
├── config/        app, database, redis, http, auth, partner, satu per vendor (*.config.ts) + parse-env.ts
├── core/
│   ├── cache/     CacheService, CACHE_KEYS/PREFIX/TTL, redis.client
│   ├── context/   RequestContext (AsyncLocalStorage)
│   ├── dto/       common.dto.ts, datetime.dto.ts
│   ├── errors/    ApiError*, error-codes.ts
│   ├── http/      HttpClientService (hanya untuk integrations/)
│   ├── i18n/      messages.ts
│   ├── logger/
│   ├── middlewares/ request-context, client-ip, rate-limit (+ rejectionLimit), authenticate, require-role, partner-auth, require-partner, webhook-auth, validate, …
│   ├── openapi/   describeEndpoint, schemas (envelopes), common-headers, api-docs (document + Scalar)
│   ├── response/  ApiResponse
│   └── security/  jwt.ts, roles.ts, public-routes.ts
├── database/
│   ├── audited.repository.ts · base.repository.ts · child.repository.ts · dependent.repository.ts · append-only.repository.ts · read-only.repository.ts
│   ├── connection.ts · transaction-host.ts · transactional.decorator.ts · health-probe.ts · unique-violation.ts
│   ├── schema/    schemas.ts · columns.ts · domain/ · reference/
│   └── seeds/
├── integrations/  registry.ts · <vendor>/ (<vendor>.service.ts outbound, <vendor>.webhook.ts verifier inbound); contoh: jsonplaceholder/ (outbound), demo-pay/ (webhook, dihapus init-project)
├── modules/       auth/ · users/ · partner-credentials/ · partner-gateway/ (ping/echo) · health/ · orders/ + payment-notifications/ (contoh, dihapus init-project)
└── utils/         datetime, crypto, secret-cipher, partner-signature, ip-match, route-match, record-diff, request-id, locale, case-converter
```

### 15.12 L12 — Backlog

- JWT RS256/EdDSA + endpoint JWKS (verifikasi lintas service)
- MFA, reset password via email, verifikasi email
- ACL berbasis permission granular
- Retry dengan backoff & circuit breaker integrasi outbound
- Cache token vendor bersama antar instance (Redis + lock) untuk vendor yang hanya mengizinkan satu token aktif — `AccessTokenCache` saat ini per proses (Step 4.2)
- Rate limit per user setelah login (per IP hanya sebelum login) — Review 8 menaikkan default per IP sebagai langkah sederhana
- Daftar & pencabutan sesi per perangkat (`GET /auth/sessions`)
- Partisi bulanan `record_changes` + runbook retensi
- SonarQube & template CI GitLab
- OpenTelemetry tracing + metrics `/metrics`
- Job queue / scheduler dengan actor `system`
- Re-enkripsi secret partner ke active key baru tanpa mengganti secret (job / perintah, `needsReEncryption()` sudah ada di `secret-cipher.util.ts`) — kini rotasi keyring = rotasi secret per partner (Step 5.2)
- Webhook **keluar** (kita mengirim event ke partner: signing, retry, dead-letter) dan pemrosesan webhook masuk secara async (butuh job queue)
- Gateway partner di API gateway eksternal (Kong / Apigee / AWS API Gateway) atau subdomain terpisah untuk skala besar — `partnerAuth()` sudah terisolasi di satu middleware
- Validasi production: partner wajib `ip_whitelist` (setelah `TRUST_PROXY_HOPS` diukur per environment)
- Migrasi Zod 3 → 4 (`z.email()`, kode issue baru `invalid_value`, `issue.received` hilang → `describeIssue` di `parse-env.ts`, pemetaan issue di `validate()`); `hono-openapi` tetap kompatibel
- `header-detail` dengan lebih dari satu detail (komposisi): detail per subfolder `src/modules/<header>/<detail>/`, butuh perubahan aturan struktur (diskusi 7.3b; anak yang punya halaman sendiri sudah tertangani D33)
- Rantai dependent lebih dari 2 level (anak dari anak, mis. proyek → tugas → subtugas): read harus memeriksa seluruh rantai parent (D33 membatasi parent = tabel standalone / header)
- Penomoran dokumen otomatis (mis. `PGJ/2026/10/0001`): sequence per jenis + periode, aman konkuren, tidak bolong saat rollback bila diwajibkan
- Multi-tenant (SaaS), opsional: schema per tenant (`search_path` per request/transaksi, migrasi dijalankan ke setiap schema tenant, onboarding tenant = buat schema + migrasi) atau `tenant_id` + Row-Level Security — dipilih saat dibutuhkan, setelah semua fase selesai
