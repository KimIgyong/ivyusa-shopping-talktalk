/**
 * Starter moderation rules seeded for a new tenant (PLN-260807 issue 2). Kept
 * conservative — outbound PII masking + one abuse/hate warning — so a fresh
 * tenant is protected without over-blocking. Operators extend these in /ai-setting.
 * The backfill SQL (sql/260808-seed-default-moderation.sql) mirrors this list.
 */
export interface DefaultModerationRule {
  scope: string; // agent/ai/both
  type: string; // word/phrase/regex/context
  patternOrPrompt: string;
  lang: string | null; // en/es/ko or null = all
  severity: string; // low/medium/high
  action: string; // block/mask/warn/rephrase
}

export const DEFAULT_MODERATION_RULES: DefaultModerationRule[] = [
  { scope: 'both', type: 'regex', patternOrPrompt: '[\\w.+-]+@[\\w-]+\\.[\\w.-]+', lang: null, severity: 'medium', action: 'mask' },
  { scope: 'both', type: 'regex', patternOrPrompt: '01[016789][- ]?\\d{3,4}[- ]?\\d{4}', lang: null, severity: 'medium', action: 'mask' },
  { scope: 'both', type: 'regex', patternOrPrompt: '\\b\\d{13,16}\\b', lang: null, severity: 'medium', action: 'mask' },
  {
    scope: 'ai',
    type: 'context',
    patternOrPrompt:
      'The message contains profanity, hate speech, harassment, sexual, or discriminatory content.',
    lang: null,
    severity: 'medium',
    action: 'warn',
  },
];
