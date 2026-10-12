import { isIP } from 'node:net';

const IPV4_MAPPED_PREFIX = '::ffff:';
const IPV4_BITS = 32;
const IPV6_BITS = 128;
const IPV4_MAPPED_HIGH_BITS = 0xffffn;
const PREFIX_PATTERN = /^\d{1,3}$/;

/** `::ffff:203.0.113.7` → `203.0.113.7`, so one client never counts as two. */
export const normalizeIp = (ip: string): string => {
  const lower = ip.trim().toLowerCase();
  const unmapped = lower.startsWith(IPV4_MAPPED_PREFIX)
    ? lower.slice(IPV4_MAPPED_PREFIX.length)
    : lower;
  return isIP(unmapped) === 4 ? unmapped : lower;
};

interface ParsedAddress {
  family: 4 | 6;
  value: bigint;
}

const parseIpv4 = (ip: string): bigint =>
  ip.split('.').reduce((value, octet) => (value << 8n) | BigInt(octet), 0n);

const parseIpv6 = (ip: string): bigint => {
  // An embedded IPv4 tail (`::ffff:1.2.3.4`) becomes the last two 16-bit groups.
  const lastColon = ip.lastIndexOf(':');
  const tail = ip.slice(lastColon + 1);
  const ipv4Tail = tail.includes('.') ? parseIpv4(tail) : null;
  const text =
    ipv4Tail === null
      ? ip
      : `${ip.slice(0, lastColon + 1)}${(ipv4Tail >> 16n).toString(16)}:${(ipv4Tail & 0xffffn).toString(16)}`;

  const halves = text.split('::');
  const head = halves.at(0) ?? '';
  const rest = halves.at(1);
  const headGroups = head === '' ? [] : head.split(':');
  const restGroups = rest === undefined || rest === '' ? [] : rest.split(':');
  const groups =
    rest === undefined
      ? headGroups
      : [
          ...headGroups,
          ...Array.from({ length: 8 - headGroups.length - restGroups.length }, () => '0'),
          ...restGroups,
        ];
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
};

/**
 * A literal IP address as a number. Zone IDs (`fe80::1%eth0`) are refused: they name a local
 * interface, not a peer. With `unmapIpv4`, an IPv4-mapped IPv6 address (`::ffff:a.b.c.d` in any
 * spelling) is read as the IPv4 address it carries.
 */
const parseAddress = (ip: string, unmapIpv4: boolean): ParsedAddress | null => {
  const text = ip.trim().toLowerCase();
  if (text.includes('%')) return null;
  const family = isIP(text);
  if (family === 4) return { family: 4, value: parseIpv4(text) };
  if (family !== 6) return null;

  const value = parseIpv6(text);
  if (unmapIpv4 && value >> BigInt(IPV4_BITS) === IPV4_MAPPED_HIGH_BITS) {
    return { family: 4, value: value & 0xffffffffn };
  }
  return { family: 6, value };
};

interface ParsedRule extends ParsedAddress {
  prefix: number;
}

const bitsOf = (family: 4 | 6): number => (family === 4 ? IPV4_BITS : IPV6_BITS);

/**
 * `203.0.113.7`, `203.0.113.0/24`, `2001:db8::1` or `2001:db8::/32`. Refused: host bits set
 * below the prefix (`10.0.0.5/24` is almost always a typo for `10.0.0.0/24` or `10.0.0.5/32`),
 * IPv4 rules written as IPv4-mapped IPv6 (write `10.0.0.0/8`), zone IDs, anything else.
 */
const parseRule = (rule: string): ParsedRule | null => {
  const parts = rule.trim().split('/');
  if (parts.length > 2) return null;
  const addressPart = parts.at(0) ?? '';
  const prefixPart = parts.at(1);

  const address = parseAddress(addressPart, false);
  if (!address) return null;
  if (address.family === 6 && address.value >> BigInt(IPV4_BITS) === IPV4_MAPPED_HIGH_BITS) {
    return null;
  }

  const bits = bitsOf(address.family);
  if (prefixPart === undefined) return { ...address, prefix: bits };
  if (!PREFIX_PATTERN.test(prefixPart)) return null;
  const prefix = Number(prefixPart);
  if (prefix > bits) return null;

  const hostMask = (1n << BigInt(bits - prefix)) - 1n;
  if ((address.value & hostMask) !== 0n) return null;
  return { ...address, prefix };
};

/** Whether `rule` is an IP address or CIDR block that {@link matchesIpRule} accepts. */
export const isValidIpRule = (rule: string): boolean => parseRule(rule) !== null;

const matches = (address: ParsedAddress, rule: ParsedRule): boolean => {
  if (address.family !== rule.family) return false;
  const shift = BigInt(bitsOf(rule.family) - rule.prefix);
  return address.value >> shift === rule.value >> shift;
};

/**
 * Whether `ip` lies in `rule` (an address = exact match, or a CIDR block). IPv4 and IPv6 never
 * match each other, except that an IPv4-mapped IPv6 client address counts as its IPv4 address.
 * An invalid IP or rule never matches.
 */
export const matchesIpRule = (ip: string, rule: string): boolean => {
  const address = parseAddress(ip, true);
  const parsedRule = parseRule(rule);
  return address !== null && parsedRule !== null && matches(address, parsedRule);
};

/** Whether `ip` lies in at least one of `rules` (an empty list matches nothing). */
export const matchesAnyIpRule = (ip: string, rules: readonly string[]): boolean => {
  const address = parseAddress(ip, true);
  if (!address) return false;
  return rules.some((rule) => {
    const parsedRule = parseRule(rule);
    return parsedRule !== null && matches(address, parsedRule);
  });
};
