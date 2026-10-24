# Project Setup (`bun run setup`)

Read this file when: starting a new project from this boilerplate, or changing what `bun run setup` renames or removes.

---

## 1. What it does

A fresh clone carries the boilerplate's identity (`bun-hono-drizzle-blueprint`) and its example modules. `bun run setup` turns it into **your** project, once, before the first migration:

| Mode | Command | Does |
|---|---|---|
| Env only | `bun run setup` without a terminal, or in CI | Creates the local env file from `.env.example` and fills the secrets the app refuses to start without (`JWT_SECRET`, `PARTNER_SECRET_KEYS`, `PARTNER_SECRET_ACTIVE_KEY_ID`). An existing env file keeps every value; nothing is printed |
| Wizard | `bun run setup` in a terminal | Asks the questions of §3, shows the plan, asks before changing anything, then runs the full setup |
| Flags | `bun run setup <name> [--title "…"] [--description "…"] [--keep-examples] [--dry-run]` | The full setup without questions — what the wizard prints at the end, what an AI agent runs (skill `init-project`) |

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

   Each with its schema, tests, registrations (`src/app.ts`, barrels, registry) and lines in the standards. Then the migrations are **regenerated from scratch** (one clean `0000`: a new project has no database yet) and the API contract baseline (`docs/api/`) is rewritten without the examples. What stays is the platform: `users`, `auth`, `health`, `partner-credentials`, `partner-gateway` (ping / echo), the audit trail, the webhook inbox.

3. **Prepares the env file** as in "Env only"; an existing one gets the new `APP_NAME` only — check `DATABASE_URL` / `POSTGRES_DB` in it yourself.

4. From then on `bun run lint:setup` checks the identity only: the examples you kept are your code, change them freely.

Always look first: `--dry-run` (or the wizard's plan) prints every file it would change and every example it would remove, and changes nothing.

## 2. Options

| Option | Meaning |
|---|---|
| `<name>` | kebab-case (`order-service`): package, `APP_NAME`, container prefix; the database is `<snake_case>_db` |
| `--title "<title>"` | README heading and portal title, when the derived one is wrong (`api-gateway` → `Api Gateway`, but you want `API Gateway`). At most 80 characters; no quotes, backslashes, `$` or line breaks |
| `--description "<text>"` | One line for `package.json` |
| `--keep-examples` | Keep the example modules as a reference (the migrations then stay as they are) |
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

[Setup] Plan (nothing is changed yet):
[Setup] name=order-service db=order_service_db title="Order Service API"
[Setup] Would update package.json → package name
…
[Setup] Would remove example: jsonplaceholder + user-posts (outbound adapter example)
[Setup] Would regenerate database migrations from scratch (drizzle/)
◇  Apply these changes?
│  Yes

[Setup] Starting project initialization...
…
[Setup] Project initialization completed successfully

Same result without the wizard:
  bun run setup order-service --title="Order Service API"
```

- **Keys**: Enter accepts a pre-filled answer; grey `e.g. …` text is only an example, never the answer.
- **Cancel**: answer No to *Apply these changes?*, or press Ctrl+C / Esc at any question — nothing is changed (`cancelled: nothing was written`, exit 1).
- `bun run setup --dry-run` in a terminal asks the questions and prints the plan only.
- **Without a terminal** nothing is ever asked (no name = env only). The one exception is `SETUP_WIZARD_STDIN=1`, set only by `bun run acceptance`, which answers the real wizard through a pipe ([manual-acceptance.md](manual-acceptance.md)); never set it by hand.

The wizard and the flags are one code path: the answers become the same arguments, parsed like a typed command (`scripts/lib/setup-wizard.ts`; R61).

## 4. After setup

1. PostgreSQL and Redis running (native, or `docker compose up -d`).
2. `bun run db:migrate`, then `bun run seed:admin --email <email>` (the password is asked, hidden).
3. `bun run dev`.
4. A fresh git history is optional: delete `.git`, `git init -b main`, then `bun run prepare` — **required**, it installs the Husky hooks (setup warns while they are missing). Or keep the history with the boilerplate as the remote `upstream` to take its updates later ([git-workflow.md](git-workflow.md) §1.2).

## 5. Changing what setup touches (boilerplate maintenance)

- A new file or setting that carries the project name → a rule in `IDENTITY_RULES`.
- A new example → an entry in `EXAMPLE_MODULES`: its paths and every registration line, exactly as written.
- `bun run lint:setup` (part of `validate`) fails when a rule or an example line no longer matches its file, before anything is written; `bun run acceptance` proves a real setup in a fresh clone, through the wizard and with `--keep-examples` ([configuration.md](configuration.md), item 6; R61).
