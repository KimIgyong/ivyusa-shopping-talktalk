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
    return {
      ctrl: new AgentKnowledgeController(knowledgeService as never),
      knowledgeService,
    };
  };
  const agent = { actorType: 'user', userId: 7, tenantId: 1 } as never;

  it('answers from the tenant knowledge base', async () => {
    const { ctrl, knowledgeService } = build();

    await expect(
      ctrl.ask(agent, { question: 'free shipping?', language: 'KO' } as never),
    ).resolves.toEqual(answer);

    expect(knowledgeService.ask).toHaveBeenCalledWith(1, 'free shipping?', 'KO', undefined);
  });

  it('defaults the language rather than guessing', async () => {
    const { ctrl, knowledgeService } = build();

    await ctrl.ask(agent, { question: 'free shipping?' } as never);

    expect(knowledgeService.ask).toHaveBeenCalledWith(1, 'free shipping?', 'EN', undefined);
  });

  it('trims the question and refuses an empty one', async () => {
    const { ctrl, knowledgeService } = build();

    await ctrl.ask(agent, { question: '  free shipping?  ' } as never);
    expect(knowledgeService.ask).toHaveBeenCalledWith(1, 'free shipping?', 'EN', undefined);

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

  it('exposes exactly one route, and it is a read', () => {
    // A regression here would be somebody adding a write path to the surface
    // whose whole justification is that it has none.
    const methods = Object.getOwnPropertyNames(AgentKnowledgeController.prototype).filter(
      (m) => m !== 'constructor',
    );
    expect(methods).toEqual(['ask']);
  });
});
