/**
 * Secrets for CLI scripts come from the terminal (masked, through the Prompter) or the first line of
 * piped stdin — never from arguments or environment variables, which end up in shell history and
 * process listings.
 */
import { newPasswordField } from '../../src/core/dto/common.dto';
import type { Prompter } from './prompter';

/** The first line of piped stdin, or `null` when stdin is a terminal. */
export const readPipedLine = async (): Promise<string | null> =>
  process.stdin.isTTY ? null : ((await Bun.stdin.text()).split(/\r?\n/)[0] ?? '');

/** A secret typed once, masked; an empty one is asked again. */
export const askSecret = (prompter: Prompter, message: string): Promise<string> =>
  prompter.password({
    message,
    validate: (value) => (value === '' ? 'the secret is required' : undefined),
  });

/** A new password: masked, the API's password rules, then typed again until both match. */
export const askNewPassword = async (prompter: Prompter, message: string): Promise<string> => {
  const password = await prompter.password({
    message,
    validate: (value) => newPasswordField.safeParse(value).error?.issues.at(0)?.message,
  });
  await prompter.password({
    message: 'Repeat the password',
    validate: (value) => (value === password ? undefined : 'the passwords do not match'),
  });
  return password;
};
