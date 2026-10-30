# Git Workflow & Commits

Read this file when: creating a branch, writing a commit message, or preparing a pull request. Agents generate the texts with the skills `generate-commit-text` and `generate-pr-text` (both follow this file).

---

## 1. Branches

- `<type>/<slug>` with `<type>` ∈ `feat`, `fix`, `hotfix`, `chore`, `docs`, `test`, `refactor`, `ci`, `perf` (e.g. `feat/login-api`), or an environment branch: `main`, `master`, `development`, `staging`, `prod`, `boilerplate`.
- Enforced by `.validate-branch-namerc.json` — `bun run lint:branch` (pre-push) and the CI job `verify`.
- This boilerplate repository uses `main` + one branch per step (D0); derived projects may use `development → staging → prod` (skill `update-version`).

### 1.1 Releasing this boilerplate

1. Branch `chore/release-vX.Y.Z` from `main`. Version: **MAJOR** when a derived project must change its own code to take the release (a repository base, an envelope, an environment variable renamed or removed), **MINOR** for a new capability, **PATCH** for a fix.
2. The skill `update-version` sets `package.json` from the branch name and writes the `CHANGELOG.md` entry — what changed **for a derived project**, per area, with the steps a MAJOR release needs.
3. `bun run acceptance --combo a` on the release commit ([manual-acceptance.md](manual-acceptance.md)), then pull request → CI green → merge into `main` (§3.3).
4. Tag only the merge commit on `main`, after CI on `main` is green: `git tag -a vX.Y.Z -m "vX.Y.Z"`, then `git push origin vX.Y.Z`. A tag is never moved; a fix is the next PATCH.

### 1.2 Taking boilerplate updates in a derived project

A derived project keeps the boilerplate as the remote `upstream` (skill `init-project`, step 7). A full `git merge upstream/main` conflicts by design: `bun run setup` regenerated the migrations and removed the example modules. Instead:

1. `git fetch upstream --tags`, then read `CHANGELOG.md` of the new tag (`git show vX.Y.Z:CHANGELOG.md`).
2. Port each change you want on a branch of your own: `git cherry-pick <commit>` for platform changes (`src/core`, `src/database` bases, `scripts/`, `docs/standards/`), resolving conflicts in files you changed; never take the example modules or `drizzle/` of the boilerplate — generate your own migration (`bun run db:generate`) when a platform table changed.
3. Run the gates (`bun run validate:full`, `bun run build`, `bun run test:int`) before merging.

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
| Inbound channels | `webhooks`, `conventions` (channel and naming conventions) |
| Partner gateway | `partner` (gateway, signing), `partner-auth` | <!-- partner -->
| Quality gates & tooling | `quality-gates`, `deps`, `lint`, `scripts`, `ci`, `docker`, `scaffold` (templates, `verify:scaffold`), `setup` (`bun run setup`), `integration` (`test:int`) |
| Reviews, docs, agents | `review` (fixes from a review), `standards`, `architecture`, `agents`, `skills`, `plans`, `readme`, `release` |

A commit spanning several areas takes the scope of its main purpose (`feat(database): …` for a new repository base with its templates and docs). Enforced by the `commit-msg` hook and the CI job `verify`; the fixed scopes in this table and `PLATFORM_SCOPES` in `commitlint.config.ts` are kept equal by `test/commit-scopes.test.ts`.

Examples: `feat(users): add user registration endpoint with password hashing` · `fix(core/cache): resolve fail-open bypass on redis timeout` · `docs(standards): move coding standards into docs/standards`.

## 3. Pull requests

### 3.1 Before opening one

`bun run validate:full` and `bun run build`, plus `bun run test:int` / `bun run verify:scaffold` / `bun run acceptance --combo a` when [quality-gates.md](quality-gates.md) §1 says so.

### 3.2 Title and description

- **Title**: the header of the change's main commit, `<type>(<scope>): <subject>` (§2) — one type, one scope, imperative, ≤ 72 characters. With several commits, the one that names the purpose of the whole branch.
- **Description**: the sections of `.github/pull_request_template.md`, in English:
  - **What and why** — two to four sentences on the problem and the outcome, then one bullet per change a reviewer should know (behaviour, contract, rules, docs). Say "No API contract change" when `openapi:check` is unchanged; otherwise list the contract changes and whether any is `BREAKING`.
  - **Checklist** — tick only what was actually run on this branch, with its result (tests, coverage); an item that does not apply says so. Chaos tests for a new rule: the rule that was broken and the gate that caught it.
  - **Not verified** — what could not be checked and why, or "None".
- Agents produce both with the skill `generate-pr-text` and never open, approve or merge a pull request themselves.

### 3.3 Merging into `main` (this boilerplate)

`main` is protected by a repository ruleset: a pull request is required, the CI checks `verify`, `integration`, `docker` and `docs` must pass on an up-to-date branch, the history stays linear, force pushes and deletion are blocked. Merge with **Rebase and merge** — each commit lands on `main` as reviewed, with a new hash — then update the local branch with `git pull --ff-only` and delete the merged branch (`git branch -d`, and on GitHub). A derived project sets up its own protection.
