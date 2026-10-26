import { describe, expect, it } from 'bun:test';
import { askAdmin } from './admin-questions';
import { askSecret } from './read-secret';
import { ENTER, scriptedPrompter } from './scripted-prompter';

describe('seed:admin questions', () => {
  it('without flags: email (validated), name (pre-filled), password masked and typed twice', async () => {
    const session = scriptedPrompter(
      'not-an-email',
      'admin@example.com',
      ENTER,
      'short',
      'long enough',
      'different',
      'long enough',
    );
    expect(await askAdmin({ promote: false }, session.prompter)).toEqual({
      email: 'admin@example.com',
      fullName: 'Administrator',
      password: 'long enough',
    });
    expect(session.asked).toEqual([
      'Email of the new admin',
      'Email of the new admin',
      'Full name',
      'Password for the new admin',
      'Password for the new admin',
      'Repeat the password',
      'Repeat the password',
    ]);
    expect(session.rejected).toEqual([
      'not a valid email address',
      'Password must be at least 8 characters',
      'the passwords do not match',
    ]);
  });

  it('a flag given is never asked: --email keeps the default name and asks only the password', async () => {
    const session = scriptedPrompter('long enough', 'long enough');
    const answers = await askAdmin({ email: 'jane@example.com', promote: false }, session.prompter);
    expect(answers).toEqual({
      email: 'jane@example.com',
      fullName: 'Administrator',
      password: 'long enough',
    });
    expect(session.asked).toEqual(['Password for the new admin', 'Repeat the password']);
  });

  it('--promote asks only for the user, never a password', async () => {
    const session = scriptedPrompter('jane@example.com');
    expect(await askAdmin({ promote: true, name: 'Jane' }, session.prompter)).toEqual({
      email: 'jane@example.com',
      fullName: 'Jane',
      password: undefined,
    });
    expect(session.asked).toEqual(['Email of the user to promote']);
  });

  it('refuses an empty or too long name', async () => {
    const session = scriptedPrompter(
      'a@example.com',
      '',
      'x'.repeat(256),
      'Jane',
      'long enough',
      'long enough',
    );
    expect((await askAdmin({ promote: false }, session.prompter)).fullName).toBe('Jane');
    expect(session.rejected).toEqual([
      'the name is required',
      'the name is at most 255 characters',
    ]);
  });
});

describe('askSecret', () => {
  it('masked, asked again while empty', async () => {
    const session = scriptedPrompter('', 's3cret');
    expect(await askSecret(session.prompter, 'Partner secret')).toBe('s3cret');
    expect(session.rejected).toEqual(['the secret is required']);
  });
});
