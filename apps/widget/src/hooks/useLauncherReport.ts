import { useEffect } from 'react';
import { useWidgetStore } from '../store/widgetStore';
import { launcherFrameSize, resolveLauncher } from '../lib/launcher';

/**
 * Tell the loader how much room the launcher needs, and which side (PLN-260819 S4).
 *
 * The button is drawn in here, but the iframe that contains it is sized and
 * positioned out there. Changing only one of the two clips the launcher against
 * its own frame, so the geometry is reported rather than duplicated.
 */
export function useLauncherReport(): void {
  const theme = useWidgetStore((s) => s.widgetTheme);

  useEffect(() => {
    if (window.parent === window) return; // standalone: nothing to tell
    const launcher = resolveLauncher(theme);
    window.parent.postMessage(
      {
        type: 'ivy:launcher',
        position: launcher.position,
        size: launcherFrameSize(theme),
      },
      '*',
    );
  }, [theme]);
}
