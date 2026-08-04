import { useState } from 'react';
import { Bot, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/Card';
import { cn } from '@/lib/cn';
import { PreviewPanel } from './PreviewPanel';
import { CoachPanel } from './CoachPanel';

type StudioTab = 'preview' | 'coach';

/**
 * Right-hand panel of /ai-setting. Two conversations that look alike and are
 * not: in Preview the admin plays the shopper and sees what a customer would
 * get; in Coach the admin talks to the agent about its own behavior. The tabs
 * exist to keep those roles from blurring.
 *
 * PreviewPanel is rendered untouched — this is a shell around it, not a rewrite.
 */
export function AiStudioPanel() {
  const { t } = useTranslation('aiSetting');
  const [tab, setTab] = useState<StudioTab>('preview');

  const tabs: { key: StudioTab; label: string; icon: typeof Bot }[] = [
    { key: 'preview', label: t('preview.title'), icon: MessageSquare },
    { key: 'coach', label: t('coach.title'), icon: Bot },
  ];

  return (
    <div>
      <div
        role="tablist"
        aria-label={t('coach.tabsLabel')}
        className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-1"
      >
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
              tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'preview' ? (
        <PreviewPanel />
      ) : (
        <Card title={t('coach.title')}>
          <CoachPanel />
        </Card>
      )}
    </div>
  );
}
