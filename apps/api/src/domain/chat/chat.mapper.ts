import type {
  ChatMessageResponse,
  ConversationResponse,
  ScenarioFollowUpResponse,
} from '@ivy/types';
import { Conversation } from './entity/conversation.entity';
import { Message } from './entity/message.entity';

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

export class ChatMapper {
  static toMessageResponse(m: Message, senderName: string | null = null): MessageResponse {
    return {
      id: String(m.id),
      senderType: m.senderType,
      senderName,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      quickReplies: followUpsOf(m),
    };
  }

  static toConversationResponse(
    conversation: Conversation,
    messages: Message[],
    senderNames?: Map<string, string>,
  ): ConversationResponse {
    return {
      conversationId: String(conversation.id),
      status: conversation.status,
      messages: messages.map((m) =>
        ChatMapper.toMessageResponse(
          m,
          m.senderId != null ? senderNames?.get(String(m.senderId)) ?? null : null,
        ),
      ),
    };
  }
}
