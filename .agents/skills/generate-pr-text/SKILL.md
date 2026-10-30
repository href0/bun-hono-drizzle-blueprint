---
name: generate-pr-text
description: Generate a pull request title and description for the current branch (its commits against main and the verification that was run) without opening the pull request. Use when asked for a PR title, PR description or PR text.
---

# Generate PR Text

Write the title and description of a pull request for the current branch. Output text only — **never open, approve or merge the pull request** (the user does, on GitHub). The format (title, the template's sections, what the checklist may claim) has one source: `docs/standards/git-workflow.md` §3.2 — read it first, and the sections of `.github/pull_request_template.md`.

## Steps

1. **Find the branch's changes**: `git fetch origin`, then `git log --oneline origin/main..HEAD` and `git diff --stat origin/main...HEAD`. No commits → tell the user the branch has nothing to merge, and stop. Uncommitted changes → say they are not part of the pull request.
2. **Read the commits** (`git log origin/main..HEAD --format=%B`) and the diff where a commit message does not explain a change.
3. **Collect the verification evidence** from this session: which gates ran on this branch's content and their results (tests, coverage, `test:int`, `verify:scaffold`, `acceptance`, chaos tests), and what was not run. Never tick an item that did not run on this content; `openapi:check` decides "No API contract change".
4. **Write** the title and the description per `docs/standards/git-workflow.md` §3.2.
5. **Output** two fenced blocks, the title and the description, ready to paste into GitHub; then remind the user of the merge step in `docs/standards/git-workflow.md` §3.3 (CI green, Rebase and merge).
