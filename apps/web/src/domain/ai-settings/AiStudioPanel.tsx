import { useState } from 'react';
import { Bot, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/Card';
import { cn } from '@/lib/cn';
import { PreviewPanel, type CoachTarget } from './PreviewPanel';
import { CoachPanel } from './CoachPanel';

type StudioTab = 'preview' | 'coach';

/**
 * Right-hand panel of /ai-setting. Two conversations that look alike and are
 * not: in Preview the admin plays the shopper and sees what a customer would
 * get; in Coach the admin talks to the agent about its own behavior. The tabs
 * exist to keep those roles from blurring.
 *
 * The shell owns what passes between them (W3): an answer handed over for
 * coaching, and a question sent back to be re-asked after a change was applied.
 * Both panels stay mounted so a running preview session survives tab switches.
 */
export function AiStudioPanel() {
  const { t } = useTranslation('aiSetting');
  const [tab, setTab] = useState<StudioTab>('preview');
  const [coachTarget, setCoachTarget] = useState<CoachTarget | null>(null);
  const [replayQuestion, setReplayQuestion] = useState<string | null>(null);

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

      {/* Hidden rather than unmounted: unmounting Preview would drop the sandbox
          session, so every trip to the coaching tab would restart the chat. */}
      <div className={cn(tab === 'preview' ? 'block' : 'hidden')}>
        <PreviewPanel
          onCoach={(target) => {
            setCoachTarget(target);
            setTab('coach');
          }}
          replayQuestion={replayQuestion}
          onReplayed={() => setReplayQuestion(null)}
        />
      </div>

      <div className={cn(tab === 'coach' ? 'block' : 'hidden')}>
        <Card title={t('coach.title')}>
          <CoachPanel
            target={coachTarget}
            onClearTarget={() => setCoachTarget(null)}
            onVerifyInPreview={(question) => {
              setReplayQuestion(question);
              setTab('preview');
            }}
          />
        </Card>
      </div>
    </div>
  );
}
