import { isAutoReplyMode, resolveAutoReply } from './auto-reply.util';

/**
 * Precedence (PLN-260812): session choice beats the channel default, and
 * `inherit` keeps following it. Agent ownership is enforced by the caller.
 */
describe('resolveAutoReply', () => {
  it.each([
    // channel default, session mode, expected
    [true, 'inherit', true],
    [false, 'inherit', false],
    [false, 'on', true],
    [true, 'off', false],
    [true, 'on', true],
    [false, 'off', false],
  ])('channel=%s session=%s → %s', (channelDefault, mode, expected) => {
    expect(resolveAutoReply(channelDefault as boolean, mode as string)).toBe(expected);
  });

  it('answers by default where there is no channel (widget)', () => {
    expect(resolveAutoReply(null, 'inherit')).toBe(true);
    expect(resolveAutoReply(null, undefined)).toBe(true);
    // …but an explicit off still wins, even on the widget.
    expect(resolveAutoReply(null, 'off')).toBe(false);
  });

  it('treats an unknown stored mode as inherit rather than guessing', () => {
    expect(resolveAutoReply(false, 'garbage')).toBe(false);
    expect(resolveAutoReply(true, '')).toBe(true);
  });
});

describe('isAutoReplyMode', () => {
  it('accepts only the three modes', () => {
    expect(isAutoReplyMode('inherit')).toBe(true);
    expect(isAutoReplyMode('on')).toBe(true);
    expect(isAutoReplyMode('off')).toBe(true);
    expect(isAutoReplyMode('ON')).toBe(false);
    expect(isAutoReplyMode('')).toBe(false);
    expect(isAutoReplyMode(undefined)).toBe(false);
  });
});
