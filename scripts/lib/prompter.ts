/**
 * The questions a CLI wizard asks (`bun run scaffold`, `bun run setup`), behind one interface: the
 * tests answer them with a scripted `Prompter`, `terminalPrompter` asks a person (`@clack/prompts`).
 */
import type { Readable, Writable } from 'node:stream';
import { confirm, isCancel, select, text } from '@clack/prompts';

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

export interface Prompter {
  select: <T extends string>(message: string, choices: readonly Choice<T>[]) => Promise<T>;
  text: (question: TextQuestion) => Promise<string>;
  /** Yes / No; `initial` is the answer Enter accepts (default No). */
  confirm: (message: string, initial?: boolean) => Promise<boolean>;
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
  confirm: async (message, initial = false) =>
    answered(await confirm({ ...io, message, initialValue: initial })),
});

export const terminalPrompter: Prompter = clackPrompter();
