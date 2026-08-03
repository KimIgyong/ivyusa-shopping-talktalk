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

/** Mirrors ModerationMapper (apps/api moderation.mapper.ts). */
export interface ModerationRule {
  id: string;
  scope: string; // both / ai / agent
  type: string; // word / phrase / regex / context
  pattern: string; // pattern, or the classifier prompt for type=context
  severity?: string;
  action: string; // block / mask / rephrase / warn
  isActive?: number;
  createdAt?: string;
}

export interface CreateModerationRule {
  scope: string;
  type: string;
  pattern_or_prompt: string;
  action: string;
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

// Backend returns { settings: [{function, engineId, engineName, params}], availableEngines: [...] }.
interface AiSettingsResponse {
  settings: { function: AiFunction; engineId: number | string | null; params?: Record<string, unknown> }[];
  availableEngines: AiEngineOption[];
}

export const aiSettingsService = {
  // Adapt the {settings, availableEngines} payload to a flat per-function array,
  // normalizing engineId to a string so it matches AiEngineOption.id in the Select.
  list: async (): Promise<AiFunctionSetting[]> => {
    const d = await apiGet<AiSettingsResponse>('/ai-settings');
    return (d.settings ?? []).map((s) => ({
      function: s.function,
      engineId: s.engineId == null ? null : String(s.engineId),
      params: s.params,
      availableEngines: d.availableEngines ?? [],
    }));
  },
  // engine_id is numeric server-side (@IsInt) — send a number, not the
  // stringified id the option list carries.
  update: (fn: AiFunction, body: { engine_id: string; params?: Record<string, unknown> }) =>
    apiPut<AiFunctionSetting>(`/ai-settings/${fn}`, {
      engine_id: Number(body.engine_id),
      ...(body.params !== undefined ? { params: body.params } : {}),
    }),
  getConfig: () => apiGet<AiConfig>('/ai-config'),
  updateConfig: (body: { persona?: string; rules?: string[]; scenario_buttons?: ScenarioButton[] }) =>
    apiPut<AiConfig>('/ai-config', body),
  rules: () => apiGet<ModerationRule[]>('/moderation/rules'),
  createRule: (body: CreateModerationRule) => apiPost<ModerationRule>('/moderation/rules', body),
  deleteRule: (id: string) => apiDelete<{ ok: true }>(`/moderation/rules/${id}`),
};
