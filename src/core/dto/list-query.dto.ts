import 'zod-openapi/extend';
import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import { toSnakeCase } from '../../utils/case-converter.util';
import { paginationQuerySchema, type PaginationQueryDto } from './common.dto';
import { instantField } from './datetime.dto';

/**
 * The query of every list endpoint (plan D41, R85): `?page=&per_page=&sort=-created_at,full_name&q=…`
 * plus the module's typed filters. Sort and search accept only the columns a module lists; the
 * repository turns them into SQL (`src/database/list-query.ts`).
 */

export const MAX_SORT_KEYS = 3;
export const MAX_SEARCH_LENGTH = 100;

export type SortDirection = 'asc' | 'desc';

/** One sort key, `field` in camelCase (the DTO side), as the repository maps it to a column. */
export interface SortKey<TField extends string = string> {
  field: TField;
  direction: SortDirection;
}

/** What a repository needs from a validated list query. */
export interface ListQuery<TField extends string = string> extends PaginationQueryDto {
  sort?: SortKey<TField>[];
  q?: string;
}

/** The `sort` parameter: wire text in, parsed sort keys out. */
export type SortQueryField<TField extends string> = z.ZodEffects<
  z.ZodOptional<z.ZodString>,
  SortKey<TField>[] | undefined,
  string | undefined
>;

/** Pagination + `sort`: the shape every list query starts from. */
export type ListQueryShape<TField extends string> = (typeof paginationQuerySchema)['shape'] & {
  sort: SortQueryField<TField>;
};

/** An optional `<prefix>_from` / `<prefix>_to` pair of instants. */
export type InstantRangeShape<TPrefix extends string> = Record<
  `${TPrefix}From` | `${TPrefix}To`,
  z.ZodOptional<typeof instantField>
>;

/**
 * `sort`: comma-separated wire names (snake_case), `-` for descending, at most `MAX_SORT_KEYS`,
 * each one once, only from `sortable` (camelCase). Absent = the repository's default order.
 */
export const sortQueryField = <TField extends string>(
  sortable: readonly [TField, ...TField[]],
): SortQueryField<TField> => {
  const byWire = new Map(sortable.map((field) => [toSnakeCase(field), field]));
  const allowed = [...byWire.keys()].join(', ');
  return z
    .string()
    .optional()
    .transform((raw, ctx): SortKey<TField>[] | undefined => {
      if (raw === undefined) return undefined;
      const parts = raw.split(',').map((part) => part.trim());
      if (parts.length > MAX_SORT_KEYS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `At most ${String(MAX_SORT_KEYS)} sort keys`,
        });
        return z.NEVER;
      }
      const keys: SortKey<TField>[] = [];
      for (const part of parts) {
        const descending = part.startsWith('-');
        const name = descending ? part.slice(1) : part;
        const field = byWire.get(name);
        if (field === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown sort field "${name}"; allowed: ${allowed}`,
          });
          return z.NEVER;
        }
        if (keys.some((key) => key.field === field)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Sort field "${name}" repeated` });
          return z.NEVER;
        }
        keys.push({ field, direction: descending ? 'desc' : 'asc' });
      }
      return keys;
    })
    .openapi({
      type: 'string',
      description: `Comma-separated, \`-\` = descending, at most ${String(MAX_SORT_KEYS)}; allowed: ${allowed}. Default: newest first`,
      example: `-${toSnakeCase(sortable[0])}`,
    });
};

/** `q`: free text, trimmed, 1–`MAX_SEARCH_LENGTH` characters, matched as a substring. */
export const searchQueryField = z
  .string()
  .trim()
  .min(1, 'Must not be empty')
  .max(MAX_SEARCH_LENGTH)
  .optional()
  .openapi({ description: 'Text searched in the listed columns (case-insensitive, substring)' });

/** A boolean filter: exactly `true` or `false` on the wire (a query string has no booleans). */
export const booleanQueryField = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional()
  .openapi({ type: 'boolean' });

/** The base of a list query: pagination + `sort` over `sortable`. Extend it with `q` and filters. */
export const listQuerySchema = <TField extends string>(
  sortable: readonly [TField, ...TField[]],
): z.ZodObject<ListQueryShape<TField>> =>
  paginationQuerySchema.extend({ sort: sortQueryField(sortable) });

/** `<prefix>_from` / `<prefix>_to`: an optional instant range, e.g. `created` → `createdFrom`, `createdTo`. */
export const instantRangeQuery = <TPrefix extends string>(
  prefix: TPrefix,
): InstantRangeShape<TPrefix> =>
  // Computed keys widen to `string`; the two keys are exactly the ones the type names.
  ({
    [`${prefix}From`]: instantField.optional(),
    [`${prefix}To`]: instantField.optional(),
  }) as InstantRangeShape<TPrefix>;

/**
 * Finishes a list query: an unknown parameter is a 400 naming it (a typo such as `sotr`, or `q` on
 * a list without search, would otherwise be dropped silently and return unfiltered rows), and each
 * `<prefix>_from` must not be after its `<prefix>_to`.
 */
export const strictListQuery = <TShape extends z.ZodRawShape>(
  schema: z.ZodObject<TShape>,
  { ranges = [] }: { ranges?: readonly string[] } = {},
): z.ZodEffects<z.ZodObject<TShape, 'passthrough'>> => {
  const known = new Set(Object.keys(schema.shape));
  return schema.passthrough().superRefine((value, ctx) => {
    for (const key of Object.keys(value)) {
      if (!known.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'Unknown query parameter',
        });
      }
    }
    const fields = value as Record<string, unknown>;
    for (const prefix of ranges) {
      const from = fields[`${prefix}From`];
      const to = fields[`${prefix}To`];
      if (
        from instanceof Temporal.Instant &&
        to instanceof Temporal.Instant &&
        Temporal.Instant.compare(from, to) > 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [`${prefix}To`],
          message: `Must not be before ${toSnakeCase(prefix)}_from`,
        });
      }
    }
  });
};
