import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/Card';
import { HelpModal, HelpSection } from '@/components/HelpModal';

const COLLAPSE_KEY = 'ivy:knowledge:guide-collapsed';

/**
 * How a document gets here, on the page where the four ways to make one sit
 * side by side (REQ-260826 R1).
 *
 * The thing operators got wrong was the first box: a source is a pipe, and a
 * pipe that has never been synced contributes nothing. Seven of eight sources
 * on staging had never run.
 *
 * Collapsible and remembered, because it is scaffolding — useful the first
 * week, clutter the tenth.
 */
export function ProcessGuide() {
  const { t } = useTranslation('knowledge');
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === '1',
  );

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        className="mb-4 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        <ChevronDown className="h-3 w-3" /> {t('guide.title')}
      </button>
    );
  }

  const step = (n: string, title: string, body: string) => (
    <li className="flex-1 rounded-lg border border-gray-100 p-3">
      <p className="text-xs font-semibold text-gray-400">{n}</p>
      <p className="text-sm font-medium text-gray-800">{title}</p>
      <p className="mt-1 text-xs text-gray-500">{body}</p>
    </li>
  );

  return (
    <Card
      title={t('guide.title')}
      action={
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ChevronUp className="h-3 w-3" /> {t('guide.collapse')}
        </button>
      }
    >
      <ol className="flex flex-col gap-2 sm:flex-row">
        {step('①', t('guide.step1Title'), t('guide.step1Body'))}
        {step('②', t('guide.step2Title'), t('guide.step2Body'))}
        {step('③', t('guide.step3Title'), t('guide.step3Body'))}
        {step('④', t('guide.step4Title'), t('guide.step4Body'))}
      </ol>
      <ul className="mt-3 space-y-1 text-xs text-gray-500">
        <li>· {t('guide.noteSource')}</li>
        <li>· {t('guide.noteCategory')}</li>
      </ul>
    </Card>
  );
}

/** What "Sync from catalog" turns into documents, and what it will not. */
export function CatalogSyncHelp() {
  const { t } = useTranslation('knowledge');
  return (
    <HelpModal title={t('help.catalogTitle')} label={t('syncCatalog')}>
      <HelpSection heading={t('help.whatItDoes')}>
        <p>{t('help.catalogWhat')}</p>
      </HelpSection>
      <HelpSection heading={t('help.goodToKnow')}>
        <ul className="list-disc space-y-1 pl-4">
          <li>{t('help.catalogPreview')}</li>
          <li>{t('help.catalogCategory')}</li>
          <li>{t('help.catalogVariants')}</li>
          <li>{t('help.catalogRerun')}</li>
        </ul>
      </HelpSection>
    </HelpModal>
  );
}

/** The CSV contract, with a file that satisfies it. */
export function ProductCsvHelp() {
  const { t } = useTranslation('knowledge');
  return (
    <HelpModal title={t('help.csvTitle')} label={t('importProducts')}>
      <HelpSection heading={t('help.whatItDoes')}>
        <p>{t('help.csvWhat')}</p>
      </HelpSection>
      <HelpSection heading={t('help.csvRequired')}>
        <code className="text-xs">Product Name · Handle · Detail</code>
      </HelpSection>
      <HelpSection heading={t('help.csvOptional')}>
        <code className="text-xs">Brand · Category · Product URL · Price(USD) · Image URL</code>
      </HelpSection>
      <HelpSection heading={t('help.goodToKnow')}>
        <ul className="list-disc space-y-1 pl-4">
          <li>{t('help.csvUpsert')}</li>
          <li>{t('help.csvPrice')}</li>
          <li>{t('help.csvCategory')}</li>
        </ul>
      </HelpSection>
      {/* A described format is still guesswork until you see one. */}
      <a
        className="inline-block text-sm font-medium text-primary hover:underline"
        href="/samples/kb-product-import-sample.csv"
        download
      >
        {t('help.csvSample')}
      </a>
    </HelpModal>
  );
}

/** What makes a hand-written document get cited. */
export function AddDocumentHelp() {
  const { t } = useTranslation('knowledge');
  return (
    <HelpModal title={t('help.addDocTitle')} label={t('addDocument')}>
      <HelpSection heading={t('help.whatItDoes')}>
        <p>{t('help.addDocWhat')}</p>
      </HelpSection>
      <HelpSection heading={t('help.addDocWriting')}>
        <ul className="list-disc space-y-1 pl-4">
          <li>{t('help.addDocOneTopic')}</li>
          <li>{t('help.addDocWords')}</li>
          <li>{t('help.addDocCategory')}</li>
        </ul>
      </HelpSection>
      <HelpSection heading={t('help.goodToKnow')}>
        <p>{t('help.addDocPending')}</p>
      </HelpSection>
    </HelpModal>
  );
}
