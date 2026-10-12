import { describe, expect, it } from 'bun:test';
import { isPublicRoute, PUBLIC_ROUTES } from './public-routes';

describe('PUBLIC_ROUTES', () => {
  it('holds only the token-issuing / cookie endpoints of auth (keep this list short)', () => {
    expect(PUBLIC_ROUTES.map((route) => `${route.method} ${route.path}`)).toEqual([
      'POST /auth/login',
      'POST /auth/refresh',
      'POST /auth/logout',
      'POST /auth/register',
    ]);
  });

  it('matches by method and path', () => {
    expect(isPublicRoute('POST', '/auth/login')).toBe(true);
    expect(isPublicRoute('GET', '/auth/login')).toBe(false);
    expect(isPublicRoute('POST', '/auth/logout-all')).toBe(false);
    expect(isPublicRoute('GET', '/auth/me')).toBe(false);
    expect(isPublicRoute('GET', '/users')).toBe(false);
  });

  it('a public GET is public for HEAD too, nothing else', () => {
    const routes = [{ method: 'GET', path: '/status' }] as const;

    expect(isPublicRoute('HEAD', '/status', routes)).toBe(true);
    expect(isPublicRoute('POST', '/status', routes)).toBe(false);
    expect(isPublicRoute('HEAD', '/auth/login')).toBe(false);
  });
});
