/**
 * A `Prompter` for tests: answers the questions in order like a person, and records what was asked
 * and what was drawn. A text / password answer the question rejects is recorded and the next answer
 * is tried (the terminal asks again); a select / multiselect answer must name offered choices.
 */
import { CancelledError, type Choice, type Prompter } from './prompter';

/** Enter: accepts the pre-filled answer of a text, the default of a confirm, the ticks of a multiselect. */
export const ENTER = Symbol('enter');

/** The person cancels this question (Ctrl+C / Esc): the call rejects like the terminal's would. */
export const CANCEL = Symbol('cancel');

export type Answer = string | boolean | readonly string[] | typeof ENTER | typeof CANCEL;

export interface ScriptedSession {
  prompter: Prompter;
  /** The message of every question, in order. */
  asked: string[];
  /** Every validation error a rejected answer got. */
  rejected: string[];
  /** The values of each select / multiselect, in order. */
  offered: string[][];
  /** The placeholder of each text question that had one. */
  placeholders: string[];
  /** What was drawn: `intro: …`, `note: <title>: …`, `spinner: …`, `done: …`, `failed: …`, `outro: …`. */
  shown: string[];
  /** The answers no question used. */
  left: Answer[];
}

export const scriptedPrompter = (...answers: Answer[]): ScriptedSession => {
  const session: Omit<ScriptedSession, 'prompter'> = {
    asked: [],
    rejected: [],
    offered: [],
    placeholders: [],
    shown: [],
    left: answers,
  };
  const next = (message: string): Exclude<Answer, typeof CANCEL> => {
    session.asked.push(message);
    const answer = answers.shift();
    if (answer === undefined) throw new Error(`no answer left for "${message}"`);
    if (answer === CANCEL) throw new CancelledError();
    return answer;
  };
  const choiceOf = <T extends string>(
    message: string,
    choices: readonly Choice<T>[],
    value: string,
  ) => {
    const choice = choices.find((option) => option.value === value);
    if (choice === undefined) throw new Error(`"${value}" is not a choice of "${message}"`);
    return choice.value;
  };
  /** Asks until an answer passes `validate`. */
  const typed = (
    message: string,
    initial: string,
    validate: (value: string) => string | undefined,
  ): string => {
    for (;;) {
      const answer = next(message);
      const value = answer === ENTER ? initial : String(answer);
      const problem = validate(value);
      if (problem === undefined) return value;
      session.rejected.push(problem);
    }
  };
  /** The answer as a promise: a throw becomes a rejection, like the terminal's. */
  const reply = <T>(answer: () => T): Promise<T> =>
    new Promise((resolve) => {
      resolve(answer());
    });
  const prompter: Prompter = {
    select: (message, choices) =>
      reply(() => {
        session.offered.push(choices.map((choice) => choice.value));
        return choiceOf(message, choices, String(next(message)));
      }),
    multiselect: (message, choices, initial = []) =>
      reply(() => {
        session.offered.push(choices.map((choice) => choice.value));
        const answer = next(message);
        const values = answer === ENTER ? initial : typeof answer === 'string' ? [answer] : answer;
        if (!Array.isArray(values) || values.length === 0) {
          throw new Error(`"${message}" needs at least one choice`);
        }
        return values.map((value: string) => choiceOf(message, choices, value));
      }),
    text: (question) =>
      reply(() => {
        if (question.placeholder !== undefined) session.placeholders.push(question.placeholder);
        return typed(question.message, question.initial ?? '', question.validate);
      }),
    password: (question) => reply(() => typed(question.message, '', question.validate)),
    confirm: (message, initial = false) =>
      reply(() => {
        const answer = next(message);
        if (answer === ENTER) return initial;
        if (typeof answer !== 'boolean') throw new Error(`"${message}" is answered Yes / No`);
        return answer;
      }),
    intro: (title) => session.shown.push(`intro: ${title}`),
    outro: (message) => session.shown.push(`outro: ${message}`),
    note: (message, title) => session.shown.push(`note: ${title ?? ''}: ${message}`),
    spinner: () => ({
      start: (message) => session.shown.push(`spinner: ${message}`),
      stop: (message) => session.shown.push(`done: ${message}`),
      error: (message) => session.shown.push(`failed: ${message}`),
    }),
  };
  return { prompter, ...session };
};
