import { and, asc, desc, gte, ilike, lte, or, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Temporal } from 'temporal-polyfill';
import type { ListQuery, SortKey } from '../core/dto/list-query.dto';

/**
 * A list query (D41, R85) as SQL. The allowlist is a module's `ListColumns`: `sort` maps every
 * sortable DTO field to its column (a field without a column does not compile), `search` names the
 * text columns `q` looks in. Nothing here builds SQL from text: column names never come from input.
 */
export interface ListColumns<TField extends string> {
  sort: Readonly<Record<TField, AnyPgColumn>>;
  search?: readonly AnyPgColumn[];
}

/**
 * `ORDER BY` for `sort`, always ending with the unique `id` (in the direction of the last key) so a
 * page never repeats or skips rows that tie; `undefined` (= the repository default) when unsorted.
 */
export const orderFromSort = <TField extends string>(
  sort: readonly SortKey<TField>[] | undefined,
  columns: Readonly<Record<TField, AnyPgColumn>>,
  id: AnyPgColumn,
): SQL[] | undefined => {
  const last = sort?.at(-1);
  if (sort === undefined || last === undefined) return undefined;
  const by = (direction: SortKey['direction']): typeof asc => (direction === 'desc' ? desc : asc);
  return [
    ...sort.map(({ field, direction }) => by(direction)(columns[field])),
    by(last.direction)(id),
  ];
};

/** `q` as a literal substring: `%`, `_` and the escape character `\` match themselves. */
export const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (char) => `\\${char}`);

/** `q` in any of `columns` (case-insensitive substring, OR); `undefined` without `q` or columns. */
export const searchCondition = (
  q: string | undefined,
  columns: readonly AnyPgColumn[] = [],
): SQL | undefined => {
  if (q === undefined || columns.length === 0) return undefined;
  const pattern = `%${escapeLike(q)}%`;
  return or(...columns.map((column) => ilike(column, pattern)));
};

/** `column` within an optional, inclusive instant range. */
export const instantRange = (
  column: AnyPgColumn,
  from: Temporal.Instant | undefined,
  to: Temporal.Instant | undefined,
): SQL | undefined =>
  and(
    from === undefined ? undefined : gte(column, from),
    to === undefined ? undefined : lte(column, to),
  );

/** A page of a list and its total under the same conditions, read side by side. */
export const listPage = async <TRow>({
  query,
  columns,
  id,
  where,
  page,
  count,
}: {
  query: ListQuery;
  columns: ListColumns<string>;
  id: AnyPgColumn;
  where?: SQL;
  page: (orderBy: SQL[] | undefined, where: SQL | undefined) => Promise<TRow[]>;
  count: (where: SQL | undefined) => Promise<number>;
}): Promise<{ rows: TRow[]; total: number }> => {
  const condition = and(searchCondition(query.q, columns.search), where);
  const [rows, total] = await Promise.all([
    page(orderFromSort(query.sort, columns.sort, id), condition),
    count(condition),
  ]);
  return { rows, total };
};
