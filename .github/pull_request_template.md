## What and why

<!-- One or two sentences: what changes and the reason. Link the plan step or issue if there is one. -->

## Checklist (docs/standards/quality-gates.md §4)

- [ ] `bun run validate:full` and `bun run build` pass locally
- [ ] Tests cover the new behaviour (every logic branch)
- [ ] `bun run test:int` / `bun run verify:scaffold` / `bun run acceptance --combo a` when §1 requires them
- [ ] API contract changed → reviewed, `bun run openapi:update`, `docs/api/` committed
- [ ] Docs updated in this change (`docs/standards/`, rule index for a new rule)
- [ ] New environment variable → `src/config/` + `.env.example`

## Not verified

<!-- What could not be checked here, and why. "None" if everything ran. -->
