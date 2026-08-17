/**
 * Which supported language a shopper is writing in (PLN-260813 D1).
 *
 * Character ranges, not a model: the supported set is three languages, Hangul
 * does not overlap either of the others, and a per-turn model call to answer
 * "is this Korean?" would cost more than the problem.
 *
 * Returns null when the text is not evidence of anything. That case matters
 * more than it looks — "ok" in the middle of a Korean conversation must not
 * flip every later notice into English.
 */

/** Below this many letters a message says nothing about language (D5). */
const MIN_MEANINGFUL_CHARS = 4;

/** Hangul syllables. Jamo alone ("ㅇㅇ") is filler, not language. */
const HANGUL = /[가-힣]/;

/**
 * Spanish-only marks. A Spanish sentence without any of them reads as English
 * — a known limit of range-based detection (PLN-260813 §8). Missing a Spanish
 * message is the safer error: calling an English shopper Spanish is worse, and
 * the language picker settles it either way.
 */
const SPANISH_MARKS = /[ñÑ¿¡áéíóúÁÉÍÓÚüÜ]/;

const LATIN_LETTER = /[a-zA-ZñÑáéíóúÁÉÍÓÚüÜ]/;

export type DetectedLanguage = 'EN' | 'ES' | 'KO';

/** Letters only — digits, punctuation, emoji and spaces carry no signal. */
function meaningfulLength(text: string): number {
  return (text.match(/[\p{L}]/gu) ?? []).length;
}

export function detectLanguage(text: string | null | undefined): DetectedLanguage | null {
  const value = (text ?? '').trim();
  if (!value) return null;

  // The length gate runs first, ahead of the script rules. A single Hangul
  // syllable ("네") identifies the script but not the shopper's language —
  // one-word acknowledgements are exactly what the streak rule exists to
  // ignore, and letting them through here would defeat it.
  if (meaningfulLength(value) < MIN_MEANINGFUL_CHARS) return null;

  if (HANGUL.test(value)) return 'KO';
  if (SPANISH_MARKS.test(value)) return 'ES';
  return LATIN_LETTER.test(value) ? 'EN' : null;
}
