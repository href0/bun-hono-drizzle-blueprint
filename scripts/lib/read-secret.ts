/**
 * Secrets for CLI scripts come from the terminal (hidden) or the first line of piped stdin — never
 * from arguments or environment variables, which end up in shell history and process listings.
 */

/** Reads one line from the terminal without echoing it. */
export const readHidden = (question: string): Promise<string> =>
  new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    let value = '';
    const onData = (chunk: Buffer): void => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        } else if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        } else if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      }
    };
    stdin.on('data', onData);
  });

/** The first line of piped stdin, or `null` when stdin is a terminal. */
export const readPipedLine = async (): Promise<string | null> =>
  process.stdin.isTTY ? null : ((await Bun.stdin.text()).split(/\r?\n/)[0] ?? '');
