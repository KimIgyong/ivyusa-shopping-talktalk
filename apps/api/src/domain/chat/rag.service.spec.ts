import { RagService } from './rag.service';

/** RagService.classifyIntent — gateway JSON parsing with safe fallback. */
describe('RagService.classifyIntent', () => {
  const kbRepo = {} as never;

  function svc(aiText: string): RagService {
    const ai = { complete: jest.fn().mockResolvedValue({ text: aiText, tokensIn: 0, tokensOut: 0 }) };
    return new RagService(kbRepo, ai as never);
  }

  it('parses a valid intent JSON from the gateway', async () => {
    const res = await svc('{"intent":"order_status","needsOrderData":true,"confidence":0.9}').classifyIntent(1, 'where is my order');
    expect(res.intent).toBe('order_status');
    expect(res.needsOrderData).toBe(true);
  });

  it('falls back to product_inquiry when the gateway returns non-JSON', async () => {
    const res = await svc('not json at all').classifyIntent(1, 'hello');
    expect(res).toEqual({
      intent: 'product_inquiry',
      needsOrderData: false,
      confidence: 0.5,
      // Flagged so callers can tell "classified as a product question" from
      // "classification failed" — the fallback label is itself product-shaped,
      // and without this it would bias group-preferred retrieval (PLN-260804 D3).
      fallback: true,
    });
  });

  it('does not flag a real classification as a fallback', async () => {
    const res = await svc('{"intent":"order_status","needsOrderData":true,"confidence":0.9}')
      .classifyIntent(1, 'where is my order');
    expect(res.fallback).toBeUndefined();
  });
});

/** RagService.answer — order grounding for a signed-in shopper (#3). */
describe('RagService.answer with order context', () => {
  /**
   * No KB documents, so confidence falls to the 0.2 "nothing found" floor and the
   * order-context floor is the only thing that can lift it.
   *
   * The query builder is a self-returning proxy rather than a hand-built chain:
   * hybrid retrieval (FULLTEXT + Qdrant + RRF) reshaped that chain, and a literal
   * mock of it silently stopped matching. This stays valid whatever the chain does,
   * as long as it ends in getMany/getRawMany.
   */
  function build() {
    const qb: Record<string, unknown> = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'getMany' || prop === 'getRawMany') return async () => [];
          return () => qb;
        },
      },
    );
    const kbRepo = { createQueryBuilder: () => qb };
    const ai = {
      complete: jest.fn().mockResolvedValue({ text: 'Your order is on the way.', tokensIn: 1, tokensOut: 2 }),
      embed: jest.fn(),
    };
    // Vector leg off — the documented silent degrade to FULLTEXT-only. This suite is
    // about the order-context block, not retrieval.
    const qdrant = { enabled: false, search: jest.fn() };
    const aiConfig = { getPersonaRules: jest.fn().mockResolvedValue({ persona: 'P', rules: [] }) };
    const svc = new RagService(kbRepo as never, ai as never, qdrant as never, aiConfig as never);
    return { svc, ai, qdrant };
  }

  const ORDERS = '- Order #1002: status Confirmed, placed 2026-07-27, total 24.95 USD, items: Ski Wax x1';

  it('puts the order data in the prompt and marks it authoritative', async () => {
    const { svc, ai } = build();
    await svc.answer(1, 'where is my order', 'EN', ORDERS);

    const system = ai.complete.mock.calls[0][0].system as string;
    expect(system).toContain('CUSTOMER_ORDERS_START');
    expect(system).toContain('#1002');
    expect(system).toContain('CUSTOMER_ORDERS_END');
    expect(system).toMatch(/authoritative/i);
    // Guardrail: the model must not invent order facts.
    expect(system).toMatch(/never invent/i);
  });

  it('lifts confidence above the escalation threshold so order answers are delivered', async () => {
    const { svc } = build();
    const withOrders = await svc.answer(1, 'where is my order', 'EN', ORDERS);
    const withoutOrders = await svc.answer(1, 'where is my order', 'EN');

    // 0.45 is ChatService's ESCALATION_CONFIDENCE.
    expect(withOrders.confidence).toBeGreaterThan(0.45);
    expect(withoutOrders.confidence).toBeLessThan(0.45);
  });

  it('omits the order block entirely for a guest (no context passed)', async () => {
    const { svc, ai } = build();
    await svc.answer(1, 'what is your return policy', 'EN');

    const system = ai.complete.mock.calls[0][0].system as string;
    expect(system).not.toContain('CUSTOMER_ORDERS_START');
    expect(system).toContain('Answer ONLY from the context.');
  });

  it('treats a blank order context as absent', async () => {
    const { svc, ai } = build();
    const res = await svc.answer(1, 'where is my order', 'EN', '   ');

    const system = ai.complete.mock.calls[0][0].system as string;
    expect(system).not.toContain('CUSTOMER_ORDERS_START');
    expect(res.confidence).toBeLessThan(0.45);
  });
});
