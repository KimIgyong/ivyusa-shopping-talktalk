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
    expect(res).toEqual({ intent: 'product_inquiry', needsOrderData: false, confidence: 0.5 });
  });
});

/** RagService.answer — order grounding for a signed-in shopper (#3). */
describe('RagService.answer with order context', () => {
  /** No KB documents, so confidence would be the 0.2 "nothing found" floor. */
  function build() {
    const kbRepo = {
      createQueryBuilder: () => ({
        where: () => ({
          andWhere: () => ({
            andWhere: () => ({
              orderBy: () => ({
                addOrderBy: () => ({ take: () => ({ getMany: async () => [] }) }),
              }),
            }),
          }),
        }),
      }),
    };
    const ai = {
      complete: jest.fn().mockResolvedValue({ text: 'Your order is on the way.', tokensIn: 1, tokensOut: 2 }),
    };
    const aiConfig = { getPersonaRules: jest.fn().mockResolvedValue({ persona: 'P', rules: [] }) };
    const svc = new RagService(kbRepo as never, ai as never, aiConfig as never);
    return { svc, ai };
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
