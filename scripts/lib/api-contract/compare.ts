/**
 * Compares two flattened contracts (flatten.ts) and classifies every difference. The table is
 * asymmetric (plan D34, Step 7.4b): a client *sends* the request side and *reads* the response
 * side, so the same change can break one side and be harmless on the other.
 */
import type { Fact } from './flatten';

export type Severity = 'BREAKING' | 'safe' | 'docs';

export type Change =
  | { kind: 'added' | 'removed'; fact: Fact }
  | { kind: 'changed'; fact: Fact; attribute: string; before?: string; after?: string };

export interface ClassifiedChange {
  change: Change;
  severity: Severity;
}

/** Text only: readers see it, clients do not depend on it. */
const DOC_ATTRIBUTES = new Set([
  'summary',
  'description',
  'tags',
  'operationId',
  'deprecated',
  'example',
  'examples',
  'title',
]);

/** Upper bounds: lower (or newly set) = stricter. */
const UPPER_BOUNDS = new Set([
  'maxLength',
  'maximum',
  'exclusiveMaximum',
  'maxItems',
  'maxProperties',
]);
/** Lower bounds: higher (or newly set) = stricter. */
const LOWER_BOUNDS = new Set([
  'minLength',
  'minimum',
  'exclusiveMinimum',
  'minItems',
  'minProperties',
]);
/** Any change (or newly set) = stricter; removed = looser. */
const CONSTRAINTS = new Set(['pattern', 'multipleOf', 'uniqueItems', 'additionalProperties']);

const asNumber = (value: string | undefined): number | undefined =>
  value === undefined ? undefined : Number(JSON.parse(value));

const asValues = (value: string | undefined): string[] | undefined =>
  value === undefined ? undefined : (JSON.parse(value) as string[]);

/** Whether a bound / constraint change narrows what is accepted. */
const isStricter = (attribute: string, before?: string, after?: string): boolean => {
  if (after === undefined) return false;
  if (before === undefined) return true;
  const [old, next] = [asNumber(before), asNumber(after)];
  if (UPPER_BOUNDS.has(attribute)) return (next ?? Infinity) < (old ?? Infinity);
  if (LOWER_BOUNDS.has(attribute)) return (next ?? -Infinity) > (old ?? -Infinity);
  return true;
};

const classifyAttribute = (change: Extract<Change, { kind: 'changed' }>): Severity => {
  const { attribute, before, after } = change;
  const request = change.fact.side === 'request';
  if (DOC_ATTRIBUTES.has(attribute)) return 'docs';
  if (attribute === 'default') return 'safe';

  if (attribute === 'required') {
    const nowRequired = after === 'true';
    return request === nowRequired ? 'BREAKING' : 'safe';
  }
  if (attribute === 'nullable') {
    const nowNullable = after === 'true';
    return request === nowNullable ? 'safe' : 'BREAKING';
  }
  if (attribute === 'enum') {
    // No enum = any value: removing it widens the set, adding it narrows it.
    const old = asValues(before);
    const next = asValues(after);
    const widened = old !== undefined && (next === undefined || next.some((v) => !old.includes(v)));
    const narrowed =
      next !== undefined && (old === undefined || old.some((v) => !next.includes(v)));
    if (request) return narrowed ? 'BREAKING' : 'safe';
    return widened ? 'BREAKING' : 'safe';
  }
  if (attribute === 'requirements') {
    // Security requirements are alternatives (OR): one an old client meets disappearing (scheme
    // replaced, or a second scheme now required with it) = BREAKING; a new alternative is safe.
    const next = asValues(after) ?? [];
    return (asValues(before) ?? []).some((requirement) => !next.includes(requirement))
      ? 'BREAKING'
      : 'safe';
  }
  if (UPPER_BOUNDS.has(attribute) || LOWER_BOUNDS.has(attribute) || CONSTRAINTS.has(attribute)) {
    return request && isStricter(attribute, before, after) ? 'BREAKING' : 'safe';
  }
  // type, format, const and any keyword this engine does not know: assume clients depend on it.
  return 'BREAKING';
};

const isSuccessResponse = (fact: Fact): boolean => /^response 2\d\d$/.test(fact.location);

export const classify = (change: Change): Severity => {
  const { fact } = change;
  if (change.kind === 'changed') return classifyAttribute(change);
  const added = change.kind === 'added';

  if (fact.location === 'operation') return added ? 'safe' : 'BREAKING';
  if (fact.location === 'security') return added ? 'BREAKING' : 'safe';
  if (/^response \d{3}$/.test(fact.location)) {
    // A new status is one more documented outcome; losing the success status breaks clients.
    return !added && isSuccessResponse(fact) ? 'BREAKING' : 'safe';
  }
  if (fact.side === 'request') {
    if (!added) return 'BREAKING'; // R12: unknown keys are refused, so old clients now get 400
    return fact.attributes.required === 'true' ? 'BREAKING' : 'safe';
  }
  return added ? 'safe' : 'BREAKING';
};

/**
 * Every difference between two contracts. An added (or removed) node hides its descendants: a new
 * optional object with required fields inside is one safe change, not several breaking ones.
 */
export const compare = (
  before: Map<string, Fact>,
  after: Map<string, Fact>,
): ClassifiedChange[] => {
  const changes: Change[] = [];
  const onlyIn = (from: Map<string, Fact>, other: Map<string, Fact>): Fact[] =>
    [...from.entries()]
      .filter(([key]) => !other.has(key))
      .filter(([, fact]) => fact.parent === undefined || other.has(fact.parent))
      .map(([, fact]) => fact);

  for (const fact of onlyIn(before, after)) changes.push({ kind: 'removed', fact });
  for (const fact of onlyIn(after, before)) changes.push({ kind: 'added', fact });
  for (const [key, next] of after) {
    const old = before.get(key);
    if (!old) continue;
    const attributes = [
      ...new Set([...Object.keys(old.attributes), ...Object.keys(next.attributes)]),
    ].sort();
    for (const attribute of attributes) {
      const was = old.attributes[attribute];
      const now = next.attributes[attribute];
      if (was !== now)
        changes.push({ kind: 'changed', fact: next, attribute, before: was, after: now });
    }
  }
  return changes.map((change) => ({ change, severity: classify(change) }));
};
