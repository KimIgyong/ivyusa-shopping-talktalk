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

/**
 * Citations (product links included) only rode on the send response, so the
 * next poll replaced the bubble with the stored row and the 🛍 link vanished
 * after ~5s — and never came back on reload (FIX-260806).
 */
describe('ChatMapper.toMessageResponse — citations', () => {
  function msg(trace: unknown): Message {
    return {
      id: 9,
      senderType: 'ai',
      body: 'Here are two options.',
      createdAt: new Date('2026-08-06T00:00:00Z'),
      retrievalTrace: trace,
    } as Message;
  }

  it('serves the citations persisted on the AI turn', () => {
    const res = ChatMapper.toMessageResponse(
      msg({
        citations: [
          { id: 250, title: 'Moisturizing Cream', group: 'product', url: 'https://ivyusa.com/products/x' },
        ],
      }),
    );
    expect(res.citations).toEqual([
      { id: 250, title: 'Moisturizing Cream', group: 'product', url: 'https://ivyusa.com/products/x' },
    ]);
  });

  it('omits citations when the turn has none', () => {
    expect(ChatMapper.toMessageResponse(msg({ kind: 'rag' })).citations).toBeUndefined();
    expect(ChatMapper.toMessageResponse(msg(null)).citations).toBeUndefined();
  });

  it('tolerates a malformed citations value', () => {
    expect(ChatMapper.toMessageResponse(msg({ citations: 'bogus' })).citations).toBeUndefined();
    expect(ChatMapper.toMessageResponse(msg({ citations: [null, 'x'] })).citations).toBeUndefined();
  });
});
