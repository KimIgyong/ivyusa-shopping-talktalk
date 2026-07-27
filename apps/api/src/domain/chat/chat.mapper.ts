import { Conversation } from './entity/conversation.entity';
import { Message } from './entity/message.entity';

/** Entity → camelCase response mapping (static methods, per convention). */
export interface MessageResponse {
  id: number;
  senderType: string;
  senderName: string | null;
  body: string;
  createdAt: Date;
  /**
   * Follow-up chips for a scripted turn, when the message carries them. Returned
   * on the conversation read so the widget can restore them after a tab switch or
   * page reload — they used to exist only in the scenario response.
   */
  quickReplies?: Array<{ id: string; label: string }>;
}

/** Chips persisted on the message's trace by ScenarioService, if any. */
function followUpsOf(m: Message): Array<{ id: string; label: string }> | undefined {
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

export interface ConversationResponse {
  conversationId: number;
  status: string;
  messages: MessageResponse[];
}

export class ChatMapper {
  static toMessageResponse(m: Message, senderName: string | null = null): MessageResponse {
    return {
      id: m.id,
      senderType: m.senderType,
      senderName,
      body: m.body,
      createdAt: m.createdAt,
      quickReplies: followUpsOf(m),
    };
  }

  static toConversationResponse(
    conversation: Conversation,
    messages: Message[],
    senderNames?: Map<string, string>,
  ): ConversationResponse {
    return {
      conversationId: conversation.id,
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
