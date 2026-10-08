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
- **ESLint 9 Flat Config** with `strictTypeChecked`, custom AST rules (banning `c.json()`/`c.text()` in controllers, direct `db`/`HttpClientService`/Redis client (`redis.client`, `ioredis`) imports in modules and integrations, `'ERR_*'` literals or dynamically built codes outside `src/core/errors/error-codes.ts`, plain `throw new Error`/`throw Error` in modules, string-literal user messages in modules, `new Date(...)` (even for "now") / `Temporal.Now` / `Date.parse` / local-time `Date` getters and formatters outside `src/utils/datetime.util.ts`, `pgSchema(`/`pgTable(` outside `src/database/schema/schemas.ts` (tables use `appTable`), raw `timestamp(`/`date(`/`serial(`/`pgTable(`/`.defaultRandom()` in schema files (column helpers instead), and `process.env` outside `src/config/env-source.ts`), and justified-only `eslint-disable` (`-- <reason>` required)
- **ls-lint** directory and file naming conventions
- **Prettier** formatting enforcement for code (`format:check`). Markdown is excluded via `.prettierignore` — never run Prettier on `.md` files (it pads table cells into walls of spaces); write compact tables (`| a | b |`, `|---|---|`) and tight lists by hand
- **Dependency Cruiser** strict layer boundaries (`config`, `core`, `database`, `modules`, `integrations`, `utils`)
- **knip** unused files, exports, and dependencies
- **Branch Naming Validation** (`validate-branch-name`)
- **Hermetic tests** — `bunfig.toml` preloads `test/setup/hermetic-env.ts` (no real database/Redis from `bun test`); `mock.module()` is banned in tests (it leaks across files)
- **Coverage gate** `scripts/check-coverage.ts` — the single source of coverage thresholds (source files only, global + per-file, every source file must be loaded by a test)
- **Scaffold template verification** `bun run verify:scaffold` (CI) — generates a module from the `scaffold-module` skill and runs every gate; run it after changing the template or any core API it uses (errors, response, middlewares, dto, i18n, openapi, database)

Any code violating these standards will fail `bun run validate:full`, blocking commits/pushes locally via Husky and failing CI (`.github/workflows/ci.yml`).

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

1. **Return-Based Controllers**: Controllers MUST return `new ApiResponse(data, message, statusCode, meta)`. Calling `c.json()` inside controllers is prohibited by ESLint AST rules.
2. **Validation First**: Every route accepting inputs MUST use `validate({ body, query, params })` middleware with Zod schemas. Controllers extract sanitized data via `getValidatedBody(c)`, `getValidatedParams(c)`, and `getValidatedQuery(c)`.
3. **Decoupled Repositories**: Repositories MUST receive `TransactionHost` and query through `this.txHost.tx`. Never import `db` directly into repositories.
4. **Data Shaping**: Controllers MUST use a Transformer (`toResponse`, `toListResponse`) to sanitize and shape entity objects before returning them to clients.
5. **Coverage Quality Gate**: All code must pass the coverage gate (`bun run test:cov`, thresholds in `scripts/check-coverage.ts`). Never add a `COVERAGE_EXCLUSIONS` entry without a reason and the plan step that removes it.
6. **Strict Casing Invariant**: The wire format is `snake_case` in **both directions** (e.g. `status_code`, `full_name`, `is_active`). Responses are converted by `ApiResponse.toJSON()` and `globalErrorHandler`; request body/query keys in any other casing are rejected with 400 `ERR_NON_SNAKE_CASE_KEY` by `validate()`, which converts accepted payloads to camelCase DTOs (`preserveKeys` for free-form dictionaries). In the TypeScript codebase, `snake_case` is forbidden for all identifiers — only SQL column names in Drizzle schemas may use `snake_case`.
7. **Strict Intra-Module Unidirectional Flow**: Data access and control MUST flow strictly unidirectional: `Routes -> Controller -> Service -> Repository`. Controllers MUST NOT import repositories directly. Routes MUST NOT import services or repositories. Services MUST NOT import controllers, routes, or transformers. Repositories MUST NOT import services or controllers. Transformers MUST be pure data mappers. Enforced deterministically by `dependency-cruiser`.
8. **Absolute Database Connection Isolation**: Domain modules (`src/modules/**`) MUST NEVER import `src/database/connection.ts` or directly import `db` or `sqlClient`. Connection pooling is strictly internal to `src/database/`. Repositories query exclusively through `this.txHost.tx`; services interact with persistence strictly through repositories. Enforced by ESLint AST rules and `dependency-cruiser`.
9. **Isolated Outbound Integrations**: Third-party vendor adapters (e.g. WhatsApp, Payment Gateways) MUST live exclusively under `src/integrations/<vendor>/`. They MUST NOT contain controllers or routes, and MUST NOT depend on domain modules or database layers. Domain services in `src/modules/**.service.ts` consume them as internal dependencies.
10. **Single-Source Project Identity**: This repository is a boilerplate initialized per project by the `init-project` skill (`bun run setup <name>`). Never hardcode the project name in agent rules, skills, or docs — write "this project". Any code/config that must carry the name (package name, `APP_NAME`, database name, container names, …) MUST be registered in `IDENTITY_RULES` in `scripts/setup.ts`; the script aborts when a rule stops matching.
11. **Localized User-Facing Messages**: Every message sent to clients is a `LocalizedMessage` (`{ id, en }`): cross-cutting ones in `I18N_MESSAGES` (`src/core/i18n/messages.ts`), domain ones in `src/modules/<name>/<name>.messages.ts`. The response language comes from `Accept-Language` (fallback `DEFAULT_LOCALE`). String literals as `ApiResponse` / error / error-detail messages in `src/modules/**` are rejected by ESLint (`InternalServerError` is exempt: log-only).
12. **Documented Endpoints**: Every route has `describeEndpoint()` (response envelope + domain errors); request body, parameters, 400/413 are documented by `validate()` from the same schemas, and the common headers by the document builder — never by hand. Response schemas live in `<name>.dto.ts` and type the transformer. `test/openapi.e2e.test.ts` fails for a route without `describeEndpoint()` (no summary / no 2xx), a non-snake_case property, or missing common headers. Guide: `.agents/skills/project-standards/references/openapi.md`.
13. **Date & Time**: Instants (`*_at`), calendar dates (`*_date`) and local schedules (instant + `*_timezone`) are never mixed; parsing and `Date` ⇄ Temporal conversion live only in `src/utils/datetime.util.ts`, request fields use `src/core/dto/datetime.dto.ts`; the process and the DB session run in UTC. Guide: `.agents/skills/project-standards/references/datetime.md`.
