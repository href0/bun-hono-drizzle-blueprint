---
name: finish-change
description: Check a change against the definition of done before reporting it finished — the gates it needs (validate:full, build, test:int, verify:scaffold), docs and rules in the same change, then the report and a suggested commit. Use when a change, step or fix is done and about to be reported, or when asked whether a change is ready.
---

# Finish a Change (router)

Use this before saying a change is done. The definition of done and the report format have one source: `docs/standards/quality-gates.md` §4 — read it now. This skill only orders the work; it never restates the rules.

## Steps

1. **List what changed**: `git status --short` and `git diff --stat` (staged and unstaged). Note every area touched: repositories / transactions / migrations / auth / partner / cache, scaffold templates or the CLI, core APIs, docs, rules.
2. **Pick the gates** from `docs/standards/quality-gates.md` §1 for those areas: always `bun run validate:full` and `bun run build`; `bun run test:int` and `bun run verify:scaffold` only when §1 says so. Run them; on a failure, fix and run again — never report a red gate as done.
3. **Walk the definition of done** (`quality-gates.md` §4) item by item against the diff. A new rule needs its enforcer, its row in `ARCHITECTURE.md` §12 and a chaos test (break it, see the gate fail, restore, `git status` clean).
4. **Docs in the same change**: the topic file in `docs/standards/` (`docs/standards/documentation.md`); the work plan's log and progress table when the change is a plan step (`.agents/AGENTS.md`).
5. **Report** with the template in `quality-gates.md` §4: what ran and its result, what was not verified and why. Then a suggested commit message (skill `generate-commit-text`, format in `docs/standards/git-workflow.md` §2). Do not commit or merge unless the user asks.
