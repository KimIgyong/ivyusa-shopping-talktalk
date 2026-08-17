import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Resource, ResourceKey, ResourceLanguage } from 'i18next';
// Imported from source rather than through '@ivy/types': the package publishes
// CJS and the bundler cannot trace a named export through its `export *` chain.
// Types come through the package as usual — only this runtime table is deep-imported.
import { LANGUAGES, LANGUAGE_CODES } from '../../../../packages/types/src/common/language';

/**
 * Locale resources are collected by glob rather than listed import by import.
 * With three languages that was 72 import lines plus a matching resources
 * block; six languages would have made it 144, and every new namespace meant
 * editing the file in six places — the kind of chore where one language quietly
 * gets skipped and silently falls back to English (REQ-260817 G8).
 *
 * The path stays a literal so Vite can statically resolve it at build time.
 */
const modules = import.meta.glob<ResourceKey>('./locales/*/*.json', {
  eager: true,
  import: 'default',
});

const resources: Resource = {};
for (const [path, translation] of Object.entries(modules)) {
  const [, lang, file] = path.match(/^\.\/locales\/([^/]+)\/(.+)\.json$/) ?? [];
  if (!lang || !file) continue;
  (resources[lang] ??= {} as ResourceLanguage)[file] = translation;
}

export const SUPPORTED_LANGUAGES = LANGUAGE_CODES;
export type SupportedLanguage = string;

/** Code, endonym and review state for the language picker. */
export const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
  code: l.code,
  nativeLabel: l.nativeLabel,
  shortLabel: l.shortLabel,
  reviewed: l.reviewed,
}));

export const LANGUAGE_STORAGE_KEY = 'ivy_lang';

/** Namespaces available to `useTranslation`, derived from the English resources. */
export const ns = Object.keys(resources.en ?? {}).sort();

function getInitialLanguage(): SupportedLanguage {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
      return stored;
    }
  }
  return 'en';
}

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  ns,
  interpolation: {
    escapeValue: false,
  },
});

// Han characters are shared between Japanese and Chinese but drawn differently;
// the lang attribute is what lets the browser pick the right glyph shapes.
if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language;
}

export default i18n;
