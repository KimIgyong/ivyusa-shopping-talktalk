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
