/**
 * What `bun run acceptance` shows while it runs: one line per step — on a terminal a live spinner
 * and timer, rewritten in place; in a pipe or a log file one line per finished step plus a
 * heartbeat — and the table at the end. Pure formatting + a reporter with injected output and
 * clock, so it is unit-tested.
 */

export interface StepLabel {
  /** Position over the steps of the combination, 1-based. */
  index: number;
  total: number;
  stage: string;
  title: string;
}

export type StepStatus = 'ok' | 'failed' | 'skipped';

export interface ProgressOutput {
  write: (text: string) => void;
  /** A terminal can rewrite the running line; a pipe or a file cannot. */
  isTTY: boolean;
}

export interface Clock {
  now: () => number;
  /** Calls `tick` every `ms`; returns the function that stops it. */
  every: (ms: number, tick: () => void) => () => void;
}

export const REAL_CLOCK: Clock = {
  now: () => Date.now(),
  every: (ms, tick) => {
    const timer = setInterval(tick, ms);
    return () => {
      clearInterval(timer);
    };
  },
};

/** `3s` / `1m52s` / `1h02m` */
export const formatDuration = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${String(hours)}h${String(minutes).padStart(2, '0')}m`;
  return minutes > 0 ? `${String(minutes)}m${String(rest).padStart(2, '0')}s` : `${String(rest)}s`;
};

/** Back to the start of the line and erase it (ANSI EL): a shorter line leaves nothing behind. */
const REWRITE = '\r\u001b[K';
const WIDTH = 72;
const SYMBOL: Record<StepStatus, string> = { ok: '✓', failed: '✗', skipped: '-' };
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const TICK_MS = 1000;
const HEARTBEAT_MS = 60_000;

const stepText = (step: StepLabel): string => {
  const counter = `[${String(step.index).padStart(String(step.total).length)}/${String(step.total)}]`;
  return `  ${counter} ${step.stage}  ${step.title} `;
};

const dotsFor = (text: string): string => '.'.repeat(Math.max(3, WIDTH - text.length));

/** `  [ 2/20] A  bun install ............ ✓ 31s` */
export const finishedLine = (
  step: StepLabel,
  status: StepStatus,
  ms: number,
  note = '',
): string => {
  const text = stepText(step);
  const time = status === 'skipped' ? '' : ` ${formatDuration(ms)}`;
  return `${text}${dotsFor(text)} ${SYMBOL[status]}${time}${note === '' ? '' : `  (${note})`}`;
};

const runningLine = (step: StepLabel, ms: number, frame: number): string => {
  const text = stepText(step);
  return `${text}${dotsFor(text)} ${SPINNER[frame % SPINNER.length] ?? ''} ${formatDuration(ms)} running`;
};

export class ProgressReporter {
  private stop: (() => void) | undefined;
  private startedAt = 0;
  private frame = 0;
  private current: StepLabel | undefined;

  constructor(
    private readonly out: ProgressOutput,
    private readonly clock: Clock = REAL_CLOCK,
  ) {}

  line(text: string): void {
    this.out.write(`${text}\n`);
  }

  begin(step: StepLabel): void {
    this.current = step;
    this.startedAt = this.clock.now();
    this.frame = 0;
    if (this.out.isTTY) {
      this.out.write(`${REWRITE}${runningLine(step, 0, 0)}`);
      this.stop = this.clock.every(TICK_MS, () => {
        this.frame += 1;
        this.out.write(
          `${REWRITE}${runningLine(step, this.clock.now() - this.startedAt, this.frame)}`,
        );
      });
    } else {
      this.stop = this.clock.every(HEARTBEAT_MS, () => {
        const elapsed = formatDuration(this.clock.now() - this.startedAt);
        this.line(`  ... ${step.title}: still running (${elapsed})`);
      });
    }
  }

  /** Ends the running step and prints its final line; returns the elapsed milliseconds. */
  end(status: Exclude<StepStatus, 'skipped'>): number {
    const step = this.current;
    this.stop?.();
    this.stop = undefined;
    const ms = this.clock.now() - this.startedAt;
    if (step !== undefined) {
      const text = finishedLine(step, status, ms);
      this.out.write(this.out.isTTY ? `${REWRITE}${text}\n` : `${text}\n`);
    }
    this.current = undefined;
    return ms;
  }

  /** A step that did not run: an earlier one failed, or this machine cannot run it. */
  skipped(step: StepLabel, reason: string): void {
    this.line(finishedLine(step, 'skipped', 0, reason));
  }
}

export interface StageResult {
  status: 'ok' | 'failed' | 'skipped';
  ms: number;
}

export interface ComboResult {
  label: string;
  /** Per stage: ok / failed / skipped, with the time its steps took; a stage never reached is absent. */
  stages: Partial<Record<string, StageResult>>;
  failedStep?: string;
  logFile?: string;
}

/** The table at the end: one row per combination, one column per stage. */
export const summaryTable = (
  results: readonly ComboResult[],
  stages: readonly string[],
): string => {
  const header = ['Combination', ...stages.map((stage) => `Stage ${stage}`), 'Total'];
  const rows = results.map((result) => {
    const total = Object.values(result.stages).reduce((sum, stage) => sum + (stage?.ms ?? 0), 0);
    return [
      result.label,
      ...stages.map((stage) => {
        const found = result.stages[stage];
        if (found === undefined) return '-';
        if (found.status === 'skipped') return '- skipped';
        return `${found.status === 'ok' ? '✓' : '✗'} ${formatDuration(found.ms)}`;
      }),
      formatDuration(total),
    ];
  });
  const all = [header, ...rows];
  const widths = header.map((_, column) =>
    Math.max(...all.map((row) => (row[column] ?? '').length)),
  );
  const format = (row: readonly string[]): string =>
    row
      .map((cell, column) => cell.padEnd(widths[column] ?? 0))
      .join('  ')
      .trimEnd();
  const rule = widths.map((width) => '-'.repeat(width)).join('  ');
  return [format(header), rule, ...rows.map(format)].join('\n');
};
