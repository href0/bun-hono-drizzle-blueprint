import { describe, expect, it } from 'bun:test';
import { matchRoutePattern } from './route-match.util';

describe('matchRoutePattern', () => {
  it('matches literal paths exactly (case-sensitive, no trailing slash)', () => {
    expect(matchRoutePattern('/auth/login', '/auth/login')).toBe(true);
    expect(matchRoutePattern('/auth/login', '/auth/Login')).toBe(false);
    expect(matchRoutePattern('/auth/login', '/auth/login/')).toBe(false);
    expect(matchRoutePattern('/auth/login', '/auth/login/x')).toBe(false);
    expect(matchRoutePattern('/auth/login', '/auth')).toBe(false);
    expect(matchRoutePattern('/', '/')).toBe(true);
    expect(matchRoutePattern('/', '/x')).toBe(false);
  });

  it(':param matches exactly one non-empty segment', () => {
    expect(matchRoutePattern('/users/:id', '/users/42')).toBe(true);
    expect(matchRoutePattern('/users/:id', '/users')).toBe(false);
    expect(matchRoutePattern('/users/:id', '/users/42/posts')).toBe(false);
    expect(matchRoutePattern('/users/:id/posts', '/users/42/posts')).toBe(true);
  });

  it('a trailing * covers the prefix and everything below it, on segment boundaries', () => {
    expect(matchRoutePattern('/partner/*', '/partner')).toBe(true);
    expect(matchRoutePattern('/partner/*', '/partner/ping')).toBe(true);
    expect(matchRoutePattern('/partner/*', '/partner/a/b')).toBe(true);
    expect(matchRoutePattern('/partner/*', '/partners')).toBe(false);
    expect(matchRoutePattern('/partner/*', '/')).toBe(false);
  });

  it('never matches paths with dot or empty segments, or relative paths', () => {
    for (const path of ['/partner/../users', '/partner/./x', '/auth//login', 'auth/login', '']) {
      expect(matchRoutePattern('/partner/*', path)).toBe(false);
      expect(matchRoutePattern('/auth/login', path)).toBe(false);
    }
    expect(matchRoutePattern('auth/login', '/auth/login')).toBe(false);
  });
});
