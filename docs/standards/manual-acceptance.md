# Acceptance Run (`bun run acceptance`)

Read this file when: preparing a release of this boilerplate, or checking that a change to setup, scaffolding, migrations or the deployment path still works for a new developer.

---

## 1. What it proves

The gates check the code; `verify:scaffold` generates every variant inside this repository and removes them again; `test:int` runs the data layer against real services. None of them follows **a new developer from nothing**: a fresh clone, `bun run setup`, the wizard, a database, a running server, and modules generated one after another and called over HTTP. `bun run acceptance` does exactly that, with one command and **without anyone typing**: it answers the wizard itself, by watching its questions and pressing the keys a person would.

When: before every release (`git-workflow.md` §1.1), and after a change to `scripts/setup.ts`, the scaffold CLI or wizard, migrations, the `Dockerfile` or the bootstrap. It is not part of CI: it takes minutes, and the gates above already run on every push.

## 2. How to run it

```bash
bun run acceptance                         # menu: choose the combinations, see the plan, confirm
bun run acceptance --combo 1,2             # no menu (an AI agent, automation); a = all
bun run acceptance --combo 1 --plan        # only the steps and the estimate
bun run acceptance --clean                 # remove work folders and databases of earlier runs
```

Options: `--ref <commit|tag>` (what is tested; default `HEAD`), `--no-db` (skip stage C), `--keep` (keep the work folder even when everything passed).

| Combination | `bun run setup` | Tests |
|---|---|---|
| 1 | `setup acceptance-demo` | a new project: examples removed, migrations regenerated |
| 2 | `setup acceptance-demo --keep-examples` | the generators next to the examples; an example route still answers |

- **What it tests**: the commit `--ref` (default the last commit), cloned into a work folder `_acceptance/acceptance-<date>-<time>/` **next to** this repository — never the working tree; it says so when there are uncommitted changes.
- **While it runs**: one line per step; on a terminal a spinner and a timer that keeps counting, then `✓ 1m52s` / `✗` / `-` (skipped, with the reason). In a pipe or a log file: one line per finished step plus a heartbeat every minute. At the end, a table: one row per combination, one column per stage.
- **Output**: every command writes to the step's log (`combo-<n>/logs/<nn>-<stage>.log`), never to the screen. A failing step shows the expected and the actual result, the last 30 lines of its log and the log's path; the remaining steps of that combination are shown as skipped, and the next combination still runs.
- **The wizard**: started with `SCAFFOLD_WIZARD_STDIN=1`, the one switch that lets a program answer it through a pipe (`scripts/scaffold.ts`); the runner waits for each question, moves to the option by its label, types, presses Enter, answers No, presses Ctrl+C.
- **Services (stage C)**: PostgreSQL and Redis from `TEST_DATABASE_URL` / `TEST_REDIS_*`, or the local development settings on a developer machine only — the same rules as `bun run test:int` ([testing.md](testing.md), `scripts/lib/test-services.ts`). Not reachable (or `--no-db`) → stage C is skipped with the reason. Each combination gets its own database `<name>_acceptance_c<n>` (marked by a comment) and Redis prefix.
- **Cleanup**: the server, the database and the Redis keys of a combination go when it ends — also after a failure and on Ctrl+C; the Docker images right after they are built. The work folder is removed when everything passed and kept otherwise (`--keep` always). A new run removes what earlier runs left (only folders and databases this runner names and marks).
- **AI agents** run it with `--combo` (no menu without a terminal). It creates and drops its own databases on the local PostgreSQL: ask the developer first, as for any database command ([database.md](database.md) §4).

**What you see** (a terminal; the running line counts up in place, then turns into the result):

```text
Combination 1 — new project: setup removes the examples (default)
  [ 1/24] A  Clone the commit under test into the work folder .......... ✓ 2s
  [ 2/24] A  bun install ............................................... ✓ 5s
  [ 3/24] A  bun run setup (the combination) ........................... ✓ 2s
  [ 4/24] A  Gates of the new project: validate:full + build ........... ⠹ 31s running
```

```text
Combination                                                 Stage A  Stage B  Stage C  Stage D  Total
----------------------------------------------------------  -------  -------  -------  -------  -----
1 — new project: setup removes the examples (default)       ✓ 54s    ✓ 1m02s  ✓ 4s     ✓ 19s    2m19s
2 — setup --keep-examples: generators next to the examples  ✓ 56s    ✓ 1m06s  ✓ 4s     ✓ 19s    2m24s

All passed. Work folder removed.
```

A failing step instead (its combination stops; the next one still runs; the work folder is kept):

```text
  [16/24] B  Gates with every generated module: validate:full + build ... ✗ 46s
    expected: `bun run validate:full` succeeds
    actual:   exit 1 (the log lines below)
    │ [Setup] Error: example modules out of sync with the codebase:
    │ …
    full log: …\_acceptance\acceptance-20261024-0857\combo-2\logs\16-B.log
  [17/24] C  Database: create, db:migrate, seed:admin .................. -  (an earlier step failed)
```

The estimates in the menu and `--plan` are rough: a run takes a few minutes per combination, depending on the machine.

## 3. Steps

The runner's steps, in order, per combination (`scripts/lib/acceptance.ts`; `test/docs-sync.test.ts` fails when this list and the runner differ):

**A — a new project**

1. **Clone the commit under test into the work folder** — on the branch `test/acceptance`, a name the project's own gates accept.
2. **bun install**
3. **bun run setup (the combination)** — the examples removed (1) or kept (2).
4. **Gates of the new project: validate:full + build**

**B — generators**

5. **Wizard (bun run scaffold): standalone module products** — the menu, typed name, Enter on the suggested singular, Yes.
6. **Flags: header-detail module invoices --detail=lines**
7. **Flags: record module audit-entries**
8. **Wizard (bun run scaffold:module): dependent 1:N product-reviews** — the parent picked from the list.
9. **Flags: dependent 1:1 product-specs (--one)**
10. **Flags: partner endpoint shipments**
11. **Wizard (bun run scaffold:webhook): refund-notifications from globex** — then the vendor's secret is set, as its next steps ask.
12. **Flags (bun run scaffold:integration): outbound adapter acme-mail** — then its variables are set.
13. **Wizard: answering No, then Ctrl+C, writes nothing**
14. **Refusals: a taken name, a dependent parent, --dry-run, no terminal** — each fails with its message and changes no file.
15. **db:generate, then the API contract: check fails, update, check passes**
16. **Gates with every generated module: validate:full + build**

**C — database and server** (skipped without PostgreSQL / Redis, or with `--no-db`)

17. **Database: create, db:migrate, seed:admin**
18. **Server: health, login, refresh, users, partner ping** — refresh with the cookie; `/users` with and without a token; combination 2 also an example route; a partner credential, a signed and an unsigned ping.
19. **HTTP: products, invoices with lines, audit entries** — success, a validation error (400), no token (401).
20. **HTTP: a review and a spec under the product**
21. **HTTP: signed partner shipments, signed globex webhook** — 201, the same reference 409, unsigned 401; the signed event 2xx, again `duplicate: true`, a forged signature 401.
22. **Stop the server, drop the database and the Redis keys**

**D — images** (skipped when Docker is not running; the running container is proven by the CI job `docker`, R79)

23. **Docker: the production image**
24. **Docker: the tools image**

## 4. When a step fails

Read the expected / actual result and the log tail on the screen; the full log is in the kept work folder (`combo-<n>/logs/`), and the project itself in `combo-<n>/project/` — open it, run its commands by hand. A failure caused by the boilerplate is fixed in the boilerplate (commit, then run again) — never by editing the work folder. `bun run acceptance --clean` removes the kept folders and any database a killed run left.
