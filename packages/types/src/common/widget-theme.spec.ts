import {
  buildThemeRamp,
  buildThemeVariables,
  contrastRatio,
  normalizeWidgetTheme,
  parseHex,
  readableForeground,
  RAMP_STOPS,
} from './widget-theme';

/**
 * A tenant picks one colour; everything a shopper actually reads is computed
 * from it. These pin the two properties that make that safe: the ramp keeps the
 * design's lightness relationships, and no brand colour can produce unreadable
 * text on a filled control.
 */
describe('parseHex', () => {
  it('accepts 3- and 6-digit hex, with or without the hash', () => {
    expect(parseHex('#2B7FFF')).toEqual([43, 127, 255]);
    expect(parseHex('2b7fff')).toEqual([43, 127, 255]);
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('  #000  ')).toEqual([0, 0, 0]);
  });

  it('rejects anything that is not a usable colour', () => {
    for (const bad of ['', 'blue', '#12', '#12345', 'rgb(1,2,3)', null, undefined, 42, {}]) {
      expect(parseHex(bad as never)).toBeNull();
    }
  });
});

describe('readableForeground', () => {
  it('puts white on dark brands and ink on light ones', () => {
    expect(readableForeground([43, 127, 255])).toEqual([255, 255, 255]); // design blue
    expect(readableForeground([255, 212, 0])).toEqual([17, 24, 39]); // bright yellow
    expect(readableForeground([0, 0, 0])).toEqual([255, 255, 255]);
    expect(readableForeground([255, 255, 255])).toEqual([17, 24, 39]);
  });

  it('never lets a brand colour produce an illegible label', () => {
    // Swept across the hue circle at several lightnesses. The bar is 3:1 (WCAG
    // AA for UI components), not 4.5:1 — see MIN_ON_PRIMARY_CONTRAST: the
    // shipped design puts white on a 3.8:1 blue, and holding this test to 4.5
    // would mean flipping that design rather than protecting shoppers from
    // unreadable ones.
    for (let h = 0; h < 360; h += 15) {
      for (const l of [20, 40, 60, 80, 95]) {
        const ramp = buildThemeRamp(hslHex(h, 70, l))!;
        const brand = ramp[500].split(' ').map(Number) as [number, number, number];
        expect(contrastRatio(brand, readableForeground(brand))).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keeps white on the design blue rather than flipping to the higher contrast', () => {
    // Ink beats white here (4.7 vs 3.8). Picking the winner would silently
    // redesign every unthemed widget, so white wins while it clears the bar.
    const blue: [number, number, number] = [43, 127, 255];
    expect(contrastRatio(blue, [17, 24, 39])).toBeGreaterThan(contrastRatio(blue, [255, 255, 255]));
    expect(readableForeground(blue)).toEqual([255, 255, 255]);
  });
});

/** Small helper so the sweep above can express colours in HSL. */
function hslHex(h: number, s: number, l: number): string {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = L - c / 2;
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}

describe('buildThemeRamp', () => {
  it('returns every stop the widget uses', () => {
    const ramp = buildThemeRamp('#E11D6B')!;
    expect(Object.keys(ramp).map(Number).sort((a, b) => a - b)).toEqual([...RAMP_STOPS].sort((a, b) => a - b));
  });

  it('hands back the tenant colour verbatim at 500', () => {
    // Round-tripping it through HSL would return something almost-but-not-quite
    // what they typed, and brand colours are the kind of thing people check.
    expect(buildThemeRamp('#E11D6B')![500]).toBe('225 29 107');
  });

  it('keeps the design lightness curve: 50 is lightest, 900 darkest', () => {
    const ramp = buildThemeRamp('#E11D6B')!;
    const sum = (s: number) => ramp[s].split(' ').reduce((a, c) => a + Number(c), 0);
    const ordered = [...RAMP_STOPS].sort((a, b) => a - b);
    for (let i = 1; i < ordered.length; i++) {
      expect(sum(ordered[i])).toBeLessThan(sum(ordered[i - 1]));
    }
  });

  it('reproduces the built-in palette when given its own brand colour', () => {
    // The safety net for "unconfigured must look identical": feeding the design
    // blue back in must land on the design blue.
    expect(buildThemeRamp('#2B7FFF')![500]).toBe('43 127 255');
  });

  it('returns null for an unusable colour rather than a broken ramp', () => {
    expect(buildThemeRamp('nope')).toBeNull();
  });
});

describe('buildThemeVariables', () => {
  it('is empty for an unconfigured tenant, leaving the CSS defaults in place', () => {
    expect(buildThemeVariables(null)).toEqual({});
    expect(buildThemeVariables(undefined)).toEqual({});
  });

  it('sets the ramp and the computed foreground', () => {
    const vars = buildThemeVariables({ brand: '#2B7FFF', headerStyle: 'white' });
    expect(vars['--ivy-primary-500']).toBe('43 127 255');
    expect(vars['--ivy-on-primary']).toBe('255 255 255');
  });

  it('leaves the header alone unless the tenant asked for a brand header', () => {
    const white = buildThemeVariables({ brand: '#E11D6B', headerStyle: 'white' });
    expect(white['--ivy-header-bg']).toBeUndefined();
    const brand = buildThemeVariables({ brand: '#E11D6B', headerStyle: 'brand' });
    expect(brand['--ivy-header-bg']).toBe('225 29 107');
    expect(brand['--ivy-header-fg']).toBe('255 255 255');
  });

  it('picks ink for a brand header that is too light for white', () => {
    const vars = buildThemeVariables({ brand: '#FFD400', headerStyle: 'brand' });
    expect(vars['--ivy-header-fg']).toBe('17 24 39');
  });
});

describe('normalizeWidgetTheme', () => {
  it('uppercases and expands the hex, defaulting the header style', () => {
    expect(normalizeWidgetTheme({ brand: '#e11d6b' })).toEqual({
      brand: '#E11D6B',
      headerStyle: 'white',
    });
    expect(normalizeWidgetTheme({ brand: '#fff' })!.brand).toBe('#FFFFFF');
  });

  it('keeps a brand header when asked', () => {
    expect(normalizeWidgetTheme({ brand: '#000', headerStyle: 'brand' })!.headerStyle).toBe('brand');
  });

  it('degrades to null instead of storing something unrenderable', () => {
    for (const bad of [null, undefined, 'blue', {}, { brand: 'nope' }, { headerStyle: 'brand' }]) {
      expect(normalizeWidgetTheme(bad as never)).toBeNull();
    }
  });

  it('ignores an unknown header style rather than trusting it', () => {
    expect(normalizeWidgetTheme({ brand: '#000', headerStyle: 'rainbow' as never })!.headerStyle).toBe(
      'white',
    );
  });
});
