# Adding a Module or a Vendor Adapter

Read this file when: creating a module, a resource, a CRUD endpoint, a partner endpoint, a webhook receiver or an outbound vendor adapter. The code templates live in the skill `scaffold-module` (`.agents/skills/scaffold-module/`) — the only copy of template code, verified by `bun run verify:scaffold` in CI, so it cannot fall behind the core APIs. Agents run that skill; developers copy from the same files.

---

## 1. Pick the variant

| What you are adding | Template | Repository base | Working example |
|---|---|---|---|
| Standalone table (stands on its own) | `.agents/skills/scaffold-module/SKILL.md` | `BaseRepository` | `src/modules/users` |
| Header with details (an order and its items) | `.agents/skills/scaffold-module/references/header-detail.md` | `BaseRepository` + `ChildRepository` | `src/modules/orders` (removed by `bun run setup` unless `--keep-examples`) |
| Record (append-only log / history) | `.agents/skills/scaffold-module/references/record.md` | `AppendOnlyRepository` | `record_changes` |
| Reference data owned by another system | no module template — a `.existing()` view ([database.md](database.md) §2) | `ReadOnlyRepository` | — |
| Partner endpoint (signed requests) | `.agents/skills/scaffold-module/references/partner.md` | `BaseRepository` (unique `partner_code` + `partner_reference`) | `src/modules/partner-gateway` |
| Vendor webhook (the vendor's contract) | `.agents/skills/scaffold-module/references/webhook.md` | `AppendOnlyRepository` (`webhook_events`) | `src/modules/payment-notifications` + `src/integrations/demo-pay` (removed by `bun run setup` unless `--keep-examples`) |
| Outbound vendor adapter (not a module) | `.agents/skills/scaffold-module/references/integration.md` | — (`HttpClientService` + `AccessTokenCache`) | `src/integrations/jsonplaceholder` |

Table kinds and what each base does: [database.md](database.md) §6.

## 2. Order of work (every variant)

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

Generated modules are formatted for a short name; line wrapping changes with the name length, so run `bun run format` before validating.
