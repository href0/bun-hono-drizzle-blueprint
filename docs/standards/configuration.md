# Configuration (Zero-Trust Environment)

Read this file when: adding, renaming or removing an environment variable, or reading configuration in code.

---

1. **`process.env` is banned** (ESLint `no-process-env`). In application code (`src/`) only `src/config/env-source.ts` reads it (it also sets `TZ=UTC` and guards against a missing env file). Outside the application: `drizzle.config.ts` (drizzle-kit runs on its own), `scripts/` (CLIs) and tests.
2. **Fail fast on startup**: each group (`src/config/<group>.config.ts`) is validated with Zod through `parseEnv()` when its module is imported. A missing or malformed variable stops the process with **every** invalid variable of the **first failing group** — name and rule, never the value (env files hold secrets). The next group is reported once this one is fixed.
3. **Import configuration from the barrel** `src/config`: `appConfig`, `databaseConfig`, `redisConfig`, `httpConfig`, `authConfig`, one config per optional feature, and one config per vendor (`<vendor>Config`, e.g. the example `jsonPlaceholderConfig`).
4. **Adding a variable**: add it to the right group's schema (or a new `<group>.config.ts` with the pattern `build<Group>Config(source)` + instance, exported from `src/config/index.ts`), add a test in `src/config/config.test.ts`, and document it in `.env.example` under its group. `.env.example` is the registry of every variable (one section per group); renamed or removed names are in `RENAMED_ENV_VARS` (5.).
5. **Renaming / removing a variable**: list the old name in `RENAMED_ENV_VARS` (`src/config/parse-env.ts`) with its replacement. The app refuses to start while the old name is still set (name only, never the value) — otherwise the old name would be ignored silently (e.g. CORS switched off without a word).
6. **Values that carry the project name** (package name, `APP_NAME`, database name, container names, README title) are registered in `IDENTITY_RULES` (`scripts/setup.ts`); `bun run setup <name>` rewrites them ([project-setup.md](project-setup.md)) and `bun run lint:setup` fails when a rule stops matching. Never hardcode the project name in rules, skills or docs — write "this project".
7. **Secrets stored in the database**: one the server only compares (a password, an API key) is hashed; one it must read back in full (an HMAC secret it verifies signatures with, a vendor token it sends) is encrypted with `createSecretCipher()` (`src/utils/secret-cipher.util.ts`: AES-256-GCM, a fresh IV per value, the payload names its key). The feature that stores it owns its keyring in its config group — `<FEATURE>_SECRET_KEYS` (`<id>:<64 hex>`, comma-separated) and `<FEATURE>_SECRET_ACTIVE_KEY_ID`, validated at startup — never a global key every project must set. Rotation: add the new key, make it active, re-encrypt what `needsReEncryption()` reports, then drop the old key. The partner gateway is the built-in user (`PARTNER_SECRET_KEYS`). <!-- partner -->
<!-- no-partner: 7. **Secrets stored in the database**: one the server only compares (a password, an API key) is hashed; one it must read back in full (an HMAC secret it verifies signatures with, a vendor token it sends) is encrypted with `createSecretCipher()` (`src/utils/secret-cipher.util.ts`: AES-256-GCM, a fresh IV per value, the payload names its key). The feature that stores it owns its keyring in its config group — `<FEATURE>_SECRET_KEYS` (`<id>:<64 hex>`, comma-separated) and `<FEATURE>_SECRET_ACTIVE_KEY_ID`, validated at startup — never a global key every project must set. Rotation: add the new key, make it active, re-encrypt what `needsReEncryption()` reports, then drop the old key. -->

## Environments

Every local command names its environment (D62, R87). Each has its own file, created from `.env.example`:

| Environment | File | Started with | Who |
|---|---|---|---|
| dev | `.env.dev` (created by `bun run setup`) | `bun run start:dev` (restarts on change) | developers, AI agents |
| test | `.env.test` | `bun run start:test` | developers, AI agents |
| stg / demo / prod | `.env.stg` / `.env.demo` / `.env.prod` — only on the machine that serves it | `bun run start:stg` / `start:demo` / `start:prod` | developers only |

- **Any other command**: `bun run env <environment> <command> [args]` — e.g. `bun run env dev db:migrate`, `bun run env test test:int`, `bun run env stg seed:admin --email …`. It prints the target database (host and name, never credentials) before running.
- **Only the chosen file is loaded** (`bun --env-file`). Bun loads `.env`, `.env.local` and `.env.<NODE_ENV>` into every process by itself — a script's child process too — so the launcher and the app (at startup) refuse while one of them exists (`AUTO_LOADED_ENV_FILES`, `src/config/parse-env.ts`). `.env` is not used; `bun run setup` renames an old one to `.env.dev`.
- **`start:<environment>` runs the server directly** (`bun --env-file=.env.<environment> [--watch] src/index.ts`), never through the launcher: a process in between would let Ctrl+C return the prompt while the server is still shutting down and writing to the terminal.
- **`start:dev` / `start:test` pipe the server's output through `cat`, which ignores SIGINT** (`< /dev/null 2>&1 | (trap '' INT; exec cat)`). On a second Ctrl+C `bun run` returns at once while the server still shuts down, and a Bun process that exits restores the terminal settings it found at start through any terminal descriptor — the shell's line editor (e.g. ble.sh) is left broken. Without a terminal descriptor the server cannot touch them, and `cat` stays until the last log line. Logs keep their colours (`colorize: true`). `start:stg` / `demo` / `prod` stay unpiped: a process manager restarts on the server's own exit code, which a pipe would hide. A POSIX shell is needed (Linux, macOS, WSL).
- **No silent default**: the app refuses to start and `drizzle-kit migrate` / `studio` refuse to run without `DATABASE_URL`; `db:generate` stays offline.
- **Containers and servers** receive their variables from the platform and run `bun run start` / `bun run db:migrate` directly ([deployment.md](../deployment.md)). The local compose files take theirs from `.env.dev` (`docker-compose.dev.yml`) and `.env.demo` (`docker-compose.yml`, profile `full`); pass the same file to compose for its own `${…}` values: `docker compose --env-file .env.dev up -d`.
- **Unit and e2e tests** (`bun test`) never need a file: the hermetic preload sets every service address ([testing.md](testing.md)).

Agents never read active env files (`.env`, `.env.local`, `.env.dev`, …) — only `.env.example` — and use the dev and test environments only: `.agents/AGENTS.md`, enforced by the hook (R70).
