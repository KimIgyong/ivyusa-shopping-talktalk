import { apiGet, apiPut, apiPost, apiDelete } from '@/lib/api-client';

export type AiFunction = 'chat' | 'rag' | 'summary' | 'assist' | 'moderation';

export interface AiEngineOption {
  id: string;
  name: string;
  provider?: string;
  model?: string;
}

export interface AiFunctionSetting {
  function: AiFunction;
  engineId: string | null;
  params?: Record<string, unknown>;
  availableEngines: AiEngineOption[];
}

export interface ModerationRule {
  id: string;
  pattern: string;
  action: string; // block / flag / warn
  description?: string;
  createdAt?: string;
}

export const aiSettingsService = {
  list: () => apiGet<AiFunctionSetting[]>('/ai-settings'),
  update: (fn: AiFunction, body: { engine_id: string; params?: Record<string, unknown> }) =>
    apiPut<AiFunctionSetting>(`/ai-settings/${fn}`, body),
  rules: () => apiGet<ModerationRule[]>('/moderation/rules'),
  createRule: (body: { pattern: string; action: string; description?: string }) =>
    apiPost<ModerationRule>('/moderation/rules', body),
  deleteRule: (id: string) => apiDelete<{ ok: true }>(`/moderation/rules/${id}`),
};
