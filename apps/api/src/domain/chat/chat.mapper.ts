import type {
  ChatCitation,
  ChatMessageResponse,
  ConversationResponse,
  ScenarioFollowUpResponse,
} from '@ivy/types';
import { Conversation } from './entity/conversation.entity';
import { Message } from './entity/message.entity';

/** How long after the thread ends a rating is still accepted (PLN-260810 D5). */
export const CSAT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Response shapes live in `@ivy/types` — the widget imports the same contract.
 */
export type MessageResponse = ChatMessageResponse;
export type { ConversationResponse };

/** Chips persisted on the message's trace by ScenarioService, if any. */
function followUpsOf(m: Message): ScenarioFollowUpResponse[] | undefined {
  const trace = m.retrievalTrace as { followUps?: unknown } | null;
  const raw = Array.isArray(trace?.followUps) ? trace.followUps : null;
  if (!raw?.length) return undefined;
  const chips = raw.filter(
    (f): f is { id: string; label: string } =>
      !!f &&
      typeof (f as { id?: unknown }).id === 'string' &&
      typeof (f as { label?: unknown }).label === 'string',
  );
  return chips.length ? chips.map((f) => ({ id: f.id, label: f.label })) : undefined;
}

/**
 * Knowledge references persisted on an AI turn's trace. Serving them with the
 * thread is what keeps a product recommendation clickable: the send response
 * carried them, but the next poll replaced that bubble with the stored row, so
 * the link disappeared after ~5s and never came back on reload.
 */
function citationsOf(m: Message): ChatCitation[] | undefined {
  const trace = m.retrievalTrace as { citations?: unknown } | null;
  const raw = Array.isArray(trace?.citations) ? trace.citations : null;
  if (!raw?.length) return undefined;
  const cites = raw.filter((c): c is ChatCitation => !!c && typeof c === 'object');
  return cites.length ? cites : undefined;
}

export class ChatMapper {
  static toMessageResponse(m: Message, senderName: string | null = null): MessageResponse {
    return {
      id: String(m.id),
      senderType: m.senderType,
      senderName,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      quickReplies: followUpsOf(m),
      citations: citationsOf(m),
    };
  }

  static toConversationResponse(
    conversation: Conversation,
    messages: Message[],
    senderNames?: Map<string, string>,
  ): ConversationResponse {
    const endedAt = conversation.endedAt?.getTime() ?? null;
    return {
      conversationId: String(conversation.id),
      status: conversation.status,
      csatRating: conversation.csatRating ?? null,
      // Offered only while the submission window is open — showing stars that
      // the API would refuse is worse than showing none.
      canRate:
        conversation.csatRating == null &&
        endedAt != null &&
        Date.now() - endedAt < CSAT_WINDOW_MS,
      messages: messages.map((m) =>
        ChatMapper.toMessageResponse(
          m,
          m.senderId != null ? senderNames?.get(String(m.senderId)) ?? null : null,
        ),
      ),
    };
  }
}
