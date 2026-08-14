import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageAttachment } from './entity/message-attachment.entity';
import { Conversation } from '../chat/entity/conversation.entity';
import { AttachmentService } from './attachment.service';
import { AttachmentController } from './attachment.controller';
import { SessionModule } from '../session/session.module';
import { AuditModule } from '../audit/audit.module';

/**
 * Chat attachments (PLN-260814). Conversation is registered for its repository
 * only — importing ChatModule would make the graph cyclic, since chat is what
 * consumes this module to attach files to a message.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MessageAttachment, Conversation]),
    SessionModule,
    AuditModule,
  ],
  controllers: [AttachmentController],
  providers: [AttachmentService],
  exports: [AttachmentService, TypeOrmModule],
})
export class AttachmentModule {}
