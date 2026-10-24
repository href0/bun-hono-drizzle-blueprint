# Configuration (Zero-Trust Environment)

Read this file when: adding, renaming or removing an environment variable, or reading configuration in code.

---

1. **`process.env` is banned** (ESLint `no-process-env`). In application code (`src/`) only `src/config/env-source.ts` reads it (it also sets `TZ=UTC` and guards against a missing env file). Outside the application: `drizzle.config.ts` (drizzle-kit runs on its own), `scripts/` (CLIs) and tests.
2. **Fail fast on startup**: each group (`src/config/<group>.config.ts`) is validated with Zod through `parseEnv()` when its module is imported. A missing or malformed variable stops the process with **every** invalid variable of the **first failing group** — name and rule, never the value (env files hold secrets). The next group is reported once this one is fixed.
3. **Import configuration from the barrel** `src/config`: `appConfig`, `databaseConfig`, `redisConfig`, `httpConfig`, `authConfig`, `partnerConfig`, and one config per vendor (`<vendor>Config`, e.g. the example `jsonPlaceholderConfig`).
4. **Adding a variable**: add it to the right group's schema (or a new `<group>.config.ts` with the pattern `build<Group>Config(source)` + instance, exported from `src/config/index.ts`), add a test in `src/config/config.test.ts`, and document it in `.env.example` under its group. `.env.example` is the registry of every variable (one section per group); the boilerplate's own variables and their history are also in the adoption plan's appendix L1.
5. **Renaming / removing a variable**: list the old name in `RENAMED_ENV_VARS` (`src/config/parse-env.ts`) with its replacement. The app refuses to start while the old name is still set (name only, never the value) — otherwise the old name would be ignored silently (e.g. CORS switched off without a word).
6. **Values that carry the project name** (package name, `APP_NAME`, database name, container names, README title) are registered in `IDENTITY_RULES` (`scripts/setup.ts`); `bun run setup <name>` rewrites them ([project-setup.md](project-setup.md)) and `bun run lint:setup` fails when a rule stops matching. Never hardcode the project name in rules, skills or docs — write "this project".

Agents never read active env files (`.env`, `.env.local`, …) — only `.env.example`: `.agents/AGENTS.md`.
