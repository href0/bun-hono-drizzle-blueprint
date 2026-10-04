// PreToolUse hook — mechanical enforcement of .agents/skills/env-protection.
// Blocks any tool call that references an active .env file; only .env.example is allowed.
//
// Fail-closed by design: the match is textual, so some harmless strings are blocked too,
// e.g. a regex `process\.env` or a heredoc that merely mentions an env file name inside a
// Bash command. They cannot be told apart from real paths (`C:\process\.env`), so there is
// no exception. Workarounds: write such content with the Write/Edit tools (file content is
// not inspected) and grep for `process.env` without the escaping backslash.
import { readFileSync } from 'node:fs';

const ALLOWED_SUFFIXES = new Set(['.example']);
const ENV_REF = /(?:^|[\s'"`=:(\\/])\.env((?:\.[\w-]+)*)(?=$|[\s'"`;|&)\\/,*])/g;

// Only fields that address files or run commands; written content (content, new_string, …)
// may legitimately mention env file names and is not an access.
const INSPECTED_FIELDS = ['file_path', 'notebook_path', 'path', 'pattern', 'glob', 'command'];

const input = JSON.parse(readFileSync(0, 'utf8'));
const toolInput = input.tool_input ?? {};
const haystack = INSPECTED_FIELDS.map((field) => toolInput[field])
  .filter((value) => typeof value === 'string')
  .join('\n')
  .replace(/\\/g, '/');

for (const match of haystack.matchAll(ENV_REF)) {
  const suffix = match[1] ?? '';
  if (!ALLOWED_SUFFIXES.has(suffix)) {
    process.stderr.write(
      'Error: Access to the requested environment file is blocked by the repository\'s ' +
        'Environment File Protection Policy (`env-protection` skill). Only whitelisted ' +
        'environment templates (e.g., `.env.example`) can be read.\n',
    );
    process.exit(2);
  }
}
