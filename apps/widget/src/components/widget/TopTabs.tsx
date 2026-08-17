import { useTranslation } from 'react-i18next';
import { useTabBar } from './useTabBar';

/**
 * Segmented tab bar under the panel title (PLN-260817 W-1, frames 34/57), now
 * sized to however many tabs the tenant shows (PLN-260817-Widget-Tab-Config).
 *
 * Labels only — the icon treatment belongs to the bottom bar, where a tab has a
 * column of its own to put one in.
 */
export function TopTabs() {
  const { t } = useTranslation();
  const { defs, activeTab, select, countFor, label, onKeyDown } = useTabBar();

  // One tab is not a choice. Rendering a full-width "tab" the shopper can only
  // ever be on adds a row of chrome that says nothing; the panel title already
  // names where they are.
  if (defs.length < 2) return null;

  return (
    <nav role="tablist" className="flex border-b border-gray-100 bg-white">
      {defs.map((def, i) => {
        const active = activeTab === def.key;
        const count = countFor(def.key);
        return (
          <button
            key={def.key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`ivy-tabpanel-${def.key}`}
            id={`ivy-tab-${def.key}`}
            // Roving tabindex: Tab reaches the strip once, arrows move inside it.
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => select(def.key)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 px-1 py-3.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 ${
              active ? 'font-bold text-gray-900' : 'font-medium text-gray-500 hover:text-gray-700'
            }`}
          >
            {/* Three translated labels share the panel width, so a long one
                truncates rather than wrapping the bar to two rows. */}
            <span className="truncate">{label(def)}</span>
            {count > 0 && (
              <span
                className="flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white"
                aria-label={t('notifications.unreadCount', { count })}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
            {/* The indicator is the active affordance; it sits on the tab rather
                than the nav so it tracks the tab's width, not a fixed fraction. */}
            {active && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-gray-900" />}
          </button>
        );
      })}
    </nav>
  );
}
