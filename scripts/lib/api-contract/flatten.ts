/**
 * Flattens an OpenAPI 3.1 document into facts: one per operation, security requirement, parameter,
 * body / response node and response header — each with its attributes (`type`, `required`,
 * `enum`, bounds, …). `$ref`s are resolved first, so a change to a shared component shows up in
 * every operation that uses it. Pure: the comparison (compare.ts) works on these facts only.
 */

/** Which side of the exchange a fact belongs to: decides how a change is classified. */
export type Side = 'operation' | 'request' | 'response';

export interface Fact {
  /** `METHOD /path`, e.g. `GET /api/v1/users/{id}`. */
  operation: string;
  side: Side;
  /** Human-readable location inside the operation, e.g. `query page`, `response 200.data.email`. */
  location: string;
  /** Key of the enclosing fact (`undefined` for the operation itself). */
  parent?: string;
  attributes: Record<string, string>;
}

export const factKey = (operation: string, location: string): string =>
  `${operation} | ${location}`;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

/** Schema keywords recorded as attributes (their value as canonical JSON). */
const SCHEMA_ATTRIBUTES = [
  'format',
  'const',
  'default',
  'pattern',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'description',
  'example',
  'examples',
  'title',
  'deprecated',
] as const;

/** Keywords that hold sub-schemas or are recorded in another form. */
const STRUCTURAL = new Set([
  'type',
  'enum',
  'properties',
  'required',
  'items',
  'additionalProperties',
  'anyOf',
  'oneOf',
  'allOf',
  '$ref',
  ...SCHEMA_ATTRIBUTES,
]);

/** JSON with object keys sorted at every level: key order is never a contract change. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, nested: unknown) =>
    isObject(nested)
      ? Object.fromEntries(
          Object.keys(nested)
            .sort()
            .map((key) => [key, nested[key]]),
        )
      : nested,
  );

const resolveRef = (root: Json, ref: string): Json => {
  if (!ref.startsWith('#/')) throw new Error(`external $ref not supported: ${ref}`);
  let node: unknown = root;
  for (const segment of ref.slice(2).split('/')) {
    node = isObject(node) ? new Map(Object.entries(node)).get(segment) : undefined;
  }
  if (!isObject(node)) throw new Error(`unresolvable $ref: ${ref}`);
  return node;
};

class Flattener {
  readonly facts = new Map<string, Fact>();

  constructor(private readonly root: Json) {}

  add(fact: Fact): string {
    const key = factKey(fact.operation, fact.location);
    if (this.facts.has(key)) throw new Error(`duplicate location: ${key}`);
    this.facts.set(key, fact);
    return key;
  }

  /** A `$ref`-free view of a node (refs followed, cycles refused). */
  deref(node: unknown, seen: readonly string[] = []): Json {
    if (!isObject(node)) return {};
    const ref = node.$ref;
    if (typeof ref !== 'string') return node;
    if (seen.includes(ref)) throw new Error(`recursive $ref not supported: ${ref}`);
    return this.deref(resolveRef(this.root, ref), [...seen, ref]);
  }

  /**
   * One fact per schema node: `required` (from the parent), `type`, `nullable`, `enum`, bounds and
   * any keyword this engine does not know (kept, so a change to it is never silent).
   */
  schema(
    node: unknown,
    at: { operation: string; side: Side; location: string; parent: string },
    extra: Record<string, string> = {},
  ): void {
    const schema = this.mergeAllOf(this.deref(node));
    const variants = [schema.anyOf, schema.oneOf].find(Array.isArray) as unknown[] | undefined;
    const derefVariants = (variants ?? []).map((variant) => this.mergeAllOf(this.deref(variant)));
    const nonNull = derefVariants.filter((variant) => variant.type !== 'null');
    const nullable =
      (Array.isArray(schema.type) && schema.type.includes('null')) ||
      nonNull.length < derefVariants.length;

    // `X | null` is one node with `nullable`; real unions get one child per variant.
    const single = derefVariants.length > 0 && nonNull.length === 1 ? nonNull[0] : undefined;
    const effective: Json = single ? { ...schema, ...single } : schema;

    const types = (Array.isArray(effective.type) ? effective.type : [effective.type])
      .filter((type): type is string => typeof type === 'string' && type !== 'null')
      .sort();
    const attributes: Record<string, string> = { ...extra };
    if (types.length > 0) attributes.type = types.join('|');
    else if (nonNull.length > 1) attributes.type = 'union';
    else if (isObject(effective.properties)) attributes.type = 'object';
    if (nullable) attributes.nullable = 'true';
    if (Array.isArray(effective.enum)) {
      attributes.enum = canonical([...(effective.enum as unknown[])].map(canonical).sort());
    }
    for (const keyword of SCHEMA_ATTRIBUTES) {
      if (keyword in effective) attributes[keyword] = canonical(effective[keyword]);
    }
    if (effective.additionalProperties === false) attributes.additionalProperties = 'false';
    for (const [keyword, value] of Object.entries(effective)) {
      if (!STRUCTURAL.has(keyword)) attributes[`x:${keyword}`] = canonical(value);
    }
    const key = this.add({ ...at, attributes });

    const child = (suffix: string): typeof at => ({
      operation: at.operation,
      side: at.side,
      location: `${at.location}${suffix}`,
      parent: key,
    });
    if (isObject(effective.properties)) {
      const required = Array.isArray(effective.required) ? effective.required : [];
      for (const name of Object.keys(effective.properties).sort()) {
        this.schema(effective.properties[name], child(`.${name}`), {
          required: String(required.includes(name)),
        });
      }
    }
    if (effective.items !== undefined) this.schema(effective.items, child('[]'));
    if (isObject(effective.additionalProperties)) {
      this.schema(effective.additionalProperties, child('{*}'));
    }
    if (!single && nonNull.length > 1) {
      nonNull.forEach((variant, index) => {
        this.schema(variant, child(`<${String(index)}>`));
      });
    }
  }

  /** `allOf` merged into one schema (properties and `required` combined). */
  private mergeAllOf(schema: Json): Json {
    if (!Array.isArray(schema.allOf)) return schema;
    const { allOf, ...rest } = schema;
    return (allOf as unknown[])
      .map((part) => this.mergeAllOf(this.deref(part)))
      .reduce<Json>(
        (merged, part) => ({
          ...merged,
          ...part,
          properties: {
            ...(isObject(merged.properties) ? merged.properties : {}),
            ...(isObject(part.properties) ? part.properties : {}),
          },
          required: [
            ...(Array.isArray(merged.required) ? (merged.required as unknown[]) : []),
            ...(Array.isArray(part.required) ? (part.required as unknown[]) : []),
          ],
        }),
        rest,
      );
  }
}

const docAttributes = (source: Json, keywords: readonly string[]): Record<string, string> =>
  Object.fromEntries(
    keywords.filter((keyword) => keyword in source).map((k) => [k, canonical(source[k])]),
  );

/** Operation keys recorded as attributes: text, and who may call it (`requireRole()` & co.). */
const OPERATION_ATTRIBUTES = [
  'summary',
  'description',
  'tags',
  'operationId',
  'deprecated',
  'x-allowed-callers',
] as const;
/** Response keys recorded as attributes: text, error codes, success messages (`describeEndpoint()`). */
const RESPONSE_ATTRIBUTES = ['description', 'x-error-codes', 'x-success-messages'] as const;

/** Every fact of the document, keyed by `factKey(operation, location)`. */
export const flatten = (document: unknown): Map<string, Fact> => {
  if (!isObject(document) || !isObject(document.paths)) throw new Error('not an OpenAPI document');
  const flattener = new Flattener(document);

  for (const path of Object.keys(document.paths).sort()) {
    const item = flattener.deref(document.paths[path]);
    for (const method of Object.keys(item).sort()) {
      if (!HTTP_METHODS.has(method)) continue;
      const op = flattener.deref(item[method]);
      const operation = `${method.toUpperCase()} ${path}`;
      const opKey = flattener.add({
        operation,
        side: 'operation',
        location: 'operation',
        attributes: docAttributes(op, OPERATION_ATTRIBUTES),
      });

      const security = Array.isArray(op.security) ? op.security : [];
      if (security.length > 0) {
        flattener.add({
          operation,
          side: 'request',
          location: 'security',
          parent: opKey,
          attributes: {
            requirements: canonical(
              security
                .map((requirement) =>
                  Object.keys(isObject(requirement) ? requirement : {})
                    .sort()
                    .join('+'),
                )
                .sort(),
            ),
          },
        });
      }

      for (const raw of Array.isArray(op.parameters) ? op.parameters : []) {
        const parameter = flattener.deref(raw);
        const location = `${String(parameter.in)} ${String(parameter.name)}`;
        flattener.schema(
          parameter.schema,
          { operation, side: 'request', location, parent: opKey },
          {
            required: String(parameter.required === true),
            ...docAttributes(parameter, ['description', 'example', 'deprecated']),
          },
        );
      }

      const body = flattener.deref(op.requestBody);
      if (isObject(body.content)) {
        for (const mediaType of Object.keys(body.content).sort()) {
          const media = flattener.deref(body.content[mediaType]);
          const location = mediaType === 'application/json' ? 'body' : `body(${mediaType})`;
          flattener.schema(
            media.schema,
            { operation, side: 'request', location, parent: opKey },
            { required: String(body.required === true) },
          );
        }
      }

      const responses = flattener.deref(op.responses);
      for (const status of Object.keys(responses).sort()) {
        const response = flattener.deref(responses[status]);
        const responseKey = flattener.add({
          operation,
          side: 'response',
          location: `response ${status}`,
          parent: opKey,
          attributes: docAttributes(response, RESPONSE_ATTRIBUTES),
        });
        const headers = flattener.deref(response.headers);
        for (const name of Object.keys(headers).sort()) {
          const header = flattener.deref(headers[name]);
          flattener.schema(
            header.schema,
            {
              operation,
              side: 'response',
              location: `response ${status} header ${name}`,
              parent: responseKey,
            },
            {
              required: String(header.required === true),
              ...docAttributes(header, ['description']),
            },
          );
        }
        const content = flattener.deref(response.content);
        for (const mediaType of Object.keys(content).sort()) {
          const media = flattener.deref(content[mediaType]);
          const suffix = mediaType === 'application/json' ? '' : `(${mediaType})`;
          flattener.schema(media.schema, {
            operation,
            side: 'response',
            location: `response ${status}${suffix}`.concat(' body'),
            parent: responseKey,
          });
        }
      }
    }
  }
  return flattener.facts;
};
