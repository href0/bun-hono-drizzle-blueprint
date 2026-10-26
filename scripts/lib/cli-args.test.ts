import { describe, expect, it } from 'bun:test';
import { CliArgsError, exitWithUsage, isHelp, parseCli, readCli } from './cli-args';

describe('parseCli', () => {
  it('reads flags, both value forms and positionals', () => {
    const cli = parseCli(['update', '--allow-breaking', '--days', '30', '--name=Jane Admin'], {
      flags: ['--allow-breaking'],
      values: ['--days', '--name'],
      positionals: 1,
    });
    expect([...cli.flags]).toEqual(['--allow-breaking']);
    expect(Object.fromEntries(cli.values)).toEqual({ '--days': '30', '--name': 'Jane Admin' });
    expect(cli.positionals).toEqual(['update']);
  });

  it('a value may start with a single dash (a negative number is checked by the script)', () => {
    expect(parseCli(['--days', '-1'], { values: ['--days'] }).values.get('--days')).toBe('-1');
  });

  it.each([
    [['--bogus'], {}, 'unknown option --bogus'],
    [['-x'], {}, 'unknown option -x'],
    [['extra'], {}, 'unexpected argument extra'],
    [['a', 'b'], { positionals: 1 }, 'unexpected argument b'],
    [['--days'], { values: ['--days'] }, '--days needs a value'],
    [['--days', '--dry-run'], { values: ['--days'], flags: ['--dry-run'] }, '--days needs a value'],
  ])('refuses %j', (argv, spec, message) => {
    expect(() => parseCli(argv, spec)).toThrow(new CliArgsError(message));
  });
});

describe('readCli', () => {
  /** Records what a script would print; `exit` stops like the real one does. */
  const fakeIo = () => {
    const io = {
      out: '',
      err: '',
      code: undefined as number | undefined,
      streams: {
        out: (text: string) => {
          io.out += text;
        },
        err: (text: string) => {
          io.err += text;
        },
        exit: (code: number): never => {
          io.code = code;
          throw new Error(`exit ${String(code)}`);
        },
      },
    };
    return io;
  };

  it('--help: the usage on stdout, exit 0, before the options are checked', () => {
    const io = fakeIo();
    expect(() => readCli(['--bogus', '-h'], 'Usage: demo', {}, io.streams)).toThrow('exit 0');
    expect([io.out, io.err, io.code]).toEqual(['Usage: demo\n', '', 0]);
  });

  it('a wrong command line: the problem and the usage on stderr, exit 1', () => {
    const io = fakeIo();
    expect(() => readCli(['--bogus'], 'Usage: demo', {}, io.streams)).toThrow('exit 1');
    expect([io.out, io.err, io.code]).toEqual(['', 'unknown option --bogus\n\nUsage: demo\n', 1]);
  });

  it('a correct command line is returned', () => {
    const io = fakeIo();
    expect(
      readCli(['--dry-run'], 'Usage: demo', { flags: ['--dry-run'] }, io.streams).flags,
    ).toEqual(new Set(['--dry-run']));
    expect(io.code).toBeUndefined();
  });

  it('exitWithUsage is the same refusal for a check of the script itself', () => {
    const io = fakeIo();
    expect(() => exitWithUsage('--email is required', 'Usage: demo', io.streams)).toThrow('exit 1');
    expect(io.err).toBe('--email is required\n\nUsage: demo\n');
  });
});

describe('isHelp', () => {
  it('--help or -h anywhere on the line', () => {
    expect(isHelp(['update', '--help'])).toBe(true);
    expect(isHelp(['-h'])).toBe(true);
    expect(isHelp(['--helper', 'h'])).toBe(false);
  });
});
