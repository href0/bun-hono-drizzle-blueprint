/**
 * Coverage quality gate — single source of truth for coverage thresholds.
 *
 * Reads coverage/lcov.info produced by `bun test --coverage` and enforces:
 *   1. Global line and function coverage over source files only (test files excluded).
 *   2. Per-file line coverage.
 *   3. Every source file appears in the report. Bun only instruments files that tests import,
 *      so an untested file would otherwise be invisible. Pure re-export barrels are exempt.
 *
 * COVERAGE_EXCLUSIONS is the only escape hatch: every entry needs a reason and when it goes
 * (`until`). Exclusions are printed on every run so they stay visible.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readCli } from './lib/cli-args';
import { usageOf } from './lib/commands';

readCli(process.argv.slice(2), usageOf('check-coverage.ts'), {});

const THRESHOLDS = {
  globalLines: 95,
  globalFunctions: 95,
  fileLines: 90,
} as const;

const COVERAGE_EXCLUSIONS: readonly { path: string; reason: string; until: string }[] = [
  {
    path: 'src/index.ts',
    reason: 'process bootstrap (Bun.serve, signal handlers, process.exit)',
    until: 'permanent — proven by running it: CI job docker (R79), bun run acceptance (R81)',
  },
];

interface FileCoverage {
  path: string;
  linesFound: number;
  linesHit: number;
  functionsFound: number;
  functionsHit: number;
}

const normalizePath = (path: string): string => path.trim().replaceAll('\\', '/');

const percent = (hit: number, found: number): number => (found === 0 ? 100 : (hit / found) * 100);

const readCounter = (record: string, key: string): number => {
  const match = new RegExp(`^${key}:(\\d+)$`, 'm').exec(record);
  return match ? Number(match[1]) : 0;
};

const parseLcov = (content: string): FileCoverage[] =>
  content
    .split('end_of_record')
    .map((record) => {
      const sourceFile = /^SF:(.+)$/m.exec(record);
      if (!sourceFile) return undefined;
      return {
        path: normalizePath(sourceFile[1]),
        linesFound: readCounter(record, 'LF'),
        linesHit: readCounter(record, 'LH'),
        functionsFound: readCounter(record, 'FNF'),
        functionsHit: readCounter(record, 'FNH'),
      };
    })
    .filter((file): file is FileCoverage => file !== undefined);

const isTestFile = (path: string): boolean => path.endsWith('.test.ts') || path.startsWith('test/');

const isExcluded = (path: string): boolean =>
  COVERAGE_EXCLUSIONS.some((entry) => entry.path === path);

const isReExportBarrel = (path: string): boolean => {
  if (!path.endsWith('/index.ts')) return false;
  const statements = readFileSync(path, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
  return statements.every((statement) =>
    /^export\s[\s\S]*\sfrom\s+['"][^'"]+['"]$/.test(statement),
  );
};

const listSourceFiles = (): string[] =>
  [...new Bun.Glob('src/**/*.ts').scanSync('.')]
    .map(normalizePath)
    .filter((path) => !isTestFile(path));

const lcovPath = resolve(process.cwd(), 'coverage/lcov.info');
if (!existsSync(lcovPath)) {
  console.error('Error: coverage/lcov.info not found. Run tests with coverage first.');
  process.exit(1);
}

const sourceCoverage = parseLcov(readFileSync(lcovPath, 'utf-8')).filter(
  (file) => !isTestFile(file.path) && !isExcluded(file.path),
);

const reported = new Set(sourceCoverage.map((file) => file.path));
const missingFiles = listSourceFiles().filter(
  (path) => !reported.has(path) && !isExcluded(path) && !isReExportBarrel(path),
);

const sum = (key: keyof Omit<FileCoverage, 'path'>): number =>
  sourceCoverage.reduce((total, file) => total + file[key], 0);
const globalLines = percent(sum('linesHit'), sum('linesFound'));
const globalFunctions = percent(sum('functionsHit'), sum('functionsFound'));

const lowFiles = sourceCoverage.filter(
  (file) => percent(file.linesHit, file.linesFound) < THRESHOLDS.fileLines,
);

console.log('----------------------------------------------------');
console.log(`Source files covered : ${sourceCoverage.length}`);
console.log(
  `Line coverage        : ${globalLines.toFixed(2)}% (target >= ${THRESHOLDS.globalLines}%)`,
);
console.log(
  `Function coverage    : ${globalFunctions.toFixed(2)}% (target >= ${THRESHOLDS.globalFunctions}%)`,
);
console.log(`Per-file lines       : target >= ${THRESHOLDS.fileLines}%`);
console.log('Exclusions:');
COVERAGE_EXCLUSIONS.forEach((entry) => {
  console.log(`  - ${entry.path} — ${entry.reason} (until: ${entry.until})`);
});
console.log('----------------------------------------------------');

const failures: string[] = [];
if (globalLines < THRESHOLDS.globalLines) {
  failures.push(`Global line coverage ${globalLines.toFixed(2)}% < ${THRESHOLDS.globalLines}%`);
}
if (globalFunctions < THRESHOLDS.globalFunctions) {
  failures.push(
    `Global function coverage ${globalFunctions.toFixed(2)}% < ${THRESHOLDS.globalFunctions}%`,
  );
}
lowFiles.forEach((file) => {
  failures.push(
    `${file.path}: lines ${percent(file.linesHit, file.linesFound).toFixed(2)}% < ${THRESHOLDS.fileLines}%`,
  );
});
missingFiles.forEach((path) => {
  failures.push(
    `${path}: not loaded by any test (add a test or a justified COVERAGE_EXCLUSIONS entry)`,
  );
});

if (failures.length > 0) {
  console.error('FAILURE: coverage quality gate not met:');
  failures.forEach((failure) => {
    console.error(`  - ${failure}`);
  });
  process.exit(1);
}

console.log('SUCCESS: coverage quality gate passed.');
