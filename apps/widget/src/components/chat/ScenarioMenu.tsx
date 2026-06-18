import { useState } from 'react';
import {
  Truck,
  RotateCcw,
  HelpCircle,
  Phone,
  Users,
  Package,
  ArrowLeft,
  Sparkles,
  Leaf,
  Bell,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type ScenarioAction =
  | 'delivery'
  | 'cancelRefund'
  | 'productHelp'
  | 'contact'
  | 'affiliate'
  | 'myOrders'
  | 'usage'
  | 'ingredients'
  | 'exchange'
  | 'restock';

function MenuButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-800 transition-colors hover:border-primary-400 hover:bg-primary-500/5"
    >
      <span className="text-primary-500">{icon}</span>
      {label}
    </button>
  );
}

export function ScenarioMenu({
  onAction,
}: {
  onAction: (a: ScenarioAction) => void;
}) {
  const { t } = useTranslation();
  const [sub, setSub] = useState(false);

  if (sub) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <MenuButton icon={<HelpCircle className="h-4 w-4" />} label={t('chat.productHelp.usage')} onClick={() => onAction('usage')} />
        <MenuButton icon={<Leaf className="h-4 w-4" />} label={t('chat.productHelp.ingredients')} onClick={() => onAction('ingredients')} />
        <MenuButton icon={<RotateCcw className="h-4 w-4" />} label={t('chat.productHelp.exchange')} onClick={() => onAction('exchange')} />
        <MenuButton icon={<Bell className="h-4 w-4" />} label={t('chat.productHelp.restock')} onClick={() => onAction('restock')} />
        <MenuButton icon={<ArrowLeft className="h-4 w-4" />} label={t('chat.productHelp.back')} onClick={() => setSub(false)} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <MenuButton icon={<Truck className="h-4 w-4" />} label={t('chat.scenarios.delivery')} onClick={() => onAction('delivery')} />
      <MenuButton icon={<RotateCcw className="h-4 w-4" />} label={t('chat.scenarios.cancelRefund')} onClick={() => onAction('cancelRefund')} />
      <MenuButton icon={<Sparkles className="h-4 w-4" />} label={t('chat.scenarios.productHelp')} onClick={() => setSub(true)} />
      <MenuButton icon={<Phone className="h-4 w-4" />} label={t('chat.scenarios.contact')} onClick={() => onAction('contact')} />
      <MenuButton icon={<Users className="h-4 w-4" />} label={t('chat.scenarios.affiliate')} onClick={() => onAction('affiliate')} />
      <MenuButton icon={<Package className="h-4 w-4" />} label={t('chat.scenarios.myOrders')} onClick={() => onAction('myOrders')} />
    </div>
  );
}
