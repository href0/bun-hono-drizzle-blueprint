# Agent Rules & Engineering Standards

## MANDATORY: Read Project Standards Before Writing Code

Before writing or modifying any code, generating new files, or making architectural decisions in this workspace, you MUST read the `project-standards` skill:

**File**: `.agents/skills/project-standards/SKILL.md`

This rule applies to: creating modules, writing services, controllers, DTOs, schemas, transformers, middlewares, utilities, and test suites.

This rule does NOT apply to: generating commit messages, generating logbook entries, bumping versions, or answering investigatory questions that do not involve writing code.

---

## Active Work Plan

Ongoing work follows `docs/plans/2026-10-04-blueprint-adoption-plan.md`. Execute exactly one step at a time, meet its Definition of Done (§14.1), report with the review template (§14.2), then STOP for review. Record progress, findings and any deviation in its log (§4.1) and progress table (§5).

**Never commit or merge until the user explicitly asks.** The user reviews every change first: finish a step with the changes left in the working tree plus a suggested commit message (`generate-commit-text` conventions). Creating a branch is fine; committing and merging are not.

---

## Why This Exists

This project enforces strict automated Quality Gates powered by:

- **TypeScript 5 Strict Type Checking** (`tsc --noEmit`)
- **ESLint 9 Flat Config** with `strictTypeChecked`, custom AST rules (banning `c.json()`/`c.text()`/`c.body()`/`c.html()`, input read from `c.req` (headers excepted) and handlers not wrapped in `asyncHandler` in controllers, direct `db`/`HttpClientService`/Redis client (`redis.client`, `ioredis`) imports in modules and integrations, raw outbound HTTP (`fetch(`, `axios`, `node:http(s)` and other HTTP clients) outside `src/core/http/**`, `'ERR_*'` literals or dynamically built codes outside `src/core/errors/error-codes.ts`, plain `throw new Error`/`throw Error` in modules, string-literal user messages in modules, `new Date(...)` (even for "now") / `Temporal.Now` / `Date.parse` / local-time `Date` getters and formatters outside `src/utils/datetime.util.ts`, `pgSchema(`/`pgTable(` outside `src/database/schema/schemas.ts` (tables use `appTable`), raw `timestamp(`/`date(`/`serial(`/`pgTable(`/`.defaultRandom()` in schema files (column helpers instead), `process.env` outside `src/config/env-source.ts`, and the data layer: module repositories must extend a repository base (`BaseRepository` / `ChildRepository` / `AppendOnlyRepository` / `ReadOnlyRepository`), no `tx.update`/`tx.delete` in repositories (sole exception: the refresh-token repository may update `auth_refresh_tokens`), the transaction never kept in a variable or destructured, no DB writes outside repositories, no raw `UPDATE`/`DELETE` SQL, `tx.execute` only in `*.queries.ts`, `@Transactional()` only in services, `TransactionHost` only in repositories/queries, `recordChanges` only in `src/database/`, no `sql.raw`), the inbound channel helpers (`local/inbound-channel`: `currentPartner`/`requirePartner` only in `*.partner.*` files, `requireRole`/`requireSelfOrRole`/`currentUser` never there, neither kind in `*.webhook.*` files), the integration suite (`test/integration/**`: no `expect(promise).rejects`/`.resolves` — they stall real I/O in Bun 1.3.0, use `rejectionOf()` — and no `spyOn`/`mock`), and justified-only `eslint-disable` (`-- <reason>` required)
- **ls-lint** directory names and single-dot file names; **`test/structure.test.ts`** every file name (ls-lint applies `.ts` rules only to names whose whole extension is `.ts`), the module/integration naming patterns, modules not named after vendors, inbound channel mounting, and `*.int.ts` only in `test/integration/`; **`test/docs-sync.test.ts`** that CONTRIBUTING.md (the canonical tree and command table) names every script, test folder, helper, module and `package.json` script
- **Prettier** formatting enforcement for code (`format:check`). Markdown is excluded via `.prettierignore` — never run Prettier on `.md` files (it pads table cells into walls of spaces); write compact tables (`| a | b |`, `|---|---|`) and tight lists by hand
- **Dependency Cruiser** strict layer boundaries (`config`, `core`, `database`, `modules`, `integrations`, `utils`)
- **knip** unused files, exports, and dependencies
- **Branch Naming Validation** (`validate-branch-name`)
- **Integration suite** — `bun run test:int` is **required** before finishing a change to a repository or repository base, transactions, migrations, auth, the partner gateway or the cache (not in pre-push: it needs PostgreSQL + Redis; CI job `integration` runs it). A module with its own queries, locks, unique indexes or Redis behaviour adds `test/integration/<area>.int.ts` (`references/testing.md` §7)
- **Hermetic tests** — `bunfig.toml` preloads `test/setup/hermetic-env.ts` (no real database/Redis from `bun test`); real services only in the integration suite `bun run test:int` (`test/integration/*.int.ts`, a disposable database per run, CI job `integration`); `mock.module()` is banned in tests (it leaks across files)
- **Coverage gate** `scripts/check-coverage.ts` — the single source of coverage thresholds (source files only, global + per-file, every source file must be loaded by a test)
- **Scaffold template verification** `bun run verify:scaffold` (CI) — generates a module from every `scaffold-module` template variant (standalone, header-detail, record, partner, webhook) plus a vendor adapter from the integration template, and runs every gate, their tests and the schema conventions; run it after changing the template or any core API it uses (errors, response, middlewares, dto, i18n, openapi, database, http)

Any code violating these standards will fail `bun run validate:full`, blocking commits/pushes locally via Husky and failing CI (`.github/workflows/ci.yml`).

`ARCHITECTURE.md` explains why each invariant exists and indexes every rule with its enforcer (§12: `[tsc]`, `[eslint:<name>]`, `[depcruise:<name>]`, `[ls-lint]`, `[test:<name>]`, `[script:<name>]`, `[ci:<job>]`, `[hook:<file>]`, `[review-only]`). Adding or changing a rule means adding or updating its row there in the same change; `test/docs-sync.test.ts` fails for a label that points at nothing.

When adding `no-restricted-syntax` / `no-restricted-imports` rules, compose the shared rule groups at the top of `eslint.config.mjs` — a later flat-config override replaces the whole rule array of an earlier one.

---

## MANDATORY: Environment File Protection Policy

You are strictly PROHIBITED from reading, searching, or exposing any active or sensitive `.env` files (e.g., `.env`, `.env.production`, `.env.local`, `.env.development`, `.env.dev`, `.env.stg`, `.env.prod`).

### Whitelist Exemption

You are ONLY allowed to read or access `.env.example`. Any other environment file MUST be rejected.

### Action on Violations

1. **ABORT** the read operation immediately BEFORE invoking any tool call (`view_file`, `grep_search`, `run_command` with `cat`/`type`).
2. **NEVER generate a tool call** that triggers a permission prompt or approval dialog to the user for protected `.env` files.
3. Inform the user directly in natural language:
   > "Error: Access to the requested environment file is blocked by the repository's Environment File Protection Policy (`env-protection` skill). Only whitelisted environment templates (e.g., `.env.example`) can be read."

---

## Core Architectural Invariants

1. **Return-Based Controllers**: Controllers MUST return `new ApiResponse(data, message, statusCode, meta)` from handlers wrapped in `asyncHandler`. Calling `c.json()`, reading input from `c.req` (except headers), and unwrapped handlers are prohibited by ESLint AST rules.
2. **Validation First**: Every route accepting inputs MUST use `validate({ body, query, params })` middleware with Zod schemas. Controllers extract sanitized data via `getValidatedBody(c)`, `getValidatedParams(c)`, and `getValidatedQuery(c)`.
3. **Decoupled Repositories**: Repositories MUST receive `TransactionHost` and query through `this.txHost.tx`. Never import `db` directly into repositories.
4. **Data Shaping**: Controllers MUST use a Transformer (`toResponse`, `toListResponse`) to sanitize and shape entity objects before returning them to clients `[review-only]`.
5. **Coverage Quality Gate**: All code must pass the coverage gate (`bun run test:cov`, thresholds in `scripts/check-coverage.ts`). Never add a `COVERAGE_EXCLUSIONS` entry without a reason and the plan step that removes it.
6. **Strict Casing Invariant**: The wire format is `snake_case` in **both directions** (e.g. `status_code`, `full_name`, `is_active`). Responses are converted by `ApiResponse.toJSON()` and `globalErrorHandler`; request body/query keys in any other casing are rejected with 400 `ERR_NON_SNAKE_CASE_KEY` by `validate()`, which converts accepted payloads to camelCase DTOs (`preserveKeys` for free-form dictionaries). In the TypeScript codebase, `snake_case` is forbidden for all identifiers — only SQL column names in Drizzle schemas may use `snake_case`.
7. **Strict Intra-Module Unidirectional Flow**: Data access and control MUST flow strictly unidirectional: `Routes -> Controller -> Service -> Repository`. Controllers MUST NOT import repositories directly. Routes MUST NOT import services or repositories. Services MUST NOT import controllers, routes, or transformers. Repositories MUST NOT import services or controllers. Transformers MUST be pure data mappers. Enforced deterministically by `dependency-cruiser`.
8. **Absolute Database Connection Isolation**: Domain modules (`src/modules/**`) MUST NEVER import `src/database/connection.ts` or directly import `db` or `sqlClient`. Connection pooling is strictly internal to `src/database/`. Repositories query exclusively through `this.txHost.tx`; services interact with persistence strictly through repositories. Enforced by ESLint AST rules and `dependency-cruiser`.
9. **Isolated Outbound Integrations**: Third-party vendor adapters (e.g. WhatsApp, Payment Gateways) MUST live exclusively under `src/integrations/<vendor>/`. They MUST NOT contain controllers or routes, and MUST NOT depend on domain modules or database layers. Domain services in `src/modules/**.service.ts` consume them as internal dependencies.
10. **Single-Source Project Identity**: This repository is a boilerplate initialized per project by the `init-project` skill (`bun run setup <name>`). Never hardcode the project name in agent rules, skills, or docs — write "this project". Any code/config that must carry the name (package name, `APP_NAME`, database name, container names, …) MUST be registered in `IDENTITY_RULES` in `scripts/setup.ts`; the script aborts when a rule stops matching.
11. **Localized User-Facing Messages**: Every message sent to clients is a `LocalizedMessage` (`{ id, en }`): cross-cutting ones in `I18N_MESSAGES` (`src/core/i18n/messages.ts`), domain ones in `src/modules/<name>/<name>.messages.ts`. The response language comes from `Accept-Language` (fallback `DEFAULT_LOCALE`). String literals as `ApiResponse` / error / error-detail messages in `src/modules/**` are rejected by ESLint (`InternalServerError` is exempt: log-only).
12. **Documented Endpoints**: Every route has `describeEndpoint()` (response envelope + domain errors); request body, parameters, 400/413 are documented by `validate()` from the same schemas, and the common headers by the document builder — never by hand. Response schemas live in `<name>.dto.ts` and type the transformer. `test/openapi.e2e.test.ts` fails for a route without `describeEndpoint()` (no summary / no 2xx), a non-snake_case property, or missing common headers. Guide: `.agents/skills/project-standards/references/openapi.md`.
13. **Date & Time**: Instants (`*_at`), calendar dates (`*_date`) and local schedules (instant + `*_timezone`) are never mixed; parsing and `Date` ⇄ Temporal conversion live only in `src/utils/datetime.util.ts`, request fields use `src/core/dto/datetime.dto.ts`; the process and the DB session run in UTC. Guide: `.agents/skills/project-standards/references/datetime.md`.
14. **Audited Data Layer**: Every module repository extends the base for its table kind — `BaseRepository` (standalone/header: soft delete, actor-stamped `created_by`/`updated_by`), `ChildRepository` (detail: reachable only through its live header), `AppendOnlyRepository` (record), `ReadOnlyRepository` (reference view). Updates, soft deletes, restores and detail deletes lock the row and append to `record_changes` in the same transaction; nothing writes around the bases (no `tx.update`/`tx.delete` in module repositories, no raw `UPDATE`/`DELETE`, `tx` never kept in a variable). A unique conflict (`isUniqueViolation()`) is a 409, never a 500. Tables follow the schema conventions (`src/database/schema/schema-conventions.test.ts`). Guide: `.agents/skills/project-standards/references/database.md` §5–6; rule table: CONTRIBUTING §5.3.
15. **Default-Deny Authentication**: Every route under `<API_BASE_PATH>/v1` requires `Authorization: Bearer <access token>` (`authenticate()` in `createApp()`), except the short `PUBLIC_ROUTES` list (`src/core/security/public-routes.ts`) — never add a per-route "skip auth". Partner routes (`<API_BASE_PATH>/v1/partner/*`) use signed requests instead (`partnerAuth()`: HMAC spec v1, IP whitelist, route ACL, nonce, per-partner rate limit; handlers read `currentPartner()`); `authenticate()` lets them through only after `partnerAuth()` verified the partner. Authorization per route with `requireRole(...)` (403 `ERR_ROLE_FORBIDDEN`); handlers read the caller with `currentUser()`. Refresh tokens live only in the HttpOnly cookie; cookie endpoints use `csrfProtection()`. `test/default-deny.e2e.test.ts` enumerates every route of `createApp()` and fails for one that answers without a token (partner routes: without partner headers, even with a bearer token); the OpenAPI document marks protected operations from the same lists.
16. **Inbound Channels & File Naming** (plan D23–D27): three inbound channels, kept in their own files — users with access tokens (`<module>.<role>.ts`), partner systems with signed requests (`<module>.partner.<role>.ts`, mounted only under `<API_BASE_PATH>/v1/partner`), vendor webhooks (`<module>.webhook.<role>.ts`, mounted only under `<API_BASE_PATH>/webhooks/<vendor>`). Module files are `<module>[-<qualifier>][.partner|.webhook].<role>[.test].ts` (role: `routes`, `controller`, `service`, `repository`, `queries`, `dto`, `transformer`, `messages`, `util`) — the suffix is what ESLint and dependency-cruiser read, so a near miss like `x.partner-routes.ts` would escape every rule. Integration files are `<vendor>.<role>.ts` (`service`, `dto`, `webhook`, `webhook.dto`) or `index.ts`. Modules are named after their domain, never after a vendor. A partner route for one partner only adds `requirePartner('<code>')`. Partner writes are idempotent per `(partner_code, partner_reference)`. Vendor webhooks: the verifier lives in `src/integrations/<vendor>/<vendor>.webhook.ts` and is registered only in `WEBHOOK_VENDORS` (`src/app.ts`, dependency-cruiser `webhook-verifier-only-in-app`); everything under `<API_BASE_PATH>/webhooks/*` is fail-closed (`requireVerifiedWebhook()`); the payload keeps the vendor's casing (`validate({ body, bodyKeys: 'verbatim' })`, only in `*.webhook.*` files); events are stored in `webhook_events` (unique `(vendor, event_id)`) and processed in the same transaction. Enforced by `test/structure.test.ts`, ESLint `local/inbound-channel`, the scaffold variants `references/partner.md` / `references/webhook.md` (`verify:scaffold`), and `test/default-deny.e2e.test.ts` (every webhook route of a registered vendor, 401 without its signature).
