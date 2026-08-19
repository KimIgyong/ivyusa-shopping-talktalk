import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The loader is plain ES5 served straight to storefronts — no build step, no
 * type checker, no bundler to catch a typo. It also carries the ONE contract
 * that live customer pages depend on: an install that only sets
 * IVY_WIDGET_CONFIG must keep working (ivyusa and amoebaorder both run it).
 *
 * So it gets checked here rather than nowhere. This lives in the API package
 * because that is where jest already runs; it reads the file from the widget.
 */
const LOADER = readFileSync(
  join(__dirname, '../../../../widget/public/embed.js'),
  'utf8',
);

describe('embed.js — SDK contract (PLN-260819 S3)', () => {
  it('parses as a script (no build step will catch this for us)', () => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    expect(() => new Function(LOADER)).not.toThrow();
  });

  it('still boots a legacy config-only install', () => {
    // The regression that would silently take two live storefronts offline.
    expect(LOADER).toContain('if (window.IVY_WIDGET_CONFIG) boot();');
  });

  it('exposes the documented public methods', () => {
    for (const method of [
      'init',
      'open',
      'close',
      'toggle',
      'identify',
      'logout',
      'setLocale',
      'on',
      'off',
    ]) {
      expect(LOADER).toContain(`api.${method} =`);
    }
    expect(LOADER).toContain("api.version = '1'");
  });

  it('drains calls queued before the script loaded', () => {
    expect(LOADER).toContain('api.q');
    expect(LOADER).toContain('queued.length');
  });

  it('reports the parent origin to the widget', () => {
    // Firefox has no ancestorOrigins, so the widget needs this fallback to have
    // anything to send to the allowlist at all.
    expect(LOADER).toContain("'&parent=' + encodeURIComponent(window.location.origin)");
  });

  it('never signs anything in the browser', () => {
    // A hash computed here would mean the secret is in the page — the whole
    // point of the handshake is that it is not.
    expect(LOADER).not.toMatch(/createHmac|CryptoJS|subtle\.sign/);
  });

  it('keeps the widget iframe sandboxed', () => {
    expect(LOADER).toContain("frame.setAttribute(\n    'sandbox',");
  });
});
