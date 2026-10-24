/**
 * Generates a module, a partner endpoint, a vendor webhook receiver or an outbound vendor adapter
 * from the scaffold-module skill's templates (plan D31) — no AI agent needed, same code as the
 * skill, verified in CI because `bun run verify:scaffold` runs this very command.
 *
 * Usage: bun run scaffold <module|partner|webhook|integration> <name> [options] — see USAGE. In a
 * terminal, a missing <kind> / <name> (or a webhook's vendor) opens the wizard (plan D36): it asks,
 * shows the plan, asks before writing, and prints the equivalent command. Without a terminal (CI, an
 * AI agent, verify:scaffold) nothing is ever asked: a missing argument is the usage error — unless
 * SCAFFOLD_WIZARD_STDIN=1, set only by `bun run acceptance`, which answers the wizard itself.
 *
 * All-or-nothing: every file and registration is computed first (a missing registration anchor or
 * an existing file aborts before anything is written), then written, then formatted with Prettier
 * (only the files it created or changed). It never runs migrations; it prints what to do next.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  camel,
  parseScaffoldArgs,
  planScaffold,
  readScaffoldArgs,
  ScaffoldError,
  type ScaffoldPlan,
  type ScaffoldRequest,
} from './lib/scaffold';
import {
  commandOf,
  completeRequest,
  needsWizard,
  terminalPrompter,
  toArgv,
  type WizardContext,
} from './lib/scaffold-wizard';

const ROOT = resolve(import.meta.dir, '..');

const folders = (dir: string): string[] =>
  existsSync(resolve(ROOT, dir))
    ? readdirSync(resolve(ROOT, dir), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];

/** Dependent modules: one subfolder of their parent (`src/modules/<parent>/<child>/`, plan D33). */
const nestedModules = (): { parent: string; name: string }[] =>
  folders('src/modules').flatMap((parent) =>
    folders(`src/modules/${parent}`).map((name) => ({ parent, name })),
  );

/** Names that would break the conventions (plan D26) or overwrite existing work. */
const refusals = (plan: ScaffoldPlan, request: ScaffoldRequest): string[] => {
  const vendors = folders('src/integrations');
  const nested = nestedModules();
  const modules = [...folders('src/modules'), ...nested.map((module) => module.name)];
  const problems: string[] = [];
  // A dependent module is created under its parent-prefixed name (`order-documents`).
  const moduleName = plan.moduleName ?? request.name;
  if (request.kind !== 'integration' && vendors.includes(moduleName)) {
    problems.push(
      `"${moduleName}" is a vendor in src/integrations/: name the module after its domain (plan D26)`,
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
  if (modules.includes(moduleName) && request.kind !== 'integration') {
    problems.push(
      `the module name "${moduleName}" is already used in src/modules/ (it names a table and routes)`,
    );
  }
  if (plan.parent) problems.push(...parentProblems(plan.parent, nested));
  for (const file of plan.files) {
    if (existsSync(resolve(ROOT, file.path))) problems.push(`${file.path} already exists`);
  }
  return problems;
};

const textOf = (path: string): string =>
  existsSync(resolve(ROOT, path)) ? readFileSync(resolve(ROOT, path), 'utf8') : '';

/** What the wizard offers: taken names, and the modules a dependent can attach to (parentModuleProblems). */
const wizardContext = (): WizardContext => {
  const nested = nestedModules();
  return {
    modules: [...folders('src/modules'), ...nested.map((module) => module.name)],
    vendors: folders('src/integrations'),
    parents: folders('src/modules').filter(
      (name) => parentModuleProblems(name, camel(name), nested).length === 0,
    ),
  };
};

/**
 * A dependent module needs a parent that exists, exports its table, is soft-deletable (its children
 * are hidden through `deleted_at`) and is not a dependent itself (two levels at most, plan D33). The
 * wizard offers only the modules that pass, so a parent it lists is never refused afterwards.
 */
const parentModuleProblems = (
  name: string,
  camelPlural: string,
  nested: { parent: string; name: string }[],
): string[] => {
  const nestedParent = nested.find((module) => module.name === name);
  if (nestedParent) {
    return [
      `parent "${name}" is itself a dependent module (src/modules/${nestedParent.parent}/${name}/): two levels at most (plan D33) — attach to "${nestedParent.parent}" instead`,
    ];
  }
  const schemaPath = `src/database/schema/domain/${name}.schema.ts`;
  const schema = textOf(schemaPath);
  if (!folders('src/modules').includes(name) || schema === '') {
    return [
      `parent "${name}" not found: --parent names an existing module (src/modules/${name}/ and ${schemaPath}) — create it first, e.g. bun run scaffold module ${name}`,
    ];
  }
  const problems: string[] = [];
  if (!schema.includes(`export const ${camelPlural} = appTable(`)) {
    problems.push(
      `${schemaPath} does not export the table "${camelPlural}" (irregular plural? use --parent-singular=<name>)`,
    );
  } else if (!schema.includes('softDelete()')) {
    problems.push(
      `parent "${name}" has no softDelete(): a dependent hides its rows through the parent's deleted_at — the parent must be a standalone or header table`,
    );
  }
  if (textOf(`src/modules/${name}/${name}.repository.ts`).includes('DependentRepository')) {
    problems.push(
      `parent "${name}" is itself a dependent module: two levels at most (plan D33) — attach to its parent instead`,
    );
  }
  return problems;
};

/** The parent's own checks, then the child's route segment under it must be free. */
const parentProblems = (
  { names, segment }: NonNullable<ScaffoldPlan['parent']>,
  nested: { parent: string; name: string }[],
): string[] => {
  const problems = parentModuleProblems(names.name, names.camelPlural, nested);
  const taken =
    textOf(`src/modules/${names.name}/${names.name}.routes.ts`).includes(`'/:id/${segment}`) ||
    textOf('src/app.ts').includes(`/${names.name}/:${names.camelSingular}Id/${segment}'`);
  if (taken) {
    problems.push(
      `the route segment "/${names.name}/:id/${segment}" is already used: choose another module name`,
    );
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

/**
 * Printed only: new routes change the API contract (docs/api/openapi.json), and accepting that
 * change is the developer's reviewed decision — this CLI never writes the snapshot (R76).
 */
const CONTRACT_REMINDER =
  'API contract: bun run openapi:check lists the new operations; review them, then bun run openapi:update';

const printNextSteps = (plan: ScaffoldPlan, heading: string, addsRoutes: boolean): void => {
  console.log(`\n${heading}`);
  const steps = [...plan.nextSteps, ...(addsRoutes ? [CONTRACT_REMINDER] : [])];
  for (const [index, step] of steps.entries()) console.log(`  ${String(index + 1)}. ${step}`);
  console.log(`  ${String(steps.length + 1)}. bun run validate:full`);
};

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  const draft = readScaffoldArgs(argv);
  // SCAFFOLD_WIZARD_STDIN=1: a program answers the wizard through a pipe (bun run acceptance drives
  // the real prompts with keystrokes). Never set by hand, CI or an agent: without it, no terminal
  // means no question.
  const driven = process.env.SCAFFOLD_WIZARD_STDIN === '1';
  const interactive =
    needsWizard(draft.request) && (driven || (process.stdin.isTTY && process.stdout.isTTY));
  // The wizard only completes the arguments: the request is parsed from them like any command.
  const { request, dryRun } = interactive
    ? {
        request: parseScaffoldArgs(
          toArgv(await completeRequest(draft.request, wizardContext(), terminalPrompter)),
        ).request,
        dryRun: draft.dryRun,
      }
    : parseScaffoldArgs(argv);
  const plan = planScaffold(request, ROOT);
  const problems = refusals(plan, request);
  if (problems.length > 0)
    throw new ScaffoldError(`refusing to scaffold:\n  - ${problems.join('\n  - ')}`);
  const edited = applyEdits(plan);
  // An outbound adapter adds no route; every other kind does.
  const addsRoutes = request.kind !== 'integration';

  console.log(`${dryRun ? '[dry run] ' : ''}Scaffolding ${plan.label} from ${plan.template}`);
  for (const file of plan.files) console.log(`  create ${file.path}`);
  for (const edit of plan.edits) console.log(`  edit   ${edit.path} — ${edit.label}`);
  const equivalent = (): void => {
    if (interactive)
      console.log(`
Same result without the wizard:
  ${commandOf(request)}`);
  };
  if (dryRun) {
    printNextSteps(plan, 'Next steps (after a real run — nothing was written):', addsRoutes);
    equivalent();
    return;
  }
  if (interactive && !(await terminalPrompter.confirm('Write these files?')))
    throw new ScaffoldError('cancelled: nothing was written');

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

  printNextSteps(plan, 'Next steps:', addsRoutes);
  equivalent();
};

try {
  await main();
} catch (error) {
  console.error(error instanceof ScaffoldError ? error.message : error);
  process.exit(1);
}
