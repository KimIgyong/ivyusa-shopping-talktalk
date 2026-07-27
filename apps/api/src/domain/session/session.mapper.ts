import { Session } from './entity/session.entity';

/** Entity → camelCase response mapping (static methods, per convention). */
export interface SessionResponse {
  sessionToken: string;
  language: string;
  consentState: string;
  authenticated: boolean;
  /**
   * Display name of the bound customer, when known — lets the widget greet a
   * signed-in shopper by name. Null for guests, and for a customer whose profile
   * has not been resolved yet (the Shopify name/email backfill is asynchronous).
   */
  customerName: string | null;
}

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
