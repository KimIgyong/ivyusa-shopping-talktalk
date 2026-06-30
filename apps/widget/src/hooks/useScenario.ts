import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getScenario } from '../services/scenarioService';
import type { ScenarioButton } from '../lib/types';

/**
 * Resolves the scenario menu buttons. Reads the admin-managed config from the
 * backend (labels come from config). On error/empty, falls back to the
 * hardcoded default set so the widget always shows a menu.
 */
export function useScenario(sessionToken: string | null): ScenarioButton[] {
  const { t } = useTranslation();

  const { data } = useQuery({
    queryKey: ['scenario', sessionToken],
    queryFn: () => getScenario(sessionToken!),
    enabled: !!sessionToken,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const fallback: ScenarioButton[] = [
    { id: 'delivery_status', label: t('chat.scenarios.delivery'), action: 'delivery_status', enabled: true },
    { id: 'cancel_refund', label: t('chat.scenarios.cancelRefund'), action: 'cancel_refund', enabled: true },
    { id: 'product_help', label: t('chat.scenarios.productHelp'), action: 'product_help', enabled: true },
    { id: 'contact_support', label: t('chat.scenarios.contact'), action: 'contact_support', enabled: true },
    { id: 'affiliate', label: t('chat.scenarios.affiliate'), action: 'affiliate', enabled: true },
    { id: 'my_orders', label: t('chat.scenarios.myOrders'), action: 'my_orders', enabled: true },
  ];

  const buttons = data?.scenarioButtons;
  if (!buttons || buttons.length === 0) return fallback;
  return buttons;
}
