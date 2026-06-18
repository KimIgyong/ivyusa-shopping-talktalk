import type { ChatMessage } from '../../lib/types';
import { formatTime } from '../../lib/format';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const mine = message.senderType === 'user';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[80%]">
        <div
          className={[
            'whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm',
            mine
              ? 'rounded-br-none bg-primary-500 text-white'
              : 'rounded-bl-none bg-gray-100 text-gray-800',
          ].join(' ')}
        >
          {message.body}
        </div>
        {message.citations && message.citations.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {message.citations.map((c, i) => (
              <li key={i} className="text-xs text-primary-600">
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer" className="underline">
                    {c.title || c.url}
                  </a>
                ) : (
                  c.title
                )}
              </li>
            ))}
          </ul>
        )}
        <div
          className={`mt-0.5 text-[10px] text-gray-400 ${
            mine ? 'text-right' : 'text-left'
          }`}
        >
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}
