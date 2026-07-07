import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { AgentProfile } from './entity/agent-profile.entity';
import { AgentDailyStat } from './entity/agent-daily-stat.entity';
import { AgentAlert } from './entity/agent-alert.entity';

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
export function toSessionResponse(c: Conversation, lastMessage: Message | null) {
  return {
    id: c.id,
    status: c.status,
    escalated: c.escalated === 1,
    lastMessagePreview: lastMessage ? lastMessage.body.slice(0, 140) : null,
    createdAt: c.createdAt,
  };
}

/** Message row in an agent conversation view. */
export function toMessageResponse(m: Message) {
  return {
    id: m.id,
    senderType: m.senderType,
    body: m.body,
    createdAt: m.createdAt,
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
