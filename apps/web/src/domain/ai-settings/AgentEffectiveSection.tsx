import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { LANGUAGES } from '../../../../../packages/types/src/common/language';
import { useAiConfig, useAiConfigDefaults } from './ai-settings.hooks';
import type { AiAgentRow } from './ai-agents.service';

/**
 * What this agent actually says, in one place (PLN-260903 S2-8).
 *
 * The pieces live in three different screens — greeting on the agent, persona
 * and rules on the AI settings, buttons on the tenant config — so nobody could
 * answer "what does the guest-facing agent open with?" without opening all
 * three and knowing which defaults fill the gaps. Read-only on purpose: each
 * value keeps exactly one editor, right below.
 */
export function AgentEffectiveSection({ agent }: { agent?: AiAgentRow }) {
  const { t } = useTranslation('aiSetting');
  const { data: config } = useAiConfig();
  const { data: defaults } = useAiConfigDefaults();

  if (!agent) return null;

  const greetingLangs = Object.entries(agent.greeting ?? {}).filter(([, v]) => (v ?? '').trim());
  // Persona and rules live on the AGENT row (PLN-260820); the tenant config
  // only answers for the default agent, so reading it here would show one
  // agent's persona under another's name.
  const persona = agent.persona ?? defaults?.persona ?? '';
  const usesDefaultPersona = !agent.persona || agent.persona === defaults?.persona;
  const rules = agent.rules?.length ? agent.rules : (defaults?.rules ?? []);
  const customRules = rules.filter((r) => !(defaults?.rules ?? []).includes(r));
  const visibleButtons = (config?.scenarioButtons ?? []).filter(
    (b) => b.enabled && (!b.agentIds?.length || b.agentIds.includes(Number(agent.id))),
  );

  const row = (label: string, body: ReactNode) => (
    <div className="grid grid-cols-[7rem_1fr] gap-3 border-b border-gray-100 py-2 last:border-b-0">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <div className="min-w-0 text-sm text-gray-700">{body}</div>
    </div>
  );

  return (
    <Card title={t('effective.title', { agent: agent.name })}>
      <p className="mb-2 text-xs text-gray-400">{t('effective.hint')}</p>

      {row(
        t('effective.greeting'),
        greetingLangs.length ? (
          <div className="space-y-1">
            {greetingLangs.slice(0, 2).map(([lang, text]) => (
              <p key={lang} className="truncate">
                <span className="mr-1 text-xs text-gray-400">
                  {LANGUAGES.find((l) => l.session === lang)?.code ?? lang}
                </span>
                {text}
              </p>
            ))}
            {greetingLangs.length > 2 && (
              <p className="text-xs text-gray-400">
                {t('effective.moreLangs', { count: greetingLangs.length - 2 })}
              </p>
            )}
          </div>
        ) : (
          <span className="text-gray-400">{t('effective.greetingDefault')}</span>
        ),
      )}

      {row(
        t('effective.persona'),
        <span className={usesDefaultPersona ? 'text-gray-400' : ''}>
          {usesDefaultPersona
            ? t('effective.personaDefault')
            : `${persona.slice(0, 120)}${persona.length > 120 ? '…' : ''}`}
        </span>,
      )}

      {row(
        t('effective.rules'),
        <span>
          {t('effective.rulesCount', { total: rules.length, custom: customRules.length })}
        </span>,
      )}

      {row(
        t('effective.buttons'),
        visibleButtons.length ? (
          <div className="flex flex-wrap gap-1.5">
            {visibleButtons.map((b) => (
              <Badge key={b.id} tone={b.agentIds?.length ? 'primary' : 'gray'}>
                {b.label}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-gray-400">{t('effective.noButtons')}</span>
        ),
      )}
    </Card>
  );
}
