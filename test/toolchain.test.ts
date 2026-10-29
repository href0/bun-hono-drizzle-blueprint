import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * One Bun version (R84): `packageManager` in package.json is its single source. CI reads it
 * (`setup-bun` with `bun-version-file: package.json`); the Docker images cannot, so their base tag
 * and the `@types/bun` pin repeat it — this test keeps them equal, so typecheck never accepts an API
 * the runtime lacks and an image never runs a Bun the gates did not.
 */
const ROOT = resolve(import.meta.dir, '..');
const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf-8');
const pkg = JSON.parse(read('package.json')) as {
  packageManager?: string;
  devDependencies: Record<string, string>;
};
const version = /^bun@(\d+\.\d+\.\d+)$/.exec(pkg.packageManager ?? '')?.at(1);

const DOCKERFILES = ['Dockerfile', 'Dockerfile.dev'];
const workflows = readdirSync(resolve(ROOT, '.github/workflows')).map(
  (name) => `.github/workflows/${name}`,
);

describe('one Bun version', () => {
  it('package.json names an exact Bun as packageManager', () => {
    expect(pkg.packageManager).toMatch(/^bun@\d+\.\d+\.\d+$/);
  });

  it('every Docker base image runs that Bun', () => {
    const images = DOCKERFILES.flatMap((file) =>
      [...read(file).matchAll(/^FROM oven\/bun:(\S+)/gm)].map((m) => `${file}: ${m[1]}`),
    );
    expect(images.length).toBeGreaterThanOrEqual(DOCKERFILES.length);
    expect(images.filter((image) => !image.endsWith(`: ${String(version)}-alpine`))).toEqual([]);
  });

  it('@types/bun is pinned to that Bun', () => {
    expect(pkg.devDependencies['@types/bun']).toBe(String(version));
  });

  it('every setup-bun step reads the version from package.json', () => {
    const steps = workflows.flatMap((file) => {
      const text = read(file);
      return [
        ...text.matchAll(/uses: oven-sh\/setup-bun@\S+\n(?:\s+with:\n)?((?:\s{8,}.+\n)*)/g),
      ].map((m) => ({ file, inputs: m[1] }));
    });
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.filter(({ inputs }) => !/bun-version-file: package\.json/.test(inputs))).toEqual(
      [],
    );
    expect(workflows.filter((file) => /^\s+bun-version:/m.test(read(file)))).toEqual([]);
  });
});
