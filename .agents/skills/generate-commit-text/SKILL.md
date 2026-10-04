---
name: generate-commit-text
description: Generate commit message text from staged changes (git add). Does NOT perform the actual commit.
---

# Generate Commit Text

Generate a commit message from currently staged changes (`git diff --cached`). Output text only — **do NOT run `git commit`**.

---

## Steps

### 1. Check Staged Changes Exist

Run:
```bash
git diff --cached --stat
```

If output is empty, inform the user: "No staged changes found. Run `git add` first." Stop here.

---

### 2. Get Diff Details

Run:
```bash
git diff --cached
```

Read the full diff output.

---

### 3. Analyze Changes

For each changed file, identify:
- What module/component it belongs to (e.g. `users`, `health`, `core`, `database`, `cache`, `http`, `config`, `scripts`)
- What type of change: new feature, bugfix, refactor, chore, docs, style, test, ci, perf
- The core purpose of the change

---

### 4. Generate Commit Message

Use **Conventional Commits** format:

```
<type>(<scope>): <short description>

<optional body — bullet points explaining what changed>
```

#### Type Mapping:
| Change Type | Conventional Type |
|---|---|
| New feature, endpoint, service | `feat` |
| Bug fix | `fix` |
| Code restructure without behavior change | `refactor` |
| Config, dependency, build tooling | `chore` |
| Documentation | `docs` |
| Formatting, whitespace | `style` |
| Test additions/changes | `test` |
| CI/CD pipeline changes | `ci` |
| Performance improvement | `perf` |

#### Scope Mapping:
- Feature domains: `users`, `health`, `[feature-name]`
- Core components: `core/cache`, `core/http`, `core/errors`, `core/middlewares`, `core/logger`
- Database: `database/schema`, `database/tx-host`, `database/migrations`
- Configuration: `config/env`
- Quality Gates / Tooling: `quality-gates`, `deps`, `lint`, `scripts`

#### Rules:
- Short description in lowercase, imperative mood ("add", "fix", "update", NOT "added", "fixes")
- No period at end of subject line
- Maximum 72 characters for subject line
- Indonesian or English according to user preference, defaulting to concise English

---

### 5. Output

Present the suggested commit message to the user in a fenced code block:

```bash
git commit -m "<type>(<scope>): <short description>" -m "<body line 1>" -m "<body line 2>"
```
