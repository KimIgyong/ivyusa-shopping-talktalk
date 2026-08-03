/**
 * Keyword extraction for the question-statistics keyword lens (PLN D2 / A3).
 *
 * No morphological analyser is in the stack, so Korean uses character 2-grams
 * over Hangul runs — the same strategy the KB's FULLTEXT index already uses
 * (ngram parser) — while English and Spanish use whitespace unigrams. Keeping
 * one function per language family here rather than reaching for a tokenizer
 * dependency keeps the aggregation job self-contained; if the 2-gram output
 * proves too noisy on real traffic, this is the single place to swap.
 */

/** Words too common to be a topic. Deliberately small: over-filtering hides real terms. */
const STOPWORDS: Record<string, Set<string>> = {
  en: new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'if', 'is', 'are', 'was', 'were', 'be', 'been',
    'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'as', 'it', 'this', 'that',
    'i', 'you', 'my', 'me', 'we', 'do', 'does', 'did', 'can', 'could', 'would', 'should',
    'how', 'what', 'when', 'where', 'why', 'who', 'please', 'thanks', 'thank', 'hi', 'hello',
    'have', 'has', 'had', 'not', 'no', 'yes', 'about', 'there', 'their', 'they', 'get',
  ]),
  es: new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'pero', 'si', 'es',
    'son', 'era', 'ser', 'de', 'del', 'en', 'con', 'por', 'para', 'como', 'que', 'esto',
    'eso', 'yo', 'tu', 'mi', 'me', 'nos', 'hacer', 'puedo', 'puede', 'podria', 'cuando',
    'donde', 'porque', 'quien', 'cual', 'por favor', 'gracias', 'hola', 'no', 'si', 'hay',
    'tengo', 'tiene', 'mas', 'muy', 'sobre',
  ]),
  // Particles and fillers that dominate Korean 2-grams without carrying topic.
  ko: new Set(['안녕', '감사', '해주', '주세', '세요', '있나', '나요', '인가', '가요', '습니', '니다', '알려', '려주']),
};

/** Strip punctuation/symbols, collapse whitespace, lowercase. */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Hangul syllable runs of at least two characters. */
function hangulRuns(text: string): string[] {
  return text.match(/[가-힣]{2,}/g) ?? [];
}

/**
 * Topic keywords for one question. `lang` comes from the stored message row, so
 * no detection is attempted — a wrong guess would silently mis-tokenize.
 * Returns de-duplicated terms; a word repeated in one question counts once, so
 * a rambling message cannot outweigh a concise one.
 */
export function extractKeywords(text: string, lang: string | null, limit = 8): string[] {
  const normalized = normalizeQuestion(text);
  if (!normalized) return [];
  const language = (lang ?? 'en').toLowerCase().slice(0, 2);
  const stop = STOPWORDS[language] ?? STOPWORDS.en;
  const terms: string[] = [];

  if (language === 'ko') {
    for (const run of hangulRuns(normalized)) {
      for (let i = 0; i + 2 <= run.length; i++) terms.push(run.slice(i, i + 2));
    }
    // Korean questions often carry latin product/order terms too.
    for (const w of normalized.split(' ')) {
      if (/^[a-z0-9]{2,}$/.test(w)) terms.push(w);
    }
  } else {
    for (const w of normalized.split(' ')) {
      if (w.length >= 2) terms.push(w);
    }
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of terms) {
    if (stop.has(term) || seen.has(term)) continue;
    seen.add(term);
    out.push(term);
    if (out.length >= limit) break;
  }
  return out;
}
