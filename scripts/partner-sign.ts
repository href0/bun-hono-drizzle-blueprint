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
 * The secret is read from the terminal (hidden) or the first line of piped stdin — never from
 * arguments or environment variables.
 */
import { readFileSync } from 'node:fs';
import { generateOpaqueToken } from '../src/utils/crypto.util';
import { partnerSignatureHeaders } from '../src/utils/partner-signature.util';
import { readHidden, readPipedLine } from './lib/read-secret';

interface Args {
  key?: string;
  method: string;
  url?: string;
  body: string;
  send: boolean;
}

const usage =
  'Usage: bun run partner:sign --key <api key> --url <absolute url> [--method GET] ' +
  "[--body '<raw body>' | --body-file <path>] [--send]";

const fail = (message: string): never => {
  console.error(`${message}\n${usage}`);
  process.exit(1);
};

const parseArgs = (argv: string[]): Args => {
  const args: Args = { method: 'GET', body: '', send: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--key') args.key = argv[(i += 1)];
    else if (arg === '--url') args.url = argv[(i += 1)];
    else if (arg === '--method') args.method = (argv[(i += 1)] ?? 'GET').toUpperCase();
    else if (arg === '--body') args.body = argv[(i += 1)] ?? '';
    else if (arg === '--body-file') args.body = readFileSync(argv[(i += 1)] ?? '', 'utf8');
    else if (arg === '--send') args.send = true;
    else fail(`Unknown argument: ${arg}`);
  }
  return args;
};

/** Single-quotes a value for a POSIX shell. */
const shellQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const key = args.key ?? fail('--key is required');
  const url = args.url ?? fail('--url is required');
  if (!URL.canParse(url)) fail('--url must be an absolute URL (http://host/api/v1/partner/…)');

  const secret = (await readPipedLine()) ?? (await readHidden('Partner secret: '));
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

await main();
