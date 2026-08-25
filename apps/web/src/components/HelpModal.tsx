import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

/**
 * A `?` next to an action, opening an explanation of it.
 *
 * The knowledge screen has four buttons that each write documents a different
 * way, and which one to use was only discoverable by trying them. The help sits
 * next to the action rather than in a manual because that is where the question
 * is asked.
 */
export function HelpModal({
  title,
  children,
  label,
}: {
  title: string;
  children: ReactNode;
  /** Accessible name; falls back to a generic "help" so it is never unlabelled. */
  label?: string;
}) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label ?? t('help')}
        title={label ?? t('help')}
        className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        onClick={() => setOpen(true)}
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        footer={<Button onClick={() => setOpen(false)}>{t('close')}</Button>}
      >
        <div className="space-y-3 text-sm text-gray-700">{children}</div>
      </Modal>
    </>
  );
}

/** One labelled block inside a help modal — heading plus its lines. */
export function HelpSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {heading}
      </h4>
      <div className="space-y-1 text-sm text-gray-700">{children}</div>
    </section>
  );
}
