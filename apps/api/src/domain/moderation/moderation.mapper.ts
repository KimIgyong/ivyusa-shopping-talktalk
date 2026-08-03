import { ContentFilterRule } from './entity/content-filter-rule.entity';

/** Entity -> camelCase response mapping for moderation rules. `pattern` is the
 *  client-facing name for pattern_or_prompt (it is a prompt for context rules). */
export class ModerationMapper {
  static toRule(r: ContentFilterRule) {
    return {
      id: r.id,
      scope: r.scope,
      type: r.type,
      pattern: r.patternOrPrompt,
      lang: r.lang ?? null,
      severity: r.severity,
      action: r.action,
      isActive: r.isActive,
      createdAt: r.createdAt,
    };
  }

  static toRuleList(rules: ContentFilterRule[]) {
    return rules.map((r) => this.toRule(r));
  }
}
