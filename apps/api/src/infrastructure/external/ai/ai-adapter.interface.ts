/** Normalized AI request/response across providers (FR-070). */
export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionRequest {
  system?: string;
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
  model: string;
  apiKey?: string;
  endpoint?: string;
}

export interface AiCompletionResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  provider: string;
  model: string;
}

export interface AiAdapter {
  readonly provider: string;
  complete(req: AiCompletionRequest): Promise<AiCompletionResult>;
}
