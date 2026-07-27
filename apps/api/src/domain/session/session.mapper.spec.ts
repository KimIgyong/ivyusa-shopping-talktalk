import { SessionMapper } from './session.mapper';
import { Session } from './entity/session.entity';

/** SessionMapper.toResponse — widget session shape incl. the greeting name (#4). */
describe('SessionMapper.toResponse', () => {
  function session(over: Partial<Session> = {}): Session {
    return {
      sessionToken: 'tok',
      language: 'EN',
      consentState: 'pending',
      customerId: null,
      ...over,
    } as Session;
  }

  it('marks a session with a bound customer as authenticated', () => {
    expect(SessionMapper.toResponse(session({ customerId: 4 })).authenticated).toBe(true);
    expect(SessionMapper.toResponse(session()).authenticated).toBe(false);
  });

  it('carries the customer name through when one is resolved', () => {
    const res = SessionMapper.toResponse(session({ customerId: 4 }), 'Huy Tester');
    expect(res).toEqual({
      sessionToken: 'tok',
      language: 'EN',
      consentState: 'pending',
      authenticated: true,
      customerName: 'Huy Tester',
    });
  });

  it('defaults customerName to null (guest, or profile not resolved yet)', () => {
    expect(SessionMapper.toResponse(session()).customerName).toBeNull();
    // Authenticated but the Shopify name backfill has not landed yet.
    expect(SessionMapper.toResponse(session({ customerId: 4 })).customerName).toBeNull();
  });
});
