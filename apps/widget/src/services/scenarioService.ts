import { apiClient } from '../lib/api-client';
import type { ScenarioButton } from '../lib/types';

export interface ScenarioConfig {
  scenarioButtons: ScenarioButton[];
}

/**
 * Fetch the admin-managed scenario menu for the current session.
 * Public endpoint (no auth header); buttons are already filtered to enabled.
 */
export function getScenario(sessionToken: string): Promise<ScenarioConfig> {
  return apiClient.get<ScenarioConfig>('/ai-config/scenario', {
    session_token: sessionToken,
  });
}
