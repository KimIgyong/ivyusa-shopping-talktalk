import { descriptionSnippet, toAdminProductResponse } from './product.mapper';
import { ProductCache } from './entity/product-cache.entity';

/** List rows carry ~100 characters; the full body belongs to the detail view. */
describe('descriptionSnippet', () => {
  it('leaves a short description exactly as it is', () => {
    expect(descriptionSnippet('짧은 설명')).toBe('짧은 설명');
  });

  it('cuts a long English description on a word boundary and ellipsises it', () => {
    const text = `${'word '.repeat(60)}`.trim();
    const out = descriptionSnippet(text)!;
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(101);
    // Never mid-word: everything before the ellipsis is whole words.
    expect(out.slice(0, -1).endsWith('word')).toBe(true);
  });

  it('still cuts at the limit when the text has no usable space (Korean)', () => {
    // Korean product copy routinely runs past 100 characters without a space
    // anywhere near the cut; honouring an early space would throw most of the
    // snippet away.
    const text = '가'.repeat(300);
    const out = descriptionSnippet(text)!;
    expect(out).toHaveLength(101); // 100 + ellipsis
  });

  it('is null for nothing worth showing', () => {
    expect(descriptionSnippet(null)).toBeNull();
    expect(descriptionSnippet('   ')).toBeNull();
  });
});

describe('toAdminProductResponse', () => {
  it('ships the snippet, not the whole description', () => {
    const row = {
      handle: 'cafe24-27',
      title: '플로리아 메이크업 리무버',
      description: '설명'.repeat(200),
      tags: '클렌징',
      price: 18000,
      currency: 'KRW',
      status: 'active',
      syncedAt: new Date('2026-08-08T06:32:57.000Z'),
      publishedAt: null,
    } as ProductCache;

    const out = toAdminProductResponse(row, true);

    expect(out).toMatchObject({ handle: 'cafe24-27', inKnowledge: true, currency: 'KRW' });
    expect(out.syncedAt).toBe('2026-08-08T06:32:57.000Z');
    expect(out.descriptionSnippet).toHaveLength(101);
    expect(out).not.toHaveProperty('description');
  });
});
