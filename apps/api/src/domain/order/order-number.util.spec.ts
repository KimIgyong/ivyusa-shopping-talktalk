import { normalizeOrderNumber } from './order-number.util';

/**
 * The guest-lookup bug in one line: ingest stored `1002`, lookup compared the raw
 * input, and every surface a shopper reads the number from prints it as `#1002`.
 */
describe('normalizeOrderNumber', () => {
  it('strips the leading # the UI and Shopify emails both render', () => {
    expect(normalizeOrderNumber('#1002')).toBe('1002');
  });

  it('trims whitespace from a copy/paste', () => {
    expect(normalizeOrderNumber('  1002 ')).toBe('1002');
    expect(normalizeOrderNumber(' #1002 ')).toBe('1002');
  });

  it('leaves an already-canonical number untouched', () => {
    expect(normalizeOrderNumber('1002')).toBe('1002');
  });

  it('accepts the number webhooks send (a number, not a string)', () => {
    expect(normalizeOrderNumber(1002)).toBe('1002');
  });

  it('keeps a store prefix — it is part of the number, not decoration', () => {
    // This database really holds IVY-1001; stripping more than '#' would look up a
    // different order instead of failing honestly.
    expect(normalizeOrderNumber('IVY-1001')).toBe('IVY-1001');
    expect(normalizeOrderNumber('#IVY-1001')).toBe('IVY-1001');
  });

  it('collapses repeated hashes rather than leaving one behind', () => {
    expect(normalizeOrderNumber('##1002')).toBe('1002');
  });

  it('maps empty-ish input to an empty string, never "null"/"undefined"', () => {
    // A stringified null would silently become a searchable order number.
    expect(normalizeOrderNumber(null)).toBe('');
    expect(normalizeOrderNumber(undefined)).toBe('');
    expect(normalizeOrderNumber('   ')).toBe('');
    expect(normalizeOrderNumber('#')).toBe('');
  });

  it('is idempotent — safe to apply on both ingest and lookup', () => {
    const once = normalizeOrderNumber(' #1002 ');
    expect(normalizeOrderNumber(once)).toBe(once);
  });
});
