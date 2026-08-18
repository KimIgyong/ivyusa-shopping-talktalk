import { buildThemeVariables } from '../../../../packages/types/src/common/widget-theme';
import type { WidgetTheme } from './types';

/**
 * Applying the tenant's brand theme (PLN-260818 S4).
 *
 * Imported from source rather than '@ivy/types' for the same reason as the
 * language registry and the tab constants: the package publishes CJS and a value
 * import of its entry point fails the widget build.
 */

/** Cache key — per shop, because one browser can visit several storefronts. */
function cacheKey(shop: string | undefined): string {
  return `ivy_theme:${shop ?? 'default'}`;
}

/** Write (or clear) the theme variables on :root. */
export function applyTheme(theme: WidgetTheme | null): void {
  const vars = buildThemeVariables(theme);
  const root = document.documentElement;
  // An unthemed tenant REMOVES the properties rather than writing defaults, so
  // the stylesheet's own values take over. Writing them back would fork the
  // built-in palette into a second place to keep in sync.
  for (const name of THEMED_PROPERTIES) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
}

/** Every property applyTheme may set — listed so clearing is exhaustive. */
const THEMED_PROPERTIES = [
  ...[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((s) => `--ivy-primary-${s}`),
  '--ivy-on-primary',
  '--ivy-header-bg',
  '--ivy-header-fg',
  '--ivy-header-dim',
];

/**
 * Paint the last theme this shop served, before the session round-trip.
 *
 * `session/ensure` is async, so a themed widget would otherwise render in the
 * default blue and visibly repaint a moment later. Only the first-ever visit
 * sees that now.
 */
export function applyCachedTheme(shop: string | undefined): void {
  try {
    const raw = localStorage.getItem(cacheKey(shop));
    if (raw) applyTheme(JSON.parse(raw) as WidgetTheme);
  } catch {
    // Private mode, blocked storage, or a corrupt entry: the built-in palette is
    // a perfectly good fallback, so never let this break boot.
  }
}

/** Remember the served theme so the next visit paints it immediately. */
export function cacheTheme(shop: string | undefined, theme: WidgetTheme | null): void {
  try {
    if (theme) localStorage.setItem(cacheKey(shop), JSON.stringify(theme));
    else localStorage.removeItem(cacheKey(shop));
  } catch {
    /* not remembering is only a cosmetic loss on the next visit */
  }
}
