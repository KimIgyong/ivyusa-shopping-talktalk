import { Injectable, Logger } from '@nestjs/common';
import { AiAdapter, AiCompletionRequest, AiCompletionResult } from '../ai-adapter.interface';

/**
 * Anthropic Claude adapter (default real provider). Uses the Messages API via
 * fetch (no SDK dependency). Falls back to throwing so the gateway can degrade
 * to the stub adapter when no key is configured.
 */
@Injectable()
export class AnthropicAdapter implements AiAdapter {
  readonly provider = 'anthropic';
  private readonly logger = new Logger(AnthropicAdapter.name);

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const apiKey = req.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Anthropic API key not configured');

    const res = await fetch(req.endpoint ?? 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: req.model || process.env.ANTHROPIC_MODEL || 'claude-opus-4-8',
        max_tokens: req.maxTokens ?? 1024,
        temperature: req.temperature ?? 0.3,
        system: req.system,
        messages: req.messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) {
      this.logger.error(`Anthropic error ${res.status}`);
      throw new Error(`Anthropic API error ${res.status}`);
    }
    const data: any = await res.json();
    const text = (data.content ?? []).map((c: any) => c.text ?? '').join('');
    return {
      text,
      tokensIn: data.usage?.input_tokens ?? 0,
      tokensOut: data.usage?.output_tokens ?? 0,
      provider: this.provider,
      model: data.model ?? req.model,
    };
  }
}
