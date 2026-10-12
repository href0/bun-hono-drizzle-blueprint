const segmentsOf = (path: string): string[] => path.split('/').slice(1);

/**
 * Whether `path` matches a route `pattern`:
 * - a literal segment matches itself exactly (case-sensitive, like the router);
 * - `:name` matches any one non-empty segment;
 * - a trailing `*` matches the prefix itself and everything below it, on segment boundaries
 *   (`/partner/*` matches `/partner` and `/partner/a/b`, never `/partners`).
 *
 * Paths with `.` / `..` or empty segments (`//`, a trailing `/`) never match: they are not routes,
 * and a matcher that tolerated them would let an odd path slip past an allowlist.
 */
export const matchRoutePattern = (pattern: string, path: string): boolean => {
  if (!path.startsWith('/') || !pattern.startsWith('/')) return false;
  const actual = segmentsOf(path);
  if (actual.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return path === '/' && pattern === '/';
  }

  const expected = segmentsOf(pattern);
  const wildcard = expected.at(-1) === '*';
  const fixed = wildcard ? expected.slice(0, -1) : expected;

  if (wildcard ? actual.length < fixed.length : actual.length !== fixed.length) return false;
  return fixed.every((segment, index) => {
    const value = actual[index] ?? '';
    return segment.startsWith(':') ? value !== '' : segment === value;
  });
};
