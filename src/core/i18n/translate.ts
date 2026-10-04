import type { Locale } from '../../config';

/** A user-facing message written once per supported locale. */
export type LocalizedMessage = Readonly<Record<Locale, string>>;

/**
 * Accepted wherever a user-facing message is expected. Plain strings are reserved for text
 * that cannot be localized here (e.g. a message carried by a third-party exception); modules
 * must pass a `LocalizedMessage` (string literals are rejected by ESLint in `src/modules/**`).
 */
export type MessageInput = LocalizedMessage | string;

export const translate = (message: MessageInput, locale: Locale): string =>
  typeof message === 'string' ? message : message[locale];
