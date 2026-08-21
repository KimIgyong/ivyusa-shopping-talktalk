import { blocksToText, NotionBlock, richTextToPlain } from './notion-block-text.util';

const rt = (text: string) => [{ plain_text: text }];
const block = (type: string, body: Record<string, unknown>, extra: Partial<NotionBlock> = {}) =>
  ({ id: `b-${type}`, type, ...extra, [type]: body }) as NotionBlock;

describe('richTextToPlain', () => {
  it('joins the runs a styled sentence is split into', () => {
    expect(richTextToPlain([{ plain_text: 'Refunds ' }, { plain_text: 'within 30 days' }])).toBe(
      'Refunds within 30 days',
    );
  });

  it('is empty for anything that is not a rich_text array', () => {
    expect(richTextToPlain(undefined)).toBe('');
    expect(richTextToPlain('text')).toBe('');
  });
});

describe('blocksToText', () => {
  it('renders each supported block as the markdown a reader would recognise', () => {
    const { text } = blocksToText([
      block('heading_1', { rich_text: rt('Returns') }),
      block('paragraph', { rich_text: rt('We accept returns within 30 days.') }),
      block('bulleted_list_item', { rich_text: rt('Unused items only') }),
      block('numbered_list_item', { rich_text: rt('Email support') }),
      block('to_do', { rich_text: rt('Attach the receipt'), checked: true }),
      block('quote', { rich_text: rt('Shipping is not refunded.') }),
      block('code', { rich_text: rt('curl /returns'), language: 'bash' }),
      block('divider', {}),
      block('table_row', { cells: [rt('Region'), rt('Days')] }),
    ]);
    expect(text).toBe(
      [
        '# Returns',
        'We accept returns within 30 days.',
        '- Unused items only',
        '- Email support',
        '- [x] Attach the receipt',
        '> Shipping is not refunded.',
        '```bash\ncurl /returns\n```',
        '---',
        'Region | Days',
      ].join('\n'),
    );
  });

  it('indents nested blocks so a sub-point stays a sub-point', () => {
    const { text } = blocksToText([
      block('toggle', { rich_text: rt('Warranty') }, {
        has_children: true,
        children: [block('bulleted_list_item', { rich_text: rt('Two years') })],
      }),
    ]);
    expect(text).toBe('Warranty\n  - Two years');
  });

  it('stops following children past the depth cap', () => {
    const deepest = block('paragraph', { rich_text: rt('level four') });
    const three = block('paragraph', { rich_text: rt('level three') }, {
      has_children: true,
      children: [deepest],
    });
    const two = block('paragraph', { rich_text: rt('level two') }, {
      has_children: true,
      children: [three],
    });
    const one = block('paragraph', { rich_text: rt('level one') }, {
      has_children: true,
      children: [two],
    });
    const { text } = blocksToText([one]);
    expect(text).toContain('level three');
    expect(text).not.toContain('level four');
  });

  it('counts block types it cannot convert instead of dropping them silently', () => {
    const { text, skipped } = blocksToText([
      block('paragraph', { rich_text: rt('See the demo:') }),
      block('video', { external: { url: 'https://example.test/v' } }),
      block('image', { file: { url: 'https://example.test/i.png' } }),
      block('image', { file: { url: 'https://example.test/j.png' } }),
    ]);
    expect(text).toBe('See the demo:');
    // An operator whose page is mostly embeds can find that out from the log
    // rather than concluding the connector is broken.
    expect(skipped).toEqual({ video: 1, image: 2 });
  });

  it('does not count layout containers as skipped content', () => {
    const { text, skipped } = blocksToText([
      block('column_list', {}, {
        has_children: true,
        children: [
          block('column', {}, {
            has_children: true,
            children: [block('paragraph', { rich_text: rt('inside a column') })],
          }),
        ],
      }),
    ]);
    expect(skipped).toEqual({});
    expect(text.trim()).toBe('inside a column');
  });

  it('reports truncation rather than returning a quietly shortened page', () => {
    const long = block('paragraph', { rich_text: rt('x'.repeat(60)) });
    const { text, truncated } = blocksToText([long, long, long], { maxChars: 100 });
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(100);
  });

  it('keeps a child page title, since the parent page reads that way', () => {
    const { text } = blocksToText([block('child_page', { title: 'Shipping' })]);
    expect(text).toBe('## Shipping');
  });
});
