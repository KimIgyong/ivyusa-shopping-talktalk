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

export interface ScenarioButton {
  id: string;
  label: string;
  action: string;
  enabled: boolean;
}

export interface AiConfig {
  persona: string;
  rules: string[];
  scenarioButtons: ScenarioButton[];
}

export const aiSettingsService = {
  list: () => apiGet<AiFunctionSetting[]>('/ai-settings'),
  update: (fn: AiFunction, body: { engine_id: string; params?: Record<string, unknown> }) =>
    apiPut<AiFunctionSetting>(`/ai-settings/${fn}`, body),
  getConfig: () => apiGet<AiConfig>('/ai-config'),
  updateConfig: (body: { persona?: string; rules?: string[]; scenario_buttons?: ScenarioButton[] }) =>
    apiPut<AiConfig>('/ai-config', body),
  rules: () => apiGet<ModerationRule[]>('/moderation/rules'),
  createRule: (body: { pattern: string; action: string; description?: string }) =>
    apiPost<ModerationRule>('/moderation/rules', body),
  deleteRule: (id: string) => apiDelete<{ ok: true }>(`/moderation/rules/${id}`),
};
