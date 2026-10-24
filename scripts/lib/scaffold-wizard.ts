/**
 * The interactive front of `bun run scaffold` (plan D36). In a terminal, a command that leaves out
 * `<kind>`, `<name>` or a webhook's vendor opens this wizard; it only completes the request. Every
 * answer becomes a flag that `parseScaffoldArgs` reads (`toArgv`), so the files are exactly those of
 * the equivalent command, which the CLI prints at the end (`commandOf`). Questions go through a
 * `Prompter` (prompter.ts), so the tests answer them; `terminalPrompter` asks a person.
 */
import type { Choice, Prompter, TextQuestion } from './prompter';
import {
  assertKebabCase,
  DEFAULT_DETAIL,
  pluralGuess,
  ScaffoldError,
  singularOf,
  titleOf,
  type ModuleVariant,
  type ScaffoldRequest,
} from './scaffold';

/** What the repository offers, read by the CLI. */
export interface WizardContext {
  /** Every module name, dependents included (`users`, `project-tasks`). */
  modules: readonly string[];
  /** The vendors in `src/integrations/`. */
  vendors: readonly string[];
  /** Modules a dependent can attach to: top-level modules whose table has soft delete. */
  parents: readonly string[];
}

/** The eight things the CLI generates: the module variants, the two dependents and the other kinds. */
export type Shape =
  ModuleVariant | 'dependent' | 'dependent-one' | 'partner' | 'webhook' | 'integration';

export const SHAPES: readonly Choice<Shape>[] = [
  {
    value: 'standalone',
    label: 'Module — standalone',
    hint: 'one table with CRUD (products)',
  },
  {
    value: 'header-detail',
    label: 'Module — header + detail',
    hint: 'a document and its lines, written together (orders + order_items)',
  },
  {
    value: 'record',
    label: 'Module — record (append-only)',
    hint: 'rows are added and read, never edited (a log, a history)',
  },
  {
    value: 'dependent',
    label: 'Module — dependent 1:N of an existing module',
    hint: 'many children with their own pages (orders → order-documents)',
  },
  {
    value: 'dependent-one',
    label: 'Module — dependent 1:1 of an existing module',
    hint: 'at most one section per parent (projects → project-budgets)',
  },
  {
    value: 'partner',
    label: 'Partner endpoint',
    hint: 'a partner system calls us, HMAC-signed (/v1/partner/...)',
  },
  {
    value: 'webhook',
    label: 'Vendor webhook receiver',
    hint: 'a vendor notifies us (/webhooks/<vendor>/...)',
  },
  {
    value: 'integration',
    label: 'Outbound vendor integration',
    hint: 'we call a vendor (src/integrations/<vendor>/)',
  },
];

const MODULE_SHAPES = SHAPES.filter(
  (shape) => !['partner', 'webhook', 'integration'].includes(shape.value),
);

/** True when the command line misses something only a question can supply. */
export const needsWizard = (request: Partial<ScaffoldRequest>): boolean =>
  request.kind === undefined ||
  request.name === undefined ||
  (request.kind === 'webhook' && request.vendor === undefined);

/** The shape the flags already decide, or `undefined` when the wizard has to ask. */
const shapeOf = (request: Partial<ScaffoldRequest>): Shape | undefined => {
  if (request.kind === undefined) return undefined;
  if (request.kind !== 'module') return request.kind;
  if (request.parent !== undefined) return request.one ? 'dependent-one' : 'dependent';
  return request.variant;
};

const kebabError = (value: string, what: string): string | undefined => {
  try {
    assertKebabCase(value, what);
    return undefined;
  } catch (error) {
    return error instanceof ScaffoldError ? error.message : String(error);
  }
};

const guessSingular = (plural: string): string | undefined => {
  try {
    return singularOf(plural);
  } catch {
    return undefined;
  }
};

/**
 * A plural name (it names a folder, a table and routes) and its singular. A name that does not look
 * plural gets the suggested plural or is kept as an irregular plural with a typed singular. The
 * singular is returned only when it differs from the guess, so the printed command stays short.
 */
const askPlural = async (
  prompter: Prompter,
  question: { message: string; placeholder: string; what: string },
  taken: (name: string) => string | undefined,
): Promise<{ name: string; singular?: string }> => {
  const typed = await prompter.text({
    message: question.message,
    placeholder: question.placeholder,
    validate: (value) => kebabError(value, question.what) ?? taken(value),
  });
  return askSingular(prompter, typed, question.what, taken);
};

const askSingular = async (
  prompter: Prompter,
  plural: string,
  what: string,
  taken: (name: string) => string | undefined,
): Promise<{ name: string; singular?: string }> => {
  const guess = guessSingular(plural);
  const singularQuestion = (initial?: string): TextQuestion => ({
    message: `Singular of "${plural}"`,
    initial,
    placeholder: 'e.g. person (for people)',
    validate: (value) =>
      kebabError(value, 'singular') ??
      (value === plural ? `the singular must differ from "${plural}"` : undefined),
  });
  if (guess !== undefined) {
    const singular = await prompter.text(singularQuestion(guess));
    return { name: plural, singular: singular === guess ? undefined : singular };
  }
  const suggestion = pluralGuess(plural);
  const choice = await prompter.select(
    `"${plural}" does not look plural (a ${what} names a folder, a table and routes)`,
    [
      { value: 'rename', label: `Use "${suggestion}"`, hint: 'recommended' },
      { value: 'keep', label: `Keep "${plural}"`, hint: 'an irregular plural: give its singular' },
    ] as const,
  );
  if (choice === 'keep') return { name: plural, singular: await prompter.text(singularQuestion()) };
  const problem = taken(suggestion);
  if (problem !== undefined) throw new ScaffoldError(problem);
  return askSingular(prompter, suggestion, what, taken);
};

/** The institution named in error messages; `undefined` when it is the default (`Acme Pay`). */
const askInstitution = async (prompter: Prompter, vendor: string): Promise<string | undefined> => {
  const answer = await prompter.text({
    message: 'Institution named in vendor errors (error.institution)',
    initial: titleOf(vendor),
    validate: (value) => (value === '' ? 'the institution is required' : undefined),
  });
  return answer === titleOf(vendor) ? undefined : answer;
};

/** Completes what the command line left out; values it gave are kept and never asked again. */
export const completeRequest = async (
  draft: Partial<ScaffoldRequest>,
  context: WizardContext,
  prompter: Prompter,
): Promise<ScaffoldRequest> => {
  const shape =
    shapeOf(draft) ??
    (await prompter.select(
      'What do you want to scaffold?',
      draft.kind === 'module' ? MODULE_SHAPES : SHAPES,
    ));
  const moduleTaken = (name: string): string | undefined => {
    if (context.modules.includes(name)) return `the module name "${name}" is already used`;
    if (context.vendors.includes(name))
      return `"${name}" is a vendor in src/integrations/: name the module after its domain`;
    return undefined;
  };

  if (shape === 'integration') {
    const name =
      draft.name ??
      (await prompter.text({
        message: 'Vendor name (singular, kebab-case)',
        placeholder: 'e.g. acme-pay',
        validate: (value) =>
          kebabError(value, 'vendor') ??
          (context.vendors.includes(value)
            ? `src/integrations/${value}/ already exists`
            : context.modules.includes(value)
              ? `"${value}" is a module: a vendor adapter cannot share its name`
              : undefined),
      }));
    const institution = draft.institution ?? (await askInstitution(prompter, name));
    return { kind: 'integration', name, institution };
  }

  if (shape === 'dependent' || shape === 'dependent-one') {
    return completeDependent(draft, context, prompter, shape === 'dependent-one');
  }

  const kind = shape === 'partner' || shape === 'webhook' ? shape : 'module';
  const named =
    draft.name === undefined
      ? await askPlural(
          prompter,
          {
            message: `${kind === 'module' ? 'Module' : `${titleOf(kind)} module`} name (plural, kebab-case)`,
            placeholder: kind === 'webhook' ? 'e.g. payment-notifications' : 'e.g. products',
            what: 'module',
          },
          moduleTaken,
        )
      : { name: draft.name, singular: draft.singular };
  const request: ScaffoldRequest = {
    kind,
    name: named.name,
    singular: draft.singular ?? named.singular,
    variant: shape === 'header-detail' || shape === 'record' ? shape : draft.variant,
  };

  if (shape === 'header-detail') {
    const detail =
      draft.detail === undefined
        ? await askDetail(prompter, named.name)
        : { name: draft.detail, singular: draft.detailSingular };
    // `items` is the default: printed only when its singular is not the guessed one.
    const isDefault = detail.name === DEFAULT_DETAIL && detail.singular === undefined;
    request.detail = isDefault ? undefined : detail.name;
    request.detailSingular = detail.singular;
  }

  if (kind === 'webhook') {
    request.vendor =
      draft.vendor ??
      (await prompter.text({
        message: 'Vendor that sends the webhook (kebab-case)',
        placeholder: 'e.g. acme-pay',
        validate: (value) =>
          kebabError(value, '--vendor') ??
          (context.modules.includes(value)
            ? `"${value}" is a module: a vendor cannot share its name`
            : undefined),
      }));
    request.institution = draft.institution ?? (await askInstitution(prompter, request.vendor));
  }
  return request;
};

const askDetail = async (
  prompter: Prompter,
  header: string,
): Promise<{ name: string; singular?: string }> => {
  const typed = await prompter.text({
    message: 'Detail name (plural: the lines of the document)',
    initial: DEFAULT_DETAIL,
    validate: (value) =>
      kebabError(value, '--detail') ??
      (value === header ? 'the detail must differ from the header' : undefined),
  });
  return askSingular(prompter, typed, 'detail', () => undefined);
};

/** Parent first (picked from the modules that can be one), then the child under its prefixed name. */
const completeDependent = async (
  draft: Partial<ScaffoldRequest>,
  context: WizardContext,
  prompter: Prompter,
  one: boolean,
): Promise<ScaffoldRequest> => {
  let parent = draft.parent;
  if (parent === undefined) {
    if (context.parents.length === 0) {
      throw new ScaffoldError(
        'no module can be a parent yet: a dependent attaches to a standalone or header module with soft delete — create one first (bun run scaffold module <name>)',
      );
    }
    parent = await prompter.select(
      'Parent module',
      context.parents.map((name) => ({ value: name, label: name, hint: `src/modules/${name}/` })),
    );
  }
  const guessed = guessSingular(parent);
  const parentSingular =
    draft.parentSingular ??
    (guessed === undefined
      ? await prompter.text({
          message: `Singular of the parent "${parent}"`,
          placeholder: 'e.g. person (for people)',
          validate: (value) => kebabError(value, '--parent-singular'),
        })
      : undefined);
  const prefix = `${parentSingular ?? guessed ?? parent}-`;
  const fullName = (name: string): string => (name.startsWith(prefix) ? name : `${prefix}${name}`);
  const taken = (name: string): string | undefined =>
    context.modules.includes(fullName(name))
      ? `the module name "${fullName(name)}" is already used`
      : undefined;

  const named =
    draft.name === undefined
      ? await askPlural(
          prompter,
          {
            message: `${one ? 'Section (1:1)' : 'Child (1:N)'} name, plural — created as ${prefix}<name>`,
            placeholder: one ? 'e.g. budgets' : 'e.g. documents',
            what: 'module',
          },
          taken,
        )
      : { name: draft.name, singular: draft.singular };
  return {
    kind: 'module',
    name: named.name,
    singular: draft.singular ?? named.singular,
    parent,
    parentSingular,
    one: one || undefined,
  };
};

/** The command-line arguments of a request: `parseScaffoldArgs(toArgv(request))` gives it back. */
export const toArgv = (request: ScaffoldRequest): string[] => {
  const flag = (key: string, value: string | undefined): string[] =>
    value === undefined ? [] : [`--${key}=${value}`];
  return [
    request.kind,
    request.name,
    ...flag('variant', request.variant),
    ...flag('singular', request.singular),
    ...flag('detail', request.detail),
    ...flag('detail-singular', request.detailSingular),
    ...flag('parent', request.parent),
    ...flag('parent-singular', request.parentSingular),
    ...(request.one ? ['--one'] : []),
    ...flag('vendor', request.vendor),
    ...flag('institution', request.institution),
  ];
};

/** The same request as one command to copy (`--institution="Acme Payments"` quoted). */
export const commandOf = (request: ScaffoldRequest): string =>
  [
    'bun run scaffold',
    ...toArgv(request).map((arg) =>
      /[\s"'$`\\]/.test(arg)
        ? arg.replace(
            /=(.*)$/s,
            (_match, value: string) => `="${value.replace(/["$`\\]/g, '\\$&')}"`,
          )
        : arg,
    ),
  ].join(' ');
