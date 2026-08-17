import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScenarioButton } from '../../lib/types';

/** Product Help submenu actions (client-only, not server-driven). */
export type SubAction = 'usage' | 'ingredients' | 'exchange' | 'restock';

/**
 * The opening menu and the Product Help submenu (PLN-260817 W-5, frames 54/60).
 *
 * These were bordered cards with a lucide icon each. The Master Shots use plain
 * chips — no icons — and split them by role: the opening menu is filled blue
 * (it is the primary thing to do on an empty thread), while submenu options are
 * quiet white pills that wrap.
 */
function MenuChip({
  label,
  onClick,
  variant,
}: {
  label: string;
  onClick: () => void;
  variant: 'primary' | 'quiet';
}) {
  return (
    <button
      onClick={onClick}
      className={
        variant === 'primary'
          ? 'rounded-full bg-primary-100 px-4 py-2.5 text-center text-sm font-medium text-primary-700 transition-colors hover:bg-primary-200'
          : 'rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50'
      }
    >
      {label}
    </button>
  );
}

export function ScenarioMenu({
  buttons,
  onScenario,
  onSubAction,
}: {
  buttons: ScenarioButton[];
  /** Fired for a top-level config button (Product Help is handled internally). */
  onScenario: (button: ScenarioButton) => void;
  /** Fired for a Product Help submenu button. */
  onSubAction: (a: SubAction) => void;
}) {
  const { t } = useTranslation();
  const [sub, setSub] = useState(false);

  if (sub) {
    return (
      // Wraps rather than a fixed 2-column grid: these labels are translated into
      // six languages and "Exchange / Return" is far wider in some of them.
      <div className="flex flex-wrap gap-2">
        <MenuChip variant="quiet" label={t('chat.productHelp.usage')} onClick={() => onSubAction('usage')} />
        <MenuChip variant="quiet" label={t('chat.productHelp.ingredients')} onClick={() => onSubAction('ingredients')} />
        <MenuChip variant="quiet" label={t('chat.productHelp.exchange')} onClick={() => onSubAction('exchange')} />
        <MenuChip variant="quiet" label={t('chat.productHelp.restock')} onClick={() => onSubAction('restock')} />
        <MenuChip variant="quiet" label={t('chat.productHelp.back')} onClick={() => setSub(false)} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {buttons.map((b) => (
        <MenuChip
          key={b.id}
          variant="primary"
          label={b.label}
          onClick={() => (b.action === 'product_help' ? setSub(true) : onScenario(b))}
        />
      ))}
    </div>
  );
}
