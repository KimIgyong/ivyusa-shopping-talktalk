import { detectLanguage } from './detect-language.util';

describe('detectLanguage', () => {
  describe('Korean', () => {
    it.each([
      '배송 언제 오나요?',
      '상담원 연결해 주세요',
      '뉴욕 날씨 알려주시오',
      // Mixed script: one Hangul syllable settles it, because no other
      // supported language uses them.
      '배송 언제 오나요? shipping',
      'iPhone 케이스 재고 있나요',
    ])('reads %s as Korean', (text) => {
      expect(detectLanguage(text)).toBe('KO');
    });
  });

  describe('Spanish', () => {
    it.each([
      '¿Cuándo llega mi pedido?',
      'Necesito hablar con un agente, ¿es posible?',
      'Mi pedido no ha llegado todavía',
    ])('reads %s as Spanish', (text) => {
      expect(detectLanguage(text)).toBe('ES');
    });

    it('reads unmarked Spanish as English — the known limit', () => {
      // No ñ, no ¿, no accents. Range detection cannot separate this from
      // English, and guessing Spanish would mislabel English shoppers.
      expect(detectLanguage('Quiero cancelar mi pedido')).toBe('EN');
    });
  });

  describe('English', () => {
    it.each([
      'How long does shipping take?',
      'Can I talk to a real person?',
      'I want to cancel my order',
    ])('reads %s as English', (text) => {
      expect(detectLanguage(text)).toBe('EN');
    });
  });

  describe('no evidence', () => {
    it.each(['ok', 'ㅇㅇ', '네', '?', '   ', '', '123 456', '👍👍'])(
      'returns null for %s',
      (text) => {
        // Short acknowledgements are the flip-flop hazard: one "ok" must never
        // turn a Korean conversation's notices English.
        expect(detectLanguage(text)).toBeNull();
      },
    );

    it('returns null for null and undefined', () => {
      expect(detectLanguage(null)).toBeNull();
      expect(detectLanguage(undefined)).toBeNull();
    });

    it('counts letters, not length — punctuation does not buy a verdict', () => {
      expect(detectLanguage('!!! ??? ...')).toBeNull();
      // Three letters, however many exclamation marks follow.
      expect(detectLanguage('yes!!!!!!!!')).toBeNull();
      expect(detectLanguage('yeah!!!')).toBe('EN');
    });
  });
});
