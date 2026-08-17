import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
// Imported from source, not through '@ivy/types': the package publishes CJS, and
// Rollup cannot trace a named export through its `export *` chain, so a value
// import of the entry point fails the widget build ("not exported by dist/index.js").
// Types come through the package as usual; only this runtime table takes the
// source path, which keeps the language list genuinely shared rather than copied.
import { LANGUAGES, LANGUAGE_CODES } from '../../../../packages/types/src/common/language';
import { en } from './locales/en';
import { es } from './locales/es';
import { ko } from './locales/ko';
import { vi } from './locales/vi';
import { ja } from './locales/ja';
import { zh } from './locales/zh';

export const LANG_STORAGE_KEY = 'ivy_lang';

/**
 * Which languages the widget offers — derived from the shared registry so the
 * widget, the console and the backend cannot drift apart (REQ-260817 §1a).
 */
export const SUPPORTED_LANGUAGES = LANGUAGE_CODES;
export type SupportedLanguage = string;

/** Endonym + short label per code, for the header picker. */
export const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
  code: l.code,
  nativeLabel: l.nativeLabel,
  shortLabel: l.shortLabel,
}));

/**
 * What the browser says this shopper reads, when we support it (PLN-260813 D4).
 *
 * Starting everyone at English meant a Korean shopper got an English greeting
 * and English system notices until they found the language switcher — and the
 * session language the server derived from that hint stayed English too
 * (REQ-260813 G1). `navigator.language` is a preference the shopper already
 * expressed; there is no reason to ignore it.
 */
export function browserLanguage(): SupportedLanguage | null {
  const tag = (typeof navigator !== 'undefined' ? navigator.language : '') || '';
  const base = tag.toLowerCase().split('-')[0];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base)
    ? (base as SupportedLanguage)
    : null;
}

/** Language to open in: manual pick, else browser, else English. */
export function initialLanguage(): SupportedLanguage {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
      return stored;
    }
  } catch {
    /* ignore storage failures */
  }
  // A manual pick outranks the browser; unsupported browser languages fall to
  // English, which is also what the server settles on absent a clearer signal.
  return browserLanguage() ?? 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    ko: { translation: ko },
    vi: { translation: vi },
    ja: { translation: ja },
    zh: { translation: zh },
  },
  lng: initialLanguage(),
  fallbackLng: 'en',
  defaultNS: 'translation',
  interpolation: {
    escapeValue: false,
  },
});

// Han characters are shared between Japanese and Chinese but drawn differently;
// without a lang attribute the browser picks glyph shapes by font order alone,
// so a Japanese shopper can end up reading Chinese-shaped kanji.
if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language;
}

export default i18n;
