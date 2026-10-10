---
name: init-project
description: Initialize a fresh clone of this boilerplate as a named project (package name, APP_NAME, database name, container names, README title, .env). Use when the user runs `init-project <project-name>` or asks to set up / rename a new project from this boilerplate.
---

# Init Project

Turns a fresh clone of this boilerplate into a named project with one command. The mechanical work is done by `scripts/setup.ts` (`bun run setup`); this skill validates input, previews, confirms, runs it, and verifies the result.

Input: `<project-name>` and an optional one-line description.

---

## Steps

### 1. Resolve the Project Name

- Required format: kebab-case — lowercase letters and digits, single hyphens, starts with a letter (e.g. `pengangkut-udara-backend`).
- If the user gave no name, ask for it.
- If the user gave a non-kebab name (e.g. `Pengangkut Udara Backend`), propose the kebab-case form and ask for confirmation. Never guess silently.
- If the user did not give a description, ask once (optional; skip if they decline).

### 2. Check Current State

- Read `package.json` `name`. If it is no longer the boilerplate's default (`bun-hono-starter`), the project was already initialized — tell the user and ask whether to rename again.
- Run `git status --short`. If there are uncommitted changes, tell the user before continuing (the script edits tracked files).

### 3. Preview (Dry Run)

```bash
bun run setup <project-name> --description "<description>" --dry-run
```

Show the user the derived identity and the files that will change:

| Identity | Value |
|---|---|
| Package / `APP_NAME` / container prefix | `<project-name>` |
| Database | `<project_name>_db` |
| README title | `<Project Name>` |

Also tell the user what happens to the **example module** (`src/modules/orders`: header + detail, with `order_items`): by default it is removed — files, registrations, its e2e test — and the migrations in `drizzle/` are regenerated from scratch (a new project has no database yet, so its history starts with one clean `0000`). Ask whether they want to keep it as a reference; if yes, add `--keep-examples` (the migrations then stay as they are).

Ask for confirmation before continuing.

If the dry run reports `example modules out of sync`, STOP: `EXAMPLE_MODULES` in `scripts/setup.ts` no longer matches the codebase (same handling as below), or run with `--keep-examples`.

If the dry run reports `identity rules out of sync`, STOP: `IDENTITY_RULES` in `scripts/setup.ts` no longer matches the codebase. Report the failing rules to the user; fixing them is a boilerplate maintenance task, not part of init.

### 4. Apply

```bash
bun run setup <project-name> --description "<description>"   # add --keep-examples to keep src/modules/orders
```

The script also creates `.env` from `.env.example` when missing. Do NOT read or edit `.env` yourself (`env-protection` skill). If the script says an existing `.env` was kept, tell the user to review `POSTGRES_DB` / `DATABASE_URL` in it manually.

### 5. Non-Mechanical Follow-Up

- If a description was given, rewrite the intro paragraph directly under the README title so it describes the new project. Leave the rest of the README intact.

### 6. Verify

1. No leftover boilerplate identity (expect no output):
   ```bash
   git grep -nE "bun-hono-starter|starter_db" -- ':!ARCHITECTURE_BLUEPRINT_FROM_NESTJS.md'
   ```
   A hit means a hardcoded identity that is missing from `IDENTITY_RULES` — fix the file now and tell the user so the rule can be added to the boilerplate.
2. `bun install` (sync lockfile / install dependencies if `node_modules` is missing).
3. `bun run typecheck && bun run lint && bun run test`.
4. Without `--keep-examples`: `src/modules/orders` is gone and `drizzle/` holds a single `0000_*.sql` (users + record_changes).

### 7. Git History (Optional — Ask, Never Assume)

Offer the choices and act only on an explicit answer:

| Option | Commands | When |
|---|---|---|
| Keep history, track boilerplate upstream (recommended) | `git remote rename origin boilerplate` then the user adds their own `origin` | Wants to pull future boilerplate improvements |
| Fresh history | delete `.git`, then `git init` and initial commit | Wants a clean repository |
| Leave as is | — | Will handle git manually |

Deleting `.git` is irreversible: confirm explicitly right before running it.

### 8. Report

Summarize the changed files, the verification result, and the next steps printed by the script (`docker compose up -d` → `bun run db:migrate` → `bun run dev`).
