@.agents/AGENTS.md

## Claude Code wiring

`.agents/` is the single source of truth for agent rules and skills. `.claude/` only wires them into Claude Code:

- Rules: imported above from `.agents/AGENTS.md` — edit them there, not here.
- Skills: `.claude/skills/<name>/SKILL.md` are pointer wrappers that load `.agents/skills/<name>/SKILL.md`. When changing a skill, edit the `.agents/` file; only touch the wrapper if the skill is added, renamed, removed, or its trigger `description` changes.
- `.env` protection: enforced mechanically by `.claude/settings.json` (`permissions.deny`) and `.claude/hooks/protect-env.mjs` (PreToolUse), on top of the `env-protection` policy.
