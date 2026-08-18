/**
 * Per-tenant widget theming (PLN-260818-Widget-Theme-And-Tab-Guide).
 *
 * A tenant supplies ONE brand colour. Everything else — the nine-stop ramp and
 * every foreground colour — is computed here, deliberately:
 *
 *  - Asking for nine stops asks a shop owner to be a designer, and the answer
 *    would rarely preserve the contrast relationships the design depends on.
 *  - Letting anyone pick the text colour on a filled button eventually ships a
 *    widget nobody can read. Foreground is derived from luminance instead.
 *
 * Pure and dependency-free so the API, the console preview and the widget all
 * compute identical values from the same input.
 */

/** Stored shape. `null`/absent = never configured = the built-in palette. */
export interface WidgetTheme {
  /** Brand colour as `#RRGGBB`; occupies the 500 slot of the generated ramp. */
  brand: string;
  /** 'white' keeps the design's header; 'brand' fills it with the brand colour. */
  headerStyle: 'white' | 'brand';
}

export const WIDGET_HEADER_STYLE = { WHITE: 'white', BRAND: 'brand' } as const;

/** Ramp stop → the palette's own lightness, in HSL percent. */
const RAMP_LIGHTNESS: Record<number, number> = {
  50: 96.9,
  100: 92.7,
  200: 87.3,
  300: 77.8,
  400: 65.9,
  500: 58.4,
  600: 53.5,
  700: 49.0,
  800: 41.0,
  900: 33.3,
};

export const RAMP_STOPS = Object.keys(RAMP_LIGHTNESS).map(Number);

/** `#RGB`/`#RRGGBB` → [r,g,b], or null when it is not a colour we can use. */
export function parseHex(hex: string | null | undefined): [number, number, number] | null {
  if (typeof hex !== 'string') return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** WCAG contrast ratio between two colours. */
export function contrastRatio(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE: [number, number, number] = [255, 255, 255];
/** Not pure black: the design's darkest text is gray-900, and it reads softer. */
const INK: [number, number, number] = [17, 24, 39];

/**
 * Minimum contrast white must reach before we keep it on a filled control.
 *
 * 3:1 is WCAG AA for user-interface components, not the 4.5:1 for body text —
 * and that is a deliberate, documented compromise. The shipped design puts white
 * on #2B7FFF, which is 3.8:1; a 4.5:1 rule would flip the default widget's
 * button text to dark and change a design that was signed off. So the rule is
 * "keep white unless it becomes genuinely illegible", which is what stops a
 * yellow brand from shipping invisible labels.
 *
 * Consequence worth naming: a mid-tone brand can land between 3 and 4.5, same
 * family as the badge-contrast item already open as PLN-260817 D-10.
 */
const MIN_ON_PRIMARY_CONTRAST = 3;

/**
 * Text colour for a filled background.
 *
 * White by default — that is what the design uses — falling back to ink only
 * when white drops under the threshold. Not "whichever contrasts more": ink
 * actually beats white on the design's own blue, so that rule would quietly
 * redesign every unthemed widget.
 *
 * This is why a tenant cannot choose it: on `#FFD400` the answer is ink, and any
 * UI that let someone keep white there would ship an unreadable button.
 */
export function readableForeground(bg: [number, number, number]): [number, number, number] {
  if (contrastRatio(bg, WHITE) >= MIN_ON_PRIMARY_CONTRAST) return WHITE;
  return contrastRatio(bg, INK) >= contrastRatio(bg, WHITE) ? INK : WHITE;
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
  else if (max === gg) h = ((bb - rr) / d + 2) / 6;
  else h = ((rr - gg) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = L - c / 2;
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

/** `[r,g,b]` → the `"R G B"` triplet a CSS custom property holds. */
export function toChannels([r, g, b]: [number, number, number]): string {
  return `${r} ${g} ${b}`;
}

/**
 * Brand colour → the full ramp, as CSS-variable channel strings.
 *
 * The reference palette supplies the LIGHTNESS curve; the tenant supplies hue
 * and saturation. That is what keeps a themed widget looking like the design:
 * the relationships between stops — which one is a wash, which carries white
 * text — are the design's, whatever colour is poured into them.
 */
export function buildThemeRamp(brandHex: string): Record<number, string> | null {
  const rgb = parseHex(brandHex);
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(rgb);
  // Slide the whole curve so the 500 slot lands on the brand's own lightness.
  // Without this a dark brand would sit at 500 with a LIGHTER 600 above it, and
  // every hover state in the widget would brighten instead of deepen.
  const shift = l - RAMP_LIGHTNESS[500];
  const ramp: Record<number, string> = {};
  for (const stop of RAMP_STOPS) {
    // The 500 slot is the tenant's colour verbatim — rounding it through HSL
    // would hand back something almost-but-not-quite what they typed.
    if (stop === 500) {
      ramp[stop] = toChannels(rgb);
      continue;
    }
    const target = Math.min(98, Math.max(2, RAMP_LIGHTNESS[stop] + shift));
    ramp[stop] = toChannels(hslToRgb(h, s, target));
  }
  return ramp;
}

/** Every CSS custom property a themed widget sets, ready to write to :root. */
export function buildThemeVariables(theme: WidgetTheme | null | undefined): Record<string, string> {
  const rgb = theme ? parseHex(theme.brand) : null;
  const ramp = rgb && theme ? buildThemeRamp(theme.brand) : null;
  if (!rgb || !ramp) return {};
  const vars: Record<string, string> = {};
  for (const stop of RAMP_STOPS) vars[`--ivy-primary-${stop}`] = ramp[stop];
  vars['--ivy-on-primary'] = toChannels(readableForeground(rgb));
  if (theme?.headerStyle === WIDGET_HEADER_STYLE.BRAND) {
    vars['--ivy-header-bg'] = toChannels(rgb);
    vars['--ivy-header-fg'] = toChannels(readableForeground(rgb));
  }
  return vars;
}

/**
 * Clean a stored/submitted theme. Returns null for "not configured", which the
 * readers treat as the built-in palette — an unusable colour must never become
 * a widget nobody can read, so it degrades to the default rather than throwing.
 */
export function normalizeWidgetTheme(input: unknown): WidgetTheme | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<WidgetTheme>;
  const rgb = parseHex(raw.brand);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  return {
    brand: hex,
    headerStyle:
      raw.headerStyle === WIDGET_HEADER_STYLE.BRAND
        ? WIDGET_HEADER_STYLE.BRAND
        : WIDGET_HEADER_STYLE.WHITE,
  };
}
