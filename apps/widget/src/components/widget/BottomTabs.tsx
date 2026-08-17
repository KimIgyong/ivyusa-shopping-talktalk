import { useTranslation } from 'react-i18next';
import { useTabBar } from './useTabBar';

/**
 * Icon-and-label tab bar pinned to the bottom of the panel, for tenants who set
 * `widget_tab_position = 'bottom'` (PLN-260817-Widget-Tab-Config W-3).
 *
 * Deliberately NOT the same markup as the top bar: at the bottom of a phone
 * screen a tab is a thumb target in a column of its own, which is what the icon
 * is for. The accessibility wiring is identical, so a screen reader sees the
 * same tablist either way.
 */
export function BottomTabs() {
  const { t } = useTranslation();
  const { defs, activeTab, select, countFor, label, onKeyDown } = useTabBar();

  if (defs.length < 2) return null;

  return (
    <nav
      role="tablist"
      // The home indicator on a full-screen mobile sheet sits under this bar,
      // so the safe-area inset is padding, not margin — the bar's own
      // background must extend beneath it.
      className="flex border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)]"
    >
      {defs.map((def, i) => {
        const active = activeTab === def.key;
        const count = countFor(def.key);
        const Icon = def.icon;
        return (
          <button
            key={def.key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`ivy-tabpanel-${def.key}`}
            id={`ivy-tab-${def.key}`}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => select(def.key)}
            className={`flex flex-1 flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[11px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 ${
              active ? 'font-bold text-primary-600' : 'font-medium text-gray-400 hover:text-gray-600'
            }`}
          >
            <span className="relative">
              <Icon className="h-5 w-5" />
              {count > 0 && (
                <span
                  className="absolute -right-2.5 -top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-error px-1 text-[9px] font-bold text-white"
                  aria-label={t('notifications.unreadCount', { count })}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </span>
            <span className="w-full truncate text-center">{label(def)}</span>
          </button>
        );
      })}
    </nav>
  );
}
