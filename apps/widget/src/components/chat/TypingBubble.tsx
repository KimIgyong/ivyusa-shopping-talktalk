import { useTranslation } from 'react-i18next';

/**
 * Reply-pending indicator (PLN-260804): an assistant-styled bubble with three
 * pulsing dots so the shopper sees movement during the seconds a reply takes.
 * `agent` switches the wording to "an agent is typing…" once the conversation
 * is handed off to a human.
 */
export function TypingBubble({ agent }: { agent?: boolean }) {
  const { t } = useTranslation();
  const label = agent ? t('chat.typingAgent') : t('chat.typingAi');
  return (
    <div className="flex justify-start" role="status" aria-live="polite" aria-label={label}>
      <div className="flex max-w-[85%] items-center gap-2 rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2">
        <span className="flex items-center gap-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </span>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
    </div>
  );
}
