# HTTP Contract: Controllers, Validation, Envelopes, Errors & Messages

Read this file when: writing a controller, a route's validation, a DTO, an error, or a user-facing message. Route documentation: [openapi.md](openapi.md); authentication: [auth-and-inbound.md](auth-and-inbound.md).

---

## 1. Return-based controllers

A controller only (1) reads validated input (`getValidatedBody`, `getValidatedQuery`, `getValidatedParams`), (2) calls its service, (3) shapes the result with a pure transformer, and (4) **returns** `new ApiResponse(data, message, statusCode, meta)`. Every handler is a class field wrapped in `asyncHandler`; helpers live outside the class.

```typescript
export class UsersController {
  constructor(private readonly service: UsersService = usersService) {}

  create = asyncHandler(async (c) => {
    const dto = getValidatedBody<CreateUserDto>(c);
    const user = await this.service.createUser(dto);
    return new ApiResponse(toUserResponse(user), USER_MESSAGES.CREATED, 201);
  });
}
```

Rejected in `*.controller.ts` by ESLint `CONTROLLER_SYNTAX_RULES`: `c.json()` / `c.text()` / `c.body()` / `c.html()`; reading input from `c.req` (`json`, `parseBody`, `query`, `param`, `valid`, … — `c.req.header()` stays allowed); methods or fields not wrapped in `asyncHandler`.

Services never receive the Hono `Context` and never return HTTP responses: they take DTOs or primitives and read request-scoped data (request ID, actor) from `getRequestContext()` / `getActor()` (`src/core/context/request-context.ts`).

**Transformers** (`<name>.transformer.ts`: `to<Name>Response`, `to<Name>ListResponse`) are pure functions typed by the response schema (`z.infer<typeof <name>ResponseSchema>`), so sensitive columns (password hashes, internal tokens) never leave the service. `[review-only]`: that a controller passes data through a transformer is not machine-checked — a raw entity with extra columns still compiles.

## 2. Validation first

Every route that takes input binds `validate({ body, query, params })` with Zod schemas; controllers never parse raw input.

```typescript
userRoutes.post('/', describeEndpoint({ … }), validate({ body: createUserSchema }), usersController.create);
userRoutes.get('/:id', describeEndpoint({ … }), validate({ params: uuidParamSchema }), usersController.getById);
```

- **Shared schemas** (`src/core/dto/common.dto.ts`) — reuse, never redefine per module: `emailField` (trimmed, lower-cased before validation; every email), `newPasswordField` (8–1024 characters), `uuidParamSchema` (`:id`; a malformed UUID is 400, not a database error), `paginationQuerySchema` (`?page=&per_page=`, at most `MAX_PER_PAGE` = 100). Time fields: [datetime.md](datetime.md).
- Error details drop the internal prefix (`body.`, `query.`) and name the field in snake_case, so a frontend maps them straight onto form fields.
- **Free-form dictionaries**: `validate({ body, preserveKeys: ['metadata'] })` — the listed top-level fields are neither checked for casing nor converted. In public contracts prefer `{ key, value }` arrays.
- **Vendor payloads**: `validate({ body, bodyKeys: 'verbatim' })` keeps the vendor's casing — only in `*.webhook.*` files ([auth-and-inbound.md](auth-and-inbound.md) §5).

## 3. snake_case in both directions

- **Responses**: every key is snake_case — converted by `ApiResponse.toJSON()` and `globalErrorHandler`. Never convert casing by hand.
- **Requests (body & query)**: clients send snake_case. Any other casing (`fullName`, `full-name`) is rejected with 400 `ERR_NON_SNAKE_CASE_KEY`, `details` listing each key exactly as sent. Accepted payloads are converted to camelCase before Zod, so DTOs stay camelCase. Route params are not converted.
- **Known limitation — response dictionaries**: `preserveKeys` applies to requests only; a dictionary echoed in a response is converted too (`{ someKey: 1 }` → `{ some_key: 1 }`). A response-side opt-out is added only when a real need appears.
- **TypeScript**: no snake_case identifiers anywhere (ESLint `@typescript-eslint/naming-convention`); only SQL names in Drizzle schemas are snake_case ([naming.md](naming.md)).

## 4. Envelopes

`message` is in the language negotiated from `Accept-Language` (§6). Examples show the default (`id`).

```json
{
  "success": true,
  "status_code": 200,
  "message": "Daftar pengguna berhasil diambil",
  "data": [{ "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "full_name": "John Doe", "is_active": true }],
  "meta": { "current_page": 1, "per_page": 10, "total_items": 42, "total_pages": 5 }
}
```

`meta` appears only on paginated lists.

```json
{
  "success": false,
  "status_code": 400,
  "message": "Validasi data gagal. Silakan periksa kembali input Anda",
  "error": {
    "type": "VALIDATION_ERROR",
    "code": "ERR_INVALID_INPUT",
    "origin": "APP",
    "details": [{ "field": "email", "message": "Invalid email address format" }]
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-09-24T04:42:51.000Z"
}
```

Built in one place (`buildErrorBody()` in `src/core/response/error-response.ts`, used by `globalErrorHandler` and `notFoundHandler`):

- No `data` field on errors.
- `error.code` only from `APP_ERROR_CODES` (`src/core/errors/error-codes.ts`): an `'ERR_*'` literal or a dynamically built code anywhere else in `src/` is rejected by ESLint `ERROR_CODE_SYNTAX_RULES`.
- `error.origin` is `APP`, or the integration code for an external failure; `EXTERNAL_SERVICE_ERROR` also carries `error.vendor_name` (from `INTEGRATION_REGISTRY`).
- `details[].field` is always snake_case (`address.postal_code`); Zod field messages are not translated (known limitation).
- A 500 (`InternalServerError` or an unknown error) never exposes its message or details — they are logged only.
- A 429 with `retryAfterSeconds` sends `Retry-After`.

## 5. Semantic errors

Business failures **throw** an `ApiError` subclass from `src/core/errors/`: `new XError(message, { details?, origin?, code? })` — `code` overrides the class default with a more specific registry code. A plain `throw new Error` / `throw Error` in `src/modules/**` is rejected by ESLint `MODULE_ERROR_RULES`.

| Class | HTTP | `error.type` | `error.code` | Use |
|---|---|---|---|---|
| `ValidationError` | 400 | `VALIDATION_ERROR` | `ERR_INVALID_INPUT` (default) · `ERR_INVALID_JSON` · `ERR_NON_SNAKE_CASE_KEY` | Schema not met · body not valid JSON · key not snake_case (`field` = the key as sent) |
| `BadRequestError` | 400 | `BAD_REQUEST` | `ERR_BAD_REQUEST` | Business rule violated |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` | `ERR_UNAUTHORIZED` (default) · `ERR_AUTH_TOKEN_EXPIRED` · `ERR_AUTH_TOKEN_INVALID` · `ERR_AUTH_INVALID_CREDENTIALS` · `ERR_AUTH_REFRESH_INVALID` · `ERR_AUTH_REFRESH_REUSED` | No `Authorization` · access token expired / invalid · login failed (deliberately not distinguished) · refresh token invalid · old refresh token reused (session revoked) |
| `ForbiddenError` | 403 | `FORBIDDEN` | `ERR_FORBIDDEN` (default) · `ERR_ROLE_FORBIDDEN` · `ERR_CSRF_ORIGIN_FORBIDDEN` · `ERR_SELF_LOCKOUT_FORBIDDEN` | Access denied · role not allowed (`requireRole`) · origin not allowed on a cookie endpoint · admin locking out their own account |
| `NotFoundError` | 404 | `NOT_FOUND` | `ERR_NOT_FOUND` (default) · `ERR_ROUTE_NOT_FOUND` | Entity not found · no such route (`notFoundHandler`) |
| `ConflictError` | 409 | `CONFLICT` | `ERR_CONFLICT` | Unique value already taken — map `isUniqueViolation()` to it, never a 500 |
| `PayloadTooLargeError` | 413 | `PAYLOAD_TOO_LARGE` | `ERR_PAYLOAD_TOO_LARGE` | Body over the limit |
| `TooManyRequestsError` | 429 | `TOO_MANY_REQUESTS` | `ERR_RATE_LIMITED` (default) · `ERR_AUTH_LOGIN_LOCKED` | Global limit · refused attempts per IP on the self-authenticated prefixes · a caller's own quota (`rate_limit_rpm`) · too many login attempts per (email, IP); optional `retryAfterSeconds` |
| `ServiceUnavailableError` | 503 | `SERVICE_UNAVAILABLE` | `ERR_SERVICE_UNAVAILABLE` | A core dependency (database) is down |
| `ExternalServiceError(kind, message, { integration, details? })` | 502 / 504 | `EXTERNAL_SERVICE_ERROR` | `ERR_EXT_TIMEOUT` · `ERR_EXT_UNREACHABLE` · `ERR_EXT_ERROR` | Vendor failure; the vendor's status and body are never forwarded ([integrations.md](integrations.md)) |
| `InternalServerError` | 500 | `INTERNAL_SERVER_ERROR` | `ERR_INTERNAL` | Broken invariant; its message is logged, never sent |

Inbound-channel refusals use their own registry codes (`ERR_WEBHOOK_*`, …): [auth-and-inbound.md](auth-and-inbound.md). Every code with its status, type and meaning: `ERROR_CATALOG` (`src/core/errors/error-catalog.ts`, tested against the classes); which codes each endpoint sends: [docs/api/README.md](../api/README.md) (generated, [openapi.md](openapi.md) §6).

## 6. Localized messages (`id` / `en`)

- Every message sent to a client is a `LocalizedMessage` (`{ id, en }`; the type requires every supported locale): cross-cutting ones in `I18N_MESSAGES` (`src/core/i18n/messages.ts`), domain ones in `src/modules/<name>/<name>.messages.ts` (`<NAME>_MESSAGES`; functions such as `userNotFoundMessage(id)` for parameterized text).
- String literals as the message of `new ApiResponse(...)`, `new XError(...)` or an error `details[].message` in `src/modules/**` are rejected by ESLint `MODULE_ERROR_RULES`. `InternalServerError` is exempt: its text is log-only.
- The language comes from `Accept-Language` (RFC 9110: q-value order, `en-US` → `en`, unsupported → `DEFAULT_LOCALE`, default `id`), is stored in the request context (`getLocale()`), and is announced with `Content-Language` + `Vary: Accept-Language`.
- `Error.message` stays English (uniform logs); translation happens when the envelope is built.

```typescript
// users.messages.ts
export const USER_MESSAGES = {
  CREATED: { id: 'Pengguna berhasil dibuat', en: 'User created successfully' },
} as const satisfies Record<string, LocalizedMessage>;
```

## 7. Routes & versions

- Plural kebab-case nouns, no verbs; at most two levels, the second only for details owned by a header (`/<headers>/:id/<details>[/:childId]`) — anything deeper is a new top-level resource.
- The version is code, not configuration: modules register on the `v1` router in `createApp()` (`v1.route('/<module>', router)` → `<API_BASE_PATH>/v1/<module>`); a breaking change on a live endpoint is a new router (`v2`). `[review-only]`.
