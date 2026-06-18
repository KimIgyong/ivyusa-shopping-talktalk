import { Injectable } from '@nestjs/common';
import { AiAdapter, AiCompletionRequest, AiCompletionResult } from '../ai-adapter.interface';

/**
 * Deterministic offline adapter so the whole system runs without API keys.
 * It produces grounded-looking answers from the provided context block and
 * honors lightweight JSON-mode prompts used by intent/moderation classifiers.
 */
@Injectable()
export class StubAdapter implements AiAdapter {
  readonly provider = 'stub';

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const system = req.system ?? '';
    let text: string;

    if (system.includes('JSON_MODE:intent')) {
      text = JSON.stringify(this.classifyIntent(lastUser));
    } else if (system.includes('JSON_MODE:moderation')) {
      text = JSON.stringify({ flagged: false, reason: '' });
    } else {
      text = this.answer(lastUser, system);
    }
    return {
      text,
      tokensIn: this.estimate(system + lastUser),
      tokensOut: this.estimate(text),
      provider: this.provider,
      model: req.model || 'stub-1',
    };
  }

  private answer(question: string, system: string): string {
    const ctxMatch = system.match(/CONTEXT_START([\s\S]*?)CONTEXT_END/);
    const ctx = ctxMatch?.[1]?.trim();
    if (ctx) {
      const firstLine = ctx.split('\n').filter(Boolean)[0] ?? '';
      return `Based on our help center: ${firstLine} (If this doesn't fully answer your question, I can connect you with a support agent.)`;
    }
    return `Thanks for your question about "${question.slice(0, 80)}". I can help with orders, shipping, returns, and product info. Could you share a bit more, or tap a menu option?`;
  }

  private classifyIntent(text: string): { intent: string; needsOrderData: boolean; confidence: number } {
    const t = text.toLowerCase();
    // General policy / FAQ questions stay in RAG (no auth gate) even if they mention return/refund.
    const policy = /(policy|정책|how (do|long)|faq|warranty|보증)/.test(t);
    const tracking = /(track|where('?s| is)|order status|my order|배송\s*조회|주문\s*조회|delivery status)/.test(t);
    const ownOrderAction =
      /(cancel|refund|취소|환불|반품)/.test(t) && /(my|this|order|#|주문|결제)/.test(t);
    if (!policy && tracking) return { intent: 'order_status', needsOrderData: true, confidence: 0.9 };
    if (!policy && ownOrderAction) return { intent: 'cancel_refund', needsOrderData: true, confidence: 0.85 };
    return { intent: 'product_inquiry', needsOrderData: false, confidence: 0.7 };
  }

  private estimate(s: string): number {
    return Math.ceil(s.length / 4);
  }
}
