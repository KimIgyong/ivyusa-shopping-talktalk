import { AnswerProposalService } from './answer-proposal.service';
import { PROPOSAL_STATUS } from './entity/kb-answer-proposal.entity';

/**
 * The queue exists so that finding a gap and publishing knowledge are separate
 * acts (D3). These pin who can do which, and that a decision sticks.
 */
describe('AnswerProposalService', () => {
  function build(existing: any = null, stored: any = null) {
    const saved: any[] = [];
    const proposalRepo = {
      findOne: jest.fn(async ({ where }: any) =>
        where.status === PROPOSAL_STATUS.PENDING ? existing : stored,
      ),
      create: (p: any) => ({ id: 11, ...p }),
      save: jest.fn(async (p: any) => {
        saved.push(p);
        return p;
      }),
      count: jest.fn(async () => 3),
      find: jest.fn(async () => []),
    };
    const knowledge = { createDocument: jest.fn(async () => ({ id: 909 })) };
    return {
      svc: new AnswerProposalService(proposalRepo as never, knowledge as never),
      saved,
      knowledge,
      proposalRepo,
    };
  }

  const pending = (over: any = {}) => ({
    id: 11,
    tenantId: 1,
    conversationId: 42,
    question: 'Do you ship to Canada?',
    answer: 'Not yet — US only for now.',
    status: PROPOSAL_STATUS.PENDING,
    ...over,
  });

  describe('propose', () => {
    it('queues the answer without writing any knowledge', async () => {
      const { svc, saved, knowledge } = build();

      await svc.propose(1, { conversationId: 42, question: 'Q?', answer: 'A.' }, 7);

      expect(saved[0]).toMatchObject({ status: PROPOSAL_STATUS.PENDING, proposedBy: 7 });
      // The whole point: proposing publishes nothing.
      expect(knowledge.createDocument).not.toHaveBeenCalled();
    });

    it('refuses a second pending proposal for the same question in the same thread', async () => {
      const { svc, saved } = build(pending());

      await expect(
        svc.propose(1, { conversationId: 42, question: 'Do you ship to Canada?', answer: 'A.' }, 7),
      ).rejects.toThrow();
      expect(saved).toHaveLength(0);
    });

    it('refuses an empty question or answer', async () => {
      const { svc, saved } = build();

      await expect(svc.propose(1, { conversationId: 1, question: ' ', answer: 'A.' }, 7)).rejects.toThrow();
      await expect(svc.propose(1, { conversationId: 1, question: 'Q?', answer: '  ' }, 7)).rejects.toThrow();
      expect(saved).toHaveLength(0);
    });
  });

  describe('approve', () => {
    it('creates the document, indexes it and links it back', async () => {
      const { svc, saved, knowledge } = build(null, pending());

      const result = await svc.approve(1, 11, {}, 3);

      expect(knowledge.createDocument).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          title: 'Do you ship to Canada?',
          category: 'faq',
          content: 'Not yet — US only for now.',
          // Provenance back to where the answer was written.
          source_url: '/live-chat?c=42',
        }),
        3,
      );
      expect(result).toMatchObject({
        status: PROPOSAL_STATUS.APPROVED,
        documentId: 909,
        decidedBy: 3,
      });
      expect(saved).toHaveLength(1);
    });

    it("uses the approver's edits when they tightened it", async () => {
      const { svc, knowledge } = build(null, pending());

      await svc.approve(1, 11, { title: 'Shipping destinations', category: 'policy_shipping', answer: 'US only.' }, 3);

      expect(knowledge.createDocument).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          title: 'Shipping destinations',
          category: 'policy_shipping',
          content: 'US only.',
        }),
        3,
      );
    });

    it('refuses to act twice on the same proposal', async () => {
      const { svc, knowledge } = build(null, pending({ status: PROPOSAL_STATUS.APPROVED }));

      await expect(svc.approve(1, 11, {}, 3)).rejects.toThrow();
      expect(knowledge.createDocument).not.toHaveBeenCalled();
    });

    it('refuses a proposal from another tenant', async () => {
      const { svc, knowledge } = build(null, null);

      await expect(svc.approve(1, 11, {}, 3)).rejects.toThrow();
      expect(knowledge.createDocument).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('keeps the reason — an unexplained no comes back as the same proposal', async () => {
      const { svc, saved } = build(null, pending());

      const result = await svc.reject(1, 11, '  Already covered by 2.1.4  ', 3);

      expect(result).toMatchObject({
        status: PROPOSAL_STATUS.REJECTED,
        rejectReason: 'Already covered by 2.1.4',
        decidedBy: 3,
      });
      expect(saved).toHaveLength(1);
    });

    it('requires a reason', async () => {
      const { svc, saved } = build(null, pending());

      await expect(svc.reject(1, 11, '   ', 3)).rejects.toThrow();
      expect(saved).toHaveLength(0);
    });

    it('refuses to overturn a decided proposal', async () => {
      const { svc, saved } = build(null, pending({ status: PROPOSAL_STATUS.REJECTED }));

      await expect(svc.reject(1, 11, 'again', 3)).rejects.toThrow();
      expect(saved).toHaveLength(0);
    });
  });
});
