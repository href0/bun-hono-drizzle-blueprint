import { describe, expect, it } from 'bun:test';
import { isValidIpRule, matchesAnyIpRule, matchesIpRule, normalizeIp } from './ip-match.util';

describe('normalizeIp', () => {
  it('unmaps IPv4-mapped IPv6 and lowercases IPv6', () => {
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeIp('::FFFF:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeIp('2001:DB8::1')).toBe('2001:db8::1');
    expect(normalizeIp(' 198.51.100.4 ')).toBe('198.51.100.4');
  });
});

describe('isValidIpRule', () => {
  it('accepts IPv4/IPv6 addresses and CIDR blocks', () => {
    for (const rule of [
      '203.0.113.7',
      '203.0.113.0/24',
      '0.0.0.0/0',
      '203.0.113.7/32',
      '2001:db8::1',
      '2001:DB8::/32',
      '::/0',
      '2001:db8::1/128',
      ' 10.0.0.0/8 ',
    ]) {
      expect(isValidIpRule(rule)).toBe(true);
    }
  });

  it('refuses host bits below the prefix, bad prefixes, mapped IPv4, zones and junk', () => {
    for (const rule of [
      '10.0.0.5/24',
      '2001:db8::1/32',
      '10.0.0.0/33',
      '2001:db8::/129',
      '10.0.0.0/',
      '10.0.0.0/-1',
      '10.0.0.0/8/8',
      '10.0.0.0/+8',
      '10.0.0.0/0x8',
      '::ffff:10.0.0.0/104',
      '::ffff:10.0.0.1',
      'fe80::1%eth0',
      '256.0.0.1',
      '10.0.0',
      'localhost',
      '',
      '*',
    ]) {
      expect(isValidIpRule(rule)).toBe(false);
    }
  });
});

describe('matchesIpRule', () => {
  it('matches an exact address', () => {
    expect(matchesIpRule('203.0.113.7', '203.0.113.7')).toBe(true);
    expect(matchesIpRule('203.0.113.8', '203.0.113.7')).toBe(false);
    expect(matchesIpRule('2001:db8::1', '2001:0DB8:0:0:0:0:0:1')).toBe(true);
    expect(matchesIpRule('2001:db8::2', '2001:db8::1')).toBe(false);
  });

  it('matches IPv4 CIDR blocks on the prefix boundary', () => {
    expect(matchesIpRule('203.0.113.0', '203.0.113.0/24')).toBe(true);
    expect(matchesIpRule('203.0.113.255', '203.0.113.0/24')).toBe(true);
    expect(matchesIpRule('203.0.114.0', '203.0.113.0/24')).toBe(false);
    expect(matchesIpRule('203.0.112.255', '203.0.113.0/24')).toBe(false);
    expect(matchesIpRule('10.255.255.255', '10.0.0.0/8')).toBe(true);
    expect(matchesIpRule('11.0.0.0', '10.0.0.0/8')).toBe(false);
    expect(matchesIpRule('198.51.100.9', '0.0.0.0/0')).toBe(true);
  });

  it('matches IPv6 CIDR blocks, including "::" compression and an embedded IPv4 tail', () => {
    expect(matchesIpRule('2001:db8:ffff:ffff::1', '2001:db8::/32')).toBe(true);
    expect(matchesIpRule('2001:db9::1', '2001:db8::/32')).toBe(false);
    expect(matchesIpRule('2001:db8::7f00:1', '2001:db8::127.0.0.1')).toBe(true);
    expect(matchesIpRule('fe80::abcd', 'fe80::/10')).toBe(true);
    expect(matchesIpRule('fec0::1', 'fe80::/10')).toBe(false);
    expect(matchesIpRule('::1', '::1')).toBe(true);
    expect(matchesIpRule('1::', '1::/16')).toBe(true);
    expect(matchesIpRule('2001:db8::1', '::/0')).toBe(true);
  });

  it('reads an IPv4-mapped IPv6 client as its IPv4 address, in any spelling', () => {
    expect(matchesIpRule('::ffff:203.0.113.7', '203.0.113.0/24')).toBe(true);
    expect(matchesIpRule('::FFFF:cb00:7107', '203.0.113.7')).toBe(true);
    expect(matchesIpRule('0:0:0:0:0:ffff:203.0.113.7', '203.0.113.7')).toBe(true);
    expect(matchesIpRule('::ffff:203.0.113.7', '::/0')).toBe(false);
  });

  it('never matches across families or with invalid input', () => {
    expect(matchesIpRule('203.0.113.7', '::/0')).toBe(false);
    expect(matchesIpRule('2001:db8::1', '0.0.0.0/0')).toBe(false);
    expect(matchesIpRule('fe80::1%eth0', 'fe80::/10')).toBe(false);
    expect(matchesIpRule('unknown', '0.0.0.0/0')).toBe(false);
    expect(matchesIpRule('203.0.113.7', '203.0.113.7/24')).toBe(false);
  });
});

describe('matchesAnyIpRule', () => {
  it('is true when one rule matches, ignoring invalid rules', () => {
    const rules = ['not-an-ip', '10.0.0.0/8', '2001:db8::/32'];

    expect(matchesAnyIpRule('10.1.2.3', rules)).toBe(true);
    expect(matchesAnyIpRule('2001:db8::5', rules)).toBe(true);
    expect(matchesAnyIpRule('192.168.0.1', rules)).toBe(false);
  });

  it('matches nothing for an empty list or an invalid address', () => {
    expect(matchesAnyIpRule('10.1.2.3', [])).toBe(false);
    expect(matchesAnyIpRule('unknown', ['0.0.0.0/0'])).toBe(false);
  });
});
