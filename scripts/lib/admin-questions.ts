/**
 * What `bun run seed:admin` asks in a terminal (D40): the email and the name when `--email` is
 * missing, and the password (masked, twice) unless `--promote` keeps the existing one. Without a
 * terminal nothing is asked: scripts/seed-admin.ts requires `--email` and reads the password from
 * stdin.
 */
import { emailField } from '../../src/core/dto/common.dto';
import type { Prompter } from './prompter';
import { askNewPassword } from './read-secret';

export const DEFAULT_ADMIN_NAME = 'Administrator';

export interface AdminFlags {
  email?: string;
  name?: string;
  promote: boolean;
}

export interface AdminAnswers {
  email: string;
  fullName: string;
  /** Undefined with `--promote`: the user keeps their password. */
  password?: string;
}

const emailProblem = (value: string): string | undefined =>
  emailField.safeParse(value).success ? undefined : 'not a valid email address';

const nameProblem = (value: string): string | undefined => {
  if (value === '') return 'the name is required';
  return value.length > 255 ? 'the name is at most 255 characters' : undefined;
};

/** Asks for what the flags left out; a flag given is never asked again. */
export const askAdmin = async (flags: AdminFlags, prompter: Prompter): Promise<AdminAnswers> => {
  const email =
    flags.email ??
    (await prompter.text({
      message: flags.promote ? 'Email of the user to promote' : 'Email of the new admin',
      placeholder: 'e.g. admin@example.com',
      validate: emailProblem,
    }));
  // Only a session that asked for the email asks for the name; with --email the default applies.
  const fullName =
    flags.name ??
    (flags.email === undefined && !flags.promote
      ? await prompter.text({
          message: 'Full name',
          initial: DEFAULT_ADMIN_NAME,
          validate: nameProblem,
        })
      : DEFAULT_ADMIN_NAME);
  return {
    email,
    fullName,
    password: flags.promote
      ? undefined
      : await askNewPassword(prompter, 'Password for the new admin'),
  };
};
