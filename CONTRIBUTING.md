# Contributing

How to work in this repository — for developers and AI coding agents alike. Every coding standard lives in **one** file under [`docs/standards/`](docs/standards/); this page only tells you where. Why the architecture looks the way it does, and which machine enforces each rule: [ARCHITECTURE.md](ARCHITECTURE.md) (rule index in §12).

Violations are caught automatically: the pre-commit and pre-push hooks block them locally, and CI blocks them on every push and pull request ([quality-gates.md](docs/standards/quality-gates.md)).

---

## 1. First steps

1. Read the quickstart in [README.md](README.md) (install, `bun run setup` — [project-setup.md](docs/standards/project-setup.md), migrations, first admin, `bun run dev`).
2. Skim [ARCHITECTURE.md](ARCHITECTURE.md) once — the pillars and the rule index.
3. Before writing code, open the standards for what you are about to touch (§2).

## 2. Standards (the single source)

| Topic | File | Read when |
|---|---|---|
| Directory tree & layer boundaries | [structure.md](docs/standards/structure.md) | Placing a file, importing across layers, adding a script / test area / module |
| Naming | [naming.md](docs/standards/naming.md) | Naming a file, module, identifier or table |
| Gates & commands | [quality-gates.md](docs/standards/quality-gates.md) | Running checks, adding a script or an ESLint rule |
| HTTP contract | [http-contract.md](docs/standards/http-contract.md) | Controllers, validation, DTOs, envelopes, errors, messages |
| Authentication & inbound channels | [auth-and-inbound.md](docs/standards/auth-and-inbound.md) | Who may call a route; roles; partner endpoints; vendor webhooks |
| OpenAPI | [openapi.md](docs/standards/openapi.md) | Documenting a route or a response schema |
| Database | [database.md](docs/standards/database.md) | Tables, columns, migrations, repositories, audit trail |
| Transactions | [transactions.md](docs/standards/transactions.md) | Atomic operations, `@Transactional()`, repository tests |
| Raw SQL | [raw-queries.md](docs/standards/raw-queries.md) | A query the builder cannot express |
| Date & time | [datetime.md](docs/standards/datetime.md) | Any date, time, duration or zone |
| Cache | [cache.md](docs/standards/cache.md) | Caching, keys, TTLs, rate limits, nonces, Redis |
| Logging | [logging.md](docs/standards/logging.md) | Writing logs, redaction, request correlation |
| Project setup | [project-setup.md](docs/standards/project-setup.md) | Starting a project from this boilerplate; what `bun run setup` renames and removes |
| Configuration | [configuration.md](docs/standards/configuration.md) | Environment variables |
| Outbound integrations | [integrations.md](docs/standards/integrations.md) | Calling a vendor |
| Bootstrap | [bootstrap.md](docs/standards/bootstrap.md) | `src/app.ts`, `src/index.ts`, middleware order |
| Testing | [testing.md](docs/standards/testing.md) | Writing tests, the integration suite |
| Acceptance run | [manual-acceptance.md](docs/standards/manual-acceptance.md) | Before a release; after changing setup, scaffolding, migrations or the `Dockerfile` |
| New module or adapter | [new-module.md](docs/standards/new-module.md) | Creating a module, endpoint, webhook receiver or vendor adapter |
| Git workflow | [git-workflow.md](docs/standards/git-workflow.md) | Branches, commit messages, pull requests |
| Documentation | [documentation.md](docs/standards/documentation.md) | Changing a standard or any document |

## 3. Working on a change

1. Branch from `main`: `<type>/<slug>` ([git-workflow.md](docs/standards/git-workflow.md)).
2. New module or adapter: start from the scaffold templates ([new-module.md](docs/standards/new-module.md)).
3. Tests with the change ([testing.md](docs/standards/testing.md)); `bun run test:int`, `bun run verify:scaffold` and `bun run acceptance` when [quality-gates.md](docs/standards/quality-gates.md) §1 says so.
4. Documentation in the same change: edit the one `docs/standards/` file of the topic, and add or update the rule's row in `ARCHITECTURE.md` §12 when a rule is added or its enforcer changes ([documentation.md](docs/standards/documentation.md)).
5. `bun run validate:full` and `bun run build`, then open the pull request with a Conventional Commits title.

AI agents additionally follow [.agents/AGENTS.md](.agents/AGENTS.md) (mandatory reading, the active work plan, `.env` protection, never committing unasked).
