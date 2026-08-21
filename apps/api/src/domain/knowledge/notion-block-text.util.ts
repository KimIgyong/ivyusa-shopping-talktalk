/**
 * Notion block tree → plain text (PLN-260821 W1, REQ G2).
 *
 * This is the one piece with no counterpart in the Drive adapter: Google
 * exports a document as text server-side, while Notion only ever hands back
 * blocks. Everything retrieval sees from a Notion page is produced here, so the
 * bias is towards keeping structure that a reader would have used to find the
 * answer (headings, list markers, table cells) and dropping decoration.
 */

export interface NotionBlock {
  id?: string;
  type?: string;
  has_children?: boolean;
  /** Filled in by the client for nested blocks; the API never returns it. */
  children?: NotionBlock[];
  [key: string]: unknown;
}

export interface FlattenedBlocks {
  text: string;
  /**
   * Block types that carried no text we could use, counted by type.
   *
   * Returned rather than swallowed: an operator whose page is mostly embeds
   * should be able to learn that from the log instead of concluding the
   * connector is broken.
   */
  skipped: Record<string, number>;
  /** True when the character cap cut the page short. */
  truncated: boolean;
}

/**
 * How deep to follow `has_children`.
 *
 * Toggles inside toggles inside toggles are rare, and each level costs one API
 * request per block against a ~3 req/s budget. Three levels covers ordinary
 * documents; beyond that the cost is real and the returns are not.
 */
export const MAX_BLOCK_DEPTH = 3;

/** Matches the embedding input slice — more would be stored and never read. */
export const MAX_CONTENT_CHARS = 30_000;

/** Concatenate a rich_text array into its plain text. */
export function richTextToPlain(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((run) => {
      const plain = (run as { plain_text?: unknown })?.plain_text;
      return typeof plain === 'string' ? plain : '';
    })
    .join('');
}

const payload = (block: NotionBlock): Record<string, unknown> => {
  const type = typeof block.type === 'string' ? block.type : '';
  const value = block[type];
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
};

const text = (block: NotionBlock): string => richTextToPlain(payload(block).rich_text);

/**
 * One block as the line(s) it should contribute, or null when it contributes
 * nothing. Prefixes are Markdown because that is what the rest of the KB holds
 * and what the models read best.
 */
function lineFor(block: NotionBlock): string | null {
  const type = typeof block.type === 'string' ? block.type : '';
  const body = payload(block);
  /**
   * A prefix with nothing after it is noise, not content: an empty heading
   * would reach the index as a bare "#", and a spacer bullet as "- ". Every
   * prefixed type goes through here so none of them can forget.
   */
  const prefixed = (prefix: string): string | null => {
    const content = text(block);
    return content.trim() ? `${prefix}${content}` : null;
  };

  switch (type) {
    case 'paragraph':
    case 'toggle':
      return prefixed('');
    case 'heading_1':
      return prefixed('# ');
    case 'heading_2':
      return prefixed('## ');
    case 'heading_3':
      return prefixed('### ');
    case 'bulleted_list_item':
    // Numbering is not tracked: the API gives no index, and inventing one that
    // disagrees with what the page shows is worse than a plain bullet.
    case 'numbered_list_item':
      return prefixed('- ');
    case 'to_do':
      return prefixed(`- [${body.checked === true ? 'x' : ' '}] `);
    // A callout is a quote with an icon; the icon is not text.
    case 'quote':
    case 'callout':
      return prefixed('> ');
    case 'code': {
      const language = typeof body.language === 'string' ? body.language : '';
      const content = text(block);
      return content.trim() ? `\`\`\`${language}\n${content}\n\`\`\`` : null;
    }
    case 'divider':
      return '---';
    case 'table_row': {
      const cells = Array.isArray(body.cells) ? body.cells : [];
      const row = cells.map((cell) => richTextToPlain(cell)).join(' | ');
      return row.trim() ? row : null;
    }
    case 'child_page': {
      // A child page becomes its own document as well; keeping its title here
      // preserves what the parent page actually reads like.
      const title = typeof body.title === 'string' ? body.title : '';
      return title ? `## ${title}` : null;
    }
    case 'table':
    case 'column_list':
    case 'column':
      // Containers with no text of their own — their children carry it, so they
      // are neither rendered nor counted as skipped.
      return '';
    default:
      return null;
  }
}

/**
 * Flatten a block tree.
 *
 * Nested blocks are indented rather than flattened flat: a bullet under a
 * toggle reads as a sub-point, and losing that turns a structured answer into
 * an undifferentiated wall.
 */
export function blocksToText(
  blocks: NotionBlock[],
  options: { maxDepth?: number; maxChars?: number } = {},
): FlattenedBlocks {
  const maxDepth = options.maxDepth ?? MAX_BLOCK_DEPTH;
  const maxChars = options.maxChars ?? MAX_CONTENT_CHARS;
  const lines: string[] = [];
  const skipped: Record<string, number> = {};
  let length = 0;
  let truncated = false;

  const walk = (list: NotionBlock[], depth: number): void => {
    if (truncated || depth > maxDepth) return;
    const indent = '  '.repeat(Math.max(0, depth - 1));
    for (const block of list) {
      if (truncated) return;
      const line = lineFor(block);
      if (line === null) {
        const type = typeof block.type === 'string' ? block.type : 'unknown';
        skipped[type] = (skipped[type] ?? 0) + 1;
      } else if (line !== '') {
        const rendered = indent ? line.split('\n').map((l) => `${indent}${l}`).join('\n') : line;
        // +1 for the newline that joins it, so the cap matches the output.
        if (length + rendered.length + 1 > maxChars) {
          truncated = true;
          return;
        }
        lines.push(rendered);
        length += rendered.length + 1;
      }
      if (block.children?.length) walk(block.children, depth + 1);
    }
  };

  walk(blocks, 1);
  return { text: lines.join('\n').trim(), skipped, truncated };
}
