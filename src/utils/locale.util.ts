interface LanguageRange {
  tag: string;
  quality: number;
  order: number;
}

const parseQuality = (parameters: string[]): number => {
  const q = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith('q='));
  if (q === undefined) return 1;
  const value = Number(q.trim().slice(2));
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
};

const parseAcceptLanguage = (header: string): LanguageRange[] =>
  header
    .split(',')
    .map((part, order) => {
      const [rawTag = '', ...parameters] = part.split(';');
      return { tag: rawTag.trim().toLowerCase(), quality: parseQuality(parameters), order };
    })
    .filter((range) => range.tag !== '' && range.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.order - b.order);

/**
 * Picks the best supported locale from an `Accept-Language` header (RFC 9110 §12.5.4):
 * ranges are ordered by q-value (ties keep header order), `q=0` means "not acceptable",
 * `en-US` matches `en`, and `*` accepts the fallback. Unknown or missing → fallback.
 */
export const resolveLocale = <T extends string>(
  header: string | undefined,
  supported: readonly T[],
  fallback: T,
): T => {
  if (!header) return fallback;

  for (const { tag } of parseAcceptLanguage(header)) {
    if (tag === '*') return fallback;
    const primary = tag.split('-')[0];
    const match = supported.find((locale) => locale === tag || locale === primary);
    if (match !== undefined) return match;
  }
  return fallback;
};
