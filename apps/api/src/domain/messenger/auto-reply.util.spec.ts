import {
  autoReplyFlagFor,
  isReplyMode,
  isSessionReplyMode,
  resolveAutoReply,
  resolveReplyMode,
} from './auto-reply.util';

/**
 * Precedence (PLN-260812): the session's choice beats the channel default, and
 * `inherit` keeps following it. Agent ownership is enforced by the caller.
 */
describe('resolveReplyMode', () => {
  it.each([
    // channel, session, expected
    ['auto', 'inherit', 'auto'],
    ['approve', 'inherit', 'approve'],
    ['off', 'inherit', 'off'],
    ['off', 'auto', 'auto'],
    ['off', 'approve', 'approve'],
    ['auto', 'off', 'off'],
    ['auto', 'approve', 'approve'],
    ['approve', 'auto', 'auto'],
    ['approve', 'off', 'off'],
  ])('channel=%s session=%s → %s', (channel, session, expected) => {
    expect(resolveReplyMode(channel, session)).toBe(expected);
  });

  it('answers by itself where there is no channel (widget)', () => {
    expect(resolveReplyMode(null, 'inherit')).toBe('auto');
    expect(resolveReplyMode(null, undefined)).toBe('auto');
    // …but an explicit session choice still wins on the widget.
    expect(resolveReplyMode(null, 'approve')).toBe('approve');
    expect(resolveReplyMode(null, 'off')).toBe('off');
  });

  it('falls back to auto on an unrecognised stored value rather than guessing', () => {
    expect(resolveReplyMode('garbage', 'nonsense')).toBe('auto');
  });
});

describe('resolveAutoReply — is the AI involved at all', () => {
  it('reads the three modes', () => {
    expect(resolveAutoReply('auto', 'inherit')).toBe(true);
    expect(resolveAutoReply('approve', 'inherit')).toBe(true);
    expect(resolveAutoReply('off', 'inherit')).toBe(false);
  });

  it('still accepts the boolean the channel column used to hold', () => {
    expect(resolveAutoReply(true, 'inherit')).toBe(true);
    expect(resolveAutoReply(false, 'inherit')).toBe(false);
    expect(resolveAutoReply(false, 'approve')).toBe(true);
  });
});

describe('mode guards', () => {
  it('separates channel modes from session modes', () => {
    expect(isReplyMode('inherit')).toBe(false);
    expect(isSessionReplyMode('inherit')).toBe(true);
    for (const mode of ['off', 'approve', 'auto']) {
      expect(isReplyMode(mode)).toBe(true);
      expect(isSessionReplyMode(mode)).toBe(true);
    }
    expect(isSessionReplyMode('AUTO')).toBe(false);
  });
});

describe('autoReplyFlagFor', () => {
  it('mirrors the legacy boolean so a code rollback still behaves', () => {
    expect(autoReplyFlagFor('auto')).toBe(1);
    expect(autoReplyFlagFor('approve')).toBe(1);
    expect(autoReplyFlagFor('off')).toBe(0);
  });
});
