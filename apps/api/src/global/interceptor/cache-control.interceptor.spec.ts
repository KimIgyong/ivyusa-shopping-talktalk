import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { CacheControlInterceptor } from './cache-control.interceptor';

/**
 * CacheControlInterceptor — `no-store` on every API response.
 *
 * The ordering claim is the part worth pinning: the header must land BEFORE the
 * handler runs, or `@Res()` routes (the Shopify proxy identity response, which
 * carries a session token) would write their body with no directive at all.
 */
describe('CacheControlInterceptor', () => {
  function ctxFor(
    type: 'http' | 'rpc',
    res: { setHeader?: unknown; headersSent?: boolean } = {},
    req?: { method?: string; path?: string; query?: Record<string, unknown> },
  ): ExecutionContext {
    return {
      getType: () => type,
      switchToHttp: () => ({
        getResponse: () => res,
        ...(req ? { getRequest: () => req } : {}),
      }),
    } as unknown as ExecutionContext;
  }

  function httpRes() {
    return { setHeader: jest.fn(), headersSent: false };
  }

  const handler = (onCall?: () => void): CallHandler => ({
    handle: jest.fn(() => {
      onCall?.();
      return of({ ok: true });
    }),
  });

  it('stamps no-store on an HTTP response', () => {
    const res = httpRes();
    new CacheControlInterceptor().intercept(ctxFor('http', res), handler());
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('sets the header before the handler runs, so @Res() routes keep it', () => {
    const res = httpRes();
    let headerAtHandlerTime: unknown;
    const next = handler(() => {
      headerAtHandlerTime = res.setHeader.mock.calls[0];
    });
    new CacheControlInterceptor().intercept(ctxFor('http', res), next);
    expect(headerAtHandlerTime).toEqual(['Cache-Control', 'no-store']);
  });

  it('passes the handler result through untouched', (done) => {
    new CacheControlInterceptor()
      .intercept(ctxFor('http', httpRes()), handler())
      .subscribe((v) => {
        expect(v).toEqual({ ok: true });
        done();
      });
  });

  it('leaves non-HTTP contexts alone', () => {
    const res = httpRes();
    new CacheControlInterceptor().intercept(ctxFor('rpc', res), handler());
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('does not throw when the response is already committed', () => {
    const res = { setHeader: jest.fn(), headersSent: true };
    const next = handler();
    expect(() =>
      new CacheControlInterceptor().intercept(ctxFor('http', res), next),
    ).not.toThrow();
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(next.handle).toHaveBeenCalled();
  });

  // The one opted-out route (PLN-260814): a signed attachment read. `no-store`
  // there re-downloads every thumbnail on every poll-driven re-render.
  describe('signed attachment reads', () => {
    const signed = {
      method: 'GET',
      path: '/api/v1/files/abc-123',
      query: { sig: 'deadbeef', exp: '1760000000' },
    };

    it('allows a private cache, shorter than the signature lifetime', () => {
      const res = httpRes();
      new CacheControlInterceptor().intercept(ctxFor('http', res, signed), handler());
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=600');
    });

    it('still stamps no-store on the same path without a signature', () => {
      const res = httpRes();
      new CacheControlInterceptor().intercept(
        ctxFor('http', res, { ...signed, query: {} }),
        handler(),
      );
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    });

    it('does not extend the exemption to writes', () => {
      const res = httpRes();
      new CacheControlInterceptor().intercept(
        ctxFor('http', res, { ...signed, method: 'POST' }),
        handler(),
      );
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    });

    it('does not exempt a nested path that merely contains /files/', () => {
      const res = httpRes();
      new CacheControlInterceptor().intercept(
        ctxFor('http', res, { ...signed, path: '/api/v1/files/abc/secrets' }),
        handler(),
      );
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    });
  });

  it('does not throw when there is no usable response object', () => {
    const next = handler();
    expect(() =>
      new CacheControlInterceptor().intercept(ctxFor('http', {}), next),
    ).not.toThrow();
    expect(next.handle).toHaveBeenCalled();
  });
});
