/**
 * Target-language names for translation prompts (briefing + message
 * translation). Prompt-side detail only — the language SET itself still lives
 * in @ivy/types (codes are validated against it); an unknown-but-supported
 * code would fall back to itself.
 *
 * Own module on purpose: agent.service needs this and briefing.service needs
 * agent.service — exporting it from either would close an import cycle and
 * leave one of them undefined at Nest injection time (boot crash tsc passes).
 */
export const PROMPT_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  ko: 'Korean',
  vi: 'Vietnamese',
  ja: 'Japanese',
  zh: 'Simplified Chinese',
};
