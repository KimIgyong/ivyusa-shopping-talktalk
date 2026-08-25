import { AgentKnowledgeController } from './agent-knowledge.controller';

/**
 * The point of this surface is what it does NOT expose: chat handlers get the
 * lookup with the capability they already hold, and nothing that writes.
 */
describe('AgentKnowledgeController', () => {
  const answer = {
    answer: 'Free shipping starts at $29.99.',
    confidence: 0.6,
    blocked: false,
    sources: [{ id: 1, title: '2.1.3 Shipping Rates' }],
  };
  const build = () => {
    const knowledgeService = { ask: jest.fn(async () => answer) };
    const proposals = { propose: jest.fn(async () => ({ id: 11 })) };
    return {
      ctrl: new AgentKnowledgeController(knowledgeService as never, proposals as never),
      knowledgeService,
    };
  };
  const agent = { actorType: 'user', userId: 7, tenantId: 1 } as never;

  it('answers from the tenant knowledge base', async () => {
    const { ctrl, knowledgeService } = build();

    await expect(
      ctrl.ask(agent, { question: 'free shipping?', language: 'KO' } as never),
    ).resolves.toEqual(answer);

    expect(knowledgeService.ask).toHaveBeenCalledWith(1, 'free shipping?', 'KO', undefined, null);
  });

  it('defaults the language rather than guessing', async () => {
    const { ctrl, knowledgeService } = build();

    await ctrl.ask(agent, { question: 'free shipping?' } as never);

    expect(knowledgeService.ask).toHaveBeenCalledWith(1, 'free shipping?', 'EN', undefined, null);
  });

  it('trims the question and refuses an empty one', async () => {
    const { ctrl, knowledgeService } = build();

    await ctrl.ask(agent, { question: '  free shipping?  ' } as never);
    expect(knowledgeService.ask).toHaveBeenCalledWith(1, 'free shipping?', 'EN', undefined, null);

    await expect(ctrl.ask(agent, { question: '   ' } as never)).rejects.toThrow();
    expect(knowledgeService.ask).toHaveBeenCalledTimes(1);
  });

  it('refuses a non-tenant principal — there is no tenant to search', async () => {
    const { ctrl, knowledgeService } = build();

    await expect(
      ctrl.ask({ actorType: 'admin', adminId: 1 } as never, { question: 'x' } as never),
    ).rejects.toThrow();
    expect(knowledgeService.ask).not.toHaveBeenCalled();
  });

  it('exposes only lookup and proposal — nothing that publishes knowledge', async () => {
    // The justification for this surface is what it lacks. `propose` is on it
    // because a proposal is inert until an owner approves it (D3); a method
    // that wrote a document would defeat the whole arrangement.
    const methods = Object.getOwnPropertyNames(AgentKnowledgeController.prototype).filter(
      (m) => m !== 'constructor',
    );
    expect(methods.sort()).toEqual(['ask', 'propose']);
  });

  it('queues a proposal instead of writing knowledge', async () => {
    const proposals = { propose: jest.fn(async () => ({ id: 11 })) };
    const knowledgeService = { ask: jest.fn(), createDocument: jest.fn() };
    const ctrl = new AgentKnowledgeController(knowledgeService as never, proposals as never);

    await ctrl.propose(agent, {
      conversation_id: 42,
      question: 'Do you ship to Canada?',
      answer: 'US only for now.',
    } as never);

    expect(proposals.propose).toHaveBeenCalledWith(
      1,
      { conversationId: 42, question: 'Do you ship to Canada?', answer: 'US only for now.' },
      7,
    );
    expect(knowledgeService.createDocument).not.toHaveBeenCalled();
  });

});
