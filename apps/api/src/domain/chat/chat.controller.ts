import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsString, MinLength } from 'class-validator';
import { ChatService } from './chat.service';
import { SessionService } from '../session/session.service';
import { Public } from '../../global/decorator/public.decorator';

class SendMessageRequest {
  @IsString() session_token: string;
  @IsString() @MinLength(1) message: string;
}
class EscalateRequest {
  @IsInt() conversation_id: number;
}

/** Widget-facing chat endpoints (public; session-token identified). */
@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly sessionService: SessionService,
  ) {}

  @Post('message')
  @Public()
  @ApiOperation({ summary: 'Send a message; returns AI reply (S5, SEQ-03)' })
  async message(@Body() body: SendMessageRequest) {
    const session = await this.sessionService.findByToken(body.session_token);
    return this.chatService.handleUserMessage(session, body.message);
  }

  @Get('conversation/:token')
  @Public()
  @ApiOperation({ summary: 'Get current conversation messages for a session' })
  async conversation(@Param('token') token: string) {
    const session = await this.sessionService.findByToken(token);
    const conversation = await this.chatService.getOrCreateConversation(session.id);
    const messages = await this.chatService.listMessages(conversation.id);
    return {
      conversationId: conversation.id,
      status: conversation.status,
      messages: messages.map((m) => ({
        id: m.id,
        senderType: m.senderType,
        body: m.body,
        createdAt: m.createdAt,
      })),
    };
  }

  @Post('escalate')
  @Public()
  @ApiOperation({ summary: 'Request a human agent (FR-015)' })
  async escalate(@Body() body: EscalateRequest) {
    await this.chatService.escalate(body.conversation_id);
    return { escalated: true };
  }
}
