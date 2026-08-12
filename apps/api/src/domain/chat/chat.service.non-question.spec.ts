import { ChatService } from './chat.service';

/**
 * Which turns are treated as having nothing to answer (PLN-260813 P2).
 *
 * The dangerous direction is permissive: a real question classified as small
 * talk gets a friendly greeting and no human, and the shopper is stuck. Both
 * gates — failed classification and low confidence — are pinned here, as is
 * the streak counter that offers a person when someone keeps circling.
 */
describe('ChatService — non-question turns', () => {
  const svc = Object.create(ChatService.prototype) as ChatService;
  (svc as unknown as { logger: unknown }).logger = { log: jest.fn(), warn: jest.fn() };

  const kindOf = (intent: Record<string, unknown>) =>
    (
      svc as unknown as {
        nonQuestionKind: (i: unknown) => string | null;
      }
    ).nonQuestionKind(intent);

  describe('classification', () => {
    it.each(['smalltalk', 'out_of_scope', 'unintelligible'])('takes %s at high confidence', (label) => {
      expect(kindOf({ intent: label, confidence: 0.9 })).toBe(label);
    });

    it.each(['order_status', 'delivery', 'cancel_refund', 'product_inquiry', 'agent_request', 'other'])(
      'leaves %s on the normal path',
      (label) => {
        expect(kindOf({ intent: label, confidence: 0.99 })).toBeNull();
      },
    );

    it('refuses below the threshold — an unsure greeting is answered normally', () => {
      expect(kindOf({ intent: 'smalltalk', confidence: 0.55 })).toBeNull();
    });

    it('takes the boundary value', () => {
      expect(kindOf({ intent: 'smalltalk', confidence: 0.6 })).toBe('smalltalk');
    });

    it('ignores a failed classification however confident it looks', () => {
      expect(kindOf({ intent: 'smalltalk', confidence: 0.99, fallback: true })).toBeNull();
    });

    it('treats a missing confidence as no confidence', () => {
      expect(kindOf({ intent: 'smalltalk' })).toBeNull();
    });
  });

  describe('streak', () => {
    const streakOf = async (intents: (string | null)[]) => {
      const msgRepo = {
        find: jest.fn(async () => intents.map((intent, i) => ({ id: 100 - i, intent }))),
      };
      Object.assign(svc as unknown as Record<string, unknown>, { msgRepo });
      return (
        svc as unknown as { nonQuestionStreak: (id: number) => Promise<number> }
      ).nonQuestionStreak(1);
    };

    it('counts only the turns before this one', async () => {
      // Newest first; the head is the turn being handled right now.
      expect(await streakOf(['smalltalk', 'smalltalk', 'smalltalk'])).toBe(2);
    });

    it('stops at the first real question', async () => {
      expect(await streakOf(['smalltalk', 'smalltalk', 'delivery'])).toBe(1);
    });

    it('is zero when the previous turn was a real question', async () => {
      expect(await streakOf(['smalltalk', 'order_status', 'smalltalk'])).toBe(0);
    });

    it('stops at a turn that was never classified', async () => {
      // Old rows predate intent storage; absence is not evidence of small talk.
      expect(await streakOf(['smalltalk', null, 'smalltalk'])).toBe(0);
    });

    it('is zero on the first turn of a conversation', async () => {
      expect(await streakOf(['smalltalk'])).toBe(0);
    });
  });
});
