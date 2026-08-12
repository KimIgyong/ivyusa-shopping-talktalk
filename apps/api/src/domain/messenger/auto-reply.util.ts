/**
 * Who answers a message, and whether the answer goes out on its own.
 *
 * One axis with three values, not a boolean plus a flag: "off / needs approval
 * / sends itself" are mutually exclusive, and splitting them would leave two of
 * four combinations meaningless.
 *
 * Precedence (PLN-260812):
 *   1. an agent holding the thread always wins — the AI never talks over them
 *   2. the session's own choice, when the operator made one
 *   3. the channel default from Settings
 *
 * A session stays `inherit` until someone decides otherwise, so changing the
 * channel default still reaches every conversation nobody opted out of.
 */
export const REPLY_MODE = { OFF: 'off', APPROVE: 'approve', AUTO: 'auto' } as const;
export type ReplyMode = (typeof REPLY_MODE)[keyof typeof REPLY_MODE];

/** Session values: the three modes plus "follow the channel". */
export const SESSION_REPLY_MODE = { INHERIT: 'inherit', ...REPLY_MODE } as const;
export type SessionReplyMode = (typeof SESSION_REPLY_MODE)[keyof typeof SESSION_REPLY_MODE];

export const REPLY_MODES: string[] = Object.values(REPLY_MODE);
export const SESSION_REPLY_MODES: string[] = Object.values(SESSION_REPLY_MODE);

/** Kept for the older name used by the channel toggle before PLN-260812. */
export const AUTO_REPLY_MODE = SESSION_REPLY_MODE;

export function isReplyMode(value: unknown): value is ReplyMode {
  return typeof value === 'string' && REPLY_MODES.includes(value);
}

export function isSessionReplyMode(value: unknown): value is SessionReplyMode {
  return typeof value === 'string' && SESSION_REPLY_MODES.includes(value);
}

/** Older name; the session accepts the same set. */
export const isAutoReplyMode = isSessionReplyMode;

/**
 * @param channelMode the channel's Settings value; `null` for a widget
 *        conversation, which has no channel and answers by itself.
 */
export function resolveReplyMode(
  channelMode: string | null | undefined,
  sessionMode: string | null | undefined,
): ReplyMode {
  if (isReplyMode(sessionMode)) return sessionMode;
  if (isReplyMode(channelMode)) return channelMode;
  // Unknown or 'inherit' on both sides: the widget's long-standing behaviour.
  return REPLY_MODE.AUTO;
}

/** Is the AI involved at all? Drives the console's "AI answering" badge. */
export function resolveAutoReply(
  channelMode: string | boolean | null | undefined,
  sessionMode: string | null | undefined,
): boolean {
  const channel =
    typeof channelMode === 'boolean'
      ? channelMode
        ? REPLY_MODE.AUTO
        : REPLY_MODE.OFF
      : channelMode;
  return resolveReplyMode(channel, sessionMode) !== REPLY_MODE.OFF;
}

/** The channel column that predates the three-mode axis, kept in sync. */
export function autoReplyFlagFor(mode: string): number {
  return mode === REPLY_MODE.OFF ? 0 : 1;
}
