import type { SessionResponse } from '@ivy/types';
import { Session } from './entity/session.entity';

/**
 * Response shape lives in `@ivy/types` — the widget imports the same contract.
 */
export type { SessionResponse };

export class SessionMapper {
  static toResponse(s: Session, customerName: string | null = null): SessionResponse {
    return {
      sessionToken: s.sessionToken,
      language: s.language,
      consentState: s.consentState,
      authenticated: s.customerId != null,
      customerName,
    };
  }
}
