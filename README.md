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
   - **Connection-Pooled HTTP Client**: Pemanggilan API eksternal menggunakan `HttpClientService` dengan persistent Keep-Alive connection pool (`http.Agent` & `https.Agent`), mandatory timeout, Pino logging, dan vendor error masking.
   - **Pino Structured Logging**: Format JSON terstruktur dengan sanitasi otomatis untuk field sensitif (PII redaction).
7. **Pesan Dwibahasa (i18n)**: Pesan respons `id`/`en` dipilih dari header `Accept-Language` (default `DEFAULT_LOCALE=id`); string literal sebagai pesan di modul ditolak ESLint.
8. **Kontrak snake_case Dua Arah**: Request (body & query) wajib `snake_case` — key casing lain ditolak 400 `ERR_NON_SNAKE_CASE_KEY` — lalu dikonversi ke DTO camelCase; response selalu `snake_case`.
9. **Multi-Tier Quality Gates**: ESLint 9 Flat Config, `.ls-lint.yml` (kebab-case naming), Commitlint (Conventional Commits), dan `bun test`.

---

## 2. Struktur Direktori

```
src/
├── config/                      # Zero-Trust Zod Configuration
│   ├── env-source.ts            # Satu-satunya pembaca process.env
│   ├── parse-env.ts             # Validasi per grup (fail-fast, tanpa mencetak nilai)
│   ├── <group>.config.ts        # app, database, redis, http, integrations
│   └── index.ts
│
├── core/                        # Cross-Cutting Core Building Blocks
│   ├── cache/                   # Redis Fail-Open Caching & Key Generators
│   │   ├── cache-keys.ts
│   │   ├── cache.service.ts
│   │   └── redis.client.ts
│   ├── dto/                     # Schema request bersama (uuidParamSchema, paginationQuerySchema)
│   ├── errors/                  # Semantic ApiError Hierarchy
│   │   ├── api-error.ts         # Base error class
│   │   ├── bad-request.error.ts # 400
│   │   ├── unauthorized.error.ts# 401
│   │   ├── forbidden.error.ts   # 403
│   │   ├── not-found.error.ts   # 404
│   │   ├── conflict.error.ts    # 409
│   │   └── external.error.ts    # 502/504
│   ├── http/                    # Enterprise HTTP Client (Connection Pooled)
│   │   ├── http-client.service.ts
│   │   └── http-client.service.test.ts # Co-located Unit Test
│   ├── logger/                  # Pino Logger Singleton dengan PII Redaction
│   │   └── logger.ts
│   ├── middlewares/             # Hono Middlewares Pipeline
│   ├── openapi/                 # describeEndpoint, schema envelope, dokumen OpenAPI + UI Scalar (/api/docs)
│   │   ├── async-handler.ts     # Wrapper untuk Pure Controllers
│   │   ├── error-handler.ts     # Global onError handler
│   │   ├── logger.middleware.ts # Request & response logging
│   │   ├── not-found.ts         # 404 route handler
│   │   ├── request-context.ts   # Request ID + RequestContext (AsyncLocalStorage)
│   │   ├── validate.ts          # Async Zod request validator & helpers
│   │   └── validate.test.ts     # Co-located Integration Test
│   └── response/                # Standard Success Envelope
│       └── api-response.ts
│
├── database/                    # Drizzle ORM Infrastructure
│   ├── connection.ts            # PostgreSQL connection pool & Drizzle instance
│   ├── audited.repository.ts    # AuditedRepository (audit trail record_changes)
│   ├── base.repository.ts       # BaseRepository (soft delete, actor, update teraudit)
│   ├── child.repository.ts      # ChildRepository (header/detail, anti IDOR)
│   ├── append-only.repository.ts # AppendOnlyRepository (tabel pencatatan)
│   ├── read-only.repository.ts  # ReadOnlyRepository (view referensi)
│   ├── transaction-host.ts      # TransactionHost (dynamic active tx / pool resolution)
│   ├── transaction-host.test.ts # Co-located Unit Test
│   ├── transactional.decorator.ts # @Transactional() decorator & runInTransaction
│   └── schema/                  # Table Definitions (public) & reference views
│       ├── schemas.ts           # appTable (public) & referenceSchema (opsional)
│       ├── columns.ts           # Helper kolom (UUID v7, timestamps Temporal, soft delete, …)
│       ├── domain/              # Domain Schema (CRUD & Migrated)
│       │   ├── record-changes.schema.ts # Audit trail (append-only)
│       │   └── users.schema.ts
│       └── reference/           # Reference Schema (Read-Only)
│           └── ref-roles.schema.ts
│
├── modules/                     # Domain Feature Modules
│   ├── health/                  # Health UP/DEGRADED/DOWN, readiness, liveness (/api/health, tanpa versi)
│   ├── orders/                  # Modul contoh header + detail (/api/v1/orders[/:id/items]) — dihapus `bun run setup` kecuali --keep-examples
│   └── users/                   # Modul referensi tabel mandiri (/api/v1/users: CRUD, soft delete, restore)
│       ├── users.dto.ts         # Zod schemas (body, query, params)
│       ├── users.repository.ts  # Database access via TransactionHost
│       ├── users.service.ts     # Business logic + @Transactional()
│       ├── users.service.test.ts# Co-located Unit Test
│       ├── users.transformer.ts # Data sanitization (exclude password)
│       ├── users.controller.ts  # Pure controller returning ApiResponse
│       └── users.routes.ts      # Hono routing & middleware binding
│
├── utils/                       # Pure Helper Functions (Zero Framework Dependency)
│   └── case-converter.util.ts
│
├── test/                        # End-to-End (E2E) & Blackbox API Tests
│   └── health.e2e.test.ts
│
├── app.ts                       # Hono Application Factory & Middlewares
└── index.ts                     # Bun Server Entrypoint
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

# 3. Jalankan migrasi database & start dev server
bun run db:migrate
bun run dev
```

Server berjalan secara default di `http://localhost:3000` (URL juga dicatat di log startup):

- Dokumentasi API (Scalar): `http://localhost:3000/api/docs` · JSON: `/api/docs/openapi.json`
- Health: `http://localhost:3000/api/health` (`UP` / `DEGRADED` / `DOWN`)

#### Alternatif: Full Containerized Development (Zero Host Install)
Jika Anda tidak ingin menginstall Bun di host OS:
```bash
docker compose -f docker-compose.dev.yml up --build
```
Aplikasi akan berjalan di dalam Docker container dengan live hot-reload (`bun --watch`).

---

## 4. Pola Pengembangan Fitur Baru

Untuk menambahkan modul domain baru (misal: `products`):

### 1. Buat Schema Database (`src/database/schema/domain/products.schema.ts`)
```typescript
import { integer, varchar } from 'drizzle-orm/pg-core';
import { timestamps, uuidPrimaryKey } from '../columns';
import { appTable } from '../schemas';

// Tabel di public; id (UUID v7) & timestamp (Temporal.Instant) dari helper kolom.
export const products = appTable('products', {
  id: uuidPrimaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  price: integer('price').notNull(),
  ...timestamps(),
});

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
```
*Daftarkan di `src/database/schema/domain/index.ts`.*

### 2. Buat DTO Zod (`src/modules/products/products.dto.ts`)
```typescript
import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  price: z.number().int().positive('Price must be a positive integer'),
});

export type CreateProductDto = z.infer<typeof createProductSchema>;
```

### 3. Buat Repository (`src/modules/products/products.repository.ts`)
```typescript
import { eq } from 'drizzle-orm';
import { TransactionHost, defaultTxHost } from '../../database/transaction-host';
import { products, type Product, type NewProduct } from '../../database/schema';

export class ProductsRepository {
  constructor(private readonly txHost: TransactionHost = defaultTxHost) {}

  async create(data: NewProduct): Promise<Product> {
    const result = await this.txHost.tx.insert(products).values(data).returning();
    return result[0];
  }

  async findById(id: string): Promise<Product | null> {
    const result = await this.txHost.tx.select().from(products).where(eq(products.id, id));
    return result[0] ?? null;
  }
}

export const productsRepository = new ProductsRepository();
```

### 4. Buat Service (`src/modules/products/products.service.ts`)
```typescript
import { Transactional } from '../../database/transactional.decorator';
import { ProductsRepository, productsRepository } from './products.repository';
import type { CreateProductDto } from './products.dto';

export class ProductsService {
  constructor(private readonly repo: ProductsRepository = productsRepository) {}

  @Transactional()
  async createProduct(dto: CreateProductDto) {
    return this.repo.create(dto);
  }
}

export const productsService = new ProductsService();
```

### 5. Buat Controller (`src/modules/products/products.controller.ts`)
```typescript
import { asyncHandler, getValidatedBody } from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import { productsService, ProductsService } from './products.service';
import type { CreateProductDto } from './products.dto';
import { PRODUCT_MESSAGES } from './products.messages'; // { CREATED: { id: '…', en: '…' } }

export class ProductsController {
  constructor(private readonly service: ProductsService = productsService) {}

  create = asyncHandler(async (c) => {
    const dto = getValidatedBody<CreateProductDto>(c);
    const product = await this.service.createProduct(dto);
    return new ApiResponse(product, PRODUCT_MESSAGES.CREATED, 201);
  });
}

export const productsController = new ProductsController();
```

### 6. Buat Route (`src/modules/products/products.routes.ts`)
```typescript
import { Hono } from 'hono';
import { validate } from '../../core/middlewares';
import { productsController } from './products.controller';
import { createProductSchema } from './products.dto';

export const productRoutes = new Hono();

productRoutes.post('/', validate({ body: createProductSchema }), productsController.create);
```
*Daftarkan di `src/app.ts` pada router versi: ``v1.route('/products', productRoutes);`` → `/api/v1/products`*

---

## 5. Menjalankan Quality Gates

Jalankan seluruh verifikasi statis, arsitektur, dan testing:

```bash
# Menjalankan seluruh quality gates (typecheck + lint + ls-lint + dependency-cruiser + unit test)
bun run validate:full

# Validasi parsial:
bun run typecheck   # Typecheck tanpa emit
bun run lint        # ESLint flat config
bun run lint:ls     # Kebab-case naming check
bun run lint:arch   # Architectural boundary isolation check
bun test            # Unit & Integration test runner
```
