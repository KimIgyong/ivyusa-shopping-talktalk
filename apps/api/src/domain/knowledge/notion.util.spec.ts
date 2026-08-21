import { dashedNotionId, extractNotionId, validateNotionToken } from './notion.util';

const ID = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d';

describe('extractNotionId', () => {
  it('accepts the bare and dashed forms', () => {
    expect(extractNotionId(ID)).toBe(ID);
    expect(extractNotionId(dashedNotionId(ID))).toBe(ID);
    expect(extractNotionId(`  ${ID.toUpperCase()}  `)).toBe(ID);
  });

  it('takes the id out of a share URL past the title slug', () => {
    expect(extractNotionId(`https://www.notion.so/team/Support-Manual-${ID}`)).toBe(ID);
  });

  it('ignores the ?v= view id on a database URL', () => {
    // The view is a different object; syncing it would pull the wrong thing
    // with no error to explain why.
    const view = 'ffffffffffffffffffffffffffffffff';
    expect(extractNotionId(`https://www.notion.so/team/Docs-${ID}?v=${view}`)).toBe(ID);
  });

  it('rejects what carries no id', () => {
    expect(extractNotionId('')).toBeNull();
    expect(extractNotionId('https://www.notion.so/team/Support-Manual')).toBeNull();
    expect(extractNotionId('my notion page')).toBeNull();
  });
});

describe('validateNotionToken', () => {
  it('accepts both issued prefixes', () => {
    expect(validateNotionToken(`ntn_${'a'.repeat(46)}`)).toBeNull();
    expect(validateNotionToken(`secret_${'b'.repeat(43)}`)).toBeNull();
  });

  it('names what was pasted instead', () => {
    expect(validateNotionToken('https://www.notion.so/my-integrations')).toMatch(/URL/);
    expect(validateNotionToken(`ntn_${'a'.repeat(20)} extra`)).toMatch(/no spaces/);
    expect(validateNotionToken('ntn_short')).toMatch(/does not look like/);
    expect(validateNotionToken('   ')).toMatch(/required/);
  });
});
