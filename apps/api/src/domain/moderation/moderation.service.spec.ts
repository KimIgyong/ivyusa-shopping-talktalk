import { ModerationService, ModerateInput } from './moderation.service';
import { MODERATION_DECISION } from '@ivy/types';

/**
 * DB-free unit tests for the outbound moderation gate (FR-069 / NFR-013).
 * Repositories and the AI gateway are mocked; no Nest DI container is needed.
 */

type RuleRepoMock = { find: jest.Mock };
type LogRepoMock = { create: jest.Mock; save: jest.Mock };
type AiMock = { complete: jest.Mock };

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tenantId: 1,
    scope: 'both',
    type: 'word',
    patternOrPrompt: 'badword',
    lang: null,
    severity: 'high',
    action: 'block',
    isActive: 1,
    createdAt: new Date(),
    ...overrides,
  };
}

function build(ruleRepo: RuleRepoMock) {
  const logRepo: LogRepoMock = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => x),
  };
  const ai: AiMock = { complete: jest.fn() };
  // Redis stand-in: cache misses everywhere, writes are no-ops.
  const redis = {
    available: () => false,
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
    del: jest.fn(async () => undefined),
  };
  // Cast through unknown — the service only touches the mocked methods.
  const service = new ModerationService(ruleRepo as any, logRepo as any, ai as any, redis as any);
  return { service, logRepo, ai };
}

const baseInput: ModerateInput = {
  tenantId: 1,
  scope: 'ai',
  authorType: 'ai',
  authorId: 42,
  conversationId: 7,
  text: 'this contains a badword in it',
};

describe('ModerationService.moderate', () => {
  it('(a) a matching block rule → decision blocked, text emptied', async () => {
    const ruleRepo: RuleRepoMock = {
      find: jest.fn(async () => [makeRule({ action: 'block', patternOrPrompt: 'badword' })]),
    };
    const { service, logRepo } = build(ruleRepo);

    const result = await service.moderate(baseInput);

    expect(result.decision).toBe(MODERATION_DECISION.BLOCKED);
    expect(result.action).toBe('block');
    expect(result.text).toBe('');
    expect(result.ruleId).toBe(1);
    // It logged the moderation decision.
    expect(logRepo.create).toHaveBeenCalledTimes(1);
    expect(logRepo.save).toHaveBeenCalledTimes(1);
  });

  it('block matching is case-insensitive', async () => {
    const ruleRepo: RuleRepoMock = {
      find: jest.fn(async () => [makeRule({ patternOrPrompt: 'BADWORD' })]),
    };
    const { service } = build(ruleRepo);

    const result = await service.moderate({ ...baseInput, text: 'A BadWord here' });
    expect(result.decision).toBe(MODERATION_DECISION.BLOCKED);
  });

  it('(b) no rules → decision delivered, text unchanged', async () => {
    const ruleRepo: RuleRepoMock = { find: jest.fn(async () => []) };
    const { service } = build(ruleRepo);

    const result = await service.moderate(baseInput);

    expect(result.decision).toBe(MODERATION_DECISION.DELIVERED);
    expect(result.action).toBe('pass');
    expect(result.text).toBe(baseInput.text);
  });

  it('non-matching rule → delivered, text unchanged', async () => {
    const ruleRepo: RuleRepoMock = {
      find: jest.fn(async () => [makeRule({ patternOrPrompt: 'somethingelse' })]),
    };
    const { service } = build(ruleRepo);

    const result = await service.moderate(baseInput);
    expect(result.decision).toBe(MODERATION_DECISION.DELIVERED);
    expect(result.text).toBe(baseInput.text);
  });

  it('(c) rule repo throws → fail-safe blocked (NFR-013)', async () => {
    const ruleRepo: RuleRepoMock = {
      find: jest.fn(async () => {
        throw new Error('db down');
      }),
    };
    const { service } = build(ruleRepo);

    const result = await service.moderate(baseInput);

    expect(result.decision).toBe(MODERATION_DECISION.BLOCKED);
    expect(result.action).toBe('block');
    expect(result.text).toBe('');
  });

  it('a mask rule edits the text but still delivers it (EDITED)', async () => {
    const ruleRepo: RuleRepoMock = {
      find: jest.fn(async () => [makeRule({ action: 'mask', patternOrPrompt: 'badword' })]),
    };
    const { service } = build(ruleRepo);

    const result = await service.moderate(baseInput);

    expect(result.decision).toBe(MODERATION_DECISION.EDITED);
    expect(result.text).not.toContain('badword');
    expect(result.text).toContain('▇▇▇');
  });
});

describe('ModerationService — warn action (regression: warn behaved as block)', () => {
  it('a warn rule delivers the text instead of emptying it', async () => {
    // A rule the operator configured as a warning used to return BLOCKED with
    // an emptied body. On the customer path that silently suppressed any answer
    // matching the pattern and escalated to a human; on the knowledge conflict
    // path it discarded 11 of 121 judgements.
    const ruleRepo = { find: jest.fn(async () => [makeRule({ action: 'warn' })]) };
    const { service, logRepo } = build(ruleRepo);
    const result = await service.moderate(baseInput);

    expect(result.decision).toBe(MODERATION_DECISION.DELIVERED);
    expect(result.text).toBe(baseInput.text);
    // Still recorded, with the rule that fired — a warning must stay visible.
    expect(logRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'warn', ruleId: 1, decision: MODERATION_DECISION.DELIVERED }),
    );
  });

  it('a later block rule is still evaluated after a warn fires', async () => {
    // The old code returned on the first match, so a warning sitting earlier in
    // the list hid every block rule behind it.
    const ruleRepo = {
      find: jest.fn(async () => [
        makeRule({ id: 1, action: 'warn', patternOrPrompt: 'contains' }),
        makeRule({ id: 2, action: 'block', patternOrPrompt: 'badword' }),
      ]),
    };
    const { service } = build(ruleRepo);
    const result = await service.moderate(baseInput);
    expect(result.decision).toBe(MODERATION_DECISION.BLOCKED);
    expect(result.text).toBe('');
  });

  it('a warn combined with a mask still edits and delivers', async () => {
    const ruleRepo = {
      find: jest.fn(async () => [
        makeRule({ id: 1, action: 'warn', patternOrPrompt: 'contains' }),
        makeRule({ id: 2, action: 'mask', patternOrPrompt: 'badword' }),
      ]),
    };
    const { service } = build(ruleRepo);
    const result = await service.moderate(baseInput);
    expect(result.decision).toBe(MODERATION_DECISION.EDITED);
    expect(result.text).toContain('▇▇▇');
    expect(result.text).not.toContain('badword');
  });

  it('a block rule is unaffected by this change', async () => {
    const ruleRepo = { find: jest.fn(async () => [makeRule({ action: 'block' })]) };
    const { service } = build(ruleRepo);
    const result = await service.moderate(baseInput);
    expect(result.decision).toBe(MODERATION_DECISION.BLOCKED);
    expect(result.text).toBe('');
  });
});
