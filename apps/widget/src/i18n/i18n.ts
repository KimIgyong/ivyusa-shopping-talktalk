import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { es } from './locales/es';
import { ko } from './locales/ko';

export const LANG_STORAGE_KEY = 'ivy_lang';

export const SUPPORTED_LANGUAGES = ['en', 'es', 'ko'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

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
    if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
      return stored as SupportedLanguage;
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
  },
  lng: initialLanguage(),
  fallbackLng: 'en',
  defaultNS: 'translation',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
