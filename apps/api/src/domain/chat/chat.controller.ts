import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ScenarioService } from './scenario.service';
import { ChatMapper } from './chat.mapper';
import { SendMessageRequest, EscalateRequest, ScenarioRequest } from './dto/request/chat.request';
import { SessionService } from '../session/session.service';
import { Public } from '../../global/decorator/public.decorator';

/** Widget-facing chat endpoints (public; session-token identified). */
@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly scenarioService: ScenarioService,
    private readonly sessionService: SessionService,
  ) {}

  @Post('scenario')
  @Public()
  @ApiOperation({ summary: 'Scenario button/quick-reply → deterministic scripted reply (FR-S1)' })
  async scenario(@Body() body: ScenarioRequest) {
    const session = await this.sessionService.findByToken(body.session_token);
    return this.scenarioService.handle(session, body.action);
  }

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
    const senderNames = await this.chatService.resolveSenderNames(messages);
    return ChatMapper.toConversationResponse(conversation, messages, senderNames);
  }

  @Post('escalate')
  @Public()
  @ApiOperation({ summary: 'Request a human agent (FR-015)' })
  async escalate(@Body() body: EscalateRequest) {
    await this.chatService.escalate(body.conversation_id);
    return { escalated: true };
  }
}
