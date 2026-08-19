import {
  LAUNCHER_DEFAULTS,
  LAUNCHER_METRICS,
  normalizeLauncher,
  normalizeLogo,
  normalizeWidgetTheme,
  resolveLauncher,
} from './widget-theme';

/**
 * Logo + launcher (PLN-260819 S4). The rule these all serve: a bad value in one
 * of the new fields must never cost the tenant their colour, because the colour
 * is the only part that can render an unreadable widget.
 */
const LOGO = { id: 'b3f1c2d4-aaaa-4bbb-8ccc-ddddeeeeffff', ext: 'png', mime: 'image/png', width: 240, height: 64 };

describe('normalizeLogo', () => {
  it('accepts a stored logo', () => {
    expect(normalizeLogo(LOGO)).toEqual(LOGO);
  });

  it('rounds dimensions and lowercases the extension', () => {
    expect(normalizeLogo({ ...LOGO, ext: 'PNG', width: 240.6, height: 64.2 })).toMatchObject({
      ext: 'png',
      width: 241,
      height: 64,
    });
  });

  it('refuses anything that could not build a URL or a layout', () => {
    expect(normalizeLogo(null)).toBeNull();
    expect(normalizeLogo({ ...LOGO, id: '../../etc/passwd' })).toBeNull();
    expect(normalizeLogo({ ...LOGO, ext: 'svg;<script>' })).toBeNull();
    expect(normalizeLogo({ ...LOGO, width: 0 })).toBeNull();
    expect(normalizeLogo({ ...LOGO, height: undefined })).toBeNull();
  });
});

describe('normalizeLauncher', () => {
  it('accepts a full setting', () => {
    expect(normalizeLauncher({ position: 'left', size: 'lg', icon: 'headset' })).toEqual({
      position: 'left',
      size: 'lg',
      icon: 'headset',
    });
  });

  it('replaces an unknown value with the default rather than rejecting', () => {
    expect(normalizeLauncher({ position: 'top', size: 'xl', icon: 'sparkles' })).toEqual({
      ...LAUNCHER_DEFAULTS,
    });
  });

  it('is null only when nothing was configured', () => {
    expect(normalizeLauncher(null)).toBeNull();
    expect(normalizeLauncher(undefined)).toBeNull();
  });
});

describe('resolveLauncher', () => {
  it('falls back to the built-in geometry', () => {
    expect(resolveLauncher(null)).toEqual({ ...LAUNCHER_DEFAULTS });
    expect(resolveLauncher({ brand: '#2B7FFF', headerStyle: 'white' })).toEqual({
      ...LAUNCHER_DEFAULTS,
    });
  });
});

describe('LAUNCHER_METRICS', () => {
  it('always reserves a frame bigger than the button', () => {
    // The launcher sits inset from the edge, so a frame merely as big as the
    // button clips it — the failure that made this a shared constant.
    for (const size of ['sm', 'md', 'lg'] as const) {
      expect(LAUNCHER_METRICS[size].frame).toBeGreaterThan(LAUNCHER_METRICS[size].button);
    }
  });
});

describe('normalizeWidgetTheme with branding', () => {
  it('carries logo and launcher through', () => {
    const theme = normalizeWidgetTheme({
      brand: '#123456',
      headerStyle: 'brand',
      logo: LOGO,
      launcher: { position: 'left', size: 'sm', icon: 'chat' },
    });
    expect(theme).toMatchObject({ brand: '#123456', logo: LOGO });
    expect(theme?.launcher).toEqual({ position: 'left', size: 'sm', icon: 'chat' });
  });

  it('keeps the theme when the logo is unusable', () => {
    const theme = normalizeWidgetTheme({ brand: '#123456', headerStyle: 'white', logo: { id: '!' } });
    expect(theme?.brand).toBe('#123456');
    expect(theme?.logo).toBeUndefined();
  });

  it('still rejects the whole theme for an unusable brand colour', () => {
    // The colour is different in kind: there is no safe default that preserves
    // the tenant's intent, and a wrong one ships an unreadable widget.
    expect(normalizeWidgetTheme({ brand: 'not-a-colour', logo: LOGO })).toBeNull();
  });

  it('omits both fields for a theme that never set them (no output change)', () => {
    const theme = normalizeWidgetTheme({ brand: '#2B7FFF', headerStyle: 'white' });
    expect(theme).toEqual({ brand: '#2B7FFF', headerStyle: 'white' });
  });
});
