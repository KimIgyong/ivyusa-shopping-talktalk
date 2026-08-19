import { LAUNCHER_METRICS, resolveLauncher } from '../../../../packages/types/src/common/widget-theme';
import type { WidgetTheme } from './types';

/**
 * Launcher geometry (PLN-260819 S4 FR-T2).
 *
 * Imported from source rather than '@ivy/types' for the same reason as the
 * theme and language registries: the package publishes CJS and a value import
 * of its entry point fails the widget build.
 */
export { LAUNCHER_METRICS, resolveLauncher };

/** Tailwind sizes per launcher size — the button, and the icon inside it. */
export const LAUNCHER_CLASSES: Record<
  keyof typeof LAUNCHER_METRICS,
  { button: string; icon: string }
> = {
  sm: { button: 'h-12 w-12', icon: 'h-5 w-5' },
  md: { button: 'h-14 w-14', icon: 'h-6 w-6' },
  lg: { button: 'h-16 w-16', icon: 'h-7 w-7' },
};

/**
 * The frame the loader must reserve. Kept as one exported helper so the widget
 * and the loader cannot disagree about how much room the button needs — they
 * disagreeing is exactly how a launcher gets clipped by its own iframe.
 */
export function launcherFrameSize(theme: WidgetTheme | null | undefined): number {
  return LAUNCHER_METRICS[resolveLauncher(theme).size].frame;
}
