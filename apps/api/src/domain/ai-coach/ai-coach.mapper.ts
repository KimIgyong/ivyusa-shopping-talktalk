import { CoachingThread } from './entity/coaching-thread.entity';
import { CoachingMessage } from './entity/coaching-message.entity';
import { CoachingProposal } from './entity/coaching-proposal.entity';

/** Response shaping — camelCase (code convention §2). Static mapper, no DI. */
export class AiCoachMapper {
  static toThread(t: CoachingThread) {
    return {
      id: Number(t.id),
      title: t.title,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  static toThreadList(rows: CoachingThread[]) {
    return rows.map((t) => AiCoachMapper.toThread(t));
  }

  static toMessage(m: CoachingMessage) {
    return {
      id: Number(m.id),
      role: m.role,
      body: m.body,
      citations: m.meta?.citations ?? [],
      blocked: m.meta?.blocked ?? false,
      refTurn: m.meta?.refTurn ?? null,
      createdAt: m.createdAt,
    };
  }

  static toProposal(p: CoachingProposal) {
    return {
      id: Number(p.id),
      messageId: Number(p.messageId),
      type: p.type,
      status: p.status,
      persona: p.payload?.persona ?? null,
      rule: p.payload?.rule ?? null,
      targetRule: p.payload?.targetRule ?? null,
      rationale: p.payload?.rationale ?? null,
      conflictsWith: p.payload?.conflictsWith ?? [],
      appliedAt: p.appliedAt,
      // payload.previous is intentionally omitted: it is rollback state, not
      // something the console renders, and it can hold a full persona.
    };
  }

  static toThreadDetail(
    thread: CoachingThread,
    messages: CoachingMessage[],
    proposals: CoachingProposal[],
  ) {
    return {
      thread: AiCoachMapper.toThread(thread),
      messages: messages.map((m) => AiCoachMapper.toMessage(m)),
      proposals: proposals.map((p) => AiCoachMapper.toProposal(p)),
    };
  }
}
