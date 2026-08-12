/**
 * Who answers a message: the AI, or nobody until an agent does.
 *
 * Three inputs, one order of precedence (PLN-260812):
 *   1. an agent holding the thread always wins — the AI never talks over them
 *   2. the session's own setting, when the operator made one
 *   3. the channel default from Settings
 *
 * The session keeps `inherit` until someone decides otherwise, so changing the
 * channel default still reaches every conversation that never opted out.
 */
export const AUTO_REPLY_MODE = { INHERIT: 'inherit', ON: 'on', OFF: 'off' } as const;
export type AutoReplyMode = (typeof AUTO_REPLY_MODE)[keyof typeof AUTO_REPLY_MODE];

export const AUTO_REPLY_MODES: string[] = Object.values(AUTO_REPLY_MODE);

export function isAutoReplyMode(value: unknown): value is AutoReplyMode {
  return typeof value === 'string' && AUTO_REPLY_MODES.includes(value);
}

/**
 * @param channelDefault the channel's Settings toggle; `null` for a widget
 *        conversation, which has no channel and answers by default.
 */
export function resolveAutoReply(
  channelDefault: boolean | null,
  sessionMode: string | null | undefined,
): boolean {
  if (sessionMode === AUTO_REPLY_MODE.ON) return true;
  if (sessionMode === AUTO_REPLY_MODE.OFF) return false;
  return channelDefault ?? true;
}
