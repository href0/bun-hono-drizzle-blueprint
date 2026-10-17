# Git Workflow & Commits

Read this file when: creating a branch, writing a commit message, or preparing a pull request. Agents generate messages with the skill `generate-commit-text` (it follows this file).

---

## 1. Branches

- `<type>/<slug>` with `<type>` ∈ `feat`, `fix`, `hotfix`, `chore`, `docs`, `test`, `refactor`, `ci`, `perf` (e.g. `feat/login-api`), or an environment branch: `main`, `master`, `development`, `staging`, `prod`, `boilerplate`.
- Enforced by `.validate-branch-namerc.json` — `bun run lint:branch` (pre-push) and the CI job `verify`.
- This boilerplate repository uses `main` + one branch per step (plan D0); derived projects may use `development → staging → prod` (skill `update-version`).

## 2. Commit messages (Conventional Commits)

```
<type>(<scope>): <subject>

<body: what and why, lines ≤ 100 characters>
```

| Type | For |
|---|---|
| `feat` | A new capability |
| `fix` | A bug fix |
| `refactor` | Code change without behaviour change |
| `perf` | Performance |
| `test` | Tests only |
| `docs` | Documentation only |
| `chore` | Configuration, tooling, dependencies |
| `build` | Build system / container image |
| `ci` | CI pipeline |
| `revert` | Reverting an earlier commit |

The allowed types are exactly `type-enum` in `commitlint.config.ts` — there is **no** `style` (formatting-only changes are `chore`).

- **Subject**: lowercase imperative ("add", "fix", not "added"), no trailing period, aim for ≤ 72 characters (the hard header limit is 100).
- **Body**: blank line after the subject; bullet points saying what changed and why; every line ≤ 100 characters (`body-max-line-length`).
- Concise English by default (Indonesian when the user asks).
- Enforced by the `commit-msg` hook and, for pull requests, the CI job `verify`.

**Scopes** — exactly one per commit, required. `commitlint.config.ts` builds the allowed list when you commit: the fixed scopes below plus every folder of the source tree, so a new module or vendor is a valid scope the moment it exists (and a removed one stops being valid):

| Area | Scopes |
|---|---|
| From the source tree | `<module>` (every folder of `src/modules/`, dependent modules included: `users`, `project-tasks`), `core/<area>` (`core/cache`), `database/<folder>` (`database/schema`), `integrations/<vendor>`, `utils/<name>` (from `<name>.util.ts`) |
| Application & layers | `app`, `config`, `core`, `database`, `database/migrations`, `utils`, `integrations` |
| Inbound channels | `partner` (gateway, signing), `partner-auth`, `webhooks`, `conventions` (channel and naming conventions) |
| Quality gates & tooling | `quality-gates`, `deps`, `lint`, `scripts`, `ci`, `docker`, `scaffold` (templates, `verify:scaffold`), `setup` (`bun run setup`), `integration` (`test:int`) |
| Reviews, docs, agents | `review` (fixes from a review), `standards`, `architecture`, `agents`, `skills`, `plans`, `readme`, `release` |

A commit spanning several areas takes the scope of its main purpose (`feat(database): …` for a new repository base with its templates and docs). Enforced by the `commit-msg` hook and the CI job `verify`; the fixed scopes in this table and `PLATFORM_SCOPES` in `commitlint.config.ts` are kept equal by `test/commit-scopes.test.ts`.

Examples: `feat(users): add user registration endpoint with password hashing` · `fix(core/cache): resolve fail-open bypass on redis timeout` · `docs(standards): move coding standards into docs/standards`.

## 3. Before opening a pull request

`bun run validate:full` and `bun run build`, plus `bun run test:int` / `bun run verify:scaffold` when [quality-gates.md](quality-gates.md) §1 says so.
