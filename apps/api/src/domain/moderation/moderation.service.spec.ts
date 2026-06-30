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
  // Cast through unknown — the service only touches the mocked methods.
  const service = new ModerationService(ruleRepo as any, logRepo as any, ai as any);
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
