# Implementation Plan — Setup Hardening & Standards Enforcement

| Atribut      | Nilai                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status       | IN PROGRESS — F0–F5 selesai; keputusan tercatat di [Bagian 2.1](#21-log-keputusan)                                                                           |
| Tanggal      | 2026-10-03                                                                                                                                                   |
| Basis kode   | branch `boilerplate` @ `3034166`                                                                                                                             |
| Sumber audit | Audit menyeluruh repo (kode, tooling, CI, dokumen, skills/rules AI agent)                                                                                    |
| Baseline     | Semua gate hijau: typecheck, lint, ls-lint, format, depcruise, depcheck, 325 unit test, e2e, build. `npm audit`: 2 moderate (lolos karena threshold `high`). |

---

## Daftar Isi

1. [Ringkasan & Prinsip](#1-ringkasan--prinsip)
2. [Keputusan yang Perlu Dikonfirmasi](#2-keputusan-yang-perlu-dikonfirmasi)
3. [Roadmap & Urutan Eksekusi](#3-roadmap--urutan-eksekusi)
4. [Fase 0 — Governance Repo & Aturan AI Agent](#fase-0--governance-repo--aturan-ai-agent)
5. [Fase 1 — Security: Partner Gateway, Outbound, CORS](#fase-1--security-partner-gateway-outbound-cors)
6. [Fase 2 — Kontrak API (Casing, Swagger, Response DTO)](#fase-2--kontrak-api-casing-swagger-response-dto)
7. [Fase 3 — Enforcement Tooling (ESLint, Depcruise, Coverage, Sonar, Hooks)](#fase-3--enforcement-tooling)
8. [Fase 4 — Platform Correctness (Bootstrap, Config, Request ID, Redis, Health, Logging)](#fase-4--platform-correctness)
9. [Fase 5 — Standar Database & Migrasi](#fase-5--standar-database--migrasi)
10. [Fase 6 — Strategi Testing](#fase-6--strategi-testing)
11. [Fase 7 — CI/CD & Container](#fase-7--cicd--container)
12. [Fase 8 — Observability & Resilience](#fase-8--observability--resilience)
13. [Fase 9 — Restrukturisasi Dokumentasi & Sinkronisasi Skills](#fase-9--restrukturisasi-dokumentasi--sinkronisasi-skills)
14. [Definition of Done & Manajemen Risiko](#14-definition-of-done--manajemen-risiko)
15. [Lampiran — Spesifikasi & Snippet Referensi](#15-lampiran--spesifikasi--snippet-referensi)

---

## 1. Ringkasan & Prinsip

### 1.1 Masalah utama

Gate otomatis hijau, tetapi hijau ≠ patuh standar. Audit menemukan tiga kategori masalah:

1. **Celah keamanan nyata** di partner gateway (bocor secret, IP whitelist bisa di-spoof, HMAC lemah) dan outbound client (status vendor diteruskan, body vendor bocor).
2. **Celah enforcement** — banyak aturan di CONTRIBUTING/AGENTS ditulis "di-enforce", padahal tidak ada tool yang menegakkannya (atau override ESLint justru mematikannya).
3. **Drift dokumen ↔ kode** — dokumen, skills AI, dan kode saling bertentangan (ESM, error code, format enkripsi, coverage threshold, Redis mode).

### 1.2 Prinsip eksekusi

| #   | Prinsip                                       | Arti praktis                                                                                                                                 |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Security first**                            | Fase 1 dikerjakan sebelum fitur domain apa pun.                                                                                              |
| P2  | **Enforce, don't document**                   | Setiap aturan WAJIB punya penegak (tsc / ESLint / depcruise / ls-lint / test / CI). Aturan tanpa penegak ditandai eksplisit `[review-only]`. |
| P3  | **Compile-time > lint > review**              | Pilih penegakan paling awal yang mungkin (contoh: tabel referensi sebagai Drizzle view → mutasi tidak bisa di-compile).                      |
| P4  | **Single Source of Truth**                    | Satu angka/aturan hanya didefinisikan di satu tempat; dokumen lain merujuk, bukan menyalin.                                                  |
| P5  | **Satu MR per fase, kecil & dapat di-revert** | Setiap MR lulus `npm run validate:full` + `npm run build`, dan memperbarui dokumen yang disentuhnya.                                         |
| P6  | **Tidak ada data produksi** (asumsi)          | Perubahan format yang breaking (enkripsi, HMAC canonical, casing) dilakukan SEKARANG selagi belum ada partner/FE yang terhubung.             |

---

## 2. Keputusan yang Perlu Dikonfirmasi

Plan ini disusun dengan **rekomendasi default**. Jika ada yang tidak disetujui, fase terkait disesuaikan.

| ID  | Keputusan                                                                     | Opsi                                                                                | Rekomendasi                                                                                                   | Alasan / Dampak                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Casing payload **request** (body/query)                                       | (a) camelCase masuk, snake_case keluar (kondisi sekarang) · (b) snake_case dua arah | **(b) snake_case dua arah**                                                                                   | Kontrak FE simetris; `error.details[].field` konsisten dengan nama field yang dikirim FE; transformasi Swagger jadi sederhana (semua schema → snake_case). Fase 2.      |
| D2  | Ambang coverage (SSOT)                                                        | —                                                                                   | **Global: lines/functions/statements 95, branches 90. Per-file: 90 / branches 80**                            | Menyatukan 5 angka yang berbeda saat ini. Sonar new-code coverage ≥ 90 (server-side). Fase 3.                                                                           |
| D3  | ESM native vs CJS                                                             | (a) migrasi `"type": "module"` · (b) tetap CJS output, perbaiki dokumen             | **(b)**                                                                                                       | Jest ESM masih eksperimental, NestJS CLI + ts-jest lebih stabil di CJS. `moduleResolution: nodenext` + ekstensi `.js` tetap dipertahankan (siap migrasi kelak). Fase 9. |
| D4  | Otorisasi endpoint admin `partner-credentials`                                | (a) `isAdmin` (ADMIN_GROUPS) · (b) ACL URL khusus INSW · (c) keduanya               | **(c)**: decorator `@AdminOnly()` = `isAdmin` **dan** `@RequireAcl('<url-admin-ssm>')`                        | Butuh nama URL ACL admin dari tim INSW. Fase 1.                                                                                                                         |
| D5  | Sumber daftar origin CORS                                                     | env `CORS_ORIGINS` (comma-separated)                                                | **Env + Zod**, kosong = CORS mati di production                                                               | Fase 1.                                                                                                                                                                 |
| D6  | Mode Redis                                                                    | (a) Cluster saja · (b) `REDIS_MODE` = `standalone` atau `cluster`                   | **(b)**                                                                                                       | Local docker-compose standalone; saat ini cache selalu fail-open di lokal sehingga tidak pernah teruji. Fase 4.                                                         |
| D7  | Infra integration test di CI                                                  | (a) GitLab `services:` (postgres, redis) · (b) Testcontainers via DinD              | **Hybrid**: CI pakai `services:`, lokal pakai Testcontainers (otomatis bila `DATABASE_URL` test tidak di-set) | Tidak butuh runner privileged. Fase 6.                                                                                                                                  |
| D8  | Stack observability                                                           | Prometheus/Tempo tersedia di infra LNSW?                                            | **Konfirmasi ke tim infra**; jika belum, Fase 8 hanya metrics `/metrics`                                      | Fase 8 bersifat kondisional.                                                                                                                                            |
| D9  | Mode gagal anti-replay (nonce) saat Redis down                                | fail-open · fail-closed                                                             | **fail-open + log `warn` + metric**                                                                           | Konsisten dengan rate limiter; mitigasi tetap ada lewat timestamp window + IP whitelist + TLS. Fase 1.                                                                  |
| D10 | Algoritma rate limit partner                                                  | fixed window (sekarang) · sliding window counter                                    | **Fixed window, dokumen dikoreksi**; upgrade ke sliding window counter bila ada kebutuhan                     | Hindari kompleksitas tanpa kebutuhan nyata. Fase 1.                                                                                                                     |
| D11 | Penyimpanan API key partner                                                   | plaintext unik (sekarang) · hash SHA-256 + prefix                                   | **Hash + prefix tampilan**                                                                                    | Kebocoran DB/cache tidak langsung membocorkan identitas kredensial. Fase 1 + 5.                                                                                         |
| D12 | Lokasi job SonarQube                                                          | `.gitlab-ci.yml` repo · pipeline template LNSW                                      | **Verifikasi template**; jika tidak ada, tambahkan job di repo                                                | Fase 7.                                                                                                                                                                 |
| D13 | Gate `npm audit` & kerentanan devDependency tanpa patch (`depcheck → braces`) | (A) gate hanya dependency produksi · (B) ganti `depcheck` dengan `knip`             | **A + B**                                                                                                     | A diterapkan di F0; B di F3.                                                                                                                                            |
| D14 | Standar tanggal, waktu & zona                                                 | (a) Intl bawaan · (b) date-fns + @date-fns/tz · (c) Temporal (polyfill)             | **(c)** + runtime UTC + zona eksplisit per kasus                                                              | Jadwal penerbangan = jam lokal bandara (termasuk luar negeri ber-DST); dipilih user. Dikerjakan sebelum F6.                                                             |
| D15 | Tabel header vs detail & riwayat perubahan                                    | (a) semua tabel soft delete · (b) header soft delete, detail hard delete + audit    | **(b)** + satu tabel generik `record_changes` (partition-ready, belum dipartisi)                              | Detail tidak perlu "trash"; jejak hapus/ubah tetap ada. Dikerjakan sebelum F6.                                                                                          |

### 2.1 Log Keputusan

| Tanggal    | ID        | Keputusan                                                                                                                                                                                                                                                                                                                                                                             | Catatan                                                                                                                                                                                                               |
| ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-03 | —         | Seluruh fase dikerjakan di satu branch `chore/boilerplate-setup`, dieksekusi bertahap (commit per fase)                                                                                                                                                                                                                                                                               | Menggantikan skema satu branch per fase di Bagian 3                                                                                                                                                                   |
| 2026-10-03 | D4        | `@AdminOnly()` = `isAdmin` (ADMIN_GROUPS) dulu; `@RequireAcl` URL admin INSW menyusul                                                                                                                                                                                                                                                                                                 | Opsi (a); (c) setelah URL ACL admin tersedia                                                                                                                                                                          |
| 2026-10-03 | D13       | A + B                                                                                                                                                                                                                                                                                                                                                                                 | `audit` = `--omit=dev --audit-level=high` (blocking); `audit:all` = informasional                                                                                                                                     |
| 2026-10-03 | D9        | Nonce fail-open saat Redis down (log `warn`)                                                                                                                                                                                                                                                                                                                                          | Sesuai rekomendasi                                                                                                                                                                                                    |
| 2026-10-03 | D11       | API key disimpan sebagai hash SHA-256 + prefix 8 karakter                                                                                                                                                                                                                                                                                                                             | Sesuai rekomendasi                                                                                                                                                                                                    |
| 2026-10-03 | F1        | `INSW_DEFAULT_ACL_URLS` dipertahankan di `insw-acl.service.ts` (bukan `auth.constant.ts`); `auth.constant.ts` dihapus                                                                                                                                                                                                                                                                 | `external-insw` tidak boleh import dari `auth` (siklus)                                                                                                                                                               |
| 2026-10-03 | F1        | `NumericIdParamDto` ditambahkan sekarang (bukan di F5); `IdParamDto` string tetap untuk modul contoh                                                                                                                                                                                                                                                                                  | Diperlukan endpoint partner; penyatuan di F5                                                                                                                                                                          |
| 2026-10-03 | F1        | `CacheService.increment` atomic (Lua) & `setIfAbsent` dikerjakan di F1 (bukan F4)                                                                                                                                                                                                                                                                                                     | Dibutuhkan rate limit & nonce partner                                                                                                                                                                                 |
| 2026-10-03 | F1        | Ditemukan & diperbaiki: log `AxiosError` mentah membocorkan header token outbound                                                                                                                                                                                                                                                                                                     | Tidak ada di audit awal                                                                                                                                                                                               |
| 2026-10-03 | F1        | Ditemukan, ditunda ke F4: health env check menganggap string kosong (mis. `REDIS_CLUSTER_PASSWORD=`) sebagai missing → `/api/health` DOWN dengan config default                                                                                                                                                                                                                       | Hanya pengecekan angka yang diperbaiki di F1                                                                                                                                                                          |
| 2026-10-03 | F1        | Ditunda ke F2: Swagger security scheme header partner; ke F4: propagasi `X-Request-ID` outbound (CLS)                                                                                                                                                                                                                                                                                 | Sesuai urutan fase                                                                                                                                                                                                    |
| 2026-10-03 | Backlog   | Validasi: di `production`, partner wajib punya `ipWhitelist` (tolak create/update tanpa whitelist)                                                                                                                                                                                                                                                                                    | Ditunda atas permintaan; prasyarat: `TRUST_PROXY_HOPS` production sudah diukur (echo server di belakang Kong)                                                                                                         |
| 2026-10-03 | D1        | snake_case dua arah (request, response, error, Swagger)                                                                                                                                                                                                                                                                                                                               | Sesuai rekomendasi                                                                                                                                                                                                    |
| 2026-10-03 | F2        | `configureApp()` (rencana F4A) dikerjakan di F2                                                                                                                                                                                                                                                                                                                                       | Pipe baru harus identik di `main.ts` dan e2e; e2e kini menguji pipeline produksi + kontrak `/docs-json`                                                                                                               |
| 2026-10-03 | F2        | `@PreserveKeys()` berupa class decorator pada DTO (bukan per-field)                                                                                                                                                                                                                                                                                                                   | Pipe NestJS tidak punya ExecutionContext; metadata dibaca dari `metatype` DTO; hanya field top-level                                                                                                                  |
| 2026-10-03 | F2        | Response tidak punya opt-out casing (dictionary di response ikut dikonversi)                                                                                                                                                                                                                                                                                                          | Dicatat; tambahkan bila ada kebutuhan nyata                                                                                                                                                                           |
| 2026-10-03 | F2        | Kontrak snake_case **strict**: key body/query non-snake_case ditolak 400 (bukan diterima diam-diam)                                                                                                                                                                                                                                                                                   | Atas permintaan; belum ada konsumen FE                                                                                                                                                                                |
| 2026-10-03 | PR DevOps | Ukur `TRUST_PROXY_HOPS` tiap environment di belakang Kong + Kubernetes (echo server, `X-Forwarded-For` uji)                                                                                                                                                                                                                                                                           | Prasyarat backlog validasi `ipWhitelist` production                                                                                                                                                                   |
| 2026-10-03 | D2        | Global lines/functions/statements 95, branches 90; per file 90, branches 80                                                                                                                                                                                                                                                                                                           | Rekomendasi diterapkan saat F3 dimulai; ubah di `jest.coverageThreshold` bila perlu                                                                                                                                   |
| 2026-10-03 | F3        | Ditemukan: ls-lint v2 menerapkan rule `.ts` hanya ke file berekstensi tunggal — allowlist suffix lama tidak pernah berjalan (`Example.service.ts`, `x.weird.ts` lolos)                                                                                                                                                                                                                | `.ls-lint.yml` kini mendaftar tiap suffix eksplisit + catch-all `.*.ts` / `.*.*.ts` yang selalu gagal                                                                                                                 |
| 2026-10-03 | F3        | Selector Lampiran L2 `:has(> Decorator > …)` tidak pernah match (esquery)                                                                                                                                                                                                                                                                                                             | Diganti `:has(Decorator > …)`; terbukti lewat chaos test                                                                                                                                                              |
| 2026-10-03 | F3        | `pre-push` menjalankan seluruh unit test (± 10 detik), bukan `jest --onlyChanged`                                                                                                                                                                                                                                                                                                     | `--onlyChanged` kosong saat push (working tree bersih)                                                                                                                                                                |
| 2026-10-03 | F3        | Pengecualian `no-process-env` untuk `app.module.ts` dipertahankan                                                                                                                                                                                                                                                                                                                     | Dipindah ke `appConfig` di F4B                                                                                                                                                                                        |
| 2026-10-03 | F3        | Dikerjakan lebih awal: health `503` via `AppServiceUnavailableException` (+ `details` komponen DOWN), `redis.provider` memakai `PinoLogger`                                                                                                                                                                                                                                           | Dipicu rule baru (exception & logger); sisa F4D/F4F tetap                                                                                                                                                             |
| 2026-10-03 | F3        | knip: `ignoreExportsUsedInFile` (pola `export const schema` + `createZodDto` di file sama); `pino-pretty` di-ignore (dimuat lewat string transport)                                                                                                                                                                                                                                   | Dead export nyata dihapus                                                                                                                                                                                             |
| 2026-10-03 | F3        | ts-jest unit test memakai `isolatedModules: false`: dengan transpile per file, `emitDecoratorMetadata` menghasilkan ternary sintetis di tiap constructor DI yang tak bisa di-cover (controller tipis tertahan di 75% branch)                                                                                                                                                          | Branch coverage jujur 91.6% → 98.79%; unit test ± 10 → ± 22 detik (cache hangat)                                                                                                                                      |
| 2026-10-03 | F3        | `sonar-scanner` lokal belum diverifikasi (tidak tersedia di mesin dev)                                                                                                                                                                                                                                                                                                                | Verifikasi di job CI (F7)                                                                                                                                                                                             |
| 2026-10-03 | D6        | Redis **standalone saja** (DragonFly, satu endpoint dari DevOps); dukungan Cluster dihapus, bukan dibuat dua mode                                                                                                                                                                                                                                                                     | Keputusan user; menggantikan rekomendasi `REDIS_MODE`                                                                                                                                                                 |
| 2026-10-03 | F4        | Health tidak lagi mengecek env (field `env` & `transaction` dihapus)                                                                                                                                                                                                                                                                                                                  | Zod memvalidasi config saat startup — proses yang berjalan pasti lengkap; sekaligus menghapus bug string kosong (F1)                                                                                                  |
| 2026-10-03 | F4        | `/api/health` selalu 200 (detail); hanya `/readiness` yang 503 saat DB DOWN                                                                                                                                                                                                                                                                                                           | Sesuai tabel 4F                                                                                                                                                                                                       |
| 2026-10-03 | F4        | Redaction: path pino kedalaman 1–2, **tanpa** `formatters.log` rekursif; `maskSensitiveValue` (tak terpakai) dihapus                                                                                                                                                                                                                                                                  | Formatter rekursif menambah biaya CPU tiap log; aturan: jangan log DTO/entity utuh                                                                                                                                    |
| 2026-10-03 | F4        | Ditemukan & diperbaiki: body melebihi limit → 500 (error `http-errors` body-parser tidak dikenali filter)                                                                                                                                                                                                                                                                             | Kini 413 `ERR_PAYLOAD_TOO_LARGE`; 4xx `expose` lain → pesan dwibahasa                                                                                                                                                 |
| 2026-10-03 | F4        | `REDIS_CLIENT_ID` dipakai ulang sebagai `connectionName`; `REDIS_COMMAND_TIMEOUT_MS` (default 1000) ditambahkan                                                                                                                                                                                                                                                                       | Command lambat → fail-open, request tidak ikut lambat                                                                                                                                                                 |
| 2026-10-03 | F4        | docker-compose memakai `dragonfly:latest`                                                                                                                                                                                                                                                                                                                                             | **TODO**: pin tag sesuai versi DragonFly di server DevOps                                                                                                                                                             |
| 2026-10-03 | F4        | Verifikasi lokal dengan DragonFly (cache hit, Redis mati → DEGRADED → pulih) belum dijalankan                                                                                                                                                                                                                                                                                         | Docker Desktop tidak aktif di mesin dev; perilaku dicakup unit test                                                                                                                                                   |
| 2026-10-03 | F4        | 4G.2 (`IdParamDto` numerik) tetap di F5                                                                                                                                                                                                                                                                                                                                               | `NumericIdParamDto` sudah ada sejak F1                                                                                                                                                                                |
| 2026-10-03 | F4        | Ditemukan & diperbaiki: ReDoS (Sonar S5852) di `toCamelCase`/`toSnakeCase` — O(n²) pada key buatan (80k karakter ≈ 6 detik event loop terblokir); terjangkau dari input client sejak F2                                                                                                                                                                                               | Implementasi linear (identik, fuzz 200k string); rule regex `sonarjs/*` diaktifkan di ESLint + test regresi waktu                                                                                                     |
| 2026-10-03 | F4        | `REDIS_CLIENT_ID` dilonggarkan ke `^[A-Za-z0-9._-]{1,64}$` (sebelumnya kebab-case)                                                                                                                                                                                                                                                                                                    | Hanya `:` (namespace) dan spasi (`CLIENT SETNAME`) yang benar-benar bermasalah                                                                                                                                        |
| 2026-10-03 | F4        | ts-jest `diagnostics.ignoreCodes: [151002]`                                                                                                                                                                                                                                                                                                                                           | Peringatan nodenext + `isolatedModules:false`; output CJS, isolated wajib off untuk coverage jujur (F3)                                                                                                               |
| 2026-10-03 | F5        | Tanpa generate migrasi: service belum berjalan di environment mana pun, schema boleh diubah langsung                                                                                                                                                                                                                                                                                  | Atas permintaan; langkah 5 (migrasi pertama) & 7 (drift check CI) ditunda sampai deploy pertama                                                                                                                       |
| 2026-10-03 | F5        | ID default tabel domain: **UUID v7** di-generate aplikasi; tabel pencatatan (log, history): **bigint identity**                                                                                                                                                                                                                                                                       | Keputusan user; bigint (bukan integer) karena volume log bisa melewati ~2,1 M baris                                                                                                                                   |
| 2026-10-03 | F5        | Soft delete via `BaseRepository` (bukan helper lepas); audit `created_by`/`updated_by` diisi otomatis dari actor CLS                                                                                                                                                                                                                                                                  | Keputusan user                                                                                                                                                                                                        |
| 2026-10-03 | F5        | `partner_code` tetap UNIQUE penuh (termasuk baris terhapus) — bukan `activeUniqueIndex`                                                                                                                                                                                                                                                                                               | Disengaja sejak F1: kode partner yang dihapus tidak dipakai ulang demi audit trail                                                                                                                                    |
| 2026-10-03 | F5        | Spike: `referensi.view(...).existing()` di drizzle-orm 0.45 → insert/update/delete gagal di `tsc`                                                                                                                                                                                                                                                                                     | Dijadikan test permanen `schemas.spec.ts` (@ts-expect-error)                                                                                                                                                          |
| 2026-10-03 | F5        | `collectCoverageFrom` kini hanya mengecualikan `database/schema` & `seeds` (sebelumnya seluruh `database/**`)                                                                                                                                                                                                                                                                         | Menyingkap `database.provider.ts` 0% function → spec ditambahkan                                                                                                                                                      |
| 2026-10-03 | F5        | ESLint: `explicit-function-return-type` off hanya untuk `src/database/schema/**`                                                                                                                                                                                                                                                                                                      | Tipe builder Drizzle dirancang di-infer                                                                                                                                                                               |
| 2026-10-03 | F5        | Langkah 6 (`createListQuerySchema`, `buildPaginatedResult`) ditunda                                                                                                                                                                                                                                                                                                                   | Belum ada modul domain yang membutuhkan list berfilter; dikerjakan bersama modul pertama                                                                                                                              |
| 2026-10-03 | D14       | Standar tanggal & waktu: 3 jenis (instant `timestamptz`/ISO UTC, tanggal `date`/`YYYY-MM-DD`, jadwal lokal = instant + zona IANA); request instant wajib ber-offset                                                                                                                                                                                                                   | Server & DB di Jakarta (+7), pengguna & bandara lintas WIB/WITA/WIT/luar negeri (DST)                                                                                                                                 |
| 2026-10-03 | D14       | Library: Temporal via `temporal-polyfill` 1.0.5 (bukan date-fns)                                                                                                                                                                                                                                                                                                                      | Keputusan user; tipe `PlainDate`/`Instant`/`ZonedDateTime` mencegah tanggal kalender diperlakukan sebagai instant; polyfill otomatis memakai Temporal native bila tersedia                                            |
| 2026-10-03 | D14       | Runtime UTC: Dockerfile `TZ=UTC`, sesi Postgres `timezone=UTC`, Jest `TZ=UTC`; "per hari" selalu dengan zona eksplisit (tanpa default global)                                                                                                                                                                                                                                         | Keputusan user; zona DB server tidak diubah                                                                                                                                                                           |
| 2026-10-03 | D14       | Polyfill ESM-only → Jest men-transpile `temporal-polyfill` & `temporal-utils` ke CJS (transform khusus); runtime Node 24 memuatnya via `require(esm)`                                                                                                                                                                                                                                 | Konfigurasi di `package.json` jest & `test/jest-e2e.json`                                                                                                                                                             |
| 2026-10-03 | D14       | Chaos test #8 (mutasi tabel referensi) kini ditolak `tsc`, bukan code review                                                                                                                                                                                                                                                                                                          | Sejak F5 tabel referensi = view `.existing()`                                                                                                                                                                         |
| 2026-10-04 | D15       | Header/master: soft delete (`BaseRepository`); detail: tanpa `deleted_at`, hard delete lewat `ChildRepository`, `created_by`/`updated_by` tetap ada                                                                                                                                                                                                                                   | Keputusan user; soft delete / restore header tidak menyentuh detail; perubahan detail memperbarui `updated_at` header                                                                                                 |
| 2026-10-04 | D15       | Satu tabel `record_changes`: UPDATE (kolom berubah saja), SOFT_DELETE, RESTORE, DELETE (snapshot); INSERT tidak dicatat; transaksi sama; kolom sensitif `[REDACTED]`                                                                                                                                                                                                                  | Keputusan user (perlu jejak UPDATE juga); PG16 tanpa `RETURNING OLD` → `SELECT … FOR UPDATE` dulu                                                                                                                     |
| 2026-10-04 | D15       | Partition-ready, belum dipartisi: PK `(id, changed_at)`, tanpa FK/unique lain, id `bigserial` (pengecualian dari identity); runbook + SQL konversi ATTACH legacy & retensi                                                                                                                                                                                                            | Keputusan user. Verifikasi template terhadap PG16 di F6 (dijalankan oleh user)                                                                                                                                        |
| 2026-10-04 | D15       | Asumsi dikonfirmasi: detail diakses lewat endpoint header; tidak ada bulk update tanpa audit (ESLint: penulisan DB hanya di repository; `.update(`/`.delete(` di repository modul, raw SQL tulis, dan tulis langsung `recordChanges` ditolak)                                                                                                                                         | Bulk update kelak = method eksplisit di base class dengan pencatatan                                                                                                                                                  |
| 2026-10-04 | D15       | Masa retensi `record_changes` belum ditetapkan                                                                                                                                                                                                                                                                                                                                        | Menunggu ketentuan LNSW; script retensi tidak dijadwalkan sebelum itu                                                                                                                                                 |
| 2026-10-04 | D15       | Konvensi route: level 2 hanya untuk detail milik header (`/headers/:id/details/:childId`, `UuidChildParamDto`); detail tanpa endpoint top-level; lebih dalam tetap dipecah ke resource top-level                                                                                                                                                                                      | Keputusan user; sebelumnya contoh CONTRIBUTING menyarankan `/order-items/:itemId` (bertentangan dengan pengikatan detail ke header)                                                                                   |
| 2026-10-04 | D15       | Panduan jenis tabel (mandiri / header / detail / pencatatan / referensi) + template header–detail lengkap di scaffold-module Langkah 11                                                                                                                                                                                                                                               | Belum ada contoh pemakaian `ChildRepository` di kode; template diverifikasi lewat modul contoh sementara (`tsc`, ESLint, `schema-conventions.spec`) lalu modulnya dihapus                                             |
| 2026-10-04 | D15       | Skill baru `database-standards` = satu-satunya sumber standar DB (jenis tabel, repository, `record_changes`, raw SQL, testing, template header + detail); `references/database.md`, `transactions.md`, `raw-queries.md` dipindah dari project-standards (git mv); AGENTS.md mewajibkan membacanya sebelum pekerjaan DB apa pun                                                        | Keputusan user: CRUD paling sering dikerjakan, agent harus selalu terpicu membaca standar ini; template diverifikasi ulang dari teks dokumen (tsc, ESLint, schema-conventions, spec 9 test) lalu modul contoh dihapus |
| 2026-10-04 | Docs      | `ARCHITECTURE_BLUEPRINT.md` ditulis ulang sesuai kode F1–F5, D14, D15: blueprint = apa & mengapa + rujukan ke sumber detail (bukan salinan kode); bagian baru Auth SSO INSW, data layer & audit, platform/health, AI agent governance; koreksi partner signing v1, kolom partner, kontrak snake_case dua arah, error types, coverage SSOT, matriks depcruise, pipeline `configureApp` | Atas permintaan user; `JwtPayload`/`RequestWithUser` (auth bukan JWT) dan klaim retry HTTP dihapus juga dari CONTRIBUTING & SKILL project-standards. SonarQube berasal dari template pipeline LNSW (D12)              |

---

## 3. Roadmap & Urutan Eksekusi

```
F0 Governance ──► F1 Security ──► F2 Kontrak API ──► F3 Enforcement ──► F4 Platform ──► F5 Database ──► F6 Testing ──► F7 CI/CD ──► F8 Observability ──► F9 Docs
                                                         ▲                                                              │
                                                         └──── F7 quick wins (sonar fix, commitlint CI) boleh paralel ─┘
```

| Fase | Fokus                                    | Branch / MR                       | Bergantung pada | Ukuran |
| ---- | ---------------------------------------- | --------------------------------- | --------------- | ------ |
| F0   | Governance repo & aturan AI              | `chore/governance-ai-rules`       | —               | S      |
| F1   | Security partner gateway, outbound, CORS | `fix/security-partner-gateway`    | F0, D4, D9, D11 | L      |
| F2   | Kontrak API (casing, Swagger, DTO)       | `feat/api-contract-snake-case`    | F1, D1          | M      |
| F3   | Enforcement tooling                      | `chore/enforcement-tooling`       | F1, F2, D2      | M      |
| F4   | Platform correctness                     | `refactor/platform-correctness`   | F3, D6          | L      |
| F5   | Standar database & migrasi               | `feat/database-standards`         | F4, D11         | M      |
| F6   | Strategi testing                         | `test/integration-contract-suite` | F4, F5, D7      | M      |
| F7   | CI/CD & container                        | `ci/pipeline-hardening`           | F6, D12         | M      |
| F8   | Observability & resilience               | `feat/observability-resilience`   | F7, D8          | L      |
| F9   | Dokumentasi & skills                     | `docs/standards-restructure`      | F0–F8           | M      |

> **Catatan F3 setelah F1/F2**: rule ESLint baru di F3 akan memunculkan pelanggaran yang ada sekarang (mis. `new HttpException` di guard). F1/F2 memperbaiki pelanggaran itu lebih dulu, sehingga F3 bisa langsung di-merge dalam keadaan hijau.

---

## Fase 0 — Governance Repo & Aturan AI Agent

**Tujuan**: semua developer (dan AI agent mereka) memakai aturan yang sama, tanpa path lokal yang hardcoded.

### Solusi

| Masalah                                                                                        | Solusi                                                                      |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `.agents/` & `.claude/` di-gitignore → `CLAUDE.md` mengimpor file yang tidak ada di mesin lain | Track `.agents/` dan `.claude/` (kecuali `.claude/settings.local.json`).    |
| Path absolut `d:\WORK\...` di AGENTS.md & skill                                                | Ganti ke path relatif repo.                                                 |
| Proteksi `.env` hanya untuk `Read`                                                             | Tambah deny untuk `Bash`/`Grep` + PreToolUse hook sebagai defense-in-depth. |
| Skill `generate-commit-text` menyarankan tipe `style` (ditolak commitlint)                     | Selaraskan dengan `type-enum`.                                              |
| Template `scaffold-module` tidak compile                                                       | Perbaiki (detail di F9, minimal fix di sini).                               |
| Branch rule menolak `main`, mengizinkan `boilerplate`, tidak memvalidasi `hotfix/vX.Y.Z`       | Regex baru (Lampiran L1).                                                   |
| CODEOWNERS belum mencakup path sensitif                                                        | Tambah path.                                                                |

### Langkah

1. **`.gitignore`** — hapus baris `.agents/` dan `.claude/`, ganti dengan:
   ```gitignore
   .claude/settings.local.json
   .claude/**/*.local.*
   ```
2. **Path relatif** — di `.agents/AGENTS.md` dan `.agents/skills/project-standards/SKILL.md` ganti semua `d:\WORK\LNSW\pengangkut-udara-backend\...` dan `file:///d:/...` menjadi path relatif (`CONTRIBUTING.md`, `.agents/skills/...`).
3. **`.claude/settings.json`** — tambah:
   ```json
   "deny": [
     "...(yang sudah ada)",
     "Bash(cat .env*)", "Bash(type .env*)", "Bash(*.env.*local*)",
     "Grep(.env*)"
   ]
   ```
   plus hook `PreToolUse` (`.claude/hooks/block-env.mjs`) yang menolak tool call apa pun yang argumennya cocok `/\.env(?!\.example)(\.|$)/`. Pattern deny bersifat best-effort; hook adalah penegak sebenarnya.
4. **Skill commit** — di `.agents/skills/generate-commit-text/SKILL.md` hapus baris `style`, koreksi klaim `body-max-line-length` (default config-conventional = 100). Di `commitlint.config.cjs` tetapkan eksplisit `'body-max-line-length': [2, 'always', 100]` dan `'scope-case': [2, 'always', 'kebab-case']`.
5. **Branch rule** — ganti `.validate-branch-namerc.json` dengan regex di Lampiran L1. **Sebelum push**: rename branch kerja `boilerplate` → `chore/boilerplate-setup` (atau merge dulu ke `main`), karena `boilerplate` tidak lagi valid.
6. **CODEOWNERS** — tambahkan:
   ```
   src/modules/partner-credential/  @<tech-lead>
   package.json package-lock.json   @<tech-lead>
   .husky/ commitlint.config.cjs .validate-branch-namerc.json  @<tech-lead>
   .agents/ .claude/ CLAUDE.md      @<tech-lead>
   drizzle/                         @<tech-lead> @<dba>
   ```
   Ganti placeholder `@href` dengan username/grup GitLab nyata.
7. **`.npmrc`** (baru):
   ```ini
   engine-strict=true
   save-exact=true
   fund=false
   audit-level=moderate
   ```

### Acceptance criteria

- [ ] Clone bersih repo → `CLAUDE.md` dapat me-resolve `@.agents/AGENTS.md`.
- [ ] `grep -rn "d:\\\\WORK\|file:///" .agents CLAUDE.md` → kosong.
- [ ] `git push` dari branch `feat/x` lolos; dari branch `foo` ditolak; `hotfix/v1.2.3` lolos, `hotfix/abc` ditolak.
- [ ] Commit `style: x` ditolak commitlint dan skill tidak lagi menyarankannya.

---

## Fase 1 — Security: Partner Gateway, Outbound, CORS

**Tujuan**: menutup celah keamanan sebelum ada fitur/partner yang terhubung.

### 1A. Kebocoran secret & otorisasi `partner-credentials`

**Masalah**: controller mengembalikan entity mentah (`apiKey`, `encryptedSecret` ikut terkirim) dan dapat diakses user SSO mana pun yang memiliki ACL baseline.

**Solusi**: response DTO + mapper eksplisit, otorisasi admin, dan rotasi kredensial.

Langkah:

1. Buat `src/modules/partner-credential/dto/partner-credential-response.dto.ts` (`id, partnerCode, partnerName, apiKeyPrefix, ipWhitelist, allowedRoutes, rateLimitRpm, isActive, createdAt, updatedAt`) dan `partner-credential-registration-response.dto.ts` (`partner` + `apiKey` + `secret`, **hanya dikembalikan sekali**).
2. Buat `src/modules/partner-credential/partner-credential.mapper.ts` — fungsi murni `toPartnerCredentialResponse(entity)`. Tambahkan suffix `mapper` ke regex `src/modules` di `.ls-lint.yml`.
3. Controller: semua method mengembalikan tipe response DTO + `@ApiStandardResponse({ type: ... })`; `@ApiTags('Partner Credentials')`.
4. Buat decorator `src/common/decorators/admin-only.decorator.ts` (`@AdminOnly()` → metadata `IS_ADMIN_ONLY_KEY`) dan tegakkan di `AuthGuard` (`authUser.isAdmin` wajib `true`, ditambah `@RequireAcl(...)` sesuai D4). Pasang `@AdminOnly()` di level controller.
5. Ganti hard delete:
   - `DELETE /partner-credentials/:id` → soft delete (`deletedAt`, `isActive=false`), invalidasi cache.
   - Endpoint baru `POST /partner-credentials/:id/secret-rotations` → generate secret baru, kembalikan sekali.
   - Endpoint baru `POST /partner-credentials/:id/api-key-rotations` → generate API key baru, invalidasi cache key lama.
6. API key disimpan sebagai `api_key_hash` (SHA-256 hex) + `api_key_prefix` (8 char pertama) sesuai D11. Lookup di guard: `findByApiKeyHash(sha256(header))`. Cache key memakai hash, bukan key asli.

### 1B. IP whitelist anti-spoofing

**Masalah**: `resolveClientIp` mempercayai header `X-Forwarded-For` yang dikontrol client.

1. `app.config.ts`: tambah `TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0)` (isi sesuai jumlah reverse proxy di depan app: Nginx/API Gateway).
2. `configureApp()` (F4, untuk sekarang di `main.ts`): `app.set('trust proxy', config.TRUST_PROXY_HOPS)`.
3. Guard: hapus parsing manual `x-forwarded-for`; pakai `request.ip`, normalisasi `::ffff:` (IPv4-mapped IPv6).
4. Dukung CIDR: `src/utils/ip-match.util.ts` (pakai `ipaddr.js`, sudah transitive dependency Express → jadikan dependency eksplisit). DTO `ipWhitelist`: `z.array(z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()]))`.

### 1C. HMAC v1 final (raw body, nonce, query, route ACL)

**Masalah**: hash dari `JSON.stringify(body)` (bukan raw bytes), tanpa nonce (replay selama 5 menit), query string tidak ditandatangani, pola route tanpa `*` diperlakukan sebagai prefix.

1. `NestFactory.create(AppModule, { bufferLogs: true, rawBody: true })` → gunakan `request.rawBody` (Buffer); body kosong → `sha256("")`.
2. Header baru wajib: `x-partner-nonce` (UUID v4/ULID, maks 64 char).
3. Canonical string baru (spesifikasi lengkap di Lampiran L3):
   ```
   v1\n<timestamp>\n<nonce>\n<METHOD>\n<path>\n<canonicalQuery>\n<sha256(rawBody)>
   ```
4. Anti-replay: `CacheService.setIfAbsent(CACHE_KEYS.partnerNonce(partnerCode, nonce), ttl = tolerance)` (Redis `SET NX EX`). Jika key sudah ada → `401 ERR_PARTNER_REPLAY_REJECTED`. Jika Redis down → sesuai D9.
5. Route matcher murni `src/utils/route-match.util.ts`:
   - pola tanpa wildcard → **exact match**;
   - pola berakhiran `/*` → prefix match dengan batas segmen (`/a/*` cocok `/a/b`, tidak cocok `/ab`);
   - path di-normalisasi (decode, tolak `..`, hapus trailing slash).
     DTO `allowedRoutes`: regex `^/api/v\d+/[a-z0-9/-]+(/\*)?$`.
6. Urutan validasi guard (murah → mahal, fail-fast):
   `headers → timestamp → resolve partner (by hash) → active → IP → route ACL → signature → nonce → rate limit`.
7. Pindahkan crypto ke `src/utils/crypto.util.ts` (fungsi murni AES-256-GCM, HMAC, timing-safe compare) sesuai dokumen. Format ciphertext baru dengan key-id untuk rotasi (Lampiran L4):
   - IV 12 byte (rekomendasi NIST untuk GCM).
   - Kunci = decode hex 32 byte langsung (bukan `sha256(hexString)`).
   - Config: `PARTNER_SECRET_KEYS="k1:<64hex>[,k0:<64hex>]"` + `PARTNER_SECRET_ACTIVE_KEY_ID=k1`, validasi Zod regex hex.

### 1D. Rate limit 429 yang terstandar

1. Exception baru di `app.exception.ts`: `AppTooManyRequestsException` (429, `APP_ERROR_CODES.RATE_LIMITED`) dan `AppServiceUnavailableException` (503, `APP_ERROR_CODES.SERVICE_UNAVAILABLE`).
2. Tambah `error.type` (additive, aman untuk FE): `TOO_MANY_REQUESTS`, `SERVICE_UNAVAILABLE`. Update `HttpExceptionFilter.parseAppBaseException` & `mapHttpStatusToTypeAndCode`.
3. Guard melempar `AppTooManyRequestsException(I18N_MESSAGES.PARTNER_RATE_LIMITED)` + set header `Retry-After` (detik sampai bucket berikutnya).
4. Atomicity increment diperbaiki di F4 (`INCR` + `EXPIRE NX` dalam `MULTI`).
5. Dokumen: ganti istilah "sliding window" → "fixed window per menit" (D10).

### 1E. Audit trail partner yang lengkap

**Masalah**: `PartnerAuditInterceptor` tidak terpasang di mana pun dan hanya mencatat request yang sukses; penolakan guard tidak ter-audit.

1. Pindahkan interceptor ke `src/modules/partner-credential/partner-audit.interceptor.ts` (spesifik domain; `common/` harus domain-agnostic).
2. Buat `PartnerAuditService.record(event)` dengan skema tetap:
   `{ audit: 'partner', outcome: 'ALLOWED'|'REJECTED'|'ERROR', reason?, partnerCode?, method, path, clientIp, statusCode, durationMs, requestId }`.
3. Guard memanggil `record({ outcome: 'REJECTED', reason })` di setiap penolakan; interceptor mencatat `ALLOWED`/`ERROR` (`tap` + `catchError`).
4. Daftarkan interceptor sebagai `APP_INTERCEPTOR` dari `PartnerCredentialModule` (aktif hanya pada route `@PartnerAuth()`) → developer tidak perlu menulis `@UseInterceptors(...)` (prinsip zero-boilerplate).

### 1F. Outbound HTTP client — error masking & semantik status

**Masalah**: status vendor diteruskan (vendor 401 → client kita 401 → FE logout), body vendor bocor di `details`, kode error dibuat dinamis.

1. `HttpClientService` memetakan error:

   | Kondisi                              | HTTP ke client                                  | `error.code`                   |
   | ------------------------------------ | ----------------------------------------------- | ------------------------------ |
   | Timeout (`ECONNABORTED`/`ETIMEDOUT`) | 504                                             | `ERR_EXT_<ORIGIN>_TIMEOUT`     |
   | Network error / DNS / reset          | 502                                             | `ERR_EXT_<ORIGIN>_UNREACHABLE` |
   | Vendor 4xx/5xx                       | **502** (tidak pernah meneruskan status vendor) | `ERR_EXT_<ORIGIN>_ERROR`       |

2. Kode dibangkitkan dari helper terpusat `externalErrorCode(origin, kind)` di `error-codes.constant.ts` (map statis per origin, tetap SSOT, tidak memakai template literal di call site).
3. `details` ke client hanya berisi pesan generik bilingual. Body vendor hanya di-log, terpotong (maks 2 KB) dan melewati redaction.
4. `ExternalServiceException` menerima `MessageInput` (bilingual). Rapikan duplikasi interface `ExternalServiceMetadata` / `ExternalInstitutionDetail` menjadi satu.
5. Propagasi `X-Request-ID` ke outbound request (implementasi CLS di F4).

### 1G. Semantik SSO/ACL saat INSW bermasalah

1. `InswSsoService.introspectToken`: vendor membalas 401/403 → `AppUnauthorizedException`; timeout/5xx/network → **re-throw `ExternalServiceException`** (502/504, origin `INSW`). FE menampilkan banner gangguan, bukan logout massal.
2. `InswAclService.getUserAclUrls`: saat gagal **throw**, jangan return `[]` (yang saat ini ikut di-cache 1 jam dan menyebabkan 403 massal). `getOrSet` tidak meng-cache saat fetcher throw.
3. Hapus duplikasi `INSW_DEFAULT_ACL_URLS` (ada di `auth.constant.ts` dan `insw-acl.service.ts`); simpan satu di `auth.constant.ts`.

### 1H. CORS

1. `app.config.ts`: `CORS_ORIGINS: z.string().default('').transform(splitCsv).pipe(z.array(z.url()))`.
2. `enableCors({ origin: config.CORS_ORIGINS.length ? config.CORS_ORIGINS : false, credentials: config.CORS_ORIGINS.length > 0, exposedHeaders: ['X-Request-ID', 'Retry-After'] })`.

### Acceptance criteria

- [ ] Response `GET /api/v1/partner-credentials` tidak mengandung `api_key`, `api_key_hash`, `encrypted_secret` (unit + e2e assert).
- [ ] User non-admin → 403 di semua endpoint `partner-credentials`.
- [ ] Request dengan `X-Forwarded-For` palsu tidak lolos IP whitelist (test dengan `trust proxy`).
- [ ] Replay request yang sama persis (nonce sama) → 401 `ERR_PARTNER_REPLAY_REJECTED`.
- [ ] Mengubah query string → 401 `ERR_PARTNER_SIGNATURE_INVALID`.
- [ ] Pola `/api/v1/foo` tidak mengizinkan `/api/v1/foobar`; `/api/v1/foo/*` mengizinkan `/api/v1/foo/1`.
- [ ] Rate limit → 429, `error.type=TOO_MANY_REQUESTS`, header `Retry-After` ada, pesan bilingual.
- [ ] Vendor 401 → client menerima 502; body vendor tidak muncul di response.
- [ ] SSO timeout → 504 `origin: INSW` (bukan 401). ACL gagal tidak di-cache.
- [ ] Setiap penolakan guard menghasilkan 1 log `audit: 'partner', outcome: 'REJECTED'`.
- [ ] Dokumen spesifikasi signing partner (Lampiran L3) dipindah ke `docs/partner-integration-guide.md` beserta contoh klien (curl/Node/Java).

---

## Fase 2 — Kontrak API (Casing, Swagger, Response DTO)

**Tujuan**: kontrak yang dibaca FE di Swagger 100% sama dengan runtime.

### Masalah

- Envelope & DTO Swagger camelCase (`statusCode`, `createdAt`), sementara runtime snake_case.
- Request diterima camelCase, response snake_case → kontrak tidak simetris (D1).
- Controller boleh mengembalikan entity mentah (akar masalah kebocoran 1A).

### Solusi (asumsi D1 = snake_case dua arah)

| Lapisan        | Mekanisme                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inbound        | Global `SnakeToCamelPipe` (sebelum `ZodValidationPipe`) mengubah key body & query. DTO tetap ditulis camelCase (identifier TS tetap patuh naming convention).   |
| Error validasi | `HttpExceptionFilter` mengubah setiap segmen `details[].field` ke snake_case → cocok dengan nama field yang dikirim FE.                                         |
| Outbound       | Tetap `TransformInterceptor` (`camelToSnakeCase`).                                                                                                              |
| Swagger        | Post-processor `toSnakeCaseOpenApi(document)` mengubah semua `components.schemas[*].properties` & `required` ke snake_case. Satu tempat, tidak perlu DTO ganda. |
| Response DTO   | Wajib: setiap endpoint punya `*-response.dto.ts` + mapper; controller tidak boleh import `database/schema` (ditegakkan depcruise di F3).                        |

### Langkah

1. `src/utils/case-converter.util.ts`: tambah `snakeToCamelCase(value)` (rekursif, simetris dengan yang sudah ada) + test.
2. `src/common/pipes/snake-to-camel.pipe.ts`: hanya untuk `metadata.type === 'body' | 'query'`; `param` tidak diubah.
3. **Opt-out untuk free-form JSON**: decorator `@PreserveKeys()` untuk field bertipe dictionary (`Record<string, ...>`) agar key data tidak ikut diubah. Konvensi yang dianjurkan: hindari dictionary di kontrak publik, pakai array `{ key, value }`.
4. `src/utils/openapi-snake-case.util.ts`: fungsi murni atas tipe minimal (`{ components?: { schemas?: Record<string, SchemaLike> } }`) agar tidak mengimpor `@nestjs/*` (patuh `strict-utils-isolation`). Dipanggil di setup Swagger: `toSnakeCaseOpenApi(cleanupOpenApiDoc(raw))`.
5. Envelope DTO (`base-response.dto.ts`): pertahankan camelCase di kode; hasil Swagger otomatis snake_case lewat langkah 4. Hapus tipe `StandardResponse`/`StandardPaginatedResponse` yang tidak terpakai (cek dengan depcruise/grep).
6. Swagger security schemes: tambahkan `addApiKey` untuk header partner (`x-partner-key`, dsb.) dan `@ApiSecurity` di controller partner, di samping `addBearerAuth`.
7. Update `ExampleModule` sebagai **reference implementation** (response DTO + mapper + snake_case contract), karena modul inilah yang ditiru developer.

### Acceptance criteria

- [ ] `GET /docs-json` → semua properti schema snake_case (assert di contract test F6).
- [ ] `POST /api/v1/examples` dengan body `{ "flight_number": ... }` lolos validasi; error validasi mengembalikan `field: "flight_number"`.
- [ ] Tidak ada controller yang mengimpor `src/database/` (depcruise F3).

---

## Fase 3 — Enforcement Tooling

**Tujuan**: setiap aturan "WAJIB" benar-benar ditegakkan mesin, dan tidak bisa dimatikan diam-diam.

### 3A. ESLint — restrukturisasi `no-restricted-syntax`

**Masalah kritis**: di flat config, override untuk `*.repository.ts` **mengganti seluruh** array `no-restricted-syntax`. Akibatnya di repository, larangan `ERR_*`, built-in exception, dan aturan lain hilang.

Solusi: definisikan grup rule sebagai konstanta lalu komposisikan per override (Lampiran L2).

| Grup               | Isi                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DTO_RULES`        | `@Body('x')`, `@Query('x')`, `@Param('x')`                                                                                                                |
| `EXCEPTION_RULES`  | **Semua** `new *Exception` kecuali `App*Exception` / `ExternalServiceException`, termasuk `new HttpException(...)`                                        |
| `ERROR_CODE_RULES` | literal `/^ERR_/`                                                                                                                                         |
| `CONTROLLER_RULES` | `@Res()`, `res.json/send`, `new BaseResponseDto`, versi `@Controller` wajib, **method HTTP wajib `@ApiStandardResponse`/`@ApiStandardPaginatedResponse`** |
| `LOGGING_RULES`    | `new Logger(...)`, import `Logger` dari `@nestjs/common`                                                                                                  |
| `SQL_RULES`        | `sql.raw(...)` (hanya lewat `eslint-disable` + justifikasi, lihat 3B)                                                                                     |
| `TX_RULES`         | `@Transactional()` hanya di `*.service.ts`                                                                                                                |
| `REPOSITORY_RULES` | `DRIZZLE_TOKEN` di repository                                                                                                                             |

Override per area:

| Files                                               | Rules aktif                                             |
| --------------------------------------------------- | ------------------------------------------------------- |
| default `src/**`                                    | DTO + EXCEPTION + ERROR_CODE + LOGGING + SQL + TX       |
| `**/*.controller.ts`                                | default + CONTROLLER                                    |
| `**/*.repository.ts`                                | default + REPOSITORY (**tidak lagi menghapus default**) |
| `src/common/exceptions/**`, `src/common/filters/**` | default − EXCEPTION                                     |
| `src/common/constants/error-codes.constant.ts`      | default − ERROR_CODE                                    |
| `**/*.spec.ts`, `test/**`                           | DTO saja (mock bebas)                                   |

Juga perbaiki override `naming-convention` untuk config/decorator/provider: override saat ini mengganti seluruh selector sehingga class/variable di file tersebut tidak lagi dicek. Komposisikan dengan base selector yang sama.

### 3B. Plugin & opsi tambahan

1. `eslint-plugin-sonarjs` → `sonarjs/cognitive-complexity: ['error', 15]` (yang diklaim dokumen; `complexity` cyclomatic tetap sebagai pelengkap). Aktifkan subset rule `sonarjs` recommended yang relevan (no-duplicate-string, no-identical-functions).
2. `@eslint-community/eslint-plugin-eslint-comments` → `require-description` (setiap `eslint-disable` wajib alasan `-- <alasan>`), `no-unlimited-disable`, `no-unused-disable`. Ini mencegah pelanggaran dibungkam diam-diam.
3. `@typescript-eslint/consistent-type-imports: 'error'`.
4. Script lint: `eslint "{src,test}/**/*.ts" --max-warnings 0` (hapus `apps,libs` yang tidak ada).
5. `languageOptions.sourceType`: sesuaikan dengan D3 (tetap `commonjs` bila D3=b, tambahkan komentar alasan).
6. Ganti `depcheck` dengan `knip` (D13-B): mendeteksi dependency, file, dan export yang tidak terpakai; menghapus rantai devDependency rentan `findup-sync → micromatch → braces`. Script `lint:deps` → `knip`.

### 3C. Dependency-cruiser — rule baru

| Rule                         | From                          | To (dilarang)                                         | Tujuan                                                       |
| ---------------------------- | ----------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `controller-no-db`           | `\.controller\.ts$`           | `^src/database/`, `\.repository\.ts$`                 | Controller hanya bicara ke service + DTO                     |
| `service-no-reference-write` | (dicakup F5 via Drizzle view) | —                                                     | —                                                            |
| `no-cross-module-internals`  | `^src/modules/([^/]+)/`       | file modul lain selain `*.module.ts` / `*.service.ts` | Lintas modul hanya boleh lewat module/service yang di-export |
| `common-no-domain-schema`    | `^src/common/`                | `^src/database/schema/`                               | Common tetap domain-agnostic                                 |

### 3D. ls-lint

- `src/modules`: tambah suffix `mapper`, `pipe`, `interceptor`, `decorator` (bila perlu per-modul), `int-spec`.
- `src/common`: tambah folder `swagger` bila dipakai.
- `test/`: izinkan `*.int-spec.ts`, `*.e2e-spec.ts`, folder `integration/`, `fixtures/`.

### 3E. Coverage SSOT (D2)

1. `package.json` jest:
   ```json
   "coverageThreshold": {
     "global": { "branches": 90, "functions": 95, "lines": 95, "statements": 95 },
     "./src/**/*.ts": { "branches": 80, "functions": 90, "lines": 90, "statements": 90 }
   }
   ```
2. Tambah `"coverageReporters": ["text-summary", "lcov", "cobertura"]` (cobertura untuk widget coverage MR GitLab) dan `jest-junit` untuk laporan test di MR.
3. Semua dokumen merujuk ke satu tabel di `docs/standards/testing.md` (F9).

### 3F. SonarQube properties

```properties
sonar.sources=src
sonar.exclusions=**/*.spec.ts,src/main.ts,src/database/seeds/**
sonar.tests=src,test
sonar.test.inclusions=**/*.spec.ts,**/*.e2e-spec.ts,**/*.int-spec.ts
```

(Memperbaiki error "file indexed twice" karena spec masuk ke sources dan tests sekaligus.)

### 3G. Husky hooks

| Hook         | Isi baru                                           | Alasan                                                                        |
| ------------ | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pre-commit` | `lint-staged` → `tsc --noEmit` → `ls-lint`         | Cepat; arsitektur dipindah ke pre-push                                        |
| `commit-msg` | commitlint (tetap)                                 | —                                                                             |
| `pre-push`   | `lint:branch` → `lint:arch` → `test --onlyChanged` | Tanpa `npm audit` (butuh jaringan, di CI saja); hapus duplikasi `lint:branch` |

Script `package.json`:

- `validate` = static check lokal (tanpa audit & branch).
- `validate:ci` = `validate` (dipanggil CI).
- `validate:full` = `validate` + `test:cov` + `test:e2e` (+ `test:int` setelah F6).

### Acceptance criteria (chaos test baru, ditambahkan ke dokumen)

- [x] `throw new HttpException('x', 429)` di service → lint error.
- [x] `'ERR_X'` di `*.repository.ts` → lint error (sebelumnya lolos).
- [x] Method `@Get()` tanpa `@ApiStandardResponse` → lint error.
- [x] `// eslint-disable-next-line` tanpa alasan → lint error.
- [x] Controller mengimpor schema DB → depcruise error.
- [ ] `sonar-scanner` lokal tidak error indexing. _(ditunda ke F7 — lihat log keputusan)_

---

## Fase 4 — Platform Correctness

**Tujuan**: bootstrap, config, logging, cache, dan health berperilaku benar dan dapat diuji.

### 4A. `configureApp()` bersama

**Masalah**: e2e menyusun pipeline sendiri (tanpa filter, Zod pipe, versioning) sehingga pipeline produksi tidak pernah teruji.

1. Buat `src/app.setup.ts`: `export function configureApp(app: NestExpressApplication, config: AppConfig): void` berisi semua langkah global (trust proxy, helmet, CORS, prefix, versioning, pipes, interceptor, filter, body limit, Swagger).
2. `main.ts` hanya: create → `configureApp` → listen.
3. e2e & integration memanggil `configureApp` yang sama.
4. Tambahkan `app.useBodyParser('json', { limit: config.HTTP_BODY_LIMIT })` (default `1mb`).

### 4B. Config DRY & validasi ketat

1. `src/utils/parse-env.util.ts`: `parseEnv(schema, name)` (satu implementasi safeParse + format error). Kelima file config memanggilnya. Hapus alias `*ConfigDto` dan samakan penamaan tipe (`AppConfig`, `DatabaseConfig`, `RedisConfig`, `InswConfig`, `PartnerConfig`).
2. Pengetatan: URL → `z.url()`, `PORT` → `int().positive()`, key enkripsi → regex hex, hapus `NODE_ENV` duplikat di `redis.config.ts` (inject `appConfig`).
3. `LoggerModule.forRootAsync({ inject: [appConfig.KEY], useFactory })` → `LOG_LEVEL` & transport dibaca dari config tervalidasi, bukan `process.env`. Satu-satunya `process.env` yang tersisa di `app.module.ts` adalah untuk `envFilePath`.
4. Health service: daftar env resmi diambil dari semua schema config (termasuk `insw`, `partner`), bukan hanya 3.

### 4C. Request ID & context (CLS)

1. Pindahkan `ClsModule.forRoot` ke `AppModule` dengan `global: true, middleware: { mount: true, generateId: true, idGenerator: resolveRequestId }`. `DatabaseModule` tetap mendaftarkan plugin transactional.
2. `src/utils/request-id.util.ts`: terima `X-Request-ID` hanya jika cocok `^[A-Za-z0-9._:-]{1,128}$`, selain itu `randomUUID()` (mencegah log injection). Dipakai oleh pino `genReqId`, CLS, filter, dan audit (satu sumber).
3. Set response header `X-Request-ID`.
4. `HttpClientService` menambahkan `X-Request-ID` dari CLS ke setiap outbound request.

### 4D. Logging

1. Redaction: pino hanya mendukung wildcard satu level. Tambahkan path eksplisit untuk kedalaman 2 (`*.*.password`, dst.), header partner (`req.headers["x-partner-signature"]`, `x-partner-key`), `*.accessToken`, `*.apiKeyHash`, `*.encryptedSecret`. Untuk payload dinamis, sediakan `formatters.log` yang memakai `mask-sensitive.util` secara rekursif.
2. `redis.provider.ts`: ganti `new Logger()` NestJS dengan `PinoLogger` yang di-inject (ditegakkan rule F3).
3. Query logger DB: jangan log `params` di staging (berpotensi PII); hanya di `development`.

### 4E. Redis & CacheService

| Masalah                                                          | Solusi                                                                                                                                          |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Hanya Cluster; local standalone → cache selalu bypass            | `REDIS_MODE` = `standalone` atau `cluster` (D6); provider mengembalikan tipe gabungan `RedisClient` (Redis atau Cluster). `REDIS_TLS` opsional. |
| Setelah retry habis, tidak pernah reconnect                      | Backoff dengan cap 30 detik, retry tanpa batas; status dilaporkan ke health sebagai `DEGRADED`.                                                 |
| `SET` + `EXPIRE` tidak atomic                                    | `set(key, val, 'EX', ttl)`.                                                                                                                     |
| `INCR` + `EXPIRE` tidak atomic                                   | `multi().incr(key).expire(key, ttl, 'NX').exec()`.                                                                                              |
| Negative cache tidak dipakai → API key acak selalu menghantam DB | `getOrSet(key, ttl, fetcher, { negativeTtl })` menyimpan sentinel `{"__nil":1}`. Dipakai di lookup partner.                                     |
| `isValidKey` menolak key yang mengandung substring `null`        | Cek per segmen (`:null`, `:undefined`, segmen kosong).                                                                                          |
| Token `'REDIS_CLIENT'` string                                    | Ganti `Symbol`.                                                                                                                                 |
| Method baru untuk F1                                             | `setIfAbsent(key, value, ttl)` (`SET NX EX`).                                                                                                   |

### 4F. Health & readiness

| Endpoint                | Gagal jika                         | Catatan                                                                       |
| ----------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| `/api/health/liveness`  | proses hang                        | Tanpa dependency.                                                             |
| `/api/health/readiness` | DB down **atau** env tidak lengkap | Redis down → `DEGRADED`, **tidak** membuat pod unready (konsisten fail-open). |
| `/api/health`           | —                                  | Detail status; pertimbangkan membatasi detail di production.                  |

- Lempar `AppServiceUnavailableException` (bukan `ServiceUnavailableException` bawaan).
- Hapus `@Transactional()` dari health check; cek transaksi cukup lewat repository dalam integration test.

### 4G. Bug kecil

1. `locale.util.ts`: parser `Accept-Language` sesuai RFC 9110 (urut berdasarkan q-value). Contoh: `"id, en;q=0.1"` → `id` (sekarang salah menjadi `en`).
2. `IdParamDto` numerik (lihat F5) agar `Number('abc')` tidak menghasilkan `NaN` dan berujung 500.

### Acceptance criteria

- [x] e2e memakai `configureApp` dan menguji: 400 validasi (snake_case field), 404 envelope, versioning `/api/v1`.
- [x] `X-Request-ID: "evil\nline"` → diganti UUID; header respons berisi ID final.
- [ ] Docker-compose lokal: cache hit teramati (log debug), health `redis: UP`. _(belum — Docker tidak aktif, lihat log)_
- [ ] Redis dimatikan → readiness tetap 200 dengan `status: DEGRADED`; app pulih otomatis saat Redis hidup lagi. _(unit test ✔; verifikasi live belum)_

---

## Fase 5 — Standar Database & Migrasi

**Tujuan**: konvensi kolom seragam, schema referensi read-only di level compiler, dan migrasi tidak pernah tertinggal.

### Langkah

1. **Definisi schema terpusat** — `src/database/schema/schemas.ts`:
   ```ts
   export const pengangkutUdara = pgSchema('pengangkut_udara');
   export const referensi = pgSchema('referensi');
   export const accessTools = pgSchema('access_tools');
   ```
   Semua tabel mengimpor dari sini (tidak lagi mendeklarasikan `pgSchema` lokal per file).
2. **Kolom standar** — `src/database/schema/columns.ts`:
   - `id: integer().primaryKey().generatedAlwaysAsIdentity()` (identity column, pengganti `serial`).
   - `timestamps`: `createdAt`, `updatedAt` (`timestamp({ withTimezone: true })`, `updatedAt.$onUpdate(() => new Date())`).
   - `auditColumns`: `createdBy`, `updatedBy` (userId SSO / partnerCode).
   - `softDelete`: `deletedAt` (nullable) + kebijakan: query default memfilter `deletedAt IS NULL`.
3. **Referensi read-only di compile time** — tabel `referensi`/`access_tools` didefinisikan sebagai `referensi.view('pelabuhan', { ... }).existing()`. Drizzle view tidak bisa dipakai di `.insert/.update/.delete` → pelanggaran gagal di `tsc`. (Verifikasi perilaku di drizzle-orm 0.45 lewat spike kecil sebelum menetapkan aturan.) Defense-in-depth: minta DBA memberi role aplikasi `GRANT SELECT` saja pada kedua schema referensi.
4. **Refactor `partner_credentials`** sesuai standar: identity id, `api_key_hash` + `api_key_prefix` (D11), audit columns, `deleted_at`, index unik `(partner_code) WHERE deleted_at IS NULL`.
5. **Generate migrasi pertama**: `npm run db:generate` → commit `drizzle/0000_*.sql` + `drizzle/meta/`. Perbaiki dokumen yang menyebut `pengangkut-udara/index.ts` (konfigurasi pakai folder).
6. **DTO query standar** — `src/common/dto/`:
   - `IdParamDto` → `id: z.coerce.number().int().positive()`; tambah `UuidParamDto`, `CodeParamDto`.
   - `createListQuerySchema({ sortable, filters })` → `page`, `limit`, `sort` (`field:asc|desc`, whitelist per modul), `search`.
   - Helper `buildPaginatedResult(rows, total, query)` di `src/common/` → service tidak menghitung `meta` sendiri (DRY).
7. **CI migration drift check** (job di F7): `npm run db:generate && git diff --exit-code drizzle/` → gagal jika ada perubahan schema tanpa migrasi ter-commit.

### Acceptance criteria

- [x] `db.insert(pelabuhan)` → error `tsc`.
- [ ] Mengubah schema tanpa commit migrasi → job CI gagal. _(ditunda sampai deploy pertama — lihat log)_
- [x] Semua tabel domain memakai `columns.ts`; `serial(` tidak lagi muncul di schema.

---

## Fase 6 — Strategi Testing

**Tujuan**: piramida test yang menguji SQL nyata, pipeline nyata, dan kontrak nyata — bukan hanya mock.

| Layer       | Lokasi                           | Infra                                                           | Menguji                                                                              |
| ----------- | -------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Unit        | `src/**/*.spec.ts`               | mock                                                            | logika murni, cabang error                                                           |
| Integration | `test/integration/*.int-spec.ts` | Postgres + Redis nyata                                          | repository (SQL nyata), transaksi rollback, CacheService atomicity, nonce/rate limit |
| E2E         | `test/*.e2e-spec.ts`             | app via `configureApp`, dependency eksternal di-stub (nock/msw) | pipeline HTTP lengkap, auth, envelope, i18n                                          |
| Contract    | `test/contract/*.e2e-spec.ts`    | —                                                               | response divalidasi `createBaseResponseSchema(...)`; OpenAPI snapshot                |

### Langkah

1. **Integration** (D7):
   - `test/jest-integration.json`, script `test:int`.
   - `test/integration/setup.ts`: jika `TEST_DATABASE_URL` ada → pakai (CI `services:`); jika tidak → start `@testcontainers/postgresql` + `@testcontainers/redis`. Jalankan `drizzle/init-schemas.sql` lalu migrasi.
   - Minimal: `partner-credential.repository.int-spec.ts`, `transactional-rollback.int-spec.ts`, `cache.service.int-spec.ts`.
   - D15: `BaseRepository` / `ChildRepository` terhadap PG16 nyata (lock, `record_changes` ikut rollback, sync detail, header soft-deleted), `activeUniqueIndex`, kolom tanggal/zona, serta `docs/runbooks/sql/record-changes-*.sql` (konversi partisi + retensi).
2. **E2E**: refactor `app.e2e-spec.ts` ke `configureApp`; tambah skenario partner HMAC end-to-end (sign → 200; replay → 401; IP salah → 403; 429).
3. **Stub outbound**: `nock` untuk INSW SSO/ACL (sukses, 401, timeout, 5xx).
4. **OpenAPI snapshot**: `scripts/generate-openapi.ts` (bootstrap dengan provider infrastruktur di-override, tanpa listen) → `openapi/openapi.json` di-commit. CI regenerasi lalu `git diff --exit-code`. Breaking change dideteksi `oasdiff breaking` terhadap branch target → menegakkan Breaking Change Policy yang sebelumnya hanya review-only.
5. **Test helper bersama**: `test/fixtures/` (factory entity, mock logger, mock txHost) agar spec tidak menyalin mock (mengurangi duplikasi Sonar).

### Acceptance criteria

- [ ] `npm run test:int` hijau secara lokal (Testcontainers) dan di CI (services).
- [ ] Menghapus field dari response DTO → job `openapi-breaking` gagal.
- [ ] e2e mencakup minimal satu skenario per `error.type`.

---

## Fase 7 — CI/CD & Container

### 7A. Pipeline GitLab (kerangka di Lampiran L5)

| Stage    | Job                                  | Kapan             | Catatan                                                                                                                                                                               |
| -------- | ------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| install  | `deps`                               | semua             | `npm ci` sekali, cache `.npm/` by `package-lock.json`                                                                                                                                 |
| verify   | `static`                             | MR + branch utama | `npm run validate:ci`                                                                                                                                                                 |
| verify   | `commitlint`                         | MR                | `commitlint --from $CI_MERGE_REQUEST_DIFF_BASE_SHA --to HEAD` (hook lokal bisa di-skip `--no-verify`)                                                                                 |
| verify   | `branch-name`                        | MR                | validasi `$CI_MERGE_REQUEST_SOURCE_BRANCH_NAME`                                                                                                                                       |
| verify   | `migration-drift`                    | MR                | F5 langkah 7                                                                                                                                                                          |
| verify   | `openapi-drift` + `openapi-breaking` | MR                | F6 langkah 4                                                                                                                                                                          |
| security | `audit`                              | MR + utama        | `npm run audit` (`--omit=dev --audit-level=high`, blocking) + `npm run audit:all` (informasional, `allow_failure: true`); selesaikan moderate `js-yaml` via upgrade `@nestjs/swagger` |
| security | `secrets`                            | MR + utama        | `gitleaks detect`                                                                                                                                                                     |
| security | `container-scan`                     | branch utama      | Trivy/Grype atas image (atau dari template LNSW)                                                                                                                                      |
| test     | `unit`                               | MR + utama        | artifacts: `coverage/lcov.info`, cobertura, junit                                                                                                                                     |
| test     | `e2e`, `integration`                 | MR + utama        | integration dengan `services: postgres:16, redis:7`                                                                                                                                   |
| quality  | `sonar`                              | MR + utama        | `needs: [unit]`, `sonar.qualitygate.wait=true` (D12)                                                                                                                                  |
| build    | `build` + `docker-build`             | MR + utama        | —                                                                                                                                                                                     |

Pengaturan GitLab (bukan file, dicatat di runbook): protected branches `main/development/staging/prod`, "Pipelines must succeed", "All threads resolved", approval CODEOWNERS wajib, squash commit message tervalidasi.

### 7B. Dockerfile

1. Runner: `npm ci --omit=dev --ignore-scripts` (tanpa ini `prepare: husky` kemungkinan gagal karena husky tidak terpasang di mode `--omit=dev`). Builder: `ENV HUSKY=0`.
2. `ENV TZ=Asia/Jakarta` (format `key=value`), `COPY` bukan `ADD`.
3. Hapus `COPY drizzle` dari runner (migrasi dieksekusi DBA, bukan container).
4. `HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:3000/api/health/liveness').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`.
5. `harden.sh` masih stub → konfirmasi isinya dengan template LNSW, atau hapus jika hardening dilakukan pipeline.
6. `docker-compose.yml`: tambah service `app` opsional (profile `full`) dan pastikan Redis standalone selaras D6.

### 7C. Dependency hygiene

- Renovate (atau Dependabot GitLab) dengan grouping `@nestjs/*`, jadwal mingguan, automerge patch untuk devDependencies.
- `overrides` didokumentasikan alasannya (komentar di `docs/`).

### Acceptance criteria

- [ ] Pipeline MR < 10 menit dengan cache.
- [ ] Commit dengan pesan invalid yang di-push `--no-verify` → job `commitlint` gagal.
- [ ] `docker build` sukses dan container `healthy`.

---

## Fase 8 — Observability & Resilience

> Kondisional pada D8. Bagian resilience (8B) tetap direkomendasikan walaupun observability ditunda.

### 8A. Observability

1. **Metrics**: `@willsoto/nestjs-prometheus` → `/metrics` (VERSION_NEUTRAL, `@Public()`, dibatasi network policy). Metrik:
   - `http_server_requests_seconds{method,route,status}` (histogram)
   - `http_client_requests_seconds{origin,status}`
   - `cache_operations_total{op,result=hit|miss|error|bypass}`
   - `partner_requests_total{partner_code,outcome,reason}`
   - `db_pool_*` bila tersedia
2. **Tracing**: OpenTelemetry Node SDK (instrumentasi http/express/ioredis) → OTLP ke Tempo; `trace_id` disisipkan ke log pino supaya log ↔ trace terhubung di Grafana.
3. **Dashboard & alert** sebagai kode: `ops/grafana/*.json`, aturan alert minimal (5xx rate, p95 latency, circuit open, partner REJECTED spike).

### 8B. Resilience outbound

1. `cockatiel` di `HttpClientService`, dikonfigurasi per origin lewat config:
   - **Timeout** (sudah ada).
   - **Retry** hanya untuk method idempotent (GET/HEAD) — 3x, exponential + jitter.
   - **Circuit breaker** per origin — terbuka setelah 5 kegagalan berturut-turut, half-open 30 detik; saat terbuka langsung melempar `ExternalServiceException` 503 `ERR_EXT_<ORIGIN>_CIRCUIT_OPEN`.
2. **Global throttler** (`@nestjs/throttler` + storage Redis) untuk route publik & SSO; route `@PartnerAuth()` di-skip karena sudah memakai limiter sendiri.
3. **Token-exchange helper** generik di `common/http/` untuk vendor berbasis login (didokumentasikan tapi belum ada implementasinya).

### Acceptance criteria

- [ ] Vendor down 5x → panggilan berikutnya gagal < 50 ms dengan code `CIRCUIT_OPEN`.
- [ ] `/metrics` memuat metrik di atas; log memuat `trace_id`.

---

## Fase 9 — Restrukturisasi Dokumentasi & Sinkronisasi Skills

**Tujuan**: dokumentasi ringkas, tidak saling bertentangan, dan skills AI merujuk ke sumber yang sama.

### 9A. Struktur baru

```
README.md                        ← quickstart (≤ 150 baris): setup, docker-compose, scripts
CONTRIBUTING.md                  ← workflow & gate (≤ 300 baris), tautan ke docs/standards
ARCHITECTURE_BLUEPRINT.md        ← blueprint agnostik (disinkronkan, tanpa detail implementasi)
docs/
├── standards/
│   ├── api-contract.md          ← envelope, casing (D1), versioning, Swagger
│   ├── error-handling.md        ← error taxonomy, APP_ERROR_CODES, i18n
│   ├── database.md              ← multi-schema, kolom standar, migrasi, raw SQL
│   ├── caching.md
│   ├── logging-observability.md
│   ├── configuration.md
│   ├── integration-outbound.md
│   ├── partner-inbound.md
│   ├── testing.md               ← SSOT coverage (D2), piramida test
│   └── security.md
├── partner-integration-guide.md ← untuk K/L: signing v1, contoh curl/Node/Java, error codes
├── runbooks/                    ← release DBA, rotasi kunci, onboarding partner, incident
├── adr/                         ← 0001-snake-case-contract.md, 0002-cjs-output.md, dst.
└── plans/                       ← dokumen ini
```

Setiap aturan di `docs/standards/*` diberi label penegak: `[tsc]`, `[eslint:<rule>]`, `[depcruise:<rule>]`, `[ls-lint]`, `[test]`, `[ci:<job>]`, atau `[review-only]`.

### 9B. Koreksi drift (wajib)

| Topik                                        | Saat ini (salah)                                           | Menjadi                                                         |
| -------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| Modul ES                                     | "ESM native, `type: module`"                               | "noden