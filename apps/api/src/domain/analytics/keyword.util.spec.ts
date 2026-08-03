import { extractKeywords, normalizeQuestion } from './keyword.util';

describe('keyword extraction (question statistics, A3)', () => {
  it('strips punctuation and collapses whitespace', () => {
    expect(normalizeQuestion('Where  is my  order?!  #1001')).toBe('where is my order 1001');
  });

  it('drops English stopwords and keeps topic words', () => {
    const kw = extractKeywords('How do I return a damaged item?', 'en');
    expect(kw).toContain('return');
    expect(kw).toContain('damaged');
    expect(kw).toContain('item');
    expect(kw).not.toContain('how');
    expect(kw).not.toContain('the');
  });

  it('drops Spanish stopwords', () => {
    const kw = extractKeywords('¿Cuándo llega el envío de mi pedido?', 'es');
    expect(kw).toContain('llega');
    expect(kw).toContain('pedido');
    expect(kw).not.toContain('el');
    expect(kw).not.toContain('de');
  });

  it('uses character 2-grams for Korean (no morphological analyser in the stack)', () => {
    const kw = extractKeywords('반품 배송비는 얼마인가요?', 'ko');
    expect(kw).toContain('반품');
    expect(kw).toContain('배송');
    // 2-grams slide within each Hangul run, so the compound is covered too.
    expect(kw).toContain('송비');
  });

  it('keeps latin terms inside a Korean question', () => {
    const kw = extractKeywords('주문번호 AB1234 확인해주세요', 'ko');
    expect(kw).toContain('ab1234');
  });

  it('counts a repeated word once so a rambling question cannot outweigh a concise one', () => {
    const kw = extractKeywords('refund refund refund please', 'en');
    expect(kw.filter((k) => k === 'refund')).toHaveLength(1);
  });

  it('falls back to English tokenising when the language is unknown or null', () => {
    expect(extractKeywords('return shipping cost', null)).toContain('shipping');
    expect(extractKeywords('return shipping cost', 'de')).toContain('shipping');
  });

  it('returns nothing for empty or symbol-only input', () => {
    expect(extractKeywords('', 'en')).toEqual([]);
    expect(extractKeywords('??? !!!', 'en')).toEqual([]);
  });

  it('caps the number of terms per question', () => {
    const long = Array.from({ length: 40 }, (_, i) => `term${i}`).join(' ');
    expect(extractKeywords(long, 'en', 5)).toHaveLength(5);
  });
});
