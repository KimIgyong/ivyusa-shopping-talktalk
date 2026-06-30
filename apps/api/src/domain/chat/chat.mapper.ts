import { Conversation } from './entity/conversation.entity';
import { Message } from './entity/message.entity';

/** Entity → camelCase response mapping (static methods, per convention). */
export interface MessageResponse {
  id: number;
  senderType: string;
  body: string;
  createdAt: Date;
}

export interface ConversationResponse {
  conversationId: number;
  status: string;
  messages: MessageResponse[];
}

export class ChatMapper {
  static toMessageResponse(m: Message): MessageResponse {
    return { id: m.id, senderType: m.senderType, body: m.body, createdAt: m.createdAt };
  }

  static toConversationResponse(conversation: Conversation, messages: Message[]): ConversationResponse {
    return {
      conversationId: conversation.id,
      status: conversation.status,
      messages: messages.map((m) => ChatMapper.toMessageResponse(m)),
    };
  }
}
