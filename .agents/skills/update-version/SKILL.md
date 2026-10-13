---
name: update-version
description: Bump package.json version and update CHANGELOG.md according to the branching strategy (hotfix, development, staging, prod). Use when asked to update or bump the version.
---

# Update Version

Update the `version` field in `package.json` based on the current branch and the project's branching strategy (branch names: `docs/standards/git-workflow.md` §1). Also generates or updates `CHANGELOG.md`.

---

## Steps

### 1. Get Current Branch

Run:
```bash
git branch --show-current
```

---

### 2. Read Current Version

Read `package.json` and extract the `version` field. Expected format: `{MAJOR}.{MINOR}.{PATCH}` (e.g. `1.0.0`).

---

### 3. Determine New Version

Apply the correct rule based on branch name:

| Branch Pattern | Rule | Example |
|---|---|---|
| `hotfix/v*.x.x` | Extract version from branch name directly (strict pattern: `hotfix/v{MAJOR}.{MINOR}.{PATCH}`) | `hotfix/v1.0.1` → `1.0.1` |
| `development` | Bump MINOR +1, reset PATCH to 0 | `1.0.0` → `1.1.0` |
| `feat/*`, `fix/*`, `refactor/*`, or any feature branch | Do NOT change version. Skip to step 6 (add entries to `[Unreleased]`). |
| `staging` | Do NOT change version. Inform user: "On staging branch — version should already be set from dev merge." Stop here. |
| `prod`, `main`, `master` | Do NOT change version. Inform user: "On production branch — version should already be set." Stop here. |

---

### 4. Confirm with User

Before making any changes, display:

```
Current version : 1.0.0
New version     : 1.1.0
Branch          : development
Rule            : MINOR bump (dev/feature → staging release)
```

Ask user to confirm before proceeding.

---

### 5. Update package.json & Sync Lockfile

Update the `version` field in `package.json` with the new version value.

Then sync `bun.lock` by running:
```bash
bun install
```

---

### 6. Update CHANGELOG.md

Update `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/) standards with sections for `Added`, `Changed`, `Fixed`, and `Removed`.

Build the entries from the commits since the last release tag (`git describe --tags --abbrev=0`; no tag → the whole history): `git log <tag>..HEAD --pretty=format:"%s"`. Conventional Commit types map to sections — `feat` → Added, `fix` → Fixed, `refactor` / `perf` → Changed, removals → Removed; `docs`, `test`, `chore`, `ci`, `build` only when they matter to users of the project. One line per change, in plain words, without the commit hash.

---

### 7. Hand Over

Do NOT commit. Show the changed files and suggest the message `chore(release): bump version to <new-version>` (scope `release`, `docs/standards/git-workflow.md` §2); commit only when the user asks.
