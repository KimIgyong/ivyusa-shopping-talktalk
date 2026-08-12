import { IssueMapper } from './issue.mapper';
import { Issue } from './entity/issue.entity';

/** Board card carries the session identity the operator recognises (PLN-260812). */
describe('IssueMapper.toCard — session context', () => {
  const issue = {
    id: 3,
    issueNo: 12,
    conversationId: 5,
    sessionId: 90,
    type: 'delivery',
    status: 'received',
    priority: 'normal',
    assigneeUserId: null,
    assigneeLabel: null,
    reopenCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Issue;

  it('uses the batched context when the board provides it', () => {
    const card = IssueMapper.toCard(issue, null, undefined, {
      sessionId: '90',
      sessionAlias: '강남점 사장님',
      preview: '재고 있나요?',
    });

    expect(card).toMatchObject({
      sessionId: '90',
      sessionAlias: '강남점 사장님',
      preview: '재고 있나요?',
    });
  });

  it('still identifies the session when no context was resolved', () => {
    const card = IssueMapper.toCard(issue, null);

    // The id comes off the issue itself — a card must never be unidentifiable.
    expect(card.sessionId).toBe('90');
    expect(card.sessionAlias).toBeNull();
    expect(card.preview).toBeNull();
  });
});
