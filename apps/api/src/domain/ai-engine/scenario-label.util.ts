import type { LocalizedText, SessionLanguage } from '@ivy/types';

/**
 * A scenario button's label in one language (PLN-260903 S3).
 *
 * Buttons are stored either as a plain string (the pre-S3 shape, and what a
 * tenant means by "same text everywhere") or as a per-language map. Readers
 * must never branch on that themselves — the widget contract is a string, and
 * a missed branch would render "[object Object]" on the shopper's menu.
 *
 * Falls back English-first, then any language that has text, then the empty
 * string: a button whose own language is blank should still be pressable.
 */
export function resolveScenarioLabel(
  label: string | LocalizedText | undefined,
  lang: SessionLanguage | null | undefined,
): string {
  if (typeof label === 'string') return label;
  if (!label) return '';
  const own = lang ? label[lang]?.trim() : '';
  if (own) return own;
  const en = label.EN?.trim();
  if (en) return en;
  return Object.values(label).find((v) => v?.trim())?.trim() ?? '';
}
