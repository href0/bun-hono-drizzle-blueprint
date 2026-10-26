/**
 * Signs a partner request (signing spec v1, docs/partner-integration-guide.md) for manual tests.
 *
 *   bun run partner:sign --key pk_… --url http://localhost:3000/api/v1/partner/ping
 *   bun run partner:sign --key pk_… --method POST --url …/partner/echo --body '{"message":"halo"}' --send
 *   printf '%s\n' "$PARTNER_SECRET" | bun run partner:sign --key pk_… --url … --send   # non-interactive
 *
 * Without --send it prints the four x-partner-* headers and a ready curl command (valid until the
 * timestamp leaves the server's tolerance, single use: the nonce is spent by the first request).
 * With --send it sends the request and prints the status and the response body.
 * The secret is asked masked in a terminal (the Prompter) or is the first line of piped stdin —
 * never an argument or an environment variable.
 */
import { readFileSync } from 'node:fs';
import { generateOpaqueToken } from '../src/utils/crypto.util';
import { partnerSignatureHeaders } from '../src/utils/partner-signature.util';
import { exitWithUsage, readCli } from './lib/cli-args';
import { usageOf } from './lib/commands';
import { CancelledError, terminalPrompter } from './lib/prompter';
import { askSecret, readPipedLine } from './lib/read-secret';

const usage = usageOf('partner-sign.ts');

const fail = (message: string): never => exitWithUsage(message, usage);

/** Single-quotes a value for a POSIX shell. */
const shellQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

const main = async (): Promise<void> => {
  const cli = readCli(process.argv.slice(2), usage, {
    values: ['--key', '--url', '--method', '--body', '--body-file'],
    flags: ['--send'],
  });
  const key = cli.values.get('--key') ?? fail('--key is required');
  const url = cli.values.get('--url') ?? fail('--url is required');
  if (!URL.canParse(url)) fail('--url must be an absolute URL (http://host/api/v1/partner/…)');
  const bodyFile = cli.values.get('--body-file');
  if (bodyFile !== undefined && cli.values.has('--body')) fail('--body or --body-file, not both');
  const args = {
    method: (cli.values.get('--method') ?? 'GET').toUpperCase(),
    body:
      bodyFile === undefined ? (cli.values.get('--body') ?? '') : readFileSync(bodyFile, 'utf8'),
    send: cli.flags.has('--send'),
  };

  const secret = (await readPipedLine()) ?? (await askSecret(terminalPrompter, 'Partner secret'));
  if (secret === '') fail('The secret is empty');

  const headers = partnerSignatureHeaders({
    apiKey: key,
    secret,
    method: args.method,
    url,
    body: args.body,
    timestamp: String(Date.now()),
    nonce: generateOpaqueToken(24),
  });

  if (!args.send) {
    for (const [name, value] of Object.entries(headers)) console.log(`${name}: ${value}`);
    const curl = [
      `curl -i -X ${args.method} ${shellQuote(url)}`,
      ...Object.entries(headers).map(([name, value]) => `-H ${shellQuote(`${name}: ${value}`)}`),
      ...(args.body === ''
        ? []
        : ["-H 'Content-Type: application/json'", `--data-binary ${shellQuote(args.body)}`]),
    ];
    console.log(`\n${curl.join(' \\\n  ')}`);
    return;
  }

  const res = await fetch(url, {
    method: args.method,
    headers: { ...headers, ...(args.body === '' ? {} : { 'Content-Type': 'application/json' }) },
    body: args.body === '' ? undefined : args.body,
  });
  console.log(`HTTP ${String(res.status)}`);
  console.log(await res.text());
  if (!res.ok) process.exitCode = 1;
};

try {
  await main();
} catch (error) {
  if (!(error instanceof CancelledError)) throw error;
  console.error(error.message);
  process.exit(1);
}
