# API Documentation (OpenAPI 3.1) — Implementation Guide

Read this file when: adding or changing a route, a request/response schema, or anything under `src/core/openapi/`.

---

## 1. How the document is built

| Part of the document | Comes from | You write it? |
|---|---|---|
| Request body, query & path parameters | the route's `validate({ body, query, params })` schemas | No — never describe them by hand |
| 400 (and 413 when there is a body) | `validate()` | No |
| Success response (envelope + `data`) | `describeEndpoint({ response })` | **Yes** |
| Success message(s) (`x-success-messages`) | `describeEndpoint({ response: { message } })` — the controller's own `*_MESSAGES` constant | **Yes** |
| Domain errors (404, 409, 502, …) with their codes | `describeEndpoint({ errors })` | **Yes** |
| 429 and 500 | `describeEndpoint()`, on every route | No |
| Codes of 400 / 413, 401, 403 (`x-error-codes` on each error response) | the middleware that sends them: `validate()`, `authenticate()` / `partnerAuth()` / webhooks (document builder), `requireRole()`, `requirePartner()`, `csrfProtection()` | No |
| Who may call (`x-allowed-callers`: `admin`, `self:<param>`, `partner:<code>`) | `requireRole()`, `requireSelfOrRole()`, `requirePartner()` | No |
| Headers: `Accept-Language`, `X-Request-ID` in; `X-Request-ID`, `Content-Language`, `RateLimit-*` out; `Retry-After` on 429 | `addCommonHeaders()` in the document builder | No |
| snake_case names | `toSnakeCaseOpenApi()` (`src/utils/openapi-case.util.ts`) | No — write camelCase like the DTOs |

The same Zod schema validates the request and documents it, so docs and behaviour cannot drift. Library: `hono-openapi` + `zod-openapi` v4 (works on Zod 3); UI: Scalar (bundle pinned in `SCALAR_BUNDLE_URL`).

---

## 2. Documenting a route

```typescript
import { APP_ERROR_CODES } from '../../core/errors';
import { describeEndpoint } from '../../core/openapi';
import { createProductSchema, productResponseSchema } from './products.dto';
import { PRODUCT_MESSAGES } from './products.messages';

productRoutes.post(
  '/',
  describeEndpoint({
    tags: ['Products'],
    summary: 'Create a product',
    description: 'Optional longer text (Markdown).',
    response: {
      status: 201,
      description: 'Created',
      message: PRODUCT_MESSAGES.CREATED, // the constant the controller sends
      data: productResponseSchema,
    },
    errors: [409, { status: 403, codes: [APP_ERROR_CODES.SELF_LOCKOUT_FORBIDDEN] }],
  }),
  validate({ body: createProductSchema }),
  productsController.create,
);
```

- `response.data`: wrapped in the success envelope (`success`, `status_code`, `message`, `data`).
- `response.paginatedItem`: one item of a list; becomes `data: item[]` + `meta` (`PaginationMeta`).
- `response.message`: required — the same `*_MESSAGES` constant the controller passes to `ApiResponse`; an array when one status may carry several (one per health state, `received` / `duplicate`).
- `alsoResponds`: another success status with the same data (an upsert: `201` created, `200` updated), each with its message.
- `errors`: only the **domain** errors this route returns — `404` stands for its default code (`ERR_NOT_FOUND`; 400 → `ERR_BAD_REQUEST`, 502 → `ERR_EXT_ERROR` + `ERR_EXT_UNREACHABLE`, … `DEFAULT_ERROR_CODES`), `{ status, codes }` lists other codes (`ERR_AUTH_INVALID_CREDENTIALS`, `ERR_SELF_LOCKOUT_FORBIDDEN`). Do not list what the platform documents itself: 400 / 413 of `validate()`, 401 / 403 of authentication and roles, 429 / 500.
- Authentication is not described per route: the document builder marks every operation that `authenticate()` protects (all of `<API_BASE_PATH>/v1` except `PUBLIC_ROUTES`) with `security: [{ bearerAuth: [] }]` and 401. `requireRole()` adds its 403 itself. Partner operations (`<API_BASE_PATH>/v1/partner/*`, `partnerAuth()`) get the four partner header schemes (`x-partner-key`, `-timestamp`, `-nonce`, `-signature`, required together) plus 401 and 403 instead of `bearerAuth`. Vendor webhook operations (`<API_BASE_PATH>/webhooks/<vendor>`) get one scheme per vendor, `<vendor>-webhook` (the vendor's signature header), plus 401.
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
- an operation or response lacks the common headers;
- a `$ref` does not resolve, or a raw Zod object leaked into the document (a schema added after generation must be plain OpenAPI — `errorResponseObject()`);
- a success response has no `x-success-messages`, or an error response no `x-error-codes` whose codes belong to its status (`ERROR_CATALOG`).

**Contract guard** (`src/core/openapi/contract-guard.ts`, only under `NODE_ENV=test`): `describeEndpoint()` records the route's contract in the request context, and every test that reaches the route checks the answer against it — a success status or message other than documented, or an error code the route does not list (platform codes excepted), turns the response into a 500 and logs `API contract violation` at `fatal` (visible with `LOG_LEVEL=fatal`). Every code must also be sent with the status and type `ERROR_CATALOG` gives it. Production runs none of this.

`bun run verify:scaffold` additionally checks that a module generated from the `scaffold-module` template appears in the document with its summaries.

---

## 6. API contract snapshot (`docs/api/openapi.json`)

The document is generated from the code, so it never drifts — but then a contract change is never seen either: change a DTO and frontends or partners break without a gate failing. The committed snapshot makes every change visible and reviewed (R76).

| Command | Does | Run by |
|---|---|---|
| `bun run openapi:check` | Builds the document of `createApp()` with a fixed configuration (never your local env file — `scripts/lib/api-contract/document.ts`), compares it with the snapshot and fails on **any** difference, listing every change per operation with its label | `validate` (pre-push), CI job `verify` |
| `bun run openapi:update [--allow-breaking]` | Writes the snapshot; while a change is `BREAKING` it refuses and writes nothing, unless the flag is given | **You**, after the review — never a hook, CI or `bun run scaffold` (it prints a reminder). Only `bun run setup` writes it by itself: the baseline of a new project |

The flow: change a route or a DTO → `openapi:check` fails and lists the changes → review them (intended? breaking for whom?) → `openapi:update` → commit the snapshot **with** the change, so the diff shows the contract next to the code. A `BREAKING` change under `/v1` usually deserves a `/v2` router instead (R19); `--allow-breaking` is for clients updated in the same release.

How it compares: `$ref`s are resolved (a change to a shared component shows up in every operation that uses it), then every operation is flattened into locations — `query page`, `path id`, `body.items[].qty`, `response 200 body.data.email`, `response 200 header X-Request-ID`, `security` — each with its attributes (type, format, required, nullable, enum, bounds, pattern, …). A new node hides its children: a new optional object with required fields is one safe change. `info.title` / `version` / `description` are fixed values (renaming the project or bumping the version is no contract change), and the snapshot has one canonical form (keys sorted), so an edit by hand fails `check` too.

Labels are asymmetric — a client **sends** the request side and **reads** the response side:

| Change | Request (query / path / header / body) | Response |
|---|---|---|
| Field added, optional | safe | safe |
| Field added, required | **BREAKING** | safe |
| Field removed | **BREAKING** (unknown keys are refused, R12) | **BREAKING** |
| Optional → required | **BREAKING** | safe |
| Required → optional, or nullable | safe | **BREAKING** |
| Type / format changed | **BREAKING** | **BREAKING** |
| Enum value added | safe | **BREAKING** |
| Enum value removed | **BREAKING** | safe |
| Bound tightened (`maxLength` lower, `minimum` higher, `pattern` changed) | **BREAKING** | safe |
| Bound loosened | safe | safe |
| Operation removed · success status changed · a security requirement removed or replaced | **BREAKING** | **BREAKING** |
| Operation added · error status added · a security alternative added | safe | safe |

| Error code added or removed (`x-error-codes`) | safe | safe |
| Allowed callers narrowed (`requireRole()` added, a role removed — `x-allowed-callers`) | **BREAKING** | **BREAKING** |

Text only (`summary`, `description`, `tags`, `example`, success messages, …) is labelled `docs`; a keyword the engine does not know is assumed `BREAKING`. Source of truth: `scripts/lib/api-contract/compare.ts`, one test per row in `compare.test.ts`.

**Contract documents** (`docs/api/*.md`, Indonesian, for integrators): `openapi:update` renders the same document as Markdown and `openapi:check` compares it byte for byte (an edit by hand fails). `docs/api/README.md` holds the base URL, authentication, envelopes, the module index (dependents under their parent), the Platform routes (mounted by `src/app.ts` itself: `GET /`) and every error code with its meaning (`ERROR_CATALOG`); one file per module, named after its folder — a dependent module in its parent's subfolder (`docs/api/projects/tasks.md`, linked from `projects.md`). Per endpoint: access (token / partner / webhook, allowed callers), path / query / header / body tables with the Zod rules, a request example, an example per success status (with its message) and per error status, and every error code. Examples are deterministic, from the schema or `.openapi({ example })`. An operation whose router is not exported by a `src/modules/**/*.routes.ts` file and is not a Platform route makes the generator fail. The portal (`docs-site/`) shows the folder as **API Reference**.

---

## 7. Not covered yet

- Cookie-authenticated endpoints (`/auth/refresh`, `/auth/logout`) describe the `refresh_token` cookie in their `description`; it is not a declared security scheme.
- Non-JSON endpoints (file upload/download): describe the body/response with `describeRoute()` from `hono-openapi` directly and add a test.
- The contract guard proves only the paths the tests execute: an error code thrown on an untested branch is caught by review (and by the generated documents, which list what the route promises). Platform codes are allowed on every route at runtime; the document lists them only where their middleware runs.
