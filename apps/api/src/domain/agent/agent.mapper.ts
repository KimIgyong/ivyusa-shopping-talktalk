import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { AgentProfile } from './entity/agent-profile.entity';
import { AgentDailyStat } from './entity/agent-daily-stat.entity';
import { AgentAlert } from './entity/agent-alert.entity';
import { MessageAttachment } from '../attachment/entity/message-attachment.entity';
import { AttachmentMapper } from '../attachment/attachment.mapper';

/** Escalation alert row for the console alarm modal (FR-S3). */
export function toAlertResponse(a: AgentAlert) {
  return {
    id: a.id,
    conversationId: a.conversationId,
    sessionId: a.sessionId,
    reason: a.reason,
    preview: a.preview,
    status: a.status,
    createdAt: a.createdAt,
  };
}

/** Conversation row for the agent session queue (preview + flags). */
export function toSessionResponse(
  c: Conversation,
  lastMessage: Message | null,
  contact: { name: string | null; email: string | null } = { name: null, email: null },
  alias: string | null = null,
  autoReply: { mode: string; effective: boolean } = { mode: 'inherit', effective: true },
) {
  return {
    id: c.id,
    status: c.status,
    // The session this row belongs to. The row id is a CONVERSATION id (the
    // console calls it a session), so the real session id has to travel too —
    // the alias hangs off the session, not the conversation (PLN-260812).
    sessionId: String(c.sessionId),
    /** Operator-set name; wins over customerName in the console. */
    alias,
    /** Session choice: inherit | on | off (PLN-260812). */
    autoReplyMode: autoReply.mode,
    /** What that resolves to once the channel default is applied. */
    autoReplyEffective: autoReply.effective,
    // Which surface the shopper is on (widget/telegram/zalo/kakao/sms/email…).
    // The console badges it so an agent knows what they are replying into —
    // an SMS thread cannot be answered at all (PLN-260810 PR-M4).
    channel: c.channel || 'widget',
    escalated: c.escalated === 1,
    customerName: contact.name,
    // Fallback identity for a shopper who only ever left an address.
    customerEmail: contact.email,
    lastMessagePreview: lastMessage ? lastMessage.body.slice(0, 140) : null,
    lastMessageAt: lastMessage?.createdAt ?? null,
    createdAt: c.createdAt,
  };
}

/** Message row in an agent conversation view. */
export function toMessageResponse(
  m: Message,
  senderName: string | null = null,
  attachments?: MessageAttachment[],
) {
  return {
    id: m.id,
    senderType: m.senderType,
    senderId: m.senderId,
    senderName,
    body: m.body,
    createdAt: m.createdAt,
    // Signed links, minted per response (PLN-260814).
    attachments: AttachmentMapper.toResponseList(attachments),
  };
}

export function toProfileResponse(p: AgentProfile) {
  return {
    id: p.id,
    tenantId: p.tenantId,
    userId: p.userId,
    languages: p.languages,
    skills: p.skills,
    maxConcurrent: p.maxConcurrent,
    status: p.status,
  };
}

export function toStatResponse(s: AgentDailyStat) {
  return {
    id: s.id,
    tenantId: s.tenantId,
    agentId: s.agentId,
    statDate: s.statDate,
    handled: s.handled,
    avgFirstResponseSec: s.avgFirstResponseSec,
    avgHandleSec: s.avgHandleSec,
    resolved: s.resolved,
    escalated: s.escalated,
    csatAvg: s.csatAvg,
    onlineSec: s.onlineSec,
    blockedMsgs: s.blockedMsgs,
  };
}
