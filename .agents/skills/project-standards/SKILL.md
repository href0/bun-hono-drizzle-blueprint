---
name: project-standards
description: Coding standards, folder structure, layer boundaries, naming, response envelopes and quality gates for this Bun + Hono + Drizzle backend. MUST be loaded before writing or modifying any code (modules, services, controllers, DTOs, schemas, transformers, middlewares, utils, tests).
---

# Project Standards (router)

The standards of this project live in `docs/standards/` — one file per topic, the same files developers read. This skill only tells you which to read; it never restates them (`docs/standards/documentation.md`).

1. Read `ARCHITECTURE.md` §12 once per session: every rule (`R01`…) with the machine that enforces it.
2. Before touching an area, read its file in full:

| You are touching | Read |
|---|---|
| Where a file goes, imports between layers, a new script / test area / module | `docs/standards/structure.md` |
| A file, module, identifier or table name | `docs/standards/naming.md` |
| Controllers, validation, DTOs, envelopes, errors, user-facing messages | `docs/standards/http-contract.md` |
| Who may call a route, roles, public routes, partner endpoints, vendor webhooks | `docs/standards/auth-and-inbound.md` |
| Route documentation, response schemas | `docs/standards/openapi.md` |
| Tables, columns, migrations, repositories, audit trail | `docs/standards/database.md` |
| Atomic operations, `@Transactional()`, repository tests | `docs/standards/transactions.md` |
| Raw SQL | `docs/standards/raw-queries.md` |
| Dates, times, zones | `docs/standards/datetime.md` |
| Cache, Redis, rate limits, nonces | `docs/standards/cache.md` |
| Logs | `docs/standards/logging.md` |
| Environment variables, project-name values | `docs/standards/configuration.md` |
| Calling a vendor | `docs/standards/integrations.md` |
| `src/app.ts`, `src/index.ts`, middleware order | `docs/standards/bootstrap.md` |
| Tests, the integration suite | `docs/standards/testing.md` |
| A new module, endpoint, webhook receiver or vendor adapter | `docs/standards/new-module.md` (templates: skill `scaffold-module`) |
| Gates, commands, ESLint rule groups | `docs/standards/quality-gates.md` |
| Branches, commit messages | `docs/standards/git-workflow.md` |
| Any document, a new or changed rule | `docs/standards/documentation.md` |

3. A change that adds or alters a rule updates that topic file and the rule's row in `ARCHITECTURE.md` §12 in the same change.
4. Finish with the skill `finish-change`: gates (`docs/standards/quality-gates.md` §1) and the definition of done (§4).
