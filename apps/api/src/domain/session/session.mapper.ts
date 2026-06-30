import { Session } from './entity/session.entity';

/** Entity → camelCase response mapping (static methods, per convention). */
export interface SessionResponse {
  sessionToken: string;
  language: string;
  consentState: string;
  authenticated: boolean;
}

export class SessionMapper {
  static toResponse(s: Session): SessionResponse {
    return {
      sessionToken: s.sessionToken,
      language: s.language,
      consentState: s.consentState,
      authenticated: s.customerId != null,
    };
  }
}
