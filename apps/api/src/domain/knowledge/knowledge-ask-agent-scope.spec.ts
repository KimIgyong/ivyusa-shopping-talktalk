import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';

/**
 * The console's own /knowledge/ask carries the chosen agent.
 *
 * It did not, and nothing looked wrong: the picker rendered, the request left
 * with `ai_agent_id`, and the controller dropped it — so "answer as this agent"
 * quietly answered as everyone. A control that appears to work is worse than no
 * control, and only a test at this seam catches it.
 */
describe('KnowledgeController.ask — agent scope', () => {
  const build = () => {
    const knowledgeService = { ask: jest.fn(async () => ({ answer: '', sources: [] })) };
    const ctrl = new KnowledgeController(
      knowledgeService as unknown as KnowledgeService,
      ...(Array(12).fill({}) as never[]),
    );
    return { ctrl, knowledgeService };
  };
  const user = { actorType: 'user', userId: 7, tenantId: 1 } as never;

  it('passes the chosen agent through to the service', async () => {
    const { ctrl, knowledgeService } = build();

    await ctrl.ask(user, { question: 'refunds?', ai_agent_id: 5 } as never);

    expect(knowledgeService.ask).toHaveBeenCalledWith(1, 'refunds?', 'EN', undefined, 5);
  });

  it('sends null when no agent is chosen, which is the operator view', async () => {
    const { ctrl, knowledgeService } = build();

    await ctrl.ask(user, { question: 'refunds?' } as never);

    expect(knowledgeService.ask).toHaveBeenCalledWith(1, 'refunds?', 'EN', undefined, null);
  });
});
