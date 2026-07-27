import { ChatMapper } from './chat.mapper';
import { Message } from './entity/message.entity';

/**
 * Follow-up chips used to live only in the POST /chat/scenario response, so
 * re-reading the conversation (widget tab switch, page reload) dropped them and
 * left the shopper with no next action. ScenarioService now persists them on the
 * message trace and the conversation read hands them back.
 */
describe('ChatMapper.toMessageResponse — follow-up chips', () => {
  function msg(trace: unknown): Message {
    return {
      id: 5,
      senderType: 'ai',
      body: 'Orders ship in 1–2 business days.',
      createdAt: new Date('2026-07-27T00:00:00Z'),
      retrievalTrace: trace,
    } as Message;
  }

  it('returns chips persisted on a scripted turn', () => {
    const res = ChatMapper.toMessageResponse(
      msg({
        scenario: 'shipping_policy',
        kind: 'script',
        followUps: [
          { id: 'my_orders', label: 'My orders' },
          { id: 'agent_connect', label: 'Talk to an agent' },
        ],
      }),
    );
    expect(res.quickReplies).toEqual([
      { id: 'my_orders', label: 'My orders' },
      { id: 'agent_connect', label: 'Talk to an agent' },
    ]);
  });

  it('omits chips for a plain RAG turn', () => {
    expect(ChatMapper.toMessageResponse(msg({ kind: 'rag' })).quickReplies).toBeUndefined();
    expect(ChatMapper.toMessageResponse(msg(null)).quickReplies).toBeUndefined();
  });

  it('omits an empty chip list rather than rendering an empty row', () => {
    expect(ChatMapper.toMessageResponse(msg({ followUps: [] })).quickReplies).toBeUndefined();
  });

  it('ignores malformed chips instead of trusting the stored shape', () => {
    const res = ChatMapper.toMessageResponse(
      msg({ followUps: [{ id: 'ok', label: 'Fine' }, { id: 7 }, null, 'nope', { label: 'no id' }] }),
    );
    expect(res.quickReplies).toEqual([{ id: 'ok', label: 'Fine' }]);
  });

  it('tolerates a non-array trace', () => {
    expect(ChatMapper.toMessageResponse(msg({ followUps: 'bogus' })).quickReplies).toBeUndefined();
  });
});
