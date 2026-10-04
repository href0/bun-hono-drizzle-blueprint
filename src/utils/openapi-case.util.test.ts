import { describe, expect, it } from 'bun:test';
import { toSnakeCaseOpenApi } from './openapi-case.util';

describe('toSnakeCaseOpenApi', () => {
  it('converts schema property names and required lists, at any depth', () => {
    const doc: unknown = {
      components: {
        schemas: {
          UserEnvelope: {
            type: 'object',
            properties: {
              statusCode: { type: 'integer' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { fullName: { type: 'string' } },
                  required: ['fullName'],
                },
              },
            },
            required: ['statusCode'],
          },
        },
      },
    };

    expect(toSnakeCaseOpenApi(doc)).toEqual({
      components: {
        schemas: {
          UserEnvelope: {
            type: 'object',
            properties: {
              status_code: { type: 'integer' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { full_name: { type: 'string' } },
                  required: ['full_name'],
                },
              },
            },
            required: ['status_code'],
          },
        },
      },
    });
  });

  it('renames query parameters but keeps path parameters (they must match the route template)', () => {
    const parameters = [
      { in: 'query', name: 'perPage', required: false },
      { in: 'path', name: 'childId', required: true },
    ];
    expect(toSnakeCaseOpenApi({ parameters })).toEqual({
      parameters: [
        { in: 'query', name: 'per_page', required: false },
        { in: 'path', name: 'childId', required: true },
      ],
    });
  });

  it('leaves component names, operation ids, boolean `required` and non-string entries alone', () => {
    const doc = {
      operationId: 'getApiV1Users',
      requestBody: { required: true },
      required: ['someField', 3],
      components: { schemas: { ErrorEnvelope: { $ref: '#/components/schemas/ErrorEnvelope' } } },
    };
    expect(toSnakeCaseOpenApi(doc)).toEqual({ ...doc, required: ['some_field', 3] });
  });
});
