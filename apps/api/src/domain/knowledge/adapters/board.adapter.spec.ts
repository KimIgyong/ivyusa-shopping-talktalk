import { Repository } from 'typeorm';
import { BoardAdapter } from './board.adapter';
import { KbBoardPost } from '../entity/kb-board-post.entity';
import { KnowledgeSource } from '../entity/knowledge-source.entity';

const source = { id: 5, tenantId: 1, type: 'board', name: 'IVY Help Center' } as KnowledgeSource;

const build = (posts: Partial<KbBoardPost>[]) => {
  const find = jest.fn(async () => posts as KbBoardPost[]);
  const repo = { find } as unknown as Repository<KbBoardPost>;
  return { adapter: new BoardAdapter(repo), find };
};

describe('BoardAdapter.fetchAll', () => {
  it('converts a post into a source item keyed by id, not title', async () => {
    // Keying by title would orphan the document on every rename and create a
    // second one alongside it.
    const { adapter } = build([{ id: 3, title: 'Return policy', body: 'Within 30 days.' }]);
    const [firstItem] = await adapter.fetchAll(1, source);
    expect(firstItem).toEqual({
      externalKey: 'post:3',
      title: 'Return policy',
      content: 'Within 30 days.',
      sourceUrl: null,
      category: 'IVY Help Center',
    });
  });

  it('keeps the key stable when the post is renamed', async () => {
    const before = (await build([{ id: 3, title: 'Old', body: 'x' }]).adapter.fetchAll(1, source))[0];
    const after = (await build([{ id: 3, title: 'New', body: 'x' }]).adapter.fetchAll(1, source))[0];
    expect(after.externalKey).toBe(before.externalKey);
  });

  it('drops posts with no body instead of embedding an empty draft', async () => {
    const { adapter } = build([
      { id: 1, title: 'Draft', body: '' },
      { id: 2, title: 'Whitespace', body: '   \n  ' },
      { id: 3, title: 'Null body', body: null },
      { id: 4, title: 'Real', body: 'content' },
    ]);
    const items = await adapter.fetchAll(1, source);
    expect(items.map((i) => i.externalKey)).toEqual(['post:4']);
  });

  it('scopes the query to the tenant and the source', async () => {
    const { adapter, find } = build([]);
    await adapter.fetchAll(1, source);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 1, sourceId: 5 } }),
    );
  });

  it('needs no configuration', () => {
    expect(build([]).adapter.validateConfig()).toBeNull();
  });
});
