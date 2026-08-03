import { CONSENT_STATE, ConsentState } from '@ivy/types';

/**
 * Consent-gated processing purposes (PLN-Privacy-Control-Gap Stage 1, decision
 * D-1: fail-closed / GRANTED-only). Every purpose that persists a visitor's
 * message, sends it to an AI engine, or relays it to a human agent requires the
 * session's *effective* consent to be GRANTED — PENDING and DECLINED both block,
 * and a GRANTED consent recorded against an outdated notice version degrades to
 * PENDING (re-consent required).
 */
export const CONSENT_PURPOSE = {
  /** Persisting chat turns (user/AI/system messages) for a session. */
  CHAT_PERSIST: 'chat_persist',
  /** Sending session content to an AI engine (RAG, scenario scripts, briefing). */
  AI_SEND: 'ai_send',
  /** Relaying the conversation to / from a human agent. */
  AGENT_HANDOFF: 'agent_handoff',
} as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSE)[keyof typeof CONSENT_PURPOSE];

/** Required effective consent state per purpose — all GRANTED-only (D-1). */
export const CONSENT_POLICY: Record<ConsentPurpose, ConsentState> = {
  [CONSENT_PURPOSE.CHAT_PERSIST]: CONSENT_STATE.GRANTED,
  [CONSENT_PURPOSE.AI_SEND]: CONSENT_STATE.GRANTED,
  [CONSENT_PURPOSE.AGENT_HANDOFF]: CONSENT_STATE.GRANTED,
};

/** The consent state a purpose requires (currently GRANTED for every purpose). */
export function requiredConsent(purpose: ConsentPurpose): ConsentState {
  return CONSENT_POLICY[purpose];
}
