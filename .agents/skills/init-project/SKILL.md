---
name: init-project
description: Initialize a fresh clone of this boilerplate as a named project (package name, APP_NAME, database name, container names, README title, .env). Use when the user runs /init-project <project-name> or asks to set up / rename a new project from this boilerplate.
---

# Init Project

Turns a fresh clone of this boilerplate into a named project with one command (what it renames and removes: `docs/standards/project-setup.md`). The mechanical work is done by `scripts/setup.ts` (`bun run setup`); this skill validates input, previews, confirms, runs it, and verifies the result.

Input: `<project-name>` and an optional one-line description.

---

## Steps

### 1. Resolve the Project Name

- Required format: kebab-case — lowercase letters and digits, single hyphens, starts with a letter (e.g. `pengangkut-udara-backend`).
- If the user gave no name, ask for it.
- If the user gave a non-kebab name (e.g. `Pengangkut Udara Backend`), propose the kebab-case form and ask for confirmation. Never guess silently.
- Ask for the **title** (README heading, docs portal) once, proposing the Title Case of the name (`api-gateway` → `Api Gateway`): if the user wants another (`API Gateway`), pass `--title "<title>"`. No quotes, backslashes, `$` or line breaks.
- If the user did not give a description, ask once (optional; skip if they decline).
- Always pass the arguments: `bun run setup` without a name is a wizard for people at a terminal and never opens without one — never set `SETUP_WIZARD_STDIN` (only `bun run acceptance` uses it).

### 2. Check Current State

- Read `package.json` `name`. If it is no longer the boilerplate's default (`bun-hono-drizzle-blueprint`), the project was already initialized — tell the user and ask whether to rename again.
- Run `git status --short`. If there are uncommitted changes, tell the user before continuing (the script edits tracked files).

### 3. Preview (Dry Run)

```bash
bun run setup <project-name> --title "<title>" --description "<description>" --dry-run
```

Show the user the derived identity and the files that will change:

| Identity | Value |
|---|---|
| Package / `APP_NAME` / container prefix | `<project-name>` |
| Database | `<project_name>_db` |
| README / portal title | `--title`, or `<Project Name>` derived from the name |

Also tell the user what happens to the **example modules** — `src/modules/orders` (header + detail, with `order_items`), `src/modules/projects` (a parent with its dependents `project-tasks/` 1:N and `project-budgets/` 1:1) the vendor webhook example `src/integrations/demo-pay` + `src/modules/payment-notifications` (with its `DEMO_PAY_*` settings) and the outbound example `src/integrations/jsonplaceholder` + `src/modules/user-posts` (`/users/:id/external-posts`, `JSONPLACEHOLDER_*`): by default they are removed — files, registrations, their tests — and the migrations in `drizzle/` are regenerated from scratch (a new project has no database yet, so its history starts with one clean `0000`). Ask whether they want to keep it as a reference; if yes, add `--keep-examples` (the migrations then stay as they are). Either way `lint:setup` afterwards checks the project identity only: the examples are the project's own code from then on.

Then ask about the **partner gateway** (`src/modules/partner-credentials`, `src/modules/partner-gateway`, `partnerAuth()`, `PARTNER_*` settings): will other systems call this API server-to-server with signed requests? Default keep it. If the user says no, add `--no-partner`: it removes the gateway's files and marked regions, `partner:sign` / `scaffold:partner`, and regenerates the migrations and contract baseline; switching it on later is manual (`docs/standards/project-setup.md` §4.3). Never choose `--no-partner` on your own.

Ask for confirmation before continuing.

If the dry run reports `partner gateway markers are out of sync`, STOP: a partner line is outside a marked region or a `PARTNER_ONLY` path is missing — a boilerplate maintenance task, report it.

If the dry run reports `example modules out of sync`, STOP: `EXAMPLE_MODULES` in `scripts/setup.ts` no longer matches the codebase (same handling as below), or run with `--keep-examples`.

If the dry run reports `identity rules out of sync`, STOP: `IDENTITY_RULES` in `scripts/setup.ts` no longer matches the codebase. Report the failing rules to the user; fixing them is a boilerplate maintenance task, not part of init.

### 4. Apply

```bash
bun run setup <project-name> --title "<title>" --description "<description>"   # add --keep-examples to keep the example modules, --no-partner to remove the partner gateway
```

The script also creates `.env` from `.env.example` when missing. Do NOT read or edit `.env` yourself (`env-protection` skill). If the script says an existing `.env` was kept, tell the user to review `POSTGRES_DB` / `DATABASE_URL` in it manually.

### 5. Non-Mechanical Follow-Up

- If a description was given, rewrite the intro paragraph directly under the README title so it describes the new project. Leave the rest of the README intact.

### 6. Verify

1. No leftover boilerplate identity (expect no output):
   ```bash
   git grep -nE "bun-hono-drizzle-blueprint|bun_hono_drizzle_blueprint_db" -- ':!.agents/skills/init-project/' ':!docs/plans/' ':!docs/archive/'
   ```
   (This skill names the defaults on purpose; `docs/plans/` and `docs/archive/` hold the boilerplate's plans and decision history, which quote them as history.)
   A hit means a hardcoded identity that is missing from `IDENTITY_RULES` — fix the file now and tell the user so the rule can be added to the boilerplate.
2. `bun install` (sync lockfile / install dependencies if `node_modules` is missing).
3. `bun run typecheck && bun run lint && bun run test`.
4. Without `--keep-examples`: `src/modules/orders`, `src/modules/projects`, `src/modules/payment-notifications`, `src/modules/user-posts`, `src/integrations/demo-pay` and `src/integrations/jsonplaceholder` are gone, `WEBHOOK_VENDORS` and `INTEGRATION_REGISTRY` are empty, and `drizzle/` holds a single `0000_*.sql` (the platform tables: users, auth_refresh_tokens, record_changes, partner_credentials, webhook_events). `src/modules/partner-gateway` stays (partners test their signing with its ping/echo) — with `--no-partner` it is gone too, with `partner_credentials`, and `git grep -il partner -- src test .env.example docs/api` prints nothing.

### 7. Git History (Optional — Ask, Never Assume)

Offer the choices and act only on an explicit answer:

| Option | Commands | When |
|---|---|---|
| Keep history, track boilerplate upstream (recommended) | `git remote rename origin upstream` then the user adds their own `origin` | Wants to take future boilerplate improvements (`docs/standards/git-workflow.md` §1.2) |
| Fresh history | the steps below | Wants a clean repository |
| Leave as is | — | Will handle git manually |

**Fresh history**, in this order:

1. Confirm explicitly **right before** deleting: "This deletes `.git` — all boilerplate history and remotes. Continue?" Deleting `.git` is irreversible; proceed only on a clear yes.
2. Delete `.git`, then `git init -b main`.
3. `bun run prepare` — **mandatory**: Husky stores its hooks path (`core.hooksPath`) in `.git/config`, so a fresh `git init` has no hooks and commits would silently skip lint, typecheck and commitlint. `bun run setup` prints a warning whenever the hooks are not installed.
4. The first commit only with the user's approval — the pre-commit and commit-msg hooks run on it: `git add -A` then a message such as `chore(setup): initialize <project-name> from the boilerplate` (one scope, `docs/standards/git-workflow.md` §2).

### 8. Report

Summarize the changed files, the verification result, and the next steps printed by the script (`docker compose up -d` → `bun run db:migrate` → `bun run seed:admin --email <email>` → `bun run dev`).
