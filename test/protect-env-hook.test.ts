import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { AGENT_ENVIRONMENTS, ENVIRONMENTS } from '../scripts/lib/with-env';

/**
 * R70: the Claude Code PreToolUse hook (.claude/hooks/protect-env.mjs) — run as Claude Code runs
 * it, a tool call as JSON on stdin; exit 2 = refused. It blocks active env files (only
 * `.env.example` passes) and keeps agents on the dev and test environments.
 */

const HOOK = resolve(import.meta.dir, '../.claude/hooks/protect-env.mjs');

const decide = (tool: string, input: Record<string, string>) => {
  const child = Bun.spawnSync(['bun', HOOK], {
    stdin: Buffer.from(JSON.stringify({ tool_name: tool, tool_input: input })),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    refused: child.exitCode === 2,
    allowed: child.exitCode === 0,
    stderr: child.stderr.toString(),
  };
};

const bash = (command: string) => decide('Bash', { command });

describe('protect-env hook: env files', () => {
  it('refuses reading any active env file and allows .env.example', () => {
    for (const file of ['.env', '.env.local', ...ENVIRONMENTS.map((name) => `.env.${name}`)]) {
      expect(decide('Read', { file_path: `/repo/${file}` }).refused).toBe(true);
      expect(bash(`cat ${file}`).refused).toBe(true);
    }
    expect(decide('Read', { file_path: '/repo/.env.example' }).allowed).toBe(true);
  });
});

describe('protect-env hook: agents run dev and test only', () => {
  const others = ENVIRONMENTS.filter((name) => !AGENT_ENVIRONMENTS.includes(name));

  it('refuses start:<env> and bun run env <env> for every other environment', () => {
    expect(others).toEqual(['stg', 'demo', 'prod']);
    for (const name of others) {
      for (const command of [
        `bun run start:${name}`,
        `bun run env ${name} db:migrate`,
        `bun  run  env ${name} seed:admin --email a@example.com`,
        `bun scripts/with-env.ts ${name} start`,
        `cd /repo && bun run start:${name}`,
      ]) {
        const decision = bash(command);
        expect(decision.refused).toBe(true);
        expect(decision.stderr).toContain('dev and test environments only');
      }
    }
  });

  it('allows dev and test, and words that only look alike', () => {
    for (const command of [
      'bun run start:dev',
      'bun run start:test',
      'bun run env dev db:migrate',
      'bun run env test test:int',
      'bun run start',
      'bun run start:production-like',
    ]) {
      expect(bash(command).allowed).toBe(true);
    }
  });
});
