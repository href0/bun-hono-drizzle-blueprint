import type { ClassifiedChange, Severity } from './compare';

const LABEL_WIDTH = 'BREAKING'.length;

const describe = ({ change }: ClassifiedChange): string => {
  const { fact } = change;
  if (change.kind === 'changed') {
    return `${fact.location}: ${change.attribute} ${change.before ?? '(none)'} → ${change.after ?? '(none)'}`;
  }
  if (fact.location === 'operation') return `operation ${change.kind}`;
  const required = fact.side === 'request' && fact.attributes.required === 'true';
  return `${fact.location}: ${change.kind}${required && change.kind === 'added' ? ' (required)' : ''}`;
};

export const countBySeverity = (
  changes: readonly ClassifiedChange[],
): Record<Severity, number> => ({
  BREAKING: changes.filter((c) => c.severity === 'BREAKING').length,
  safe: changes.filter((c) => c.severity === 'safe').length,
  docs: changes.filter((c) => c.severity === 'docs').length,
});

/** The changes grouped per operation (`METHOD /path`), each line labelled with its severity. */
export const formatReport = (changes: readonly ClassifiedChange[]): string => {
  const byOperation = new Map<string, ClassifiedChange[]>();
  for (const change of changes) {
    const operation = change.change.fact.operation;
    byOperation.set(operation, [...(byOperation.get(operation) ?? []), change]);
  }
  const counts = countBySeverity(changes);
  const lines = [
    `${String(changes.length)} change(s): ${String(counts.BREAKING)} BREAKING, ${String(counts.safe)} safe, ${String(counts.docs)} docs`,
  ];
  // By path, then method: the operations of one resource stay together.
  const byPath = (operation: string): string => operation.split(' ').reverse().join(' ');
  const sortedOperations = [...byOperation.keys()].sort((a, b) =>
    byPath(a).localeCompare(byPath(b)),
  );
  for (const operation of sortedOperations) {
    lines.push('', operation);
    for (const change of byOperation.get(operation) ?? []) {
      lines.push(`  ${change.severity.padEnd(LABEL_WIDTH)}  ${describe(change)}`);
    }
  }
  return lines.join('\n');
};
