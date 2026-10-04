import { describe, expect, it } from 'bun:test';
import { SUPPORTED_LOCALES } from '../../config';
import { I18N_MESSAGES, routeNotFoundMessage } from './messages';
import { translate } from './translate';

describe('translate (Unit)', () => {
  it('should pick the requested locale from a localized message', () => {
    const message = { id: 'Halo', en: 'Hello' };

    expect(translate(message, 'id')).toBe('Halo');
    expect(translate(message, 'en')).toBe('Hello');
  });

  it('should return plain strings unchanged for every locale', () => {
    expect(translate('Raw vendor text', 'id')).toBe('Raw vendor text');
    expect(translate('Raw vendor text', 'en')).toBe('Raw vendor text');
  });

  it('should build a localized route-not-found message', () => {
    expect(routeNotFoundMessage('GET', '/x')).toEqual({
      id: 'Rute tidak ditemukan: GET /x',
      en: 'Route not found: GET /x',
    });
  });
});

describe('I18N_MESSAGES registry', () => {
  it.each(Object.entries(I18N_MESSAGES))(
    '%s defines a non-empty text for every locale',
    (_, message) => {
      for (const locale of SUPPORTED_LOCALES) {
        expect(message[locale].trim().length).toBeGreaterThan(0);
      }
    },
  );
});
