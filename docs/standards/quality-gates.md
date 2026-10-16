# Quality Gates & Commands

Read this file when: running checks before finishing a change (definition of done: §4), adding a `package.json` script, adding an ESLint rule, or wondering why a commit / push / CI job failed. `test/docs-sync.test.ts` fails when a `package.json` script is missing from the command table (§3).

---

## 1. Where each gate runs

```
[1] git commit                                (fast — staged files and types)
      └─ pre-commit (Husky)
            ├─ lint-staged        → ESLint strictTypeChecked --fix + Prettier on staged files
            ├─ tsc --noEmit       → strict typecheck of the whole project
            └─ ls-lint            → folder and single-dot file names (kebab-case)

[2] commit message
      └─ commit-msg (Husky)
            └─ commitlint         → Conventional Commits (git-workflow.md)

[3] git push                                  (whole project)
      └─ pre-push (Husky)
            └─ validate:full      → typecheck → lint → ls-lint → format:check → depcruise → knip
                                     → lint:setup → openapi:check → lint:branch → test + coverage gate

[4] CI (GitHub Actions, .github/workflows/ci.yml) — every push to main and every pull request
      ├─ job verify       → branch name + commitlint (PR) → typecheck → lint → ls-lint → format:check
      │                     → depcruise → knip → lint:setup → openapi:check → unit + e2e tests + coverage gate → build
      │                     → verify:scaffold
      └─ job integration  → bun run test:int (PostgreSQL 16 + Redis 7 service containers)
```

Local hooks can be skipped with `--no-verify`; CI runs everything again, branch name and commit messages included — every gate of `validate:full` as its own step, so a failure names its gate (`test/ci-gates.test.ts` fails when a gate added to `validate` has no CI step; `lint:branch` is the one replaced, by `validate-branch-name -t <head_ref>`, because a pull request is checked out detached). `bun test` (and so `test:cov`) runs every `*.test.ts` — unit tests in `src/` and `scripts/`, e2e and guard tests in `test/`; `test:unit` / `test:e2e` are only local shortcuts. `bun run test:int` is deliberately **not** in pre-push (it needs PostgreSQL + Redis): run it yourself before finishing a change to repositories or repository bases, transactions, migrations, auth, the partner gateway or the cache — the CI job `integration` runs it on every push. Run `bun run verify:scaffold` after changing a scaffold template, the scaffold CLI (`scripts/scaffold.ts`, `scripts/lib/scaffold.ts`) or a core API the templates use (errors, response, middlewares, dto, i18n, openapi, database, http).

Before a change is finished: `bun run validate:full` and `bun run build` (plus the two above when they apply) — the full definition of done is §4.

## 2. Gate rules

**Coverage gate** (`scripts/check-coverage.ts` — the single source of thresholds, `THRESHOLDS`):

- Counted over source files only (`*.test.ts` and `test/` are excluded): global lines & functions, per-file lines.
- Every file in `src/` must be loaded by at least one test — Bun instruments only imported files, so an untested file shows up as a violation instead of passing silently. Pure barrel re-exports are exempt automatically.
- Bun reports no branch coverage: give every logic branch (classification, status mapping, fallback) an explicit test.
- Exclusions only through `COVERAGE_EXCLUSIONS`, each with a reason and the plan step that removes it; the list is printed on every run.

Hermetic tests, `mock.module()` ban and the integration suite: [testing.md](testing.md).

**ESLint `eslint-disable`** must be narrow and justified: `// eslint-disable-next-line <rule> -- <reason>`. A directive without a reason, without a rule name, or no longer needed fails lint.

**Composing ESLint rules**: in flat config a later override **replaces** the whole `no-restricted-syntax` / `no-restricted-imports` array of an earlier one for files matched by both. Never redefine those rules ad hoc in an override — compose the group constants at the top of `eslint.config.mjs` (`MODULE_SYNTAX_RULES`, `CONTROLLER_SYNTAX_RULES`, …). A new group needs a row in the rule index (`ARCHITECTURE.md` §12) — `test/docs-sync.test.ts` fails otherwise.

**Prettier** formats `*.ts` only. Markdown is excluded (`.prettierignore`): see [documentation.md](documentation.md).

## 3. Commands

| Command | What it does | When |
|---|---|---|
| `bun run dev` | Development server with reload (`bun --watch src/index.ts`) | While developing |
| `bun run start` | Server without watch (`bun src/index.ts`) | Running a checkout as is |
| `bun run build` | Bundles `src/index.ts` into `dist/` (`--target bun`); run by CI | Before a release / to prove the bundle builds |
| `bun run typecheck` | TypeScript compiler (`tsc --noEmit`) | After changing types, DTOs, interfaces |
| `bun run lint` | ESLint 9 flat config (`strictTypeChecked` + project rules) | Before committing |
| `bun run lint:fix` | ESLint autofix | On fixable lint errors |
| `bun run lint:ls` | File & folder naming (ls-lint) | After adding files or folders |
| `bun run lint:arch` | Layer boundaries (dependency-cruiser) | After adding imports between layers |
| `bun run lint:deps` | Unused files, exports and dependencies (knip) | After removing / moving code or changing packages |
| `bun run lint:branch` | Branch name format | Before pushing |
| `bun run lint:setup` | Dry run of `scripts/setup.ts`: every `IDENTITY_RULES` and `EXAMPLE_MODULES` entry still matches its file (in a project after `bun run setup`, the examples are gone and only `IDENTITY_RULES` is checked — `--keep-examples`) | After changing a value that carries the project name, or an example module's files / registrations |
| `bun run format` / `bun run format:check` | Prettier writes / checks `src`, `test`, `scripts` (`*.ts`; Markdown never) | `format` before committing if needed; `format:check` is part of `validate` |
| `bun run scaffold <kind> <name> [options] [--dry-run]` | Generates a module (`module <plural> [--variant=standalone\|header-detail\|record]`; header-detail names its detail with `--detail=<plural>`, default `items`), a partner endpoint (`partner <plural>`), a vendor webhook receiver (`webhook <plural> --vendor=<vendor>`) or an outbound adapter (`integration <vendor>`) from the `scaffold-module` templates, registers it (`src/app.ts`, schema / config barrels, `APPEND_ONLY_TABLES`, `WEBHOOK_VENDORS`, `INTEGRATION_REGISTRY`), formats what it wrote and prints the next steps; refuses existing files and modules named after a vendor; `--singular=<name>` for irregular plurals, `--institution="…"` for the registry name; never runs migrations — [new-module.md](new-module.md) | Starting a module, endpoint, webhook receiver or vendor adapter |
| `bun run verify:scaffold` | Runs `bun run scaffold` for every template (standalone, header-detail — with the default detail and with a multi-word `--detail` —, record, partner, webhook, integration), then prettier --check, tsc, ESLint, ls-lint, depcruise, knip, the generated tests, real requests, and `bun run test:cov` with the generated modules in place (whole suite + coverage gate: every generated file reaches the per-file threshold); restores every file afterwards | After changing a core API the templates use, a template, or the scaffold CLI |
| `bun test` | Unit and e2e tests (hermetic: no real database / Redis) | After changing logic |
| `bun run test:unit` | Only the tests next to the code (`src/`), no coverage | Fast feedback while working on one area |
| `bun run test:e2e` | Only `test/` (e2e, architecture and docs guards) | After changing routes, structure or documents |
| `bun run test:cov` | Tests + coverage gate (`scripts/check-coverage.ts`) | To prove coverage |
| `bun run test:int [name] [--keep-db]` | Integration suite on real PostgreSQL + Redis (`test/integration/*.int.ts`): a disposable database `<name>_it_<run>`, real migrations, dropped afterwards; Redis keys under `<APP_NAME>:int-test:<run>` deleted one by one. Services from `TEST_DATABASE_URL` / `TEST_REDIS_*`, or `DATABASE_URL` / `REDIS_*` when they point at this machine **and** `NODE_ENV` is `development` / `test`; `--dry-run` prints the targets. Never run on a server (staging / production) — CI runs it | After changing repositories, transactions, migrations, auth, the partner gateway or the cache (also CI job `integration`) |
| `bun run validate` | Every static gate (typecheck → lint → ls-lint → format:check → depcruise → knip → lint:setup → lint:branch), no tests | Quick check without tests |
| **`bun run validate:full`** | **Every gate in order** (`validate` + `test:cov`; also the pre-push hook) | **Required before a pull request** |
| `bun run db:generate` / `bun run db:migrate` / `bun run db:studio` | drizzle-kit: generate a migration from the schema, apply migrations to `DATABASE_URL`, open Drizzle Studio | After changing the schema (`db:generate`); applying migrations to your own database (`db:migrate`) |
| `bun run setup <name> [--description "…"] [--keep-examples] [--dry-run]` | Initializes a fresh clone as a named project (identity, examples removed, migrations regenerated) — skill `init-project` | Once per new project |
| `bun run openapi:check` | Fails on any difference between the API of `createApp()` and the snapshot `docs/api/openapi.json`, each change labelled BREAKING / safe / docs ([openapi.md](openapi.md) §6) | Part of `validate`; after changing a route or a DTO |
| `bun run openapi:update [--allow-breaking]` | Writes the snapshot after you reviewed the changes; refuses BREAKING without the flag. Never run by a hook, CI or `scaffold` | After the review of an intended contract change |
| `bun run seed:admin --email <email> [--promote]` | Creates the first admin (password from a hidden prompt / stdin) | After the first migration; recovery of a locked-out admin |
| `bun run auth:purge-tokens [--days N]` | Deletes expired refresh tokens | Schedule daily |
| `bun run partner:sign --key <pk_…> --url <url> [--method POST --body '<json>'] [--send]` | Signs a partner request (signing v1) and prints headers + curl, or sends it; secret from a hidden prompt / stdin | Testing `/api/v1/partner/*` or helping a partner match a signature |
| `bun run docs:dev` | Syncs the documents into `docs-site/` and serves the portal at `http://localhost:4321` (first run: `bun install` inside `docs-site/`) | Previewing documentation as a web page |
| `bun run docs:build` | Syncs, builds the static portal (Astro Starlight + Pagefind) and fails on a broken internal link or anchor (`docs-site/check-links.ts`); deployed only by the manual workflow `deploy-docs.yml` | After adding or renaming a document; before publishing the portal |

## 4. Definition of done (every change)

A change is finished when every item that applies holds — for developers and agents alike (agents follow the skill `finish-change`, which routes here):

1. **Gates green**: `bun run validate:full` and `bun run build`; `bun run test:int` and `bun run verify:scaffold` when §1 requires them.
2. **Tests cover the new behaviour** — unit, plus e2e through `createApp()` when HTTP is involved. Every logic branch (classification, status mapping, fallback) has its own test: Bun's coverage counts lines, not branches.
3. **A new rule is enforced by a machine** (or marked `[review-only]` with the reason), has its row in `ARCHITECTURE.md` §12, and is proven by a chaos test: break it, see the gate fail, restore, `git status` clean.
4. **Docs in the same change**: the topic file in `docs/standards/` ([documentation.md](documentation.md)); routers only when their list of topics changes; `.env.example` for a new variable.
5. **New endpoint**: `describeEndpoint()` with the response schema in `<module>.dto.ts` ([openapi.md](openapi.md)).
6. **API contract changed** (route, DTO, status, security): `bun run openapi:check` lists exactly the intended changes; `bun run openapi:update` after the review, the snapshot committed with the change ([openapi.md](openapi.md) §6).
7. **New environment variable**: a Zod field in `src/config/` and `.env.example` ([configuration.md](configuration.md)).
8. **A value carrying the project name**: in `IDENTITY_RULES`; `bun run setup demo --dry-run` passes ([configuration.md](configuration.md)).
9. **Schema change**: migration generated (`bun run db:generate`); applying it is the developer's call ([database.md](database.md) §4).
10. **Commit**: one Conventional Commit with one valid scope ([git-workflow.md](git-workflow.md) §2); an agent leaves the change in the working tree with a suggested message and commits only when asked.

Report a finished change with what was actually run — never a gate that was skipped as if it had passed:

```text
Change     : <what, in one line>
Branch     : <type>/<slug>
Summary    : <2–4 sentences: what and why>
Files      : <main files>
Verification: validate:full ✅/❌ · build ✅/❌ · test:int ✅/❌/n.a. · verify:scaffold ✅/❌/n.a. · coverage lines <x>% / functions <y>%
Chaos tests: <each broken rule and the gate that caught it | none>
Not verified: <what could not be checked, and why | none>
Suggested commit: <type(scope): subject> (not committed)
```
