---
name: generate-commit-text
description: Generate a Conventional Commits message from staged changes (git diff --cached) without committing. Use when asked for a commit message or commit text.
---

# Generate Commit Text

Generate a commit message from the staged changes. Output text only — **do NOT run `git commit`**. The message format (types, scopes, subject and body rules) has one source: `docs/standards/git-workflow.md` §2 — read it first.

## Steps

1. **Check staged changes**: `git diff --cached --stat`. Empty → tell the user "No staged changes found. Run `git add` first." and stop. (When the user asked for a message for the working tree instead, use `git status` / `git diff` the same way.)
2. **Read the diff**: `git diff --cached`.
3. **Analyze**: for each file, the area it belongs to (→ scope), the kind of change (→ type), and its purpose. Exactly one scope — a fixed scope from `docs/standards/git-workflow.md` §2 or a folder of the source tree (module, `core/<area>`, `database/<folder>`, `integrations/<vendor>`, `utils/<name>`); commitlint rejects anything else. A change spanning areas takes the scope of its main purpose.
4. **Write the message** per `docs/standards/git-workflow.md` §2: one `<type>(<scope>): <subject>`, then a body of bullets (what and why), every line ≤ 100 characters.
5. **Output** it in a fenced block, ready to paste (`git commit -m "<header>" -m "<body line>" …`, or the plain message when the user commits through an editor).
