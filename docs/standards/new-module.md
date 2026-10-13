# Adding a Module or a Vendor Adapter

Read this file when: creating a module, a resource, a CRUD endpoint, a partner endpoint, a webhook receiver or an outbound vendor adapter. The code templates live in the skill `scaffold-module` (`.agents/skills/scaffold-module/`) — the only copy of template code. **`bun run scaffold` generates from them** (plan D31), for developers and agents alike; `bun run verify:scaffold` runs that CLI for every template in CI, so neither can fall behind the core APIs.

---

## 1. Pick the variant

| What you are adding | Command | Template | Repository base | Working example |
|---|---|---|---|---|
| Standalone table (stands on its own) | `module <plural>` | `.agents/skills/scaffold-module/SKILL.md` | `BaseRepository` | `src/modules/users` |
| Header with details (an order and its items, a class and its members) | `module <plural> --variant=header-detail [--detail=<plural>]` | `.agents/skills/scaffold-module/references/header-detail.md` | `BaseRepository` + `ChildRepository` | `src/modules/orders` (removed by `bun run setup` unless `--keep-examples`) |
| Record (append-only log / history) | `module <plural> --variant=record` | `.agents/skills/scaffold-module/references/record.md` | `AppendOnlyRepository` | `record_changes` |
| Reference data owned by another system | — (by hand: a `.existing()` view, [database.md](database.md) §2) | — | `ReadOnlyRepository` | — |
| Partner endpoint (signed requests) | `partner <plural>` | `.agents/skills/scaffold-module/references/partner.md` | `BaseRepository` (unique `partner_code` + `partner_reference`) | `src/modules/partner-gateway` |
| Vendor webhook (the vendor's contract) | `webhook <plural> --vendor=<vendor>` | `.agents/skills/scaffold-module/references/webhook.md` | `AppendOnlyRepository` (`webhook_events`) | `src/modules/payment-notifications` + `src/integrations/demo-pay` (removed by `bun run setup` unless `--keep-examples`) |
| Outbound vendor adapter (not a module) | `integration <vendor>` | `.agents/skills/scaffold-module/references/integration.md` | — (`HttpClientService` + `AccessTokenCache`) | `src/integrations/jsonplaceholder` |

Table kinds and what each base does: [database.md](database.md) §6.

## 2. Generating with `bun run scaffold`

### 2.1 Commands

```bash
bun run scaffold module products --dry-run                 # print the plan, write nothing
bun run scaffold module products                           # standalone table  → /api/v1/products
bun run scaffold module orders --variant=header-detail     # orders + order_items  → /api/v1/orders/:id/items
bun run scaffold module classes --variant=header-detail --detail=members        # classes + class_members → /classes/:id/members
bun run scaffold module invoices --variant=header-detail --detail=line-items    # invoices + invoice_line_items
bun run scaffold module audit-events --variant=record      # append-only records
bun run scaffold partner submissions                       # → /api/v1/partner/submissions (signed requests)
bun run scaffold webhook payment-receipts --vendor=acme-pay   # → POST /api/webhooks/acme-pay
bun run scaffold integration acme-pay                      # outbound adapter for a login-based vendor
bun run scaffold module people --singular=person           # irregular plural
bun run scaffold integration acme-pay --institution="Acme Payments"   # registry display name
```

| Option | For | Meaning |
|---|---|---|
| `--variant=standalone\|header-detail\|record` | `module` | Table kind (default `standalone`) |
| `--vendor=<vendor>` | `webhook` (required) | The vendor whose verifier is generated (`src/integrations/<vendor>/`) |
| `--singular=<name>` | `module`, `partner`, `webhook` | The singular, when the derived one is wrong (§2.3) |
| `--detail=<plural>` | `module --variant=header-detail` | The detail's name (default `items`): the table is `<header singular>_<detail>`, the routes `/:id/<detail>` (§2.3) |
| `--detail-singular=<name>` | with `--detail` | The detail's singular, when the derived one is wrong (`--detail=people --detail-singular=person`) |
| `--institution="<name>"` | `webhook`, `integration` | `error.institution` in the registry (default: the vendor name in title case, `acme-pay` → `Acme Pay`) |
| `--dry-run` | all | Print what would be created and edited, and the next steps; write nothing |

Always run `--dry-run` first: it shows the singular the CLI derived and every file it would touch.

### 2.2 What a run does

```text
$ bun run scaffold module products --dry-run
[dry run] Scaffolding standalone module products (singular product) from .agents/skills/scaffold-module/SKILL.md
  create src/database/schema/domain/products.schema.ts
  create src/modules/products/products.dto.ts
  create src/modules/products/products.messages.ts
  create src/modules/products/products.repository.ts
  create src/modules/products/products.transformer.ts
  create src/modules/products/products.service.ts
  create src/modules/products/products.controller.ts
  create src/modules/products/products.routes.ts
  create src/modules/products/products.repository.test.ts
  create src/modules/products/products.service.test.ts
  create src/modules/products/products.transformer.test.ts
  create src/modules/products/products.controller.test.ts
  edit   src/database/schema/domain/index.ts — export ./products.schema
  edit   src/app.ts — register productsRouter on /products
  edit   docs/standards/structure.md — list src/modules/products/ in the canonical tree

Next steps (after a real run — nothing was written):
  1. Adjust the domain fields in the schema, DTOs, messages (Indonesian nouns) and tests of src/modules/products/.
  2. Generate the migration: bun run db:generate (applying it is the developer's call).
  3. bun run validate:full
```

Without `--dry-run` the same plan is applied **all-or-nothing**: every file and every registration is computed first; if anything is wrong (a file exists, a registration anchor is missing, the name breaks a convention) the CLI stops before writing a single file. Then it writes, formats the `.ts` files it created or changed with Prettier, and prints the next steps. It never runs migrations.

What each kind registers in shared files:

| Kind | Shared files edited |
|---|---|
| `module` | schema barrel, `src/app.ts` (import + `v1.route('/<name>', …)`), `structure.md` tree; `record` also `APPEND_ONLY_TABLES` |
| `partner` | schema barrel, `src/app.ts` (`v1.route('/partner/<name>', …)`), `structure.md` tree |
| `webhook` | `src/app.ts` (imports, `WEBHOOK_VENDORS`, `app.route(…/webhooks/<vendor>, …)`), config barrel, `INTEGRATION_REGISTRY`, `structure.md` tree |
| `integration` | `INTEGRATION_REGISTRY`, config barrel |

In `src/app.ts` the lines go directly above the permanent markers `// scaffold:imports`, `// scaffold:webhook-routes` and `// scaffold:v1-routes` — keep them. `.env.example` is never edited: the next steps list the variables to add.

### 2.3 Names: what you type and what you get

Names are kebab-case. Modules are **plural** and named after their **domain** (`payments`, not the vendor `acme-pay`); vendors and adapters are named after the vendor (singular). The templates need both the plural and the singular form of a module name:

| You type | Singular | Folder / route / table | Generated identifiers |
|---|---|---|---|
| `products` | `product` | `src/modules/products/`, `/api/v1/products`, `products` | `productsRouter`, `Product`, `createProductSchema`, `PRODUCT_MESSAGES` |
| `flight-schedules` | `flight-schedule` | `src/modules/flight-schedules/`, `/api/v1/flight-schedules`, `flight_schedules` | `flightSchedulesRouter`, `FlightSchedule`, `FLIGHT_SCHEDULE_MESSAGES` |
| `people --singular=person` | `person` | `src/modules/people/`, `/api/v1/people`, `people` | `peopleRouter`, `Person`, `PERSON_MESSAGES` |

A header-detail module also names its detail — `items` unless `--detail` says otherwise. The detail table is always prefixed with the header's singular, so it stays next to its header and never collides with another module's table; the routes stay short:

| You type | Detail table | Routes | Generated identifiers |
|---|---|---|---|
| `module orders --variant=header-detail` | `order_items` (FK `order_id`) | `/orders/:id/items[/:childId]` | `OrderItem`, `OrderItemsRepository`, `addItem`, `syncItems`, `ITEM_CREATED` |
| `module classes --variant=header-detail --detail=members` | `class_members` (FK `class_id`) | `/classes/:id/members[/:childId]` | `ClassMember`, `ClassMembersRepository`, `addMember`, `syncMembers`, `MEMBER_CREATED` |
| `module invoices --variant=header-detail --detail=line-items` | `invoice_line_items` (FK `invoice_id`) | `/invoices/:id/line-items[/:childId]` | `InvoiceLineItem`, `addLineItem`, `syncLineItems`; sync body `{ "line_items": [...] }` |
| `module teams --variant=header-detail --detail=people --detail-singular=person` | `team_people` | `/teams/:id/people[/:childId]` | `TeamPerson`, `addPerson`, `syncPeople` |

The detail name follows the same rules as a module name (plural kebab-case, singular derived by the suffix rules below); the `--dry-run` line shows both: `header-detail module classes (singular class; detail members (singular member), table class_members)`.

The CLI has **no English dictionary**: it derives the singular from the ending of the last word, first matching rule wins:

| Last word ends in | Rule | Examples |
|---|---|---|
| consonant + `ies` | `ies` → `y` | `categories` → `category`, `order-categories` → `order-category` |
| `sses`, `xes`, `zes`, `ches`, `shes`, `uses` | drop `es` | `addresses` → `address`, `boxes` → `box`, `batches` → `batch`, `statuses` → `status` |
| `ss`, `us`, `is` | **refused** — looks singular | `status`, `bus`, `glass`, `analysis` |
| `s` | drop `s` | `products` → `product`, `days` → `day`, `order-items` → `order-item` |
| anything else | **refused** — does not look plural | `product`, `people`, `data` |

A refusal writes nothing and tells you what to run instead (§2.4). A **wrong guess** is not an error, so check the singular in the `--dry-run` line and pass `--singular` when it is wrong:

| Name | Derived | Fix |
|---|---|---|
| `news` | `new` ✗ | `bun run scaffold module news --singular=news-item` |
| `series` | `sery` ✗ | `bun run scaffold module series --singular=series-item` |
| `analyses` | `analyse` ✗ | `bun run scaffold module analyses --singular=analysis` |
| `people` | refused | `bun run scaffold module people --singular=person` |
| `data` | refused | a plural noun instead: `bun run scaffold module data-records` |

### 2.4 When the CLI refuses

Every refusal exits with code 1 and writes nothing.

| You ran | It answers | Do this |
|---|---|---|
| `module product` | `"product" does not look plural (it does not end in -s). … Did you mean "products"?  →  bun run scaffold module products` | Run the suggested command (kind and options are kept: `--variant`, `--vendor`) |
| `partner status` | `"status" looks singular (it ends in -us). … Did you mean "statuses"?  →  bun run scaffold partner statuses` | Same |
| `module product --singular=product` | `the singular must differ from the name ("product") … did you mean "products"?` | Use the plural name; the singular is the other form |
| `module Products` | `name must be kebab-case (…), got "Products"` | Lowercase, single hyphens: `products`, `order-items` |
| `module users` | `refusing to scaffold: - src/modules/users/users.dto.ts already exists …` | Pick another name — the CLI never overwrites |
| `module orders --variant=header-detail` (orders exists) | `src/modules/orders/ already exists: the CLI does not add details to an existing module …` | Add the details by hand or with an AI agent (§2.6) |
| `integration users` | `"users" is a module: a vendor adapter cannot share its name (plan D26)` | Name the adapter after the vendor |
| `webhook acme-pays --vendor=acme-pays` | `the module is named after its domain, never after the vendor (plan D26)` | `webhook payment-receipts --vendor=acme-pays` |
| `webhook payments` | `webhook needs --vendor=<vendor>` | Add `--vendor=<vendor>` |
| `module classes --variant=header-detail --detail=member` | `"member" does not look plural … →  bun run scaffold module classes --variant=header-detail --detail=members` | Run the suggested command |
| `module classes --detail=members` | `--detail is only for "module … --variant=header-detail"` | Add `--variant=header-detail` (details only exist under a header) |
| `module products --variant=webhook` | `--variant is standalone \| header-detail \| record and only for "module"` | Use the `webhook` / `partner` kinds instead |
| any, after `src/app.ts` was hand-edited | `registration anchor not found: // scaffold:v1-routes` | Put the marker line back (see §2.2) |

### 2.5 After generating

The generated code compiles, passes lint, is registered, and comes with its tests — repository (SQL recorder), service (every branch, with a fake repository), transformer and controller (through its routes, service spied) — so `bun run validate:full` passes right away, coverage gate included (`bun run verify:scaffold` proves it for every variant). It is a working but generic resource. Your work is the domain:

1. Follow the printed next steps: domain fields (schema, DTOs, response schema), messages (replace the placeholder Indonesian nouns), business rules in the service, and the generated tests updated for them (they assert the example fields `name` / `code` / `kind`); `bun run db:generate`; for partners `allowed_routes`; for vendors the env variables, the real signature scheme and payloads.
2. `bun run validate:full` (and `bun run test:int` when the module has its own queries, locks, unique indexes or Redis behaviour — [testing.md](testing.md) §7).

To undo a run before committing: delete the files it created and restore the edited shared files (`git checkout -- <file>` when they had no other changes) — `git status` lists both.

### 2.6 Details: decide when the module is created

Whether a resource owns rows of its own (an order and its items, an invoice and its lines) is a decision about its tables, so it is made **when the module is created**: `bun run scaffold module <plural> --variant=header-detail` generates the header and its details together. The CLI never adds details to an existing module — it only creates new files and adds lines at the registration points, and adding a detail means changing code that already has its own rules (service logic, transactions, cache, tests). `module <name> --variant=header-detail` on an existing module is refused and points here.

To add details to an existing standalone module, do it **by hand or with an AI agent** (skill `scaffold-module`), with `.agents/skills/scaffold-module/references/header-detail.md` as the reference:

1. Schema: add the detail table next to the header (`parentReference()` to the header's id + an index starting with it — the schema conventions require it); the header itself stays as it is (a standalone table already has the header shape: soft delete, audit columns).
2. Repository: a `ChildRepository` class for the details next to the header's `BaseRepository` class.
3. DTOs (create / update / sync schemas, item response schema), messages, transformer functions for items.
4. Service: the item methods (list, add, update, delete, sync — all through the header id), merged with the rules the header already has.
5. Controller handlers and routes under `/:id/<details>` (`describeEndpoint()` + `validate()` with `uuidParamSchema` / `uuidChildParamSchema`).
6. Tests for every new branch (the header-detail template's tests are the pattern), `bun run db:generate`, `bun run validate:full` and `bun run test:int` when the detail adds its own queries or locks.

Keep the detail in the header's module (same folder): a detail is never a module of its own.

## 3. Order of work (every variant)

`bun run scaffold` performs steps 1–12 with the template code (files, registrations, formatting); what stays is adjusting the domain — fields, rules, messages, tests — following the standards linked below. Without the CLI, follow the same order by hand:

1. **Names**: module, route prefix, table, messages constant — [naming.md](naming.md) §3.
2. **Schema** `src/database/schema/domain/<name>.schema.ts` with `appTable(...)` + column helpers; re-export it from `schema/domain/index.ts` — [database.md](database.md) §2–3.
3. **Migration**: `bun run db:generate` (applying it is the developer's call — [database.md](database.md) §4).
4. **DTO** `<name>.dto.ts`: request schemas **and** the response schema (`<name>ResponseSchema`, typing the transformer); time fields from `datetime.dto.ts` — [http-contract.md](http-contract.md) §2, [datetime.md](datetime.md), [openapi.md](openapi.md) §3.
5. **Messages** `<name>.messages.ts` (`{ id, en }`) — [http-contract.md](http-contract.md) §6.
6. **Repository** extending the base for the table kind — [database.md](database.md) §6.
7. **Transformer** typed by the response schema — [http-contract.md](http-contract.md) §1.
8. **Service** (`@Transactional()` on multi-step writes; `null` → `NotFoundError`, unique violation → `ConflictError`) — [transactions.md](transactions.md), [http-contract.md](http-contract.md) §5.
9. **Controller** returning `ApiResponse` — [http-contract.md](http-contract.md) §1.
10. **Routes**: `describeEndpoint()` → (`requireRole()`) → `validate()` → handler; protected by default — [openapi.md](openapi.md), [auth-and-inbound.md](auth-and-inbound.md).
11. **Register** in `src/app.ts`: `v1.route('/<name>', router)` (partner / webhook routers: [auth-and-inbound.md](auth-and-inbound.md)).
12. **Tests**: co-located repository (SQL recorder), service, transformer, controller tests + `test/<name>.e2e.test.ts` through `authorize(createApp())`; `test/integration/<name>.int.ts` when the module has its own queries, locks, unique indexes or Redis behaviour — [testing.md](testing.md).
13. **Gates**: `bun run validate:full` — [quality-gates.md](quality-gates.md).

The templates are formatted for a short name; `bun run scaffold` formats what it writes — after your own edits (or a copy by hand), run `bun run format` before validating.
