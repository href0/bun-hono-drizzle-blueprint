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
│   ├── errors/                  # Semantic ApiError Hierarchy
│   ├── http/                    # Enterprise HTTP Client dengan Persistent Keep-Alive Pool
│   ├── logger/                  # Pino Logger Singleton dengan PII Redaction
│   ├── middlewares/             # Hono Middlewares (asyncHandler, validate, errorHandler, dll.)
│   └── response/                # Standard Success Response Envelope (ApiResponse)
│
├── database/                    # Drizzle ORM Infrastructure & Data Layer
│   ├── connection.ts            # PostgreSQL connection pool via postgres driver
│   ├── transaction-host.ts      # TransactionHost (dynamic active tx / pool resolution)
│   ├── transactional.decorator.ts # @Transactional() decorator & runInTransaction
│   └── schema/                  # Multi-Schema Table Definitions
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
│   ├── health/                  # Healthcheck probe (/api/v1/health)
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
| `src/utils/` | External pure utilities | `src/modules/`, `src/core/`, `src/database/`, `src/integrations/` | Utils harus pure & side-effect free |
| `src/core/` | Node/Bun libraries, `src/utils/`, `src/config/` | `src/modules/`, `src/database/`, `src/integrations/` | Mencegah coupling dari core ke domain, database & integrasi |
| `src/database/schema/`| `drizzle-orm`, `drizzle-orm/pg-core` | `src/modules/`, `src/core/`, `src/config/`, `src/integrations/` | Schema DB tidak boleh bergantung pada aplikasi |
| `src/database/` | `src/config/`, `src/utils/` | `src/modules/`, `src/integrations/` | Infra DB tidak boleh bergantung pada domain & integrasi |
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

Frontend (FE) tidak boleh menerima format response yang berbeda-beda antar endpoint. Seluruh key response wajib berupa `snake_case` (dikonversi otomatis oleh method `toJSON()` pada `ApiResponse` dan ditangani secara seragam di `globalErrorHandler`).

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
    "type": "BAD_REQUEST",
    "code": "ERR_BAD_REQUEST",
    "origin": "APP",
    "details": [
      { "field": "email", "message": "Invalid email address format" },
      { "field": "password", "message": "Password must be at least 8 characters" }
    ]
  },
  "request_id": "req-muf0ayxo-qc2pax",
  "timestamp": "2026-09-24T04:13:08.000Z"
}
```

### 3.3 Semantic Error Classes

Dilarang melempar error string mentah atau plain `Error`. Wajib menggunakan class turunan `ApiError` dari `src/core/errors/`:

| Class | HTTP Status | Error Type | Error Code | Penggunaan |
|---|---|---|---|---|
| `ValidationError` | 400 | `VALIDATION_ERROR` | `ERR_INVALID_INPUT` | Format skema input Zod tidak valid |
| `BadRequestError` | 400 | `BAD_REQUEST` | `ERR_BAD_REQUEST` | Pelanggaran aturan bisnis |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` | `ERR_UNAUTHORIZED` | Token tidak ada / expired |
| `ForbiddenError` | 403 | `FORBIDDEN` | `ERR_FORBIDDEN` | Role user tidak berhak mengakses |
| `NotFoundError` | 404 | `NOT_FOUND` | `ERR_NOT_FOUND` | Resource entitas tidak ditemukan |
| `ConflictError` | 409 | `CONFLICT` | `ERR_CONFLICT` | Data unik sudah terdaftar (duplikat) |
| `ExternalServiceError` | 502/504 | `EXTERNAL_SERVICE_ERROR` | `ERR_EXT_<ORIGIN>` | API vendor pihak ketiga timeout / error |

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
    return new ApiResponse(responseData, 'User created successfully', 201);
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

Prefix path internal (`body.`, `query.`) otomatis dibersihkan agar FE dapat langsung memetakan nama field ke form error.

---

## 5. Database & Declarative ACID Transactions

### 5.1 Isolasi Multi-Schema
1. **Domain Schema (`src/database/schema/domain/`)**:
   - Dikelola oleh schema Drizzle dalam schema PostgreSQL `app_domain`.
   - Hak akses: Full CRUD.
   - Didaftarkan di `drizzle.config.ts` untuk migrasi otomatis via `bun run db:generate`.
2. **Reference Schema (`src/database/schema/reference/`)**:
   - Hak akses: **READ-ONLY** (`.select()` saja).
   - Dilarang menjalankan operasi mutasi (`insert`, `update`, `delete`).

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
      throw new ConflictError('User with this email already exists');
    }
    return this.repo.create({ ... });
  }
}
```

---

## 6. Zero-Trust Configuration

1. **`process.env` DIBLOKIR**: Di-enforce otomatis oleh ESLint `no-process-env`. `process.env` **HANYA** boleh diakses di dalam `src/config/env-source.ts` dan `drizzle.config.ts`.
2. **Crash-Fast on Startup**: Setiap grup (`src/config/<group>.config.ts`) divalidasi Zod lewat `parseEnv()` saat aplikasi booting. Bila ada variabel yang hilang atau salah format, aplikasi berhenti dengan daftar **semua** variabel yang salah **dalam grup pertama yang gagal** (nama + aturan, tanpa nilai — env bisa berisi secret). Grup divalidasi saat modulnya di-import, sehingga grup berikutnya baru dilaporkan setelah grup ini diperbaiki.
3. Seluruh bagian aplikasi mengimpor konfigurasi dari barrel `src/config` (`appConfig`, `databaseConfig`, `redisConfig`, `httpConfig`, `integrationsConfig`).
4. **Menambah variabel**: tambahkan ke schema grup yang sesuai (atau grup baru `<group>.config.ts` dengan pola `build<Group>Config(source)` + instance), tambahkan test di `src/config/config.test.ts`, dan dokumentasikan di `.env.example` pada bagian grupnya.

---

## 7. Enterprise Structured Logging (Pino)

1. **`console.log`, `console.warn`, `console.error` DIBLOKIR KERAS** (di-enforce oleh ESLint `no-console`).
2. Gunakan singleton `logger` dari `src/core/logger/logger.ts`.
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
- **Vendor Error Masking**: Error axios otomatis di-mask menjadi `ExternalServiceError` (HTTP 502) dengan origin spesifik.

---

## 9. Distributed Caching (Fail-Open Redis)

1. Semua cache key **WAJIB** didefinisikan secara terpusat di `src/core/cache/cache-keys.ts`.
2. Dilarang menulis string key secara langsung (*hardcoded string keys*).
3. **Fail-Open Architecture**: Jika Redis server down atau timeout, `CacheService` otomatis melakukan bypass dan memanggil database fetcher. **Request pengguna tidak boleh crash hanya karena Redis offline.**

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

1. **Drizzle Schema**: Buat file `src/database/schema/domain/<feature>.schema.ts` dan re-export di `schema/index.ts`.
2. **Generate Migration**: Jalankan `bun run db:generate`.
3. **DTO Zod**: Buat file `src/modules/<feature>/<feature>.dto.ts` (Zod schemas & types).
4. **Repository**: Buat file `src/modules/<feature>/<feature>.repository.ts` menggunakan `this.txHost.tx`.
5. **Transformer**: Buat file `src/modules/<feature>/<feature>.transformer.ts` untuk membersihkan data.
6. **Service**: Buat file `src/modules/<feature>/<feature>.service.ts` dengan `@Transactional()` pada operasi tulis.
7. **Controller**: Buat file `src/modules/<feature>/<feature>.controller.ts` dibungkus `asyncHandler` dan me-return `ApiResponse`.
8. **Routes**: Buat file `src/modules/<feature>/<feature>.routes.ts` dengan middleware `validate({ ... })`.
9. **Daftarkan di `src/app.ts`**: Pasang route via `app.route('${env.API_PREFIX}/<feature>', featureRoutes)`.
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
| HTTP Response Payload & Envelopes | `snake_case` | `status_code`, `full_name`, `is_active` |

> [!IMPORTANT]
> **Aturan Casing Absolut:**
> 1. `snake_case` **HANYA** diizinkan untuk:
>    - **Nama tabel fisik database SQL** (Drizzle table definitions).
>    - **Output HTTP response envelope & wire payload** (dikonversi otomatis oleh `ApiResponse` & `globalErrorHandler`).
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
