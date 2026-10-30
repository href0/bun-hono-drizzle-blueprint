import { describe, expect, it } from 'bun:test';
import { compare, type Severity } from './compare';
import { flatten } from './flatten';

type Json = Record<string, unknown>;
type SideName = 'request' | 'response';

const object = (properties: Json, required: string[] = []): Json => ({
  type: 'object',
  properties,
  required,
});
const str: Json = { type: 'string' };

/** One operation whose request body (or 200 response body) is `schema`. */
const documentWith = (side: SideName, schema: Json): Json => ({
  paths: {
    '/items': {
      post:
        side === 'request'
          ? {
              requestBody: { required: true, content: { 'application/json': { schema } } },
              responses: { '201': { description: 'Created' } },
            }
          : {
              responses: {
                '200': { description: 'OK', content: { 'application/json': { schema } } },
              },
            },
    },
  },
});

const severities = (side: SideName, before: Json, after: Json): Severity[] =>
  compare(flatten(documentWith(side, before)), flatten(documentWith(side, after))).map(
    (change) => change.severity,
  );

/** The classification table of D34 (docs/standards/openapi.md §6), one row per case, request and response side. */
const TABLE: {
  change: string;
  before: Json;
  after: Json;
  request: Severity;
  response: Severity;
}[] = [
  {
    change: 'optional field added',
    before: object({ a: str }),
    after: object({ a: str, b: str }),
    request: 'safe',
    response: 'safe',
  },
  {
    change: 'required field added',
    before: object({ a: str }),
    after: object({ a: str, b: str }, ['b']),
    request: 'BREAKING',
    response: 'safe',
  },
  {
    change: 'field removed',
    before: object({ a: str, b: str }),
    after: object({ a: str }),
    request: 'BREAKING',
    response: 'BREAKING',
  },
  {
    change: 'optional → required',
    before: object({ a: str }),
    after: object({ a: str }, ['a']),
    request: 'BREAKING',
    response: 'safe',
  },
  {
    change: 'required → optional',
    before: object({ a: str }, ['a']),
    after: object({ a: str }),
    request: 'safe',
    response: 'BREAKING',
  },
  {
    change: 'becomes nullable',
    before: object({ a: str }),
    after: object({ a: { type: ['string', 'null'] } }),
    request: 'safe',
    response: 'BREAKING',
  },
  {
    change: 'type changed',
    before: object({ a: str }),
    after: object({ a: { type: 'integer' } }),
    request: 'BREAKING',
    response: 'BREAKING',
  },
  {
    change: 'format changed',
    before: object({ a: str }),
    after: object({ a: { type: 'string', format: 'uuid' } }),
    request: 'BREAKING',
    response: 'BREAKING',
  },
  {
    change: 'enum value added',
    before: object({ a: { type: 'string', enum: ['x'] } }),
    after: object({ a: { type: 'string', enum: ['x', 'y'] } }),
    request: 'safe',
    response: 'BREAKING',
  },
  {
    change: 'enum value removed',
    before: object({ a: { type: 'string', enum: ['x', 'y'] } }),
    after: object({ a: { type: 'string', enum: ['x'] } }),
    request: 'BREAKING',
    response: 'safe',
  },
  {
    change: 'bound tightened: maxLength lowered',
    before: object({ a: { type: 'string', maxLength: 10 } }),
    after: object({ a: { type: 'string', maxLength: 5 } }),
    request: 'BREAKING',
    response: 'safe',
  },
  {
    change: 'bound tightened: minimum raised',
    before: object({ a: { type: 'integer', minimum: 0 } }),
    after: object({ a: { type: 'integer', minimum: 1 } }),
    request: 'BREAKING',
    response: 'safe',
  },
  {
    change: 'bound tightened: pattern changed',
    before: object({ a: { type: 'string', pattern: '^a' } }),
    after: object({ a: { type: 'string', pattern: '^b' } }),
    request: 'BREAKING',
    response: 'safe',
  },
  {
    change: 'bound loosened: maxLength raised',
    before: object({ a: { type: 'string', maxLength: 5 } }),
    after: object({ a: { type: 'string', maxLength: 10 } }),
    request: 'safe',
    response: 'safe',
  },
  {
    change: 'bound loosened: pattern removed',
    before: object({ a: { type: 'string', pattern: '^a' } }),
    after: object({ a: str }),
    request: 'safe',
    response: 'safe',
  },
  {
    change: 'description changed',
    before: object({ a: { type: 'string', description: 'old' } }),
    after: object({ a: { type: 'string', description: 'new' } }),
    request: 'docs',
    response: 'docs',
  },
];

describe('compare: classification table (request vs response)', () => {
  for (const row of TABLE) {
    it(`${row.change}: request ${row.request}, response ${row.response}`, () => {
      expect(severities('request', row.before, row.after)).toEqual([row.request]);
      expect(severities('response', row.before, row.after)).toEqual([row.response]);
    });
  }
});

/** A document with the given operations (`'GET /a'` → operation object). */
const api = (operations: Record<string, Json>, components: Json = {}): Json => {
  const paths: Record<string, Json> = {};
  for (const [key, operation] of Object.entries(operations)) {
    const [method = '', path = ''] = key.split(' ');
    paths[path] = { ...(paths[path] ?? {}), [method.toLowerCase()]: operation };
  }
  return { paths, components };
};
const ok = (status = '200'): Json => ({ responses: { [status]: { description: 'OK' } } });
const changesOf = (before: Json, after: Json): string[] =>
  compare(flatten(before), flatten(after)).map(
    ({ change, severity }) =>
      `${severity} ${change.fact.operation} | ${change.fact.location} ${change.kind === 'changed' ? change.attribute : change.kind}`,
  );

describe('compare: operations, statuses and security', () => {
  it('operation removed = BREAKING, operation added = safe', () => {
    expect(changesOf(api({ 'GET /a': ok() }), api({ 'GET /b': ok() }))).toEqual([
      'BREAKING GET /a | operation removed',
      'safe GET /b | operation added',
    ]);
  });

  it('success status changed (200 → 201) = BREAKING; an error status added = safe', () => {
    expect(changesOf(api({ 'POST /a': ok('200') }), api({ 'POST /a': ok('201') }))).toEqual([
      'BREAKING POST /a | response 200 removed',
      'safe POST /a | response 201 added',
    ]);
    const withError = { responses: { '200': { description: 'OK' }, '409': { description: 'x' } } };
    expect(changesOf(api({ 'POST /a': ok() }), api({ 'POST /a': withError }))).toEqual([
      'safe POST /a | response 409 added',
    ]);
  });

  it('security tightened or its scheme replaced = BREAKING; loosened or an alternative added = safe', () => {
    const secured = (...requirements: Json[]): Json => ({ ...ok(), security: requirements });
    const bearer = { bearerAuth: [] };
    const partner = { partnerKey: [] };
    const cases: [Json, Json, string][] = [
      [ok(), secured(bearer), 'BREAKING GET /a | security added'],
      [secured(bearer), ok(), 'safe GET /a | security removed'],
      [secured(bearer), secured(partner), 'BREAKING GET /a | security requirements'],
      [
        secured(bearer),
        secured({ bearerAuth: [], partnerKey: [] }),
        'BREAKING GET /a | security requirements',
      ],
      [secured(bearer), secured(bearer, partner), 'safe GET /a | security requirements'],
    ];
    for (const [before, after, expected] of cases) {
      expect(changesOf(api({ 'GET /a': before }), api({ 'GET /a': after }))).toEqual([expected]);
    }
  });

  it('summary / tags changes are docs', () => {
    expect(
      changesOf(
        api({ 'GET /a': { ...ok(), summary: 'Old' } }),
        api({ 'GET /a': { ...ok(), summary: 'New' } }),
      ),
    ).toEqual(['docs GET /a | operation summary']);
  });

  it('error codes changed = safe, success messages changed = docs (generated contract)', () => {
    const withExtras = (codes: string[], message: string): Json => ({
      responses: {
        '200': { description: 'OK', 'x-success-messages': [{ id: message, en: message }] },
        '404': { description: 'x', 'x-error-codes': codes },
      },
    });
    expect(
      changesOf(
        api({ 'GET /a': withExtras(['ERR_NOT_FOUND'], 'Old') }),
        api({ 'GET /a': withExtras(['ERR_NOT_FOUND', 'ERR_ROUTE_NOT_FOUND'], 'New') }),
      ),
    ).toEqual([
      'docs GET /a | response 200 x-success-messages',
      'safe GET /a | response 404 x-error-codes',
    ]);
  });

  it('object key order inside an attribute is not a change (the snapshot is written with sorted keys)', () => {
    const message = (value: Record<string, string>): Json => ({
      responses: { '200': { description: 'OK', 'x-success-messages': [value] } },
    });
    expect(
      changesOf(
        api({ 'GET /a': message({ en: 'Hi', id: 'Hai' }) }),
        api({ 'GET /a': message({ id: 'Hai', en: 'Hi' }) }),
      ),
    ).toEqual([]);
  });

  it('allowed callers narrowed (restriction added, caller removed) = BREAKING; widened = safe', () => {
    const callers = (...list: string[]): Json => ({ ...ok(), 'x-allowed-callers': list });
    const cases: [Json, Json, string][] = [
      [ok(), callers('admin'), 'BREAKING GET /a | operation x-allowed-callers'],
      [
        callers('self:id', 'admin'),
        callers('admin'),
        'BREAKING GET /a | operation x-allowed-callers',
      ],
      [callers('admin'), callers('self:id', 'admin'), 'safe GET /a | operation x-allowed-callers'],
      [callers('admin'), ok(), 'safe GET /a | operation x-allowed-callers'],
    ];
    for (const [before, after, expected] of cases) {
      expect(changesOf(api({ 'GET /a': before }), api({ 'GET /a': after }))).toEqual([expected]);
    }
  });

  it('a new required parameter = BREAKING, a new optional one = safe', () => {
    const withParam = (required: boolean): Json => ({
      ...ok(),
      parameters: [{ in: 'query', name: 'q', required, schema: str }],
    });
    expect(changesOf(api({ 'GET /a': ok() }), api({ 'GET /a': withParam(true) }))).toEqual([
      'BREAKING GET /a | query q added',
    ]);
    expect(changesOf(api({ 'GET /a': ok() }), api({ 'GET /a': withParam(false) }))).toEqual([
      'safe GET /a | query q added',
    ]);
  });
});

describe('compare: shared components and nesting', () => {
  it('a changed shared $ref shows up in every operation that uses it', () => {
    const using = {
      responses: {
        '200': {
          description: 'OK',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } },
        },
      },
    };
    const before = api(
      { 'GET /a': using, 'GET /b': using },
      { schemas: { Item: object({ id: str, name: str }) } },
    );
    const after = api(
      { 'GET /a': using, 'GET /b': using },
      { schemas: { Item: object({ id: str }) } },
    );
    expect(changesOf(before, after)).toEqual([
      'BREAKING GET /a | response 200 body.name removed',
      'BREAKING GET /b | response 200 body.name removed',
    ]);
  });

  it('a new optional object hides its required children (one safe change, not several)', () => {
    const before = object({ a: str });
    const after = object({ a: str, b: object({ c: str, d: str }, ['c', 'd']) });
    expect(severities('request', before, after)).toEqual(['safe']);
  });

  it('array items, X | null and real unions are distinct locations', () => {
    const before = object({ list: { type: 'array', items: str } });
    const after = object({ list: { type: 'array', items: { type: 'integer' } } });
    expect(changesOf(documentWith('request', before), documentWith('request', after))).toEqual([
      'BREAKING POST /items | body.list[] type',
    ]);
    const nullable = object({ a: { anyOf: [str, { type: 'null' }] } });
    const union = object({ a: { anyOf: [str, { type: 'integer' }] } });
    expect(
      changesOf(documentWith('response', object({ a: str })), documentWith('response', nullable)),
    ).toEqual(['BREAKING POST /items | response 200 body.a nullable']);
    expect(
      changesOf(documentWith('response', object({ a: str })), documentWith('response', union)),
    ).toContain('BREAKING POST /items | response 200 body.a type');
  });

  it('a keyword the engine does not know is kept and assumed BREAKING', () => {
    const before = object({ a: str });
    const after = object({ a: { type: 'string', contentEncoding: 'base64' } });
    expect(severities('response', before, after)).toEqual(['BREAKING']);
  });

  it('identical documents have no changes; an unknown $ref fails loudly', () => {
    const doc = api({ 'GET /a': ok() });
    expect(compare(flatten(doc), flatten(doc))).toEqual([]);
    const broken = documentWith('response', { $ref: '#/components/schemas/Missing' });
    expect(() => flatten(broken)).toThrow('unresolvable $ref');
  });
});
