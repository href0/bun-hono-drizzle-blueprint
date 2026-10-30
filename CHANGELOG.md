# Changelog

All notable changes to this boilerplate are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/) — what MAJOR, MINOR and PATCH mean for a project created from it: [git-workflow.md](docs/standards/git-workflow.md) §1.1. A project created from the boilerplate takes a release by porting it (§1.2). The IDs (`D13`) point to [docs/decisions.md](docs/decisions.md).

## [1.0.0] - 2026-10-30

The first release: a production-ready backend on Bun, Hono, Drizzle ORM and PostgreSQL, with Redis as a recommended addition.

### Added

- **HTTP contract**:
  - Controllers return `ApiResponse`; one success and one error envelope.
  - The wire is strict `snake_case` in both directions (D10).
  - Messages in `id` and `en`, chosen by `Accept-Language` (D11).
  - Paginated lists take `sort`, `q` and typed filters; any other parameter is a 400 (D41).
  - `X-Request-ID` is validated or generated (D9).
- **Layers**:
  - `Routes → Controller → Service → Repository`, enforced by dependency-cruiser and ESLint.
  - Request context in `AsyncLocalStorage` (D8); dependency injection by default constructor parameters (D20).
- **Auth**:
  - Every `/v1` route is authenticated unless listed in `PUBLIC_ROUTES` (D7).
  - JWT access tokens (D2) and opaque refresh tokens in an `HttpOnly` cookie, rotated with reuse detection (D1, D3).
  - `Origin` / `Sec-Fetch-Site` check on cookie endpoints (D4); argon2id passwords (D5); role-based access with `requireRole()` (D6).
- **Data layer**:
  - Declarative transactions.
  - Five repository bases: base, child (header-detail), dependent (parent-child, D33), append-only and read-only.
  - Every update and delete is recorded in `record_changes` in the same transaction (D16).
  - UUID v7 keys (D15); a unique-value collision is a 409 (D12).
- **Time**: Temporal, with the runtime and database sessions in UTC and three kinds of time (D13).
- **Inbound channels**:
  - Vendor webhooks under `<base>/webhooks/<vendor>`: fail-closed signature check, idempotent by event id (D23, D28).
  - Refused attempts are rate-limited per IP (D29).
- **Partner gateway** — server-to-server requests under `<base>/v1/partner/*` signed with HMAC, managed through the `partner-credentials` module (D21, D27); optional: `bun run setup --no-partner` prunes it (D39). <!-- partner -->
- **Outbound integrations**: vendor adapters in `src/integrations/<vendor>/` (D25), modules named after their domain (D26).
- **Platform**:
  - Configuration validated at startup by Zod; the app refuses to start on an invalid value.
  - Structured logs (Pino); health `UP` / `DEGRADED` / `DOWN`; graceful shutdown.
  - Redis is fail-open with a key prefix, used for the cache, rate limits and login lockout; the API keeps running without it (D18, D22).
- **API contract**:
  - OpenAPI + Scalar generated from the route code (D17).
  - A reviewed snapshot in `docs/api/openapi.json`; `openapi:check` labels every change `BREAKING`, safe or docs (D34).
  - One generated Markdown file per module, with every error code (D35).
- **Tooling**:
  - `bun run setup` names a new project and removes the example modules, with a wizard or flags (D38).
  - `bun run scaffold` generates modules, dependent modules, webhooks, partner endpoints and integrations from the templates (D31, D36).
  - `bun run acceptance` replays a new developer's path end to end, Docker included (D37).
  - `bun run help` lists every command, and every command answers `--help` (D40).
- **Quality gates**:
  - tsc, ESLint, ls-lint, Prettier, dependency-cruiser and knip.
  - Coverage of at least 95 % globally and 90 % per file (D19), plus guard tests for every rule in `ARCHITECTURE.md` §12.
  - Integration tests; Husky hooks; GitHub Actions jobs `verify`, `integration`, `docker` and `docs`.
- **Deployment**: one `Dockerfile` with a runner image and a tools image for migrations and one-off jobs ([docs/deployment.md](docs/deployment.md)).
- **Documentation**:
  - One standard per topic in `docs/standards/` (D32).
  - A web portal (Astro Starlight).
  - A guide for frontend developers ([docs/auth-guide.md](docs/auth-guide.md)).
  - A guide for partners ([docs/partner-integration-guide.md](docs/partner-integration-guide.md)). <!-- partner -->
  - Rules and skills for AI agents in `.agents/`.
