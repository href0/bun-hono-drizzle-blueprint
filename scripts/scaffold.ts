/**
 * Generates a module, a partner endpoint, a vendor webhook receiver or an outbound vendor adapter
 * from the scaffold-module skill's templates (plan D31) — no AI agent needed, same code as the
 * skill, verified in CI because `bun run verify:scaffold` runs this very command.
 *
 * Usage: bun run scaffold <module|partner|webhook|integration> <name> [options] — see USAGE.
 *
 * All-or-nothing: every file and registration is computed first (a missing registration anchor or
 * an existing file aborts before anything is written), then written, then formatted with Prettier
 * (only the files it created or changed). It never runs migrations; it prints what to do next.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseScaffoldArgs, planScaffold, ScaffoldError, type ScaffoldPlan } from './lib/scaffold';

const ROOT = resolve(import.meta.dir, '..');

const folders = (dir: string): string[] =>
  existsSync(resolve(ROOT, dir))
    ? readdirSync(resolve(ROOT, dir), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];

/** Names that would break the conventions (plan D26) or overwrite existing work. */
const refusals = (
  plan: ScaffoldPlan,
  request: ReturnType<typeof parseScaffoldArgs>['request'],
): string[] => {
  const vendors = folders('src/integrations');
  const modules = folders('src/modules');
  const problems: string[] = [];
  if (request.kind !== 'integration' && vendors.includes(request.name)) {
    problems.push(
      `"${request.name}" is a vendor in src/integrations/: name the module after its domain (plan D26)`,
    );
  }
  if (request.kind === 'integration' && modules.includes(request.name)) {
    problems.push(
      `"${request.name}" is a module: a vendor adapter cannot share its name (plan D26)`,
    );
  }
  if (
    request.kind === 'webhook' &&
    request.vendor !== undefined &&
    modules.includes(request.vendor)
  ) {
    problems.push(`"${request.vendor}" is a module: a vendor cannot share its name (plan D26)`);
  }
  // Details belong to the design of a resource: header-detail is chosen when the module is created.
  if (request.variant === 'header-detail' && modules.includes(request.name)) {
    problems.push(
      `src/modules/${request.name}/ already exists: the CLI does not add details to an existing module — add them by hand or with an AI agent (docs/standards/new-module.md §2.6)`,
    );
  }
  for (const file of plan.files) {
    if (existsSync(resolve(ROOT, file.path))) problems.push(`${file.path} already exists`);
  }
  return problems;
};

/** Applies every edit in memory (per file, in order), keeping each file's line endings. */
const applyEdits = (plan: ScaffoldPlan): Map<string, string> => {
  const results = new Map<string, string>();
  for (const edit of plan.edits) {
    const original = readFileSync(resolve(ROOT, edit.path), 'utf8');
    const current = results.get(edit.path) ?? original.split('\r\n').join('\n');
    const next = edit.apply(current);
    if (next === current)
      throw new ScaffoldError(`registration did not change ${edit.path} (${edit.label})`);
    results.set(edit.path, next);
  }
  for (const [path, content] of results) {
    const crlf = readFileSync(resolve(ROOT, path), 'utf8').includes('\r\n');
    results.set(path, crlf ? content.split('\n').join('\r\n') : content);
  }
  return results;
};

const printNextSteps = (plan: ScaffoldPlan, heading: string): void => {
  console.log(`\n${heading}`);
  for (const [index, step] of plan.nextSteps.entries())
    console.log(`  ${String(index + 1)}. ${step}`);
  console.log(`  ${String(plan.nextSteps.length + 1)}. bun run validate:full`);
};

const main = (): void => {
  const { request, dryRun } = parseScaffoldArgs(process.argv.slice(2));
  const plan = planScaffold(request, ROOT);
  const problems = refusals(plan, request);
  if (problems.length > 0)
    throw new ScaffoldError(`refusing to scaffold:\n  - ${problems.join('\n  - ')}`);
  const edited = applyEdits(plan);

  console.log(`${dryRun ? '[dry run] ' : ''}Scaffolding ${plan.label} from ${plan.template}`);
  for (const file of plan.files) console.log(`  create ${file.path}`);
  for (const edit of plan.edits) console.log(`  edit   ${edit.path} — ${edit.label}`);
  if (dryRun) {
    printNextSteps(plan, 'Next steps (after a real run — nothing was written):');
    return;
  }

  for (const file of plan.files) {
    const path = resolve(ROOT, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content);
  }
  for (const [path, content] of edited) writeFileSync(resolve(ROOT, path), content);

  // The templates are formatted for a short name; format exactly what was created or changed.
  const touched = [...plan.files.map((file) => file.path), ...edited.keys()].filter((path) =>
    path.endsWith('.ts'),
  );
  const prettier = Bun.spawnSync(['bunx', 'prettier', '--write', ...touched], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (prettier.exitCode !== 0) {
    console.error(prettier.stderr.toString().trim());
    throw new ScaffoldError(
      'prettier failed on the generated files (they are written; fix and format them)',
    );
  }

  printNextSteps(plan, 'Next steps:');
};

try {
  main();
} catch (error) {
  console.error(error instanceof ScaffoldError ? error.message : error);
  process.exit(1);
}
