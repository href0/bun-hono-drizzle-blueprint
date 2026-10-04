import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const lcovPath = resolve(process.cwd(), 'coverage/lcov.info');

if (!existsSync(lcovPath)) {
  console.error('Error: coverage/lcov.info not found. Run tests with coverage first.');
  process.exit(1);
}

const content = readFileSync(lcovPath, 'utf-8');

let totalLinesFound = 0;
let totalLinesHit = 0;

for (const line of content.split('\n')) {
  if (line.startsWith('LF:')) {
    totalLinesFound += parseInt(line.substring(3).trim(), 10);
  } else if (line.startsWith('LH:')) {
    totalLinesHit += parseInt(line.substring(3).trim(), 10);
  }
}

if (totalLinesFound === 0) {
  console.error('Error: No executable lines found in coverage report.');
  process.exit(1);
}

const coveragePercentage = (totalLinesHit / totalLinesFound) * 100;
const threshold = 95.0;

console.log('----------------------------------------------------');
console.log(`Lines Hit:   ${totalLinesHit} / ${totalLinesFound}`);
console.log(`Line Coverage: ${coveragePercentage.toFixed(2)}% (Target: >= ${threshold}%)`);
console.log('----------------------------------------------------');

if (coveragePercentage < threshold) {
  console.error(
    `FAILURE: Line coverage ${coveragePercentage.toFixed(2)}% is below mandatory threshold of ${threshold}%.`,
  );
  process.exit(1);
}

console.log('SUCCESS: Quality Gate passed. Line coverage is >= 95%.');
process.exit(0);
