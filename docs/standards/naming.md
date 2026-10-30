# Naming

Read this file when: naming a file, a folder, a module, an identifier or a table. A file name is a **marker read by machines**: ESLint and dependency-cruiser pick their rules from the suffix (`*.controller.ts`, `*.repository.ts`, `*.webhook.routes.ts`), so a near miss (`payments.webhook-routes.ts`) would escape every architecture rule.

---

## 1. Files & folders

| Element | Format | Example |
|---|---|---|
| Folders and every dot segment of a file name | `kebab-case` | `user-profile.service.ts`, `auth/` |
| Module file | `<module>[-<qualifier>][.<channel>].<role>[.test].ts` | `payments.webhook.routes.ts`, `auth-users.repository.ts` |
| Dependent module (D33) | one subfolder of its parent, named after it — `<parent singular>-<name>`, as a header-detail table is `order_items`: `src/modules/<parent>/<child>/<child>.<role>[.test].ts` | `src/modules/projects/project-tasks/project-tasks.service.ts` |
| Integration file | `src/integrations/<vendor>/<vendor>.<role>[.test].ts` (`service`, `dto`, `webhook`, `webhook.dto`) or `index.ts` | `acme-pay.webhook.ts` |
| Unit test | next to the file: `<file>.test.ts` | `users.service.test.ts` |
| E2E / guard test | `test/<area>.e2e.test.ts` / `test/<name>.test.ts` | `test/users.e2e.test.ts` |
| Integration test | `test/integration/<area>.int.ts` (only there) | `test/integration/redis.int.ts` |

- `<module>` is the folder name; `<role>` ∈ `routes`, `controller`, `service`, `repository`, `queries`, `dto`, `transformer`, `messages`, `util` (a module-local helper). A qualifier names a second file of the same role (`auth-users.repository.ts`).
- The channel segment (`.webhook`, …) says which caller the file serves: [auth-and-inbound.md](auth-and-inbound.md) §1.
- No `integration-*` prefix for vendor files: the folder is the marker.
- A **dependent module** lives in a subfolder of its parent, one level only; its files are named after the subfolder, the subfolder holds a `DependentRepository` module, and a module name is used once across `src/modules/` (it also names a table and the flat routes `/<child>/:id`) — [new-module.md](new-module.md) §2.7.
- **Modules are named after their domain** (`messaging`, `payments`), never after a vendor; the vendor lives only in `src/integrations/<vendor>/`, so changing vendors means a new adapter, not a new module (D26).

Enforced by ls-lint (folders and single-dot names) and `test/structure.test.ts` (every file name per dot segment, both patterns, dependent subfolders, unique module names, no module named like a vendor, `*.int.ts` placement). ls-lint applies its `.ts` rules only to names whose whole extension is `.ts` — `users.controller.ts` has the extension `.controller.ts` — which is why the names are checked by the test.

## 2. Code

| Element | Format | Example |
|---|---|---|
| Class, interface, type | `PascalCase` | `UsersService`, `UserResponse` |
| Method, function | `camelCase` | `getUserById` |
| Variable, parameter, property, DTO field | `camelCase` | `userId`, `fullName` |
| Module constant, enum-like object | `UPPER_CASE` | `CACHE_PREFIX`, `USER_MESSAGES` |
| Decorator | `PascalCase` | `@Transactional()` |
| Table and column (SQL) | `snake_case` | `appTable('user_profiles', { fullName: varchar('full_name') })` |
| HTTP payloads and envelopes (wire) | `snake_case` | `status_code`, `full_name`, `per_page` |

snake_case is allowed **only** for SQL names in Drizzle schemas and on the wire (converted automatically, [http-contract.md](http-contract.md) §3). Every TypeScript identifier is camelCase / PascalCase / UPPER_CASE — ESLint `@typescript-eslint/naming-convention`.

## 3. Routes, tables, messages for a new module

- Module: `kebab-case` (`products`, `flight-schedules`); route `<API_BASE_PATH>/v1/<kebab-case-plural>`.
- Table: plural `snake_case` (`products`).
- Messages constant: singular `UPPER_SNAKE` + `_MESSAGES` (`PRODUCT_MESSAGES`).
- `bun run scaffold` derives every form from the plural name (singular by English suffix rules, `--singular` for irregular plurals): [new-module.md](new-module.md) §2.3.
