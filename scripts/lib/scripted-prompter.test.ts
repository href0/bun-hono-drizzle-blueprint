import { describe, expect, it } from 'bun:test';
import { CancelledError } from './prompter';
import { CANCEL, ENTER, scriptedPrompter } from './scripted-prompter';

const CHOICES = [
  { value: 'a', label: 'A', hint: '' },
  { value: 'b', label: 'B', hint: '' },
] as const;

describe('scriptedPrompter', () => {
  it('answers in order and records the questions, the choices and what was drawn', async () => {
    const session = scriptedPrompter('b', ['a', 'b'], ENTER, 'secret', true);
    const { prompter } = session;
    prompter.intro('demo');
    expect(await prompter.select('One?', CHOICES)).toBe('b');
    expect(await prompter.multiselect('Some?', CHOICES)).toEqual(['a', 'b']);
    expect(
      await prompter.text({
        message: 'Name?',
        initial: 'x',
        placeholder: 'e.g. y',
        validate: () => undefined,
      }),
    ).toBe('x');
    expect(await prompter.password({ message: 'Secret?', validate: () => undefined })).toBe(
      'secret',
    );
    expect(await prompter.confirm('Go?')).toBe(true);
    prompter.note('the plan', 'Plan');
    const line = prompter.spinner();
    line.start('working');
    line.stop('worked');
    line.error('broke');
    prompter.outro('bye');
    expect(session.asked).toEqual(['One?', 'Some?', 'Name?', 'Secret?', 'Go?']);
    expect(session.offered).toEqual([
      ['a', 'b'],
      ['a', 'b'],
    ]);
    expect(session.placeholders).toEqual(['e.g. y']);
    expect(session.shown).toEqual([
      'intro: demo',
      'note: Plan: the plan',
      'spinner: working',
      'done: worked',
      'failed: broke',
      'outro: bye',
    ]);
    expect(session.left).toEqual([]);
  });

  it('Enter keeps the default of a confirm and the initial ticks of a multiselect', async () => {
    const { prompter } = scriptedPrompter(ENTER, ENTER, 'a');
    expect(await prompter.confirm('Go?', true)).toBe(true);
    expect(await prompter.multiselect('Some?', CHOICES, ['b'])).toEqual(['b']);
    expect(await prompter.multiselect('Some?', CHOICES)).toEqual(['a']);
  });

  it('a rejected answer is recorded and the next one tried', async () => {
    const session = scriptedPrompter('', 'ok');
    const value = await session.prompter.password({
      message: 'Secret?',
      validate: (text) => (text === '' ? 'required' : undefined),
    });
    expect(value).toBe('ok');
    expect(session.rejected).toEqual(['required']);
  });

  it('refuses answers a terminal could not give, and CANCEL cancels', async () => {
    const { prompter } = scriptedPrompter('c', [], 'yes', CANCEL);
    expect(prompter.select('One?', CHOICES)).rejects.toThrow('"c" is not a choice of "One?"');
    expect(prompter.multiselect('Some?', CHOICES)).rejects.toThrow('needs at least one choice');
    expect(prompter.confirm('Go?')).rejects.toThrow('answered Yes / No');
    expect(prompter.confirm('Again?')).rejects.toThrow(CancelledError);
    expect(prompter.confirm('More?')).rejects.toThrow('no answer left for "More?"');
  });
});
