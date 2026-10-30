/**
 * Every question a CLI asks and everything it draws around them (D40), behind one interface:
 * the tests answer with a scripted `Prompter` (scripted-prompter.ts), `terminalPrompter` asks a
 * person (`@clack/prompts`). The only file allowed to import `@clack/prompts` (ESLint,
 * `CLI_PROMPT_IMPORT_PATTERNS`); without a terminal a script asks nothing and reads flags / stdin.
 */
import type { Readable, Writable } from 'node:stream';
import {
  confirm,
  intro,
  isCancel,
  multiselect,
  note,
  outro,
  password,
  select,
  spinner,
  text,
} from '@clack/prompts';

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint: string;
}

export interface TextQuestion {
  message: string;
  /** A pre-filled answer: Enter accepts it, or the user edits it. */
  initial?: string;
  /**
   * An example shown while the answer is empty; never the answer. Always `e.g. …`: the terminal
   * draws it like typed text with the cursor on it (a bare `documents` was taken for an answer).
   */
  placeholder?: string;
  /** An error message to show, or `undefined` to accept the (trimmed) answer. */
  validate: (value: string) => string | undefined;
}

export interface PasswordQuestion {
  message: string;
  /** An error message to show, or `undefined` to accept the answer (never trimmed). */
  validate: (value: string) => string | undefined;
}

/** A line that turns while a long step runs, then becomes its result. */
export interface Spinner {
  start: (message: string) => void;
  stop: (message: string) => void;
  error: (message: string) => void;
}

export interface Prompter {
  select: <T extends string>(message: string, choices: readonly Choice<T>[]) => Promise<T>;
  /** At least one choice; `initial` are ticked when the question opens. */
  multiselect: <T extends string>(
    message: string,
    choices: readonly Choice<T>[],
    initial?: readonly T[],
  ) => Promise<T[]>;
  text: (question: TextQuestion) => Promise<string>;
  /** Masked input: for secrets, which never come from arguments or the environment. */
  password: (question: PasswordQuestion) => Promise<string>;
  /** Yes / No; `initial` is the answer Enter accepts (default No). */
  confirm: (message: string, initial?: boolean) => Promise<boolean>;
  /** The first line of a session: the command's name. */
  intro: (title: string) => void;
  /** The last line of a session: the result, or what to do next. */
  outro: (message: string) => void;
  /** A framed block of text: a plan, a summary, a warning. */
  note: (message: string, title?: string) => void;
  spinner: () => Spinner;
}

/** The person pressed Ctrl+C / Esc: the wizard stops before anything is written. */
export class CancelledError extends Error {
  constructor() {
    super('cancelled: nothing was written');
  }
}

/** Clack's answer, or a CancelledError when the person cancelled. */
export const answered = <T>(value: T): Exclude<T, symbol> => {
  if (isCancel(value)) throw new CancelledError();
  return value as Exclude<T, symbol>;
};

/** The clack prompts on `io` (default: this process's stdin / stdout; the tests pass streams). */
export const clackPrompter = (io: { input?: Readable; output?: Writable } = {}): Prompter => ({
  // Clack types options per literal value; the choices are plain strings, narrowed back to T.
  select: async <T extends string>(message: string, choices: readonly Choice<T>[]) =>
    answered(
      await select<string>({
        ...io,
        message,
        options: choices.map(({ value, label, hint }) => ({ value, label, hint })),
      }),
    ) as T,
  multiselect: async <T extends string>(
    message: string,
    choices: readonly Choice<T>[],
    initial: readonly T[] = [],
  ) =>
    answered(
      await multiselect<string>({
        ...io,
        message,
        options: choices.map(({ value, label, hint }) => ({ value, label, hint })),
        initialValues: [...initial],
        required: true,
      }),
    ) as T[],
  text: async ({ message, initial, placeholder, validate }) =>
    answered(
      await text({
        ...io,
        message,
        initialValue: initial,
        placeholder,
        validate: (value) => validate((value ?? '').trim()),
      }),
    ).trim(),
  password: async ({ message, validate }) =>
    answered(await password({ ...io, message, validate: (value) => validate(value ?? '') })),
  confirm: async (message, initial = false) =>
    answered(await confirm({ ...io, message, initialValue: initial })),
  intro: (title) => {
    intro(title, { output: io.output });
  },
  outro: (message) => {
    outro(message, { output: io.output });
  },
  note: (message, title) => {
    note(message, title, { output: io.output });
  },
  spinner: () => {
    const line = spinner({ output: io.output });
    return {
      start: (message) => {
        line.start(message);
      },
      stop: (message) => {
        line.stop(message);
      },
      error: (message) => {
        line.error(message);
      },
    };
  },
});

export const terminalPrompter: Prompter = clackPrompter();
