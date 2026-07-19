import type { ChatMessage } from '../../lib/types';
import { formatTime } from '../../lib/format';

/**
 * Citation URLs come from tenant-editable KB sources — only allow http(s) so a
 * `javascript:` URL can never become a stored-XSS link in the storefront (FE-M1).
 */
function safeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const mine = message.senderType === 'user';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[80%]">
        {message.senderType === 'agent' && message.senderName && (
          <div className="mb-0.5 text-[11px] font-medium text-gray-500">{message.senderName}</div>
        )}
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
            {message.citations.map((c, i) => {
              const href = c.url ? safeHttpUrl(c.url) : null;
              return (
                <li key={i} className="text-xs text-primary-600">
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                      {c.title || c.url}
                    </a>
                  ) : (
                    c.title || c.url
                  )}
                </li>
              );
            })}
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
