import { Conversation } from './entity/conversation.entity';
import { Message } from './entity/message.entity';

/** Entity → camelCase response mapping (static methods, per convention). */
export interface MessageResponse {
  id: number;
  senderType: string;
  senderName: string | null;
  body: string;
  createdAt: Date;
}

export interface ConversationResponse {
  conversationId: number;
  status: string;
  messages: MessageResponse[];
}

export class ChatMapper {
  static toMessageResponse(m: Message, senderName: string | null = null): MessageResponse {
    return { id: m.id, senderType: m.senderType, senderName, body: m.body, createdAt: m.createdAt };
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
