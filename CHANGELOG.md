# Changelog

All notable changes to this boilerplate are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/) — what MAJOR, MINOR and PATCH mean for a project created from it: [git-workflow.md](docs/standards/git-workflow.md) §1.1. A project created from the boilerplate takes a release by porting it (§1.2). The IDs (`D13`) point to [docs/decisions.md](docs/decisions.md).

## [Unreleased]

### Changed

- **RBAC service split**: `rbac.service.ts` keeps the effective permissions, their cache and `forget`; every change of access moves to `RbacAccessService` (`rbac-access.service.ts`) — no behaviour change. A project that imported `rbacService.assignRole` and the like imports them from `rbacAccessService` now.
- **API contract documents** (D77): a module with several routers gets an index file and one file per router — `docs/api/rbac.md` becomes an index with `docs/api/rbac/{me,permissions,roles,user-access}.md`; file titles name every tag they cover. Run `bun run openapi:update` after porting the generator.

## [2.1.0] - 2026-11-08

**MINOR.** Administrators save RBAC checklists — the permissions of a role, the roles and the extra permissions of a user — in one request each, from catalogs that tell the frontend which boxes a save would refuse (D72–D76). The API changes are additive; one behaviour is stricter: revoking now needs the permissions it takes (D74).

### Added

- **RBAC checklists** (D72, D73): `GET /permissions/options` and `GET /roles/options` list every choice at once (not paginated) with `grantable`; `PUT /roles/:id/permissions`, `PUT /users/:id/roles` and `PUT /users/:id/permissions` save a whole relation in one transaction, writing only the difference and answering `added` / `removed` / `unchanged` (`updated` for grants). The per-item routes stay. Frontend guide: `docs/auth-guide.md` (*Layar checklist RBAC*).
- The 403 `ERR_PERMISSION_ESCALATION_FORBIDDEN` names each permission the caller lacks in `details` (`field` = the key).

### Changed

- **Revoking needs what it takes** (D74): unmapping a permission from a role, revoking a role or an extra permission from a user now needs every permission taken, like giving it — an administrator with fewer permissions than before may now get a 403 there. A permission that no longer counts (retired, deleted) is taken without it.
- **Acceptance coverage** (R91): every `bun run setup` option is classified in `SETUP_OPTION_COVERAGE` (`scripts/lib/acceptance.ts`); one that changes what a project contains must be chosen by an acceptance combination and left out by another, so a new setup option cannot ship untested.
- Dependencies: `hono` 4.13.16, `@scalar/hono-api-reference` 0.12.17, `temporal-polyfill` 1.0.7, `globals` 17.14.0, `knip` 6.44.1 — after pulling, run `bun install --frozen-lockfile` (a plain `bun install` can leave `knip`'s own `zod` 4 out and fail `lint:deps`).

### Upgrading a project

1. Port the commits of this release outside the example modules (`git log v2.0.0..v2.1.0`, [git-workflow.md](docs/standards/git-workflow.md) §1.2); no migration — `bun run env dev db:migrate` syncs the two new permissions `user-roles.update` and `user-permissions.update` (D75).
2. Only `super_admin` holds them at first: map them to the administrator roles that use the user checklists (`PUT /api/v1/roles/:id/permissions`, with `roles.read` / `permissions.read` for the catalogs — see the table in `docs/auth-guide.md`).
3. Frontends saving a checklist send the whole set: what is left out is revoked — the default role `user` and the `expires_at` / `note` of a grant included.

## [2.0.0] - 2026-11-07

**Breaking (MAJOR, D61).** Authorization moves from one role per user to permissions kept in the database (D46–D61, D64–D71): every route names the permission it checks, administrators manage roles, role permissions, menu permissions and per-user grants through an API, and no administrator can give more than they hold. The role leaves the access token and the `users` table. Every local command now names its environment (D62). A project that is already set up follows *Upgrading a project* below.

### Added

- **Permissions in the database** (D47–D56): tables `permissions`, `roles`, `role_permissions`, `user_roles`, `user_permissions` (own UUID v7 ids, soft delete = revocation, unique among live rows, ready for tenancy through one filter, `rbacScope()`). System roles `super_admin` (holds every permission, cannot be changed) and `user` (given to every new user, D59).
- **Permission registry in code** (D47–D49, D60): each module declares `<module>.permissions.ts` (`crudPermissions` / `definePermissions`, a constant per action); `src/permissions.ts` collects them; `bun run db:migrate` syncs them (also `bun run db:sync-permissions`), retiring keys the code dropped (D67); the server refuses to start while a key is missing.
- **Effective permissions per request** (D52, D53): roles ∪ unexpired grants, cached per user (`RBAC_PERMISSION_CACHE_TTL_SECONDS`, default 60) and dropped after every change commits (`afterCommit`, D63, R88): a revocation applies to the next request, no new login.
- **Guards** `requirePermission(<CONST>.<action>)`, `requireSelfOrPermission(param, …)`, `allowAnyUser()`; 403 `ERR_PERMISSION_FORBIDDEN`; OpenAPI `x-allowed-callers`. **Rule R89** (`test/route-permissions.e2e.test.ts`): every `/v1` route is in exactly one category, a guard refuses before validating, routes and registry name the same permissions.
- **RBAC admin API** (module `rbac`): `/roles` (CRUD, permissions of a role), `/permissions` (every permission with the endpoints it opens — read from the routes, D47 — and menu permissions `menu.…`), `/users/:id/roles`, `/users/:id/permissions` (grants with `expires_at` and `note`), `GET /me/permissions` for the frontend.
- **Scaffold**: every user-channel template generates `<module>.permissions.ts`, checks a constant on every route and registers `.all` in `src/permissions.ts`.
- **Acceptance** stage C: the RBAC flow over HTTP (a role, a user given it) and `test:int` of the new project.
- **Plans** end with a closing review and carry review checkpoints (`docs/plans/README.md`, D71); **rule R90** (`test/docs-sync.test.ts`): every decision ID cited has its row in `docs/decisions.md`, and code never cites a plan.
- `bun run start:<dev|test|stg|demo|prod>` and `bun run env <environment> <command>` (D62, R87).

### Changed

- **No escalation**: whoever maps a permission, gives a role or a grant, or restores a role must hold every permission involved; `super_admin` is given and taken only by a super admin, never from oneself (403 `ERR_SELF_LOCKOUT_FORBIDDEN`) or the last active holder (409); another user's account (email, password, active flag, delete, restore) is changed only by someone holding every permission it holds — 403 `ERR_PERMISSION_ESCALATION_FORBIDDEN` (new code).
- `users` responses carry `roles: string[]` (read-only); `role` is gone from the login response, `GET /auth/me`, the user DTOs and the list filters.
- `bun run seed:admin` gives the `super_admin` role (`--promote` too).
- `bun run openapi:check`: a new code in the shared `error.code` enum of error responses is a safe change, no longer hundreds of `BREAKING` ones.
- **CI job `docker`**: the tools image migrates with the same environment as the production image (database, Redis, JWT, partner keys), as a deployment gives it ([deployment.md](docs/deployment.md) §3) — `db:migrate` now also syncs the permission registry through the application configuration. A project with its own CI takes the same change.
- `.env` is no longer used: commands load `.env.<environment>` only and refuse while `.env` or `.env.local` exists; `bun run setup` creates `.env.dev`.

### Removed

- `requireRole`, `requireSelfOrRole`, `ROLES`, `DEFAULT_ROLE`, the `role` claim of the access token (an older token that still carries it is accepted; the claim is ignored) and the column `users.role` (`0010_rbac.sql` moves it into `user_roles`, `0011_drop_users_role.sql` drops it).
- `bun run dev` (use `bun run start:dev`).

### Upgrading a project

A project created from 1.x ports this release like any other ([git-workflow.md](docs/standards/git-workflow.md) §1.2) — in this order, on a branch, with a backup of every database it upgrades:

1. **Environment** (D62): rename `.env` to `.env.dev` (and keep one file per environment); `bun run dev` becomes `bun run start:dev`, database commands become `bun run env dev <command>`.
2. **Platform code**: cherry-pick the commits of this release outside the example modules and `drizzle/` (`git log v1.2.0..v2.0.0 -- src/core src/database scripts test docs/standards src/modules/rbac src/modules/users src/modules/auth src/permissions.ts src/app.ts`).
3. **Schema and data — your own migrations**, never the boilerplate's `drizzle/`: `bun run db:generate` for the five RBAC tables, then append the hand-written data part of the boilerplate's `0010_rbac.sql` (after `-- Data (hand-written`) to that migration: it creates the system roles, one role for every other `users.role` value, and a `user_roles` row for every user — `admin` becomes `super_admin`. Deploy, check every user has their role, **then** generate the migration that drops `users.role` (two steps, [deployment.md](docs/deployment.md) §3).
4. **Each of your modules**: add `<module>.permissions.ts` (`crudPermissions('<module>', '<words>')` or `definePermissions` for actions of its own) and register `.all` in `src/permissions.ts`; on every route replace `requireRole('admin')` with `requirePermission(<CONST>.<action>)`, `requireSelfOrRole` with `requireSelfOrPermission`, and a route for every signed-in user gets `allowAnyUser()`. `test/route-permissions.e2e.test.ts` names every route still missing one.
5. **Code that read the role**: `currentUser().role` and the `role` claim no longer exist — ask for a permission instead; tests use `authorize(createTestApp(), [<keys>])` / `signedIn(<keys>)` instead of a role.
6. `bun run env dev db:migrate` (migrations + permission sync), map the new permissions to your roles (`PUT /api/v1/roles/:id/permissions/:permissionId` as a super admin), then `bun run openapi:update --allow-breaking` (the contract loses `role`), `bun run validate:full`, `bun run build`, `bun run env dev test:int`.
7. **Frontends**: stop reading `role` from the login response; show menus and buttons from `GET /api/v1/me/permissions`; handle 403 `ERR_PERMISSION_FORBIDDEN` / `ERR_PERMISSION_ESCALATION_FORBIDDEN` ([auth-guide.md](docs/auth-guide.md)).

## [1.2.0] - 2026-10-31

The documentation portal (`docs-site/`) reads like a framework's documentation. A project that is already set up takes it by porting the four portal commits (`docs-site/`, `test/docs-portal.test.ts`, `.github/workflows/deploy-docs.yml`, [git-workflow.md](docs/standards/git-workflow.md) §1.2), then `bun install` inside `docs-site/`; nothing outside the portal changes.

### Added

- **Portal layout**: the content column grows with the screen instead of Starlight's fixed 45rem, and long paths in table cells wrap — wide tables no longer scroll sideways on a desktop (D43).
- **Portal look**: an accent palette that passes WCAG AA in both themes, self-hosted fonts (no request to a third party), a logo, and the version of `package.json` next to the title (D44, D45).
- **Portal home and navigation**: a home page with a four-step start, the architecture pillars and links to every area; each page dated from its source's last commit, with "Edit page" to the source file (never for the generated API contract); the API Reference group starts folded (D45).
- **Rule R86** (`test/docs-portal.test.ts`) keeps all of it in place.

## [1.1.0] - 2026-10-30

Nothing to port for a project that is already set up: both changes concern starting a new project.

### Added

- **Setup**: `bun run setup` starts the new project's own `CHANGELOG.md` on the first setup — one line names the boilerplate release it came from, then an empty `[Unreleased]`; the boilerplate's entries stay readable from its tags ([project-setup.md](docs/standards/project-setup.md) §1). `bun run acceptance` checks it.

### Changed

- **Starting a project**: clone a release tag (`git clone --branch vX.Y.Z`, then `git switch -c main`) instead of `main`, so `package.json` → `boilerplate.version` names the code the project really started from (README quickstart, [project-setup.md](docs/standards/project-setup.md) §1, skill `init-project`).
- **Releasing the boilerplate**: every tag gets a GitHub Release with its changelog entry as notes ([git-workflow.md](docs/standards/git-workflow.md) §1.1).

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
