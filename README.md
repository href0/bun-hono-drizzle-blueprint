# Bun Hono Starter (Enterprise Bun + Hono + Drizzle + PostgreSQL)

Production-ready backend starter berbasis **Bun**, **Hono**, **Drizzle ORM**, dan **PostgreSQL**, dengan fail-open Redis caching, structured logging (Pino), async Zod validation, declarative ACID transactions, dan multi-tier quality gates.

---

## 1. The 7 Pillars Architecture

1. **Pure Controllers**: Controller adalah pure function yang mengembalikan `ApiResponse`. Response dibungkus otomatis oleh wrapper `asyncHandler` ke dalam envelope standar.
2. **Strict Layer Isolation**: Alur data satu arah: `Route` -> `Controller` -> `Service` -> `Repository` -> `Database`. Diverifikasi otomatis oleh `dependency-cruiser`.
3. **Declarative ACID Transactions**: Didukung oleh Bun native `AsyncLocalStorage`. Service menandai method dengan `@Transactional()`, dan Repository cukup memanggil `this.txHost.tx` tanpa perlu *parameter drilling* (`tx` tidak perlu dioper manual).
4. **Multi-Schema PostgreSQL**: Isolasi antara domain schema (`app_domain`, dikelola dan dimigrasi oleh `drizzle-kit`) dan reference schema (tabel referensi pihak ketiga, *read-only*).
5. **Zero-Trust Configuration**: Konfigurasi divalidasi ketat dengan Zod saat aplikasi booting (`src/config/env.config.ts`). Aplikasi *fail-fast* jika ada variabel wajib yang tidak valid. Dilarang mengakses `process.env` di luar direktori config.
6. **Resilient Infrastructure**:
   - **Redis Fail-Open Cache**: Jika Redis server offline atau bermasalah, aplikasi otomatis bypass ke database fetcher tanpa membuat request user gagal.
   - **Connection-Pooled HTTP Client**: Pemanggilan API eksternal menggunakan `HttpClientService` dengan persistent Keep-Alive connection pool (`http.Agent` & `https.Agent`), mandatory timeout, Pino logging, dan vendor error masking.
   - **Pino Structured Logging**: Format JSON terstruktur dengan sanitasi otomatis untuk field sensitif (PII redaction).
7. **Multi-Tier Quality Gates**: ESLint 9 Flat Config, `.ls-lint.yml` (kebab-case naming), Commitlint (Conventional Commits), dan `bun test`.

---

## 2. Struktur Direktori

```
src/
├── config/                      # Zero-Trust Zod Configuration
│   ├── env.config.ts            # Schema parser & validator untuk process.env
│   └── index.ts
│
├── core/                        # Cross-Cutting Core Building Blocks
│   ├── cache/                   # Redis Fail-Open Caching & Key Generators
│   │   ├── cache-keys.ts
│   │   ├── cache.service.ts
│   │   └── redis.client.ts
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
│   │   ├── async-handler.ts     # Wrapper untuk Pure Controllers
│   │   ├── error-handler.ts     # Global onError handler
│   │   ├── logger.middleware.ts # Request & response logging
│   │   ├── not-found.ts         # 404 route handler
│   │   ├── request-id.ts        # Correlation ID generator
│   │   ├── validate.ts          # Async Zod request validator & helpers
│   │   └── validate.test.ts     # Co-located Integration Test
│   └── response/                # Standard Success Envelope
│       └── api-response.ts
│
├── database/                    # Drizzle ORM Infrastructure
│   ├── connection.ts            # PostgreSQL connection pool & Drizzle instance
│   ├── transaction-host.ts      # TransactionHost (dynamic active tx / pool resolution)
│   ├── transaction-host.test.ts # Co-located Unit Test
│   ├── transactional.decorator.ts # @Transactional() decorator & runInTransaction
│   └── schema/                  # Multi-Schema Definitions
│       ├── domain/              # Domain Schema (CRUD & Migrated)
│       │   └── users.schema.ts
│       └── reference/           # Reference Schema (Read-Only)
│           └── ref-roles.schema.ts
│
├── modules/                     # Domain Feature Modules
│   ├── health/                  # Healthcheck probe (/api/v1/health)
│   └── users/                   # Modul Referensi Produksi (/api/v1/users)
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
- [Bun](https://bun.sh/) >= 1.2
- Docker & Docker Compose (untuk menjalankan PostgreSQL & Redis lokal secara otomatis)

### Setup & Jalankan (3 Langkah Cepat)
```bash
# 1. Clone repository & inisialisasi project
git clone <repo_url> my-backend
cd my-backend
bun install
bun run setup my-backend --description "Deskripsi singkat" # --dry-run untuk preview
# atau via AI agent (Claude Code): /init-project my-backend

# 2. Nyalakan PostgreSQL & Redis lokal
docker compose up -d

# 3. Jalankan migrasi database & start dev server
bun run db:migrate
bun run dev
```

Server berjalan secara default di `http://localhost:3000`.

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
import { uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { domainTable } from './schema';

export const products = domainTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  price: integer('price').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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

export class ProductsController {
  constructor(private readonly service: ProductsService = productsService) {}

  create = asyncHandler(async (c) => {
    const dto = getValidatedBody<CreateProductDto>(c);
    const product = await this.service.createProduct(dto);
    return new ApiResponse(product, 'Product created successfully', 201);
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
*Daftarkan di `src/app.ts`: `app.route('${env.API_PREFIX}/products', productRoutes);`*

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
