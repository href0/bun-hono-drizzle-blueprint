import { describe, expect, it } from 'bun:test';
import { permissionEndpointsOf } from './permission-endpoints';

describe('permissionEndpointsOf', () => {
  it('lists, per permission key, every operation whose x-allowed-callers names it — sorted by path, then method', () => {
    const endpoints = permissionEndpointsOf({
      paths: {
        '/api/v1/orders/{id}': {
          get: { summary: 'Get an order', 'x-allowed-callers': ['permission:orders.read'] },
          delete: { summary: 'Delete an order', 'x-allowed-callers': ['permission:orders.delete'] },
          parameters: [{ name: 'id' }],
        },
        '/api/v1/orders': {
          get: { summary: 'List orders', 'x-allowed-callers': ['permission:orders.read'] },
        },
        '/api/v1/users/{id}': {
          get: {
            summary: 'Get a user',
            'x-allowed-callers': ['self:id', 'permission:users.read'],
          },
        },
        '/api/v1/auth/me': { get: { summary: 'Me', 'x-allowed-callers': ['any-user'] } },
        '/api/v1/auth/login': { post: { summary: 'Log in' } },
      },
    });

    expect(Object.fromEntries(endpoints)).toEqual({
      'orders.read': [
        { method: 'GET', path: '/api/v1/orders', summary: 'List orders' },
        { method: 'GET', path: '/api/v1/orders/{id}', summary: 'Get an order' },
      ],
      'orders.delete': [
        { method: 'DELETE', path: '/api/v1/orders/{id}', summary: 'Delete an order' },
      ],
      'users.read': [{ method: 'GET', path: '/api/v1/users/{id}', summary: 'Get a user' }],
    });
  });

  it('orders two methods on one path, tolerates a missing summary, odd callers and no paths', () => {
    const endpoints = permissionEndpointsOf({
      paths: {
        '/x': {
          put: { 'x-allowed-callers': ['permission:x.update', 7] },
          patch: { summary: 'Patch x', 'x-allowed-callers': ['permission:x.update'] },
          post: { summary: 'No callers', 'x-allowed-callers': 'permission:x.update' },
        },
        '/y': undefined,
      },
    });

    expect(endpoints.get('x.update')).toEqual([
      { method: 'PATCH', path: '/x', summary: 'Patch x' },
      { method: 'PUT', path: '/x', summary: '' },
    ]);
    expect(permissionEndpointsOf({}).size).toBe(0);
  });
});
