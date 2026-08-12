import { CoachProposalService } from './coach-proposal.service';
import { PROPOSAL_STATUS, PROPOSAL_TYPE, type CoachingProposal } from './entity/coaching-proposal.entity';
import type { AiConfigService } from '../ai-engine/ai-config.service';
import type { KnowledgeService } from '../knowledge/knowledge.service';
import type { AuditService } from '../audit/audit.service';
import { BusinessException } from '../../global/exception/business.exception';

/**
 * The coaching channel's write path. These cases guard the two ways it could
 * quietly corrupt a tenant's configuration: inventing a change the model never
 * proposed, and applying a change to the wrong target after the config moved.
 */

type ConfigState = {
  persona: string;
  rules: string[];
  scenarioOverrides?: Record<string, unknown>;
};

/** Applying is always done by someone; master holds every capability. */
const MASTER = { userId: 9, rank: 'master' as const, labels: [] };
/** A manager may coach (AI_SETTINGS_MANAGE) but may not write knowledge. */
const MANAGER = { userId: 11, rank: 'manager' as const, labels: [] };

function serviceFor(
  state: ConfigState,
  stored: Partial<CoachingProposal> = {},
  repoOverrides: Partial<{
    find: () => Promise<CoachingProposal[]>;
    update: (ids: number[], patch: Record<string, unknown>) => Promise<void>;
  }> = {},
) {
  const saved: CoachingProposal[] = [];
  const kbCalls: Array<{ op: 'create' | 'update'; id?: number; body: Record<string, unknown> }> = [];
  const aiConfig = {
    getConfig: async () => ({
      ...state,
      rules: [...state.rules],
      scenarioOverrides: state.scenarioOverrides ?? {},
    }),
    upsertConfig: async (
      _t: number,
      input: { persona?: string; rules?: string[]; scenarioOverrides?: Record<string, unknown> },
    ) => {
      if (input.persona !== undefined) state.persona = input.persona;
      if (input.rules !== undefined) state.rules = input.rules;
      if (input.scenarioOverrides !== undefined) state.scenarioOverrides = input.scenarioOverrides;
      return state;
    },
  } as unknown as AiConfigService;

  const knowledge = {
    createDocument: async (_t: number, body: Record<string, unknown>) => {
      kbCalls.push({ op: 'create', body });
      return { id: 77 };
    },
    updateDocument: async (_t: number, id: number, body: Record<string, unknown>) => {
      kbCalls.push({ op: 'update', id, body });
      return { id };
    },
  } as unknown as KnowledgeService;

  const proposal = {
    id: 1,
    tenantId: 1,
    threadId: 1,
    messageId: 1,
    status: PROPOSAL_STATUS.PENDING,
    payload: {},
    appliedBy: null,
    appliedAt: null,
    ...stored,
  } as CoachingProposal;

  const repo = {
    findOne: async () => proposal,
    save: async (p: CoachingProposal) => {
      saved.push(p);
      return p;
    },
    find: repoOverrides.find ?? (async () => []),
    update: repoOverrides.update ?? (async () => undefined),
    create: (v: Partial<CoachingProposal>) => v as CoachingProposal,
  };

  const audit = { write: async () => undefined } as unknown as AuditService;
  const service = new CoachProposalService(repo as never, aiConfig, knowledge, audit);
  return { service, state, proposal, saved, kbCalls };
}

describe('CoachProposalService.extract', () => {
  const { service } = serviceFor({ persona: 'p', rules: [] });

  it('reads proposals out of the trailing json block and strips it from the prose', () => {
    const reply =
      'Your rules do not mention empathy. I suggest adding one.\n' +
      '```json\n{"proposals":[{"type":"rule_add","rule":"Open refund replies with empathy.",' +
      '"rationale":"No existing rule covers tone on refunds."}]}\n```';
    const { body, proposals } = service.extract(reply);

    expect(body).toBe('Your rules do not mention empathy. I suggest adding one.');
    expect(proposals).toHaveLength(1);
    expect(proposals[0].type).toBe(PROPOSAL_TYPE.RULE_ADD);
    expect(proposals[0].payload.rule).toBe('Open refund replies with empathy.');
  });

  it('returns no proposals when there is no json block', () => {
    const { body, proposals } = service.extract('That answer came from a stale document.');
    expect(proposals).toEqual([]);
    expect(body).toBe('That answer came from a stale document.');
  });

  it('falls back to prose-only on malformed json rather than guessing a change', () => {
    // The gateway silently falls back to the stub adapter on any provider
    // error, so unparseable output is an expected steady state — it must never
    // be repaired into an invented config change.
    const { body, proposals } = service.extract('Here you go.\n```json\n{"proposals":[{ oops\n```');
    expect(proposals).toEqual([]);
    expect(body).toBe('Here you go.');
  });

  it('drops entries with an unknown type or missing required fields', () => {
    const reply =
      '```json\n{"proposals":[' +
      '{"type":"delete_everything"},' +
      '{"type":"rule_edit","rule":"only a replacement"},' +
      '{"type":"rule_add","rule":"keep me"}' +
      ']}\n```';
    const { proposals } = service.extract(reply);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].payload.rule).toBe('keep me');
  });
});

describe('CoachProposalService.apply', () => {
  it('appends an approved rule through the config service', async () => {
    const { service, state } = serviceFor(
      { persona: 'p', rules: ['Be brief.'] },
      { type: PROPOSAL_TYPE.RULE_ADD, payload: { rule: 'Be warm.' } },
    );
    await service.apply(1, MASTER, 1);
    expect(state.rules).toEqual(['Be brief.', 'Be warm.']);
  });

  it('lets the admin apply edited wording instead of the drafted text', async () => {
    const { service, state } = serviceFor(
      { persona: 'p', rules: [] },
      { type: PROPOSAL_TYPE.RULE_ADD, payload: { rule: 'Drafted.' } },
    );
    await service.apply(1, MASTER, 1, { rule: 'What the human actually wants.' });
    expect(state.rules).toEqual(['What the human actually wants.']);
  });

  it('matches an edited rule by text, not by position', async () => {
    // A rule was inserted ahead of the target after the proposal was drafted;
    // an index-based apply would have rewritten the wrong line.
    const { service, state } = serviceFor(
      { persona: 'p', rules: ['Inserted later.', 'Be brief.'] },
      { type: PROPOSAL_TYPE.RULE_EDIT, payload: { targetRule: 'Be brief.', rule: 'Be brief but warm.' } },
    );
    await service.apply(1, MASTER, 1);
    expect(state.rules).toEqual(['Inserted later.', 'Be brief but warm.']);
  });

  it('refuses to apply when the targeted rule no longer exists', async () => {
    const { service, state } = serviceFor(
      { persona: 'p', rules: ['Something else entirely.'] },
      { type: PROPOSAL_TYPE.RULE_EDIT, payload: { targetRule: 'Be brief.', rule: 'Be warm.' } },
    );
    await expect(service.apply(1, MASTER, 1)).rejects.toBeInstanceOf(BusinessException);
    expect(state.rules).toEqual(['Something else entirely.']);
  });

  it('captures the replaced value so the change can be undone', async () => {
    const { service, state, saved } = serviceFor(
      { persona: 'Old persona.', rules: [] },
      { type: PROPOSAL_TYPE.PERSONA_PATCH, payload: { persona: 'New persona.' } },
    );
    await service.apply(1, MASTER, 1);
    expect(state.persona).toBe('New persona.');
    expect(saved[0].payload.previous?.persona).toBe('Old persona.');
  });

  it('rejects a proposal that is not pending', async () => {
    const { service } = serviceFor(
      { persona: 'p', rules: [] },
      { type: PROPOSAL_TYPE.RULE_ADD, payload: { rule: 'x' }, status: PROPOSAL_STATUS.APPLIED },
    );
    await expect(service.apply(1, MASTER, 1)).rejects.toBeInstanceOf(BusinessException);
  });

  it('refuses to exceed the rule budget', async () => {
    const rules = Array.from({ length: 40 }, (_, i) => `Rule ${i}`);
    const { service } = serviceFor(
      { persona: 'p', rules },
      { type: PROPOSAL_TYPE.RULE_ADD, payload: { rule: 'One too many.' } },
    );
    await expect(service.apply(1, MASTER, 1)).rejects.toBeInstanceOf(BusinessException);
  });
});

describe('CoachProposalService — knowledge and scenario proposals (W3)', () => {
  const KB = {
    type: PROPOSAL_TYPE.KB_UPSERT,
    payload: { docTitle: 'Return shipping', docCategory: 'policy', docContent: 'We pay for defects.' },
  };

  it('parses a knowledge proposal and keeps the document id when revising', () => {
    const { service } = serviceFor({ persona: 'p', rules: [] });
    const { proposals } = service.extract(
      '```json\n{"proposals":[{"type":"kb_upsert","docId":42,"docContent":"Revised body."}]}\n```',
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].payload.docId).toBe(42);
  });

  it('drops a new-document proposal that has no title or category to file it under', () => {
    // A revision may change only the body, but a new document with no title and
    // no category is unfindable — and an unfindable document is worse than none.
    const { service } = serviceFor({ persona: 'p', rules: [] });
    const { proposals } = service.extract(
      '```json\n{"proposals":[{"type":"kb_upsert","docContent":"Orphan body."}]}\n```',
    );
    expect(proposals).toEqual([]);
  });

  it('creates a document through KnowledgeService so re-embedding and revisions happen', async () => {
    const { service, kbCalls } = serviceFor({ persona: 'p', rules: [] }, KB);
    await service.apply(1, MASTER, 1);
    expect(kbCalls).toHaveLength(1);
    expect(kbCalls[0].op).toBe('create');
    expect(kbCalls[0].body).toMatchObject({ title: 'Return shipping', category: 'policy' });
  });

  it('revises the targeted document instead of creating a second one', async () => {
    const { service, kbCalls } = serviceFor(
      { persona: 'p', rules: [] },
      { type: PROPOSAL_TYPE.KB_UPSERT, payload: { docId: 42, docContent: 'Revised body.' } },
    );
    await service.apply(1, MASTER, 1);
    expect(kbCalls[0]).toMatchObject({ op: 'update', id: 42 });
  });

  it('refuses a knowledge write from someone who may coach but not manage knowledge', async () => {
    // A manager holds AI_SETTINGS_MANAGE, so the route guard lets them coach.
    // Writing knowledge is a separate privilege and the thread must not bypass it.
    const { service, kbCalls } = serviceFor({ persona: 'p', rules: [] }, KB);
    await expect(service.apply(1, MANAGER, 1)).rejects.toBeInstanceOf(BusinessException);
    expect(kbCalls).toEqual([]);
  });

  it('sends knowledge rollback to the document revision history rather than guessing', async () => {
    const { service } = serviceFor(
      { persona: 'p', rules: [] },
      { ...KB, status: PROPOSAL_STATUS.APPLIED },
    );
    await expect(service.revert(1, MASTER, 1)).rejects.toBeInstanceOf(BusinessException);
  });

  it('writes a scenario reply under its action and keeps the other actions', async () => {
    const { service, state } = serviceFor(
      { persona: 'p', rules: [], scenarioOverrides: { my_orders: { reply: { EN: 'Existing.' } } } },
      {
        type: PROPOSAL_TYPE.SCENARIO_OVERRIDE,
        payload: { scenarioAction: 'cancel_refund', scenarioReply: { EN: 'New copy.' } },
      },
    );
    await service.apply(1, MASTER, 1);
    expect(state.scenarioOverrides).toEqual({
      my_orders: { reply: { EN: 'Existing.' } },
      cancel_refund: { reply: { EN: 'New copy.' } },
    });
  });

  it('supersedes another pending proposal aimed at the same scenario action', async () => {
    // Two coaching turns about the same button leave two pending cards. Once
    // one is approved the other describes a config that no longer exists, and
    // approving it later would quietly overwrite the change just made.
    const peer = { id: 2, payload: { scenarioAction: 'cancel_refund' }, type: PROPOSAL_TYPE.SCENARIO_OVERRIDE };
    const other = { id: 3, payload: { scenarioAction: 'my_orders' }, type: PROPOSAL_TYPE.SCENARIO_OVERRIDE };
    const superseded: number[][] = [];
    const { service } = serviceFor(
      { persona: 'p', rules: [] },
      {
        type: PROPOSAL_TYPE.SCENARIO_OVERRIDE,
        payload: { scenarioAction: 'cancel_refund', scenarioReply: { EN: 'New.' } },
      },
      {
        find: async () => [peer, other] as never,
        update: async (ids: number[]) => {
          superseded.push(ids);
        },
      },
    );
    await service.apply(1, MASTER, 1);
    expect(superseded).toEqual([[2]]); // the same-action peer only
  });

  it('leaves two new-document proposals alone — neither invalidates the other', async () => {
    const peer = { id: 2, payload: { docTitle: 'Another doc' }, type: PROPOSAL_TYPE.KB_UPSERT };
    const superseded: number[][] = [];
    const { service } = serviceFor({ persona: 'p', rules: [] }, KB, {
      find: async () => [peer] as never,
      update: async (ids: number[]) => {
        superseded.push(ids);
      },
    });
    await service.apply(1, MASTER, 1);
    expect(superseded).toEqual([]);
  });

  it('restores every scenario override the change replaced', async () => {
    const before = { my_orders: { reply: { EN: 'Existing.' } } };
    const { service, state } = serviceFor(
      { persona: 'p', rules: [], scenarioOverrides: before },
      {
        type: PROPOSAL_TYPE.SCENARIO_OVERRIDE,
        status: PROPOSAL_STATUS.APPLIED,
        payload: {
          scenarioAction: 'cancel_refund',
          scenarioReply: { EN: 'New copy.' },
          previous: { scenarioOverrides: before },
        },
      },
    );
    await service.revert(1, MASTER, 1);
    expect(state.scenarioOverrides).toEqual(before);
  });
});

describe('CoachProposalService.revert', () => {
  it('restores the persona the proposal replaced', async () => {
    const { service, state } = serviceFor(
      { persona: 'New persona.', rules: [] },
      {
        type: PROPOSAL_TYPE.PERSONA_PATCH,
        status: PROPOSAL_STATUS.APPLIED,
        payload: { persona: 'New persona.', previous: { persona: 'Old persona.' } },
      },
    );
    await service.revert(1, MASTER, 1);
    expect(state.persona).toBe('Old persona.');
  });

  it('refuses when the persona changed again after this proposal was applied', async () => {
    const { service, state } = serviceFor(
      { persona: 'Someone edited this by hand.', rules: [] },
      {
        type: PROPOSAL_TYPE.PERSONA_PATCH,
        status: PROPOSAL_STATUS.APPLIED,
        payload: { persona: 'New persona.', previous: { persona: 'Old persona.' } },
      },
    );
    await expect(service.revert(1, MASTER, 1)).rejects.toBeInstanceOf(BusinessException);
    expect(state.persona).toBe('Someone edited this by hand.');
  });
});
