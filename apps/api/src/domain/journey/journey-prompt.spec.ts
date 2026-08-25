import { buildComparisonPrompt, buildJourneyPrompt, SECTION_ORDER } from './journey-prompt';

const criteria = (over: Record<string, unknown> = {}) =>
  ({
    version: 3,
    sectionsJson: Object.fromEntries(SECTION_ORDER.map((k) => [k, `do ${k}`])),
    topQuestionsN: 5,
    sampleCap: 200,
    quoteMaxChars: 200,
    tone: null,
    bannedJson: ['관계 점수'],
    ...over,
  }) as never;

const metrics = { conversations: 24, resolved: 9, medianResolutionMinutes: 134 } as never;

describe('buildJourneyPrompt', () => {
  it('forbids the model from producing its own figures', () => {
    // Every number is already computed. Left free to derive them, a model
    // supplies plausible wrong ones — and a report makes them read as evidence.
    const { system } = buildJourneyPrompt({
      criteria: criteria(),
      metrics,
      samples: [],
      language: 'KO',
      period: { from: null, to: null },
    });

    expect(system).toContain('copied from the METRICS block');
    expect(system).toContain('Do not compute');
  });

  it('tells the model that Aware and Appeal cannot be observed', () => {
    const { system } = buildJourneyPrompt({
      criteria: criteria(),
      metrics,
      samples: [],
      language: 'EN',
      period: { from: null, to: null },
    });

    expect(system).toContain('Aware and Appeal are not observable');
  });

  it('requires Maslow to be hypothesis with a disproof condition', () => {
    const { system } = buildJourneyPrompt({
      criteria: criteria(),
      metrics,
      samples: [],
      language: 'EN',
      period: { from: null, to: null },
    });

    expect(system).toContain('never assert a level');
    expect(system).toContain('what would disprove it');
  });

  it('passes the banned phrases through', () => {
    const { system } = buildJourneyPrompt({
      criteria: criteria(),
      metrics,
      samples: [],
      language: 'KO',
      period: { from: null, to: null },
    });

    expect(system).toContain('관계 점수');
  });

  it('carries the computed metrics as the only figure source', () => {
    const { user } = buildJourneyPrompt({
      criteria: criteria(),
      metrics,
      samples: [{ at: '2026-08-01', who: 'user', text: '배송이 늦어요' }],
      language: 'KO',
      period: { from: '2026-08-01', to: '2026-08-25' },
    });

    expect(user).toContain('"medianResolutionMinutes": 134');
    expect(user).toContain('배송이 늦어요');
    expect(user).toContain('PERIOD: 2026-08-01 ~ 2026-08-25');
  });

  it('drops a section the criteria left empty', () => {
    // Removing a section from the criteria should remove it from the report,
    // not leave a heading the model invents content for.
    const sections = Object.fromEntries(SECTION_ORDER.map((k) => [k, `do ${k}`]));
    delete (sections as Record<string, string>).needs;

    const { user } = buildJourneyPrompt({
      criteria: criteria({ sectionsJson: sections }),
      metrics,
      samples: [],
      language: 'EN',
      period: { from: null, to: null },
    });

    expect(user).not.toContain('[needs]');
    expect(user).toContain('[summary]');
  });
});

describe('buildComparisonPrompt', () => {
  const side = (version: number) => ({
    createdAt: '2026-08-01',
    criteriaVersion: version,
    metrics,
    body: 'body',
  });

  it('opens with the criteria change when the two versions differ', () => {
    // Otherwise a change in our own rules is read as a change in the customer.
    const { system } = buildComparisonPrompt({
      criteria: criteria(),
      older: side(1),
      newer: side(3),
      language: 'KO',
    });

    expect(system).toContain('different criteria versions');
    expect(system).toContain('comes from the rules, not the customer');
  });

  it('says nothing about versions when they match', () => {
    const { system } = buildComparisonPrompt({
      criteria: criteria(),
      older: side(3),
      newer: side(3),
      language: 'KO',
    });

    expect(system).not.toContain('different criteria versions');
  });
});
