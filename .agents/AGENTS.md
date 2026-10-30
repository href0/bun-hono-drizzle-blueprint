# Agent Rules

What only AI agents need. The coding standards themselves are **not** here: each lives in one file under `docs/standards/` — the same files developers read, so a standard changed there reaches both. Never restate a standard in a rule or a skill; link it (`docs/standards/documentation.md`).

---

## MANDATORY: Read the standards before writing code

Before writing or modifying any code, generating files, or making architectural decisions, load the `project-standards` skill (`.agents/skills/project-standards/SKILL.md`). It routes you to the `docs/standards/` files for what you are touching; the rules and their enforcers are indexed in `ARCHITECTURE.md` §12 (`R01`…).

This applies to modules, services, controllers, DTOs, schemas, transformers, middlewares, utilities, scripts and tests. It does not apply to commit messages, logbooks, version bumps, or questions that involve no code.

Before reporting a change as finished, follow the `finish-change` skill: the gates it needs, the definition of done and the report format (`docs/standards/quality-gates.md` §4). Prove new rules with a chaos test (break the rule, see the gate fail, restore).

---

## Work Plans

Larger work follows a plan in `docs/plans/`. While one is active, execute exactly one step at a time, meet its definition of done, report with its review template, then STOP for review. Record progress, findings and any deviation in its log and progress table. When a plan is finished, its decisions go into `docs/decisions.md` (one row each — an ID such as `D13` in a comment points there; a project's own are `PD1`…) and the plan is deleted. Structure and skeleton of a plan: `docs/plans/README.md`.

**Never commit or merge until the user explicitly asks.** The user reviews every change first: finish a step with the changes left in the working tree plus a suggested commit message (skill `generate-commit-text`). Creating a branch is fine; committing and merging are not.

---

## Databases

Database commands are run by the developer. An agent may run migrations and read-only checks only against the developer's **local** database, and only with explicit permission; destructive SQL or writing test rows is always asked first; never a shared or production database (`docs/standards/database.md` §4).

---

## Commands

`bun run help` lists every command (`*` = run by the developer, never by an agent); `bun run <command> --help` prints its usage and runs nothing. Without a terminal no script asks anything: give every answer as a flag, never drive a wizard (`docs/standards/quality-gates.md` §2).

---

## MANDATORY: Environment File Protection Policy

This section is the single source of the policy (the `env-protection` skill points here). It is also enforced mechanically for Claude Code by `.claude/settings.json` (`permissions.deny`) and `.claude/hooks/protect-env.mjs`.

You are strictly PROHIBITED from reading, searching, or exposing any active or sensitive environment file (`.env`, `.env.local`, `.env.development`, `.env.dev`, `.env.test`, `.env.ci`, `.env.stg`, `.env.production`, `.env.prod`, …) — they hold credentials, API keys and secrets.

**Whitelist**: only `.env.example` may be read. Every other environment file MUST be rejected.

1. **Check the file name before reading.** Before any tool that reads file content (file viewers, search, shell `cat` / `type`, …) touches a file whose name starts with or contains `.env`, verify it is on the whitelist. Repository-wide searches use `git grep` (tracked files only) — a recursive search over `.` would read the ignored local env file.
2. **On a violation**: ABORT before invoking any tool; NEVER generate a tool call that would trigger a permission prompt for a protected file; inform the user in natural language:
   > "Error: Access to the requested environment file is blocked by the repository's Environment File Protection Policy (`env-protection` skill). Only whitelisted environment templates (e.g., `.env.example`) can be read."
3. **Questions about configuration** are answered from `.env.example` only (keys, structure, defaults) — never actual values.
