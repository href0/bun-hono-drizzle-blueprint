# Contributing Guide & Engineering Standards

Panduan standar kode, arsitektur, dan alur kerja (*workflow*) untuk seluruh engineer dan AI coding agent pada repositori ini.

Semua standar di dokumen ini **di-enforce secara otomatis oleh gerbang kualitas (Quality Gates)** — pelanggaran akan memblokir proses commit dan pipeline CI/CD.

---

## Daftar Isi

1. [Quality Gates & Automated Enforcement](#1-quality-gates--automated-enforcement)
2. [Struktur Folder & Batasan Arsitektur](#2-struktur-folder--batasan-arsitektur)
3. [Standar HTTP Response & Error Envelopes](#3-standar-http-response--error-envelopes)
4. [Pure Controllers & Request Validation](#4-pure-controllers--request-validation)
5. [Database & Declarative ACID Transactions](#5-database--declarative-acid-transactions)
6. [Zero-Trust Configuration](#6-zero-trust-configuration)
7. [Enterprise Structured Logging (Pino)](#7-enterprise-structured-logging-pino)
8. [External Service Integration (HTTP Client)](#8-external-service-integration-http-client)
9. [Distributed Caching (Fail-Open Redis)](#9-distributed-caching-fail-open-redis)
10. [Panduan Scaffolding Modul Fitur Baru](#10-panduan-scaffolding-modul-fitur-baru)
11. [Konvensi Penamaan & Coding Standards](#11-konvensi-penamaan--coding-standards)
12. [Git Workflow & Conventional Commits](#12-git-workflow--conventional-commits)

---

## 1. Quality Gates & Automated Enforcement

Setiap commit dan push melewati lapis proteksi otomatis:

```
[1] git commit ditekan                       (cepat — hanya pemeriksaan per file & tipe)
      └─ pre-commit hook (Husky)
            ├─ lint-staged        → ESLint strictTypeChecked + Prettier (pada staged files)
            ├─ tsc --noEmit       → TypeScript strict typecheck seluruh proyek
            └─ ls-lint            → Validasi penamaan file & folder (kebab-case)

[2] Pesan commit diketik
      └─ commit-msg hook (Husky)
            └─ commitlint         → Validasi format pesan commit (Conventional Commits)

[3] git push dijalankan                      (pemeriksaan seluruh proyek)
      └─ pre-push hook (Husky)
            ├─ lint:branch        → Validasi nama branch sesuai standar branching strategy
            ├─ lint:arch          → depcruise: isolasi layer arsitektur (.dependency-cruiser.cjs)
            ├─ lint:deps          → knip: file, export, dan dependency yang tidak terpakai
            └─ bun test           → Seluruh unit & e2e test

[4] CI (GitHub Actions, .github/workflows/ci.yml) — setiap push ke main & pull request
      └─ nama branch + commitlint (PR) → typecheck → lint → ls-lint → prettier
         → depcruise → knip → test + coverage gate → build
```

Hook lokal bisa dilewati dengan `--no-verify`; CI menjalankan ulang semuanya, termasuk nama branch dan pesan commit.

**Coverage gate** (`scripts/check-coverage.ts` — satu-satunya sumber ambang):

- Dihitung dari file sumber saja (`*.test.ts` dan `test/` tidak ikut dihitung).
- Ambang global (lines & functions) dan ambang per file (lines) didefinisikan di konstanta `THRESHOLDS`.
- Test bersifat **hermetik**: `bunfig.toml` me-preload `test/setup/hermetic-env.ts` yang mengarahkan `DATABASE_URL`/`REDIS_*` ke port lokal tertutup — unit & e2e test tidak pernah menyentuh database/Redis pengembang, apa pun isi file env lokal (dijaga `test/hermetic-env.test.ts`). Integration test ke layanan asli (Step 6.1) memakai variabel `TEST_*` sendiri.
- `mock.module()` dilarang di test (ESLint): mock-nya bocor ke semua file test berikutnya dalam proses yang sama. Injeksi dependensi lewat default parameter konstruktor/fungsi.
- Setiap file di `src/` wajib dimuat oleh minimal satu test — Bun hanya menginstrumentasi file yang di-import test, sehingga file tanpa test terlihat sebagai pelanggaran, bukan lolos diam-diam. Barrel re-export murni dikecualikan otomatis.
- Pengecualian hanya lewat `COVERAGE_EXCLUSIONS` dengan alasan dan step rencana yang menghapusnya; daftarnya dicetak di setiap run.

**ESLint `eslint-disable`** wajib sempit dan beralasan: `// eslint-disable-next-line <rule> -- <alasan>`. Directive tanpa alasan, tanpa nama rule, atau yang sudah tidak diperlukan akan gagal lint.

**Komposisi rule ESLint**: di flat config, override yang lebih akhir **mengganti** seluruh array `no-restricted-syntax` / `no-restricted-imports` dari override sebelumnya untuk file yang cocok dengan keduanya. Jangan mendefinisikan ulang rule tersebut secara ad hoc — komposisikan grup konstanta di bagian atas `eslint.config.mjs` (`MODULE_SYNTAX_RULES`, `CONTROLLER_SYNTAX_RULES`, …).

### Perintah Validasi Lokal

| Perintah | Deskripsi | Kapan Digunakan |
|---|---|---|
| `bun run typecheck` | Menjalankan compiler TypeScript (`tsc --noEmit`) | Saat mengubah types/DTO/interface |
| `bun run lint` | Menjalankan ESLint 9 Flat Config dengan rule `strictTypeChecked` | Sebelum melakukan git commit |
| `bun run lint:fix` | Memperbaiki format ESLint & Prettier secara otomatis | Jika ada error format/styling |
| `bun run lint:ls` | Memvalidasi struktur penamaan file & folder | Saat menambah file/direktori baru |
| `bun run lint:arch` | Memeriksa pelanggaran batas layer arsitektur | Saat menambah ketergantungan antar layer |
| `bun run lint:deps` | Memeriksa file, export, dan dependency yang tidak terpakai (knip) | Saat menghapus/memindah kode atau mengelola package |
| `bun run lint:branch` | Memvalidasi kepatuhan format nama git branch aktif | Sebelum git push |
| `bun run verify:scaffold` | Men-generate modul contoh dari template skill `scaffold-module` lalu menjalankan prettier, tsc, ESLint, ls-lint, depcruise, knip, dan request nyata; semua file dikembalikan setelahnya | Setiap mengubah API inti (errors, response, middlewares, dto, i18n, database) atau template itu sendiri |
| `bun test` | Menjalankan seluruh Unit Test dan E2E Test | Setelah modifikasi logika bisnis |
| `bun run test:cov` | Menjalankan test + coverage gate (`scripts/check-coverage.ts`) | Saat memastikan kelayakan test coverage |
| **`bun run validate:full`** | **Menjalankan seluruh gerbang kualitas secara berurutan** | **Wajib sebelum membuat Pull/Merge Request** |

---

## 2. Struktur Folder & Batasan Arsitektur

### 2.1 Anatomi Direktori Standar

```
src/
├── config/                      # Zero-Trust Zod Configuration (fail-fast on startup)
│   ├── env-source.ts            # Satu-satunya pembaca process.env
│   ├── parse-env.ts             # Validasi per grup; error berisi nama variabel, tanpa nilai
│   ├── <group>.config.ts        # app, database, redis, http, integrations
│   └── index.ts                 # Barrel
│
├── core/                        # Cross-Cutting Core Framework (Agnostik Domain)
│   ├── cache/                   # Redis Fail-Open Caching & Key Generators
│   ├── dto/                     # Schema request bersama (uuidParamSchema, paginationQuerySchema)
│   ├── errors/                  # Semantic ApiError Hierarchy
│   ├── http/                    # Enterprise HTTP Client dengan Persistent Keep-Alive Pool
│   ├── logger/                  # Pino Logger Singleton dengan PII Redaction
│   ├── middlewares/             # Hono Middlewares (requestContext, clientIp, cors, bodySizeLimit, rateLimit, validate, globalErrorHandler, dll.)
│   ├── openapi/                 # describeEndpoint, schema envelope, dokumen OpenAPI + UI Scalar (/api/docs)
│   └── response/                # Standard Success Response Envelope (ApiResponse)
│
├── database/                    # Drizzle ORM Infrastructure & Data Layer
│   ├── connection.ts            # PostgreSQL connection pool via postgres driver
│   ├── audited.repository.ts    # AuditedRepository: lock, diff, record_changes dalam transaksi yang sama
│   ├── base.repository.ts       # BaseRepository: scope soft delete, cap actor, update/soft delete/restore teraudit
│   ├── child.repository.ts      # ChildRepository: detail hanya lewat header-nya (anti IDOR), sync
│   ├── append-only.repository.ts # AppendOnlyRepository: tabel pencatatan (tambah + baca)
│   ├── read-only.repository.ts  # ReadOnlyRepository: view referensi (baca saja)
│   ├── transaction-host.ts      # TransactionHost (dynamic active tx / pool resolution)
│   ├── transactional.decorator.ts # @Transactional() decorator & runInTransaction
│   └── schema/                  # Definisi tabel (public) & view referensi
│       ├── schemas.ts           # appTable (public) & referenceSchema — satu-satunya pgTable/pgSchema
│       ├── columns.ts           # Helper kolom: uuidPrimaryKey, timestamps, instant, softDelete, …
│       ├── append-only-tables.ts # Allowlist tabel yang boleh memakai PK bigint
│       ├── domain/              # Application Domain Schemas (Full CRUD & Migrated)
│       └── reference/           # Reference Schemas (Read-Only, Shared DBs)
│
├── integrations/                # Outbound Third-Party Gateways (No routes, No controllers)
│   └── jsonplaceholder/         # Referensi Integrasi REST API Publik (Outbound Only)
│       ├── jsonplaceholder.dto.ts      # Kontrak payload & respon vendor
│       ├── jsonplaceholder.service.ts  # Service client berbasis HttpClientService
│       ├── jsonplaceholder.service.test.ts # Co-located Unit Test (Offline Mock)
│       └── index.ts             # Public export untuk dikonsumsi domain modules
│
├── modules/                     # Inbound Domain Feature Modules (Client-Facing HTTP)
│   ├── health/                  # Health UP/DEGRADED/DOWN, readiness, liveness (/api/health, tanpa versi)
│   └── users/                   # Modul Referensi Produksi (/api/v1/users)
│       ├── users.dto.ts         # Zod schemas (create, update, query, params)
│       ├── users.repository.ts  # Database access via this.txHost.tx
│       ├── users.service.ts     # Business logic orchestration + @Transactional()
│       ├── users.service.test.ts# Co-located Unit Test
│       ├── users.transformer.ts # Data cleaning (menghilangkan password/hash)
│       ├── users.controller.ts  # Pure controller returning ApiResponse
│       └── users.routes.ts      # Hono routing & middleware binding
│
├── utils/                       # Pure Utility Functions (Bebas framework/DB dependency)
│
├── app.ts                       # Hono Application Factory & Middlewares Pipeline
└── index.ts                     # Bun Application Entrypoint (Bun.serve)

test/                            # End-to-End (E2E) & Blackbox API Tests
├── health.e2e.test.ts
└── users.e2e.test.ts
```

### 2.2 Boundary Isolation Matrix (Enforced by `dependency-cruiser`)

#### A. Makro Layer Isolation (Antar Direktori Tingkat Atas)
| Layer | Boleh Mengimpor Dari | DILARANG Mengimpor Dari | Alasan Arsitektural |
|---|---|---|---|
| `src/config/` | Library (`zod`, `node:*`) | `src/core/`, `src/database/`, `src/modules/`, `src/integrations/`, `src/utils/` | Akar graf dependensi; mencegah siklus config ↔ logger (`strict-config-isolation`) |
| `src/utils/` | External pure utilities | `src/modules/`, `src/core/`, `src/database/`, `src/integrations/` | Utils harus pure & side-effect free |
| `src/core/` | Node/Bun libraries, `src/utils/`, `src/config/` | `src/modules/`, `src/database/`, `src/integrations/` | Mencegah coupling dari core ke domain, database & integrasi |
| `src/database/schema/`| `drizzle-orm`, `drizzle-orm/pg-core`, `src/utils/` | `src/modules/`, `src/core/`, `src/config/`, `src/integrations/` | Schema DB tidak boleh bergantung pada aplikasi (utils murni boleh, mis. parser waktu) |
| `src/database/` | `src/config/`, `src/utils/`, `src/core/` (request context, errors) | `src/modules/`, `src/integrations/` | Infra DB tidak boleh bergantung pada domain & integrasi; actor audit dari request context |
| `src/integrations/<vendor>`| `src/core/http/`, `src/config/`, `src/utils/` | `src/modules/`, `src/database/`, vendor integrasi lain | Outbound adapter murni; dilarang mengakses domain atau database |
| `src/modules/<feature>`| `src/core/`, `src/database/` (abstraksi/types), `src/integrations/`, `src/config/` | `src/database/connection.ts`, `src/modules/<other>` | Modul dilarang sentuh raw connection DB dan dilarang cross-import liar |

#### B. Mikro Layer Isolation (Aliran Unidirectional di Internal Modul)
| Komponen Modul | Boleh Mengimpor | DILARANG Mengimpor | Alasan Arsitektural |
|---|---|---|---|
| `*.routes.ts` | `*.controller.ts`, `*.dto.ts`, middlewares | `*.service.ts`, `*.repository.ts` | Route hanya menghubungkan HTTP path ke controller |
| `*.controller.ts` | `*.service.ts`, `*.dto.ts`, `*.transformer.ts`, `core/response` | `*.repository.ts` | Controller dilarang membypass service layer |
| `*.service.ts` | `*.repository.ts`, `src/integrations/*`, `*.dto.ts`, `core/*`, `utils/*`, `database` (tx/types) | `*.controller.ts`, `*.routes.ts`, `*.transformer.ts` | Service murni logika domain, dilarang terikat presentation layer |
| `*.repository.ts` | `database` (TransactionHost/schema), entity types, `utils/*` | `*.service.ts`, `*.controller.ts`, `*.routes.ts` | Repository adalah data-access leaf node |
| `*.transformer.ts`| DTO / Schema types | `*.service.ts`, `*.repository.ts`, `*.controller.ts` | Transformer adalah pure data mapper tanpa side-effects |

---

## 3. Standar HTTP Response & Error Envelopes

Frontend (FE) tidak boleh menerima format response yang berbeda-beda antar endpoint. Kontrak casing berlaku **dua arah**:

- **Response**: seluruh key `snake_case` (dikonversi otomatis oleh `ApiResponse.toJSON()` dan `globalErrorHandler`).
- **Request (body & query)**: FE wajib mengirim key `snake_case`. Key dengan casing lain (`fullName`, `full-name`) ditolak 400 `ERR_NON_SNAKE_CASE_KEY` dengan `details` berisi setiap key persis seperti yang dikirim. Payload yang lolos dikonversi ke camelCase sebelum Zod, sehingga DTO tetap camelCase. Param route tidak dikonversi.

### 3.1 Kontrak Response Sukses (2xx)

Semua response sukses dibungkus ke format standar:

```json
{
  "success": true,
  "status_code": 200,
  "message": "User retrieved successfully",
  "data": {
    "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "email": "user@example.com",
    "full_name": "John Doe",
    "is_active": true
  }
}
```

Jika data berupa daftar berpaginasi (*paginated list*), field `meta` otomatis disertakan dalam format `snake_case`:

```json
{
  "success": true,
  "status_code": 200,
  "message": "Users retrieved successfully",
  "data": [ ... ],
  "meta": {
    "current_page": 1,
    "per_page": 10,
    "total_items": 42,
    "total_pages": 5
  }
}
```

### 3.2 Kontrak Response Error (4xx & 5xx)

Semua error ditangkap oleh `globalErrorHandler` di [error-handler.ts](src/core/middlewares/error-handler.ts):

```json
{
  "success": false,
  "status_code": 400,
  "message": "Validation Failed",
  "error": {
    "type": "VALIDATION_ERROR",
    "code": "ERR_INVALID_INPUT",
    "origin": "APP",
    "details": [
      { "field": "email", "message": "Invalid email address format" },
      { "field": "password", "message": "Password must be at least 8 characters" }
    ]
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-09-24T04:13:08.000Z"
}
```

Aturan envelope error (dibangun satu tempat: `buildErrorBody()` di `src/core/response/error-response.ts`, dipakai `globalErrorHandler` dan `notFoundHandler`):

- Tidak ada field `data` pada envelope error.
- `error.code` hanya dari `APP_ERROR_CODES`; literal `'ERR_*'` di `src/` ditolak ESLint.
- `error.origin` = `APP`, atau kode integrasi untuk kegagalan sistem eksternal.
- `details[].field` selalu snake_case (`address.postal_code`).
- Error 500 (`InternalServerError` atau error tak dikenal) tidak pernah membocorkan pesan/detail internal — pesan aslinya hanya di log.
- 429 dengan `retryAfterSeconds` mengirim header `Retry-After`.

### 3.3 Semantic Error Classes

Dilarang melempar error string mentah atau plain `Error` di `src/modules/**` (ditegakkan ESLint). Wajib menggunakan class turunan `ApiError` dari `src/core/errors/` dengan bentuk `new XError(message, { details?, origin?, code? })`:

| Class | HTTP Status | Error Type | Error Code | Penggunaan |
|---|---|---|---|---|
| `ValidationError` | 400 | `VALIDATION_ERROR` | `ERR_INVALID_INPUT` (default) · `ERR_INVALID_JSON` · `ERR_NON_SNAKE_CASE_KEY` | Skema Zod tidak terpenuhi · body bukan JSON valid · key bukan snake_case (`field` = key persis seperti dikirim) |
| `BadRequestError` | 400 | `BAD_REQUEST` | `ERR_BAD_REQUEST` | Pelanggaran aturan bisnis |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` | `ERR_UNAUTHORIZED` | Token tidak ada / expired |
| `ForbiddenError` | 403 | `FORBIDDEN` | `ERR_FORBIDDEN` | Role user tidak berhak mengakses |
| `NotFoundError` | 404 | `NOT_FOUND` | `ERR_NOT_FOUND` | Resource entitas tidak ditemukan |
| `ConflictError` | 409 | `CONFLICT` | `ERR_CONFLICT` | Data unik sudah terdaftar (duplikat) |
| `PayloadTooLargeError` | 413 | `PAYLOAD_TOO_LARGE` | `ERR_PAYLOAD_TOO_LARGE` | Body melebihi batas |
| `TooManyRequestsError` | 429 | `TOO_MANY_REQUESTS` | `ERR_RATE_LIMITED` | Rate limit (opsional `retryAfterSeconds` → header `Retry-After`) |
| `ServiceUnavailableError` | 503 | `SERVICE_UNAVAILABLE` | `ERR_SERVICE_UNAVAILABLE` | Dependency inti (DB) tidak tersedia |
| `ExternalServiceError` | 502/504 | `EXTERNAL_SERVICE_ERROR` | `ERR_EXT_TIMEOUT` / `ERR_EXT_UNREACHABLE` / `ERR_EXT_ERROR` | Kegagalan API vendor; status vendor tidak pernah diteruskan, vendor diidentifikasi lewat `error.origin` |
| `InternalServerError` | 500 | `INTERNAL_SERVER_ERROR` | `ERR_INTERNAL` | Invariant internal rusak; pesan tidak dikirim ke client |

### 3.4 Pesan Dwibahasa (i18n `id` / `en`)

Bahasa respons dipilih per request dari header `Accept-Language` (RFC 9110: urut q-value, `en-US` → `en`, bahasa tak didukung → `DEFAULT_LOCALE`, default `id`). Locale disimpan di `RequestContext` dan diumumkan lewat header `Content-Language` (+ `Vary: Accept-Language`).

- Pesan untuk client berupa `LocalizedMessage` = `{ id, en }` — tipe memaksa setiap bahasa terisi.
- Pesan lintas modul ada di `I18N_MESSAGES` (`src/core/i18n/messages.ts`); pesan domain ada di `src/modules/<name>/<name>.messages.ts` (mis. `USER_MESSAGES`, `userNotFoundMessage(id)` untuk pesan berparameter).
- String literal sebagai pesan `new ApiResponse(...)`, `new XError(...)`, atau `details[].message` di `src/modules/**` **ditolak ESLint**. Pengecualian: `InternalServerError` (pesannya hanya untuk log, tidak pernah dikirim ke client).
- `Error.message` selalu bahasa Inggris (log seragam); terjemahan terjadi saat envelope dibangun.
- Keterbatasan: pesan per field dari skema Zod tidak diterjemahkan (ditulis apa adanya di schema).

```typescript
// users.messages.ts
export const USER_MESSAGES = {
  CREATED: { id: 'Pengguna berhasil dibuat', en: 'User created successfully' },
} as const satisfies Record<string, LocalizedMessage>;

// users.controller.ts
return new ApiResponse(responseData, USER_MESSAGES.CREATED, 201);
```

---

## 4. Pure Controllers & Request Validation

### 4.1 Prinsip Pure Controller
- **DILARANG KERAS** memanggil `c.json()` di dalam file `*.controller.ts` (di-enforce oleh ESLint AST rule `MemberExpression[object.name="c"][property.name="json"]`).
- Controller **HANYA** bertugas:
  1. Mengambil input tervalidasi via helper (`getValidatedBody`, `getValidatedQuery`, `getValidatedParams`).
  2. Memanggil method Service layer.
  3. Mengonversi hasil domain ke bentuk DTO response via Transformer murni.
  4. Mengembalikan (*return*) instance `new ApiResponse(data, message, statusCode, meta)`.
- Seluruh handler controller wajib dibungkus oleh `asyncHandler`.

```typescript
// BENAR: Pure Controller
export class UsersController {
  create = asyncHandler(async (c) => {
    const dto = getValidatedBody<CreateUserDto>(c);
    const user = await this.service.createUser(dto);
    const responseData = toUserResponse(user);
    return new ApiResponse(responseData, USER_MESSAGES.CREATED, 201);
  });
}

// SALAH: Ditolak oleh ESLint AST
export class UsersController {
  create = async (c: Context) => {
    const user = await this.service.createUser(c.req.json());
    return c.json({ user }); // LINT ERROR!
  };
}
```

### 4.2 Async Zod Validation Middleware
Validasi request dipusatkan pada route menggunakan middleware `validate({ body, query, params })`:

```typescript
// users.routes.ts
userRoutes.post(
  '/',
  validate({ body: createUserSchema }),
  usersController.create,
);
```

Prefix path internal (`body.`, `query.`) otomatis dibersihkan dan nama field dikirim dalam snake_case, agar FE dapat langsung memetakan nama field ke form error.

- **Schema bersama** (`src/core/dto/common.dto.ts`): `uuidParamSchema` untuk `:id` (UUID salah format → 400, bukan error database) dan `paginationQuerySchema` untuk `?page=&per_page=` (maks `MAX_PER_PAGE` = 100). Gunakan ulang, jangan didefinisikan ulang per modul.
- **Dictionary bebas**: field berisi key bebas (mis. `metadata`) didaftarkan lewat `validate({ body, preserveKeys: ['metadata'] })` — isinya tidak dicek dan tidak dikonversi (hanya field top-level). Untuk kontrak publik, utamakan array `{ key, value }`.
- **Keterbatasan — dictionary di response**: `preserveKeys` hanya berlaku untuk request. `ApiResponse` mengonversi semua key response (termasuk dictionary yang dikembalikan) ke snake_case, sehingga `{ someKey: 1 }` dikirim sebagai `{ some_key: 1 }`. Untuk kontrak publik utamakan array `{ key, value }`; opt-out di sisi response baru ditambahkan bila ada kebutuhan nyata.

---

## 5. Database & Declarative ACID Transactions

### 5.1 Tabel, Helper Kolom & Audit
1. **Tabel di `public` (`appTable`, `src/database/schema/schemas.ts`)**: proyek memiliki database sendiri, jadi semua tabel berada di schema bawaan `public` — tidak ada schema bernama proyek. `pgTable(`/`pgSchema(` hanya boleh di `schemas.ts` (ESLint). Multi-tenant per schema (SaaS) adalah fitur opsional terpisah (backlog).
2. **Helper kolom (`src/database/schema/columns.ts`)**: `uuidPrimaryKey()` (UUID v7 default), `sequentialPrimaryKey()` (hanya tabel di `APPEND_ONLY_TABLES`), `timestamps()`, `instant()`, `calendarDate()`, `auditColumns()`, `softDelete()`, `parentReference()`, `activeUniqueIndex()`. Di file schema, `timestamp(`/`date(`/`serial(`/`pgTable(`/`.defaultRandom()` ditolak ESLint.
3. **Reference (opsional, `src/database/schema/reference/`)**: data milik sistem lain, dibaca lewat `referenceSchema.view(...).existing()` — tidak pernah dibuat/dimigrasi drizzle-kit, dan `insert` gagal saat kompilasi.
4. **Repository**: setiap `*.repository.ts` modul meng-extend satu base sesuai jenis tabel — `BaseRepository` (mandiri/header), `ChildRepository` (detail), `AppendOnlyRepository` (pencatatan), `ReadOnlyRepository` (view referensi). Lihat §5.3.
5. Panduan lengkap: `.agents/skills/project-standards/references/database.md`.

### 5.2 Pola Declarative Transaction (`TransactionHost` & `@Transactional()`)

Sistem menggunakan native Bun `AsyncLocalStorage` untuk menjamin kepatuhan ACID tanpa *parameter drilling*:

```
Service Method (@Transactional())
  └─ Interceptor membuka DB Transaction
        └─ Menyimpan client transaksi ke AsyncLocalStorage
              └─ Repository memanggil this.txHost.tx (otomatis memakai transaksi aktif)
  └─ Method selesai tanpa exception  → COMMIT
  └─ Method melempar exception       → ROLLBACK
```

#### Aturan Penulisan Repository:
- **DILARANG** mengimpor root `db` langsung di dalam repository (di-enforce oleh ESLint rule).
- Wajib menginjeksi atau menginisialisasi `TransactionHost` dan mengakses database via `this.txHost.tx`.

```typescript
// users.repository.ts
export class UsersRepository {
  constructor(private readonly txHost: TransactionHost = defaultTxHost) {}

  async findById(id: string): Promise<User | null> {
    const result = await this.txHost.tx.select().from(users).where(eq(users.id, id));
    return result[0] ?? null;
  }
}
```

#### Aturan Penulisan Service:
- Method yang memodifikasi data database wajib diberi decorator `@Transactional()`.
- Operasi baca murni tidak membutuhkan `@Transactional()` (langsung mengakses connection pool).

```typescript
// users.service.ts
export class UsersService {
  @Transactional()
  async createUser(dto: CreateUserDto): Promise<User> {
    const existing = await this.repo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictError(USER_MESSAGES.EMAIL_TAKEN, {
        details: [{ field: 'email', message: USER_MESSAGES.EMAIL_ALREADY_REGISTERED }],
      });
    }
    return this.repo.create({ ... });
  }
}
```

### 5.3 Aturan Data Layer yang Ditegakkan Mesin

Setiap perubahan baris domain melewati base repository (kunci baris, scope soft delete, cap actor, `record_changes` dalam transaksi yang sama). Aturan berikut membuat jalan pintas gagal lint:

| Aturan | Berlaku di | Penegak |
|---|---|---|
| Class repository wajib `extends` `BaseRepository` / `ChildRepository` / `AppendOnlyRepository` / `ReadOnlyRepository` | `src/modules/**/*.repository.ts` | ESLint `REPOSITORY_SYNTAX_RULES` |
| `tx.update(` / `tx.delete(` dilarang (pakai `updateById`, `softDeleteById`, `ChildRepository` …) | repository modul | ESLint `REPOSITORY_SYNTAX_RULES` |
| `tx.insert(` / `tx.update(` / `tx.delete(` dilarang | modul selain repository | ESLint `TX_WRITE_RULES` |
| `UPDATE` / `DELETE FROM` di dalam `` sql`…` `` dilarang | semua file modul | ESLint `RAW_WRITE_SQL_RULES` |
| `tx.execute(` (raw query) hanya di `<name>.queries.ts` (fungsi murni, baca saja) | modul | ESLint `RAW_QUERY_RULES` |
| `@Transactional()` hanya di `*.service.ts` | modul | ESLint `TRANSACTIONAL_RULES` |
| `TransactionHost` / `defaultTxHost` / `transactionStorage` hanya di repository & `*.queries.ts` (test modul boleh) | modul | ESLint `TX_HOST_IMPORT_PATTERN` + depcruise `transaction-host-only-in-repositories` |
| `recordChanges` tidak di-import di luar `src/database/` | seluruh `src/` | ESLint (`importNames`, juga lewat barrel) + depcruise `record-changes-only-in-database` |
| `sql.raw(` dilarang (pakai `sql.identifier()`; fragmen statis = `eslint-disable` + alasan) | seluruh `src/` | ESLint `SQL_RAW_RULES` |

- Pengecualian yang disetujui: `auth_refresh_tokens` (Step 3.2) lewat `eslint-disable-next-line <rule> -- <alasan>`.
- Seeder (`src/database/seeds/**`) berada di lapisan database, bukan modul: aturan modul di atas tidak berlaku untuknya.
- Konvensi schema diuji di `src/database/schema/schema-conventions.test.ts` untuk setiap tabel yang diekspor: FK wajib ter-index, `id` dari helper, id berurutan hanya di `APPEND_ONLY_TABLES` (tanpa entri basi), tanpa `serial`, tabel soft delete tanpa unique biasa (`activeUniqueIndex()`), `record_changes` siap partisi. Pesan gagal menyebut tabel & kolom.
- `[review-only]`: query baca kustom di subclass `BaseRepository` wajib dimulai dari `this.scoped(...)` agar baris yang terhapus tetap tersembunyi.

---

## 6. Zero-Trust Configuration

1. **`process.env` DIBLOKIR**: Di-enforce otomatis oleh ESLint `no-process-env`. `process.env` **HANYA** boleh diakses di dalam `src/config/env-source.ts` dan `drizzle.config.ts`.
2. **Crash-Fast on Startup**: Setiap grup (`src/config/<group>.config.ts`) divalidasi Zod lewat `parseEnv()` saat aplikasi booting. Bila ada variabel yang hilang atau salah format, aplikasi berhenti dengan daftar **semua** variabel yang salah **dalam grup pertama yang gagal** (nama + aturan, tanpa nilai — env bisa berisi secret). Grup divalidasi saat modulnya di-import, sehingga grup berikutnya baru dilaporkan setelah grup ini diperbaiki.
3. Seluruh bagian aplikasi mengimpor konfigurasi dari barrel `src/config` (`appConfig`, `databaseConfig`, `redisConfig`, `httpConfig`, `integrationsConfig`).
4. **Menambah variabel**: tambahkan ke schema grup yang sesuai (atau grup baru `<group>.config.ts` dengan pola `build<Group>Config(source)` + instance), tambahkan test di `src/config/config.test.ts`, dan dokumentasikan di `.env.example` pada bagian grupnya.
5. **Mengganti nama / menghapus variabel**: daftarkan nama lama di `RENAMED_ENV_VARS` (`src/config/parse-env.ts`) beserta penggantinya. Aplikasi menolak start bila nama lama masih diset (hanya nama, tanpa nilai) — tanpa ini nama lama diabaikan diam-diam (mis. CORS mati tanpa pesan).

---

## 7. Enterprise Structured Logging (Pino)

1. **`console.log`, `console.warn`, `console.error` DIBLOKIR KERAS** (di-enforce oleh ESLint `no-console`).
2. Gunakan singleton `logger` dari `src/core/logger/logger.ts`. `requestId` dan `actor` ditambahkan otomatis ke setiap baris log selama request (Pino `mixin` dari `RequestContext`) — jangan dioper manual dan jangan dibaca dari Hono `Context`.
3. **Format Objek Pertama, Pesan Kedua**:
   ```typescript
   // BENAR — Terstruktur dalam format JSON (Grafana Loki compatible)
   logger.info({ userId, attempt: 1 }, 'User authentication initiated');
   logger.error({ userId, err: error.message }, 'Failed to authenticate user');

   // SALAH — Interpolasi string merusak struktur JSON
   logger.info(`User ${userId} authenticated`);
   ```
4. **Automatic PII Redaction**: Field sensitif (`password`, `token`, `authorization`, `apiKey`, `secret`, `nik`, `creditCard`) otomatis disamarkan menjadi `[REDACTED]`.

---

## 8. External Service Integration (Outbound Adapters)

Setiap pemanggilan HTTP ke API pihak ketiga atau vendor eksternal (seperti WhatsApp Gateway, Payment Gateway, SMS Gateway, Email Provider, S3 Storage) **WAJIB dipisahkan ke dalam direktori `src/integrations/<vendor>/`** menggunakan `HttpClientService` dari `src/core/http`.

> [!IMPORTANT]
> **Enforcement Isolasi `HttpClientService`:**
> - `HttpClientService` dan `src/core/http` **HANYA BOLEH di-import di dalam `src/integrations/**`**.
> - Layer `src/modules/**` **DILARANG KERAS** mengimpor `HttpClientService` secara langsung. Domain service hanya boleh mengonsumsi service adapter integrasi (contoh: `JsonPlaceholderService`).
> - Controller **DILARANG** mengimpor integrasi secara langsung (harus melalui service domain).
> - Pelanggaran aturan ini diblokir secara otomatis oleh **ESLint AST Rule** (`no-restricted-syntax`, `no-restricted-imports`) dan **Dependency Cruiser** (`http-client-only-in-integrations`).

### Prinsip Arsitektur: Inbound Modules vs Outbound Integrations
- **`src/modules/<name>/` (Inbound Feature Modules)**: Mengembangkan endpoint HTTP untuk client aplikasi (FE/Mobile). Wajib memiliki `routes -> controller -> service -> repository`.
- **`src/integrations/<vendor>/` (Outbound Integration Adapters)**: Murni service client untuk memanggil API pihak ketiga. **TIDAK MEMILIKI `routes` maupun `controller`**. Hanya dikonsumsi oleh `*.service.ts` di dalam layer `modules`.

### Contoh Referensi Produksi: JSONPlaceholder (`src/integrations/jsonplaceholder/`)
Repositori ini menyediakan implementasi referensi nyata yang dapat langsung di-test dan dijalankan di [src/integrations/jsonplaceholder/](src/integrations/jsonplaceholder/):

1. **Konfigurasi URL & Timeout** (`src/config/integrations.config.ts`):
   ```typescript
   JSONPLACEHOLDER_BASE_URL: z.string().url().default('https://jsonplaceholder.typicode.com'),
   JSONPLACEHOLDER_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
   ```
2. **Inisialisasi Client di Integration Service** (`src/integrations/jsonplaceholder/jsonplaceholder.service.ts`):
   ```typescript
   export const defaultJsonPlaceholderHttpClient = new HttpClientService({
     baseURL: integrationsConfig.JSONPLACEHOLDER_BASE_URL,
     timeoutMs: integrationsConfig.JSONPLACEHOLDER_TIMEOUT_MS,
     originName: 'JSONPLACEHOLDER',
   });

   export class JsonPlaceholderService {
     constructor(private readonly httpClient: HttpClientService = defaultJsonPlaceholderHttpClient) {}

     async getUserPosts(userId: number): Promise<JsonPlaceholderPost[]> {
       return this.httpClient.get<JsonPlaceholderPost[]>('/posts', { params: { userId } });
     }
   }
   ```
3. **Konsumsi di Domain Service Utama** (pada `src/modules/users/users.service.ts`):
   ```typescript
   import { jsonPlaceholderService, JsonPlaceholderService } from '../../integrations/jsonplaceholder';

   export class UsersService {
     constructor(
       private readonly repo: UsersRepository = usersRepository,
       private readonly cache: CacheService = cacheService,
       private readonly jsonPlaceholder: JsonPlaceholderService = jsonPlaceholderService,
     ) {}

     async getUserExternalPosts(userId: string): Promise<JsonPlaceholderPost[]> {
       await this.getUserById(userId); // Validasi user lokal ada
       return this.jsonPlaceholder.getUserPosts(1); // Ambil data pihak ketiga
     }
   }
   ```
4. **Eksposur Endpoint Domain** (`GET /api/v1/users/:id/external-posts`):
   Client frontend memanggil endpoint domain users, bukan memanggil API pihak ketiga secara langsung.
5. **Offline-Safe Unit Testing** (`src/integrations/jsonplaceholder/jsonplaceholder.service.test.ts`):
   Unit test meng-mock `HttpClientService` sehingga CI pipeline berjalan 100% deterministik dan offline tanpa latency jaringan.

### Fitur Standar `HttpClientService`:
- **Persistent Keep-Alive Connection Pool**: Menggunakan persistent `http.Agent` dan `https.Agent` dengan `maxSockets: 100` untuk mencegah TLS handshake berulang.
- **Mandatory Timeout**: Menolak hanging request (default 10 detik).
- **Vendor Error Masking**: Error axios otomatis di-mask menjadi `ExternalServiceError` — timeout → 504 `ERR_EXT_TIMEOUT`, tanpa respons → 502 `ERR_EXT_UNREACHABLE`, respons error vendor → 502 `ERR_EXT_ERROR` (status vendor tidak diteruskan); `error.origin` = kode integrasi.

---

## 9. Distributed Caching (Fail-Open Redis)

1. Semua cache key **WAJIB** didefinisikan secara terpusat di `src/core/cache/cache-keys.ts`.
2. Dilarang menulis string key secara langsung (*hardcoded string keys*).
3. **Fail-Open Architecture**: Jika Redis server down, lambat (> `REDIS_COMMAND_TIMEOUT_MS`), atau belum siap, `CacheService` otomatis melakukan bypass dan memanggil database fetcher. **Request pengguna tidak boleh crash hanya karena Redis offline.**
4. Jangan menambahkan prefix proyek/environment sendiri: client menambahkan `<APP_NAME>:<NODE_ENV>:` otomatis (override `REDIS_KEY_PREFIX`). `FLUSHALL`, `FLUSHDB`, dan `KEYS` diblokir — gunakan `SCAN` atau TTL.
5. Primitif lain: `setIfAbsent` (nonce/idempotency, `SET NX EX`), `increment` (rate limit, fixed window), dan `getOrSet(…, { negativeTtl })` untuk lookup berdasarkan input tak tepercaya. Detail: `.agents/skills/project-standards/references/redis-cache.md`.

```typescript
const user = await this.cache.getOrSet(
  CACHE_KEYS.userDetail(id),
  CACHE_TTL.USER_DETAIL,
  async () => this.repo.findById(id),
);
```

---

## 10. Panduan Scaffolding Modul Fitur Baru

Gunakan urutan langkah ini setiap kali membuat modul domain baru (`<feature>`):

1. **Drizzle Schema**: Buat file `src/database/schema/domain/<feature>.schema.ts` dengan `appTable(...)` + helper kolom (`uuidPrimaryKey()`, `timestamps()`), lalu re-export di `schema/domain/index.ts`.
2. **Generate Migration**: Jalankan `bun run db:generate`.
3. **DTO Zod**: Field waktu memakai `instantField` (`*_at`), `calendarDateField` (`*_date`), `timeZoneField` (`*_timezone`) dari `src/core/dto/datetime.dto.ts` — jangan `new Date(...)` (termasuk `new Date()` untuk "sekarang": maupun `Temporal.Now`: pakai `nowInstant()` / `nowIsoUtc()`) maupun `Date.parse` (ditolak ESLint; panduan `references/datetime.md`). Buat file `src/modules/<feature>/<feature>.dto.ts` — schema request **dan** schema response (`<feature>ResponseSchema`, waktu memakai `isoInstant()` / `isoCalendarDate()`); transformer memakai tipe `z.infer` dari schema response.
4. **Repository**: Buat file `src/modules/<feature>/<feature>.repository.ts` menggunakan `this.txHost.tx`.
5. **Transformer**: Buat file `src/modules/<feature>/<feature>.transformer.ts` untuk membersihkan data.
6. **Service**: Buat file `src/modules/<feature>/<feature>.service.ts` dengan `@Transactional()` pada operasi tulis.
7. **Controller**: Buat file `src/modules/<feature>/<feature>.controller.ts` dibungkus `asyncHandler` dan me-return `ApiResponse`.
8. **Routes**: Buat file `src/modules/<feature>/<feature>.routes.ts`: setiap route **wajib** memakai `describeEndpoint({ tags, summary, response, errors })` lalu `validate({ ... })`. `errors` cukup berisi error domain (404, 409, …); request body, parameter, 400/413, 429/500, dan header umum terdokumentasi otomatis. Route tanpa `describeEndpoint()` membuat `test/openapi.e2e.test.ts` gagal. Dokumentasi tampil di `/api/docs` (`API_DOCS_ENABLED`, mati di production). Panduan: `.agents/skills/project-standards/references/openapi.md`.
9. **Daftarkan di `src/app.ts`**: pasang pada router versi, `v1.route('/<feature>', featureRoutes)` → `<API_BASE_PATH>/v1/<feature>`. Versi adalah kode, bukan env: versi baru = router baru (`v2`).
10. **Tulis Unit Test**: Buat file co-located `src/modules/<feature>/<feature>.service.test.ts`.
11. **Validasi Penuh**: Jalankan `bun run validate:full`.

---

## 11. Konvensi Penamaan & Coding Standards

| Element | Format | Contoh |
|---|---|---|
| Nama File & Folder | `kebab-case` | `user-profile.service.ts`, `auth/` |
| Class & Interface | `PascalCase` | `UsersService`, `UserResponse` |
| Method & Function | `camelCase` | `getUserById`, `createOrder` |
| Variable & Parameter | `camelCase` | `userId`, `activeStatus` |
| Module Constants & Enums | `UPPER_CASE` | `CACHE_PREFIX`, `STATUS.ACTIVE` |
| Method Decorator | `PascalCase` | `@Transactional()` |
| Database Table Names | `snake_case` | `domainSchema.table('user_profiles', ...)` |
| HTTP Request & Response Payload / Envelopes | `snake_case` | `status_code`, `full_name`, `per_page` |

> [!IMPORTANT]
> **Aturan Casing Absolut:**
> 1. `snake_case` **HANYA** diizinkan untuk:
>    - **Nama tabel fisik database SQL** (Drizzle table definitions).
>    - **Wire payload HTTP dua arah**: response (dikonversi otomatis oleh `ApiResponse` & `globalErrorHandler`) dan key body/query request (divalidasi & dikonversi oleh `validate()`).
> 2. Seluruh elemen kode TypeScript lainnya (variabel, parameter, method, properti object, DTOs, interfaces) **DILARANG KERAS** menggunakan `snake_case` dan wajib mematuhi `camelCase` / `PascalCase` (di-enforce oleh ESLint rule `@typescript-eslint/naming-convention`).

---

## 12. Git Workflow & Conventional Commits

Format commit wajib mematuhi [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

### Type yang Diizinkan:
- `feat`: Fitur baru untuk pengguna
- `fix`: Perbaikan bug
- `refactor`: Perubahan kode tanpa mengubah fungsionalitas
- `perf`: Optimasi performa
- `test`: Menambah atau memperbaiki automated tests
- `docs`: Perubahan dokumentasi
- `chore`: Perubahan konfigurasi, build tools, atau dependensi

### Contoh Pesan Commit yang Valid:
- `feat(users): add user registration endpoint with password hashing`
- `fix(cache): resolve fail-open bypass on redis timeout`
- `refactor(database): decouple transaction host from express context`
- `test(http): add unit test for persistent keep-alive agent`
