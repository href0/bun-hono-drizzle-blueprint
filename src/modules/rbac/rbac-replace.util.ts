/** What a replace changes (D72): ids to add, to remove and to keep — compared, never rewritten. */
export interface IdDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
}

/**
 * The body of a replace is the wanted set; `current` the live rows. Only the difference is written,
 * so unchanged rows keep their id, history and audit trail. Order follows the inputs.
 */
export const diffIds = (current: readonly string[], wanted: readonly string[]): IdDiff => {
  const now = new Set(current);
  const want = new Set(wanted);
  return {
    added: [...want].filter((id) => !now.has(id)),
    removed: [...now].filter((id) => !want.has(id)),
    unchanged: [...want].filter((id) => now.has(id)),
  };
};
