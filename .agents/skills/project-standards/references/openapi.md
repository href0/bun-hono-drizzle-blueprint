# API Documentation (OpenAPI 3.1) — Implementation Guide

Read this file when: adding or changing a route, a request/response schema, or anything under `src/core/openapi/`.

---

## 1. How the document is built

| Part of the document | Comes from | You write it? |
|---|---|---|
| Request body, query & path parameters | the route's `validate({ body, query, params })` schemas | No — never describe them by hand |
| 400 (and 413 when there is a body) | `validate()` | No |
| Success response (envelope + `data`) | `describeEndpoint({ response })` | **Yes** |
| Domain errors (404, 409, 502, …) | `describeEndpoint({ errors })` | **Yes** |
| 429 and 500 | `describeEndpoint()`, on every route | No |
| Headers: `Accept-Language`, `X-Request-ID` in; `X-Request-ID`, `Content-Language`, `RateLimit-*` out; `Retry-After` on 429 | `addCommonHeaders()` in the document builder | No |
| snake_case names | `toSnakeCaseOpenApi()` (`src/utils/openapi-case.util.ts`) | No — write camelCase like the DTOs |

The same Zod schema validates the request and documents it, so docs and behaviour cannot drift. Library: `hono-openapi` + `zod-openapi` v4 (works on Zod 3); UI: Scalar (bundle pinned in `SCALAR_BUNDLE_URL`).

---

## 2. Documenting a route

```typescript
import { describeEndpoint } from '../../core/openapi';
import { createProductSchema, productResponseSchema } from './products.dto';

productRoutes.post(
  '/',
  describeEndpoint({
    tags: ['Products'],
    summary: 'Create a product',
    description: 'Optional longer text (Markdown).',
    response: { status: 201, description: 'Created', data: productResponseSchema },
    errors: [409],
  }),
  validate({ body: createProductSchema }),
  productsController.create,
);
```

- `response.data`: wrapped in the success envelope (`success`, `status_code`, `message`, `data`).
- `response.paginatedItem`: one item of a list; becomes `data: item[]` + `meta` (`PaginationMeta`).
- `errors`: only the **domain** errors this route returns. Do not list 400/413/429/500 unless the route returns them for another reason (e.g. a `BadRequestError` from the service).
- `auth: 'bearer'`: the route requires an access token (`requireAuth()`) — adds `security: [{ bearerAuth: [] }]` and 401 to the operation (checked by `test/openapi.e2e.test.ts`).
- Put `describeEndpoint()` first, then `validate()`, then the handler.

---

## 3. Response schemas (`<name>.dto.ts`)

```typescript
import { isoInstant } from '../../core/openapi';

export const productResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: isoInstant(), // Temporal.Instant in TypeScript, ISO 8601 UTC string on the wire
});

export type ProductResponse = z.infer<typeof productResponseSchema>;
```

- The transformer returns `ProductResponse` (`z.infer`), so changing one without the other fails `tsc`.
- Time: `isoInstant()` for `Temporal.Instant` (instant columns), `isoCalendarDate()` for `Temporal.PlainDate`, `isoDateTimeString()` for values already serialized (`nowIsoUtc()`). Request-side time fields (`instantField`, `calendarDateField`, `timeZoneField`) document themselves — see [datetime.md](datetime.md).
- Free-form dictionaries: `z.record(...)`; prefer `{ key, value }` arrays (see `validate()` `preserveKeys`).
- Extra OpenAPI hints: `.openapi({ description, example })` (available on every Zod schema through `zod-openapi/extend`, loaded by `src/core/openapi`).

---

## 4. Viewing and switching off

- UI: `GET <API_BASE_PATH>/docs` (default `http://localhost:3000/api/docs`); JSON: `<API_BASE_PATH>/docs/openapi.json` (import into Postman, Insomnia, client generators).
- `API_DOCS_ENABLED`: unset = on, except in production. When off the routes are not mounted (404).
- The document is built once per app, on the first request, and cached.
- `info.title` / `info.version` / `info.description` come from `APP_NAME` and `package.json` (set it with `bun run setup <name> --description "..."`).

---

## 5. Enforcement

`test/openapi.e2e.test.ts` fails when:

- a route of `createApp()` is missing from the document;
- an operation has no `summary` or no 2xx response — i.e. it has `validate()` but no `describeEndpoint()`;
- a schema property or query parameter is not snake_case;
- a route that validates input does not document 400;
- an operation or response lacks the common headers.

`bun run verify:scaffold` additionally checks that a module generated from the `scaffold-module` template appears in the document with its summaries.

---

## 6. Not covered yet

- Security per operation is opt-in (`auth: 'bearer'`) until plan step 3.4 makes authentication the default for every route except `PUBLIC_ROUTES`.
- Cookie-authenticated endpoints (`/auth/refresh`, `/auth/logout`) describe the `refresh_token` cookie in their `description`; it is not a declared security scheme.
- Partner HMAC headers (phase 5).
- Non-JSON endpoints (file upload/download): describe the body/response with `describeRoute()` from `hono-openapi` directly and add a test.
