import { ChatService } from './chat.service';

/**
 * Whether a turn means "get me a person" (PLN-260813 P1).
 *
 * The cost of a false negative is a shopper waiting for someone who is never
 * coming; the cost of a false positive is a polluted queue. Both directions
 * are pinned here.
 */
describe('ChatService.wantsHuman', () => {
  const svc = Object.create(ChatService.prototype) as ChatService;
  (svc as unknown as { logger: unknown }).logger = { log: jest.fn(), warn: jest.fn() };
  const wantsHuman = (intent: Record<string, unknown>, text: string): boolean =>
    (svc as unknown as { wantsHuman: (i: unknown, t: string) => boolean }).wantsHuman(intent, text);

  const none = { intent: 'product_inquiry', confidence: 0.9 };

  describe('phrasing', () => {
    it.each([
      'Can I talk to a real person?',
      'I want to speak with an agent',
      'can you connect me — I need to chat with someone',
      'Could I get a human agent please',
      '¿Puedo hablar con una persona?',
      '상담원 연결해 주세요',
      '그래도 상담원과 직접 통화하고 싶어요',
      '상담원 바꿔주세요',
      '사람과 대화하고 싶어요',
    ])('reads %s as a request', (text) => {
      // These three are the sentences that went unanswered on staging.
      expect(wantsHuman(none, text)).toBe(true);
    });

    it.each([
      '상담원이 몇 명인가요?',
      '상담원분 친절하시네요',
      'Your agent was lovely, thank you',
      'What are your agent working hours?',
      'How long does shipping take?',
    ])('does not read %s as a request', (text) => {
      // A polluted queue is the other failure mode; mentioning agents is not
      // asking for one.
      expect(wantsHuman(none, text)).toBe(false);
    });
  });

  describe('classifier', () => {
    it('hands off on a confident agent_request', () => {
      expect(wantsHuman({ intent: 'agent_request', confidence: 0.8 }, 'is anyone there')).toBe(true);
    });

    it('does not hand off below the threshold', () => {
      expect(wantsHuman({ intent: 'agent_request', confidence: 0.55 }, 'is anyone there')).toBe(
        false,
      );
    });

    it('takes the boundary value', () => {
      expect(wantsHuman({ intent: 'agent_request', confidence: 0.6 }, 'is anyone there')).toBe(true);
    });

    it('ignores a failed classification, however confident it looks', () => {
      // The fallback label is a confident product_inquiry; a parse failure
      // must not put shoppers in the queue.
      expect(
        wantsHuman({ intent: 'agent_request', confidence: 0.99, fallback: true }, 'anything'),
      ).toBe(false);
    });

    it('ignores every other intent', () => {
      expect(wantsHuman({ intent: 'order_status', confidence: 0.99 }, 'where is my order')).toBe(
        false,
      );
    });

    it('treats a missing confidence as no confidence', () => {
      expect(wantsHuman({ intent: 'agent_request' }, 'hello')).toBe(false);
    });
  });

  it('lets the phrase list rescue a failed classification', () => {
    // Belt and braces: the classifier died, the shopper still asked plainly.
    expect(
      wantsHuman({ intent: 'product_inquiry', confidence: 0.5, fallback: true }, '상담원 연결해 주세요'),
    ).toBe(true);
  });
});
