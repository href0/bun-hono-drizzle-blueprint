# Project Setup (`bun run setup`)

Read this file when: starting a new project from this boilerplate, or changing what `bun run setup` renames or removes.

---

## 1. What it does

A fresh clone carries the boilerplate's identity (`bun-hono-drizzle-blueprint`) and its example modules. `bun run setup` turns it into **your** project, once, before the first migration:

| Mode | Command | Does |
|---|---|---|
| Env only | `bun run setup` without a terminal, or in CI | Creates the local env file from `.env.example` and fills the secrets the app refuses to start without (`JWT_SECRET`; `PARTNER_SECRET_KEYS`, `PARTNER_SECRET_ACTIVE_KEY_ID` only while `.env.example` declares them, i.e. with the partner gateway). An existing env file keeps every value; nothing is printed |
| Wizard | `bun run setup` in a terminal | Asks the questions of §3, shows the plan, asks before changing anything, then runs the full setup |
| Flags | `bun run setup <name> [--title "…"] [--description "…"] [--keep-examples] [--no-partner] [--dry-run]` | The full setup without questions — what the wizard prints at the end, what an AI agent runs (skill `init-project`) |

The full setup:

1. **Renames the identity** (registry `IDENTITY_RULES` in `scripts/setup.ts`):

   | Where | Becomes (`order-service`) |
   |---|---|
   | `package.json`, `bun.lock` | package name `order-service` (+ the description) |
   | `.env.example`, `src/config/app.config.ts` | `APP_NAME=order-service`; database `order_service_db` in `DATABASE_URL` / `POSTGRES_DB` |
   | `docker-compose.yml`, `docker-compose.dev.yml` | container prefix and database fallbacks |
   | `README.md`, docs portal (`docs-site/`) | the title: `--title`, or derived from the name (`Order Service`) |

2. **Removes the examples** (registry `EXAMPLE_MODULES`; kept with `--keep-examples`):

   | Example | What goes |
   |---|---|
   | Header + detail | `src/modules/orders` (with `order_items`) |
   | Dependent modules | `src/modules/projects` and its `project-tasks/` (1:N), `project-budgets/` (1:1) |
   | Vendor webhook | `src/integrations/demo-pay` + `src/modules/payment-notifications`, `DEMO_PAY_*` |
   | Outbound adapter | `src/integrations/jsonplaceholder` + `src/modules/user-posts` (`/users/:id/external-posts`), `JSONPLACEHOLDER_*` |

   Each with its schema, tests, registrations (`src/app.ts`, barrels, registry) and lines in the standards. Then the migrations are **regenerated from scratch** (one clean `0000`: a new project has no database yet) and the API contract baseline (`docs/api/`) is rewritten without the examples. What stays is the platform: `users`, `auth`, `health`, the audit trail, the webhook inbox — and the partner gateway (`partner-credentials`, `partner-gateway` ping / echo) unless step 3 removes it.

3. **Keeps or removes the partner gateway** (§4): kept, only its markers are dropped; `--no-partner` removes it (then the migrations and the contract baseline are regenerated as in step 2).

4. **Records the origin** in `package.json` → `boilerplate`: the boilerplate version, the commit it was cloned at (when the clone has git history) and `partner: true | false`. It marks the project as initialized and is what a future `partner:enable` needs (§4.3).

5. **Prepares the env file** as in "Env only"; an existing one gets the new `APP_NAME` only — check `DATABASE_URL` / `POSTGRES_DB` in it yourself.

6. From then on `bun run lint:setup` checks the identity only: the examples you kept and the gateway you kept are your code, change them freely.

Always look first: `--dry-run` (or the wizard's plan) prints every file it would change and every example it would remove, and changes nothing.

## 2. Options

| Option | Meaning |
|---|---|
| `<name>` | kebab-case (`order-service`): package, `APP_NAME`, container prefix; the database is `<snake_case>_db` |
| `--title "<title>"` | README heading and portal title, when the derived one is wrong (`api-gateway` → `Api Gateway`, but you want `API Gateway`). At most 80 characters; no quotes, backslashes, `$` or line breaks |
| `--description "<text>"` | One line for `package.json` |
| `--keep-examples` | Keep the example modules as a reference (the migrations then stay as they are) |
| `--no-partner` | Remove the partner gateway (§4) — for a project that never accepts calls from partner systems |
| `--dry-run` | Print the plan, change nothing |

Both value forms work: `--title "API Gateway"` and `--title="API Gateway"`. An unknown option or a second name is refused with the usage.

## 3. The wizard

`bun run setup` in a terminal, without a name:

| Question | Answer |
|---|---|
| Project name | kebab-case, checked as you type (`Order Service` is refused with the reason) |
| Title | pre-filled with the derived title: Enter keeps it, or edit it |
| Description | one line, or Enter to skip |
| Keep the example modules … as a reference? | default No |
| Accept calls from partner systems (partner gateway …)? | default **Yes**; No shows what would be removed (a note) and asks *Remove the partner gateway from this project?* (default No — a No keeps the gateway) |
| Apply these changes? | after the plan; default No |

```text
◇  Project name (kebab-case: package, APP_NAME, database <name>_db)
│  order-service
◇  Title (README heading, docs portal)
│  Order Service API
◇  Description (one line for package.json; Enter to skip)
│
◇  Keep the example modules (orders, projects, demo-pay, user-posts) as a reference?
│  No
◇  Accept calls from partner systems (partner gateway: signed API keys, partner-credentials)?
│  Yes
│
◇  Plan — nothing is changed yet ──────────────────────────────────╮
│  name=order-service db=order_service_db title="Order Service API" │
│  Would update package.json → package name                         │
│  …                                                                │
│  Would regenerate database migrations from scratch (drizzle/)     │
├───────────────────────────────────────────────────────────────────╯
◇  Apply these changes?
│  Yes
◇  Project initialization completed successfully
◇  Changes ─╮  Update package.json → package name …
◇  Next steps ─╮  1. Make sure PostgreSQL and Redis are running …
◇  Same result without the wizard ─╮  bun run setup order-service --title="Order Service API"
└  Project initialization completed successfully
```

While it applies the changes the spinner stands still: setup runs its tools (drizzle-kit, the contract baseline, Prettier) one after the other, synchronously. Without a terminal the output is the plain `[Setup] …` lines, as before.

- **Keys**: Enter accepts a pre-filled answer; grey `e.g. …` text is only an example, never the answer.
- **Cancel**: answer No to *Apply these changes?*, or press Ctrl+C / Esc at any question — nothing is changed (`cancelled: nothing was written`, exit 1).
- `bun run setup --dry-run` in a terminal asks the questions and prints the plan only.
- **Without a terminal** nothing is ever asked (no name = env only). The one exception is `SETUP_WIZARD_STDIN=1`, set only by `bun run acceptance`, which answers the real wizard through a pipe ([manual-acceptance.md](manual-acceptance.md)); never set it by hand.

The wizard and the flags are one code path: the answers become the same arguments, parsed like a typed command (`scripts/lib/setup-wizard.ts`; R61).

## 4. Partner gateway (`--no-partner`, D39)

The partner gateway lets other systems call the API server-to-server with signed requests (signing v1). A project that never accepts partners can start without it.

### 4.1 What `--no-partner` removes

| What | Where |
|---|---|
| Code and tests only the gateway needs | `PARTNER_ONLY` in `scripts/lib/partner-prune.ts`: the `partner-credentials` and `partner-gateway` modules, `partnerAuth()` / `requirePartner()`, the partner config, schema, signing util, their tests, `scripts/partner-sign.ts`, the partner guide, the `partner.md` scaffold template |
| Partner lines of shared files | every marked region (§4.2): `src/app.ts`, error codes, OpenAPI, ESLint channels, scaffold kind `partner`, CI, portal, standards, … |
| Scripts | `partner:sign`, `scaffold:partner` |
| Settings | `PARTNER_*` in `.env.example` (and no generated keyring) |

Then the migrations start again from one `0000` without `partner_credentials`, and the contract baseline is rewritten. `bun run scaffold partner …` answers `unknown kind`. Without `--no-partner` nothing of this changes; only the marker lines are dropped.

### 4.2 Markers (boilerplate maintenance)

Partner lines in shared files are marked; setup drops the marker lines (gateway kept) or the regions (gateway removed). Whole lines, one region per place, never nested:

| File | Region | Line |
|---|---|---|
| TypeScript / JavaScript | `// partner:start` … `// partner:end` | — |
| `.env.example`, YAML | `# partner:start` … `# partner:end` | — |
| Markdown | `<!-- partner:start -->` … `<!-- partner:end -->` | a line ending with the line marker `<!-- partner -->` is kept only with the gateway (works in code fences and table rows); a whole line `<!-- no-partner: <text> -->` becomes `<text>` without it (e.g. a rule row that must keep its ID) |

MDX has no HTML comments: write `.mdx` without partner-only sentences. Code around a region must stay valid without it (split a condition, an import list, an array); setup formats the changed TypeScript with Prettier. `bun run lint:setup` checks in the boilerplate that every marker is balanced, every `PARTNER_ONLY` path exists, and that the pruned `src/`, `test/` and `.env.example` would not mention a partner any more — a new partner line outside a region fails it (R82).

### 4.3 Switching the gateway on later

Not a command yet (backlog: `bun run partner:enable`). By hand, from the boilerplate at the commit in `package.json` → `boilerplate.commit` (the remote `upstream`, [git-workflow.md](git-workflow.md) §1.2); a copy set up without git records no commit — then use the release tag `v<boilerplate.version>`:

1. Copy back the `PARTNER_ONLY` paths.
2. Bring back each marked region of the shared files (`git grep -n "partner:start\|<!-- partner -->" <commit>` in the boilerplate lists them) — merge by hand where your code changed around them.
3. Restore the `package.json` scripts `partner:sign` / `scaffold:partner` and the `PARTNER_*` settings; generate a keyring (`.env.example` explains how).
4. `bun run db:generate` (a migration that adds `partner_credentials`), `bun run openapi:update`, then `bun run validate:full`.

## 5. After setup

1. PostgreSQL and Redis running (native, or `docker compose up -d`).
2. `bun run db:migrate`, then `bun run seed:admin --email <email>` (the password is asked, masked).
3. `bun run dev`.
4. A fresh git history is optional: delete `.git`, `git init -b main`, then `bun run prepare` — **required**, it installs the Husky hooks (setup warns while they are missing). Or keep the history with the boilerplate as the remote `upstream` to take its updates later ([git-workflow.md](git-workflow.md) §1.2).
5. Your own decisions go into [`docs/decisions.md`](../decisions.md) §4 as `PD1`, `PD2`, … — `D0`… stay the boilerplate's, so its later decisions arrive without colliding; larger work follows a plan in `docs/plans/` ([README](../plans/README.md)).

## 6. Changing what setup touches (boilerplate maintenance)

- A new file or setting that carries the project name → a rule in `IDENTITY_RULES`.
- A new example → an entry in `EXAMPLE_MODULES`: its paths and every registration line, exactly as written.
- A new partner line in a shared file → a marked region (§4.2); a new partner-only file → `PARTNER_ONLY`.
- `bun run lint:setup` (part of `validate`) fails when a rule or an example line no longer matches its file, before anything is written; `bun run acceptance` proves a real setup in a fresh clone, through the wizard, with `--keep-examples` and with `--no-partner` ([configuration.md](configuration.md), item 6; R61).
