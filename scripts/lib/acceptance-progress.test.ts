import { describe, expect, it } from 'bun:test';
import {
  finishedLine,
  formatDuration,
  ProgressReporter,
  summaryTable,
  type Clock,
  type StepLabel,
} from './acceptance-progress';

const STEP: StepLabel = { index: 2, total: 12, stage: 'A', title: 'bun install' };

/** A clock moved by hand; `tick()` fires the interval as if `ms` passed. */
const manualClock = (): Clock & { advance: (ms: number) => void; ticks: number } => {
  let now = 0;
  let tick: (() => void) | undefined;
  const clock = {
    ticks: 0,
    now: () => now,
    every: (_ms: number, fn: () => void) => {
      tick = fn;
      return () => {
        tick = undefined;
      };
    },
    advance: (ms: number) => {
      now += ms;
      clock.ticks += 1;
      tick?.();
    },
  };
  return clock;
};

describe('formatDuration', () => {
  it('seconds, minutes, hours', () => {
    expect(formatDuration(-5)).toBe('0s');
    expect(formatDuration(3_400)).toBe('3s');
    expect(formatDuration(112_000)).toBe('1m52s');
    expect(formatDuration(3_720_000)).toBe('1h02m');
  });
});

describe('finishedLine', () => {
  it('aligns the result after dots', () => {
    const line = finishedLine(STEP, 'ok', 31_000);
    expect(line).toMatch(/^ {2}\[ 2\/12\] A {2}bun install \.+ ✓ 31s$/);
    expect(finishedLine(STEP, 'skipped', 0, '--no-db')).toMatch(/\.+ - {2}\(--no-db\)$/);
    expect(finishedLine(STEP, 'failed', 2_000)).toMatch(/✗ 2s$/);
  });
});

describe('ProgressReporter', () => {
  it('on a terminal: a live spinner and timer, rewritten in place, then the final line', () => {
    const clock = manualClock();
    const out: string[] = [];
    const reporter = new ProgressReporter({ write: (text) => out.push(text), isTTY: true }, clock);
    reporter.begin(STEP);
    clock.advance(1000);
    clock.advance(1000);
    expect(reporter.end('ok')).toBe(2000);
    expect(out[0]).toContain('0s running');
    const rewrite = `\r${String.fromCharCode(27)}[K`;
    expect(out[1]?.startsWith(rewrite)).toBe(true);
    expect(out[1]).toEndWith('⠙ 1s running');
    expect(out[2]).toContain('⠹ 2s running');
    expect(out[3]?.startsWith(rewrite)).toBe(true);
    expect(out[3]).toEndWith('✓ 2s\n');
  });

  it('in a pipe: a heartbeat line while it runs, one line when it ends', () => {
    const clock = manualClock();
    const out: string[] = [];
    const reporter = new ProgressReporter({ write: (text) => out.push(text), isTTY: false }, clock);
    reporter.begin(STEP);
    clock.advance(60_000);
    reporter.end('failed');
    reporter.skipped(STEP, 'an earlier step failed');
    reporter.line('done');
    expect(out).toEqual([
      '  ... bun install: still running (1m00s)\n',
      `${finishedLine(STEP, 'failed', 60_000)}\n`,
      `${finishedLine(STEP, 'skipped', 0, 'an earlier step failed')}\n`,
      'done\n',
    ]);
  });

  it('end without a running step prints nothing', () => {
    const out: string[] = [];
    const reporter = new ProgressReporter(
      { write: (text) => out.push(text), isTTY: true },
      manualClock(),
    );
    expect(reporter.end('ok')).toBe(0);
    expect(out).toEqual([]);
  });
});

describe('summaryTable', () => {
  it('one row per combination, one column per stage, aligned', () => {
    const table = summaryTable(
      [
        {
          label: '1 — new project',
          stages: {
            A: { status: 'ok', ms: 90_000 },
            B: { status: 'failed', ms: 30_000 },
          },
          failedStep: 'x',
        },
        {
          label: '2 — keep',
          stages: { A: { status: 'ok', ms: 60_000 }, C: { status: 'skipped', ms: 0 } },
        },
      ],
      ['A', 'B', 'C'],
    );
    expect(table.split('\n')).toEqual([
      'Combination      Stage A  Stage B  Stage C    Total',
      '---------------  -------  -------  ---------  -----',
      '1 — new project  ✓ 1m30s  ✗ 30s    -          2m00s',
      '2 — keep         ✓ 1m00s  -        - skipped  1m00s',
    ]);
  });
});
