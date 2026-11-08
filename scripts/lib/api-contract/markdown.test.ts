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
        'x-allowed-callers': ['self:id', 'permission:users.read'],
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
  ['GET /api/v1/projects/{projectId}/tasks', 'projects/project-tasks'],
]);

describe('renderContractMarkdown', () => {
  const files = renderContractMarkdown(document, owners);

  it('writes the index and one file per module, dependents in their parent subfolder', () => {
    expect([...files.keys()]).toEqual(['README.md', 'projects.md', 'projects/project-tasks.md']);
    expect(files.get('README.md')).toContain(
      '- [projects](projects.md) — 1 endpoint\n  - [project-tasks](projects/project-tasks.md) — 1 endpoint',
    );
    expect(files.get('README.md')).toContain('### `GET /`');
    expect(files.get('README.md')).toContain('| `ERR_CONFLICT` | 409 | `CONFLICT` |');
  });

  it('links parent and child both ways with paths relative to each file', () => {
    expect(files.get('projects.md')).toContain(
      '- [projects/project-tasks](projects/project-tasks.md)',
    );
    expect(files.get('projects/project-tasks.md')).toContain(
      '[Kontrak API](../README.md) › [projects](../projects.md) › project-tasks',
    );
  });

  it('documents access, fields, examples, messages and every error code of an endpoint', () => {
    const projects = files.get('projects.md') ?? '';
    expect(projects).toContain(
      '- Access token: `Authorization: Bearer <access_token>`\n- Hanya: pemilik resource (`id` = id Anda) atau permission `users.read`',
    );
    expect(projects).toContain('| `name` | string | ya | panjang ≥ 1; panjang ≤ 120 |');
    expect(projects).toContain('| `budget` | integer \\| null | tidak |  |');
    expect(projects).toContain('"name": "string"');
    expect(projects).toContain('Pesan: `Created (id)` (en: `Created`)');
    expect(projects).toContain('"status_code": 201');
    expect(projects).toContain('| 409 | `ERR_CONFLICT` |');
    expect(projects).toContain('"field": "name"');
    const tasks = files.get('projects/project-tasks.md') ?? '';
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

  describe('a module with several routers (D68: one per resource)', () => {
    // projects.routes.ts and projects-tasks.routes.ts both in the module `projects` here.
    const owners = new Map([
      ['POST /api/v1/projects', 'projects'],
      ['GET /api/v1/projects/{projectId}/tasks', 'projects'],
    ]);
    const routers = new Map([
      ['POST /api/v1/projects', 'projects'],
      ['GET /api/v1/projects/{projectId}/tasks', 'projects-tasks'],
    ]);
    const split = renderContractMarkdown(document, owners, routers);

    it('gets an index file and one file per router, named without the module prefix', () => {
      expect([...split.keys()]).toEqual([
        'README.md',
        'projects.md',
        'projects/projects.md',
        'projects/tasks.md',
      ]);
      expect(split.get('README.md')).toContain(
        '- [projects](projects.md) — 2 endpoint\n  - [projects](projects/projects.md) — 1 endpoint\n  - [tasks](projects/tasks.md) — 1 endpoint',
      );
    });

    it('the index lists every endpoint with its router file; each router file holds the details', () => {
      const index = split.get('projects.md') ?? '';
      expect(index).toContain('| [tasks](projects/tasks.md) | 1 |');
      expect(index).toContain(
        '| `GET /api/v1/projects/{projectId}/tasks` | List tasks | [tasks](projects/tasks.md) |',
      );
      // The index carries no endpoint details: those live in the router files only.
      expect(index).not.toContain('## `GET /api/v1/projects/{projectId}/tasks`');
      const tasks = split.get('projects/tasks.md') ?? '';
      expect(tasks).toContain('# Tasks (`projects/tasks`)');
      expect(tasks).toContain('[Kontrak API](../README.md) › [projects](../projects.md) › tasks');
      expect(tasks).toContain('## `GET /api/v1/projects/{projectId}/tasks`');
    });

    it('a file spanning several tags names them all, not the tag of the endpoint that sorts first', () => {
      expect(split.get('projects.md')).toContain('# Projects · Tasks (`projects`)');
      expect(files.get('projects.md')).toContain('# Projects (`projects`)');
    });

    it('one router: one file, as before', () => {
      const single = new Map([
        ['POST /api/v1/projects', 'projects'],
        ['GET /api/v1/projects/{projectId}/tasks', 'projects-tasks'],
      ]);
      expect([
        ...renderContractMarkdown(
          document,
          new Map([
            ['POST /api/v1/projects', 'projects'],
            ['GET /api/v1/projects/{projectId}/tasks', 'projects/project-tasks'],
          ]),
          single,
        ).keys(),
      ]).toEqual(['README.md', 'projects.md', 'projects/project-tasks.md']);
    });

    it('refuses a router file that would take the file of a dependent module', () => {
      expect(() =>
        renderContractMarkdown(
          document,
          new Map([
            ['POST /api/v1/projects', 'projects'],
            ['GET /api/v1/projects/{projectId}/tasks', 'projects/project-tasks'],
            ['GET /', 'projects'],
          ]),
          new Map([
            ['POST /api/v1/projects', 'projects'],
            ['GET /', 'projects-project-tasks'],
          ]),
        ),
      ).toThrow(
        'projects: a router file and a dependent module would share projects/project-tasks.md',
      );
    });
  });
});
