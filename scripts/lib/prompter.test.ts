import { describe, expect, it } from 'bun:test';
import { PassThrough } from 'node:stream';
import { CANCEL_SYMBOL } from '@clack/prompts';
import { answered, CancelledError, clackPrompter } from './prompter';

const DOWN = '\u001b[B';
const ENTER = '\r';
const CTRL_C = '\u0003';

/**
 * The real clack prompts on streams: keys are written once the question is on the screen, like a
 * person (or `bun run acceptance`) typing.
 */
const session = (): {
  prompter: ReturnType<typeof clackPrompter>;
  answer: (question: string, keys: string) => void;
} => {
  const input = new PassThrough();
  const output = new PassThrough();
  let screen = '';
  const pending: { question: string; keys: string }[] = [];
  const flush = (): void => {
    const next = pending.at(0);
    if (next === undefined || !screen.includes(next.question)) return;
    pending.shift();
    screen = '';
    setTimeout(() => input.write(next.keys), 20);
  };
  output.on('data', (chunk: Buffer) => {
    screen += chunk.toString();
    flush();
  });
  return {
    prompter: clackPrompter({ input, output }),
    answer: (question, keys) => {
      pending.push({ question, keys });
      flush();
    },
  };
};

describe('clackPrompter', () => {
  it('select moves with the arrow keys and returns the value under the cursor', async () => {
    const { prompter, answer } = session();
    answer('Shape?', `${DOWN}${ENTER}`);
    const choice = await prompter.select('Shape?', [
      { value: 'standalone', label: 'Standalone', hint: 'one table' },
      { value: 'record', label: 'Record', hint: 'append-only' },
    ]);
    expect(choice).toBe('record');
  });

  it('text returns the trimmed answer, re-asking while validation fails', async () => {
    const { prompter, answer } = session();
    answer('Name?', `Bad Name${ENTER}`);
    const seen: string[] = [];
    const typed = prompter.text({
      message: 'Name?',
      validate: (value) => {
        seen.push(value);
        if (value.includes(' ')) {
          // The rejected answer is cleared by the person, then a valid one typed.
          answer('Name?', `${'\u007f'.repeat(8)}  products ${ENTER}`);
          return 'kebab-case please';
        }
        return undefined;
      },
    });
    expect(await typed).toBe('products');
    expect(seen.at(-1)).toBe('products');
  });

  it('text keeps the pre-filled answer on Enter', async () => {
    const { prompter, answer } = session();
    answer('Singular?', ENTER);
    expect(
      await prompter.text({ message: 'Singular?', initial: 'product', validate: () => undefined }),
    ).toBe('product');
  });

  it('confirm is No by default and Yes with y', async () => {
    const { prompter, answer } = session();
    answer('Write?', ENTER);
    expect(await prompter.confirm('Write?')).toBe(false);
    answer('Again?', `y${ENTER}`);
    expect(await prompter.confirm('Again?')).toBe(true);
  });

  it('Ctrl+C cancels: nothing is written', async () => {
    const { prompter, answer } = session();
    answer('Name?', CTRL_C);
    expect(prompter.text({ message: 'Name?', validate: () => undefined })).rejects.toThrow(
      CancelledError,
    );
  });
});

describe('answered', () => {
  it('passes an answer through and turns a cancel into CancelledError', () => {
    expect(answered('products')).toBe('products');
    expect(answered(false)).toBe(false);
    expect(() => answered(CANCEL_SYMBOL)).toThrow('cancelled: nothing was written');
  });
});
