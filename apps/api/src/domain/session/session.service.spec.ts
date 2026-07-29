import { SessionService } from './session.service';
import { Session } from './entity/session.entity';

/**
 * SessionService.findOrCreateForCustomer — the app proxy re-resolves identity on
 * every storefront page load, so minting a session each time gave a signed-in
 * shopper a brand-new (empty) conversation whenever they followed a link.
 */
describe('SessionService.findOrCreateForCustomer', () => {
  function build(found: Session | null) {
    const sessionRepo = {
      findOne: jest.fn().mockResolvedValue(found),
      create: jest.fn((x: Partial<Session>) => ({ ...x }) as Session),
      save: jest.fn((x: Session) => Promise.resolve({ id: x.id ?? 99, ...x })),
    };
    const svc = new SessionService(
      sessionRepo as never,
      {} as never, // tenantRepo — unused on this path
      {} as never, // customerRepo
      { publish: jest.fn().mockResolvedValue(undefined) } as never,
      { available: () => false, del: jest.fn() } as never,
    );
    return { svc, sessionRepo };
  }

  const recent = { id: 7, sessionToken: 'existing-tok', customerId: 4 } as Session;

  it('resumes the recent verified session instead of creating one', async () => {
    const { svc, sessionRepo } = build(recent);
    const s = await svc.findOrCreateForCustomer(2, 4, 'en');

    expect(s.sessionToken).toBe('existing-tok');
    expect(sessionRepo.create).not.toHaveBeenCalled();
  });

  it('scopes the lookup to tenant + customer + verified', async () => {
    const { svc, sessionRepo } = build(recent);
    await svc.findOrCreateForCustomer(2, 4, 'en');

    const where = sessionRepo.findOne.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: 2, customerId: 4, identityLevel: 'verified' });
    // Bounded by an activity window, newest first.
    expect(where.updatedAt).toBeDefined();
    expect(sessionRepo.findOne.mock.calls[0][0].order).toEqual({ updatedAt: 'DESC' });
  });

  it('touches the resumed session so the window rolls forward', async () => {
    const { svc, sessionRepo } = build(recent);
    await svc.findOrCreateForCustomer(2, 4, 'en');
    expect(sessionRepo.save).toHaveBeenCalledWith(recent);
  });

  it('creates a verified session when none is resumable', async () => {
    const { svc, sessionRepo } = build(null);
    const s = await svc.findOrCreateForCustomer(2, 4, 'ko');

    expect(sessionRepo.create).toHaveBeenCalled();
    expect(s).toMatchObject({
      tenantId: 2,
      customerId: 4,
      identityLevel: 'verified',
      language: 'KO',
    });
    expect(s.sessionToken).toBeTruthy();
  });
});

/**
 * SessionService.requireCustomer — the single widget-session authorization gate.
 * Every storefront endpoint that touches personal data routes through it, so the
 * two tiers (bound vs Shopify-verified) are pinned here rather than in ten copies.
 */
describe('SessionService.requireCustomer', () => {
  function build(session: unknown) {
    const sessionRepo = { findOne: jest.fn().mockResolvedValue(session) };
    const svc = new SessionService(
      sessionRepo as never,
      {} as never,
      {} as never,
      { publish: jest.fn() } as never,
      { available: () => false, get: jest.fn(), set: jest.fn(), del: jest.fn() } as never,
    );
    return { svc };
  }

  const guest = { sessionToken: 't', customerId: 4, identityLevel: 'guest' };
  const verified = { sessionToken: 't', customerId: 4, identityLevel: 'verified' };
  const anon = { sessionToken: 't', customerId: null, identityLevel: 'guest' };

  it('returns the session for a bound customer', async () => {
    const { svc } = build(guest);
    await expect(svc.requireCustomerId('t')).resolves.toBe(4);
  });

  it('rejects an unbound session with 401', async () => {
    const { svc } = build(anon);
    await expect(svc.requireCustomerId('t')).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a missing session with 404', async () => {
    const { svc } = build(null);
    await expect(svc.requireCustomerId('t')).rejects.toMatchObject({ status: 404 });
  });

  it('accepts a Shopify-verified session when verified identity is demanded', async () => {
    const { svc } = build(verified);
    await expect(svc.requireCustomerId('t', { verified: true })).resolves.toBe(4);
  });

  it('rejects a guest-bound session with 403 when verified identity is demanded', async () => {
    // SEC-C3: order number + email are printed on packing slips — strong enough to
    // read your own orders, never enough to export or erase an account.
    const { svc } = build(guest);
    await expect(svc.requireCustomerId('t', { verified: true })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('rejects an unbound session with 401 even when verified is demanded', async () => {
    const { svc } = build(anon);
    await expect(svc.requireCustomerId('t', { verified: true })).rejects.toMatchObject({
      status: 401,
    });
  });
});
