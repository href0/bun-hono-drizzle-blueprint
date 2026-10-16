import { describe, expect, it } from 'bun:test';
import { renderContractMarkdown } from './markdown';

const errorResponse = (codes: string[]): Record<string, unknown> => ({
  description: 'x',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
  'x-error-codes': codes,
});
const success = (message: string, schema: Record<string, unknown>): Record<string, unknown> => ({
  description: 'OK',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { const: true },
          status_code: { type: 'integer' },
          message: { type: 'string' },
          data: schema,
        },
      },
    },
  },
  'x-success-messages': [{ id: `${message} (id)`, en: message }],
});

const document = {
  openapi: '3.1.0',
  components: { schemas: { ErrorEnvelope: { type: 'object' } } },
  paths: {
    '/': {
      get: {
        tags: ['Service'],
        summary: 'Service identity',
        responses: { '200': success('Online', { type: 'object' }) },
      },
    },
    '/api/v1/projects': {
      post: {
        tags: ['Projects'],
        summary: 'Create a project',
        security: [{ bearerAuth: [] }],
        'x-allowed-callers': ['admin'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 120 },
                  budget: { type: ['integer', 'null'] },
                },
              },
            },
          },
        },
        responses: {
          '201': success('Created', {
            type: 'object',
            properties: { id: { type: 'string', format: 'uuid' } },
          }),
          '400': errorResponse(['ERR_INVALID_INPUT']),
          '409': errorResponse(['ERR_CONFLICT']),
        },
      },
    },
    '/api/v1/projects/{projectId}/tasks': {
      get: {
        tags: ['Tasks'],
        summary: 'List tasks',
        parameters: [
          {
            in: 'path',
            name: 'projectId',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': success('Tasks', { type: 'array', items: { type: 'string' } }),
          '404': errorResponse(['ERR_NOT_FOUND']),
        },
      },
    },
  },
};
const owners = new Map([
  ['POST /api/v1/projects', 'projects'],
  ['GET /api/v1/projects/{projectId}/tasks', 'projects/tasks'],
]);

describe('renderContractMarkdown', () => {
  const files = renderContractMarkdown(document, owners);

  it('writes the index and one file per module, dependents in their parent subfolder', () => {
    expect([...files.keys()]).toEqual(['README.md', 'projects.md', 'projects/tasks.md']);
    expect(files.get('README.md')).toContain(
      '- [projects](projects.md) — 1 endpoint\n  - [tasks](projects/tasks.md) — 1 endpoint',
    );
    expect(files.get('README.md')).toContain('### `GET /`');
    expect(files.get('README.md')).toContain('| `ERR_CONFLICT` | 409 | `CONFLICT` |');
  });

  it('links parent and child both ways with paths relative to each file', () => {
    expect(files.get('projects.md')).toContain('- [projects/tasks](projects/tasks.md)');
    expect(files.get('projects/tasks.md')).toContain(
      '[Kontrak API](../README.md) › [projects](../projects.md) › tasks',
    );
  });

  it('documents access, fields, examples, messages and every error code of an endpoint', () => {
    const projects = files.get('projects.md') ?? '';
    expect(projects).toContain(
      '- Access token: `Authorization: Bearer <access_token>`\n- Hanya: role `admin`',
    );
    expect(projects).toContain('| `name` | string | ya | panjang ≥ 1; panjang ≤ 120 |');
    expect(projects).toContain('| `budget` | integer \\| null | tidak |  |');
    expect(projects).toContain('"name": "string"');
    expect(projects).toContain('Pesan: `Created (id)` (en: `Created`)');
    expect(projects).toContain('"status_code": 201');
    expect(projects).toContain('| 409 | `ERR_CONFLICT` |');
    expect(projects).toContain('"field": "name"');
    const tasks = files.get('projects/tasks.md') ?? '';
    expect(tasks).toContain(`GET /api/v1/projects/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/tasks`);
  });

  it('is deterministic', () => {
    expect(renderContractMarkdown(document, owners)).toEqual(files);
  });

  it('refuses an operation that belongs to no module and is not a Platform route', () => {
    expect(() =>
      renderContractMarkdown(document, new Map([['POST /api/v1/projects', 'projects']])),
    ).toThrow('GET /api/v1/projects/{projectId}/tasks');
  });
});
