import { useEffect } from 'react';
import { useWidgetStore } from '../store/widgetStore';
import { launcherFrameSize, resolveLauncher } from '../lib/launcher';
import { hostKind, isAppMode, postToHost } from '../lib/host-bridge';

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
    // Only a parent frame owns an iframe box to resize. A native host presents
    // the widget its own way, and standalone has nobody to tell. App mode has no
    // launcher at all, so reporting its geometry is noise even inside a frame
    // (the simulator shows it arriving, which is how this was spotted).
    if (hostKind() !== 'frame' || isAppMode()) return;
    const launcher = resolveLauncher(theme);
    postToHost({
      type: 'ivy:launcher',
      position: launcher.position,
      size: launcherFrameSize(theme),
    });
  }, [theme]);
}
